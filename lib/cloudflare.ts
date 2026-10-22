import { env } from "cloudflare:workers";
import type { DailyMetric, PathMetric, RedirectInput, RedirectItem, SystemHealth } from "./types";
import { sourceHosts } from "./runtime-config";
import { retryVerification } from "./verification-policy.mjs";
import { canonical, normalizeInput, sameInventory, sourceUrl, updatedItem } from "./redirect-model";
import { ApiError, WriteRejectedError, WriteUncertainError } from "./errors";
import type { WriteContext } from "./write-guard";

const API_BASE = "https://api.cloudflare.com/client/v4";
type Inventory = { items: RedirectItem[]; listName: string; listCount: number };
type ExpectedWrite = { items: RedirectItem[]; source: string };
type AnalyticsRow = { count: number; dimensions: { date: string; clientRequestHTTPHost: string; clientRequestPath: string } };
type CloudflarePayload = {
  success?: boolean; result?: unknown; errors?: Array<{ message?: string }>;
  result_info?: { cursors?: { after?: string } };
  data?: { viewer?: { zones?: Array<{ daily?: AnalyticsRow[] }> } };
};

export function cloudflareConfigured(): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_LIST_ID && env.CLOUDFLARE_RULESET_ID);
}

async function cfResponse(path: string, init: RequestInit = {}) {
  if (!cloudflareConfigured()) throw new ApiError(503, "Cloudflare runtime integration is not configured.");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  const payload = await response.json() as CloudflarePayload;
  if (!response.ok || payload.success === false || payload.errors?.length) {
    const message = payload.errors?.map((error: { message?: string }) => error.message).filter(Boolean).join("; ") || `Cloudflare request failed with ${response.status}.`;
    if ((init.method === "POST" || init.method === "PUT") && path !== "/graphql" && response.status >= 400 && response.status < 500 && response.status !== 408) throw new WriteRejectedError(message);
    throw new Error(message);
  }
  return payload;
}

async function cfRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await cfResponse(path, init)).result as T;
}

function toRedirectItem(item: Record<string, unknown>): RedirectItem {
  const redirect = item.redirect as Record<string, unknown>;
  return {
    id: String(item.id ?? ""), source_url: String(redirect.source_url ?? ""), target_url: String(redirect.target_url ?? ""),
    status_code: Number(redirect.status_code ?? 301), include_subdomains: Boolean(redirect.include_subdomains),
    subpath_matching: Boolean(redirect.subpath_matching), preserve_path_suffix: Boolean(redirect.preserve_path_suffix),
    preserve_query_string: Boolean(redirect.preserve_query_string), comment: String(item.comment ?? ""),
    created_on: item.created_on ? String(item.created_on) : undefined,
    modified_on: item.modified_on ? String(item.modified_on) : undefined,
  };
}

export async function getInventory(): Promise<Inventory> {
  const listPath = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rules/lists/${env.CLOUDFLARE_LIST_ID}`;
  const list = await cfRequest<{ name: string; num_items: number }>(listPath);
  const items: RedirectItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ per_page: "500" });
    if (cursor) params.set("cursor", cursor);
    const payload = await cfResponse(`${listPath}/items?${params}`);
    if (!Array.isArray(payload.result)) throw new Error("Cloudflare did not return an inventory page.");
    items.push(...(payload.result as Record<string, unknown>[]).map(toRedirectItem));
    cursor = payload.result_info?.cursors?.after;
    if (cursor && seenCursors.has(cursor)) throw new Error("Cloudflare returned a repeated inventory cursor.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  if (items.length !== list.num_items || new Set(items.map((item) => item.source_url.toLowerCase())).size !== items.length) {
    throw new Error("Inventory integrity check failed. No write is safe until the full list can be read consistently.");
  }
  return { items, listName: list.name, listCount: list.num_items };
}

export async function getAnalytics(days = 30): Promise<{ byPath: PathMetric[]; daily: DailyMetric[]; start: string; end: string }> {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  start.setUTCHours(0, 0, 0, 0);
  const query = `query($zoneTag: string!, $start: Time!, $end: Time!) {
    viewer { zones(filter: { zoneTag: $zoneTag }) {
      daily: httpRequestsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $start, datetime_leq: $end, clientRequestHTTPHost_in: ${JSON.stringify(sourceHosts())}, edgeResponseStatus_in: [301, 302, 307, 308], requestSource: "eyeball" }, orderBy: [date_ASC]) {
        count dimensions { date clientRequestHTTPHost clientRequestPath }
      }
    } }
  }`;
  // GraphQL returns { data, errors }, not the REST API's { result, success }.
  const payload = await cfResponse("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { zoneTag: env.CLOUDFLARE_ZONE_ID, start: start.toISOString(), end: end.toISOString() } }) });
  const rows = payload.data?.viewer?.zones?.[0]?.daily;
  if (!Array.isArray(rows)) throw new Error("Cloudflare analytics response did not include this zone.");
  if (rows.length >= 10000) throw new Error("Analytics row limit reached; split the collection window before trusting these totals.");
  const daily: DailyMetric[] = rows.map((row) => ({ date: row.dimensions.date, host: row.dimensions.clientRequestHTTPHost, path: row.dimensions.clientRequestPath, sourceUrl: `${row.dimensions.clientRequestHTTPHost}${row.dimensions.clientRequestPath}`, requests: row.count }));
  const totals = new Map<string, PathMetric>();
  for (const row of daily) {
    const previous = totals.get(row.sourceUrl);
    totals.set(row.sourceUrl, { ...row, requests: (previous?.requests ?? 0) + row.requests });
  }
  return { byPath: [...totals.values()], daily, start: start.toISOString(), end: end.toISOString() };
}

async function probe(item: RedirectItem) {
  const url = sourceUrl(item.source_url);
  if (!sourceHosts().includes(url.hostname) || url.username || url.password || url.port) throw new Error("Probe host is not configured.");
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1_500), cache: "no-store" });
  const observed = { status: response.status, location: response.headers.get("location") };
  await response.body?.cancel().catch(() => {});
  if (observed.status !== item.status_code || observed.location !== item.target_url) throw new Error(`Public verification observed ${observed.status}; expected ${item.status_code} and the saved destination.`);
  return observed;
}

export async function getSystemHealth(inventory: Inventory): Promise<SystemHealth> {
  const ruleset = await cfRequest<{ rules?: Array<{ enabled?: boolean; description?: string; action_parameters?: { from_list?: { name?: string } } }> }>(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rulesets/${env.CLOUDFLARE_RULESET_ID}`);
  const rule = ruleset.rules?.find((candidate) => candidate.action_parameters?.from_list?.name === inventory.listName);
  const representatives = sourceHosts().map((host) => inventory.items.find((item) => sourceUrl(item.source_url).hostname === host));
  const results = await Promise.allSettled(representatives.map((item) => item ? probe(item) : Promise.reject(new Error("No representative redirect"))));
  return {
    configured: true, enabledRule: Boolean(rule && rule.enabled !== false), ruleName: rule?.description ?? null,
    listName: inventory.listName, listCount: inventory.listCount, dnsHealthy: results.every((result) => result.status === "fulfilled"),
    analyticsWindowStart: null, analyticsWindowEnd: null, syncedAt: new Date().toISOString(), stale: false, warning: null,
  };
}

export function normalizeRedirectInput(input: RedirectInput) { return normalizeInput(input, sourceHosts()); }

function apiItem(item: RedirectItem) {
  const { comment, ...redirect } = canonical(item);
  return { redirect, comment };
}

async function pollOperation(operationId: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  for (let attempt = 0; attempt < 20 && Date.now() < deadline; attempt += 1) {
    const operation = await cfRequest<{ status: string; error?: string }>(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rules/lists/bulk_operations/${operationId}`);
    if (operation.status === "completed") return;
    if (operation.status === "failed") throw new WriteRejectedError(operation.error || "Cloudflare rejected the bulk operation.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new WriteUncertainError();
}

async function submit(method: string, items: RedirectItem[]) {
  const result = await cfRequest<{ operation_id: string }>(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rules/lists/${env.CLOUDFLARE_LIST_ID}/items`, { method, body: JSON.stringify(items.map(apiItem)) });
  await pollOperation(result.operation_id);
  return result.operation_id;
}

async function confirm(expected: ExpectedWrite, operationId: string) {
  const after = await getInventory();
  if (!sameInventory(after.items, expected.items)) throw new WriteUncertainError("Cloudflare readback does not yet match the complete intended list.");
  const item = after.items.find((candidate) => candidate.source_url === expected.source)!;
  const verification = await verifyPublicWithRetry(item, after.items);
  return { item, operationId, verification };
}

export async function recoverWrite(value: unknown) {
  const expected = value as ExpectedWrite;
  const after = await getInventory();
  if (!sameInventory(after.items, expected.items)) return null;
  const item = after.items.find((candidate) => candidate.source_url === expected.source)!;
  return { item, operationId: "reconciled-from-readback", verification: await verifyPublicWithRetry(item, after.items) };
}

export async function createRedirect(input: RedirectInput, context: WriteContext) {
  const normalized = normalizeRedirectInput(input);
  const before = await getInventory();
  if (before.items.some((item) => item.source_url.toLowerCase() === normalized.source_url.toLowerCase())) throw new ApiError(409, "That source already exists. Open it to inspect or edit the destination.");
  const expected = { items: [...before.items, normalized], source: normalized.source_url };
  await context.prepare(expected);
  return confirm(expected, await submit("POST", [normalized]));
}

export async function updateRedirect(source: string, input: RedirectInput, context: WriteContext, onBeforeReplace: (items: RedirectItem[]) => Promise<unknown>) {
  const before = await getInventory();
  const original = before.items.find((item) => item.source_url === source);
  if (!original) throw new ApiError(409, "The redirect no longer exists. Refresh the inventory.");
  const replacement = updatedItem(original, input, sourceHosts());
  const expected = { items: before.items.map((item) => item === original ? replacement : item), source };
  await onBeforeReplace(before.items);
  // Catch edits made outside this app while preparing the snapshot.
  if (!sameInventory((await getInventory()).items, before.items)) throw new ApiError(409, "The Cloudflare list changed while preparing this update. Refresh before trying again.");
  await context.prepare(expected);
  return { ...await confirm(expected, await submit("PUT", expected.items)), beforeItems: before.items };
}

export async function verifyPublic(item: RedirectItem, inventory: RedirectItem[]) {
  const result = await probe(item);
  const other = inventory.find((candidate) => sourceUrl(candidate.source_url).hostname !== sourceUrl(item.source_url).hostname && sourceHosts().includes(sourceUrl(candidate.source_url).hostname));
  const regression = other ? await probe(other) : null;
  return { checkedAt: new Date().toISOString(), ...result, regression };
}

async function verifyPublicWithRetry(item: RedirectItem, inventory: RedirectItem[]) {
  const outcome = await retryVerification(() => verifyPublic(item, inventory));
  return outcome.state === "verified"
    ? { state: "verified" as const, attempts: outcome.attempts, ...outcome.value }
    : { state: "pending" as const, attempts: outcome.attempts, checkedAt: new Date().toISOString(), lastError: outcome.lastError };
}

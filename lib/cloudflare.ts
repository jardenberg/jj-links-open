import { env } from "cloudflare:workers";
import type { DailyMetric, PathMetric, RedirectInput, RedirectItem, SystemHealth } from "./types";
import { isAllowedHost, sourceHosts } from "./runtime-config";
import { retryVerification } from "./verification-policy.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";

type CloudflareConfig = {
  token: string;
  accountId: string;
  zoneId: string;
  listId: string;
  rulesetId: string;
};

export function cloudflareConfigured(): boolean {
  return Boolean(
    env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ZONE_ID &&
      env.CLOUDFLARE_LIST_ID && env.CLOUDFLARE_RULESET_ID,
  );
}

function config(): CloudflareConfig {
  if (!cloudflareConfigured()) throw new Error("Cloudflare runtime integration is not configured.");
  return {
    token: env.CLOUDFLARE_API_TOKEN!,
    accountId: env.CLOUDFLARE_ACCOUNT_ID!,
    zoneId: env.CLOUDFLARE_ZONE_ID!,
    listId: env.CLOUDFLARE_LIST_ID!,
    rulesetId: env.CLOUDFLARE_RULESET_ID!,
  };
}

async function cfRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = config();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const payload = (await response.json()) as { success?: boolean; result?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(message || `Cloudflare request failed with ${response.status}.`);
  }
  return payload.result as T;
}

function toRedirectItem(item: Record<string, unknown>): RedirectItem {
  const redirect = item.redirect as Record<string, unknown>;
  return {
    id: String(item.id ?? ""),
    source_url: String(redirect.source_url ?? ""),
    target_url: String(redirect.target_url ?? ""),
    status_code: Number(redirect.status_code ?? 301),
    include_subdomains: Boolean(redirect.include_subdomains),
    subpath_matching: Boolean(redirect.subpath_matching),
    preserve_path_suffix: Boolean(redirect.preserve_path_suffix),
    preserve_query_string: Boolean(redirect.preserve_query_string),
    comment: String(item.comment ?? ""),
    created_on: item.created_on ? String(item.created_on) : undefined,
    modified_on: item.modified_on ? String(item.modified_on) : undefined,
  };
}

export async function getInventory(): Promise<{ items: RedirectItem[]; listName: string; listCount: number }> {
  const { accountId, listId, token } = config();
  const list = await cfRequest<{ name: string; num_items: number }>(`/accounts/${accountId}/rules/lists/${listId}`);
  const items: RedirectItem[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ per_page: "500" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${API_BASE}/accounts/${accountId}/rules/lists/${listId}/items?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      success: boolean;
      result: Array<Record<string, unknown>>;
      result_info?: { cursors?: { after?: string } };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok || !payload.success) throw new Error(payload.errors?.[0]?.message || "Could not read redirect items.");
    items.push(...payload.result.map(toRedirectItem));
    cursor = payload.result_info?.cursors?.after;
  } while (cursor);

  const unique = new Set(items.map((item) => item.source_url.toLowerCase()));
  if (items.length !== list.num_items || unique.size !== items.length) {
    throw new Error(`Inventory integrity check failed: metadata ${list.num_items}, retrieved ${items.length}, unique ${unique.size}.`);
  }
  return { items, listName: list.name, listCount: list.num_items };
}

export async function getAnalytics(days = 30): Promise<{ byPath: PathMetric[]; daily: DailyMetric[]; start: string; end: string }> {
  const { zoneId } = config();
  const hosts = JSON.stringify(sourceHosts());
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const query = `query($zoneTag: string!, $start: Time!, $end: Time!) {
    viewer { zones(filter: { zoneTag: $zoneTag }) {
      byPath: httpRequestsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $start, datetime_leq: $end, clientRequestHTTPHost_in: ${hosts}, edgeResponseStatus: 301, requestSource: "eyeball" }, orderBy: [count_DESC]) { count dimensions { clientRequestHTTPHost clientRequestPath } }
      daily: httpRequestsAdaptiveGroups(limit: 5000, filter: { datetime_geq: $start, datetime_leq: $end, clientRequestHTTPHost_in: ${hosts}, edgeResponseStatus: 301, requestSource: "eyeball" }, orderBy: [date_ASC]) { count dimensions { date clientRequestHTTPHost clientRequestPath } }
    } }
  }`;
  const data = await cfRequest<{
    viewer: { zones: Array<{
      byPath: Array<{ count: number; dimensions: { clientRequestHTTPHost: string; clientRequestPath: string } }>;
      daily: Array<{ count: number; dimensions: { date: string; clientRequestHTTPHost: string; clientRequestPath: string } }>;
    }> };
  }>("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { zoneTag: zoneId, start: start.toISOString(), end: end.toISOString() } }) });
  const zone = data.viewer.zones[0];
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    byPath: (zone?.byPath ?? []).map((row) => ({
      host: row.dimensions.clientRequestHTTPHost,
      path: row.dimensions.clientRequestPath,
      sourceUrl: `${row.dimensions.clientRequestHTTPHost}${row.dimensions.clientRequestPath}`,
      requests: row.count,
    })),
    daily: (zone?.daily ?? []).map((row) => ({
      date: row.dimensions.date,
      host: row.dimensions.clientRequestHTTPHost,
      path: row.dimensions.clientRequestPath,
      sourceUrl: `${row.dimensions.clientRequestHTTPHost}${row.dimensions.clientRequestPath}`,
      requests: row.count,
    })),
  };
}

export async function getSystemHealth(inventory: { items: RedirectItem[]; listName: string; listCount: number }): Promise<SystemHealth> {
  const { accountId, rulesetId } = config();
  const probes = sourceHosts().map((host) => inventory.items.find((item) => item.source_url.startsWith(`${host}/`))).filter(Boolean) as RedirectItem[];
  const [ruleset, probeResponses] = await Promise.all([
    cfRequest<{ rules?: Array<{ enabled?: boolean; description?: string; action_parameters?: { from_list?: { name?: string } } }> }>(`/accounts/${accountId}/rulesets/${rulesetId}`),
    Promise.all(probes.map((item) => fetch(`https://${item.source_url}`, { redirect: "manual", cache: "no-store" }))),
  ]);
  const rule = ruleset.rules?.find((candidate) => candidate.action_parameters?.from_list?.name === inventory.listName);
  return {
    configured: true,
    enabledRule: Boolean(rule?.enabled),
    ruleName: rule?.description ?? null,
    listName: inventory.listName,
    listCount: inventory.listCount,
    dnsHealthy: probes.length === sourceHosts().length && probeResponses.every((response) => [301, 302, 307, 308].includes(response.status) && Boolean(response.headers.get("location"))),
    analyticsWindowStart: null,
    analyticsWindowEnd: null,
    syncedAt: new Date().toISOString(),
    stale: false,
    warning: null,
  };
}

export function normalizeRedirectInput(input: RedirectInput): RedirectItem {
  if (!isAllowedHost(input.host)) throw new Error(`Source host must be one of: ${sourceHosts().join(", ")}.`);
  const slug = input.slug.trim().replace(/^\/+/, "");
  if (!slug || slug.includes("?") || slug.includes("#") || /\s/.test(slug)) throw new Error("Enter a non-empty slashtag without spaces, query or fragment.");
  const target = new URL(input.targetUrl);
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) throw new Error("Target must be an HTTP(S) URL without embedded credentials.");
  const sourceUrl = `${input.host}/${slug}`;
  if (`${target.host}${target.pathname}`.replace(/\/$/, "").toLowerCase() === sourceUrl.replace(/\/$/, "").toLowerCase()) throw new Error("A redirect cannot point to itself.");
  return {
    id: "",
    source_url: sourceUrl,
    target_url: target.toString(),
    status_code: input.statusCode ?? 301,
    include_subdomains: false,
    subpath_matching: false,
    preserve_path_suffix: false,
    preserve_query_string: input.preserveQueryString ?? !target.search,
    comment: input.comment?.trim() || `JJ Links: created ${new Date().toISOString().slice(0, 10)}`,
  };
}

function apiItem(item: RedirectItem) {
  return { redirect: {
    source_url: item.source_url,
    target_url: item.target_url,
    status_code: item.status_code,
    include_subdomains: item.include_subdomains,
    subpath_matching: item.subpath_matching,
    preserve_path_suffix: item.preserve_path_suffix,
    preserve_query_string: item.preserve_query_string,
  }, comment: item.comment };
}

async function pollOperation(operationId: string): Promise<void> {
  const { accountId } = config();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const operation = await cfRequest<{ status: string; error?: string }>(`/accounts/${accountId}/rules/lists/bulk_operations/${operationId}`);
    if (operation.status === "completed") return;
    if (operation.status === "failed") throw new Error(operation.error || "Cloudflare bulk operation failed.");
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Cloudflare operation ${operationId} did not complete within the verification window.`);
}

export async function createRedirect(input: RedirectInput): Promise<{ item: RedirectItem; operationId: string; verification: unknown }> {
  const normalized = normalizeRedirectInput(input);
  const before = await getInventory();
  const collision = before.items.find((item) => item.source_url.toLowerCase() === normalized.source_url.toLowerCase());
  if (collision) throw new Error(`That source already exists and points to ${collision.target_url}`);
  const { accountId, listId } = config();
  const operation = await cfRequest<{ operation_id: string }>(`/accounts/${accountId}/rules/lists/${listId}/items`, { method: "POST", body: JSON.stringify([apiItem(normalized)]) });
  await pollOperation(operation.operation_id);
  const after = await getInventory();
  const created = after.items.find((item) => item.source_url === normalized.source_url);
  if (!created || after.listCount !== before.listCount + 1) throw new Error("Cloudflare completed the operation, but the expected item/count was not observed.");
  const verification = await verifyPublicWithRetry(created, after.items);
  return { item: created, operationId: operation.operation_id, verification };
}

export async function updateRedirect(
  sourceUrl: string,
  input: RedirectInput,
  onBeforeReplace?: (items: RedirectItem[]) => Promise<void>,
): Promise<{ item: RedirectItem; operationId: string; beforeItems: RedirectItem[]; verification: unknown }> {
  const normalized = normalizeRedirectInput(input);
  if (normalized.source_url !== sourceUrl) throw new Error("Changing the source path is not supported. Create a new redirect instead.");
  const before = await getInventory();
  const index = before.items.findIndex((item) => item.source_url === sourceUrl);
  if (index < 0) throw new Error("The redirect no longer exists in Cloudflare.");
  const replacement = { ...normalized, id: before.items[index].id, created_on: before.items[index].created_on };
  const nextItems = before.items.map((item, itemIndex) => (itemIndex === index ? replacement : item));
  await onBeforeReplace?.(before.items);
  const { accountId, listId } = config();
  const operation = await cfRequest<{ operation_id: string }>(`/accounts/${accountId}/rules/lists/${listId}/items`, { method: "PUT", body: JSON.stringify(nextItems.map(apiItem)) });
  await pollOperation(operation.operation_id);
  const after = await getInventory();
  const updated = after.items.find((item) => item.source_url === sourceUrl);
  if (!updated || after.listCount !== before.listCount || updated.target_url !== replacement.target_url) throw new Error("The full-list reconciliation did not match the intended update.");
  const verification = await verifyPublicWithRetry(updated, after.items);
  return { item: updated, operationId: operation.operation_id, beforeItems: before.items, verification };
}

export async function verifyPublic(item: RedirectItem, inventory: RedirectItem[]) {
  const response = await fetch(`https://${item.source_url}`, { redirect: "manual", cache: "no-store" });
  const location = response.headers.get("location");
  if (response.status !== item.status_code || location !== item.target_url) throw new Error(`Public verification failed: expected ${item.status_code} ${item.target_url}, observed ${response.status} ${location ?? "without Location"}.`);
  const itemHost = item.source_url.split("/", 1)[0];
  const regressionItem = inventory.find((candidate) => candidate.source_url.split("/", 1)[0] !== itemHost);
  if (!regressionItem) return { checkedAt: new Date().toISOString(), status: response.status, location, regression: null };
  const regressionUrl = `https://${regressionItem.source_url}`;
  const regression = await fetch(regressionUrl, { redirect: "manual", cache: "no-store" });
  if (![301, 302, 307, 308].includes(regression.status) || !regression.headers.get("location")) throw new Error(`Cross-host regression check failed for ${regressionUrl}.`);
  return { checkedAt: new Date().toISOString(), status: response.status, location, regression: { url: regressionUrl, status: regression.status } };
}

async function verifyPublicWithRetry(item: RedirectItem, inventory: RedirectItem[]) {
  const outcome = await retryVerification(() => verifyPublic(item, inventory));
  if (outcome.state === "verified") return { state: "verified" as const, attempts: outcome.attempts, ...outcome.value };
  return {
    state: "pending" as const,
    attempts: outcome.attempts,
    checkedAt: new Date().toISOString(),
    lastError: outcome.lastError,
  };
}

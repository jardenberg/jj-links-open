import { env } from "cloudflare:workers";
import type { DailyMetric, RedirectItem } from "./types";

export function databaseAvailable() {
  return Boolean(env.DB);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cacheInventory(items: RedirectItem[], syncedAt: string) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO inventory_cache (id, payload_json, item_count, synced_at)
     VALUES ('live', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json, item_count=excluded.item_count, synced_at=excluded.synced_at`,
  ).bind(JSON.stringify(items), items.length, syncedAt).run();
}

export async function readCachedInventory(): Promise<{ items: RedirectItem[]; syncedAt: string } | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare("SELECT payload_json, synced_at FROM inventory_cache WHERE id='live'").first<{ payload_json: string; synced_at: string }>();
  return row ? { items: JSON.parse(row.payload_json) as RedirectItem[], syncedAt: row.synced_at } : null;
}

export async function saveDailyAnalytics(rows: Array<DailyMetric & { sourceUrl: string; path: string }>, observedAt: string) {
  if (!env.DB || rows.length === 0) return;
  const statements = rows.map((row) =>
    env.DB!.prepare(
      `INSERT INTO analytics_daily (date, source_url, host, path, requests, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, source_url) DO UPDATE SET requests=excluded.requests, observed_at=excluded.observed_at`,
    ).bind(row.date, row.sourceUrl, row.host, row.path, row.requests, observedAt),
  );
  for (let offset = 0; offset < statements.length; offset += 50) await env.DB.batch(statements.slice(offset, offset + 50));
}

export async function readStoredAnalytics(days = 30, now = new Date()): Promise<{ daily: DailyMetric[]; byPath: Array<{ sourceUrl: string; host: string; path: string; requests: number }>; start: string | null; end: string | null; observedAt: string | null }> {
  if (!env.DB) return { daily: [], byPath: [], start: null, end: null, observedAt: null };
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
  const start = cutoff.toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const result = await env.DB.prepare(
    "SELECT date, source_url, host, path, requests, observed_at FROM analytics_daily WHERE date >= ? AND date <= ? ORDER BY date ASC, source_url ASC",
  ).bind(start, end).all<{ date: string; source_url: string; host: string; path: string; requests: number; observed_at: string }>();
  const daily = result.results.map((row) => ({ date: row.date, sourceUrl: row.source_url, host: row.host, path: row.path, requests: row.requests }));
  const totals = new Map<string, { sourceUrl: string; host: string; path: string; requests: number }>();
  for (const row of daily) {
    const current = totals.get(row.sourceUrl) ?? { sourceUrl: row.sourceUrl, host: row.host, path: row.path, requests: 0 };
    current.requests += row.requests;
    totals.set(row.sourceUrl, current);
  }
  const dates = daily.map((row) => row.date).sort();
  const observedAt = result.results.map((row) => row.observed_at).sort().at(-1) ?? null;
  return { daily, byPath: [...totals.values()].sort((a, b) => b.requests - a.requests), start: dates[0] ?? null, end: dates.at(-1) ?? null, observedAt };
}

export async function recordSyncRun(input: { type: string; status: string; rows: number; windowStart?: string | null; windowEnd?: string | null; error?: string | null }) {
  if (!env.DB) return;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO sync_runs (id, type, status, rows, window_start, window_end, error, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), input.type, input.status, input.rows, input.windowStart ?? null, input.windowEnd ?? null, input.error ?? null, now, now).run();
}

export async function createConfigSnapshot(items: RedirectItem[], reason: string) {
  if (!env.DB) throw new Error("D1 is required before a full-list update can proceed.");
  const payload = JSON.stringify(items);
  const id = crypto.randomUUID();
  const digest = await sha256(payload);
  await env.DB.prepare(
    "INSERT INTO config_snapshots (id, item_count, sha256, payload_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, items.length, digest, payload, reason, new Date().toISOString()).run();
  return { id, sha256: digest, itemCount: items.length };
}

export async function auditEvent(input: {
  requestId: string;
  actorId: string;
  actorEmail: string;
  action: string;
  sourceUrl: string;
  before?: unknown;
  after?: unknown;
  operationId?: string;
  verification?: unknown;
  status: "completed" | "failed" | "started";
  error?: string;
}) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO audit_events
      (id, request_id, actor_id, actor_email, action, source_url, before_json, after_json, operation_id, verification_json, status, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(request_id) DO UPDATE SET before_json=COALESCE(excluded.before_json, audit_events.before_json), after_json=excluded.after_json, operation_id=excluded.operation_id,
       verification_json=excluded.verification_json, status=excluded.status, error=excluded.error`,
  ).bind(
    crypto.randomUUID(), input.requestId, input.actorId, input.actorEmail, input.action, input.sourceUrl,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    input.operationId ?? null,
    input.verification === undefined ? null : JSON.stringify(input.verification),
    input.status, input.error ?? null, new Date().toISOString(),
  ).run();
}

export async function requestAlreadyCompleted(requestId: string) {
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT status FROM audit_events WHERE request_id=?").bind(requestId).first<{ status: string }>();
  return row?.status === "completed";
}

export async function listAuditEvents(limit = 20) {
  if (!env.DB) return [];
  const result = await env.DB.prepare(
    "SELECT action, source_url, status, operation_id, error, created_at FROM audit_events ORDER BY created_at DESC LIMIT ?",
  ).bind(limit).all();
  return result.results;
}

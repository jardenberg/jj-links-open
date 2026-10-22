import { env } from "cloudflare:workers";
import { ApiError } from "./errors";
import { readImportCsv, planImport, type Change, type ImportMode } from "./import-plan";
import { cloudflareConfigured, getInventory, replaceInventory, recoverWrite, verifyPublic } from "./cloudflare";
import { sourceHosts } from "./runtime-config";
import { sourceUrl } from "./redirect-model";
import { getDashboardData } from "./dashboard-data";
import { createConfigSnapshot, auditEvent } from "./store";
import { guardedWrite } from "./write-guard";
import type { AppUser } from "./auth";
import type { RedirectItem } from "./types";
import { connectionIds } from "./connection";

type PreviewRow = { id: string; actor_id: string; mode: ImportMode; baseline_json: string; candidate_json: string; changes_json: string; state: string; expires_at: string; verification_json: string };
const serialize = (value: unknown) => {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > 1_500_000) throw new ApiError(413, "This backup is too large for a safe preview. Split it into smaller merge imports.");
  return text;
};

export async function previewImport(user: AppUser, csv: string, mode: ImportMode) {
  const incoming = readImportCsv(csv, sourceHosts(), mode === "restore");
  const before = cloudflareConfigured() ? (await getInventory()).items : (await getDashboardData()).inventory;
  if (before.some((item) => !sourceHosts().includes(sourceUrl(item.source_url).hostname))) throw new ApiError(409, "Use a dedicated redirect list containing only your configured short domains.");
  const plan = planImport(before, incoming, mode);
  if (!cloudflareConfigured()) return { ...plan, sample: true, id: null };
  if (!env.DB) throw new ApiError(503, "Migrate the D1 database before importing.");
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  const payloads = [serialize(before), serialize(plan.items), serialize({ changes: plan.changes, connection: await connectionIds() })];
  // D1's 2 MB limit applies to the complete row, not only each JSON column.
  if (payloads.reduce((size, value) => size + new TextEncoder().encode(value).length, 0) > 1_800_000) throw new ApiError(413, "The complete preview exceeds the safe database size. Use a smaller merge file or manage this large list directly in Cloudflare.");
  await env.DB.prepare("INSERT INTO import_previews (id, actor_id, mode, baseline_json, candidate_json, changes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, user.userId, mode, ...payloads, expiresAt, now.toISOString()).run();
  return { id, sample: false, mode, changes: plan.changes, counts: plan.counts, expiresAt };
}

async function ownedPreview(id: string, user: AppUser): Promise<PreviewRow> {
  if (!env.DB) throw new ApiError(503, "D1 is not configured.");
  const preview = await env.DB.prepare("SELECT * FROM import_previews WHERE id=?").bind(id).first<PreviewRow>();
  if (!preview || preview.actor_id !== user.userId) throw new ApiError(404, "Import preview not found.");
  return preview;
}

export async function resumeImport(user: AppUser, id: string) {
  const row = await ownedPreview(id, user);
  const write = await env.DB!.prepare("SELECT state, response_json FROM write_requests WHERE id=? AND actor_id=?").bind(id, user.userId).first<{ state: string; response_json: string | null }>();
  if (write?.state === "completed" && row.state !== "applied") await env.DB!.prepare("UPDATE import_previews SET state='applied' WHERE id=?").bind(id).run();
  const changes: Change[] = JSON.parse(row.changes_json).changes;
  const added = changes.filter((change) => change.kind === "added").length;
  const changed = changes.filter((change) => change.kind === "changed").length;
  const after = JSON.parse(row.candidate_json).length;
  return {
    preview: { id, sample: false, mode: row.mode, changes, counts: { added, changed, removed: changes.filter((change) => change.kind === "removed").length, unchanged: row.mode === "merge" ? after - added - changed : changes.filter((change) => change.kind === "unchanged").length, before: JSON.parse(row.baseline_json).length, after } },
    state: write?.state === "completed" ? "applied" : write?.state ?? row.state,
    backupId: write?.response_json ? JSON.parse(write.response_json).backupId : null,
  };
}

export async function applyImport(user: AppUser, id: string, confirmation: string) {
  const preview = await ownedPreview(id, user);
  const before: RedirectItem[] = JSON.parse(preview.baseline_json);
  const plannedConnection = JSON.parse(preview.changes_json).connection;
  if (JSON.stringify(plannedConnection) !== JSON.stringify(await connectionIds())) throw new ApiError(409, "This preview belongs to another redirect list. Make a new preview for the selected list.");
  if (preview.mode === "restore" && confirmation !== `RESTORE ${before.length}`) throw new ApiError(400, `Type RESTORE ${before.length} to confirm replacing the complete list.`);
  if (preview.state === "preview" && Date.parse(preview.expires_at) < Date.now()) throw new ApiError(409, "This preview expired. Upload the CSV again for a fresh comparison.");
  const result = await guardedWrite(id, user.userId, { action: "import", previewId: id }, async (context) => {
    // Recheck after acquiring the write lock: selection could change between the
    // first check and this lock, even when the two lists have identical contents.
    if (JSON.stringify(plannedConnection) !== JSON.stringify(await connectionIds())) throw new ApiError(409, "This preview belongs to another redirect list. Make a new preview for the selected list.");
    await env.DB!.prepare("UPDATE import_previews SET state='processing' WHERE id=?").bind(id).run();
    return replaceInventory(before, JSON.parse(preview.candidate_json), context, (items) => createConfigSnapshot(items, `Before ${preview.mode} import ${id}`));
  }, recoverWrite);
  if (result.outcome === "processing") return result;
  await env.DB!.prepare("UPDATE import_previews SET state='applied' WHERE id=?").bind(id).run();
  await auditEvent({ requestId: id, actorId: user.userId, actorEmail: user.email, action: "import-" + preview.mode, sourceUrl: "complete-list", before: { count: before.length, backupId: result.backupId }, after: { count: JSON.parse(preview.candidate_json).length }, operationId: result.operationId, verification: result.verification, status: "completed" }).catch(() => console.error("Import saved; audit completion requires reconciliation."));
  return result;
}

export async function verifyImport(user: AppUser, id: string, offset: number) {
  const preview = await ownedPreview(id, user);
  if (preview.state !== "applied") throw new ApiError(409, "Confirm the saved configuration before verifying its public behavior.");
  const changes: Change[] = JSON.parse(preview.changes_json).changes;
  const checks = changes.filter((change) => change.kind !== "unchanged");
  const page = checks.slice(offset, offset + 10);
  const observations: Record<string, { state: string; message?: string }> = {};
  // At most ten public probes per request, comfortably below Workers subrequest limits.
  for (let start = 0; start < page.length; start += 3) {
    await Promise.all(page.slice(start, start + 3).map(async (change) => {
      try {
        if (change.after) await verifyPublic(change.after, []);
        else {
          if (!sourceHosts().includes(sourceUrl(change.before!.source_url).hostname)) throw Error("Source host is no longer configured.");
          const response = await fetch(sourceUrl(change.before!.source_url), { redirect: "manual", signal: AbortSignal.timeout(1500), cache: "no-store" });
          const status = response.status;
          await response.body?.cancel().catch(() => {});
          if ((status >= 300 && status < 400) || status >= 500) throw Error("The removal is not publicly confirmed yet.");
        }
        observations[change.source] = { state: "verified" };
      } catch { observations[change.source] = { state: "pending", message: "Configuration saved; public behavior is not confirmed yet." }; }
    }));
  }
  await env.DB!.prepare("UPDATE import_previews SET verification_json=json_patch(verification_json, ?) WHERE id=?").bind(JSON.stringify(observations), id).run();
  const updated = await ownedPreview(id, user);
  const results = JSON.parse(updated.verification_json) as Record<string, { state: string }>;
  return { checked: Object.keys(results).length, total: checks.length, verified: Object.values(results).filter((x) => x.state === "verified").length, nextOffset: offset + page.length < checks.length ? offset + page.length : null, results };
}

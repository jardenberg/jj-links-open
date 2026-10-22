import { env } from "cloudflare:workers";
import { ApiError, WriteRejectedError, WriteUncertainError } from "./errors";

type WriteResult = { item: unknown; operationId: string; verification: unknown; [key: string]: unknown };
type SavedRequest = { actor_id: string; fingerprint: string; state: string; response_json: string | null; expected_json: string | null; created_at: string };
export type WriteContext = { prepare: (expected: unknown) => Promise<void> };

// One unique lock_key serializes writes across tabs, processes and Worker isolates.
// An uncertain write deliberately retains it until a readback reconciles the outcome.
export async function guardedWrite(
  requestId: string,
  actorId: string,
  input: unknown,
  execute: (context: WriteContext) => Promise<WriteResult>,
  recover: (expected: unknown) => Promise<WriteResult | null>,
) {
  const db = env.DB;
  if (!db) throw new ApiError(503, "D1 is required before live writes can proceed.");
  const fingerprint = JSON.stringify(input);
  const saved = () => db.prepare("SELECT actor_id, fingerprint, state, response_json, expected_json, created_at FROM write_requests WHERE id=?").bind(requestId).first<SavedRequest>();
  let previous = await saved();
  if (!previous) {
    try {
      await db.prepare("INSERT INTO write_requests (id, actor_id, fingerprint, state, lock_key, created_at) VALUES (?, ?, ?, 'processing', 'redirect-list', ?)").bind(requestId, actorId, fingerprint, new Date().toISOString()).run();
    } catch (error) {
      previous = await saved();
      if (!previous) {
        const active = await db.prepare("SELECT id FROM write_requests WHERE lock_key='redirect-list'").first();
        if (active) throw new ApiError(409, "Another redirect change is processing or awaiting reconciliation. Check that change before submitting another.");
        throw error;
      }
    }
  }
  if (previous) {
    if (previous.actor_id !== actorId || previous.fingerprint !== fingerprint) throw new ApiError(409, "This request ID belongs to a different change.");
    if (previous.state === "completed" && previous.response_json) return { ...JSON.parse(previous.response_json), idempotent: true };
    if (previous.state === "failed") throw new ApiError(409, "This request failed before submission. Correct the input and start a new request.");
    // No automatic resubmission after an interrupted or ambiguous network write.
    if ((previous.state === "uncertain" || Date.now() - Date.parse(previous.created_at) > 120_000) && previous.expected_json) {
      const result = await recover(JSON.parse(previous.expected_json));
      if (result) return finish(result);
    }
    return { outcome: "processing" as const, message: "The change is still processing or awaiting confirmation. Check status again; do not create a second request." };
  }

  async function finish(result: WriteResult) {
    const response = { ...result, outcome: "confirmed" as const };
    await db!.prepare("UPDATE write_requests SET state='completed', response_json=?, lock_key=NULL WHERE id=?").bind(JSON.stringify(response), requestId).run();
    return response;
  }

  let prepared = false;
  try {
    const result = await execute({ prepare: async (expected) => {
      await db.prepare("UPDATE write_requests SET expected_json=? WHERE id=?").bind(JSON.stringify(expected), requestId).run();
      prepared = true;
    } });
    return await finish(result);
  } catch (error) {
    if ((prepared && !(error instanceof WriteRejectedError)) || error instanceof WriteUncertainError) {
      await db.prepare("UPDATE write_requests SET state='uncertain' WHERE id=?").bind(requestId).run();
      return { outcome: "processing" as const, message: "Cloudflare may have saved this change. Check status again with this form before starting another change." };
    }
    await db.prepare("UPDATE write_requests SET state='failed', lock_key=NULL WHERE id=?").bind(requestId).run();
    const rejected = error instanceof ApiError ? error : new ApiError(400, error instanceof Error ? error.message : "The change was not submitted.");
    rejected.resetRequest = true;
    throw rejected;
  }
}

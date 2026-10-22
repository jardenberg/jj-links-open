import { env } from "cloudflare:workers";
import { ApiError } from "./errors";

export async function connectionIds() {
  if (env.CLOUDFLARE_LIST_ID && env.CLOUDFLARE_RULESET_ID) return { listId: env.CLOUDFLARE_LIST_ID, rulesetId: env.CLOUDFLARE_RULESET_ID };
  const row = await env.DB?.prepare("SELECT list_id, ruleset_id FROM connections WHERE id='primary' AND account_id=? AND zone_id=?").bind(env.CLOUDFLARE_ACCOUNT_ID ?? "", env.CLOUDFLARE_ZONE_ID ?? "").first<{ list_id: string; ruleset_id: string }>();
  if (!row) throw new ApiError(503, "Choose your redirect list using Connect Cloudflare.");
  return { listId: row.list_id, rulesetId: row.ruleset_id };
}

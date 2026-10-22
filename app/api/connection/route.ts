import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireApiUser, json, errorResponse, ApiError } from "../../../lib/api-auth";
import { cfRequest, getInventory } from "../../../lib/cloudflare";
import { sourceHosts } from "../../../lib/runtime-config";
import { sourceUrl } from "../../../lib/redirect-model";

const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"] as const;
export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const missing = required.filter((key) => !env[key]);
    if (missing.length) return json({ ok: true, missing, lists: [] });
    const lists = await cfRequest<Array<{ id: string; name: string; num_items: number; kind: string }>>(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rules/lists`);
    return json({ ok: true, missing: [], lists: lists.filter((list) => list.kind === "redirect").map(({ id, name, num_items }) => ({ id, name, count: num_items })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request, true);
    const input = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/i) }).parse(await request.json());
    if (!env.DB) throw new ApiError(503, "Apply the D1 migrations first.");
    if (env.CLOUDFLARE_LIST_ID || env.CLOUDFLARE_RULESET_ID) throw new ApiError(409, "This installation pins its list in Worker settings. Update those settings instead.");
    const list = await cfRequest<{ name: string; kind: string }>(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rules/lists/${input.id}`);
    if (list.kind !== "redirect") throw new ApiError(400, "Choose a Bulk Redirect List.");
    const ruleset = await cfRequest<{ id: string; rules?: Array<{ enabled?: boolean; action_parameters?: { from_list?: { name?: string } } }> }>(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/rulesets/phases/http_request_redirect/entrypoint`);
    if (!ruleset.rules?.some((rule) => rule.enabled !== false && rule.action_parameters?.from_list?.name === list.name)) throw new ApiError(400, "Create and enable a Cloudflare Bulk Redirect Rule for this list first.");
    const inventory = await getInventory(input.id);
    if (inventory.items.some((item) => !sourceHosts().includes(sourceUrl(item.source_url).hostname))) throw new ApiError(400, "This list contains other domains. Choose a dedicated list for your two short domains.");
    // Atomic selection refuses to race a list mutation; retrying it is harmless.
    const result = await env.DB.prepare("INSERT INTO connections (id, account_id, zone_id, list_id, ruleset_id) SELECT 'primary', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM write_requests WHERE lock_key='redirect-list') ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id, zone_id=excluded.zone_id, list_id=excluded.list_id, ruleset_id=excluded.ruleset_id")
      .bind(env.CLOUDFLARE_ACCOUNT_ID!, env.CLOUDFLARE_ZONE_ID!, input.id, ruleset.id).run();
    if (!result.meta.changes) throw new ApiError(409, "A redirect write is still running. Finish or reconcile it before switching lists.");
    return json({ ok: true, listName: list.name, count: inventory.listCount });
  } catch (error) { return errorResponse(error); }
}

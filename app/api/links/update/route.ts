import { z } from "zod";
import { errorResponse, json, requireApiUser } from "../../../../lib/api-auth";
import { updateRedirect } from "../../../../lib/cloudflare";
import { isAllowedHost } from "../../../../lib/runtime-config";
import { auditEvent, createConfigSnapshot, requestAlreadyCompleted } from "../../../../lib/store";

const schema = z.object({
  requestId: z.string().uuid(),
  sourceUrl: z.string().min(1),
  host: z.string().refine(isAllowedHost, "Source host is not configured."),
  slug: z.string().min(1).max(200),
  targetUrl: z.string().url().max(4000),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
  preserveQueryString: z.boolean().optional(),
  comment: z.string().max(500).optional(),
  confirmedFullListReplacement: z.literal(true),
});

export async function PATCH(request: Request) {
  let requestId = "";
  let sourceUrl = "unknown";
  let user: Awaited<ReturnType<typeof requireApiUser>> | null = null;
  try {
    user = await requireApiUser(request, true);
    const body = schema.parse(await request.json());
    requestId = body.requestId;
    sourceUrl = body.sourceUrl;
    if (await requestAlreadyCompleted(requestId)) return json({ ok: true, idempotent: true });
    let snapshot: Awaited<ReturnType<typeof createConfigSnapshot>> | null = null;
    await auditEvent({ requestId, actorId: user.userId, actorEmail: user.email, action: "update", sourceUrl, after: body, status: "started" });
    const result = await updateRedirect(sourceUrl, body, async (items) => {
      snapshot = await createConfigSnapshot(items, `Before update of ${sourceUrl}`);
    });
    const beforeItem = result.beforeItems.find((item) => item.source_url === sourceUrl);
    await auditEvent({ requestId, actorId: user.userId, actorEmail: user.email, action: "update", sourceUrl, before: { item: beforeItem, snapshot }, after: result.item, operationId: result.operationId, verification: result.verification, status: "completed" });
    return json({ ok: true, item: result.item, operationId: result.operationId, verification: result.verification, snapshot });
  } catch (error) {
    if (user && requestId) await auditEvent({ requestId, actorId: user.userId, actorEmail: user.email, action: "update", sourceUrl, status: "failed", error: error instanceof Error ? error.message : "Unknown failure" }).catch(() => {});
    return errorResponse(error);
  }
}

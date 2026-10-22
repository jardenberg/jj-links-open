import { z } from "zod";
import { errorResponse, json, requireApiUser } from "../../../../lib/api-auth";
import { updateRedirect, recoverWrite } from "../../../../lib/cloudflare";
import { isAllowedHost } from "../../../../lib/runtime-config";
import { auditEvent, createConfigSnapshot } from "../../../../lib/store";
import { guardedWrite } from "../../../../lib/write-guard";

const schema = z.object({
  requestId: z.string().uuid(),
  sourceUrl: z.string().min(1),
  host: z.string().refine(isAllowedHost, "Source host is not configured."),
  slug: z.string().max(200),
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
    const actor = { requestId, actorId: user.userId, actorEmail: user.email, action: "update", sourceUrl };
    const result = await guardedWrite(requestId, user.userId, { action: "update", ...body }, async (context) => {
      await auditEvent({ ...actor, after: body, status: "started" });
      return updateRedirect(sourceUrl, body, context, async (items) => {
        const snapshot = await createConfigSnapshot(items, `Before update of ${sourceUrl}`);
        await auditEvent({ ...actor, before: { item: items.find((item) => item.source_url === sourceUrl), snapshot }, after: body, status: "started" });
      });
    }, recoverWrite);
    if (result.outcome === "processing") return json({ ok: true, ...result }, 202);
    await auditEvent({ ...actor, after: result.item, operationId: result.operationId, verification: result.verification, status: "completed" }).catch(() => console.error("Confirmed redirect update: audit completion needs reconciliation."));
    return json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

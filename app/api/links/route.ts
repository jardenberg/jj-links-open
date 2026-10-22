import { z } from "zod";
import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { createRedirect } from "../../../lib/cloudflare";
import { isAllowedHost } from "../../../lib/runtime-config";
import { auditEvent, requestAlreadyCompleted } from "../../../lib/store";

const schema = z.object({
  requestId: z.string().uuid(),
  host: z.string().refine(isAllowedHost, "Source host is not configured."),
  slug: z.string().min(1).max(200),
  targetUrl: z.string().url().max(4000),
  statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
  preserveQueryString: z.boolean().optional(),
  comment: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  let requestId = "";
  let sourceUrl = "unknown";
  let user: Awaited<ReturnType<typeof requireApiUser>> | null = null;
  try {
    user = await requireApiUser(request, true);
    const body = schema.parse(await request.json());
    requestId = body.requestId;
    sourceUrl = `${body.host}/${body.slug.replace(/^\/+/, "")}`;
    if (await requestAlreadyCompleted(requestId)) return json({ ok: true, idempotent: true });
    await auditEvent({ requestId, actorId: user.userId, actorEmail: user.email, action: "create", sourceUrl, after: body, status: "started" });
    const result = await createRedirect(body);
    await auditEvent({ requestId, actorId: user.userId, actorEmail: user.email, action: "create", sourceUrl, after: result.item, operationId: result.operationId, verification: result.verification, status: "completed" });
    return json({ ok: true, ...result }, 201);
  } catch (error) {
    if (user && requestId) await auditEvent({ requestId, actorId: user.userId, actorEmail: user.email, action: "create", sourceUrl, status: "failed", error: error instanceof Error ? error.message : "Unknown failure" }).catch(() => {});
    return errorResponse(error);
  }
}

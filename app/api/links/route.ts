import { z } from "zod";
import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { createRedirect, recoverWrite } from "../../../lib/cloudflare";
import { isAllowedHost } from "../../../lib/runtime-config";
import { auditEvent } from "../../../lib/store";
import { guardedWrite } from "../../../lib/write-guard";

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
    const actor = { requestId, actorId: user.userId, actorEmail: user.email, action: "create", sourceUrl };
    const result = await guardedWrite(requestId, user.userId, { action: "create", ...body }, async (context) => {
      await auditEvent({ ...actor, after: body, status: "started" });
      return createRedirect(body, context);
    }, recoverWrite);
    if (result.outcome === "processing") return json({ ok: true, ...result }, 202);
    await auditEvent({ ...actor, after: result.item, operationId: result.operationId, verification: result.verification, status: "completed" }).catch(() => console.error("Confirmed redirect write: audit completion needs reconciliation."));
    return json({ ok: true, ...result }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { listAuditEvents } from "../../../lib/store";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    return json({ ok: true, events: await listAuditEvents(30) });
  } catch (error) {
    return errorResponse(error);
  }
}

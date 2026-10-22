import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { getDashboardData } from "../../../lib/dashboard-data";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    return json({ ok: true, data: await getDashboardData() });
  } catch (error) {
    return errorResponse(error);
  }
}

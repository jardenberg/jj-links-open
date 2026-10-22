import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { getDashboardData } from "../../../lib/dashboard-data";

export async function POST(request: Request) {
  try {
    await requireApiUser(request, true);
    const data = await getDashboardData(true);
    return json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

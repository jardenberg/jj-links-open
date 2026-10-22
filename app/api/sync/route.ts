import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { getDashboardData } from "../../../lib/dashboard-data";

export async function POST(request: Request) {
  try {
    await requireApiUser(request, true);
    const data = await getDashboardData();
    return json({ ok: true, count: data.inventory.length, paths: data.byPath.length, syncedAt: data.health.syncedAt, warning: data.health.warning });
  } catch (error) {
    return errorResponse(error);
  }
}

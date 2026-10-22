import { errorResponse, json, requireApiUser } from "../../../lib/api-auth";
import { getDashboardData } from "../../../lib/dashboard-data";
import { APP_NAME, APP_VERSION, RELEASE_DATE } from "../../../lib/version";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const data = await getDashboardData();
    return json({
      ok: true,
      name: APP_NAME,
      version: APP_VERSION,
      releaseDate: RELEASE_DATE,
      redirectServingIndependent: true,
      health: data.health,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

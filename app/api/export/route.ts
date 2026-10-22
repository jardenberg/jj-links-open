import { errorResponse, requireApiUser, ApiError } from "../../../lib/api-auth";
import { getInventory, cloudflareConfigured } from "../../../lib/cloudflare";
import { getDashboardData } from "../../../lib/dashboard-data";
import { exportRedirectCsv } from "../../../lib/csv";
import { env } from "cloudflare:workers";
import type { RedirectItem } from "../../../lib/types";

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const backupId = new URL(request.url).searchParams.get("backup");
    let items: RedirectItem[];
    if (backupId) {
      if (!/^[a-f0-9-]{36}$/i.test(backupId) || !env.DB) throw new ApiError(404, "Backup not found.");
      const row = await env.DB.prepare("SELECT payload_json FROM config_snapshots WHERE id=?").bind(backupId).first<{ payload_json: string }>();
      if (!row) throw new ApiError(404, "Backup not found.");
      items = JSON.parse(row.payload_json);
    } else items = cloudflareConfigured() ? (await getInventory()).items : (await getDashboardData()).inventory;
    return new Response(exportRedirectCsv(items), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jj-links-${backupId ? "before-import-" : ""}${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
}

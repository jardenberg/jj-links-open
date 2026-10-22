import redirectSeedCsv from "../data/redirects.csv?raw";
import historySeed from "../data/legacy-history.json";
import { cloudflareConfigured, getAnalytics, getInventory, getSystemHealth } from "./cloudflare";
import { cacheInventory, readCachedInventory, readStoredAnalytics, recordSyncRun, saveDailyAnalytics } from "./store";
import type { DashboardPayload, HistoricalMetric, RedirectItem } from "./types";
import { APP_VERSION } from "./version";
import { parseRedirectCsv } from "./csv";
import { sourceHosts } from "./runtime-config";

const fallbackItems = parseRedirectCsv(redirectSeedCsv) as RedirectItem[];
const historical = (historySeed as { links: HistoricalMetric[] }).links;

export async function getDashboardData(): Promise<DashboardPayload> {
  if (!cloudflareConfigured()) {
    return {
      version: APP_VERSION,
      sourceHosts: sourceHosts(),
      inventory: fallbackItems,
      byPath: [],
      daily: [],
      historical,
      health: {
        configured: false,
        enabledRule: true,
        ruleName: "Example Bulk Redirect rule",
        listName: "example_redirects",
        listCount: fallbackItems.length,
        dnsHealthy: true,
        analyticsWindowStart: null,
        analyticsWindowEnd: null,
        syncedAt: null,
        stale: true,
        warning: "Live Cloudflare access is not configured. Showing synthetic sample data.",
      },
    };
  }

  try {
    const inventory = await getInventory();
    const health = await getSystemHealth(inventory);
    const syncedAt = new Date().toISOString();
    try {
      const liveAnalytics = await getAnalytics();
      await saveDailyAnalytics(liveAnalytics.daily, syncedAt);
      await recordSyncRun({ type: "analytics", status: "completed", rows: liveAnalytics.daily.length, windowStart: liveAnalytics.start, windowEnd: liveAnalytics.end });
    } catch (error) {
      health.warning = `Redirects are connected, but analytics could not refresh: ${error instanceof Error ? error.message : "unknown error"}`;
      await recordSyncRun({ type: "analytics", status: "failed", rows: 0, error: health.warning }).catch(() => {});
    }
    const analytics = await readStoredAnalytics();
    health.analyticsWindowStart = analytics.start;
    health.analyticsWindowEnd = analytics.end;
    if (!analytics.daily.length && !health.warning) health.warning = "Live redirects are connected. Analytics are waiting for the first successful collection.";
    await cacheInventory(inventory.items, syncedAt).catch(() => {});
    return { version: APP_VERSION, sourceHosts: sourceHosts(), inventory: inventory.items, byPath: analytics.byPath, daily: analytics.daily, historical, health };
  } catch (error) {
    const cached = await readCachedInventory().catch(() => null);
    return {
      version: APP_VERSION,
      sourceHosts: sourceHosts(),
      inventory: cached?.items ?? fallbackItems,
      byPath: [],
      daily: [],
      historical,
      health: {
        configured: true,
        enabledRule: false,
        ruleName: null,
        listName: "configured_redirect_list",
        listCount: cached?.items.length ?? fallbackItems.length,
        dnsHealthy: false,
        analyticsWindowStart: null,
        analyticsWindowEnd: null,
        syncedAt: cached?.syncedAt ?? null,
        stale: true,
        warning: error instanceof Error ? error.message : "Live Cloudflare refresh failed.",
      },
    };
  }
}

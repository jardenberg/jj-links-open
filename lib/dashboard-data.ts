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

export async function getDashboardData(refreshAnalytics = false): Promise<DashboardPayload> {
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
        enabledRule: false,
        ruleName: "Example Bulk Redirect rule",
        listName: "example_redirects",
        listCount: fallbackItems.length,
        dnsHealthy: false,
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
    if (refreshAnalytics) {
      try {
        const liveAnalytics = await getAnalytics();
        await saveDailyAnalytics(liveAnalytics.daily, syncedAt);
        await recordSyncRun({ type: "analytics", status: "completed", rows: liveAnalytics.daily.length, windowStart: liveAnalytics.start, windowEnd: liveAnalytics.end });
      } catch (error) {
        health.warning = `Redirects are connected, but analytics could not refresh: ${error instanceof Error ? error.message : "unknown error"}`;
        await recordSyncRun({ type: "analytics", status: "failed", rows: 0, error: health.warning }).catch(() => {});
      }
    }
    const analytics = await readStoredAnalytics().catch(() => ({ daily: [], byPath: [], start: null, end: null, observedAt: null }));
    health.analyticsWindowStart = analytics.start;
    health.analyticsWindowEnd = analytics.end;
    if (!analytics.daily.length && !health.warning) health.warning = "Live redirects are connected. Analytics are waiting for the first successful collection.";
    else if (analytics.observedAt && Date.now() - Date.parse(analytics.observedAt) > 36 * 3_600_000) health.warning = "Redirects are connected. Analytics have not been collected in the last 36 hours.";
    await cacheInventory(inventory.items, syncedAt).catch(() => {});
    return { version: APP_VERSION, sourceHosts: sourceHosts(), inventory: inventory.items, byPath: analytics.byPath, daily: analytics.daily, historical: [], health };
  } catch (error) {
    const cached = await readCachedInventory().catch(() => null);
    return {
      version: APP_VERSION,
      sourceHosts: sourceHosts(),
      inventory: cached?.items ?? [],
      byPath: [],
      daily: [],
      historical: [],
      health: {
        configured: true,
        enabledRule: false,
        ruleName: null,
        listName: "configured_redirect_list",
        listCount: cached?.items.length ?? 0,
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

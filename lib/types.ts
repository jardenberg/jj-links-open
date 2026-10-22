export type RedirectItem = {
  id: string;
  source_url: string;
  target_url: string;
  status_code: number;
  include_subdomains: boolean;
  subpath_matching: boolean;
  preserve_path_suffix: boolean;
  preserve_query_string: boolean;
  comment: string;
  created_on?: string;
  modified_on?: string;
};

export type PathMetric = {
  sourceUrl: string;
  host: string;
  path: string;
  requests: number;
};

export type DailyMetric = {
  date: string;
  host: string;
  path: string;
  sourceUrl: string;
  requests: number;
};

export type HistoricalMetric = {
  source_url: string;
  total_clicks: number;
  human_clicks: number;
  human_unique_clicks_row_sum: number;
  bot_clicks: number;
  qr_scans: number;
  first_click: string | null;
  latest_click: string | null;
};

export type SystemHealth = {
  configured: boolean;
  enabledRule: boolean;
  ruleName: string | null;
  listName: string;
  listCount: number;
  dnsHealthy: boolean;
  analyticsWindowStart: string | null;
  analyticsWindowEnd: string | null;
  syncedAt: string | null;
  stale: boolean;
  warning: string | null;
};

export type DashboardPayload = {
  version: string;
  sourceHosts: [string, string];
  inventory: RedirectItem[];
  byPath: PathMetric[];
  daily: DailyMetric[];
  historical: HistoricalMetric[];
  health: SystemHealth;
};

export type RedirectInput = {
  host: string;
  slug: string;
  targetUrl: string;
  statusCode?: 301 | 302 | 307 | 308;
  preserveQueryString?: boolean;
  comment?: string;
};

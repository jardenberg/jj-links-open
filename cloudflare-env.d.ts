declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS: Fetcher;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_ZONE_ID?: string;
    CLOUDFLARE_LIST_ID?: string;
    CLOUDFLARE_RULESET_ID?: string;
    JJ_LINKS_SOURCE_HOSTS?: string;
    JJ_LINKS_OWNER_EMAIL?: string;
  }
}

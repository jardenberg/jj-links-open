import { authenticateAccess, missingAccessSettings, withIdentity } from "../lib/access";
import { ApiError } from "../lib/errors";
import { errorResponse, json } from "../lib/api-auth";
import { APP_VERSION } from "../lib/version";
import { GET as dashboard } from "../app/api/dashboard/route";
import { GET as audit } from "../app/api/audit/route";
import { GET as health } from "../app/api/health/route";
import { POST as create } from "../app/api/links/route";
import { PATCH as update } from "../app/api/links/update/route";
import { POST as sync } from "../app/api/sync/route";
import { POST as importCsv } from "../app/api/import/route";
import { GET as exportCsv } from "../app/api/export/route";
import { GET as connection, POST as connect } from "../app/api/connection/route";

const routes: Record<string, (request: Request) => Promise<Response>> = {
  "GET /api/dashboard": dashboard, "GET /api/audit": audit, "GET /api/health": health,
  "POST /api/links": create, "PATCH /api/links/update": update, "POST /api/sync": sync,
  "POST /api/import": importCsv, "GET /api/export": exportCsv,
  "GET /api/connection": connection, "POST /api/connection": connect,
};

function setupResponse() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Set up JJ Links</title></head><body style="background:#09090b;color:#f7f4ef;font:17px system-ui;max-width:760px;margin:8vh auto;padding:24px;line-height:1.6"><h1>Your JJ Links installation is ready to secure.</h1><p>The dashboard stays locked until Cloudflare Access and your owner email are configured.</p><ol><li>Enable Cloudflare Access for this Worker's hostname.</li><li>Choose email one-time PIN and allow only your email.</li><li>Copy the team hostname and application audience (AUD) into the Worker's settings.</li><li>Set CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD and JJ_LINKS_OWNER_EMAIL, then redeploy.</li></ol><p><a style="color:#ff7b64" href="https://github.com/jardenberg/jj-links-open/blob/main/docs/DEPLOYMENT.md">Open the step-by-step setup guide and AI helper prompt</a></p><small>JJ Links ${APP_VERSION} · No private inventory is available on this setup page.</small></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function secured(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  if (!import.meta.env.DEV) headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, settings: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    const localSample = import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !settings.CLOUDFLARE_API_TOKEN;
    try {
      if (!localSample && missingAccessSettings(settings).length) {
        return secured(url.pathname.startsWith("/api/") ? json({ ok: false, error: "Finish Cloudflare Access setup before opening the dashboard." }, 503) : setupResponse());
      }
      const user = localSample
        ? { userId: "local-sample", email: settings.JJ_LINKS_OWNER_EMAIL || "sample@example.com", displayName: "Sample", fullName: null }
        : await authenticateAccess(request, settings);
      const trusted = withIdentity(request, user);
      if (url.pathname.startsWith("/api/")) {
        const route = routes[`${request.method} ${url.pathname}`];
        return secured(route ? await route(trusted) : json({ ok: false, error: "Endpoint not found." }, 404));
      }
      if (!["GET", "HEAD"].includes(request.method)) throw new ApiError(405, "Method not allowed.");
      return secured(await settings.ASSETS.fetch(trusted));
    } catch (error) { return secured(errorResponse(error)); }
  },
};

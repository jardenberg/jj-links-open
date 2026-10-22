import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AppUser } from "./auth";
import { ApiError } from "./errors";

type AccessSettings = Pick<Cloudflare.Env, "CF_ACCESS_TEAM_DOMAIN" | "CF_ACCESS_AUD" | "JJ_LINKS_OWNER_EMAIL">;
const keySets = new Map<string, JWTVerifyGetKey>();

export function accessIssuer(teamDomain: string): string {
  const url = new URL(teamDomain.startsWith("https://") ? teamDomain : `https://${teamDomain}`);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(url.hostname) || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new ApiError(503, "CF_ACCESS_TEAM_DOMAIN must be your Cloudflare Access team hostname.");
  }
  return url.origin;
}

export function missingAccessSettings(settings: AccessSettings) {
  return (["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "JJ_LINKS_OWNER_EMAIL"] as const).filter((key) => !settings[key]?.trim());
}

export async function authenticateAccess(request: Request, settings: AccessSettings, testKeySet?: JWTVerifyGetKey): Promise<AppUser> {
  if (missingAccessSettings(settings).length) throw new ApiError(503, "Cloudflare Access is not configured yet.");
  const issuer = accessIssuer(settings.CF_ACCESS_TEAM_DOMAIN!.trim());
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new ApiError(401, "Sign in through Cloudflare Access to open this dashboard.");
  if (token.length > 8192) throw new ApiError(401, "Invalid session token.");
  let keys = testKeySet ?? keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer), { timeoutDuration: 3000 });
    keySets.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: settings.CF_ACCESS_AUD!.trim(), algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"], clockTolerance: 5,
    });
    const email = String(payload.email).trim().toLowerCase();
    if (email !== settings.JJ_LINKS_OWNER_EMAIL!.trim().toLowerCase()) throw new ApiError(403, "This dashboard is restricted to its owner.");
    return { userId: payload.sub!, email, displayName: email, fullName: null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Cloudflare Access could not verify this session. Sign in again.");
  }
}

export function withIdentity(request: Request, user: AppUser): Request {
  const headers = new Headers(request.headers);
  for (const key of [...headers.keys()]) {
    if (key.startsWith("jj-links-user-") || key.startsWith("oai-authenticated-") || key === "cf-access-jwt-assertion") headers.delete(key);
  }
  headers.set("jj-links-user-id", user.userId);
  headers.set("jj-links-user-email", user.email);
  return new Request(request, { headers });
}

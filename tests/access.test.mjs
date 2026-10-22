import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { runtime } from "./helpers/runtime.mjs";

const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...await exportJWK(publicKey), kid: "review-key", alg: "RS256" };
const keys = createLocalJWKSet({ keys: [jwk] });
const settings = { CF_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com", CF_ACCESS_AUD: "dashboard-audience", JJ_LINKS_OWNER_EMAIL: "owner@example.com" };
const sign = (claims = {}) => new SignJWT({ email: "owner@example.com", ...claims }).setProtectedHeader({ alg: "RS256", kid: "review-key" }).setSubject("owner-id").setIssuer("https://example.cloudflareaccess.com").setAudience("dashboard-audience").setIssuedAt().setExpirationTime("1h").sign(privateKey);

test("Access accepts the signed owner and rejects wrong email, issuer, audience, expiry and signature", async () => {
  const r = await runtime();
  try {
    const request = (token) => new Request("https://links.example.com/", { headers: { "Cf-Access-Jwt-Assertion": token } });
    assert.equal((await r.authenticateAccess(request(await sign()), settings, keys)).email, "owner@example.com");
    await assert.rejects(() => r.authenticateAccess(request("unsigned"), settings, keys), { status: 401 });
    await assert.rejects(async () => r.authenticateAccess(request(await sign({ email: "other@example.com" })), settings, keys), { status: 403 });
    for (const token of [
      await new SignJWT({ email: "owner@example.com" }).setProtectedHeader({ alg: "RS256", kid: "review-key" }).setSubject("owner-id").setIssuer("https://attacker.example.com").setAudience("dashboard-audience").setIssuedAt().setExpirationTime("1h").sign(privateKey),
      await new SignJWT({ email: "owner@example.com" }).setProtectedHeader({ alg: "RS256", kid: "review-key" }).setSubject("owner-id").setIssuer("https://example.cloudflareaccess.com").setAudience("another-app").setIssuedAt().setExpirationTime("1h").sign(privateKey),
      await new SignJWT({ email: "owner@example.com" }).setProtectedHeader({ alg: "RS256", kid: "review-key" }).setSubject("owner-id").setIssuer("https://example.cloudflareaccess.com").setAudience("dashboard-audience").setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey),
      await new SignJWT({ email: "owner@example.com" }).setProtectedHeader({ alg: "RS256", kid: "review-key" }).setSubject("owner-id").setIssuer("https://example.cloudflareaccess.com").setAudience("dashboard-audience").setIssuedAt().sign(privateKey),
    ]) await assert.rejects(() => r.authenticateAccess(request(token), settings, keys), { status: 401 });
    const token = await sign();
    const pieces = token.split("."); pieces[2] = (pieces[2][0] === "A" ? "B" : "A") + pieces[2].slice(1);
    await assert.rejects(() => r.authenticateAccess(request(pieces.join(".")), settings, keys), { status: 401 });
    assert.throws(() => r.accessIssuer("https://attacker.example.com"), { status: 503 });
    assert.throws(() => r.accessIssuer("example.cloudflareaccess.com@attacker.example.com"), { status: 503 });
  } finally { r.close(); }
});

test("production Worker protects assets and APIs, overwrites forged identity and fails closed before setup", async () => {
  const r = await runtime();
  const originalFetch = globalThis.fetch;
  try {
    const missing = await r.worker.fetch(new Request("https://links.example.com/api/dashboard"), r.env);
    assert.equal(missing.status, 503);
    Object.assign(r.env, settings, { ASSETS: { async fetch(request) { return new Response(request.headers.get("jj-links-user-email")); } } });
    globalThis.fetch = async (url) => {
      assert.equal(String(url), "https://example.cloudflareaccess.com/cdn-cgi/access/certs");
      return Response.json({ keys: [jwk] });
    };
    const forged = { "jj-links-user-id": "forged", "jj-links-user-email": "owner@example.com", "oai-authenticated-user-email": "owner@example.com" };
    for (const path of ["/", "/assets/dashboard.js", "/api/dashboard", "/api/export", "/api/connection"]) {
      assert.equal((await r.worker.fetch(new Request("https://links.example.com" + path, { headers: forged }), r.env)).status, 401);
    }
    const valid = await sign();
    const accepted = await r.worker.fetch(new Request("https://links.example.com/api/dashboard", { headers: { ...forged, "jj-links-user-email": "attacker@example.com", "Cf-Access-Jwt-Assertion": valid } }), r.env);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).data.inventory.length, 4);
    const asset = await r.worker.fetch(new Request("https://links.example.com/assets/dashboard.js", { headers: { "Cf-Access-Jwt-Assertion": valid } }), r.env);
    assert.equal(await asset.text(), "owner@example.com");
    assert.equal(asset.headers.get("cache-control"), "private, no-store");
    assert.match(asset.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  } finally { globalThis.fetch = originalFetch; r.close(); }
});

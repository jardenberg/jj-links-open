import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./helpers/runtime.mjs";

const sample = { id: "one", source_url: "go.example.com/demo", target_url: "https://example.com/old", status_code: 302, include_subdomains: true, subpath_matching: true, preserve_path_suffix: true, preserve_query_string: false, comment: "Keep this" };

test("owner check denies anonymous, other users and missing live configuration", async () => {
  const r = await runtime();
  try {
    const user = { userId: "owner", email: "owner@example.com" };
    assert.throws(() => r.authorizeOwner(null), { status: 401 });
    r.env.CLOUDFLARE_API_TOKEN = "test-only";
    assert.throws(() => r.authorizeOwner(user), { status: 503 });
    r.env.JJ_LINKS_OWNER_EMAIL = "OWNER@example.com";
    assert.equal(r.authorizeOwner(user), user);
    assert.throws(() => r.authorizeOwner({ ...user, email: "visitor@example.com" }), { status: 403 });
  } finally { r.close(); }
});

test("editing preserves all existing options and full reconciliation detects unrelated drift", async () => {
  const r = await runtime();
  try {
    const updated = r.updatedItem(sample, { host: "go.example.com", slug: "demo", targetUrl: "https://example.com/new" }, ["go.example.com"]);
    assert.equal(updated.status_code, 302);
    assert.equal(updated.subpath_matching, true);
    assert.equal(updated.include_subdomains, true);
    assert.equal(updated.preserve_path_suffix, true);
    assert.equal(updated.preserve_query_string, false);
    assert.equal(updated.comment, "Keep this");
    assert.ok(r.sameInventory([sample], [{ ...sample, id: "regenerated" }]));
    assert.equal(r.sameInventory([sample], [{ ...sample, comment: "unexpected change" }]), false);
    for (const slug of ["../x", "%2e%2e/x", "bad\\path", "x?y", "x#y"]) assert.throws(() => r.normalizeInput({ host: "go.example.com", slug, targetUrl: "https://example.com" }, ["go.example.com"]));
  } finally { r.close(); }
});

test("D1 serializes concurrent writes and replays success without executing twice", async () => {
  const r = await runtime();
  try {
    let release;
    const waiting = new Promise((resolve) => { release = resolve; });
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    let calls = 0;
    const result = { item: sample, operationId: "operation", verification: { state: "pending" } };
    const first = r.guardedWrite("one", "owner", { slug: "demo" }, async () => { calls++; started(); await waiting; return result; }, async () => null);
    await ready;
    const same = await r.guardedWrite("one", "owner", { slug: "demo" }, async () => { throw Error("must not run"); }, async () => null);
    assert.equal(same.outcome, "processing");
    await assert.rejects(() => r.guardedWrite("two", "owner", {}, async () => result, async () => null), { status: 409 });
    release();
    assert.equal((await first).outcome, "confirmed");
    const replay = await r.guardedWrite("one", "owner", { slug: "demo" }, async () => { calls++; return result; }, async () => null);
    assert.equal(replay.idempotent, true);
    assert.equal(replay.verification.state, "pending");
    assert.equal(calls, 1);
    await assert.rejects(() => r.guardedWrite("one", "owner", { slug: "different" }, async () => result, async () => null), { status: 409 });
  } finally { r.close(); }
});

test("uncertain submission retains the lock and is reconciled without another write", async () => {
  const r = await runtime();
  try {
    let writes = 0;
    const execute = async ({ prepare }) => { await prepare({ items: [sample], source: sample.source_url }); writes++; throw new Error("network interrupted"); };
    assert.equal((await r.guardedWrite("one", "owner", {}, execute, async () => null)).outcome, "processing");
    await assert.rejects(() => r.guardedWrite("two", "owner", {}, execute, async () => null), { status: 409 });
    const recovered = await r.guardedWrite("one", "owner", {}, execute, async () => ({ item: sample, operationId: "recovered", verification: { state: "verified" } }));
    assert.equal(recovered.outcome, "confirmed");
    assert.equal(writes, 1);
  } finally { r.close(); }
});

test("30-day totals exclude older and future rows while preserving stored history", async () => {
  const r = await runtime();
  try {
    const metric = (date, requests) => ({ date, requests, host: "go.example.com", path: "/demo", sourceUrl: "go.example.com/demo" });
    await r.saveDailyAnalytics([metric("2026-09-22", 500), metric("2026-09-23", 3), metric("2026-10-22", 4), metric("2026-10-23", 700)], "2026-10-22T12:00:00Z");
    const data = await r.readStoredAnalytics(30, new Date("2026-10-22T14:00:00Z"));
    assert.equal(data.byPath[0].requests, 7);
    assert.equal(data.daily.length, 2);
    assert.equal((await r.env.DB.prepare("SELECT COUNT(*) AS count FROM analytics_daily").first()).count, 4);
  } finally { r.close(); }
});

test("GraphQL uses its data envelope and counts temporary as well as permanent redirects", async () => {
  const r = await runtime();
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(r.env, { CLOUDFLARE_API_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_ZONE_ID: "zone", CLOUDFLARE_LIST_ID: "list", CLOUDFLARE_RULESET_ID: "ruleset" });
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).endsWith("/graphql"));
      assert.match(JSON.parse(init.body).query, /edgeResponseStatus_in: \[301, 302, 307, 308\]/);
      return Response.json({ data: { viewer: { zones: [{ daily: [{ count: 4, dimensions: { date: "2026-10-22", clientRequestHTTPHost: "go.example.com", clientRequestPath: "/demo" } }] }] } }, errors: null });
    };
    assert.equal((await r.getAnalytics()).daily[0].requests, 4);
    globalThis.fetch = async () => Response.json({ errors: [{ message: "not authorized" }] });
    await assert.rejects(() => r.getAnalytics(), /not authorized/);
  } finally { globalThis.fetch = originalFetch; r.close(); }
});

test("create and update APIs require identity and origin, preserve options, snapshot and replay writes", async () => {
  const r = await runtime();
  const originalFetch = globalThis.fetch;
  try {
    const hosts = r.sourceHosts();
    let items = [{ ...sample, source_url: hosts[0] + "/demo" }, { ...sample, id: "two", source_url: hosts[1] + "/other" }];
    let writes = 0;
    Object.assign(r.env, { CLOUDFLARE_API_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_ZONE_ID: "zone", CLOUDFLARE_LIST_ID: "list", CLOUDFLARE_RULESET_ID: "ruleset", JJ_LINKS_OWNER_EMAIL: "owner@example.com" });
    globalThis.fetch = async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (String(url).startsWith("https://api.cloudflare.com")) {
        if (init.method === "POST" || init.method === "PUT") {
          writes++;
          const added = JSON.parse(init.body).map(({ redirect, comment }, i) => ({ ...redirect, id: "written-" + i, comment }));
          items = init.method === "PUT" ? added : [...items, ...added];
          return Response.json({ success: true, result: { operation_id: "saved" } });
        }
        if (path.includes("/bulk_operations/")) return Response.json({ success: true, result: { status: "completed" } });
        if (path.endsWith("/items")) return Response.json({ success: true, result: items.map(({ id, comment, ...redirect }) => ({ id, comment, redirect })) });
        return Response.json({ success: true, result: { name: "test_redirects", num_items: items.length } });
      }
      const item = items.find((item) => "https://" + item.source_url === String(url));
      assert.ok(item, "probe uses configured source host only");
      return new Response(null, { status: item.status_code, headers: { Location: item.target_url } });
    };
    const createBody = { requestId: crypto.randomUUID(), host: hosts[0], slug: "new", targetUrl: "https://example.com/new" };
    const request = (body, method = "POST", origin = "https://links.example.com") => new Request("https://links.example.com/api/links", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await r.createRoute(request(createBody))).status, 401);
    r.signIn({ userId: "owner", email: "owner@example.com" });
    assert.equal((await r.createRoute(request(createBody, "POST", "https://attacker.example"))).status, 403);
    const created = await r.createRoute(request(createBody));
    assert.equal(created.status, 201);
    assert.equal((await created.json()).verification.state, "verified");
    assert.equal((await (await r.createRoute(request(createBody))).json()).idempotent, true);
    assert.equal(writes, 1);
    const updateBody = { requestId: crypto.randomUUID(), sourceUrl: hosts[0] + "/demo", host: hosts[0], slug: "demo", targetUrl: "https://example.com/updated", confirmedFullListReplacement: true };
    const updated = await r.updateRoute(request(updateBody, "PATCH"));
    assert.equal(updated.status, 200);
    const result = await updated.json();
    assert.equal(result.item.status_code, 302);
    assert.equal(result.item.subpath_matching, true);
    assert.equal(items.length, 3);
    assert.equal((await r.env.DB.prepare("SELECT COUNT(*) AS count FROM config_snapshots").first()).count, 1);
    assert.equal(writes, 2);
  } finally { globalThis.fetch = originalFetch; r.close(); }
});

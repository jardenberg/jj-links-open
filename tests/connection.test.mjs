import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./helpers/runtime.mjs";

test("connection selection checks enabled rules and domains, never writes Cloudflare, and respects pending writes", async () => {
  const r = await runtime();
  const originalFetch = globalThis.fetch;
  const listId = "a".repeat(32);
  const nextId = "b".repeat(32);
  let enabled = true;
  let host = "go.example.com";
  const methods = [];
  try {
    Object.assign(r.env, { CLOUDFLARE_API_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_ZONE_ID: "zone", JJ_LINKS_OWNER_EMAIL: "owner@example.com" });
    r.signIn({ userId: "owner", email: "owner@example.com" });
    globalThis.fetch = async (url, init = {}) => {
      methods.push(init.method ?? "GET");
      const path = new URL(url).pathname;
      let result;
      if (path.endsWith("/rules/lists")) result = [{ id: listId, name: "short_links", kind: "redirect", num_items: 1 }, { id: "ip", name: "ip_list", kind: "ip", num_items: 0 }];
      else if (path.endsWith("/entrypoint")) result = { id: "ruleset", rules: [{ enabled, action_parameters: { from_list: { name: "short_links" } } }] };
      else if (path.endsWith("/items")) result = [{ id: "one", redirect: { source_url: host + "/one", target_url: "https://example.com/", status_code: 301 } }];
      else result = { name: "short_links", kind: "redirect", num_items: 1 };
      return Response.json({ success: true, result });
    };
    const request = (id = listId, origin = "https://links.example.com") => new Request("https://links.example.com/api/connection", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const choices = await (await r.connectionGet(new Request("https://links.example.com/api/connection"))).json();
    assert.equal(choices.lists.length, 1);
    assert.equal((await r.connectionPost(request())).status, 200);
    assert.deepEqual(await r.connectionIds(), { listId, rulesetId: "ruleset" });
    assert.equal((await r.connectionPost(request(nextId, "https://attacker.example"))).status, 403);
    enabled = false;
    assert.equal((await r.connectionPost(request(nextId))).status, 400);
    enabled = true; host = "outside.example.com";
    assert.equal((await r.connectionPost(request(nextId))).status, 400);
    host = "go.example.com";
    await r.env.DB.prepare("INSERT INTO write_requests (id, actor_id, fingerprint, state, lock_key, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind("pending", "owner", "{}", "uncertain", "redirect-list", new Date().toISOString()).run();
    assert.equal((await r.connectionPost(request(nextId))).status, 409);
    assert.equal((await r.connectionIds()).listId, listId);
    await r.env.DB.prepare("UPDATE write_requests SET lock_key=NULL WHERE id='pending'").run();
    assert.equal((await r.connectionPost(request(nextId))).status, 200);
    assert.equal((await r.connectionIds()).listId, nextId);
    assert.ok(methods.every((method) => method === "GET"));
  } finally { globalThis.fetch = originalFetch; r.close(); }
});

import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./helpers/runtime.mjs";

const item = (source, target = "https://example.com/docs") => ({ id: source, source_url: source, target_url: target, status_code: 302, include_subdomains: false, subpath_matching: false, preserve_path_suffix: false, preserve_query_string: true, comment: "" });

test("CSV round-trips quotes, Unicode, newlines and options without silently dropping bad rows", async () => {
  const r = await runtime();
  try {
    const rows = [item("go.example.com/a"), { ...item("ai.example.com/b", "https://example.com"), comment: 'A note, with "quotes"\nAnd Unicode: åäö', subpath_matching: true, preserve_path_suffix: true }];
    const csv = r.exportRedirectCsv(rows);
    const parsed = r.readImportCsv("\uFEFF" + csv, ["go.example.com", "ai.example.com"]);
    assert.ok(r.sameInventory(rows, parsed));
    assert.throws(() => r.readImportCsv(csv + '"unclosed', ["go.example.com", "ai.example.com"]));
    assert.throws(() => r.readImportCsv(csv.replace('"302"', '"303"'), ["go.example.com", "ai.example.com"]), /status must/);
    assert.throws(() => r.readImportCsv(csv.replace("go.example.com/a", "attacker.example.com/a"), ["go.example.com", "ai.example.com"]), /configured short domains/);
    assert.throws(() => r.readImportCsv("name,total_clicks\ntest,3", ["go.example.com", "ai.example.com"]), /Analytics exports/);
    assert.throws(() => r.readImportCsv(r.exportRedirectCsv([item("go.example.com/a"), item("go.example.com/A")]), ["go.example.com", "ai.example.com"]), /duplicates or overlaps/);
    assert.throws(() => r.readImportCsv(r.exportRedirectCsv([{ ...item("go.example.com/a", "https://example.com/?fixed=1") }]), ["go.example.com", "ai.example.com"]), /fixed destination query/);
    const plan = r.planImport(rows, [{ ...rows[0], target_url: "https://example.com/changed" }], "merge");
    assert.equal(plan.items.length, 2);
    assert.equal(plan.counts.removed, 0);
    assert.equal(r.planImport(rows, [rows[0]], "restore").counts.removed, 1);
  } finally { r.close(); }
});

async function environment() {
  const r = await runtime();
  const originalFetch = globalThis.fetch;
  let items = [item("go.example.com/one"), item("ai.example.com/two")];
  let writes = 0;
  let loseReply = false;
  Object.assign(r.env, { CLOUDFLARE_API_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "account", CLOUDFLARE_ZONE_ID: "zone", CLOUDFLARE_LIST_ID: "list", CLOUDFLARE_RULESET_ID: "ruleset", JJ_LINKS_OWNER_EMAIL: "owner@example.com" });
  const user = { userId: "owner", email: "owner@example.com" };
  r.signIn(user);
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith("https://api.cloudflare.com")) {
      const path = new URL(url).pathname;
      if (init.method === "PUT") {
        writes++;
        items = JSON.parse(init.body).map(({ redirect, comment }, index) => ({ ...redirect, id: "saved-" + index, comment }));
        if (loseReply) { loseReply = false; throw Error("The response was lost after Cloudflare accepted the write."); }
        return Response.json({ success: true, result: { operation_id: "operation" } });
      }
      if (path.includes("/bulk_operations/")) return Response.json({ success: true, result: { status: "completed" } });
      if (path.endsWith("/items")) return Response.json({ success: true, result: items.map(({ id, comment, ...redirect }) => ({ id, comment, redirect })) });
      return Response.json({ success: true, result: { name: "redirects", num_items: items.length } });
    }
    const found = items.find((item) => "https://" + item.source_url === String(url));
    return found ? new Response(null, { status: found.status_code, headers: { Location: found.target_url } }) : new Response(null, { status: 404 });
  };
  return { r, user, get items() { return items; }, get writes() { return writes; }, loseNextReply() { loseReply = true; }, addExternal() { items.push(item("go.example.com/outside")); }, close() { globalThis.fetch = originalFetch; r.close(); } };
}

test("preview performs no writes; merge applies once, snapshots and exports the complete before-state", async () => {
  const fixture = await environment(); const { r, user } = fixture;
  try {
    const csv = r.exportRedirectCsv([item("go.example.com/new")]);
    const preview = await r.previewImport(user, csv, "merge");
    assert.equal(preview.counts.after, 3); assert.equal(fixture.writes, 0);
    const result = await r.applyImport(user, preview.id, "");
    assert.equal(result.outcome, "confirmed"); assert.equal(fixture.writes, 1);
    assert.equal(fixture.items.length, 3);
    // A refresh can recover even if the response was saved before preview bookkeeping.
    await r.env.DB.prepare("UPDATE import_previews SET state='processing' WHERE id=?").bind(preview.id).run();
    const resumed = await r.resumeImport(user, preview.id);
    assert.equal(resumed.state, "applied"); assert.equal(resumed.backupId, result.backupId);
    assert.equal(resumed.preview.counts.unchanged, 2);
    assert.equal((await r.env.DB.prepare("SELECT state FROM import_previews WHERE id=?").bind(preview.id).first()).state, "applied");
    await assert.rejects(() => r.resumeImport({ ...user, userId: "another" }, preview.id), { status: 404 });
    const replay = await r.applyImport(user, preview.id, "");
    assert.equal(replay.idempotent, true); assert.equal(fixture.writes, 1);
    const backup = await r.exportRoute(new Request("https://links.example.com/api/export?backup=" + result.backupId));
    assert.equal(backup.status, 200);
    assert.equal(r.readImportCsv(await backup.text(), ["go.example.com", "ai.example.com"]).length, 2);
    const checked = await r.verifyImport(user, preview.id, 0);
    assert.equal(checked.verified, 1); assert.equal(checked.nextOffset, null);
    await assert.rejects(() => r.applyImport({ ...user, userId: "another" }, preview.id, ""), { status: 404 });
  } finally { fixture.close(); }
});

test("a list selection racing lock acquisition cannot apply a preview to a different list", async () => {
  const fixture = await environment(); const { r, user } = fixture;
  try {
    const preview = await r.previewImport(user, r.exportRedirectCsv([item("go.example.com/new")]), "merge");
    const prepare = r.env.DB.prepare.bind(r.env.DB);
    r.env.DB.prepare = (sql) => {
      const statement = prepare(sql);
      if (sql.startsWith("INSERT INTO write_requests")) {
        const run = statement.run.bind(statement);
        statement.run = async () => { r.env.CLOUDFLARE_LIST_ID = "switched-after-first-check"; return run(); };
      }
      return statement;
    };
    await assert.rejects(() => r.applyImport(user, preview.id, ""), /another redirect list/);
    assert.equal(fixture.writes, 0);
  } finally { fixture.close(); }
});

test("resume recognizes a write claimed just before preview-state bookkeeping", async () => {
  const fixture = await environment(); const { r, user } = fixture;
  try {
    const preview = await r.previewImport(user, r.exportRedirectCsv([item("go.example.com/new")]), "merge");
    await r.env.DB.prepare("INSERT INTO write_requests (id, actor_id, fingerprint, state, lock_key, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(preview.id, user.userId, JSON.stringify({ action: "import", previewId: preview.id }), "processing", "redirect-list", new Date().toISOString()).run();
    assert.equal((await r.resumeImport(user, preview.id)).state, "processing");
    assert.equal((await r.applyImport(user, preview.id, "")).outcome, "processing");
    assert.equal(fixture.writes, 0);
  } finally { fixture.close(); }
});

test("an interrupted bulk submission reconciles its complete readback and backup without writing again", async () => {
  const fixture = await environment(); const { r, user } = fixture;
  try {
    const preview = await r.previewImport(user, r.exportRedirectCsv([item("go.example.com/new")]), "merge");
    fixture.loseNextReply();
    assert.equal((await r.applyImport(user, preview.id, "")).outcome, "processing");
    assert.equal((await r.resumeImport(user, preview.id)).state, "uncertain");
    assert.equal((await r.env.DB.prepare("SELECT count(*) AS n FROM write_requests WHERE lock_key='redirect-list'").first()).n, 1);
    const recovered = await r.applyImport(user, preview.id, "");
    assert.equal(recovered.outcome, "confirmed");
    assert.equal(fixture.writes, 1);
    assert.equal((await r.resumeImport(user, preview.id)).backupId, recovered.backupId);
    const backup = await r.exportRoute(new Request("https://links.example.com/api/export?backup=" + recovered.backupId));
    assert.equal(r.readImportCsv(await backup.text(), ["go.example.com", "ai.example.com"]).length, 2);
  } finally { fixture.close(); }
});

test("the complete stored preview stays below D1's row limit", async () => {
  const fixture = await environment(); const { r, user } = fixture;
  try {
    const rows = Array.from({ length: 300 }, (_, i) => item(`go.example.com/long-${i}`, "https://example.com/" + "a".repeat(3000)));
    const csv = r.exportRedirectCsv(rows);
    assert.ok(new TextEncoder().encode(csv).length < 1_000_000);
    await assert.rejects(() => r.previewImport(user, csv, "merge"), { status: 413 });
    assert.equal(fixture.writes, 0);
    assert.equal((await r.env.DB.prepare("SELECT count(*) AS n FROM import_previews").first()).n, 0);
  } finally { fixture.close(); }
});

test("restore requires a typed count, stale or expired previews cannot write, and list selection is pinned", async () => {
  const fixture = await environment(); const { r, user } = fixture;
  try {
    const csv = r.exportRedirectCsv([item("go.example.com/one")]);
    const preview = await r.previewImport(user, csv, "restore");
    await assert.rejects(() => r.applyImport(user, preview.id, ""), { status: 400 });
    assert.equal(fixture.writes, 0);
    r.env.CLOUDFLARE_LIST_ID = "another-list";
    await assert.rejects(() => r.applyImport(user, preview.id, "RESTORE 2"), /another redirect list/);
    r.env.CLOUDFLARE_LIST_ID = "list";
    fixture.addExternal();
    await assert.rejects(() => r.applyImport(user, preview.id, "RESTORE 2"), /changed after this preview/);
    assert.equal(fixture.writes, 0);
    const fresh = await r.previewImport(user, csv, "restore");
    await r.env.DB.prepare("UPDATE import_previews SET expires_at=? WHERE id=?").bind("2000-01-01T00:00:00Z", fresh.id).run();
    await assert.rejects(() => r.applyImport(user, fresh.id, "RESTORE 3"), /expired/);
    const final = await r.previewImport(user, csv, "restore");
    assert.equal((await r.applyImport(user, final.id, "RESTORE 3")).outcome, "confirmed");
    assert.equal(fixture.items.length, 1);
  } finally { fixture.close(); }
});

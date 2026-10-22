import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("bundled sample redirects are synthetic and collision-free", async () => {
  const csv = await readFile(new URL("data/redirects.csv", root), "utf8");
  const lines = csv.trim().split(/\r?\n/);
  assert.equal(lines.length, 5);
  const sources = lines.slice(1).map((line) => line.match(/^"([^"]+)"/)?.[1]).filter(Boolean);
  assert.equal(new Set(sources.map((source) => source.toLowerCase())).size, 4);
  assert.ok(sources.every((source) => /^(go|ai)\.example\.com\//.test(source)));
});

test("legacy history fixture is explicitly synthetic", async () => {
  const payload = JSON.parse(await readFile(new URL("data/legacy-history.json", root), "utf8"));
  assert.equal(payload.provider, "Example legacy provider");
  assert.equal(payload.captured_from, "Synthetic sample data");
  assert.equal(payload.links.length, 2);
});

test("release surfaces agree on version", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const versionSource = await readFile(new URL("lib/version.ts", root), "utf8");
  const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
  assert.equal(packageJson.version, "1.0.0");
  assert.match(versionSource, /APP_VERSION = "1\.0\.0"/);
  assert.match(changelog, /\[1\.0\.0\] - 2026-10-22/);
});

test("overview headline matches the released copy", async () => {
  const dashboard = await readFile(new URL("components/dashboard.tsx", root), "utf8");
  assert.match(dashboard, />So many links, one single dashboard<\/h1>/);
});

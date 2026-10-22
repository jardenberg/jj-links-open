import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort()) sqlite.exec(readFileSync(resolve("drizzle", file), "utf8"));
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...parameters) { values = parameters; return this; },
        async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values), success: true }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

export async function runtime() {
  const id = crypto.randomUUID();
  const fixture = { env: { DB: database() }, user: null };
  globalThis[id] = fixture;
  const output = await build({
    stdin: { contents: 'export * from "./lib/owner"; export * from "./lib/write-guard"; export * from "./lib/cloudflare"; export * from "./lib/store"; export * from "./lib/redirect-model"; export * from "./lib/errors"; export * from "./lib/runtime-config"; export { POST as createRoute } from "./app/api/links/route"; export { PATCH as updateRoute } from "./app/api/links/update/route";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{
      name: "test-runtime",
      setup(build) {
        build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const env = globalThis[' + JSON.stringify(id) + '].env;' }));
        build.onResolve({ filter: /^next\/headers$/ }, () => ({ path: "headers", namespace: "identity" }));
        build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "identity" }));
        build.onLoad({ filter: /.*/, namespace: "identity" }, ({ path }) => ({ contents: path === "headers"
          ? 'export async function headers() { const u=globalThis[' + JSON.stringify(id) + '].user; return new Headers(u ? {"oai-authenticated-user-id":u.userId,"oai-authenticated-user-email":u.email} : {}); }'
          : 'export function redirect() { throw Error("sign in required"); }' }));
      },
    }],
  });
  const loaded = await import("data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64"));
  return { ...loaded, env: fixture.env, signIn(user) { fixture.user = user; }, close() { fixture.env.DB.sqlite.close(); delete globalThis[id]; } };
}

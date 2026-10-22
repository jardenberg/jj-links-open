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
    stdin: { contents: `
      export * from "./lib/owner";
      export * from "./lib/write-guard";
      export * from "./lib/cloudflare";
      export * from "./lib/store";
      export * from "./lib/redirect-model";
      export * from "./lib/errors";
      export * from "./lib/runtime-config";
      export * from "./lib/import-plan";
      export * from "./lib/import-service";
      export * from "./lib/csv";
      export * from "./lib/access";
      export * from "./lib/connection";
      export { default as worker } from "./worker/index";
      export { POST as createRoute } from "./app/api/links/route";
      export { PATCH as updateRoute } from "./app/api/links/update/route";
      export { POST as importRoute } from "./app/api/import/route";
      export { GET as exportRoute } from "./app/api/export/route";
      export { GET as connectionGet, POST as connectionPost } from "./app/api/connection/route";
    `, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node",
    define: { "import.meta.env.DEV": "false" },
    plugins: [{
      name: "test-runtime",
      setup(build) {
        build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const env = globalThis[' + JSON.stringify(id) + '].env;' }));
        build.onResolve({ filter: /\.csv\?raw$/ }, ({ path, resolveDir }) => ({ path: resolve(resolveDir, path.replace("?raw", "")), namespace: "raw" }));
        build.onLoad({ filter: /.*/, namespace: "raw" }, ({ path }) => ({ contents: "export default " + JSON.stringify(readFileSync(path, "utf8")) }));
      },
    }],
  });
  const loaded = await import("data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64"));
  const trusted = (request) => {
    if (!fixture.user) return request;
    const headers = new Headers(request.headers);
    headers.set("jj-links-user-id", fixture.user.userId);
    headers.set("jj-links-user-email", fixture.user.email);
    return new Request(request, { headers });
  };
  return { ...loaded, env: fixture.env,
    createRoute: (request) => loaded.createRoute(trusted(request)),
    updateRoute: (request) => loaded.updateRoute(trusted(request)),
    importRoute: (request) => loaded.importRoute(trusted(request)),
    exportRoute: (request) => loaded.exportRoute(trusted(request)),
    connectionGet: (request) => loaded.connectionGet(trusted(request)),
    connectionPost: (request) => loaded.connectionPost(trusted(request)),
    signIn(user) { fixture.user = user; }, close() { fixture.env.DB.sqlite.close(); delete globalThis[id]; } };
}

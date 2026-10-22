import { parseCsv } from "./csv";
import { canonical, sourceUrl } from "./redirect-model";
import { ApiError } from "./errors";
import type { RedirectItem } from "./types";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_LIST_ITEMS = 1000;
export type ImportMode = "merge" | "restore";
export type Change = { source: string; kind: "added" | "changed" | "removed" | "unchanged"; before?: RedirectItem; after?: RedirectItem };

export function readImportCsv(text: string, hosts: string[]): RedirectItem[] {
  if (new TextEncoder().encode(text).length > 1_000_000) throw new ApiError(413, "Choose a CSV smaller than 1 MB.");
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.length));
  const header = rows.shift()?.map((value) => value.trim().toLowerCase().replaceAll(" ", "_"));
  if (!header || !["source_url", "target_url", "status_code"].every((name) => header.includes(name))) throw new ApiError(400, "Use a redirect configuration CSV with source_url, target_url and status_code columns. Analytics exports are not redirect backups.");
  if (new Set(header).size !== header.length) throw new ApiError(400, "CSV contains duplicate column names.");
  if (!rows.length || rows.length > MAX_IMPORT_ROWS) throw new ApiError(400, `Import between 1 and ${MAX_IMPORT_ROWS} redirects at a time.`);
  const sources = new Set<string>();
  return rows.map((row, index) => {
    const fail = (message: string): never => { throw new ApiError(400, `Row ${index + 2}: ${message}`); };
    if (row.length !== header.length) return fail("column count does not match the header.");
    const record = Object.fromEntries(header.map((key, index) => [key, row[index]]));
    const source = record.source_url.trim();
    let parsed: URL;
    let target: URL;
    try { parsed = sourceUrl(source); target = new URL(record.target_url.trim()); } catch { return fail("source and destination must be valid URLs."); }
    if (!hosts.includes(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || !/^https?:$/.test(parsed.protocol)) return fail("source must be on one of your configured short domains, without a query or credentials.");
    const expectedSource = /^https?:\/\//i.test(source) ? parsed.origin + parsed.pathname : parsed.host + parsed.pathname;
    if (/[\\\s\x00-\x1f]/.test(source) || (source !== expectedSource && !(parsed.pathname === "/" && source + "/" === expectedSource))) return fail("use an already encoded source path without dot segments.");
    if (!/^https?:$/.test(target.protocol) || target.username || target.password) return fail("destination must use HTTP(S) without embedded credentials.");
    if (parsed.host === target.host && parsed.pathname.replace(/\/$/, "") === target.pathname.replace(/\/$/, "")) return fail("redirect cannot point to itself.");
    const key = (parsed.host + parsed.pathname).toLowerCase();
    if (sources.has(key)) return fail("source duplicates or overlaps another row.");
    sources.add(key);
    const status = Number(record.status_code);
    if (![301, 302, 307, 308].includes(status)) return fail("status must be 301, 302, 307 or 308.");
    const boolean = (name: string, fallback = false) => {
      const value = record[name]?.trim().toLowerCase();
      if (!value) return fallback;
      if (!["true", "false"].includes(value)) return fail(`${name} must be true or false.`);
      return value === "true";
    };
    const preserve = boolean("preserve_query_string", !target.search);
    if (preserve && target.search) return fail("preserving an incoming query would discard the fixed destination query.");
    const comment = record.comment ?? "";
    if (source.length > 2300 || target.toString().length > 4000 || comment.length > 500) return fail("source, destination or comment is too long.");
    return { id: "", source_url: source, target_url: record.target_url.trim(), status_code: status, include_subdomains: boolean("include_subdomains"), subpath_matching: boolean("subpath_matching"), preserve_path_suffix: boolean("preserve_path_suffix"), preserve_query_string: preserve, comment };
  });
}

export function planImport(before: RedirectItem[], incoming: RedirectItem[], mode: ImportMode) {
  if (before.length > MAX_LIST_ITEMS) throw new ApiError(400, `This first import workflow supports lists of up to ${MAX_LIST_ITEMS} items.`);
  const candidates = mode === "restore" ? [] : [...before];
  const changes: Change[] = [];
  const key = (source: string) => { const url = sourceUrl(source); return (url.host + url.pathname).toLowerCase(); };
  const beforeMap = new Map(before.map((item) => [key(item.source_url), item]));
  const seen = new Set<string>();
  for (const item of incoming) {
    const match = beforeMap.get(key(item.source_url));
    if (match && match.source_url !== item.source_url) throw new ApiError(409, `Source ${item.source_url} overlaps an existing case or scheme variant. Use its exact existing spelling.`);
    seen.add(item.source_url);
    const kind = !match ? "added" : JSON.stringify(canonical(match)) === JSON.stringify(canonical(item)) ? "unchanged" : "changed";
    changes.push({ source: item.source_url, kind, before: match, after: item });
    if (mode === "restore") candidates.push(item);
    else if (match) candidates[candidates.indexOf(match)] = item;
    else candidates.push(item);
  }
  if (mode === "restore") for (const item of before) if (!seen.has(item.source_url)) changes.push({ source: item.source_url, kind: "removed", before: item });
  if (candidates.length > MAX_LIST_ITEMS) throw new ApiError(400, `The resulting list would exceed this workflow's ${MAX_LIST_ITEMS}-item limit.`);
  return { items: candidates, changes, counts: {
    added: changes.filter((x) => x.kind === "added").length, changed: changes.filter((x) => x.kind === "changed").length,
    removed: changes.filter((x) => x.kind === "removed").length,
    unchanged: mode === "merge" ? candidates.length - changes.filter((x) => ["added", "changed"].includes(x.kind)).length : changes.filter((x) => x.kind === "unchanged").length,
    before: before.length, after: candidates.length,
  } };
}

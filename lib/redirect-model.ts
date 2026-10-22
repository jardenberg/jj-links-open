import type { RedirectItem, RedirectInput } from "./types";
import { ApiError } from "./errors";

export function sourceUrl(source: string): URL {
  return new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
}

export function metricKey(source: string): string {
  const url = sourceUrl(source);
  return `${url.host}${url.pathname}`.toLowerCase();
}

export function canonical(item: RedirectItem) {
  return {
    source_url: item.source_url,
    target_url: item.target_url,
    status_code: item.status_code,
    include_subdomains: item.include_subdomains,
    subpath_matching: item.subpath_matching,
    preserve_path_suffix: item.preserve_path_suffix,
    preserve_query_string: item.preserve_query_string,
    comment: item.comment,
  };
}

export function sameInventory(actual: RedirectItem[], expected: RedirectItem[]): boolean {
  const serialize = (items: RedirectItem[]) => JSON.stringify(items.map(canonical).sort((a, b) => a.source_url.localeCompare(b.source_url)));
  return serialize(actual) === serialize(expected);
}

export function normalizeInput(input: RedirectInput, hosts: string[], allowRoot = false): RedirectItem {
  const host = input.host.trim().toLowerCase();
  if (!hosts.includes(host)) throw new ApiError(400, "Source host is not configured.");
  const slug = input.slug.trim().replace(/^\/+/, "");
  if ((!slug && !allowRoot) || /[?#\\\s\x00-\x1f\x7f]/.test(slug)) throw new ApiError(400, "Enter a path without spaces, a query, fragment or backslash.");
  const parsed = new URL(`https://${host}/${slug}`);
  if (parsed.host !== host || parsed.pathname !== `/${slug}`) throw new ApiError(400, "Use an already encoded path without dot segments.");
  const target = new URL(input.targetUrl);
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) throw new ApiError(400, "Destination must be an HTTP(S) URL without embedded credentials.");
  if (target.host.toLowerCase() === host && target.pathname.replace(/\/$/, "") === parsed.pathname.replace(/\/$/, "")) throw new ApiError(400, "A redirect cannot point to itself.");
  if (input.preserveQueryString && target.search) throw new ApiError(400, "Incoming query parameters cannot replace a fixed destination query.");
  return {
    id: "", source_url: `${host}/${slug}`, target_url: target.toString(),
    status_code: input.statusCode ?? 301,
    include_subdomains: false, subpath_matching: false, preserve_path_suffix: false,
    preserve_query_string: input.preserveQueryString ?? !target.search,
    comment: input.comment?.trim() ?? "",
  };
}

export function updatedItem(before: RedirectItem, input: RedirectInput, hosts: string[]) {
  const normalized = normalizeInput(input, hosts, true);
  const beforeUrl = sourceUrl(before.source_url);
  if (`${beforeUrl.host}${beforeUrl.pathname}` !== normalized.source_url) throw new ApiError(400, "Changing the source path is not supported. Create a new redirect instead.");
  return {
    ...before,
    target_url: normalized.target_url,
    status_code: input.statusCode ?? before.status_code,
    preserve_query_string: input.preserveQueryString ?? (new URL(normalized.target_url).search ? false : before.preserve_query_string),
    comment: input.comment === undefined ? before.comment : normalized.comment,
  };
}

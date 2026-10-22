import type { RedirectItem } from "./types";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

export function parseRedirectCsv(text: string): RedirectItem[] {
  const [headers, ...rows] = parseCsv(text);
  return rows.filter((row) => row.length === headers.length).map((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    return {
      id: record.id,
      source_url: record.source_url,
      target_url: record.target_url,
      status_code: Number(record.status_code),
      include_subdomains: record.include_subdomains === "true",
      subpath_matching: record.subpath_matching === "true",
      preserve_path_suffix: record.preserve_path_suffix === "true",
      preserve_query_string: record.preserve_query_string === "true",
      comment: record.comment ?? "",
    };
  });
}

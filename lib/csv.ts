import type { RedirectItem } from "./types";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error("Unexpected quote in CSV field.");
      quoted = true;
    } else if (char === ",") { row.push(field); field = ""; closed = false; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; closed = false; }
    else if (char === "\r" && text[index + 1] === "\n") { continue; }
    else {
      if (closed) throw new Error("Unexpected text after a quoted CSV field.");
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (field.length || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}

export function exportRedirectCsv(items: RedirectItem[]): string {
  const fields = ["source_url", "target_url", "status_code", "include_subdomains", "subpath_matching", "preserve_path_suffix", "preserve_query_string", "comment"] as const;
  const quote = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  return [fields.map(quote).join(","), ...items.map((item) => fields.map((field) => quote(item[field])).join(","))].join("\r\n") + "\r\n";
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

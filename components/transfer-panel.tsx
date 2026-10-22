import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "./use-modal-focus";
import { Download, Upload, X, RefreshCw, Check } from "lucide-react";
import type { Change, ImportMode } from "../lib/import-plan";

type Preview = {
  id: string | null; sample: boolean; changes: Change[];
  counts: { added: number; changed: number; removed: number; unchanged: number; before: number; after: number };
};
type Checks = { checked: number; total: number; verified: number };

function changeDetails(change: Change) {
  if (!change.after) return "";
  const fields = { status_code: "Status", preserve_query_string: "Incoming query", include_subdomains: "Subdomains", subpath_matching: "Subpaths", preserve_path_suffix: "Path suffix", comment: "Note" } as const;
  return Object.entries(fields).filter(([key]) => !change.before || change.before[key as keyof typeof fields] !== change.after![key as keyof typeof fields])
    .map(([key, label]) => `${label}: ${change.before ? String(change.before[key as keyof typeof fields]) + " → " : ""}${String(change.after![key as keyof typeof fields])}`).join(" · ");
}

export function TransferPanel({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [backupId, setBackupId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Checks | null>(null);
  const inFlight = useRef(false);
  const stopChecks = useRef(false);
  const dialog = useRef<HTMLElement | null>(null);
  const storageKey = "jj-links-import";

  useEffect(() => {
    const id = sessionStorage.getItem(storageKey);
    if (!id) return;
    void api<{ preview: Preview & { mode: ImportMode }; state: string; backupId?: string }>({ action: "resume", id }).then((result) => {
      setPreview(result.preview); setMode(result.preview.mode);
      if (result.state === "applied") { setApplied(true); setBackupId(result.backupId ?? null); setMessage("Your previous import was saved. You can resume its public checks or download the backup."); }
      else if (["processing", "uncertain"].includes(result.state)) { setProcessing(true); setReviewed(true); setConfirmation(result.preview.mode === "restore" ? `RESTORE ${result.preview.counts.before}` : ""); setMessage("An earlier import is awaiting confirmation. Check its saved status before starting another."); }
      else if (result.state === "failed") { sessionStorage.removeItem(storageKey); setError("The previous import stopped before saving. Create a new preview."); }
    }).catch((error) => setError(error.message));
  }, []);

  async function api<T>(body: unknown): Promise<T> {
    const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as T & { ok: boolean; error?: string };
    if (!payload.ok) throw Error(payload.error || "The request could not be completed.");
    return payload;
  }
  async function action(run: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await run(); } catch (error) { setError(error instanceof Error ? error.message : "Request failed."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function verify(id: string) {
    stopChecks.current = false;
    let offset: number | null = 0;
    do {
      const result: Checks & { nextOffset: number | null } = await api({ action: "verify", id, offset });
      setChecks(result);
      offset = result.nextOffset;
    } while (offset !== null && !stopChecks.current);
  }
  async function apply() {
    if (!preview?.id) return;
    sessionStorage.setItem(storageKey, preview.id);
    const result = await api<{ outcome: string; message?: string; backupId?: string }>({ action: "apply", id: preview.id, confirmation });
    if (result.outcome === "processing") {
      setProcessing(true); setMessage(result.message ?? "Checking the saved configuration. Use Check saved status again."); return;
    }
    setProcessing(false); setApplied(true); setBackupId(result.backupId ?? null);
    setMessage("Cloudflare confirmed the complete list. Checking public redirects…");
    try { await verify(preview.id); }
    catch { setMessage("Your configuration was saved. Public checks can be retried below."); return; }
    setMessage("Your configuration is saved. Edge checks are shown below; pending checks do not mean the import failed.");
  }
  const changes = preview?.changes.filter((change) => change.kind !== "unchanged") ?? [];
  const requiresPhrase = mode === "restore" ? `RESTORE ${preview?.counts.before ?? 0}` : "";
  const canApply = preview?.id && !preview.sample && reviewed && (mode !== "restore" || confirmation === requiresPhrase);
  const close = () => {
    if (busy) return;
    if (applied) { sessionStorage.removeItem(storageKey); void onDone("CSV configuration saved in Cloudflare"); }
    else onClose();
  };
  useModalFocus(dialog, close, busy);

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" onClick={close}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Import and export redirects" className="my-6 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#151517] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Your links, portable</p><h2 className="mt-1 text-2xl font-semibold">Import, export and restore</h2></div><button className="icon-button" aria-label="Close transfer panel" disabled={busy} onClick={close}><X className="size-4"/></button></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><a href="/api/export" className="button-quiet"><Download className="size-4"/>Download current CSV</a><p className="text-xs text-white/40">Keep backups private. They contain your full destinations and notes.</p></div>
      {!applied && <div className="mt-6 space-y-4">
        <label className="form-label">Choose a configuration CSV<input aria-label="Configuration CSV" type="file" accept=".csv,text/csv" disabled={busy || processing} className="form-input mt-2" onChange={(event) => {
          const file = event.target.files?.[0]; if (!file) return;
          if (file.size > 1_000_000) { setError("Choose a CSV smaller than 1 MB."); return; }
          void file.text().then((text) => { setCsv(text); setFilename(file.name); setPreview(null); setReviewed(false); setError(null); });
        }}/></label>
        <label className="form-label">Import behavior<select value={mode} disabled={busy || processing} onChange={(event) => { setMode(event.target.value as ImportMode); setPreview(null); setReviewed(false); setConfirmation(""); }} className="form-input mt-2">
          <option value="merge">Merge: add or update; keep links missing from the CSV</option>
          <option value="restore">Restore: replace the whole list with this CSV</option>
        </select></label>
        <p className="text-xs leading-relaxed text-white/40">Up to 1,000 redirects and a 1 MB CSV. Analytics exports cannot be used as configuration backups. CSV files are text backups; when opening one in a spreadsheet, import its columns as text.</p>
        <button className="button-quiet" disabled={!csv || busy || processing} onClick={() => void action(async () => {
          const result = await api<Preview>({ action: "preview", csv, mode }); sessionStorage.removeItem(storageKey); setPreview(result); setReviewed(false); setMessage(null);
        })}><Upload className="size-4"/>{busy ? "Preparing…" : `Preview ${filename || "CSV"}`}</button>
      </div>}
      {preview && <div className="mt-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["added", "changed", "removed", "unchanged"] as const).map((kind) => <div key={kind} className="rounded-xl border border-white/10 p-3"><p className="text-xs capitalize text-white/40">{kind}</p><p className="mt-1 text-2xl font-semibold">{preview.counts[kind]}</p></div>)}</div>
        <p className="mt-3 text-sm text-white/55">{preview.counts.before} current links → {preview.counts.after} after import.</p>
        {preview.sample && <p className="mt-3 rounded-xl border border-amber-300/20 p-3 text-sm text-amber-100/80">Sample preview only. Connect your Cloudflare account before applying changes.</p>}
        {changes.length > 0 && <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-white/10"><table className="link-table"><thead><tr><th>Change</th><th>Short URL</th><th>Destination after import</th></tr></thead><tbody>{changes.map((change) => <tr key={change.source}><td className={change.kind === "removed" ? "text-red-300" : ""}>{change.kind}</td><td className="break-all">{change.source}</td><td className="break-all">{change.before && <p className="text-xs text-white/35">Before: {change.before.target_url}</p>}<p>{change.after?.target_url ?? "Removed"}</p>{change.after && <p className="mt-1 text-xs text-white/45">{changeDetails(change)}</p>}</td></tr>)}</tbody></table></div>}
        {!applied && changes.length > 0 && <div className="mt-4 space-y-4 rounded-xl border border-white/10 p-4">
          <p className="text-xs leading-relaxed text-white/45">Applying this preview saves a complete rollback snapshot, then replaces the Cloudflare list with the reviewed result. If the live list changed meanwhile, the import stops for a new preview.</p>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" disabled={busy || processing} checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 accent-[#ff5e46]"/>I reviewed all proposed changes, including removals.</label>
          {mode === "restore" && <label className="form-label">Type {requiresPhrase} to confirm replacement<input className="form-input mt-2" disabled={busy || processing} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></label>}
          <button className="button-primary" disabled={!canApply || busy} onClick={() => void action(apply)}>{busy ? <RefreshCw className="size-4 animate-spin"/> : <Check className="size-4"/>}{processing ? "Check saved status" : busy ? "Working…" : "Apply reviewed changes"}</button>
        </div>}
        {!changes.length && <p className="mt-4 text-sm text-emerald-200/75">The CSV matches the current configuration. There is nothing to change.</p>}
      </div>}
      {message && <p role="status" className="mt-4 rounded-xl border border-white/10 p-4 text-sm text-white/65">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 p-4 text-sm text-red-200">{error}</p>}
      {checks && <p className="mt-4 text-sm">{checks.verified} of {checks.total} public changes verified; {checks.total - checks.verified} pending.</p>}
      {applied && <div className="mt-5 flex flex-wrap gap-3">
        {busy && <button className="button-quiet" onClick={() => { stopChecks.current = true; }}>Stop public checks</button>}
        {backupId && <a href={`/api/export?backup=${encodeURIComponent(backupId)}`} className="button-quiet"><Download className="size-4"/>Download pre-import backup</a>}
        {preview?.id && <button className="button-quiet" disabled={busy} onClick={() => void action(() => verify(preview.id!))}>Retry public checks</button>}
        <button className="button-primary" disabled={busy} onClick={close}>Done</button>
      </div>}
    </section>
  </div>;
}

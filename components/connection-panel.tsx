import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "./use-modal-focus";
import { X, Cloud, RefreshCw } from "lucide-react";

type Choices = { ok: boolean; missing: string[]; lists: Array<{ id: string; name: string; count: number }>; error?: string };
export function ConnectionPanel({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [data, setData] = useState<Choices | null>(null);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  useModalFocus(dialog, onClose, busy);
  useEffect(() => {
    let alive = true;
    fetch("/api/connection").then(async (response) => {
      const data = await response.json() as Choices;
      if (!data.ok) throw Error(data.error || "Could not load Cloudflare lists.");
      if (alive) setData(data);
    }).catch((error) => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  async function connect() {
    if (busy || !id) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const body = await response.json() as { ok: boolean; error?: string };
      if (!body.ok) throw Error(body.error || "Connection could not be saved.");
      await onDone("Cloudflare redirect list connected");
    } catch (error) { setError(error instanceof Error ? error.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Connect Cloudflare" className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#151517] p-6" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between"><div><p className="eyebrow">One account, your links</p><h2 className="mt-1 text-2xl font-semibold">Connect Cloudflare</h2></div><button aria-label="Close connection panel" className="icon-button" disabled={busy} onClick={onClose}><X className="size-4"/></button></div>
      <p className="mt-4 text-sm leading-relaxed text-white/50">Choose an existing Bulk Redirect List for your two short domains. Connecting it reads its configuration; it does not change DNS or import any links.</p>
      {data?.missing.length ? <div className="mt-5 rounded-xl border border-amber-200/20 p-4 text-sm">
        <p>Add these values in Cloudflare → Workers &amp; Pages → your Worker → Settings → Variables and Secrets:</p>
        <ul className="mt-3 space-y-1">{data.missing.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
        <p className="mt-3 text-white/45">Store the API token as a secret. Account ID and Zone ID are shown on your domain's Cloudflare overview page. Your AI assistant can help find them.</p>
        <a className="button-quiet mt-4" href="https://github.com/jardenberg/jj-links-open/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noreferrer">Open setup guide</a>
      </div> : data && <div className="mt-5 space-y-4">
        <label className="form-label">Redirect list<select className="form-input mt-2" value={id} onChange={(event) => setId(event.target.value)} disabled={busy}><option value="">Choose your list…</option>{data.lists.map((list) => <option key={list.id} value={list.id}>{list.name} · {list.count} links</option>)}</select></label>
        {!data.lists.length && <p className="text-sm text-white/50">No Bulk Redirect Lists were found. Create a list and enable its Bulk Redirect Rule in Cloudflare first, then reopen this panel.</p>}
        <button className="button-primary" disabled={!id || busy} onClick={() => void connect()}>{busy ? <RefreshCw className="size-4 animate-spin"/> : <Cloud className="size-4"/>}{busy ? "Checking…" : "Connect selected list"}</button>
      </div>}
      {!data && !error && <p className="mt-5 text-white/40">Loading your lists…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
    </section>
  </div>;
}

"use client";

import { useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, BarChart3, Check, ChevronRight, CircleAlert,
  Cloud, Copy, Database, ExternalLink, Link2, ListFilter, Plus, RefreshCw,
  Search, Settings2, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardPayload, RedirectItem } from "../lib/types";

type Tab = "overview" | "links" | "system";

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortDate(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }).format(date);
}

function targetHost(url: string) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}

function sourceParts(source: string) {
  const slash = source.indexOf("/");
  return { host: slash >= 0 ? source.slice(0, slash) : source, path: slash >= 0 ? source.slice(slash) : "/" };
}

export function Dashboard({ initialData, displayName }: { initialData: DashboardPayload; displayName: string }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [hostFilter, setHostFilter] = useState("all");
  const [selected, setSelected] = useState<RedirectItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const requestMap = useMemo(() => new Map(data.byPath.map((row) => [row.sourceUrl.toLowerCase(), row.requests])), [data.byPath]);
  const historyMap = useMemo(() => new Map(data.historical.map((row) => [row.source_url.toLowerCase(), row])), [data.historical]);
  const total30 = data.byPath.reduce((sum, row) => sum + row.requests, 0);
  const historicalTotal = data.historical.reduce((sum, row) => sum + row.total_clicks, 0);
  const hostCounts = useMemo(() => new Map(data.sourceHosts.map((host) => [host, data.inventory.filter((item) => sourceParts(item.source_url).host === host).length])), [data.inventory, data.sourceHosts]);

  const chart = useMemo(() => {
    const days = new Map<string, { date: string; primary: number; secondary: number }>();
    for (const row of data.daily) {
      const current = days.get(row.date) ?? { date: row.date, primary: 0, secondary: 0 };
      if (row.host === data.sourceHosts[0]) current.primary += row.requests;
      else if (row.host === data.sourceHosts[1]) current.secondary += row.requests;
      days.set(row.date, current);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.daily, data.sourceHosts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.inventory
      .filter((item) => hostFilter === "all" || sourceParts(item.source_url).host === hostFilter)
      .filter((item) => !needle || `${item.source_url} ${item.target_url} ${item.comment}`.toLowerCase().includes(needle))
      .sort((a, b) => (requestMap.get(b.source_url.toLowerCase()) ?? 0) - (requestMap.get(a.source_url.toLowerCase()) ?? 0) || a.source_url.localeCompare(b.source_url));
  }, [data.inventory, hostFilter, query, requestMap]);

  async function refresh() {
    setBusy(true);
    try {
      await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json() as { ok: boolean; data?: DashboardPayload; error?: string };
      if (!payload.ok || !payload.data) throw new Error(payload.error || "Refresh failed.");
      setData(payload.data);
      setToast("Cloudflare state refreshed");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 3500);
    }
  }

  function openEdit(item: RedirectItem) {
    setSelected(item);
    setEditOpen(true);
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f7f4ef] selection:bg-[#ff4d3d]/30">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_4%,rgba(255,91,57,0.12),transparent_29%),radial-gradient(circle_at_12%_88%,rgba(190,30,45,0.08),transparent_27%)]" />
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#09090b]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1560px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#ff6649] to-[#c51f38] shadow-[0_0_30px_rgba(255,78,58,0.2)]">
              <Link2 className="size-4.5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2"><span className="font-semibold tracking-tight">JJ Links</span><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/45">OPEN SOURCE</span></div>
              <p className="text-[11px] text-white/35">The short way to everything</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={busy} className="button-quiet hidden sm:flex"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />Refresh</button>
            <button onClick={() => setCreateOpen(true)} className="button-primary"><Plus className="size-4" />New link</button>
            <div className="ml-1 grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-bold text-white/65">{displayName.slice(0, 2).toUpperCase()}</div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1560px] gap-8 px-5 py-7 lg:grid-cols-[210px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            <NavButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<BarChart3 />} label="Overview" />
            <NavButton active={tab === "links"} onClick={() => setTab("links")} icon={<Link2 />} label="Links" badge={data.inventory.length} />
            <NavButton active={tab === "system"} onClick={() => setTab("system")} icon={<Settings2 />} label="System" />
            <div className="my-6 border-t border-white/[0.06]" />
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25">Domains</p>
            {data.sourceHosts.map((host, index) => <button key={host} onClick={() => { setHostFilter(host); setTab("links"); }} className="domain-link"><span className={`size-2 rounded-full ${index === 0 ? "bg-[#ff5d45]" : "bg-[#c93659]"}`} />{host} <span>{hostCounts.get(host) ?? 0}</span></button>)}
          </nav>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1 lg:hidden">
            {(["overview", "links", "system"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`flex-1 rounded-lg px-3 py-2 text-sm capitalize ${tab === item ? "bg-white/10 text-white" : "text-white/45"}`}>{item}</button>)}
          </div>

          {tab === "overview" && <Overview data={data} chart={chart} total30={total30} historicalTotal={historicalTotal} requestMap={requestMap} onSelect={(item) => setSelected(item)} />}
          {tab === "links" && (
            <LinksView items={filtered} hosts={data.sourceHosts} query={query} setQuery={setQuery} hostFilter={hostFilter} setHostFilter={setHostFilter} requestMap={requestMap} historyMap={historyMap} onSelect={setSelected} onEdit={openEdit} />
          )}
          {tab === "system" && <SystemView data={data} />}
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-[1560px] items-center justify-between border-t border-white/[0.06] px-5 py-5 text-[11px] text-white/30 lg:px-8">
        <span>JJ Links {data.version}</span><span>Open source · Cloudflare stays in charge</span>
      </footer>

      {selected && !editOpen && <DetailPanel item={selected} requests={requestMap.get(selected.source_url.toLowerCase()) ?? 0} history={historyMap.get(selected.source_url.toLowerCase())} onClose={() => setSelected(null)} onEdit={() => setEditOpen(true)} />}
      {createOpen && <LinkForm mode="create" hosts={data.sourceHosts} onClose={() => setCreateOpen(false)} onDone={async (message) => { setCreateOpen(false); setToast(message); await refresh(); }} />}
      {editOpen && selected && <LinkForm mode="edit" hosts={data.sourceHosts} item={selected} onClose={() => setEditOpen(false)} onDone={async (message) => { setEditOpen(false); setSelected(null); setToast(message); await refresh(); }} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#18181b] px-5 py-3 text-sm shadow-2xl">{toast}</div>}
    </div>
  );
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactElement; label: string; badge?: number }) {
  return <button onClick={onClick} className={`nav-button ${active ? "nav-button-active" : ""}`}>{<span className="[&>svg]:size-4">{icon}</span>}<span>{label}</span>{badge !== undefined && <span className="ml-auto text-[11px] text-white/30">{badge}</span>}</button>;
}

function Overview({ data, chart, total30, historicalTotal, requestMap, onSelect }: { data: DashboardPayload; chart: Array<{ date: string; primary: number; secondary: number }>; total30: number; historicalTotal: number; requestMap: Map<string, number>; onSelect: (item: RedirectItem) => void }) {
  const historyMap = new Map(data.historical.map((row) => [row.source_url.toLowerCase(), row.total_clicks]));
  const activity = (item: RedirectItem) => requestMap.get(item.source_url.toLowerCase()) ?? historyMap.get(item.source_url.toLowerCase()) ?? 0;
  const active = [...data.inventory].sort((a, b) => activity(b) - activity(a)).slice(0, 7);
  return <>
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><p className="eyebrow">Overview</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">So many links, one single dashboard</h1><p className="mt-2 max-w-2xl text-sm text-white/42">Live configuration from Cloudflare, optional legacy history, one calm operating surface.</p></div>
      <HealthPill health={data.health} />
    </div>
    {data.health.warning && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-300/[0.06] p-4 text-sm text-amber-100/75"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /><span>{data.health.warning}</span></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Live redirects" value={number(data.inventory.length)} detail={data.sourceHosts.map((host) => `${data.inventory.filter((x) => sourceParts(x.source_url).host === host).length} ${host.split(".")[0]}`).join(" · ")} icon={<Link2 />} />
      <Metric label="Requests · 30 days" value={number(total30)} detail={data.health.analyticsWindowStart ? `${shortDate(data.health.analyticsWindowStart)} onwards` : "Awaiting live analytics"} icon={<Activity />} />
      <Metric label="Historical requests" value={number(historicalTotal)} detail="Optional legacy import" icon={<Database />} />
      <Metric label="System state" value={data.health.enabledRule && data.health.dnsHealthy ? "Healthy" : "Check"} detail={`Synced ${shortDate(data.health.syncedAt)}`} icon={<ShieldCheck />} good={data.health.enabledRule && data.health.dnsHealthy} />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
      <div className="panel p-5 md:p-6">
        <div className="mb-6 flex items-start justify-between"><div><p className="panel-title">Request activity</p><p className="panel-subtitle">Cloudflare 301 responses across both short domains</p></div><span className="legend"><i className="bg-[#ff5e46]" />{data.sourceHosts[0].split(".")[0]} <i className="ml-3 bg-[#c93b62]" />{data.sourceHosts[1].split(".")[0]}</span></div>
        <div className="h-[260px]">
          {chart.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="goFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5e46" stopOpacity={0.34}/><stop offset="100%" stopColor="#ff5e46" stopOpacity={0}/></linearGradient><linearGradient id="aiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c93b62" stopOpacity={0.28}/><stop offset="100%" stopColor="#c93b62" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false}/><XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} stroke="rgba(255,255,255,.16)" tick={{ fill: "rgba(255,255,255,.3)", fontSize: 10 }} tickLine={false}/><YAxis stroke="rgba(255,255,255,.16)" tick={{ fill: "rgba(255,255,255,.3)", fontSize: 10 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} labelStyle={{ color: "rgba(255,255,255,.5)" }}/><Area type="monotone" dataKey="primary" name={data.sourceHosts[0]} stroke="#ff5e46" fill="url(#goFill)" strokeWidth={2}/><Area type="monotone" dataKey="secondary" name={data.sourceHosts[1]} stroke="#c93b62" fill="url(#aiFill)" strokeWidth={2}/></AreaChart></ResponsiveContainer> : <EmptyChart />}
        </div>
      </div>
      <div className="panel overflow-hidden"><div className="border-b border-white/[0.06] p-5"><p className="panel-title">Most requested</p><p className="panel-subtitle">{requestMap.size ? "Last 30 days" : "Preserved history"}</p></div><div>{active.map((item, index) => <button key={item.id} onClick={() => onSelect(item)} className="rank-row"><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><strong>{sourceParts(item.source_url).path}</strong><small>{sourceParts(item.source_url).host.split(".")[0]} · {targetHost(item.target_url)}</small></span><span className="requests">{number(activity(item))}</span><ChevronRight className="size-3.5 text-white/20" /></button>)}</div></div>
    </div>
  </>;
}

function Metric({ label, value, detail, icon, good }: { label: string; value: string; detail: string; icon: React.ReactElement; good?: boolean }) {
  return <div className="panel p-5"><div className="flex items-center justify-between"><span className="text-xs text-white/38">{label}</span><span className={`grid size-8 place-items-center rounded-lg [&>svg]:size-4 ${good ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-white/40"}`}>{icon}</span></div><div className="mt-4 text-3xl font-semibold tracking-[-0.04em]">{value}</div><p className="mt-1 text-[11px] text-white/28">{detail}</p></div>;
}

function EmptyChart() { return <div className="grid h-full place-items-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] text-center"><div><Sparkles className="mx-auto mb-3 size-5 text-white/25"/><p className="text-sm text-white/45">Analytics will appear after the first live sync.</p><p className="mt-1 text-xs text-white/25">The redirect engine is already healthy.</p></div></div>; }

function LinksView({ items, hosts, query, setQuery, hostFilter, setHostFilter, requestMap, historyMap, onSelect, onEdit }: { items: RedirectItem[]; hosts: [string, string]; query: string; setQuery: (v: string) => void; hostFilter: string; setHostFilter: (v: string) => void; requestMap: Map<string, number>; historyMap: Map<string, DashboardPayload["historical"][number]>; onSelect: (v: RedirectItem) => void; onEdit: (v: RedirectItem) => void }) {
  return <><div className="mb-6"><p className="eyebrow">Inventory</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Every path has a destination.</h1></div><div className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 md:flex-row md:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search source, destination or note…" className="search-input"/></div><div className="flex rounded-lg border border-white/[0.07] bg-black/20 p-1">{["all", ...hosts].map((item) => <button key={item} onClick={() => setHostFilter(item)} className={`filter-button ${hostFilter === item ? "filter-active" : ""}`}>{item === "all" ? item : item.split(".")[0]}</button>)}</div><span className="flex items-center gap-2 text-xs text-white/30"><ListFilter className="size-3.5"/>{items.length} shown</span></div><div className="overflow-x-auto"><table className="link-table"><thead><tr><th>Short URL</th><th>Destination</th><th className="text-right">30d</th><th className="text-right">Historical</th><th /></tr></thead><tbody>{items.map((item) => { const parts = sourceParts(item.source_url); const recent = requestMap.get(item.source_url.toLowerCase()) ?? 0; const history = historyMap.get(item.source_url.toLowerCase()); return <tr key={item.id} onClick={() => onSelect(item)}><td><div className="flex items-center gap-3"><span className={`domain-dot ${parts.host === hosts[0] ? "bg-[#ff5e46]" : "bg-[#c93b62]"}`}/><div><strong>{parts.path}</strong><small>{parts.host}</small></div></div></td><td><div className="target-cell"><span>{targetHost(item.target_url)}</span><small>{item.target_url}</small></div></td><td className="metric-cell">{number(recent)}</td><td className="metric-cell text-white/42">{history ? number(history.total_clicks) : "—"}</td><td><button onClick={(event) => { event.stopPropagation(); onEdit(item); }} className="icon-button" aria-label={`Edit ${item.source_url}`}><Settings2 className="size-3.5"/></button></td></tr>; })}</tbody></table></div>{items.length === 0 && <div className="p-12 text-center text-sm text-white/35">No links match that filter.</div>}</div></>;
}

function SystemView({ data }: { data: DashboardPayload }) {
  const checks = [{ label: "Bulk Redirect rule", ok: data.health.enabledRule, detail: data.health.ruleName ?? "Not observed" }, { label: "Public redirect hosts", ok: data.health.dnsHealthy, detail: "Known-good paths on both hosts return redirects" }, { label: "List integrity", ok: data.health.listCount === data.inventory.length, detail: `${data.inventory.length} unique items observed` }, { label: "Runtime connection", ok: data.health.configured, detail: data.health.configured ? "Cloudflare API configured" : "Verified snapshot mode" }];
  return <><div className="mb-6"><p className="eyebrow">System</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Boring is beautiful.</h1><p className="mt-2 text-sm text-white/40">The production path remains native Cloudflare. This dashboard can disappear and every redirect still works.</p></div><div className="grid gap-5 xl:grid-cols-2"><div className="panel p-5"><p className="panel-title">Serving checks</p><div className="mt-5 space-y-3">{checks.map((check) => <div key={check.label} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><span className={`mt-0.5 grid size-5 place-items-center rounded-full ${check.ok ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>{check.ok ? <Check className="size-3"/> : <CircleAlert className="size-3"/>}</span><div><p className="text-sm font-medium">{check.label}</p><p className="mt-0.5 text-xs text-white/32">{check.detail}</p></div></div>)}</div></div><div className="panel p-5"><p className="panel-title">Sources of truth</p><div className="mt-5 space-y-4 text-sm"><Truth n="01" title="Cloudflare live list" text="Serving configuration and current options"/><Truth n="02" title="Public HTTPS response" text="End-to-end observed redirect behavior"/><Truth n="03" title="JJ Links D1" text="Preserved analytics, snapshots and audit events"/><Truth n="04" title="External snapshots" text="Optional rollback evidence and provenance"/></div></div></div><div className="panel mt-5 p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><p className="panel-title">Rollback boundary</p><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/38">JJ Links never enters the redirect-serving path. Configuration writes create an immutable D1 snapshot first, wait for Cloudflare completion, reconcile the full list and verify the public response.</p></div><a href="https://dash.cloudflare.com/?to=/:account/rules/bulk-redirects" target="_blank" rel="noreferrer" className="button-quiet shrink-0">Cloudflare console<ExternalLink className="size-3.5"/></a></div></div></>;
}

function Truth({ n, title, text }: { n: string; title: string; text: string }) { return <div className="flex gap-4"><span className="font-mono text-xs text-[#ff6047]/60">{n}</span><div><p className="font-medium">{title}</p><p className="text-xs text-white/30">{text}</p></div></div>; }

function HealthPill({ health }: { health: DashboardPayload["health"] }) { const ok = health.enabledRule && health.dnsHealthy && !health.stale; return <div className={`flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${ok ? "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200/70" : "border-amber-300/15 bg-amber-300/[0.06] text-amber-200/70"}`}><span className={`size-1.5 rounded-full ${ok ? "bg-emerald-300" : "bg-amber-300"}`}/>{ok ? "Live and healthy" : health.stale ? "Snapshot mode" : "Needs attention"}</div>; }

function DetailPanel({ item, requests, history, onClose, onEdit }: { item: RedirectItem; requests: number; history?: DashboardPayload["historical"][number]; onClose: () => void; onEdit: () => void }) {
  const parts = sourceParts(item.source_url);
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(`https://${item.source_url}`); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  return <div className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" onClick={onClose}><aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#101012] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><span className="mb-4 block size-2 rounded-full bg-[#ff5e46]"/><h2 className="text-2xl font-semibold tracking-tight">{parts.path}</h2><p className="mt-1 text-sm text-white/35">{parts.host}</p></div><button className="icon-button" onClick={onClose}><X className="size-4"/></button></div><div className="mt-7 flex gap-2"><button onClick={copy} className="button-quiet">{copied ? <Check className="size-4"/> : <Copy className="size-4"/>}{copied ? "Copied" : "Copy short URL"}</button><a href={`https://${item.source_url}`} target="_blank" rel="noreferrer" className="button-quiet">Open<ArrowUpRight className="size-4"/></a><button onClick={onEdit} className="button-primary ml-auto"><Settings2 className="size-4"/>Edit</button></div><div className="mt-7 grid grid-cols-2 gap-3"><Metric label="Requests · 30d" value={number(requests)} detail="Cloudflare edge responses" icon={<Activity/>}/><Metric label="Historical" value={history ? number(history.total_clicks) : "—"} detail="Optional legacy import" icon={<Database/>}/></div><div className="mt-5 space-y-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"><Field label="Destination" value={item.target_url}/><Field label="Status" value={String(item.status_code)}/><Field label="Incoming query" value={item.preserve_query_string ? "Preserved" : "Discarded"}/><Field label="Comment" value={item.comment || "No note"}/><Field label="Cloudflare item ID" value={item.id}/></div>{history && <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"><p className="panel-title">Historical classification</p><div className="mt-4 grid grid-cols-3 gap-3"><Mini label="Human" value={history.human_clicks}/><Mini label="Bots" value={history.bot_clicks}/><Mini label="QR" value={history.qr_scans}/></div><p className="mt-4 text-[11px] leading-relaxed text-white/25">Imported from an optional legacy analytics source. Unique values may not represent globally deduplicated visitors.</p></div>}</aside></div>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">{label}</p><p className="mt-1 break-all text-sm text-white/70">{value}</p></div>; }
function Mini({ label, value }: { label: string; value: number }) { return <div><p className="text-xl font-semibold">{number(value)}</p><p className="text-[10px] uppercase tracking-wider text-white/25">{label}</p></div>; }

function LinkForm({ mode, hosts, item, onClose, onDone }: { mode: "create" | "edit"; hosts: [string, string]; item?: RedirectItem; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const parts = item ? sourceParts(item.source_url) : null;
  const [host, setHost] = useState(parts?.host ?? hosts[0]);
  const [slug, setSlug] = useState(parts?.path.replace(/^\//, "") ?? "");
  const [targetUrl, setTargetUrl] = useState(item?.target_url ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetHasQuery = (() => { try { return Boolean(new URL(targetUrl).search); } catch { return false; } })();
  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = { requestId: crypto.randomUUID(), host, slug, targetUrl, statusCode: 301, preserveQueryString: !targetHasQuery, comment, ...(mode === "edit" ? { sourceUrl: item!.source_url, confirmedFullListReplacement: confirmed } : {}) };
      const response = await fetch(mode === "edit" ? "/api/links/update" : "/api/links", { method: mode === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error || "Cloudflare did not confirm the change.");
      await onDone(mode === "edit" ? "Redirect updated and publicly verified" : "Redirect created and publicly verified");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Change failed."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#151517] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="eyebrow">{mode === "edit" ? "Safe update" : "Create redirect"}</p><h2 className="mt-1 text-2xl font-semibold">{mode === "edit" ? parts?.path : "A new short way"}</h2></div><button className="icon-button" onClick={onClose}><X className="size-4"/></button></div><div className="mt-6 space-y-4"><label className="form-label">Short URL<div className="mt-2 flex overflow-hidden rounded-xl border border-white/10 bg-black/25"><select value={host} onChange={(e) => setHost(e.target.value)} disabled={mode === "edit"} className="border-r border-white/10 bg-transparent px-3 text-sm outline-none">{hosts.map((configuredHost) => <option key={configuredHost} value={configuredHost}>{configuredHost}</option>)}</select><span className="py-3 text-white/25">/</span><input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={mode === "edit"} className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm outline-none disabled:text-white/40" placeholder="my-link"/></div></label><label className="form-label">Destination<input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} className="form-input mt-2" placeholder="https://…"/></label><label className="form-label">Note<input value={comment} onChange={(e) => setComment(e.target.value)} className="form-input mt-2" placeholder="Why this link exists"/></label><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs leading-relaxed text-white/40"><p><strong className="text-white/65">301 permanent</strong> · Incoming query parameters will be {targetHasQuery ? "discarded to preserve the fixed target query" : "preserved"}.</p>{mode === "edit" && <label className="mt-3 flex cursor-pointer items-start gap-3"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-[#ff5e46]"/><span>I understand this safely replaces the complete Cloudflare list after creating an immutable snapshot.</span></label>}</div>{error && <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-sm text-red-200/80">{error}</div>}</div><div className="mt-6 flex justify-end gap-2"><button className="button-quiet" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy || !slug || !targetUrl || (mode === "edit" && !confirmed)} onClick={submit}>{busy ? <RefreshCw className="size-4 animate-spin"/> : <Cloud className="size-4"/>}{busy ? "Working…" : mode === "edit" ? "Update and verify" : "Create and verify"}</button></div></div></div>;
}

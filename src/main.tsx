import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "../components/dashboard";
import type { DashboardPayload } from "../lib/types";
import "../app/globals.css";

function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { ok: boolean; data?: DashboardPayload; error?: string };
      if (!body.ok || !body.data) throw Error(body.error || "Could not load your dashboard.");
      if (alive) setData(body.data);
    }).catch((error) => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, []);
  if (data) return <Dashboard initialData={data} displayName="Owner" />;
  return <main className="mx-auto max-w-xl p-10 text-white"><h1 className="text-2xl font-semibold">JJ Links</h1><p className="mt-4 text-white/60">{error ?? "Loading your links…"}</p>{error && <button className="button-primary mt-6" onClick={() => location.reload()}>Try again</button>}</main>;
}
createRoot(document.getElementById("root")!).render(<App />);

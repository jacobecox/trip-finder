"use client";

import { useState } from "react";

interface S {
  originLabel: string;
  originLat: number;
  originLng: number;
  maxDriveHours: number;
}

const input = "w-full rounded border border-black/20 bg-transparent px-2 py-1.5 dark:border-white/25";

export default function SettingsForm({ initial }: { initial: S }) {
  const [label, setLabel] = useState(initial.originLabel);
  const [lat, setLat] = useState(String(initial.originLat));
  const [lng, setLng] = useState(String(initial.originLng));
  const [hours, setHours] = useState(String(initial.maxDriveHours));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originLabel: label,
        originLat: Number(lat),
        originLng: Number(lng),
        maxDriveHours: Number(hours),
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setMsg(j.error ?? "Save failed");
    }
    if (j.requeued > 0) {
      setMsg(`Saved. Recomputing drive times for ${j.requeued} properties…`);
      let more = true;
      while (more) {
        const r = await fetch("/api/geocode", { method: "POST" });
        const g = await r.json();
        more = r.ok && g.remaining > 0 && g.processed > 0;
      }
    }
    setBusy(false);
    setMsg("Saved.");
    // Re-fetch so the coordinates shown reflect a server-side lookup
    const fresh = await (await fetch("/api/settings")).json();
    setLat(String(fresh.originLat));
    setLng(String(fresh.originLng));
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">
        Origin
        <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} required />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Latitude
          <input className={input} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        </label>
        <label className="block text-sm">
          Longitude
          <input className={input} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        Change the origin name and leave the coordinates alone to look them up automatically.
      </p>
      <label className="block text-sm">
        Max drive hours
        <input className={input} value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
      </label>
      <button disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}

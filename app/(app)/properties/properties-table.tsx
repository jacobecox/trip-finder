"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtHours } from "@/lib/format";

interface P {
  id: number;
  name: string;
  city: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
  geocodeSource: string | null;
  geocodeStatus: string;
  geocodeError: string | null;
  driveHours: number | null;
  driveMiles: number | null;
  isDrivable: boolean;
  latLngOverridden: boolean;
  driveOverridden: boolean;
  listingCount: number;
}

const input = "w-24 rounded border border-black/20 bg-transparent px-1.5 py-1 text-sm dark:border-white/25";

function Row({ p }: { p: P }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [lat, setLat] = useState(String(p.lat ?? ""));
  const [lng, setLng] = useState(String(p.lng ?? ""));
  const [hours, setHours] = useState(p.driveHours != null ? String(+p.driveHours.toFixed(2)) : "");
  const [err, setErr] = useState("");

  async function send(body: object) {
    setErr("");
    const res = await fetch(`/api/properties/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return setErr("Save failed");
    setEdit(false);
    router.refresh();
  }

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = () => {
    const body: Record<string, number | null> = {};
    if (lat !== String(p.lat ?? "") || lng !== String(p.lng ?? "")) {
      body.lat = num(lat);
      body.lng = num(lng);
    }
    if (hours !== (p.driveHours != null ? String(+p.driveHours.toFixed(2)) : "")) body.driveHours = num(hours);
    if ([body.lat, body.lng, body.driveHours].some((v) => v != null && Number.isNaN(v))) return setErr("Invalid number");
    return Object.keys(body).length ? send(body) : setEdit(false);
  };

  const badge =
    p.geocodeStatus === "ok" ? "bg-green-100 text-green-800" : p.geocodeStatus === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";

  return (
    <tr className="border-t border-black/10 align-top dark:border-white/10">
      <td className="px-2 py-1.5">
        {p.name}
        <div className="text-xs text-black/50 dark:text-white/50">
          {[p.city, p.state, p.country].filter(Boolean).join(", ")} · {p.listingCount} listings
        </div>
      </td>
      <td className="px-2 py-1.5">
        <span className={`rounded px-2 py-0.5 text-xs ${badge}`}>{p.geocodeStatus}</span>
        {p.geocodeError && <div className="mt-1 text-xs text-red-700">{p.geocodeError}</div>}
        {p.geocodeSource && <div className="text-xs text-black/50 dark:text-white/50">{p.geocodeSource}</div>}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5">
        {edit ? (
          <div className="flex gap-1">
            <input className={input} placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} />
            <input className={input} placeholder="lng" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
        ) : p.lat != null && p.lng != null ? (
          <>
            {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
            {p.latLngOverridden && <span className="ml-1 text-xs text-blue-700">manual</span>}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5">
        {edit ? (
          <input className={input} placeholder="hours" value={hours} onChange={(e) => setHours(e.target.value)} />
        ) : (
          <>
            {fmtHours(p.driveHours)}
            {p.driveMiles != null && <span className="text-xs text-black/50"> · {Math.round(p.driveMiles)} mi</span>}
            {p.driveOverridden && <span className="ml-1 text-xs text-blue-700">manual</span>}
            {p.isDrivable && <span className="ml-1 rounded bg-green-100 px-1.5 text-xs text-green-800">drivable</span>}
          </>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right">
        {edit ? (
          <>
            <button className="mr-2 text-sm underline" onClick={save}>
              Save
            </button>
            <button className="text-sm" onClick={() => setEdit(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="mr-2 text-sm underline" onClick={() => setEdit(true)}>
              Edit
            </button>
            {(p.latLngOverridden || p.driveOverridden) && (
              <button className="text-sm text-black/60" onClick={() => send({ resetOverrides: true })}>
                Reset
              </button>
            )}
          </>
        )}
        {err && <div className="text-xs text-red-700">{err}</div>}
      </td>
    </tr>
  );
}

export default function PropertiesTable({ rows }: { rows: P[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const queued = rows.filter((r) => r.geocodeStatus !== "ok").length;

  async function run(retryFailed: boolean) {
    setBusy(true);
    try {
      let more = true;
      let first = true;
      while (more) {
        const res = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retryFailed: retryFailed && first }),
        });
        first = false;
        const j = await res.json();
        if (j.quotaExceeded) setNote("Geocoding rate limit reached. Try again later.");
        more = res.ok && !j.quotaExceeded && j.remaining > 0 && j.processed > 0;
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {note && <p className="text-sm text-amber-700">{note}</p>}
      {queued > 0 && (
        <button disabled={busy} onClick={() => run(true)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">
          {busy ? "Geocoding…" : `Geocode / retry ${queued} unfinished`}
        </button>
      )}
      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-black/5 dark:bg-white/10">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Property</th>
              <th className="px-2 py-2 text-left font-medium">Geocode</th>
              <th className="px-2 py-2 text-left font-medium">Lat / Lng</th>
              <th className="px-2 py-2 text-left font-medium">Drive</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Row key={`${p.id}-${p.lat}-${p.lng}-${p.driveHours}`} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

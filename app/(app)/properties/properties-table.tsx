"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmtHours } from "@/lib/format";
import { TAGS, tagDisplay, type Tag } from "@/lib/tags/constants";
import type { TagRow } from "@/lib/tags/effective";

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
  tagStatus: string;
  tagError: string | null;
  tagsReviewed: boolean;
  tagRows: TagRow[];
  tags: Tag[];
  untagged: boolean;
  airportStatus: string;
  airportError: string | null;
  airportRows: { iata: string; driveHours: number | null; auto: boolean; pinned: boolean; excluded: boolean }[];
}

/** Arrival airports searched for this property. Click to exclude/restore; add a code to pin it. */
function AirportEditor({ p, send }: { p: P; send: (body: object) => Promise<void> }) {
  const [code, setCode] = useState("");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {p.airportRows.map((a) => {
          const next = a.excluded || a.pinned ? null : "exclude";
          return (
            <button
              key={a.iata}
              onClick={() => send({ airports: { [a.iata]: next } })}
              title={`${fmtHours(a.driveHours)} drive to the lodging · ${
                a.excluded ? "excluded (click to restore)" : a.pinned ? "pinned by you (click to unpin)" : "auto (click to exclude)"
              }`}
              className={`rounded border px-1.5 py-0.5 text-[11px] tabular-nums ${
                a.excluded
                  ? "border-black/15 text-black/40 line-through dark:border-white/20 dark:text-white/40"
                  : a.pinned
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-sky-300 bg-sky-100 text-sky-900"
              }`}
            >
              {a.iata} {a.driveHours != null ? fmtHours(a.driveHours) : ""}
            </button>
          );
        })}
      </div>
      <form
        className="flex items-center gap-1 text-[11px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^[A-Za-z]{3}$/.test(code)) send({ airports: { [code.toUpperCase()]: "pin" } }).then(() => setCode(""));
        }}
      >
        <input
          className="w-14 rounded border border-black/20 bg-transparent px-1 py-0.5 uppercase dark:border-white/25"
          placeholder="IATA"
          maxLength={3}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="underline" type="submit">
          add
        </button>
        {p.airportStatus === "pending" && p.lat != null && <span className="text-amber-700">pending</span>}
        {p.airportStatus === "failed" && <span className="text-red-700">failed: {p.airportError}</span>}
      </form>
    </div>
  );
}

function TagEditor({ p, send }: { p: P; send: (body: object) => Promise<void> }) {
  const byTag = new Map(p.tagRows.map((r) => [r.tag, r]));
  const hasManual = p.tagRows.some((r) => r.manual != null);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {TAGS.map((t) => {
          const r = byTag.get(t);
          const on = p.tags.includes(t);
          const manual = r?.manual != null;
          // toggling back to the auto suggestion clears the manual choice
          const next = !on === (r?.osm ?? false) ? null : !on;
          return (
            <button
              key={t}
              onClick={() => send({ tags: { [t]: next } })}
              title={[r?.osmEvidence ?? "No match found nearby", manual ? "Set manually" : "Auto-suggested"].join(" · ")}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                on
                  ? manual
                    ? "border-sky-700 bg-sky-700 text-white"
                    : "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-black/15 text-black/40 line-through dark:border-white/20 dark:text-white/40"
              }`}
            >
              {tagDisplay(t)}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {p.tagStatus === "pending" && <span className="text-amber-700">auto-tagging pending</span>}
        {p.tagStatus === "failed" && <span className="text-red-700">tagging failed: {p.tagError}</span>}
        {p.untagged && <span className="rounded bg-amber-100 px-1.5 text-amber-900">untagged</span>}
        <button className="underline" onClick={() => send({ tagsReviewed: !p.tagsReviewed })}>
          {p.tagsReviewed ? "Reviewed ✓" : "Mark reviewed"}
        </button>
        {hasManual && (
          <button className="text-black/60 underline dark:text-white/60" onClick={() => send({ resetTags: true })}>
            Reset tags
          </button>
        )}
      </div>
    </div>
  );
}

const input = "w-24 rounded border border-black/20 bg-transparent px-1.5 py-1 text-sm dark:border-white/25";

function Row({ p }: { p: P }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [lat, setLat] = useState(String(p.lat ?? ""));
  const [lng, setLng] = useState(String(p.lng ?? ""));
  const [hours, setHours] = useState(p.driveHours != null ? String(+p.driveHours.toFixed(2)) : "");
  const [err, setErr] = useState("");

  async function send(body: object): Promise<void> {
    setErr("");
    const res = await fetch(`/api/properties/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? "Save failed");
      return;
    }
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
    if (Object.keys(body).length) return send(body);
    setEdit(false);
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
      <td className="px-2 py-1.5">
        <TagEditor p={p} send={send} />
      </td>
      <td className="px-2 py-1.5">
        <AirportEditor p={p} send={send} />
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
  const [reviewOnly, setReviewOnly] = useState(false);
  const queued = rows.filter(
    (r) => r.geocodeStatus !== "ok" || (r.lat != null && (r.tagStatus !== "ok" || r.airportStatus !== "ok")),
  ).length;
  const needsReview = rows.filter((r) => r.untagged || r.geocodeStatus === "failed").length;
  const shown = reviewOnly ? rows.filter((r) => r.untagged || r.geocodeStatus === "failed") : rows;

  function orsNote(q: Record<string, { limit: number; remaining: number; resetAt: string | null }>) {
    const parts = Object.entries(q).map(([k, v]) => `${k} ${v.remaining}/${v.limit}`);
    const reset = Object.values(q).find((v) => v.resetAt)?.resetAt;
    return parts.length
      ? `OpenRouteService left: ${parts.join(", ")}${reset ? ` (renews ${new Date(reset).toLocaleString()})` : ""}`
      : "";
  }

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
        if (j.quotaExceeded) setNote(`${j.quotaService ?? "Geocoding"} limit reached. Try again later.`);
        else if (j.ors) setNote(orsNote(j.ors));
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
        Needs review only ({needsReview})
      </label>
      <p className="text-xs text-black/50 dark:text-white/50">
        Activity tags are auto-suggested from OpenStreetMap (light chips). Click a tag to toggle it; manual choices
        (dark chips) are kept when tags are re-run. Hover a tag to see what was found nearby. Airports: all
        airports searched for fares (one search covers them all); click one to exclude it, or add a code to pin one.
      </p>
      {queued > 0 && (
        <button disabled={busy} onClick={() => run(true)} className="rounded border px-3 py-1 text-sm disabled:opacity-50">
          {busy ? "Working…" : `Locate & tag ${queued} unfinished`}
        </button>
      )}
      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-black/5 dark:bg-white/10">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Property</th>
              <th className="px-2 py-2 text-left font-medium">Geocode</th>
              <th className="px-2 py-2 text-left font-medium">Lat / Lng</th>
              <th className="px-2 py-2 text-left font-medium">Drive</th>
              <th className="px-2 py-2 text-left font-medium">Activities</th>
              <th className="px-2 py-2 text-left font-medium" title="Arrival airports searched for fares, with drive time to the lodging">
                Airports
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <Row key={`${p.id}-${p.lat}-${p.lng}-${p.driveHours}`} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

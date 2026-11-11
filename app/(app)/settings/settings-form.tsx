"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import { TAGS, tagDisplay, type TagWeights } from "@/lib/tags/constants";

interface S {
  originLabel: string;
  originLat: number;
  originLng: number;
  maxDriveHours: number;
  costWeight: number;
  activityWeight: number;
  tagWeights: TagWeights;
  tickets: number;
  mpg: number;
  gasPriceUsd: number;
  flightBaseUsd: number;
  flightPerMileUsd: number;
  originAirport: string;
  lapInfants: number;
  airportMaxDriveHours: number;
  hubMaxDriveHours: number;
  maxAirports: number;
  extraDriveUsdPerHour: number;
  serpapiMonthlyCap: number;
  fareCacheHours: number;
  altOriginAirport: string;
  altOriginDriveHours: number;
  altOriginDriveMiles: number;
  altOriginParkingUsdPerDay: number;
}

type Form = { [K in Exclude<keyof S, "tagWeights">]: string } & { tagWeights: Record<string, string> };

const input = "field mt-1 w-full";
const hint = "text-xs text-muted";
const str = (s: S): Form => ({
  ...(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "object" ? v : String(v)])) as Form),
  tagWeights: Object.fromEntries(TAGS.map((t) => [t, String(s.tagWeights[t] ?? 0)])),
});

export default function SettingsForm({ initial }: { initial: S }) {
  const [f, setF] = useState<Form>(str(initial));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const field = (k: Exclude<keyof Form, "tagWeights">, label: string, extra?: React.ReactNode) => (
    <label className="block text-sm">
      {label}
      <input className={input} value={f[k]} onChange={set(k)} inputMode="decimal" required />
      {extra}
    </label>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = (k: Exclude<keyof Form, "tagWeights" | "originLabel" | "originAirport" | "altOriginAirport">) => Number(f[k]);
    const body = {
      originLabel: f.originLabel,
      originLat: n("originLat"),
      originLng: n("originLng"),
      maxDriveHours: n("maxDriveHours"),
      costWeight: n("costWeight"),
      activityWeight: n("activityWeight"),
      tagWeights: Object.fromEntries(TAGS.map((t) => [t, Number(f.tagWeights[t])])),
      tickets: Math.round(n("tickets")),
      mpg: n("mpg"),
      gasPriceUsd: n("gasPriceUsd"),
      flightBaseUsd: n("flightBaseUsd"),
      flightPerMileUsd: n("flightPerMileUsd"),
      originAirport: f.originAirport.trim().toUpperCase(),
      lapInfants: Math.round(n("lapInfants")),
      airportMaxDriveHours: n("airportMaxDriveHours"),
      hubMaxDriveHours: n("hubMaxDriveHours"),
      maxAirports: Math.round(n("maxAirports")),
      extraDriveUsdPerHour: n("extraDriveUsdPerHour"),
      serpapiMonthlyCap: Math.round(n("serpapiMonthlyCap")),
      fareCacheHours: Math.round(n("fareCacheHours")),
      altOriginAirport: f.altOriginAirport.trim().toUpperCase(),
      altOriginDriveHours: n("altOriginDriveHours"),
      altOriginDriveMiles: n("altOriginDriveMiles"),
      altOriginParkingUsdPerDay: n("altOriginParkingUsdPerDay"),
    };
    if (Object.values(body).some((v) => typeof v === "number" && Number.isNaN(v)) ||
        Object.values(body.tagWeights).some(Number.isNaN))
      return setMsg("Please enter numbers only.");

    setBusy(true);
    setMsg("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setMsg(j.error ?? "Save failed");
    }
    if (j.requeued > 0 || j.airportsRequeued) {
      setMsg(j.requeued > 0 ? `Saved. Recomputing drive times for ${j.requeued} properties…` : "Saved. Rebuilding airport lists…");
      let more = true;
      while (more) {
        const r = await fetch("/api/geocode", { method: "POST" });
        const g = await r.json();
        more = r.ok && !g.quotaExceeded && g.remaining > 0 && g.processed > 0;
      }
    }
    setBusy(false);
    setMsg("Saved.");
    setF(str(await (await fetch("/api/settings")).json()));
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="card space-y-3 p-4">
        <legend className="float-left mb-1 w-full font-semibold">Home / origin</legend>
        <label className="block text-sm">
          Origin
          <input className={input} value={f.originLabel} onChange={set("originLabel")} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {field("originLat", "Latitude")}
          {field("originLng", "Longitude")}
        </div>
        <p className={hint}>Change the origin name and leave the coordinates alone to look them up automatically.</p>
        {field("maxDriveHours", "Max drive hours")}
      </fieldset>

      <fieldset className="card space-y-3 p-4">
        <legend className="float-left mb-1 w-full font-semibold">Trip cost (USD)</legend>
        <div className="grid grid-cols-2 gap-3">
          {field("tickets", "Plane tickets", <span className={hint}>Seats; the first two are adults</span>)}
          {field("lapInfants", "Lap infants", <span className={hint}>No seat; may still cost on intl flights</span>)}
          {field("mpg", "Car MPG")}
          {field("gasPriceUsd", "Gas price ($/gal)")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field("flightBaseUsd", "Flight estimate: base ($/ticket)")}
          {field("flightPerMileUsd", "Flight estimate: $/mile")}
        </div>
        <p className={hint}>
          Drivable trips cost lodging + round-trip gas. Other trips use real fares once priced, otherwise this rough
          estimate per ticket (base + $/mile × straight-line miles).
        </p>
      </fieldset>

      <fieldset className="card space-y-3 p-4">
        <legend className="float-left mb-1 w-full font-semibold">Flights</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Home airport
            <input className={input} value={f.originAirport} onChange={set("originAirport")} maxLength={3} required />
          </label>
          {field(
            "extraDriveUsdPerHour",
            "Travel time ($/hour)",
            <span className={hint}>
              What an extra hour costs you: driving from a farther airport, or waiting on a layover
            </span>,
          )}
          {field("airportMaxDriveHours", "Airports within (hours)")}
          {field("hubMaxDriveHours", "…or nearest big airport within (hours)")}
          {field("maxAirports", "Max airports per search", <span className={hint}>Google Flights allows 7</span>)}
          {field("fareCacheHours", "Re-price after (hours)")}
          {field("serpapiMonthlyCap", "Monthly search cap", <span className={hint}>SerpApi free plan: 250</span>)}
        </div>
        <p className={hint}>
          Each fare search covers every candidate airport for a property. The cheapest fare + extra drive (both ways,
          plus gas) wins, so a farther airport has to save real money.
        </p>
      </fieldset>

      <fieldset className="card space-y-3 p-4">
        <legend className="float-left mb-1 w-full font-semibold">Also fly from</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Second airport
            <input className={input} value={f.altOriginAirport} onChange={set("altOriginAirport")} maxLength={3} />
            <span className={hint}>Searched together with the home airport (no extra searches). Leave empty to turn off.</span>
          </label>
          {field("altOriginParkingUsdPerDay", "Parking ($/day)", <span className={hint}>Counted for nights + 1 days</span>)}
          {field("altOriginDriveHours", "Drive from home (hours, one way)")}
          {field("altOriginDriveMiles", "Drive from home (miles, one way)")}
        </div>
        <p className={hint}>
          Flying from the second airport adds the drive there and back (time at the $/hour above, plus gas) and
          parking. The listings page can show either airport or the better of the two.
        </p>
      </fieldset>

      <fieldset className="card space-y-3 p-4">
        <legend className="float-left mb-1 w-full font-semibold">Scoring</legend>
        <div className="grid grid-cols-2 gap-3">
          {field("costWeight", "Cost weight")}
          {field("activityWeight", "Activity weight")}
        </div>
        <p className={hint}>Score = cost × cost weight + activities × activity weight (weights are normalized).</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TAGS.map((t) => (
            <label key={t} className="block text-sm">
              {tagDisplay(t)}
              <input
                className={input}
                inputMode="decimal"
                value={f.tagWeights[t]}
                onChange={(e) => setF({ ...f, tagWeights: { ...f.tagWeights, [t]: e.target.value } })}
              />
            </label>
          ))}
        </div>
        <p className={hint}>How much each activity matters to you. 0 ignores it.</p>
      </fieldset>

      <div className="sticky bottom-4 flex items-center gap-3">
        <button disabled={busy} className="btn btn-primary px-5 py-2 shadow-lg shadow-black/50">
          {busy && <Spinner />}
          {busy ? "Saving…" : "Save settings"}
        </button>
        {msg && <p className={`text-sm ${msg.startsWith("Saved") ? "text-emerald-300" : "text-amber-300"}`}>{msg}</p>}
      </div>
    </form>
  );
}

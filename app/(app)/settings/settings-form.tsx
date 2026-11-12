"use client";

import { useRouter } from "next/navigation";
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

type Form = { [K in Exclude<keyof S, "tagWeights">]: string } & {
  tagWeights: Record<string, string>;
};

const input = "field w-full";
const hint = "text-xs text-muted";
const str = (s: S): Form => ({
  ...(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "object" ? v : String(v)])) as Form),
  tagWeights: Object.fromEntries(TAGS.map((t) => [t, String(s.tagWeights[t] ?? 0)])),
});

export default function SettingsForm({
  initial,
  admin,
  personalized,
}: {
  initial: S;
  admin: boolean;
  personalized: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<Form>(str(initial));
  const [custom, setCustom] = useState(personalized);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const field = (k: Exclude<keyof Form, "tagWeights">, label: string, extra?: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input className={input} value={f[k]} onChange={set(k)} inputMode="decimal" required />
      {extra}
    </label>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = (k: Exclude<keyof Form, "tagWeights" | "originLabel" | "originAirport" | "altOriginAirport">) =>
      Number(f[k]);
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
    if (
      Object.values(body).some((v) => typeof v === "number" && Number.isNaN(v)) ||
      Object.values(body.tagWeights).some(Number.isNaN)
    )
      return setMsg("Please enter numbers only.");

    if (!admin) {
      // family members save only their own view (tickets, weights, cost estimates)
      setBusy(true);
      setMsg("");
      const { tickets, costWeight, activityWeight, tagWeights, mpg, gasPriceUsd, flightBaseUsd, flightPerMileUsd } =
        body;
      const res = await fetch("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets,
          costWeight,
          activityWeight,
          tagWeights,
          mpg,
          gasPriceUsd,
          flightBaseUsd,
          flightPerMileUsd,
        }),
      });
      const j = await res.json();
      setBusy(false);
      if (!res.ok) return setMsg(j.error ?? "Save failed");
      setF(str(j));
      setCustom(true);
      setMsg("Saved. Your trips now use these.");
      router.refresh();
      return;
    }

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
      setMsg(
        j.requeued > 0
          ? `Saved. Recomputing drive times for ${j.requeued} properties…`
          : "Saved. Rebuilding airport lists…",
      );
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

  async function reset() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/prefs", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setMsg("Reset failed");
    setF(str(await res.json()));
    setCustom(false);
    setMsg("Saved. Back to the shared defaults.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {admin && (
        <Section title="Home / origin (shared)">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Origin</span>
            <input className={input} value={f.originLabel} onChange={set("originLabel")} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("originLat", "Latitude")}
            {field("originLng", "Longitude")}
          </div>
          <p className={hint}>Change the origin name and leave the coordinates alone to look them up automatically.</p>
          {field("maxDriveHours", "Max drive hours")}
        </Section>
      )}

      <Section title="Trip cost (USD)">
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "tickets",
            "Plane tickets",
            <span className={hint}>Seats to buy (a baby on a lap doesn&apos;t need one)</span>,
          )}
          {admin &&
            field("lapInfants", "Lap infants", <span className={hint}>No seat; may still cost on intl flights</span>)}
          {field("mpg", "Car MPG")}
          {field("gasPriceUsd", "Gas price ($/gal)")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("flightBaseUsd", "Flight estimate: base ($/ticket)")}
          {field("flightPerMileUsd", "Flight estimate: $/mile")}
        </div>
        <p className={hint}>
          Drivable trips cost lodging + round-trip gas. Other trips use real fares once priced, otherwise this rough
          estimate per ticket (base + $/mile × straight-line miles).
        </p>
      </Section>

      {admin && (
        <>
          <Section title="Flights (shared)">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Home airport</span>
                <input
                  className={input}
                  value={f.originAirport}
                  onChange={set("originAirport")}
                  maxLength={3}
                  required
                />
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
              Each fare search covers every candidate airport for a property. The cheapest fare + extra drive (both
              ways, plus gas) wins, so a farther airport has to save real money.
            </p>
          </Section>

          <Section title="Also fly from (shared)">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Second airport</span>
                <input className={input} value={f.altOriginAirport} onChange={set("altOriginAirport")} maxLength={3} />
                <span className={hint}>
                  Searched together with the home airport (no extra searches). Leave empty to turn off.
                </span>
              </label>
              {field(
                "altOriginParkingUsdPerDay",
                "Parking ($/day)",
                <span className={hint}>Counted for nights + 1 days</span>,
              )}
              {field("altOriginDriveHours", "Drive from home (hours, one way)")}
              {field("altOriginDriveMiles", "Drive from home (miles, one way)")}
            </div>
            <p className={hint}>
              Flying from the second airport adds the drive there and back (time at the $/hour above, plus gas) and
              parking. The listings page can show either airport or the better of the two.
            </p>
          </Section>
        </>
      )}

      <Section title="Scoring">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("costWeight", "Cost weight")}
          {field("activityWeight", "Activity weight")}
        </div>
        <p className={hint}>Score = cost × cost weight + activities × activity weight (weights are normalized).</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TAGS.map((t) => (
            <label key={t} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{tagDisplay(t)}</span>
              <input
                className={input}
                inputMode="decimal"
                value={f.tagWeights[t]}
                onChange={(e) =>
                  setF({
                    ...f,
                    tagWeights: { ...f.tagWeights, [t]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className={hint}>How much each activity matters to you. 0 ignores it.</p>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <button disabled={busy} className="btn btn-primary px-5 py-2">
          {busy && <Spinner />}
          {busy ? "Saving…" : "Save settings"}
        </button>
        {!admin && custom && (
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="btn btn-secondary py-2"
            title="Use the same settings as everyone else"
          >
            Reset to defaults
          </button>
        )}
        {msg && <p className={`text-sm ${msg.startsWith("Saved") ? "text-emerald-300" : "text-amber-300"}`}>{msg}</p>}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

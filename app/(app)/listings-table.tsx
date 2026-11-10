"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TAGS, type Tag } from "@/lib/tags/constants";
import { daysUntil, fmtDate, fmtHours, fmtMiles, fmtMinutes, fmtUsd } from "@/lib/format";
import { scoreListings, type ScoreSettings } from "@/lib/scoring";
import { tagDisplay } from "@/lib/tags/constants";
import { TagChips } from "./tag-chips";
import type { FareInfo } from "@/lib/flights/fares";
import { fareFrom, originCost } from "@/lib/flights/pick";

// Leaflet touches `window`, so the map only loads in the browser
const ListingsMap = dynamic(() => import("./listings-map"), {
  ssr: false,
  loading: () => <div className="h-[70vh] min-h-[420px] animate-pulse rounded bg-black/5 dark:bg-white/10" />,
});

export interface Row {
  id: number;
  propertyId: number;
  arrivalDate: string;
  unitType: string;
  priceUsd: number;
  property: string;
  city: string;
  state: string;
  country: string;
  driveHours: number | null;
  driveMiles: number | null;
  isDrivable: boolean;
  geocodeStatus: string;
  lat: number | null;
  lng: number | null;
  tags: Tag[];
  untagged: boolean;
  fare: FareInfo;
}

type SortKey =
  | "score"
  | "totalUsd"
  | "arrivalDate"
  | "property"
  | "location"
  | "unitType"
  | "priceUsd"
  | "travelUsd"
  | "driveHours"
  | "distanceMiles";
type Sort = { key: SortKey; dir: 1 | -1 };

// first click on a column: best score first, everything else low to high / A to Z
const FIRST_DIR: Partial<Record<SortKey, 1 | -1>> = { score: -1 };

const PRESETS: { label: string; sort: Sort }[] = [
  { label: "Score (best)", sort: { key: "score", dir: -1 } },
  { label: "Score (worst)", sort: { key: "score", dir: 1 } },
  { label: "Total (low to high)", sort: { key: "totalUsd", dir: 1 } },
  { label: "Total (high to low)", sort: { key: "totalUsd", dir: -1 } },
  { label: "Lodging (low to high)", sort: { key: "priceUsd", dir: 1 } },
  { label: "Lodging (high to low)", sort: { key: "priceUsd", dir: -1 } },
  { label: "Travel (low to high)", sort: { key: "travelUsd", dir: 1 } },
  { label: "Travel (high to low)", sort: { key: "travelUsd", dir: -1 } },
  { label: "Arrival (soonest)", sort: { key: "arrivalDate", dir: 1 } },
  { label: "Arrival (latest)", sort: { key: "arrivalDate", dir: -1 } },
  { label: "Distance (closest)", sort: { key: "distanceMiles", dir: 1 } },
  { label: "Distance (furthest)", sort: { key: "distanceMiles", dir: -1 } },
  { label: "Drive time (shortest)", sort: { key: "driveHours", dir: 1 } },
  { label: "Drive time (longest)", sort: { key: "driveHours", dir: -1 } },
];

const input = "rounded border border-black/20 bg-transparent px-2 py-1 text-sm dark:border-white/25";
const muted = "text-xs text-black/50 dark:text-white/50";

export default function ListingsTable({
  rows: raw,
  origin,
  airports,
  scoreSettings,
}: {
  rows: Row[];
  origin: { label: string; lat: number; lng: number };
  airports: { home: string; alt: string };
  scoreSettings: ScoreSettings;
}) {
  const [tickets, setTickets] = useState(String(scoreSettings.tickets));
  const ticketCount = Math.min(20, Math.max(1, Math.round(Number(tickets)) || scoreSettings.tickets));
  const [flyFrom, setFlyFrom] = useState("best");
  const data = useMemo(() => raw.map((r) => ({ ...r, fare: fareFrom(r.fare, flyFrom) })), [raw, flyFrom]);
  const rows = useMemo(
    () => scoreListings(data, origin, { ...scoreSettings, tickets: ticketCount }),
    [data, origin, scoreSettings, ticketCount],
  );

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [drivableOnly, setDrivableOnly] = useState(false);
  const [unit, setUnit] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [tag, setTag] = useState<Tag | "">("");
  const [sort, setSort] = useState<Sort>(PRESETS[0].sort);
  const [view, setView] = useState<"table" | "map">("table");
  const preset = PRESETS.findIndex((p) => p.sort.key === sort.key && p.sort.dir === sort.dir);

  const units = useMemo(() => [...new Set(rows.map((r) => r.unitType))].sort(), [rows]);
  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const states = useMemo(
    () => [...new Set(rows.filter((r) => !country || r.country === country).map((r) => r.state).filter(Boolean))].sort(),
    [rows, country],
  );

  const shown = useMemo(() => {
    const max = maxPrice ? Number(maxPrice) : Infinity;
    const val = (r: (typeof rows)[number]) =>
      sort.key === "location" ? `${r.country}${r.state}${r.city}` : r[sort.key];
    return rows
      .filter(
        (r) =>
          (!from || r.arrivalDate >= from) &&
          (!to || r.arrivalDate <= to) &&
          (!drivableOnly || r.isDrivable) &&
          (!unit || r.unitType === unit) &&
          (!country || r.country === country) &&
          (!state || r.state === state) &&
          (!tag || r.tags.includes(tag)) &&
          r.priceUsd <= max,
      )
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x == null) return 1; // nulls last regardless of direction
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, from, to, drivableOnly, unit, country, state, tag, maxPrice, sort]);

  const th = (key: SortKey, label: string, cls = "") => {
    const active = sort.key === key;
    return (
      <th className={`px-2 py-2 text-left font-medium ${cls}`} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          className="group inline-flex items-center gap-1 whitespace-nowrap"
          title={`Sort by ${label.toLowerCase()}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : (FIRST_DIR[key] ?? 1) }))}
        >
          {label}
          <span className={active ? "" : "opacity-30 group-hover:opacity-70"}>
            {active ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <label className="text-xs">
          Sort by
          <select className={`${input} w-full`} value={preset} onChange={(e) => setSort(PRESETS[Number(e.target.value)].sort)}>
            {preset < 0 && <option value={-1}>Custom (column)</option>}
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Plane tickets
          <input
            type="number"
            min={1}
            max={20}
            className={`${input} w-full`}
            value={tickets}
            onChange={(e) => setTickets(e.target.value)}
            title="Used for fly-to cost estimates. Default is set on the Settings page."
          />
        </label>
        {airports.alt && (
          <label className="text-xs">
            Fly from
            <select className={`${input} w-full`} value={flyFrom} onChange={(e) => setFlyFrom(e.target.value)}>
              <option value="best">
                Cheaper of {airports.home} / {airports.alt}
              </option>
              <option value={airports.home}>{airports.home} only</option>
              <option value={airports.alt}>{airports.alt} only</option>
            </select>
          </label>
        )}
        <label className="text-xs">
          Arrive from
          <input type="date" className={`${input} w-full`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs">
          Arrive to
          <input type="date" className={`${input} w-full`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs">
          Activity
          <select className={`${input} w-full`} value={tag} onChange={(e) => setTag(e.target.value as Tag | "")}>
            <option value="">Any</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {tagDisplay(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Unit
          <select className={`${input} w-full`} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">All</option>
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Country
          <select
            className={`${input} w-full`}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setState("");
            }}
          >
            <option value="">All</option>
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          State
          <select className={`${input} w-full`} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Max lodging (USD)
          <input type="number" min={0} className={`${input} w-full`} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={drivableOnly} onChange={(e) => setDrivableOnly(e.target.checked)} />
          Drivable only
        </label>
        <p className="text-sm text-black/60 dark:text-white/60">
          {shown.length} of {rows.length}
        </p>
      </div>

      <div className="inline-flex overflow-hidden rounded border border-black/20 text-sm dark:border-white/25" role="tablist">
        {(["table", "map"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`px-3 py-1 capitalize ${view === v ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "map" ? (
        <ListingsMap rows={shown.map((r) => ({ ...r, travelSummary: travelSummary(r) }))} origin={origin} />
      ) : (

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-black/5 dark:bg-white/10">
            <tr>
              {th("score", "Score", "text-right")}
              {th("arrivalDate", "Arrival")}
              {th("arrivalDate", "In", "text-right")}
              {th("property", "Property")}
              {th("location", "Location")}
              {th("unitType", "Unit")}
              {th("priceUsd", "Lodging", "text-right")}
              {th("travelUsd", "Travel", "text-right")}
              {th("totalUsd", "Total", "text-right")}
              {th("driveHours", "Drive")}
              {th("distanceMiles", "Distance", "text-right")}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-black/10 align-top dark:border-white/10">
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums" title={scoreTitle(r)}>
                  {r.score == null ? "—" : Math.round(r.score)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(r.arrivalDate)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" suppressHydrationWarning>
                  {daysUntil(r.arrivalDate)}d
                </td>
                <td className="px-2 py-1.5">
                  {r.property}
                  <TagChips tags={r.tags} untagged={r.untagged} />
                </td>
                <td className="px-2 py-1.5">{[r.city, r.state, r.country].filter(Boolean).join(", ")}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{r.unitType}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(r.priceUsd)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {fmtUsd(r.travelUsd)}
                  <TravelNote r={r} tickets={ticketCount} home={airports.home} flyFrom={flyFrom} />
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmtUsd(r.totalUsd)}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {r.geocodeStatus === "ok" ? (
                    <>
                      {fmtHours(r.driveHours)}
                      {r.isDrivable && (
                        <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">drivable</span>
                      )}
                    </>
                  ) : r.geocodeStatus === "failed" ? (
                    <Link
                      href="/properties"
                      title="Location could not be found. Set it manually on the Properties page."
                      className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800"
                    >
                      Not located
                    </Link>
                  ) : (
                    <span className="text-xs text-amber-700">pending</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" title={`Straight line from ${origin.label}`}>
                  {fmtMiles(r.distanceMiles)}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center text-black/50">
                  No listings match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function travelSummary(r: { travelMode: "drive" | "fly" | null; driveHours: number | null; fare: FareInfo }) {
  if (r.travelMode === "drive") return `drive ${fmtHours(r.driveHours)}`;
  const f = r.fare;
  if (f && "iata" in f) return `✈ ${f.iata} · ${f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`}`;
  return r.travelMode === "fly" ? "✈ est." : "";
}

function scoreTitle(r: { costScore: number | null; activityScore: number }) {
  return r.costScore == null
    ? "No cost yet (location unknown)"
    : `Cost score ${Math.round(r.costScore)} · Activity score ${Math.round(r.activityScore)}`;
}

function TravelNote({
  r,
  tickets,
  home,
  flyFrom,
}: {
  r: { travelMode: "drive" | "fly" | null; fareSource: "quote" | "estimate" | null; fare: FareInfo };
  tickets: number;
  home: string;
  flyFrom: string;
}) {
  if (!r.travelMode) return null;
  if (r.travelMode === "drive") return <div className={muted}>gas</div>;
  const f = r.fare;
  if (r.fareSource === "quote" && f && "iata" in f) {
    const scaled = tickets !== f.seats;
    const label = `✈ ${f.origin && f.origin !== home ? `${f.origin}→` : ""}${f.iata} · ${f.airline}`;
    const others = Object.values(f.byOrigin ?? {}).filter((o) => o.origin !== f.origin);
    const stops =
      f.stops === 0
        ? "nonstop"
        : f.layovers?.length
          ? f.layovers.map((l) => `${l.iata} ${fmtMinutes(l.minutes)}${l.overnight ? " overnight" : ""}`).join(", ")
          : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
    const title = [
      `${f.airline}: $${Math.round(f.fareUsd)} round trip for ${f.seats} seats`,
      f.stops > 0 && `${f.stops} stop${f.stops > 1 ? "s" : ""} each way${f.layovers ? "" : " (layover times not recorded yet)"}`,
      f.durationMin > 0 && `${fmtMinutes(f.durationMin)} outbound`,
      f.layoverUsd > 0.5 && `layover time counted as $${Math.round(f.layoverUsd)} (both ways)`,
      f.extraDriveHours > 0.05 &&
        `+${fmtHours(f.extraDriveHours)} drive vs ${f.nearestIata} each way, counted as $${Math.round(f.extraDriveUsd)}`,
      f.nonstop && `cheapest nonstop: ${f.nonstop.iata} ${f.nonstop.airline} $${Math.round(f.nonstop.fareUsd)}`,
      f.originExtraUsd > 0.5 && `flying from ${f.origin}: drive there and back + parking counted as $${Math.round(f.originExtraUsd)}`,
      ...others.map(
        (o) => `from ${o.origin}: $${Math.round(originCost(o))} all-in (${o.iata}, ${o.stops === 0 ? "nonstop" : `${o.stops} stop`})`,
      ),
      scaled && `scaled to ${tickets} seats`,
      `priced ${fmtDate(f.fetchedAt.slice(0, 10))}`,
    ]
      .filter(Boolean)
      .join("\n");
    return (
      <div className={`${muted} max-w-56 whitespace-normal`} title={title}>
        {f.searchUrl ? (
          <a className="underline decoration-dotted" href={f.searchUrl} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )}
        <div className={f.stops === 0 ? "text-green-700 dark:text-green-400" : ""}>
          {f.stops > 0 && f.layovers?.length ? `${f.stops} stop${f.stops > 1 ? "s" : ""}: ` : ""}
          {stops}
          {f.durationMin > 0 && ` · ${fmtMinutes(f.durationMin)}`}
        </div>
        {f.nonstop && (
          <div>
            nonstop {f.nonstop.iata} {fmtUsd(f.nonstop.fareUsd)}
          </div>
        )}
        {f.extraDriveHours > 0.05 && <div>+{fmtHours(f.extraDriveHours)} drive vs {f.nearestIata}</div>}
        {f.originExtraUsd > 0.5 && (
          <div>
            +{fmtUsd(f.originExtraUsd)} {f.origin} drive &amp; parking
          </div>
        )}
        {others.map((o) => (
          <div key={o.origin}>
            vs {o.origin} {fmtUsd(originCost(o))}
          </div>
        ))}
        {scaled && <div>≈ {tickets} seats</div>}
      </div>
    );
  }
  const none = f && "status" in f && f.status === "none";
  const notFromHere = flyFrom !== "best" && !f;
  return (
    <div className={muted}>
      {none ? "no flights found · est." : notFromHere ? `not priced from ${flyFrom} yet · est.` : `${tickets} flights, est.`}
    </div>
  );
}

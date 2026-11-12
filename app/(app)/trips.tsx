"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { TAGS, TAG_EMOJI, TAG_LABELS, type Tag } from "@/lib/tags/constants";
import { scoreListings, type ScoreSettings } from "@/lib/scoring";
import { fareFrom } from "@/lib/flights/pick";
import { rampColor, scoreScale } from "@/lib/map";
import { Hint, Spinner } from "@/components/ui";
import { DateRangePicker, overlaps, stayDayCounts } from "./date-picker";
import { flightsUrl, travelSummary, type Row, type Trip } from "./travel";
import TripCards from "./trip-cards";
import TripTable, { type Sort } from "./trip-table";
import { fromQuery, LIST_KEY, toQuery, type Filters } from "./filter-url";

// MapLibre touches `window`, so the map only loads in the browser
const ListingsMap = dynamic(() => import("./listings-map"), {
  ssr: false,
  loading: () => (
    <div className="card flex h-[70vh] min-h-[420px] items-center justify-center gap-2 text-sm text-muted">
      <Spinner /> Loading map…
    </div>
  ),
});

const PRESETS: { label: string; sort: Sort }[] = [
  { label: "Best score", sort: { key: "score", dir: -1 } },
  { label: "Cheapest total", sort: { key: "totalUsd", dir: 1 } },
  { label: "Soonest", sort: { key: "arrivalDate", dir: 1 } },
  { label: "Closest", sort: { key: "distanceMiles", dir: 1 } },
  { label: "Shortest drive", sort: { key: "driveHours", dir: 1 } },
  { label: "Cheapest stay", sort: { key: "priceUsd", dir: 1 } },
  { label: "Cheapest travel", sort: { key: "travelUsd", dir: 1 } },
  { label: "Most expensive", sort: { key: "totalUsd", dir: -1 } },
  { label: "Latest", sort: { key: "arrivalDate", dir: -1 } },
  { label: "Lowest score", sort: { key: "score", dir: 1 } },
];

const VIEWS = [
  { id: "cards", label: "Cards", icon: "▦" },
  { id: "map", label: "Map", icon: "🗺" },
  { id: "table", label: "Table", icon: "☰" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const VIEW_KEY = "trip-finder:view";


export default function Trips({
  rows: raw,
  origin,
  airports,
  scoreSettings,
  admin,
  query,
  previousList,
}: {
  previousList: string | null; // date of the list "New" is measured against
  query: Record<string, string | string[] | undefined>;
  rows: Row[];
  origin: { label: string; lat: number; lng: number };
  airports: { home: string; alt: string };
  scoreSettings: ScoreSettings;
  admin: boolean;
}) {
  const DEFAULTS: Filters = {
    tickets: String(scoreSettings.tickets),
    flyFrom: "best",
    dates: { from: "", to: "" },
    tag: "",
    unit: "",
    country: "",
    state: "",
    drivableOnly: false,
    newOnly: false,
    dropsOnly: false,
  };
  const defaults = { filters: DEFAULTS, sort: PRESETS[0].sort };
  const [initial] = useState(() => fromQuery(query, defaults));
  const [f, setF] = useState<Filters>(initial.filters);
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const [sort, setSort] = useState<Sort>(initial.sort);
  const qs = toQuery(f, sort, defaults);
  // The address is the source of truth on arrival: Back can show a cached render from before the
  // filters were set, so read them from the address once, then keep the address in step.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (synced) return;
    const here = window.location.search;
    if (here !== qs) {
      const fromHere = fromQuery(Object.fromEntries(new URLSearchParams(here)), defaults);
      setF(fromHere.filters); // eslint-disable-line react-hooks/set-state-in-effect -- restore after hydration
      setSort(fromHere.sort);
    }
    setSynced(true);
  }, [synced, qs]); // eslint-disable-line react-hooks/exhaustive-deps -- defaults is rebuilt each render
  useEffect(() => {
    if (!synced) return;
    if (window.location.search !== qs) window.history.replaceState(null, "", `${window.location.pathname}${qs}`);
    try {
      sessionStorage.setItem(LIST_KEY, `/${qs}`);
    } catch {}
  }, [qs, synced]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [more, setMore] = useState(() => !!(initial.filters.unit || initial.filters.country || initial.filters.state || initial.filters.tickets !== DEFAULTS.tickets));
  const [view, setViewState] = useState<View>("cards");
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as View | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved view after hydration
      if (v && VIEWS.some((x) => x.id === v)) setViewState(v);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const ticketCount = Math.min(20, Math.max(1, Math.round(Number(f.tickets)) || scoreSettings.tickets));
  const data = useMemo(() => raw.map((r) => ({ ...r, fare: fareFrom(r.fare, f.flyFrom) })), [raw, f.flyFrom]);
  const rows: Trip[] = useMemo(
    () => scoreListings(data, origin, { ...scoreSettings, tickets: ticketCount }),
    [data, origin, scoreSettings, ticketCount],
  );
  const dayCounts = useMemo(() => stayDayCounts(raw), [raw]);
  const preset = PRESETS.findIndex((p) => p.sort.key === sort.key && p.sort.dir === sort.dir);

  const units = useMemo(() => [...new Set(rows.map((r) => r.unitType))].sort(), [rows]);
  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const states = useMemo(
    () => [...new Set(rows.filter((r) => !f.country || r.country === f.country).map((r) => r.state).filter(Boolean))].sort(),
    [rows, f.country],
  );
  const tagCounts = useMemo(() => {
    const m = new Map<Tag, number>();
    for (const r of rows) for (const t of r.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [rows]);

  const newCount = useMemo(() => rows.filter((r) => r.isNew).length, [rows]);
  const dropCount = useMemo(() => rows.filter((r) => r.priceDropUsd > 0).length, [rows]);

  const shown = useMemo(() => {
    const val = (r: Trip) => (sort.key === "location" ? `${r.country}${r.state}${r.city}` : r[sort.key]);
    return rows
      .filter(
        (r) =>
          overlaps(r, f.dates) &&
          (!f.drivableOnly || r.isDrivable) &&
          (!f.newOnly || r.isNew) &&
          (!f.dropsOnly || r.priceDropUsd > 0) &&
          (!f.unit || r.unitType === f.unit) &&
          (!f.country || r.country === f.country) &&
          (!f.state || r.state === f.state) &&
          (!f.tag || r.tags.includes(f.tag)),
      )
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x == null) return 1; // nulls last regardless of direction
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, f, sort]);

  // Same scale as the map pins: each resort's best score among the trips shown, ranked
  const color = useMemo(() => {
    const best = new Map<number, number>();
    for (const r of shown)
      if (r.score != null && r.lat != null) best.set(r.propertyId, Math.max(best.get(r.propertyId) ?? -Infinity, r.score));
    return scoreScale([...best.values()]);
  }, [shown]);

  const moreCount = [f.tickets !== DEFAULTS.tickets, f.unit, f.country, f.state].filter(Boolean).length;
  const anyFilter = JSON.stringify(f) !== JSON.stringify(DEFAULTS);
  const activeCount =
    (Object.keys(DEFAULTS) as (keyof Filters)[]).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(DEFAULTS[k])).length +
    (preset === 0 ? 0 : 1);

  return (
    <div className="space-y-4">
      {/* Phones: filters fold into a bar that sticks under the header and opens as a dropdown */}
      <div className="max-sm:sticky max-sm:top-[calc(env(safe-area-inset-top)+3.4rem)] max-sm:z-[1000]">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/95 p-2 shadow-lg shadow-black/30 backdrop-blur sm:hidden">
        <button
          type="button"
          className={`btn btn-secondary ${filtersOpen ? "border-accent/60 text-accent" : ""}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filters &amp; sort
          {activeCount > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-ink">{activeCount}</span>}
          <span className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
        <span className="text-sm">
          <span className="font-semibold">{shown.length}</span> <span className="text-muted">of {rows.length}</span>
        </span>
        {anyFilter && (
          <button className="link ml-auto text-sm" onClick={() => setF(DEFAULTS)}>
            Clear
          </button>
        )}
      </div>
      <section
        className={`card space-y-3 p-3 sm:p-4 ${
          filtersOpen
            ? "max-sm:absolute max-sm:inset-x-0 max-sm:top-full max-sm:mt-1 max-sm:max-h-[75vh] max-sm:overflow-y-auto max-sm:shadow-2xl max-sm:shadow-black/60"
            : "max-sm:hidden"
        }`}
        aria-label="Filters"
      >
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <label className="block space-y-1">
            <span className="label">Sort by</span>
            <select className="field w-full" value={preset} onChange={(e) => setSort(PRESETS[Number(e.target.value)].sort)}>
              {preset < 0 && <option value={-1}>Custom (from table)</option>}
              {PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1">
            <span className="label">
              When
              <Hint>Shows stays with at least one night between these days. Click the month name to pick the whole month.</Hint>
            </span>
            <DateRangePicker value={f.dates} onChange={(dates) => set({ dates })} counts={dayCounts} className="field w-full" />
          </div>
          {airports.alt ? (
            <label className="col-span-2 block space-y-1 md:col-span-1">
              <span className="label">
                Fly from
                <Hint>
                  {`${airports.alt} is usually cheaper but farther; ${airports.home} is closer. Driving to ${airports.alt} and parking are added to its price.`}
                </Hint>
              </span>
              <select className="field w-full" value={f.flyFrom} onChange={(e) => set({ flyFrom: e.target.value })}>
                <option value="best">
                  Cheaper of {airports.home} / {airports.alt}
                </option>
                <option value={airports.home}>{airports.home} only</option>
                <option value={airports.alt}>{airports.alt} only</option>
              </select>
            </label>
          ) : (
            <span />
          )}
          <label className="flex h-[34px] cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm transition-colors select-none hover:border-white/25 has-[:checked]:border-accent/60 has-[:checked]:text-accent">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={f.drivableOnly}
              onChange={(e) => set({ drivableOnly: e.target.checked })}
            />
            🚗 Drivable only
          </label>
          <button
            type="button"
            className={`btn btn-secondary h-[34px] ${more ? "border-accent/60 text-accent" : ""}`}
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            More filters{moreCount > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-ink">{moreCount}</span>}
            <span className={`transition-transform ${more ? "rotate-180" : ""}`}>▾</span>
          </button>
        </div>

        {more && (
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-4">
            <label className="block space-y-1">
              <span className="label">
                Plane tickets
                <Hint>Seats to buy. Changes flight costs on your screen only; the saved default is unchanged.</Hint>
              </span>
              <input
                type="number"
                min={1}
                max={20}
                className="field w-full"
                value={f.tickets}
                onChange={(e) => set({ tickets: e.target.value })}
              />
            </label>
            <Select label="Unit size" value={f.unit} onChange={(unit) => set({ unit })} options={units} />
            <Select label="Country" value={f.country} onChange={(country) => set({ country, state: "" })} options={countries} />
            <Select label="State" value={f.state} onChange={(state) => set({ state })} options={states} />
          </div>
        )}

        {previousList && (newCount > 0 || dropCount > 0) && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="What changed">
            <span className="text-xs text-muted">Since the {previousList} list:</span>
            {newCount > 0 && (
              <ChipButton active={f.newOnly} onClick={() => set({ newOnly: !f.newOnly, dropsOnly: false })}>
                ✨ New <span className="text-[10px] opacity-60">{newCount}</span>
              </ChipButton>
            )}
            {dropCount > 0 && (
              <ChipButton active={f.dropsOnly} onClick={() => set({ dropsOnly: !f.dropsOnly, newOnly: false })}>
                ↓ Price drops <span className="text-[10px] opacity-60">{dropCount}</span>
              </ChipButton>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Activity">
          <ChipButton active={!f.tag} onClick={() => set({ tag: "" })}>
            Any activity
          </ChipButton>
          {TAGS.filter((t) => tagCounts.get(t)).map((t) => (
            <ChipButton key={t} active={f.tag === t} onClick={() => set({ tag: f.tag === t ? "" : t })}>
              {TAG_EMOJI[t]} {TAG_LABELS[t]}
              <span className="text-[10px] opacity-60">{tagCounts.get(t)}</span>
            </ChipButton>
          ))}
        </div>
        <button className="btn btn-primary w-full sm:hidden" onClick={() => setFiltersOpen(false)}>
          Show {shown.length} trip{shown.length === 1 ? "" : "s"}
        </button>
      </section>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm max-sm:hidden">
          <span className="font-semibold">{shown.length}</span> <span className="text-muted">of {rows.length} trips</span>
          {anyFilter && (
            <button className="link ml-3 text-sm" onClick={() => setF(DEFAULTS)}>
              Clear filters
            </button>
          )}
        </p>
        {view !== "map" && <ScoreLegend />}
        <div className="ml-auto inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-md px-3 py-1 transition-colors ${
                view === v.id ? "bg-accent font-medium text-accent-ink" : "text-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              <span aria-hidden className="mr-1">
                {v.icon}
              </span>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <p className="font-medium">No trips match these filters</p>
          <p className="text-sm text-muted">Try a wider date range or a different activity.</p>
          <button className="btn btn-secondary mt-2" onClick={() => setF(DEFAULTS)}>
            Clear filters
          </button>
        </div>
      ) : view === "map" ? (
        <ListingsMap
          rows={shown.map((r) => ({ ...r, travelSummary: travelSummary(r), flightsUrl: flightsUrl(r) }))}
          origin={origin}
        />
      ) : view === "table" ? (
        <TripTable
          trips={shown}
          color={color}
          sort={sort}
          setSort={setSort}
          tickets={ticketCount}
          home={airports.home}
          flyFrom={f.flyFrom}
          originLabel={origin.label}
          admin={admin}
        />
      ) : (
        <TripCards trips={shown} color={color} home={airports.home} activity={f.tag} />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <select className="field w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-accent bg-accent/15 text-accent" : "border-line text-ink/80 hover:border-white/30 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ScoreLegend() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title="Colors rank the trips shown, same as the map">
      Score color: lower
      <span
        className="inline-block h-2.5 w-20 rounded-full"
        style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }}
      />
      best
    </span>
  );
}

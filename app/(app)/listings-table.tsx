"use client";

import { useMemo, useState } from "react";
import { daysUntil, fmtDate, fmtHours } from "@/lib/format";

export interface Row {
  id: number;
  arrivalDate: string;
  unitType: string;
  priceUsd: number;
  property: string;
  city: string;
  state: string;
  country: string;
  driveHours: number | null;
  isDrivable: boolean;
  geocodeStatus: string;
}

type SortKey = "arrivalDate" | "property" | "location" | "unitType" | "priceUsd" | "driveHours";

const input = "rounded border border-black/20 bg-transparent px-2 py-1 text-sm dark:border-white/25";

export default function ListingsTable({ rows }: { rows: Row[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [drivableOnly, setDrivableOnly] = useState(false);
  const [unit, setUnit] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "arrivalDate", dir: 1 });

  const units = useMemo(() => [...new Set(rows.map((r) => r.unitType))].sort(), [rows]);
  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const states = useMemo(
    () => [...new Set(rows.filter((r) => !country || r.country === country).map((r) => r.state).filter(Boolean))].sort(),
    [rows, country],
  );

  const shown = useMemo(() => {
    const max = maxPrice ? Number(maxPrice) : Infinity;
    const val = (r: Row) =>
      sort.key === "location" ? `${r.country}${r.state}${r.city}` : (r[sort.key as keyof Row] as string | number | null);
    return rows
      .filter(
        (r) =>
          (!from || r.arrivalDate >= from) &&
          (!to || r.arrivalDate <= to) &&
          (!drivableOnly || r.isDrivable) &&
          (!unit || r.unitType === unit) &&
          (!country || r.country === country) &&
          (!state || r.state === state) &&
          r.priceUsd <= max,
      )
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x == null) return 1; // nulls last regardless of direction
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, from, to, drivableOnly, unit, country, state, maxPrice, sort]);

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={`px-2 py-2 text-left font-medium ${cls}`}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <label className="text-xs">
          Arrive from
          <input type="date" className={`${input} w-full`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs">
          Arrive to
          <input type="date" className={`${input} w-full`} value={to} onChange={(e) => setTo(e.target.value)} />
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
          Max price ($)
          <input
            type="number"
            min={0}
            className={`${input} w-full`}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={drivableOnly} onChange={(e) => setDrivableOnly(e.target.checked)} />
          Drivable only
        </label>
        <p className="text-sm text-black/60 dark:text-white/60">
          {shown.length} of {rows.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-black/5 dark:bg-white/10">
            <tr>
              {th("arrivalDate", "Arrival")}
              <th className="px-2 py-2 text-right font-medium">In</th>
              {th("property", "Property")}
              {th("location", "Location")}
              {th("unitType", "Unit")}
              {th("priceUsd", "Price", "text-right")}
              {th("driveHours", "Drive")}
              <th className="px-2 py-2 text-left font-medium">Drivable</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(r.arrivalDate)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" suppressHydrationWarning>
                  {daysUntil(r.arrivalDate)}d
                </td>
                <td className="px-2 py-1.5">{r.property}</td>
                <td className="px-2 py-1.5">{[r.city, r.state, r.country].filter(Boolean).join(", ")}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{r.unitType}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">${r.priceUsd}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {r.geocodeStatus === "ok" ? (
                    fmtHours(r.driveHours)
                  ) : r.geocodeStatus === "failed" ? (
                    <a
                      href="/properties"
                      title="Location could not be found. Set it manually on the Properties page."
                      className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800"
                    >
                      Not located
                    </a>
                  ) : (
                    <span className="text-xs text-amber-700">pending</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {r.isDrivable ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">Drivable</span>
                  ) : (
                    <span className="text-xs text-black/40 dark:text-white/40">—</span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-black/50">
                  No listings match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

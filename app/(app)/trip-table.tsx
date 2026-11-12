"use client";

import Link from "next/link";
import { daysUntil, fmtDate, fmtHours, fmtMiles, fmtUsd } from "@/lib/format";
import { TagChips } from "./tag-chips";
import { placeLine, ScoreBadge, scoreTitle, TravelNote, type Trip } from "./travel";

export type SortKey =
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
export type Sort = { key: SortKey; dir: 1 | -1 };

// first click on a column: best score first, everything else low to high / A to Z
const FIRST_DIR: Partial<Record<SortKey, 1 | -1>> = { score: -1 };

export default function TripTable({
  trips,
  color,
  sort,
  setSort,
  tickets,
  home,
  flyFrom,
  originLabel,
  admin,
}: {
  trips: Trip[];
  color: (score: number | null) => string;
  sort: Sort;
  setSort: (s: Sort) => void;
  tickets: number;
  home: string;
  flyFrom: string;
  originLabel: string;
  admin: boolean;
}) {
  const th = (key: SortKey, label: string, cls = "") => {
    const active = sort.key === key;
    return (
      <th className={`px-2 py-2.5 text-left font-medium ${cls}`} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          className={`group inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-accent ${active ? "text-accent" : ""}`}
          title={`Sort by ${label.toLowerCase()}`}
          onClick={() => setSort({ key, dir: active ? (-sort.dir as 1 | -1) : (FIRST_DIR[key] ?? 1) })}
        >
          {label}
          <span className={active ? "" : "opacity-30 group-hover:opacity-70"}>{active ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            {th("score", "Score", "text-right")}
            {th("arrivalDate", "Arrival")}
            {th("arrivalDate", "In", "text-right")}
            {th("property", "Resort")}
            {th("location", "Location")}
            {th("unitType", "Unit")}
            {th("priceUsd", "Stay", "text-right")}
            {th("travelUsd", "Travel", "text-right")}
            {th("totalUsd", "Total", "text-right")}
            {th("driveHours", "Drive")}
            {th("distanceMiles", "Distance", "text-right")}
          </tr>
        </thead>
        <tbody>
          {trips.map((r) => (
            <tr key={r.id} className="border-t border-line/60 align-top transition-colors hover:bg-white/[0.03]">
              <td className="px-2 py-2 text-right" title={scoreTitle(r)}>
                <ScoreBadge score={r.score} color={color(r.score)} size="sm" />
              </td>
              <td className="whitespace-nowrap px-2 py-2">{fmtDate(r.arrivalDate)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted" suppressHydrationWarning>
                {daysUntil(r.arrivalDate)}d
              </td>
              <td className="px-2 py-2">
                <Link href={`/trips/${r.id}`} className="font-medium hover:text-accent hover:underline">
                  {r.property}
                </Link>
                <TagChips tags={r.tags} untagged={r.untagged} />
              </td>
              <td className="px-2 py-2 text-muted">{placeLine(r)}</td>
              <td className="whitespace-nowrap px-2 py-2">{r.unitType}</td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtUsd(r.priceUsd)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                {fmtUsd(r.travelUsd)}
                <TravelNote r={r} tickets={tickets} home={home} flyFrom={flyFrom} />
              </td>
              <td className="px-2 py-2 text-right font-semibold text-accent tabular-nums">{fmtUsd(r.totalUsd)}</td>
              <td className="whitespace-nowrap px-2 py-2">
                {r.geocodeStatus === "ok" ? (
                  <>
                    {fmtHours(r.driveHours)}
                    {r.isDrivable && (
                      <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">drivable</span>
                    )}
                  </>
                ) : r.geocodeStatus === "failed" ? (
                  admin ? (
                    <Link
                      href="/properties"
                      title="Location could not be found. Set it manually on the Properties page."
                      className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/25"
                    >
                      Not located
                    </Link>
                  ) : (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Not located</span>
                  )
                ) : (
                  <span className="text-xs text-amber-300">pending</span>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted" title={`Straight line from ${originLabel}`}>
                {fmtMiles(r.distanceMiles)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

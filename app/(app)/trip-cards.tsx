"use client";

import Link from "next/link";
import { useState } from "react";
import { daysUntil, fmtCountdown, fmtShortDate, fmtUsd, nightsBetween } from "@/lib/format";
import type { Tag } from "@/lib/tags/constants";
import { TagChips } from "./tag-chips";
import { ChangeBadges, placeLine, ScoreBadge, TravelLine, WeatherChip, type Trip } from "./travel";

const PAGE = 48;

export default function TripCards({
  trips,
  color,
  home,
  activity,
}: {
  activity: Tag | "";
  trips: Trip[];
  color: (score: number | null) => string;
  home: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {trips.slice(0, limit).map((r) => (
          <TripCard key={r.id} r={r} color={color(r.score)} home={home} activity={activity} />
        ))}
      </div>
      {trips.length > limit && (
        <div className="flex justify-center">
          <button className="btn btn-secondary" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({trips.length - limit} left)
          </button>
        </div>
      )}
    </div>
  );
}

function TripCard({
  r,
  color,
  home,
  activity,
}: {
  activity: Tag | "";
  r: Trip;
  color: string;
  home: string;
}) {
  const nights = nightsBetween(r.arrivalDate, r.checkoutDate);
  const travelLabel = r.travelMode === "drive" ? "Gas" : "Flights";
  return (
    <article className="card group relative flex min-w-0 flex-col gap-3 p-4 transition-colors hover:border-accent/40 has-[a:focus-visible]:border-accent">
      <header className="flex items-start gap-3">
        <span title={`Score ${r.score == null ? "not available yet" : Math.round(r.score)} out of 100`}>
          <ScoreBadge score={r.score} color={color} size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-snug transition-colors group-hover:text-accent" title={r.property}>
            {/* the link covers the whole card; the Google Flights link sits above it */}
            <Link href={`/trips/${r.id}`} className="after:absolute after:inset-0 after:rounded-[inherit] focus:outline-none">
              {r.property}
            </Link>
          </h3>
          <p className="truncate text-sm text-muted" title={placeLine(r)}>
            {placeLine(r)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold leading-tight text-accent tabular-nums">{fmtUsd(r.totalUsd)}</div>
          <div className="text-[11px] text-muted">whole trip</div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <ChangeBadges r={r} />
        <span>
          📅 {fmtShortDate(r.arrivalDate)} – {fmtShortDate(r.checkoutDate)}
        </span>
        <span className="text-muted">
          {nights} nights · <span suppressHydrationWarning>{fmtCountdown(daysUntil(r.arrivalDate))}</span>
        </span>
        <span className="text-muted">🛏 {r.unitType}</span>
        <WeatherChip c={r.climate} nights={nights} />
      </div>

      <div className="grid grid-cols-3 divide-x divide-line rounded-lg bg-surface-2 text-center text-sm tabular-nums">
        <Cost label="Stay" value={fmtUsd(r.priceUsd)} />
        <Cost label={travelLabel} value={fmtUsd(r.travelUsd)} hint={r.fareSource === "estimate" ? "estimate" : undefined} />
        <Cost label="Total" value={fmtUsd(r.totalUsd)} strong />
      </div>

      <div className="text-sm leading-relaxed">
        <TravelLine r={r} home={home} />
      </div>

      <TagChips tags={r.tags} untagged={r.untagged} max={3} highlight={activity} />

      <div className="mt-auto flex justify-end text-xs font-medium text-muted transition-colors group-hover:text-accent">
        Full details ›
      </div>
    </article>
  );
}

export function Cost({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="px-2 py-1.5">
      <div className="text-[11px] text-muted">
        {label}
        {hint && <span className="text-amber-200/80"> · {hint}</span>}
      </div>
      <div className={strong ? "font-semibold text-ink" : "text-ink/90"}>{value}</div>
    </div>
  );
}

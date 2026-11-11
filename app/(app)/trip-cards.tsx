"use client";

import { useState } from "react";
import { daysUntil, fmtCountdown, fmtMiles, fmtShortDate, fmtUsd, nightsBetween } from "@/lib/format";
import { tagDisplay } from "@/lib/tags/constants";
import { TagChips } from "./tag-chips";
import { placeLine, ScoreBadge, TravelLine, TravelNote, type Trip } from "./travel";

const PAGE = 48;

export default function TripCards({
  trips,
  color,
  tickets,
  home,
  flyFrom,
  originLabel,
}: {
  trips: Trip[];
  color: (score: number | null) => string;
  tickets: number;
  home: string;
  flyFrom: string;
  originLabel: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {trips.slice(0, limit).map((r) => (
          <TripCard key={r.id} r={r} color={color(r.score)} tickets={tickets} home={home} flyFrom={flyFrom} originLabel={originLabel} />
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
  tickets,
  home,
  flyFrom,
  originLabel,
}: {
  r: Trip;
  color: string;
  tickets: number;
  home: string;
  flyFrom: string;
  originLabel: string;
}) {
  const nights = nightsBetween(r.arrivalDate, r.checkoutDate);
  const travelLabel = r.travelMode === "drive" ? "Gas" : "Flights";
  return (
    <article className="card group flex flex-col gap-3 p-4 transition-colors hover:border-accent/40">
      <header className="flex items-start gap-3">
        <span title={`Score ${r.score == null ? "not available yet" : Math.round(r.score)} out of 100`}>
          <ScoreBadge score={r.score} color={color} size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-snug transition-colors group-hover:text-accent" title={r.property}>
            {r.property}
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

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <span>
          📅 {fmtShortDate(r.arrivalDate)} – {fmtShortDate(r.checkoutDate)}
        </span>
        <span className="text-muted">
          {nights} nights · <span suppressHydrationWarning>{fmtCountdown(daysUntil(r.arrivalDate))}</span>
        </span>
        <span className="text-muted">🛏 {r.unitType}</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line rounded-lg bg-surface-2 text-center text-sm tabular-nums">
        <Cost label="Stay" value={fmtUsd(r.priceUsd)} />
        <Cost label={travelLabel} value={fmtUsd(r.travelUsd)} hint={r.fareSource === "estimate" ? "estimate" : undefined} />
        <Cost label="Total" value={fmtUsd(r.totalUsd)} strong />
      </div>

      <div className="text-sm leading-relaxed">
        <TravelLine r={r} home={home} />
      </div>

      <TagChips tags={r.tags} untagged={r.untagged} max={3} />

      <details className="mt-auto text-sm">
        <summary className="w-fit list-none rounded-md text-xs font-medium text-muted transition-colors select-none hover:text-accent [&::-webkit-details-marker]:hidden">
          <span className="inline-block transition-transform group-has-[details[open]]:rotate-90">›</span> Details
        </summary>
        <div className="mt-2 space-y-2 rounded-lg border border-line p-3 text-xs">
          <p>
            <span className="text-muted">Why this score: </span>
            {r.costScore == null ? (
              "cost unknown until the resort is located"
            ) : (
              <>
                cost {Math.round(r.costScore)}/100 (cheaper is higher) · activities {Math.round(r.activityScore)}/100
              </>
            )}
          </p>
          {r.tags.length > 0 && (
            <p>
              <span className="text-muted">Nearby: </span>
              {r.tags.map(tagDisplay).join(" · ")}
            </p>
          )}
          {r.travelMode === "fly" && (
            <div>
              <span className="text-muted">Flight details:</span>
              <TravelNote r={r} tickets={tickets} home={home} flyFrom={flyFrom} />
            </div>
          )}
          <p className="text-muted">
            {fmtMiles(r.distanceMiles)} from {originLabel} as the crow flies
          </p>
        </div>
      </details>
    </article>
  );
}

function Cost({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { currentEmail } from "@/lib/auth";
import { daysUntil, fmtCountdown, fmtHours, fmtMiles, fmtShortDate, fmtUsd, nightsBetween } from "@/lib/format";
import { TAG_EMOJI, TAG_LABELS, type Tag } from "@/lib/tags/constants";
import { getTrip } from "@/lib/trip";
import { Cost } from "../../trip-cards";
import type { ClimateStats } from "@/lib/db/schema";
import { daysOf, rainOnly, SKY, skyOf } from "@/lib/weather/climate";
import { ChangeBadges, flightFacts, placeLine, ScoreBadge, TravelLine, WeatherChip } from "../../travel";
import { BackLink } from "./back-link";
import { ShareButton } from "./share-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// generateMetadata and the page share one load per request
const load = cache((id: number, email: string | null) => getTrip(id, email));

const tripId = async (params: Props["params"]) => {
  const n = Number((await params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = await tripId(params);
  const data = id ? await load(id, await currentEmail()) : null;
  const t = data?.trip ?? data?.stale;
  return { title: t ? `${t.property} · ${fmtShortDate(t.arrivalDate)} | Trip Finder` : "Trip Finder" };
}

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** "Sat, Dec 5" */
const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function TripPage({ params }: Props) {
  const id = await tripId(params);
  if (!id) notFound();
  const data = await load(id, await currentEmail());
  if (!data) notFound();
  const { trip: r, stale, others, activityNotes, settings: s, origin } = data;

  if (!r)
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <BackLink />
        <div className="card space-y-2 p-6">
          <h1 className="text-lg font-semibold">This week isn&apos;t on the current list</h1>
          <p className="text-sm text-muted">
            {stale!.property}, {fmtDay(stale!.arrivalDate)} – {fmtDay(stale!.checkoutDate)} was on an older list and has
            been replaced by a newer one.
          </p>
        </div>
        <OtherWeeks others={others} title={`${stale!.property} on the current list`} empty="None on the current list." />
      </div>
    );

  const nights = nightsBetween(r.arrivalDate, r.checkoutDate);
  const quote = r.travelMode === "fly" && r.fareSource === "quote" && r.fare && "iata" in r.fare ? r.fare : null;
  // Search by name (near the located spot) so the maps app opens the resort's own place page, with reviews
  // Fares are quoted for the whole party; per seat is that total split evenly (no extra searches)
  // (airfare only; the Flights figure also counts layover time and getting to the airport)
  const perSeat = quote && s.tickets > 1 ? quote.fareUsd / quote.seats : null;
  const mapsQuery = `${r.property}, ${[r.city, r.state].filter(Boolean).join(", ")}`;
  const near = r.lat != null ? `&sll=${r.lat},${r.lng}` : "";

  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <BackLink />

      <header className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span title={`Score ${r.score == null ? "not available yet" : Math.round(r.score)} out of 100`}>
            <ScoreBadge score={r.score} color={r.color} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-snug tracking-tight">{r.property}</h1>
            <p className="text-sm text-muted">{placeLine(r)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <ChangeBadges r={r} />
          <span>
            📅 {fmtDay(r.arrivalDate)} – {fmtDay(r.checkoutDate)}
          </span>
          <span className="text-muted">
            {nights} nights · <span suppressHydrationWarning>{fmtCountdown(daysUntil(r.arrivalDate))}</span>
          </span>
          <span className="text-muted">🛏 {r.unitType}</span>
          <WeatherChip r={r} nights={nights} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-line rounded-lg bg-surface-2 text-center text-sm tabular-nums">
          <Cost label="Stay" value={fmtUsd(r.priceUsd)} />
          <Cost
            label={r.travelMode === "drive" ? "Gas" : "Flights"}
            value={fmtUsd(r.travelUsd)}
            hint={r.fareSource === "estimate" ? "estimate" : undefined}
          />
          <Cost label="Total" value={fmtUsd(r.totalUsd)} strong />
        </div>
        {(r.priceDropUsd > 0 || perSeat) && (
          <p className="text-xs text-muted">
            {r.priceDropUsd > 0 && (
              <span className="text-emerald-300">
                Stay is {fmtUsd(r.priceDropUsd)} cheaper than on the previous list (was {fmtUsd(r.priceUsd + r.priceDropUsd)}).{" "}
              </span>
            )}
            {perSeat && (
              <>
                Airfare is about {fmtUsd(perSeat)} per seat ({s.tickets} seats{s.lapInfants > 0 ? " + lap infant" : ""}).
              </>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <ShareButton
            title={r.property}
            text={`${r.property}, ${fmtDay(r.arrivalDate)} – ${fmtDay(r.checkoutDate)}: about ${fmtUsd(r.totalUsd)} all in`}
          />
          {quote?.searchUrl && (
            <a className="btn btn-primary" href={quote.searchUrl} target="_blank" rel="noreferrer">
              ✈ Google Flights ↗
            </a>
          )}
        </div>
      </header>

      <Section title={r.travelMode === "drive" ? "🚗 Getting there" : "✈ Getting there"}>
        {(r.travelMode !== "fly" || quote) && (
          <p>
            <TravelLine r={r} home={s.originAirport} />
          </p>
        )}
        {r.travelMode === "drive" && (
          <p className="text-muted">
            {fmtHours(r.driveHours)} each way from {origin.label}. Gas for the round trip is about {fmtUsd(r.travelUsd)} at{" "}
            {s.mpg} mpg and ${s.gasPriceUsd.toFixed(2)}/gal.
          </p>
        )}
        {quote && (
          <ul className="list-disc space-y-0.5 pl-5 text-muted">
            {flightFacts(quote, s.tickets).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {r.travelMode === "fly" && !quote && (
          <p className="text-muted">
            ✈ Flight cost is estimated from the distance ({s.tickets} seat{s.tickets === 1 ? "" : "s"}). Real fares are
            looked up after each new list arrives.
          </p>
        )}
        <p className="text-muted">
          {fmtMiles(r.distanceMiles)} from {origin.label} as the crow flies ·{" "}
          <a className="link" href={`https://maps.apple.com/?q=${encodeURIComponent(mapsQuery)}${near}`} target="_blank" rel="noreferrer">
            Apple Maps ↗
          </a>{" "}
          ·{" "}
          <a
            className="link"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
            target="_blank"
            rel="noreferrer"
          >
            Google Maps ↗
          </a>
        </p>
      </Section>

      {r.forecast ? (
        <WeatherSection c={r.forecast} nights={nights} typical={r.climate} arrival={r.arrivalDate} />
      ) : (
        r.climate && <WeatherSection c={r.climate} nights={nights} />
      )}

      <Section title="🎯 Things to do nearby">
        {r.tags.length === 0 ? (
          <p className="text-muted">
            {r.untagged ? "Nearby activities haven't been checked yet." : "Nothing on our activity list was found nearby."}
          </p>
        ) : (
          <ul className="space-y-2">
            {r.tags.map((t: Tag) => (
              <li key={t}>
                <span className="font-medium">
                  {TAG_EMOJI[t]} {TAG_LABELS[t]}
                </span>
                {activityNotes[t] && <div className="text-xs text-muted">{capitalize(activityNotes[t])}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="⭐ Why this score">
        {r.costScore == null ? (
          <p className="text-muted">No cost yet, because the resort hasn&apos;t been found on the map.</p>
        ) : (
          <p>
            Cost <b>{Math.round(r.costScore)}</b>/100 (cheaper is higher) · Activities <b>{Math.round(r.activityScore)}</b>/100.{" "}
            <span className="text-muted">
              <Link className="link" href="/guide">
                How scores work
              </Link>
            </span>
          </p>
        )}
        <p className="text-xs text-muted">Exchange inventory #{r.inventoryNumber}</p>
      </Section>

      <OtherWeeks others={others} title="Other weeks at this resort" />
    </article>
  );
}

/** Real forecast when the stay is within 16 days (with typical weather for comparison), else typical weather. */
function WeatherSection({
  c,
  nights,
  typical,
  arrival,
}: {
  c: ClimateStats;
  nights: number;
  typical?: ClimateStats | null;
  arrival?: string; // set when `c` is a forecast
}) {
  const isForecast = arrival != null;
  const of = isForecast ? c.days : nights;
  const sky = SKY[skyOf(c)];
  const stats = [
    { label: "High", value: `${Math.round(c.highF)}°` },
    { label: "Low", value: `${Math.round(c.lowF)}°` },
    { label: "Rainy days", value: `${daysOf(rainOnly(c), of)} of ${of}` },
    ...(c.snowFrac > 0.02 ? [{ label: "Snowy days", value: `${daysOf(c.snowFrac, of)} of ${of}` }] : []),
    { label: "Cloud cover", value: `${c.cloudPct}%` },
  ];
  return (
    <Section title={`${sky.emoji} ${isForecast ? "Forecast" : "Typical weather"}: ${sky.label.toLowerCase()}`}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
        {stats.map((x) => (
          <div key={x.label} className="rounded-lg bg-surface-2 px-2 py-1.5 text-center">
            <div className="text-[11px] text-muted">{x.label}</div>
            <div className="font-medium tabular-nums">{x.value}</div>
          </div>
        ))}
      </div>
      {isForecast ? (
        <p className="text-xs text-muted">
          {c.days < nights
            ? `The forecast reaches the first ${c.days} of ${nights} days (${fmtDay(arrival)} onward); the rest isn't forecast yet.`
            : "Forecast for the whole stay."}{" "}
          Updated every few hours; forecasts more than a week out can still change a lot.
          {typical && (
            <>
              {" "}
              Typical for these dates: {SKY[skyOf(typical)].emoji} {SKY[skyOf(typical)].label.toLowerCase()}, highs around{" "}
              {Math.round(typical.highF)}°.
            </>
          )}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Averages for these same dates over {c.years}, not a forecast. A real forecast shows up here once the trip is
          within 16 days.
        </p>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2 p-4 text-sm leading-relaxed sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function OtherWeeks({
  others,
  title,
  empty,
}: {
  others: { id: number; arrivalDate: string; checkoutDate: string; unitType: string; totalUsd: number | null; score: number | null; color: string }[];
  title: string;
  empty?: string;
}) {
  if (!others.length && !empty) return null;
  return (
    <Section title={title}>
      {others.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="-mx-2">
          {others.map((o) => (
            <li key={o.id}>
              <Link
                href={`/trips/${o.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
              >
                <ScoreBadge score={o.score} color={o.color} size="sm" />
                <span className="flex-1">
                  {fmtDay(o.arrivalDate)} – {fmtDay(o.checkoutDate)}
                  <span className="text-muted"> · {o.unitType}</span>
                </span>
                <span className="font-medium tabular-nums text-accent">{fmtUsd(o.totalUsd)}</span>
                <span className="text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

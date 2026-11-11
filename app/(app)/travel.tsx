import { fmtDate, fmtHours, fmtMinutes, fmtUsd } from "@/lib/format";
import type { FareInfo } from "@/lib/flights/fares";
import { originCost } from "@/lib/flights/pick";
import type { Scored } from "@/lib/scoring";
import type { Tag } from "@/lib/tags/constants";

export interface Row {
  id: number;
  propertyId: number;
  arrivalDate: string;
  checkoutDate: string;
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

export type Trip = Row & Scored;

const muted = "text-xs text-muted";

export const placeLine = (r: { city: string; state: string; country: string }) =>
  [r.city, r.state, r.country].filter(Boolean).join(", ");

export function ScoreBadge({ score, color, size = "md" }: { score: number | null; color: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-12 w-12 text-lg rounded-xl" : size === "md" ? "h-8 w-10 text-sm rounded-lg" : "h-6 w-8 text-xs rounded-md";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold text-white tabular-nums shadow-sm shadow-black/40 ${dims}`}
      style={{ background: color }}
    >
      {score == null ? "—" : Math.round(score)}
    </span>
  );
}

export function travelSummary(r: { travelMode: "drive" | "fly" | null; driveHours: number | null; fare: FareInfo }) {
  if (r.travelMode === "drive") return `drive ${fmtHours(r.driveHours)}`;
  const f = r.fare;
  if (f && "iata" in f) return `✈ ${f.iata} · ${f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`}`;
  return r.travelMode === "fly" ? "✈ est." : "";
}

export function scoreTitle(r: { costScore: number | null; activityScore: number }) {
  return r.costScore == null
    ? "No cost yet (location unknown)"
    : `Cost score ${Math.round(r.costScore)} · Activity score ${Math.round(r.activityScore)}`;
}

export const flightsUrl = (r: Trip) => (r.travelMode === "fly" && r.fare && "searchUrl" in r.fare ? r.fare.searchUrl : null);

/** One-line travel summary for a trip card. */
export function TravelLine({ r, home }: { r: Trip; home: string }) {
  if (r.geocodeStatus !== "ok")
    return <span className="text-amber-300/90">📍 Still finding this resort on the map, so travel isn&apos;t priced yet</span>;
  if (r.travelMode === "drive")
    return (
      <span>
        🚗 {fmtHours(r.driveHours)} drive · {Math.round(r.driveMiles ?? 0).toLocaleString()} mi
        <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">drivable</span>
      </span>
    );
  const f = r.fare;
  if (r.fareSource === "quote" && f && "iata" in f) {
    const stops = f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
    return (
      <span>
        ✈ {f.origin ?? home} → {f.iata} · {f.airline} ·{" "}
        <span className={f.stops === 0 ? "text-emerald-300" : ""}>{stops}</span>
        {f.durationMin > 0 && <span className="whitespace-nowrap"> · {fmtMinutes(f.durationMin)}</span>}
        {f.searchUrl && (
          <a className="link ml-2 whitespace-nowrap" href={f.searchUrl} target="_blank" rel="noreferrer">
            Google Flights ↗
          </a>
        )}
      </span>
    );
  }
  const none = f && "status" in f && f.status === "none";
  return (
    <span className="text-muted">
      ✈ {none ? "No flights found, so the cost is a rough estimate" : "Flight cost is an estimate until real fares are looked up"}
    </span>
  );
}

/** Full flight breakdown (table cell and card details). */
export function TravelNote({ r, tickets, home, flyFrom }: { r: Trip; tickets: number; home: string; flyFrom: string }) {
  if (!r.travelMode) return null;
  if (r.travelMode === "drive") return <div className={muted}>gas, round trip</div>;
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
      <div className={`${muted} max-w-64 whitespace-normal`} title={title}>
        {f.searchUrl ? (
          <a className="underline decoration-dotted hover:text-accent" href={f.searchUrl} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )}
        <div className={f.stops === 0 ? "text-emerald-300" : ""}>
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

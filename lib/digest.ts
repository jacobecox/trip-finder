import { getCurrentListings, getSettings } from "@/lib/queries";
import { scoreListings } from "@/lib/scoring";
import { originCost } from "@/lib/flights/pick";
import type { FareInfo } from "@/lib/flights/fares";
import { escapeHtml } from "@/lib/map";
import { fmtDate, fmtHours, fmtUsd } from "@/lib/format";
import type { listingsUpload } from "@/lib/db";

export interface Pick {
  property: string;
  location: string;
  arrivalDate: string;
  checkoutDate: string;
  unitType: string;
  score: number;
  totalUsd: number | null;
  lodgingUsd: number;
  travel: string; // "drive 3h 10m" | "✈ DEN→LAX · Frontier · nonstop" | "✈ est."
  flightsUrl: string | null;
  altNote: string | null; // "COS $1,450 (+$210 for the closer airport)"
  moreDates: number; // other dates at the same resort in the list
}

export interface DigestInput {
  picks: Pick[];
  appUrl: string;
  filename: string;
  listingCount: number;
  geocodeRemaining: number;
  fareRemaining: number;
  autoPrice: string;
}

export const appUrl = () =>
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

function travelText(mode: "drive" | "fly" | null, driveHours: number | null, f: FareInfo, home: string) {
  if (mode === "drive") return `drive ${fmtHours(driveHours)}`;
  if (f && "iata" in f) {
    const from = f.origin && f.origin !== home ? `${f.origin}→` : "";
    const stops = f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
    return `✈ ${from}${f.iata} · ${f.airline} · ${stops}`;
  }
  return mode === "fly" ? "✈ flights estimated" : "";
}

/** Best trip at each of the top resorts (future dates only), same scoring as the listings page. */
export async function topPicks(n = 10): Promise<{ picks: Pick[]; listingCount: number }> {
  const [{ rows }, s] = await Promise.all([getCurrentListings(), getSettings()]);
  const today = new Date().toISOString().slice(0, 10);
  const scored = scoreListings(
    rows.filter((r) => r.arrivalDate >= today),
    { lat: s.originLat, lng: s.originLng },
    s,
  )
    .filter((r) => r.score != null)
    .sort((a, b) => b.score! - a.score!);

  const byProperty = new Map<number, typeof scored>();
  for (const r of scored) byProperty.set(r.propertyId, [...(byProperty.get(r.propertyId) ?? []), r]);

  const picks: Pick[] = [];
  for (const list of byProperty.values()) {
    if (picks.length >= n) break;
    const r = list[0];
    const f = r.fare;
    let altNote: string | null = null;
    if (r.travelMode === "fly" && f && "byOrigin" in f) {
      const other = Object.values(f.byOrigin).find((o) => o.origin !== f.origin);
      if (other) {
        const diff = originCost(other) - originCost(f);
        altNote = `from ${other.origin}: ${fmtUsd(originCost(other))} for flights${diff > 0 ? ` (+${fmtUsd(diff)})` : ""}`;
      }
    }
    picks.push({
      property: r.property,
      location: [r.city, r.state, r.country].filter(Boolean).join(", "),
      arrivalDate: r.arrivalDate,
      checkoutDate: r.checkoutDate,
      unitType: r.unitType,
      score: r.score!,
      totalUsd: r.totalUsd,
      lodgingUsd: r.priceUsd,
      travel: travelText(r.travelMode, r.driveHours, f, s.originAirport),
      flightsUrl: r.travelMode === "fly" && f && "searchUrl" in f ? f.searchUrl : null,
      altNote,
      moreDates: list.length - 1,
    });
  }
  return { picks, listingCount: rows.length };
}

function statusLines(d: DigestInput) {
  const out: string[] = [];
  if (d.geocodeRemaining > 0)
    out.push(`${d.geocodeRemaining} new resorts are still being located (free map APIs hit their daily limit); they'll show up in the app soon.`);
  if (d.autoPrice === "skipped-not-enough-searches")
    out.push(`Flights aren't priced yet: ${d.fareRemaining} searches needed, more than this month's SerpApi plan has left. Totals use estimates; press "Price flights" after the plan renews.`);
  else if (d.fareRemaining > 0) out.push(`${d.fareRemaining} flight searches are still pending; those totals use estimates.`);
  return out;
}

/** Pure: subject + HTML + text for the top-picks email. */
export function renderDigest(d: DigestInput) {
  const subject = d.picks.length
    ? `Trip Finder: top ${d.picks.length} picks from ${d.filename}`
    : `Trip Finder: ${d.filename} imported`;
  const status = statusLines(d);

  const text = [
    `${d.listingCount} listings imported from ${d.filename}.`,
    ...status,
    "",
    ...d.picks.map((p, i) =>
      [
        `${i + 1}. ${p.property} (${p.location}) · score ${Math.round(p.score)}`,
        `   ${fmtDate(p.arrivalDate)} – ${fmtDate(p.checkoutDate)} · ${p.unitType} · total ${fmtUsd(p.totalUsd)} (lodging ${fmtUsd(p.lodgingUsd)})`,
        `   ${p.travel}${p.altNote ? ` · ${p.altNote}` : ""}${p.moreDates ? ` · +${p.moreDates} more dates` : ""}`,
        p.flightsUrl ? `   flights: ${p.flightsUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    `All listings: ${d.appUrl}`,
  ].join("\n");

  const cell = "padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top";
  const rows = d.picks
    .map(
      (p, i) => `<tr>
        <td style="${cell};font-weight:600;text-align:right;color:#16a34a">${Math.round(p.score)}</td>
        <td style="${cell}">
          <div style="font-weight:600">${i + 1}. ${escapeHtml(p.property)}</div>
          <div style="color:#666;font-size:12px">${escapeHtml(p.location)}</div>
          <div style="font-size:13px;margin-top:2px">${escapeHtml(fmtDate(p.arrivalDate))} – ${escapeHtml(fmtDate(p.checkoutDate))} · ${escapeHtml(p.unitType)}${
            p.moreDates ? ` <span style="color:#666">· +${p.moreDates} more dates</span>` : ""
          }</div>
          <div style="font-size:13px;color:#444;margin-top:2px">${
            p.flightsUrl
              ? `<a href="${escapeHtml(p.flightsUrl)}" style="color:#2563eb">${escapeHtml(p.travel)}</a>`
              : escapeHtml(p.travel)
          }${p.altNote ? ` <span style="color:#666">· ${escapeHtml(p.altNote)}</span>` : ""}</div>
        </td>
        <td style="${cell};text-align:right;white-space:nowrap">
          <div style="font-weight:600">${escapeHtml(fmtUsd(p.totalUsd))}</div>
          <div style="color:#666;font-size:12px">lodging ${escapeHtml(fmtUsd(p.lodgingUsd))}</div>
        </td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6">
  <div style="max-width:640px;margin:0 auto;padding:20px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
    <h1 style="font-size:20px;margin:0 0 4px">Top picks this month</h1>
    <p style="margin:0 0 12px;color:#555;font-size:14px">${d.listingCount} listings imported from ${escapeHtml(d.filename)}.</p>
    ${status.map((s) => `<p style="margin:0 0 8px;padding:8px 10px;background:#fff7ed;border-radius:6px;font-size:13px;color:#9a3412">${escapeHtml(s)}</p>`).join("")}
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;font-size:14px">${
      rows || `<tr><td style="${cell}">No scored trips yet.</td></tr>`
    }</table>
    <p style="margin:16px 0 0"><a href="${escapeHtml(d.appUrl)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Open Trip Finder</a></p>
  </div></body></html>`;

  return { subject, html, text };
}

export async function buildDigest(state: {
  upload: typeof listingsUpload.$inferSelect;
  geocodeRemaining: number;
  fareRemaining: number;
  autoPrice: string;
}) {
  const { picks, listingCount } = await topPicks(10);
  return renderDigest({
    picks,
    listingCount,
    appUrl: appUrl(),
    filename: state.upload.filename,
    geocodeRemaining: state.geocodeRemaining,
    fareRemaining: state.fareRemaining,
    autoPrice: state.autoPrice,
  });
}

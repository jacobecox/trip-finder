import { getCurrentListings, getSettings } from "@/lib/queries";
import { scoreListings } from "@/lib/scoring";
import { originCost } from "@/lib/flights/pick";
import type { FareInfo } from "@/lib/flights/fares";
import { escapeHtml, scoreScale } from "@/lib/map";
import { daysUntil, fmtCountdown, fmtDate, fmtHours, fmtMinutes, fmtShortDate, fmtUsd, nightsBetween } from "@/lib/format";
import { tagDisplay } from "@/lib/tags/constants";
import type { listingsUpload } from "@/lib/db";

export interface Pick {
  property: string;
  location: string;
  arrivalDate: string;
  checkoutDate: string;
  unitType: string;
  score: number;
  color: string; // same score color the app shows with no filters
  totalUsd: number | null;
  lodgingUsd: number;
  travelUsd: number | null;
  travelMode: "drive" | "fly" | null;
  estimate: boolean; // flights are a distance-based estimate, not a real fare
  travel: string; // "🚗 3h 10m drive · 190 mi" | "✈ COS → SAN · United · 1 stop · 5h 35m" | "✈ Flight cost is an estimate…"
  flightsUrl: string | null;
  altNote: string | null; // "from DEN: $1,450 for flights (+$210)"
  moreDates: number; // other dates at the same resort in the list
  tags: string[]; // "🏖️ Beach", …
}

export interface DigestInput {
  picks: Pick[];
  appUrl: string;
  filename: string;
  listingCount: number;
  resortCount?: number;
  firstDate?: string | null;
  lastDate?: string | null;
  geocodeRemaining: number;
  fareRemaining: number;
  autoPrice: string;
  now?: Date;
}

export const appUrl = () =>
  process.env.APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

function travelText(
  r: { travelMode: "drive" | "fly" | null; driveHours: number | null; driveMiles: number | null; fareSource: string | null },
  f: FareInfo,
  home: string,
) {
  if (r.travelMode === "drive")
    return `🚗 ${fmtHours(r.driveHours)} drive · ${Math.round(r.driveMiles ?? 0).toLocaleString()} mi`;
  if (r.fareSource === "quote" && f && "iata" in f) {
    const stops = f.stops === 0 ? "nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
    return `✈ ${f.origin ?? home} → ${f.iata} · ${f.airline} · ${stops}${f.durationMin > 0 ? ` · ${fmtMinutes(f.durationMin)}` : ""}`;
  }
  return r.travelMode === "fly" ? "✈ Flight cost is an estimate until real fares are looked up" : "";
}

/** Best trip at each of the top resorts (future dates only), same scoring and colors as the listings page. */
export async function topPicks(n = 10) {
  const [{ rows }, s] = await Promise.all([getCurrentListings(), getSettings()]);
  const today = new Date().toISOString().slice(0, 10);
  const future = rows.filter((r) => r.arrivalDate >= today);
  const scored = scoreListings(future, { lat: s.originLat, lng: s.originLng }, s)
    .filter((r) => r.score != null)
    .sort((a, b) => b.score! - a.score!);

  const byProperty = new Map<number, typeof scored>();
  for (const r of scored) byProperty.set(r.propertyId, [...(byProperty.get(r.propertyId) ?? []), r]);
  // The app's unfiltered view colors each resort by its best score among all resorts
  const color = scoreScale([...byProperty.values()].map((l) => l[0].score));

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
      color: color(r.score),
      totalUsd: r.totalUsd,
      lodgingUsd: r.priceUsd,
      travelUsd: r.travelUsd,
      travelMode: r.travelMode,
      estimate: r.fareSource === "estimate",
      travel: travelText(r, f, s.originAirport),
      flightsUrl: r.travelMode === "fly" && r.fareSource === "quote" && f && "searchUrl" in f ? f.searchUrl : null,
      altNote,
      moreDates: list.length - 1,
      tags: r.tags.map(tagDisplay),
    });
  }
  const dates = future.map((r) => r.arrivalDate).sort();
  const checkouts = future.map((r) => r.checkoutDate).sort();
  return {
    picks,
    listingCount: rows.length,
    resortCount: new Set(rows.map((r) => r.propertyId)).size,
    firstDate: dates[0] ?? null,
    lastDate: checkouts.at(-1) ?? null,
  };
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

// Email palette = the app's dark theme. Email clients need tables + inline styles; the gradient
// backgrounds stop Gmail's dark-mode "invert" from flipping the dark design to light.
const C = {
  bg: "#0c0e12",
  surface: "#151820",
  surface2: "#1d212b",
  line: "#2a2f3a",
  ink: "#ecebe8",
  muted: "#9ba1ab",
  accent: "#facc15",
  accentInk: "#1c1600",
  green: "#6ee7b7",
};
const solid = (c: string) => `background-color:${c};background-image:linear-gradient(${c},${c})`;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function cardHtml(p: Pick, i: number, d: DigestInput) {
  const e = escapeHtml;
  const nights = nightsBetween(p.arrivalDate, p.checkoutDate);
  const countdown = fmtCountdown(daysUntil(p.arrivalDate, d.now));
  const short = (iso: string) => fmtShortDate(iso, d.now);
  const travelLabel = p.travelMode === "drive" ? "Gas" : "Flights";
  const cost = (label: string, value: string, opts: { strong?: boolean; hint?: string; last?: boolean } = {}) =>
    `<td width="33%" align="center" style="padding:8px 4px;${opts.last ? "" : `border-right:1px solid ${C.line};`}">
      <div style="font-size:11px;line-height:14px;color:${C.muted}">${label}${
        opts.hint ? `<span style="color:#fde68a"> · ${opts.hint}</span>` : ""
      }</div>
      <div style="font-size:15px;line-height:20px;font-weight:${opts.strong ? 700 : 500};color:${C.ink}">${value}</div>
    </td>`;
  const shownTags = p.tags.slice(0, 4);
  const chips = [
    ...shownTags.map((t) => e(t)),
    ...(p.tags.length > shownTags.length ? [`+${p.tags.length - shownTags.length} more`] : []),
  ]
    .map(
      (t) =>
        `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 8px;border-radius:999px;${solid(C.surface2)};font-size:11px;line-height:16px;color:${C.ink}">${t}</span>`,
    )
    .join("");

  return `<tr><td style="padding:0 0 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${solid(C.surface)};border:1px solid ${C.line};border-radius:14px">
    <tr><td style="padding:16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="52" valign="top" style="padding-right:12px">
          <div style="width:48px;height:48px;line-height:48px;border-radius:12px;${solid(p.color)};color:#ffffff;font-size:18px;font-weight:700;text-align:center">${Math.round(p.score)}</div>
        </td>
        <td valign="top">
          <div style="font-size:11px;line-height:14px;color:${C.muted}">#${i + 1}</div>
          <div style="font-size:16px;line-height:21px;font-weight:600;color:${C.ink}">${e(p.property)}</div>
          <div style="font-size:13px;line-height:18px;color:${C.muted}">${e(p.location)}</div>
        </td>
        <td valign="top" align="right" style="padding-left:8px;white-space:nowrap">
          <div style="font-size:18px;line-height:22px;font-weight:700;color:${C.accent}">${e(fmtUsd(p.totalUsd))}</div>
          <div style="font-size:11px;line-height:14px;color:${C.muted}">whole trip</div>
        </td>
      </tr></table>

      <div style="padding-top:12px;font-size:13px;line-height:19px;color:${C.ink}">
        📅 ${e(short(p.arrivalDate))} – ${e(short(p.checkoutDate))}
        <span style="color:${C.muted}">&nbsp;·&nbsp;${nights} nights · ${e(countdown)}&nbsp;·&nbsp;🛏 ${e(p.unitType)}</span>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;${solid(C.surface2)};border-radius:10px"><tr>
        ${cost("Stay", e(fmtUsd(p.lodgingUsd)))}
        ${cost(travelLabel, e(fmtUsd(p.travelUsd)), { hint: p.estimate ? "estimate" : undefined })}
        ${cost("Total", e(fmtUsd(p.totalUsd)), { strong: true, last: true })}
      </tr></table>

      <div style="padding-top:12px;font-size:13px;line-height:19px;color:${p.estimate ? C.muted : C.ink}">
        ${e(p.travel)}${
          p.flightsUrl
            ? ` &nbsp;<a href="${e(p.flightsUrl)}" style="color:${C.accent};text-decoration:none;white-space:nowrap">Google Flights ↗</a>`
            : ""
        }
        ${p.altNote ? `<div style="font-size:12px;color:${C.muted}">${e(p.altNote)}</div>` : ""}
        ${p.moreDates ? `<div style="font-size:12px;color:${C.muted}">+${p.moreDates} more date${p.moreDates > 1 ? "s" : ""} at this resort</div>` : ""}
      </div>

      ${chips ? `<div style="padding-top:10px;font-size:0;line-height:0">${chips}</div>` : ""}
    </td></tr>
  </table>
</td></tr>`;
}

/** Pure: subject + HTML + text for the top-picks email. */
export function renderDigest(d: DigestInput) {
  const subject = d.picks.length
    ? `Trip Finder: top ${d.picks.length} picks from ${d.filename}`
    : `Trip Finder: ${d.filename} imported`;
  const status = statusLines(d);
  const e = escapeHtml;
  const range =
    d.firstDate && d.lastDate ? `${fmtShortDate(d.firstDate, d.now)} – ${fmtShortDate(d.lastDate, d.now)}` : null;
  const summary = [
    `${d.listingCount} week-long stays`,
    d.resortCount ? `at ${d.resortCount} resorts` : null,
    range ? `· ${range}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const text = [
    `${summary}, from ${d.filename}.`,
    ...status,
    "",
    ...d.picks.map((p, i) =>
      [
        `${i + 1}. ${p.property} (${p.location}) · score ${Math.round(p.score)}`,
        `   ${fmtDate(p.arrivalDate)} – ${fmtDate(p.checkoutDate)} · ${p.unitType}`,
        `   stay ${fmtUsd(p.lodgingUsd)} + ${p.travelMode === "drive" ? "gas" : "flights"} ${fmtUsd(p.travelUsd)}${p.estimate ? " (estimate)" : ""} = ${fmtUsd(p.totalUsd)}`,
        `   ${p.travel}${p.altNote ? ` · ${p.altNote}` : ""}${p.moreDates ? ` · +${p.moreDates} more dates` : ""}`,
        p.tags.length ? `   ${p.tags.join(", ")}` : "",
        p.flightsUrl ? `   flights: ${p.flightsUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    `All trips: ${d.appUrl}`,
  ].join("\n");

  const button = (label: string) =>
    `<a href="${e(d.appUrl)}" style="display:inline-block;${solid(C.accent)};color:${C.accentInk};font-weight:600;font-size:15px;line-height:20px;padding:12px 22px;border-radius:10px;text-decoration:none">${label}</a>`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark only">
<title>${e(subject)}</title>
<style>:root{color-scheme:dark only;supported-color-schemes:dark only}a{color:${C.accent}}</style>
</head>
<body style="margin:0;padding:0;${solid(C.bg)};color:${C.ink};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden">${e(
    d.picks[0]
      ? `#1: ${d.picks[0].property}, ${fmtShortDate(d.picks[0].arrivalDate, d.now)} for ${fmtUsd(d.picks[0].totalUsd)}. ${summary}.`
      : summary,
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="${solid(C.bg)}">
<tr><td align="center" style="padding:20px 12px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT}">

  <tr><td style="padding:0 4px 20px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;border-radius:8px;${solid(C.accent)}">
        <img src="${e(d.appUrl)}/icons/logo-64.png" width="32" height="32" alt="✈" style="display:block;border:0;border-radius:8px;color:${C.accentInk};font-size:16px;line-height:32px">
      </td>
      <td style="padding-left:10px;font-size:16px;font-weight:600;color:${C.ink}">Trip Finder</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 4px 16px">
    <div style="font-size:24px;line-height:30px;font-weight:700;color:${C.ink}">${d.picks.length ? `This month&rsquo;s top ${d.picks.length}` : "New list imported"}</div>
    <div style="padding-top:4px;font-size:14px;line-height:20px;color:${C.muted}">${e(summary)}. The best trip at each resort, ranked by cost and things to do nearby.</div>
    ${status
      .map((s) => `<div style="padding-top:8px;font-size:12px;line-height:17px;color:${C.muted}">ⓘ ${e(s)}</div>`)
      .join("")}
  </td></tr>

  ${
    d.picks.length
      ? d.picks.map((p, i) => cardHtml(p, i, d)).join("")
      : `<tr><td style="padding:16px;${solid(C.surface)};border:1px solid ${C.line};border-radius:14px;color:${C.muted};font-size:14px">No scored trips yet. They'll show up in the app once the resorts are located.</td></tr>`
  }

  <tr><td align="center" style="padding:12px 0 8px">${button("See all trips →")}</td></tr>
  <tr><td align="center" style="padding:16px 4px 0;font-size:11px;line-height:16px;color:${C.muted}">
    Prices are from ${e(d.filename)}; flight prices change daily, so check before booking.<br>
    You get this because you use Trip Finder.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}

export async function buildDigest(state: {
  upload: typeof listingsUpload.$inferSelect;
  geocodeRemaining: number;
  fareRemaining: number;
  autoPrice: string;
}) {
  const top = await topPicks(10);
  return renderDigest({
    ...top,
    appUrl: appUrl(),
    filename: state.upload.filename,
    geocodeRemaining: state.geocodeRemaining,
    fareRemaining: state.fareRemaining,
    autoPrice: state.autoPrice,
  });
}

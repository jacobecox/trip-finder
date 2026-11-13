import { getCurrentListings, getSettings } from "@/lib/queries";
import { listDateOf } from "@/lib/format";
import { scoreListings } from "@/lib/scoring";
import { originCost } from "@/lib/flights/pick";
import type { FareInfo } from "@/lib/flights/fares";
import { escapeHtml, scoreScale } from "@/lib/map";
import { daysUntil, fmtCountdown, fmtDate, fmtHours, fmtMinutes, fmtShortDate, fmtUsd, nightsBetween } from "@/lib/format";
import { tagDisplay } from "@/lib/tags/constants";
import type { listingsUpload } from "@/lib/db";

export interface Pick {
  id?: number; // listing id, for the trip page link
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
  isNew?: boolean; // not on the previous list
  priceDropUsd?: number; // stay got this much cheaper since the previous list
}

/** What changed since the previous list (null for the first list). */
export interface Changes {
  since: string; // "11/3/2026"
  newStays: number;
  drops: number;
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
  changes?: Changes | null;
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
  const [{ rows, previous }, s] = await Promise.all([getCurrentListings(), getSettings()]);
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
      id: r.id,
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
      isNew: r.isNew,
      priceDropUsd: r.priceDropUsd,
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
    changes: previous
      ? {
          since: listDateOf(previous.filename),
          newStays: rows.filter((r) => r.isNew).length,
          drops: rows.filter((r) => r.priceDropUsd > 0).length,
        }
      : null,
  };
}

/** "Since the 11/3/2026 list: 16 new stays · 34 price drops" */
export function changesLine(c: Changes | null | undefined) {
  if (!c) return null;
  const parts = [
    c.newStays ? `${c.newStays} new stay${c.newStays > 1 ? "s" : ""}` : null,
    c.drops ? `${c.drops} price drop${c.drops > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return `Since the ${c.since} list: ${parts.length ? parts.join(" · ") : "no new stays or price drops"}`;
}

const tripUrl = (d: DigestInput, p: Pick) => (p.id == null ? d.appUrl : `${d.appUrl}/trips/${p.id}`);

function statusLines(d: DigestInput) {
  const out: string[] = [];
  if (d.geocodeRemaining > 0)
    out.push(`${d.geocodeRemaining} new resorts are still being located (free map APIs hit their daily limit); they'll show up in the app soon.`);
  if (d.autoPrice === "skipped-not-enough-searches")
    out.push(`Flights aren't priced yet: ${d.fareRemaining} searches needed, more than this month's SerpApi plan has left. Totals use estimates; press "Price flights" after the plan renews.`);
  else if (d.fareRemaining > 0) out.push(`${d.fareRemaining} flight searches are still pending; those totals use estimates.`);
  return out;
}

// Email palette = the app's dark theme. Email clients need tables + inline styles and hex colors.
//
// Gmail's iPhone app in dark mode inverts colors even in an already-dark email: text goes dark,
// borders go light. Gradient backgrounds aren't touched, so every background is a gradient and
// borders are drawn as 1px of a "line" background around the box. Text is fixed with the
// blend-mode trick, active only in Gmail (`u + .body` matches Gmail's wrapper): each text block
// sits in a "screen" span holding a "difference" span, both on black. Gmail inverts those to
// white; difference then flips the inverted text back to its light color and screen drops the
// black around it. Yellow text can't survive that round trip, so Gmail gets white text in place of
// the yellow bits; the button is an image.
const C = {
  bg: "#0c0e12",
  surface: "#151820",
  surface2: "#1d212b",
  line: "#2a2f3a",
  ink: "#ecebe8",
  muted: "#9ba1ab",
  accent: "#facc15",
  accentInk: "#1c1600",
  amber: "#fde68a",
  sky: "#7dd3fc",
  green: "#6ee7b7",
};
const solid = (c: string) => `background-color:${c};background-image:linear-gradient(${c},${c})`;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const GMAIL_CSS = `u + .body .gs{background:#000;mix-blend-mode:screen}
u + .body .gd{background:#000;mix-blend-mode:difference}
u + .body .ya{display:none!important}
u + .body .gw{display:inline!important}`;

/** Light text that stays light in Gmail's dark mode. `inline` for text inside a line or chip. */
const tx = (html: string, style: string, inline = false) =>
  inline
    ? `<span class="gs" style="display:inline-block"><span class="gd" style="display:inline-block;${style}">${html}</span></span>`
    : `<div class="gs"><div class="gd" style="${style}">${html}</div></div>`;

/** Yellow text, swapped for white (bold) in Gmail, where yellow would come out dark. */
const accent = (html: string, style: string) =>
  `<span class="ya" style="color:${C.accent};${style}">${html}</span><span class="gw" style="display:none;mso-hide:all">${tx(
    html,
    `color:#ffffff;${style}`,
    true,
  )}</span>`;

/** A box with a 1px outline drawn as background (CSS borders get inverted by Gmail). */
const box = (inner: string, opts: { bg: string; line?: string; radius: number; pad: string; extra?: string }) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${solid(opts.line ?? C.line)};border-radius:${opts.radius}px;${opts.extra ?? ""}"><tr><td style="padding:1px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${solid(opts.bg)};border-radius:${opts.radius - 1}px"><tr><td style="padding:${opts.pad}">${inner}</td></tr></table>
  </td></tr></table>`;

/** "hsl(96 75% 40%)" (the app's score colors) → hex, which Gmail keeps. */
export function toHex(color: string) {
  const m = color.match(/^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/);
  if (!m) return color;
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function cardHtml(p: Pick, i: number, d: DigestInput) {
  const e = escapeHtml;
  const nights = nightsBetween(p.arrivalDate, p.checkoutDate);
  const countdown = fmtCountdown(daysUntil(p.arrivalDate, d.now));
  const short = (iso: string) => fmtShortDate(iso, d.now);
  const travelLabel = p.travelMode === "drive" ? "Gas" : "Flights";
  const cost = (label: string, value: string, opts: { strong?: boolean; hint?: string } = {}) =>
    `<td width="33%" align="center" style="padding:8px 4px">
      ${tx(
        `${label}${opts.hint ? `<span style="color:${C.amber}"> · ${opts.hint}</span>` : ""}`,
        `font-size:11px;line-height:14px;color:${C.muted}`,
      )}
      ${tx(value, `font-size:15px;line-height:20px;font-weight:${opts.strong ? 700 : 500};color:${C.ink}`)}
    </td>`;
  const shownTags = p.tags.slice(0, 4);
  const chips = [
    ...shownTags.map((t) => e(t)),
    ...(p.tags.length > shownTags.length ? [`+${p.tags.length - shownTags.length} more`] : []),
  ]
    .map(
      (t) =>
        `<span style="display:inline-block;margin:0 4px 4px 0;padding:2px 8px;border-radius:999px;${solid(C.surface2)}">${tx(
          t,
          `font-size:11px;line-height:16px;color:${C.ink}`,
          true,
        )}</span>`,
    )
    .join("");
  const extra = [
    p.altNote ? e(p.altNote) : null,
    p.moreDates ? `+${p.moreDates} more date${p.moreDates > 1 ? "s" : ""} at this resort` : null,
  ].filter(Boolean);

  const inner = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="60" valign="top" style="width:60px;padding-right:12px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;border-radius:12px;${solid(toHex(p.color))}">
              ${tx(String(Math.round(p.score)), "color:#ffffff;font-size:18px;line-height:24px;font-weight:700", true)}
            </td>
          </tr></table>
        </td>
        <td valign="top">
          ${tx(
            `#${i + 1}${
              p.isNew
                ? `&nbsp;&nbsp;<span style="color:${C.sky}">New</span>`
                : p.priceDropUsd
                  ? `&nbsp;&nbsp;<span style="color:${C.green}">↓ ${e(fmtUsd(p.priceDropUsd))} cheaper</span>`
                  : ""
            }`,
            `font-size:11px;line-height:14px;color:${C.muted}`,
          )}
          <a href="${e(tripUrl(d, p))}" style="text-decoration:none">${tx(e(p.property), `font-size:16px;line-height:21px;font-weight:600;color:${C.ink}`)}</a>
          ${tx(e(p.location), `font-size:13px;line-height:18px;color:${C.muted}`)}
        </td>
        <td valign="top" align="right" style="padding-left:8px;white-space:nowrap">
          <div>${accent(e(fmtUsd(p.totalUsd)), "font-size:18px;line-height:22px;font-weight:700")}</div>
          ${tx("whole trip", `font-size:11px;line-height:14px;color:${C.muted}`)}
        </td>
      </tr></table>

      <div style="padding-top:12px">${tx(
        `📅 ${e(short(p.arrivalDate))} – ${e(short(p.checkoutDate))}<span style="color:${C.muted}">&nbsp;·&nbsp;${nights} nights · ${e(countdown)}&nbsp;·&nbsp;🛏 ${e(p.unitType)}</span>`,
        `font-size:13px;line-height:19px;color:${C.ink}`,
      )}</div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;${solid(C.surface2)};border-radius:10px"><tr>
        ${cost("Stay", e(fmtUsd(p.lodgingUsd)))}
        ${cost(travelLabel, e(fmtUsd(p.travelUsd)), { hint: p.estimate ? "estimate" : undefined })}
        ${cost("Total", e(fmtUsd(p.totalUsd)), { strong: true })}
      </tr></table>

      <div style="padding-top:12px">
        ${tx(e(p.travel), `font-size:13px;line-height:19px;color:${p.estimate ? C.muted : C.ink}`)}
        ${
          p.flightsUrl
            ? `<a href="${e(p.flightsUrl)}" style="text-decoration:none;white-space:nowrap">${accent("Google Flights ↗", "font-size:13px;line-height:19px")}</a>`
            : ""
        }
        ${extra.map((x) => tx(x!, `font-size:12px;line-height:17px;color:${C.muted}`)).join("")}
      </div>

      ${chips ? `<div style="padding-top:10px;font-size:0;line-height:0">${chips}</div>` : ""}`;

  return `<tr><td style="padding:0 0 12px">${box(inner, { bg: C.surface, radius: 14, pad: "16px" })}</td></tr>`;
}

/** "DEX Select Availability 11.10.2026 DexSelect.pdf" → "11/10/2026"; today's date if the name has none. */
export { listDateOf };

/**
 * The inbox preview line (next to the subject). Inboxes show the first text in the email, so this
 * hidden line goes first, followed by invisible filler so the page text doesn't run on after it.
 */
export function previewText(d: { picks: Pick[]; listingCount: number; now?: Date }) {
  const [top] = d.picks;
  if (!top) return `${d.listingCount} new stays imported. Open Trip Finder to see them.`;
  const city = top.location.split(", ").slice(0, 2).join(", ");
  const total = top.totalUsd == null ? "" : ` · ${fmtUsd(top.totalUsd)} total`;
  const n = d.picks.length - 1;
  const more = n > 0 ? ` Plus ${n} more pick${n > 1 ? "s" : ""} from ${d.listingCount} stays.` : "";
  return `Top pick: ${top.property} in ${city}, ${fmtShortDate(top.arrivalDate, d.now)}–${fmtShortDate(top.checkoutDate, d.now)}${total}.${more}`;
}
const PREVIEW_FILLER = "&#847;&zwnj;&nbsp;".repeat(90);

/** Pure: subject + HTML + text for the top-picks email. */
export function renderDigest(d: DigestInput) {
  const listDate = listDateOf(d.filename, d.now);
  const subject = d.picks.length
    ? `Trip Finder: top ${d.picks.length} picks ${listDate}`
    : `Trip Finder: new list ${listDate} imported`;
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

  const changes = changesLine(d.changes);
  const text = [
    `${summary}, from ${d.filename}.`,
    ...(changes ? [`${changes}.`] : []),
    ...status,
    "",
    ...d.picks.map((p, i) =>
      [
        `${i + 1}. ${p.property} (${p.location}) · score ${Math.round(p.score)}${p.isNew ? " · NEW" : p.priceDropUsd ? ` · ${fmtUsd(p.priceDropUsd)} cheaper` : ""}`,
        `   ${fmtDate(p.arrivalDate)} – ${fmtDate(p.checkoutDate)} · ${p.unitType}`,
        `   stay ${fmtUsd(p.lodgingUsd)} + ${p.travelMode === "drive" ? "gas" : "flights"} ${fmtUsd(p.travelUsd)}${p.estimate ? " (estimate)" : ""} = ${fmtUsd(p.totalUsd)}`,
        `   ${p.travel}${p.altNote ? ` · ${p.altNote}` : ""}${p.moreDates ? ` · +${p.moreDates} more dates` : ""}`,
        p.tags.length ? `   ${p.tags.join(", ")}` : "",
        p.id != null ? `   details: ${tripUrl(d, p)}` : "",
        p.flightsUrl ? `   flights: ${p.flightsUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    `All trips: ${d.appUrl}`,
  ].join("\n");

  // The button is an image: Gmail's dark mode recolors text, and no text color survives on yellow.
  // Alt text on a yellow background still reads as a button when images are blocked.
  const button = (label: string) =>
    `<a href="${e(d.appUrl)}" style="text-decoration:none;display:inline-block"><img src="${e(d.appUrl)}/icons/email-button.png" width="180" height="44" alt="${label}" style="display:block;border:0;border-radius:10px;${solid(C.accent)};color:${C.accentInk};font-family:${FONT};font-size:15px;font-weight:600;line-height:44px;text-align:center"></a>`;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark only">
<title>${e(subject)}</title>
<style>:root{color-scheme:dark only;supported-color-schemes:dark only}
${GMAIL_CSS}</style>
</head>
<body class="body" style="margin:0;padding:0;${solid(C.bg)};color:${C.ink};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${e(
    previewText(d),
  )}${PREVIEW_FILLER}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="${solid(C.bg)}">
<tr><td align="center" style="padding:20px 12px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${FONT}">

  <tr><td style="padding:0 4px 20px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="32" height="32" style="width:32px;height:32px">
        <img src="${e(d.appUrl)}/icons/logo-64.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px">
      </td>
      <td style="padding-left:10px">${tx("Trip Finder", `font-size:16px;line-height:20px;font-weight:600;color:${C.ink}`)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 4px 16px">
    ${tx(
      d.picks.length ? `Top ${d.picks.length} picks` : "New list imported",
      `font-size:24px;line-height:30px;font-weight:700;color:${C.ink}`,
    )}
    <div style="padding-top:4px">${tx(
      `${e(summary)}. The best trip at each resort, ranked by cost and things to do nearby.`,
      `font-size:14px;line-height:20px;color:${C.muted}`,
    )}</div>
    ${changes ? `<div style="padding-top:8px">${tx(e(changes), `font-size:13px;line-height:18px;color:${C.ink}`)}</div>` : ""}
    ${status.map((s) => `<div style="padding-top:8px">${tx(`ⓘ ${e(s)}`, `font-size:12px;line-height:17px;color:${C.muted}`)}</div>`).join("")}
  </td></tr>

  ${
    d.picks.length
      ? d.picks.map((p, i) => cardHtml(p, i, d)).join("")
      : `<tr><td>${box(tx("No scored trips yet. They&rsquo;ll show up in the app once the resorts are located.", `font-size:14px;color:${C.muted}`), { bg: C.surface, radius: 14, pad: "16px" })}</td></tr>`
  }

  <tr><td align="center" style="padding:12px 0 8px">${button("See all trips →")}</td></tr>
  <tr><td align="center" style="padding:16px 4px 0">${tx(
    `From the list ${e(d.filename)}. Flight prices change daily, so check before booking.<br>You get this because you use Trip Finder.`,
    `font-size:11px;line-height:16px;color:${C.muted};text-align:center`,
  )}</td></tr>

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

/** Pure helpers for the map view: one pin per property, colored by its best listing. */

export interface MapListing {
  id: number;
  propertyId: number;
  property: string;
  city: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
  score: number | null;
}

export interface Pin<T extends MapListing> {
  propertyId: number;
  name: string;
  location: string;
  lat: number;
  lng: number;
  bestScore: number | null;
  listings: T[]; // best score first
}

const byScore = (a: { score: number | null }, b: { score: number | null }) => (b.score ?? -1) - (a.score ?? -1);

/** Groups listings by property; properties without a location are skipped. Best pins come last so they draw on top. */
export function pinsFor<T extends MapListing>(rows: T[]): Pin<T>[] {
  const pins = new Map<number, Pin<T>>();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    let p = pins.get(r.propertyId);
    if (!p) {
      p = {
        propertyId: r.propertyId,
        name: r.property,
        location: [r.city, r.state, r.country].filter(Boolean).join(", "),
        lat: r.lat,
        lng: r.lng,
        bestScore: null,
        listings: [],
      };
      pins.set(r.propertyId, p);
    }
    p.listings.push(r);
  }
  for (const p of pins.values()) {
    p.listings.sort(byScore);
    p.bestScore = p.listings[0].score;
  }
  return [...pins.values()].sort((a, b) => (a.bestScore ?? -1) - (b.bestScore ?? -1));
}

/** t in 0..1 -> red through amber to green. */
export const rampColor = (t: number) => `hsl(${Math.round(Math.max(0, Math.min(1, t)) * 120)} 75% 40%)`;

/**
 * Pin color by rank among the pins shown, not raw score: scores cluster at 50-90 and one very
 * expensive trip squashes a min-max scale, which painted everything green. Gray when unscored.
 */
export function rankColors(pins: { bestScore: number | null }[]): string[] {
  const scored = pins.map((p, i) => [p.bestScore, i] as const).filter(([s]) => s != null);
  scored.sort((a, b) => a[0]! - b[0]!);
  const out = pins.map(() => "#9ca3af");
  scored.forEach(([, i], rank) => (out[i] = rampColor(scored.length > 1 ? rank / (scored.length - 1) : 1)));
  return out;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

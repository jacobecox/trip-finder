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

export const UNSCORED_COLOR = "#9ca3af";

/**
 * Color scale by rank, not raw score: scores cluster at 50-90 and one very expensive trip squashes
 * a min-max scale, which painted everything green. `ref` is the set being ranked (each resort's best
 * score among those shown); a score between two of them lands between their colors, so a resort's
 * other dates shade a bit redder than its best. Ties share a color. Gray when unscored.
 */
export function scoreScale(ref: (number | null)[]): (score: number | null) => string {
  const levels = [...new Set(ref.filter((s): s is number => s != null))].sort((a, b) => a - b);
  return (score) => {
    if (score == null || !levels.length) return UNSCORED_COLOR;
    if (levels.length === 1) return rampColor(1);
    let below = 0;
    while (below < levels.length && levels[below] < score) below++;
    if (levels[below] === score) return rampColor(below / (levels.length - 1));
    // between levels[below-1] and levels[below]
    const lo = levels[below - 1] ?? levels[0];
    const hi = levels[below] ?? levels[levels.length - 1];
    const frac = hi === lo ? 0 : (score - lo) / (hi - lo);
    return rampColor(Math.max(0, below - 1 + frac) / (levels.length - 1));
  };
}

/** Map pin colors: each resort's best score ranked among the resorts shown. */
export function rankColors(pins: { bestScore: number | null }[]): string[] {
  const scale = scoreScale(pins.map((p) => p.bestScore));
  return pins.map((p) => scale(p.bestScore));
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

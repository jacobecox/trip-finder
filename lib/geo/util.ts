export class QuotaError extends Error {
  constructor(service: string) {
    super(`${service} rate/quota limit reached; try again later`);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const last = new Map<string, number>();
/** Spaces calls to one service at least `minMs` apart (per server process). */
export async function throttle(service: string, minMs: number) {
  const wait = (last.get(service) ?? 0) + minMs - Date.now();
  last.set(service, Math.max(Date.now(), (last.get(service) ?? 0) + minMs));
  if (wait > 0) await sleep(wait);
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function distanceKm(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

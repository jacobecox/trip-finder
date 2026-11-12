import { eq } from "drizzle-orm";
import { getDb, listing, property, propertyTag } from "@/lib/db";
import { fareFrom } from "@/lib/flights/pick";
import { scoreScale } from "@/lib/map";
import { getEffectiveSettings, scoreSettingsOf } from "@/lib/prefs";
import { getCurrentListings } from "@/lib/queries";
import { scoreListings } from "@/lib/scoring";
import type { Tag } from "@/lib/tags/constants";

/**
 * One trip for its own page, scored exactly like the list (the cost score is relative to the whole
 * current list, so the whole list is scored). A link from an older list finds no current trip; then
 * `stale` describes the old one and `others` holds that resort's weeks on the current list.
 */
export async function getTrip(id: number, email: string | null) {
  const [{ upload, rows }, { settings: s }] = await Promise.all([getCurrentListings(), getEffectiveSettings(email)]);
  const origin = { label: s.originLabel, lat: s.originLat, lng: s.originLng };
  const trips = scoreListings(
    rows.map((r) => ({ ...r, fare: fareFrom(r.fare, "best") })),
    origin,
    scoreSettingsOf(s),
  );
  const best = new Map<number, number>();
  for (const t of trips)
    if (t.score != null && t.lat != null) best.set(t.propertyId, Math.max(best.get(t.propertyId) ?? -Infinity, t.score));
  const color = scoreScale([...best.values()]);

  const trip = trips.find((t) => t.id === id) ?? null;
  let stale: { property: string; propertyId: number; arrivalDate: string; checkoutDate: string } | null = null;
  if (!trip) {
    const [old] = await getDb()
      .select({
        property: property.name,
        propertyId: property.id,
        arrivalDate: listing.arrivalDate,
        checkoutDate: listing.checkoutDate,
      })
      .from(listing)
      .innerJoin(property, eq(listing.propertyId, property.id))
      .where(eq(listing.id, id));
    if (!old) return null;
    stale = old;
  }
  const propertyId = trip?.propertyId ?? stale!.propertyId;
  const others = trips
    .filter((t) => t.propertyId === propertyId && t.id !== id)
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))
    .map((t) => ({ ...t, color: color(t.score) }));

  const notes = trip
    ? await getDb()
        .select({ tag: propertyTag.tag, osm: propertyTag.osm, evidence: propertyTag.osmEvidence })
        .from(propertyTag)
        .where(eq(propertyTag.propertyId, propertyId))
    : [];
  const activityNotes = Object.fromEntries(
    notes.filter((n) => n.osm && n.evidence).map((n) => [n.tag, n.evidence!]),
  ) as Partial<Record<Tag, string>>;

  return {
    upload,
    trip: trip && { ...trip, color: color(trip.score) },
    stale,
    others,
    activityNotes,
    settings: s,
    origin,
  };
}

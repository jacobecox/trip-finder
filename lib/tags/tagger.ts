import { TAGS, type Tag } from "@/lib/tags/constants";
import { distanceKm, type LatLng } from "@/lib/geo/util";
import { CITY_MIN_POPULATION, RULES, SCENIC_FROM, type Place, type TagRule } from "./rules";
import { TAG_LABELS } from "./constants";

const KM_PER_MILE = 1.609344;
const MAX_NAMES = 3;

export type TagResult = Record<Tag, { present: boolean; evidence: string | null }>;
export type SearchNear = (query: string, center: LatLng, radiusMiles: number) => Promise<Place[]>;

/** Pure: which places satisfy a rule (accepted type, inside the radius, de-duplicated by name). */
export function matches(rule: TagRule, center: LatLng, places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = p.name.trim().toLowerCase();
    if (!key || seen.has(key) || !rule.accept(p)) return false;
    if (distanceKm(center, p) / KM_PER_MILE > rule.radiusMiles) return false;
    seen.add(key);
    return true;
  });
}

/** Pure: tags that come from other information rather than nearby searches. */
export function applyDerived(result: TagResult, city: { name: string; population: number | null }): TagResult {
  const out = { ...result };
  const from = SCENIC_FROM.filter((t) => result[t].present);
  out.scenic = from.length
    ? { present: true, evidence: `from ${from.map((t) => TAG_LABELS[t].toLowerCase()).join(", ")}` }
    : { present: false, evidence: null };
  const pop = city.population;
  out.city = {
    present: pop != null && pop >= CITY_MIN_POPULATION,
    evidence: pop == null ? null : `${city.name}: population ${pop.toLocaleString("en-US")}`,
  };
  return out;
}

/** Runs each rule's searches (stopping early once satisfied) and builds tags with evidence. */
export async function tagLocation(center: LatLng, search: SearchNear): Promise<TagResult> {
  const result = Object.fromEntries(TAGS.map((t) => [t, { present: false, evidence: null }])) as TagResult;
  for (const rule of RULES) {
    if (result[rule.tag].present) continue; // an earlier rule already applied this tag
    let found: Place[] = [];
    for (const q of rule.queries) {
      found = matches(rule, center, [...found, ...(await search(q, center, rule.radiusMiles))]);
      if (found.length >= rule.minCount) break;
    }
    if (found.length >= rule.minCount) {
      const names = found.slice(0, MAX_NAMES).map((p) => p.name);
      result[rule.tag] = { present: true, evidence: `${rule.label} within ${rule.radiusMiles} mi: ${names.join(", ")}` };
    }
  }
  return result;
}

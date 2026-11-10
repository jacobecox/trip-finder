import type { Tag } from "./constants";

export { TAG_LABELS } from "./constants";

export interface Place {
  name: string;
  category: string; // OSM key, e.g. "tourism"
  type: string; // OSM value, e.g. "theme_park"
  lat: number;
  lng: number;
}

export interface TagRule {
  tag: Tag;
  label: string;
  radiusMiles: number;
  /** Nominatim free-text category searches, run in order until minCount is met */
  queries: string[];
  accept: (p: Place) => boolean;
  minCount: number;
}

const is = (p: Place, category: string, ...types: string[]) => p.category === category && types.includes(p.type);
// Water-park "beaches" (e.g. Disney's Getaway Glen) are tagged natural=beach in OSM; require a beach-like name
const BEACHLIKE = /\b(beach|playa|plage|praia|spiaggia|strand|shore|sands?|cove)\b/i;
// Splash pads, public pools and aquatic centres are tagged water_park but aren't destinations
const NOT_A_WATER_PARK = /splash\s*pad|spray\s*(ground|park)|sprayground|aquatic|pool|water\s*wall/i;
const PARKLIKE = /\b(national|state)\s+(park|forest|monument|recreation area|seashore)\b|\bwilderness\b/i;

/** Several rules may feed one tag; any satisfied rule applies it. Radii are in miles. */
export const RULES: TagRule[] = [
  {
    tag: "beach",
    label: "beach",
    radiusMiles: 3,
    queries: ["beach"],
    accept: (p) => is(p, "natural", "beach") && BEACHLIKE.test(p.name),
    minCount: 1,
  },
  {
    tag: "theme_park",
    label: "theme park",
    radiusMiles: 25,
    queries: ["theme park"],
    accept: (p) => is(p, "tourism", "theme_park"),
    minCount: 1,
  },
  {
    tag: "skiing",
    label: "ski area",
    radiusMiles: 20,
    queries: ["ski resort", "ski"],
    accept: (p) =>
      is(p, "landuse", "winter_sports") ||
      p.category === "aerialway" ||
      (is(p, "leisure", "sports_centre", "resort") && /\bski/i.test(p.name)),
    minCount: 1,
  },
  {
    tag: "hiking",
    label: "park / forest",
    radiusMiles: 15,
    queries: ["national park", "national forest", "state park"],
    accept: (p) =>
      is(p, "boundary", "national_park", "protected_area") ||
      (is(p, "leisure", "nature_reserve", "park") && PARKLIKE.test(p.name)),
    minCount: 1,
  },
  {
    tag: "hiking",
    label: "trailhead",
    radiusMiles: 15,
    queries: ["trailhead"],
    accept: (p) => is(p, "highway", "trailhead") || (!["highway"].includes(p.category) && /trailhead/i.test(p.name)),
    minCount: 2,
  },
  {
    tag: "kid_friendly",
    label: "zoo / aquarium / water park",
    radiusMiles: 10,
    queries: ["zoo", "aquarium", "water park"],
    accept: (p) =>
      is(p, "tourism", "zoo", "aquarium") || (is(p, "leisure", "water_park") && !NOT_A_WATER_PARK.test(p.name)),
    minCount: 1,
  },
];

import type { Tag } from "./constants";

export { TAG_LABELS } from "./constants";

export interface Place {
  name: string;
  category: string; // OSM key, e.g. "tourism"
  type: string; // OSM value, e.g. "theme_park"
  lat: number;
  lng: number;
  /** Has a Wikidata/Wikipedia link: a decent proxy for "a real attraction" */
  notable?: boolean;
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
// Small or unnamed places tagged zoo/aquarium (ponds, gardens) need a telling name or a Wikidata link
const ZOOLIKE = /zoo|aquarium|wildlife|safari|animal|bird|reptile|gator|alligator|sea life|marine|tierpark|wildpark|acuario|zool[oó]gico/i;
const PARKLIKE = /\b(national|state|provincial)\s+(park|forest|recreation area|seashore|lakeshore)\b|\bnational\s+grassland\b|\bwilderness\b|\bnationalpark\b|\bparque nacional\b/i;
// Historic sites and beaches that carry park designations but aren't for hiking
const NOT_FOR_HIKING = /historic|historical|memorial|monument|settlement|battlefield|fishing pier|state beach|\bbeach\b|ruins|fort\b|wildlife management/i;
// Ski-ish landuse that isn't downhill skiing
const NOT_A_SKI_AREA =
  /closed|abandoned|former|nordic|\bxc\b|cross[- ]country|snow ?play|tubing|sledding|ski club|skate|snowcat|touring|trails?\b|ravine|lodge|\binn\b/i;

/** Listed city with at least this many people counts as a city trip. */
export const CITY_MIN_POPULATION = 100_000;
/** Scenic is derived from these (no extra lookups). */
export const SCENIC_FROM = ["beach", "hiking", "skiing"] as const;
/** If no beach is found nearby but the town is named for one (Cocoa Beach, Playa del Carmen), trust the name. */
export const BEACH_TOWN = /\b(beach|playa|plage|praia)\b/i;

/**
 * Search-based rules. Several may feed one tag; any satisfied rule applies it. Radii are in miles.
 * Queries use Nominatim's "[key=value]" form, which matches the OSM category exactly instead of
 * names (plain "ski" found "Ski Run Road" and missed Big Sky Resort).
 */
export const RULES: TagRule[] = [
  {
    tag: "beach",
    label: "beach",
    radiusMiles: 3,
    queries: ["[natural=beach]"],
    accept: (p) => is(p, "natural", "beach") && (BEACHLIKE.test(p.name) || !!p.notable),
    minCount: 1,
  },
  {
    tag: "theme_park",
    label: "theme park",
    radiusMiles: 25,
    queries: ["[tourism=theme_park]"],
    // OSM tags luaus, trampoline parks and mini golf as theme_park too; real parks have Wikidata
    accept: (p) => is(p, "tourism", "theme_park") && !!p.notable,
    minCount: 1,
  },
  {
    tag: "skiing",
    label: "ski area",
    radiusMiles: 20,
    queries: ["[landuse=winter_sports]"],
    accept: (p) => is(p, "landuse", "winter_sports") && !!p.name && !NOT_A_SKI_AREA.test(p.name),
    minCount: 1,
  },
  {
    tag: "hiking",
    label: "park / forest",
    radiusMiles: 15,
    // big parks' boundaries aren't returned by the "[boundary=national_park]" form; the phrase search finds them
    queries: ["national park", "national forest", "state park"],
    accept: (p) =>
      (is(p, "boundary", "national_park", "protected_area") || is(p, "leisure", "nature_reserve", "park")) &&
      PARKLIKE.test(p.name) &&
      !NOT_FOR_HIKING.test(p.name),
    minCount: 1,
  },
  {
    tag: "zoo_aquarium",
    label: "zoo / aquarium / water park",
    radiusMiles: 10,
    queries: ["[tourism=zoo]", "[tourism=aquarium]", "[leisure=water_park]"],
    accept: (p) =>
      (is(p, "tourism", "zoo", "aquarium") && (ZOOLIKE.test(p.name) || !!p.notable)) ||
      (is(p, "leisure", "water_park") && !!p.name && !NOT_A_WATER_PARK.test(p.name)),
    minCount: 1,
  },
];

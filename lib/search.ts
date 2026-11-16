import type { Tag } from "@/lib/tags/constants";
import type { ClimateStats } from "@/lib/db/schema";
import { skyOf } from "@/lib/weather/climate";

/**
 * Search box on the trips page. Runs in the browser over the rows already loaded, so it's instant
 * and needs no service. "Semantic" here means it understands what people mean rather than only
 * the exact words on the list:
 *  - places: resort name, city, state (code or full name), country, plus nicknames for the areas
 *    the exchange lists (Kissimmee is "Orlando"/"Disney", Stateline is "Lake Tahoe", ...) and
 *    regions ("New England", "Southwest", "Mexico", "international");
 *  - activities: words that mean a tag ("snowboarding" → skiing, "ocean" → beach);
 *  - weather words ("warm", "sunny", "snow") from the stay's typical weather or forecast;
 *  - "drivable" / "road trip".
 * Every word has to match (so "big bear" is Big Bear Lake, not Big Sky); small typos are forgiven.
 */

export interface Searchable {
  property: string;
  city: string;
  state: string;
  country: string;
  unitType: string;
  tags: Tag[];
  isDrivable: boolean;
  climate: ClimateStats | null;
  forecast: ClimateStats | null;
}

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC",
};
// Mexican and other state codes the exchange uses
const OTHER_STATES: Record<string, string> = {
  BCN: "Baja California", BCS: "Baja California Sur Cabo", GRO: "Guerrero", NAY: "Nayarit",
  ROO: "Quintana Roo", SIN: "Sinaloa", JAL: "Jalisco", BC: "British Columbia", AB: "Alberta",
  ON: "Ontario", QC: "Quebec",
};

const REGIONS: Record<string, string[]> = {
  "new england": ["CT", "ME", "MA", "NH", "RI", "VT"],
  southwest: ["AZ", "NM", "NV", "UT"],
  "pacific northwest": ["WA", "OR", "ID"],
  "west coast": ["CA", "OR", "WA"],
  "rocky mountains rockies": ["CO", "MT", "ID", "WY", "UT"],
  midwest: ["IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI"],
  "south southeast": ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "WV"],
  "east coast": ["ME", "NH", "MA", "RI", "CT", "NY", "NJ", "DE", "MD", "VA", "NC", "SC", "GA", "FL"],
  "gulf coast": ["TX", "LA", "MS", "AL"],
  "mid atlantic": ["NY", "NJ", "PA", "DE", "MD"],
};

// Nicknames for areas, keyed by a word in the city (lowercase, after normalizing)
const AREAS: [RegExp, string][] = [
  [/kissimmee|orlando|clermont|lake buena vista|celebration|davenport/, "orlando disney world universal"],
  [/gatlinburg|pigeon forge|sevierville/, "smoky mountains smokies pigeon forge dollywood"],
  [/tahoe|stateline|olympic valley|incline/, "lake tahoe"],
  [/las vegas|henderson/, "vegas"],
  [/myrtle|garden city beach/, "myrtle beach grand strand"],
  [/williamsburg/, "busch gardens colonial"],
  [/sedona|cornville/, "red rocks"],
  [/avon|vail|beaver creek/, "vail beaver creek"],
  [/fraser|granby|winter park/, "winter park"],
  [/big sky|island park|west yellowstone/, "yellowstone"],
  [/scottsdale|mesa|peoria|gold canyon|phoenix|tempe|chandler/, "phoenix"],
  [/carlsbad|solana|san diego|oceanside|del mar/, "san diego legoland"],
  [/san clemente|anaheim|dana point|newport beach/, "orange county disneyland"],
  [/indio|palm springs|palm desert|la quinta|rancho mirage/, "palm springs desert coachella"],
  [/napa|sonoma/, "wine country"],
  [/cocoa beach|cape canaveral/, "space coast kennedy"],
  [/redington|clearwater|st pete|tampa/, "tampa clearwater st petersburg"],
  [/weston|fort lauderdale|miami/, "miami fort lauderdale"],
  [/lehigh acres|fort myers|naples|sanibel/, "fort myers"],
  [/wisconsin dells/, "water parks"],
  [/hancock|lenox/, "berkshires"],
  [/lake harmony|poconos?/, "poconos"],
  [/north conway|bartlett|lincoln/, "white mountains"],
  [/laconia|wolfeboro|meredith/, "lake winnipesaukee lakes region"],
  [/southwest harbor|bar harbor/, "acadia bar harbor"],
  [/yarmouth|hyannis|falmouth/, "cape cod"],
  [/kelowna/, "okanagan"],
  [/fairmont hot springs|canmore|banff/, "canadian rockies"],
  [/rosarito|ensenada/, "baja"],
  [/playa del carmen|cancun|tulum/, "cancun riviera maya tulum"],
  [/nuevo vallarta|puerto vallarta/, "puerto vallarta"],
  [/cabo|san jose del cabo/, "cabo los cabos"],
  [/lago vista/, "austin lake travis"],
  [/newport/, "coast"],
  [/big bear/, "big bear"],
  [/lahaina|kaanapali|kihei|wailea/, "maui"],
  [/princeville|kapaa|poipu|lihue/, "kauai"],
  [/honolulu|waikiki/, "oahu waikiki"],
  [/branson/, "ozarks"],
];

// What people type for each activity (first word stemmed, so variants are covered)
const TAG_WORDS: Record<Tag, string> = {
  beach: "beach ocean sea sand coast coastal surf seaside shore swim",
  theme_park: "theme park amusement rides roller coaster disney universal water park legoland",
  zoo_aquarium: "zoo aquarium animals wildlife safari",
  hiking: "hiking hike trails trail outdoors nature walk mountain mountains",
  skiing: "skiing ski skis snowboard slopes snow winter mountain mountains",
  scenic: "scenic views view nature national park",
  city: "city downtown urban nightlife shopping restaurants",
};

// Words that don't narrow anything down
const STOP = new Set(
  "a an and at by for from in into is it me my near of on or our the to trip trips with stay stays resort resorts place places somewhere where we us vacation".split(" "),
);

// Lowercase, no accents or punctuation, common abbreviations spelled out
export function normalize(s: string) {
  return ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")} `
    .replace(/ s (?=lake|tahoe)/g, " south ")
    .replace(/ n (?=myrtle)/g, " north ")
    .replace(/ st (?=johann|pete|george|augustine)/g, " saint st ")
    .replace(/ mt /g, " mt mount mountain ")
    .replace(/ new mexico /g, " newmexico ") // so "mexico" means the country
    .replace(/\s+/g, " ")
    .trim();
}

// Rough stem so "beaches"/"beach", "hiking"/"hike", "skis"/"skiing" meet
export function stem(w: string) {
  if (w.length <= 3) return w;
  return w
    .replace(/(ies)$/, "y")
    .replace(/(ing|ed)$/, "")
    .replace(/(es|s)$/, (m) => (w.length > 4 ? "" : m))
    .replace(/e$/, "");
}

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function weatherWords(c: ClimateStats | null) {
  if (!c) return "";
  const out = [skyOf(c) === "partly" ? "partly cloudy" : skyOf(c)];
  if (skyOf(c) === "sunny") out.push("sun clear dry");
  if (c.snowFrac >= 0.15) out.push("snow snowy");
  if (c.highF >= 85) out.push("hot");
  if (c.highF >= 72) out.push("warm");
  if (c.highF < 50) out.push("cold");
  else if (c.highF < 62) out.push("cool");
  return out.join(" ");
}

/** All the words a stay can be found by. */
export function searchText(r: Searchable) {
  const state = STATES[r.state] ?? OTHER_STATES[r.state] ?? "";
  const regions = Object.entries(REGIONS)
    .filter(([, codes]) => r.country === "United States" && codes.includes(r.state))
    .map(([name]) => name);
  const city = normalize(r.city);
  const areas = AREAS.filter(([re]) => re.test(city)).map(([, words]) => words);
  const us = r.country === "United States";
  return normalize(
    [
      r.property,
      r.city,
      r.state,
      state,
      r.country,
      us ? "usa us america" : "international abroad overseas",
      r.country === "United States" && r.state === "HI" ? "island islands tropical" : "",
      r.country === "Mexico" || r.country === "Costa Rica" ? "tropical latin america" : "",
      r.country === "Austria" || r.country === "United Kingdom" ? "europe" : "",
      r.country === "United Kingdom" ? "uk england britain" : "",
      ...regions,
      ...areas,
      r.unitType,
      ...r.tags.map((t) => TAG_WORDS[t]),
      r.isDrivable ? "drivable drive driving road trip car" : "fly flight flying",
      weatherWords(r.forecast ?? r.climate),
    ].join(" "),
  );
}

export interface Index {
  text: string; // normalized, with spaces at both ends
  words: string[]; // stemmed
}

export const indexOf = (r: Searchable): Index => {
  const text = searchText(r);
  return { text: ` ${text} `, words: [...new Set(text.split(" ").map(stem))] };
};

/** The query's words, minus filler. Empty means "no search". */
export function terms(q: string) {
  return normalize(q)
    .split(" ")
    .filter((w) => w && !STOP.has(w));
}

function termMatches(t: string, ix: Index, last: boolean) {
  // Short words (state codes like "ca", "co") only count as whole words
  if (t.length <= 3) return ix.text.includes(` ${t} `) || ix.words.includes(stem(t));
  const s = stem(t);
  if (ix.words.includes(s)) return true;
  // The word being typed also counts as the start of a word ("kiss" finds Kissimmee)
  if (last && ix.words.some((w) => w.startsWith(s))) return true;
  const max = t.length >= 10 ? 2 : t.length >= 5 ? 1 : 0;
  return max > 0 && ix.words.some((w) => w.length >= 4 && editDistance(s, w, max) <= max);
}

/** Does this stay match the search? Every word has to match something. */
export function matches(ix: Index, q: string | string[]) {
  const ts = typeof q === "string" ? terms(q) : q;
  if (!ts.length) return true;
  // The whole phrase as written ("big bear", "lake tahoe") counts even if the words split up
  if (ix.text.includes(` ${ts.join(" ")} `)) return true;
  return ts.every((t, i) => termMatches(t, ix, i === ts.length - 1));
}

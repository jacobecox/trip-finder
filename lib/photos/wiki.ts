/**
 * Fallback photo: Wikipedia's lead image for the resort's town (free to reuse with credit; we
 * link to the article). Tries "Town, State" (how US towns are titled) and then "Town".
 */
const UA = "trip-finder/0.1 (personal project)";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface WikiPhoto {
  url: string;
  page: string;
}

/**
 * A ~960px version of the lead image (Wikimedia only serves standard widths; 960 is one), or the
 * original when it's smaller. Null for maps, flags and seals, which many small towns lead with.
 */
export function sized(thumb: string, original?: { source: string; width: number }) {
  const clean = (u: string) => u.split("?")[0];
  if (/\.svg|locator|_map|map_of|flag|seal|coat_of_arms|logo/i.test(thumb)) return null;
  if (original && original.width <= 960) return clean(original.source);
  return clean(thumb).replace(/\/\d+px-([^/]+)$/, "/960px-$1");
}

async function summary(title: string): Promise<WikiPhoto | null> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const b = (await res.json()) as {
    type?: string;
    thumbnail?: { source: string };
    originalimage?: { source: string; width: number };
    content_urls?: { desktop?: { page?: string } };
  };
  if (b.type === "disambiguation" || !b.thumbnail) return null;
  const url = sized(b.thumbnail.source, b.originalimage);
  if (!url) return null;
  return { url, page: b.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

export async function wikiPhoto(p: { city: string; state: string; country: string }): Promise<WikiPhoto | null> {
  const town = p.city.split(",")[0].replace(/^S\. /, "South ").replace(/^N /, "North ").trim();
  const state = p.country === "United States" ? STATE_NAMES[p.state] : null;
  for (const t of [state && `${town}, ${state}`, town].filter(Boolean) as string[]) {
    const got = await summary(t);
    if (got) return got;
  }
  return null;
}

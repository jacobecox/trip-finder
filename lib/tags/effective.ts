import { TAGS, type Tag } from "@/lib/tags/constants";

export interface TagRow {
  tag: Tag;
  osm: boolean | null;
  osmEvidence: string | null;
  manual: boolean | null;
}

/** A manual choice always wins over the auto (OSM) suggestion. */
export function effectiveTags(rows: TagRow[]): Tag[] {
  const byTag = new Map(rows.map((r) => [r.tag, r]));
  return TAGS.filter((t) => {
    const r = byTag.get(t);
    return r ? (r.manual ?? r.osm ?? false) : false;
  });
}

/** Flag when tagging hasn't run, or nothing applies and the user hasn't confirmed that. */
export function isUntagged(p: { tagStatus: string; tagsReviewed: boolean }, tags: Tag[]) {
  if (p.tagsReviewed) return false;
  return p.tagStatus !== "ok" || tags.length === 0;
}

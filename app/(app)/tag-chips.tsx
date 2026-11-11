import type { Tag } from "@/lib/tags/constants";
import { tagDisplay } from "@/lib/tags/constants";

/** Activity chips; `max` shows the first few and a "+N" chip listing the rest on hover. */
export function TagChips({ tags, untagged, max }: { tags: Tag[]; untagged?: boolean; max?: number }) {
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.slice(shown.length);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((t) => (
        <span key={t} className="chip">
          {tagDisplay(t)}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="chip text-muted" title={rest.map(tagDisplay).join(", ")}>
          +{rest.length} more
        </span>
      )}
      {untagged && (
        <span
          className="chip bg-amber-500/15 text-amber-200"
          title="Nearby activities haven't been checked yet, or none were found."
        >
          activities unknown
        </span>
      )}
    </div>
  );
}

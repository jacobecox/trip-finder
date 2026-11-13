import type { Tag } from "@/lib/tags/constants";
import { tagDisplay } from "@/lib/tags/constants";

/**
 * Activity chips; `max` shows the first few and a "+N" chip listing the rest on hover.
 * `highlight` (the activity being filtered on) goes first and stands out, so it's never hidden under "+N".
 */
export function TagChips({
  tags,
  untagged,
  max,
  highlight,
  hint = true,
}: {
  hint?: boolean; // hover text (off on cards, where the whole card is a link)
  tags: Tag[];
  untagged?: boolean;
  max?: number;
  highlight?: Tag | "";
}) {
  const ordered = highlight && tags.includes(highlight) ? [highlight, ...tags.filter((t) => t !== highlight)] : tags;
  const shown = max ? ordered.slice(0, max) : ordered;
  const rest = ordered.slice(shown.length);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((t) => (
        <span key={t} className={t === highlight ? "chip border-accent/60 bg-accent/15 text-accent" : "chip"}>
          {tagDisplay(t)}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="chip text-muted" title={hint ? rest.map(tagDisplay).join(", ") : undefined}>
          +{rest.length} more
        </span>
      )}
      {untagged && (
        <span
          className="chip bg-amber-500/15 text-amber-200"
          title={hint ? "Nearby activities haven't been checked yet, or none were found." : undefined}
        >
          activities unknown
        </span>
      )}
    </div>
  );
}

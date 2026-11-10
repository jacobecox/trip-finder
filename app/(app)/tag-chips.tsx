import type { Tag } from "@/lib/tags/constants";
import { TAG_LABELS } from "@/lib/tags/constants";

export function TagChips({ tags, untagged }: { tags: Tag[]; untagged?: boolean }) {
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded bg-sky-100 px-1.5 text-[11px] text-sky-900">
          {TAG_LABELS[t]}
        </span>
      ))}
      {untagged && (
        <span
          className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-900"
          title="Activities not checked yet, or none found. Review on the Properties page."
        >
          untagged
        </span>
      )}
    </div>
  );
}

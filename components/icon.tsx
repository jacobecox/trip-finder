import type { LucideIcon } from "lucide-react";

/** A small line icon sized to the text around it; yellow (the app's accent) unless told otherwise. */
export function Icon({ as: C, className = "text-accent" }: { as: LucideIcon; className?: string }) {
  return <C aria-hidden strokeWidth={2} className={`inline-block size-[1.05em] shrink-0 align-[-0.15em] ${className}`} />;
}

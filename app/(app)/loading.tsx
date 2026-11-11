import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted" role="status">
      <Spinner className="h-5 w-5 text-accent" /> Loading…
    </div>
  );
}

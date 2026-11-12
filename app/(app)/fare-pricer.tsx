"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui";

type Mode = "missing" | "refresh";

/**
 * Admin only: runs SerpApi fare searches in time-boxed batches. The main button prices trips with no
 * fare yet; "Refresh all" re-searches every trip (a search each), behind a confirm step.
 */
export default function FarePricer({
  remaining,
  refreshable,
  usage,
  cap,
}: {
  remaining: number;
  refreshable: number;
  usage: number;
  cap: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [left, setLeft] = useState({ missing: remaining, refresh: refreshable });
  const [used, setUsed] = useState(usage);
  const free = Math.max(0, cap - used);

  async function run(mode: Mode) {
    setBusy(mode);
    setConfirming(false);
    setNote("");
    try {
      for (;;) {
        const res = await fetch(`/api/flights?mode=${mode}`, { method: "POST" });
        const j = await res.json();
        if (!res.ok) {
          setNote(j.error ?? "Fare search failed");
          break;
        }
        setLeft((l) => ({ ...l, [mode]: j.remaining }));
        setUsed(j.usage);
        router.refresh();
        if (j.capReached) setNote(`Monthly search cap (${j.cap}) reached; raise it in Settings or wait until next month.`);
        if (j.quotaExceeded) setNote("SerpApi says the plan's searches are used up.");
        if (j.failed) setNote(`${j.failed} searches failed; they'll be retried next run.`);
        if (j.capReached || j.quotaExceeded || j.remaining === 0 || j.searched === 0) break;
      }
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  return (
    <div className="card flex max-w-md flex-col gap-1.5 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {left.missing > 0 ? (
          <button
            disabled={!!busy}
            onClick={() => run("missing")}
            className="btn btn-primary"
            title={`Trips with no flight price yet. Uses ${left.missing} of the ${free} searches left this month.`}
          >
            {busy === "missing" && <Spinner />}
            {busy === "missing" ? `Pricing flights… ${left.missing} left` : `✈ Price ${left.missing} unpriced trip${left.missing === 1 ? "" : "s"}`}
          </button>
        ) : (
          <span className="text-emerald-300">✓ Every trip has a flight price</span>
        )}
        <span className="text-xs text-muted">
          {used} of {cap} searches used this month
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(100, (used / Math.max(cap, 1)) * 100)}%` }} />
      </div>
      {left.refresh > 0 &&
        (busy === "refresh" ? (
          <span className="flex items-center gap-2 text-xs text-muted">
            <Spinner className="h-3 w-3" /> Refreshing fares… {left.refresh} left
          </span>
        ) : confirming ? (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-amber-200">
              Re-search all {left.refresh} trips? That uses {Math.min(left.refresh, free)} of {free} searches left.
            </span>
            <button className="link" onClick={() => run("refresh")}>
              Yes, refresh
            </button>
            <button className="text-muted hover:text-ink" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            disabled={!!busy}
            className="w-fit text-xs text-muted hover:text-accent"
            onClick={() => setConfirming(true)}
            title="Today's prices for every trip, searched from your current airports and seat count"
          >
            Refresh all fares ({left.refresh} searches)
          </button>
        ))}
      {note && <span className="text-xs text-amber-300">{note}</span>}
    </div>
  );
}

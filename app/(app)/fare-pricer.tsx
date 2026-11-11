"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui";

/** Admin only: runs SerpApi fare searches in time-boxed batches. */
export default function FarePricer({ remaining, usage, cap }: { remaining: number; usage: number; cap: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [left, setLeft] = useState(remaining);
  const [used, setUsed] = useState(usage);

  async function run() {
    setBusy(true);
    setNote("");
    try {
      for (;;) {
        const res = await fetch("/api/flights", { method: "POST" });
        const j = await res.json();
        if (!res.ok) {
          setNote(j.error ?? "Fare search failed");
          break;
        }
        setLeft(j.remaining);
        setUsed(j.usage);
        router.refresh();
        if (j.capReached) setNote(`Monthly search cap (${j.cap}) reached; raise it in Settings or wait until next month.`);
        if (j.quotaExceeded) setNote("SerpApi says the plan's searches are used up.");
        if (j.failed) setNote(`${j.failed} searches failed; they'll be retried next run.`);
        if (j.capReached || j.quotaExceeded || j.remaining === 0 || j.searched === 0) break;
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="card flex max-w-md flex-col gap-1.5 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {left > 0 ? (
          <button disabled={busy} onClick={run} className="btn btn-primary" title={`Uses ${left} of the ${cap - used} searches left this month`}>
            {busy && <Spinner />}
            {busy ? `Pricing flights… ${left} left` : `✈ Price flights (${left} searches)`}
          </button>
        ) : (
          <span className="text-emerald-300">✓ All flights priced</span>
        )}
        <span className="text-xs text-muted">
          {used} of {cap} searches used this month
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(100, (used / Math.max(cap, 1)) * 100)}%` }} />
      </div>
      {note && <span className="text-xs text-amber-300">{note}</span>}
    </div>
  );
}

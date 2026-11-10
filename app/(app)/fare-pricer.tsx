"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Runs SerpApi fare searches in time-boxed batches, like Locate & tag. */
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
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {left > 0 ? (
        <button disabled={busy} onClick={run} className="rounded border px-3 py-1 disabled:opacity-50">
          {busy ? `Pricing flights… ${left} left` : `Price flights (${left} searches)`}
        </button>
      ) : (
        <span className="text-black/60 dark:text-white/60">Flights priced ✓</span>
      )}
      <span className="text-xs text-black/50 dark:text-white/50">
        SerpApi: {used} of {cap} searches used this month
      </span>
      {note && <span className="text-xs text-amber-700">{note}</span>}
    </div>
  );
}

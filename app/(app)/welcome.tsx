"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "trip-finder:welcome-dismissed";

/** First-visit tips for family members; dismissed per browser. */
export default function Welcome() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after hydration
    setShow(!dismissed);
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  return (
    <aside className="card relative overflow-hidden border-accent/30 bg-[linear-gradient(110deg,rgba(250,204,21,0.10),transparent_55%)] p-4 pr-10 sm:p-5 sm:pr-12">
      <button className="btn btn-ghost absolute top-2 right-2 h-7 w-7 p-0" onClick={close} aria-label="Dismiss tips">
        ✕
      </button>
      <h2 className="font-semibold">👋 Welcome! Here&apos;s how to use this</h2>
      <ol className="mt-2 grid gap-2 text-sm text-ink/90 sm:grid-cols-3">
        <li>
          <span className="font-medium text-accent">1. Each card is one week-long stay.</span> The total is the stay plus
          flights (or gas if we&apos;d drive there).
        </li>
        <li>
          <span className="font-medium text-accent">2. The score (0–100) is the best mix</span> of a low total cost and lots
          to do nearby. Green = best of what you&apos;re looking at.
        </li>
        <li>
          <span className="font-medium text-accent">3. Narrow it down</span> by dates, activity (beach, theme parks…), or
          drivable only. Switch to the map to see where everything is.
        </li>
      </ol>
      <div className="mt-3 flex gap-3 text-sm">
        <Link href="/guide" className="link">
          Read the full guide →
        </Link>
        <button className="text-muted transition-colors hover:text-ink" onClick={close}>
          Got it
        </button>
      </div>
    </aside>
  );
}

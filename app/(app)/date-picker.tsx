"use client";

import { useEffect, useRef, useState } from "react";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Button + dropdown month calendar. Days in `counts` (YYYY-MM-DD -> number of stays) are
 * highlighted, so it's easy to see when trips exist. All dates are UTC calendar days.
 */
export function DatePicker({
  value,
  onChange,
  counts,
  className = "",
  placeholder = "Any date",
}: {
  value: string;
  onChange: (v: string) => void;
  counts: Map<string, number>;
  className?: string;
  placeholder?: string;
}) {
  const first = [...counts.keys()].sort()[0];
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || first || iso(new Date())).slice(0, 7));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const start = utc(`${month}-01`);
  const shift = (n: number) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(iso(d).slice(0, 7));
  };
  const days: (string | null)[] = Array(start.getUTCDay()).fill(null);
  for (const d = new Date(start); d.getUTCMonth() === start.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));
  const label = (s: string, opts: Intl.DateTimeFormatOptions) => utc(s).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={`${className} flex items-center justify-between text-left`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open && value) setMonth(value.slice(0, 7));
          setOpen(!open);
        }}
      >
        <span className={value ? "" : "text-black/40 dark:text-white/40"}>
          {value ? label(value, { month: "short", day: "numeric", year: "numeric" }) : placeholder}
        </span>
        <span aria-hidden>📅</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-0 z-[1000] mt-1 w-64 rounded border border-black/15 bg-white p-2 text-xs shadow-lg dark:border-white/20 dark:bg-neutral-900"
        >
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => shift(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="font-medium">{label(`${month}-01`, { month: "long", year: "numeric" })}</span>
            <button type="button" className="rounded px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => shift(1)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-black/50 dark:text-white/50">
                {w}
              </div>
            ))}
            {days.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const n = counts.get(d) ?? 0;
              const selected = d === value;
              return (
                <button
                  key={d}
                  type="button"
                  title={n ? `${n} stay${n > 1 ? "s" : ""} include this day` : "No stays"}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={`rounded py-1 tabular-nums ${
                    selected
                      ? "bg-blue-600 text-white"
                      : n
                        ? "bg-emerald-500/20 font-medium hover:bg-emerald-500/35"
                        : "text-black/35 hover:bg-black/5 dark:text-white/35 dark:hover:bg-white/10"
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-black/60 dark:text-white/60">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40 align-middle" />
              has stays
            </span>
            {value && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** YYYY-MM-DD -> number of stays whose check-in..check-out includes that day. */
export function stayDayCounts(rows: { arrivalDate: string; checkoutDate: string }[]) {
  const out = new Map<string, number>();
  for (const r of rows) {
    const end = utc(r.checkoutDate);
    for (const d = utc(r.arrivalDate); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = iso(d);
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}

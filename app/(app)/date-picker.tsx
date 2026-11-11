"use client";

import { useEffect, useRef, useState } from "react";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export type DateRange = { from: string; to: string }; // "" = open end

/** Stay has at least one night inside the range (checking out on its first day doesn't count). */
export const overlaps = (r: { arrivalDate: string; checkoutDate: string }, q: DateRange) =>
  (!q.from || r.checkoutDate > q.from) && (!q.to || r.arrivalDate <= q.to);

/**
 * Button + dropdown month calendar for a date range: click a start day, then an end day
 * (or the month name for the whole month). Days in `counts` (YYYY-MM-DD -> number of stays)
 * are shaded. All dates are UTC calendar days.
 */
export function DateRangePicker({
  value,
  onChange,
  counts,
  className = "",
  placeholder = "Any date",
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
  counts: Map<string, number>;
  className?: string;
  placeholder?: string;
}) {
  const first = [...counts.keys()].sort()[0];
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value.from || first || iso(new Date())).slice(0, 7));
  // mid-selection: start picked, waiting for the end
  const [pending, setPending] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) {
        setOpen(false);
        setPending(null);
      }
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
  const short = (s: string) => label(s, { month: "short", day: "numeric", year: "numeric" });
  const lastDay = days[days.length - 1]!;
  const wholeMonth = value.from === `${month}-01` && value.to === lastDay;
  const text =
    value.from && value.to
      ? value.from === value.to
        ? short(value.from)
        : value.from.slice(8) === "01" && value.to === lastOf(value.from) && value.from.slice(0, 7) === value.to.slice(0, 7)
          ? label(value.from, { month: "long", year: "numeric" })
          : `${label(value.from, { month: "short", day: "numeric" })} – ${label(value.to, { month: "short", day: "numeric" })}`
      : "";
  const pick = (d: string) => {
    if (!pending) return setPending(d);
    onChange(d < pending ? { from: d, to: pending } : { from: pending, to: d });
    setPending(null);
    setOpen(false);
  };
  const inRange = (d: string) =>
    pending ? d === pending : !!value.from && !!value.to && d >= value.from && d <= value.to;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={`${className} flex items-center justify-between text-left`}
        aria-haspopup="dialog"
        title={value.from && value.to ? `${short(value.from)} – ${short(value.to)}` : undefined}
        aria-expanded={open}
        onClick={() => {
          if (!open && value.from) setMonth(value.from.slice(0, 7));
          setPending(null);
          setOpen(!open);
        }}
      >
        <span className={`truncate ${text ? "" : "text-muted/70"}`}>{text || placeholder}</span>
        <span aria-hidden>📅</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose dates"
          className="absolute left-0 z-[1000] mt-1 w-64 rounded-xl border border-line bg-surface p-2 text-xs shadow-xl shadow-black/50"
        >
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => shift(-1)} aria-label="Previous month">
              ‹
            </button>
            <button
              type="button"
              title="Select the whole month"
              className={`rounded px-2 py-1 font-medium hover:bg-white/10 ${wholeMonth ? "text-accent" : ""}`}
              onClick={() => {
                onChange({ from: `${month}-01`, to: lastDay });
                setPending(null);
                setOpen(false);
              }}
            >
              {label(`${month}-01`, { month: "long", year: "numeric" })}
            </button>
            <button type="button" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => shift(1)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-muted">
                {w}
              </div>
            ))}
            {days.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const n = counts.get(d) ?? 0;
              const selected = inRange(d);
              return (
                <button
                  key={d}
                  type="button"
                  title={n ? `${n} stay${n > 1 ? "s" : ""} on this night` : "No stays"}
                  onClick={() => pick(d)}
                  className={`rounded py-1 tabular-nums ${
                    selected
                      ? "bg-accent font-semibold text-accent-ink"
                      : n
                        ? "bg-emerald-500/20 font-medium hover:bg-emerald-500/35"
                        : "text-white/35 hover:bg-white/10"
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-muted">
            {pending ? `From ${short(pending)} — now pick the end day` : "Pick a start and end day, or click the month name"}
          </div>
          <div className="mt-1 flex items-center justify-between text-muted">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40 align-middle" />
              has stays
            </span>
            {(value.from || value.to) && (
              <button
                type="button"
                className="link"
                onClick={() => {
                  onChange({ from: "", to: "" });
                  setPending(null);
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

function lastOf(day: string) {
  const d = utc(`${day.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return iso(d);
}

/** YYYY-MM-DD -> number of stays with a night on that day (check-in up to the day before check-out). */
export function stayDayCounts(rows: { arrivalDate: string; checkoutDate: string }[]) {
  const out = new Map<string, number>();
  for (const r of rows) {
    const end = utc(r.checkoutDate);
    for (const d = utc(r.arrivalDate); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = iso(d);
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  }
  return out;
}

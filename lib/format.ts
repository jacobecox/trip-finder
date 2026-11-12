export function fmtHours(h: number | null | undefined) {
  if (h == null) return "—";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Compact duration: 50m, 1h 25m, 6h */
export function fmtMinutes(min: number) {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

export function daysUntil(iso: string, now = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export function fmtUsd(v: number | null | undefined) {
  return v == null ? "—" : usd.format(v);
}

export function fmtMiles(v: number | null | undefined) {
  return v == null ? "—" : `${Math.round(v).toLocaleString("en-US")} mi`;
}

/** "Dec 5" (with the year only when it isn't the current one) */
export function fmtShortDate(iso: string, now = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(y !== now.getFullYear() ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function nightsBetween(arrival: string, checkout: string) {
  return daysUntil(checkout, new Date(`${arrival}T12:00:00`));
}

/** "in 24 days", "tomorrow", "today", "started" */
export function fmtCountdown(days: number) {
  if (days < 0) return "already started";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 60) return `in ${days} days`;
  return `in ${Math.round(days / 30.4)} months`;
}

/** Where to land after signing in: the page that sent you there (e.g. a shared trip link), never another site. */
export function safeReturn(callbackUrl: string | undefined) {
  if (!callbackUrl) return "/";
  try {
    const u = new URL(callbackUrl, "http://x");
    const path = u.pathname.replace(/^\/+/, "/"); // "//evil.com" would be read as another host
    return path.startsWith("/login") ? "/" : path + u.search;
  } catch {
    return "/";
  }
}

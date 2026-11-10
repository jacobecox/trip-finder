export function fmtHours(h: number | null | undefined) {
  if (h == null) return "—";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
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

export function normalizeKey(p: { name: string; city: string; state: string; countryCode: string }) {
  const n = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return [p.name, p.city, p.state, p.countryCode].map(n).join("|");
}

/**
 * Builds data/airports.json from OurAirports (public domain):
 *   curl -sSfLo /tmp/airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
 *   pnpm tsx scripts/build-airports.ts /tmp/airports.csv
 * Keeps large/medium airports with scheduled passenger service and an IATA code.
 */
import { readFileSync, writeFileSync } from "node:fs";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const [header, ...rows] = parseCsv(readFileSync(process.argv[2], "utf8"));
const col = (name: string) => header.indexOf(name);
const [TYPE, NAME, LAT, LNG, COUNTRY, CITY, SCHED, IATA] = [
  "type", "name", "latitude_deg", "longitude_deg", "iso_country", "municipality", "scheduled_service", "iata_code",
].map(col);

const out = rows
  .filter((r) => (r[TYPE] === "large_airport" || r[TYPE] === "medium_airport") && r[SCHED] === "yes" && /^[A-Z]{3}$/.test(r[IATA]))
  .map((r) => [r[IATA], r[NAME], r[CITY], r[COUNTRY], +Number(r[LAT]).toFixed(4), +Number(r[LNG]).toFixed(4), r[TYPE] === "large_airport" ? 1 : 0])
  .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

writeFileSync("data/airports.json", JSON.stringify(out).replace(/\],\[/g, "],\n["));
console.log(`wrote ${out.length} airports`);

import Link from "next/link";
import { getCurrentListings, getSettings } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import ListingsTable from "./listings-table";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [{ upload, rows }, s] = await Promise.all([getCurrentListings(), getSettings()]);
  if (!upload)
    return (
      <p>
        No listings yet.{" "}
        <Link className="underline" href="/upload">
          Upload a PDF
        </Link>{" "}
        to get started.
      </p>
    );
  return (
    <>
      <p className="mb-4 text-sm text-black/60 dark:text-white/60">
        {upload.filename} · uploaded {fmtDate(upload.uploadedAt.toISOString().slice(0, 10))} · {rows.length} listings
      </p>
      <ListingsTable
        rows={rows}
        origin={{ label: s.originLabel, lat: s.originLat, lng: s.originLng }}
        scoreSettings={{
          costWeight: s.costWeight,
          activityWeight: s.activityWeight,
          tagWeights: s.tagWeights,
          tickets: s.tickets,
          mpg: s.mpg,
          gasPriceUsd: s.gasPriceUsd,
          flightBaseUsd: s.flightBaseUsd,
          flightPerMileUsd: s.flightPerMileUsd,
        }}
      />
    </>
  );
}

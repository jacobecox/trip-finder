import { getCurrentListings } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import ListingsTable from "./listings-table";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { upload, rows } = await getCurrentListings();
  if (!upload)
    return (
      <p>
        No listings yet. <a className="underline" href="/upload">Upload a PDF</a> to get started.
      </p>
    );
  return (
    <>
      <p className="mb-4 text-sm text-black/60 dark:text-white/60">
        {upload.filename} · uploaded {fmtDate(upload.uploadedAt.toISOString().slice(0, 10))} · {rows.length} listings
      </p>
      <ListingsTable rows={rows} />
    </>
  );
}

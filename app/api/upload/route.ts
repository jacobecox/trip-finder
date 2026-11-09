import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { countPending } from "@/lib/geo/geocode-job";
import { ingestUpload } from "@/lib/ingest";
import { parsePdf } from "@/lib/parser/extract";
import { getBlobStore } from "@/lib/storage";

export const maxDuration = 60;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf"))
    return NextResponse.json({ error: "Upload a PDF file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { listings, warnings } = await parsePdf(bytes);
  if (listings.length === 0)
    return NextResponse.json({ error: "No listings found in this PDF", warnings }, { status: 422 });

  const blobUrl = await getBlobStore().put(file.name, bytes, "application/pdf");
  const upload = await ingestUpload({ filename: file.name, blobUrl, listings, warnings });

  return NextResponse.json({
    uploadId: upload.id,
    rowCount: listings.length,
    warnings,
    pending: await countPending(),
  });
}

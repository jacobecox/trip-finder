import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { countPending } from "@/lib/geo/geocode-job";
import { importPdf } from "@/lib/ingest";

export const maxDuration = 60;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf"))
    return NextResponse.json({ error: "Upload a PDF file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const r = await importPdf({ filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), source: "upload" });
  if (r.status !== "ok")
    return NextResponse.json({ error: "No listings found in this PDF", warnings: "warnings" in r ? r.warnings : [] }, { status: 422 });

  return NextResponse.json({
    uploadId: r.upload.id,
    rowCount: r.rowCount,
    warnings: r.warnings,
    pending: await countPending(),
  });
}

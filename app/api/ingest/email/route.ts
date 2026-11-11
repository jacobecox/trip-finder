import { after, NextResponse } from "next/server";
import { bearerMatches } from "@/lib/email/secret";
import { importPdf } from "@/lib/ingest";
import { processPending } from "@/lib/pipeline";
import { continueIfNeeded } from "@/lib/continue";

export const maxDuration = 300;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Called by the Cloudflare Email Worker with a PDF attachment as the raw body.
 * Imports it like an upload, answers right away, then processes in the background.
 */
export async function POST(req: Request) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.EMAIL_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
  const raw = req.headers.get("x-filename");
  const filename = (raw ? decodeURIComponent(raw) : "email.pdf").replace(/[^\w .()-]/g, "_").slice(0, 120);

  const r = await importPdf({ filename, bytes, source: "email" });
  if (r.status === "empty")
    return NextResponse.json({ error: "No listings found in this PDF", warnings: r.warnings }, { status: 422 });
  if (r.status === "duplicate") return NextResponse.json({ status: "duplicate", uploadId: r.uploadId });

  after(async () => {
    const result = await processPending(270_000);
    console.log("email import processed", JSON.stringify(result));
    await continueIfNeeded(result, 0);
  });
  return NextResponse.json({ status: "ok", uploadId: r.upload.id, rowCount: r.rowCount, warnings: r.warnings.length });
}

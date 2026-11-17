import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb, property } from "@/lib/db";
import { isWiki } from "@/lib/photos/ref";
import { getBlobStore } from "@/lib/storage";

/** A resort's Google photo, from private storage (downloaded once when the resort was added). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser())) return new NextResponse(null, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new NextResponse(null, { status: 404 });
  const [p] = await getDb().select({ url: property.photoUrl }).from(property).where(eq(property.id, id));
  if (!p?.url) return new NextResponse(null, { status: 404 });
  if (isWiki(p.url)) return NextResponse.redirect(p.url, 302);
  const img = await getBlobStore().read(p.url).catch(() => null);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(img.body as BodyInit, {
    headers: { "Content-Type": img.contentType, "Cache-Control": "private, max-age=604800, immutable" },
  });
}

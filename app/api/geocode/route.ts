import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, property } from "@/lib/db";
import { countPending, runGeocodeBatch } from "@/lib/geo/geocode-job";

export const maxDuration = 60;

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ remaining: await countPending() });
}

/** Runs one time-boxed batch. Body {retryFailed:true} re-queues failed properties first. */
export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.retryFailed)
    await getDb().update(property).set({ geocodeStatus: "pending" }).where(eq(property.geocodeStatus, "failed"));
  try {
    return NextResponse.json(await runGeocodeBatch());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Geocoding failed" }, { status: 500 });
  }
}

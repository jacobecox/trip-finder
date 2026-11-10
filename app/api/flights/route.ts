import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fareStatus, runFareBatch } from "@/lib/flights/job";

export const maxDuration = 60;

/** How many fare searches are still needed, and this month's SerpApi usage. */
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await fareStatus());
}

/** Runs one time-boxed batch of fare searches; the client polls until remaining is 0 or the cap is hit. */
export async function POST() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runFareBatch());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fare search failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { fareStatus, runFareBatch } from "@/lib/flights/job";

export const maxDuration = 60;

/** How many fare searches are still needed, and this month's SerpApi usage. */
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await fareStatus());
}

/**
 * Runs one time-boxed batch of fare searches; the client polls until remaining is 0 or the cap is hit.
 * ?mode=refresh re-prices every trip; the default only prices trips with no fare yet.
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Only the admin can do this" }, { status: 403 });
  try {
    const mode = new URL(req.url).searchParams.get("mode") === "refresh" ? "refresh" : "missing";
    return NextResponse.json(await runFareBatch(undefined, mode));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fare search failed" }, { status: 500 });
  }
}

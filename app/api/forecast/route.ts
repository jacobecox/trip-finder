import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { currentForecasts } from "@/lib/weather/forecast";

export const maxDuration = 30;

/** Real forecasts for trips on the current list starting within 16 days, by listing id. */
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await currentForecasts());
}

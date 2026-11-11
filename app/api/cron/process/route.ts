import { after, NextResponse } from "next/server";
import { bearerMatches } from "@/lib/email/secret";
import { processPending } from "@/lib/pipeline";
import { continueIfNeeded, MAX_HOPS } from "@/lib/continue";

export const maxDuration = 300;

/** Daily Vercel Cron (and self-continuation): resume background processing for the newest upload. */
export async function GET(req: Request) {
  if (!bearerMatches(req.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hop = Math.min(MAX_HOPS, Number(new URL(req.url).searchParams.get("hop")) || 0);
  if (hop > 0) {
    // a continuation: reply at once so the caller can finish, then work
    after(async () => continueIfNeeded(await processPending(270_000), hop));
    return NextResponse.json({ status: "started", hop });
  }
  const result = await processPending(270_000);
  await continueIfNeeded(result, 0);
  return NextResponse.json(result);
}

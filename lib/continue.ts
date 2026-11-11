import { appUrl } from "@/lib/digest";
import type { PipelineResult } from "@/lib/pipeline";

export const MAX_HOPS = 8;

/**
 * Starts a fresh run of the cron route when work is left and this run made progress, so a big
 * import finishes in minutes instead of waiting for the next daily cron. Fire-and-forget: the
 * daily cron is the backstop if this request is lost.
 */
export async function continueIfNeeded(r: PipelineResult, hop: number) {
  if (!r.moreWork || !r.progressed || hop >= MAX_HOPS || !process.env.CRON_SECRET) return false;
  await fetch(`${appUrl()}/api/cron/process?hop=${hop + 1}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(2_000),
  }).catch(() => {}); // the timeout abort is expected; the other run keeps going
  return true;
}

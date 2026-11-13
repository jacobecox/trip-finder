import { and, eq, isNull } from "drizzle-orm";
import { getDb, listingsUpload } from "@/lib/db";
import { countPending, runGeocodeBatch } from "@/lib/geo/geocode-job";
import { fareStatus, runFareBatch } from "@/lib/flights/job";
import { climateNeeded, runClimateBatch } from "@/lib/weather/job";
import { getLatestUpload } from "@/lib/queries";
import { buildDigest } from "@/lib/digest";
import { sendEmail } from "@/lib/email/send";

const BATCH_MS = 40_000;
const MARGIN_MS = 15_000; // headroom so a batch never runs past the function's max duration
/** If locating keeps hitting free-API limits, send the email anyway after this long. */
export const DIGEST_GIVE_UP_MS = 36 * 3600_000;

export interface PipelineResult {
  geocodeRemaining: number;
  fareRemaining: number;
  autoPrice: "done" | "running" | "skipped-not-enough-searches" | "waiting-for-locations" | "nothing-to-price";
  progressed: boolean;
  digest: "sent" | "already-sent" | "not-email" | "waiting" | "failed" | "none";
  climateRemaining: number;
  moreWork: boolean;
}

/**
 * Background processing for the newest upload, resumable across calls: locate + tag new
 * properties, price flights when this month's searches cover all of them, email the
 * top picks once (email imports only), then look up typical weather.
 */
export async function processPending(budgetMs: number): Promise<PipelineResult> {
  const deadline = Date.now() + budgetMs;
  const left = () => deadline - Date.now() - MARGIN_MS;
  let progressed = false;

  // 1. locate, route, tag, airports
  let geocodeRemaining = await countPending();
  while (geocodeRemaining > 0 && left() > 5_000) {
    const r = await runGeocodeBatch(Math.min(BATCH_MS, left()));
    geocodeRemaining = r.remaining;
    if (r.processed > 0) progressed = true;
    if (r.quotaExceeded || r.processed === 0) break;
  }

  // 2. flights, only when the whole set fits in this month's searches
  let fares = await fareStatus();
  let autoPrice: PipelineResult["autoPrice"];
  if (geocodeRemaining > 0) autoPrice = "waiting-for-locations";
  else if (fares.remaining === 0) autoPrice = "nothing-to-price";
  else if (fares.remaining > fares.cap - fares.usage) autoPrice = "skipped-not-enough-searches";
  else {
    while (fares.remaining > 0 && left() > 5_000) {
      const r = await runFareBatch(Math.min(BATCH_MS, left()));
      fares = await fareStatus();
      if (r.searched > 0 || r.failed > 0) progressed = true;
      if (r.capReached || r.quotaExceeded || (r.searched === 0 && r.failed === 0)) break;
    }
    autoPrice = fares.remaining === 0 ? "done" : "running";
  }

  // 3. top-picks email
  const ready = geocodeRemaining === 0 && autoPrice !== "running";
  const digest = await maybeSendDigest({ ready, geocodeRemaining, fareRemaining: fares.remaining, autoPrice });

  // 4. typical weather (after the email, which doesn't need it). Stops early on Open-Meteo's rate
  // limit; the next run picks up where this left off.
  let climateRemaining = 0;
  if (geocodeRemaining === 0) {
    for (;;) {
      if (left() <= 5_000) {
        climateRemaining = (await climateNeeded()).length;
        break;
      }
      const r = await runClimateBatch(Math.min(BATCH_MS, left()));
      climateRemaining = r.remaining;
      if (r.saved > 0) progressed = true;
      if (r.remaining === 0 || r.rateLimited || r.saved === 0) break;
    }
  }

  return {
    geocodeRemaining,
    fareRemaining: fares.remaining,
    autoPrice,
    progressed,
    digest,
    climateRemaining,
    moreWork: geocodeRemaining > 0 || autoPrice === "running" || climateRemaining > 0,
  };
}

async function maybeSendDigest(state: {
  ready: boolean;
  geocodeRemaining: number;
  fareRemaining: number;
  autoPrice: PipelineResult["autoPrice"];
}): Promise<PipelineResult["digest"]> {
  const upload = await getLatestUpload();
  if (!upload) return "none";
  if (upload.source !== "email") return "not-email";
  if (upload.digestSentAt) return "already-sent";
  const stale = Date.now() - upload.uploadedAt.getTime() > DIGEST_GIVE_UP_MS;
  if (!state.ready && !stale) return "waiting";

  // claim it first so overlapping runs (webhook + cron) can't both send
  const db = getDb();
  const [claimed] = await db
    .update(listingsUpload)
    .set({ digestSentAt: new Date() })
    .where(and(eq(listingsUpload.id, upload.id), isNull(listingsUpload.digestSentAt)))
    .returning({ id: listingsUpload.id });
  if (!claimed) return "already-sent";
  try {
    await sendEmail(await buildDigest({ ...state, upload }));
    return "sent";
  } catch (e) {
    await db.update(listingsUpload).set({ digestSentAt: null }).where(eq(listingsUpload.id, upload.id));
    console.error("digest send failed", e);
    return "failed";
  }
}

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, TAGS, userPrefs, type PersonalPrefs } from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import type { ScoreSettings } from "@/lib/scoring";

/** Settings each person can change for their own view. Everything else is shared and admin-only. */
export const PERSONAL_KEYS = [
  "tickets",
  "costWeight",
  "activityWeight",
  "tagWeights",
  "mpg",
  "gasPriceUsd",
  "flightBaseUsd",
  "flightPerMileUsd",
] as const satisfies readonly (keyof PersonalPrefs)[];

export const PrefsBody = z.object({
  tickets: z.number().int().min(1).max(20),
  costWeight: z.number().min(0).max(100),
  activityWeight: z.number().min(0).max(100),
  tagWeights: z.partialRecord(z.enum(TAGS), z.number().min(0).max(100)),
  mpg: z.number().min(1).max(200),
  gasPriceUsd: z.number().min(0).max(50),
  flightBaseUsd: z.number().min(0).max(5000),
  flightPerMileUsd: z.number().min(0).max(5),
});

type Settings = Awaited<ReturnType<typeof getSettings>>;

/** Shared settings with one person's overrides on top (pure). */
export function applyPrefs(s: Settings, prefs: Partial<PersonalPrefs> | null | undefined): Settings {
  if (!prefs) return s;
  const out = { ...s };
  for (const k of PERSONAL_KEYS) {
    if (k === "tagWeights") out.tagWeights = { ...s.tagWeights, ...prefs.tagWeights };
    else if (typeof prefs[k] === "number") out[k] = prefs[k];
  }
  return out;
}

/** Only the values that differ from the shared settings, so later admin changes still reach everyone else. */
export function diffPrefs(s: Settings, wanted: z.infer<typeof PrefsBody>): Partial<PersonalPrefs> {
  const out: Partial<PersonalPrefs> = {};
  for (const k of PERSONAL_KEYS) {
    if (k === "tagWeights") {
      const tw = Object.fromEntries(TAGS.filter((t) => wanted.tagWeights[t] != null && wanted.tagWeights[t] !== s.tagWeights[t]).map((t) => [t, wanted.tagWeights[t]]));
      if (Object.keys(tw).length) out.tagWeights = tw;
    } else if (wanted[k] !== s[k]) out[k] = wanted[k];
  }
  return out;
}

export async function getPrefs(email: string) {
  const [row] = await getDb().select().from(userPrefs).where(eq(userPrefs.email, email.toLowerCase()));
  return row?.prefs ?? null;
}

/** What this person sees: the admin sees the shared settings; everyone else gets their overrides applied. */
export async function getEffectiveSettings(email: string | null | undefined) {
  const s = await getSettings();
  if (!email || isAdminEmail(email)) return { settings: s, personalized: false };
  const prefs = await getPrefs(email);
  return { settings: applyPrefs(s, prefs), personalized: !!prefs && Object.keys(prefs).length > 0 };
}

export async function savePrefs(email: string, prefs: Partial<PersonalPrefs>) {
  const key = email.toLowerCase();
  const db = getDb();
  if (!Object.keys(prefs).length) {
    await db.delete(userPrefs).where(eq(userPrefs.email, key));
    return;
  }
  await db
    .insert(userPrefs)
    .values({ email: key, prefs })
    .onConflictDoUpdate({ target: userPrefs.email, set: { prefs, updatedAt: sql`now()` } });
}

/** The settings the score depends on (sent to the browser, which re-scores as filters change). */
export function scoreSettingsOf(s: Settings): ScoreSettings {
  return {
    costWeight: s.costWeight,
    activityWeight: s.activityWeight,
    tagWeights: s.tagWeights,
    tickets: s.tickets,
    mpg: s.mpg,
    gasPriceUsd: s.gasPriceUsd,
    flightBaseUsd: s.flightBaseUsd,
    flightPerMileUsd: s.flightPerMileUsd,
  };
}

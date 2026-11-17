import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** How many of a place's Google photos are looked at when choosing (each one is a billed download). */
export const CANDIDATES = 6;
/** At most this many are looked at (6, then all of them if none of those is the ideal kind). */
export const MAX_PHOTOS = 10;

const SHOWS = [
  "property_with_setting", // the resort together with its beach, lake, mountains... (often a drone shot)
  "pool",
  "full_exterior", // the buildings, from the street or the grounds
  "grounds",
  "facade_closeup",
  "balcony_or_patio",
  "room_interior",
  "sign_or_logo",
  "people_or_food",
  "view_without_resort", // scenery, or an aerial where the resort can't be picked out
  "other",
] as const;
type Shows = (typeof SHOWS)[number];
/** Photos that show the resort itself; anything else is never picked. */
const OF_PROPERTY: Shows[] = ["property_with_setting", "pool", "full_exterior", "grounds", "facade_closeup"];

const Choice = z.object({
  scenicSetting: z.boolean(), // on a beach, lake, river, in the mountains...
  showcasePool: z.boolean(), // a pool worth showing off
  photos: z.array(z.object({ number: z.number().int(), shows: z.enum(SHOWS) })),
  best: z.number().int(), // 1-based
});
export type Judged = z.infer<typeof Choice>;

const PROMPT = `These are photos of a vacation resort ("{name}") from Google Maps. Choose the one photo to show on a card that helps a family decide whether they want to stay there. It must show the resort itself, and look as appealing as possible.

First decide two things about the resort, from the photos and what you know of it:
- scenicSetting: is it somewhere special, such as on a beach or the ocean, on a lake or river, or in the mountains?
- showcasePool: does it have a pool worth showing off (large, unusual, lagoon or waterfall style, a striking setting)? An ordinary rectangular pool does not count.

For each photo, say what it mostly shows:
- property_with_setting: the resort's buildings together with what makes the place special, such as a drone shot of the resort on the beach, the resort with the lake or mountains behind it. The resort must be recognizable, not a speck in a wide landscape.
- pool: the resort's pool area.
- full_exterior: the resort's buildings as a whole, from the street or the grounds.
- grounds: the resort's gardens, lawns or courtyards with its buildings in view.
- facade_closeup: part of a building, such as the front or the entrance, close up.
- balcony_or_patio, room_interior, sign_or_logo, people_or_food: as named.
- view_without_resort: scenery or a view from the resort without its buildings, or an aerial so high the resort can't be picked out.
- other: anything else (parking, golf course, a dark or blurry photo...).

Then pick the best photo, following this order:
1. If the setting is scenic, a property_with_setting photo.
2. Otherwise, or if there is none, a photo of the pool if it is a showcase pool.
3. Otherwise a photo that shows the property itself: preferably full_exterior or grounds, else any property_with_setting or pool photo, else facade_closeup.
Among photos of the same kind, pick the most attractive (bright, sharp, well framed). Never pick a photo that doesn't show the resort itself, if there is one that does.`;

/**
 * Whether the pick follows the rule's first step that applies: scenic → resort with its setting;
 * else showcase pool → pool; else any photo of the property itself.
 */
export function isIdeal(j: Pick<Judged, "scenicSetting" | "showcasePool">, shows: Shows) {
  if (j.scenicSetting) return shows === "property_with_setting";
  if (j.showcasePool) return shows === "pool";
  return OF_PROPERTY.includes(shows);
}

/**
 * Claude's choice of photo (index into images): whether it shows the resort at all, and whether it's
 * the ideal kind for this resort (see isIdeal). Null when there are no photos; without a key, the first.
 */
export async function choosePhoto(name: string, images: { type: string; bytes: Uint8Array }[]) {
  if (images.length === 0) return null;
  const first = { index: 0, showsProperty: true, ideal: true };
  if (!process.env.ANTHROPIC_API_KEY) return first;
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `Photo ${i + 1}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType(img), data: Buffer.from(img.bytes).toString("base64") },
    });
  });
  content.push({ type: "text", text: PROMPT.replace("{name}", name) });
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Choice) },
    messages: [{ role: "user", content }],
  });
  const out = res.parsed_output;
  if (res.stop_reason === "refusal" || !out) return first;
  const index = Math.min(Math.max(out.best - 1, 0), images.length - 1);
  const shows = out.photos.find((ph) => ph.number === index + 1)?.shows ?? "other";
  return { index, showsProperty: OF_PROPERTY.includes(shows), ideal: isIdeal(out, shows) };
}

/** The image's real format from its first bytes (the server's content type can be wrong). */
export function mediaType(img: { type: string; bytes: Uint8Array }): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  const b = img.bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  return img.type.includes("png") ? "image/png" : img.type.includes("webp") ? "image/webp" : "image/jpeg";
}

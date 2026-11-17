import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** How many of a place's Google photos are looked at when choosing (each one is a billed download). */
export const CANDIDATES = 6;
/** At most this many are looked at (6, then the rest only if none of those shows the resort). */
export const MAX_PHOTOS = 10;

const Choice = z.object({
  photos: z.array(
    z.object({
      number: z.number().int(),
      shows: z.enum([
        "resort_aerial", "pool", "grounds", "full_exterior", "facade_closeup", "balcony_or_patio", "room_interior",
        "sign_or_logo", "people_or_food", "distant_aerial", "view_without_resort", "other",
      ]),
      rating: z.enum(["great", "ok", "poor"]),
    }),
  ),
  best: z.number().int(), // 1-based
});

const PROMPT = `These are photos of a vacation resort ("{name}") from Google Maps. Choose the one photo that best shows the property itself, to show on a card that helps a family decide whether they want to stay there.

The resort itself must be clearly visible and recognizable: its buildings, pool or grounds should fill a good part of the photo (roughly a third or more). A beautiful view that doesn't show the resort is not a photo of the resort, and neither is a high aerial where the resort is a small part of a wide landscape.

Rate each photo:
- great: an attractive shot where the resort is clearly the subject. A low drone shot where the resort's buildings fill much of the frame, the pool area, the grounds with the buildings in view, a full exterior view of the buildings.
- ok: the resort is clearly visible but the photo is plain, such as a straight-on building front or the entrance.
- poor: the resort is not clearly visible. This includes a high or distant aerial where the resort is a small part of the photo or can't be picked out, a golf course, scenery or a view from the resort (lake, beach, mountains, town, street) without the resort's buildings in it, close-ups of a wall, balconies or patios, chairs, rooms and interiors, signs or logos, parking lots, people, food, dark or blurry photos.

For each photo, say what it shows and rate it. Then give the number of the best one: a great one if there is any, else an ok one.`;

export type Rating = "great" | "ok" | "poor";

/**
 * Claude's choice of photo (index into images) and how well it shows the resort. Null when there
 * are no photos; without a key, the first.
 */
export async function choosePhoto(name: string, images: { type: string; bytes: Uint8Array }[]) {
  if (images.length === 0) return null;
  if (!process.env.ANTHROPIC_API_KEY) return { index: 0, rating: "ok" as Rating, showsProperty: true };
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
  if (res.stop_reason === "refusal" || !out) return { index: 0, rating: "ok" as Rating, showsProperty: true };
  const index = Math.min(Math.max(out.best - 1, 0), images.length - 1);
  const rating = out.photos.find((ph) => ph.number === index + 1)?.rating ?? "poor";
  return { index, rating, showsProperty: rating !== "poor" };
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

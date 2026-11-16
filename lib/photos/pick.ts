import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/** How many of a place's Google photos are looked at when choosing (each one is a billed download). */
export const CANDIDATES = 6;

const Choice = z.object({
  photos: z.array(
    z.object({
      number: z.number().int(),
      shows: z.enum(["aerial", "pool", "grounds", "full_exterior", "facade_closeup", "balcony_or_patio", "room_interior", "sign_or_logo", "people_or_food", "other"]),
    }),
  ),
  best: z.number().int(), // 1-based
  showsProperty: z.boolean(), // false when even the best is a poor picture of the resort
});

const PROMPT = `These are photos of a vacation resort ("{name}") from Google Maps. Choose the one photo that best shows the property itself, to show on a card that helps a family decide whether they want to stay there.

Best, in roughly this order: an aerial/drone shot of the resort, the pool area, the grounds or setting (lake, beach, mountains with the resort in view), a full exterior view of the buildings.
Avoid: close-ups of a wall or facade, balconies or patios, chairs, rooms and interiors, signs or logos, parking lots as the main subject, people, food, dark or blurry photos.

For each photo, say what it shows. Then give the number of the best one, and say whether it is actually a good picture of the property (false if every photo is something to avoid).`;

/** Claude's choice of photo (index into images), or null if none shows the property well. Without a key, the first. */
export async function choosePhoto(name: string, images: { type: string; bytes: Uint8Array }[]) {
  if (images.length === 0) return null;
  if (!process.env.ANTHROPIC_API_KEY) return { index: 0, showsProperty: true };
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: "text", text: `Photo ${i + 1}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.type.includes("png") ? "image/png" : img.type.includes("webp") ? "image/webp" : "image/jpeg", data: Buffer.from(img.bytes).toString("base64") },
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
  if (res.stop_reason === "refusal" || !out) return { index: 0, showsProperty: true };
  const index = Math.min(Math.max(out.best - 1, 0), images.length - 1);
  return { index, showsProperty: out.showsProperty };
}

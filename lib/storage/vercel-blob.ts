import { get, put } from "@vercel/blob";
import type { BlobStore } from "./types";

// Private: PDFs (kept for reference) and resort photos, which the app serves through a signed-in route.
export const vercelBlobStore: BlobStore = {
  async put(key, data, contentType) {
    const res = await put(key, Buffer.from(data), { access: "private", contentType, addRandomSuffix: true });
    return res.url;
  },
  async read(url) {
    const r = await get(url, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return { body: r.stream, contentType: r.blob.contentType };
  },
};

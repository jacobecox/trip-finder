import { put } from "@vercel/blob";
import type { BlobStore } from "./types";

// Private: the app only stores the PDF (kept for reference); nothing reads it back over the web.
export const vercelBlobStore: BlobStore = {
  async put(key, data, contentType) {
    const res = await put(key, Buffer.from(data), { access: "private", contentType, addRandomSuffix: true });
    return res.url;
  },
};

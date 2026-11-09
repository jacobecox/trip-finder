import { put } from "@vercel/blob";
import type { BlobStore } from "./types";

export const vercelBlobStore: BlobStore = {
  async put(key, data, contentType) {
    const res = await put(key, Buffer.from(data), { access: "public", contentType, addRandomSuffix: true });
    return res.url;
  },
};

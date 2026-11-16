import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlobStore } from "./types";

const ROOT = path.join(process.cwd(), ".local-storage");

export const localStore: BlobStore = {
  async put(key, data) {
    const file = path.join(ROOT, `${Date.now()}-${key.replace(/[^\w.-]/g, "_")}`);
    await mkdir(ROOT, { recursive: true });
    await writeFile(file, data);
    return `file://${file}`;
  },
  async read(url) {
    if (!url.startsWith("file://")) return null;
    try {
      const body = new Uint8Array(await readFile(fileURLToPath(url)));
      return { body, contentType: url.endsWith(".png") ? "image/png" : url.endsWith(".webp") ? "image/webp" : "image/jpeg" };
    } catch {
      return null;
    }
  },
};

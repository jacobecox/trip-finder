import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BlobStore } from "./types";

const ROOT = path.join(process.cwd(), ".local-storage");

export const localStore: BlobStore = {
  async put(key, data) {
    const file = path.join(ROOT, `${Date.now()}-${key.replace(/[^\w.-]/g, "_")}`);
    await mkdir(ROOT, { recursive: true });
    await writeFile(file, data);
    return `file://${file}`;
  },
};

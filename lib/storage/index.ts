import type { BlobStore } from "./types";
import { localStore } from "./local";
import { vercelBlobStore } from "./vercel-blob";

/** Vercel Blob when a token is configured, otherwise local disk (dev / plain Docker). */
export function getBlobStore(): BlobStore {
  return process.env.BLOB_READ_WRITE_TOKEN ? vercelBlobStore : localStore;
}
export type { BlobStore };

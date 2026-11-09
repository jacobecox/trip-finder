export interface BlobStore {
  /** Stores bytes and returns a URL/identifier that can be saved in the DB. */
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
}

export interface BlobStore {
  /** Stores bytes and returns a URL/identifier that can be saved in the DB. */
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
  /** Reads back something stored with put. Null if it's gone. */
  read(url: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; contentType: string } | null>;
}

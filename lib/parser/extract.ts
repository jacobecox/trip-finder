import type { TextItem } from "./types";

/** Reads a PDF into per-page text items with positions. Isolated so parse.ts stays pure. */
export async function extractPdfItems(data: Uint8Array): Promise<TextItem[][]> {
  const [{ getDocument }, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    // pdf.js runs its "fake worker" in-process on the server, loading this file by a computed path that
    // Vercel's file tracing can't see, so it was missing in production. Importing it here both bundles
    // it and hands it to pdf.js directly (it checks globalThis.pdfjsWorker first).
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= worker;
  const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  const pages: TextItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      content.items
        .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i)
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] })),
    );
  }
  return pages;
}

export async function parsePdf(data: Uint8Array) {
  const { parseListings } = await import("./parse");
  return parseListings(await extractPdfItems(data));
}

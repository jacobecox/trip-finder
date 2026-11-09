import type { TextItem } from "./types";

/** Reads a PDF into per-page text items with positions. Isolated so parse.ts stays pure. */
export async function extractPdfItems(data: Uint8Array): Promise<TextItem[][]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
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

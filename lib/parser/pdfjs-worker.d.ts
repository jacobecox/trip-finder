// pdf.js ships no types for its worker entry; we only hand the module object back to pdf.js.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}

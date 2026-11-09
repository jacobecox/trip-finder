"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface Warning {
  page: number;
  row: number;
  inventoryNumber?: string;
  message: string;
}

export default function Uploader() {
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ rowCount: number; warnings: Warning[] } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = useRef(false);
  const [finished, setFinished] = useState(false);

  async function runGeocoding(total: number, retryFailed = false) {
    let remaining = total;
    let first = true;
    setProgress({ done: 0, total });
    while (remaining > 0 || first) {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryFailed: retryFailed && first }),
      });
      first = false;
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Geocoding failed");
      remaining = json.remaining;
      setProgress({ done: Math.max(0, total - remaining), total });
      if (json.processed === 0) break;
    }
  }

  async function handle(file: File) {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setResult(null);
    setProgress(null);
    setFinished(false);
    try {
      setStatus("Uploading and parsing…");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        if (json.warnings) setResult({ rowCount: 0, warnings: json.warnings });
        throw new Error(json.error ?? "Upload failed");
      }
      setResult({ rowCount: json.rowCount, warnings: json.warnings });
      if (json.pending > 0) {
        setStatus("Geocoding new properties…");
        await runGeocoding(json.pending);
      }
      setStatus("Done.");
      setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) handle(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center ${
          drag ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-black/20 dark:border-white/25"
        }`}
      >
        <span>Drag a PDF here, or click to choose</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
            e.target.value = "";
          }}
        />
      </label>

      {status && <p className="text-sm">{status}</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && result.rowCount > 0 && (
        <p className="text-sm">
          Parsed <strong>{result.rowCount}</strong> rows, <strong>{result.warnings.length}</strong> warnings.
        </p>
      )}
      {progress && (
        <div>
          <div className="h-2 overflow-hidden rounded bg-black/10 dark:bg-white/15">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">
            Geocoded {progress.done} of {progress.total} new properties
          </p>
        </div>
      )}
      {result && result.warnings.length > 0 && (
        <ul className="space-y-1 rounded bg-amber-50 p-3 text-sm text-amber-900">
          {result.warnings.map((w, i) => (
            <li key={i}>
              Page {w.page}, row {w.row}
              {w.inventoryNumber ? ` (#${w.inventoryNumber})` : ""}: {w.message}
            </li>
          ))}
        </ul>
      )}
      {finished && (
        <Link href="/" className="inline-block text-sm underline">
          View listings →
        </Link>
      )}
    </div>
  );
}

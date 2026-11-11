"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ui";

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
      if (json.quotaExceeded) {
        setError("Geocoding rate limit reached. Remaining properties stay pending; use Retry on the Properties page later.");
        break;
      }
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
        setStatus("Locating and tagging new properties…");
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          drag ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-accent/60 hover:bg-accent/5"
        }`}
      >
        <span className="text-4xl" aria-hidden>📄</span>
        <span className="font-medium">Drag the PDF here, or click to choose it</span>
        <span className="text-xs text-muted">Availability list from the exchange (.pdf)</span>
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

      {status && (
        <p className="flex items-center gap-2 text-sm">
          {status !== "Done." && <Spinner className="h-4 w-4 text-accent" />}
          {status === "Done." ? "✓ Done." : status}
        </p>
      )}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {result && result.rowCount > 0 && (
        <p className="text-sm">
          Parsed <strong>{result.rowCount}</strong> rows, <strong>{result.warnings.length}</strong> warnings.
        </p>
      )}
      {progress && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            Located &amp; tagged {progress.done} of {progress.total} properties (about 10 seconds each)
          </p>
        </div>
      )}
      {result && result.warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {result.warnings.map((w, i) => (
            <li key={i}>
              Page {w.page}, row {w.row}
              {w.inventoryNumber ? ` (#${w.inventoryNumber})` : ""}: {w.message}
            </li>
          ))}
        </ul>
      )}
      {finished && (
        <Link href="/" className="btn btn-primary">
          View listings →
        </Link>
      )}
    </div>
  );
}

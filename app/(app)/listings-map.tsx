"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { fmtDate, fmtUsd } from "@/lib/format";
import { escapeHtml, pinsFor, rampColor, rankColors, type MapListing } from "@/lib/map";

export interface MapRow extends MapListing {
  arrivalDate: string;
  unitType: string;
  totalUsd: number | null;
  travelMode: "drive" | "fly" | null;
  travelSummary: string; // e.g. "✈ LGB · 1 stop" or "drive 3h 10m"
}

/** Leaflet + OpenStreetMap tiles. Loaded client-only (see listings-table.tsx). */
export default function ListingsMap({ rows, origin }: { rows: MapRow[]; origin: { label: string; lat: number; lng: number } }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pins = useMemo(() => pinsFor(rows), [rows]);
  const colors = useMemo(() => rankColors(pins), [pins]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { worldCopyJump: true }).setView([origin.lat, origin.lng], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    L.circleMarker([origin.lat, origin.lng], { radius: 7, color: "#111", weight: 2, fillColor: "#fff", fillOpacity: 1 })
      .bindTooltip(`Home: ${escapeHtml(origin.label)}`)
      .addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [origin.lat, origin.lng, origin.label]);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    pins.forEach((p, i) => {
      const top = p.listings.slice(0, 6);
      const more = p.listings.length - top.length;
      const html = `
        <div style="min-width:220px">
          <div style="font-weight:600">${escapeHtml(p.name)}</div>
          <div style="color:#666;font-size:12px;margin-bottom:4px">${escapeHtml(p.location)}</div>
          <table style="font-size:12px;border-collapse:collapse;width:100%">
            ${top
              .map(
                (l) => `<tr>
                  <td style="padding:1px 6px 1px 0;font-weight:600;text-align:right">${l.score == null ? "—" : Math.round(l.score)}</td>
                  <td style="padding:1px 6px 1px 0;white-space:nowrap">${escapeHtml(fmtDate(l.arrivalDate))}</td>
                  <td style="padding:1px 6px 1px 0;text-align:right">${escapeHtml(fmtUsd(l.totalUsd))}</td>
                  <td style="padding:1px 0;color:#666">${escapeHtml(l.travelSummary)}</td>
                </tr>`,
              )
              .join("")}
          </table>
          ${more > 0 ? `<div style="color:#666;font-size:12px">+${more} more dates</div>` : ""}
        </div>`;
      L.circleMarker([p.lat, p.lng], {
        radius: 7 + Math.min(5, p.listings.length - 1),
        color: "#fff",
        weight: 1.5,
        fillColor: colors[i],
        fillOpacity: 0.95,
      })
        .bindTooltip(`${escapeHtml(p.name)} · ${p.bestScore == null ? "—" : Math.round(p.bestScore)}`)
        .bindPopup(html, { maxWidth: 360 })
        .addTo(g);
    });
  }, [pins, colors]);

  return (
    <div className="space-y-2">
      <div ref={el} className="h-[70vh] min-h-[420px] w-full rounded border border-black/10 dark:border-white/15" />
      <div className="flex flex-wrap items-center gap-3 text-xs text-black/60 dark:text-white/60">
        <span>Best score at each resort:</span>
        <span className="inline-flex items-center gap-1">
          worst
          <span
            className="inline-block h-3 w-24 rounded"
            style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }}
          />
          best of those shown
        </span>
        <span>· bigger pin = more dates · {pins.length} resorts shown</span>
      </div>
    </div>
  );
}

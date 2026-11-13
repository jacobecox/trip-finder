"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtUsd } from "@/lib/format";
import { escapeHtml, pinsFor, rampColor, rankColors, type MapListing, type Pin } from "@/lib/map";

export interface MapRow extends MapListing {
  arrivalDate: string;
  unitType: string;
  totalUsd: number | null;
  travelMode: "drive" | "fly" | null;
  travelSummary: string; // e.g. "✈ LGB · 1 stop" or "drive 3h 10m"
  flightsUrl: string | null; // Google Flights search for this stay
}

// OpenFreeMap: free OpenStreetMap vector tiles, no API key.
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
// English name where OSM has one, else the local name.
const ENGLISH = ["coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name"]];

function popupHtml(p: Pin<MapRow>) {
  const top = p.listings.slice(0, 6);
  const more = p.listings.length - top.length;
  const travel = (l: MapRow) =>
    l.flightsUrl
      ? `<a href="${escapeHtml(l.flightsUrl)}" target="_blank" rel="noreferrer" style="color:inherit;text-decoration:underline dotted">${escapeHtml(l.travelSummary)} ↗</a>`
      : escapeHtml(l.travelSummary);
  return `
    <div style="min-width:220px">
      <div style="font-weight:600">${escapeHtml(p.name)}</div>
      <div class="tf-muted" style="font-size:12px;margin-bottom:4px">${escapeHtml(p.location)}</div>
      <table style="font-size:12px;border-collapse:collapse;width:100%">
        ${top
          .map(
            (l) => `<tr data-trip="${l.id}" class="tf-row">
              <td style="padding:1px 6px 1px 0;font-weight:600;text-align:right">${l.score == null ? "—" : Math.round(l.score)}</td>
              <td style="padding:1px 6px 1px 0;white-space:nowrap"><a href="/trips/${l.id}" style="color:inherit">${escapeHtml(fmtDate(l.arrivalDate))}</a></td>
              <td style="padding:1px 6px 1px 0;text-align:right">${escapeHtml(fmtUsd(l.totalUsd))}</td>
              <td class="tf-muted" style="padding:1px 0;white-space:nowrap">${travel(l)}</td>
            </tr>`,
          )
          .join("")}
      </table>
      ${more > 0 ? `<div class="tf-muted" style="font-size:12px">+${more} more dates</div>` : ""}
    </div>`;
}

/** MapLibre GL + OpenFreeMap vector tiles. Loaded client-only (see trips.tsx). */
export default function ListingsMap({ rows, origin }: { rows: MapRow[]; origin: { label: string; lat: number; lng: number } }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const pins = useMemo(() => pinsFor(rows), [rows]);
  const colors = useMemo(() => rankColors(pins), [pins]);
  const pinsRef = useRef(pins);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE,
      center: [origin.lng, origin.lat],
      zoom: 2.6,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    m.on("load", () => {
      for (const l of m.getStyle().layers) {
        if (l.type === "symbol" && m.getLayoutProperty(l.id, "text-field") != null)
          m.setLayoutProperty(l.id, "text-field", ENGLISH);
      }
      // US states / provinces (admin level 4), visible at every zoom; the style only shows them up close
      m.addLayer(
        {
          id: "states",
          type: "line",
          source: "openmaptiles",
          "source-layer": "boundary",
          filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
          paint: {
            "line-color": "hsl(248,1%,45%)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 6, 1.2, 10, 2],
            "line-opacity": 0.8,
          },
        },
        "boundary_2",
      );
      m.addSource("pins", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "pins",
        type: "circle",
        source: "pins",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["get", "radius"],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.95,
        },
      });
      new maplibregl.Marker({ color: "#facc15", scale: 0.7 })
        .setLngLat([origin.lng, origin.lat])
        .setPopup(new maplibregl.Popup({ offset: 20, className: "tf-popup" }).setText(`Home: ${origin.label}`))
        .addTo(m);

      const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: "none", className: "tf-popup tf-hover" }); // box grows to fit the one-line label
      m.on("mouseenter", "pins", (e: MapLayerMouseEvent) => {
        m.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f) hover.setLngLat(e.lngLat).setText(String(f.properties.label)).addTo(m);
      });
      m.on("mouseleave", "pins", () => {
        m.getCanvas().style.cursor = "";
        hover.remove();
      });
      m.on("click", "pins", (e: MapLayerMouseEvent) => {
        const p = pinsRef.current[Number(e.features?.[0]?.properties.i)];
        if (!p) return;
        hover.remove();
        // one date: straight to its page, like a card; several: pick a date
        if (p.listings.length === 1) return routerRef.current.push(`/trips/${p.listings[0].id}`);
        const popup = new maplibregl.Popup({ maxWidth: "380px", className: "tf-popup" })
          .setLngLat([p.lng, p.lat])
          .setHTML(popupHtml(p))
          .addTo(m);
        popup.getElement().addEventListener("click", (ev) => {
          const t = ev.target as HTMLElement;
          const row = t.closest<HTMLElement>("[data-trip]");
          if (!row || t.closest("a[target=_blank]")) return;
          ev.preventDefault();
          routerRef.current.push(`/trips/${row.dataset.trip}`);
        });
      });
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, [origin.lat, origin.lng, origin.label]);

  useEffect(() => {
    const src = map.current?.getSource("pins") as GeoJSONSource | undefined;
    if (!ready || !src) return;
    pinsRef.current = pins;
    src.setData({
      type: "FeatureCollection",
      features: pins.map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        // best pins are last in `pins`, so they draw on top
        properties: {
          i,
          color: colors[i],
          radius: 7 + Math.min(5, p.listings.length - 1),
          label: `${p.name} · ${p.listings.length === 1 ? "1 date" : `${p.listings.length} dates`}`,
        },
      })),
    });
  }, [ready, pins, colors]);

  return (
    <div className="space-y-2">
      <div ref={el} className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-line" />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
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

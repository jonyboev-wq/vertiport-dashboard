"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";

// Подложка: OpenFreeMap (OSM, без ключей). Для своего сервера — заменить на свои PMTiles.
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export const INITIAL_VIEW = { center: [37.6, 55.76] as [number, number], zoom: 10.2, pitch: 55, bearing: -12 };

export default function MapView({ onReady }: { onReady: (overlay: MapboxOverlay, map: maplibregl.Map) => void }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: STYLE_URL,
      ...INITIAL_VIEW,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("style.load", () => {
      // 3D-здания (как в Aeris: buildings-3d-layer.ts, высоты render_height из OSM)
      if (!map.getLayer("buildings-3d")) {
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
        map.addLayer(
          {
            id: "buildings-3d",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 12,
            paint: {
              "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0], 0, "#4a5468", 40, "#66738c", 120, "#8696b4", 250, "#a9b8d6"],
              "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 12, 0, 13.5, ["coalesce", ["get", "render_height"], ["get", "height"], 8]],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.9,
              "fill-extrusion-vertical-gradient": true,
            },
          },
          firstSymbol,
        );
      }
    });

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    map.once("load", () => onReady(overlay, map));
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} className="map" />;
}

// Слои deck.gl. Графический референс — примеры deck.gl (3D-здания + траектории),
// модели аппаратов — процедурные (src/lib/meshes.ts).

import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer, ColumnLayer } from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { MESHES, type MeshKind } from "@/lib/meshes";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { MODEL_BY_ID, type AircraftModel } from "@/lib/models";
import { VERTIPORTS, NO_FLY, type Vertiport } from "@/lib/vertiports";
import { circle } from "@/lib/geo";
import { isAir, ROUTE_K, type Vehicle, type VpState } from "@/lib/sim";
import type { Params } from "@/lib/params";

export const STATUS_COLOR: Record<string, [number, number, number]> = {
  open: [60, 220, 120],
  limited: [255, 190, 50],
  closed: [255, 70, 70],
  emergency: [255, 0, 200],
};

const STATE_COLOR: Record<string, [number, number, number]> = {
  holding: [255, 190, 50],
};

export interface LayerOpts {
  vehicles: Vehicle[];
  vps: Record<string, VpState>;
  params: Params;
  frame: number;
  zoom: number;
  show: { routes: boolean; trails: boolean; reach: boolean; nofly: boolean; labels: boolean };
  selectedVp: string | null;
  selectedVehicle: string | null;
  reachModel: AircraftModel | null;
  onVehicle: (info: PickingInfo<Vehicle>) => void;
  onVertiport: (info: PickingInfo<Vertiport>) => void;
}

export function buildLayers(o: LayerOpts): Layer[] {
  const air = o.vehicles.filter(isAir);
  const layers: Layer[] = [];

  if (o.show.nofly) {
    layers.push(
      new PolygonLayer({
        id: "nofly",
        data: [{ poly: circle(NO_FLY, NO_FLY.radiusKm, 64) }],
        getPolygon: (d: { poly: [number, number][] }) => d.poly,
        extruded: true,
        wireframe: true,
        getElevation: NO_FLY.topM,
        getFillColor: [255, 60, 60, 28],
        getLineColor: [255, 80, 80, 120],
        pickable: false,
      }),
    );
  }

  if (o.show.reach && o.selectedVp && o.reachModel) {
    const vp = VERTIPORTS.find((v) => v.id === o.selectedVp)!;
    const m = o.reachModel;
    const full = m.rangeKm / ROUTE_K;
    const withReserve = (m.rangeKm * (1 - o.params.reservePct / 100)) / ROUTE_K;
    layers.push(
      new PathLayer({
        id: "reach",
        data: [
          { path: circle(vp, Math.min(full, 400)), c: [255, 255, 255, 120] },
          { path: circle(vp, Math.min(withReserve, 400)), c: [...m.color, 230] },
        ],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: (d: { c: number[] }) => d.c as [number, number, number, number],
        getWidth: 2,
        widthUnits: "pixels",
      }),
    );
  }

  // площадки: зона безопасности + столб для кровли
  layers.push(
    new ScatterplotLayer<Vertiport>({
      id: "vp-zone",
      data: VERTIPORTS,
      getPosition: (d) => [d.lon, d.lat, d.elevM + 0.5],
      getRadius: (d) => (d.kind === "airport" ? 120 : 60),
      radiusMinPixels: 7,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 2,
      getFillColor: (d) => [...STATUS_COLOR[o.vps[d.id].status], d.id === o.selectedVp ? 160 : 90] as [number, number, number, number],
      getLineColor: (d) => [...STATUS_COLOR[o.vps[d.id].status], 255] as [number, number, number, number],
      pickable: true,
      onClick: o.onVertiport,
      updateTriggers: { getFillColor: [o.frame >> 3, o.selectedVp], getLineColor: o.frame >> 3 },
    }),
    new ColumnLayer<Vertiport>({
      id: "vp-roof",
      data: VERTIPORTS.filter((v) => v.elevM > 0),
      getPosition: (d) => [d.lon, d.lat],
      getElevation: (d) => d.elevM,
      radius: 25,
      diskResolution: 4,
      extruded: true,
      getFillColor: [150, 160, 180, 200],
    }),
  );

  if (o.show.labels) {
    layers.push(
      new TextLayer<Vertiport>({
        id: "vp-label",
        data: VERTIPORTS,
        getPosition: (d) => [d.lon, d.lat, d.elevM + 40],
        getText: (d) => d.short,
        getSize: 13,
        getColor: [235, 240, 250, 255],
        getPixelOffset: [0, -18],
        characterSet: "auto",
        fontFamily: "Arial, sans-serif",
        fontWeight: 700,
        outlineWidth: 3,
        outlineColor: [10, 12, 18, 255],
        fontSettings: { sdf: true },
        billboard: true,
      }),
    );
  }

  if (o.show.routes) {
    layers.push(
      new PathLayer<Vehicle>({
        id: "routes",
        data: air,
        getPath: (v) => [[v.lon, v.lat, v.alt], ...v.route.slice(v.wp).map((p, i, arr) => [p.lon, p.lat, i === arr.length - 1 ? 0 : v.cruiseAlt] as [number, number, number])],
        getColor: (v) => [...MODEL_BY_ID[v.modelId].color, v.id === o.selectedVehicle ? 220 : 55] as [number, number, number, number],
        getWidth: (v) => (v.id === o.selectedVehicle ? 3 : 1),
        widthUnits: "pixels",
        updateTriggers: { getPath: o.frame, getColor: o.selectedVehicle, getWidth: o.selectedVehicle },
      }),
    );
  }

  if (o.show.trails) {
    layers.push(
      new PathLayer<Vehicle>({
        id: "trails",
        data: air,
        getPath: (v) => [...v.trail, [v.lon, v.lat, v.alt]],
        getColor: (v) => [...(STATE_COLOR[v.state] ?? MODEL_BY_ID[v.modelId].color), 200] as [number, number, number, number],
        getWidth: 3,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        updateTriggers: { getPath: o.frame, getColor: o.frame >> 3 },
      }),
    );
  }

  // тени на земле — помогают считывать высоту над застройкой
  layers.push(
    new ScatterplotLayer<Vehicle>({
      id: "shadows",
      data: air,
      getPosition: (v) => [v.lon, v.lat, 0.3],
      getRadius: (v) => MODEL_BY_ID[v.modelId].dM * 1.5,
      radiusMinPixels: 2,
      getFillColor: [0, 0, 0, 90],
      updateTriggers: { getPosition: o.frame },
    }),
  );

  const mpp = (156543.03 * Math.cos((55.75 * Math.PI) / 180)) / 2 ** o.zoom; // м на пиксель
  for (const mesh of Object.keys(MESHES) as MeshKind[]) {
    const data = o.vehicles.filter((v) => MODEL_BY_ID[v.modelId].mesh === mesh);
    layers.push(
      new SimpleMeshLayer<Vehicle>({
        id: `veh-${mesh}`,
        data,
        mesh: MESHES[mesh] as never,
        getPosition: (v) => [v.lon, v.lat, v.alt + 1],
        // нос меша смотрит на +Y (север); yaw в deck.gl — против часовой
        getOrientation: (v) => [0, -v.heading, 0],
        // размер в метрах: реальный габарит D × 2,5, но на экране не меньше 22 px и не больше 70 px
        getScale: (v) => {
          const real = MODEL_BY_ID[v.modelId].dM * 2.5;
          const min = (isAir(v) ? 22 : 12) * mpp;
          const s = Math.min(70 * mpp, Math.max(real, min));
          return [s, s, s];
        },
        getColor: (v) => {
          const c = v.state === "holding" ? STATE_COLOR.holding : MODEL_BY_ID[v.modelId].color;
          return [...c, isAir(v) ? 255 : 170] as [number, number, number, number];
        },
        material: { ambient: 0.55, diffuse: 0.7, shininess: 24, specularColor: [80, 80, 80] },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120],
        onClick: o.onVehicle,
        updateTriggers: { getPosition: o.frame, getOrientation: o.frame, getColor: o.frame >> 3, getScale: [o.frame >> 3, o.zoom] },
      }),
    );
  }

  if (o.selectedVehicle) {
    const v = o.vehicles.find((x) => x.id === o.selectedVehicle);
    if (v)
      layers.push(
        new ScatterplotLayer<Vehicle>({
          id: "sel",
          data: [v],
          getPosition: (x) => [x.lon, x.lat, x.alt],
          getRadius: 60,
          radiusMinPixels: 16,
          stroked: true,
          filled: false,
          lineWidthMinPixels: 2,
          getLineColor: [255, 255, 255, 230],
          updateTriggers: { getPosition: o.frame },
        }),
      );
  }
  return layers;
}

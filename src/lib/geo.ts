export interface LL {
  lat: number;
  lon: number;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distM(a: LL, b: LL): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LL, b: LL): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function dest(p: LL, brgDeg: number, d: number): LL {
  const δ = d / R;
  const θ = rad(brgDeg);
  const φ1 = rad(p.lat);
  const λ1 = rad(p.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: deg(φ2), lon: deg(λ2) };
}

/** Локальная проекция в км относительно опорной точки (для коротких расстояний). */
export function toXY(o: LL, p: LL): [number, number] {
  return [((p.lon - o.lon) * Math.cos(rad(o.lat)) * Math.PI * R) / 180 / 1000, ((p.lat - o.lat) * Math.PI * R) / 180 / 1000];
}

export function fromXY(o: LL, x: number, y: number): LL {
  return { lat: o.lat + ((y * 1000) / R) * (180 / Math.PI), lon: o.lon + ((x * 1000) / (R * Math.cos(rad(o.lat)))) * (180 / Math.PI) };
}

/** Окружность радиусом rKm вокруг точки, [lon, lat][] */
export function circle(c: LL, rKm: number, n = 96): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const p = dest(c, (i * 360) / n, rKm * 1000);
    pts.push([p.lon, p.lat]);
  }
  return pts;
}

export function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

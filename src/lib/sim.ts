// Симулятор движения eVTOL между вертипортами Москвы.
// Реализует цепочки «данные → анализ → решение → действие» C1–C13 с листа А2 (трек 04).
// Источник трафика заменяемый (см. source.ts): сейчас симулятор, позже — живые данные.

import { MODELS, MODEL_BY_ID, type AircraftModel } from "./models";
import { VERTIPORTS, VERTIPORT_BY_ID, NO_FLY, type Vertiport } from "./vertiports";
import { OPS_PER_HOUR, NO_INCIDENTS, type Incidents, type Params } from "./params";
import { bearing, dest, distM, toXY, fromXY, angleDiff, mulberry32, type LL } from "./geo";

export type VState = "parked" | "charging" | "boarding" | "climb" | "cruise" | "holding" | "descent";
export type VpStatus = "open" | "limited" | "closed" | "emergency";

export interface Vehicle {
  id: string;
  modelId: string;
  state: VState;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  at: string | null;
  from: string | null;
  to: string | null;
  route: LL[];
  wp: number;
  cruiseAlt: number;
  soc: number;
  timer: number;
  holdS: number;
  diverted: boolean;
  gsKmh: number;
  etaS: number;
  trail: [number, number, number][];
  trailT: number;
  reason: string;
}

export interface VpState {
  id: string;
  status: VpStatus;
  reasons: { chain: string; text: string }[];
  heatingOn: boolean;
  opsTimes: number[];
  chargingKw: number;
  capped: boolean;
  incidents: Incidents;
}

export interface LogEntry {
  t: number;
  chain: string;
  text: string;
  level: "info" | "warn" | "alert";
}

const STATUS_RANK: Record<VpStatus, number> = { open: 0, limited: 1, closed: 2, emergency: 3 };
const VS_CLIMB = 4; // м/с
const VS_DESC = 3;
const TURNAROUND_S = 300; // высадка/посадка пассажиров
const HOLD_MAX_S = 900;
const ROUTE_K = 1.1; // коэффициент непрямолинейности (как в «Анализе региона»)

export class Sim {
  t = 0;
  vehicles: Vehicle[] = [];
  vps: Record<string, VpState> = {};
  log: LogEntry[] = [];
  stats = { departures: 0, arrivals: 0, diversions: 0, holds: 0, cancelled: 0 };
  private rnd = mulberry32(42);
  private seq = 0;
  private lastFleet: Record<string, number> = {};

  constructor(public params: Params, fleet: Record<string, number>) {
    for (const v of VERTIPORTS) {
      this.vps[v.id] = { id: v.id, status: "open", reasons: [], heatingOn: false, opsTimes: [], chargingKw: 0, capped: false, incidents: { ...NO_INCIDENTS } };
    }
    this.setFleet(fleet);
    this.push("C13", "Симуляция запущена: узлы Москвы, параметры паспорта P01 v0.1", "info");
  }

  // ---------------- флот ----------------
  setFleet(fleet: Record<string, number>) {
    for (const m of MODELS) {
      const want = fleet[m.id] ?? 0;
      const have = this.vehicles.filter((v) => v.modelId === m.id);
      if (have.length < want) {
        for (let i = have.length; i < want; i++) this.vehicles.push(this.spawn(m));
      } else if (have.length > want) {
        // убираем сначала стоящих на земле
        const drop = [...have].sort((a, b) => Number(isAir(a)) - Number(isAir(b))).slice(0, have.length - want);
        const ids = new Set(drop.map((d) => d.id));
        this.vehicles = this.vehicles.filter((v) => !ids.has(v.id));
      }
    }
    this.lastFleet = { ...fleet };
  }

  private spawn(m: AircraftModel): Vehicle {
    const pool = m.kind === "cargo" ? VERTIPORTS.filter((v) => v.kind === "hub" || v.kind === "airport") : VERTIPORTS;
    const vp = pool[Math.floor(this.rnd() * pool.length)];
    const p = dest(vp, this.rnd() * 360, 40 + this.rnd() * 60);
    return {
      id: `${m.id}-${++this.seq}`,
      modelId: m.id,
      state: "parked",
      lat: p.lat,
      lon: p.lon,
      alt: vp.elevM,
      heading: this.rnd() * 360,
      at: vp.id,
      from: null,
      to: null,
      route: [],
      wp: 0,
      cruiseAlt: 0,
      soc: 0.55 + this.rnd() * 0.4,
      timer: this.rnd() * 600,
      holdS: 0,
      diverted: false,
      gsKmh: 0,
      etaS: 0,
      trail: [],
      trailT: 0,
      reason: "",
    };
  }

  setIncident(vpId: string, key: keyof Incidents, val: boolean) {
    this.vps[vpId].incidents[key] = val;
  }

  private push(chain: string, text: string, level: LogEntry["level"]) {
    this.log.unshift({ t: this.t, chain, text, level });
    if (this.log.length > 200) this.log.length = 200;
  }

  // ---------------- C1, C2, C6, C8, C11, C12: статус площадки ----------------
  private evalVertiport(v: Vertiport) {
    const p = this.params;
    const s = this.vps[v.id];
    const r: { chain: string; text: string; st: VpStatus }[] = [];
    const inc = s.incidents;
    if (inc.fire) r.push({ chain: "C12", text: "Пожар / перегрев АКБ — аварийный режим", st: "emergency" });
    if (inc.closed) r.push({ chain: "C3", text: "Закрыто диспетчером", st: "closed" });
    if (inc.people) r.push({ chain: "C11", text: "Люди / предметы в зоне посадки", st: "closed" });
    if (p.gustMs >= p.padWindCloseMs) r.push({ chain: "C1", text: `Порыв ${p.gustMs} м/с ≥ ${p.padWindCloseMs} — площадка закрыта`, st: "closed" });
    else if (p.gustMs >= p.padWindLimitMs) r.push({ chain: "C1", text: `Порыв ${p.gustMs} м/с ≥ ${p.padWindLimitMs} — только D ≤ 12 м и стойкие к ветру`, st: "limited" });
    // ветер на кровле сильнее (R1)
    if (v.kind === "R1" && p.gustMs * 1.15 >= p.padWindCloseMs && p.gustMs < p.padWindCloseMs)
      r.push({ chain: "C1", text: "Кровля: усиление ветра у здания ×1,15 — закрыто", st: "closed" });
    if (p.visibilityKm < p.minVisibilityKm) r.push({ chain: "C1", text: `Видимость ${p.visibilityKm} км < ${p.minVisibilityKm}`, st: "closed" });
    if (p.cloudBaseM < p.minCloudBaseM) r.push({ chain: "C1", text: `Облачность ${p.cloudBaseM} м < ${p.minCloudBaseM}`, st: "closed" });
    const icing = p.precip !== "none" && p.tempC <= 2 && p.tempC >= -20;
    let heatingOn = false;
    if (p.precip === "freezing") r.push({ chain: "C2", text: "Ледяной дождь — площадка закрыта", st: "closed" });
    else if (icing) {
      if (p.heating) {
        heatingOn = true;
        r.push({ chain: "C2", text: "Условия обледенения — включён обогрев покрытия", st: "open" });
      } else r.push({ chain: "C2", text: "Обледенение, обогрев выключен — закрыто", st: "closed" });
    }
    if (p.precip === "snow" && p.precipPct > 70 && !p.heating) r.push({ chain: "C2", text: "Сильный снег без обогрева — закрыто", st: "closed" });
    if (inc.power) r.push({ chain: "C8", text: "Отказ электроснабжения — зарядка недоступна", st: "limited" });

    const status = r.reduce<VpStatus>((acc, x) => (STATUS_RANK[x.st] > STATUS_RANK[acc] ? x.st : acc), "open");
    if (status !== s.status) {
      const why = r.filter((x) => x.st === status).map((x) => x.text).join("; ");
      this.push(r.find((x) => x.st === status)?.chain ?? "C1", `${v.short}: ${statusRu(status)}${why ? " — " + why : ""}`, status === "open" ? "info" : status === "limited" ? "warn" : "alert");
    }
    if (heatingOn && !s.heatingOn) this.push("C2", `${v.short}: включён обогрев покрытия`, "info");
    s.status = status;
    s.reasons = r.map(({ chain, text }) => ({ chain, text }));
    s.heatingOn = heatingOn;
    s.opsTimes = s.opsTimes.filter((t) => this.t - t < 3600);
  }

  opsLimit(v: Vertiport) {
    return OPS_PER_HOUR[this.params.mode] * v.pads;
  }

  private padsBusy(vpId: string) {
    return this.vehicles.filter((x) => (x.state === "boarding" && x.at === vpId) || (x.state === "descent" && x.to === vpId) || (x.state === "climb" && x.from === vpId && x.alt < 60)).length;
  }

  private standsUsed(vpId: string) {
    return this.vehicles.filter((x) => (x.state === "parked" || x.state === "charging") && x.at === vpId).length;
  }

  /** Может ли аппарат данной модели работать на площадке (взлёт/посадка). */
  canUse(m: AircraftModel, vpId: string) {
    const s = this.vps[vpId];
    if (s.status === "closed" || s.status === "emergency") return false;
    if (s.status === "limited" && this.params.gustMs >= this.params.padWindLimitMs && (m.dM > 12 || this.params.gustMs > m.windLimitMs)) return false;
    return true;
  }

  private canLand(m: AircraftModel, vpId: string) {
    const v = VERTIPORT_BY_ID[vpId];
    if (!this.canUse(m, vpId)) return { ok: false, why: "площадка недоступна" };
    if (this.padsBusy(vpId) >= v.pads) return { ok: false, why: "FATO занята" };
    if (this.vps[vpId].opsTimes.length >= this.opsLimit(v)) return { ok: false, why: `лимит ${this.params.mode}` };
    return { ok: true, why: "" };
  }

  // ---------------- маршрут, C5: обход запретной зоны и эшелоны ----------------
  private routeFor(a: LL, b: LL): LL[] {
    const o = { lat: NO_FLY.lat, lon: NO_FLY.lon };
    const A = toXY(o, a);
    const B = toXY(o, b);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(A[0] * dx + A[1] * dy) / len2));
    const cx = A[0] + t * dx;
    const cy = A[1] + t * dy;
    const d = Math.hypot(cx, cy);
    if (d >= NO_FLY.radiusKm * 1.15 || t === 0 || t === 1) return [a, b];
    const nx = d > 0.01 ? cx / d : -dy / Math.sqrt(len2);
    const ny = d > 0.01 ? cy / d : dx / Math.sqrt(len2);
    const r = NO_FLY.radiusKm * 1.45;
    return [a, fromXY(o, nx * r, ny * r), b];
  }

  private pickLevel(track: number): number | null {
    const p = this.params;
    const top = Math.min(p.corridorMaxM, p.cloudBaseM - 50);
    if (top < p.corridorMinM) return null;
    const n = Math.floor((top - p.corridorMinM) / p.levelStepM) + 1;
    const east = track < 180;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (n === 1 || (i % 2 === 0) === east) idx.push(i);
    if (!idx.length) idx.push(0);
    const use = (lvl: number) => this.vehicles.filter((v) => isAir(v) && Math.abs(v.cruiseAlt - lvl) < 1).length;
    let best = idx[0];
    for (const i of idx) if (use(p.corridorMinM + i * p.levelStepM) < use(p.corridorMinM + best * p.levelStepM)) best = i;
    return p.corridorMinM + best * p.levelStepM;
  }

  private routeKm(route: LL[]) {
    let s = 0;
    for (let i = 1; i < route.length; i++) s += distM(route[i - 1], route[i]);
    return s / 1000;
  }

  /** Доступная дальность с учётом заряда и резерва, км. */
  reachKm(m: AircraftModel, soc: number) {
    return Math.max(0, m.rangeKm * (soc - this.params.reservePct / 100));
  }

  // ---------------- C3/C6/C7: вылет ----------------
  private tryDepart(v: Vehicle, m: AircraftModel) {
    const vp = VERTIPORT_BY_ID[v.at!];
    const s = this.vps[vp.id];
    if (!this.canUse(m, vp.id)) return (v.reason = "ждёт: площадка недоступна");
    if (this.params.gustMs > m.windLimitMs) return (v.reason = `ждёт: порыв > предела модели ${m.windLimitMs} м/с`);
    if (s.opsTimes.length >= this.opsLimit(vp)) return (v.reason = `ждёт: лимит операций ${this.params.mode}`);
    if (this.padsBusy(vp.id) >= vp.pads) return (v.reason = "ждёт: FATO занята");
    const reach = this.reachKm(m, v.soc);
    const cands = VERTIPORTS.filter((x) => {
      if (x.id === vp.id) return false;
      if (m.kind === "cargo" && x.kind === "R1") return false;
      if (!this.canUse(m, x.id)) return false;
      const km = this.routeKm(this.routeFor(vp, x)) * ROUTE_K;
      return km <= reach && km > 2;
    });
    if (!cands.length) {
      v.reason = reach < 5 ? "ждёт: нужен заряд" : "ждёт: нет доступных узлов в радиусе";
      return;
    }
    const to = cands[Math.floor(this.rnd() * cands.length)];
    const route = this.routeFor(vp, to);
    const lvl = this.pickLevel(bearing(vp, to));
    if (lvl === null) return (v.reason = "ждёт: облачность ниже коридора");
    v.state = "climb";
    v.from = vp.id;
    v.to = to.id;
    v.at = null;
    v.route = route;
    v.wp = 1;
    v.cruiseAlt = vp.elevM + lvl;
    v.lat = vp.lat;
    v.lon = vp.lon;
    v.alt = vp.elevM;
    v.holdS = 0;
    v.diverted = false;
    v.trail = [];
    v.reason = "";
    s.opsTimes.push(this.t);
    this.stats.departures++;
    if (route.length > 2) this.push("C5", `${m.name}: ${vp.short} → ${to.short}, обход запретной зоны, эшелон ${lvl} м`, "info");
  }

  private divert(v: Vehicle, m: AircraftModel, why: string, chain: string) {
    const here = { lat: v.lat, lon: v.lon };
    const reach = this.reachKm(m, v.soc) + m.rangeKm * (this.params.reservePct / 100) * 0.8; // можно тратить часть резерва
    const opts = VERTIPORTS.filter((x) => x.id !== v.to && this.canUse(m, x.id))
      .map((x) => ({ x, km: distM(here, x) / 1000 }))
      .filter((o) => o.km * ROUTE_K <= reach)
      .sort((a, b) => a.km - b.km);
    if (!opts.length) {
      this.push(chain, `${m.name}: нет запасной площадки — ожидание в зоне`, "alert");
      return false;
    }
    const to = opts[0].x;
    this.push(chain, `${m.name}: уход на запасной ${to.short} (${why})`, "warn");
    v.to = to.id;
    v.route = this.routeFor(here, to);
    v.wp = 1;
    v.state = "cruise";
    v.holdS = 0;
    v.diverted = true;
    this.stats.diversions++;
    return true;
  }

  // ---------------- шаг симуляции ----------------
  step(dtReal: number) {
    const p = this.params;
    if (p.paused) return;
    const dt = Math.min(dtReal, 0.25) * p.simSpeed;
    this.t += dt;
    for (const v of VERTIPORTS) this.evalVertiport(v);

    // C7/C8: зарядка с ограничением мощности сети
    for (const vp of VERTIPORTS) {
      const s = this.vps[vp.id];
      const charging = this.vehicles.filter((x) => x.state === "charging" && x.at === vp.id);
      const heatKw = s.heatingOn ? 80 : 0;
      const kwEach = charging.length ? Math.min(p.chargeKw, Math.max(0, vp.gridKw - heatKw) / charging.length) : 0;
      const capped = charging.length > 0 && kwEach < p.chargeKw - 1;
      if (capped && !s.capped) this.push("C8", `${vp.short}: пик мощности — зарядка ограничена до ${Math.round(kwEach)} кВт на место`, "warn");
      s.capped = capped;
      s.chargingKw = s.incidents.power ? 0 : kwEach * charging.length + heatKw;
      for (const x of charging) {
        if (s.incidents.power) continue;
        const m = MODEL_BY_ID[x.modelId];
        x.soc = Math.min(1, x.soc + (kwEach * dt) / 3600 / m.batteryKWh);
        if (x.soc >= 0.92) {
          x.state = "parked";
          x.timer = 120 + this.rnd() * 600;
        }
      }
    }

    const windTo = (p.windFromDeg + 180) % 360;
    for (const v of this.vehicles) {
      const m = MODEL_BY_ID[v.modelId];
      const airMs = m.cruiseKmh / 3.6;
      switch (v.state) {
        case "parked": {
          v.timer -= dt;
          if (v.soc < 0.5 && v.at) {
            const vp = VERTIPORT_BY_ID[v.at];
            const busy = this.vehicles.filter((x) => x.state === "charging" && x.at === vp.id).length;
            if (busy < vp.chargers && !this.vps[vp.id].incidents.power) {
              v.state = "charging";
              v.reason = "";
              break;
            }
            v.reason = this.vps[vp.id].incidents.power ? "ждёт: нет питания" : "очередь на зарядку (C7)";
          }
          if (v.timer <= 0) {
            this.tryDepart(v, m);
            if (v.state === "parked") v.timer = 30;
          }
          break;
        }
        case "charging":
          break;
        case "boarding": {
          v.timer -= dt;
          if (v.timer <= 0) {
            const vp = VERTIPORT_BY_ID[v.at!];
            const p0 = dest(vp, this.rnd() * 360, 40 + this.rnd() * 60);
            v.lat = p0.lat;
            v.lon = p0.lon;
            v.state = "parked";
            v.timer = 60 + this.rnd() * 300;
          }
          break;
        }
        case "climb":
        case "cruise":
        case "holding":
        case "descent":
          this.fly(v, m, airMs, windTo, dt);
          break;
      }
      // C1 в полёте: порыв выше предела модели
      if ((v.state === "cruise" || v.state === "climb") && p.gustMs > m.windLimitMs && !v.diverted) {
        this.divert(v, m, `порыв ${p.gustMs} > ${m.windLimitMs} м/с`, "C1");
      }
      if (isAir(v)) {
        v.trailT -= dt;
        if (v.trailT <= 0) {
          v.trail.push([v.lon, v.lat, v.alt]);
          if (v.trail.length > 60) v.trail.shift();
          v.trailT = 4;
        }
      }
    }

    // C12: аварийный режим — все, кто летит туда, уходят
    for (const v of this.vehicles) {
      if (!isAir(v) || !v.to) continue;
      const s = this.vps[v.to];
      if ((s.status === "emergency" || s.status === "closed") && v.state !== "descent" && !v.diverted) {
        const m = MODEL_BY_ID[v.modelId];
        if (distM(v, VERTIPORT_BY_ID[v.to]) < 6000 || s.status === "emergency") this.divert(v, m, s.reasons[0]?.text ?? statusRu(s.status), s.status === "emergency" ? "C12" : "C3");
      }
    }
  }

  private fly(v: Vehicle, m: AircraftModel, airMs: number, windTo: number, dt: number) {
    const p = this.params;
    const target = v.route[Math.min(v.wp, v.route.length - 1)];
    const dst = VERTIPORT_BY_ID[v.to!];
    const trk = bearing(v, target);
    // C4: путевая скорость с учётом ветра
    const gs = Math.max(8, airMs + p.windMs * Math.cos(((angleDiff(trk, windTo)) * Math.PI) / 180));
    const toDst = distM(v, dst);

    if (v.state === "holding") {
      v.holdS += dt;
      const c = dest(dst, bearing(dst, v) , 1500);
      const ang = (bearing(dst, v) + (gs * dt * 180) / (Math.PI * 1500)) % 360;
      const np = dest(dst, ang, 1500);
      v.heading = (ang + 90) % 360;
      v.lat = np.lat;
      v.lon = np.lon;
      void c;
      const land = this.canLand(m, dst.id);
      if (land.ok) {
        v.state = "descent";
        this.push("C3", `${m.name}: допуск к посадке на ${dst.short} после ожидания ${Math.round(v.holdS / 60)} мин`, "info");
      } else if (v.holdS > HOLD_MAX_S || v.soc < p.reservePct / 100) {
        this.divert(v, m, `ожидание > ${HOLD_MAX_S / 60} мин`, "C3");
      }
      this.drain(v, m, airMs * dt * 1.1);
      v.gsKmh = gs * 3.6;
      v.etaS = 0;
      return;
    }

    if (v.state === "climb") {
      v.alt = Math.min(v.cruiseAlt, v.alt + VS_CLIMB * dt);
      if (v.alt >= v.cruiseAlt) v.state = "cruise";
      this.drain(v, m, airMs * dt * 0.6);
    }

    if (v.state === "descent") {
      v.alt = Math.max(dst.elevM, v.alt - VS_DESC * dt * (toDst < 300 ? 1 : 1.5));
      this.drain(v, m, airMs * dt * 0.5);
    }

    // горизонтальное перемещение
    const hs = v.state === "cruise" ? gs : v.state === "climb" ? gs * 0.35 : Math.min(gs * 0.5, Math.max(6, toDst / 20));
    const step = hs * dt;
    const dWp = distM(v, target);
    if (step >= dWp) {
      v.lat = target.lat;
      v.lon = target.lon;
      if (v.wp < v.route.length - 1) v.wp++;
    } else {
      const np = dest(v, trk, step);
      v.lat = np.lat;
      v.lon = np.lon;
    }
    v.heading = trk;
    if (v.state === "cruise") this.drain(v, m, airMs * dt);
    v.gsKmh = hs * 3.6;

    // ETA (C4)
    let rem = toDst;
    if (v.wp < v.route.length - 1) rem = distM(v, target) + this.routeKm(v.route.slice(v.wp)) * 1000;
    v.etaS = rem / Math.max(gs, 1) + (v.alt - dst.elevM) / VS_DESC;

    // C3: перед снижением — допуск к посадке
    const descentDist = ((v.alt - dst.elevM) / VS_DESC) * gs * 0.5 + 300;
    if (v.state === "cruise" && v.wp >= v.route.length - 1 && toDst < Math.max(descentDist, 1500)) {
      const land = this.canLand(m, dst.id);
      if (land.ok) v.state = "descent";
      else {
        v.state = "holding";
        v.holdS = 0;
        this.stats.holds++;
        this.push("C3", `${m.name}: holding у ${dst.short} — ${land.why}`, "warn");
      }
    }

    if (v.state === "descent" && toDst < 30 && v.alt <= dst.elevM + 1) {
      v.state = "boarding";
      v.at = dst.id;
      v.lat = dst.lat;
      v.lon = dst.lon;
      v.alt = dst.elevM;
      v.timer = TURNAROUND_S;
      v.trail = [];
      v.etaS = 0;
      v.gsKmh = 0;
      this.vps[dst.id].opsTimes.push(this.t);
      this.stats.arrivals++;
      if (this.standsUsed(dst.id) >= dst.stands) this.push("C6", `${dst.short}: стоянки заполнены (${dst.stands})`, "warn");
    }
  }

  private drain(v: Vehicle, m: AircraftModel, meters: number) {
    v.soc = Math.max(0, v.soc - meters / 1000 / m.rangeKm);
  }

  counts() {
    const c = { air: 0, holding: 0, ground: 0, charging: 0 };
    for (const v of this.vehicles) {
      if (v.state === "holding") c.holding++;
      if (isAir(v)) c.air++;
      else if (v.state === "charging") c.charging++;
      else c.ground++;
    }
    return c;
  }
}

export function isAir(v: Vehicle) {
  return v.state === "climb" || v.state === "cruise" || v.state === "holding" || v.state === "descent";
}

export function statusRu(s: VpStatus) {
  return { open: "открыт", limited: "ограничен", closed: "закрыт", emergency: "аварийный режим" }[s];
}

export function stateRu(s: VState) {
  return { parked: "на стоянке", charging: "зарядка", boarding: "посадка/высадка", climb: "набор высоты", cruise: "полёт", holding: "ожидание (holding)", descent: "снижение" }[s];
}

/** Полная поездка по методике «Анализа региона»: 30 мин наземных фаз + полёт. */
export function tripMinutes(km: number, cruiseKmh: number) {
  return 30 + ((km * ROUTE_K) / cruiseKmh) * 60;
}
export { ROUTE_K };

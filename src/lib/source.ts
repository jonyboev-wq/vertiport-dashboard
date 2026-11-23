// Заменяемый источник трафика — тот же приём, что в Aeris (adsb.lol → OpenSky → fallback).
// Сейчас: SimSource (симулятор в браузере).
// Дальше: WsSource — подключение к нашему серверу, куда идут данные датчиков и телеметрия eVTOL
// (формат сообщения = Vehicle / VpState из sim.ts), без изменений в карте и панели.

import type { Params } from "./params";
import type { Incidents } from "./params";
import { Sim, type Vehicle, type VpState, type LogEntry } from "./sim";

export interface TrafficSource {
  readonly kind: "simulator" | "live";
  vehicles(): Vehicle[];
  vertiports(): Record<string, VpState>;
  log(): LogEntry[];
  time(): number;
  tick(dtReal: number): void;
  setParams(p: Params): void;
  setFleet(f: Record<string, number>): void;
  setIncident(vpId: string, key: keyof Incidents, val: boolean): void;
}

export class SimSource implements TrafficSource {
  readonly kind = "simulator" as const;
  sim: Sim;
  constructor(p: Params, fleet: Record<string, number>) {
    this.sim = new Sim(p, fleet);
  }
  vehicles() { return this.sim.vehicles; }
  vertiports() { return this.sim.vps; }
  log() { return this.sim.log; }
  time() { return this.sim.t; }
  tick(dt: number) { this.sim.step(dt); }
  setParams(p: Params) { this.sim.params = p; }
  setFleet(f: Record<string, number>) { this.sim.setFleet(f); }
  setIncident(id: string, k: keyof Incidents, v: boolean) { this.sim.setIncident(id, k, v); }
}

// Заготовка под реальные данные (не используется в демо):
// export class WsSource implements TrafficSource {
//   readonly kind = "live";
//   constructor(url: string) { /* new WebSocket(url); onmessage → обновить vehicles/vertiports */ }
//   ...
// }

// Все параметры демо, которые меняются на панели.
// Статусы по правилу модуля 2: «Ф» — принято, «Р» — рабочее допущение, «И» — исследуется.

export type Precip = "none" | "rain" | "snow" | "freezing";
export type OpsMode = "O1" | "O2" | "O3";

export interface Params {
  // окружающая среда
  windFromDeg: number; // откуда дует, °
  windMs: number; // средняя скорость
  gustMs: number; // порывы
  tempC: number;
  precip: Precip;
  precipPct: number; // интенсивность 0–100
  visibilityKm: number;
  cloudBaseM: number;
  heating: boolean; // обогрев площадок
  // эксплуатация
  mode: OpsMode; // O1/O2/O3 = 4/8/12 оп/ч (паспорт P01, «Р»)
  corridorMinM: number;
  corridorMaxM: number;
  levelStepM: number; // шаг эшелонов
  chargeKw: number; // мощность одного зарядного места
  reservePct: number; // энергетический резерв
  // пороги (статус «И», ждём от треков 05/06)
  padWindLimitMs: number; // ограничение работы площадки
  padWindCloseMs: number; // закрытие площадки
  minVisibilityKm: number;
  minCloudBaseM: number;
  // симуляция
  simSpeed: number;
  paused: boolean;
}

export const DEFAULT_PARAMS: Params = {
  windFromDeg: 240,
  windMs: 5,
  gustMs: 8,
  tempC: 8,
  precip: "none",
  precipPct: 30,
  visibilityKm: 10,
  cloudBaseM: 900,
  heating: true,
  mode: "O2",
  corridorMinM: 150,
  corridorMaxM: 450,
  levelStepM: 60,
  chargeKw: 300,
  reservePct: 20,
  padWindLimitMs: 10,
  padWindCloseMs: 15,
  minVisibilityKm: 1.5,
  minCloudBaseM: 150,
  simSpeed: 10,
  paused: false,
};

export const OPS_PER_HOUR: Record<OpsMode, number> = { O1: 4, O2: 8, O3: 12 };

export interface Incidents {
  people: boolean; // люди / предметы в зоне посадки (C11)
  fire: boolean; // пожар, перегрев АКБ (C12)
  power: boolean; // отказ электроснабжения (C8)
  closed: boolean; // закрыто диспетчером
}

export const NO_INCIDENTS: Incidents = { people: false, fire: false, power: false, closed: false };

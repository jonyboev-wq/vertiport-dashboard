// Каталог аппаратов для демо.
// Источник основных полей (места/груз, МВМ, D, дальность, класс) — база знаний КОНТУР Н,
// «Классы низковысотных воздушных судов» (данные производителей, UGPTI 2023).
// ECOLIBRI — данные АО «Эколибри» и каталога AeroNet (drones.aeronet2035.ru/model/914).
// Поля из списка `assumed` — рабочие допущения (статус «Р»): крейсерская скорость,
// предельный ветер, ёмкость батареи. Их нужно уточнить по документации производителя.

export type ModelKind = "passenger" | "cargo";
import type { MeshKind } from "./meshes";
export type MeshKey = MeshKind;

export interface AircraftModel {
  id: string;
  name: string;
  country: string;
  kind: ModelKind;
  seats: string; // «1+4», «2», «—»
  payloadKg: number | null;
  mtowKg: number;
  dM: number; // габарит D, м
  rangeKm: number; // расчётная дальность
  cruiseKmh: number; // крейсерская скорость
  windLimitMs: number; // предельный порыв для полёта
  batteryKWh: number; // эквивалентная ёмкость для расчёта зарядки
  classCode: string; // П3·Д3 и т.п.
  mesh: MeshKey;
  color: [number, number, number];
  source: string;
  assumed: string[];
}

export const MODELS: AircraftModel[] = [
  {
    id: "ecolibri",
    name: "ECOLIBRI eVTOL",
    country: "Россия",
    kind: "passenger",
    seats: "4–5",
    payloadKg: 500,
    mtowKg: 2200,
    dM: 5,
    rangeKm: 1200,
    cruiseKmh: 280,
    windLimitMs: 15,
    batteryKWh: 300,
    classCode: "П3·Д2 (оценка)",
    mesh: "winged",
    color: [255, 120, 60],
    source: "АО «Эколибри»; AeroNet: дальность 1200 км, макс. скорость 280 км/ч, МВМ 2200 кг, длина 5 м",
    assumed: ["D = длина 5 м (размах не опубликован)", "крейсерская = максимальной", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "eh216",
    name: "EHang EH216-S",
    country: "Китай",
    kind: "passenger",
    seats: "2",
    payloadKg: null,
    mtowKg: 620,
    dM: 5.7,
    rangeKm: 30,
    cruiseKmh: 100,
    windLimitMs: 10,
    batteryKWh: 40,
    classCode: "П3·Д2",
    mesh: "multi",
    color: [255, 210, 60],
    source: "База знаний КОНТУР Н",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "volocity",
    name: "Volocopter VoloCity",
    country: "Германия",
    kind: "passenger",
    seats: "2",
    payloadKg: null,
    mtowKg: 1000,
    dM: 11.3,
    rangeKm: 20,
    cruiseKmh: 90,
    windLimitMs: 10,
    batteryKWh: 40,
    classCode: "П3·Д3",
    mesh: "multi",
    color: [120, 220, 255],
    source: "База знаний КОНТУР Н",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "cityairbus",
    name: "Airbus CityAirbus NextGen",
    country: "ЕС",
    kind: "passenger",
    seats: "4",
    payloadKg: null,
    mtowKg: 2200,
    dM: 11.4,
    rangeKm: 80,
    cruiseKmh: 120,
    windLimitMs: 12,
    batteryKWh: 110,
    classCode: "П3·Д3",
    mesh: "winged",
    color: [90, 160, 255],
    source: "База знаний КОНТУР Н",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "eve",
    name: "Eve (Embraer)",
    country: "Бразилия",
    kind: "passenger",
    seats: "4",
    payloadKg: null,
    mtowKg: 1542,
    dM: 13,
    rangeKm: 97,
    cruiseKmh: 160,
    windLimitMs: 14,
    batteryKWh: 120,
    classCode: "П3·Д4",
    mesh: "winged",
    color: [80, 230, 160],
    source: "База знаний КОНТУР Н",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "joby",
    name: "Joby S4",
    country: "США",
    kind: "passenger",
    seats: "1+4",
    payloadKg: null,
    mtowKg: 2404,
    dM: 11.9,
    rangeKm: 161,
    cruiseKmh: 240,
    windLimitMs: 15,
    batteryKWh: 160,
    classCode: "П3·Д3",
    mesh: "winged",
    color: [190, 140, 255],
    source: "База знаний КОНТУР Н (дальность 161–241 км, берём нижнюю)",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "archer",
    name: "Archer Midnight",
    country: "США",
    kind: "passenger",
    seats: "1+4",
    payloadKg: null,
    mtowKg: 3175,
    dM: 14.6,
    rangeKm: 80,
    cruiseKmh: 240,
    windLimitMs: 15,
    batteryKWh: 150,
    classCode: "П4·Д4",
    mesh: "winged",
    color: [255, 120, 200],
    source: "База знаний КОНТУР Н (дальность 32–80 км, берём верхнюю)",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "flycart",
    name: "DJI FlyCart 30",
    country: "Китай",
    kind: "cargo",
    seats: "—",
    payloadKg: 30,
    mtowKg: 95,
    dM: 3.1,
    rangeKm: 28,
    cruiseKmh: 70,
    windLimitMs: 12,
    batteryKWh: 4,
    classCode: "Г2·Д2",
    mesh: "quad",
    color: [200, 200, 200],
    source: "База знаний КОНТУР Н (груз 30–40 кг, дальность 16–28 км)",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
  {
    id: "samad",
    name: "Samad S5M Cargo",
    country: "Великобр.",
    kind: "cargo",
    seats: "—",
    payloadKg: 60,
    mtowKg: 600,
    dM: 8,
    rangeKm: 217,
    cruiseKmh: 200,
    windLimitMs: 13,
    batteryKWh: 60,
    classCode: "Г3·Д3",
    mesh: "winged",
    color: [255, 170, 90],
    source: "База знаний КОНТУР Н",
    assumed: ["крейсерская скорость", "предельный ветер", "ёмкость батареи"],
  },
];

export const MODEL_BY_ID: Record<string, AircraftModel> = Object.fromEntries(
  MODELS.map((m) => [m.id, m]),
);

export const DEFAULT_FLEET: Record<string, number> = {
  ecolibri: 6,
  eh216: 4,
  volocity: 2,
  cityairbus: 3,
  eve: 2,
  joby: 4,
  archer: 2,
  flycart: 6,
  samad: 2,
};

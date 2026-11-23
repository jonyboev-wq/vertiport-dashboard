// Узлы вертикального транспорта в Москве — учебные предложения для анализа,
// не действующие и не утверждённые вертипорты. Методика — как в презентации
// «Анализ региона по воздушному транспорту»: узлы, радиусы досягаемости (L / k, k = 1,1),
// полная поездка = 30 мин наземных фаз + полёт.
// Координаты — геокодирование OpenStreetMap (Nominatim), точки площадок условные.

export type VertiportKind = "R1" | "G1" | "hub" | "airport";

export interface Vertiport {
  id: string;
  name: string;
  short: string;
  kind: VertiportKind;
  lat: number;
  lon: number;
  elevM: number; // высота площадки над землёй (кровля)
  pads: number; // FATO/TLOF
  stands: number; // места стоянки
  chargers: number;
  gridKw: number; // доступная мощность сети
  note: string;
}

export const VERTIPORTS: Vertiport[] = [
  { id: "mgsu-r1", name: "НИУ МГСУ · R1 (кровля)", short: "МГСУ R1", kind: "R1", lat: 55.85606, lon: 37.69548, elevM: 25, pads: 1, stands: 3, chargers: 2, gridKw: 600, note: "Объект P01, кровельный сценарий. Высота кровли — «И»." },
  { id: "mgsu-g1", name: "НИУ МГСУ · G1 (наземная)", short: "МГСУ G1", kind: "G1", lat: 55.85425, lon: 37.70035, elevM: 0, pads: 1, stands: 4, chargers: 3, gridKw: 800, note: "Объект P01, наземный/парковочный сценарий. Точка условная." },
  { id: "city", name: "Москва-Сити", short: "Сити", kind: "hub", lat: 55.74896, lon: 37.53873, elevM: 0, pads: 2, stands: 6, chargers: 4, gridKw: 1500, note: "Деловой центр, учебный узел." },
  { id: "vdnh", name: "ВДНХ", short: "ВДНХ", kind: "hub", lat: 55.82096, lon: 37.6414, elevM: 0, pads: 2, stands: 5, chargers: 3, gridKw: 1000, note: "Учебный узел." },
  { id: "luzhniki", name: "Лужники", short: "Лужники", kind: "hub", lat: 55.71574, lon: 37.55376, elevM: 0, pads: 1, stands: 4, chargers: 2, gridKw: 800, note: "Учебный узел." },
  { id: "kursky", name: "ТПУ Курский вокзал", short: "Курский", kind: "R1", lat: 55.75744, lon: 37.6609, elevM: 20, pads: 1, stands: 3, chargers: 2, gridKw: 600, note: "Пересадка на ж.д. Учебный узел." },
  { id: "skolkovo", name: "Сколково", short: "Сколково", kind: "hub", lat: 55.70012, lon: 37.34253, elevM: 0, pads: 2, stands: 5, chargers: 3, gridKw: 1000, note: "Учебный узел." },
  { id: "svo", name: "Аэропорт Шереметьево", short: "SVO", kind: "airport", lat: 55.9726, lon: 37.4146, elevM: 0, pads: 3, stands: 8, chargers: 5, gridKw: 2500, note: "Связь с аэропортом. Учебный узел." },
  { id: "vko", name: "Аэропорт Внуково", short: "VKO", kind: "airport", lat: 55.5915, lon: 37.2615, elevM: 0, pads: 2, stands: 6, chargers: 4, gridKw: 2000, note: "Связь с аэропортом. Учебный узел." },
  { id: "dme", name: "Аэропорт Домодедово", short: "DME", kind: "airport", lat: 55.4088, lon: 37.9063, elevM: 0, pads: 2, stands: 6, chargers: 4, gridKw: 2000, note: "Связь с аэропортом. Учебный узел." },
];

export const VERTIPORT_BY_ID: Record<string, Vertiport> = Object.fromEntries(
  VERTIPORTS.map((v) => [v.id, v]),
);

// Учебная запретная зона над центром (условно, не реальные границы ограничений).
export const NO_FLY = { name: "Запретная зона (условно)", lat: 55.752, lon: 37.6175, radiusKm: 2.5, topM: 1500 };

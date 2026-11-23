"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type maplibregl from "maplibre-gl";
import type { PickingInfo } from "@deck.gl/core";
import MapView, { INITIAL_VIEW } from "./MapView";
import { buildLayers, STATUS_COLOR } from "./layers";
import { Compass, Segmented, Slider, Stepper, Toggle, Badge, dirName } from "./Controls";
import { DEFAULT_PARAMS, OPS_PER_HOUR, type Params, type Precip, type OpsMode, type Incidents } from "@/lib/params";
import { MODELS, MODEL_BY_ID, DEFAULT_FLEET } from "@/lib/models";
import { VERTIPORTS, VERTIPORT_BY_ID, type Vertiport } from "@/lib/vertiports";
import { SimSource, type TrafficSource } from "@/lib/source";
import { isAir, stateRu, statusRu, tripMinutes, type Vehicle } from "@/lib/sim";
import { distM } from "@/lib/geo";

type Show = { routes: boolean; trails: boolean; reach: boolean; nofly: boolean; labels: boolean };

const fmtClock = (t: number) => {
  const s = (8 * 3600 + t) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

export default function Dashboard() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [fleet, setFleet] = useState<Record<string, number>>(DEFAULT_FLEET);
  const [selVp, setSelVp] = useState<string | null>("mgsu-r1");
  const [selVeh, setSelVeh] = useState<string | null>(null);
  const [reachModel, setReachModel] = useState<string>("ecolibri");
  const [show, setShow] = useState<Show>({ routes: true, trails: true, reach: true, nofly: true, labels: true });
  const [tab, setTab] = useState<"env" | "ops" | "fleet">("env");
  const [, setTick] = useState(0);

  const src = useRef<TrafficSource | null>(null);
  if (!src.current) src.current = new SimSource(DEFAULT_PARAMS, DEFAULT_FLEET);
  const overlay = useRef<MapboxOverlay | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const live = useRef({ params, show, selVp, selVeh, reachModel });
  live.current = { params, show, selVp, selVeh, reachModel };

  useEffect(() => src.current!.setParams(params), [params]);
  useEffect(() => src.current!.setFleet(fleet), [fleet]);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 300);
    return () => clearInterval(id);
  }, []);

  const onVehicle = useCallback((info: PickingInfo<Vehicle>) => info.object && setSelVeh(info.object.id), []);
  const onVertiport = useCallback((info: PickingInfo<Vertiport>) => info.object && setSelVp(info.object.id), []);

  // цикл анимации: шаг источника + перерисовка слоёв
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = src.current!;
      s.tick(dt);
      frame++;
      if (overlay.current) {
        const L = live.current;
        overlay.current.setProps({
          layers: buildLayers({
            vehicles: s.vehicles(),
            vps: s.vertiports(),
            params: L.params,
            frame,
            zoom: mapRef.current?.getZoom() ?? 10,
            show: L.show,
            selectedVp: L.selVp,
            selectedVehicle: L.selVeh,
            reachModel: MODEL_BY_ID[L.reachModel] ?? null,
            onVehicle,
            onVertiport,
          }),
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onVehicle, onVertiport]);

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }));
  const s = src.current!;
  const vehicles = s.vehicles();
  const vps = s.vertiports();
  const counts = { air: vehicles.filter(isAir).length, hold: vehicles.filter((v) => v.state === "holding").length, charging: vehicles.filter((v) => v.state === "charging").length };
  const stats = (s as SimSource).sim.stats;
  const veh = selVeh ? vehicles.find((v) => v.id === selVeh) : undefined;
  const vp = selVp ? VERTIPORT_BY_ID[selVp] : undefined;
  const vpS = selVp ? vps[selVp] : undefined;

  const flyTo = (v: Vertiport) => mapRef.current?.flyTo({ center: [v.lon, v.lat], zoom: 14.5, pitch: 60, duration: 1500 });

  const haze = Math.max(0, Math.min(0.75, (1 - params.visibilityKm / 10) * 0.8));

  return (
    <div className="app">
      {/* ---------- левая панель: параметры ---------- */}
      <aside className="panel left">
        <h1>
          Вертипорты Москвы · eVTOL
          <small>P01 · трек 04 · демо-панель мониторинга</small>
        </h1>
        <div className="tabs">
          {(["env", "ops", "fleet"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {{ env: "Среда", ops: "Эксплуатация", fleet: "Флот" }[t]}
            </button>
          ))}
        </div>

        {tab === "env" && (
          <div className="sect">
            <div className="wind">
              <Compass value={params.windFromDeg} speed={params.windMs} onChange={(d) => set("windFromDeg", d)} />
              <div className="wind-side">
                <div className="ctl-head">
                  <span>Ветер, откуда</span>
                  <b>
                    {params.windFromDeg}° {dirName(params.windFromDeg)}
                  </b>
                </div>
                <Slider label="Скорость" unit="м/с" value={params.windMs} min={0} max={25} onChange={(v) => setParams((p) => ({ ...p, windMs: v, gustMs: Math.max(v, p.gustMs) }))} />
                <Slider label="Порывы" unit="м/с" value={params.gustMs} min={params.windMs} max={35} onChange={(v) => set("gustMs", v)} />
              </div>
            </div>
            <Slider label="Температура" unit="°C" value={params.tempC} min={-35} max={40} onChange={(v) => set("tempC", v)} />
            <Segmented<Precip>
              label="Осадки"
              value={params.precip}
              options={[
                { v: "none", t: "нет" },
                { v: "rain", t: "дождь" },
                { v: "snow", t: "снег" },
                { v: "freezing", t: "лед. дождь" },
              ]}
              onChange={(v) => set("precip", v)}
            />
            {params.precip !== "none" && <Slider label="Интенсивность осадков" unit="%" value={params.precipPct} min={0} max={100} step={5} onChange={(v) => set("precipPct", v)} />}
            <Slider label="Видимость" unit="км" value={params.visibilityKm} min={0.2} max={10} step={0.1} onChange={(v) => set("visibilityKm", v)} />
            <Slider label="Нижняя граница облаков" unit="м" value={params.cloudBaseM} min={50} max={2000} step={10} onChange={(v) => set("cloudBaseM", v)} />
            <div className="row">
              <Toggle label="Обогрев площадок" value={params.heating} onChange={(v) => set("heating", v)} />
            </div>
            <h3>
              Пороги решений <Badge s="И" />
            </h3>
            <p className="hint">Временные значения. Реальные пороги дают треки 06 (нагрузки, нормы) и 05 (инженерия).</p>
            <Slider label="Ветер: ограничение площадки" unit="м/с" value={params.padWindLimitMs} min={3} max={25} onChange={(v) => set("padWindLimitMs", v)} status="И" />
            <Slider label="Ветер: закрытие площадки" unit="м/с" value={params.padWindCloseMs} min={5} max={35} onChange={(v) => set("padWindCloseMs", v)} status="И" />
            <Slider label="Мин. видимость" unit="км" value={params.minVisibilityKm} min={0.2} max={5} step={0.1} onChange={(v) => set("minVisibilityKm", v)} status="И" />
            <Slider label="Мин. нижняя граница облаков" unit="м" value={params.minCloudBaseM} min={50} max={600} step={10} onChange={(v) => set("minCloudBaseM", v)} status="И" />
          </div>
        )}

        {tab === "ops" && (
          <div className="sect">
            <Segmented<OpsMode>
              label="Интенсивность на 1 FATO"
              status="Р"
              value={params.mode}
              options={[
                { v: "O1", t: "O1 · 4 оп/ч" },
                { v: "O2", t: "O2 · 8 оп/ч" },
                { v: "O3", t: "O3 · 12 оп/ч" },
              ]}
              onChange={(v) => set("mode", v)}
            />
            <h3>Коридор и эшелоны (C5)</h3>
            <Slider label="Нижняя граница коридора" unit="м" value={params.corridorMinM} min={60} max={params.corridorMaxM} step={10} onChange={(v) => set("corridorMinM", v)} status="И" />
            <Slider label="Верхняя граница коридора" unit="м" value={params.corridorMaxM} min={params.corridorMinM} max={1200} step={10} onChange={(v) => set("corridorMaxM", v)} status="И" />
            <Slider label="Шаг эшелонов" unit="м" value={params.levelStepM} min={30} max={150} step={10} onChange={(v) => set("levelStepM", v)} status="И" />
            <h3>Энергия (C7, C8)</h3>
            <Slider label="Мощность зарядного места" unit="кВт" value={params.chargeKw} min={20} max={600} step={10} onChange={(v) => set("chargeKw", v)} status="И" />
            <Slider label="Энергетический резерв" unit="%" value={params.reservePct} min={5} max={40} onChange={(v) => set("reservePct", v)} status="Р" />
            <h3>Симуляция</h3>
            <Slider label="Ускорение времени" unit="×" value={params.simSpeed} min={1} max={60} onChange={(v) => set("simSpeed", v)} />
            <div className="row">
              <Toggle label={params.paused ? "Пауза" : "Идёт"} value={!params.paused} onChange={(v) => set("paused", !v)} />
            </div>
            <h3>Слои карты</h3>
            <div className="row wrap">
              {(
                [
                  ["routes", "маршруты"],
                  ["trails", "следы"],
                  ["reach", "досягаемость"],
                  ["nofly", "запретная зона"],
                  ["labels", "подписи"],
                ] as const
              ).map(([k, t]) => (
                <Toggle key={k} label={t} value={show[k]} onChange={(v) => setShow((x) => ({ ...x, [k]: v }))} />
              ))}
            </div>
          </div>
        )}

        {tab === "fleet" && (
          <div className="sect">
            <p className="hint">
              Данные моделей — база знаний КОНТУР Н («Классы низковысотных воздушных судов») и AeroNet для ECOLIBRI. Скорость, предельный ветер и батарея — допущения <Badge s="Р" />.
            </p>
            {MODELS.map((m) => (
              <div key={m.id} className={`model ${reachModel === m.id ? "sel" : ""}`} onClick={() => setReachModel(m.id)}>
                <div className="model-top">
                  <span className="sw" style={{ background: `rgb(${m.color.join(",")})` }} />
                  <b>{m.name}</b>
                  <span className="cls">{m.classCode}</span>
                  <Stepper value={fleet[m.id] ?? 0} onChange={(v) => setFleet((f) => ({ ...f, [m.id]: v }))} />
                </div>
                <div className="model-meta">
                  {m.kind === "cargo" ? `груз ${m.payloadKg} кг` : `мест ${m.seats}`} · МВМ {m.mtowKg.toLocaleString("ru")} кг · D {m.dM} м · {m.rangeKm} км · {m.cruiseKmh} км/ч · ветер ≤ {m.windLimitMs} м/с
                </div>
              </div>
            ))}
            <p className="hint">Нажмите на модель, чтобы показать её радиус досягаемости от выбранного узла (как в «Анализе региона»: L / 1,1).</p>
          </div>
        )}
      </aside>

      {/* ---------- карта ---------- */}
      <main className="mapwrap">
        <MapView
          onReady={(o, m) => {
            overlay.current = o;
            mapRef.current = m;
            Object.assign(window, { __map: m, __src: src.current }); // для отладки и скриншотов
          }}
        />
        <div className="haze" style={{ opacity: haze }} />
        {params.precip !== "none" && <div className={`precip p-${params.precip}`} style={{ opacity: 0.15 + params.precipPct / 160 }} />}
        <div className="hud">
          <div className="kpi">
            <span>Время</span>
            <b>{fmtClock(s.time())}</b>
          </div>
          <div className="kpi">
            <span>В воздухе</span>
            <b>{counts.air}</b>
          </div>
          <div className="kpi warn">
            <span>Ожидание</span>
            <b>{counts.hold}</b>
          </div>
          <div className="kpi">
            <span>Зарядка</span>
            <b>{counts.charging}</b>
          </div>
          <div className="kpi">
            <span>Рейсов</span>
            <b>{stats.arrivals}</b>
          </div>
          <div className="kpi warn">
            <span>Уходов на запасной</span>
            <b>{stats.diversions}</b>
          </div>
          <div className="kpi">
            <span>Ветер</span>
            <b>
              {dirName(params.windFromDeg)} {params.windMs}/{params.gustMs} м/с
            </b>
          </div>
        </div>
        <button className="reset-view" onClick={() => mapRef.current?.flyTo({ ...INITIAL_VIEW, duration: 1200 })}>
          Вся Москва
        </button>

        {veh && (
          <div className="card veh">
            <button className="x" onClick={() => setSelVeh(null)}>
              ×
            </button>
            <h3>
              <span className="sw" style={{ background: `rgb(${MODEL_BY_ID[veh.modelId].color.join(",")})` }} /> {MODEL_BY_ID[veh.modelId].name}
            </h3>
            <div className="grid2">
              <span>Состояние</span>
              <b>{stateRu(veh.state)}</b>
              <span>Маршрут</span>
              <b>{veh.from || veh.to ? `${VERTIPORT_BY_ID[veh.from ?? ""]?.short ?? "—"} → ${VERTIPORT_BY_ID[veh.to ?? ""]?.short ?? "—"}` : VERTIPORT_BY_ID[veh.at ?? ""]?.short ?? "—"}</b>
              <span>Высота</span>
              <b>{Math.round(veh.alt)} м</b>
              <span>Эшелон</span>
              <b>{isAir(veh) ? `${Math.round(veh.cruiseAlt)} м` : "—"}</b>
              <span>Путевая скорость</span>
              <b>{Math.round(veh.gsKmh)} км/ч</b>
              <span>ETA (C4)</span>
              <b>{isAir(veh) && veh.etaS > 0 ? `${Math.ceil(veh.etaS / 60)} мин` : "—"}</b>
              <span>Заряд</span>
              <b className={veh.soc < params.reservePct / 100 + 0.05 ? "bad" : ""}>{Math.round(veh.soc * 100)}%</b>
              <span>Класс</span>
              <b>{MODEL_BY_ID[veh.modelId].classCode}</b>
            </div>
            {veh.diverted && <p className="note warn">Ушёл на запасную площадку</p>}
            {veh.reason && <p className="note">{veh.reason}</p>}
          </div>
        )}
      </main>

      {/* ---------- правая панель: узлы и журнал ---------- */}
      <aside className="panel right">
        <h2>Узлы</h2>
        <div className="vps">
          {VERTIPORTS.map((v) => {
            const st = vps[v.id];
            const lim = OPS_PER_HOUR[params.mode] * v.pads;
            return (
              <div key={v.id} className={`vp ${selVp === v.id ? "sel" : ""}`} onClick={() => setSelVp(v.id)} onDoubleClick={() => flyTo(v)}>
                <span className="st" style={{ background: `rgb(${STATUS_COLOR[st.status].join(",")})` }} />
                <b>{v.short}</b>
                <span className="muted">{statusRu(st.status)}</span>
                <span className="ops">
                  {st.opsTimes.length}/{lim} оп/ч
                </span>
              </div>
            );
          })}
        </div>

        {vp && vpS && (
          <div className="card">
            <h3>
              {vp.name}{" "}
              <button className="link" onClick={() => flyTo(vp)}>
                показать
              </button>
            </h3>
            <p className="muted small">{vp.note}</p>
            <div className="grid2">
              <span>Статус</span>
              <b style={{ color: `rgb(${STATUS_COLOR[vpS.status].join(",")})` }}>{statusRu(vpS.status)}</b>
              <span>FATO / стоянки / зарядки</span>
              <b>
                {vp.pads} / {vp.stands} / {vp.chargers}
              </b>
              <span>Аппаратов на узле</span>
              <b>{vehicles.filter((x) => x.at === vp.id && !isAir(x)).length}</b>
              <span>Нагрузка на сеть (C8)</span>
              <b className={vpS.capped ? "warnc" : ""}>
                {Math.round(vpS.chargingKw)} / {vp.gridKw} кВт
              </b>
            </div>
            {vpS.reasons.length > 0 && (
              <ul className="reasons">
                {vpS.reasons.map((r, i) => (
                  <li key={i}>
                    <span className="chain">{r.chain}</span> {r.text}
                  </li>
                ))}
              </ul>
            )}
            <div className="row wrap">
              {(
                [
                  ["people", "Люди в зоне (C11)"],
                  ["fire", "Пожар / АКБ (C12)"],
                  ["power", "Отказ питания (C8)"],
                  ["closed", "Закрыть (диспетчер)"],
                ] as [keyof Incidents, string][]
              ).map(([k, t]) => (
                <Toggle key={k} danger label={t} value={vpS.incidents[k]} onChange={(val) => s.setIncident(vp.id, k, val)} />
              ))}
            </div>
            <h4>
              Полная поездка, {MODEL_BY_ID[reachModel].name} <span className="muted small">(30 мин + полёт, k = 1,1)</span>
            </h4>
            <table className="trips">
              <tbody>
                {VERTIPORTS.filter((x) => x.id !== vp.id)
                  .map((x) => ({ x, km: distM(vp, x) / 1000 }))
                  .sort((a, b) => a.km - b.km)
                  .map(({ x, km }) => {
                    const m = MODEL_BY_ID[reachModel];
                    const ok = km * 1.1 <= m.rangeKm * (1 - params.reservePct / 100);
                    return (
                      <tr key={x.id} className={ok ? "" : "out"}>
                        <td>{x.short}</td>
                        <td>{km.toFixed(1)} км</td>
                        <td>{ok ? `${Math.round(tripMinutes(km, m.cruiseKmh))} мин` : "вне дальности"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        <h2>Журнал решений</h2>
        <div className="log">
          {s.log().slice(0, 60).map((e, i) => (
            <div key={i} className={`le ${e.level}`}>
              <span className="t">{fmtClock(e.t)}</span>
              <span className="chain">{e.chain}</span>
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

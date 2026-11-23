"use client";

import { useRef } from "react";

export function Badge({ s }: { s: "Ф" | "Р" | "И" }) {
  const title = { Ф: "Ф — принятое значение", Р: "Р — рабочее допущение", И: "И — исследуется, ждём от треков" }[s];
  return (
    <span className={`badge b-${s === "Ф" ? "f" : s === "Р" ? "r" : "i"}`} title={title}>
      {s}
    </span>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  status?: "Ф" | "Р" | "И";
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, unit = "", status, fmt, onChange } = props;
  return (
    <label className="ctl">
      <div className="ctl-head">
        <span>
          {label} {status && <Badge s={status} />}
        </span>
        <b>
          {fmt ? fmt(value) : value} {unit}
        </b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Segmented<T extends string>(props: { label: string; value: T; options: { v: T; t: string }[]; status?: "Ф" | "Р" | "И"; onChange: (v: T) => void }) {
  return (
    <div className="ctl">
      <div className="ctl-head">
        <span>
          {props.label} {props.status && <Badge s={props.status} />}
        </span>
      </div>
      <div className="seg">
        {props.options.map((o) => (
          <button key={o.v} className={o.v === props.value ? "on" : ""} onClick={() => props.onChange(o.v)}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, value, onChange, danger }: { label: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <button className={`toggle ${value ? (danger ? "on danger" : "on") : ""}`} onClick={() => onChange(!value)}>
      <span className="dot" />
      {label}
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 50 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <span className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b>{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  );
}

/** Направление ветра: стрелка на компасе. Значение — «откуда дует», °. */
export function Compass({ value, speed, onChange, size = 120 }: { value: number; speed: number; onChange: (deg: number) => void; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const r = size / 2;
  const setFromEvent = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    const x = e.clientX - (b.left + b.width / 2);
    const y = e.clientY - (b.top + b.height / 2);
    const deg = (Math.atan2(x, -y) * 180) / Math.PI;
    onChange(Math.round((deg + 360) % 360 / 5) * 5);
  };
  // стрелка показывает, КУДА дует ветер (от точки «откуда» через центр)
  const to = (value + 180) % 360;
  const len = r * 0.72;
  const a = (to * Math.PI) / 180;
  const tail = [r - Math.sin(a) * len, r + Math.cos(a) * len];
  const head = [r + Math.sin(a) * len, r - Math.cos(a) * len];
  const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      className="compass"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setFromEvent(e);
      }}
      onPointerMove={(e) => e.buttons && setFromEvent(e)}
    >
      <circle cx={r} cy={r} r={r - 2} className="c-ring" />
      {dirs.map((d, i) => {
        const aa = (i * 45 * Math.PI) / 180;
        return (
          <text key={d} x={r + Math.sin(aa) * (r - 13)} y={r - Math.cos(aa) * (r - 13) + 4} className={i % 2 ? "c-minor" : "c-major"}>
            {d}
          </text>
        );
      })}
      <defs>
        <marker id="wa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0L10,5L0,10z" fill="#7cc4ff" />
        </marker>
      </defs>
      <line x1={tail[0]} y1={tail[1]} x2={head[0]} y2={head[1]} stroke="#7cc4ff" strokeWidth={3 + Math.min(speed, 25) / 5} markerEnd="url(#wa)" />
      <circle cx={tail[0]} cy={tail[1]} r={4} fill="#7cc4ff" />
    </svg>
  );
}

export function dirName(deg: number) {
  const n = ["С", "ССВ", "СВ", "ВСВ", "В", "ВЮВ", "ЮВ", "ЮЮВ", "Ю", "ЮЮЗ", "ЮЗ", "ЗЮЗ", "З", "ЗСЗ", "СЗ", "ССЗ"];
  return n[Math.round(deg / 22.5) % 16];
}

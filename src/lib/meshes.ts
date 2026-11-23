// Процедурные 3D-модели аппаратов (без внешних файлов и лицензий).
// Система координат меша: X — вправо, Y — вперёд (нос), Z — вверх; габарит ≈ 1 (дальше масштаб = D).
// Позже можно заменить на реальные .glb — см. README («Свои 3D-модели»).

export type MeshKind = "quad" | "multi" | "winged";

type V3 = [number, number, number];
type RGB = [number, number, number];
const BODY: RGB = [1, 1, 1];
const DARK: RGB = [0.35, 0.37, 0.42];
const ROTOR: RGB = [0.8, 0.85, 0.95];

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  tri(a: V3, b: V3, c: V3, color: RGB) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((x) => x / l);
    for (const p of [a, b, c]) {
      this.pos.push(...p);
      this.nrm.push(...n);
      this.col.push(...color, 1);
    }
  }
  quad(a: V3, b: V3, c: V3, d: V3, color: RGB) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  /** Параллелепипед с центром c и размерами s; taper сужает передний/задний торец. */
  box(c: V3, s: V3, color: RGB = BODY, taperFront = 1, taperBack = 1) {
    const [x, y, z] = c;
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const f = (sx: number, sy: number, sz: number): V3 => {
      const t = sy > 0 ? taperFront : taperBack;
      return [x + sx * hx * t, y + sy * hy, z + sz * hz * t];
    };
    const p = {
      lbd: f(-1, -1, -1), rbd: f(1, -1, -1), rfd: f(1, 1, -1), lfd: f(-1, 1, -1),
      lbu: f(-1, -1, 1), rbu: f(1, -1, 1), rfu: f(1, 1, 1), lfu: f(-1, 1, 1),
    };
    this.quad(p.lbu, p.rbu, p.rfu, p.lfu, color); // верх
    this.quad(p.lfd, p.rfd, p.rbd, p.lbd, color); // низ
    this.quad(p.lfu, p.rfu, p.rfd, p.lfd, color); // перед
    this.quad(p.rbu, p.lbu, p.lbd, p.rbd, color); // зад
    this.quad(p.rfu, p.rbu, p.rbd, p.rfd, color); // право
    this.quad(p.lbu, p.lfu, p.lfd, p.lbd, color); // лево
  }
  /** Диск винта (тонкий цилиндр). */
  disc(c: V3, r: number, h = 0.012, color: RGB = ROTOR, n = 20) {
    const [x, y, z] = c;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const p0: V3 = [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z];
      const p1: V3 = [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z];
      const top0: V3 = [p0[0], p0[1], z + h];
      const top1: V3 = [p1[0], p1[1], z + h];
      this.tri([x, y, z + h], top0, top1, color);
      this.tri([x, y, z], p1, p0, color);
      this.quad(p0, p1, top1, top0, color);
    }
  }
  /** Балка между двумя точками в плоскости XY. */
  beam(a: V3, b: V3, w: number, color: RGB = DARK) {
    const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const start = this.pos.length;
    this.box([0, 0, 0], [len, w, w], color);
    // поворот добавленных вершин вокруг Z и перенос
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    for (let i = start; i < this.pos.length; i += 3) {
      const px = this.pos[i];
      const py = this.pos[i + 1];
      this.pos[i] = c[0] + px * cos - py * sin;
      this.pos[i + 1] = c[1] + px * sin + py * cos;
      this.pos[i + 2] += c[2];
      const nx = this.nrm[i];
      const ny = this.nrm[i + 1];
      this.nrm[i] = nx * cos - ny * sin;
      this.nrm[i + 1] = nx * sin + ny * cos;
    }
  }
  mesh() {
    return {
      attributes: {
        POSITION: { value: new Float32Array(this.pos), size: 3 },
        NORMAL: { value: new Float32Array(this.nrm), size: 3 },
        COLOR_0: { value: new Float32Array(this.col), size: 4 },
      },
    };
  }
}

/** Грузовой квадрокоптер: корпус, 4 луча, 4 винта, груз снизу. */
function quad() {
  const b = new Builder();
  b.box([0, 0, 0.05], [0.22, 0.26, 0.1]);
  const arm = 0.36;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const end: V3 = [sx * arm, sy * arm, 0.08];
    b.beam([0, 0, 0.08], end, 0.035);
    b.box([end[0], end[1], 0.1], [0.05, 0.05, 0.05], DARK);
    b.disc([end[0], end[1], 0.13], 0.15);
  }
  b.box([0, 0, -0.06], [0.16, 0.16, 0.1], [0.95, 0.75, 0.3]); // груз
  for (const sx of [-1, 1]) b.box([sx * 0.12, 0, -0.04], [0.02, 0.3, 0.02], DARK); // опоры
  return b.mesh();
}

/** Пассажирский мультикоптер (EHang/Volocopter): кабина, кольцо винтов. */
function multi() {
  const b = new Builder();
  b.box([0, 0.02, 0.1], [0.2, 0.32, 0.18], BODY, 0.7, 0.85); // кабина
  b.box([0, 0.12, 0.12], [0.16, 0.08, 0.1], [0.4, 0.55, 0.75], 0.7, 1); // остекление
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const end: V3 = [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.2];
    b.beam([0, 0, 0.2], end, 0.025);
    b.disc([end[0], end[1], 0.22], 0.1);
  }
  for (const sx of [-1, 1]) b.box([sx * 0.09, 0, -0.02], [0.02, 0.3, 0.02], DARK); // лыжи
  return b.mesh();
}

/** eVTOL с крылом (Joby/Archer/Eve/CityAirbus): фюзеляж, крыло, 6 винтов, хвост. */
function winged() {
  const b = new Builder();
  b.box([0, 0, 0.05], [0.13, 0.62, 0.13], BODY, 0.45, 0.4); // фюзеляж
  b.box([0, 0.17, 0.09], [0.1, 0.1, 0.06], [0.4, 0.55, 0.75], 0.6, 1); // кабина
  b.box([0, 0.02, 0.1], [1, 0.12, 0.022]); // крыло
  b.box([0, -0.3, 0.12], [0.36, 0.07, 0.018]); // стабилизатор
  b.box([0, -0.29, 0.18], [0.018, 0.08, 0.12]); // киль
  for (const sx of [-1, 1]) {
    // гондолы и винты на крыле
    for (const x of [0.2, 0.42]) {
      b.box([sx * x, 0.1, 0.1], [0.04, 0.16, 0.04], DARK);
      b.disc([sx * x, 0.18, 0.13], 0.1);
    }
    b.box([sx * 0.18, -0.3, 0.13], [0.04, 0.06, 0.04], DARK);
    b.disc([sx * 0.18, -0.3, 0.16], 0.08);
  }
  return b.mesh();
}

export const MESHES: Record<MeshKind, ReturnType<typeof quad>> = { quad: quad(), multi: multi(), winged: winged() };

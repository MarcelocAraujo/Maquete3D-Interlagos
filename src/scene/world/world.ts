/**
 * Carregamento dos dados geográficos gerados pelo pipeline (public/data/*)
 * e funções de consulta usadas por todos os componentes da cena.
 */
export interface TerrainMeta {
  half: number;
  step: number;
  n: number;
  base: number;
}

export type XZ = [number, number];

export interface BuildingFeature {
  id: number | string;
  poly: XZ[];
  h: number;
  b: number; // base (y mínimo do terreno sob a pegada)
  g: number; // desnível do terreno sob a pegada
  n?: string;
  k?: string;
}

export interface Features {
  buildings: BuildingFeature[];
  grandstands: { id: string; osmId: number; name: string | null; poly: XZ[]; area: number }[];
  landuse: { id: number | string; k: string; poly: XZ[]; area: number }[];
  roads: { k: string; w: number; br: number; tu: number; n?: string; p: XZ[] }[];
  lines: { fence: XZ[][]; wall: XZ[][]; power: XZ[][]; kart: XZ[][]; drag: XZ[][]; footbridge: XZ[][]; treeRow: XZ[][]; stream: XZ[][] };
  points: { tree: XZ[]; powerTower: XZ[]; commTower: XZ[]; waterTower: XZ[]; lamp: XZ[]; helipad: XZ[]; artwork: XZ[] };
  waters: { id: number; level: number; poly: XZ[] }[];
  complex: XZ[];
  pitBuildingCandidates: { id: number; rect: { angle: number; length: number; width: number; center: XZ } }[];
}

export class Heightfield {
  constructor(public meta: TerrainMeta, public data: Float32Array) {}

  /** Altura (y da cena) interpolada bilinearmente. */
  sample(x: number, z: number): number {
    const { half, step, n } = this.meta;
    const fi = (x + half) / step;
    const fj = (z + half) / step;
    const i = Math.min(n - 2, Math.max(0, Math.floor(fi)));
    const j = Math.min(n - 2, Math.max(0, Math.floor(fj)));
    const tx = Math.min(1, Math.max(0, fi - i));
    const tz = Math.min(1, Math.max(0, fj - j));
    const d = this.data;
    const a = d[j * n + i];
    const b = d[j * n + i + 1];
    const c = d[(j + 1) * n + i];
    const e = d[(j + 1) * n + i + 1];
    return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + e * tx * tz;
  }

  normal(x: number, z: number, e = 2): [number, number, number] {
    const hx = this.sample(x + e, z) - this.sample(x - e, z);
    const hz = this.sample(x, z + e) - this.sample(x, z - e);
    const nx = -hx;
    const ny = 2 * e;
    const nz = -hz;
    const l = Math.hypot(nx, ny, nz);
    return [nx / l, ny / l, nz / l];
  }
}

export interface World {
  height: Heightfield;
  features: Features;
}

let WORLD: World | null = null;

export function getWorld(): World {
  if (!WORLD) throw new Error('mundo ainda não carregado');
  return WORLD;
}

export async function loadWorld(onStep?: (s: string) => void): Promise<World> {
  if (WORLD) return WORLD;
  onStep?.('Carregando relevo (SRTM)…');
  const [meta, bin] = await Promise.all([
    fetch('/data/terrain.json').then((r) => r.json() as Promise<TerrainMeta>),
    fetch('/data/terrain.bin').then((r) => r.arrayBuffer()),
  ]);
  onStep?.('Carregando edificações e vegetação (OSM)…');
  const features = (await fetch('/data/features.json').then((r) => r.json())) as Features;
  // mantém apenas o lago interno do autódromo (rio e represas do entorno são dispensáveis)
  features.waters = features.waters.filter((x) => x.id === 138417940);
  WORLD = { height: new Heightfield(meta, new Float32Array(bin)), features };
  return WORLD;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInPoly(x: number, z: number, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function polyBounds(poly: XZ[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }
  return { minX, maxX, minZ, maxZ };
}

export function polyArea(poly: XZ[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

export function polyCentroid(poly: XZ[]): XZ {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [x / poly.length, z / poly.length];
}

/** Retângulo orientado de área mínima (usa as arestas do polígono). */
export function minAreaRect(poly: XZ[]) {
  let best: { area: number; angle: number; length: number; width: number; center: XZ } | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang);
    const s = Math.sin(-ang);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of poly) {
      const u = p[0] * c - p[1] * s;
      const v = p[0] * s + p[1] * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const ci = Math.cos(ang);
      const si = Math.sin(ang);
      let length = maxU - minU;
      let width = maxV - minV;
      let angle = ang;
      if (width > length) {
        [length, width] = [width, length];
        angle += Math.PI / 2;
      }
      best = { area, angle, length, width, center: [cu * ci - cv * si, cu * si + cv * ci] };
    }
  }
  return best!;
}

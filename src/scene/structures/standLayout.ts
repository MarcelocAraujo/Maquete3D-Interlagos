import { GRANDSTANDS, type GrandstandInfo } from '../../data/facilities';
import { TRACK_LENGTH, frameAt, nearestS, rangeLength } from '../../data/circuit/track';
import { getWorld, minAreaRect, pointInPoly, type XZ } from '../world/world';

/**
 * Layout das arquibancadas, compartilhado pela geometria das arquibancadas, pelas
 * barreiras, pelas áreas de escape e pelo paddock: tudo usa as mesmas pegadas, para
 * que nada entre dentro de uma arquibancada.
 */
export interface StandSection {
  a: XZ; // início da frente (junto à pista)
  b: XZ; // fim da frente
  back: XZ; // vetor unitário para trás (afastando da pista)
  depth: number;
}

/** Orienta a seção de frente para a pista: "trás" é o lado mais distante do traçado. */
function faceTrack(sec: StandSection): StandSection & { flipped?: boolean } {
  const mx = (sec.a[0] + sec.b[0]) / 2;
  const mz = (sec.a[1] + sec.b[1]) / 2;
  const L = Math.hypot(sec.b[0] - sec.a[0], sec.b[1] - sec.a[1]) || 1;
  // normal da frente (perpendicular a a→b)
  let nx = -(sec.b[1] - sec.a[1]) / L;
  let nz = (sec.b[0] - sec.a[0]) / L;
  const k = 4;
  if (nearestS(mx + nx * k, mz + nz * k).d < nearestS(mx - nx * k, mz - nz * k).d) {
    nx = -nx;
    nz = -nz;
  }
  // se a frente tinha ficado do lado errado (seção invertida), passa a frente para o outro lado
  const flipped = nx * sec.back[0] + nz * sec.back[1] < 0;
  if (!flipped) return { ...sec, back: [nx, nz] };
  const a: XZ = [sec.a[0] - nx * sec.depth, sec.a[1] - nz * sec.depth];
  const b: XZ = [sec.b[0] - nx * sec.depth, sec.b[1] - nz * sec.depth];
  return { a, b, back: [nx, nz], depth: sec.depth, flipped: true };
}

/** Empurra a seção para trás até a frente ficar a `minFront` m da borda da pista. */
function keepOut(sec: StandSection, minFront: number): StandSection {
  const edgeDist = (p: XZ) => {
    const ns = nearestS(p[0], p[1]);
    const f = frameAt(ns.s);
    return ns.d - Math.max(f.wl, f.wr);
  };
  const d = Math.min(edgeDist(sec.a), edgeDist(sec.b), edgeDist([(sec.a[0] + sec.b[0]) / 2, (sec.a[1] + sec.b[1]) / 2]));
  if (d >= minFront) return sec;
  const push = minFront - d;
  return { ...sec, a: [sec.a[0] + sec.back[0] * push, sec.a[1] + sec.back[1] * push], b: [sec.b[0] + sec.back[0] * push, sec.b[1] + sec.back[1] * push] };
}

/** Seções retas de cada arquibancada (OSM: retângulo mínimo; demais: ao longo da pista). */
export function sectionsOf(g: GrandstandInfo): StandSection[] {
  // seções que estavam invertidas (o polígono do OSM se estendia para dentro da área de
  // escape) são recuadas até minFront; as demais só se encostarem no muro da pista (< 5 m)
  return rawSections(g)
    .map(faceTrack)
    .map(({ flipped, ...sec }) => keepOut(sec, flipped && g.minFront ? g.minFront : 5));
}

function rawSections(g: GrandstandInfo): StandSection[] {
  const { features } = getWorld();
  if (g.bandOsmBuilding) {
    const b = features.buildings.find((x) => x.id === g.bandOsmBuilding);
    if (b) return bandSections(b.poly);
  }
  if (g.osmId) {
    const f = features.grandstands.find((x) => x.osmId === g.osmId);
    if (!f) return [];
    const r = minAreaRect(f.poly);
    const u: XZ = [Math.cos(r.angle), Math.sin(r.angle)];
    const v: XZ = [-u[1], u[0]];
    const side1: XZ = [r.center[0] + v[0] * (r.width / 2), r.center[1] + v[1] * (r.width / 2)];
    const side2: XZ = [r.center[0] - v[0] * (r.width / 2), r.center[1] - v[1] * (r.width / 2)];
    const d1 = nearestS(side1[0], side1[1]).d;
    const d2 = nearestS(side2[0], side2[1]).d;
    const frontC = d1 < d2 ? side1 : side2;
    const back: XZ = d1 < d2 ? [-v[0], -v[1]] : v;
    const a: XZ = [frontC[0] - u[0] * (r.length / 2), frontC[1] - u[1] * (r.length / 2)];
    const b: XZ = [frontC[0] + u[0] * (r.length / 2), frontC[1] + u[1] * (r.length / 2)];
    return [{ a, b, back, depth: r.width }];
  }
  const p = g.place!;
  const len = rangeLength(p.s0, p.s1);
  const n = Math.max(1, Math.ceil(len / 36));
  const out: StandSection[] = [];
  for (let i = 0; i < n; i++) {
    const s0 = p.s0 + (len * i) / n;
    const s1 = p.s0 + (len * (i + 1)) / n - 1.5;
    const pt = (s: number): XZ => {
      const f = frameAt(s);
      const sign = p.side === 'L' ? 1 : -1;
      const w = p.side === 'L' ? f.wl : f.wr;
      return [f.x + f.lx * sign * (w + p.offset), f.z + f.lz * sign * (w + p.offset)];
    };
    const a = pt(s0);
    const b = pt(s1);
    const f = frameAt((s0 + s1) / 2);
    const sign = p.side === 'L' ? 1 : -1;
    out.push({ a, b, back: [f.lx * sign, f.lz * sign], depth: p.depth });
  }
  return out;
}

/**
 * Pegada em faixa curva: divide o polígono nas duas bordas longas (separadas
 * pelos quatro vértices de maior deflexão) e cria uma seção por aresta da borda
 * voltada para a pista.
 */
function bandSections(poly: XZ[]): StandSection[] {
  const n = poly.length;
  const turn = poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n];
    const c = poly[(i + 1) % n];
    const a1 = Math.atan2(p[1] - a[1], p[0] - a[0]);
    const a2 = Math.atan2(c[1] - p[1], c[0] - p[0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return { i, d };
  });
  const corners = [...turn]
    .sort((x, y) => y.d - x.d)
    .slice(0, 4)
    .map((t) => t.i)
    .sort((x, y) => x - y);
  const chains: XZ[][] = [];
  for (let k = 0; k < 4; k += 2) {
    const start = corners[(k + 1) % 4];
    const end = corners[(k + 2) % 4];
    const chain: XZ[] = [];
    for (let i = start; ; i = (i + 1) % n) {
      chain.push(poly[i]);
      if (i === end) break;
    }
    chains.push(chain);
  }
  const meanD = (c: XZ[]) => c.reduce((acc, p) => acc + nearestS(p[0], p[1]).d, 0) / c.length;
  const [inner, outer] = meanD(chains[0]) < meanD(chains[1]) ? [chains[0], chains[1]] : [chains[1], chains[0]];
  const oc = outer.reduce((acc, p) => [acc[0] + p[0] / outer.length, acc[1] + p[1] / outer.length], [0, 0]);
  const depth = Math.max(8, Math.min(30, outer.reduce((acc, p) => acc + Math.min(...inner.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))), 0) / outer.length));
  const out: StandSection[] = [];
  for (let i = 0; i < inner.length - 1; i++) {
    const a = inner[i];
    const b = inner[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 3) continue;
    let nx = -(b[1] - a[1]) / L;
    let nz = (b[0] - a[0]) / L;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    if (nx * (oc[0] - mx) + nz * (oc[1] - mz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ a, b, back: [nx, nz], depth });
  }
  return out;
}

// ---------------------------------------------------------------------------
// pegadas e afastamento livre
// ---------------------------------------------------------------------------
let footCache: XZ[][] | null = null;
/** Pegadas (quadriláteros) de todas as seções de arquibancada. */
export function standFootprints(): XZ[][] {
  if (footCache) return footCache;
  footCache = [];
  for (const g of GRANDSTANDS)
    for (const s of sectionsOf(g)) {
      const d = s.depth + 1.5;
      footCache.push([s.a, s.b, [s.b[0] + s.back[0] * d, s.b[1] + s.back[1] * d], [s.a[0] + s.back[0] * d, s.a[1] + s.back[1] * d]]);
    }
  return footCache;
}

let boxCache: [number, number, number, number][] | null = null;
export function insideStand(x: number, z: number, margin = 0): boolean {
  const feet = standFootprints();
  if (!boxCache) boxCache = feet.map((q) => [Math.min(...q.map((p) => p[0])), Math.max(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[1]))]);
  for (let i = 0; i < feet.length; i++) {
    const bb = boxCache[i];
    if (x < bb[0] - margin || x > bb[1] + margin || z < bb[2] - margin || z > bb[3] + margin) continue;
    const q = feet[i];
    if (pointInPoly(x, z, q)) return true;
    if (margin > 0 && (pointInPoly(x + margin, z, q) || pointInPoly(x - margin, z, q) || pointInPoly(x, z + margin, q) || pointInPoly(x, z - margin, q))) return true;
  }
  return false;
}

const STEP = 1.5;
const clearCache: Record<string, Float32Array> = {};
/**
 * Distância livre (m) da borda da pista até a primeira arquibancada, medida na
 * normal da pista em s, do lado `side` (1 = esquerda). Infinity se não houver nenhuma até 120 m.
 */
export function standClearance(s: number, side: 1 | -1): number {
  const key = String(side);
  if (!clearCache[key]) {
    const n = Math.ceil(TRACK_LENGTH / STEP) + 1;
    const arr = new Float32Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) {
      const f = frameAt(i * STEP);
      const w = side === 1 ? f.wl : f.wr;
      for (let lat = 0.5; lat < 120; lat += 0.75) {
        const x = f.x + f.lx * side * (w + lat);
        const z = f.z + f.lz * side * (w + lat);
        if (insideStand(x, z)) {
          arr[i] = lat;
          break;
        }
      }
    }
    clearCache[key] = arr;
  }
  const arr = clearCache[key];
  const i = Math.round((((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) / STEP);
  return arr[Math.min(arr.length - 1, i)];
}

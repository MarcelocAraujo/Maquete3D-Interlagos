import * as THREE from 'three';
import { TRACK, TRACK_LENGTH, frameAt, nearestS, rangeLength, wrapS, type TrackFrame } from '../../data/circuit/track';
import { CORNERS } from '../../data/circuit/corners';
import { standClearance } from '../structures/standLayout';

/**
 * Construtor genérico de faixas ao longo da pista.
 * lat > 0 = esquerda no sentido de corrida. Cada vértice recebe os atributos
 * aS (distância ao longo da pista) e aLat (posição transversal normalizada),
 * usados pelos shaders de destaque.
 */
export interface StripSpec {
  s0: number;
  s1: number; // se s1 - s0 >= comprimento, faixa fechada
  step?: number;
  cols?: number;
  latA: (s: number, f: TrackFrame) => number;
  latB: (s: number, f: TrackFrame) => number;
  dy?: (s: number, u: number, f: TrackFrame) => number;
  skirt?: number;
  uvMode?: 'meters' | 'unit';
  uvScale?: number;
  extra?: (s: number, u: number, lat: number, f: TrackFrame) => number; // atributo aExtra
}

export function buildStrip(spec: StripSpec): THREE.BufferGeometry {
  const step = spec.step ?? TRACK.ds;
  const cols = spec.cols ?? 1;
  const closed = spec.s1 - spec.s0 >= TRACK_LENGTH - 1e-6;
  const len = closed ? TRACK_LENGTH : rangeLength(spec.s0, spec.s1);
  const rows = Math.max(2, Math.round(len / step) + (closed ? 0 : 1));
  const ds = closed ? len / rows : len / (rows - 1);
  const skirt = spec.skirt ?? 0;
  const ringCols = cols + 1 + (skirt > 0 ? 4 : 0);

  const pos: number[] = [];
  const uv: number[] = [];
  const aS: number[] = [];
  const aLat: number[] = [];
  const aExtra: number[] = [];
  const uvScale = spec.uvScale ?? 1;

  for (let r = 0; r < rows; r++) {
    const sRaw = spec.s0 + r * ds;
    const s = wrapS(sRaw);
    const f = frameAt(s);
    const la = spec.latA(s, f);
    const lb = spec.latB(s, f);
    const half = Math.max(Math.abs(f.wl), Math.abs(f.wr));
    const pushV = (lat: number, u: number, dyExtra: number) => {
      const y = f.y + Math.tan(f.bank) * lat + (spec.dy ? spec.dy(s, u, f) : 0) + dyExtra;
      pos.push(f.x + f.lx * lat, y, f.z + f.lz * lat);
      if (spec.uvMode === 'unit') uv.push(u, (r * ds) / uvScale);
      else uv.push((lat * -1) / uvScale, (sRaw - spec.s0) / uvScale);
      aS.push(s);
      aLat.push(Math.max(-1, Math.min(1, lat / half)));
      aExtra.push(spec.extra ? spec.extra(s, u, lat, f) : 0);
    };
    // com saia: [baseE, topoE(dup), ...superfície..., topoD(dup), baseD] — duplicatas evitam normais suavizadas na quina
    if (skirt > 0) {
      pushV(la, 0, -skirt);
      pushV(la, 0, 0);
    }
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      pushV(la + (lb - la) * u, u, 0);
    }
    if (skirt > 0) {
      pushV(lb, 1, 0);
      pushV(lb, 1, -skirt);
    }
  }

  const idx: number[] = [];
  const rowCount = closed ? rows : rows - 1;
  for (let r = 0; r < rowCount; r++) {
    const r2 = (r + 1) % rows;
    for (let c = 0; c < ringCols - 1; c++) {
      const a = r * ringCols + c;
      const b = r * ringCols + c + 1;
      const d = r2 * ringCols + c;
      const e = r2 * ringCols + c + 1;
      // orientação: normal para cima quando latA > latB (esquerda→direita)
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aLat', new THREE.Float32BufferAttribute(aLat, 1));
  g.setAttribute('aExtra', new THREE.Float32BufferAttribute(aExtra, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------------------
// Trajetória ideal aproximada (para marcas de borracha) – estimativa visual
// ---------------------------------------------------------------------------
function smoothK(sigmaM: number) {
  const n = TRACK.n;
  const sig = sigmaM / TRACK.ds;
  const r = Math.ceil(sig * 3);
  const w: number[] = [];
  for (let i = -r; i <= r; i++) w.push(Math.exp(-(i * i) / (2 * sig * sig)));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      const j = (i + k + n) % n;
      a += TRACK.k[j] * w[k + r];
      ws += w[k + r];
    }
    out[i] = a / ws;
  }
  return out;
}

let racingLineCache: Float32Array | null = null;
/** Posição transversal normalizada (-1..1, +1 = esquerda) da trajetória ideal. */
export function racingLine(): Float32Array {
  if (racingLineCache) return racingLineCache;
  const kn = smoothK(10);
  const kb = smoothK(45);
  const out = new Float32Array(TRACK.n);
  for (let i = 0; i < TRACK.n; i++) {
    const v = (kn[i] - 0.55 * kb[i]) * 75;
    out[i] = Math.max(-0.82, Math.min(0.82, Math.tanh(v) * 0.9));
  }
  // suaviza o resultado
  const sm = new Float32Array(TRACK.n);
  const r = 6;
  for (let i = 0; i < TRACK.n; i++) {
    let a = 0;
    for (let k = -r; k <= r; k++) a += out[(i + k + TRACK.n) % TRACK.n];
    sm[i] = a / (2 * r + 1);
  }
  racingLineCache = sm;
  return sm;
}

/** Zonas de frenagem aproximadas: trechos antes das curvas lentas. */
export function brakingFactor(s: number): number {
  let v = 0;
  for (const c of CORNERS) {
    if (c.minRadius > 70) continue;
    const ref = c.apexS;
    const d = wrapS(ref - s); // distância até o ápice
    const L = c.number === 1 || c.number === 4 ? 160 : c.number === 12 || c.number === 10 ? 120 : 85;
    if (d < L + 25) {
      const t = d < 25 ? d / 25 : 1 - (d - 25) / L;
      v = Math.max(v, Math.max(0, t));
    }
  }
  return v;
}

export function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// Zebras e áreas de escape (posições derivadas da curvatura; ver METODOLOGIA)
// ---------------------------------------------------------------------------
export interface KerbRun {
  s0: number;
  s1: number;
  side: 1 | -1; // 1 = esquerda
  kind: 'inside' | 'outside';
  corner: number;
}

/** Curvas sem zebra externa (Curva do Sol: linha branca e grama). */
const NO_OUTSIDE_KERB = [3];

export function computeKerbs(): KerbRun[] {
  const runs: KerbRun[] = [];
  for (const c of CORNERS) {
    const sign: 1 | -1 = c.direction === 'esquerda' ? 1 : -1;
    const len = rangeLength(c.s0, c.s1);
    const kApex = 1 / c.minRadius;
    // interna: onde |k| > 45% do pico, ao redor do ápice
    let a = c.apexS;
    let b = c.apexS;
    const thr = kApex * 0.45;
    for (let d = 0; d < len; d += TRACK.ds) {
      const s = wrapS(c.apexS - d);
      if (Math.abs(frameAt(s).k) < thr || rangeLength(c.s0, s) > len) break;
      a = s;
    }
    for (let d = 0; d < len; d += TRACK.ds) {
      const s = wrapS(c.apexS + d);
      if (Math.abs(frameAt(s).k) < thr || rangeLength(c.s0, s) > len) break;
      b = s;
    }
    const inLen = rangeLength(a, b);
    if (c.minRadius < 260 && inLen > 4) runs.push({ s0: wrapS(a - 6), s1: wrapS(b + 6), side: sign, kind: 'inside', corner: c.number });
    // externa: da metade final ao fim da saída
    if (c.minRadius < 150 && !NO_OUTSIDE_KERB.includes(c.number)) {
      const o0 = wrapS(c.apexS + Math.min(18, inLen * 0.3));
      const o1 = wrapS(b + Math.min(45, 12 + 2200 / c.minRadius));
      runs.push({ s0: o0, s1: o1, side: (-sign) as 1 | -1, kind: 'outside', corner: c.number });
    }
  }
  return runs;
}

export type RunoffSurface = 'grass' | 'asphalt' | 'gravel';
/** Barreira no fim da área de escape: pneus com tela alta, pneus com guard-rail atrás, ou muro de concreto. */
/** tyreWallFence: pneus + barreira modular de concreto + tela (Curva 1, FIA 2022). */
export type RunoffBarrier = 'tyreFence' | 'tyreRail' | 'tyreWallFence' | 'wall';

export interface RunoffZone {
  s0: number;
  s1: number;
  side: 1 | -1;
  /** distância da borda da pista até a barreira (m) */
  depth: number;
  /** largura da faixa pintada (verde escuro) junto à zebra (m) */
  paint: number;
  /** superfície entre a faixa pintada e a barreira (grama = terreno, sem malha própria) */
  surface: RunoffSurface;
  barrier: RunoffBarrier;
  /** a barreira vai até perto das arquibancadas (profundidade = alvo máximo) */
  fitStands?: boolean;
  /**
   * Contorno externo = fecho convexo dos pontos deslocados: a área atravessa o lado
   * interno da curva seguinte sem dobrar (S do Senna: a cerca corta reto até a Curva do Sol).
   * depthAt dá a profundidade-alvo por s antes do fecho.
   */
  hull?: boolean;
  depthAt?: (s: number) => number;
  /** a partir deste s a barreira muda de tipo (ex.: concreto só na Curva 1) */
  barrierAfter?: [number, RunoffBarrier];
  corner?: number;
  label: string;
}

/**
 * Áreas de escape externas às curvas, no padrão do modelo de referência (RCC Design)
 * e das imagens aéreas: faixa estreita pintada de verde escuro logo após a zebra,
 * depois grama, brita (Descida do Lago) ou asfalto (S do Senna, Junção, Café), e
 * sempre uma barreira de pneus no fim — com tela alta nas áreas de público ou
 * guard-rail atrás no miolo. Na Laranjinha, muro de concreto. Profundidades = estimativa.
 */
export function computeRunoffs(): RunoffZone[] {
  type Spec = { depth: number; paint?: number; surface: RunoffSurface; barrier: RunoffBarrier; pre?: number; post?: number; fitStands?: boolean; hull?: boolean; depthAt?: (s: number) => number; barrierAfter?: [number, RunoffBarrier] };
  const spec: Record<number, Spec> = {
    // S do Senna: escape grande do fim do Setor M até a Curva do Sol, com a tela junto às arquibancadas
    // S do Senna + Curva do Sol (lado direito): uma só área asfaltada do fim do Setor M até a
    // Curva do Sol; o contorno é o fecho convexo, então a cerca corta reto por fora do miolo
    // da Curva 2 (carros que passam reto na frenagem da Curva 1 cortam o S por ali)
    1: { depth: 42, surface: 'asphalt', barrier: 'tyreWallFence', pre: -12, post: 405, fitStands: true, hull: true, depthAt: (s) => (s < 470 ? 42 : s < 560 ? 42 - ((s - 470) / 90) * 31 : 11), barrierAfter: [480, 'tyreFence'] },
    2: { depth: 9, surface: 'grass', barrier: 'tyreFence', pre: 5, post: 15 },
    4: { depth: 30, surface: 'gravel', barrier: 'tyreFence', pre: 30, post: 10 },
    5: { depth: 11, surface: 'grass', barrier: 'tyreRail', pre: 0, post: 25 },
    6: { depth: 14, surface: 'grass', barrier: 'tyreRail', pre: 10, post: 10 },
    7: { depth: 10, surface: 'grass', barrier: 'tyreRail', pre: 0, post: 15 },
    8: { depth: 6, paint: 2, surface: 'grass', barrier: 'wall', pre: 10, post: 25 },
    9: { depth: 10, surface: 'grass', barrier: 'tyreRail', pre: 10, post: 10 },
    10: { depth: 10, surface: 'grass', barrier: 'tyreRail', pre: 15, post: 10 },
    11: { depth: 9, surface: 'grass', barrier: 'tyreFence', pre: 0, post: 15 },
    12: { depth: 18, surface: 'asphalt', barrier: 'tyreFence', pre: 40, post: 15 },
    13: { depth: 13, surface: 'asphalt', barrier: 'tyreFence', pre: 10, post: 50 },
  };
  const zones: RunoffZone[] = [];
  for (const c of CORNERS) {
    const sp = spec[c.number];
    if (!sp) continue;
    const sign: 1 | -1 = c.direction === 'esquerda' ? -1 : 1; // lado externo
    zones.push({
      s0: wrapS(c.s0 - (sp.pre ?? 0)),
      s1: wrapS(c.s1 + (sp.post ?? 0)),
      side: sign,
      depth: sp.depth,
      paint: Math.max(0, Math.min(sp.paint ?? 3, sp.depth - 1)),
      fitStands: sp.fitStands,
      hull: sp.hull,
      depthAt: sp.depthAt,
      barrierAfter: sp.barrierAfter,
      surface: sp.surface,
      barrier: sp.barrier,
      corner: c.number,
      label: `Área de escape – Curva ${c.number} (${c.name})`,
    });
  }
  return zones;
}

/** Tipo de barreira em s (zonas com troca de tipo ao longo do trecho). */
export function runoffBarrierAt(z: RunoffZone, s: number): RunoffBarrier {
  return z.barrierAfter && wrapS(s - z.s0) > wrapS(z.barrierAfter[0] - z.s0) ? z.barrierAfter[1] : z.barrier;
}

/** Profundidade-alvo (antes do fecho convexo e do limite por raio). */
function targetDepth(z: RunoffZone, s: number): number {
  let d = z.depthAt ? z.depthAt(s) : z.depth;
  if (z.fitStands) {
    let c = Infinity;
    for (let k = -9; k <= 9; k += 1.5) c = Math.min(c, standClearance(wrapS(s + k), z.side));
    d = Math.min(d, c - 3.6);
  }
  return Math.max(4, d);
}

/** Ponto na borda da pista (0,3 m além da largura) deslocado `lat` para o lado da zona. */
function edgePoint(z: RunoffZone, s: number, lat: number): [number, number] {
  const f = frameAt(wrapS(s));
  const w = z.side === 1 ? f.wl : f.wr;
  return [f.x + f.lx * z.side * (w + 0.3 + lat), f.z + f.lz * z.side * (w + 0.3 + lat)];
}

const hullCache = new Map<RunoffZone, [number, number][]>();
/**
 * Contorno externo de uma zona "hull": fecho convexo (cadeia monótona) dos pontos
 * deslocados, do início ao fim da zona, só pelo lado de fora.
 */
export function runoffHull(z: RunoffZone): [number, number][] {
  if (hullCache.has(z)) return hullCache.get(z)!;
  const len = rangeLength(z.s0, z.s1);
  const pts: [number, number][] = [];
  for (let d = 0; d <= len; d += 2) {
    const s = wrapS(z.s0 + d);
    pts.push(edgePoint(z, s, 0));
    pts.push(edgePoint(z, s, targetDepth(z, s)));
  }
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  // cadeia entre a ponta inicial e a final que fica do lado de fora (passa pelos pontos deslocados)
  const a = edgePoint(z, z.s0, 0);
  const b = edgePoint(z, z.s1, 0);
  const near = (p: [number, number]) => (i: number) => Math.hypot(hull[i][0] - p[0], hull[i][1] - p[1]);
  const ia = hull.map((_, i) => i).reduce((best, i) => (near(a)(i) < near(a)(best) ? i : best), 0);
  const ib = hull.map((_, i) => i).reduce((best, i) => (near(b)(i) < near(b)(best) ? i : best), 0);
  const chainFrom = (dir: 1 | -1) => {
    const out: [number, number][] = [];
    for (let i = ia; ; i = (i + dir + hull.length) % hull.length) {
      out.push(hull[i]);
      if (i === ib) break;
      if (out.length > hull.length) break;
    }
    return out;
  };
  const c1 = chainFrom(1);
  const c2 = chainFrom(-1);
  // a cadeia de fora é a que passa mais longe da pista
  const far = (c: [number, number][]) => c.reduce((m, p) => Math.max(m, nearestS(p[0], p[1]).d), 0);
  const chain = far(c1) > far(c2) ? c1 : c2;
  hullCache.set(z, chain);
  return chain;
}

/** Profundidade da área de escape em s (limitada pela frente das arquibancadas quando fitStands). */
export function runoffDepthAt(z: RunoffZone, s: number): number {
  if (z.hull) {
    // interseção do raio normal (a partir da borda) com o contorno convexo
    const chain = runoffHull(z);
    const o = edgePoint(z, s, 0);
    const p1 = edgePoint(z, s, 1);
    const dx = p1[0] - o[0];
    const dz = p1[1] - o[1];
    let best = Infinity;
    for (let i = 0; i < chain.length - 1; i++) {
      const [ax, az] = chain[i];
      const [bx, bz] = chain[i + 1];
      const ex = bx - ax;
      const ez = bz - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - o[0]) * ez - (az - o[1]) * ex) / den;
      const u = ((ax - o[0]) * dz - (az - o[1]) * dx) / den;
      if (t >= 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best === Infinity ? Math.max(4, targetDepth(z, s)) : Math.max(1, best);
  }
  // do lado interno de uma curva, a faixa deslocada dobra sobre si mesma quando a
  // profundidade passa do raio: limita a 70% do raio de curvatura local (média de ±12 m)
  let kMax = 0;
  for (let d = -12; d <= 12; d += 3) {
    const f = frameAt(wrapS(s + d));
    const inside = z.side * f.k > 0; // k > 0 = curva à esquerda → lado interno = esquerdo (side 1)
    if (inside) kMax = Math.max(kMax, Math.abs(f.k));
  }
  const byRadius = kMax > 1e-4 ? Math.max(4, 0.5 / kMax - 8) : Infinity;
  return Math.min(targetDepth(z, s), byRadius);
}

/**
 * "Salsichas": elementos amarelos elevados atrás das zebras internas, nas curvas
 * em que aparecem no modelo de referência (S do Senna, Descida do Lago, Laranjinha,
 * Bico de Pato). Posição = estimativa.
 */
export const SAUSAGE_CORNERS = [1, 2, 4, 8, 10];

/** Envelope suave 0..1..0 dentro de [s0,s1]. */
export function envelope(s: number, s0: number, s1: number, ramp: number) {
  const len = rangeLength(s0, s1);
  const d = wrapS(s - s0);
  if (d > len) return 0;
  const a = Math.min(1, d / ramp);
  const b = Math.min(1, (len - d) / ramp);
  const t = Math.min(a, b);
  return t * t * (3 - 2 * t);
}

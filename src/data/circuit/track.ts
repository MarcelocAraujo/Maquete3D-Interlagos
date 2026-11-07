import raw from '../generated/track.json';

/**
 * Modelo central do traçado. Todas as distâncias "s" são medidas ao longo da
 * linha central do modelo (derivada do OpenStreetMap), com s = 0 na linha de
 * chegada/controle e crescendo no sentido de corrida (anti-horário).
 */
export interface TrackData {
  length: number;
  ds: number;
  n: number;
  base: number;
  x: Float32Array;
  z: Float32Array;
  y: Float32Array;
  wl: Float32Array;
  wr: Float32Array;
  k: Float32Array;
  bank: Float32Array;
  tx: Float32Array; // tangente
  tz: Float32Array;
  startLineS: number;
  osmLoopLength: number;
  origin: { lat: number; lon: number };
  osmSegments: { osmId: number; name: string | null; corner: number | null; s0: number; s1: number }[];
  pit: { length: number; x: number[]; z: number[]; y: number[]; entryS: number; exitS: number };
}

function build(): TrackData {
  const n = raw.n;
  const x = Float32Array.from(raw.x);
  const z = Float32Array.from(raw.z);
  const tx = new Float32Array(n);
  const tz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const dx = x[b] - x[a];
    const dz = z[b] - z[a];
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  return {
    length: raw.length,
    ds: raw.ds,
    n,
    base: raw.meta.base,
    x,
    z,
    y: Float32Array.from(raw.y),
    wl: Float32Array.from(raw.wl),
    wr: Float32Array.from(raw.wr),
    k: Float32Array.from(raw.k),
    bank: Float32Array.from(raw.bank),
    tx,
    tz,
    startLineS: raw.startLineS,
    osmLoopLength: raw.meta.osmLoopLength,
    origin: raw.meta.origin,
    osmSegments: raw.osmSegments,
    pit: raw.pit,
  };
}

export const TRACK = build();
export const TRACK_LENGTH = TRACK.length;
export const OFFICIAL_LENGTH = 4309; // FIA (Event Notes 2022) / Prefeitura de SP

export const wrapS = (s: number) => ((s % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;

/** Comprimento do intervalo [s0, s1] percorrido no sentido de corrida. */
export const rangeLength = (s0: number, s1: number) => wrapS(s1 - s0) || (s1 === s0 ? 0 : TRACK_LENGTH);

export const inRange = (s: number, s0: number, s1: number) => {
  const a = wrapS(s - s0);
  return a <= rangeLength(s0, s1);
};

export interface TrackFrame {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  lx: number; // normal à esquerda
  lz: number;
  wl: number;
  wr: number;
  k: number;
  bank: number;
}

/** Amostra interpolada da pista na distância s. */
export function frameAt(sIn: number): TrackFrame {
  const s = wrapS(sIn);
  const f = s / TRACK.ds;
  const i0 = Math.floor(f) % TRACK.n;
  const i1 = (i0 + 1) % TRACK.n;
  const t = f - Math.floor(f);
  const L = (a: Float32Array) => a[i0] + (a[i1] - a[i0]) * t;
  let tx = L(TRACK.tx);
  let tz = L(TRACK.tz);
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  return { x: L(TRACK.x), y: L(TRACK.y), z: L(TRACK.z), tx, tz, lx: tz, lz: -tx, wl: L(TRACK.wl), wr: L(TRACK.wr), k: L(TRACK.k), bank: L(TRACK.bank) };
}

/** Ponto deslocado lateralmente (lat > 0 = esquerda no sentido de corrida). */
export function pointAt(s: number, lat: number, dy = 0): [number, number, number] {
  const f = frameAt(s);
  return [f.x + f.lx * lat, f.y + Math.tan(f.bank) * lat + dy, f.z + f.lz * lat];
}

/** Distância s mais próxima de um ponto (x, z) do plano. */
export function nearestS(px: number, pz: number): { s: number; d: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < TRACK.n; i++) {
    const d = (TRACK.x[i] - px) ** 2 + (TRACK.z[i] - pz) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return { s: bi * TRACK.ds, d: Math.sqrt(best) };
}

/** Altitude absoluta (m acima do nível do mar) para um y da cena. */
export const altitude = (y: number) => y + TRACK.base;

export function toLatLon(x: number, z: number): [number, number] {
  const R = 6371008.8;
  const K = Math.PI / 180;
  const lat = TRACK.origin.lat + (-z / R) / K;
  const lon = TRACK.origin.lon + (x / (R * Math.cos(TRACK.origin.lat * K))) / K;
  return [lat, lon];
}

export function osmSegmentByCorner(n: number) {
  const seg = TRACK.osmSegments.find((s) => s.corner === n);
  if (!seg) throw new Error(`segmento OSM da curva ${n} não encontrado`);
  return seg;
}

export function osmSegmentByName(name: string) {
  return TRACK.osmSegments.filter((s) => s.name === name);
}

/** Estatísticas geométricas do intervalo. */
export function rangeStats(s0: number, s1: number) {
  const len = rangeLength(s0, s1);
  const steps = Math.max(2, Math.ceil(len / TRACK.ds));
  let kMax = 0;
  let apexS = s0;
  let yMin = Infinity;
  let yMax = -Infinity;
  let turn = 0;
  for (let i = 0; i <= steps; i++) {
    const s = s0 + (len * i) / steps;
    const f = frameAt(s);
    if (Math.abs(f.k) > Math.abs(kMax)) {
      kMax = f.k;
      apexS = wrapS(s);
    }
    yMin = Math.min(yMin, f.y);
    yMax = Math.max(yMax, f.y);
    turn += f.k * (len / steps);
  }
  const fi = frameAt(s0);
  const fo = frameAt(s1);
  return {
    length: len,
    kMax,
    apexS,
    minRadius: kMax !== 0 ? 1 / Math.abs(kMax) : Infinity,
    yIn: fi.y,
    yOut: fo.y,
    yMin,
    yMax,
    turnDeg: (turn * 180) / Math.PI,
    gradePct: ((fo.y - fi.y) / len) * 100,
  };
}

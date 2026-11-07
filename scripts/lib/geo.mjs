// Utilidades geométricas usadas pelo pipeline de dados.
// Convenção da cena 3D: X = leste (m), Z = -norte (m), Y = altitude relativa (m).

export const R_EARTH = 6371008.8;
const K = Math.PI / 180;

export function makeProjection(lat0, lon0) {
  const cos0 = Math.cos(lat0 * K);
  return {
    lat0,
    lon0,
    /** lat/lon -> [x, z] da cena */
    toScene(lat, lon) {
      const x = (lon - lon0) * K * cos0 * R_EARTH;
      const north = (lat - lat0) * K * R_EARTH;
      return [x, -north];
    },
    toLatLon(x, z) {
      const lat = lat0 + (-z / R_EARTH) / K;
      const lon = lon0 + (x / (R_EARTH * cos0)) / K;
      return [lat, lon];
    },
  };
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polylineLength(pts, closed = false) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

/** Reamostra uma polilinha (aberta ou fechada) com passo uniforme em comprimento de arco. */
export function resample(pts, step, closed = false) {
  const P = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + dist(P[i - 1], P[i]));
  const L = cum[cum.length - 1];
  const n = closed ? Math.max(4, Math.round(L / step)) : Math.max(2, Math.round(L / step) + 1);
  const ds = closed ? L / n : L / (n - 1);
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k * ds;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1e-9;
    const t = Math.min(1, Math.max(0, (s - cum[j]) / seg));
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * t, P[j][1] + (P[j + 1][1] - P[j][1]) * t]);
  }
  return { pts: out, length: L, ds };
}

/** Suavização gaussiana 1D (circular ou com bordas fixas) de um array numérico. */
export function gaussSmooth(arr, sigma, closed = false) {
  if (sigma <= 0) return arr.slice();
  const r = Math.ceil(sigma * 3);
  const w = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    w.push(v);
    sum += v;
  }
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      let j = i + k;
      if (closed) j = ((j % n) + n) % n;
      else if (j < 0 || j >= n) continue;
      acc += arr[j] * w[k + r];
      ws += w[k + r];
    }
    out[i] = acc / ws;
  }
  return out;
}

export function gaussSmoothPts(pts, sigma, closed = false) {
  const xs = gaussSmooth(pts.map((p) => p[0]), sigma, closed);
  const zs = gaussSmooth(pts.map((p) => p[1]), sigma, closed);
  return xs.map((x, i) => [x, zs[i]]);
}

export function medianFilter(arr, half, closed = false) {
  const n = arr.length;
  return arr.map((_, i) => {
    const win = [];
    for (let k = -half; k <= half; k++) {
      let j = i + k;
      if (closed) j = ((j % n) + n) % n;
      else if (j < 0 || j >= n) continue;
      if (Number.isFinite(arr[j])) win.push(arr[j]);
    }
    if (!win.length) return NaN;
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
}

/** Interseção do raio (o + t*d, t>0) com o segmento ab. Retorna t ou null. */
export function raySegment(o, d, a, b) {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const den = d[0] * ez - d[1] * ex;
  if (Math.abs(den) < 1e-12) return null;
  const ax = a[0] - o[0];
  const az = a[1] - o[1];
  const t = (ax * ez - az * ex) / den;
  const u = (ax * d[1] - az * d[0]) / den;
  if (t > 0 && u >= 0 && u <= 1) return t;
  return null;
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return a / 2;
}

export function polygonCentroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

/** Distância de p ao segmento ab e parâmetro t. */
export function pointSegment(p, a, b) {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const l2 = ex * ex + ez * ez || 1e-12;
  let t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + ex * t, a[1] + ez * t];
  return { d: dist(p, q), t, q };
}

/** Hash espacial simples para consultas de vizinhança. */
export class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  insert(x, z, item) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let b = this.map.get(k);
    if (!b) this.map.set(k, (b = []));
    b.push(item);
  }
  query(x, z, r, cb) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const b = this.map.get(this.key(ix, iz));
        if (b) for (const it of b) cb(it);
      }
  }
}

/** Retângulo orientado de área mínima (rotating calipers simplificado sobre arestas do polígono). */
export function minAreaRect(poly) {
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of poly) {
      const u = p[0] * c - p[1] * s;
      const v = p[0] * s + p[1] * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      const ci = Math.cos(ang), si = Math.sin(ang);
      best = {
        area,
        angle: ang,
        length: maxU - minU,
        width: maxV - minV,
        center: [cu * ci - cv * si, cu * si + cv * ci],
      };
    }
  }
  return best;
}

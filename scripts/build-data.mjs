// Pipeline de dados do Interlagos 3D Explorer.
// Entrada : research/raw/osm_raceway.json, osm_area.json (OpenStreetMap, ODbL)
//           research/raw/elevation_grid_srtm30m.json (SRTM 30 m via OpenTopoData)
// Saída   : src/data/generated/track.json  (linha central, larguras, elevação, segmentos OSM, pit lane)
//           public/data/terrain.bin + terrain.json (malha de alturas já ajustada à pista)
//           public/data/features.json (prédios, arquibancadas, vegetação, cercas, vias, etc.)
// Uso     : node scripts/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  makeProjection, dist, polylineLength, resample, gaussSmooth, gaussSmoothPts, medianFilter,
  raySegment, pointInPolygon, polygonArea, polygonCentroid, pointSegment, SpatialHash, minAreaRect,
} from './lib/geo.mjs';

const RAW = 'research/raw';
const OUT_SRC = 'src/data/generated';
const OUT_PUB = 'public/data';
fs.mkdirSync(OUT_SRC, { recursive: true });
fs.mkdirSync(OUT_PUB, { recursive: true });

const rw = JSON.parse(fs.readFileSync(`${RAW}/osm_raceway.json`, 'utf8'));
const osm = JSON.parse(fs.readFileSync(`${RAW}/osm_area.json`, 'utf8'));
const dem = JSON.parse(fs.readFileSync(`${RAW}/elevation_grid_srtm30m.json`, 'utf8'));

const proj = makeProjection(dem.center.lat, dem.center.lon);
const P = (g) => proj.toScene(g.lat, g.lon);
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const log = (...a) => console.log('[build]', ...a);

// ---------------------------------------------------------------------------
// 1. Modelo digital de elevação (SRTM) — amostragem bicúbica sobre grade suavizada
// ---------------------------------------------------------------------------
const DN = dem.n, DSTEP = dem.stepM, DHALF = dem.halfM;
let demGrid = Float64Array.from(dem.values);
{
  // suavização leve (sigma ~0.8 célula) para reduzir ruído/artefatos de dossel
  const s = 0.8, r = 2;
  const w = [];
  for (let i = -r; i <= r; i++) w.push(Math.exp(-(i * i) / (2 * s * s)));
  const tmp = new Float64Array(DN * DN);
  for (let j = 0; j < DN; j++)
    for (let i = 0; i < DN; i++) {
      let a = 0, ws = 0;
      for (let k = -r; k <= r; k++) { const ii = i + k; if (ii < 0 || ii >= DN) continue; a += demGrid[j * DN + ii] * w[k + r]; ws += w[k + r]; }
      tmp[j * DN + i] = a / ws;
    }
  const out = new Float64Array(DN * DN);
  for (let j = 0; j < DN; j++)
    for (let i = 0; i < DN; i++) {
      let a = 0, ws = 0;
      for (let k = -r; k <= r; k++) { const jj = j + k; if (jj < 0 || jj >= DN) continue; a += tmp[jj * DN + i] * w[k + r]; ws += w[k + r]; }
      out[j * DN + i] = a / ws;
    }
  demGrid = out;
}
const demAt = (i, j) => demGrid[Math.min(DN - 1, Math.max(0, j)) * DN + Math.min(DN - 1, Math.max(0, i))];
function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
/** Altitude absoluta (m) do SRTM suavizado em coordenadas da cena. */
function demSample(x, z) {
  const fi = (x + DHALF) / DSTEP;
  const fj = (z + DHALF) / DSTEP; // linha 0 = norte = z negativo
  const i = Math.floor(fi), j = Math.floor(fj);
  const tx = fi - i, tz = fj - j;
  const rows = [];
  for (let m = -1; m <= 2; m++) rows.push(cubic(demAt(i - 1, j + m), demAt(i, j + m), demAt(i + 1, j + m), demAt(i + 2, j + m), tx));
  return cubic(rows[0], rows[1], rows[2], rows[3], tz);
}

// ---------------------------------------------------------------------------
// 2. Traçado principal (OSM highway=raceway, sport=motor) montado como laço fechado
// ---------------------------------------------------------------------------
const nodeById = new Map();
for (const e of osm.elements) if (e.type === 'node') nodeById.set(e.id, e);
const motorWays = rw.elements.filter((e) => e.type === 'way' && e.tags.highway === 'raceway' && e.tags.sport === 'motor' && e.tags.name !== 'Pit Lane');
const byStart = new Map();
for (const w of motorWays) { if (!byStart.has(w.nodes[0])) byStart.set(w.nodes[0], []); byStart.get(w.nodes[0]).push(w); }
const FIRST = 131439569; // trecho inicial do S do Senna
let cur = motorWays.find((w) => w.id === FIRST);
const loopWays = [];
const startNode = cur.nodes[0];
while (cur) {
  loopWays.push(cur);
  const end = cur.nodes[cur.nodes.length - 1];
  if (end === startNode) break;
  cur = (byStart.get(end) || []).find((w) => !loopWays.includes(w));
}
let rawPts = [];
let rawNodeIds = [];
for (const w of loopWays) {
  w.geometry.forEach((g, i) => {
    if (i === 0 && rawPts.length) return;
    rawPts.push(P(g));
    rawNodeIds.push(w.nodes[i]);
  });
}
rawPts.pop(); rawNodeIds.pop(); // remove nó de fechamento duplicado
const osmLoopLength = polylineLength(rawPts, true);
log('laço OSM:', loopWays.length, 'vias,', rawPts.length, 'nós, comprimento', osmLoopLength.toFixed(1), 'm');

// rotaciona para começar na linha de chegada (nó OSM "Finish Line" = linha de controle)
const FINISH_NODE = 13826424126, START_NODE = 13826424125;
const finishLL = nodeById.get(FINISH_NODE);
const startLL = nodeById.get(START_NODE);
function projectOnLoop(pts, p) {
  let best = { d: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const r = pointSegment(p, a, b);
    if (r.d < best.d) best = { ...r, i };
  }
  return best;
}
{
  const fp = P(finishLL);
  const pr = projectOnLoop(rawPts, fp);
  log('nó Finish Line a', pr.d.toFixed(2), 'm do traçado');
  const rot = [pr.q, ...rawPts.slice(pr.i + 1), ...rawPts.slice(0, pr.i + 1)];
  rawPts = rot;
}

// densifica e suaviza levemente (remove quinas da polilinha sem alterar o desenho)
let dense = resample(rawPts, 0.5, true).pts;
dense = gaussSmoothPts(dense, 5, true); // sigma 5 amostras = 2,5 m
// garante que s=0 continua na linha de chegada após suavização
const DS_TARGET = 2.0;
const rs = resample(dense, DS_TARGET, true);
const C = rs.pts;
const N = C.length;
const L = rs.length;
const DS = rs.ds;
log('linha central suavizada:', N, 'amostras, ds =', DS.toFixed(4), 'm, comprimento =', L.toFixed(1), 'm (oficial FIA: 4309 m)');

// orientação: área com sinal no plano (leste, norte); anti-horário => positiva
const areaEN = polygonArea(C.map((p) => [p[0], -p[1]]));
log('sentido do traçado:', areaEN > 0 ? 'anti-horário' : 'horário');

// tangentes, normais (esquerda), curvatura
const tan = [], left = [], heading = [];
for (let i = 0; i < N; i++) {
  const a = C[(i - 1 + N) % N], b = C[(i + 1) % N];
  const tx = b[0] - a[0], tz = b[1] - a[1];
  const l = Math.hypot(tx, tz);
  tan.push([tx / l, tz / l]);
  left.push([tz / l, -tx / l]);
  heading.push(Math.atan2(-tz, tx)); // ângulo no plano leste-norte
}
let kappa = [];
for (let i = 0; i < N; i++) {
  let d = heading[(i + 1) % N] - heading[(i - 1 + N) % N];
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  kappa.push(d / (2 * DS)); // >0 = curva à esquerda
}
kappa = gaussSmooth(kappa, 3, true);

// ---------------------------------------------------------------------------
// 3. Larguras reais a partir do polígono area:highway=raceway (bordas interna/externa)
// ---------------------------------------------------------------------------
const areaRel = rw.elements.find((e) => e.type === 'relation' && e.tags['area:highway'] === 'raceway');
const rings = areaRel.members.filter((m) => m.geometry).map((m) => ({ role: m.role, pts: m.geometry.map(P) }));
const ringSegs = [];
for (const r of rings) for (let i = 0; i < r.pts.length - 1; i++) ringSegs.push([r.pts[i], r.pts[i + 1], r.role]);
const segHash = new SpatialHash(25);
ringSegs.forEach((s, idx) => {
  const mx = (s[0][0] + s[1][0]) / 2, mz = (s[0][1] + s[1][1]) / 2;
  segHash.insert(mx, mz, idx);
});
function castWidth(i, sign) {
  const o = C[i];
  const d = [left[i][0] * sign, left[i][1] * sign];
  let best = Infinity;
  const seen = new Set();
  segHash.query(o[0], o[1], 40, (idx) => {
    if (seen.has(idx)) return; seen.add(idx);
    const s = ringSegs[idx];
    const t = raySegment(o, d, s[0], s[1]);
    if (t !== null && t < best) best = t;
  });
  return best < 22 ? best : NaN;
}
let wl = [], wr = [];
for (let i = 0; i < N; i++) { wl.push(castWidth(i, 1)); wr.push(castWidth(i, -1)); }
const rawWl = wl.slice(), rawWr = wr.slice();
function cleanWidth(arr) {
  const med = medianFilter(arr, 30, true); // janela ~120 m
  let out = arr.map((v, i) => {
    if (!Number.isFinite(v)) return med[i];
    if (v > med[i] * 1.3 || v < med[i] * 0.7) return med[i];
    return v;
  });
  out = out.map((v) => (Number.isFinite(v) ? Math.min(9.5, Math.max(4.5, v)) : 6.5));
  out = medianFilter(out, 4, true);
  return gaussSmooth(out, 4, true);
}
wl = cleanWidth(wl);
wr = cleanWidth(wr);
// A Prefeitura informa largura entre 12 e 15 m: mantém a forma do OSM, limitada a esse intervalo oficial.
for (let i = 0; i < N; i++) {
  const tw = wl[i] + wr[i];
  const f = Math.min(15, Math.max(12, tw)) / tw;
  wl[i] *= f; wr[i] *= f;
}
{
  const tw = wl.map((v, i) => v + wr[i]);
  const okL = rawWl.filter(Number.isFinite).length, okR = rawWr.filter(Number.isFinite).length;
  log(`largura: min ${Math.min(...tw).toFixed(1)} m, max ${Math.max(...tw).toFixed(1)} m, média ${(tw.reduce((a, b) => a + b, 0) / N).toFixed(1)} m (oficial: 12–15 m). raios válidos E ${okL}/${N}, D ${okR}/${N}`);
}

// ---------------------------------------------------------------------------
// 4. Perfil de elevação ao longo da pista
// ---------------------------------------------------------------------------
let elevRaw = C.map((p) => demSample(p[0], p[1]));
let elev = gaussSmooth(elevRaw, 14, true); // sigma 28 m
{
  let mn = Infinity, mx = -Infinity, smn = 0, smx = 0;
  elev.forEach((v, i) => { if (v < mn) { mn = v; smn = i * DS; } if (v > mx) { mx = v; smx = i * DS; } });
  log(`elevação SRTM suavizada: min ${mn.toFixed(1)} m (s=${smn.toFixed(0)}), max ${mx.toFixed(1)} m (s=${smx.toFixed(0)}), desnível ${(mx - mn).toFixed(1)} m`);
}

// ---------------------------------------------------------------------------
// 5. Segmentos OSM nomeados -> intervalos de s
// ---------------------------------------------------------------------------
const nodePos = (id) => { const n = nodeById.get(id); return n ? P(n) : null; };
function sOfPoint(p) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < N; i++) { const d = dist(p, C[i]); if (d < best) { best = d; bi = i; } }
  // refina com a projeção no segmento vizinho
  const a = C[bi], b = C[(bi + 1) % N], c = C[(bi - 1 + N) % N];
  const r1_ = pointSegment(p, a, b), r0 = pointSegment(p, c, a);
  if (r1_.d <= r0.d) return { s: (bi + r1_.t) * DS, d: r1_.d };
  return { s: ((bi - 1 + r0.t + N) % N) * DS, d: r0.d };
}
const osmSegments = loopWays.map((w) => {
  const s0 = sOfPoint(nodePos(w.nodes[0])).s;
  const s1 = sOfPoint(nodePos(w.nodes[w.nodes.length - 1])).s;
  return {
    osmId: w.id,
    name: w.tags.name || null,
    corner: w.tags['raceway:corner_number'] ? Number(w.tags['raceway:corner_number']) : null,
    s0: r1(s0),
    s1: r1(s1),
  };
});
const startLineS = sOfPoint(P(startLL));
log('linha de largada (nó OSM) em s =', startLineS.s.toFixed(1), 'm; distância ao traçado', startLineS.d.toFixed(2));

// ---------------------------------------------------------------------------
// 6. Pit lane
// ---------------------------------------------------------------------------
const pitWay = rw.elements.find((e) => e.type === 'way' && e.id === 33779109);
let pitPts = resample(gaussSmoothPts(resample(pitWay.geometry.map(P), 0.5).pts, 5), 2).pts;
const pitLen = polylineLength(pitPts);
const trackHash = new SpatialHash(20);
for (let i = 0; i < N; i++) trackHash.insert(C[i][0], C[i][1], i);
function nearestTrack(x, z, r = 60) {
  let best = { d: Infinity, i: -1 };
  trackHash.query(x, z, r, (i) => { const d = Math.hypot(C[i][0] - x, C[i][1] - z); if (d < best.d) best = { d, i }; });
  return best;
}
let pitY = pitPts.map((p) => {
  const nt = nearestTrack(p[0], p[1]);
  const d = demSample(p[0], p[1]);
  if (nt.i < 0) return d;
  const w = Math.min(1, Math.max(0, (nt.d - 15) / 30));
  return elev[nt.i] * (1 - w) + d * w;
});
pitY = gaussSmooth(pitY, 10);
const pitEntryS = sOfPoint(pitPts[0]).s, pitExitS = sOfPoint(pitPts[pitPts.length - 1]).s;
log('pit lane:', pitLen.toFixed(0), 'm; entrada s =', pitEntryS.toFixed(0), 'saída s =', pitExitS.toFixed(0));

// ---------------------------------------------------------------------------
// 7. Inclinação transversal (estimativa) – apenas onde há menção a curvas inclinadas
// ---------------------------------------------------------------------------
const bank = new Array(N).fill(0);
function segRange(corner) { return osmSegments.find((s) => s.corner === corner); }
function addBank(s0, s1, maxRad) {
  for (let i = 0; i < N; i++) {
    let s = i * DS;
    let u;
    if (s1 > s0) u = (s - s0) / (s1 - s0);
    else { if (s < s0) s += L; u = (s - s0) / (s1 + L - s0); }
    if (u < 0 || u > 1) continue;
    const ramp = Math.sin(Math.PI * u);
    bank[i] += maxRad * ramp * Math.sign(kappa[i] || 1);
  }
}
{
  const t3 = segRange(3), t15 = segRange(15), t14 = segRange(14);
  addBank(t3.s0, t3.s1, 0.03);   // Curva do Sol (citada como inclinada) – estimativa
  addBank(t14.s0, t15.s1, 0.025); // Subida dos Boxes/Arquibancadas – estimativa
}

// ---------------------------------------------------------------------------
// 8. Terreno: SRTM reamostrado + acomodação da pista, pit lane e lago
// ---------------------------------------------------------------------------
const BASE = 740; // altitude (m) correspondente a y = 0 na cena
const TH = 1550, TSTEP = 5;
const TN = Math.round((2 * TH) / TSTEP) + 1;
const terr = new Float32Array(TN * TN);
for (let j = 0; j < TN; j++)
  for (let i = 0; i < TN; i++) terr[j * TN + i] = demSample(-TH + i * TSTEP, -TH + j * TSTEP) - BASE;

// fontes de "corredor plano": pista (com bordas) e pit lane
const corridor = []; // {x,z,y,hw}
for (let i = 0; i < N; i++) corridor.push({ x: C[i][0], z: C[i][1], y: elev[i] - BASE, hw: Math.max(wl[i], wr[i]) + 1 });
for (let i = 0; i < pitPts.length; i++) corridor.push({ x: pitPts[i][0], z: pitPts[i][1], y: pitY[i] - BASE, hw: 9 });
const corHash = new SpatialHash(20);
corridor.forEach((c, k) => corHash.insert(c.x, c.z, k));
const BLEND = 45, SHOULDER = 7;
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let j = 0; j < TN; j++) {
  const z = -TH + j * TSTEP;
  for (let i = 0; i < TN; i++) {
    const x = -TH + i * TSTEP;
    let wMax = 0, acc = 0, accW = 0;
    corHash.query(x, z, 70, (k) => {
      const c = corridor[k];
      const d = Math.hypot(c.x - x, c.z - z);
      const w = 1 - smoothstep(c.hw + SHOULDER, c.hw + SHOULDER + BLEND, d);
      if (w <= 0) return;
      if (w > wMax) wMax = w;
      const ww = Math.pow(w, 6) + 1e-9;
      acc += ww * (c.y - 0.3);
      accW += ww;
    });
    if (wMax > 0) {
      const idx = j * TN + i;
      terr[idx] = terr[idx] * (1 - wMax) + (acc / accW) * wMax;
    }
  }
}

// lago (natural=water) – espelho d'água plano e leito escavado
const waterWays = osm.elements.filter((e) => e.type === 'way' && e.tags?.natural === 'water' && e.geometry);
const waters = [];
for (const w of waterWays) {
  const poly = w.geometry.map(P);
  const c = polygonCentroid(poly);
  if (Math.abs(c[0]) > TH || Math.abs(c[1]) > TH) continue;
  // nível = percentil 20 das alturas da margem
  const shore = poly.map((p) => demSample(p[0], p[1]) - BASE).sort((a, b) => a - b);
  const level = shore[Math.floor(shore.length * 0.2)] - 0.6;
  waters.push({ id: w.id, poly, level, area: Math.abs(polygonArea(poly)) });
}
for (const wa of waters) {
  let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
  for (const p of wa.poly) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); }
  const i0 = Math.max(0, Math.floor((mnx - 20 + TH) / TSTEP)), i1 = Math.min(TN - 1, Math.ceil((mxx + 20 + TH) / TSTEP));
  const j0 = Math.max(0, Math.floor((mnz - 20 + TH) / TSTEP)), j1 = Math.min(TN - 1, Math.ceil((mxz + 20 + TH) / TSTEP));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const p = [-TH + i * TSTEP, -TH + j * TSTEP];
      let dEdge = Infinity;
      for (let k = 0; k < wa.poly.length - 1; k++) dEdge = Math.min(dEdge, pointSegment(p, wa.poly[k], wa.poly[k + 1]).d);
      const inside = pointInPolygon(p, wa.poly);
      const idx = j * TN + i;
      if (inside) terr[idx] = Math.min(terr[idx], wa.level - 0.4 - Math.min(3, dEdge * 0.12));
      else if (dEdge < 12) terr[idx] = Math.min(terr[idx], wa.level + 0.25 + dEdge * 0.12 + (terr[idx] - wa.level) * smoothstep(0, 12, dEdge));
    }
}
log('lagos:', waters.length, waters.map((w) => `${w.id} nível ${w.level.toFixed(1)} área ${w.area.toFixed(0)}`).join('; '));

function terrSample(x, z) {
  const fi = (x + TH) / TSTEP, fj = (z + TH) / TSTEP;
  const i = Math.min(TN - 2, Math.max(0, Math.floor(fi))), j = Math.min(TN - 2, Math.max(0, Math.floor(fj)));
  const tx = Math.min(1, Math.max(0, fi - i)), tz = Math.min(1, Math.max(0, fj - j));
  const a = terr[j * TN + i], b = terr[j * TN + i + 1], c = terr[(j + 1) * TN + i], d = terr[(j + 1) * TN + i + 1];
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
}

// ---------------------------------------------------------------------------
// 9. Feições (OSM) – prédios, arquibancadas, vegetação, vias, cercas, torres...
// ---------------------------------------------------------------------------
const FEAT_HALF = 1450;
const inArea = (p, m = 0) => Math.abs(p[0]) < FEAT_HALF - m && Math.abs(p[1]) < FEAT_HALF - m;
const ringOf = (geom) => {
  const pts = geom.map(P);
  if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 0.01) pts.pop();
  return pts;
};
const rnd = (pts) => pts.map((p) => [r1(p[0]), r1(p[1])]);

const buildings = [];
const grandstands = [];
const landuse = [];
const roads = [];
const lines = { fence: [], wall: [], power: [], kart: [], drag: [], footbridge: [], treeRow: [], stream: [] };
const points = { tree: [], powerTower: [], commTower: [], waterTower: [], lamp: [], helipad: [], artwork: [] };

const ROAD_W = { primary: 13, primary_link: 7, secondary: 10, secondary_link: 6, tertiary: 8, tertiary_link: 6, residential: 6.5, living_street: 5, unclassified: 6, service: 4.5, pedestrian: 5, busway: 7, footway: 2, path: 1.6, steps: 2, cycleway: 2 };

function buildingHeight(t, areaM2) {
  if (t.height) { const h = parseFloat(t.height); if (Number.isFinite(h)) return h; }
  if (t['building:levels']) { const l = parseFloat(t['building:levels']); if (Number.isFinite(l)) return l * 3.1 + 1; }
  if (t.building === 'roof') return 5;
  if (t.man_made === 'storage_tank') return 12;
  if (t.building === 'house' || t.building === 'residential') return 6.5;
  // heurística para o casario paulistano: área maior => edificação mais alta
  if (areaM2 > 3000) return 10;
  if (areaM2 > 800) return 8;
  return 6;
}

function addPolyFeature(e, ringPts, t, id) {
  if (ringPts.length < 3) return;
  const c = polygonCentroid(ringPts);
  if (!inArea(c)) return;
  const area = Math.abs(polygonArea(ringPts));
  if (t.building === 'grandstand' || t.leisure === 'bleachers') {
    grandstands.push({ id: `osm-${id}`, osmId: id, name: t.name || null, poly: rnd(ringPts), area: r1(area) });
    return;
  }
  if (t.building && t.building !== 'no') {
    const h = buildingHeight(t, area);
    let base = Infinity, top = -Infinity;
    for (const p of ringPts) { const y = terrSample(p[0], p[1]); base = Math.min(base, y); top = Math.max(top, y); }
    buildings.push({ id, poly: rnd(ringPts), h: r1(h), b: r2(base), g: r2(top - base), n: t.name || undefined, k: t.man_made === 'storage_tank' ? 'tank' : t.building === 'roof' ? 'roof' : t.tourism === 'hotel' ? 'hotel' : t.building });
    return;
  }
  let kind = null;
  if (t.natural === 'water') kind = null; // tratado à parte
  else if (t.landuse === 'grass' || t.landuse === 'village_green' || t.landuse === 'flowerbed') kind = 'grass';
  else if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'playground') kind = 'park';
  else if (t.natural === 'wood' || t.landuse === 'forest') kind = 'forest';
  else if (t.natural === 'scrub') kind = 'scrub';
  else if (t.natural === 'wetland') kind = 'wetland';
  else if (t.amenity === 'parking') kind = 'parking';
  else if (t.leisure === 'pitch') kind = 'pitch';
  else if (t.leisure === 'swimming_pool') kind = 'pool';
  else if (t.landuse === 'brownfield' || t.landuse === 'construction' || t.landuse === 'landfill') kind = 'bare';
  else if (t.landuse === 'industrial' || t.landuse === 'depot' || t.landuse === 'retail') kind = 'urban';
  else if (t['area:highway']) kind = null;
  else if (t.highway === 'service' && t.area === 'yes') kind = 'paved';
  else if (t.aeroway === 'helipad') kind = 'helipad';
  if (kind) landuse.push({ id, k: kind, poly: rnd(ringPts), area: r1(area) });
}

for (const e of osm.elements) {
  const t = e.tags || {};
  if (e.type === 'node') {
    const p = P(e);
    if (!inArea(p)) continue;
    if (t.natural === 'tree') points.tree.push([r1(p[0]), r1(p[1])]);
    else if (t.power === 'tower' || t.power === 'portal') points.powerTower.push([r1(p[0]), r1(p[1])]);
    else if (t.man_made === 'tower' || t.man_made === 'mast') points.commTower.push([r1(p[0]), r1(p[1])]);
    else if (t.man_made === 'water_tower') points.waterTower.push([r1(p[0]), r1(p[1])]);
    else if (t.highway === 'street_lamp') points.lamp.push([r1(p[0]), r1(p[1])]);
    else if (t.tourism === 'artwork') points.artwork.push([r1(p[0]), r1(p[1])]);
    continue;
  }
  if (e.type === 'way' && e.geometry) {
    const closed = e.nodes[0] === e.nodes[e.nodes.length - 1];
    const pts = e.geometry.map(P);
    if (closed && (t.building || t.landuse || t.leisure || t.natural || t.amenity || t.aeroway || (t.highway === 'service' && t.area === 'yes'))) {
      if (t.natural !== 'tree_row') { addPolyFeature(e, ringOf(e.geometry), t, e.id); if (!t.highway) continue; }
    }
    const mid = pts[Math.floor(pts.length / 2)];
    if (!inArea(mid, -200)) continue;
    if (t.highway && t.highway !== 'raceway' && ROAD_W[t.highway] && !(t.area === 'yes')) {
      roads.push({ k: t.highway, w: ROAD_W[t.highway], br: t.bridge === 'yes' ? 1 : 0, tu: t.tunnel === 'yes' ? 1 : 0, n: t.name || undefined, p: rnd(pts) });
      if (t.bridge === 'yes' && (t.highway === 'footway' || t.highway === 'steps')) lines.footbridge.push(rnd(pts));
    } else if (t.highway === 'raceway' && t.sport === 'karting') lines.kart.push(rnd(pts));
    else if (t.highway === 'raceway' && t.sport === 'drag_racing') lines.drag.push(rnd(pts));
    else if (t.barrier === 'fence') lines.fence.push(rnd(pts));
    else if (t.barrier === 'wall') lines.wall.push(rnd(pts));
    else if (t.power === 'line' || t.power === 'cable') lines.power.push(rnd(pts));
    else if (t.natural === 'tree_row') lines.treeRow.push(rnd(pts));
    else if (t.waterway === 'stream' || t.waterway === 'river') lines.stream.push(rnd(pts));
  }
  if (e.type === 'relation' && e.members) {
    if (t.type !== 'multipolygon') continue;
    // usa somente os anéis externos fechados
    for (const m of e.members) {
      if (m.role !== 'outer' || !m.geometry || m.geometry.length < 4) continue;
      const g = m.geometry;
      if (Math.abs(g[0].lat - g[g.length - 1].lat) > 1e-9 || Math.abs(g[0].lon - g[g.length - 1].lon) > 1e-9) continue;
      if (t.leisure === 'sports_centre') continue;
      addPolyFeature(e, ringOf(g), t, `${e.id}-${m.ref}`);
    }
  }
}
log(`feições: ${buildings.length} prédios, ${grandstands.length} arquibancadas, ${landuse.length} áreas, ${roads.length} vias, ${points.tree.length} árvores OSM, ${lines.fence.length} cercas, ${lines.wall.length} muros`);

// prédio dos boxes: maior edificação paralela e próxima à pit lane
const pitHash = new SpatialHash(20);
pitPts.forEach((p, i) => pitHash.insert(p[0], p[1], i));
const pitCandidates = buildings
  .map((b) => {
    const c = polygonCentroid(b.poly);
    let dmin = Infinity;
    pitHash.query(c[0], c[1], 80, (i) => { dmin = Math.min(dmin, dist(c, pitPts[i])); });
    const rect = minAreaRect(b.poly);
    return { b, dmin, rect };
  })
  .filter((x) => x.dmin < 60 && x.rect.length > 60)
  .sort((a, b) => b.rect.length - a.rect.length);
log('candidatos a prédio dos boxes:', pitCandidates.slice(0, 5).map((x) => `${x.b.id} L=${x.rect.length.toFixed(0)} W=${x.rect.width.toFixed(0)} d=${x.dmin.toFixed(0)} h=${x.b.h}`).join(' | '));

// contorno do complexo (relação OSM 2560355): une as vias externas em anel
let complexRing = [];
{
  const rel = osm.elements.find((e) => e.type === 'relation' && e.id === 2560355);
  const segs = rel.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.map(P));
  const ring = segs.shift();
  let guard = 0;
  while (segs.length && guard++ < 50) {
    const end = ring[ring.length - 1];
    let bi = -1, rev = false, bd = Infinity;
    segs.forEach((s, i) => {
      const d0 = dist(end, s[0]), d1 = dist(end, s[s.length - 1]);
      if (d0 < bd) { bd = d0; bi = i; rev = false; }
      if (d1 < bd) { bd = d1; bi = i; rev = true; }
    });
    const s = segs.splice(bi, 1)[0];
    ring.push(...(rev ? s.reverse() : s).slice(1));
  }
  complexRing = rnd(ring);
  log('contorno do complexo:', complexRing.length, 'pontos, área', Math.abs(polygonArea(ring)).toFixed(0), 'm²');
}

// ---------------------------------------------------------------------------
// 10. Escrita
// ---------------------------------------------------------------------------
const track = {
  meta: {
    generated: new Date().toISOString(),
    origin: { lat: proj.lat0, lon: proj.lon0 },
    base: BASE,
    sources: ['OpenStreetMap (ODbL) – vias highway=raceway e area:highway=raceway', 'SRTM 30 m (NASA) via OpenTopoData'],
    osmLoopLength: r1(osmLoopLength),
  },
  length: r2(L),
  ds: DS,
  n: N,
  x: C.map((p) => r2(p[0])),
  z: C.map((p) => r2(p[1])),
  y: elev.map((v) => r2(v - BASE)),
  yRaw: elevRaw.map((v) => r1(v - BASE)),
  wl: wl.map(r2),
  wr: wr.map(r2),
  k: kappa.map((v) => Math.round(v * 1e5) / 1e5),
  bank: bank.map((v) => Math.round(v * 1e4) / 1e4),
  startLineS: r1(startLineS.s),
  osmSegments,
  pit: {
    length: r1(pitLen),
    x: pitPts.map((p) => r2(p[0])),
    z: pitPts.map((p) => r2(p[1])),
    y: pitY.map((v) => r2(v - BASE)),
    entryS: r1(pitEntryS),
    exitS: r1(pitExitS),
  },
};
fs.writeFileSync(path.join(OUT_SRC, 'track.json'), JSON.stringify(track));

fs.writeFileSync(path.join(OUT_PUB, 'terrain.bin'), Buffer.from(terr.buffer));
fs.writeFileSync(path.join(OUT_PUB, 'terrain.json'), JSON.stringify({ half: TH, step: TSTEP, n: TN, base: BASE }));

const features = {
  buildings,
  grandstands,
  landuse,
  roads,
  lines,
  points,
  waters: waters.map((w) => ({ id: w.id, level: r2(w.level), poly: rnd(w.poly) })),
  complex: complexRing,
  pitBuildingCandidates: pitCandidates.slice(0, 3).map((x) => ({ id: x.b.id, rect: { ...x.rect, center: x.rect.center.map(r2) } })),
};
fs.writeFileSync(path.join(OUT_PUB, 'features.json'), JSON.stringify(features));
log('ok →', OUT_SRC, OUT_PUB, `features.json ${(fs.statSync(path.join(OUT_PUB, 'features.json')).size / 1e6).toFixed(2)} MB`);

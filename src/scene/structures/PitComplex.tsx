import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK, frameAt, nearestS, wrapS } from '../../data/circuit/track';
import { buildStrip } from '../track/geometry';
import { CORNERS } from '../../data/circuit/corners';
import { PIT_GARAGES } from '../../data/facilities';
import { getWorld } from '../world/world';
import { useAppStore } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { boxAt, polylineStrip, polylineWall } from './polylineStrip';
import { registerSelectable } from '../selection/bounds';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import type { Selection } from '../../data/types';

const PIT_SEL: Selection = { kind: 'pit', id: 'pit' };
const TOWER_SEL: Selection = { kind: 'structure', id: 'control-tower' };

/** Referencial do prédio dos boxes a partir da pegada OSM (retângulo mínimo). */
let pitFrameCache: ReturnType<typeof buildPitFrame> | null = null;
/** Referencial do prédio dos boxes (compartilhado por boxes, paddock e iluminação). */
export function computePitFrame() {
  if (!pitFrameCache) pitFrameCache = buildPitFrame();
  return pitFrameCache;
}

/** Distância livre entre a borda do pit lane (7 m) e a borda da pista. */
export function pitGapAt(p: [number, number, number] | [number, number]) {
  const x = p[0];
  const z = p.length === 3 ? p[2] : p[1];
  const ns = nearestS(x, z);
  const f = frameAt(ns.s);
  const sideSign = Math.sign((x - f.x) * f.lx + (z - f.z) * f.lz) || 1;
  return { gap: ns.d - 3.5 - (sideSign > 0 ? f.wl : f.wr), s: ns.s, sideSign };
}

let pitRangeCache: { iStart: number; iEnd: number } | null = null;
/**
 * Trecho do eixo do pit lane usado como polilinha. Na entrada, o OSM o leva por cima
 * da borda da pista; na saída, a polilinha vai só até o fim da Curva do Sol — dali em
 * diante a saída é reconstruída ao longo da pista (pitExitProfile).
 */
export function pitLaneRange() {
  if (pitRangeCache) return pitRangeCache;
  const pit = TRACK.pit;
  const at = (i: number) => pitGapAt([pit.x[i], pit.z[i]]).gap;
  let iStart = 0;
  while (iStart < pit.x.length / 3 && at(iStart) < 0.4) iStart++;
  const joinS = exitJoinS();
  let iEnd = Math.floor(pit.x.length * 0.66);
  while (iEnd < pit.x.length - 1) {
    const ns = nearestS(pit.x[iEnd], pit.z[iEnd]);
    if (ns.s >= joinS && ns.s < joinS + 400) break;
    iEnd++;
  }
  pitRangeCache = { iStart, iEnd };
  return pitRangeCache;
}

/** s em que a saída dos boxes deixa de ser polilinha: fim da Curva do Sol + 22 m. */
function exitJoinS() {
  const c3 = CORNERS.find((c) => c.number === 3);
  return wrapS((c3 ? c3.s1 : 814) + 22);
}

export interface PitExit {
  side: 1 | -1;
  /** fim da polilinha → encosta na pista → corre ao lado → fim da convergência */
  sX: number;
  sT: number;
  sT2: number;
  sM: number;
  /** distâncias laterais (m) a partir do eixo da pista, do lado indicado por side */
  inner: (s: number) => number;
  outer: (s: number) => number;
}
let pitExitCache: PitExit | null = null;
/**
 * Saída dos boxes reconstruída ao longo da pista: uma faixa de 7 m que, depois da
 * Curva do Sol, se aproxima da borda (45 m), corre ao lado separada por 0,6 m (35 m) e
 * converge para dentro da pista (75 m). Comprimentos = estimativa visual.
 */
export function pitExitProfile(): PitExit {
  if (pitExitCache) return pitExitCache;
  const pit = TRACK.pit;
  const { iEnd } = pitLaneRange();
  const g = pitGapAt([pit.x[iEnd], pit.z[iEnd]]);
  const side = g.sideSign as 1 | -1;
  const cX = nearestS(pit.x[iEnd], pit.z[iEnd]).d;
  const sX = g.s;
  const sT = sX + 45;
  const sT2 = sT + 35;
  const sM = sT2 + 75;
  const w = (s: number) => {
    const f = frameAt(wrapS(s));
    return side === 1 ? f.wl : f.wr;
  };
  const sm = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  };
  const center = (s: number) => cX + (w(s) + 4.1 - cX) * sm((s - sX) / (sT - sX));
  const d = (s: number) => wrapS(s - sX) + sX; // s contínuo a partir de sX
  const inner = (s0: number) => {
    const s = d(s0);
    if (s <= sT) return center(s) - 3.5;
    if (s <= sT2) return w(s) + 0.6;
    return w(s);
  };
  const outer = (s0: number) => {
    const s = d(s0);
    if (s <= sT) return center(s) + 3.5;
    if (s <= sT2) return w(s) + 7.6;
    return w(s) + 7.6 * (1 - sm((s - sT2) / (sM - sT2)));
  };
  pitExitCache = { side, sX, sT, sT2, sM, inner, outer };
  return pitExitCache;
}

export function usePitFrame() {
  return useMemo(() => computePitFrame(), []);
}

function buildPitFrame() {
  {
    const { features, height } = getWorld();
    const rect = features.pitBuildingCandidates[0].rect;
    const pit = TRACK.pit;
    const u = new THREE.Vector2(Math.cos(rect.angle), Math.sin(rect.angle));
    const v = new THREE.Vector2(-u.y, u.x);
    const c = new THREE.Vector2(rect.center[0], rect.center[1]);
    const W = rect.width;
    const L = rect.length;
    // lado voltado para o pit lane
    const distTo = (p: THREE.Vector2) => {
      let d = Infinity;
      for (let i = 0; i < pit.x.length; i++) d = Math.min(d, Math.hypot(pit.x[i] - p.x, pit.z[i] - p.y));
      return d;
    };
    const sideSign = distTo(c.clone().addScaledVector(v, W / 2)) < distTo(c.clone().addScaledVector(v, -W / 2)) ? 1 : -1;
    const front = v.clone().multiplyScalar(sideSign); // normal da fachada (para o pit lane)
    let along = u.clone();
    // eixo local X aponta para o norte (z negativo) — garagens numeradas a partir da entrada
    if (along.y > 0) along = along.multiplyScalar(-1);
    const rotY = Math.atan2(-along.y, along.x); // gira X local para "along"
    // fachada local +Z deve coincidir com "front"
    const localZ = new THREE.Vector2(Math.sin(rotY), Math.cos(rotY));
    const flipZ = localZ.dot(front) < 0;
    const frontCenter = c.clone().addScaledVector(front, W / 2);
    const baseY = height.sample(frontCenter.x, frontCenter.y);
    return { c, W, L, rotY, flipZ, baseY, along, front, frontCenter };
  }
}

export function PitComplex() {
  const mode = useAppStore((s) => s.mode);
  const show = useAppStore((s) => s.layers.pit);
  const frame = usePitFrame();

  const g = useMemo(() => {
    const { W, L } = frame;
    const zF = W / 2; // fachada
    const garageDepth = 216 / 9.4; // 216 m² por box (Prefeitura)
    const garageW = 9.4;
    const towerLen = 22;
    const garageZone = PIT_GARAGES * garageW;
    const xN = L / 2; // extremidade norte
    const xg1 = xN - towerLen - 4; // fim (norte) da zona de garagens
    const xg0 = xg1 - garageZone;
    const H1 = 5.6; // térreo
    const H2 = 9.6; // 1º pavimento
    const H3 = 12.8; // cobertura
    const solids: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    const roof: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];

    // bloco posterior (edifício das equipes / apoio)
    solids.push(boxAt(L, H2, W - garageDepth, 0, 0, -garageDepth / 2));
    // térreo das garagens: lajes, pilares entre boxes, fundo escuro
    solids.push(boxAt(garageZone + 2, 0.6, garageDepth, (xg0 + xg1) / 2, H1 - 0.6, zF - garageDepth / 2));
    dark.push(boxAt(garageZone, H1 - 0.6, 0.3, (xg0 + xg1) / 2, 0, zF - garageDepth + 0.2));
    for (let i = 0; i <= PIT_GARAGES; i++) solids.push(boxAt(0.5, H1, garageDepth, xg0 + i * garageW, 0, zF - garageDepth / 2));
    // extremidade sul (salas técnicas)
    solids.push(boxAt(xg0 + L / 2, H2, garageDepth, (-L / 2 + xg0) / 2, 0, zF - garageDepth / 2));
    // 1º pavimento: faixa de vidro em balanço sobre o pit lane (hospitalidade/imprensa)
    solids.push(boxAt(L - towerLen, 0.5, garageDepth + 2.5, -towerLen / 2, H1, zF - garageDepth / 2 + 1.25));
    glass.push(boxAt(L - towerLen, H2 - H1 - 0.5, 0.25, -towerLen / 2, H1 + 0.5, zF + 2.3));
    solids.push(boxAt(L - towerLen, H2 - H1 - 0.5, garageDepth - 0.5, -towerLen / 2, H1 + 0.5, zF - garageDepth / 2 + 0.6));
    // montantes da fachada de vidro
    for (let x = -L / 2 + 3; x < xN - towerLen; x += 4.7) metal.push(boxAt(0.18, H2 - H1 - 0.5, 0.35, x, H1 + 0.5, zF + 2.35));
    // terraço e cobertura leve com beiral
    solids.push(boxAt(L - towerLen, 0.9, garageDepth + 2.5, -towerLen / 2, H2, zF - garageDepth / 2 + 1.25));
    roof.push(boxAt(L - towerLen + 2, 0.35, garageDepth + 7, -towerLen / 2, H3, zF - garageDepth / 2 + 2.8));
    for (let x = -L / 2 + 6; x < xN - towerLen; x += 18.8) metal.push(boxAt(0.35, H3 - H2 - 0.9, 0.35, x, H2 + 0.9, zF + 5.5));
    roof.push(boxAt(L, 0.4, W - garageDepth, 0, H2, -garageDepth / 2));
    // modulação da cobertura (uma faixa por box) e claraboias no bloco posterior
    for (let x = -L / 2 + 2; x < xN - towerLen; x += garageW) metal.push(boxAt(0.35, 0.22, garageDepth + 7, x, H3 + 0.35, zF - garageDepth / 2 + 2.8));
    for (let x = -L / 2 + 8; x < L / 2 - 8; x += 16) glass.push(boxAt(9, 0.5, (W - garageDepth) * 0.5, x, H2 + 0.4, -garageDepth / 2));
    // equipamentos na cobertura
    for (let i = 0; i < 9; i++) metal.push(boxAt(5, 1.6, 4, -L / 2 + 20 + i * 28, H2 + 0.4, -W / 2 + 10));
    // centro de operações / torre (6 pavimentos) na extremidade norte
    const tx = xN - towerLen / 2;
    solids.push(boxAt(towerLen, 1.2, 20, tx, 0, zF - 9));
    glass.push(boxAt(towerLen - 1, 22, 19, tx, 1.2, zF - 9.5));
    for (let f = 1; f <= 6; f++) solids.push(boxAt(towerLen + 0.6, 0.45, 20, tx, 1.2 + f * 3.6, zF - 9.5));
    roof.push(boxAt(towerLen + 3, 0.6, 23, tx, 23.4, zF - 9));
    metal.push(boxAt(3, 5, 3, tx + 6, 24, zF - 14));
    // base enterrada (acomoda desníveis do terreno)
    solids.push(boxAt(L, 4, W, 0, -4, 0));

    const doors: THREE.Matrix4[] = [];
    for (let i = 0; i < PIT_GARAGES; i++) {
      const m = new THREE.Matrix4().makeTranslation(xg1 - (i + 0.5) * garageW, (H1 - 0.6) / 2, zF - 0.4);
      doors.push(m);
    }
    return {
      solids: mergeGeometries(solids),
      glass: mergeGeometries(glass),
      dark: mergeGeometries(dark),
      roof: mergeGeometries(roof),
      metal: mergeGeometries(metal),
      doors,
      garageW,
      H1,
      xg0,
      xg1,
      towerX: tx,
      zF,
    };
  }, [frame]);

  // transformação do grupo (local → cena)
  const groupMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    m.makeRotationY(frame.rotY);
    if (frame.flipZ) m.multiply(new THREE.Matrix4().makeScale(1, 1, -1));
    m.setPosition(frame.c.x, frame.baseY, frame.c.y);
    return m;
  }, [frame]);

  // pit lane (superfície, linhas e muro)
  const lane = useMemo(() => {
    const { height } = getWorld();
    const pit = TRACK.pit;
    const allPts: [number, number, number][] = pit.x.map((x, i) => [x, pit.y[i] + 0.02, pit.z[i]]);
    // Nas pontas, o eixo do pit lane do OSM corre sobre a borda da pista por ~200 m
    // (entrada na Curva 15, saída na Reta Oposta). A faixa do pit termina onde
    // encosta na pista; dali em diante, a junção é marcada na própria pista.
    const { iStart, iEnd } = pitLaneRange();
    const pts = allPts.slice(iStart, iEnd + 1);
    const entry = pitGapAt(allPts[iStart]);
    const ex = pitExitProfile();
    // largura: 12 m junto às garagens, 7 m nos acessos
    const { c, along, W } = frame;
    const zoneW = (i: number) => {
      const p = new THREE.Vector2(pts[i][0], pts[i][2]);
      const d = p.clone().sub(c);
      const a = Math.abs(d.dot(along));
      const across = Math.abs(d.dot(frame.front)) - W / 2;
      // faixa larga (rápida + trabalho) só em frente às garagens; fora dali, faixa única de 7 m
      // transições suaves tanto ao longo da fachada quanto ao se afastar dela
      const kAlong = a < frame.L / 2 + 6 ? 1 : Math.max(0, 1 - (a - frame.L / 2 - 6) / 24);
      const kAcross = Math.max(0, Math.min(1, 1 - (across - 12) / 12));
      const k = Math.min(kAlong, kAcross);
      return k * k * (3 - 2 * k);
    };
    const wz = pts.map((_, i) => Math.max(0, Math.min(1, zoneW(i))));
    const width = (i: number) => 7 + 5.5 * wz[i];
    // deslocamento para o lado das garagens quando alarga
    const side = (() => {
      const mid = Math.floor(pts.length * 0.15);
      const p = new THREE.Vector2(pts[mid][0], pts[mid][2]);
      const toB = frame.c.clone().sub(p);
      const a = pts[Math.max(0, mid - 1)];
      const b = pts[mid + 1];
      const left = new THREE.Vector2(b[2] - a[2], -(b[0] - a[0])).normalize();
      return Math.sign(left.dot(toB)) || 1;
    })();
    const off = (i: number) => side * 2.75 * wz[i];
    const surface = polylineStrip(pts, width, off, 0, 7);
    // linhas: bordas e divisória faixa rápida / faixa de trabalho
    const lines: THREE.BufferGeometry[] = [];
    lines.push(polylineStrip(pts, () => 0.18, (i) => off(i) + width(i) / 2 - 0.25, 0.015));
    lines.push(polylineStrip(pts, () => 0.18, (i) => off(i) - width(i) / 2 + 0.25, 0.015));
    const divPts = pts.filter((_, i) => wz[i] > 0.95);
    if (divPts.length > 2) lines.push(polylineStrip(divPts, () => 0.2, () => side * 0.25, 0.015));
    // linhas de limite de velocidade (posição ilustrativa) no início e fim da zona larga
    const first = wz.findIndex((v) => v > 0.95);
    const last = wz.length - 1 - [...wz].reverse().findIndex((v) => v > 0.95);
    for (const k of [first - 20, last + 20]) {
      if (k <= 1 || k >= pts.length - 2) continue;
      const seg = pts.slice(k - 1, k + 1);
      lines.push(polylineStrip(seg, () => 7, () => off(k), 0.016));
    }
    // linha pintada sobre o plano da pista (lat com sinal; >0 = esquerda)
    const paintLine = (s0: number, s1: number, lat: (s: number) => number, width = 0.18) => {
      const g = buildStrip({ s0: wrapS(s0), s1: wrapS(s1), step: 1, latA: (s) => lat(s) + width / 2, latB: (s) => lat(s) - width / 2, dy: () => 0.014 });
      for (const k of ['aS', 'aLat', 'aExtra']) g.deleteAttribute(k);
      return g;
    };
    const S = ex.side;
    const wAt = (s: number) => {
      const f = frameAt(wrapS(s));
      return S === 1 ? f.wl : f.wr;
    };
    // saída: faixa reconstruída ao longo da pista (encosta, corre ao lado e converge)
    const exitSurface = buildStrip({
      s0: wrapS(ex.sX),
      s1: wrapS(ex.sM),
      step: 1,
      cols: 3,
      skirt: 0.9,
      latA: (s) => (S === 1 ? ex.outer(s) : -ex.inner(s)),
      latB: (s) => (S === 1 ? ex.inner(s) : -ex.outer(s)),
      dy: () => -0.015,
    });
    for (const k of ['aS', 'aLat', 'aExtra']) exitSurface.deleteAttribute(k);
    // linha branca externa (lado da tela) até fundir com a borda da pista
    lines.push(paintLine(ex.sX, ex.sM - 6, (s) => S * (ex.outer(s) - 0.25)));
    // linha branca interna (lado do guard-rail / da pista) até o início da convergência
    lines.push(paintLine(ex.sX, ex.sT2, (s) => S * (ex.inner(s) + 0.25)));
    // linha contínua que o piloto que sai dos boxes deve manter à sua direita, do lado
    // esquerdo da Reta Oposta, voltando à borda no final
    const L1 = 190;
    const L2 = 40;
    lines.push(paintLine(ex.sT2, ex.sT2 + L1, (s) => S * (wAt(s) - 3.6), 0.2));
    lines.push(
      paintLine(ex.sT2 + L1, ex.sT2 + L1 + L2, (s) => {
        const t = Math.min(1, Math.max(0, wrapS(s - ex.sT2 - L1) / L2));
        return S * (wAt(s) - 3.6 + 3.0 * t);
      }, 0.2),
    );
    // entrada: linha contínua curta de desaceleração
    {
      const Le = 40;
      const es = entry.s;
      const eS = entry.sideSign;
      lines.push(
        paintLine(es - Le, es, (s) => {
          const f = frameAt(wrapS(s));
          const t = Math.min(1, Math.max(0, wrapS(s - (es - Le)) / Le));
          return eS > 0 ? f.wl - (0.6 + 3.0 * t) : -f.wr + (0.6 + 3.0 * t);
        }),
      );
    }
    // muro dos boxes: lado do pit lane voltado para a pista, onde corre paralelo à reta
    const wallPts: [number, number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const ns = nearestS(p[0], p[2]);
      if (ns.d < 26 && wz[i] > 0.05) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        const lx = (b[2] - a[2]) / l;
        const lz = -(b[0] - a[0]) / l;
        const o = off(i) - side * (width(i) / 2 + 0.4);
        const x = p[0] + lx * o;
        const z = p[2] + lz * o;
        wallPts.push([x, Math.max(p[1], height.sample(x, z)) - 0.3, z]);
      }
    }
    const wall = wallPts.length > 2 ? polylineWall(wallPts, 0, 1.35, 3) : null;
    const fence = wallPts.length > 2 ? polylineWall(wallPts, 1.35, 4.2, 3, false) : null;
    const all = new THREE.Box3().setFromBufferAttribute(surface.getAttribute('position') as THREE.BufferAttribute);
    return { surface, exitSurface, lines: mergeGeometries(lines), wall, fence, box: all };
  }, [frame]);

  // registro para seleção/realce
  useMemo(() => {
    const geo = g.solids.clone();
    const box = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(groupMatrix);
    box.expandByScalar(6);
    registerSelectable(PIT_SEL, box, geo, groupMatrix);
    const tgeo = boxAt(23, 24, 21, g.towerX, 0, g.zF - 9);
    registerSelectable(TOWER_SEL, new THREE.Box3().setFromBufferAttribute(tgeo.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(groupMatrix), tgeo, groupMatrix);
    g.doors.forEach((m, i) => {
      const dg = new THREE.BoxGeometry(g.garageW - 0.6, g.H1 - 0.6, 1.2).applyMatrix4(m);
      const box2 = new THREE.Box3().setFromBufferAttribute(dg.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(groupMatrix);
      registerSelectable({ kind: 'garage', id: `g-${i + 1}` }, box2.expandByScalar(4), dg, groupMatrix);
    });
  }, [g, lane, groupMatrix]);

  const doorGeo = useMemo(() => new THREE.BoxGeometry(g.garageW - 0.6, g.H1 - 0.6, 0.25), [g]);
  const doorsRef = useMemo(() => {
    const mesh = new THREE.InstancedMesh(doorGeo, structMat(mode, 'shutter'), g.doors.length);
    g.doors.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }, [doorGeo, g, mode]);

  const click = onSelectEvent(PIT_SEL);
  const hover = onHoverEvent(PIT_SEL);
  const garageSel = (e: { instanceId?: number }) => ({ kind: 'garage', id: `g-${(e.instanceId ?? 0) + 1}` }) as Selection;

  if (!show) return null;
  return (
    <group>
      <group matrixAutoUpdate={false} matrix={groupMatrix}>
        <mesh geometry={g.solids} material={structMat(mode, 'white')} castShadow receiveShadow onClick={click} {...hover} />
        <mesh geometry={g.roof} material={structMat(mode, 'roof')} castShadow receiveShadow onClick={click} {...hover} />
        <mesh geometry={g.glass} material={structMat(mode, 'glass')} castShadow onClick={onSelectEvent(TOWER_SEL)} {...onHoverEvent(TOWER_SEL)} />
        <mesh geometry={g.dark} material={structMat(mode, 'interior')} />
        <mesh geometry={g.metal} material={structMat(mode, 'darkMetal')} castShadow />
        <primitive object={doorsRef} onClick={onSelectEvent((e) => garageSel(e))} {...onHoverEvent((e) => garageSel(e))} />
      </group>
      <mesh geometry={lane.surface} material={structMat(mode, 'pitAsphalt')} receiveShadow onClick={click} {...hover} />
      <mesh geometry={lane.exitSurface} material={structMat(mode, 'pitAsphalt')} receiveShadow onClick={click} {...hover} />
      <mesh geometry={lane.lines} material={structMat(mode, 'paint')} receiveShadow />
      {lane.wall && <mesh geometry={lane.wall} material={structMat(mode, 'concrete')} castShadow receiveShadow onClick={click} {...hover} />}
      {lane.fence && <mesh geometry={lane.fence} material={structMat(mode, 'fence')} />}
    </group>
  );
}

export function EdgeLines({ geo, color = '#6f6b64', opacity = 0.6 }: { geo: THREE.BufferGeometry; color?: string; opacity?: number }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 30), [geo]);
  return (
    <lineSegments geometry={edges}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK, TRACK_LENGTH, frameAt, nearestS, wrapS } from '../../data/circuit/track';
import { getWorld } from '../world/world';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { computeRunoffs, envelope, hash, runoffDepthAt } from '../track/geometry';
import { insideStand, standClearance } from './standLayout';
import { polylineWall } from './polylineStrip';
import { getAssets, instanceProto, modulesAlong, type AssetProto } from '../assets/assetLibrary';
import { insideArea } from '../terrain/plinth';
import { computePitFrame, pitExitProfile, pitLaneRange } from './PitComplex';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import {
  STACK,
  TYRE_R,
  barGeometry,
  barMatrix,
  fencePanelGeometry,
  fencePostGeometry,
  moduleMatrix,
  railPostGeometry,
  resample,
  tyreStackGeometry,
  wBeamGeometry,
  wallModuleGeometry,
  type P3,
  type Sample,
} from './barrierParts';

/**
 * guardrail      – defensa metálica dupla (miolo, trechos sem área de escape)
 * railFence      – guard-rail + tela alta (área de público entre as curvas 10 e 14 — FIA 2022)
 * tyreRail       – barreira de pneus com guard-rail atrás (fim das áreas de escape no miolo)
 * tyreFence      – barreira de pneus com tela alta atrás (áreas de público)
 * tyreWallFence  – pneus + barreira modular de concreto + tela (Curva 1 — FIA 2022)
 * wall           – muro de concreto (Laranjinha, lado interno das retas)
 * wallFence      – muro + tela alta (reta dos boxes, Reta Oposta)
 */
type BType = 'guardrail' | 'railFence' | 'tyreRail' | 'tyreFence' | 'tyreWallFence' | 'wall' | 'wallFence' | 'fence';

interface Run {
  type: BType;
  side: 1 | -1;
  pts: P3[];
  s0: number;
  s1: number;
}

/** Vão máximo (m) entre duas áreas de escape do mesmo lado ligado por guard-rail contínuo. */
const BRIDGE_GAP = 70;

/**
 * Barreiras ao longo da pista, posicionadas a partir das áreas de escape e no
 * padrão do modelo de referência: sempre barreira de pneus no fim das áreas de
 * escape, tela alta apenas onde há público, guard-rail separando a saída dos
 * boxes da pista. Tipos e afastamentos = estimativa (ver docs/METODOLOGIA.md).
 */
function computeRuns(): Run[] {
  const { height } = getWorld();
  const runoffs = computeRunoffs();
  const pr = pitLaneRange();
  const ex = pitExitProfile();
  const allPit = TRACK.pit.x.map((x, i) => [x, TRACK.pit.z[i]] as [number, number]);
  const pitPts = allPit.slice(pr.iStart, pr.iEnd + 1);
  const pb = {
    x0: Math.min(...TRACK.pit.x) - 40,
    x1: Math.max(...TRACK.pit.x) + 40,
    z0: Math.min(...TRACK.pit.z) - 40,
    z1: Math.max(...TRACK.pit.z) + 40,
  };
  const d2 = (list: [number, number][], x: number, z: number) => {
    if (x < pb.x0 || x > pb.x1 || z < pb.z0 || z > pb.z1) return Infinity;
    let d = Infinity;
    for (let i = 0; i < list.length; i += 2) d = Math.min(d, (list[i][0] - x) ** 2 + (list[i][1] - z) ** 2);
    return d;
  };
  // muro da reta não pode cruzar o pit lane, inclusive no trecho de entrada que corre sobre a borda
  const nearPit = (x: number, z: number) => d2(allPit, x, z) < 15 ** 2;
  // pares de áreas de escape do mesmo lado separadas por um vão curto (ex.: lado esquerdo entre T6 e T7)
  const bridges: {
    side: 1 | -1;
    s0: number;
    s1: number;
    o0: number;
    o1: number;
  }[] = [];
  for (const a of runoffs)
    for (const b of runoffs) {
      if (a === b || a.side !== b.side) continue;
      let gap = wrapS(b.s0 - a.s1);
      if (gap > TRACK_LENGTH / 2) gap -= TRACK_LENGTH; // com sinal: negativo = zonas sobrepostas
      // inclui zonas encostadas/sobrepostas (T6→T7): evita o "dente" no afastamento entre elas
      if (gap > -40 && gap < BRIDGE_GAP)
        bridges.push({
          side: a.side,
          s0: wrapS(a.s1 - 25),
          s1: wrapS(b.s0 + 25),
          o0: 0.3 + runoffDepthAt(a, a.s1) + 0.8,
          o1: 0.3 + runoffDepthAt(b, b.s0) + 0.8,
        });
    }
  const runs: Run[] = [];
  const step = 1.5;
  for (const side of [1, -1] as const) {
    // 1ª passada: tipo e afastamento desejados em cada ponto
    const plan: { s: number; off: number; type: BType; main: boolean; max: number }[] = [];
    for (let s = 0; s <= TRACK_LENGTH; s += step) {
      const f = frameAt(s);
      const w = side === 1 ? f.wl : f.wr;
      let off = 6;
      let type: BType = 'guardrail';
      let inRunoff = false;
      for (const z of runoffs) {
        if (z.side !== side) continue;
        const e = envelope(s, z.s0, z.s1, 25);
        if (e > 0) {
          off = Math.max(off, 0.3 + runoffDepthAt(z, s) * e + 0.8);
          if (e > 0.3) {
            type = z.barrier;
            inRunoff = true;
          }
        }
      }
      // ponte: piso de afastamento entre zonas vizinhas (sem a barreira voltar para perto da pista)
      for (const br of bridges) {
        if (br.side !== side) continue;
        const len = wrapS(br.s1 - br.s0);
        const d = wrapS(s - br.s0);
        if (d <= len) off = Math.max(off, br.o0 + (br.o1 - br.o0) * (d / len));
      }
      // tipologia por trecho (estimativa a partir de imagens aéreas, notas da FIA 2022 e do modelo de referência)
      const main = s > 3800 || s < 330;
      const oposta = s > 840 && s < 1380;
      const publicArea = s > 3150 && s <= 3800; // FIA 2022: nova área de público entre T10 e T14, com guard-rails e cercas
      if (main && !inRunoff) {
        // o escape da Curva 1 começa ainda na reta: ali a barreira de pneus tem prioridade
        off = side === 1 ? 4.5 : 3.2;
        type = side === 1 ? 'wall' : 'wallFence'; // arquibancadas do lado de fora da reta
      } else if (oposta && !inRunoff) {
        off = 5;
        type = side === -1 ? 'wallFence' : 'wall'; // Setor G (temporário) do lado externo
      } else if (publicArea && !inRunoff && side === -1) {
        type = 'railFence';
      }
      // saída dos boxes correndo ao lado da pista (Curva do Sol): guard-rail no meio do caminho
      if (!main) {
        for (let lat = w + 1; lat < w + off + 6; lat += 0.75) {
          const px = f.x + f.lx * side * lat;
          const pz = f.z + f.lz * side * lat;
          if (d2(pitPts, px, pz) < 4.2 ** 2) {
            off = Math.max(1.4, (lat - w) / 2);
            type = 'guardrail';
            break;
          }
        }
      }
      // saída dos boxes reconstruída: tela logo depois da borda externa da faixa
      {
        const ds = wrapS(s - ex.sX);
        if (side === ex.side && ds <= ex.sM + 4 - ex.sX) {
          off = Math.max(1.2, ex.outer(s) - w + 1.0);
          type = 'fence';
        }
      }
      // nunca dentro de uma arquibancada: a proteção (e a tela atrás dela) fica antes da frente
      const margin = type === 'tyreFence' || type === 'tyreWallFence' || type === 'tyreRail' ? 2.6 : type === 'railFence' ? 1.3 : 0.9;
      const clear = standClearance(s, side);
      if (off > clear - margin) off = Math.max(1.2, clear - margin);
      plan.push({ s, off, type, main, max: Math.max(1.2, clear - margin) });
    }
    // 2ª passada: suaviza os degraus de afastamento nas trocas de tipo (±7,5 m);
    // os platôs das áreas de escape ficam iguais
    const R = 5;
    const offs = plan.map((_, i) => {
      let a = 0;
      let n = 0;
      // a tela da saída dos boxes é uma estrutura à parte: não se mistura com os vizinhos
      const isF = plan[i].type === 'fence';
      for (let j = Math.max(0, i - R); j <= Math.min(plan.length - 1, i + R); j++) {
        if ((plan[j].type === 'fence') !== isF) continue;
        a += plan[j].off;
        n++;
      }
      return a / n;
    });
    let cur = null as Run | null;
    for (let i = 0; i < plan.length; i++) {
      const { s, type, main } = plan[i];
      const off = Math.min(offs[i], plan[i].max);
      const f = frameAt(s);
      const w = side === 1 ? f.wl : f.wr;
      const x = f.x + f.lx * side * (w + off);
      const z = f.z + f.lz * side * (w + off);
      const ns = nearestS(x, z);
      const valid = ns.d > w + off - 2.5 && !(side === 1 && main && nearPit(x, z));
      if (!valid) {
        if (cur && cur.pts.length > 2) runs.push(cur);
        cur = null;
        continue;
      }
      const y = Math.max(height.sample(x, z), f.y - 0.5) - 0.05;
      if (!cur || cur.type !== type) {
        if (cur && cur.pts.length > 1) runs.push(cur);
        // emenda com o trecho anterior (sem buraco na troca de tipo)
        const prev: P3 | undefined = cur && cur.type !== 'fence' && type !== 'fence' ? cur.pts[cur.pts.length - 1] : undefined;
        cur = { type, side, pts: prev ? [prev] : [], s0: s, s1: s };
      }
      cur.pts.push([x, y, z]);
      cur.s1 = s;
    }
    if (cur && cur.pts.length > 2) runs.push(cur);
  }
  return runs;
}

/** Média móvel (±4 pontos ≈ ±6 m) nas coordenadas horizontais; as pontas ficam fixas para emendar com os trechos vizinhos. */
function smoothRun(pts: P3[]): P3[] {
  const k = 4;
  return pts.map((p, i) => {
    const r = Math.min(k, i, pts.length - 1 - i);
    if (r === 0) return p;
    let x = 0;
    let z = 0;
    let y = 0;
    for (let j = i - r; j <= i + r; j++) {
      x += pts[j][0];
      y += pts[j][1];
      z += pts[j][2];
    }
    const n = 2 * r + 1;
    return [x / n, y / n, z / n] as P3;
  });
}

// ---------------------------------------------------------------------------
// materiais (compartilhados; a geometria é a mesma nos dois modos)
// ---------------------------------------------------------------------------
const matCache = new Map<string, THREE.Material>();
function tyreMaterial(mode: VisualMode) {
  const k = `tyre-${mode}`;
  if (!matCache.has(k)) {
    const base = structMat(mode, 'tyre') as THREE.MeshStandardMaterial;
    const m = base.clone();
    m.vertexColors = true;
    m.color.set('#ffffff');
    m.roughness = mode === 'sim' ? 0.92 : 0.8;
    m.flatShading = mode === 'game';
    m.onBeforeCompile = base.onBeforeCompile;
    m.customProgramCacheKey = () => `tyre-stack-${mode}`;
    matCache.set(k, m);
  }
  return matCache.get(k)!;
}
function doubleSided(mode: VisualMode, key: 'guardrail') {
  const k = `${key}-ds-${mode}`;
  if (!matCache.has(k)) {
    const base = structMat(mode, key) as THREE.MeshStandardMaterial;
    const m = base.clone();
    m.side = THREE.DoubleSide;
    m.flatShading = false;
    m.onBeforeCompile = base.onBeforeCompile;
    m.customProgramCacheKey = () => `${key}-ds-${mode}`;
    matCache.set(k, m);
  }
  return matCache.get(k)!;
}

// borracha usada: cinza-chumbo com pequenas variações (preto puro some na sombra)
const TYRE_COLORS = {
  game: ['#3b3f46', '#35393f', '#43474e', '#4c5058'],
  sim: ['#333436', '#2d2e30', '#38393c', '#414245'],
};

interface Built {
  tyres: { m: THREE.Matrix4; c: number; back: boolean }[];
  walls: Map<string, { h: number; t: number; list: { m: THREE.Matrix4; c: number }[] }>;
  beams: THREE.BufferGeometry[];
  railPosts: THREE.Matrix4[];
  panels: THREE.BufferGeometry[];
  fencePosts: Map<number, THREE.Matrix4[]>;
  bars: THREE.Matrix4[];
  assetRuns: { proto: AssetProto; pts: P3[] }[];
  osmWalls: THREE.BufferGeometry[];
}

const BEAMS = [0.48, 0.8];
const BEAM_LATERAL = 0.18;
const FENCE_TOP_MIN = 4.2;
const FENCE_ABOVE_BASE = 3.2;

function build(): Built {
  const { features, height } = getWorld();
  const runs = computeRuns();
  if (import.meta.env.DEV) {
    (window as unknown as { __i3dBarriers?: unknown }).__i3dBarriers = runs.map((r) => ({
      type: r.type,
      side: r.side,
      s0: Math.round(r.s0),
      s1: Math.round(r.s1),
      n: r.pts.length,
    }));
  }
  const out: Built = {
    tyres: [],
    walls: new Map(),
    beams: [],
    railPosts: [],
    panels: [],
    fencePosts: new Map(),
    bars: [],
    assetRuns: [],
    osmWalls: [],
  };
  const A = {
    wall: getAssets('wall'),
    fence: getAssets('fence'),
    tyre: getAssets('tyre'),
  };
  const pick = (list: AssetProto[], i: number) => list[i % list.length];
  const away = (smp: Sample[], d: number): Sample[] => smp.map((s) => ({ ...s, p: s.p.clone().addScaledVector(s.toTrack, -d) }));
  const tmpV = new THREE.Vector3();
  // assenta cada poste/módulo no terreno (nada flutuando nos aterros nem enterrado nos cortes)
  const grounded = (smp: Sample[]) => {
    for (const x of smp) x.p.y = height.sample(x.p.x, x.p.z) - 0.03;
    return smp;
  };

  const addTyres = (pts: P3[], side: 1 | -1, seed: number) => {
    const spacing = TYRE_R * 2 + 0.02;
    const front = resample(pts, spacing, side);
    for (let row = 0; row < 2; row++) {
      // fileira de trás: meio passo deslocada e 0,6 m mais para fora (empilhamento intercalado)
      const list = row === 0 ? front : away(front, 0.6);
      for (let i = row; i < list.length; i++) {
        const s = list[i];
        const p = row === 0 ? s.p.clone() : s.p.clone().lerp(list[i - 1].p, 0.5);
        const h1 = hash(seed * 31 + i * 7.3 + row * 101);
        const h2 = hash(seed * 17 + i * 3.1 + row * 53);
        p.x += (h1 - 0.5) * 0.04;
        p.z += (h2 - 0.5) * 0.04;
        const ns = nearestS(p.x, p.z);
        const f = frameAt(ns.s);
        if (ns.d < Math.max(f.wl, f.wr) + 0.6) continue; // nunca sobre a pista
        p.y = height.sample(p.x, p.z) - 0.04;
        const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(tmpV.set(0, 1, 0), h1 * Math.PI * 2), new THREE.Vector3(1, 0.97 + h2 * 0.06, 1));
        out.tyres.push({ m, c: Math.floor(hash(seed + i * 1.7 + row) * 4), back: row === 1 });
      }
    }
  };
  const addWall = (pts: P3[], side: 1 | -1, h: number, t: number, seed: number, shift = 0) => {
    let smp = resample(pts, 3, side);
    if (shift) smp = away(smp, shift);
    grounded(smp);
    const key = `${h}-${t}`;
    if (!out.walls.has(key)) out.walls.set(key, { h, t, list: [] });
    const list = out.walls.get(key)!.list;
    for (let i = 0; i < smp.length - 1; i++) {
      const a = smp[i].p;
      const b = smp[i + 1].p;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.2) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      const toTrack = smp[i].toTrack
        .clone()
        .add(smp[i + 1].toTrack)
        .normalize();
      const pitch = Math.atan2(b.y - a.y, len);
      // junta de 3 cm entre módulos
      list.push({
        m: moduleMatrix(mid, dir, toTrack, Math.max(0.1, len - 0.03), pitch),
        c: Math.floor(hash(seed * 13 + i * 2.9) * 3),
      });
    }
    return smp;
  };
  const addGuardrail = (pts: P3[], side: 1 | -1, shift = 0) => {
    let smp = resample(pts, 2, side);
    if (shift) smp = away(smp, shift);
    grounded(smp);
    const beam = wBeamGeometry(smp, BEAMS, BEAM_LATERAL);
    if (beam) out.beams.push(beam);
    for (const s of smp) out.railPosts.push(moduleMatrix(s.p, s.dir, s.toTrack));
  };
  const addFence = (pts: P3[], side: 1 | -1, base: number, shift: number) => {
    let smp = resample(pts, 3, side);
    if (shift) smp = away(smp, shift);
    grounded(smp);
    const top = Math.max(FENCE_TOP_MIN, base + FENCE_ABOVE_BASE);
    const panel = fencePanelGeometry(smp, () => base, top);
    if (panel) out.panels.push(panel);
    if (!out.fencePosts.has(top)) out.fencePosts.set(top, []);
    const posts = out.fencePosts.get(top)!;
    for (const s of smp) posts.push(moduleMatrix(s.p, s.dir, s.toTrack));
    // tubos: base, meio e topo
    for (let i = 0; i < smp.length - 1; i++) {
      for (const hh of [base + 0.05, (base + top) / 2, top]) {
        const a = smp[i].p.clone();
        const b = smp[i + 1].p.clone();
        a.y += hh;
        b.y += hh;
        out.bars.push(barMatrix(a, b));
      }
    }
    if (smp.length > 1) curFence = { first: smp[0], last: smp[smp.length - 1], base, top };
  };
  // emenda entre telas de trechos consecutivos (os afastamentos mudam na troca de tipo)
  let curFence: { first: Sample; last: Sample; base: number; top: number } | null = null;
  let prevFence: { first: Sample; last: Sample; base: number; top: number; side: 1 | -1; end: P3 } | null = null;
  const joinFences = (r: Run) => {
    if (curFence && prevFence && prevFence.side === r.side) {
      const e = prevFence.end;
      const s0 = r.pts[0];
      const contiguous = Math.hypot(e[0] - s0[0], e[2] - s0[2]) < 0.5;
      const A = prevFence.last;
      const B = curFence.first;
      const gap = A.p.distanceTo(B.p);
      if (contiguous && gap > 0.15 && gap < 6) {
        const base = Math.min(prevFence.base, curFence.base);
        const top = Math.max(prevFence.top, curFence.top);
        const panel = fencePanelGeometry([A, B], () => base, top);
        if (panel) out.panels.push(panel);
        for (const hh of [base + 0.05, (base + top) / 2, top]) out.bars.push(barMatrix(A.p.clone().setY(A.p.y + hh), B.p.clone().setY(B.p.y + hh)));
      }
    }
    prevFence = curFence ? { ...curFence, side: r.side, end: r.pts[r.pts.length - 1] } : null;
    curFence = null;
  };

  let idx = 0;
  let prevRun: Run | null = null;
  for (const raw of runs) {
    idx++;
    const r = { ...raw, pts: smoothRun(raw.pts) };
    if (idx > 1) joinFences(prevRun!);
    prevRun = r;
    const isTyre = r.type === 'tyreRail' || r.type === 'tyreFence' || r.type === 'tyreWallFence';
    if (isTyre) {
      if (A.tyre.length) out.assetRuns.push({ proto: pick(A.tyre, idx), pts: r.pts });
      else addTyres(r.pts, r.side, idx);
      // pneus ocupam até ~0,93 m para trás da linha; a proteção posterior fica logo atrás
      if (r.type === 'tyreRail') addGuardrail(r.pts, r.side, 1.2);
      else if (r.type === 'tyreFence') addFence(r.pts, r.side, 0, 1.05);
      else {
        addWall(r.pts, r.side, 1.15, 0.5, idx, 1.25);
        addFence(r.pts, r.side, 1.15, 1.25);
      }
      continue;
    }
    if (r.type === 'wallFence' && (A.fence.length || A.wall.length)) {
      out.assetRuns.push({
        proto: A.fence.length ? pick(A.fence, idx) : pick(A.wall, idx),
        pts: r.pts,
      });
      if (!A.fence.length) addFence(r.pts, r.side, 1.2, 0);
      continue;
    }
    if (r.type === 'wall' && A.wall.length) {
      out.assetRuns.push({ proto: pick(A.wall, idx), pts: r.pts });
      continue;
    }
    if (r.type === 'fence') addFence(r.pts, r.side, 0, 0);
    else if (r.type === 'guardrail') addGuardrail(r.pts, r.side);
    else if (r.type === 'railFence') {
      addGuardrail(r.pts, r.side);
      addFence(r.pts, r.side, 0, 0.45);
    } else if (r.type === 'wallFence') {
      addWall(r.pts, r.side, 1.2, 0.45, idx);
      addFence(r.pts, r.side, 1.2, 0);
    } else addWall(r.pts, r.side, 1.05, 0.45, idx);
  }
  if (prevRun) joinFences(prevRun);
  // saída dos boxes (trecho em polilinha, do fim das garagens ao fim da Curva do Sol):
  // tela do lado externo da faixa, separando-a do miolo
  {
    const pit = TRACK.pit;
    const pr = pitLaneRange();
    const fr = computePitFrame();
    const pts: P3[] = [];
    let laneSide: 1 | -1 = 1;
    for (let i = pr.iStart; i <= pr.iEnd; i++) {
      const px = pit.x[i];
      const pz = pit.z[i];
      // só depois do prédio dos boxes (lado da saída)
      const dx = px - fr.c.x;
      const dz = pz - fr.c.y;
      const along = dx * fr.along.x + dz * fr.along.y;
      const across = Math.abs(dx * fr.front.x + dz * fr.front.y) - fr.W / 2;
      if (Math.abs(along) < fr.L / 2 + 34 && across < 30) continue;
      if (i < pit.x.length / 2) continue; // trecho da entrada não
      const a = Math.max(pr.iStart, i - 2);
      const b = Math.min(pit.x.length - 1, i + 2);
      const l = Math.hypot(pit.x[b] - pit.x[a], pit.z[b] - pit.z[a]) || 1;
      const lx = (pit.z[b] - pit.z[a]) / l;
      const lz = -(pit.x[b] - pit.x[a]) / l;
      // lado oposto à pista
      const dl = nearestS(px + lx * 6, pz + lz * 6).d;
      const dr = nearestS(px - lx * 6, pz - lz * 6).d;
      const sg = dl > dr ? 1 : -1;
      laneSide = sg === 1 ? 1 : -1;
      const o = 3.5 + 1.0;
      const x = px + lx * sg * o;
      const z = pz + lz * sg * o;
      if (insideStand(x, z, 0.5)) continue;
      pts.push([x, height.sample(x, z) - 0.05, z]);
    }
    // laneSide = 1: a tela está à esquerda do sentido da polilinha, a faixa à direita
    if (pts.length > 3) addFence(smoothRun(pts), laneSide, 0, 0);
  }
  // Cercas do OSM (perímetro de terrenos) ficam de fora: cruzavam as telas da pista.
  // Muros do OSM só longe da pista.
  const lift = (pts: [number, number][]) => pts.map((p) => [p[0], height.sample(p[0], p[1]) - 0.1, p[1]] as P3);
  const keep = (pts: [number, number][]) => pts.every((p) => insideArea(p[0], p[1]) && nearestS(p[0], p[1]).d > 25);
  for (const w of features.lines.wall) if (keep(w)) out.osmWalls.push(polylineWall(lift(w), -0.3, 2.4, 3));
  return out;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: THREE.Color[], shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  m.count = mats.length;
  mats.forEach((mt, i) => m.setMatrixAt(i, mt));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

export function Barriers() {
  const mode = useAppStore((s) => s.mode);
  const show = useAppStore((s) => s.layers.barriers);
  const quality = useAppStore((s) => s.quality);

  const built = useMemo(() => {
    const t0 = performance.now();
    const b = build();
    if (import.meta.env.DEV)
      console.info(
        `[i3d] barreiras: ${b.tyres.length} pilhas de pneus, ${[...b.walls.values()].reduce((a, w) => a + w.list.length, 0)} módulos de muro, ${b.railPosts.length} postes de guard-rail, ${b.bars.length} tubos — ${(performance.now() - t0).toFixed(0)} ms`,
      );
    return b;
  }, []);

  const meshes = useMemo(() => {
    const out: { obj: THREE.Object3D; sel: string }[] = [];
    const shadows = quality !== 'low';
    // pneus
    // sem sombra projetada (rentes ao chão e são milhares); na qualidade baixa, só a fileira da frente
    const tyres = quality === 'low' ? built.tyres.filter((t) => !t.back) : built.tyres;
    if (tyres.length) {
      const pal = TYRE_COLORS[mode];
      const cols = tyres.map((t) => new THREE.Color(pal[t.c]));
      out.push({ obj: instanced(tyreStackGeometry(), tyreMaterial(mode), tyres.map((t) => t.m), cols, false), sel: 'tyre' });
    }
    // muros (módulos com pequenas variações de tom)
    for (const w of built.walls.values()) {
      const cols = w.list.map((x) => new THREE.Color(1, 1, 1).multiplyScalar([1, 0.95, 0.9][x.c]));
      out.push({
        obj: instanced(
          wallModuleGeometry(w.h, w.t),
          structMat(mode, 'concrete'),
          w.list.map((x) => x.m),
          cols,
          shadows,
        ),
        sel: 'wall',
      });
    }
    // guard-rails
    if (built.beams.length) {
      const g = mergeGeometries(built.beams);
      out.push({
        obj: Object.assign(new THREE.Mesh(g, doubleSided(mode, 'guardrail')), {
          castShadow: shadows,
          receiveShadow: true,
        }),
        sel: 'guardrail',
      });
    }
    if (built.railPosts.length)
      out.push({
        obj: instanced(railPostGeometry(BEAMS, BEAM_LATERAL), structMat(mode, 'darkMetal'), built.railPosts, undefined, false),
        sel: 'guardrail',
      });
    // alambrados
    if (built.panels.length)
      out.push({
        obj: new THREE.Mesh(mergeGeometries(built.panels), structMat(mode, 'fence')),
        sel: 'fence',
      });
    for (const [top, mats] of built.fencePosts)
      out.push({
        obj: instanced(fencePostGeometry(top), structMat(mode, 'darkMetal'), mats, undefined, shadows),
        sel: 'fence',
      });
    if (built.bars.length)
      out.push({
        obj: instanced(barGeometry(), structMat(mode, 'metal'), built.bars, undefined, false),
        sel: 'fence',
      });
    if (built.osmWalls.length)
      out.push({
        obj: new THREE.Mesh(mergeGeometries(built.osmWalls), structMat(mode, 'concrete')),
        sel: 'wall',
      });
    // módulos do pacote RCC Design, se importados
    if (built.assetRuns.length) {
      const { height } = getWorld();
      const byProto = new Map<AssetProto, THREE.Matrix4[]>();
      for (const ar of built.assetRuns) {
        const len = Math.max(ar.proto.size.x, ar.proto.size.z);
        const mats = modulesAlong(ar.pts, len, (x, z) => height.sample(x, z));
        const turn = ar.proto.size.z > ar.proto.size.x ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : null;
        if (!byProto.has(ar.proto)) byProto.set(ar.proto, []);
        for (const m of mats) byProto.get(ar.proto)!.push(turn ? m.multiply(turn) : m);
      }
      for (const [p, mats] of byProto) for (const m of instanceProto(p, mats, mode)) out.push({ obj: m, sel: 'wall' });
    }
    return out;
  }, [built, mode, quality]);

  if (!show) return null;
  const sel = (id: string) => ({ kind: 'barrier' as const, id });
  return (
    <group>
      {meshes.map((m, i) => (
        <primitive key={i} object={m.obj} onClick={onSelectEvent(sel(m.sel))} {...onHoverEvent(sel(m.sel))} />
      ))}
    </group>
  );
}

export const _stack = STACK;

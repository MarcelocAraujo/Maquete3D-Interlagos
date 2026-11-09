import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRANDSTANDS, type GrandstandInfo } from '../../data/facilities';
import { frameAt, nearestS, rangeLength } from '../../data/circuit/track';
import { getWorld, minAreaRect, type XZ } from '../world/world';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { patchSceneMaterial } from '../materials/patch';
import { styleOf } from '../modes/modeStyles';
import { registerSelectable } from '../selection/bounds';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import type { Selection } from '../../data/types';

interface StandSection {
  a: XZ; // início da frente (junto à pista)
  b: XZ; // fim da frente
  back: XZ; // vetor unitário para trás (afastando da pista)
  depth: number;
}

const ROW_D = 0.85;
const ROW_H = 0.42;

/** Seções retas de cada arquibancada (OSM: retângulo mínimo; demais: ao longo da pista). */
function sectionsOf(g: GrandstandInfo): StandSection[] {
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
  const corners = [...turn].sort((x, y) => y.d - x.d).slice(0, 4).map((t) => t.i).sort((x, y) => x - y);
  // as tampas são as arestas entre pares de cantos adjacentes
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

interface StandGeo {
  steps: THREE.BufferGeometry;
  structure: THREE.BufferGeometry;
  roof: THREE.BufferGeometry | null;
  stairs: THREE.BufferGeometry | null;
  seats: THREE.Matrix4[];
  box: THREE.Box3;
}

function buildStand(g: GrandstandInfo, secs: StandSection[]): StandGeo {
  const { height } = getWorld();
  const steps: THREE.BufferGeometry[] = [];
  const structure: THREE.BufferGeometry[] = [];
  const roof: THREE.BufferGeometry[] = [];
  const stairs: THREE.BufferGeometry[] = [];
  const seats: THREE.Matrix4[] = [];
  const box = new THREE.Box3();
  const tmp = new THREE.Matrix4();

  for (const sec of secs) {
    const L = Math.hypot(sec.b[0] - sec.a[0], sec.b[1] - sec.a[1]);
    if (L < 4) continue;
    const ux = (sec.b[0] - sec.a[0]) / L;
    const uz = (sec.b[1] - sec.a[1]) / L;
    // sistema local: X ao longo da frente, Z para trás, Y para cima
    let bx = sec.back[0];
    let bz = sec.back[1];
    // garante base ortonormal
    const dot = bx * ux + bz * uz;
    bx -= dot * ux;
    bz -= dot * uz;
    const bl = Math.hypot(bx, bz) || 1;
    bx /= bl;
    bz /= bl;
    const mid: XZ = [(sec.a[0] + sec.b[0]) / 2, (sec.a[1] + sec.b[1]) / 2];
    let groundFront = Infinity;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const x = sec.a[0] + (sec.b[0] - sec.a[0]) * t;
      const z = sec.a[1] + (sec.b[1] - sec.a[1]) * t;
      groundFront = Math.min(groundFront, height.sample(x, z));
    }
    const podium = g.temporary ? 1.6 : 2.6;
    const rows = Math.max(6, Math.floor((sec.depth - 3) / ROW_D));
    const D = rows * ROW_D + 2;
    const top = podium + rows * ROW_H;
    const local = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx, 0, bz));
    local.setPosition(sec.a[0], groundFront, sec.a[1]);
    const put = (geo: THREE.BufferGeometry) => geo.applyMatrix4(local);

    // pódio frontal (muro) + degraus
    const sGeo: THREE.BufferGeometry[] = [];
    sGeo.push(new THREE.BoxGeometry(L, podium + 3, 1.2).translate(L / 2, (podium + 3) / 2 - 3, 0.6));
    for (let r = 0; r < rows; r++) {
      const h = podium + (r + 1) * ROW_H;
      const z0 = 1.2 + r * ROW_D;
      if (g.temporary) sGeo.push(new THREE.BoxGeometry(L, 0.18, ROW_D).translate(L / 2, h - 0.09, z0 + ROW_D / 2));
      else sGeo.push(new THREE.BoxGeometry(L, h + 3, ROW_D).translate(L / 2, (h + 3) / 2 - 3, z0 + ROW_D / 2));
    }
    steps.push(put(mergeGeometries(sGeo)));

    // escadas (corredores) a cada ~24 m
    const aisles: number[] = [];
    for (let x = 12; x < L - 6; x += 24) aisles.push(x);
    if (!aisles.length && L > 6) aisles.push(L / 2);
    for (const ax of aisles) {
      for (let r = 0; r < rows; r++) {
        const h = podium + (r + 1) * ROW_H;
        stairs.push(put(new THREE.BoxGeometry(1.3, 0.22, ROW_D / 2).translate(ax, h - ROW_H / 2 + 0.01, 1.2 + r * ROW_D + ROW_D * 0.25)));
      }
    }

    // estrutura: pilares traseiros, vigas inclinadas e parede posterior
    const st: THREE.BufferGeometry[] = [];
    for (let x = 0; x <= L + 0.1; x += 8) {
      st.push(new THREE.BoxGeometry(0.45, top + 3, 0.45).translate(Math.min(L, x), (top + 3) / 2 - 3, D));
      if (g.temporary) {
        // estrutura tubular (andaime)
        for (let z = 2; z < D; z += 4) st.push(new THREE.BoxGeometry(0.12, podium + (z / ROW_D) * ROW_H + 3, 0.12).translate(Math.min(L, x), (podium + (z / ROW_D) * ROW_H) / 2 - 1.5, z));
      }
    }
    if (!g.temporary) st.push(new THREE.BoxGeometry(L, top + 3, 0.3).translate(L / 2, (top + 3) / 2 - 3, D + 0.3));
    else st.push(new THREE.BoxGeometry(L, 1.1, 0.08).translate(L / 2, top + 0.55, D));
    // guarda-corpo frontal
    st.push(new THREE.BoxGeometry(L, 1.0, 0.08).translate(L / 2, podium + 0.5, 0.05));
    structure.push(put(mergeGeometries(st)));

    // cobertura em balanço
    if (g.covered) {
      const rf: THREE.BufferGeometry[] = [];
      const roofH = top + 4.5;
      const span = D * 0.95;
      const slab = new THREE.BoxGeometry(L + 2, 0.35, span);
      slab.rotateX(-0.06);
      slab.translate(L / 2, roofH, D - span / 2 + 0.6);
      rf.push(slab);
      for (let x = 0; x <= L + 0.1; x += 8) {
        rf.push(new THREE.BoxGeometry(0.5, roofH - top + 0.2, 0.5).translate(Math.min(L, x), top + (roofH - top) / 2, D));
        const beam = new THREE.BoxGeometry(0.35, 0.8, span);
        beam.rotateX(-0.06);
        beam.translate(Math.min(L, x), roofH + 0.45, D - span / 2 + 0.6);
        rf.push(beam);
      }
      roof.push(put(mergeGeometries(rf)));
    }

    // assentos (um a cada 0,5 m, fora dos corredores)
    for (let r = 0; r < rows; r++) {
      const h = podium + (r + 1) * ROW_H;
      const z = 1.2 + r * ROW_D + 0.42;
      for (let x = 0.5; x < L - 0.3; x += 0.52) {
        if (aisles.some((ax) => Math.abs(ax - x) < 0.9)) continue;
        tmp.makeTranslation(x, h, z);
        seats.push(local.clone().multiply(tmp));
      }
    }
    // caixa
    for (const c of [new THREE.Vector3(0, -2, 0), new THREE.Vector3(L, top + 6, D + 1)]) box.expandByPoint(c.applyMatrix4(local));
    box.expandByPoint(new THREE.Vector3(0, top + 6, 0).applyMatrix4(local));
    box.expandByPoint(new THREE.Vector3(L, -2, D).applyMatrix4(local));
    void mid;
  }
  return {
    steps: mergeGeometries(steps),
    structure: mergeGeometries(structure),
    roof: roof.length ? mergeGeometries(roof) : null,
    stairs: stairs.length ? mergeGeometries(stairs) : null,
    seats,
    box,
  };
}

/** Assento simples (assento + encosto) com poucos triângulos. */
function seatGeometry() {
  const seat = new THREE.BoxGeometry(0.44, 0.08, 0.38).translate(0, 0.36, 0);
  const backrest = new THREE.BoxGeometry(0.44, 0.38, 0.06).translate(0, 0.58, 0.18);
  const g = mergeGeometries([seat, backrest]);
  return g;
}

const seatMats = new Map<string, THREE.Material>();
function seatMaterial(mode: VisualMode) {
  if (!seatMats.has(mode)) seatMats.set(mode, patchSceneMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 'seat'));
  return seatMats.get(mode)!;
}

function Stand({ g, mode, quality }: { g: GrandstandInfo; mode: VisualMode; quality: string }) {
  const geo = useMemo(() => buildStand(g, sectionsOf(g)), [g]);
  const sel: Selection = { kind: 'grandstand', id: g.id };
  useMemo(() => registerSelectable(sel, geo.box, geo.steps), [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  const seats = useMemo(() => {
    if (quality === 'low' || !geo.seats.length) return null;
    const step = quality === 'medium' ? 2 : 1;
    const count = Math.ceil(geo.seats.length / step);
    const mesh = new THREE.InstancedMesh(seatGeometry(), seatMaterial(mode), count);
    const brasil = styleOf(mode).seats === 'brasil';
    const base = new THREE.Color(g.seatColor);
    const green = new THREE.Color('#1f9a4a');
    const yellow = new THREE.Color('#f6c81e');
    const c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < geo.seats.length; i += step) {
      mesh.setMatrixAt(k, geo.seats[i]);
      if (brasil) {
        // GAME MODE: fileiras alternando verde e amarelo (linguagem da referência)
        const row = Math.floor(geo.seats[i].elements[13] / 0.42 + 0.5);
        c.copy(Math.floor(row / 2) % 2 ? yellow : green);
      } else {
        const v = 0.88 + (((i * 2654435761) % 1000) / 1000) * 0.2;
        c.copy(base).multiplyScalar(v);
      }
      mesh.setColorAt(k, c);
      k++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.computeBoundingSphere();
    return mesh;
  }, [geo, mode, quality, g.seatColor]);

  const click = onSelectEvent(sel);
  const hover = onHoverEvent(sel);
  return (
    <group>
      <mesh geometry={geo.steps} material={structMat(mode, g.temporary ? 'darkMetal' : 'seatBase')} castShadow receiveShadow onClick={click} {...hover} />
      <mesh geometry={geo.structure} material={structMat(mode, g.temporary ? 'metal' : 'concrete')} castShadow receiveShadow onClick={click} {...hover} />
      {geo.stairs && <mesh geometry={geo.stairs} material={structMat(mode, 'white')} receiveShadow />}
      {geo.roof && <mesh geometry={geo.roof} material={structMat(mode, 'roof')} castShadow receiveShadow onClick={click} {...hover} />}
      {seats && <primitive object={seats} onClick={click} {...hover} />}
    </group>
  );
}

export function Grandstands() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const show = useAppStore((s) => s.layers.grandstands);
  if (!show) return null;
  return (
    <group>
      {GRANDSTANDS.map((g) => (
        <Stand key={g.id} g={g} mode={mode} quality={quality} />
      ))}
    </group>
  );
}

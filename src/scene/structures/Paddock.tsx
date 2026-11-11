import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getWorld, minAreaRect, pointInPoly, polyArea, polyBounds, polyCentroid, rng, type XZ } from '../world/world';
import { TRACK, nearestS } from '../../data/circuit/track';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { patchSceneMaterial } from '../materials/patch';
import { styleOf } from '../modes/modeStyles';
import { computePitFrame } from './PitComplex';
import { insideStand } from './standLayout';
import { insideArea } from '../terrain/plinth';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import { registerSelectable } from '../selection/bounds';
import { getAssets, instanceProto } from '../assets/assetLibrary';
import type { Selection } from '../../data/types';

/**
 * Paddock em funcionamento (ilustrativo): transportadores e motorhomes das
 * equipes em fileiras atrás do prédio dos boxes, tendas e contêineres de
 * serviço, vans de apoio e carros nas vagas dos estacionamentos do OSM.
 * Tudo em InstancedMesh (uma malha por tipo de veículo).
 */
const SEL: Selection = { kind: 'structure', id: 'paddock-veiculos' };

type Kind = 'truck' | 'motorhome' | 'van' | 'car' | 'tent' | 'container' | 'shrub';
const SHRUB_COLORS = ['#4f8f3a', '#5d9c3f', '#467f33', '#6aa847'];
interface Item {
  kind: Kind;
  x: number;
  z: number;
  rot: number;
  color: THREE.Color;
}

/** Caixa com cor por vértice (as partes escuras não são tingidas pela cor da equipe). */
function cbox(w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y + h / 2, z);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function wheels(len: number, w: number, axles: number[], r = 0.5) {
  const parts: THREE.BufferGeometry[] = [];
  for (const ax of axles)
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(r, r, 0.35, 10).toNonIndexed();
      g.rotateX(Math.PI / 2);
      g.translate(ax - len / 2, r, side * (w / 2 - 0.1));
      g.deleteAttribute('uv');
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.06), 3));
      parts.push(g);
    }
  return parts;
}

/** Geometrias por tipo; eixo X = comprimento. */
function vehicleGeometry(kind: Kind): THREE.BufferGeometry {
  const W = '#ffffff';
  const DARK = '#1c1e22';
  const GLASS = '#26313d';
  switch (kind) {
    case 'truck': {
      // cavalo + semirreboque (transportador de equipe ~16,5 m)
      const L = 16.5;
      return mergeGeometries([
        cbox(13.6, 3.0, 2.55, -1.3, 1.1, 0, W),
        cbox(13.6, 0.35, 2.4, -1.3, 0.75, 0, DARK),
        cbox(2.4, 2.5, 2.45, 6.9, 0.9, 0, W),
        cbox(0.08, 1.0, 2.2, 8.12, 2.1, 0, GLASS),
        cbox(2.6, 0.5, 2.4, 6.9, 0.5, 0, DARK),
        ...wheels(L, 2.5, [1.5, 2.8, 4.1, 14.2, 15.6]),
      ]);
    }
    case 'motorhome': {
      return mergeGeometries([
        cbox(12, 3.2, 2.55, 0, 0.7, 0, W),
        cbox(11.6, 0.9, 2.6, 0, 2.2, 0, GLASS),
        cbox(12, 0.4, 2.4, 0, 0.35, 0, DARK),
        ...wheels(12, 2.5, [2, 3.2, 10]),
      ]);
    }
    case 'van':
      return mergeGeometries([cbox(5.4, 1.9, 2.0, 0, 0.5, 0, W), cbox(0.06, 0.8, 1.8, 2.71, 1.3, 0, GLASS), cbox(1.2, 0.8, 1.84, 2.0, 1.25, 0, GLASS), ...wheels(5.4, 2.0, [1, 4.4], 0.38)]);
    case 'car':
      return mergeGeometries([cbox(4.5, 0.75, 1.8, 0, 0.35, 0, W), cbox(2.4, 0.55, 1.65, -0.2, 1.1, 0, GLASS), ...wheels(4.5, 1.8, [0.9, 3.6], 0.33)]);
    case 'tent': {
      // tenda piramidal 6 x 6 m sobre pés
      const roof = new THREE.ConeGeometry(4.25, 1.6, 4, 1).toNonIndexed();
      roof.rotateY(Math.PI / 4);
      roof.translate(0, 3.3, 0);
      roof.deleteAttribute('uv');
      const n = roof.getAttribute('position').count;
      roof.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const legs = [-2.9, 2.9].flatMap((x) => [-2.9, 2.9].map((z) => cbox(0.1, 2.5, 0.1, x, 0, z, '#9aa0a6')));
      return mergeGeometries([roof, ...legs, cbox(6, 2.4, 0.05, 0, 0.1, -2.95, W)]);
    }
    case 'container':
      return mergeGeometries([cbox(6.06, 2.59, 2.44, 0, 0, 0, W), cbox(6.1, 0.12, 2.5, 0, 2.59, 0, DARK)]);
    case 'shrub': {
      // touceira de arbustos (três volumes facetados), tingida pela cor da instância
      const blob = (r: number, x: number, z: number, y: number) => {
        const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
        g.scale(1, 0.75, 1);
        g.translate(x, y, z);
        g.deleteAttribute('uv');
        const n = g.getAttribute('position').count;
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        return g;
      };
      return mergeGeometries([blob(1.2, 0, 0, 0.8), blob(0.9, 1.1, 0.4, 0.6), blob(0.8, -0.9, -0.5, 0.55)]);
    }
  }
}

// cores neutras de "equipes" (ilustrativas, sem marcas)
const TEAM_COLORS = ['#e8e9eb', '#1e2b48', '#b5121b', '#e8762b', '#0b6e63', '#1f6fd1', '#2f3a46', '#c9cdd2', '#5b2a86', '#0e8a4f', '#f2c400'];
const CAR_COLORS = ['#e9eaec', '#c7c9cc', '#2b2e33', '#7c8288', '#8b1d1d', '#1f3a6b', '#d8d2c4', '#4a4f55'];

function layout(): Item[] {
  const { features } = getWorld();
  const fr = computePitFrame();
  const r = rng(2026);
  const items: Item[] = [];
  const complexBuildings = features.buildings.filter((b) => pointInPoly(b.poly[0][0], b.poly[0][1], features.complex));
  const blocked = (x: number, z: number, clear = 4) => {
    if (!insideArea(x, z)) return true;
    if (nearestS(x, z).d < 28) return true; // longe da pista
    if (insideStand(x, z, clear)) return true; // nada dentro das arquibancadas
    for (const b of complexBuildings) {
      const bb = polyBounds(b.poly);
      if (x > bb.minX - clear && x < bb.maxX + clear && z > bb.minZ - clear && z < bb.maxZ + clear && pointInPoly(x, z, b.poly)) return true;
      if (x > bb.minX - clear && x < bb.maxX + clear && z > bb.minZ - clear && z < bb.maxZ + clear) {
        // margem ao redor das edificações
        if (pointInPoly(x + clear, z, b.poly) || pointInPoly(x - clear, z, b.poly) || pointInPoly(x, z + clear, b.poly) || pointInPoly(x, z - clear, b.poly)) return true;
      }
    }
    // não invadir o pit lane
    const px = TRACK.pit.x;
    const pz = TRACK.pit.z;
    for (let i = 0; i < px.length; i += 3) if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 < 15 ** 2) return true;
    return false;
  };
  const rotAlong = Math.atan2(-fr.along.y, fr.along.x);
  const at = (t: number, back: number): XZ => [fr.c.x + fr.along.x * t - fr.front.x * back, fr.c.y + fr.along.y * t - fr.front.y * back];
  // fileiras do paddock atrás dos boxes: transportadores (bem alinhados, de frente para o prédio),
  // motorhomes/hospitalidade e uma fileira de tendas de serviço
  const rows: { kind: Kind; back: number; pitch: number }[] = [
    { kind: 'truck', back: fr.W / 2 + 12, pitch: 3.6 },
    { kind: 'motorhome', back: fr.W / 2 + 26, pitch: 4.2 },
    { kind: 'tent', back: fr.W / 2 + 36, pitch: 7.5 },
  ];
  for (const row of rows) {
    const n = Math.floor((fr.L - 20) / row.pitch);
    for (let i = 0; i < n; i++) {
      const t = -fr.L / 2 + 10 + i * row.pitch;
      const [x, z] = at(t, row.back);
      if (blocked(x, z, row.kind === 'tent' ? 4 : 3)) continue;
      const team = Math.floor(i / (row.kind === 'truck' ? 2 : 1)) % TEAM_COLORS.length;
      // transportadores perpendiculares ao prédio (traseira voltada para os boxes)
      const rot = row.kind === 'truck' ? rotAlong + Math.PI / 2 : rotAlong;
      items.push({ kind: row.kind, x, z, rot, color: new THREE.Color(row.kind === 'tent' ? '#f4f4f2' : TEAM_COLORS[team]) });
    }
  }
  // contêineres e vans de apoio nas pontas do paddock
  for (let i = 0; i < 14; i++) {
    const t = i < 7 ? -fr.L / 2 - 12 : fr.L / 2 + 12;
    const [x, z] = at(t, fr.W / 2 + 10 + (i % 7) * 4.5);
    if (!blocked(x, z)) items.push({ kind: i % 2 ? 'container' : 'van', x, z, rot: rotAlong, color: new THREE.Color(i % 2 ? '#8a9198' : '#e9eaec') });
  }
  // Pátios asfaltados do miolo (OSM area=paved, os dois maiores): em fim de semana de
  // corrida viram área de apoio — fileiras de motorhomes, caminhões, vans e tendas com
  // corredores, no padrão do modelo de referência. Disposição ilustrativa.
  const lots = features.landuse
    .filter((l) => l.k === 'paved' && Math.abs(polyArea(l.poly)) > 20000 && pointInPoly(...polyCentroid(l.poly), features.complex))
    .sort((a, b) => Math.abs(polyArea(b.poly)) - Math.abs(polyArea(a.poly)))
    .slice(0, 2);
  const inLot = (x: number, z: number, poly: XZ[], inset: number) =>
    pointInPoly(x, z, poly) && pointInPoly(x + inset, z, poly) && pointInPoly(x - inset, z, poly) && pointInPoly(x, z + inset, poly) && pointInPoly(x, z - inset, poly);
  for (const lot of lots) {
    const rect = minAreaRect(lot.poly);
    const ca = Math.cos(rect.angle);
    const sa = Math.sin(rect.angle);
    const toXZ = (u: number, v: number): XZ => [rect.center[0] + u * ca - v * sa, rect.center[1] + u * sa + v * ca];
    const rot = -rect.angle; // eixo X local (comprimento do veículo) ao longo de u
    // blocos: fileira dupla de veículos (frente a frente) + corredor de 12 m
    const blockW = 42;
    let row = 0;
    for (let v = -rect.width / 2 + 10; v < rect.width / 2 - 8; v += blockW, row++) {
      const kindA: Kind = row % 3 === 2 ? 'tent' : 'motorhome';
      const kindB: Kind = row % 2 ? 'truck' : 'motorhome';
      for (const [dv, kind] of [[0, kindA], [9, kindB]] as [number, Kind][]) {
        const pitch = kind === 'tent' ? 7.5 : kind === 'truck' ? 3.8 : 4.4;
        // veículos perpendiculares ao corredor
        for (let u = -rect.length / 2 + 8; u < rect.length / 2 - 8; u += pitch) {
          const [x, z] = toXZ(u, v + dv);
          if (!inLot(x, z, lot.poly, kind === 'truck' ? 9 : 7) || blocked(x, z, 3) || r() < 0.32) continue;
          const team = Math.floor((u + rect.length) / 26 + row * 3) % TEAM_COLORS.length;
          // cores como no modelo de referência: maioria branca, parte amarela, poucas cores de equipe
          const pc = r();
          const col = kind === 'tent' ? '#f4f4f2' : pc < 0.55 ? '#f1f1ef' : pc < 0.75 ? '#f2c400' : TEAM_COLORS[team];
          items.push({ kind, x, z, rot: kind === 'tent' ? rot : rot + Math.PI / 2, color: new THREE.Color(col) });
        }
      }
      // vans de apoio no corredor, de vez em quando
      for (let u = -rect.length / 2 + 14; u < rect.length / 2 - 14; u += 23) {
        const [x, z] = toXZ(u, v + 22);
        if (r() < 0.45 && inLot(x, z, lot.poly, 5) && !blocked(x, z, 2)) items.push({ kind: 'van', x, z, rot, color: new THREE.Color(r() < 0.5 ? '#e9eaec' : '#c7c9cc') });
      }
    }
    // arbustos e canteiros nas bordas do pátio (quebram o asfalto vazio)
    const poly = lot.poly;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 4; t < len - 4; t += 6 + r() * 5) {
        const k = t / len;
        // um pouco para dentro do pátio
        const cx = rect.center[0] - (a[0] + (b[0] - a[0]) * k);
        const cz = rect.center[1] - (a[1] + (b[1] - a[1]) * k);
        const cl = Math.hypot(cx, cz) || 1;
        const x = a[0] + (b[0] - a[0]) * k + (cx / cl) * 2.5;
        const z = a[1] + (b[1] - a[1]) * k + (cz / cl) * 2.5;
        if (!pointInPoly(x, z, poly) || blocked(x, z, 1)) continue;
        items.push({ kind: 'shrub', x, z, rot: r() * Math.PI * 2, color: new THREE.Color(SHRUB_COLORS[Math.floor(r() * SHRUB_COLORS.length)]).multiplyScalar(0.85 + r() * 0.3) });
      }
    }
  }
  // estacionamentos do OSM: vagas de 2,6 x 5,5 m, ocupação ~65%
  let cars = 0;
  for (const l of features.landuse) {
    if (l.k !== 'parking') continue;
    const bb = polyBounds(l.poly);
    for (let x = bb.minX + 3; x < bb.maxX - 3 && cars < 700; x += 2.7)
      for (let z = bb.minZ + 4; z < bb.maxZ - 4 && cars < 700; z += 7.5) {
        if (!pointInPoly(x, z, l.poly) || r() > 0.65 || blocked(x, z, 1)) continue;
        items.push({ kind: 'car', x, z, rot: Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI), color: new THREE.Color(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]) });
        cars++;
      }
  }
  return items;
}

const matCache = new Map<string, THREE.Material>();
function vehicleMaterial(mode: VisualMode) {
  if (!matCache.has(mode)) matCache.set(mode, patchSceneMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: mode === 'sim' ? 0.45 : 0.7, metalness: mode === 'sim' ? 0.35 : 0, flatShading: styleOf(mode).flat }), 'vehicle'));
  return matCache.get(mode)!;
}

function shrubMaterial(mode: VisualMode) {
  const k = 'shrub-' + mode;
  if (!matCache.has(k)) matCache.set(k, patchSceneMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }), 'shrub'));
  return matCache.get(k)!;
}

export function Paddock() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const show = useAppStore((s) => s.layers.buildings);

  const meshes = useMemo(() => {
    const { height } = getWorld();
    const items = layout().filter((it) => quality !== 'low' || it.kind !== 'car');
    const groups = new Map<Kind, Item[]>();
    for (const it of items) {
      if (!groups.has(it.kind)) groups.set(it.kind, []);
      groups.get(it.kind)!.push(it);
    }
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const box = new THREE.Box3();
    // motorhomes e tendas do pacote RCC Design (se importados) substituem os procedurais
    const assetFor: Partial<Record<Kind, ReturnType<typeof getAssets>>> = { motorhome: getAssets('motorhome'), tent: getAssets('tent') };
    for (const [kind, list] of groups) {
      const protos = assetFor[kind];
      if (protos && protos.length) {
        const byP = new Map<number, THREE.Matrix4[]>();
        list.forEach((it, i) => {
          const pi = i % protos.length;
          const p = protos[pi];
          const extra = p.size.z > p.size.x ? Math.PI / 2 : 0;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot + extra);
          if (!byP.has(pi)) byP.set(pi, []);
          byP.get(pi)!.push(new THREE.Matrix4().compose(new THREE.Vector3(it.x, height.sample(it.x, it.z) - 0.05, it.z), q, new THREE.Vector3(1, 1, 1)));
          box.expandByPoint(new THREE.Vector3(it.x, height.sample(it.x, it.z) + 4, it.z));
        });
        for (const [pi, mats] of byP) out.push(...instanceProto(protos[pi], mats, mode, { shadows: quality !== 'low' }));
        continue;
      }
      const mesh = new THREE.InstancedMesh(vehicleGeometry(kind), kind === 'shrub' ? shrubMaterial(mode) : vehicleMaterial(mode), list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
        m.compose(new THREE.Vector3(it.x, height.sample(it.x, it.z) - 0.05, it.z), q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, it.color);
        if (kind !== 'car' && kind !== 'shrub') box.expandByPoint(new THREE.Vector3(it.x, height.sample(it.x, it.z) + 4, it.z));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = quality !== 'low';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    if (!box.isEmpty()) registerSelectable(SEL, box.expandByScalar(6));
    if (import.meta.env.DEV) console.info(`[i3d] paddock: ${items.length} veículos/estruturas`);
    return out;
  }, [mode, quality]);

  if (!show) return null;
  return (
    <group>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} onClick={onSelectEvent(SEL)} {...onHoverEvent(SEL)} />
      ))}
    </group>
  );
}

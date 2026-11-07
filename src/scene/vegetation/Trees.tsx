import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getWorld, pointInPoly, polyBounds, rng, type XZ } from '../world/world';
import { useAppStore, type Quality, type VisualMode } from '../../store/useAppStore';
import { occupied } from './occupancy';
import { patchSceneMaterial } from '../materials/patch';
import { insideArea } from '../terrain/plinth';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import type { Selection } from '../../data/types';

export type Species = 'folhosa' | 'copa-larga' | 'eucalipto' | 'conifera' | 'palmeira' | 'arbusto';
export const SPECIES_LABEL: Record<Species, string> = {
  folhosa: 'Árvore folhosa (copa arredondada)',
  'copa-larga': 'Árvore de copa larga',
  eucalipto: 'Árvore alta (tipo eucalipto)',
  conifera: 'Conífera (tipo pinheiro)',
  palmeira: 'Palmeira',
  arbusto: 'Arbusto',
};

interface TreeInstance {
  x: number;
  z: number;
  s: number; // escala
  r: number; // rotação
  sp: Species;
  src: 'osm-tree' | 'osm-row' | 'osm-area' | 'street';
}

function colorize(g: THREE.BufferGeometry, c: string) {
  const col = new THREE.Color(c);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function lumpy(geo: THREE.BufferGeometry, seed: number, amt: number) {
  const r = rng(seed);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const map = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 1 + (r() - 0.5) * amt);
    const f = map.get(key)!;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Geometrias procedurais por espécie (altura ~1 = escala base). */
function speciesGeometry(sp: Species, mode: VisualMode, detail: number): THREE.BufferGeometry {
  const game = mode === 'sim';
  const trunkC = game ? '#5b4636' : '#3d3a30';
  const leaf = (c: string) => (game ? c : '#2f5129');
  const parts: THREE.BufferGeometry[] = [];
  const trunk = (h: number, r: number) => colorize(new THREE.CylinderGeometry(r * 0.7, r, h, 6, 1).translate(0, h / 2, 0), trunkC);
  const blob = (r: number, x: number, y: number, z: number, c: string, sx = 1, sy = 1, seed = 1) =>
    colorize(lumpy(new THREE.IcosahedronGeometry(r, detail), seed, game ? 0.35 : 0.05).scale(sx, sy, sx).translate(x, y, z), leaf(c));
  switch (sp) {
    case 'folhosa':
      parts.push(trunk(3.2, 0.28), blob(2.6, 0, 5.2, 0, '#4f7a32', 1, 0.85, 3), blob(1.9, 1.3, 4.6, 0.6, '#5a8638', 1, 0.9, 5), blob(1.8, -1.1, 4.8, -0.8, '#466e2c', 1, 0.9, 7));
      break;
    case 'copa-larga':
      parts.push(trunk(3.6, 0.35), blob(3.6, 0, 6.0, 0, '#5d7f35', 1.25, 0.55, 11), blob(2.4, 2.4, 5.6, 1.0, '#678a3c', 1, 0.6, 13), blob(2.2, -2.2, 5.8, -1.2, '#557732', 1, 0.6, 17));
      break;
    case 'eucalipto':
      parts.push(trunk(9, 0.3), blob(2.2, 0, 10.5, 0, '#6b8a55', 0.9, 1.5, 19), blob(1.6, 0.6, 13.2, 0.3, '#728f5b', 0.9, 1.3, 23));
      break;
    case 'conifera':
      parts.push(trunk(2.5, 0.25));
      for (let i = 0; i < 4; i++) parts.push(colorize(new THREE.ConeGeometry(2.6 - i * 0.55, 3.2, 7, 1).translate(0, 3.2 + i * 1.9, 0), leaf(game ? '#2f5228' : '#bcd2a3')));
      break;
    case 'palmeira': {
      parts.push(colorize(new THREE.CylinderGeometry(0.2, 0.28, 8, 6).translate(0, 4, 0), game ? '#7a6a55' : '#efeee9'));
      for (let i = 0; i < 7; i++) {
        const f = new THREE.BoxGeometry(3.6, 0.06, 0.7).translate(1.8, 0, 0);
        f.rotateZ(-0.45);
        f.rotateY((i / 7) * Math.PI * 2);
        f.translate(0, 8, 0);
        parts.push(colorize(f, leaf('#4c7a34')));
      }
      break;
    }
    case 'arbusto':
      parts.push(blob(1.1, 0, 0.8, 0, '#4e6e30', 1.2, 0.7, 29), blob(0.8, 0.8, 0.6, 0.3, '#5a7a36', 1, 0.8, 31));
      break;
  }
  // padroniza atributos (BoxGeometry/Cylinder têm uv; Icosahedron também)
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(clean);
}

function chooseSpecies(r: () => number, ctx: 'forest' | 'park' | 'street' | 'scrub' | 'osm'): Species {
  const v = r();
  if (ctx === 'scrub') return v < 0.6 ? 'arbusto' : 'folhosa';
  if (ctx === 'street') return v < 0.55 ? 'folhosa' : v < 0.85 ? 'copa-larga' : 'palmeira';
  if (ctx === 'forest') return v < 0.45 ? 'folhosa' : v < 0.65 ? 'eucalipto' : v < 0.8 ? 'copa-larga' : v < 0.9 ? 'conifera' : 'arbusto';
  if (ctx === 'osm') return v < 0.5 ? 'folhosa' : v < 0.7 ? 'copa-larga' : v < 0.82 ? 'palmeira' : v < 0.92 ? 'conifera' : 'eucalipto';
  return v < 0.5 ? 'folhosa' : v < 0.75 ? 'copa-larga' : v < 0.88 ? 'conifera' : 'palmeira';
}

export function computeTrees(quality: Quality, mode: VisualMode): TreeInstance[] {
  const { features } = getWorld();
  const r = rng(1234);
  const out: TreeInstance[] = [];
  const dens = quality === 'high' ? 1 : quality === 'medium' ? 0.6 : 0.3;
  const keep = (x: number, z: number) => insideArea(x, z);
  const push = (x: number, z: number, ctx: Parameters<typeof chooseSpecies>[1], src: TreeInstance['src'], force = false) => {
    if (!keep(x, z)) return;
    if (!force && occupied(x, z)) return;
    out.push({ x, z, s: 0.75 + r() * 0.6, r: r() * Math.PI * 2, sp: chooseSpecies(r, ctx), src });
  };
  for (const t of features.points.tree) push(t[0], t[1], 'osm', 'osm-tree', true);
  for (const row of features.lines.treeRow) {
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 0; d < L; d += 8 / Math.sqrt(dens)) push(a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L, 'osm', 'osm-row');
    }
  }
  const scatter = (poly: XZ[], spacing: number, ctx: Parameters<typeof chooseSpecies>[1]) => {
    const bb = polyBounds(poly);
    const sp = spacing / Math.sqrt(dens);
    for (let x = bb.minX; x < bb.maxX; x += sp)
      for (let z = bb.minZ; z < bb.maxZ; z += sp) {
        const jx = x + (r() - 0.5) * sp * 0.9;
        const jz = z + (r() - 0.5) * sp * 0.9;
        if (pointInPoly(jx, jz, poly)) push(jx, jz, ctx, 'osm-area');
      }
  };
  for (const l of features.landuse) {
    if (l.k === 'forest') scatter(l.poly, 7.5, 'forest');
    else if (l.k === 'scrub') scatter(l.poly, 11, 'scrub');
    else if (l.k === 'wetland') scatter(l.poly, 14, 'scrub');
    else if (l.k === 'park' && l.area > 400) scatter(l.poly, 18, 'park');
  }
  // arborização viária (estimativa visual — apenas no GAME MODE)
  if (false as boolean) {
    for (const rd of features.roads) {
      if (!['residential', 'tertiary', 'secondary', 'primary'].includes(rd.k)) continue;
      for (let i = 0; i < rd.p.length - 1; i++) {
        const a = rd.p[i];
        const b = rd.p[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1) continue;
        const nx = (b[1] - a[1]) / L;
        const nz = -(b[0] - a[0]) / L;
        for (let d = 6; d < L; d += 14 / dens) {
          if (r() > 0.42) continue;
          const side = r() < 0.5 ? 1 : -1;
          const off = rd.w / 2 + 1.6;
          const x = a[0] + ((b[0] - a[0]) * d) / L + nx * off * side;
          const z = a[1] + ((b[1] - a[1]) * d) / L + nz * off * side;
          if (!keep(x, z)) continue;
          // calçada: aceita se não houver prédio exatamente ali
          out.push({ x, z, s: 0.55 + r() * 0.4, r: r() * Math.PI * 2, sp: chooseSpecies(r, 'street'), src: 'street' });
        }
      }
    }
  }
  return out;
}

const matCache = new Map<string, THREE.Material>();
function treeMaterial(mode: VisualMode) {
  if (!matCache.has(mode))
    matCache.set(mode, patchSceneMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: mode === 'sim' ? 0.9 : 1, flatShading: mode === 'game' }), 'tree'));
  return matCache.get(mode)!;
}

export function Trees() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const show = useAppStore((s) => s.layers.vegetation);

  const meshes = useMemo(() => {
    const { height } = getWorld();
    const trees = computeTrees(quality, mode);
    const detail = quality === 'high' ? 1 : 0;
    const groups = new Map<Species, TreeInstance[]>();
    for (const t of trees) {
      if (!groups.has(t.sp)) groups.set(t.sp, []);
      groups.get(t.sp)!.push(t);
    }
    const res: { sp: Species; mesh: THREE.InstancedMesh; items: TreeInstance[] }[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const r = rng(77);
    for (const [sp, items] of groups) {
      const geo = speciesGeometry(sp, mode, detail);
      const mesh = new THREE.InstancedMesh(geo, treeMaterial(mode), items.length);
      items.forEach((t, i) => {
        const y = height.sample(t.x, t.z) - 0.2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
        const sxz = t.s * (0.9 + r() * 0.2);
        m.compose(new THREE.Vector3(t.x, y, t.z), q, new THREE.Vector3(sxz, t.s, sxz));
        mesh.setMatrixAt(i, m);
        const v = mode === 'sim' ? 0.78 + r() * 0.4 : 0.85 + r() * 0.3;
        const warm = mode === 'sim' ? (r() - 0.5) * 0.12 : 0;
        c.setRGB(v + warm, v, v - warm);
        mesh.setColorAt(i, c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = quality !== 'low';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      res.push({ sp, mesh, items });
    }
    if (import.meta.env.DEV) console.info(`[i3d] árvores: ${trees.length}`);
    return res;
  }, [mode, quality]);

  if (!show) return null;
  return (
    <group>
      {meshes.map(({ sp, mesh, items }) => {
        const sel = (e: { instanceId?: number }): Selection => ({ kind: 'vegetation', id: `${sp}|${items[e.instanceId ?? 0]?.src ?? 'osm-area'}` });
        return <primitive key={sp} object={mesh} onClick={onSelectEvent((e) => sel(e))} {...onHoverEvent((e) => sel(e))} />;
      })}
    </group>
  );
}

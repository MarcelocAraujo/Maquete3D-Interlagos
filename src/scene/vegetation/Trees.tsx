import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getWorld, pointInPoly, polyBounds, rng, type XZ } from '../world/world';
import { useAppStore, type Quality, type VisualMode } from '../../store/useAppStore';
import { occupied } from './occupancy';
import { patchSceneMaterial } from '../materials/patch';
import { styleOf } from '../modes/modeStyles';
import { getAssets, instanceProto } from '../assets/assetLibrary';

const hashT = (n: number) => {
  const x = Math.sin(n * 91.345 + 7.1) * 43758.5453;
  return x - Math.floor(x);
};
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

/** Pinta vértices com gradiente vertical (base mais escura = oclusão da copa). */
function shadeLeaves(g: THREE.BufferGeometry, color: string, y0: number, y1: number, dark: number) {
  const col = new THREE.Color(color);
  const pos = g.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0 || 1)));
    const k = 1 - dark * (1 - t);
    arr[i * 3] = col.r * k;
    arr[i * 3 + 1] = col.g * k;
    arr[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Geometrias procedurais por espécie (altura base ~6–14 m).
 * cartoon   → volumes facetados (copa guarda-chuva, palmeira de folhas largas), como a referência do GAME MODE.
 * realistic → copas densas de vários lóbulos com sombreamento interno (SIMULATION MODE).
 */
function speciesGeometry(sp: Species, mode: VisualMode, detail: number): THREE.BufferGeometry {
  const st = styleOf(mode).trees;
  const cartoon = st.style === 'cartoon';
  const L = st.leaf;
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(sp.length * 97 + (cartoon ? 1 : 2));
  const trunk = (h: number, rad: number, bend = 0) => {
    const g = new THREE.CylinderGeometry(rad * 0.65, rad, h, cartoon ? 5 : 7, 1).translate(0, h / 2, 0);
    if (bend) g.rotateZ(bend);
    return colorize(g, st.trunk);
  };
  // lóbulo de copa
  const lobe = (rad: number, x: number, y: number, z: number, c: string, sx = 1, sy = 1, seed = 1) => {
    const g = cartoon ? new THREE.IcosahedronGeometry(rad, 0) : new THREE.IcosahedronGeometry(rad, detail);
    lumpy(g, seed, cartoon ? 0.22 : 0.3);
    g.scale(sx, sy, sx).translate(x, y, z);
    return shadeLeaves(g, c, y - rad * sy, y + rad * sy, cartoon ? 0.18 : 0.45);
  };
  /** copa realista: aglomerado de lóbulos menores ao redor de um centro */
  const cluster = (cx: number, cy: number, cz: number, R: number, Ry: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * R * 0.75;
      const yy = cy + (r() - 0.35) * Ry;
      const rad = R * (0.38 + r() * 0.25);
      parts.push(lobe(rad, cx + Math.cos(a) * d, yy, cz + Math.sin(a) * d, L[Math.floor(r() * L.length)], 1, 0.85, seed + i));
    }
  };
  switch (sp) {
    case 'folhosa':
      parts.push(trunk(3.4, 0.3));
      if (cartoon) parts.push(lobe(2.8, 0, 5.3, 0, L[0], 1.1, 0.8, 3), lobe(1.9, 1.4, 4.8, 0.7, L[1], 1, 0.85, 5), lobe(1.8, -1.2, 5.0, -0.9, L[2], 1, 0.85, 7));
      else cluster(0, 5.2, 0, 3.0, 1.8, 9, 3);
      break;
    case 'copa-larga':
      parts.push(trunk(4.2, 0.36));
      // copa em guarda-chuva (aspecto das árvores da referência e das sibipirunas paulistanas)
      if (cartoon) parts.push(lobe(3.9, 0, 6.2, 0, L[1], 1.35, 0.42, 11), lobe(2.6, 2.3, 5.9, 1.1, L[0], 1.1, 0.45, 13), lobe(2.4, -2.2, 6.0, -1.2, L[3], 1.1, 0.45, 17), lobe(2.0, 0.5, 7.0, -1.8, L[4], 1, 0.5, 19));
      else cluster(0, 6.0, 0, 4.2, 1.2, 12, 11);
      break;
    case 'eucalipto':
      parts.push(trunk(10, 0.32));
      if (cartoon) parts.push(lobe(2.3, 0, 10.8, 0, L[2], 0.9, 1.5, 19), lobe(1.7, 0.6, 13.4, 0.3, L[0], 0.9, 1.3, 23));
      else cluster(0, 11.5, 0, 2.6, 3.4, 9, 19);
      break;
    case 'conifera':
      parts.push(trunk(2.6, 0.26));
      for (let i = 0; i < 4; i++) {
        const g = new THREE.ConeGeometry(2.7 - i * 0.58, 3.3, cartoon ? 6 : 10, 1).translate(0, 3.3 + i * 1.9, 0);
        parts.push(shadeLeaves(g, cartoon ? '#3c7a32' : '#3b4a2c', 1.6 + i * 1.9, 5 + i * 1.9, cartoon ? 0.15 : 0.4));
      }
      break;
    case 'palmeira': {
      parts.push(trunk(8.5, 0.26, 0.06));
      const nf = cartoon ? 8 : 11;
      for (let i = 0; i < nf; i++) {
        // folha: lâmina larga afinando na ponta, inclinada para baixo
        const leaf = new THREE.BufferGeometry();
        const len = cartoon ? 4.2 : 4.6;
        const w = cartoon ? 0.9 : 0.6;
        leaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, len * 0.45, 0.25, -w, len * 0.45, 0.25, w, len, -0.9, 0, 0, 0, 0.15], 3));
        leaf.setIndex([0, 2, 1, 1, 2, 3, 0, 1, 2, 1, 3, 2]);
        leaf.computeVertexNormals();
        leaf.rotateZ(-0.25 - r() * 0.25);
        leaf.rotateY((i / nf) * Math.PI * 2 + r() * 0.3);
        leaf.translate(0.45, 8.5, 0);
        parts.push(shadeLeaves(leaf, cartoon ? L[0] : '#4f6232', 7.5, 8.8, 0.25));
      }
      break;
    }
    case 'arbusto':
      if (cartoon) parts.push(lobe(1.2, 0, 0.8, 0, L[3], 1.25, 0.7, 29), lobe(0.85, 0.85, 0.6, 0.3, L[1], 1, 0.8, 31), lobe(0.75, -0.7, 0.55, -0.4, L[4], 1, 0.8, 33));
      else cluster(0, 0.8, 0, 1.4, 0.6, 6, 29);
      break;
  }
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
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
    matCache.set(mode, patchSceneMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: styleOf(mode).flat, side: THREE.DoubleSide }), 'tree'));
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
    const res: { sp: string; mesh: THREE.InstancedMesh; items: TreeInstance[] }[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const r = rng(77);
    // modelos prontos do pacote RCC Design (se importados): substituem as espécies procedurais
    const protos = getAssets('tree');
    if (protos.length) {
      const byProto = new Map<number, { t: TreeInstance; m: THREE.Matrix4 }[]>();
      const TARGET: Record<Species, number> = { folhosa: 7, 'copa-larga': 8, eucalipto: 13, conifera: 10, palmeira: 9, arbusto: 1.8 };
      trees.forEach((t, k) => {
        // espécie → faixa de modelos (bem distribuída, sem repetir um único modelo)
        const pi = (Math.floor(hashT(k) * protos.length) + Object.keys(TARGET).indexOf(t.sp)) % protos.length;
        const p = protos[pi];
        const h = Math.min(16, TARGET[t.sp] * t.s);
        const k2 = THREE.MathUtils.clamp(h / Math.max(0.5, p.size.y), 0.25, 4);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
        m.compose(new THREE.Vector3(t.x, height.sample(t.x, t.z) - 0.15, t.z), q, new THREE.Vector3(k2, k2 * (0.9 + r() * 0.2), k2));
        if (!byProto.has(pi)) byProto.set(pi, []);
        byProto.get(pi)!.push({ t, m: m.clone() });
      });
      for (const [pi, list] of byProto) {
        for (const mesh of instanceProto(protos[pi], list.map((x) => x.m), mode, { shadows: quality !== 'low' })) res.push({ sp: protos[pi].name, mesh, items: list.map((x) => x.t) });
      }
      if (import.meta.env.DEV) console.info(`[i3d] árvores (modelos RCC): ${trees.length}`);
      return res;
    }
    for (const [sp, items] of groups) {
      const geo = speciesGeometry(sp, mode, detail);
      const mesh = new THREE.InstancedMesh(geo, treeMaterial(mode), items.length);
      items.forEach((t, i) => {
        const y = height.sample(t.x, t.z) - 0.2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
        const sxz = t.s * (0.9 + r() * 0.2);
        m.compose(new THREE.Vector3(t.x, y, t.z), q, new THREE.Vector3(sxz, t.s, sxz));
        mesh.setMatrixAt(i, m);
        const tint = styleOf(mode).trees.tint;
        const v = 1 - tint / 2 + r() * tint;
        const warm = (r() - 0.5) * tint * 0.6;
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
      {meshes.map(({ sp, mesh, items }, idx) => {
        const sel = (e: { instanceId?: number }): Selection => ({ kind: 'vegetation', id: `${sp}|${items[e.instanceId ?? 0]?.src ?? 'osm-area'}` });
        return <primitive key={sp + idx} object={mesh} onClick={onSelectEvent((e) => sel(e))} {...onHoverEvent((e) => sel(e))} />;
      })}
    </group>
  );
}

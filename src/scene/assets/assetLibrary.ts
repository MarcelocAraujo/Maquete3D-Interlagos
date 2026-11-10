import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VisualMode } from '../../store/useAppStore';
import { patchSceneMaterial } from '../materials/patch';

/**
 * Biblioteca opcional de modelos prontos (pacote "Cartoon Race Track Interlagos",
 * RCC Design). Os arquivos são licenciados e NÃO acompanham o repositório: são
 * gerados localmente por scripts/assets/import-rcc.mjs em public/assets/rcc/.
 * Sem o manifest, a biblioteca fica vazia e a cena usa os modelos procedurais.
 */
export type AssetRole = 'tree' | 'wall' | 'fence' | 'tyre' | 'motorhome' | 'tent' | 'grandstand' | 'pitwall' | 'sign' | 'cone' | 'light' | 'building' | 'other';

interface ManifestEntry {
  name: string;
  role: AssetRole;
  file: string;
  triangles: number;
  size: [number, number, number];
  scale?: number;
  disabled?: boolean;
}

export interface AssetPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface AssetProto {
  name: string;
  role: AssetRole;
  parts: AssetPart[];
  size: THREE.Vector3; // dimensões após escala (m)
  triangles: number;
}

const LIB = new Map<AssetRole, AssetProto[]>();
let loaded = false;

export const getAssets = (role: AssetRole): AssetProto[] => LIB.get(role) ?? [];
export const hasAssets = () => LIB.size > 0;
export const assetSummary = () => [...LIB.entries()].map(([role, list]) => ({ role, count: list.length }));

/** Agrupa as malhas do GLB por material (menos draw calls) já com a transformação aplicada. */
function toProto(entry: ManifestEntry, scene: THREE.Object3D): AssetProto | null {
  scene.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const s = entry.scale ?? 1;
  const S = new THREE.Matrix4().makeScale(s, s, s);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(S, mesh.matrixWorld));
    // padroniza atributos para permitir a fusão
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (mats.length === 1) {
      if (!byMat.has(mats[0])) byMat.set(mats[0], []);
      byMat.get(mats[0])!.push(g);
    } else {
      // malha com vários materiais: separa por grupo
      for (const grp of g.groups) {
        const sub = g.index ? g.toNonIndexed() : g;
        const part = new THREE.BufferGeometry();
        for (const [k, a] of Object.entries(sub.attributes)) {
          const arr = (a.array as Float32Array).slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize);
          part.setAttribute(k, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
        }
        const m = mats[grp.materialIndex ?? 0];
        if (!byMat.has(m)) byMat.set(m, []);
        byMat.get(m)!.push(part);
      }
    }
  });
  if (!byMat.size) return null;
  const parts: AssetPart[] = [];
  const box = new THREE.Box3();
  for (const [material, geos] of byMat) {
    const sameAttrs = geos.every((g) => Object.keys(g.attributes).sort().join() === Object.keys(geos[0].attributes).sort().join());
    const geometry = sameAttrs && geos.length > 1 ? mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))) : geos[0];
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    box.union(geometry.boundingBox!);
    parts.push({ geometry, material });
  }
  return { name: entry.name, role: entry.role, parts, size: box.getSize(new THREE.Vector3()), triangles: entry.triangles };
}

/** Carrega public/assets/rcc/manifest.json (se existir) e todos os modelos listados. */
export async function loadAssetLibrary(onStep?: (s: string) => void): Promise<void> {
  if (loaded) return;
  loaded = true;
  let manifest: { assets: ManifestEntry[] } | null = null;
  try {
    const res = await fetch('/assets/rcc/manifest.json', { cache: 'no-cache' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.includes('json')) manifest = await res.json();
  } catch {
    manifest = null;
  }
  if (!manifest?.assets?.length) return;
  onStep?.(`Carregando ${manifest.assets.length} modelos do pacote RCC Design…`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(
    manifest.assets
      .filter((a) => !a.disabled && a.role !== 'other')
      .map(async (entry) => {
        try {
          const gltf = await loader.loadAsync(`/assets/rcc/${entry.file}`);
          const proto = toProto(entry, gltf.scene);
          if (!proto) return;
          if (!LIB.has(proto.role)) LIB.set(proto.role, []);
          LIB.get(proto.role)!.push(proto);
        } catch (e) {
          console.warn('[i3d] falha ao carregar asset', entry.file, e);
        }
      }),
  );
  for (const list of LIB.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  if (import.meta.env.DEV) console.info('[i3d] biblioteca RCC:', assetSummary());
}

// ---------------------------------------------------------------------------
// Materiais por modo: GAME usa o material original (estilizado); SIMULATION
// recebe uma versão mais realista (sem facetas, cor um pouco dessaturada,
// rugosidade de material real). A geometria e o posicionamento são os mesmos.
// ---------------------------------------------------------------------------
const matCache = new Map<string, THREE.Material>();
export function assetMaterial(src: THREE.Material, mode: VisualMode): THREE.Material {
  const key = `${src.uuid}-${mode}`;
  if (matCache.has(key)) return matCache.get(key)!;
  const base = src as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: base.color ? base.color.clone() : new THREE.Color('#ffffff'),
    map: base.map ?? null,
    normalMap: base.normalMap ?? null,
    alphaMap: base.alphaMap ?? null,
    transparent: base.transparent,
    alphaTest: base.alphaTest || (base.transparent ? 0.4 : 0),
    side: base.side,
    vertexColors: base.vertexColors,
    roughness: mode === 'sim' ? Math.max(0.75, base.roughness ?? 0.8) : base.roughness ?? 0.8,
    metalness: base.metalness ?? 0,
    flatShading: mode === 'game',
  });
  if (mode === 'sim') {
    const hsl = { h: 0, s: 0, l: 0 };
    m.color.getHSL(hsl);
    m.color.setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.92);
  }
  patchSceneMaterial(m, `asset-${mode}`);
  matCache.set(key, m);
  return m;
}

/** Cria as malhas instanciadas (uma por parte) de um protótipo para um conjunto de transformações. */
export function instanceProto(proto: AssetProto, matrices: THREE.Matrix4[], mode: VisualMode, opts: { shadows?: boolean; colors?: THREE.Color[] } = {}): THREE.InstancedMesh[] {
  if (!matrices.length) return [];
  return proto.parts.map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, assetMaterial(part.material, mode), matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (opts.colors) opts.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = opts.shadows ?? true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.userData.assetName = proto.name;
    return mesh;
  });
}

/** Coloca módulos (muros, cercas, pneus) ao longo de uma polilinha 3D, alinhados a ela. */
export function modulesAlong(pts: [number, number, number][], moduleLength: number, ground: (x: number, z: number) => number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  const L = Math.max(0.5, moduleLength);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  const total = cum[cum.length - 1];
  let j = 0;
  for (let d = L / 2; d < total; d += L) {
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const a = pts[j];
    const b = pts[j + 1];
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (d - cum[j]) / seg;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const ang = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    out.push(new THREE.Matrix4().makeRotationY(ang).setPosition(x, Math.min(a[1] + (b[1] - a[1]) * t, ground(x, z)) - 0.05, z));
  }
  return out;
}

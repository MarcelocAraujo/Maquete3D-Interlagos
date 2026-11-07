import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { getWorld, pointInPoly, polyCentroid, rng, type BuildingFeature } from '../world/world';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { extrudeFootprint, newExtrudeOut, singleBuildingGeometry, toGeometry } from './extrude';
import { facadeTextures, concreteTexture } from '../materials/textures';
import { patchSceneMaterial, sceneUniforms } from '../materials/patch';
import { insideArea } from '../terrain/plinth';
import { registerSelectable } from '../selection/bounds';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import type { Selection } from '../../data/types';

/** Prédios tratados por componentes próprios (boxes) */
export const SPECIAL_BUILDINGS = new Set<number | string>([33779114, 1563340820]);

export function buildingTop(b: BuildingFeature) {
  return b.b + b.g * 0.5 + b.h;
}

interface Batch {
  geo: THREE.BufferGeometry;
  wallTriStarts: number[];
  roofTriStarts: number[];
  wallTris: number;
  items: BuildingFeature[];
}

function buildBatch(items: BuildingFeature[], mode: VisualMode, complex: boolean): Batch {
  const out = newExtrudeOut();
  const r = rng(complex ? 99 : 42);
  const wallTriStarts: number[] = [];
  const roofTriStarts: number[] = [];
  const wallsGame = ['#d9d2c3', '#e6e0d3', '#cfc6b4', '#bdb39f', '#e9e4da', '#c9b9a0', '#d6cab6', '#a9a196'];
  const roofsGame = ['#a9583a', '#b8653f', '#9c4f34', '#8d8b86', '#7d7c78', '#a7a49c', '#c2703f'];
  const wc = new THREE.Color();
  const rc = new THREE.Color();
  for (const b of items) {
    wallTriStarts.push(out.wallIdx.length / 3);
    roofTriStarts.push(out.roofIdx.length / 3);
    if (mode === 'sim') {
      wc.set(complex ? '#e4e2dc' : wallsGame[Math.floor(r() * wallsGame.length)]);
      const tile = !complex && b.h < 9 && r() < 0.68;
      rc.set(tile ? roofsGame[Math.floor(r() * 3)] : complex ? '#c9c7c0' : roofsGame[3 + Math.floor(r() * 4)]);
    } else {
      // volumes cinza low-poly (complexo mais claro que o entorno)
      const v = complex ? 0.42 : 0.2 + r() * 0.05;
      wc.setRGB(v, v * 1.01, v * 1.03);
      rc.setRGB(v * 1.15, v * 1.16, v * 1.18);
    }
    if (b.k === 'tank') {
      wc.set(mode === 'sim' ? '#b9bcbf' : '#6c7277');
      rc.copy(wc);
    }
    extrudeFootprint(out, b.poly, b.b - 1.2, buildingTop(b), wc, rc, mode === 'sim' ? [26, 24] : [1000, 1000]);
  }
  return { geo: toGeometry(out), wallTriStarts, roofTriStarts, wallTris: out.wallIdx.length / 3, items };
}

function findIndex(starts: number[], tri: number) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= tri) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function pickBuilding(batch: Batch, faceIndex: number | undefined): BuildingFeature | null {
  if (faceIndex == null) return null;
  const i = faceIndex < batch.wallTris ? findIndex(batch.wallTriStarts, faceIndex) : findIndex(batch.roofTriStarts, faceIndex - batch.wallTris);
  return batch.items[i] ?? null;
}

const matCache = new Map<string, THREE.Material[]>();
function buildingMaterials(mode: VisualMode, complex: boolean): THREE.Material[] {
  const key = `${mode}-${complex}`;
  if (matCache.has(key)) return matCache.get(key)!;
  let mats: THREE.Material[];
  if (mode === 'sim') {
    const f = facadeTextures();
    const wall = new THREE.MeshStandardMaterial({ vertexColors: true, map: complex ? concreteTexture() : f.map, emissiveMap: complex ? null : f.emissiveMap, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.85, metalness: 0 });
    const roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
    // janelas acesas à noite (apenas fachadas do entorno)
    const prev = wall.onBeforeCompile;
    wall.onBeforeCompile = (shader, r) => {
      prev?.call(wall, shader, r);
      Object.assign(shader.uniforms, sceneUniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uNight * 1.6;');
    };
    wall.emissiveIntensity = 1;
    mats = [patchSceneMaterial(wall, `bwall-${complex}`), patchSceneMaterial(roof, `broof-${complex}`)];
  } else {
    const wall = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    mats = [patchSceneMaterial(wall, 'bwall-sim'), patchSceneMaterial(roof, 'broof-sim')];
  }
  matCache.set(key, mats);
  return mats;
}

export function buildingSelection(b: BuildingFeature, complex: boolean): Selection {
  const sel: Selection = { kind: 'building', id: `b-${b.id}` };
  if (buildingRegistry.has(sel.id)) return sel;
  const geo = singleBuildingGeometry(b.poly, b.b - 0.5, buildingTop(b) + 0.15);
  registerSelectable(sel, geo.boundingBox!.clone(), geo);
  buildingRegistry.set(sel.id, { b, complex });
  return sel;
}

/** Metadados dos prédios selecionados (para o painel de informações). */
export const buildingRegistry = new Map<string, { b: BuildingFeature; complex: boolean }>();

export function Buildings() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const showCity = useAppStore((s) => s.layers.city);
  const showComplex = useAppStore((s) => s.layers.buildings);

  const { city, complex } = useMemo(() => {
    const t0 = performance.now();
    const { features } = getWorld();
    const cityItems: BuildingFeature[] = [];
    const complexItems: BuildingFeature[] = [];
    for (const b of features.buildings) {
      if (SPECIAL_BUILDINGS.has(b.id)) continue;
      if (/^\d+$/.test(b.n ?? '')) continue; // postos de fiscalização numerados (componente próprio)
      const c = polyCentroid(b.poly);
      if (!insideArea(c[0], c[1])) continue;
      if (pointInPoly(c[0], c[1], features.complex)) complexItems.push(b);
      else cityItems.push(b);
    }
    const res = { city: buildBatch(cityItems, mode, false), complex: buildBatch(complexItems, mode, true) };
    if (import.meta.env.DEV) console.info(`[i3d] buildings ${cityItems.length}+${complexItems.length}: ${(performance.now() - t0).toFixed(0)} ms`);
    return res;
  }, [mode, quality]);

  const cityMats = buildingMaterials(mode, false);
  const complexMats = buildingMaterials(mode, true);

  const pick = (batch: Batch, isComplex: boolean) => (e: ThreeEvent<MouseEvent | PointerEvent>) => {
    const b = pickBuilding(batch, e.faceIndex ?? undefined);
    return b ? buildingSelection(b, isComplex) : null;
  };

  return (
    <group>
      {showCity && (
        <mesh geometry={city.geo} material={cityMats} castShadow receiveShadow onClick={onSelectEvent((e) => pick(city, false)(e))} {...onHoverEvent((e) => pick(city, false)(e))} />
      )}
      {showComplex && (
        <mesh geometry={complex.geo} material={complexMats} castShadow receiveShadow onClick={onSelectEvent((e) => pick(complex, true)(e))} {...onHoverEvent((e) => pick(complex, true)(e))} />
      )}
    </group>
  );
}

/** Arestas finas no modo maquete (linguagem de desenho arquitetônico). */
function ComplexEdges({ geo }: { geo: THREE.BufferGeometry }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 30), [geo]);
  return (
    <lineSegments geometry={edges}>
      <lineBasicMaterial color="#6d6a64" transparent opacity={0.55} />
    </lineSegments>
  );
}

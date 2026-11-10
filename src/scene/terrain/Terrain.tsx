import { useMemo } from 'react';
import * as THREE from 'three';
import { getWorld } from '../world/world';
import { groundTexture } from './groundTexture';
import { useAppStore } from '../../store/useAppStore';
import { detailTexture } from '../materials/textures';
import { sceneUniforms } from '../materials/patch';
import { styleOf } from '../modes/modeStyles';
import type { VisualMode } from '../../store/useAppStore';
import { LANDMARK_BUILDINGS, PLINTH } from './plinth';

/** Margem de entorno (m) além do recorte do autódromo. */
export const TERRAIN_MARGIN = -30; // ≈200 m além do traçado; fora disso, nada
import { onSelectEvent } from '../selection/events';

/** Malha regular de terreno amostrada do heightfield. */
export function buildTerrainGeometry(x0: number, x1: number, z0: number, z1: number, step: number, dy = 0) {
  const t0 = performance.now();
  const { height } = getWorld();
  const H = height.meta.half;
  const nx = Math.max(2, Math.round((x1 - x0) / step) + 1);
  const nz = Math.max(2, Math.round((z1 - z0) / step) + 1);
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    const z = z0 + ((z1 - z0) * j) / (nz - 1);
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((x1 - x0) * i) / (nx - 1);
      const k = j * nx + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = height.sample(x, z) + dy;
      pos[k * 3 + 2] = z;
      uv[k * 2] = (x + H) / (2 * H);
      uv[k * 2 + 1] = 1 - (z + H) / (2 * H);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  if (import.meta.env.DEV) console.info(`[i3d] terrain ${nx}x${nz}: ${(performance.now() - t0).toFixed(0)} ms`);
  return g;
}

const terrainCache = new Map<string, THREE.Material>();
function terrainMaterial(mode: VisualMode, size: number) {
  const key = `${mode}-${size}`;
  if (terrainCache.has(key)) return terrainCache.get(key)!;
  const strength = styleOf(mode).terrainDetail;
  const mat = new THREE.MeshStandardMaterial({ map: groundTexture(mode, size), roughness: 0.97, metalness: 0, flatShading: false });
  const detail = detailTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail };
    Object.assign(shader.uniforms, sceneUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vI3dW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvI3dW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vI3dW;\nuniform sampler2D uDetail;\nuniform float uSceneDim;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float i3dD1 = texture2D(uDetail, vI3dW.xz / 5.0).r;
float i3dD2 = texture2D(uDetail, vI3dW.xz / 41.0).r;
diffuseColor.rgb *= mix(1.0, (0.68 + 0.45 * i3dD1) * (0.82 + 0.25 * i3dD2), ${strength.toFixed(2)});`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
float i3dLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(i3dLum) * 0.55, uSceneDim * 0.65);`,
      );
  };
  mat.customProgramCacheKey = () => `terrain-${mode}`;
  terrainCache.set(key, mat);
  return mat;
}


export function Terrain() {
  const mode = useAppStore((s) => s.mode);
  const quality = useAppStore((s) => s.quality);
  const visible = useAppStore((s) => s.layers.terrain);
  const { height } = getWorld();
  const H = height.meta.half - 5;

  const texSize = quality === 'high' ? 4096 : 2048;
  const step = quality === 'high' ? 5 : quality === 'medium' ? 7 : 10;

  // malha detalhada só sobre o autódromo + margem; entorno em malha grossa (apenas no modo realista)
  const inner = useMemo(() => {
    const m = TERRAIN_MARGIN;
    // estende o terreno até os prédios-referência que ficam além do recorte
    const b = { x0: PLINTH.x0 - m, x1: PLINTH.x1 + m, z0: PLINTH.z0 - m, z1: PLINTH.z1 + m };
    for (const f of getWorld().features.buildings) {
      if (!LANDMARK_BUILDINGS.has(f.id)) continue;
      for (const [x, z] of f.poly) {
        b.x0 = Math.min(b.x0, x - 25);
        b.x1 = Math.max(b.x1, x + 25);
        b.z0 = Math.min(b.z0, z - 25);
        b.z1 = Math.max(b.z1, z + 25);
      }
    }
    return buildTerrainGeometry(b.x0, b.x1, b.z0, b.z1, step);
  }, [step]);
  const outer = useMemo(() => {
    return null; // entorno distante removido (desempenho)
    if (mode !== 'sim') return null;
    const m = TERRAIN_MARGIN + 650;
    return buildTerrainGeometry(Math.max(-H, PLINTH.x0 - m), Math.min(H, PLINTH.x1 + m), Math.max(-H, PLINTH.z0 - m), Math.min(H, PLINTH.z1 + m), 40, -0.8);
  }, [mode, H]);

  const material = useMemo(() => terrainMaterial(mode, texSize), [mode, texSize]);

  return (
    <group visible={visible}>
      <mesh geometry={inner} material={material} receiveShadow onClick={onSelectEvent({ kind: 'vegetation', id: 'terreno' })} userData={{ pickable: 'terrain' }} />
      {outer && <mesh geometry={outer} material={material} receiveShadow />}
    </group>
  );
}

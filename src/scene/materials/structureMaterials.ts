import * as THREE from 'three';
import type { VisualMode } from '../../store/useAppStore';
import { patchSceneMaterial, sceneUniforms } from './patch';
import { concreteTexture, fenceTexture, asphaltTextures, hexTexture } from './textures';
import { styleOf } from '../modes/modeStyles';

export type StructMat =
  | 'white'
  | 'concrete'
  | 'darkConcrete'
  | 'glass'
  | 'metal'
  | 'darkMetal'
  | 'interior'
  | 'shutter'
  | 'roof'
  | 'fence'
  | 'guardrail'
  | 'tyre'
  | 'pitAsphalt'
  | 'paint'
  | 'water'
  | 'lamp'
  | 'redWhite'
  | 'seatBase';

const cache = new Map<string, THREE.Material>();

/** Vidro: reflexivo de dia; à noite, emissivo (ambientes iluminados). */
function glassMaterial(mode: VisualMode) {
  const m = new THREE.MeshStandardMaterial({
    color: styleOf(mode).structure.glass.color,
    roughness: styleOf(mode).structure.glass.roughness ?? 0.1,
    metalness: styleOf(mode).structure.glass.metalness ?? 0.3,
    emissive: new THREE.Color('#ffe2b0'),
    emissiveIntensity: 0,
  });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    Object.assign(shader.uniforms, sceneUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vec3(1.0, 0.86, 0.62) * uNight * 0.9;');
  };
  return m;
}

export function structMat(mode: VisualMode, key: StructMat): THREE.Material {
  const k = `${mode}-${key}`;
  if (cache.has(k)) return cache.get(k)!;
  const style = styleOf(mode);
  const sp = style.structure[key] ?? { color: '#cccccc' };
  const flatShading = style.flat;
  const textured = !!sp.textured;
  const base = { color: sp.color, roughness: sp.roughness ?? 0.85, metalness: sp.metalness ?? 0, flatShading };
  const concreteMap = textured ? (mode === 'game' && key === 'concrete' ? hexTexture() : concreteTexture()) : null;
  let m: THREE.Material;
  switch (key) {
    case 'glass':
      m = glassMaterial(mode);
      break;
    case 'fence': {
      const t = fenceTexture().clone();
      t.needsUpdate = true;
      m = new THREE.MeshStandardMaterial({ ...base, map: t, alphaTest: 0.35, side: THREE.DoubleSide, transparent: false });
      break;
    }
    case 'pitAsphalt': {
      const t = asphaltTextures();
      m = new THREE.MeshStandardMaterial({ ...base, map: textured ? t.map : null, normalMap: textured ? t.normalMap : null, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      break;
    }
    case 'paint':
      m = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      break;
    case 'water':
      m = new THREE.MeshStandardMaterial({ ...base, flatShading: false, transparent: mode === 'sim', opacity: mode === 'sim' ? 0.93 : 1 });
      break;
    case 'lamp':
      m = new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ ...base, map: concreteMap });
  }
  if (key !== 'lamp') patchSceneMaterial(m, `struct-${key}`);
  cache.set(k, m);
  return m;
}

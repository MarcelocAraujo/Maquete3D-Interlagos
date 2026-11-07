import * as THREE from 'three';
import type { VisualMode } from '../../store/useAppStore';
import { patchSceneMaterial, sceneUniforms } from './patch';
import { concreteTexture, fenceTexture, asphaltTextures } from './textures';

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
    color: mode === 'sim' ? '#2c3b48' : '#4f6878',
    roughness: mode === 'sim' ? 0.08 : 0.6,
    metalness: mode === 'sim' ? 0.6 : 0,
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
  const game = mode === 'sim';
  let m: THREE.Material;
  switch (key) {
    case 'white':
      m = new THREE.MeshStandardMaterial({ color: game ? '#dcdad4' : '#a2a8ad', roughness: game ? 0.75 : 0.95, map: game ? concreteTexture() : null });
      break;
    case 'concrete':
      m = new THREE.MeshStandardMaterial({ color: game ? '#bdbab2' : '#8f959a', roughness: 0.9, map: game ? concreteTexture() : null });
      break;
    case 'darkConcrete':
      m = new THREE.MeshStandardMaterial({ color: game ? '#8e8b84' : '#7c8288', roughness: 0.95, map: game ? concreteTexture() : null });
      break;
    case 'glass':
      m = glassMaterial(mode);
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color: game ? '#a9adb1' : '#8b9095', roughness: game ? 0.35 : 0.9, metalness: game ? 0.8 : 0 });
      break;
    case 'darkMetal':
      m = new THREE.MeshStandardMaterial({ color: game ? '#3c4046' : '#5b6066', roughness: 0.5, metalness: game ? 0.7 : 0 });
      break;
    case 'interior':
      m = new THREE.MeshStandardMaterial({ color: game ? '#1b1d21' : '#2a2d31', roughness: 0.9 });
      break;
    case 'shutter':
      m = new THREE.MeshStandardMaterial({ color: game ? '#d2d4d6' : '#a8adb2', roughness: 0.55, metalness: game ? 0.3 : 0 });
      break;
    case 'roof':
      m = new THREE.MeshStandardMaterial({ color: game ? '#cfcdc6' : '#aeb3b8', roughness: 0.8, map: game ? concreteTexture() : null });
      break;
    case 'fence': {
      const t = fenceTexture().clone();
      t.needsUpdate = true;
      m = new THREE.MeshStandardMaterial({ color: game ? '#b8bcc0' : '#6b7278', map: t, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: game ? 0.5 : 0, transparent: false });
      break;
    }
    case 'guardrail':
      m = new THREE.MeshStandardMaterial({ color: game ? '#c3c7cb' : '#9aa0a5', roughness: 0.3, metalness: game ? 0.85 : 0 });
      break;
    case 'tyre':
      m = new THREE.MeshStandardMaterial({ color: game ? '#1a1b1d' : '#2b2d30', roughness: 0.95 });
      break;
    case 'pitAsphalt': {
      const t = asphaltTextures();
      m = new THREE.MeshStandardMaterial({ color: game ? '#d6d6d6' : '#55595e', map: game ? t.map : null, normalMap: game ? t.normalMap : null, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      break;
    }
    case 'paint':
      m = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      break;
    case 'water':
      m = new THREE.MeshStandardMaterial({ color: game ? '#2a4f57' : '#2c5a68', roughness: game ? 0.06 : 0.9, metalness: game ? 0.25 : 0, transparent: game, opacity: game ? 0.92 : 1 });
      break;
    case 'lamp':
      m = new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });
      break;
    case 'redWhite':
      m = new THREE.MeshStandardMaterial({ color: game ? '#d6332b' : '#a35b55', roughness: 0.6 });
      break;
    case 'seatBase':
      m = new THREE.MeshStandardMaterial({ color: game ? '#9d9f9f' : '#7d8287', roughness: 0.9, map: game ? concreteTexture() : null });
      break;
  }
  if (key !== 'lamp') patchSceneMaterial(m!, `struct-${key}`);
  cache.set(k, m!);
  return m!;
}

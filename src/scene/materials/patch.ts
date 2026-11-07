import * as THREE from 'three';
import { TRACK_LENGTH } from '../../data/circuit/track';
import { REF } from '../../data/circuit/markers';
import { SECTOR_COLORS } from '../../data/circuit/sectors';

/**
 * Uniforms compartilhados por todos os materiais "da pista" (asfalto, zebras,
 * sinalização, áreas de escape). O destaque de curvas/retas/setores é feito no
 * shader a partir do atributo aS (distância ao longo da pista), acompanhando
 * exatamente a geometria 3D.
 */
export const trackUniforms = {
  uL: { value: TRACK_LENGTH },
  uSel: { value: new THREE.Vector4(0, 0, 0, 6) }, // s0, s1, intensidade (0..1), elevação (m)
  uSelColor: { value: new THREE.Color('#ff2a1a') },
  uHover: { value: new THREE.Vector3(0, 0, 0) }, // s0, s1, intensidade
  uDim: { value: 0 },
  uSectorMix: { value: 0 },
  uSectorB: { value: new THREE.Vector2(REF.sector1End, REF.sector2End) },
  uC1: { value: new THREE.Color(SECTOR_COLORS[0]) },
  uC2: { value: new THREE.Color(SECTOR_COLORS[1]) },
  uC3: { value: new THREE.Color(SECTOR_COLORS[2]) },
  uTime: { value: 0 },
};

/** Escurecimento/dessaturação global dos demais objetos quando algo está selecionado. */
export const sceneUniforms = {
  uSceneDim: { value: 0 },
  uNight: { value: 0 },
};

const RANGE_GLSL = /* glsl */ `
uniform float uL;
uniform vec4 uSel;
uniform vec3 uHover;
float i3dRange(float s, float s0, float s1, float feather) {
  float len = mod(s1 - s0 + uL, uL);
  float d = mod(s - s0 + uL, uL);
  if (d > len) return 0.0;
  return smoothstep(0.0, feather, d) * (1.0 - smoothstep(len - feather, len, d));
}
`;

/** Injeta destaque por faixa de s, cores de setor e elevação da faixa selecionada. */
export function patchTrackMaterial<T extends THREE.Material>(mat: T, opts: { rim?: boolean; key: string; sector?: boolean }): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, trackUniforms, sceneUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aS;
attribute float aLat;
varying float vS;
varying float vLat;
${RANGE_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vS = aS;
vLat = aLat;
float i3dW = uSel.z * i3dRange(aS, uSel.x, uSel.y, 14.0);
transformed.y += i3dW * uSel.w;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vS;
varying float vLat;
uniform vec3 uSelColor;
uniform float uDim;
uniform float uSectorMix;
uniform vec2 uSectorB;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform float uTime;
${RANGE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 i3dSec = vS < uSectorB.x ? uC1 : (vS < uSectorB.y ? uC2 : uC3);
${opts.sector === false ? '' : 'diffuseColor.rgb = mix(diffuseColor.rgb, i3dSec * 0.85, uSectorMix * 0.6);'}
float i3dSelW = i3dRange(vS, uSel.x, uSel.y, 3.0);
float i3dActive = step(0.001, uSel.z);
diffuseColor.rgb *= 1.0 - uDim * 0.6 * i3dActive * (1.0 - i3dSelW);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float i3dRim = ${opts.rim ? 'smoothstep(0.80, 1.0, abs(vLat))' : '0.35'};
float i3dPulse = 0.75 + 0.25 * sin(uTime * 3.0);
totalEmissiveRadiance += uSelColor * i3dSelW * uSel.z * (0.10 + i3dRim * 0.9 * i3dPulse);
float i3dHoverW = i3dRange(vS, uHover.x, uHover.y, 3.0) * uHover.z;
totalEmissiveRadiance += vec3(1.0) * i3dHoverW * (0.04 + i3dRim * 0.25);`,
      );
  };
  mat.customProgramCacheKey = () => (opts.key === 'asphalt-game' ? 'track-asphalt-game' : `track-${opts.rim ? 'rim' : 'flat'}${opts.sector === false ? '-nosec' : ''}`);
  return mat;
}

/** Dessaturação global para materiais que não pertencem à pista. */
export function patchSceneMaterial<T extends THREE.Material>(mat: T, key: string): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, sceneUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSceneDim;`)
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
float i3dLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(i3dLum) * 0.55, uSceneDim * 0.65);`,
      );
  };
  // chave única: materiais com os mesmos recursos compartilham o mesmo programa de shader
  mat.customProgramCacheKey = () => (key.startsWith('bwall-') && key !== 'bwall-sim' ? 'scene-night' : key === 'struct-glass' ? 'scene-glass' : 'scene');
  return mat;
}

/** Linhas de nível (curvas topográficas) para o modo maquete. */
export function patchContourMaterial<T extends THREE.Material>(mat: T, interval = 2, key = 'contour'): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sceneUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vI3dWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvI3dWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vI3dWorld;\nuniform float uSceneDim;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float i3dH = vI3dWorld.y / ${interval.toFixed(1)};
float i3dF = abs(fract(i3dH - 0.5) - 0.5) / fwidth(i3dH);
float i3dLine = 1.0 - min(i3dF, 1.0);
float i3dMajor = 1.0 - min(abs(fract(vI3dWorld.y / ${(interval * 5).toFixed(1)} - 0.5) - 0.5) / fwidth(vI3dWorld.y / ${(interval * 5).toFixed(1)}), 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.78, i3dLine * 0.55);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, i3dMajor * 0.7);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
float i3dLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(i3dLum) * 0.55, uSceneDim * 0.65);`,
      );
  };
  mat.customProgramCacheKey = () => `${key}-${interval}`;
  return mat;
}

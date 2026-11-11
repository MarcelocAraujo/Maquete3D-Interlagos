import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThreeEvent } from '@react-three/fiber';
import { TRACK, TRACK_LENGTH, frameAt, nearestS, wrapS } from '../../data/circuit/track';
import { cornerAt } from '../../data/circuit/corners';
import { straightAt } from '../../data/circuit/straights';
import { REF } from '../../data/circuit/markers';
import { sectorOf } from '../../data/circuit/corners';
import type { Selection } from '../../data/types';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { asphaltTextures, gravelTexture } from '../materials/textures';
import { styleOf } from '../modes/modeStyles';
import { patchTrackMaterial } from '../materials/patch';
import { getWorld } from '../world/world';
import { pitExitProfile } from '../structures/PitComplex';
import { SAUSAGE_CORNERS, runoffDepthAt, buildStrip, brakingFactor, computeKerbs, computeRunoffs, envelope, hash, racingLine } from './geometry';
import { onHoverEvent, onSelectEvent } from '../selection/events';

/** Resolve o elemento da pista a partir de um ponto clicado. */
export function trackSelectionAt(x: number, z: number): Selection {
  const { s } = nearestS(x, z);
  const c = cornerAt(s);
  if (c) return { kind: 'corner', id: c.id };
  const st = straightAt(s);
  if (st) return { kind: 'straight', id: st.id };
  return { kind: 'sector', id: `s${sectorOf(s)}` };
}

const selectFromEvent = (e: ThreeEvent<MouseEvent | PointerEvent>) => trackSelectionAt(e.point.x, e.point.z);

// ---------------------------------------------------------------------------
// materiais
// ---------------------------------------------------------------------------
const matCache = new Map<string, THREE.Material>();
function trackMat(key: string, mode: VisualMode, make: () => THREE.Material) {
  const k = `${key}-${mode}`;
  if (!matCache.has(k)) matCache.set(k, make());
  return matCache.get(k)!;
}

function stripeTexture(colors: string[]) {
  const data = new Uint8Array(colors.length * 4);
  colors.forEach((c, i) => {
    const col = new THREE.Color(c).convertLinearToSRGB();
    data[i * 4] = col.r * 255;
    data[i * 4 + 1] = col.g * 255;
    data[i * 4 + 2] = col.b * 255;
    data[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(data, 1, colors.length, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  // mipmaps: à distância as listras se fundem na cor média (sem serrilhado)
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function asphaltMaterial(mode: VisualMode) {
  return trackMat('asphalt', mode, () => {
    const st = styleOf(mode).track;
    const t = asphaltTextures();
    const m = st.asphaltTexture
      ? new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, normalScale: new THREE.Vector2(0.6, 0.6), color: st.asphalt, roughness: 1, metalness: 0 })
      : new THREE.MeshStandardMaterial({ color: st.asphalt, roughness: 0.82, metalness: 0 });
    patchTrackMaterial(m, { rim: true, key: 'asphalt-game' });
    const prev = m.onBeforeCompile;
    const rub = st.rubber.toFixed(2);
    m.onBeforeCompile = (shader, r) => {
      prev.call(m, shader, r);
      // marcas de borracha (trajetória ideal e frenagens) via atributo aExtra
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aExtra;\nvarying float vRub;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRub = aExtra;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vRub;')
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 - clamp(vRub, 0.0, 1.0) * 0.42 * ${rub};`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= 1.0 - clamp(vRub, 0.0, 1.0) * 0.25 * ${rub};`);
    };
    m.customProgramCacheKey = () => `track-asphalt-${mode}`;
    return m;
  });
}

/** Zebras nas cores aplicadas em Interlagos desde 2024 (verde/amarelo, homenagem a Senna). */
function kerbMaterial(mode: VisualMode) {
  return trackMat('kerb', mode, () => {
    const st = styleOf(mode).track;
    const tex = stripeTexture([...st.kerb]);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: st.kerbRoughness, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    return patchTrackMaterial(m, { rim: false, key: `kerb-${mode}` });
  });
}

function lineMaterial(mode: VisualMode) {
  return trackMat('line', mode, () => {
    const st = styleOf(mode).track;
    const m = new THREE.MeshStandardMaterial({ color: st.line, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    patchTrackMaterial(m, { rim: false, key: `line-${mode}` });
    const prev = m.onBeforeCompile;
    const far = `vec3(${st.lineFar.join(', ')})`;
    m.onBeforeCompile = (shader, r) => {
      prev.call(m, shader, r);
      // linhas finas se fundem ao asfalto com a distância (evita cintilação)
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, ${far}, smoothstep(260.0, 750.0, length(vViewPosition)));`);
    };
    m.customProgramCacheKey = () => `track-line-${mode}`;
    return m;
  });
}

type RunoffKind = 'paint' | 'asphalt' | 'gravel';
function runoffMaterial(mode: VisualMode, kind: RunoffKind) {
  return trackMat(`runoff-${kind}`, mode, () => {
    const st = styleOf(mode).track;
    const t = asphaltTextures();
    const tex = st.runoffTextured;
    const m = new THREE.MeshStandardMaterial({
      color: kind === 'paint' ? st.runoffPaint : kind === 'gravel' ? st.runoffGravel : st.runoffConcrete,
      map: kind === 'gravel' ? (tex ? gravelTexture() : null) : tex ? t.map : null,
      normalMap: tex && kind === 'asphalt' ? t.normalMap : null,
      roughness: kind === 'gravel' ? 1 : 0.85,
      metalness: 0,
      flatShading: false,
      polygonOffset: true,
      // a faixa pintada fica sobre o asfalto/brita da área de escape
      polygonOffsetFactor: kind === 'paint' ? -2 : -1,
      polygonOffsetUnits: kind === 'paint' ? -2 : -1,
    });
    // o mapa de asfalto é escuro (base ≈ 0,33): compensa a cor no modo realista
    if (tex && kind === 'paint') m.color.multiplyScalar(2.75);
    if (tex && kind === 'asphalt') m.color.set('#ffffff').multiplyScalar(1.12);
    return patchTrackMaterial(m, { rim: false, sector: false, key: `runoff-${kind}-${mode}` });
  });
}

function sausageMaterial(mode: VisualMode) {
  return trackMat('sausage', mode, () => {
    const m = new THREE.MeshStandardMaterial({ color: styleOf(mode).track.sausage, roughness: 0.6, metalness: 0, flatShading: styleOf(mode).flat });
    return patchTrackMaterial(m, { rim: false, sector: false, key: `sausage-${mode}` });
  });
}

function checkerMaterial(mode: VisualMode) {
  return trackMat('checker', mode, () => {
    const m = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    return patchTrackMaterial(m, { rim: false, key: `checker-${mode}` });
  });
}

// ---------------------------------------------------------------------------
// geometrias
// ---------------------------------------------------------------------------
function useTrackGeometries() {
  return useMemo(() => {
    const t0 = performance.now();
    const rl = racingLine();
    const surface = buildStrip({
      s0: 0,
      s1: TRACK_LENGTH,
      cols: 12,
      skirt: 1.4,
      latA: (_s, f) => f.wl,
      latB: (_s, f) => -f.wr,
      uvScale: 7,
      extra: (s, _u, lat, f) => {
        const i = Math.round(s / TRACK.ds) % TRACK.n;
        const half = lat >= 0 ? f.wl : f.wr;
        const rlLat = rl[i] * (rl[i] >= 0 ? f.wl : f.wr);
        const d = (lat - rlLat) / 2.0;
        let v = Math.exp(-d * d) * 0.55;
        const br = brakingFactor(s);
        if (br > 0) v += br * Math.exp(-d * d * 0.35) * (0.45 + 0.4 * hash(Math.floor(s * 0.7) + Math.round(lat * 3)));
        // desgaste nas bordas e pequenas variações de tom
        v += 0.12 * (hash(Math.floor(s / 9) * 7.1 + Math.floor(lat)) - 0.5);
        if (Math.abs(lat) > half - 1.2) v -= 0.08;
        return v;
      },
    });

    // zebras
    const kerbs = computeKerbs();
    const kerbGeos = kerbs.map((k) => {
      const width = k.kind === 'outside' ? 1.6 : 1.25;
      return buildStrip({
        s0: k.s0,
        s1: k.s1,
        step: 0.6,
        cols: 6,
        skirt: 0.3,
        uvMode: 'unit',
        uvScale: 2.4,
        latA: (s, f) => (k.side === 1 ? f.wl + width * envelope(s, k.s0, k.s1, 3) + 0.02 : -f.wr),
        latB: (s, f) => (k.side === 1 ? f.wl : -f.wr - width * envelope(s, k.s0, k.s1, 3) - 0.02),
        dy: (s, u) => {
          const outer = k.side === 1 ? 1 - u : u;
          const e = envelope(s, k.s0, k.s1, 3);
          // perfil: faixa pintada quase plana junto à pista + ressalto externo ("zebra elevada")
          return 0.012 + e * (0.025 + 0.075 * Math.min(1, Math.max(0, (outer - 0.45) / 0.4)));
        },
      });
    });
    const kerbGeo = kerbGeos.length ? mergeGeometries(kerbGeos) : null;

    // linhas brancas de borda
    // do lado da saída dos boxes, a borda vira tracejada no trecho em que a saída converge
    const ex = pitExitProfile();
    const edgeFor = (side: 1 | -1, s0: number, s1: number) =>
      side === 1
        ? buildStrip({ s0, s1, latA: (_s, f) => f.wl - 0.08, latB: (_s, f) => f.wl - 0.5, dy: () => 0.01 })
        : buildStrip({ s0, s1, latA: (_s, f) => -f.wr + 0.5, latB: (_s, f) => -f.wr + 0.08, dy: () => 0.01 });
    const exitEdge: THREE.BufferGeometry[] = [edgeFor(ex.side, wrapS(ex.sM), wrapS(ex.sT2))];
    for (let d = 0; d < ex.sM - ex.sT2 - 1; d += 6) exitEdge.push(edgeFor(ex.side, wrapS(ex.sT2 + d), wrapS(ex.sT2 + d + 3)));
    const edgeL = ex.side === 1 ? mergeGeometries(exitEdge) : edgeFor(1, 0, TRACK_LENGTH);
    const edgeR = ex.side === -1 ? mergeGeometries(exitEdge) : edgeFor(-1, 0, TRACK_LENGTH);

    // linha de largada, grid e marcações transversais
    const marks: THREE.BufferGeometry[] = [edgeL, edgeR];
    const transverse = (s: number, along: number, latA: number, latB: number) =>
      buildStrip({ s0: wrapS(s - along / 2), s1: wrapS(s + along / 2), step: along, latA: () => latA, latB: () => latB, dy: () => 0.012 });
    {
      const f = frameAt(REF.startLine);
      marks.push(transverse(REF.startLine, 0.5, f.wl - 0.3, -f.wr + 0.3));
      // 22 posições de grid, alternadas (pole à esquerda, lado interno da Curva 1) – ilustrativo
      for (let p = 0; p < 22; p++) {
        const s = REF.startLine - 1.2 - p * 8;
        const fr = frameAt(s);
        const left = p % 2 === 0;
        const inner = 0.9;
        const outerL = left ? fr.wl - 1.2 : -inner;
        const innerL = left ? inner : -fr.wr + 1.2;
        marks.push(transverse(s, 0.18, outerL, innerL));
        marks.push(buildStrip({ s0: wrapS(s - 1.6), s1: wrapS(s), step: 1.6, latA: () => outerL, latB: () => outerL - 0.18, dy: () => 0.012 }));
        marks.push(buildStrip({ s0: wrapS(s - 1.6), s1: wrapS(s), step: 1.6, latA: () => innerL + 0.18, latB: () => innerL, dy: () => 0.012 }));
      }
    }
    const marksGeo = mergeGeometries(marks);

    // faixa quadriculada na linha de chegada (ilustrativa)
    const f0 = frameAt(0);
    const checker = buildStrip({ s0: wrapS(-0.6), s1: 0.6, step: 1.2, cols: 1, uvMode: 'unit', uvScale: 1.2, latA: () => f0.wl - 0.1, latB: () => -f0.wr + 0.1, dy: () => 0.013 });
    {
      // repete o padrão ao longo da largura
      const uv = checker.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * ((f0.wl + f0.wr) / 1.6));
    }

    // áreas de escape (drapeadas no terreno): faixa verde estreita junto à zebra e,
    // depois dela, asfalto ou brita até a barreira (grama = o próprio terreno)
    const { height } = getWorld();
    const drape = (g: THREE.BufferGeometry, lift: number) => {
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const zz = pos.getZ(i);
        pos.setY(i, Math.max(pos.getY(i) - 0.05, height.sample(x, zz) + lift));
      }
      g.computeVertexNormals();
      return g;
    };
    const band = (z: ReturnType<typeof computeRunoffs>[number], from: (e: number, s: number) => number, to: (e: number, s: number) => number, ramp: number, lift: number, cols: number) =>
      drape(
        buildStrip({
          s0: z.s0,
          s1: z.s1,
          step: 2,
          cols,
          latA: (s, f) => {
            const e = envelope(s, z.s0, z.s1, ramp);
            return z.side === 1 ? f.wl + to(e, s) : -f.wr - from(e, s);
          },
          latB: (s, f) => {
            const e = envelope(s, z.s0, z.s1, ramp);
            return z.side === 1 ? f.wl + from(e, s) : -f.wr - to(e, s);
          },
        }),
        lift,
      );
    const zones = computeRunoffs();
    const paints: THREE.BufferGeometry[] = [];
    const asphalts: THREE.BufferGeometry[] = [];
    const gravels: THREE.BufferGeometry[] = [];
    for (const z of zones) {
      if (z.paint > 0) paints.push(band(z, () => 0.3, (e) => 0.3 + z.paint * Math.min(1, e * 3), 8, 0.06, 2));
      if (z.surface === 'grass') continue;
      // superfície até ~1,5 m antes da barreira
      const reach = (e: number, s: number) => 0.3 + z.paint + Math.max(0.01, (runoffDepthAt(z, s) - z.paint - 1.5) * e);
      (z.surface === 'gravel' ? gravels : asphalts).push(band(z, () => 0.3 + z.paint - 0.2, reach, 25, 0.04, 6));
    }
    const paintGeo = paints.length ? mergeGeometries(paints) : null;
    const asphaltGeo = asphalts.length ? mergeGeometries(asphalts) : null;
    const gravelGeo = gravels.length ? mergeGeometries(gravels) : null;

    // salsichas atrás das zebras internas (curvas do modelo de referência)
    const sausages = kerbs
      .filter((k) => k.kind === 'inside' && SAUSAGE_CORNERS.includes(k.corner))
      .map((k) => {
        const s0 = wrapS(k.s0 + 8);
        const s1 = wrapS(k.s1 - 8);
        const inner = 1.25 + 0.35;
        return buildStrip({
          s0,
          s1,
          step: 0.8,
          cols: 2,
          skirt: 0.25,
          latA: (s, f) => (k.side === 1 ? f.wl + inner + 0.55 * envelope(s, s0, s1, 2) + 0.01 : -f.wr - inner),
          latB: (s, f) => (k.side === 1 ? f.wl + inner : -f.wr - inner - 0.55 * envelope(s, s0, s1, 2) - 0.01),
          dy: (s, u) => 0.04 + 0.1 * envelope(s, s0, s1, 2) * Math.sin(Math.PI * u),
        });
      });
    const sausageGeo = sausages.length ? mergeGeometries(sausages) : null;

    if (import.meta.env.DEV) console.info(`[i3d] track geometry: ${(performance.now() - t0).toFixed(0)} ms`);
    return { surface, kerbGeo, marksGeo, checker, paintGeo, asphaltGeo, gravelGeo, sausageGeo };
  }, []);
}

export function Track() {
  const mode = useAppStore((s) => s.mode);
  const layers = useAppStore((s) => s.layers);
  const g = useTrackGeometries();
  const hover = onHoverEvent(selectFromEvent);
  const click = onSelectEvent(selectFromEvent);

  const runoffClick = onSelectEvent((e) => {
    const { s } = nearestS(e.point.x, e.point.z);
    const c = cornerAt(s);
    return { kind: 'runoff', id: `runoff-${c ? c.number : Math.round(s)}` };
  });
  const runoffHover = onHoverEvent((e) => {
    const { s } = nearestS(e.point.x, e.point.z);
    const c = cornerAt(s);
    return { kind: 'runoff', id: `runoff-${c ? c.number : Math.round(s)}` };
  });

  return (
    <group>
      {layers.track && (
        <mesh geometry={g.surface} material={asphaltMaterial(mode)} receiveShadow castShadow={false} onClick={click} {...hover} />
      )}
      {layers.curbs && g.kerbGeo && <mesh geometry={g.kerbGeo} material={kerbMaterial(mode)} receiveShadow onClick={click} {...hover} />}
      {layers.curbs && g.sausageGeo && <mesh geometry={g.sausageGeo} material={sausageMaterial(mode)} castShadow receiveShadow onClick={click} {...hover} />}
      {layers.markings && (
        <>
          <mesh geometry={g.marksGeo} material={lineMaterial(mode)} receiveShadow />
          <mesh geometry={g.checker} material={checkerMaterial(mode)} receiveShadow />
        </>
      )}
      {layers.runoff && (
        <>
          {g.paintGeo && <mesh geometry={g.paintGeo} material={runoffMaterial(mode, 'paint')} receiveShadow onClick={runoffClick} {...runoffHover} />}
          {g.asphaltGeo && <mesh geometry={g.asphaltGeo} material={runoffMaterial(mode, 'asphalt')} receiveShadow onClick={runoffClick} {...runoffHover} />}
          {g.gravelGeo && <mesh geometry={g.gravelGeo} material={runoffMaterial(mode, 'gravel')} receiveShadow onClick={runoffClick} {...runoffHover} />}
        </>
      )}
    </group>
  );
}

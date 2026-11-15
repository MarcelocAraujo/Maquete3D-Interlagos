import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bvh } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { Terrain } from './terrain/Terrain';
import { Track } from './track/Track';
import { CameraRig } from './camera/CameraRig';
import { Lighting } from './lighting/Lighting';
import { SelectionFX } from './selection/SelectionFX';
import { Effects } from './Effects';
import { World3D } from './World3D';
import { Labels } from './labels/Labels';
import { SnapshotGrabber } from './SnapshotGrabber';
import { trackUniforms } from './materials/patch';

function RendererSetup() {
  const { gl, camera, scene, advance } = useThree();
  const mode = useAppStore((s) => s.mode);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign((window as unknown as { __i3d: Record<string, unknown> }).__i3d ?? {}, { camera, scene, THREE, gl, advance });
  }, [camera, scene, gl, advance]);
  useEffect(() => {
    gl.toneMapping = mode === 'sim' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl, mode]);
  // filtragem anisotrópica no máximo que a GPU oferece (as texturas são criadas com 8;
  // aqui sobem para 16 em placas que suportam) — reduz borrão e cintilação em ângulos rasos
  const ready = useAppStore((s) => s.ready);
  useEffect(() => {
    const max = gl.capabilities.getMaxAnisotropy();
    const seen = new Set<THREE.Texture>();
    scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const v of Object.values(m as unknown as Record<string, unknown>)) {
          const t = v as THREE.Texture;
          if (t && (t as THREE.Texture).isTexture && !seen.has(t) && t.anisotropy < max && t.minFilter !== THREE.NearestFilter) {
            seen.add(t);
            t.anisotropy = max;
            t.needsUpdate = true;
          }
        }
      }
    });
  }, [gl, scene, mode, ready]);
  let frames = 0;
  useFrame((_, dt) => {
    trackUniforms.uTime.value += dt;
    if (frames < 6) {
      frames++;
      if (import.meta.env.DEV) console.info(`[i3d] frame ${frames} @ ${performance.now().toFixed(0)} ms`);
      if (frames === 5) useAppStore.getState().setReady(true);
    }
  });
  return null;
}

/**
 * Resolução de renderização por perfil. Em monitores comuns (devicePixelRatio = 1) o
 * valor é um sobreamostragem real — antes, o intervalo [1, 1,5] virava 1 e nada era
 * sobreamostrado. Em telas HiDPI (2) fica em 1,25 / 1,5 / 2.
 */
const dprOf = (min: number, max: number) => Math.min(max, Math.max(min, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
const DPR = { low: 1, medium: dprOf(1.25, 1.5), high: dprOf(1.5, 2) } as const;

export function Scene() {
  const quality = useAppStore((s) => s.quality);
  const select = useAppStore((s) => s.select);
  return (
    <Canvas
      shadows
      dpr={DPR[quality]}
      camera={{ fov: 38, near: 2.5, far: 9000, position: [0, 1500, 2000] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, logarithmicDepthBuffer: false }}
      onPointerMissed={(e) => {
        if (e.button === 0 && !useAppStore.getState().explore) select(null);
      }}
    >
      <RendererSetup />
      <Suspense fallback={null}>
        <Lighting />
        <Bvh firstHitOnly>
          <Terrain />
          <Track />
          <World3D />
        </Bvh>
        <SelectionFX />
        <Labels />
        <CameraRig />
        <Effects />
        <SnapshotGrabber />
      </Suspense>
    </Canvas>
  );
}

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
  const { gl, camera, scene } = useThree();
  const mode = useAppStore((s) => s.mode);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign((window as unknown as { __i3d: Record<string, unknown> }).__i3d ?? {}, { camera, scene, THREE });
  }, [camera, scene]);
  useEffect(() => {
    gl.toneMapping = mode === 'sim' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }, [gl, mode]);
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

export function Scene() {
  const quality = useAppStore((s) => s.quality);
  const select = useAppStore((s) => s.select);
  return (
    <Canvas
      shadows
      dpr={quality === 'high' ? [1, 1.5] : quality === 'medium' ? [1, 1.25] : 1}
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

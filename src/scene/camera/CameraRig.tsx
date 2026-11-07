import { useEffect, useMemo, useRef } from 'react';
import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CameraControlsImpl from 'camera-controls';
import { useAppStore, type CameraPreset } from '../../store/useAppStore';
import { PLINTH, TRACK_CENTER } from '../terrain/plinth';
import { buildTerrainGeometry } from '../terrain/Terrain';
import { getWorld } from '../world/world';
import { boundsOf } from '../selection/bounds';

const DEG = Math.PI / 180;

/** Posição de câmera para cada vista predefinida. */
function presetPose(p: CameraPreset) {
  const { height } = getWorld();
  const [cx, cz] = TRACK_CENTER;
  const cy = height.sample(cx, cz);
  const target = new THREE.Vector3(cx, cy + 10, cz);
  const span = Math.max(PLINTH.x1 - PLINTH.x0, PLINTH.z1 - PLINTH.z0);
  const poses: Record<CameraPreset, { az: number; polar: number; dist: number }> = {
    overview: { az: -32 * DEG, polar: 52 * DEG, dist: span * 1.25 },
    top: { az: 0, polar: 0.0001, dist: span * 1.55 },
    side: { az: 90 * DEG, polar: 80 * DEG, dist: span * 1.45 },
    front: { az: 0, polar: 80 * DEG, dist: span * 1.45 },
    iso: { az: 45 * DEG, polar: 54.7 * DEG, dist: span * 1.35 },
  };
  const { az, polar, dist } = poses[p];
  const pos = new THREE.Vector3(
    target.x + dist * Math.sin(polar) * Math.sin(az),
    target.y + dist * Math.cos(polar),
    target.z + dist * Math.sin(polar) * Math.cos(az),
  );
  return { pos, target };
}

export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const request = useAppStore((s) => s.cameraRequest);
  const explore = useAppStore((s) => s.explore);
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const lastPush = useRef(0);

  const collider = useMemo(() => {
    const { height } = getWorld();
    const H = height.meta.half - 10;
    const m = new THREE.Mesh(buildTerrainGeometry(-H, H, -H, H, 25, 3));
    m.updateMatrixWorld(true);
    return m;
  }, []);

  // configuração inicial
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.colliderMeshes = [collider];
    c.minDistance = 6;
    c.maxDistance = 4200;
    c.maxPolarAngle = 86 * DEG;
    c.dollyToCursor = true;
    c.smoothTime = 0.55;
    c.draggingSmoothTime = 0.12;
    c.dollySpeed = 0.6;
    c.truckSpeed = 1.6;
    c.setBoundary(new THREE.Box3(new THREE.Vector3(PLINTH.x0 - 900, -50, PLINTH.z0 - 900), new THREE.Vector3(PLINTH.x1 + 900, 600, PLINTH.z1 + 900)));
    c.mouseButtons.right = CameraControlsImpl.ACTION.TRUCK;
    c.mouseButtons.middle = CameraControlsImpl.ACTION.DOLLY;
    c.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK;
    const { pos, target } = presetPose('overview');
    // entrada cinematográfica: começa alto e se aproxima
    c.setLookAt(pos.x * 1.6, pos.y * 1.9, pos.z * 1.6, target.x, target.y, target.z, false);
    c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
  }, [collider]);

  // pedidos de câmera (presets e foco em seleção)
  useEffect(() => {
    const c = ref.current;
    if (!c || !request) return;
    if (request.kind === 'preset' && request.preset) {
      const { pos, target } = presetPose(request.preset);
      c.smoothTime = 0.7;
      c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, !request.instant);
      return;
    }
    if (request.kind === 'focus') {
      if (request.target && request.position) {
        c.setLookAt(...request.position, ...request.target, true);
        return;
      }
      const sel = useAppStore.getState().selection;
      if (!sel) return;
      const box = boundsOf(sel);
      if (!box || box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(18, size.length() / 2);
      // olha de fora para dentro do circuito, a ~38° de elevação
      const out = new THREE.Vector3(center.x - TRACK_CENTER[0], 0, center.z - TRACK_CENTER[1]);
      if (out.lengthSq() < 1) out.set(0, 0, 1);
      out.normalize();
      const dist = Math.min(2200, radius * (sel.kind === 'sector' ? 2.9 : 2.3) + 35);
      const el = (sel.kind === 'sector' ? 55 : 38) * DEG;
      const pos = center.clone().add(out.multiplyScalar(dist * Math.cos(el))).add(new THREE.Vector3(0, dist * Math.sin(el), 0));
      c.smoothTime = 0.65;
      c.setLookAt(pos.x, pos.y, pos.z, center.x, center.y + 2, center.z, true);
    }
  }, [request]);

  // teclado (modo exploração e atalhos de navegação)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((state, dt) => {
    const c = ref.current;
    if (!c) return;
    const k = keys.current;
    const fast = k['shift'] ? 3 : 1;
    const dist = c.distance;
    const speed = Math.max(12, dist * 0.6) * dt * fast;
    if (explore || k['w'] || k['s'] || k['a'] || k['d']) {
      if (k['w'] || k['arrowup']) c.forward(speed, false);
      if (k['s'] || k['arrowdown']) c.forward(-speed, false);
      if (k['a'] || k['arrowleft']) c.truck(-speed, 0, false);
      if (k['d'] || k['arrowright']) c.truck(speed, 0, false);
      if (k['e']) c.elevate(speed * 0.6, false);
      if (k['q']) c.elevate(-speed * 0.6, false);
    }
    // impede a câmera de atravessar o terreno
    const { height } = getWorld();
    const ground = height.sample(camera.position.x, camera.position.z);
    if (camera.position.y < ground + 2.5) {
      const t = c.getTarget(new THREE.Vector3());
      c.setPosition(camera.position.x, ground + 2.5, camera.position.z, false);
      c.setTarget(t.x, t.y, t.z, false);
    }
    // estado para a barra inferior e o mini-mapa (~8 Hz)
    if (state.clock.elapsedTime - lastPush.current > 0.12) {
      lastPush.current = state.clock.elapsedTime;
      const t = c.getTarget(new THREE.Vector3());
      useAppStore.getState().setCamera({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [t.x, t.y, t.z],
        distance: c.distance,
        azimuth: (c.azimuthAngle * 180) / Math.PI,
      });
    }
  });

  return <CameraControls ref={ref} makeDefault />;
}

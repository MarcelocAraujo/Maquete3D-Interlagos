import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { useAppStore, type Lighting as LightingMode, type VisualMode } from '../../store/useAppStore';
import { sceneUniforms } from '../materials/patch';

const DEG = Math.PI / 180;

/** Direção do sol (cena: x = leste, z = -norte) a partir de azimute (a partir do norte) e elevação. */
export function sunDir(azDeg: number, elDeg: number) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
}

interface LightPreset {
  sun: THREE.Vector3;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  background: string;
  fog: string;
  fogDensity: number;
  envIntensity: number;
  exposure: number;
}

// São Paulo (hemisfério sul): o sol do meio do dia fica ao norte.
export function lightPreset(mode: VisualMode, time: LightingMode): LightPreset {
  if (mode === 'sim') {
    if (time === 'day') return { sun: sunDir(25, 58), sunColor: '#fff4e2', sunIntensity: 3.1, hemiSky: '#cfe3ff', hemiGround: '#5a5a40', hemiIntensity: 0.55, background: '#9ec2e6', fog: '#c2d1de', fogDensity: 0.00013, envIntensity: 0.55, exposure: 1.0 };
    if (time === 'sunset') return { sun: sunDir(290, 6), sunColor: '#ffb074', sunIntensity: 2.6, hemiSky: '#f6c9a4', hemiGround: '#3b3226', hemiIntensity: 0.45, background: '#f0a36d', fog: '#d9a07c', fogDensity: 0.0002, envIntensity: 0.45, exposure: 1.05 };
    return { sun: sunDir(130, 38), sunColor: '#a9bfee', sunIntensity: 0.5, hemiSky: '#2a3a5c', hemiGround: '#101218', hemiIntensity: 0.55, background: '#060a14', fog: '#0c1220', fogDensity: 0.00032, envIntensity: 0.12, exposure: 1.35 };
  }
  // GAME MODE: estética de "mapa tático" (fundo escuro, bordas do recorte somem na névoa)
  if (time === 'day') return { sun: sunDir(35, 55), sunColor: '#ffffff', sunIntensity: 2.0, hemiSky: '#c3d2cc', hemiGround: '#1c221b', hemiIntensity: 1.25, background: '#161a18', fog: '#161a18', fogDensity: 0.00042, envIntensity: 0.25, exposure: 1.05 };
  if (time === 'sunset') return { sun: sunDir(290, 12), sunColor: '#ffc89a', sunIntensity: 1.9, hemiSky: '#c9ab96', hemiGround: '#1b1a18', hemiIntensity: 1.0, background: '#1e1918', fog: '#1e1918', fogDensity: 0.00042, envIntensity: 0.2, exposure: 1.05 };
  return { sun: sunDir(130, 40), sunColor: '#93a9d9', sunIntensity: 0.55, hemiSky: '#34425e', hemiGround: '#0c0e12', hemiIntensity: 0.7, background: '#090b10', fog: '#090b10', fogDensity: 0.00042, envIntensity: 0.1, exposure: 1.2 };
}

export function Lighting() {
  const mode = useAppStore((s) => s.mode);
  const time = useAppStore((s) => s.lighting);
  const quality = useAppStore((s) => s.quality);
  const shadowsOn = useAppStore((s) => s.shadows);
  const preset = useMemo(() => lightPreset(mode, time), [mode, time]);
  const sun = useRef<THREE.DirectionalLight>(null);
  const { scene, gl, controls } = useThree();
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  // ambiente de reflexos gerado uma única vez (estável entre trocas de modo)
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    pm.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = preset.envIntensity;
    scene.background = new THREE.Color(preset.background);
    scene.fog = preset.fogDensity > 0 ? new THREE.FogExp2(preset.fog, preset.fogDensity) : null;
    gl.toneMappingExposure = preset.exposure;
    sceneUniforms.uNight.value = time === 'night' ? 1 : 0;
  }, [preset, scene, gl, time]);

  const mapSize = quality === 'high' ? 2048 : 1024;
  const castShadows = shadowsOn && quality !== 'low';

  // a sombra acompanha o alvo da câmera, com área proporcional à distância
  useFrame(() => {
    const l = sun.current;
    if (!l) return;
    const ctl = controls as unknown as { getTarget?: (v: THREE.Vector3) => THREE.Vector3; distance?: number } | null;
    const t = ctl?.getTarget ? ctl.getTarget(new THREE.Vector3()) : new THREE.Vector3();
    const dist = ctl?.distance ?? 1000;
    const half = THREE.MathUtils.clamp(dist * 0.85, 90, 1300);
    // encaixa o alvo em uma grade de texels para evitar tremulação
    const texel = (half * 2) / mapSize;
    t.x = Math.round(t.x / texel) * texel;
    t.z = Math.round(t.z / texel) * texel;
    target.position.copy(t);
    l.position.copy(t).addScaledVector(preset.sun, 2000);
    l.target = target;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 100;
      cam.far = 4200;
      cam.updateProjectionMatrix();
    }
    l.shadow.bias = mode === 'sim' ? -0.00025 : -0.0004;
    l.shadow.normalBias = half / 400;
  });

  const sunPos = useMemo(() => preset.sun.clone().multiplyScalar(4000), [preset]);

  return (
    <>
      <hemisphereLight args={[preset.hemiSky, preset.hemiGround, preset.hemiIntensity]} />
      <directionalLight
        ref={sun}
        color={preset.sunColor}
        intensity={preset.sunIntensity}
        castShadow={castShadows}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-radius={mode === 'game' ? 6 : 2}
      />
      {mode === 'sim' && time !== 'night' && (
        <Sky distance={6000} sunPosition={sunPos} turbidity={time === 'sunset' ? 6 : 4} rayleigh={time === 'sunset' ? 2.6 : 1.2} mieCoefficient={0.006} mieDirectionalG={0.86} />
      )}
      {time === 'night' && <Stars radius={3000} depth={600} count={1500} factor={40} saturation={0} fade />}
    </>
  );
}

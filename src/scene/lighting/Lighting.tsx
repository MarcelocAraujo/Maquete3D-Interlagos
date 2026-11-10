import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { useAppStore, type Lighting as LightingMode, type VisualMode } from '../../store/useAppStore';
import { sceneUniforms } from '../materials/patch';
import { styleOf, type LightSetup } from '../modes/modeStyles';

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

// São Paulo (hemisfério sul): o sol do meio do dia fica ao norte. Valores por modo em modes/modeStyles.ts.
export function lightPreset(mode: VisualMode, time: LightingMode): LightPreset & { setup: LightSetup } {
  const st = styleOf(mode).light[time];
  return { ...st, sun: sunDir(st.sun[0], st.sun[1]), setup: st };
}

/** Domo de céu em gradiente (GAME MODE): ciano limpo no alto, claro no horizonte. */
function SkyDome({ top, horizon }: { top: string; horizon: string }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(horizon) } },
        vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "uniform vec3 uTop; uniform vec3 uHor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = vP.y < 0.0 ? uHor : mix(uHor, uTop, pow(h, 0.55)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}",
      }),
    [top, horizon],
  );
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[5500, 32, 16]} />
    </mesh>
  );
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
    l.shadow.bias = styleOf(mode).shadowBias;
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
        shadow-radius={styleOf(mode).shadowRadius}
      />
      {preset.setup.sky === 'physical' && (
        <Sky distance={6000} sunPosition={sunPos} turbidity={preset.setup.turbidity ?? 5} rayleigh={preset.setup.rayleigh ?? 1} mieCoefficient={0.005} mieDirectionalG={0.85} />
      )}
      {preset.setup.sky === 'gradient' && <SkyDome top={preset.setup.skyTop!} horizon={preset.setup.skyHorizon!} />}
      {time === 'night' && <Stars radius={3000} depth={600} count={1500} factor={40} saturation={0} fade />}
    </>
  );
}

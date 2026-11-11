import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK, frameAt, nearestS, osmSegmentByCorner, wrapS } from '../../data/circuit/track';
import { getWorld } from '../world/world';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { patchSceneMaterial } from '../materials/patch';
import { structMat } from '../materials/structureMaterials';
import { getAssets, instanceProto } from '../assets/assetLibrary';
import { pitLaneRange } from './PitComplex';
import { onHoverEvent, onSelectEvent } from '../selection/events';

/**
 * Sinalização e pequenos objetos de pista (quantidade contida):
 *  - placas de distância 150/100/50 m antes das frenagens fortes (T1, T4, T10, T12);
 *  - faixas de publicidade genéricas (sem marcas) no alambrado da reta dos boxes;
 *  - balizadores laranja na entrada do pit lane (as notas da FIA citam "pit entry and apex bollards").
 * Posições = estimativa. Se o pacote RCC Design estiver importado, usa seus modelos de
 * placas e cones no lugar dos procedurais.
 */
const BRAKE_CORNERS = [1, 4, 10, 12];
const DISTANCES = [150, 100, 50];

function boardTexture(n: number) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#111317';
  ctx.font = 'bold 58px "Saira Condensed", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(i: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const palettes = [
    ['#e10600', '#ffffff', 'INTERLAGOS'],
    ['#0f1f3d', '#f2c400', 'SÃO PAULO'],
    ['#ffffff', '#111317', 'AUTÓDROMO JOSÉ CARLOS PACE'],
    ['#1d8a3a', '#f2c400', 'S DO SENNA'],
  ][i % 4];
  ctx.fillStyle = palettes[0];
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = palettes[1];
  ctx.font = 'bold 40px "Saira Condensed", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(palettes[2], 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const texCache = new Map<string, THREE.Material>();
function texMat(key: string, make: () => THREE.Texture, mode: VisualMode) {
  const k = `${key}-${mode}`;
  if (!texCache.has(k)) texCache.set(k, patchSceneMaterial(new THREE.MeshStandardMaterial({ map: make(), roughness: mode === 'sim' ? 0.6 : 0.8, side: THREE.DoubleSide }), 'sign'));
  return texCache.get(k)!;
}

export function Signage() {
  const mode = useAppStore((s) => s.mode);
  const show = useAppStore((s) => s.layers.props);

  const data = useMemo(() => {
    const { height } = getWorld();
    // placas de distância: lado externo da curva, 3 m além da borda
    const boards: { n: number; m: THREE.Matrix4 }[] = [];
    for (const cn of BRAKE_CORNERS) {
      const seg = osmSegmentByCorner(cn);
      const left = frameAt(seg.s0 + 30).k > 0; // curva à esquerda → placas à direita
      for (const d of DISTANCES) {
        const s = wrapS(seg.s0 - d);
        const f = frameAt(s);
        const side = left ? -1 : 1;
        const w = side === 1 ? f.wl : f.wr;
        const x = f.x + f.lx * side * (w + 2); // do lado da pista, antes de muros e telas
        const z = f.z + f.lz * side * (w + 2);
        const ang = Math.atan2(-f.tz, f.tx); // placa voltada para quem chega
        boards.push({ n: d, m: new THREE.Matrix4().makeRotationY(ang + Math.PI / 2).setPosition(x, height.sample(x, z), z) });
      }
    }
    // faixas no alambrado do lado das arquibancadas da reta (s > 3820 ou s < 300)
    const banners: { i: number; m: THREE.Matrix4 }[] = [];
    let bi = 0;
    // até s≈265: depois disso o alambrado da reta dá lugar à barreira da Curva 1
    for (let s = 3840; s < TRACK.length + 265; s += 22) {
      const f = frameAt(s);
      const x = f.x - f.lx * (f.wr + 3.0);
      const z = f.z - f.lz * (f.wr + 3.0);
      const ang = Math.atan2(-f.tz, f.tx);
      // face legível voltada para a pista (antes ficava virada para a arquibancada e aparecia espelhada)
      banners.push({ i: bi++, m: new THREE.Matrix4().makeRotationY(ang + Math.PI).setPosition(x, Math.max(height.sample(x, z), f.y - 0.5) + 1.9, z) });
    }
    // balizadores na entrada do pit lane
    const bollards: THREE.Matrix4[] = [];
    const pr = pitLaneRange();
    for (let k = 2; k < 20; k += 3) {
      const i = pr.iStart + k;
      // na área zebrada entre o pit lane e a pista (meio do caminho entre os dois eixos)
      const px = TRACK.pit.x[i];
      const pz = TRACK.pit.z[i];
      const ns = nearestS(px, pz);
      const f = frameAt(ns.s);
      // no espaço entre a borda da pista e a borda do pit lane
      const sg = Math.sign((px - f.x) * f.lx + (pz - f.z) * f.lz) || 1;
      const w = sg > 0 ? f.wl : f.wr;
      const lat = w + Math.max(0.6, (ns.d - 3.5 - w) / 2);
      const x = f.x + f.lx * sg * lat;
      const z = f.z + f.lz * sg * lat;
      bollards.push(new THREE.Matrix4().makeTranslation(x, Math.max(TRACK.pit.y[i], f.y) + 0.02, z));
    }
    return { boards, banners, bollards };
  }, []);

  const objects = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const signs = getAssets('sign');
    const cones = getAssets('cone');
    // placas de distância (sempre procedurais: o número importa)
    for (const d of DISTANCES) {
      const list = data.boards.filter((b) => b.n === d);
      const panel = new THREE.PlaneGeometry(2.4, 1.8).translate(0, 2.9, 0);
      const mesh = new THREE.InstancedMesh(panel, texMat(`board${d}`, () => boardTexture(d), mode), list.length);
      list.forEach((b, i) => mesh.setMatrixAt(i, b.m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    const posts = mergeGeometries([new THREE.BoxGeometry(0.1, 2.1, 0.1).translate(-0.9, 1.05, -0.04), new THREE.BoxGeometry(0.1, 2.1, 0.1).translate(0.9, 1.05, -0.04), new THREE.BoxGeometry(2.5, 1.9, 0.06).translate(0, 2.9, -0.05)]);
    const postMesh = new THREE.InstancedMesh(posts, structMat(mode, 'darkMetal'), data.boards.length);
    data.boards.forEach((b, i) => postMesh.setMatrixAt(i, b.m));
    postMesh.instanceMatrix.needsUpdate = true;
    postMesh.computeBoundingSphere();
    out.push(postMesh);
    // faixas de publicidade: modelos RCC (se houver) ou painéis genéricos
    if (signs.length) {
      out.push(...instanceProto(signs[0], data.banners.map((b) => b.m), mode, { shadows: false }));
    } else {
      for (let v = 0; v < 4; v++) {
        const list = data.banners.filter((b) => b.i % 4 === v);
        const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 1.1), texMat(`banner${v}`, () => bannerTexture(v), mode), list.length);
        list.forEach((b, i) => mesh.setMatrixAt(i, b.m));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        out.push(mesh);
      }
    }
    // balizadores / cones
    if (cones.length) out.push(...instanceProto(cones[0], data.bollards, mode, { shadows: false }));
    else {
      const g = mergeGeometries([new THREE.CylinderGeometry(0.08, 0.12, 0.8, 10).translate(0, 0.4, 0), new THREE.CylinderGeometry(0.125, 0.125, 0.12, 10).translate(0, 0.55, 0)]);
      const mesh = new THREE.InstancedMesh(g, patchSceneMaterial(new THREE.MeshStandardMaterial({ color: '#ff7a00', roughness: 0.5 }), 'bollard'), data.bollards.length);
      data.bollards.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }, [data, mode]);

  if (!show) return null;
  const sel = { kind: 'structure' as const, id: 'sinalizacao' };
  return (
    <group>
      {objects.map((o, i) => (
        <primitive key={i} object={o} onClick={onSelectEvent(sel)} {...onHoverEvent(sel)} />
      ))}
    </group>
  );
}

import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getWorld, pointInPoly, polyBounds, polyCentroid, rng, type XZ } from '../world/world';
import { nearestS, frameAt } from '../../data/circuit/track';
import { useAppStore, type VisualMode } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { lightPoolTexture, glowTexture } from '../materials/textures';
import { insideArea } from '../terrain/plinth';
import { insideStand } from './standLayout';
import { computePitFrame } from './PitComplex';
import { registerSelectable } from '../selection/bounds';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import type { Selection } from '../../data/types';
import { sceneUniforms } from '../materials/patch';
import { useFrame } from '@react-three/fiber';

const keepFor = (mode: VisualMode) => (x: number, z: number) => insideArea(x, z) && !insideStand(x, z, 1);

/** Torre treliçada genérica (linhas de transmissão / telecomunicações). */
function latticeTower(h: number, base: number, top: number) {
  const parts: THREE.BufferGeometry[] = [];
  const legs = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  for (const [sx, sz] of legs) {
    const a = new THREE.Vector3((sx * base) / 2, 0, (sz * base) / 2);
    const b = new THREE.Vector3((sx * top) / 2, h, (sz * top) / 2);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(0.12, 0.16, len, 4);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    parts.push(g);
  }
  // travamentos horizontais
  for (let y = 4; y < h; y += 5) {
    const w = base + (top - base) * (y / h);
    parts.push(new THREE.BoxGeometry(w, 0.12, 0.12).translate(0, y, w / 2));
    parts.push(new THREE.BoxGeometry(w, 0.12, 0.12).translate(0, y, -w / 2));
    parts.push(new THREE.BoxGeometry(0.12, 0.12, w).translate(w / 2, y, 0));
    parts.push(new THREE.BoxGeometry(0.12, 0.12, w).translate(-w / 2, y, 0));
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('uv'); return p; }));
}

export function Props() {
  const mode = useAppStore((s) => s.mode);
  const show = useAppStore((s) => s.layers.props);
  const showWater = useAppStore((s) => s.layers.water);
  const lighting = useAppStore((s) => s.lighting);

  const data = useMemo(() => {
    const { features, height } = getWorld();
    const keep = keepFor(mode);
    const r = rng(5);
    const H = (x: number, z: number) => height.sample(x, z);

    // --- iluminação: só onde ela existe/é necessária (sem postes espalhados pelo gramado)
    const poles: { x: number; z: number; h: number; rot: number }[] = [];
    // a) avenidas do entorno (lit=yes no OSM), apenas fora do perímetro do autódromo
    for (const rd of features.roads) {
      if (!['primary', 'secondary'].includes(rd.k)) continue;
      let acc = 0;
      for (let i = 0; i < rd.p.length - 1; i++) {
        const a = rd.p[i];
        const b = rd.p[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 0.5) continue;
        const nx = (b[1] - a[1]) / L;
        const nz = -(b[0] - a[0]) / L;
        for (let d = (40 - (acc % 40)) % 40; d < L; d += 40) {
          const side = Math.floor((acc + d) / 40) % 2 ? 1 : -1;
          const x = a[0] + ((b[0] - a[0]) * d) / L + nx * side * (rd.w / 2 + 0.8);
          const z = a[1] + ((b[1] - a[1]) * d) / L + nz * side * (rd.w / 2 + 0.8);
          if (keep(x, z) && !pointInPoly(x, z, features.complex)) poles.push({ x, z, h: 9, rot: Math.atan2(-nx * side, -nz * side) });
        }
        acc += L;
      }
    }
    // b) pit lane: postes junto à fachada dos boxes; c) paddock: torres nas laterais das fileiras de trailers
    {
      const fr = computePitFrame();
      const n = Math.floor(fr.L / 30);
      for (let i = 0; i <= n; i++) {
        const t = -fr.L / 2 + (fr.L * i) / n;
        const px = fr.c.x + fr.along.x * t;
        const pz = fr.c.y + fr.along.y * t;
        // pit lane (frente do prédio, junto ao muro dos boxes)
        poles.push({ x: px + fr.front.x * (fr.W / 2 + 14.5), z: pz + fr.front.y * (fr.W / 2 + 14.5), h: 11, rot: Math.atan2(fr.front.x, fr.front.y) });
        // paddock (atrás do prédio)
        if (i % 2 === 0) poles.push({ x: px - fr.front.x * (fr.W / 2 + 42), z: pz - fr.front.y * (fr.W / 2 + 42), h: 15, rot: 0 });
      }
    }
    // d) luminárias mapeadas no OSM
    for (const p of features.points.lamp) if (keep(p[0], p[1])) poles.push({ x: p[0], z: p[1], h: 8, rot: 0 });

    // --- torres de transmissão e cabos
    const towers = features.points.powerTower.filter((p) => keep(p[0], p[1]));
    const cables: THREE.Vector3[][] = [];
    for (const line of features.lines.power) {
      const pts = line.filter((p) => keep(p[0], p[1]));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = new THREE.Vector3(pts[i][0], H(pts[i][0], pts[i][1]) + 30, pts[i][1]);
        const b = new THREE.Vector3(pts[i + 1][0], H(pts[i + 1][0], pts[i + 1][1]) + 30, pts[i + 1][1]);
        const span = a.distanceTo(b);
        for (const off of [-5, 5]) {
          const seg: THREE.Vector3[] = [];
          const dir = new THREE.Vector3(b.z - a.z, 0, -(b.x - a.x)).normalize().multiplyScalar(off);
          for (let k = 0; k <= 12; k++) {
            const t = k / 12;
            const p = a.clone().lerp(b, t).add(dir);
            p.y -= Math.sin(Math.PI * t) * span * 0.035;
            seg.push(p);
          }
          cables.push(seg);
        }
      }
    }
    const comm = features.points.commTower.filter((p) => keep(p[0], p[1]));
    const waterTowers = features.points.waterTower.filter((p) => keep(p[0], p[1]));

    // --- passarelas (bridge=yes)
    const bridges: THREE.BufferGeometry[] = [];
    for (const fb of features.lines.footbridge) {
      const pts = fb.filter((p) => keep(p[0], p[1]));
      if (pts.length < 2) continue;
      const a = pts[0];
      const b = pts[pts.length - 1];
      const mid: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const ns = nearestS(mid[0], mid[1]);
      const deckY = ns.d < 16 ? frameAt(ns.s).y + 6.2 : H(mid[0], mid[1]) + 5;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const g = new THREE.BoxGeometry(L + 4, 0.6, 3.2);
      const rail1 = new THREE.BoxGeometry(L + 4, 1.2, 0.12).translate(0, 0.9, 1.5);
      const rail2 = new THREE.BoxGeometry(L + 4, 1.2, 0.12).translate(0, 0.9, -1.5);
      const roof = new THREE.BoxGeometry(L + 4, 0.15, 3.6).translate(0, 2.8, 0);
      const parts = [g, rail1, rail2, roof];
      for (const sx of [-L / 2 - 1, L / 2 + 1]) parts.push(new THREE.BoxGeometry(0.8, deckY - H(mid[0], mid[1]) + 1, 0.8).translate(sx, -(deckY - H(mid[0], mid[1])) / 2, 0));
      const merged = mergeGeometries(parts);
      merged.rotateY(-ang);
      merged.translate(mid[0], deckY, mid[1]);
      bridges.push(merged);
    }

    // --- postos de fiscalização (edificações numeradas do OSM)
    const posts = features.buildings.filter((b) => /^\d+$/.test(b.n ?? '') && keep(b.poly[0][0], b.poly[0][1]));

    return { poles, towers, cables, comm, waterTowers, bridges: bridges.length ? mergeGeometries(bridges) : null, posts };
  }, [mode]);

  // --- geometrias instanciadas
  const inst = useMemo(() => {
    const { height } = getWorld();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    // poste: haste + braço + luminária
    const poleGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.09, 0.14, 1, 6).translate(0, 0.5, 0).toNonIndexed(),
    ]);
    const poleMesh = new THREE.InstancedMesh(poleGeo, structMat(mode, 'darkMetal'), data.poles.length);
    const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), structMat(mode, 'lamp'), data.poles.length);
    data.poles.forEach((p, i) => {
      const y = height.sample(p.x, p.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      m4.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(1, p.h, 1));
      poleMesh.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(p.x, y + p.h, p.z), q, new THREE.Vector3(1, 1, 1));
      headMesh.setMatrixAt(i, m4);
    });
    for (const m of [poleMesh, headMesh]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
    poleMesh.castShadow = true;

    const towerGeo = latticeTower(32, 8, 2.4);
    const armGeo = new THREE.BoxGeometry(14, 0.5, 0.5).translate(0, 30, 0);
    const towerMesh = new THREE.InstancedMesh(mergeGeometries([towerGeo, armGeo.toNonIndexed().deleteAttribute('uv') as THREE.BufferGeometry]), structMat(mode, 'metal'), data.towers.length);
    data.towers.forEach((p, i) => {
      m4.makeTranslation(p[0], height.sample(p[0], p[1]) - 0.3, p[1]);
      towerMesh.setMatrixAt(i, m4);
    });
    towerMesh.instanceMatrix.needsUpdate = true;
    towerMesh.computeBoundingSphere();
    towerMesh.castShadow = true;

    const commMesh = new THREE.InstancedMesh(latticeTower(42, 4, 1.2), structMat(mode, 'redWhite'), data.comm.length);
    data.comm.forEach((p, i) => {
      m4.makeTranslation(p[0], height.sample(p[0], p[1]) - 0.3, p[1]);
      commMesh.setMatrixAt(i, m4);
    });
    commMesh.instanceMatrix.needsUpdate = true;
    commMesh.computeBoundingSphere();
    commMesh.castShadow = true;

    const wtGeo = mergeGeometries([
      new THREE.CylinderGeometry(4, 4, 6, 16).translate(0, 22, 0).toNonIndexed(),
      new THREE.CylinderGeometry(1.2, 1.6, 19, 8).translate(0, 9.5, 0).toNonIndexed(),
    ]);
    const wtMesh = new THREE.InstancedMesh(wtGeo, structMat(mode, 'concrete'), data.waterTowers.length);
    data.waterTowers.forEach((p, i) => {
      m4.makeTranslation(p[0], height.sample(p[0], p[1]) - 0.3, p[1]);
      wtMesh.setMatrixAt(i, m4);
    });
    wtMesh.instanceMatrix.needsUpdate = true;
    wtMesh.computeBoundingSphere();

    // cabos
    const cablePts: number[] = [];
    for (const seg of data.cables) for (let i = 0; i < seg.length - 1; i++) cablePts.push(seg[i].x, seg[i].y, seg[i].z, seg[i + 1].x, seg[i + 1].y, seg[i + 1].z);
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));

    // postos de fiscalização
    const postGeos: THREE.BufferGeometry[] = [];
    for (const b of data.posts) {
      const c = polyCentroid(b.poly);
      const y = height.sample(c[0], c[1]);
      postGeos.push(new THREE.BoxGeometry(3.2, 2.6, 2.6).translate(c[0], y + 1.3, c[1]));
      postGeos.push(new THREE.BoxGeometry(3.8, 0.25, 3.2).translate(c[0], y + 2.75, c[1]));
      const sel: Selection = { kind: 'structure', id: `marshal-${b.n}` };
      const g = new THREE.BoxGeometry(3.8, 3, 3.2).translate(c[0], y + 1.5, c[1]);
      registerSelectable(sel, new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute), g);
    }
    const postGeo = postGeos.length ? mergeGeometries(postGeos) : null;

    return { poleMesh, headMesh, towerMesh, commMesh, wtMesh, cableGeo, postGeo };
  }, [data, mode]);

  // --- luz artificial noturna: poças de luz aditivas sob os postes + brilho das luminárias
  const night = useMemo(() => {
    const { height } = getWorld();
    const n = data.poles.length;
    const pool = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color('#ffcf8a').multiplyScalar(0.42), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -8 }),
      n,
    );
    const glow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color('#ffe2b0').multiplyScalar(2.2), toneMapped: false }),
      n,
    );
    const m4 = new THREE.Matrix4();
    data.poles.forEach((p, i) => {
      const y = height.sample(p.x, p.z);
      const size = p.h * 2.6;
      m4.makeScale(size, 1, size).setPosition(p.x, y + 0.25, p.z);
      pool.setMatrixAt(i, m4);
      m4.makeScale(3, 3, 3).setPosition(p.x, y + p.h - 0.2, p.z);
      glow.setMatrixAt(i, m4);
    });
    pool.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    pool.computeBoundingSphere();
    glow.computeBoundingSphere();
    pool.renderOrder = 2;
    glow.renderOrder = 3;
    return { pool, glow };
  }, [data]);

  // brilho sempre voltado para a câmera
  useFrame(({ camera }) => {
    if (lighting !== 'night') return;
    const m4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = camera.quaternion;
    const s = new THREE.Vector3(3, 3, 3);
    for (let i = 0; i < night.glow.count; i++) {
      night.glow.getMatrixAt(i, m4);
      pos.setFromMatrixPosition(m4);
      m4.compose(pos, q, s);
      night.glow.setMatrixAt(i, m4);
    }
    night.glow.instanceMatrix.needsUpdate = true;
  });

  const isNight = lighting === 'night';
  (inst.headMesh.material as THREE.MeshBasicMaterial).color.set(isNight ? '#fff1cf' : mode === 'sim' ? '#d9dde0' : '#e8e8e6');
  void sceneUniforms;

  return (
    <group>
      {show && (
        <>
          <primitive object={inst.poleMesh} onClick={onSelectEvent({ kind: 'tower', id: 'poste' })} {...onHoverEvent({ kind: 'tower', id: 'poste' })} />
          <primitive object={inst.headMesh} />
          <primitive object={inst.towerMesh} onClick={onSelectEvent({ kind: 'tower', id: 'transmissao' })} {...onHoverEvent({ kind: 'tower', id: 'transmissao' })} />
          <primitive object={inst.commMesh} onClick={onSelectEvent({ kind: 'tower', id: 'telecom' })} {...onHoverEvent({ kind: 'tower', id: 'telecom' })} />
          <primitive object={inst.wtMesh} onClick={onSelectEvent({ kind: 'tower', id: 'caixa-dagua' })} {...onHoverEvent({ kind: 'tower', id: 'caixa-dagua' })} />
          <lineSegments geometry={inst.cableGeo}>
            <lineBasicMaterial color={mode === 'sim' ? '#2b2d30' : '#8d8f92'} transparent opacity={0.7} />
          </lineSegments>
          {data.bridges && <mesh geometry={data.bridges} material={structMat(mode, 'white')} castShadow receiveShadow onClick={onSelectEvent({ kind: 'structure', id: 'passarela' })} {...onHoverEvent({ kind: 'structure', id: 'passarela' })} />}
          {inst.postGeo && <mesh geometry={inst.postGeo} material={structMat(mode, 'white')} castShadow receiveShadow onClick={onSelectEvent({ kind: 'structure', id: 'marshal' })} {...onHoverEvent({ kind: 'structure', id: 'marshal' })} />}
          {isNight && <primitive object={night.pool} />}
          {isNight && <primitive object={night.glow} />}
        </>
      )}
      {showWater && <Water mode={mode} />}
    </group>
  );
}

function Water({ mode }: { mode: VisualMode }) {
  const geo = useMemo(() => {
    const { features } = getWorld();
    const keep = keepFor(mode);
    const parts: THREE.BufferGeometry[] = [];
    for (const w of features.waters) {
      if (!w.poly.some((p) => keep(p[0], p[1]))) continue;
      const shape = new THREE.Shape(w.poly.map((p) => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      g.translate(0, w.level + 0.15, 0);
      parts.push(g);
    }
    const lake = features.waters.find((w) => w.id === 138417940);
    if (lake) {
      const shape = new THREE.Shape(lake.poly.map((p) => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, lake.level + 0.15, 0);
      registerSelectable({ kind: 'water', id: 'lake' }, new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).expandByScalar(5), g);
    }
    return parts.length ? mergeGeometries(parts) : null;
  }, [mode]);
  if (!geo) return null;
  return <mesh geometry={geo} material={structMat(mode, 'water')} receiveShadow onClick={onSelectEvent({ kind: 'water', id: 'lake' })} {...onHoverEvent({ kind: 'water', id: 'lake' })} />;
}

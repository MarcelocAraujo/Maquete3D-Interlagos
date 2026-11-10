import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK, TRACK_LENGTH, frameAt, nearestS, wrapS } from '../../data/circuit/track';
import { getWorld } from '../world/world';
import { useAppStore } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { computeRunoffs, envelope } from '../track/geometry';
import { offsetPolyline, polylineBlock, polylineWall } from './polylineStrip';
import { getAssets, instanceProto, modulesAlong, type AssetProto } from '../assets/assetLibrary';
import { insideArea } from '../terrain/plinth';
import { pitLaneRange } from './PitComplex';
import { onHoverEvent, onSelectEvent } from '../selection/events';

/**
 * guardrail  – defensa metálica dupla (miolo, trechos sem área de escape)
 * tyreRail   – barreira de pneus com guard-rail atrás (fim das áreas de escape no miolo)
 * tyreFence  – barreira de pneus com tela alta atrás (áreas de público)
 * wall       – muro de concreto (Laranjinha, lado interno da reta)
 * wallFence  – muro + tela alta (reta dos boxes, Reta Oposta, Mergulho/Junção)
 */
type BType = 'guardrail' | 'tyreRail' | 'tyreFence' | 'wall' | 'wallFence';

interface Run {
  type: BType;
  side: 1 | -1;
  pts: [number, number, number][];
}

/**
 * Barreiras ao longo da pista, posicionadas a partir das áreas de escape e no
 * padrão do modelo de referência: sempre barreira de pneus no fim das áreas de
 * escape, tela alta apenas onde há público, guard-rail separando a saída dos
 * boxes da pista. Tipos e afastamentos = estimativa (ver docs/METODOLOGIA.md).
 */
function computeRuns(): Run[] {
  const { height } = getWorld();
  const runoffs = computeRunoffs();
  const pr = pitLaneRange();
  const pitPts = TRACK.pit.x.map((x, i) => [x, TRACK.pit.z[i]] as [number, number]).slice(pr.iStart, pr.iEnd + 1);
  const pb = { x0: Math.min(...TRACK.pit.x) - 40, x1: Math.max(...TRACK.pit.x) + 40, z0: Math.min(...TRACK.pit.z) - 40, z1: Math.max(...TRACK.pit.z) + 40 };
  const pitD2 = (x: number, z: number) => {
    if (x < pb.x0 || x > pb.x1 || z < pb.z0 || z > pb.z1) return Infinity;
    let d = Infinity;
    for (let i = 0; i < pitPts.length; i += 2) d = Math.min(d, (pitPts[i][0] - x) ** 2 + (pitPts[i][1] - z) ** 2);
    return d;
  };
  const nearPit = (x: number, z: number) => pitD2(x, z) < 15 ** 2;
  const runs: Run[] = [];
  const step = 3;
  for (const side of [1, -1] as const) {
    let cur = null as Run | null;
    for (let s = 0; s <= TRACK_LENGTH; s += step) {
      const f = frameAt(s);
      const w = side === 1 ? f.wl : f.wr;
      let off = 6;
      let type: BType = 'guardrail';
      let inRunoff = false;
      for (const z of runoffs) {
        if (z.side !== side) continue;
        const e = envelope(s, z.s0, z.s1, 25);
        if (e > 0) {
          off = Math.max(off, 0.3 + z.depth * e + 0.8);
          if (e > 0.3) {
            type = z.barrier;
            inRunoff = true;
          }
        }
      }
      // tipologia por trecho (estimativa a partir de imagens aéreas, notas da FIA 2022 e do modelo de referência)
      const main = s > 3800 || s < 330;
      const oposta = s > 840 && s < 1380;
      const publicArea = s > 3150 && s <= 3800; // área de público entre as curvas 10 e 14 (FIA 2022: novas cercas)
      if (main) {
        off = side === 1 ? 4.5 : 3.2;
        type = side === 1 ? 'wall' : 'wallFence'; // arquibancadas do lado de fora da reta
      } else if (oposta && !inRunoff) {
        off = 5;
        type = side === -1 ? 'wallFence' : 'wall'; // Setor G (temporário) do lado externo
      } else if (publicArea && !inRunoff && side === -1) {
        type = 'wallFence';
      }
      // saída dos boxes correndo ao lado da pista (Curva do Sol): guard-rail no meio do caminho
      if (!main) {
        for (let lat = w + 1; lat < w + off + 6; lat += 0.75) {
          const px = f.x + f.lx * side * lat;
          const pz = f.z + f.lz * side * lat;
          if (pitD2(px, pz) < 4.2 ** 2) {
            off = Math.max(1.4, (lat - w) / 2);
            type = 'guardrail';
            break;
          }
        }
      }
      const x = f.x + f.lx * side * (w + off);
      const z = f.z + f.lz * side * (w + off);
      const ns = nearestS(x, z);
      const valid = ns.d > w + off - 2.5 && !(side === 1 && main && nearPit(x, z));
      if (!valid) {
        if (cur && cur.pts.length > 2) runs.push(cur);
        cur = null;
        continue;
      }
      const y = Math.max(height.sample(x, z), f.y - 0.5) - 0.05;
      if (!cur || cur.type !== type) {
        if (cur && cur.pts.length > 1) runs.push(cur);
        const prev: [number, number, number] | undefined = cur ? cur.pts[cur.pts.length - 1] : undefined;
        cur = { type, side, pts: prev ? [prev] : [] };
      }
      cur.pts.push([x, y, z]);
    }
    if (cur && cur.pts.length > 2) runs.push(cur);
  }
  return runs;
}

export function Barriers() {
  const mode = useAppStore((s) => s.mode);
  const show = useAppStore((s) => s.layers.barriers);

  const geos = useMemo(() => {
    const { features, height } = getWorld();
    const runs = computeRuns();
    const rails: THREE.BufferGeometry[] = [];
    const posts: THREE.Matrix4[] = [];
    const tyres: THREE.BufferGeometry[] = [];
    const walls: THREE.BufferGeometry[] = [];
    const fences: THREE.BufferGeometry[] = [];
    const fencePosts: THREE.Matrix4[] = [];
    // postes do alambrado a cada ~3,5 m, com braço inclinado para a pista
    const addFencePosts = (r: Run, y0: number) => {
      let acc = 0;
      for (let i = 1; i < r.pts.length; i++) {
        const a = r.pts[i - 1];
        const b = r.pts[i];
        acc += Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (acc < 3.5) continue;
        acc = 0;
        const ns = nearestS(b[0], b[2]);
        const fr = frameAt(ns.s);
        const ang = Math.atan2(-(fr.z - b[2]), fr.x - b[0]); // aponta o braço para a pista
        fencePosts.push(new THREE.Matrix4().makeRotationY(ang).setPosition(b[0], b[1] + y0, b[2]));
      }
    };
    // módulos prontos (RCC Design), quando importados: muros, muros com cerca e pneus
    const A = { wall: getAssets('wall'), fence: getAssets('fence'), tyre: getAssets('tyre') };
    const assetRuns: { proto: AssetProto; pts: [number, number, number][] }[] = [];
    const pickProto = (list: AssetProto[], i: number) => list[i % list.length];
    let runIdx = 0;
    // lado "de fora" (oposto à pista) da polilinha: a pista fica à direita quando side = 1
    const away = (r: Run, d: number) => offsetPolyline(r.pts, r.side === 1 ? d : -d);
    const guardrail = (pts: [number, number, number][]) => {
      rails.push(polylineWall(pts, 0.45, 0.78, 4));
      rails.push(polylineWall(pts, 0.88, 1.18, 4));
      for (let i = 0; i < pts.length; i += 1) posts.push(new THREE.Matrix4().makeTranslation(pts[i][0], pts[i][1] + 0.6, pts[i][2]));
    };
    const tallFence = (pts: [number, number, number][], h0: number, r: Run) => {
      fences.push(polylineWall(pts, h0, 5.6, 3, false));
      addFencePosts({ ...r, pts }, 0);
    };
    for (const r of runs) {
      runIdx++;
      const isTyre = r.type === 'tyreRail' || r.type === 'tyreFence';
      if (isTyre) {
        if (A.tyre.length) assetRuns.push({ proto: pickProto(A.tyre, runIdx), pts: r.pts });
        // bloco de pneus (≈1,1 m de altura, 1,2 m de espessura)
        else tyres.push(polylineBlock(r.pts, -0.2, 1.1, 1.2, 1.2));
        if (r.type === 'tyreRail') guardrail(away(r, 1.3));
        else tallFence(away(r, 1.1), -0.1, r);
        continue;
      }
      if (r.type === 'wallFence' && (A.fence.length || A.wall.length)) {
        assetRuns.push({ proto: A.fence.length ? pickProto(A.fence, runIdx) : pickProto(A.wall, runIdx), pts: r.pts });
        if (!A.fence.length) tallFence(r.pts, 1.2, r);
        continue;
      }
      if (r.type === 'wall' && A.wall.length) {
        assetRuns.push({ proto: pickProto(A.wall, runIdx), pts: r.pts });
        continue;
      }
      if (r.type === 'guardrail') guardrail(r.pts);
      else if (r.type === 'wallFence') {
        walls.push(polylineBlock(r.pts, -0.3, 1.2, 0.45, 3));
        tallFence(r.pts, 1.2, r);
      } else walls.push(polylineBlock(r.pts, -0.3, 1.1, 0.45, 3));
    }
    // Cercas do OSM (perímetro de terrenos) ficam de fora: cruzavam as telas da pista.
    // Muros do OSM só longe da pista.
    const lift = (pts: [number, number][]) => pts.map((p) => [p[0], height.sample(p[0], p[1]) - 0.1, p[1]] as [number, number, number]);
    const keep = (pts: [number, number][]) => pts.every((p) => insideArea(p[0], p[1]) && nearestS(p[0], p[1]).d > 25);
    for (const w of features.lines.wall) if (keep(w)) walls.push(polylineWall(lift(w), -0.3, 2.4, 3));
    return {
      rails: rails.length ? mergeGeometries(rails) : null,
      posts,
      tyres: tyres.length ? mergeGeometries(tyres) : null,
      walls: walls.length ? mergeGeometries(walls) : null,
      fences: fences.length ? mergeGeometries(fences) : null,
      fencePosts,
      assetRuns,
    };
  }, [mode]);

  const postMesh = useMemo(() => {
    const g = new THREE.BoxGeometry(0.12, 1.2, 0.12);
    const m = new THREE.InstancedMesh(g, structMat(mode, 'darkMetal'), geos.posts.length);
    geos.posts.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    return m;
  }, [geos, mode]);

  const fencePostMesh = useMemo(() => {
    // poste 5,2 m + braço de 0,9 m inclinado (aponta para +X local = pista)
    const post = new THREE.BoxGeometry(0.11, 5.3, 0.11).translate(0, 2.65, 0);
    const arm = new THREE.BoxGeometry(0.9, 0.08, 0.08).translate(0.45, 0, 0);
    arm.rotateZ(0.6);
    arm.translate(0, 5.3, 0);
    const g = mergeGeometries([post, arm]);
    const m = new THREE.InstancedMesh(g, structMat(mode, 'darkMetal'), geos.fencePosts.length);
    geos.fencePosts.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    m.computeBoundingSphere();
    return m;
  }, [geos, mode]);

  const assetMeshes = useMemo(() => {
    const { height } = getWorld();
    const byProto = new Map<AssetProto, THREE.Matrix4[]>();
    for (const ar of geos.assetRuns) {
      // módulo orientado pelo maior lado horizontal
      const len = Math.max(ar.proto.size.x, ar.proto.size.z);
      const mats = modulesAlong(ar.pts, len, (x, z) => height.sample(x, z));
      const turn = ar.proto.size.z > ar.proto.size.x ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : null;
      if (!byProto.has(ar.proto)) byProto.set(ar.proto, []);
      for (const m of mats) byProto.get(ar.proto)!.push(turn ? m.multiply(turn) : m);
    }
    return [...byProto.entries()].flatMap(([p, mats]) => instanceProto(p, mats, mode));
  }, [geos, mode]);

  if (!show) return null;
  const sel = (id: string) => ({ kind: 'barrier' as const, id });
  return (
    <group>
      {geos.rails && <mesh geometry={geos.rails} material={structMat(mode, 'guardrail')} castShadow receiveShadow onClick={onSelectEvent(sel('guardrail'))} {...onHoverEvent(sel('guardrail'))} />}
      <primitive object={postMesh} />
      <primitive object={fencePostMesh} />
      {assetMeshes.map((m, i) => (
        <primitive key={i} object={m} onClick={onSelectEvent(sel('wall'))} {...onHoverEvent(sel('wall'))} />
      ))}
      {geos.tyres && <mesh geometry={geos.tyres} material={structMat(mode, 'tyre')} castShadow receiveShadow onClick={onSelectEvent(sel('tyre'))} {...onHoverEvent(sel('tyre'))} />}
      {geos.walls && <mesh geometry={geos.walls} material={structMat(mode, 'concrete')} castShadow receiveShadow onClick={onSelectEvent(sel('wall'))} {...onHoverEvent(sel('wall'))} />}
      {geos.fences && <mesh geometry={geos.fences} material={structMat(mode, 'fence')} onClick={onSelectEvent(sel('fence'))} {...onHoverEvent(sel('fence'))} />}
    </group>
  );
}

export const _wrap = wrapS;

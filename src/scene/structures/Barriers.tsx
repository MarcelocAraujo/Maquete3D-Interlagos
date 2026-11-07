import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK, TRACK_LENGTH, frameAt, nearestS, wrapS } from '../../data/circuit/track';
import { getWorld } from '../world/world';
import { useAppStore } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { computeRunoffs, envelope } from '../track/geometry';
import { polylineWall } from './polylineStrip';
import { insideArea } from '../terrain/plinth';
import { onHoverEvent, onSelectEvent } from '../selection/events';

type BType = 'guardrail' | 'tyre' | 'wall';

interface Run {
  type: BType;
  side: 1 | -1;
  pts: [number, number, number][];
}

/**
 * Barreiras ao longo da pista, posicionadas a partir das áreas de escape:
 * pneus + alambrado no fim das áreas de escape, muro + alambrado na reta dos
 * boxes e guard-rail nos demais trechos. Tipos e afastamentos = estimativa
 * baseada em imagens aéreas (ver docs/METODOLOGIA.md).
 */
function computeRuns(): Run[] {
  const { height } = getWorld();
  const runoffs = computeRunoffs();
  const pitPts = TRACK.pit.x.map((x, i) => [x, TRACK.pit.z[i]] as [number, number]);
  const nearPit = (x: number, z: number) => pitPts.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < 15 ** 2);
  const runs: Run[] = [];
  const step = 3;
  for (const side of [1, -1] as const) {
    let cur = null as Run | null;
    for (let s = 0; s <= TRACK_LENGTH; s += step) {
      const f = frameAt(s);
      const w = side === 1 ? f.wl : f.wr;
      let off = 7;
      let type: BType = 'guardrail';
      for (const z of runoffs) {
        if (z.side !== side) continue;
        const e = envelope(s, z.s0, z.s1, 25);
        if (e > 0) {
          off = Math.max(off, 0.3 + z.depth * e + 2.5);
          if (e > 0.3) type = 'tyre';
        }
      }
      const main = s > 3800 || s < 330;
      if (main) {
        off = side === 1 ? 4.5 : 3.2;
        type = 'wall';
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
    for (const r of runs) {
      if (r.type === 'guardrail') {
        rails.push(polylineWall(r.pts, 0.45, 0.78, 4));
        rails.push(polylineWall(r.pts, 0.88, 1.18, 4));
        for (let i = 0; i < r.pts.length; i += 1) {
          const p = r.pts[i];
          posts.push(new THREE.Matrix4().makeTranslation(p[0], p[1] + 0.6, p[2]));
        }
      } else if (r.type === 'tyre') {
        tyres.push(polylineWall(r.pts, -0.2, 1.15, 1.2));
        fences.push(polylineWall(r.pts.map((p) => [p[0], p[1], p[2]] as [number, number, number]), 1.15, 4.6, 3, false));
      } else {
        walls.push(polylineWall(r.pts, -0.3, 1.1, 3));
        fences.push(polylineWall(r.pts, 1.1, 4.4, 3, false));
      }
    }
    // cercas e muros mapeados no OSM
    const lift = (pts: [number, number][]) => pts.map((p) => [p[0], height.sample(p[0], p[1]) - 0.1, p[1]] as [number, number, number]);
    const keep = (pts: [number, number][]) => pts.every((p) => insideArea(p[0], p[1]));
    for (const f of features.lines.fence) if (keep(f)) fences.push(polylineWall(lift(f), 0, 2.2, 3, false));
    for (const w of features.lines.wall) if (keep(w)) walls.push(polylineWall(lift(w), -0.3, 2.4, 3));
    return {
      rails: rails.length ? mergeGeometries(rails) : null,
      posts,
      tyres: tyres.length ? mergeGeometries(tyres) : null,
      walls: walls.length ? mergeGeometries(walls) : null,
      fences: fences.length ? mergeGeometries(fences) : null,
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

  if (!show) return null;
  const sel = (id: string) => ({ kind: 'barrier' as const, id });
  return (
    <group>
      {geos.rails && <mesh geometry={geos.rails} material={structMat(mode, 'guardrail')} castShadow receiveShadow onClick={onSelectEvent(sel('guardrail'))} {...onHoverEvent(sel('guardrail'))} />}
      <primitive object={postMesh} />
      {geos.tyres && <mesh geometry={geos.tyres} material={structMat(mode, 'tyre')} castShadow receiveShadow onClick={onSelectEvent(sel('tyre'))} {...onHoverEvent(sel('tyre'))} />}
      {geos.walls && <mesh geometry={geos.walls} material={structMat(mode, 'concrete')} castShadow receiveShadow onClick={onSelectEvent(sel('wall'))} {...onHoverEvent(sel('wall'))} />}
      {geos.fences && <mesh geometry={geos.fences} material={structMat(mode, 'fence')} onClick={onSelectEvent(sel('fence'))} {...onHoverEvent(sel('fence'))} />}
    </group>
  );
}

export const _wrap = wrapS;

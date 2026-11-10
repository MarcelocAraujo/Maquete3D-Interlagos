import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getWorld, minAreaRect, polyCentroid, type XZ } from '../world/world';
import { useAppStore } from '../../store/useAppStore';
import { structMat } from '../materials/structureMaterials';
import { buildingTop } from '../buildings/Buildings';
import { polylineWall } from './polylineStrip';
import { onHoverEvent, onSelectEvent } from '../selection/events';
import type { Selection } from '../../data/types';

/** Prédio do paddock / hospitalidade (OSM way 138433083). */
export const PADDOCK_BUILDING_ID = 138433083;
const SEL: Selection = { kind: 'structure', id: 'paddock' };

/** Prisma com a pegada do polígono entre y0 e y1 (escala opcional em torno do centroide). */
function prism(poly: XZ[], y0: number, y1: number, scale = 1): THREE.BufferGeometry {
  const [cx, cz] = polyCentroid(poly);
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * scale, -(cz + (z - cz) * scale))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // (sx, sy, d) → (sx, d, -sy)
  g.translate(0, y0, 0);
  return g;
}

/**
 * Volumetria procedural sobre a pegada real do OSM: embasamento de concreto que
 * acompanha o desnível, dois pavimentos com faixas contínuas de vidro e montantes,
 * lajes brancas com beiral, guarda-corpo de vidro e terraço coberto na cobertura
 * (área de hospitalidade). A fachada não é réplica do edifício real.
 */
export function PaddockBuilding() {
  const mode = useAppStore((s) => s.mode);
  const show = useAppStore((s) => s.layers.buildings);

  const g = useMemo(() => {
    const { features } = getWorld();
    const b = features.buildings.find((x) => x.id === PADDOCK_BUILDING_ID);
    if (!b) return null;
    const poly = b.poly;
    const top = buildingTop(b);
    const base = b.b - 1.2;
    const white: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const concrete: THREE.BufferGeometry[] = [];
    const rail: THREE.BufferGeometry[] = [];
    const L1 = top - 9.6; // piso do 1º pavimento de vidro
    // embasamento (absorve o desnível do terreno) com faixa escura de vidro
    concrete.push(prism(poly, base, L1));
    if (L1 - base > 4) glass.push(prism(poly, L1 - 3.4, L1 - 0.8, 1.004));
    // pavimentos: laje branca + faixa de vidro
    const floors: [number, number][] = [
      [L1, L1 + 4.2],
      [L1 + 4.8, top - 0.9],
    ];
    white.push(prism(poly, L1 - 0.6, L1, 1.02));
    for (const [y0, y1] of floors) {
      glass.push(prism(poly, y0, y1, 0.985));
      white.push(prism(poly, y1, y1 + 0.6, 1.025));
    }
    // beiral da cobertura
    white.push(prism(poly, top - 0.3, top + 0.25, 1.05));
    // montantes verticais ao longo do perímetro (a cada 1,8 m)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const c = poly[(i + 1) % poly.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
      for (let t = 0.9; t < len; t += 1.8) {
        const x = a[0] + ((c[0] - a[0]) * t) / len;
        const z = a[1] + ((c[1] - a[1]) * t) / len;
        for (const [y0, y1] of floors) {
          const m = new THREE.BoxGeometry(0.12, y1 - y0, 0.25);
          m.rotateY(-ang);
          m.translate(x, (y0 + y1) / 2, z);
          metal.push(m);
        }
      }
    }
    // guarda-corpo de vidro no perímetro da cobertura
    const ring: [number, number, number][] = [...poly, poly[0]].map(([x, z]) => [x, top + 0.25, z]);
    rail.push(polylineWall(ring, 0, 1.1, 3, false));
    // terraço de hospitalidade: cobertura leve sobre pilares finos, centrada no prédio
    const rect = minAreaRect(poly);
    const ca = Math.cos(rect.angle);
    const sa = Math.sin(rect.angle);
    const cl = rect.length * 0.42;
    const cw = rect.width * 0.4;
    const canopy = new THREE.BoxGeometry(cl, 0.35, cw);
    canopy.rotateY(-rect.angle);
    canopy.translate(rect.center[0], top + 3.8, rect.center[1]);
    white.push(canopy);
    for (let u = -cl / 2 + 2; u <= cl / 2 - 2 + 0.01; u += (cl - 4) / 5)
      for (const v of [-cw / 2 + 1.5, cw / 2 - 1.5]) {
        const col = new THREE.CylinderGeometry(0.16, 0.16, 3.6, 8);
        col.translate(rect.center[0] + u * ca - v * sa, top + 2.05, rect.center[1] + u * sa + v * ca);
        metal.push(col);
      }
    // lanternim de vidro sob a cobertura (salão)
    const hall = new THREE.BoxGeometry(cl * 0.7, 3.2, cw * 0.55);
    hall.rotateY(-rect.angle);
    hall.translate(rect.center[0], top + 1.85, rect.center[1]);
    glass.push(hall);
    const merge = (arr: THREE.BufferGeometry[]) => {
      const clean = arr.map((x) => {
        const y = x.index ? x.toNonIndexed() : x;
        for (const name of Object.keys(y.attributes)) if (!['position', 'normal', 'uv'].includes(name)) y.deleteAttribute(name);
        if (!y.getAttribute('uv')) y.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(y.getAttribute('position').count * 2), 2));
        if (!y.getAttribute('normal')) y.computeVertexNormals();
        return y;
      });
      return clean.length ? mergeGeometries(clean) : null;
    };
    return { white: merge(white), glass: merge(glass), metal: merge(metal), concrete: merge(concrete), rail: merge(rail) };
  }, []);

  if (!show || !g) return null;
  const ev = { onClick: onSelectEvent(SEL), ...onHoverEvent(SEL) };
  return (
    <group>
      {g.concrete && <mesh geometry={g.concrete} material={structMat(mode, 'concrete')} castShadow receiveShadow {...ev} />}
      {g.white && <mesh geometry={g.white} material={structMat(mode, 'white')} castShadow receiveShadow {...ev} />}
      {g.glass && <mesh geometry={g.glass} material={structMat(mode, 'glass')} castShadow receiveShadow {...ev} />}
      {g.metal && <mesh geometry={g.metal} material={structMat(mode, 'darkMetal')} castShadow {...ev} />}
      {g.rail && <mesh geometry={g.rail} material={structMat(mode, 'fence')} {...ev} />}
    </group>
  );
}

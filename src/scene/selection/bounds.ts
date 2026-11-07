import * as THREE from 'three';
import type { Selection } from '../../data/types';
import { cornerById } from '../../data/circuit/corners';
import { straightById } from '../../data/circuit/straights';
import { sectorById } from '../../data/circuit/sectors';
import { frameAt, rangeLength } from '../../data/circuit/track';

/** Registro de caixas envolventes dos objetos selecionáveis (preenchido pelos componentes). */
const registry = new Map<string, { box: THREE.Box3; geometry?: THREE.BufferGeometry; matrix?: THREE.Matrix4 }>();

export const selKey = (s: Selection) => `${s.kind}:${s.id}`;

export function registerSelectable(sel: Selection, box: THREE.Box3, geometry?: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
  registry.set(selKey(sel), { box, geometry, matrix });
}

export function getSelectable(sel: Selection) {
  return registry.get(selKey(sel));
}

/** Intervalo de pista correspondente à seleção (curva, reta ou setor). */
export function trackRangeOf(sel: Selection | null): [number, number] | null {
  if (!sel) return null;
  if (sel.kind === 'corner') {
    const c = cornerById(sel.id);
    return c ? [c.s0, c.s1] : null;
  }
  if (sel.kind === 'straight') {
    const s = straightById(sel.id);
    return s ? [s.s0, s.s1] : null;
  }
  if (sel.kind === 'sector') {
    const s = sectorById(sel.id);
    return s ? [s.s0, s.s1] : null;
  }
  return null;
}

export function boundsOfRange(s0: number, s1: number): THREE.Box3 {
  const box = new THREE.Box3();
  const len = rangeLength(s0, s1);
  const steps = Math.max(4, Math.ceil(len / 8));
  for (let i = 0; i <= steps; i++) {
    const f = frameAt(s0 + (len * i) / steps);
    box.expandByPoint(new THREE.Vector3(f.x + f.lx * f.wl, f.y, f.z + f.lz * f.wl));
    box.expandByPoint(new THREE.Vector3(f.x - f.lx * f.wr, f.y, f.z - f.lz * f.wr));
  }
  return box;
}

export function boundsOf(sel: Selection): THREE.Box3 | null {
  const r = trackRangeOf(sel);
  if (r) return boundsOfRange(r[0], r[1]);
  return getSelectable(sel)?.box ?? null;
}

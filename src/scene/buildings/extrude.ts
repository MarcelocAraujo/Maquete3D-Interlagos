import * as THREE from 'three';
import type { XZ } from '../world/world';
import { polyArea } from '../world/world';

export interface ExtrudeOut {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  wallIdx: number[];
  roofIdx: number[];
}

export function newExtrudeOut(): ExtrudeOut {
  return { pos: [], nor: [], uv: [], col: [], wallIdx: [], roofIdx: [] };
}

/**
 * Extruda uma pegada (polígono) entre y0 e y1. Paredes e cobertura vão para
 * listas de índices separadas (grupos de material). Retorna a faixa de
 * triângulos ocupada (para o picking por faceIndex).
 */
export function extrudeFootprint(
  out: ExtrudeOut,
  polyIn: XZ[],
  y0: number,
  y1: number,
  wallColor: THREE.Color,
  roofColor: THREE.Color,
  uvScale: [number, number] = [28, 25],
) {
  let poly = polyIn;
  if (poly.length < 3) return;
  // garante área positiva no plano (x, z): normal externa da aresta a→b = (dz, -dx)
  if (polyArea(poly) < 0) poly = [...poly].reverse();
  const n = poly.length;
  let perim = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const nx = (b[1] - a[1]) / len;
    const nz = -(b[0] - a[0]) / len;
    const base = out.pos.length / 3;
    out.pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
    for (let k = 0; k < 4; k++) {
      out.nor.push(nx, 0, nz);
      out.col.push(wallColor.r, wallColor.g, wallColor.b);
    }
    const u0 = perim / uvScale[0];
    const u1 = (perim + len) / uvScale[0];
    const v1 = (y1 - y0) / uvScale[1];
    out.uv.push(u0, 0, u1, 0, u1, v1, u0, v1);
    out.wallIdx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    perim += len;
  }
  // cobertura
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  let tris: number[][] = [];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    tris = [];
  }
  const base = out.pos.length / 3;
  for (const p of poly) {
    out.pos.push(p[0], y1, p[1]);
    out.nor.push(0, 1, 0);
    out.uv.push(p[0] / 12, p[1] / 12);
    out.col.push(roofColor.r, roofColor.g, roofColor.b);
  }
  for (const t of tris) {
    // triângulos com normal para cima
    const [a, b, c] = t;
    const ax = poly[a][0], az = poly[a][1];
    const bx = poly[b][0], bz = poly[b][1];
    const cx = poly[c][0], cz = poly[c][1];
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross < 0) out.roofIdx.push(base + a, base + b, base + c);
    else out.roofIdx.push(base + a, base + c, base + b);
  }
}

export function toGeometry(out: ExtrudeOut, withColor = true): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  const idx = [...out.wallIdx, ...out.roofIdx];
  g.setIndex(idx);
  g.addGroup(0, out.wallIdx.length, 0);
  g.addGroup(out.wallIdx.length, out.roofIdx.length, 1);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Geometria isolada de um prédio (usada no realce da seleção). */
export function singleBuildingGeometry(poly: XZ[], y0: number, y1: number) {
  const o = newExtrudeOut();
  const c = new THREE.Color('#ffffff');
  extrudeFootprint(o, poly, y0, y1, c, c);
  const g = toGeometry(o, false);
  g.clearGroups();
  return g;
}

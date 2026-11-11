import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Peças das proteções de pista (pneus, muros, guard-rails e alambrados).
 * Convenção dos módulos instanciados: eixo X local = ao longo da barreira,
 * +Z local = voltado para a pista, Y = altura a partir do chão.
 * A geometria é a mesma nos dois modos; só os materiais mudam.
 */
export type P3 = [number, number, number];

export interface Sample {
  p: THREE.Vector3;
  /** tangente horizontal unitária */
  dir: THREE.Vector3;
  /** vetor horizontal unitário apontando para a pista */
  toTrack: THREE.Vector3;
}

/**
 * Reamostra a polilinha de uma barreira com espaçamento constante sobre uma
 * curva Catmull-Rom (centrípeta): módulos retos não "cortam" a curvatura.
 * side = 1 → barreira à esquerda da pista (a pista fica à direita do sentido da polilinha).
 */
export function resample(pts: P3[], step: number, side: 1 | -1): Sample[] {
  const clean: THREE.Vector3[] = [];
  for (const p of pts) {
    const v = new THREE.Vector3(p[0], p[1], p[2]);
    if (!clean.length || Math.hypot(v.x - clean[clean.length - 1].x, v.z - clean[clean.length - 1].z) > 0.3) clean.push(v);
  }
  if (clean.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
  const len = curve.getLength();
  const n = Math.max(1, Math.round(len / step));
  const ps = curve.getSpacedPoints(n);
  return ps.map((p, i) => {
    const a = ps[Math.max(0, i - 1)];
    const b = ps[Math.min(ps.length - 1, i + 1)];
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    // normal à direita do sentido = (-dz, dx); a pista fica à direita quando side = 1
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    return { p, dir, toTrack: side === 1 ? right : right.clone().negate() };
  });
}

/** Rotação que leva X local ao sentido da barreira e +Z local para a pista. */
export function frameQuat(dir: THREE.Vector3, toTrack: THREE.Vector3, pitch = 0): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(dir, new THREE.Vector3(0, 1, 0), toTrack);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (pitch) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
  return q;
}

/** Faz makeBasis funcionar com base canhota (se dir × up ≠ toTrack, inverte X). */
export function basis(dir: THREE.Vector3, toTrack: THREE.Vector3) {
  const x = dir.clone();
  const z = toTrack.clone();
  // garante base destra: x = y × z
  const expectedX = new THREE.Vector3(0, 1, 0).cross(z);
  if (expectedX.dot(x) < 0) x.negate();
  return { x, z };
}

export function moduleMatrix(pos: THREE.Vector3, dir: THREE.Vector3, toTrack: THREE.Vector3, sx = 1, pitch = 0) {
  const { x, z } = basis(dir, toTrack);
  // se X foi invertido, a inclinação também inverte
  const p = x.dot(dir) < 0 ? -pitch : pitch;
  return new THREE.Matrix4().compose(pos, frameQuat(x, z, p), new THREE.Vector3(sx, 1, 1));
}

// ---------------------------------------------------------------------------
// Pneus: pilha de 4 pneus (0,24 m cada), raio 0,31 m, com furo escuro no topo
// ---------------------------------------------------------------------------
export const TYRE_R = 0.31;
const TYRE_H = 0.24;
export const STACK = 4;

function colorize(g: THREE.BufferGeometry, v: number) {
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(v), 3));
  return g;
}

let tyreStackGeo: THREE.BufferGeometry | null = null;
export function tyreStackGeometry() {
  if (tyreStackGeo) return tyreStackGeo;
  const seg = 8;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < STACK; k++) {
    const y = k * TYRE_H;
    // banda de rodagem com bordas arredondadas (perfil girado)
    // banda + chanfro inferior (o chanfro marca a separação entre os pneus da pilha)
    const prof = [new THREE.Vector2(TYRE_R - 0.045, y), new THREE.Vector2(TYRE_R, y + 0.05), new THREE.Vector2(TYRE_R, y + TYRE_H)];
    const side = new THREE.LatheGeometry(prof, seg, k * 0.35).toNonIndexed();
    side.deleteAttribute('uv');
    parts.push(colorize(side, 1));
  }
  const top = STACK * TYRE_H;
  // flanco superior (anel) e furo
  const ring = new THREE.RingGeometry(0.15, TYRE_R, seg, 1).toNonIndexed();
  ring.rotateX(-Math.PI / 2);
  ring.translate(0, top, 0);
  ring.deleteAttribute('uv');
  parts.push(colorize(ring, 0.85));
  const hole = new THREE.CylinderGeometry(0.15, 0.15, 0.2, seg, 1, true).toNonIndexed();
  hole.scale(-1, 1, 1); // faces internas
  hole.translate(0, top - 0.1, 0);
  hole.deleteAttribute('uv');
  parts.push(colorize(hole, 0.35));
  const floor = new THREE.CircleGeometry(0.15, seg).toNonIndexed();
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, top - 0.2, 0);
  floor.deleteAttribute('uv');
  parts.push(colorize(floor, 0.15));
  tyreStackGeo = mergeGeometries(parts);
  tyreStackGeo.computeVertexNormals();
  return tyreStackGeo;
}

// ---------------------------------------------------------------------------
// Muro de concreto: módulo de 1 m (escalado no comprimento), face levemente
// inclinada e chanfro no topo; parte enterrada absorve irregularidades do terreno
// ---------------------------------------------------------------------------
const wallGeoCache = new Map<string, THREE.BufferGeometry>();
export function wallModuleGeometry(h: number, thick: number) {
  const key = `${h}-${thick}`;
  if (wallGeoCache.has(key)) return wallGeoCache.get(key)!;
  const t = thick / 2;
  const top = t * 0.7;
  const c = 0.05;
  // perfil no plano (z = lateral, y = altura); extrudado ao longo de X
  const shape = new THREE.Shape([
    new THREE.Vector2(-t, -0.8),
    new THREE.Vector2(t, -0.8),
    new THREE.Vector2(t, 0.25),
    new THREE.Vector2(top, h - c),
    new THREE.Vector2(top - c, h),
    new THREE.Vector2(-top + c, h),
    new THREE.Vector2(-top, h - c),
    new THREE.Vector2(-t, 0.25),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  // extrusão em +Z → passa a ser X; lateral (x do perfil) vira Z
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  wallGeoCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
// Guard-rail: lâmina em W (perfil) extrudada ao longo das amostras
// ---------------------------------------------------------------------------
const W_PROFILE: [number, number][] = [
  // [deslocamento para a pista, altura relativa]
  [0, 0],
  [0.045, 0.06],
  [0.045, 0.1],
  [0.01, 0.155],
  [0.045, 0.21],
  [0.045, 0.25],
  [0, 0.31],
];

/** Lâmina W ao longo das amostras, nas alturas pedidas, deslocada `lateral` para a pista. */
export function wBeamGeometry(samples: Sample[], baseHeights: number[], lateral: number): THREE.BufferGeometry | null {
  if (samples.length < 2) return null;
  const pos: number[] = [];
  const idx: number[] = [];
  const cols = W_PROFILE.length;
  for (const h0 of baseHeights) {
    for (const face of [1, -1]) {
      const base = pos.length / 3;
      for (const s of samples) {
        for (const [o, y] of W_PROFILE) {
          const off = lateral + o - (face === -1 ? 0.004 : 0);
          pos.push(s.p.x + s.toTrack.x * off, s.p.y + h0 + y, s.p.z + s.toTrack.z * off);
        }
      }
      for (let r = 0; r < samples.length - 1; r++)
        for (let c = 0; c < cols - 1; c++) {
          const a = base + r * cols + c;
          const b = a + 1;
          const d = a + cols;
          const e = d + 1;
          // orientação decidida depois (testa a normal contra toTrack)
          if (face === 1) idx.push(a, d, b, b, d, e);
          else idx.push(a, b, d, b, e, d);
        }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // garante que a face "1" olha para a pista; se não, inverte todos os triângulos
  const n = g.getAttribute('normal');
  const s0 = samples[0];
  const nx = n.getX(1);
  const nz = n.getZ(1);
  if (nx * s0.toTrack.x + nz * s0.toTrack.z < 0) {
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    g.computeVertexNormals();
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

/** Poste do guard-rail (perfil C ≈ caixa) + espaçadores voltados para a pista. */
let railPostGeo: THREE.BufferGeometry | null = null;
export function railPostGeometry(beams: number[], lateral: number) {
  if (railPostGeo) return railPostGeo;
  const parts: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.1, 1.55, 0.07).translate(0, 1.15 - 1.55 / 2, 0)];
  for (const h of beams) parts.push(new THREE.BoxGeometry(0.09, 0.22, lateral - 0.03).translate(0, h + 0.155, (lateral - 0.03) / 2 + 0.035));
  railPostGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  return railPostGeo;
}

// ---------------------------------------------------------------------------
// Alambrado: poste com braço inclinado para a pista e tubos horizontais
// ---------------------------------------------------------------------------
export const FENCE_ARM = { len: 0.75, angle: 0.62 };

/** Poste de altura `h` acima da base (a base fica 0,3 m enterrada) com braço no topo. */
const fencePostCache = new Map<number, THREE.BufferGeometry>();
export function fencePostGeometry(h: number) {
  if (fencePostCache.has(h)) return fencePostCache.get(h)!;
  const post = new THREE.CylinderGeometry(0.05, 0.05, h + 0.3, 6).translate(0, (h + 0.3) / 2 - 0.3, 0);
  const arm = new THREE.CylinderGeometry(0.035, 0.035, FENCE_ARM.len, 5);
  arm.translate(0, FENCE_ARM.len / 2, 0);
  arm.rotateX(FENCE_ARM.angle); // inclina em direção a +Z (pista)
  arm.translate(0, h, 0);
  const g = mergeGeometries([post.toNonIndexed(), arm.toNonIndexed()]);
  fencePostCache.set(h, g);
  return g;
}

/** Tela do alambrado entre os postes, com a aba inclinada no topo. */
export function fencePanelGeometry(samples: Sample[], baseAt: (i: number) => number, top: number): THREE.BufferGeometry | null {
  if (samples.length < 2) return null;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const armDz = Math.sin(FENCE_ARM.angle) * FENCE_ARM.len;
  const armDy = Math.cos(FENCE_ARM.angle) * FENCE_ARM.len;
  let acc = 0;
  // três linhas por amostra: base, topo vertical, ponta do braço
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i > 0) acc += Math.hypot(s.p.x - samples[i - 1].p.x, s.p.z - samples[i - 1].p.z);
    const b = baseAt(i);
    pos.push(s.p.x, s.p.y + b, s.p.z);
    pos.push(s.p.x, s.p.y + top, s.p.z);
    pos.push(s.p.x + s.toTrack.x * armDz, s.p.y + top + armDy, s.p.z + s.toTrack.z * armDz);
    const u = acc / 3;
    uv.push(u, 0, u, (top - b) / 3, u, (top - b + FENCE_ARM.len) / 3);
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 3;
    const c = a + 3;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
    idx.push(a + 1, c + 1, a + 2, a + 2, c + 1, c + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tubo/barra unitário ao longo de X (escalado no comprimento por instância). */
let barGeo: THREE.BufferGeometry | null = null;
export function barGeometry() {
  if (!barGeo) barGeo = new THREE.BoxGeometry(1, 0.05, 0.05);
  return barGeo;
}

/** Matriz de uma barra entre dois pontos. */
export function barMatrix(a: THREE.Vector3, b: THREE.Vector3) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(len, 1, 1));
}

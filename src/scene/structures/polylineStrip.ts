import * as THREE from 'three';

/** Faixa ao longo de uma polilinha 3D (pit lane, vias elevadas, passarelas). */
export function polylineStrip(
  pts: [number, number, number][],
  width: (i: number, t: number) => number,
  offset: (i: number, t: number) => number = () => 0,
  dy = 0,
  uvScale = 6,
): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const lx = tz;
    const lz = -tx;
    if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    const t = i / (n - 1);
    const w = width(i, t) / 2;
    const o = offset(i, t);
    const p = pts[i];
    pos.push(p[0] + lx * (o + w), p[1] + dy, p[2] + lz * (o + w));
    pos.push(p[0] + lx * (o - w), p[1] + dy, p[2] + lz * (o - w));
    uv.push(0, acc / uvScale, 1, acc / uvScale);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Parede vertical ao longo de uma polilinha (muros, cercas, guard-rails). */
export function polylineWall(pts: [number, number, number][], h0: number, h1: number, uvScale = 4, closedBoth = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (len < 0.01) continue;
    const nx = (b[2] - a[2]) / len;
    const nz = -(b[0] - a[0]) / len;
    const base = pos.length / 3;
    pos.push(a[0], a[1] + h0, a[2], b[0], b[1] + h0, b[2], b[0], b[1] + h1, b[2], a[0], a[1] + h1, a[2]);
    for (let k = 0; k < 4; k++) nor.push(nx, 0, nz);
    uv.push(acc / uvScale, 0, (acc + len) / uvScale, 0, (acc + len) / uvScale, 1, acc / uvScale, 1);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    if (closedBoth) {
      const b2 = pos.length / 3;
      pos.push(a[0], a[1] + h0, a[2], b[0], b[1] + h0, b[2], b[0], b[1] + h1, b[2], a[0], a[1] + h1, a[2]);
      for (let k = 0; k < 4; k++) nor.push(-nx, 0, -nz);
      uv.push(acc / uvScale, 0, (acc + len) / uvScale, 0, (acc + len) / uvScale, 1, acc / uvScale, 1);
      idx.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
    }
    acc += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Bloco (caixa) com transformação, para compor geometrias mescladas. */
export function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y + h / 2, z);
  return g;
}

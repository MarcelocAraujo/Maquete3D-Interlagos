import { getWorld } from '../world/world';
import { TRACK } from '../../data/circuit/track';

/**
 * Raster de ocupação (2 m/célula) usado para não posicionar vegetação sobre
 * vias, prédios, pista, pit lane e água. Rasterizado via canvas 2D.
 */
let OCC: { data: Uint8ClampedArray; size: number; half: number; k: number } | null = null;

export function getOccupancy() {
  if (OCC) return OCC;
  const { features, height } = getWorld();
  const half = height.meta.half;
  const size = 1536;
  const k = size / (2 * half);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = (x: number, z: number): [number, number] => [(x + half) * k, (z + half) * k];
  const poly = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = P(p[0], p[1]);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  };
  const line = (pts: [number, number][], w: number) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = P(p[0], p[1]);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.lineWidth = w * k;
    ctx.stroke();
  };
  for (const b of features.buildings) poly(b.poly);
  for (const g of features.grandstands) poly(g.poly);
  for (const r of features.roads) if (!r.tu) line(r.p, r.w + (r.w > 4 ? 3 : 1));
  for (const w of features.waters) poly(w.poly);
  for (const kt of features.lines.kart) line(kt, 12);
  for (const d of features.lines.drag) line(d, 20);
  for (const l of features.landuse) if (l.k === 'parking' || l.k === 'paved' || l.k === 'pitch' || l.k === 'pool' || l.k === 'helipad') poly(l.poly);
  // pista + áreas de escape (faixa larga)
  const track: [number, number][] = [];
  for (let i = 0; i < TRACK.n; i += 2) track.push([TRACK.x[i], TRACK.z[i]]);
  track.push(track[0]);
  line(track, 62);
  const pit: [number, number][] = TRACK.pit.x.map((x, i) => [x, TRACK.pit.z[i]]);
  line(pit, 30);
  const img = ctx.getImageData(0, 0, size, size).data;
  const data = new Uint8ClampedArray(size * size);
  for (let i = 0; i < size * size; i++) data[i] = img[i * 4];
  OCC = { data, size, half, k };
  return OCC;
}

export function occupied(x: number, z: number) {
  const o = getOccupancy();
  const i = Math.floor((x + o.half) * o.k);
  const j = Math.floor((z + o.half) * o.k);
  if (i < 0 || j < 0 || i >= o.size || j >= o.size) return true;
  return o.data[j * o.size + i] > 40;
}

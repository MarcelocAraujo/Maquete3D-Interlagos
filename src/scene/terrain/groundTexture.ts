import * as THREE from 'three';
import { getWorld, rng, type XZ } from '../world/world';
import type { VisualMode } from '../../store/useAppStore';
import { TRACK } from '../../data/circuit/track';

/**
 * Pinta a cobertura do solo (OSM) em um canvas georreferenciado que cobre todo o
 * terreno. Cada modo visual tem sua própria paleta — o GAME MODE com variações
 * naturais, o SIMULATION MODE com cores chapadas de maquete.
 */
const PALETTES = {
  sim: {
    base: '#8a867b',
    complex: '#6c8246',
    grass: '#72884a',
    park: '#6d8747',
    forest: '#3f5a2b',
    scrub: '#6c7a42',
    wetland: '#56704c',
    parking: '#4f5154',
    pitch: '#5d8d3c',
    pool: '#3aa0c8',
    bare: '#8f7656',
    urban: '#87847c',
    paved: '#5d5f62',
    helipad: '#707275',
    road: '#45474a',
    sidewalk: '#a39f95',
    roadLine: '#d8d2b8',
    water: '#3f6f7a',
    kart: '#3f4144',
    corridor: '#6a8145',
  },
  game: {
    base: '#363b35',
    complex: '#33502e',
    grass: '#36552f',
    park: '#34532e',
    forest: '#2a4426',
    scrub: '#334b2d',
    wetland: '#304a33',
    parking: '#45484b',
    pitch: '#3a5c33',
    pool: '#35667a',
    bare: '#4d4a3d',
    urban: '#3a3f3a',
    paved: '#45484b',
    helipad: '#45484b',
    road: '#4c5054',
    sidewalk: '#41463f',
    roadLine: '#5a5e60',
    water: '#2a5664',
    kart: '#4a4e52',
    corridor: '#36552f',
  },
} as const;

const cache = new Map<string, THREE.CanvasTexture>();

export function groundTexture(mode: VisualMode, size: number): THREE.CanvasTexture {
  const t0 = performance.now();
  const key = `${mode}-${size}`;
  if (cache.has(key)) return cache.get(key)!;
  const { height, features } = getWorld();
  const H = height.meta.half;
  const pal = PALETTES[mode];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const k = size / (2 * H);
  const tx = (p: XZ): [number, number] => [(p[0] + H) * k, (p[1] + H) * k];

  const poly = (pts: XZ[], fill: string) => {
    if (pts.length < 3) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = tx(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const line = (pts: XZ[], w: number, color: string, dash?: number[]) => {
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = tx(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineWidth = Math.max(1, w * k);
    ctx.strokeStyle = color;
    ctx.lineCap = dash ? 'butt' : 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash ? dash.map((d) => d * k) : []);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // 1. base urbana
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, size, size);
  if (mode === 'sim') mottle(ctx, size, 0.08, 900, 3, ['#7d7a70', '#97928a', '#8a8579']);

  // 2. interior do complexo = gramado
  poly(features.complex, pal.complex);

  // 3. coberturas OSM (maiores primeiro)
  const order = [...features.landuse].sort((a, b) => b.area - a.area);
  for (const l of order) {
    const c = (pal as Record<string, string>)[l.k];
    if (c) poly(l.poly, c);
  }

  // 4. corredor gramado ao longo da pista (verge)
  const corridor: XZ[] = [];
  for (let i = 0; i < TRACK.n; i += 2) corridor.push([TRACK.x[i], TRACK.z[i]]);
  corridor.push(corridor[0]);
  line(corridor, 46, pal.corridor);

  if (mode === 'sim') {
    // manchas de grama seca/verde, típicas do miolo de Interlagos
    clipTo(ctx, features.complex, tx, () => mottle(ctx, size, 0.3, 2400, 9, ['#9a9259', '#7a8a45', '#5c7a3a', '#a8996a', '#848a4f']));
  }

  // 5. vias: calçada + leito
  const roads = [...features.roads].filter((r) => !r.tu);
  for (const r of roads) if (r.w >= 5) line(r.p, r.w + 3.5, pal.sidewalk);
  for (const r of roads) line(r.p, r.w, r.w <= 2.5 ? pal.sidewalk : pal.road);
  if (mode === 'sim') for (const r of roads) if (r.w >= 8) line(r.p, 0.15, pal.roadLine, [3, 6]);

  // 6. kartódromo e pista de arrancada
  for (const kt of features.lines.kart) line(kt, 8, pal.kart);
  for (const dr of features.lines.drag) line(dr, 16, pal.kart);

  // 7. água (o espelho d'água é uma malha própria; aqui só a margem)
  for (const w of features.waters) poly(w.poly, pal.water);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  cache.set(key, tex);
  if (import.meta.env.DEV) console.info(`[i3d] groundTexture ${key}: ${(performance.now() - t0).toFixed(0)} ms`);
  return tex;
}

function clipTo(ctx: CanvasRenderingContext2D, pts: XZ[], tx: (p: XZ) => [number, number], fn: () => void) {
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = tx(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  fn();
  ctx.restore();
}

/** Manchas aleatórias suaves para quebrar a uniformidade. */
function mottle(ctx: CanvasRenderingContext2D, size: number, alpha: number, count: number, radius: number, colors: string[]) {
  const r = rng(size + count);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = (radius + r() * radius * 3) * (size / 2048);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = colors[Math.floor(r() * colors.length)];
    g.addColorStop(0, hexA(c, alpha));
    g.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

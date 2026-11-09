import * as THREE from 'three';
import { getWorld, rng, type XZ } from '../world/world';
import type { VisualMode } from '../../store/useAppStore';
import { TRACK } from '../../data/circuit/track';
import { styleOf } from '../modes/modeStyles';

/**
 * Pinta a cobertura do solo (OSM) em um canvas georreferenciado que cobre todo o
 * terreno. Cada modo visual tem sua própria paleta — o GAME MODE com variações
 * naturais, o SIMULATION MODE com cores chapadas de maquete.
 */

const cache = new Map<string, THREE.CanvasTexture>();

export function groundTexture(mode: VisualMode, size: number): THREE.CanvasTexture {
  const t0 = performance.now();
  const key = `${mode}-${size}`;
  if (cache.has(key)) return cache.get(key)!;
  const { height, features } = getWorld();
  const H = height.meta.half;
  const pal = styleOf(mode).ground;
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
  mottle(ctx, size, 0.1, 900, 3, pal.urbanPatches);

  // 2. interior do complexo = gramado
  poly(features.complex, pal.complex);

  // 3. coberturas OSM (maiores primeiro)
  const order = [...features.landuse].sort((a, b) => b.area - a.area);
  for (const l of order) {
    const c = (pal as unknown as Record<string, string>)[l.k];
    if (c) poly(l.poly, c);
  }

  // 4. corredor gramado ao longo da pista (verge)
  const corridor: XZ[] = [];
  for (let i = 0; i < TRACK.n; i += 2) corridor.push([TRACK.x[i], TRACK.z[i]]);
  corridor.push(corridor[0]);
  line(corridor, 46, pal.corridor);

  // manchas de grama (seca/verde, terra exposta no modo realista; tons cartoon no GAME MODE)
  clipTo(ctx, features.complex, tx, () => mottle(ctx, size, pal.patchAlpha, pal.patchCount, mode === 'sim' ? 9 : 14, pal.patches));

  // 5. vias: calçada + leito
  const roads = [...features.roads].filter((r) => !r.tu);
  for (const r of roads) if (r.w >= 5) line(r.p, r.w + 3.5, pal.sidewalk);
  for (const r of roads) line(r.p, r.w, r.w <= 2.5 ? pal.sidewalk : pal.road);
  for (const r of roads) if (r.w >= 8) line(r.p, mode === 'sim' ? 0.15 : 0.3, pal.roadLine, [3, 6]);

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

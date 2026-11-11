import * as THREE from 'three';
import { rng } from '../world/world';

/** Ruído de valor tileável (periódico) com oitavas. */
function tileNoise(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    const r = rng(seed + o * 101);
    const lat = new Float32Array(p * p).map(() => r());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p;
        const fy = (y / size) * p;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = lat[(y0 % p) * p + (x0 % p)];
        const b = lat[(y0 % p) * p + ((x0 + 1) % p)];
        const c = lat[((y0 + 1) % p) * p + (x0 % p)];
        const d = lat[((y0 + 1) % p) * p + ((x0 + 1) % p)];
        out[y * size + x] += (a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function makeTexture(data: Uint8Array, size: number, srgb: boolean, repeat = true) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function normalFromHeight(h: Float32Array, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  return data;
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, fn: () => T): T {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

/** Asfalto: agregado claro sobre ligante escuro, com variação de tom. */
export const asphaltTextures = () =>
  memo('asphalt', () => {
    const S = 512;
    const coarse = tileNoise(S, 4, 3, 11);
    const fine = tileNoise(S, 64, 3, 23);
    const r = rng(7);
    const color = new Uint8Array(S * S * 4);
    const height = new Float32Array(S * S);
    const rough = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      let v = 0.33 + (coarse[i] - 0.5) * 0.06 + (fine[i] - 0.5) * 0.12;
      const speck = r();
      let hgt = fine[i] * 0.6;
      if (speck > 0.965) {
        v += 0.18 * r(); // pedrisco claro
        hgt += 0.5;
      } else if (speck < 0.05) {
        v -= 0.06;
        hgt -= 0.3;
      }
      height[i] = hgt;
      const c = Math.max(0, Math.min(1, v));
      color[i * 4] = c * 255 * 0.98;
      color[i * 4 + 1] = c * 255;
      color[i * 4 + 2] = c * 255 * 1.03;
      color[i * 4 + 3] = 255;
      const ro = 0.82 + (fine[i] - 0.5) * 0.2;
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = Math.min(255, ro * 255);
      rough[i * 4 + 3] = 255;
    }
    return {
      map: makeTexture(color, S, true),
      normalMap: makeTexture(normalFromHeight(height, S, 2.2), S, false),
      roughnessMap: makeTexture(rough, S, false),
    };
  });

/** Textura de detalhe neutra (multiplicativa) para grama e terreno. */
export const detailTexture = () =>
  memo('detail', () => {
    const S = 256;
    const n1 = tileNoise(S, 8, 4, 31);
    const n2 = tileNoise(S, 32, 2, 37);
    const r = rng(41);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const v = 0.78 + (n1[i] - 0.5) * 0.35 + (n2[i] - 0.5) * 0.2 + (r() - 0.5) * 0.12;
      const c = Math.max(0, Math.min(1, v)) * 255;
      data[i * 4] = c;
      data[i * 4 + 1] = c;
      data[i * 4 + 2] = c;
      data[i * 4 + 3] = 255;
    }
    return makeTexture(data, S, false);
  });

/** Concreto claro para muros, calçadas e boxes. */
export const concreteTexture = () =>
  memo('concrete', () => {
    const S = 256;
    const n = tileNoise(S, 8, 4, 53);
    const r = rng(59);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const v = 0.82 + (n[i] - 0.5) * 0.18 + (r() - 0.5) * 0.06;
      const c = Math.max(0, Math.min(1, v)) * 255;
      data[i * 4] = c;
      data[i * 4 + 1] = c * 0.99;
      data[i * 4 + 2] = c * 0.96;
      data[i * 4 + 3] = 255;
    }
    return makeTexture(data, S, true);
  });

/** Tela de alambrado (alpha) para cercas de proteção. */
export const fenceTexture = () =>
  memo('fence', () => {
    // Tela de alambrado: malha losangular densa sobre um fundo translúcido (mantém a
    // tela visível à distância). Postes e tubos são geometria 3D separada.
    const S = 128;
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d1 = Math.abs(((x + y) % 8) - 4);
        const d2 = Math.abs(((x - y + 128) % 8) - 4);
        const wire = Math.max(0, 1 - Math.min(d1, d2) / 0.9);
        const i = (y * S + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 200;
        data[i + 3] = Math.min(1, 0.3 + wire * 0.55) * 255;
      }
    return makeTexture(data, S, true);
  });

/** Brita (caixa de cascalho): grãos claros e escuros sobre base bege-acinzentada. */
export const gravelTexture = () =>
  memo('gravel', () => {
    const S = 256;
    const n = tileNoise(S, 16, 3, 83);
    const r = rng(89);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const g = r();
      const grain = g < 0.18 ? -0.22 : g > 0.86 ? 0.16 : (g - 0.5) * 0.1;
      const v = 0.8 + (n[i] - 0.5) * 0.22 + grain;
      const c = Math.max(0, Math.min(1, v)) * 255;
      data[i * 4] = c;
      data[i * 4 + 1] = c * 0.97;
      data[i * 4 + 2] = c * 0.92;
      data[i * 4 + 3] = 255;
    }
    return makeTexture(data, S, true);
  });

/** Fachada com janelas (cor + emissivo noturno). */
export const facadeTextures = () =>
  memo('facade', () => {
    const S = 256;
    const r = rng(71);
    const color = new Uint8Array(S * S * 4);
    const emiss = new Uint8Array(S * S * 4);
    const cells = 8; // 8x8 janelas por repetição
    const lit: number[] = [];
    for (let k = 0; k < cells * cells; k++) lit.push(r() < 0.35 ? 0.6 + r() * 0.4 : 0);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const cx = Math.floor((x / S) * cells);
        const cy = Math.floor((y / S) * cells);
        const fx = ((x / S) * cells) % 1;
        const fy = ((y / S) * cells) % 1;
        const win = fx > 0.18 && fx < 0.82 && fy > 0.25 && fy < 0.78;
        const i = (y * S + x) * 4;
        const wall = 0.92;
        const v = win ? 0.38 : wall;
        color[i] = v * 255;
        color[i + 1] = v * 255;
        color[i + 2] = (win ? 0.44 : wall * 0.97) * 255;
        color[i + 3] = 255;
        const e = win ? lit[cy * cells + cx] : 0;
        emiss[i] = e * 255;
        emiss[i + 1] = e * 0.82 * 255;
        emiss[i + 2] = e * 0.55 * 255;
        emiss[i + 3] = 255;
      }
    return { map: makeTexture(color, S, true), emissiveMap: makeTexture(emiss, S, true) };
  });

/** Gradiente radial para poças de luz (iluminação noturna fake, aditiva). */
export const lightPoolTexture = () =>
  memo('lightpool', () => {
    const S = 128;
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
        const a = Math.max(0, 1 - d);
        const v = Math.pow(a, 2.2);
        const i = (y * S + x) * 4;
        data[i] = 255;
        data[i + 1] = 230;
        data[i + 2] = 190;
        data[i + 3] = v * 255;
      }
    return makeTexture(data, S, true, false);
  });

/** Brilho (sprite) de luminária. */
export const glowTexture = () =>
  memo('glow', () => {
    const S = 64;
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
        const v = Math.max(0, 1 - d) ** 3;
        const i = (y * S + x) * 4;
        data[i] = 255;
        data[i + 1] = 240;
        data[i + 2] = 210;
        data[i + 3] = v * 255;
      }
    return makeTexture(data, S, true, false);
  });

/** Concreto com padrão hexagonal (muros estilizados do GAME MODE). */
export const hexTexture = () =>
  memo('hex', () => {
    const W = 128;
    const H = 222; // ~ proporção de hexágonos regulares
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(70,64,52,0.55)';
    ctx.lineWidth = 3;
    const r = 37;
    const hex = (cx: number, cy: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    };
    for (const [cx, cy] of [
      [0, 0], [W, 0], [0, H], [W, H], [W / 2 + 0, H / 2], [0, H / 2 * 0 + 111], [W, 111], [64, 0], [64, H],
    ] as [number, number][]) hex(cx, cy);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });

/**
 * Fachada comercial com janelas em faixa (edifícios do complexo): por repetição
 * (26 x 24 m), 6 pavimentos de 4 m com peitoril claro e faixa de vidro escuro,
 * montantes a cada ~1,6 m. Mapa emissivo com parte das faixas acesas à noite.
 */
export const ribbonFacadeTextures = () =>
  memo('ribbon', () => {
    const S = 256;
    const r = rng(97);
    const color = new Uint8Array(S * S * 4);
    const emiss = new Uint8Array(S * S * 4);
    const floors = 6;
    const cols = 16;
    const lit: number[] = [];
    for (let k = 0; k < floors * cols; k++) lit.push(r() < 0.4 ? 0.5 + r() * 0.5 : 0);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const fy = ((y / S) * floors) % 1;
        const fx = ((x / S) * cols) % 1;
        const cy = Math.floor((y / S) * floors);
        const cx = Math.floor((x / S) * cols);
        const glass = fy > 0.28 && fy < 0.86;
        const mullion = glass && (fx < 0.06 || fx > 0.94);
        const i = (y * S + x) * 4;
        const v = mullion ? 0.55 : glass ? 0.3 : 0.93;
        color[i] = v * 255;
        color[i + 1] = (glass && !mullion ? 0.35 : v) * 255;
        color[i + 2] = (glass && !mullion ? 0.42 : v * 0.97) * 255;
        color[i + 3] = 255;
        const e = glass && !mullion ? lit[cy * cols + cx] : 0;
        emiss[i] = e * 255;
        emiss[i + 1] = e * 0.85 * 255;
        emiss[i + 2] = e * 0.62 * 255;
        emiss[i + 3] = 255;
      }
    return { map: makeTexture(color, S, true), emissiveMap: makeTexture(emiss, S, true) };
  });

import * as THREE from 'three';
import { rng } from '../world/world';

/**
 * Texturas procedurais do projeto. Todas são tileáveis e geradas uma única vez
 * (memo). Onde faz diferença, saem como conjunto PBR (cor + normal + rugosidade)
 * derivado de um mesmo mapa de altura, para que relevo e brilho coincidam.
 */

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
      const fy = (y / size) * p;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const row0 = (y0 % p) * p;
      const row1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = lat[row0 + (x0 % p)];
        const b = lat[row0 + ((x0 + 1) % p)];
        const c = lat[row1 + (x0 % p)];
        const d = lat[row1 + ((x0 + 1) % p)];
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

/** Ruído 1D tileável (manchas verticais de escorrimento, veios). */
function lineNoise(size: number, period: number, seed: number): Float32Array {
  const r = rng(seed);
  const lat = new Float32Array(period).map(() => r());
  const out = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const f = (x / size) * period;
    const i = Math.floor(f);
    const t = f - i;
    const s = t * t * (3 - 2 * t);
    out[x] = lat[i % period] * (1 - s) + lat[(i + 1) % period] * s;
  }
  return out;
}

function makeTexture(data: Uint8Array, size: number, srgb: boolean, repeat = true, height = size) {
  const tex = new THREE.DataTexture(data, size, height, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 16; // reduzido pelo renderizador se a GPU oferecer menos
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function normalFromHeight(h: Float32Array, size: number, strength: number, height = size) {
  const data = new Uint8Array(size * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + height) % height) * size + x];
      const d = h[((y + 1) % height) * size + x];
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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Mapa de rugosidade (cinza) a partir de uma função por texel. */
function grayMap(size: number, fn: (i: number) => number, height = size) {
  const data = new Uint8Array(size * height * 4);
  for (let i = 0; i < size * height; i++) {
    const v = clamp01(fn(i)) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, fn: () => T): T {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

// ---------------------------------------------------------------------------
// Asfalto
// ---------------------------------------------------------------------------
/**
 * Asfalto de pista (1024 px por repetição de 7 m): agregado fino claro sobre
 * ligante escuro, manchas de tom em três escalas, pedriscos salientes e juntas
 * seladas finas. O shader da pista soma uma variação de grande escala por cima
 * para a repetição não aparecer nas retas.
 */
export const asphaltTextures = (): PbrMaps =>
  memo('asphalt', () => {
    const S = 1024;
    const coarse = tileNoise(S, 3, 2, 11);
    const mid = tileNoise(S, 24, 3, 17);
    const fine = tileNoise(S, 160, 3, 23);
    const r = rng(7);
    const color = new Uint8Array(S * S * 4);
    const height = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      let v = 0.34 + (coarse[i] - 0.5) * 0.07 + (mid[i] - 0.5) * 0.09 + (fine[i] - 0.5) * 0.17;
      const grain = r();
      v += (grain - 0.5) * 0.07;
      let hgt = fine[i] * 0.7 + mid[i] * 0.3;
      let ro = 0.8 + (fine[i] - 0.5) * 0.24;
      if (grain > 0.972) {
        // pedrisco claro saliente, um pouco mais liso
        v += 0.16 + 0.14 * r();
        hgt += 0.55;
        ro -= 0.12;
      } else if (grain < 0.035) {
        // vazio entre agregados
        v -= 0.07;
        hgt -= 0.35;
      }
      // juntas seladas / trincas finas (linhas de nível do ruído médio)
      const j = Math.abs(mid[i] - 0.5);
      if (j < 0.004 && fine[i] > 0.45) {
        v -= 0.09;
        hgt -= 0.5;
        ro += 0.08;
      }
      height[i] = hgt;
      rough[i] = ro;
      const c = clamp01(v);
      color[i * 4] = c * 255 * 0.985;
      color[i * 4 + 1] = c * 255;
      color[i * 4 + 2] = c * 255 * 1.03;
      color[i * 4 + 3] = 255;
    }
    return {
      map: makeTexture(color, S, true),
      normalMap: makeTexture(normalFromHeight(height, S, 2.6), S, false),
      roughnessMap: makeTexture(grayMap(S, (i) => rough[i]), S, false),
    };
  });

// ---------------------------------------------------------------------------
// Grama / terreno (detalhe multiplicativo)
// ---------------------------------------------------------------------------
/**
 * Textura de detalhe neutra (multiplicativa) para grama e terreno, com quatro
 * escalas: manchas, touceiras, folhas e grão. O terreno a amostra em três
 * escalas no shader (1,3 m, 5 m e 41 m).
 */
export const detailTexture = () =>
  memo('detail', () => {
    const S = 512;
    const n1 = tileNoise(S, 6, 4, 31);
    const n2 = tileNoise(S, 24, 3, 37);
    const n3 = tileNoise(S, 96, 2, 43);
    const r = rng(41);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const v = 0.78 + (n1[i] - 0.5) * 0.34 + (n2[i] - 0.5) * 0.24 + (n3[i] - 0.5) * 0.18 + (r() - 0.5) * 0.14;
      const c = clamp01(v) * 255;
      data[i * 4] = c;
      data[i * 4 + 1] = c;
      data[i * 4 + 2] = c;
      data[i * 4 + 3] = 255;
    }
    return makeTexture(data, S, false);
  });

// ---------------------------------------------------------------------------
// Concreto
// ---------------------------------------------------------------------------
/**
 * Concreto (512 px por 3–4 m): reboco com grão, poros, escorrimentos verticais
 * suaves e leve variação de placa. Sai com normal e rugosidade.
 */
export const concreteMaps = (): PbrMaps =>
  memo('concrete-pbr', () => {
    const S = 512;
    const n = tileNoise(S, 6, 5, 53);
    const plate = tileNoise(S, 2, 1, 55);
    const streak = lineNoise(S, 14, 57);
    const r = rng(59);
    const color = new Uint8Array(S * S * 4);
    const height = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        let v = 0.84 + (n[i] - 0.5) * 0.16 + (plate[i] - 0.5) * 0.06 + (streak[x] - 0.5) * 0.05 * (0.5 + n[i]) + (r() - 0.5) * 0.05;
        let hgt = n[i] * 0.6 + (r() - 0.5) * 0.1;
        let ro = 0.88 + (n[i] - 0.5) * 0.12;
        if (r() < 0.012) {
          // poros
          v -= 0.1;
          hgt -= 0.6;
          ro += 0.05;
        }
        height[i] = hgt;
        rough[i] = ro;
        const c = clamp01(v);
        color[i * 4] = c * 255;
        color[i * 4 + 1] = c * 255 * 0.99;
        color[i * 4 + 2] = c * 255 * 0.955;
        color[i * 4 + 3] = 255;
      }
    return {
      map: makeTexture(color, S, true),
      normalMap: makeTexture(normalFromHeight(height, S, 1.5), S, false),
      roughnessMap: makeTexture(grayMap(S, (i) => rough[i]), S, false),
    };
  });

/** Compatibilidade: só o mapa de cor do concreto. */
export const concreteTexture = () => concreteMaps().map;

// ---------------------------------------------------------------------------
// Metal escovado (rugosidade) — guard-rails, postes, montantes
// ---------------------------------------------------------------------------
export const brushedRoughnessTexture = () =>
  memo('brushed', () => {
    const S = 256;
    const streaks = lineNoise(S, 64, 61);
    const fine = tileNoise(S, 64, 2, 63);
    const r = rng(67);
    // riscos ao longo de X (direção do comprimento das peças)
    return makeTexture(
      grayMap(S, (i) => {
        const y = Math.floor(i / S);
        return 0.42 + (streaks[y] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.12 + (r() - 0.5) * 0.06;
      }),
      S,
      false,
    );
  });

// ---------------------------------------------------------------------------
// Pneus (normal + rugosidade): banda com sulcos circunferenciais e flanco
// ---------------------------------------------------------------------------
/**
 * UV da pilha: u = ao redor do pneu, v = 0 (chanfro inferior) → 1 (topo da banda).
 * Três sulcos na banda, grão de borracha e leve relevo radial no flanco.
 */
export const tyreMaps = (): { normalMap: THREE.Texture; roughnessMap: THREE.Texture } =>
  memo('tyre', () => {
    const W = 128;
    const H = 128;
    const n = tileNoise(W, 16, 3, 71);
    const r = rng(73);
    const height = new Float32Array(W * H);
    const rough = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let h = n[i] * 0.25;
        let ro = 0.9 + (n[i] - 0.5) * 0.1;
        if (v > 0.5) {
          // banda de rodagem: sulcos a cada ~0,17 da altura
          const t = (v - 0.5) / 0.5;
          const g = Math.abs(((t * 3 + 0.5) % 1) - 0.5); // 0 no centro do sulco
          if (g < 0.09) {
            h -= 0.9 * (1 - g / 0.09);
            ro += 0.06;
          }
          // ranhuras finas transversais
          if (((x * 7) % 16) < 2 && g > 0.15) h -= 0.15;
        } else {
          // flanco: relevo radial suave (letras/nervuras)
          h += 0.2 * Math.sin((x / W) * Math.PI * 24) * (1 - Math.abs(v - 0.25) / 0.25);
          ro -= 0.05;
        }
        h += (r() - 0.5) * 0.08;
        height[i] = h;
        rough[i] = ro;
      }
    }
    return {
      normalMap: makeTexture(normalFromHeight(height, W, 2.2, H), W, false, true, H),
      roughnessMap: makeTexture(grayMap(W, (i) => rough[i], H), W, false, true, H),
    };
  });

// ---------------------------------------------------------------------------
// Tela de alambrado
// ---------------------------------------------------------------------------
/**
 * Malha losangular com fio de ~2 px suavizado sobre fundo translúcido (a
 * tela continua visível à distância, sem cintilar). Postes e tubos são 3D.
 */
export const fenceTexture = () =>
  memo('fence', () => {
    const S = 256;
    const data = new Uint8Array(S * S * 4);
    const cell = 12;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d1 = Math.abs(((x + y) % cell) - cell / 2);
        const d2 = Math.abs(((x - y + S) % cell) - cell / 2);
        const wire = clamp01(1.4 - Math.min(d1, d2));
        const i = (y * S + x) * 4;
        const shade = 190 + wire * 40;
        data[i] = data[i + 1] = data[i + 2] = shade;
        data[i + 3] = Math.min(1, 0.26 + wire * 0.62) * 255;
      }
    return makeTexture(data, S, true);
  });

// ---------------------------------------------------------------------------
// Brita
// ---------------------------------------------------------------------------
export const gravelMaps = (): PbrMaps =>
  memo('gravel-pbr', () => {
    const S = 512;
    const n = tileNoise(S, 12, 3, 83);
    const r = rng(89);
    const color = new Uint8Array(S * S * 4);
    const height = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const g = r();
      const grain = g < 0.16 ? -0.2 : g > 0.84 ? 0.16 : (g - 0.5) * 0.1;
      const v = 0.8 + (n[i] - 0.5) * 0.2 + grain;
      height[i] = n[i] * 0.4 + (g > 0.84 ? 0.5 : g < 0.16 ? -0.4 : 0);
      const c = clamp01(v) * 255;
      color[i * 4] = c;
      color[i * 4 + 1] = c * 0.97;
      color[i * 4 + 2] = c * 0.92;
      color[i * 4 + 3] = 255;
    }
    return {
      map: makeTexture(color, S, true),
      normalMap: makeTexture(normalFromHeight(height, S, 2.4), S, false),
      roughnessMap: makeTexture(grayMap(4, () => 0.95), 4, false),
    };
  });
export const gravelTexture = () => gravelMaps().map;

// ---------------------------------------------------------------------------
// Fachadas
// ---------------------------------------------------------------------------
/**
 * Fachada residencial/mista (512 px por 26 × 24 m): 8 × 8 janelas com caixilho
 * claro, peitoril com sombra, vidro com gradiente e parede com grão. Mapa
 * emissivo com parte das janelas acesas.
 */
export const facadeTextures = () =>
  memo('facade', () => {
    const S = 512;
    const r = rng(71);
    const wallN = tileNoise(S, 8, 3, 75);
    const color = new Uint8Array(S * S * 4);
    const emiss = new Uint8Array(S * S * 4);
    const cells = 8;
    const lit: number[] = [];
    for (let k = 0; k < cells * cells; k++) lit.push(r() < 0.35 ? 0.6 + r() * 0.4 : 0);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const cx = Math.floor((x / S) * cells);
        const cy = Math.floor((y / S) * cells);
        const fx = ((x / S) * cells) % 1;
        const fy = ((y / S) * cells) % 1;
        const inWin = fx > 0.2 && fx < 0.8 && fy > 0.28 && fy < 0.76;
        const inFrame = !inWin && fx > 0.17 && fx < 0.83 && fy > 0.25 && fy < 0.79;
        const sill = !inWin && !inFrame && fx > 0.15 && fx < 0.85 && fy >= 0.79 && fy < 0.83;
        const i = (y * S + x) * 4;
        let rr: number;
        let gg: number;
        let bb: number;
        if (inWin) {
          // vidro: gradiente (céu em cima) + divisória central
          const g = 0.3 + (fy - 0.28) * 0.25;
          const bar = Math.abs(fx - 0.5) < 0.012 || Math.abs(fy - 0.52) < 0.012;
          rr = bar ? 0.8 : g * 0.9;
          gg = bar ? 0.8 : g;
          bb = bar ? 0.8 : g * 1.12;
        } else if (inFrame) {
          rr = gg = bb = 0.96;
        } else if (sill) {
          rr = gg = bb = 0.62;
        } else {
          const w = 0.9 + (wallN[y * S + x] - 0.5) * 0.1 + (r() - 0.5) * 0.04;
          rr = w;
          gg = w;
          bb = w * 0.97;
        }
        color[i] = clamp01(rr) * 255;
        color[i + 1] = clamp01(gg) * 255;
        color[i + 2] = clamp01(bb) * 255;
        color[i + 3] = 255;
        const e = inWin ? lit[cy * cells + cx] : 0;
        emiss[i] = e * 255;
        emiss[i + 1] = e * 0.82 * 255;
        emiss[i + 2] = e * 0.55 * 255;
        emiss[i + 3] = 255;
      }
    return { map: makeTexture(color, S, true), emissiveMap: makeTexture(emiss, S, true) };
  });

/**
 * Fachada comercial com janelas em faixa (edifícios do complexo): 6 pavimentos,
 * peitoril claro com grão, faixa de vidro escuro com reflexo gradiente e
 * montantes a cada ~1,6 m. Parte das faixas acesa à noite.
 */
export const ribbonFacadeTextures = () =>
  memo('ribbon', () => {
    const S = 512;
    const r = rng(97);
    const wallN = tileNoise(S, 8, 3, 99);
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
        const glass = fy > 0.3 && fy < 0.86;
        const mullion = glass && (fx < 0.05 || fx > 0.95);
        const lintel = !glass && fy >= 0.86 && fy < 0.9;
        const i = (y * S + x) * 4;
        let rr: number;
        let gg: number;
        let bb: number;
        if (mullion) rr = gg = bb = 0.5;
        else if (glass) {
          const g = 0.26 + (fy - 0.3) * 0.3;
          rr = g * 0.9;
          gg = g;
          bb = g * 1.15;
        } else if (lintel) rr = gg = bb = 0.7;
        else {
          const w = 0.92 + (wallN[y * S + x] - 0.5) * 0.08 + (r() - 0.5) * 0.03;
          rr = w;
          gg = w;
          bb = w * 0.97;
        }
        color[i] = clamp01(rr) * 255;
        color[i + 1] = clamp01(gg) * 255;
        color[i + 2] = clamp01(bb) * 255;
        color[i + 3] = 255;
        const e = glass && !mullion ? lit[cy * cols + cx] : 0;
        emiss[i] = e * 255;
        emiss[i + 1] = e * 0.85 * 255;
        emiss[i + 2] = e * 0.62 * 255;
        emiss[i + 3] = 255;
      }
    return { map: makeTexture(color, S, true), emissiveMap: makeTexture(emiss, S, true) };
  });

// ---------------------------------------------------------------------------
// Telhados
// ---------------------------------------------------------------------------
/**
 * Telha cerâmica (512 px por 12 m de UV): 32 fiadas de telhas canal com perfil
 * curvo, juntas escuras e variação de tom por telha. Multiplicativa sobre a cor
 * do telhado (vertex color). Normal acentua as fiadas.
 */
export const roofTileMaps = (): PbrMaps =>
  memo('rooftile', () => {
    const S = 512;
    const rows = 32;
    const cols = 48;
    const r = rng(103);
    const tileTone: number[] = [];
    for (let k = 0; k < rows * cols; k++) tileTone.push(0.9 + r() * 0.2);
    const color = new Uint8Array(S * S * 4);
    const height = new Float32Array(S * S);
    const rough = new Float32Array(S * S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const fy = ((y / S) * rows) % 1;
        const fx = ((x / S) * cols) % 1;
        const ty = Math.floor((y / S) * rows);
        const tx = Math.floor((x / S) * cols);
        // perfil curvo da telha (canal) + sobreposição da fiada de cima
        const curve = Math.sin(fx * Math.PI);
        let h = curve * 0.8 + (1 - fy) * 0.35;
        let v = tileTone[ty * cols + tx] * (0.78 + 0.22 * curve) * (0.9 + 0.1 * (1 - fy));
        const joint = fx < 0.05 || fx > 0.95 || fy < 0.06;
        if (joint) {
          h -= 0.6;
          v *= 0.72;
        }
        v += (r() - 0.5) * 0.05;
        height[y * S + x] = h;
        rough[y * S + x] = 0.82 + (1 - curve) * 0.1;
        const i = (y * S + x) * 4;
        const c = clamp01(v);
        color[i] = c * 255;
        color[i + 1] = c * 255 * 0.98;
        color[i + 2] = c * 255 * 0.96;
        color[i + 3] = 255;
      }
    return {
      map: makeTexture(color, S, true),
      normalMap: makeTexture(normalFromHeight(height, S, 1.8), S, false),
      roughnessMap: makeTexture(grayMap(S, (i) => rough[i]), S, false),
    };
  });

/** Cobertura plana (manta/brita fina): grão neutro multiplicativo. */
export const flatRoofTexture = () =>
  memo('flatroof', () => {
    const S = 256;
    const n = tileNoise(S, 8, 3, 107);
    const r = rng(109);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const v = 0.9 + (n[i] - 0.5) * 0.14 + (r() - 0.5) * 0.08;
      const c = clamp01(v) * 255;
      data[i * 4] = c;
      data[i * 4 + 1] = c;
      data[i * 4 + 2] = c;
      data[i * 4 + 3] = 255;
    }
    return makeTexture(data, S, true);
  });

// ---------------------------------------------------------------------------
// Sprites e padrões
// ---------------------------------------------------------------------------
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
    const W = 256;
    const H = 444; // ~ proporção de hexágonos regulares
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(70,64,52,0.55)';
    ctx.lineWidth = 5;
    const r = 74;
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
      [0, 0],
      [W, 0],
      [0, H],
      [W, H],
      [W / 2, H / 2],
      [0, 222],
      [W, 222],
      [128, 0],
      [128, H],
    ] as [number, number][])
      hex(cx, cy);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });

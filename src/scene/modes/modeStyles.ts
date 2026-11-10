import type { Lighting, VisualMode } from '../../store/useAppStore';

/**
 * Configuração visual centralizada por modo.
 * A geometria e os dados do autódromo são compartilhados; tudo o que define a
 * aparência (materiais, cores, luz, céu, sombras, pós-processamento, vegetação)
 * vem daqui.
 *
 * GAME MODE  → maquete de videogame em estilo cartoon (referência estética:
 *              "Cartoon Race Track Interlagos", RCC Design / Sketchfab).
 * SIMULATION → apresentação arquitetônica realista (linguagem Twinmotion/Lumion).
 */

export interface GroundPalette {
  base: string;
  complex: string;
  grass: string;
  park: string;
  forest: string;
  scrub: string;
  wetland: string;
  parking: string;
  pitch: string;
  pool: string;
  bare: string;
  urban: string;
  paved: string;
  helipad: string;
  road: string;
  sidewalk: string;
  roadLine: string;
  water: string;
  kart: string;
  corridor: string;
  /** manchas de variação (tons de grama seca, terra) */
  patches: string[];
  patchAlpha: number;
  patchCount: number;
  /** variação de cor do bairro */
  urbanPatches: string[];
}

export interface LightSetup {
  sun: [number, number]; // azimute (a partir do norte), elevação (graus)
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  background: string;
  fog: string;
  fogDensity: number;
  envIntensity: number;
  exposure: number;
  /** céu: 'physical' (Preetham), 'gradient' (domo estilizado) ou 'none' */
  sky: 'physical' | 'gradient' | 'none';
  skyTop?: string;
  skyHorizon?: string;
  turbidity?: number;
  rayleigh?: number;
}

export interface PostSetup {
  aoRadius: number;
  aoIntensity: number;
  aoColor: string;
  bloom: number;
  bloomThreshold: number;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
  toneMapping: 'aces' | 'agx' | 'neutral';
}

export interface ModeStyle {
  label: string;
  /** facetas planas (estética cartoon) */
  flat: boolean;
  shadowRadius: number;
  shadowBias: number;
  ground: GroundPalette;
  terrainDetail: number; // 0 = sem textura de detalhe, 1 = completa
  track: {
    asphalt: string;
    asphaltTexture: boolean;
    rubber: number; // intensidade das marcas de borracha
    line: string;
    lineFar: [number, number, number];
    kerb: [string, string];
    kerbRoughness: number;
    /** faixa estreita pintada junto às zebras (verde escuro) */
    runoffPaint: string;
    /** área de escape asfaltada */
    runoffConcrete: string;
    /** caixa de brita */
    runoffGravel: string;
    runoffTextured: boolean;
    /** salsichas (elementos elevados atrás das zebras internas) */
    sausage: string;
  };
  structure: Record<string, { color: string; roughness?: number; metalness?: number; textured?: boolean }>;
  buildings: {
    complexWall: string;
    complexRoof: string;
    walls: string[];
    roofsTile: string[];
    roofsFlat: string[];
    tileShare: number;
    facade: boolean;
  };
  trees: {
    style: 'cartoon' | 'realistic';
    leaf: string[];
    trunk: string;
    tint: number; // variação por instância
  };
  seats: 'sector' | 'brasil';
  light: Record<Lighting, LightSetup>;
  post: Record<Lighting, PostSetup>;
}

const nightLight = (bg: string): LightSetup => ({
  sun: [130, 38],
  sunColor: '#a9bfee',
  sunIntensity: 0.5,
  hemiSky: '#2a3a5c',
  hemiGround: '#101218',
  hemiIntensity: 0.6,
  background: bg,
  fog: bg,
  fogDensity: 0.00028,
  envIntensity: 0.12,
  exposure: 1.3,
  sky: 'none',
});

export const MODE_STYLES: Record<VisualMode, ModeStyle> = {
  // ---------------------------------------------------------------- GAME MODE
  game: {
    label: 'GAME MODE',
    flat: true,
    shadowRadius: 4,
    shadowBias: -0.0004,
    terrainDetail: 0.25,
    ground: {
      base: '#a9b08f',
      complex: '#6ea446',
      grass: '#72a84a',
      park: '#69a83f',
      forest: '#4f8c34',
      scrub: '#7aa64a',
      wetland: '#5f9a52',
      parking: '#8e9399',
      pitch: '#78b84b',
      pool: '#4fc0e8',
      bare: '#c9a86b',
      urban: '#b5b3a8',
      paved: '#9a9ea3',
      helipad: '#9a9ea3',
      road: '#8f9398',
      sidewalk: '#cfccc2',
      roadLine: '#f0eee4',
      water: '#3da6d6',
      kart: '#3a3e43',
      corridor: '#6ea446',
      patches: ['#79b44b', '#62a03c', '#86ba52', '#5c9838'],
      patchAlpha: 0.22,
      patchCount: 900,
      urbanPatches: ['#b9b7ac', '#aeb39a', '#c2bfb3'],
    },
    track: {
      asphalt: '#3a3d42',
      asphaltTexture: false,
      rubber: 0.18,
      line: '#ffffff',
      lineFar: [0.05, 0.055, 0.06],
      kerb: ['#16a04a', '#ffd21f'],
      kerbRoughness: 0.55,
      runoffPaint: '#2f9446',
      runoffConcrete: '#80848a',
      runoffGravel: '#a59a86',
      runoffTextured: false,
      sausage: '#ffd21f',
    },
    structure: {
      white: { color: '#f3f1eb', roughness: 0.75 },
      concrete: { color: '#ddd8ca', roughness: 0.9, textured: true }, // muro com padrão hexagonal
      darkConcrete: { color: '#b3ad9f', roughness: 0.9 },
      metal: { color: '#cfd4d9', roughness: 0.45, metalness: 0.3 },
      darkMetal: { color: '#59616b', roughness: 0.5, metalness: 0.2 },
      interior: { color: '#2b2f35', roughness: 0.9 },
      shutter: { color: '#e6e9ec', roughness: 0.55 },
      roof: { color: '#ebe8e0', roughness: 0.8 },
      fence: { color: '#d4dbe1', roughness: 0.5, metalness: 0.3 },
      guardrail: { color: '#e1e5e8', roughness: 0.35, metalness: 0.4 },
      tyre: { color: '#2e3135', roughness: 0.9 },
      pitAsphalt: { color: '#4b4f55', roughness: 0.9 },
      water: { color: '#3da6d6', roughness: 0.2, metalness: 0.05 },
      redWhite: { color: '#e5483a', roughness: 0.6 },
      seatBase: { color: '#d3cfc3', roughness: 0.85 },
      glass: { color: '#6fb3d6', roughness: 0.15, metalness: 0.2 },
    },
    buildings: {
      complexWall: '#f2efe7',
      complexRoof: '#d9d6cd',
      walls: ['#f6f3ea', '#efe9dc', '#f2ede2', '#e9e3d4', '#f8f6f0'],
      roofsTile: ['#e2703b', '#d9653a', '#ea8045'],
      roofsFlat: ['#c9c6bd', '#bdbab1', '#d4d1c8'],
      tileShare: 0.72,
      facade: false,
    },
    trees: {
      style: 'cartoon',
      leaf: ['#4e9a34', '#5daa3c', '#3f8a2d', '#6bb446', '#57a239'],
      trunk: '#7a5a3c',
      tint: 0.16,
    },
    seats: 'brasil',
    light: {
      day: { sun: [35, 50], sunColor: '#fff4e0', sunIntensity: 2.7, hemiSky: '#c4e8ff', hemiGround: '#5e7d3c', hemiIntensity: 1.15, background: '#62c3f0', fog: '#c9ecfa', fogDensity: 0.00034, envIntensity: 0.4, exposure: 1.0, sky: 'gradient', skyTop: '#3fb2ec', skyHorizon: '#c9ecfa' },
      // fim de tarde: sol baixo e dourado ainda batendo (sombras longas), céu azul no alto e laranja no horizonte
      sunset: { sun: [292, 13], sunColor: '#ffb066', sunIntensity: 3.1, hemiSky: '#ffd6ae', hemiGround: '#4a3826', hemiIntensity: 0.78, background: '#f2a877', fog: '#f7bb8c', fogDensity: 0.00026, envIntensity: 0.28, exposure: 1.02, sky: 'gradient', skyTop: '#4d6cc0', skyHorizon: '#ffb47a' },
      night: nightLight('#0a1020'),
    },
    post: {
      day: { aoRadius: 5, aoIntensity: 1.8, aoColor: '#1d2a14', bloom: 0.15, bloomThreshold: 0.95, saturation: 0.06, contrast: 0.04, brightness: 0.0, vignette: 0.18, toneMapping: 'neutral' },
      sunset: { aoRadius: 5, aoIntensity: 1.8, aoColor: '#2a1a10', bloom: 0.3, bloomThreshold: 0.86, saturation: 0.14, contrast: 0.1, brightness: 0.0, vignette: 0.24, toneMapping: 'neutral' },
      night: { aoRadius: 5, aoIntensity: 1.6, aoColor: '#000000', bloom: 1.1, bloomThreshold: 0.6, saturation: 0, contrast: 0.04, brightness: 0, vignette: 0.3, toneMapping: 'neutral' },
    },
  },
  // ------------------------------------------------------------ SIMULATION MODE
  sim: {
    label: 'SIMULATION MODE',
    flat: false,
    shadowRadius: 3,
    shadowBias: -0.00025,
    terrainDetail: 1,
    ground: {
      // tons tirados de fotografias aéreas de Interlagos: verde-oliva, palha e terra
      base: '#7c786e',
      complex: '#66753f',
      grass: '#64743f',
      park: '#687542',
      forest: '#45512f',
      scrub: '#7d7b53',
      wetland: '#68714f',
      parking: '#4f5153',
      pitch: '#6d7d4b',
      pool: '#4f8fa8',
      bare: '#8a7456',
      urban: '#7f7b71',
      paved: '#5c5e60',
      helipad: '#7b7d7f',
      road: '#4d4f52',
      sidewalk: '#948f85',
      roadLine: '#d6d1bf',
      water: '#4a6d72',
      kart: '#47494c',
      corridor: '#64743f',
      patches: ['#958a5e', '#7e7a4f', '#62703f', '#a19468', '#8c7454', '#6f7f45'],
      patchAlpha: 0.3,
      patchCount: 2600,
      urbanPatches: ['#736f66', '#86817a', '#7b766b'],
    },
    track: {
      asphalt: '#ffffff',
      asphaltTexture: true,
      rubber: 1,
      line: '#e9e9e4',
      lineFar: [0.13, 0.135, 0.14],
      kerb: ['#1d8a3a', '#e8bc00'],
      kerbRoughness: 0.55,
      runoffPaint: '#2f6e42',
      runoffConcrete: '#6c6e70',
      runoffGravel: '#a39883',
      runoffTextured: true,
      sausage: '#e8bc00',
    },
    structure: {
      white: { color: '#dcdad4', roughness: 0.75, textured: true },
      concrete: { color: '#bdbab2', roughness: 0.9, textured: true },
      darkConcrete: { color: '#8e8b84', roughness: 0.95, textured: true },
      metal: { color: '#a9adb1', roughness: 0.35, metalness: 0.8 },
      darkMetal: { color: '#3c4046', roughness: 0.5, metalness: 0.7 },
      interior: { color: '#1b1d21', roughness: 0.9 },
      shutter: { color: '#d2d4d6', roughness: 0.55, metalness: 0.3 },
      roof: { color: '#cfcdc6', roughness: 0.8, textured: true },
      fence: { color: '#b8bcc0', roughness: 0.6, metalness: 0.5 },
      guardrail: { color: '#c3c7cb', roughness: 0.3, metalness: 0.85 },
      tyre: { color: '#1a1b1d', roughness: 0.95 },
      pitAsphalt: { color: '#d6d6d6', roughness: 0.9, textured: true },
      water: { color: '#2e4f55', roughness: 0.05, metalness: 0.3 },
      redWhite: { color: '#d6332b', roughness: 0.6 },
      seatBase: { color: '#9d9f9f', roughness: 0.9, textured: true },
      glass: { color: '#2c3b48', roughness: 0.06, metalness: 0.7 },
    },
    buildings: {
      complexWall: '#e4e2dc',
      complexRoof: '#c9c7c0',
      walls: ['#d9d2c3', '#e6e0d3', '#cfc6b4', '#bdb39f', '#e9e4da', '#c9b9a0', '#d6cab6', '#a9a196'],
      roofsTile: ['#9e5a3e', '#a8623f', '#925438'],
      roofsFlat: ['#8d8b86', '#7d7c78', '#a7a49c', '#969188'],
      tileShare: 0.68,
      facade: true,
    },
    trees: {
      style: 'realistic',
      leaf: ['#4a5c32', '#566a3a', '#41522c', '#5e6e3e', '#4f6233'],
      trunk: '#4e3f31',
      tint: 0.22,
    },
    seats: 'sector',
    light: {
      day: { sun: [25, 54], sunColor: '#fff0da', sunIntensity: 2.5, hemiSky: '#b8cce0', hemiGround: '#4a4535', hemiIntensity: 0.38, background: '#8ea7bd', fog: '#9fb2c2', fogDensity: 0.00022, envIntensity: 0.18, exposure: 0.86, sky: 'gradient', skyTop: '#5f82a6', skyHorizon: '#9fb2c2' },
      sunset: { sun: [290, 12], sunColor: '#ffa95e', sunIntensity: 3.6, hemiSky: '#f3c9a2', hemiGround: '#3a2d20', hemiIntensity: 0.3, background: '#e0a27a', fog: '#e8b089', fogDensity: 0.0002, envIntensity: 0.2, exposure: 1.0, sky: 'gradient', skyTop: '#46639e', skyHorizon: '#f2a46c' },
      night: nightLight('#060a14'),
    },
    post: {
      day: { aoRadius: 5, aoIntensity: 3.2, aoColor: '#000000', bloom: 0.12, bloomThreshold: 0.97, saturation: 0.06, contrast: 0.14, brightness: -0.02, vignette: 0.3, toneMapping: 'aces' },
      sunset: { aoRadius: 5, aoIntensity: 3.0, aoColor: '#000000', bloom: 0.4, bloomThreshold: 0.84, saturation: 0.16, contrast: 0.18, brightness: 0, vignette: 0.3, toneMapping: 'aces' },
      night: { aoRadius: 6, aoIntensity: 2, aoColor: '#000000', bloom: 1.4, bloomThreshold: 0.55, saturation: 0, contrast: 0.06, brightness: 0, vignette: 0.4, toneMapping: 'aces' },
    },
  },
};

export const styleOf = (mode: VisualMode) => MODE_STYLES[mode];

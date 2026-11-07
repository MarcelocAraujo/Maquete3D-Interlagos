import { create } from 'zustand';
import type { Selection } from '../data/types';

export type VisualMode = 'game' | 'sim';
export type Lighting = 'day' | 'sunset' | 'night';
export type Quality = 'low' | 'medium' | 'high';
export type CameraPreset = 'overview' | 'top' | 'side' | 'front' | 'iso';
export type Modal = null | 'settings' | 'history' | 'performance' | 'sources' | 'help';

export const LAYER_KEYS = ['terrain', 'track', 'runoff', 'curbs', 'markings', 'pit', 'buildings', 'city', 'grandstands', 'vegetation', 'barriers', 'props', 'roads', 'water'] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export const LAYER_LABELS: Record<LayerKey, string> = {
  terrain: 'Terreno',
  track: 'Pista',
  runoff: 'Áreas de escape',
  curbs: 'Zebras',
  markings: 'Sinalização',
  pit: 'Boxes e pit lane',
  buildings: 'Prédios do autódromo',
  city: 'Entorno urbano',
  grandstands: 'Arquibancadas',
  vegetation: 'Vegetação',
  barriers: 'Muros e cercas',
  props: 'Postes e torres',
  roads: 'Vias',
  water: 'Lagos',
};

export const LABEL_KEYS = ['cornerNumbers', 'cornerNames', 'straights', 'sectors', 'facilities', 'grandstands', 'markers'] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];
export const LABEL_LABELS: Record<LabelKey, string> = {
  cornerNumbers: 'Número das curvas',
  cornerNames: 'Nome das curvas',
  straights: 'Retas',
  sectors: 'Setores',
  facilities: 'Boxes e estruturas',
  grandstands: 'Arquibancadas',
  markers: 'Largada, speed trap e DRS',
};

export interface CameraRequest {
  id: number;
  kind: 'preset' | 'focus';
  preset?: CameraPreset;
  /** foco: alvo e posição desejada (cena) */
  target?: [number, number, number];
  position?: [number, number, number];
  instant?: boolean;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
  azimuth: number; // graus
}

interface AppState {
  ready: boolean;
  loadingStep: string;
  mode: VisualMode;
  lighting: Lighting;
  quality: Quality;
  verticalScale: number;
  selection: Selection | null;
  hover: Selection | null;
  showSectors: boolean;
  labelsOn: boolean;
  labels: Record<LabelKey, boolean>;
  layers: Record<LayerKey, boolean>;
  explore: boolean;
  modal: Modal;
  leftOpen: boolean;
  rightOpen: boolean;
  miniMapOpen: boolean;
  cameraRequest: CameraRequest | null;
  camera: CameraState;
  snapshot: string | null;
  snapshotRequested: VisualMode | null;
  shadows: boolean;
  ao: boolean;

  setReady: (v: boolean) => void;
  setLoadingStep: (s: string) => void;
  setMode: (m: VisualMode) => void;
  requestMode: (m: VisualMode) => void;
  clearSnapshot: () => void;
  setSnapshot: (url: string | null) => void;
  setLighting: (l: Lighting) => void;
  setQuality: (q: Quality) => void;
  setVerticalScale: (v: number) => void;
  select: (s: Selection | null, opts?: { focus?: boolean }) => void;
  setHover: (s: Selection | null) => void;
  setShowSectors: (v: boolean) => void;
  setLabelsOn: (v: boolean) => void;
  toggleLabel: (k: LabelKey) => void;
  toggleLayer: (k: LayerKey) => void;
  setAllLayers: (v: boolean) => void;
  setExplore: (v: boolean) => void;
  setModal: (m: Modal) => void;
  setLeftOpen: (v: boolean) => void;
  setRightOpen: (v: boolean) => void;
  setMiniMapOpen: (v: boolean) => void;
  requestCamera: (r: Omit<CameraRequest, 'id'>) => void;
  setCamera: (c: CameraState) => void;
  setShadows: (v: boolean) => void;
  setAO: (v: boolean) => void;
}

let reqId = 1;

const initialQuality = (): Quality => {
  try {
    const q = localStorage.getItem('i3d.quality') as Quality | null;
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch {
    /* sem storage */
  }
  const cores = navigator.hardwareConcurrency || 4;
  return 'medium';
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  loadingStep: 'Carregando dados do circuito…',
  mode: 'sim',
  lighting: 'day',
  quality: initialQuality(),
  verticalScale: 1,
  selection: null,
  hover: null,
  showSectors: false,
  labelsOn: true,
  labels: { cornerNumbers: true, cornerNames: true, straights: true, sectors: true, facilities: true, grandstands: true, markers: false },
  layers: Object.fromEntries(LAYER_KEYS.map((k) => [k, true])) as Record<LayerKey, boolean>,
  explore: false,
  modal: null,
  leftOpen: true,
  rightOpen: true,
  miniMapOpen: true,
  cameraRequest: null,
  camera: { position: [0, 0, 0], target: [0, 0, 0], distance: 0, azimuth: 0 },
  snapshot: null,
  snapshotRequested: null,
  shadows: true,
  ao: true,

  setReady: (v) => set({ ready: v }),
  setLoadingStep: (s) => set({ loadingStep: s }),
  setMode: (m) => set({ mode: m }),
  requestMode: (m) => {
    if (get().mode === m) return;
    // pede um snapshot do quadro atual; a cena troca o modo após capturá-lo
    set({ snapshotRequested: m });
  },
  clearSnapshot: () => set({ snapshot: null }),
  setSnapshot: (url) => set({ snapshot: url }),
  setLighting: (l) => set({ lighting: l }),
  setQuality: (q) => {
    try {
      localStorage.setItem('i3d.quality', q);
    } catch {
      /* ignore */
    }
    set({ quality: q });
  },
  setVerticalScale: (v) => set({ verticalScale: v }),
  select: (s, opts) => {
    set({ selection: s, rightOpen: s ? true : get().rightOpen });
    if (s?.kind === 'sector') set({ showSectors: true });
    if (opts?.focus !== false && s) set({ cameraRequest: { id: reqId++, kind: 'focus' } });
  },
  setHover: (s) => {
    const h = get().hover;
    if (h?.id === s?.id && h?.kind === s?.kind) return;
    set({ hover: s });
  },
  setShowSectors: (v) => set({ showSectors: v }),
  setLabelsOn: (v) => set({ labelsOn: v }),
  toggleLabel: (k) => set({ labels: { ...get().labels, [k]: !get().labels[k] } }),
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
  setAllLayers: (v) => set({ layers: Object.fromEntries(LAYER_KEYS.map((k) => [k, v])) as Record<LayerKey, boolean> }),
  setExplore: (v) => set({ explore: v, selection: v ? null : get().selection }),
  setModal: (m) => set({ modal: m }),
  setLeftOpen: (v) => set({ leftOpen: v }),
  setRightOpen: (v) => set({ rightOpen: v }),
  setMiniMapOpen: (v) => set({ miniMapOpen: v }),
  requestCamera: (r) => set({ cameraRequest: { ...r, id: reqId++ } }),
  setCamera: (c) => set({ camera: c }),
  setShadows: (v) => set({ shadows: v }),
  setAO: (v) => set({ ao: v }),
}));

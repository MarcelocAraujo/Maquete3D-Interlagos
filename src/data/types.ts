/** Classificação de confiabilidade exigida para toda informação apresentada. */
export type Reliability = 'oficial' | 'secundaria' | 'estimativa' | 'indisponivel';

export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  date?: string;
  kind: 'oficial' | 'secundaria' | 'geodado' | 'referencia-visual';
  note?: string;
}

/** Um dado apresentado em painel, sempre acompanhado de sua classificação. */
export interface Fact {
  label: string;
  value: string;
  reliability: Reliability;
  sources?: string[]; // ids de SourceRef
  note?: string;
}

export type ElementKind =
  | 'corner'
  | 'straight'
  | 'sector'
  | 'pit'
  | 'garage'
  | 'grandstand'
  | 'building'
  | 'structure'
  | 'runoff'
  | 'barrier'
  | 'vegetation'
  | 'water'
  | 'tower'
  | 'marker';

export interface Selection {
  kind: ElementKind;
  id: string;
}

export interface Corner {
  id: string;            // 't1' ...
  number: number;        // numeração F1/FIA
  name: string;
  altNames?: string[];
  s0: number;            // início (m, ao longo da linha central do modelo)
  s1: number;            // fim
  apexS: number;
  direction: 'esquerda' | 'direita';
  sector: 1 | 2 | 3;
  minRadius: number;     // raio mínimo da linha central (m) – medido no modelo
  lengthM: number;       // comprimento do trecho (m) – medido no modelo
  elevIn: number;        // altitude na entrada (m)
  elevOut: number;
  facts: Fact[];
  description: string;
  racingLine: string;
  overtaking: string;
  difficulty: { level: 1 | 2 | 3 | 4 | 5; reliability: Reliability; note: string };
  history?: string;
  sources: string[];
}

export interface Straight {
  id: string;
  name: string;
  s0: number;
  s1: number;
  sector: 1 | 2 | 3 | [number, number];
  lengthM: number;
  entry: string;
  exit: string;
  facts: Fact[];
  description: string;
  overtaking: string;
  sources: string[];
}

export interface Sector {
  id: 's1' | 's2' | 's3';
  number: 1 | 2 | 3;
  name: string;
  color: string;
  s0: number;
  s1: number;
  lengthM: number;
  startLabel: string;
  endLabel: string;
  corners: string[];
  straights: string[];
  facts: Fact[];
  description: string;
  challenges: string;
  overtaking: string;
  sources: string[];
}

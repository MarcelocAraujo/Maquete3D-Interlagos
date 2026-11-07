import type { ElementKind, Fact, Reliability } from './types';

const f = (label: string, value: string, reliability: Reliability, sources?: string[], note?: string): Fact => ({ label, value, reliability, sources, note });

export interface FacilityInfo {
  id: string;
  kind: ElementKind;
  name: string;
  subtitle?: string;
  description: string;
  facts: Fact[];
  sources: string[];
}

export const PIT_GARAGES = 23; // Prefeitura de SP: 23 boxes de 216 m²

export const GENERAL_FACTS: Fact[] = [
  f('Comprimento', '4.309 m', 'oficial', ['fia-2022-event-notes', 'pref-circuito', 'f1-2025']),
  f('Curvas (numeração F1)', '15', 'oficial', ['fia-2022-event-notes']),
  f('Sentido', 'Anti-horário', 'oficial', ['pref-historia', 'wikipedia']),
  f('Voltas no GP', '71', 'oficial', ['f1-2025', 'fia-2022-preview']),
  f('Distância de prova', '305,909 km (FIA 2022) · 305,879 km (F1.com)', 'oficial', ['fia-2022-preview', 'f1-2025'], 'As duas fontes oficiais divergem; 71 × 4,309 km − 0,030 km (offset de largada) = 305,909 km.'),
  f('Recorde de volta em corrida', '1:10.540 — Valtteri Bottas (Mercedes), 2018', 'oficial', ['f1-2025', 'fia-2022-preview']),
  f('Volta mais rápida – corrida 2025', '1:12.400 — Alexander Albon (Williams), volta 59, 214,259 km/h', 'oficial', ['fia-2025-fastest-laps']),
  f('Largura da pista', '12 a 15 m', 'oficial', ['pref-circuito']),
  f('Desnível (Prefeitura)', '≈ 56 m entre o S do Senna (mais alto) e a Curva do Lago (mais baixo)', 'oficial', ['pref-circuito']),
  f('Desnível no modelo (SRTM)', '≈ 42 m', 'estimativa', ['srtm'], 'O modelo de superfície SRTM (30 m), suavizado, resulta em ~42 m; fontes secundárias citam 43–46 m.'),
  f('Altitude', '≈ 745 a 787 m (SRTM)', 'estimativa', ['srtm']),
  f('Boxes', '23 boxes de 216 m² cada', 'oficial', ['pref-circuito']),
  f('Arquibancadas fixas', '18 mil lugares', 'oficial', ['pref-circuito']),
  f('Capacidade total', '60.000 (Wikipedia/OSM)', 'secundaria', ['wikipedia', 'osm']),
  f('Grau FIA', 'Grade 1', 'secundaria', ['wikipedia']),
  f('Limite no pit lane (F1)', '80 km/h em treinos, classificação e corrida (2022)', 'oficial', ['fia-2022-preview']),
  f('Primeiro GP de F1 (Mundial)', '1973', 'oficial', ['f1-2025', 'pref-historia']),
];

export const FACILITIES: Record<string, FacilityInfo> = {
  pit: {
    id: 'pit',
    kind: 'pit',
    name: 'Boxes e Pit Lane',
    subtitle: 'Prédio dos boxes, pit lane e muro dos boxes',
    description:
      'Prédio dos boxes ao longo da reta principal, do lado de dentro do circuito. O pit lane de Interlagos é um dos mais longos já usados na F1: começa antes da reta de chegada (entrada na Curva 15) e só retorna à pista depois da Curva do Sol, já na Reta Oposta. Uma chicane foi incorporada à entrada em 2014.',
    facts: [
      f('Quantidade de boxes', '23 boxes de 216 m² cada', 'oficial', ['pref-circuito']),
      f('Ampliação planejada', 'Reportagens citam projeto de 28 boxes (5 a mais que a estrutura atual)', 'secundaria', ['news-reforma-boxes']),
      f('Extensão do pit lane', '≈ 1.370 m (da bifurcação à reconexão, no modelo OSM)', 'estimativa', ['osm'], 'Não foi encontrado valor oficial publicado.'),
      f('Entrada', 'Pela esquerda, no trecho da Curva 15 (Arquibancadas)', 'secundaria', ['osm', 'wikipedia']),
      f('Saída', 'Após a Curva do Sol, convergindo na Reta Oposta', 'secundaria', ['osm', 'wikipedia']),
      f('Velocidade máxima (F1)', '80 km/h em treinos, classificação e corrida', 'oficial', ['fia-2022-preview'], 'Valor do Race Preview da FIA de 2022; confira as Event Notes de cada ano.'),
      f('Centro de operações', 'Prédio de seis andares erguido na modernização; um "box zero" o liga aos boxes antigos', 'secundaria', ['news-reforma-boxes']),
      f('Reforma recente', 'Pé-direito 80 cm maior, portas elétricas, piso novo e iluminação LED', 'secundaria', ['news-reforma-boxes']),
    ],
    sources: ['pref-circuito', 'fia-2022-preview', 'wikipedia', 'osm', 'news-reforma-boxes'],
  },
  'control-tower': {
    id: 'control-tower',
    kind: 'structure',
    name: 'Torre de controle / Centro de operações',
    description: 'Edificação vertical junto ao prédio dos boxes que abriga direção de prova e operações. A volumetria e a posição exata no modelo são aproximadas.',
    facts: [
      f('Pavimentos', 'Seis andares (centro de operações construído na modernização)', 'secundaria', ['news-reforma-boxes']),
      f('Torre de 1990', 'A reforma de 1989–1990 construiu novos boxes e torre de controle', 'oficial', ['pref-historia']),
      f('Posição no modelo', 'Extremidade norte do prédio dos boxes', 'estimativa', ['esri']),
    ],
    sources: ['news-reforma-boxes', 'pref-historia'],
  },
  paddock: {
    id: 'paddock',
    kind: 'building',
    name: 'Paddock e edifício das equipes',
    description: 'Área atrás dos boxes, com o edifício de apoio às equipes (cobertura curva) e o pátio do paddock. Durante o GP recebe estruturas temporárias de hospitalidade.',
    facts: [
      f('Origem do edifício', 'Construído na 2ª fase da modernização (ampliação do paddock + prédio para as equipes atrás dos boxes)', 'secundaria', ['news-reforma-boxes']),
      f('Pegada (footprint)', 'Polígono do OpenStreetMap', 'secundaria', ['osm']),
      f('Função exata dos ambientes', 'Não disponível', 'indisponivel'),
    ],
    sources: ['news-reforma-boxes', 'osm'],
  },
  'kart': {
    id: 'kart',
    kind: 'structure',
    name: 'Kartódromo Ayrton Senna',
    description: 'Kartódromo vizinho ao autódromo, junto à Reta Oposta. Traçado obtido do OpenStreetMap.',
    facts: [
      f('Traçado', 'Vias highway=raceway / sport=karting do OSM', 'secundaria', ['osm']),
      f('Heliponto', 'SSXK – altitude 776 m (tag OSM)', 'secundaria', ['osm']),
    ],
    sources: ['osm'],
  },
  lake: {
    id: 'lake',
    kind: 'water',
    name: 'Lago interno',
    description: 'Lago no interior do autódromo, que dá nome à Descida do Lago e à Curva do Lago.',
    facts: [f('Contorno', 'natural=water (OSM)', 'secundaria', ['osm']), f('Profundidade', 'Não disponível', 'indisponivel')],
    sources: ['osm', 'mercedes-corners'],
  },
  hospital: {
    id: 'hospital',
    kind: 'building',
    name: 'Centro médico do autódromo',
    description: 'Heliponto "Hospital Autódromo José Carlos Pace" registrado no OSM, junto ao centro médico.',
    facts: [f('Heliponto', 'SSYH – altitude 750 m (tag OSM)', 'secundaria', ['osm'])],
    sources: ['osm'],
  },
  drag: {
    id: 'drag',
    kind: 'structure',
    name: 'Pista de arrancada ("Retão")',
    description: 'Trecho auxiliar de ~500 m usado para arrancada, inaugurado com nova estrutura em 2015.',
    facts: [f('Extensão', '≈ 500 m', 'oficial', ['pref-circuito']), f('Geometria', 'Via "Quartermile" do OSM', 'secundaria', ['osm'])],
    sources: ['pref-circuito', 'osm'],
  },
};

export interface GrandstandInfo {
  id: string;
  name: string;
  osmId?: number;
  /** Polígono OSM em faixa curva (edificação) usado como pegada — frente = borda voltada à pista */
  bandOsmBuilding?: number;
  /** Para estruturas sem polígono OSM: posição ao longo da pista (s), lado e afastamento. */
  place?: { s0: number; s1: number; side: 'L' | 'R'; offset: number; depth: number };
  covered: boolean;
  temporary: boolean;
  seatColor: string;
  idReliability: Reliability;
  facts: Fact[];
  description: string;
  sources: string[];
}

export const GRANDSTANDS: GrandstandInfo[] = [
  {
    id: 'gs-m',
    name: 'Setor M',
    osmId: 138420844,
    covered: true,
    temporary: false,
    seatColor: '#c8102e',
    idReliability: 'oficial',
    description: 'Arquibancada coberta na reta principal, de frente para os boxes e com vista para a chegada ao S do Senna.',
    facts: [
      f('Identificação', 'Polígono OSM com nome "M"; portão M próximo', 'secundaria', ['osm']),
      f('Localização', 'Reta principal, lado externo, antes da Curva 1', 'oficial', ['f1-2025'], 'F1.com: o Setor M fica "no topo" da primeira curva e do S do Senna.'),
      f('Cobertura', 'Coberta', 'secundaria', ['band-setores']),
      f('Capacidade', 'Não disponível', 'indisponivel'),
    ],
    sources: ['osm', 'f1-2025', 'band-setores'],
  },
  {
    id: 'gs-reta-central',
    name: 'Arquibancada da Reta (central)',
    osmId: 138420848,
    covered: true,
    temporary: false,
    seatColor: '#9aa3ad',
    idReliability: 'indisponivel',
    description: 'Arquibancada fixa na reta dos boxes, entre a linha de chegada e o Setor M.',
    facts: [
      f('Identificação do setor', 'Não confirmada nas fontes consultadas', 'indisponivel'),
      f('Pegada', 'building=grandstand (OSM)', 'secundaria', ['osm']),
      f('Capacidade', 'Não disponível', 'indisponivel'),
    ],
    sources: ['osm'],
  },
  {
    id: 'gs-reta-norte',
    name: 'Arquibancada da Chegada',
    osmId: 138550780,
    covered: true,
    temporary: false,
    seatColor: '#9aa3ad',
    idReliability: 'estimativa',
    description: 'Arquibancada fixa junto à linha de chegada e ao grid de largada. O portão B fica imediatamente atrás dela (associação estimada).',
    facts: [
      f('Identificação do setor', 'Possivelmente Setor B (pela proximidade do Portão B) — não confirmada', 'estimativa', ['osm']),
      f('Pegada', 'building=grandstand (OSM)', 'secundaria', ['osm']),
      f('Capacidade', 'Não disponível', 'indisponivel'),
    ],
    sources: ['osm'],
  },
  {
    id: 'gs-a',
    name: 'Setor A',
    osmId: 189535474,
    covered: false,
    temporary: false,
    seatColor: '#1f6fd1',
    idReliability: 'secundaria',
    description: 'Arquibancada descoberta na Subida dos Boxes, na "entrada inclinada da reta de chegada" — um dos melhores pontos para ver o vácuo antes da reta.',
    facts: [
      f('Localização', 'Subida dos Boxes / entrada da reta principal', 'oficial', ['f1-2025']),
      f('Cobertura', 'Descoberta (único setor sem cobertura, segundo reportagem de 2025)', 'secundaria', ['band-setores']),
      f('Ampliação 2026', '+1.480 lugares', 'secundaria', ['band-setores']),
      f('Capacidade total', 'Não disponível', 'indisponivel'),
    ],
    sources: ['f1-2025', 'band-setores', 'osm'],
  },
  {
    id: 'gs-d',
    name: 'Setor D',
    bandOsmBuilding: 1563340820,
    covered: true,
    temporary: false,
    seatColor: '#ffb000',
    idReliability: 'secundaria',
    description: 'Setor junto ao S do Senna. No modelo, usa a pegada curva mapeada no OSM como edificação em obra (building=construction, ~3.150 m²) do lado externo das curvas 1–2, compatível com a ampliação do Setor D anunciada para 2026.',
    facts: [
      f('Localização', 'S do Senna', 'secundaria', ['band-setores']),
      f('Capacidade (2026)', '5.358 lugares', 'secundaria', ['band-setores']),
      f('Pegada no modelo', 'Polígono OSM building=construction junto ao S do Senna (associação ao Setor D estimada)', 'estimativa', ['osm']),
    ],
    sources: ['band-setores', 'osm'],
  },
  {
    id: 'gs-g',
    name: 'Setor G',
    place: { s0: 1035, s1: 1185, side: 'R', offset: 22, depth: 18 },
    covered: true,
    temporary: true,
    seatColor: '#2e8b57',
    idReliability: 'secundaria',
    description: 'Setor à beira da Reta Oposta, dedicado a torcidas organizadas e grandes grupos. Estrutura temporária; posição estimada.',
    facts: [
      f('Localização', 'Reta Oposta', 'secundaria', ['band-setores']),
      f('Público', 'Torcidas organizadas e grandes grupos', 'secundaria', ['band-setores']),
      f('Posição no modelo', 'Estimada (Portões G, OSM)', 'estimativa', ['osm']),
      f('Capacidade', 'Não disponível', 'indisponivel'),
    ],
    sources: ['band-setores', 'osm'],
  },
];

export const MARSHAL_POST_INFO: FacilityInfo = {
  id: 'marshal',
  kind: 'structure',
  name: 'Posto de fiscalização',
  description: 'Pequenas edificações numeradas ao lado da pista, usadas pelos fiscais (marshals). A FIA lista 22 postos (M1–M22) no mapa de 2022; o OSM registra parte deles como edificações numeradas.',
  facts: [
    f('Postos no mapa FIA 2022', '22 (M1–M22)', 'oficial', ['fia-2022-event-notes']),
    f('Correspondência número OSM ↔ posto FIA', 'Não confirmada', 'estimativa', ['osm']),
  ],
  sources: ['fia-2022-event-notes', 'osm'],
};

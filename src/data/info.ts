import type { Fact, Reliability, Selection } from './types';
import { cornerById } from './circuit/corners';
import { straightById } from './circuit/straights';
import { sectorById } from './circuit/sectors';
import { FACILITIES, GRANDSTANDS, MARSHAL_POST_INFO, PIT_GARAGES } from './facilities';
import { SPECIES_LABEL, type Species } from '../scene/vegetation/Trees';
import { buildingRegistry, buildingTop } from '../scene/buildings/Buildings';
import { polyArea } from '../scene/world/world';
import { computeRunoffs } from '../scene/track/geometry';
import { altitude } from './circuit/track';

const f = (label: string, value: string, reliability: Reliability, sources?: string[], note?: string): Fact => ({ label, value, reliability, sources, note });

export interface InfoView {
  kindLabel: string;
  title: string;
  number?: string;
  subtitle?: string;
  accent?: string;
  description?: string;
  facts: Fact[];
  sections?: { title: string; text: string }[];
  sources: string[];
  stats?: { label: string; value: string }[];
}

const KIND_LABEL: Record<string, string> = {
  corner: 'Curva',
  straight: 'Reta',
  sector: 'Setor F1',
  pit: 'Boxes',
  garage: 'Garagem',
  grandstand: 'Arquibancada',
  building: 'Edificação',
  structure: 'Estrutura',
  runoff: 'Área de escape',
  barrier: 'Proteção',
  vegetation: 'Vegetação',
  water: 'Água',
  tower: 'Torre / poste',
  marker: 'Marcação',
};

export function getInfo(sel: Selection): InfoView | null {
  switch (sel.kind) {
    case 'corner': {
      const c = cornerById(sel.id);
      if (!c) return null;
      return {
        kindLabel: `Curva · Setor ${c.sector}`,
        title: c.name,
        number: String(c.number),
        subtitle: c.altNames?.join(' · '),
        accent: c.sector === 1 ? '#e8160c' : c.sector === 2 ? '#bf8a10' : '#2b8fd6',
        description: c.description,
        stats: [
          { label: 'Direção', value: c.direction === 'esquerda' ? '← Esquerda' : 'Direita →' },
          { label: 'Raio mín.', value: `${Math.round(c.minRadius)} m` },
          { label: 'Altitude', value: `${Math.round(c.elevIn)}→${Math.round(c.elevOut)} m` },
          { label: 'Dificuldade', value: '●'.repeat(c.difficulty.level) + '○'.repeat(5 - c.difficulty.level) },
        ],
        facts: [...c.facts, f('Dificuldade técnica', `${c.difficulty.level}/5`, c.difficulty.reliability, undefined, c.difficulty.note)],
        sections: [
          { title: 'Trajetória ideal', text: c.racingLine },
          { title: 'Ultrapassagem', text: c.overtaking },
          ...(c.history ? [{ title: 'Curiosidade histórica', text: c.history }] : []),
        ],
        sources: c.sources,
      };
    }
    case 'straight': {
      const s = straightById(sel.id);
      if (!s) return null;
      return {
        kindLabel: `Reta · Setor ${Array.isArray(s.sector) ? s.sector.join('/') : s.sector}`,
        title: s.name,
        description: s.description,
        stats: [
          { label: 'Comprimento', value: `${Math.round(s.lengthM)} m` },
          { label: 'Entrada', value: s.entry.replace(/\(.*\)/, '').trim() },
          { label: 'Saída', value: s.exit.replace(/\(.*\)/, '').trim() },
        ],
        facts: [f('Ponto de entrada', s.entry, 'secundaria', ['osm']), f('Ponto de saída', s.exit, 'secundaria', ['osm']), ...s.facts],
        sections: [{ title: 'Ultrapassagem', text: s.overtaking }],
        sources: s.sources,
      };
    }
    case 'sector': {
      const s = sectorById(sel.id);
      if (!s) return null;
      return {
        kindLabel: 'Setor oficial de cronometragem F1',
        title: s.name,
        number: `S${s.number}`,
        accent: s.color,
        description: s.description,
        stats: [
          { label: 'Extensão', value: `≈ ${Math.round(s.lengthM)} m` },
          { label: 'Curvas', value: s.corners.map((c) => c.slice(1)).join(', ') },
          { label: 'Início', value: s.startLabel },
          { label: 'Fim', value: s.endLabel },
        ],
        facts: s.facts,
        sections: [
          { title: 'Principais desafios', text: s.challenges },
          { title: 'Pontos de ultrapassagem', text: s.overtaking },
        ],
        sources: s.sources,
      };
    }
    case 'pit':
    case 'structure': {
      if (sel.id.startsWith('marshal')) {
        const n = sel.id.split('-')[1];
        return { kindLabel: 'Estrutura', title: n ? `${MARSHAL_POST_INFO.name} nº ${n}` : MARSHAL_POST_INFO.name, description: MARSHAL_POST_INFO.description, facts: [...MARSHAL_POST_INFO.facts, ...(n ? [f('Número no OSM', n, 'secundaria', ['osm'])] : [])], sources: MARSHAL_POST_INFO.sources };
      }
      if (sel.id === 'passarela')
        return {
          kindLabel: 'Estrutura',
          title: 'Passarela',
          description: 'Passarela de pedestres registrada no OpenStreetMap como ponte (bridge=yes). Altura e seção transversal no modelo são estimadas.',
          facts: [f('Traçado', 'Vias bridge=yes / footway ou steps (OSM)', 'secundaria', ['osm']), f('Altura livre', 'Estimada (~6 m sobre a pista quando a cruza)', 'estimativa')],
          sources: ['osm'],
        };
      const fi = FACILITIES[sel.id];
      if (!fi) return null;
      return { kindLabel: KIND_LABEL[fi.kind] ?? 'Estrutura', title: fi.name, subtitle: fi.subtitle, description: fi.description, facts: fi.facts, sources: fi.sources, stats: sel.id === 'pit' ? [{ label: 'Boxes', value: String(PIT_GARAGES) }, { label: 'Limite', value: '80 km/h' }, { label: 'Pit lane', value: '≈ 1.370 m' }] : undefined };
    }
    case 'garage': {
      const n = Number(sel.id.split('-')[1]);
      return {
        kindLabel: 'Garagem · Boxes',
        title: `Box ${String(n).padStart(2, '0')}`,
        number: String(n),
        description: 'Garagem individual do prédio dos boxes. A numeração é a do modelo (a partir da entrada do pit lane); a ocupação por equipe muda a cada temporada.',
        facts: [
          f('Área', '216 m² (cada um dos 23 boxes)', 'oficial', ['pref-circuito']),
          f('Dimensões no modelo', '≈ 9,4 m de frente × 23 m de profundidade', 'estimativa', undefined, 'Derivadas da área oficial e do comprimento do prédio no OSM.'),
          f('Equipe ocupante', 'Não disponível', 'indisponivel', undefined, 'A alocação de garagens varia por evento.'),
        ],
        sources: ['pref-circuito', 'osm'],
      };
    }
    case 'grandstand': {
      const g = GRANDSTANDS.find((x) => x.id === sel.id);
      if (!g) return null;
      return {
        kindLabel: g.temporary ? 'Arquibancada temporária' : 'Arquibancada',
        title: g.name,
        accent: g.seatColor,
        description: g.description,
        stats: [
          { label: 'Cobertura', value: g.covered ? 'Coberta' : 'Descoberta' },
          { label: 'Estrutura', value: g.temporary ? 'Tubular (temporária)' : 'Fixa' },
        ],
        facts: [f('Confiabilidade da identificação', g.idReliability === 'oficial' ? 'Nome mapeado' : g.idReliability === 'indisponivel' ? 'Setor não identificado' : 'Identificação inferida', g.idReliability), ...g.facts],
        sources: g.sources,
      };
    }
    case 'building': {
      const reg = buildingRegistry.get(sel.id);
      if (!reg) return null;
      const b = reg.b;
      const area = Math.abs(polyArea(b.poly));
      const isTank = b.k === 'tank';
      return {
        kindLabel: reg.complex ? 'Edificação do autódromo' : 'Edificação do entorno',
        title: b.n ?? (isTank ? 'Reservatório (Sabesp)' : reg.complex ? 'Edificação do complexo' : 'Edificação'),
        description: reg.complex
          ? 'Edificação dentro do perímetro do autódromo, com pegada do OpenStreetMap. A função específica não está identificada nos dados abertos.'
          : 'Edificação do bairro vizinho (Interlagos / Cidade Dutra), com pegada do OpenStreetMap. Altura do OSM quando disponível; caso contrário, estimada pela área.',
        stats: [
          { label: 'Área', value: `${Math.round(area)} m²` },
          { label: 'Altura', value: `${b.h.toFixed(1)} m` },
          { label: 'Base', value: `${Math.round(altitude(b.b))} m` },
        ],
        facts: [
          f('Pegada (footprint)', `OSM ${String(b.id).replace(/-.*/, '')}`, 'secundaria', ['osm']),
          f('Altura', `${b.h.toFixed(1)} m`, 'estimativa', ['osm'], 'Usa a tag height do OSM quando existe; senão, heurística por área (6–10 m).'),
          f('Topo no modelo', `${Math.round(altitude(buildingTop(b)))} m de altitude`, 'estimativa', ['srtm']),
        ],
        sources: ['osm'],
      };
    }
    case 'runoff': {
      const n = Number(sel.id.split('-')[1]);
      const z = computeRunoffs().find((r) => r.corner === n);
      return {
        kindLabel: 'Área de escape',
        title: z ? z.label : 'Área de escape',
        description:
          z?.kind === 'concrete'
            ? 'Área de escape clara (concreto/asfalto sem pintura), identificada em imagem de satélite na região do Café.'
            : 'Área de escape asfaltada com pintura azul-turquesa, padrão observado em imagens de satélite na maioria das curvas de Interlagos. O asfalto pintado permite frenagem e retorno à pista, ao contrário da brita.',
        facts: [
          f('Superfície', z?.kind === 'concrete' ? 'Concreto/asfalto claro' : 'Asfalto pintado (azul-turquesa)', 'secundaria', ['esri']),
          f('Profundidade no modelo', z ? `≈ ${z.depth} m` : 'Não disponível', 'estimativa', ['esri'], 'Medida aproximada sobre imagem aérea.'),
          f('Brita (gravel)', 'Não observada nas imagens consultadas', 'estimativa', ['esri']),
        ],
        sources: ['esri'],
      };
    }
    case 'barrier': {
      const map: Record<string, InfoView> = {
        guardrail: { kindLabel: 'Proteção', title: 'Guard-rail', description: 'Defensa metálica de dupla lâmina nos trechos sem área de escape larga.', facts: [f('Posição e extensão', 'Estimadas pelo afastamento das áreas de escape', 'estimativa', ['esri'])], sources: ['esri'] },
        tyre: { kindLabel: 'Proteção', title: 'Barreira de pneus', description: 'Barreiras de pneus revestidas, no fim das áreas de escape. A FIA registrou em 2022 a instalação de barreiras modulares de concreto e pneus no fim da área de escape da Curva 1.', facts: [f('Mudança 2022 (Curva 1)', 'Barreira modular de concreto + pneus no fim da área de escape', 'oficial', ['fia-2022-preview']), f('Posição no modelo', 'Fim das áreas de escape (estimativa)', 'estimativa')], sources: ['fia-2022-preview'] },
        wall: { kindLabel: 'Proteção', title: 'Muro de concreto', description: 'Muros de concreto ao longo da reta dos boxes e muros mapeados no OSM.', facts: [f('Muros mapeados', 'barrier=wall (OSM)', 'secundaria', ['osm']), f('Muros junto à pista', 'Posição estimada', 'estimativa')], sources: ['osm'] },
        fence: { kindLabel: 'Proteção', title: 'Alambrado / cerca de proteção', description: 'Telas de proteção (catch fences) sobre muros e barreiras, além das cercas do perímetro mapeadas no OSM.', facts: [f('Cercas mapeadas', 'barrier=fence (OSM)', 'secundaria', ['osm']), f('Novas cercas 2022', 'Instaladas na nova área de público entre as curvas 10 e 14', 'oficial', ['fia-2022-preview'])], sources: ['osm', 'fia-2022-preview'] },
      };
      return map[sel.id] ?? null;
    }
    case 'vegetation': {
      const [sp, src] = sel.id.split('|') as [Species, string];
      const srcLabel: Record<string, [string, Reliability]> = {
        'osm-tree': ['Árvore individual mapeada no OSM (natural=tree)', 'secundaria'],
        'osm-row': ['Fileira de árvores mapeada no OSM (natural=tree_row)', 'secundaria'],
        'osm-area': ['Distribuída dentro de área vegetada do OSM (mata/arbustos/parque)', 'estimativa'],
        street: ['Arborização viária ilustrativa', 'estimativa'],
      };
      const [label, rel] = srcLabel[src] ?? ['—', 'estimativa'];
      return {
        kindLabel: 'Vegetação',
        title: SPECIES_LABEL[sp] ?? `Árvore — modelo ${sp} (RCC Design)`,
        description: 'Modelo procedural representativo. As espécies reais não estão identificadas nos dados abertos; a variedade de formas, escalas e rotações evita a repetição de um único modelo.',
        facts: [f('Origem da posição', label, rel, ['osm']), f('Espécie real', 'Não disponível', 'indisponivel')],
        sources: ['osm'],
      };
    }
    case 'water':
      return { kindLabel: 'Água', title: FACILITIES.lake.name, description: FACILITIES.lake.description, facts: FACILITIES.lake.facts, sources: FACILITIES.lake.sources };
    case 'tower': {
      const map: Record<string, InfoView> = {
        poste: { kindLabel: 'Iluminação', title: 'Poste de iluminação', description: 'Postes ao longo das avenidas (marcadas com lit=yes no OSM) e torres de iluminação em estacionamentos e pátios. Não há iluminação de pista para corridas noturnas no modelo.', facts: [f('Postes mapeados', 'highway=street_lamp (OSM)', 'secundaria', ['osm']), f('Distribuição ao longo das vias', 'A cada ~36 m (estimativa)', 'estimativa')], sources: ['osm'] },
        transmissao: { kindLabel: 'Torre', title: 'Torre de linha de transmissão', description: 'Torres de energia mapeadas no OSM (power=tower), com cabos entre elas.', facts: [f('Posição', 'power=tower (OSM)', 'secundaria', ['osm']), f('Altura', '≈ 32 m (estimativa)', 'estimativa')], sources: ['osm'] },
        telecom: { kindLabel: 'Torre', title: 'Torre de telecomunicações', description: 'Torres de comunicação mapeadas no OSM (man_made=tower).', facts: [f('Posição', 'man_made=tower (OSM)', 'secundaria', ['osm']), f('Altura', '≈ 42 m (estimativa)', 'estimativa')], sources: ['osm'] },
        'caixa-dagua': { kindLabel: 'Estrutura', title: "Caixa d'água", description: 'Reservatório elevado mapeado no OSM (man_made=water_tower).', facts: [f('Posição', 'man_made=water_tower (OSM)', 'secundaria', ['osm'])], sources: ['osm'] },
      };
      return map[sel.id] ?? null;
    }
    default:
      return null;
  }
}

export const KIND_LABELS = KIND_LABEL;

/** Nome curto para tooltips e barra inferior. */
export function shortName(sel: Selection | null): string {
  if (!sel) return '—';
  const i = getInfo(sel);
  if (!i) return sel.id;
  return i.number && sel.kind === 'corner' ? `T${i.number} · ${i.title}` : i.title;
}

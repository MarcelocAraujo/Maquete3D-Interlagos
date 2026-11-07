import type { Fact, Reliability, Straight } from '../types';
import { altitude, osmSegmentByCorner, osmSegmentByName, rangeLength, rangeStats, wrapS } from './track';
import { REF } from './markers';
import { sectorOf, cornerById } from './corners';

const f = (label: string, value: string, reliability: Reliability, sources?: string[], note?: string): Fact => ({ label, value, reliability, sources, note });

const t = osmSegmentByCorner;

function geo(s0: number, s1: number): Fact[] {
  const st = rangeStats(s0, s1);
  return [
    f('Comprimento', `${Math.round(st.length)} m`, 'estimativa', ['osm'], 'Medido na linha central do modelo (OSM). Não há comprimento oficial publicado para o trecho.'),
    f('Altitude início → fim', `${Math.round(altitude(st.yIn))} m → ${Math.round(altitude(st.yOut))} m`, 'estimativa', ['srtm']),
    f('Inclinação média', `${st.gradePct > 0 ? '+' : ''}${st.gradePct.toFixed(1)}%`, 'estimativa', ['srtm']),
  ];
}

const opostaSeg = osmSegmentByName('Reta Oposta')[0];
const mainS0 = t(15).s1;
const mainS1 = t(1).s0;
// trecho informal: entre o fim da Curva 5 e o início da Curva 6 (definidos pela curvatura)
const lagoS0 = cornerById('t5')!.s1;
const lagoS1 = cornerById('t6')!.s0;

export const STRAIGHTS: Straight[] = [
  {
    id: 'reta-principal',
    name: 'Reta dos Boxes (Reta Principal)',
    s0: mainS0,
    s1: mainS1,
    sector: [3, 1],
    lengthM: rangeLength(mainS0, mainS1),
    entry: 'Saída da Curva 15 (Arquibancadas)',
    exit: 'Frenagem da Curva 1 (S do Senna)',
    facts: [
      ...geo(mainS0, mainS1),
      f('Speed trap (90 m antes da T1) – corrida 2025', '335,6 km/h — C. Sainz (Williams)', 'oficial', ['fia-2025-max-speeds'], 'Velocidade medida no ponto do speed trap; não equivale à velocidade máxima absoluta da volta.'),
      f('Linha de chegada – corrida 2025', '339,9 km/h — C. Sainz (Williams)', 'oficial', ['fia-2025-max-speeds']),
      f('Speed trap – corrida 2022', '338,1 km/h — L. Stroll (Aston Martin)', 'oficial', ['fia-2022-max-speeds']),
      f('Trecho de pé embaixo', `≈ ${Math.round(rangeLength(t(12).s1, t(1).s0))} m da saída da Junção à frenagem da T1`, 'estimativa', ['osm', 'wikipedia'], 'Wikipedia descreve o trecho como uma das sequências de aceleração total mais longas do calendário.'),
      f('DRS', 'Zona 2: detecção 30 m após a T13, ativação 160 m antes da T15 (até 2025)', 'oficial', ['fia-2022-event-notes']),
      f('Regulamento 2026', 'DRS extinto; substituído por aerodinâmica ativa e modo de ultrapassagem', 'secundaria', undefined, 'Pontos de ativação de 2026 não confirmados nas fontes consultadas.'),
      f('Largada', 'Linha de largada 30 m à frente da linha de chegada', 'oficial', ['fia-2022-preview']),
    ],
    description: 'Reta em subida entre a Curva 15 e o S do Senna, com os boxes à esquerda e as arquibancadas (setores M e vizinhos) à direita. Faz parte da longa sequência de pé embaixo que começa na Junção — a Prefeitura indica o S do Senna como ponto mais alto do circuito.',
    overtaking: 'Principal oportunidade de ultrapassagem: vácuo + DRS até a frenagem da Curva 1.',
    sources: ['fia-2025-max-speeds', 'fia-2022-max-speeds', 'fia-2022-event-notes', 'fia-2022-preview', 'osm'],
  },
  {
    id: 'reta-oposta',
    name: 'Reta Oposta',
    s0: opostaSeg.s0,
    s1: opostaSeg.s1,
    sector: [1, 2],
    lengthM: rangeLength(opostaSeg.s0, opostaSeg.s1),
    entry: 'Saída da Curva 3 (Curva do Sol)',
    exit: 'Frenagem da Curva 4 (Descida do Lago)',
    facts: [
      ...geo(opostaSeg.s0, opostaSeg.s1),
      f('Velocidade no ponto I1 – corrida 2025', '340,4 km/h — A. Albon (Williams)', 'oficial', ['fia-2025-max-speeds'], 'Maior velocidade registrada entre todos os pontos de medição da corrida de 2025. Laço I1 no fim do Setor 1 (168 m antes da T4), conforme convenção da cronometragem F1.'),
      f('Ponto I1 – corrida 2022', '329,4 km/h — M. Verstappen (Red Bull)', 'oficial', ['fia-2022-max-speeds']),
      f('DRS', 'Zona 1: detecção no ápice da T2, ativação 30 m após a T3 (até 2025)', 'oficial', ['fia-2022-event-notes']),
      f('Fim do Setor 1', '168 m antes da Curva 4', 'oficial', ['fia-2022-event-notes']),
      f('Saída dos boxes', 'O pit lane converge na primeira metade da reta', 'secundaria', ['osm', 'wikipedia']),
    ],
    description: 'Reta em descida que liga a Curva do Sol à Descida do Lago, passando pelo fim do Setor 1. Recebe a saída do longo pit lane de Interlagos.',
    overtaking: 'Segundo principal ponto de ultrapassagem, com DRS e frenagem forte na Curva 4.',
    sources: ['fia-2025-max-speeds', 'fia-2022-max-speeds', 'fia-2022-event-notes', 'osm'],
  },
  {
    id: 'trecho-lago',
    name: 'Trecho do Lago (T5–T6)',
    s0: lagoS0,
    s1: lagoS1,
    sector: 2,
    lengthM: rangeLength(lagoS0, lagoS1),
    entry: 'Saída da Curva 5 (Descida do Lago)',
    exit: 'Entrada da Curva 6 (Ferradura)',
    facts: [
      ...geo(lagoS0, lagoS1),
      f('Denominação', 'Nome descritivo usado neste app (o trecho não tem nome no OSM nem na FIA)', 'estimativa'),
      f('Velocidade máxima', 'Não disponível', 'indisponivel', undefined, 'Não há ponto oficial de medição neste trecho.'),
    ],
    description: 'Trecho de leve curvatura à esquerda que sai do ponto mais baixo do circuito e sobe em direção à Ferradura.',
    overtaking: 'Pouco usado; serve de vácuo para a frenagem da Ferradura.',
    sources: ['osm', 'srtm'],
  },
];

export const straightById = (id: string) => STRAIGHTS.find((s) => s.id === id);
export function straightAt(s: number) {
  const x = wrapS(s);
  return STRAIGHTS.find((st) => wrapS(x - st.s0) <= rangeLength(st.s0, st.s1));
}
export const _sectorOf = sectorOf;
export const _ref = REF;

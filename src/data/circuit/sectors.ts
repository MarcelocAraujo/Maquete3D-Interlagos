import type { Fact, Reliability, Sector } from '../types';
import { TRACK, rangeLength } from './track';
import { REF } from './markers';

const f = (label: string, value: string, reliability: Reliability, sources?: string[], note?: string): Fact => ({ label, value, reliability, sources, note });

export const SECTOR_COLORS = ['#e8160c', '#bf8a10', '#2b8fd6'] as const;

const len = (a: number, b: number) => Math.round(rangeLength(a, b));

export const SECTORS: Sector[] = [
  {
    id: 's1',
    number: 1,
    name: 'Setor 1',
    color: SECTOR_COLORS[0],
    s0: REF.finishLine,
    s1: REF.sector1End,
    lengthM: rangeLength(REF.finishLine, REF.sector1End),
    startLabel: 'Linha de chegada (controle)',
    endLabel: '168 m antes da Curva 4, na Reta Oposta',
    corners: ['t1', 't2', 't3'],
    straights: ['reta-principal', 'reta-oposta'],
    facts: [
      f('Extensão', `≈ ${len(REF.finishLine, REF.sector1End)} m`, 'estimativa', ['osm', 'fia-2022-event-notes'], 'Distância no modelo entre a linha de chegada e o laço S1 posicionado conforme a FIA.'),
      f('Limite final', '168 m antes da Curva 4', 'oficial', ['fia-2022-event-notes']),
      f('Melhor setor – corrida 2025', '18,386 s — A. Albon (Williams)', 'oficial', ['fia-2025-sectors']),
      f('Melhor setor – corrida 2022', '18,744 s — C. Leclerc (Ferrari)', 'oficial', ['fia-2022-sectors']),
      f('Speed trap (dentro do setor)', '335,6 km/h — C. Sainz, corrida 2025', 'oficial', ['fia-2025-max-speeds']),
      f('Velocidade no fim do setor (I1)', '340,4 km/h — A. Albon, corrida 2025', 'oficial', ['fia-2025-max-speeds']),
    ],
    description: 'Do fim da reta principal ao meio da Reta Oposta: S do Senna, Curva do Sol e a primeira zona de DRS. Setor curto de frenagem forte e aceleração.',
    challenges: 'Frenagem em descida na Curva 1, saída limpa do S e Curva do Sol de pé embaixo.',
    overtaking: 'Curva 1 (fim da reta principal) e, em seguida, a Reta Oposta com DRS até a Curva 4.',
    sources: ['fia-2022-event-notes', 'fia-2025-sectors', 'fia-2022-sectors', 'fia-2025-max-speeds'],
  },
  {
    id: 's2',
    number: 2,
    name: 'Setor 2',
    color: SECTOR_COLORS[1],
    s0: REF.sector1End,
    s1: REF.sector2End,
    lengthM: rangeLength(REF.sector1End, REF.sector2End),
    startLabel: '168 m antes da Curva 4',
    endLabel: '85 m antes da Curva 12 (Junção)',
    corners: ['t4', 't5', 't6', 't7', 't8', 't9', 't10', 't11'],
    straights: ['reta-oposta', 'trecho-lago'],
    facts: [
      f('Extensão', `≈ ${len(REF.sector1End, REF.sector2End)} m`, 'estimativa', ['osm', 'fia-2022-event-notes']),
      f('Limites', '168 m antes da T4 → 85 m antes da T12', 'oficial', ['fia-2022-event-notes']),
      f('Melhor setor – corrida 2025', '36,746 s — M. Verstappen (Red Bull)', 'oficial', ['fia-2025-sectors']),
      f('Melhor setor – corrida 2022', '37,565 s — G. Russell (Mercedes)', 'oficial', ['fia-2022-sectors']),
      f('Velocidade no fim do setor (I2)', '263,4 km/h — G. Russell, corrida 2025', 'oficial', ['fia-2025-max-speeds']),
    ],
    description: 'O miolo técnico de Interlagos: Descida do Lago, Ferradura, Laranjinha, Pinheirinho, Bico de Pato e Mergulho. É o setor mais longo e mais lento, decisivo para o acerto de pressão aerodinâmica.',
    challenges: 'Curvas lentas e cegas encadeadas, grandes variações de altitude (do ponto mais baixo, no Lago, à subida da Ferradura) e tração na saída do Bico de Pato.',
    overtaking: 'Curva 4 (fim do DRS 1); oportunidades pontuais no Pinheirinho e no Bico de Pato.',
    sources: ['fia-2022-event-notes', 'fia-2025-sectors', 'fia-2022-sectors', 'fia-2025-max-speeds'],
  },
  {
    id: 's3',
    number: 3,
    name: 'Setor 3',
    color: SECTOR_COLORS[2],
    s0: REF.sector2End,
    s1: TRACK.length,
    lengthM: rangeLength(REF.sector2End, TRACK.length),
    startLabel: '85 m antes da Curva 12 (Junção)',
    endLabel: 'Linha de chegada (controle)',
    corners: ['t12', 't13', 't14', 't15'],
    straights: ['reta-principal'],
    facts: [
      f('Extensão', `≈ ${len(REF.sector2End, TRACK.length)} m`, 'estimativa', ['osm', 'fia-2022-event-notes']),
      f('Limite inicial', '85 m antes da Curva 12', 'oficial', ['fia-2022-event-notes']),
      f('Melhor setor – corrida 2025', '16,536 s — G. Russell (Mercedes)', 'oficial', ['fia-2025-sectors']),
      f('Melhor setor – corrida 2022', '16,941 s — C. Sainz (Ferrari)', 'oficial', ['fia-2022-sectors']),
      f('Velocidade na linha de chegada', '339,9 km/h — C. Sainz, corrida 2025', 'oficial', ['fia-2025-max-speeds']),
    ],
    description: 'Junção e a longa subida de pé embaixo (Café, Subida dos Boxes e Arquibancadas) até a linha de chegada.',
    challenges: 'Saída da Junção: cada km/h perdido ali se repete por mais de um quilômetro de aceleração total em subida.',
    overtaking: 'O setor prepara a ultrapassagem da Curva 1, com vácuo e (até 2025) a segunda zona de DRS.',
    sources: ['fia-2022-event-notes', 'fia-2025-sectors', 'fia-2022-sectors', 'fia-2025-max-speeds'],
  },
];

export const sectorById = (id: string) => SECTORS.find((s) => s.id === id);

export const LAP_FACTS = {
  officialLength: f('Comprimento oficial', '4.309 m', 'oficial', ['fia-2022-event-notes', 'pref-circuito', 'f1-2025']),
  modelLength: f('Comprimento da linha central no modelo', `${TRACK.length.toFixed(1).replace('.', ',')} m (OSM bruto: ${TRACK.osmLoopLength.toFixed(1).replace('.', ',')} m)`, 'estimativa', ['osm'], 'Diferença menor que 0,1% em relação ao valor oficial.'),
};

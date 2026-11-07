import { TRACK, frameAt, osmSegmentByCorner, wrapS } from './track';

/** Ápice (extremo de curvatura com o sentido dado) nas proximidades do trecho OSM da curva. */
function apexOf(n: number, sign: 1 | -1) {
  const seg = osmSegmentByCorner(n);
  let best = -1;
  let apex = seg.s0;
  for (let s = seg.s0 - 60; s <= seg.s1 + 30; s += 2) {
    const v = sign * frameAt(s).k;
    if (v > best) {
      best = v;
      apex = wrapS(s);
    }
  }
  return apex;
}

/**
 * Pontos de referência ao longo do traçado.
 * Convenção adotada: "Turn N" dos documentos da FIA = início do trecho OSM
 * marcado com raceway:corner_number = N (ver docs/METODOLOGIA.md).
 */
const t = (n: number) => osmSegmentByCorner(n);

export const REF = {
  finishLine: 0,
  /** FIA Race Preview 2022: "Start line/finish line offset: 0.030km" (largada 30 m à frente da linha de controle). */
  startLine: 30,
  speedTrap: wrapS(t(1).s0 - 90),          // FIA: Speed Trap (90 m before Turn 1)
  sector1End: wrapS(t(4).s0 - 168),        // FIA: Sector 1 (168 m before Turn 4)
  sector2End: wrapS(t(12).s0 - 85),        // FIA: Sector 2 (85 m before Turn 12)
  drs1Detection: apexOf(2, -1), // FIA: apex of Turn 2 (extremo de curvatura)
  drs1Activation: wrapS(t(3).s1 + 30),     // FIA: 30 m after Turn 3
  drs2Detection: wrapS(t(13).s1 + 30),     // FIA: 30 m after Turn 13
  drs2Activation: wrapS(t(15).s0 - 160),   // FIA (Event Notes 2022): 160 m before Turn 15
  pitEntry: TRACK.pit.entryS,
  pitExit: TRACK.pit.exitS,
};

export interface TrackMarker {
  id: string;
  label: string;
  short: string;
  s: number;
  kind: 'line' | 'timing' | 'drs' | 'pit';
  color: string;
  note: string;
  sources: string[];
}

export const MARKERS: TrackMarker[] = [
  { id: 'finish', label: 'Linha de chegada / controle', short: 'CHEGADA', s: REF.finishLine, kind: 'line', color: '#ffffff', note: 'Origem (s = 0) de todas as distâncias do modelo. Posição a partir do nó OSM "Finish Line".', sources: ['osm', 'fia-2022-event-notes'] },
  { id: 'start', label: 'Linha de largada', short: 'LARGADA', s: REF.startLine, kind: 'line', color: '#ffffff', note: 'A FIA informa offset de 0,030 km entre largada e chegada (o OSM posiciona a largada a ~60 m; adotado o valor oficial).', sources: ['fia-2022-preview'] },
  { id: 'speedtrap', label: 'Speed trap', short: 'ST', s: REF.speedTrap, kind: 'timing', color: '#f5c518', note: '90 m antes da Curva 1 (FIA, Event Notes 2022).', sources: ['fia-2022-event-notes'] },
  { id: 's1', label: 'Fim do Setor 1 (laço I1)', short: 'S1', s: REF.sector1End, kind: 'timing', color: '#e10600', note: '168 m antes da Curva 4 (FIA, Event Notes 2022).', sources: ['fia-2022-event-notes'] },
  { id: 's2', label: 'Fim do Setor 2 (laço I2)', short: 'S2', s: REF.sector2End, kind: 'timing', color: '#e10600', note: '85 m antes da Curva 12 (FIA, Event Notes 2022).', sources: ['fia-2022-event-notes'] },
  { id: 'drs1d', label: 'DRS 1 – detecção', short: 'D1', s: REF.drs1Detection, kind: 'drs', color: '#00d2be', note: 'Ápice da Curva 2 (FIA 2022). O DRS foi substituído por aerodinâmica ativa no regulamento de 2026.', sources: ['fia-2022-event-notes'] },
  { id: 'drs1a', label: 'DRS 1 – ativação', short: 'A1', s: REF.drs1Activation, kind: 'drs', color: '#00d2be', note: '30 m após a Curva 3 (FIA 2022).', sources: ['fia-2022-event-notes'] },
  { id: 'drs2d', label: 'DRS 2 – detecção', short: 'D2', s: REF.drs2Detection, kind: 'drs', color: '#00d2be', note: '30 m após a Curva 13 (FIA 2022).', sources: ['fia-2022-event-notes'] },
  { id: 'drs2a', label: 'DRS 2 – ativação', short: 'A2', s: REF.drs2Activation, kind: 'drs', color: '#00d2be', note: '160 m antes da Curva 15 (Event Notes 2022; o Race Preview do mesmo ano grafa "after", divergência registrada).', sources: ['fia-2022-event-notes', 'fia-2022-preview'] },
  { id: 'pitin', label: 'Entrada do pit lane', short: 'PIT IN', s: REF.pitEntry, kind: 'pit', color: '#ff8a00', note: 'Bifurcação da via OSM "Pit Lane" (antes da Curva 15).', sources: ['osm'] },
  { id: 'pitout', label: 'Saída do pit lane', short: 'PIT OUT', s: REF.pitExit, kind: 'pit', color: '#ff8a00', note: 'Retorno à pista na Reta Oposta, após a Curva do Sol.', sources: ['osm', 'wikipedia'] },
];

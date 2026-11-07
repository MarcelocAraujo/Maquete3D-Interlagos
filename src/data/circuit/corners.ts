import type { Corner, Fact, Reliability } from '../types';
import { TRACK, altitude, frameAt, osmSegmentByCorner, rangeStats, wrapS } from './track';
import { REF } from './markers';

const f = (label: string, value: string, reliability: Reliability, sources?: string[], note?: string): Fact => ({ label, value, reliability, sources, note });
const ND = (label: string, note = 'Nenhuma fonte confiável encontrada para este dado.'): Fact => f(label, 'Não disponível', 'indisponivel', undefined, note);

export function sectorOf(s: number): 1 | 2 | 3 {
  const x = wrapS(s);
  if (x < REF.sector1End) return 1;
  if (x < REF.sector2End) return 2;
  return 3;
}

interface CornerSpec {
  number: number;
  name: string;
  altNames?: string[];
  facts: Fact[];
  description: string;
  racingLine: string;
  overtaking: string;
  difficulty: Corner['difficulty'];
  history?: string;
  sources: string[];
}

const NOME_ORIGEM = (txt: string, src = ['mercedes-corners', 'wikipedia']) => f('Origem do nome', txt, 'secundaria', src);
const SEM_VEL = [ND('Velocidade mínima (F1)'), ND('Marcha (F1)'), ND('Ponto de frenagem (distância)')];

const SPECS: CornerSpec[] = [
  {
    number: 1,
    name: 'S do Senna',
    altNames: ['Esse do Senna', 'Senna S', 'Curva 1'],
    facts: [
      f('Velocidade no speed trap (90 m antes)', '335,6 km/h — C. Sainz (Williams), corrida 2025', 'oficial', ['fia-2025-max-speeds', 'fia-2022-event-notes'], 'Maior valor do speed trap na corrida de 2025. Não é a velocidade máxima absoluta da volta.'),
      f('Speed trap – corrida 2022', '338,1 km/h — L. Stroll (Aston Martin)', 'oficial', ['fia-2022-max-speeds']),
      f('Fim da zona de DRS', 'Final da zona 2 (reta principal) — regra até 2025', 'oficial', ['fia-2022-event-notes']),
      ...SEM_VEL,
      NOME_ORIGEM('Homenagem a Ayrton Senna, tricampeão mundial de F1.'),
    ],
    description: 'Primeira perna do S do Senna: curva à esquerda, em descida, ao fim da longa sequência de pé embaixo que começa na Junção. Segundo a Prefeitura, o ponto mais alto do circuito fica no S do Senna.',
    racingLine: 'Frenagem forte em linha reta, tangência tardia à esquerda para posicionar o carro para a perna seguinte, à direita (descrição qualitativa de guias de pilotagem).',
    overtaking: 'Principal ponto de ultrapassagem do circuito: fim da zona de DRS da reta principal e maior frenagem da volta. A FIA destaca o bom potencial de ultrapassagem no fim das duas zonas de DRS.',
    difficulty: { level: 4, reliability: 'estimativa', note: 'Classificação editorial: frenagem forte em descida e entrada cega na sequência.' },
    history: 'O "S" foi criado na reforma de 1989–1990, que encurtou o circuito para 4.325 m; relatos atribuem a Ayrton Senna a sugestão do desenho.',
    sources: ['fia-2022-event-notes', 'pref-circuito', 'pref-historia', 'mercedes-corners', 'lmu-guide'],
  },
  {
    number: 2,
    name: 'S do Senna',
    altNames: ['Senna S (2ª perna)', 'Curva 2'],
    facts: [
      f('Detecção do DRS 1', 'No ápice da Curva 2 (regra até 2025)', 'oficial', ['fia-2022-event-notes']),
      ...SEM_VEL,
      NOME_ORIGEM('Homenagem a Ayrton Senna.'),
    ],
    description: 'Segunda perna do S, à direita, ainda em descida. A saída limpa define a velocidade em toda a Curva do Sol e na Reta Oposta.',
    racingLine: 'Tangência no meio da curva e aceleração total a partir do ápice, usando a largura da pista na saída.',
    overtaking: 'Disputas lado a lado vindas da Curva 1 são comuns; a ultrapassagem efetiva costuma se completar na Reta Oposta.',
    difficulty: { level: 3, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['fia-2022-event-notes', 'mercedes-corners', 'lmu-guide'],
  },
  {
    number: 3,
    name: 'Curva do Sol',
    altNames: ['Curva 3'],
    facts: [
      f('Regime', 'Longa curva à esquerda feita de pé embaixo em condições normais', 'secundaria', ['mercedes-corners', 'lmu-guide']),
      f('Ativação do DRS 1', '30 m após a Curva 3 (regra até 2025)', 'oficial', ['fia-2022-event-notes']),
      f('Saída do pit lane', 'O pit lane retorna à pista após a Curva do Sol', 'secundaria', ['wikipedia', 'osm']),
      ND('Velocidade de passagem (F1)'),
      ND('Marcha (F1)'),
      f('Inclinação transversal', 'Representada como leve inclinação (~1,7°) – valor estimado', 'estimativa', undefined, 'A F1 menciona curvas inclinadas em Interlagos, sem valores.'),
    ],
    description: 'Curva longa e aberta à esquerda que lança os carros na Reta Oposta. É o fim do Setor 1 em termos de curvas.',
    racingLine: 'Traçado amplo, colando na parte interna do meio da curva e saindo aberto para maximizar a velocidade na reta.',
    overtaking: 'Não é ponto de ultrapassagem, mas a saída define o ataque na Reta Oposta (zona de DRS 1).',
    difficulty: { level: 2, reliability: 'estimativa', note: 'Classificação editorial: curva rápida, de baixo risco em seco.' },
    sources: ['fia-2022-event-notes', 'mercedes-corners', 'wikipedia'],
  },
  {
    number: 4,
    name: 'Descida do Lago',
    altNames: ['Curva 4'],
    facts: [
      f('Velocidade no ponto I1 (168 m antes)', '340,4 km/h — A. Albon (Williams), corrida 2025', 'oficial', ['fia-2025-max-speeds'], 'Valor oficial; localização do laço I1 no fim do Setor 1 segue a convenção da cronometragem da F1.'),
      f('Ponto I1 – corrida 2022', '329,4 km/h — M. Verstappen (Red Bull)', 'oficial', ['fia-2022-max-speeds']),
      f('Fim da zona de DRS', 'Final da zona 1 (Reta Oposta) — regra até 2025', 'oficial', ['fia-2022-event-notes']),
      ...SEM_VEL,
      NOME_ORIGEM('"Descida do Lago": curva em descida próxima ao lago, em uma das partes mais baixas do circuito.'),
    ],
    description: 'Primeira perna da Descida do Lago: forte frenagem ao fim da Reta Oposta para uma curva à esquerda em descida.',
    racingLine: 'Frenagem em linha reta pelo lado direito e entrada para a esquerda; a saída prepara a segunda perna (Curva 5).',
    overtaking: 'Segundo melhor ponto de ultrapassagem, no fim da zona de DRS da Reta Oposta.',
    difficulty: { level: 3, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['fia-2022-event-notes', 'mercedes-corners', 'lmu-guide'],
  },
  {
    number: 5,
    name: 'Descida do Lago',
    altNames: ['Curva do Lago', 'Curva 5'],
    facts: [
      f('Ponto mais baixo do circuito', 'A Prefeitura indica a "Curva do Lago" como o ponto mais baixo; o perfil SRTM do modelo também tem seu mínimo neste trecho', 'oficial', ['pref-circuito', 'srtm']),
      ...SEM_VEL,
      NOME_ORIGEM('Proximidade do lago interno do autódromo.'),
    ],
    description: 'Segunda curva à esquerda da Descida do Lago, longa, no ponto mais baixo da pista. Uma boa saída é essencial para o trecho seguinte até a Ferradura.',
    racingLine: 'Frenagem moderada, tangência longa e saída antecipada para carregar velocidade.',
    overtaking: 'Possível como continuação de disputa iniciada na Curva 4.',
    difficulty: { level: 3, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['pref-circuito', 'mercedes-corners', 'lmu-guide', 'srtm'],
  },
  {
    number: 6,
    name: 'Ferradura',
    altNames: ['Curva 6'],
    facts: [
      f('Formato', 'Primeira perna de uma dupla à direita em forma de ferradura', 'secundaria', ['mercedes-corners', 'wikipedia']),
      f('Mudança de pista (2022)', 'Novo guard-rail instalado na área de escape entre as curvas 6 e 7, à esquerda', 'oficial', ['fia-2022-preview']),
      ...SEM_VEL,
      NOME_ORIGEM('"Ferradura": o desenho das curvas 6 e 7 lembra uma ferradura.'),
    ],
    description: 'Início da Ferradura: curva rápida à direita, em subida segundo o perfil de elevação do modelo.',
    racingLine: 'Pouca frenagem — normalmente apenas um alívio no acelerador — e tangência precoce para encadear a Curva 7.',
    overtaking: 'Pouco provável.',
    difficulty: { level: 3, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['mercedes-corners', 'fia-2022-preview', 'lmu-guide'],
  },
  {
    number: 7,
    name: 'Ferradura',
    altNames: ['Curva 7', 'Curva do Laranjinha (rótulo no OSM)'],
    facts: [
      f('Nomenclatura', 'F1/FIA e Mercedes tratam 6–7 como Ferradura; no OSM este trecho aparece como "Curva do Laranjinha"', 'secundaria', ['mercedes-corners', 'osm']),
      ...SEM_VEL,
    ],
    description: 'Segunda perna da Ferradura, à direita e em subida, exigindo tangência tardia para preparar a Laranjinha.',
    racingLine: 'Ápice tardio e aceleração progressiva em subida.',
    overtaking: 'Pouco provável.',
    difficulty: { level: 3, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['mercedes-corners', 'lmu-guide', 'osm'],
  },
  {
    number: 8,
    name: 'Laranjinha',
    altNames: ['Curva do Laranja', 'Curva 8', 'Esse (rótulo no OSM)'],
    facts: [
      f('Nomenclatura', 'No OSM este trecho aparece como "Esse"', 'secundaria', ['osm']),
      ...SEM_VEL,
      NOME_ORIGEM('"Laranjinha" (pequena laranja); o antigo traçado já tinha a "Curva do Laranja".', ['mercedes-corners', 'pref-historia']),
    ],
    description: 'Curva lenta à direita no alto do miolo, de raio pequeno no modelo. Antecede a descida para o Pinheirinho.',
    racingLine: 'Frenagem prolongada até o ápice (trail braking) e saída curta para a esquerda.',
    overtaking: 'Raro.',
    difficulty: { level: 4, reliability: 'estimativa', note: 'Classificação editorial: curva fechada e cega.' },
    sources: ['mercedes-corners', 'osm', 'pref-historia'],
  },
  {
    number: 9,
    name: 'Pinheirinho',
    altNames: ['Curva 9'],
    facts: [
      f('Característica', 'Curva lenta à esquerda; descrita como uma das poucas do circuito com pouca variação de altitude', 'secundaria', ['mercedes-corners']),
      ...SEM_VEL,
      NOME_ORIGEM('"Pinheirinho" (pequeno pinheiro); nome herdado do traçado antigo ("Curva do Pinheirinho").', ['mercedes-corners', 'pref-historia']),
    ],
    description: 'Curva lenta à esquerda no miolo. A frenagem e a rotação do carro aqui definem a entrada no Bico de Pato.',
    racingLine: 'Frenagem prolongada até o fundo da curva, priorizando a posição para o Bico de Pato.',
    overtaking: 'Possível com mergulho por dentro na frenagem, sobretudo com pneus em pior estado do adversário.',
    difficulty: { level: 3, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['mercedes-corners', 'pref-historia', 'lmu-guide'],
  },
  {
    number: 10,
    name: 'Bico de Pato',
    altNames: ['Curva do Cotovelo (nome antigo)', 'Curva 10'],
    facts: [
      f('Formato', 'Grampo (hairpin) à direita — o raio mínimo mais fechado do modelo', 'secundaria', ['lmu-guide', 'osm']),
      f('Nome antigo', '"Curva do Cotovelo", depois rebatizada Bico de Pato', 'oficial', ['pref-historia']),
      ...SEM_VEL,
      NOME_ORIGEM('O formato lembra o bico de um pato.'),
    ],
    description: 'Grampo à direita, o ponto mais fechado do circuito. Frenagem forte e saída em tração para o Mergulho.',
    racingLine: 'Frenagem forte com trail braking para girar o carro e ápice tardio, priorizando a saída.',
    overtaking: 'Ponto de ultrapassagem secundário, por dentro na frenagem.',
    difficulty: { level: 4, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['mercedes-corners', 'pref-historia', 'lmu-guide'],
  },
  {
    number: 11,
    name: 'Mergulho',
    altNames: ['Curva 11'],
    facts: [
      f('Regime', 'Curva rápida à esquerda, em descida acentuada', 'secundaria', ['mercedes-corners', 'lmu-guide']),
      ...SEM_VEL,
      NOME_ORIGEM('"Mergulho": a pista mergulha em descida após o Bico de Pato.'),
    ],
    description: 'Curva rápida à esquerda em forte descida — no modelo, cerca de 12 m de queda ao longo do trecho. Leva à Junção.',
    racingLine: 'Traçado amplo; o carro fica leve na descida, exigindo precisão para não perder a linha da Junção.',
    overtaking: 'Pouco provável.',
    difficulty: { level: 4, reliability: 'estimativa', note: 'Classificação editorial: alta velocidade em descida.' },
    sources: ['mercedes-corners', 'lmu-guide', 'srtm'],
  },
  {
    number: 12,
    name: 'Junção',
    altNames: ['Curva 12'],
    facts: [
      f('Velocidade no ponto I2 (85 m antes)', '263,4 km/h — G. Russell (Mercedes), corrida 2025', 'oficial', ['fia-2025-max-speeds'], 'Valor oficial; localização do laço I2 no fim do Setor 2 segue a convenção da cronometragem da F1.'),
      f('Ponto I2 – corrida 2022', '259,3 km/h — S. Pérez (Red Bull)', 'oficial', ['fia-2022-max-speeds']),
      f('Início do Setor 3', 'O Setor 3 começa 85 m antes da Curva 12', 'oficial', ['fia-2022-event-notes']),
      ...SEM_VEL,
      NOME_ORIGEM('"Junção": no traçado antigo, ponto de encontro do anel externo com o miolo.'),
    ],
    description: 'Curva à esquerda, de média velocidade e em subida, considerada a mais crítica da volta: a saída define a velocidade em toda a subida até o S do Senna.',
    racingLine: 'Ápice tardio e aceleração antecipada, sacrificando a entrada em favor da saída.',
    overtaking: 'Mais usada para defender posição; a ultrapassagem acontece depois, na Curva 1.',
    difficulty: { level: 5, reliability: 'estimativa', note: 'Classificação editorial: erro aqui custa tempo na maior sequência de pé embaixo do calendário.' },
    sources: ['fia-2022-event-notes', 'mercedes-corners', 'lmu-guide'],
  },
  {
    number: 13,
    name: 'Café',
    altNames: ['Curva do Café', 'Curva da Vitória (traçado antigo)', 'Curva 13'],
    facts: [
      f('Regime', 'Curva à esquerda feita de pé embaixo', 'secundaria', ['mercedes-corners', 'wikipedia']),
      f('Detecção do DRS 2', '30 m após a Curva 13 (regra até 2025)', 'oficial', ['fia-2022-event-notes']),
      f('Nome no traçado antigo', '"Curva do Café (também Curva da Vitória)"', 'oficial', ['pref-historia']),
      ND('Velocidade de passagem (F1)'),
    ],
    description: 'Primeira das curvas de pé embaixo da subida que leva à reta dos boxes.',
    racingLine: 'Mínimo esterço possível pela parte interna para reduzir o arrasto.',
    overtaking: 'Não; é o início da longa zona de vácuo até a Curva 1.',
    difficulty: { level: 2, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['mercedes-corners', 'pref-historia', 'fia-2022-event-notes'],
  },
  {
    number: 14,
    name: 'Subida dos Boxes',
    altNames: ['Curva 14'],
    facts: [
      f('Inclinação longitudinal', 'Subida com cerca de 10% de inclinação', 'secundaria', ['mercedes-corners', 'wikipedia']),
      f('Regime', 'Esquerda de pé embaixo, em subida', 'secundaria', ['wikipedia']),
      ND('Velocidade de passagem (F1)'),
    ],
    description: 'Curva longa à esquerda em forte subida. Ao lado fica a arquibancada do Setor A.',
    racingLine: 'Pela parte interna, com o mínimo de esterço.',
    overtaking: 'Não; o vácuo começa a fazer efeito.',
    difficulty: { level: 2, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['mercedes-corners', 'wikipedia'],
  },
  {
    number: 15,
    name: 'Arquibancadas',
    altNames: ['Curva 15'],
    facts: [
      f('Ativação do DRS 2', '160 m antes da Curva 15 (Event Notes 2022)', 'oficial', ['fia-2022-event-notes']),
      f('Entrada dos boxes', 'O pit lane se separa da pista neste trecho, pela esquerda', 'secundaria', ['osm']),
      f('Regime', 'Última inflexão à esquerda, de pé embaixo, antes da linha de chegada', 'secundaria', ['mercedes-corners', 'lmu-guide']),
      ND('Velocidade de passagem (F1)'),
    ],
    description: 'Última inflexão à esquerda, entre as arquibancadas da reta e a entrada dos boxes. Daqui até a Curva 1 é tudo de pé embaixo.',
    racingLine: 'Linha reta tanto quanto possível, cortando a inflexão.',
    overtaking: 'Não; é onde o carro de trás se posiciona no vácuo.',
    difficulty: { level: 1, reliability: 'estimativa', note: 'Classificação editorial.' },
    sources: ['fia-2022-event-notes', 'mercedes-corners', 'osm'],
  },
];

/**
 * Segmentação pela curvatura da geometria: o OSM fornece a numeração e uma
 * faixa aproximada, mas seus limites nem sempre coincidem com as curvas (ex.: a
 * divisão T1/T2 cai no ápice da T2). Aqui o ápice é o extremo de curvatura com o
 * sentido esperado e os limites são onde a curvatura cai abaixo de ~22% do pico.
 */
const DIRECTION: Record<number, 1 | -1> = { 1: 1, 2: -1, 3: 1, 4: 1, 5: 1, 6: -1, 7: -1, 8: -1, 9: 1, 10: -1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1 };
const BRAKING = new Set([1, 4, 8, 9, 10, 12]); // zonas de frenagem incluídas no destaque
// curvas encadeadas no mesmo sentido: separa no vale de curvatura (1 = para frente, -1 = para trás)
const VALLEY_SPLIT: Record<number, (1 | -1)[]> = { 4: [1], 5: [-1], 6: [1], 7: [-1] };

function curvatureRange(n: number, prevEnd: number | null) {
  const seg = osmSegmentByCorner(n);
  const sign = DIRECTION[n];
  // a busca começa depois do fim da curva anterior (evita capturar a cauda dela)
  let a = seg.s0 - 60;
  if (prevEnd !== null && (wrapS(a - prevEnd) > TRACK.length / 2 || wrapS(a - prevEnd) < 4)) a = prevEnd + 4;
  const b = seg.s1 + 30;
  let peak = -1;
  let apex = seg.s0;
  for (let s = a; s <= b; s += 2) {
    const v = sign * frameAt(s).k;
    if (v > peak) {
      peak = v;
      apex = wrapS(s);
    }
  }
  const thr = Math.max(peak * 0.22, 1 / 450);
  let s0 = apex;
  let s1 = apex;
  // caminha a partir do ápice até a curvatura cair abaixo do limiar — ou até o vale
  // entre dois ápices (curvas encadeadas no mesmo sentido, como a Ferradura 6–7)
  const walk = (dir: 1 | -1) => {
    let s = apex;
    let minV = peak;
    let minS = apex;
    for (let d = 0; d < 400; d += 2) {
      const ns = wrapS(s + dir * 2);
      const v = sign * frameAt(ns).k;
      if (v <= thr) return s;
      if (v < minV) {
        minV = v;
        minS = ns;
      } else if (VALLEY_SPLIT[n]?.includes(dir) && minV < peak * 0.6 && v > minV * 1.3) return minS;
      s = ns;
    }
    return s;
  };
  s0 = walk(-1);
  s1 = walk(1);
  return { apex, s0, s1, peak };
}

const RANGES = (() => {
  const r: ({ n: number } & ReturnType<typeof curvatureRange>)[] = [];
  for (const sp of SPECS) r.push({ n: sp.number, ...curvatureRange(sp.number, r.length ? r[r.length - 1].s1 : null) });
  // margens de entrada/saída, limitadas ao ponto médio entre ápices vizinhos
  return r.map((c, i) => {
    const prev = r[(i - 1 + r.length) % r.length];
    const next = r[(i + 1) % r.length];
    const midPrev = wrapS(prev.apex + wrapS(c.apex - prev.apex) / 2);
    const midNext = wrapS(c.apex + wrapS(next.apex - c.apex) / 2);
    let s0 = wrapS(c.s0 - (BRAKING.has(c.n) ? 30 : 12));
    let s1 = wrapS(c.s1 + 15);
    if (wrapS(c.apex - s0) > wrapS(c.apex - midPrev)) s0 = midPrev;
    if (wrapS(s1 - c.apex) > wrapS(midNext - c.apex)) s1 = midNext;
    return { ...c, s0, s1 };
  });
})();

function buildCorner(spec: CornerSpec): Corner {
  const rg = RANGES.find((r) => r.n === spec.number)!;
  const s0 = rg.s0;
  const s1 = rg.s1;
  const st = rangeStats(s0, s1);
  const geoFacts: Fact[] = [
    f('Número F1', `Curva ${spec.number}`, 'oficial', ['fia-2022-event-notes']),
    f('Direção', st.kMax > 0 ? 'Esquerda' : 'Direita', 'oficial', ['osm']),
    f('Comprimento do trecho', `${Math.round(st.length)} m`, 'estimativa', ['osm'], 'Trecho em curva definido pela curvatura da linha central do modelo (inclui a zona de frenagem nas curvas de frenagem forte).'),
    f('Raio mínimo (linha central)', `${Math.round(st.minRadius)} m`, 'estimativa', ['osm'], 'Curvatura da linha central do modelo. A trajetória ideal usa raios maiores.'),
    f('Mudança de direção', `${Math.abs(Math.round(st.turnDeg))}°`, 'estimativa', ['osm']),
    f('Altitude entrada → saída', `${Math.round(altitude(st.yIn))} m → ${Math.round(altitude(st.yOut))} m`, 'estimativa', ['srtm'], 'SRTM 30 m suavizado; precisão vertical típica de alguns metros.'),
  ];
  return {
    id: `t${spec.number}`,
    number: spec.number,
    name: spec.name,
    altNames: spec.altNames,
    s0,
    s1,
    apexS: rg.apex,
    direction: st.kMax > 0 ? 'esquerda' : 'direita',
    sector: sectorOf(rg.apex),
    minRadius: st.minRadius,
    lengthM: st.length,
    elevIn: altitude(st.yIn),
    elevOut: altitude(st.yOut),
    facts: [...geoFacts, ...spec.facts],
    description: spec.description,
    racingLine: spec.racingLine,
    overtaking: spec.overtaking,
    difficulty: spec.difficulty,
    history: spec.history,
    sources: spec.sources,
  };
}

export const CORNERS: Corner[] = SPECS.map(buildCorner);
export const cornerById = (id: string) => CORNERS.find((c) => c.id === id);

/** Curva que contém a distância s (usa a faixa de destaque). */
export function cornerAt(s: number): Corner | undefined {
  const x = wrapS(s);
  return CORNERS.find((c) => {
    const len = wrapS(c.s1 - c.s0);
    return wrapS(x - c.s0) <= len;
  });
}

export const TRACK_SUMMARY = { length: TRACK.length };

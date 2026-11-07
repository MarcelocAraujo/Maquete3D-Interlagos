import type { Fact, Reliability } from './types';

const f = (label: string, value: string, reliability: Reliability, sources?: string[], note?: string): Fact => ({ label, value, reliability, sources, note });

export interface HistoryEvent {
  year: string;
  title: string;
  text: string;
  reliability: Reliability;
  sources: string[];
}

/** Linha do tempo — informação HISTÓRICA (não descreve o traçado atual). */
export const TIMELINE: HistoryEvent[] = [
  { year: '1926', title: 'Compra do terreno', text: 'O terreno onde hoje está o autódromo é adquirido; a região, entre as represas Guarapiranga e Billings, daria nome ao bairro: "Interlagos" (entre lagos).', reliability: 'secundaria', sources: ['wikipedia', 'mercedes-corners'] },
  { year: '1938', title: 'Início das obras', text: 'Começa a construção, com projeto inspirado em circuitos como Indianápolis, Roosevelt Raceway, Brooklands e Montlhéry.', reliability: 'secundaria', sources: ['wikipedia'] },
  { year: '1939', title: 'Primeiras voltas', text: 'Em abril, com o autódromo ainda em obras, um grupo de pilotos liderado por Manoel de Teffé dá as primeiras voltas na pista.', reliability: 'oficial', sources: ['pref-historia'] },
  { year: '1940', title: 'Inauguração', text: 'Inaugurado em 12 de maio de 1940, diante de cerca de 15 mil pessoas. O circuito completo, percorrido no sentido anti-horário, somava cerca de 8 km (anel externo de 3.250 m + miolo). Ainda não havia arquibancadas, boxes nem guard-rails.', reliability: 'oficial', sources: ['pref-historia'] },
  { year: '1970', title: 'Reabertura', text: 'Após o fechamento em 1967, o autódromo volta a funcionar em 29 de fevereiro de 1970, com novos boxes e arquibancadas para 20 mil torcedores.', reliability: 'oficial', sources: ['pref-historia'] },
  { year: '1972', title: 'Primeira corrida de F1', text: 'Em 30 de março de 1972, Interlagos recebe uma prova de F1 extracampeonato, vencida por Carlos Reutemann.', reliability: 'oficial', sources: ['pref-historia', 'wikipedia'] },
  { year: '1973', title: 'Primeiro GP do Brasil no Mundial', text: 'Em 11 de fevereiro de 1973, Emerson Fittipaldi vence o primeiro GP do Brasil válido pelo Campeonato Mundial.', reliability: 'oficial', sources: ['pref-historia', 'f1-2025'] },
  { year: '1975', title: 'Vitória de José Carlos Pace', text: 'José Carlos Pace vence sua única corrida na F1, justamente em Interlagos.', reliability: 'secundaria', sources: ['wikipedia'] },
  { year: '1980', title: 'Última F1 no traçado longo', text: 'A F1 corre pela última vez no traçado de ~7,9 km. Problemas de segurança (piso ondulado, barreiras e valas) levam a categoria a Jacarepaguá (RJ) entre 1981 e 1989.', reliability: 'secundaria', sources: ['wikipedia', 'fia-2022-preview'] },
  { year: '1985', title: 'Autódromo José Carlos Pace', text: 'O autódromo recebe o nome de José Carlos Pace, morto em um acidente aéreo em 1977.', reliability: 'oficial', sources: ['pref-historia', 'wikipedia'] },
  { year: '1990', title: 'Novo traçado e retorno da F1', text: 'Grande reforma com novos boxes e torre de controle; o circuito é encurtado para 4.325 m e reinaugurado em 23 de março de 1990. Surgem o S do Senna, o Bico de Pato, o Mergulho e a nova Curva do Sol. A F1 retorna a Interlagos no mesmo ano.', reliability: 'oficial', sources: ['pref-historia', 'pref-circuito', 'wikipedia'] },
  { year: '1993', title: 'Senna vence em casa', text: 'Ayrton Senna vence o GP do Brasil — a 100ª vitória da McLaren na F1.', reliability: 'oficial', sources: ['fia-2022-preview'] },
  { year: '1999→', title: 'Traçado atual (4.309 m)', text: 'Configuração atual de 4.309 m (5ª variação do GP, segundo a Wikipedia), mantida desde então com ajustes de entrada e saída dos boxes.', reliability: 'secundaria', sources: ['wikipedia', 'pref-circuito'] },
  { year: '2007', title: 'Grande reforma', text: 'Novo asfalto, nova arquibancada fixa e melhorias na entrada dos boxes; inauguração da estação Autódromo da CPTM.', reliability: 'secundaria', sources: ['wikipedia'] },
  { year: '2008', title: 'Massa, Hamilton e a última curva', text: 'Felipe Massa vence a corrida, mas Lewis Hamilton garante o título na última volta, com uma ultrapassagem na Junção.', reliability: 'secundaria', sources: ['wikipedia'] },
  { year: '2014–2025', title: 'Modernização de boxes e paddock', text: 'Reformas em fases: pista e entrada/saída dos boxes, ampliação do paddock, prédio para as equipes atrás dos boxes, centro de operações de seis andares e, nas etapas finais, remodelação dos boxes e cobertura do paddock.', reliability: 'secundaria', sources: ['news-reforma-boxes'] },
  { year: '2021', title: 'GP de São Paulo', text: 'A prova passa a se chamar Grande Prêmio de São Paulo, com contrato até 2030.', reliability: 'secundaria', sources: ['wikipedia', 'fia-2022-preview'] },
  { year: '2024', title: 'Pace sepultado no autódromo', text: 'Os restos mortais de José Carlos Pace são sepultados no circuito em agosto de 2024 — o primeiro piloto sepultado em um autódromo.', reliability: 'secundaria', sources: ['wikipedia'] },
];

export const LAYOUTS: { period: string; length: string; turns: string; record: string; reliability: Reliability; sources: string[] }[] = [
  { period: '1940–1979', length: '7.960 m', turns: '26', record: '2:28.760 — J. Laffite (1979)', reliability: 'secundaria', sources: ['wikipedia', 'pref-circuito'] },
  { period: '1980–1989', length: '7.873 m', turns: '26', record: '2:27.311 — R. Arnoux (1980)', reliability: 'secundaria', sources: ['wikipedia', 'pref-circuito'] },
  { period: '1990–1995', length: '4.325 m', turns: '15', record: '1:18.455 — M. Schumacher (1994)', reliability: 'secundaria', sources: ['wikipedia', 'pref-historia'] },
  { period: '1996–1998', length: '4.292 m', turns: '15', record: '1:18.397 — J. Villeneuve (1997)', reliability: 'secundaria', sources: ['wikipedia'] },
  { period: '1999–hoje', length: '4.309 m', turns: '15', record: '1:10.540 — V. Bottas (2018)', reliability: 'oficial', sources: ['f1-2025', 'fia-2022-preview', 'wikipedia'] },
];

export const HISTORY_FACTS: Fact[] = [
  f('Nome oficial', 'Autódromo José Carlos Pace (desde 1985)', 'oficial', ['pref-historia']),
  f('Inauguração', '12 de maio de 1940', 'oficial', ['pref-historia']),
  f('GPs de F1 realizados (informação da Prefeitura)', '29', 'oficial', ['pref-circuito'], 'Contagem publicada no site da Prefeitura; pode estar desatualizada.'),
  f('Mais vitórias em Interlagos (piloto)', 'Michael Schumacher – 4 (até 2022)', 'oficial', ['fia-2022-preview']),
  f('Mais vitórias no GP do Brasil (piloto)', 'Alain Prost – 6 (até 2022)', 'oficial', ['fia-2022-preview']),
  f('Mais vitórias em Interlagos (equipe)', 'Ferrari – 9 (até 2022)', 'oficial', ['fia-2022-preview']),
];

export const SENNA_S_HISTORY =
  'O S do Senna nasceu na reforma de 1989–1990, quando o traçado foi encurtado de cerca de 7,9 km para 4.325 m. A nova sequência esquerda-direita, em descida logo após a reta dos boxes, substituiu as antigas curvas rápidas do anel externo e homenageia Ayrton Senna, a quem relatos atribuem a sugestão do desenho. Senna venceu ali em 1991 e 1993.';

# Fontes

Todas as informações do aplicativo são classificadas como **oficial**, **secundária**, **estimativa** ou **não disponível** (ver `src/data/sources.ts`, que é a fonte única dessas referências no código). Documentos baixados durante a pesquisa ficam em `research/raw/` (fora do bundle).

## Oficiais

| Fonte | O que foi usado |
|---|---|
| FIA – *2022 Brazilian Grand Prix – Event Notes – Circuit Map, Pit Lane Drawing and Red Zone* (Doc. 3, 10/11/2022) — [PDF](https://www.fia.com/sites/default/files/decision-document/2022%20Brazilian%20Grand%20Prix%20-%20Event%20Notes%20-%20Circuit%20Map%2C%20Pit%20Lane%20Drawing%20and%20Red%20Zone.pdf) | Linhas de setor (S1: 168 m antes da T4; S2: 85 m antes da T12), speed trap (90 m antes da T1), zonas de DRS, numeração das 15 curvas, 22 postos de fiscais, "Circuit Centreline Length = 4.309 km". |
| FIA – *Race Preview, 2022 São Paulo Grand Prix* — [PDF](https://www.fia.com/sites/default/files/2022_brazilian_gp_preview.pdf) | Comprimento da volta, recorde, offset largada/chegada (0,030 km), 71 voltas, 305,909 km, limite de 80 km/h no pit lane, mudanças de pista de 2022 (barreira na T1, guard-rail entre T6–T7, cercas entre T10–T14), estatísticas históricas. |
| FIA/FOM – cronometragem oficial, GP de São Paulo 2025 e 2022: *Race Maximum Speeds*, *Race Best Sector Times*, *Race Fastest Laps* — [2025](https://www.fia.com/sites/default/files/2025_21_bra_f1_r0_timing_racemaximumspeeds_v01.pdf), [2022](https://www.fia.com/sites/default/files/2022_21_bra_f1_r0_timing_racemaximumspeeds_v01.pdf) | Velocidades no speed trap, linha de chegada, I1 e I2; melhores setores; voltas mais rápidas (piloto, volta, velocidade média). |
| Formula1.com – [São Paulo GP 2025](https://www.formula1.com/en/racing/2025/brazil) | 4,309 km, 71 voltas, distância (305,879 km, valor impresso), 1º GP 1973, recorde 1:10.540 (Bottas, 2018), arquibancadas A e M. |
| Prefeitura de São Paulo – [Circuito](https://prefeitura.sp.gov.br/web/autodromodeinterlagos/circuito) | 4.309 m; largura 12–15 m; desnível ~56 m (S do Senna ↔ Curva do Lago); 23 boxes de 216 m²; arquibancadas fixas para 18 mil pessoas; 29 GPs de F1. |
| Prefeitura de São Paulo – [História](https://prefeitura.sp.gov.br/web/autodromodeinterlagos/historia) | Inauguração (12/05/1940), primeiras voltas (1939), reabertura (1970), F1 1972/1973, renomeação (1985), reforma de 1989–90 e reinauguração (23/03/1990), nomes antigos das curvas (Cotovelo → Bico de Pato; Café/Vitória). |

## Secundárias

| Fonte | O que foi usado |
|---|---|
| [Wikipedia – Interlagos Circuit](https://en.wikipedia.org/wiki/Interlagos_Circuit) | Histórico de traçados e recordes por período, nomes e números das curvas, pit lane "um dos mais longos", reforma de 2007, capacidade 60.000, Grade 1. |
| [Mercedes-AMG F1 – How the Interlagos corners got their names](https://www.mercedesamgf1.com/news/how-the-interlagos-corners-got-their-names) (03/11/2025) | Origem dos nomes, numeração T1–T15, características qualitativas (Subida dos Boxes ~10%, Pinheirinho sem desnível, Café de pé embaixo). |
| [Le Mans Ultimate Wiki – Track Guide: Interlagos](https://lemansultimate.wiki.gg/wiki/Track_Guide:_Interlagos) | Somente descrições qualitativas de trajetória (guia de simulador, GT3/Hypercar). |
| [Band – Interlagos ganha arquibancadas e mudanças na pista para a F1 2026](https://www.band.com.br/esportes/velocidade/formula-1/interlagos-ganha-arquibancadas-e-mudancas-na-pista-para-a-f1-2026) e reportagens correlatas | Setores de arquibancada (A descoberto na subida dos boxes, +1.480 lugares; D no S do Senna, 5.358 lugares; G na Reta Oposta; M coberto na reta). Zebras pintadas nas cores do Brasil em 2024 (homenagem a Senna). |
| Reportagens sobre a reforma dos boxes (Jovem Pan, Tribuna PR, SPTuris) | Fases da modernização 2014–2025, centro de operações de seis andares, "box zero", projeto de 28 boxes. |

## Dados geográficos

| Fonte | Uso |
|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/relation/2560355) (© colaboradores, ODbL 1.0) via Overpass API | Traçado (25 vias `highway=raceway`, 4.308,2 m), bordas da pista (`area:highway=raceway`, relação 17956608), pit lane, linhas de largada/chegada, 13.305 edificações (com altura quando mapeada), arquibancadas, cercas, muros, vegetação, lago, vias, torres, heliportos, contorno do complexo, kartódromo. |
| SRTM 1" (30 m), NASA/USGS, via [OpenTopoData](https://www.opentopodata.org/) | Relevo: grade de 108 × 108 pontos (3,2 × 3,2 km). Conferido com heliportos do OSM: 750 m (SRTM 749 m) e 776 m (SRTM 771 m). ASTER 30 m foi descartado (≈10 m abaixo). |

## Referência visual

| Fonte | Uso |
|---|---|
| Esri World Imagery | Somente consulta visual (não incorporada ao app) para validar o alinhamento do traçado e posicionar áreas de escape, barreiras, arquibancadas e estruturas. As imagens consultadas são de fora do período do GP (sem arquibancadas temporárias). |

## Tentativas sem sucesso (documentadas)

- **Telemetria F1 Live Timing (via FastF1):** o endpoint `livetiming.formula1.com` passou a responder HTTP 401 (exige conta F1). Sem ela, velocidades/marchas por curva e pontos de frenagem ficam **não disponíveis**. O script `scripts/telemetry/extract_telemetry.py` está pronto para quem tiver credenciais próprias.
- **Brembo (análise de frenagem por GP):** página de Interlagos não localizada.
- **Event Notes/mapas FIA de 2024–2025:** não localizados no portal de documentos; usada a edição oficial de 2022.
- **Imagens de referência mencionadas no pedido:** não foram recebidas na conversa; a estética do SIMULATION MODE seguiu a descrição textual (maquete arquitetônica, estilo SketchUp/Lumion).

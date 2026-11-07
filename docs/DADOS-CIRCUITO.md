# Dados do circuito no modelo

Tabelas geradas a partir dos módulos de dados do aplicativo (`src/data/circuit/*`), portanto idênticas ao que a interface exibe.

**Convenções**

- `s` = distância (m) ao longo da linha central do modelo, com `s = 0` na linha de chegada/controle e crescendo no sentido de corrida (anti-horário).
- Comprimento da linha central do modelo: **4.305,7 m** (polilinha OSM bruta: 4.308,2 m; **oficial FIA: 4.309 m**, diferença < 0,1%).
- 2.153 amostras a cada ~2,0 m. Altitudes: SRTM 30 m suavizado (estimativa). Raios: curvatura da linha central (estimativa; a trajetória ideal usa raios maiores).
- Numeração das curvas: FIA/F1 (15 curvas). Nomes: Mercedes-AMG F1 / Wikipedia. No OSM, a T7 aparece como "Curva do Laranjinha" e a T8 como "Esse" — divergência de nomenclatura, mesmo número.

## Curvas

Trechos definidos pela curvatura da geometria: ápice = extremo de curvatura no sentido da curva; limites onde a curvatura cai abaixo de ~22% do pico (ou no vale entre curvas encadeadas no mesmo sentido: T4/T5 e T6/T7), com margem de entrada (30 m nas curvas de frenagem forte, 12 m nas demais) e 15 m de saída.

| Nº | Nome (F1) | Direção | Setor | Ápice s (m) | Trecho s (m) | Comprimento (m) | Raio mín. (m) | Altitude entrada → saída (m) |
|---|---|---|---|---|---|---|---|---|
| 1 | S do Senna | esquerda | 1 | 389 | 309 → 435 | 126 | 29 | 787 → 782 |
| 2 | S do Senna | direita | 1 | 481 | 451 → 529 | 78 | 30 | 781 → 777 |
| 3 | Curva do Sol | esquerda | 1 | 577 | 529 → 814 | 285 | 94 | 777 → 768 |
| 4 | Descida do Lago | esquerda | 2 | 1452 | 1376 → 1503 | 127 | 38 | 752 → 748 |
| 5 | Descida do Lago | esquerda | 2 | 1608 | 1556 → 1733 | 177 | 96 | 745 → 746 |
| 6 | Ferradura | direita | 2 | 2055 | 2007 → 2118 | 111 | 60 | 758 → 768 |
| 7 | Ferradura | direita | 2 | 2195 | 2125 → 2242 | 117 | 51 | 768 → 772 |
| 8 | Laranjinha | direita | 2 | 2361 | 2309 → 2432 | 123 | 25 | 772 → 766 |
| 9 | Pinheirinho | esquerda | 2 | 2551 | 2456 → 2592 | 136 | 41 | 765 → 764 |
| 10 | Bico de Pato | direita | 2 | 2807 | 2723 → 2842 | 119 | 22 | 773 → 772 |
| 11 | Mergulho | esquerda | 2 | 3024 | 2916 → 3115 | 199 | 84 | 765 → 753 |
| 12 | Junção | esquerda | 3 | 3292 | 3236 → 3337 | 101 | 25 | 752 → 757 |
| 13 | Café | esquerda | 3 | 3425 | 3395 → 3460 | 65 | 56 | 759 → 763 |
| 14 | Subida dos Boxes | esquerda | 3 | 3697 | 3601 → 3778 | 177 | 105 | 776 → 783 |
| 15 | Arquibancadas | esquerda | 3 | 4088 | 3984 → 4119 | 135 | 227 | 783 → 786 |

Consistências observadas com as fontes: ponto mais alto no S do Senna e mais baixo na Curva do Lago (Prefeitura) ✔; Subida dos Boxes em forte subida (~10% segundo Mercedes/Wikipedia) ✔; Pinheirinho com pouca variação de altitude (Mercedes) ✔; Mergulho em descida ✔; Bico de Pato como o raio mais fechado ✔.

## Retas

| Reta | Trecho s (m) | Comprimento (m) | Observação |
|---|---|---|---|
| Reta dos Boxes (Reta Principal) | 4187 → 357 | 475 | Entre o fim da via OSM "Arquibancadas" (T15) e o início da via numerada da T1. O trecho de pé embaixo desde a saída da Junção tem ~1,3 km. |
| Reta Oposta | 813 → 1400 | 586 | Via OSM "Reta Oposta". |
| Trecho do Lago (T5–T6) | 1733 → 2007 | 275 | Nome descritivo (não oficial). |

## Setores (FIA Event Notes 2022)

| Setor | Trecho s (m) | Extensão no modelo (m) | Curvas | Limite oficial |
|---|---|---|---|---|
| Setor 1 | 0 → 1232 | 1232 | 1, 2, 3 | fim: 168 m antes da Curva 4 |
| Setor 2 | 1232 → 3183 | 1952 | 4–11 | fim: 85 m antes da Curva 12 |
| Setor 3 | 3183 → 4306 | 1123 | 12–15 | fim: linha de chegada |

"Turn N" dos documentos da FIA foi interpretado como o início da via OSM marcada com `raceway:corner_number = N` (T4 em s = 1400; T12 em s = 3268).

## Marcadores

| Marcador | s (m) | Origem |
|---|---|---|
| Linha de chegada / controle | 0 | Nó OSM "Finish Line" |
| Linha de largada | 30 | FIA Race Preview 2022: offset de 0,030 km (o OSM posiciona a largada a ~60 m; adotado o valor oficial) |
| Speed trap | 267 | 90 m antes da Curva 1 (FIA Event Notes 2022) |
| Fim do Setor 1 (laço I1) | 1232 | 168 m antes da Curva 4 |
| Fim do Setor 2 (laço I2) | 3183 | 85 m antes da Curva 12 |
| DRS 1 – detecção | 482 | Ápice da Curva 2 |
| DRS 1 – ativação | 843 | 30 m após a Curva 3 |
| DRS 2 – detecção | 3493 | 30 m após a Curva 13 |
| DRS 2 – ativação | 3766 | 160 m antes da Curva 15 (Event Notes; o Race Preview grafa "after") |
| Entrada do pit lane | 3928 | Bifurcação da via OSM "Pit Lane" |
| Saída do pit lane | 1053 | Reconexão da via OSM "Pit Lane" na Reta Oposta |

Pit lane no modelo: 1.373 m da bifurcação à reconexão (OSM; sem valor oficial encontrado).

## Velocidades oficiais usadas (FIA – Race Maximum Speeds)

| Ponto | Corrida 2025 | Corrida 2022 |
|---|---|---|
| Speed trap (90 m antes da T1) | 335,6 km/h — C. Sainz | 338,1 km/h — L. Stroll |
| Linha de chegada | 339,9 km/h — C. Sainz | 338,3 km/h — M. Verstappen |
| Intermediário 1 (fim do S1, Reta Oposta) | 340,4 km/h — A. Albon | 329,4 km/h — M. Verstappen |
| Intermediário 2 (fim do S2, antes da Junção) | 263,4 km/h — G. Russell | 259,3 km/h — S. Pérez |

Melhores setores (corrida): 2025 — S1 18,386 s (Albon), S2 36,746 s (Verstappen), S3 16,536 s (Russell); 2022 — S1 18,744 s (Leclerc), S2 37,565 s (Russell), S3 16,941 s (Sainz).
Volta mais rápida: 2025 — 1:12.400, A. Albon, volta 59 (214,259 km/h); 2022 — 1:13.785, G. Russell, volta 61.
Recorde de volta em corrida: 1:10.540, V. Bottas, 2018 (F1.com / FIA).

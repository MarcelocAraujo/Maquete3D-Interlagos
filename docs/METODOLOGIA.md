# Metodologia

## 1. Pipeline de dados (`scripts/`)

```
scripts/fetch-osm.mjs        → research/raw/osm_raceway.json, osm_area.json   (Overpass API)
scripts/fetch-elevation.mjs  → research/raw/elevation_grid_srtm30m.json       (OpenTopoData, SRTM 30 m)
scripts/build-data.mjs       → src/data/generated/track.json
                               public/data/terrain.bin + terrain.json
                               public/data/features.json
```

Projeção: equiretangular local com origem em (-23.7016, -46.6965). Na cena, X = leste, Z = −norte, Y = altitude − 740 m.

### Traçado
1. As vias `highway=raceway` + `sport=motor` (exceto "Pit Lane") são encadeadas pelos nós de extremidade, formando um laço fechado de 25 vias e **4.308,2 m** (oficial: 4.309 m).
2. O laço é rotacionado para começar no nó OSM "Finish Line" (s = 0).
3. Densificação a 0,5 m, suavização gaussiana (σ = 2,5 m, remove as quinas da polilinha sem alterar o desenho) e reamostragem uniforme a 2 m → 2.153 amostras, **4.305,7 m**.
4. Curvatura assinada (κ > 0 = esquerda) pela variação do rumo.

### Largura
Raios perpendiculares à linha central intersectam os anéis interno/externo do polígono `area:highway=raceway`. Valores ausentes ou discrepantes (> 30% da mediana de 120 m) são substituídos pela mediana; o total é limitado ao intervalo **oficial de 12–15 m** (Prefeitura), mantendo a forma do OSM.

### Elevação
- SRTM 30 m suavizado (σ ≈ 0,8 célula) e amostrado por interpolação bicúbica.
- Ao longo da pista: suavização adicional de σ = 28 m. Resultado: **745–787 m, desnível ≈ 42 m**. A Prefeitura cita ~56 m; fontes secundárias citam 43–46 m. O valor do modelo é apresentado como estimativa, sem reescalonar o relevo.
- Terreno: grade de 5 m (621 × 621) acomodada à pista e ao pit lane por mistura ponderada (faixa plana de 7 m além da borda + transição de 45 m), o que evita rampas artificiais e degraus entre trechos próximos do miolo. Lagos: espelho d'água plano e leito escavado.
- Inclinação transversal: apenas leve (≈ 1,4–1,7°) na Curva do Sol e na sequência Subida dos Boxes/Arquibancadas — **estimativa**, pois as fontes mencionam curvas inclinadas sem valores.

### Curvas
A numeração vem do OSM (`raceway:corner_number`), coerente com a FIA. Os limites dos trechos do OSM nem sempre coincidem com as curvas (a divisão T1/T2 cai no ápice da T2), então cada curva é redefinida pela curvatura: ápice = extremo de κ no sentido esperado, procurado após o fim da curva anterior; limites onde |κ| cai abaixo de 22% do pico (ou no vale entre curvas encadeadas no mesmo sentido — T4/T5 e T6/T7). Margens: 30 m antes nas curvas de frenagem forte, 12 m nas demais, 15 m depois.

### Setores, speed trap e DRS
Distâncias das FIA Event Notes 2022 aplicadas a partir do início da via OSM numerada de cada curva ("Turn N"). A largada fica a 30 m da linha de chegada (FIA). O destaque de setor é feito no shader de todos os materiais da pista pelo atributo `aS` (distância ao longo da pista), acompanhando exatamente a geometria 3D.

## 2. Elementos com posição estimada

| Elemento | Método | Classificação |
|---|---|---|
| Zebras | Internas onde |κ| > 45% do pico ao redor do ápice; externas do ápice à saída nas curvas de raio < 150 m. Perfil plano + ressalto externo de ~7 cm. Cores verde/amarelo (pintura de 2024). | estimativa |
| Salsichas | **Não modeladas**: nenhuma evidência confiável de localização em fontes ou imagens. | não disponível |
| Áreas de escape | Lado externo das curvas 1–13; asfalto pintado azul-turquesa (observado em satélite), área clara no Café; profundidades medidas aproximadamente na imagem. | estimativa |
| Barreiras | Pneus + alambrado no fim das áreas de escape; muro + alambrado na reta dos boxes; guard-rail nos demais trechos; omitidas onde invadiriam outro trecho da pista. Cercas e muros do OSM. | estimativa / OSM |
| Boxes | Pegada OSM (295 × 52 m); 23 garagens de 216 m² (≈ 9,4 × 23 m) — dado oficial; pavimento envidraçado em balanço, cobertura, centro de operações de 6 pavimentos na extremidade norte (posição estimada). | oficial + estimativa |
| Arquibancadas | Polígonos OSM (M, reta, chegada, A) gerados com degraus de 0,85 × 0,42 m, assentos a cada 0,52 m, escadas a cada 24 m, pilares a cada 8 m e cobertura em balanço; D e G (temporárias) posicionadas pelos portões do OSM. | OSM / estimativa |
| Vegetação | Árvores e fileiras do OSM; distribuição em áreas de mata/arbustos/parques do OSM; arborização viária ilustrativa (apenas GAME MODE). Seis espécies procedurais com variação de escala, rotação e cor. | OSM / estimativa |
| Iluminação noturna | Postes ao longo das avenidas (marcadas `lit=yes` no OSM), torres em pátios e estacionamentos, janelas e vidros dos prédios. **Sem iluminação de pista** (não existe para corridas noturnas). | estimativa |
| Edificações do entorno | Altura do OSM quando mapeada; caso contrário, 6–10 m conforme a área. | OSM / estimativa |

## 3. Renderização

- Todas as escolhas visuais por modo ficam centralizadas em `src/scene/modes/modeStyles.ts` (paleta do solo, pista, estruturas, prédios, árvores, assentos, luz, céu, sombras e pós-processamento). A geometria e os dados são compartilhados.
- **GAME MODE** (referência estética: *Cartoon Race Track Interlagos*, RCC Design / Sketchfab — usada só para o estilo, nunca para a geometria): facetas planas, céu em gradiente ciano, grama verde viva, asfalto escuro com bordas brancas nítidas, zebras verde/amarelo, muros de concreto com padrão hexagonal, casas brancas com telhado laranja de duas águas, árvores guarda-chuva e palmeiras facetadas, arquibancadas com fileiras verde/amarelo, AO suave e tone mapping neutro.
- **SIMULATION MODE** (apresentação arquitetônica realista): materiais PBR com texturas procedurais (asfalto com agregados, normal e rugosidade; marcas de borracha), solo em verde-oliva com manchas de palha e terra tiradas de fotos aéreas, céu físico, sombras dinâmicas, árvores de copa densa com sombreamento interno, telhados cerâmicos, AO, bloom leve e ACES.
- A troca de modo captura o quadro atual e faz crossfade sobre o novo modo, preservando câmera e seleção.

## 4. Desempenho

- Edificações (até 13 mil) mescladas em uma malha por grupo, com picking por faixa de triângulos.
- Árvores, assentos, postes, portas de garagem e torres em `InstancedMesh`.
- Raycast acelerado por BVH (`<Bvh>`), materiais e programas de shader compartilhados (chaves de cache únicas).
- Qualidade baixa/média/alta: resolução do terreno (10/6/4 m), mapa de sombras (off/2048/4096), densidade de vegetação (30/60/100%), raio do entorno (800/1200/1450 m), assentos 3D (off/metade/todos), AO.

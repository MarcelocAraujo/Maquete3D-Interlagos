# Interlagos 3D Explorer

Visualizador 3D interativo do **Autódromo José Carlos Pace (Interlagos)**, São Paulo — maquete construída a partir de dados geográficos reais (OpenStreetMap + relevo SRTM) e de documentos oficiais da FIA, com dois modos visuais, seleção de curvas/retas/setores/estruturas e painéis com dados classificados por confiabilidade.

## Como executar

Requisitos: Node.js 20+ (testado com 24).

```bash
npm install
```

```bash
npm run dev
```

Abra http://localhost:5173. Para gerar a versão de produção: `npm run build` (saída em `dist/`) e `npm run preview`.

### Regenerar os dados (opcional)

Os dados processados já estão no repositório (`src/data/generated/`, `public/data/`). Para refazê-los a partir das fontes:

```bash
npm run data:osm
```

```bash
npm run data:elevation
```

```bash
npm run data:build
```

## O que o app faz

- **Traçado real de 4.309 m**: 25 vias do OSM encadeadas (4.308,2 m brutos; 4.305,7 m após suavização), larguras pelas bordas reais da pista (12–15 m), relevo SRTM (745–787 m).
- **GAME MODE**: mapa tático estilizado, inspirado em jogos de gestão de F1 — fundo escuro, verde fechado, volumes cinza low-poly, pista em destaque.
- **SIMULATION MODE**: visual realista de simulador — asfalto com agregados e marcas de borracha, zebras verde/amarelo, escapes turquesa, céu físico, sombras dinâmicas, névoa, AO, cidade com telhados cerâmicos.
- **Desempenho**: terreno detalhado e entorno (prédios, árvores, postes) apenas no autódromo + ~150 m; rio e represas removidos (o lago interno fica).
- **Troca de modo suave** (crossfade), preservando câmera e seleção. **Iluminação**: dia, fim de tarde e noite (somente luz artificial existente: vias, pátios, prédios — sem iluminação de pista).
- **Seleção** de curvas (15), retas, setores, boxes, cada uma das 23 garagens, torre/centro de operações, arquibancadas, prédios (13 mil), áreas de escape, barreiras, vegetação, torres, lago, kartódromo, passarela e postos de fiscais. Curvas/retas/setores se **erguem da maquete** com contorno luminoso; o restante escurece.
- **Setores F1** pelos pontos oficiais de cronometragem (FIA Event Notes 2022), coloridos na geometria 3D.
- **Mapa do circuito** sincronizado (seleção nos dois sentidos, posição e cone da câmera, curvas, retas, setores, largada, pit lane).
- **Câmera**: rotação 360°, zoom em direção ao cursor, pan, vistas superior/lateral/frontal/isométrica, Visão Geral, foco cinematográfico, colisão com o terreno, **modo exploração** (WASD/QE).
- **Camadas** (14) e **identificações** 3D com nível de detalhe por distância.
- **Análise de desempenho** (velocidades oficiais 2022/2025, perfil de altitude, setores, raios), **história** (linha do tempo, traçados, S do Senna, José Carlos Pace) e **fontes**.
- **Qualidade gráfica** baixa/média/alta.

## Confiabilidade dos dados

Cada dado exibido traz um selo: **oficial** (FIA, F1, Prefeitura), **secundária** (Wikipedia, equipes, imprensa, OSM), **estimativa** (medido no modelo ou inferido de imagens, com método indicado) ou **não disponível**. Nenhum número foi inventado para preencher painéis. Detalhes em [docs/FONTES.md](docs/FONTES.md), [docs/METODOLOGIA.md](docs/METODOLOGIA.md) e [docs/DADOS-CIRCUITO.md](docs/DADOS-CIRCUITO.md).

## Limitações conhecidas

- **Velocidade/marcha por curva e pontos de frenagem de F1**: não disponíveis — o F1 Live Timing passou a exigir autenticação. `scripts/telemetry/extract_telemetry.py` (FastF1) funciona com uma conta F1 própria.
- **Desnível**: o SRTM resulta em ~42 m; a Prefeitura cita ~56 m (fontes secundárias: 43–46 m). O modelo não reescala o relevo.
- **Salsichas** (zebras altas isoladas): sem evidência confiável de localização; não modeladas. As zebras têm ressalto externo genérico.
- **Áreas de escape, barreiras e arquibancadas temporárias (D, G)**: posições aproximadas a partir de imagens aéreas e portões do OSM.
- **Prédio dos boxes e centro de operações**: volumetria procedural sobre a pegada do OSM, com o número e a área oficiais das garagens; fachadas não são réplicas exatas.
- **Espécies vegetais**: modelos representativos; as espécies reais não constam dos dados abertos.
- As duas imagens de referência citadas no pedido não chegaram na conversa; o SIMULATION MODE seguiu a descrição textual.

## Estrutura

```
scripts/            pipeline de dados (OSM, SRTM, build) e extrator de telemetria
research/raw/       dados brutos e documentos FIA (não vão para o bundle)
public/data/        terreno (binário) e feições processadas
src/
  data/             modelo central: traçado, curvas, retas, setores, marcadores, instalações, história, fontes
  store/            estado global (zustand)
  scene/            Three.js / React Three Fiber
    track/          pista, zebras, escapes, sinalização (destaque por shader)
    terrain/        terreno, textura de solo, base da maquete
    buildings/      edificações mescladas com picking
    structures/     boxes, arquibancadas, barreiras, postes, torres, lago
    vegetation/     árvores instanciadas
    camera/ lighting/ selection/ labels/ materials/
  components/       interface (barras, painéis, mapa, modais)
docs/               fontes, metodologia e tabelas do circuito
```

Tecnologias: React 19, TypeScript, Vite, Three.js, React Three Fiber, Drei, @react-three/postprocessing (N8AO, Bloom, SMAA), Tailwind CSS 4, Framer Motion, Lucide, Zustand.

Dados © colaboradores do OpenStreetMap (ODbL). Relevo: NASA SRTM. Dados de cronometragem © Formula One World Championship Limited (uso informativo com atribuição).

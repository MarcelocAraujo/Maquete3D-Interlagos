# Modelos do pacote "Cartoon Race Track Interlagos" (RCC Design)

O projeto está preparado para usar os modelos do pacote pago da Unity Asset Store **sem alterar a maquete** (escala, traçado, relevo e posições continuam os nossos). Os modelos entram apenas como acabamento: árvores, muros, cercas, barreiras de pneus, motorhomes, tendas, placas e cones.

## O que se sabe do pacote (página da Asset Store, consultada em 09/11/2026)

| Item | Valor |
|---|---|
| Preço | US$ 25 (licença Single Entity) |
| Editor | RCC Design |
| Versão | 1.0.1, de 03/09/2021 (Unity 2020.3.12) |
| Tamanho | 782,1 MB |
| Licença | Standard Unity Asset Store EULA (a página indica o tipo "Extension Asset") |
| Lista de conteúdo, formatos, polígonos e texturas | Não aparecem no HTML público da página (carregados por script) |

Os itens citados pelo autor (14 árvores, 5 muros, pneus, arquibancadas, boxes, paddock, pit wall, tendas, 2 motorhomes, placas, cones, iluminação) **não foram verificados** — o pacote não foi comprado nem baixado.

## Licença — atenção antes de publicar

O EULA permite incorporar os assets em um produto, mas **não** permite redistribuí-los como arquivos avulsos (seções 2.2.1, 3.5 e 5.1). Por isso:

- `public/assets/rcc/` está no `.gitignore` e **nunca** deve ir para o repositório público no GitHub.
- O site na Vercel faz deploy a partir do repositório; como os arquivos não estão lá, a versão publicada continua usando os modelos procedurais. Para publicar com os modelos do pacote, as alternativas são tornar o repositório privado (e aí versionar os GLBs) ou fazer o deploy pela CLI da Vercel a partir da sua máquina. Avalie o EULA antes — isto não é orientação jurídica.
- A página marca o pacote como "Extension Asset", o que no EULA implica licença para até 2 computadores.

## Como importar (depois de comprar)

1. No Unity (2020.3 ou mais recente), crie um projeto vazio, importe o pacote pela janela **Package Manager → My Assets**.
2. Exporte só os modelos: selecione a pasta do pacote em *Assets*, clique com o botão direito → **Export Package…** e salve um `.unitypackage`. (Alternativa: copie a pasta com os `.fbx` e texturas para qualquer lugar do disco.)
3. No projeto, rode:

```bash
npm run assets:rcc -- "C:/caminho/para/CartoonRaceTrackInterlagos.unitypackage"
```

O script `scripts/assets/import-rcc.mjs`:
- extrai os `.fbx`/`.obj` e as texturas do `.unitypackage` (ou lê a pasta);
- converte FBX → GLB com FBX2glTF;
- otimiza com glTF-Transform (dedup, weld, simplificação leve — 60% dos triângulos nas árvores, 85% nos demais —, pivô na base, texturas ≤ 1024 px em WebP, compressão meshopt);
- ignora pista, terreno e traçado do modelo estilizado (escala e elevações dele não correspondem às reais);
- classifica cada modelo pelo nome (tree, wall, fence, tyre, motorhome, tent, sign, cone, light, grandstand, pitwall, building) e propõe uma escala quando a altura não é plausível;
- grava `public/assets/rcc/manifest.json`.

4. Revise o `manifest.json`: corrija `role` ou `scale` se algum modelo foi mal classificado e use `"disabled": true` para descartar um modelo.
5. Recarregue o app. Na tela de carregamento aparece "Carregando N modelos do pacote RCC Design…".

## Onde cada tipo entra na maquete

| Papel | Uso | Sem o pacote |
|---|---|---|
| `tree` | Substitui as espécies procedurais nas mesmas posições (OSM), com alturas limitadas a 16 m e modelos alternados para evitar repetição | Árvores procedurais |
| `wall` | Módulos ao longo dos trechos de muro baixo | Muro procedural |
| `fence` | Módulos ao longo dos trechos de muro + alambrado (áreas de público) | Muro + alambrado procedurais |
| `tyre` | Módulos no fim das áreas de escape | Barreira de pneus procedural |
| `motorhome`, `tent` | Fileiras do paddock atrás dos boxes | Veículos e tendas procedurais |
| `sign` | Faixas no alambrado das arquibancadas da reta | Faixas genéricas |
| `cone` | Balizadores da entrada do pit lane | Balizadores procedurais |
| `grandstand`, `pitwall`, `light`, `building` | Importados e listados, mas **não posicionados automaticamente** (as estruturas atuais estão no lugar certo; pedem posicionamento manual) | — |

Tudo é instanciado (`InstancedMesh`, uma malha por parte de cada modelo). No GAME MODE os modelos usam o material original estilizado; no SIMULATION MODE recebem uma versão mais realista (sem facetas, cor levemente dessaturada, rugosidade de material real). Posições e geometria são as mesmas nos dois modos.

## Testes realizados

O pipeline foi testado com quatro modelos de teste gerados localmente (não são do RCC): conversão, otimização, manifest, carregamento no app, instanciamento de 841 árvores, motorhomes, faixas e módulos de cerca, e troca entre os dois modos sem erros. Sem o pacote, o app carrega normalmente com os modelos procedurais.

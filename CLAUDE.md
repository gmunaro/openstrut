# OpenStrut V2

## Identidade
App web local (offline, sem servidor) para calcular a estrutura de concreto armado de edifícios simples: o usuário desenha a planta de cada pavimento, e o app calcula lajes → vigas → pilares pela NBR 6118:2023 ou pela NB-1/78 e mostra a memória de cálculo. É uma reconstrução independente do SISTRUT 4.0 (1991), sem vínculo com os autores do original. A V1, reconstrução em QB64, fica num repositório separado (privado) e é a referência de comportamento para a NB-1/78; os valores dela que importam já estão nos testes e nas fixtures de `src/armazenamento/__fixtures__/v1/`. Especificação: `docs/SPEC.md`. Licença: GPL-3.0-or-later.

## Inegociáveis
- **Resultado errado é o pior bug.** Toda fórmula leva o item da norma em comentário e na memória. Todo teste de cálculo tem valor de referência independente (exemplo publicado, conta à mão ou V1), nunca a saída da própria função.
- `src/calculo/` é TypeScript puro: sem React, sem DOM, determinístico.
- As diferenças entre normas ficam na implementação de `Norma` (`src/calculo/normas/`), não em `if` espalhado.
- Unidades internas em SI: kN, m, MPa e cm² para armadura. A conversão para tf acontece só na exibição.
- Fora dos limites da norma, o resultado vira aviso visível. Nunca esconda nem "ajuste" valores.
- Offline e sem servidor. A obra fica em arquivo `.openstrut.json` com `versao` e migração por versão. Arquivos `.sistrut.json`, de antes do renome, continuam abrindo.
- O app avisa na tela e no relatório que os resultados exigem conferência de engenheiro responsável.

## Glossário
- **Obra**: o projeto inteiro (nome, norma, materiais, pavimentos).
- **Pavimento**: um andar, com pé-direito e `repeticoes` (pavimento-tipo repetido N vezes).
- **Laje**: placa retangular com 4 bordos. A **vinculação** de cada bordo é engastado, apoiado ou livre.
- **Viga**: barra horizontal sobre apoios (pilares ou outras vigas). É **contínua** quando tem vários tramos; o **balanço** é o tramo com uma ponta livre.
- **Pilar**: elemento vertical. A **carga acumulada** soma os pavimentos acima; **2ª ordem** é o efeito da deformação; λ é o índice de esbeltez.
- **Memória de cálculo**: a sequência de etapas (fórmula, valores, resultado, item da norma) que justifica o resultado.
- **ELU / ELS**: estado limite último (resistência) / de serviço (flecha, fissuração).
- **fck, fcd, fyk, fyd**: resistências característica e de cálculo do concreto e do aço.

## Comandos
- `bun install`
- `bun run dev`: servidor de desenvolvimento (só quando pedido)
- `bun run typecheck`
- `bun run lint` / `bun run fmt`
- `bun run test`: Vitest (motor de cálculo e domínio)
- `bunx playwright test` (ou `bun run e2e`): Playwright (fluxo na tela, em `e2e/`)
- `bun run build`; `bun run build:pages` para o GitHub Pages (base `/openstrut/`)
- `bun run check`: typecheck + lint + formatação + test (rode antes de dizer "pronto")

## Verificação
- Mudou cálculo: rode `bun run test` focado (`bun run test src/calculo/vigas`) e mostre os valores esperados e de onde vieram.
- Mudou tela: rode `bun run typecheck` e o e2e da tela tocada.
- Antes de dizer "pronto": `bun run check` passando.

## Checklist "todas as superfícies"
Ao mudar o modelo da obra, confira:
- os tipos em `src/dominio`;
- a migração do arquivo;
- o motor de cálculo;
- o editor de planta;
- o painel de resultados;
- o relatório;
- os testes.

## Gosto
- Tipos inferidos; nada de `any`. Use união discriminada para variantes, como `Vinculo` e `Norma`.
- Funções pequenas com nomes do domínio em português (`momentoMinimo`, `cargaAcumulada`). Identificadores de UI e infraestrutura podem ficar em inglês quando a biblioteca já usa.
- Comente o uso e a fonte (item da norma), não cada linha.
- Telas densas como as de software de engenharia: tabelas, números alinhados e unidades sempre visíveis.

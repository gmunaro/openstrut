# OpenStrut V2

App web para calcular a estrutura de concreto armado de edifícios simples. O usuário desenha a planta de cada pavimento, e o app calcula lajes, vigas e pilares pela **NBR 6118:2023** ou pela **NB-1/78**, com memória de cálculo de cada elemento. A carga passa das lajes às vigas e chega aos pilares, acumulada andar por andar. Roda no navegador, sem servidor: a obra fica em arquivo no aparelho do usuário.

> OpenStrut é uma reconstrução independente, por engenharia reversa, do SISTRUT 4.0 (1991). Sem vínculo com os autores do original.

A V2 sucede o SISTRUT 4.0 (MS-DOS, 1991). A OpenStrut V1, reconstrução do original em QB64, fica num repositório separado (privado) e serve de referência para a NB-1/78. A versão desktop, que traz a V1 junto, é distribuída à parte.

> **Os resultados exigem conferência de engenheiro responsável.** As normas ABNT são pagas e não foram lidas diretamente. Os valores da NBR 6118:2023 vêm de apostilas universitárias públicas, citadas no código e em `docs/norma/`. Os pontos sem confirmação estão marcados `[VERIFICAR]`.

## Usar

Abra **https://gmunaro.github.io/openstrut/** em qualquer navegador atual (Windows, Mac, Linux, Android, iPhone, iPad). Depois da primeira visita, o app funciona sem internet.

Para instalar como app, use a seção **Instalar** da tela inicial. Ela mostra o botão de instalar quando o navegador oferece (Chrome, Edge) e, nos outros, o caminho:

- **iPhone e iPad (Safari):** Compartilhar → Adicionar à Tela de Início.
- **Android (Chrome):** menu ⋮ → Instalar app.
- **Computador (Chrome, Edge):** ícone de instalar na barra de endereço.
- **Mac (Safari, macOS 14 ou mais novo):** Arquivo → Adicionar ao Dock.
- **Firefox no computador:** não instala apps da web; use pelo navegador.

### Link de demonstração

Um link pode abrir uma obra-exemplo já calculada, na aba e na vista pedidas, sem passo manual. Serve para mostrar o app num link direto ou embutido em outro site, num iframe:

- `?exemplo=nbr6118-2023` ou `?exemplo=nb1-78`: abre o sobrado-exemplo dessa norma;
- `?exemplo=edificio`: abre o edifício de demonstração, com 9 níveis (1º pavimento, tipo × 6, cobertura e casa de máquinas), planta em L, varandas em balanço e pilares de seções diferentes, calculado pela NBR 6118:2023 (`src/dominio/edificio.ts`);
- `&aba=planta|resultados|relatorio|3d|orcamento`: a aba ao abrir (padrão: planta);
- com `aba=3d`, a vista 3D ao abrir (só na primeira abertura da aba; voltar a ela abre a vista padrão):
  - `&explodido=1` e `&cor=concreto|nkPilares|taxaVigas|momentoLajes`;
  - `&camada=<id>[,<id>...]`: liga camadas da 3D, na ordem (os ids estão em `src/telas/obra3d/camadas.ts`). Com `render`, `&tracado=1` liga o path tracing; com `sequencia`, `&reproduzir=1` começa a obra se construindo;
  - `&foco=<tipo>~<pavimento>~<nome>`: a peça em foco, selecionada e enquadrada de perto, pelos nomes (ex.: `pilar~1º pavimento~P6`); a camada `armadura` mostra as barras dela;
  - `&vista=perspectiva|frente|lado|topo`: a câmera da 3D;
  - `&painel=0`: sem o painel lateral;
  - `&moldura=0`: sem o cabeçalho e a barra de pavimentos; sair da 3D os devolve;
- `&embed=1`: modo embutido, sem as dicas de primeiro uso, sem gravar rascunho no navegador e sem a confirmação ao sair. O aviso de conferência continua no rodapé.

Exemplos com o edifício:

- Tour guiado com render: https://gmunaro.github.io/openstrut/?exemplo=edificio&aba=3d&moldura=0&painel=0&cor=concreto&camada=render,tour&embed=1
- 3D explodida com os pilares pelo Nk: https://gmunaro.github.io/openstrut/?exemplo=edificio&aba=3d&moldura=0&painel=0&explodido=1&cor=nkPilares&embed=1
- Sequência construtiva 4D: https://gmunaro.github.io/openstrut/?exemplo=edificio&aba=3d&moldura=0&painel=0&cor=concreto&camada=render,sequencia&reproduzir=1&embed=1
- Armadura do pilar P6: https://gmunaro.github.io/openstrut/?exemplo=edificio&aba=3d&moldura=0&painel=0&cor=concreto&foco=pilar~1º%20pavimento~P6&camada=render,armadura&embed=1

Com o sobrado:

- Planta: https://gmunaro.github.io/openstrut/?exemplo=nbr6118-2023&aba=planta&embed=1
- Original × Corrigido pela NB-1/78: https://gmunaro.github.io/openstrut/?exemplo=nb1-78&aba=3d&camada=comparar&embed=1

O path tracing compila um shader grande: a aba pode travar por dezenas de segundos antes da primeira amostra (medido: ~27 s numa GTX 1080 Ti). Por isso as demos acima usam o render sem ele.

O código fica em `src/telas/demo.ts`.

## Rodar localmente

Requer [Bun](https://bun.sh).

```sh
bun install
bun run build && bun run preview   # abre em http://localhost:4173
```

- Desenvolvimento: `bun run dev`.
- Verificação: `bun run check` (typecheck, lint, formatação e testes Vitest).
- Testes de tela: `bunx playwright test` (Playwright; sobe um servidor de preview sozinho).
- Build: `bun run build` (saída em `dist/`).

O app é servido na raiz (`/`) por padrão, que é o que o instalador desktop usa (`http://127.0.0.1:41780/`). Para servir em outra pasta, defina `OPENSTRUT_BASE` no build. O GitHub Pages usa `/openstrut/`:

```sh
bun run build:pages     # base /openstrut/ e 404.html (recarregar uma rota interna abre o app)
bun run preview:pages   # abre em http://localhost:4173/openstrut/
```

O deploy no Pages é feito pelo workflow `.github/workflows/pages.yml` a cada push na `main`: ele roda `bun run check`, `bun run build:pages` e publica `dist/`.

## O que faz

- **Obra:** nome, norma, materiais (fck, aço, classe do aço A/B na NB-1/78, classe de agressividade e cobrimentos) e unidades (SI ou tf).
  - Dá para importar uma obra da V1 a partir dos arquivos `.LAJ`, `.VIG` e `.COL`. O que não tem correspondência entra com aviso.
  - A obra é salva em arquivo `.openstrut.json`. Os arquivos `.sistrut.json`, de antes do renome, abrem igual.
  - O rascunho é guardado automaticamente no navegador.
- **Pavimentos:** pé-direito e repetições (pavimento-tipo). Dá para copiar a planta de um pavimento para outro.
- **Planta:** lajes retangulares desenhadas na grade. As vigas são geradas nos bordos e os pilares nos cruzamentos. Tudo é editável: seções, cargas, vínculos e balanços. Há desfazer e refazer.
- **Cálculo:**
  - **Lajes:** NB-1/78 por charneiras plásticas, com ortotropia μ; NBR 6118 pelas tabelas elásticas de Bares/Pinheiro, com flecha por Branson e flecha diferida.
  - **Vigas:** viga contínua com envoltória de sobrecarga, flexão (simples e dupla) e cortante.
  - **Pilares:** carga acumulada, momentos mínimos, 2ª ordem e flexão composta normal e oblíqua pelo diagrama parábola-retângulo.
    - A 2ª ordem usa o pilar-padrão; para 90 < λ ≤ 140, na NBR 6118, o pilar-padrão acoplado ao diagrama M-N-1/r, com fluência.
    - Na NBR 6118, os pilares recebem o momento da ligação com as vigas (14.6.6.1).
  - **Equilíbrio:** verificado em cada pavimento.
- **Resultados e relatório:** tabelas por elemento, avisos de todos os limites da norma, memória de cálculo com o item da norma e relatório imprimível. As falhas (carga que não chega aos apoios) aparecem em vermelho.
- **Detalhamento:** posições das barras de vigas, lajes e pilares (ancoragem, decalagem, ganchos, traspasse e grampos) e tabela de aço da obra por bitola.
- **Desenho:** a planta de formas e a armação das vigas exportam em DXF R12. A área de fôrma entra nos quantitativos.

## Como a correção é verificada

- **NB-1/78:** a obra FLUXO da V1 dá os mesmos momentos, reações e armaduras (`src/calculo/fluxo.test.ts`). As diferenças conhecidas estão explicadas no teste, por exemplo o CA-50 que a V1 escreve como 5 tf/cm².
- **NBR 6118:2023:** exemplos resolvidos de Bastos (UNESP) viraram testes:
  - lajes E02 e E03;
  - vigas E04 a E10;
  - pilares E11 a E13 e os do capítulo de pilares.
- **Referência para armadura de pilar:** é uma integração numérica independente. Os ábacos lidos à mão na apostila entram como faixa.
- **Sem auto-referência:** todo valor esperado vem de exemplo publicado, de conta à mão ou da V1, nunca da saída da própria função.

## Limites conhecidos

- Só lajes maciças retangulares. Laje com bordo livre, fora o balanço, não é calculada pela NBR 6118, porque as tabelas transcritas não cobrem esses tipos.
- Pilares com λ > 140 não são dimensionados e o app avisa. O mesmo vale para concretos acima de C50.
- Na faixa 90 < λ ≤ 140, o coeficiente de fluência é φ = 2,0 fixo [VERIFICAR], porque a Tabela 8.2 da norma não estava nas fontes. O único exemplo publicado achado (UFMT 2017) não pôde ser reproduzido: o app pede mais aço que o artigo, ou seja, fica a favor da segurança.
- Ficam fora: vento e pórtico espacial. Os DXF não foram abertos em programa de CAD; só a estrutura e as coordenadas são testadas.
- Os testes de tela (`bunx playwright test`, em `e2e/`) cobrem só os fluxos principais: tela inicial, arquivos da obra e uma obra de ponta a ponta em cada norma.

## Estrutura

```
src/dominio/        modelo da obra e geração de vigas/pilares
src/calculo/        motor (TypeScript puro, sem React)
  normas/nb1-78/    NB-1/78
  normas/nbr6118-2023/  NBR 6118:2023
  lajes/ vigas/ pilares/ montagem.ts fluxo.ts
src/planta/         editor gráfico (SVG)
src/telas/ src/routes/  telas
src/armazenamento/  arquivo .openstrut.json e rascunho
docs/               SPEC, fontes de norma, exemplos
```

## Licença

Copyright (C) 2026 gmunaro.

Este programa é software livre: você pode redistribuí-lo e modificá-lo nos termos da GNU General Public License, versão 3 ou (a seu critério) qualquer versão posterior, publicada pela Free Software Foundation. Ele é distribuído sem nenhuma garantia. O texto completo está em [`LICENSE`](LICENSE).

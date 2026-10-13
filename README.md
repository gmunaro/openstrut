# SISTRUT V2

App web local para calcular a estrutura de concreto armado de edifícios simples. O usuário desenha a planta de cada pavimento, e o app calcula lajes, vigas e pilares pela **NBR 6118:2023** ou pela **NB-1/78**, com memória de cálculo de cada elemento. A carga passa das lajes às vigas e chega aos pilares, acumulada andar por andar.

É o sucessor do SISTRUT 4.0 (MS-DOS, 1991). A reconstrução do original fica em `../_Arquivo/Sistrust/dist` (V1) e serve de referência para a NB-1/78.

> **Os resultados exigem conferência de engenheiro responsável.** As normas ABNT são pagas e não foram lidas diretamente. Os valores da NBR 6118:2023 vêm de apostilas universitárias públicas, citadas no código e em `docs/norma/`. Os pontos sem confirmação estão marcados `[VERIFICAR]`.

## Rodar

Requer [Bun](https://bun.sh).

```sh
bun install
bun run build && bun run preview   # abre em http://localhost:4173 (funciona offline depois de instalado como PWA)
```

Desenvolvimento: `bun run dev`. Verificação completa: `bun run check` (typecheck, lint, formatação e testes).

## O que faz

- **Obra:** nome, norma, materiais (fck, aço, classe do aço A/B na NB-1/78, classe de agressividade e cobrimentos) e unidades (SI ou tf).
  - Dá para importar uma obra da V1 a partir dos arquivos `.LAJ`, `.VIG` e `.COL`. O que não tem correspondência entra com aviso.
  - A obra é salva em arquivo `.sistrut.json`.
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
- As telas não foram testadas no navegador por automação. O teste e2e (`bun run e2e`) sobe um servidor de preview e ainda não foi rodado.

## Estrutura

```
src/dominio/        modelo da obra e geração de vigas/pilares
src/calculo/        motor (TypeScript puro, sem React)
  normas/nb1-78/    NB-1/78
  normas/nbr6118-2023/  NBR 6118:2023
  lajes/ vigas/ pilares/ montagem.ts fluxo.ts
src/planta/         editor gráfico (SVG)
src/telas/ src/routes/  telas
src/armazenamento/  arquivo .sistrut.json e rascunho
docs/               SPEC, fontes de norma, exemplos
```

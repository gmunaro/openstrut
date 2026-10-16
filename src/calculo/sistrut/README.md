# `src/calculo/sistrut/`: o caminho de cálculo do SISTRUT 4.0

Reimplementação, em TypeScript puro, do caminho de cálculo NB-1/78 do SISTRUT 4.0 original (lajes, montagem lajes → vigas, vigas, pilares e quantitativos de viga). Serve aos dois modos da obra:

- **original** ("Como o SISTRUT original"): reproduz número a número o que o original imprime;
- **corrigido**: roda o mesmo algoritmo e troca só os defeitos reais do original (R1-R12 e item H de `C:/tmp/v2-paridade/PLANO.md`, seção 4).

A referência é a V1 nova, a retradução fiel do original em QB64 (`_Arquivo/Sistrust/dist/src-original/<família>/<EXE>.BAS`), conferida byte a byte contra o original rodando no DOSBox-X (o oráculo, `C:/tmp/oraculo/`). A especificação de cada família está nos livros de apoio (`C:/tmp/v2-paridade/apoio/livros_*.md`).

## Convenções

- **Unidades do original**, nos dois modos: t, m, cm, t/m, t/m², t/cm², t·m. É uma exceção deliberada à regra "unidades internas em SI" do `CLAUDE.md`. A conversão para SI acontece só na saída, na integração (`base/unidades.ts`).
- **Modo original**: materiais na unidade da obra (fck 0,15 t/cm², CA-50 = 5 t/cm², concreto 2,5 t/m³) e Float32 a cada atribuição (`sng`, `atribuicao(modo)` em `base/f32.ts`). Constantes literais também são SINGLE: escreva `sng(1.4)`.
- **Modo corrigido**: mesmo algoritmo em float64, com os materiais SI "redondos" (500 MPa, 25 kN/m³) convertidos para as unidades do original.
- **Arredondamentos do QuickBASIC** (`base/f32.ts`): `qbInt` (piso), `qbFix`, `qbCint`/`qbClng` (meio ao par), `qbIntCasas` (o `INT(x·100)/100` que o original usa ao gravar), `qbStr` (STR$ de SINGLE) e `qbUsing` (PRINT USING, que arredonda metade para longe do zero sobre 16 algarismos significativos, não sobre os 7 do SINGLE).
- **Parâmetros**: só os padrões "SISTRUT" embutidos no código (`base/parametros.ts`), cada valor com a linha do `.BAS`.
- **Contratos**: `base/tipos.ts` é o contrato final que o código cumpre: os tipos de entrada e saída e o tipo de cada função pública. A implementação anota o tipo: `export const momentosLaje: MomentosLaje = (entrada, modo) => ...`. Uma família não cria tipo que estende o tipo de saída do contrato nem função "irmã" com outra assinatura: o campo novo entra em `base/tipos.ts`, com o comentário de uso e a fonte `.BAS:linha`; o dado que só um chamador tem entra como parâmetro opcional no fim da assinatura (`geometriaPilares` em `montaPavimento`, `extras` em `detalhaViga`, `coeficientes` em `cargasPilares`). `obra.ts` e `../fluxoSistrut.ts` usam só os tipos do contrato e as funções que os implementam. Tipos locais que ficam numa família são internos (estado do porte, tabelas do original), não saída.
- **Erros** (`base/f32.ts`): `ErroQB` é o erro de execução do QuickBASIC (divisão por zero, "Illegal function call"), onde o original para; `ErroNaoConverge` é onde o original entraria em laço sem fim e o porte põe um teto: otimização dos negativos (`lajes/esforcos.ts`, `lajes/otimizacao.ts`, R3, com o `estado` da tela parada) e busca do equilíbrio do pilar (`pilares/elu.ts`, `armadura.ts`, D-2). A integração transforma os dois em aviso.
- **Referências**: todo cálculo leva no comentário a linha `<EXE>.BAS:<linha>` e a seção do livro de apoio.
- **Testes**: contra os números impressos pelo original (`__oraculo__/`, com `numeroOraculo` e `bateComImpresso`: meia unidade da última casa impressa, ou FIX quando o original truncou) ou contra as contas à mão dos livros de apoio. Nunca contra a saída da própria função.

## Pastas

| Pasta / arquivo    | Conteúdo                                                                                                                                                                                                                                        | Tarefa  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `base/`            | `tipos.ts` (contratos), `f32.ts` (semântica numérica do QB4.5, `ErroQB`, `ErroNaoConverge`), `parametros.ts` (.LAP/.DSP/VIGA.INI/PILAR.INI/.PIP "SISTRUT"), `unidades.ts`                                                                       | T0, T7  |
| `lajes/`           | LAJECALC: `continuidade.ts`, `charneiras.ts` (padrão do LAJECALC), `coeficiente.ts`, `momentos.ts`, `esforcos.ts` (esforços do painel); `flexao.ts`, `barras.ts`, `armaduras.ts`, `espessura.ts`, `otimizacao.ts`; LAJEPROC: `proc.ts`          | T1, T2  |
| `montagem/`        | LAJEMONT: `reacoes.ts` (reações por bordo e totais), `vigas.ts` (.VIG), `charneiras.ts` e `regioes.ts` (padrão e regiões do LAJEMONT), `cargas.ts`, `geometria.ts`, `obraLaj.ts` (leitor de .LAJ para os testes)                                | T6      |
| `vigas/`           | VIGA: `vicalc.ts` (análise), `rep.ts` (.REP); DESDIM: `desdim.ts` e `desdim-*.ts`; DESCALC: `desinitDescalc.ts` (esforços do DESDIM e do DESINIT); DESINIT: `desinit.ts`, `desinitBarras.ts`, `desinitCorte.ts`, `desinitComum.ts`              | T3, T4  |
| `pilares/`         | PILAR/PILAREDI/PILGEEDI: `esforcos.ts`, `secao.ts`, `elu.ts`, `armadura.ts`, `carga.ts` (cargas e predimensionamento), `verificacao.ts`                                                                                                         | T5      |
| `quant/`           | `vigas.ts` (quadro do DESINIT e resumo do DESENHO)                                                                                                                                                                                              | T4      |
| `obra.ts`          | integração: monta, a partir de uma obra da V2, as entradas que o original lê e encadeia as famílias (`calcularObraSistrut`); resultado nas unidades do original. A projeção em SI é `../fluxoSistrut.ts`                                        | T7      |
| `pilaresDaObra.ts` | campos de pilar da obra (seção, vínculos, vento, excentricidade, carga no topo, verificações, PILAR.INI/.PIP, predimensionamento) → entrada do PILGEEDI/PILAREDI/PILAR; `pilaresDaObra.test.ts` confere pelo motor os casos de pilar do oráculo | pilares |
| `obra.test.ts`     | ponta a ponta contra o oráculo (casos a, b, c, LAJEPROC e v2par_viga_fluxo)                                                                                                                                                                     | T7      |
| `__e2e__/`         | as obras da V2 dos testes de ponta a ponta: `obraE2E.ts` (casos a, b, c) e `obraVBX.ts` (v2par_viga_fluxo)                                                                                                                                      | T7      |
| `__oraculo__/`     | um JSON por caso do oráculo (valores impressos, com o arquivo e a linha de onde saíram) e `index.ts`                                                                                                                                            | T0, T10 |

O PLANO não deu dono à continuidade automática (L4) nem à otimização dos negativos (L5): ficaram com T1 (`lajes/continuidade.ts`) e T2 (`lajes/otimizacao.ts`).

## Padrão de charneiras: dois portes

`lajes/charneiras.ts` é o padrão do LAJECALC (S_4019b), sobre o polígono girado e afim, para o coeficiente de carga; `montagem/charneiras.ts` é o do LAJEMONT (S_401b9), para as áreas de influência. Ficam os dois porque nenhum cobre o outro: o do LAJEMONT usa coordenadas reais sem giro nem afinidade, o i do bordo sem o truncamento em 2 casas da bissetriz (LAJECALC.BAS:3425), leva as charneiras do bordo livre até o meio do bordo (L_4dbbe) e tem o ramo da pré-moldada (S_15790). O `padraoDeCharneirasLajemont` da T1 só tirava o truncamento, não era usado fora do próprio teste e saiu. Detalhes no cabeçalho de `montagem/charneiras.ts`.

## Caso novo do oráculo

Grave `__oraculo__/<caso>.json` no formato dos existentes (o mesmo do comparador T9, `paridade/lib/caso.ts` da V1). Os ids seguem a convenção do T9: `L1.M+princ`, `L1>V4.area`, `V1.t1.M+`, `V1.a0.R`, `REP.P5.carga.V2`, `P.lambdaX`, `P5.1f.MRx2a`, `param.<nome>`. Depois importe o JSON em `__oraculo__/index.ts`. O teste `oraculo.test.ts` confere que cada `fonte` existe no run e contém o `impresso`; sem o run na máquina, ele é pulado.

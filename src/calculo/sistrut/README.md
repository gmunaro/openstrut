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
- **Contratos**: `base/tipos.ts` define, para T1-T6, os tipos de entrada e saída e o tipo de cada função pública. A implementação anota o tipo: `export const momentosLaje: MomentosLaje = (entrada, modo) => ...`.
- **Referências**: todo cálculo leva no comentário a linha `<EXE>.BAS:<linha>` e a seção do livro de apoio.
- **Testes**: contra os números impressos pelo original (`__oraculo__/`, com `numeroOraculo` e `bateComImpresso`: meia unidade da última casa impressa, ou FIX quando o original truncou) ou contra as contas à mão dos livros de apoio. Nunca contra a saída da própria função.

## Pastas

| Pasta          | Conteúdo                                                                                                                                                                | Tarefa  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `base/`        | `f32.ts` (semântica numérica do QB4.5), `parametros.ts` (.LAP/.DSP/VIGA.INI/PILAR.INI/.PIP "SISTRUT"), `unidades.ts`, `tipos.ts` (contratos)                            | T0      |
| `lajes/`       | `charneiras.ts`, `coeficiente.ts`, `momentos.ts` (esforços); `flexao.ts`, `barras.ts`, `espessura.ts`, `otimizacao.ts`, `proc.ts` (flexão, barras, espessura, LAJEPROC) | T1, T2  |
| `montagem/`    | `reacoes.ts` (LAJEMONT: áreas de influência, .VIG)                                                                                                                      | T6      |
| `vigas/`       | `vicalc.ts` (análise e .REP), `desdim.ts`, `desinit.ts` (dimensionamento e detalhamento)                                                                                | T3, T4  |
| `pilares/`     | `esforcos.ts`, `secao.ts`, `elu.ts`, `armadura.ts`, `carga.ts`                                                                                                          | T5      |
| `quant/`       | `vigas.ts` (quadro do DESINIT e resumo do DESENHO)                                                                                                                      | T4      |
| `__oraculo__/` | um JSON por caso do oráculo (valores impressos, com o arquivo e a linha de onde saíram) e `index.ts`                                                                    | T0, T10 |

O PLANO não deu dono à continuidade automática (L4) nem à otimização dos negativos (L5). Os contratos sugerem T1 para a continuidade e T2 para a otimização (`lajes/otimizacao.ts`).

## Caso novo do oráculo

Grave `__oraculo__/<caso>.json` no formato dos existentes (o mesmo do comparador T9, `paridade/lib/caso.ts` da V1). Os ids seguem a convenção do T9: `L1.M+princ`, `L1>V4.area`, `V1.t1.M+`, `V1.a0.R`, `REP.P5.carga.V2`, `P.lambdaX`, `P5.1f.MRx2a`, `param.<nome>`. Depois importe o JSON em `__oraculo__/index.ts`. O teste `oraculo.test.ts` confere que cada `fonte` existe no run e contém o `impresso`; sem o run na máquina, ele é pulado.

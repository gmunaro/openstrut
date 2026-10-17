# Orçamento da estrutura

A aba Orçamento multiplica os quantitativos da obra calculada pelos preços de uma tabela e mostra o custo da estrutura de concreto armado: total, por pavimento, por tipo de elemento, por insumo e por elemento, com perdas, reaproveitamento de fôrma e BDI. Na NB-1/78 mostra também quanto custa a diferença entre o modo original e o corrigido.

É uma estimativa da estrutura. Não substitui o orçamento executivo nem a conferência de engenheiro responsável, e a tela, os arquivos exportados e a seção do relatório dizem isso.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `src/dominio/orcamento.ts` | Puro. Tipos (tabela de preços, papéis, composições, configuração), `orcar`, `areaFormaFabricada`, `bdiTcu`, `diferenca`. |
| `src/telas/orcamento/levantamento.ts` | Quantidades de cada elemento da obra calculada, no formato que `orcar` recebe. |
| `src/telas/orcamento/sinapi.ts` | Tabela de referência (recorte da SINAPI 09/2026, SP) e as composições padrão. |
| `src/telas/orcamento/importar.ts` | Importação de CSV, XLSX e do ZIP mensal da SINAPI. |
| `src/telas/orcamento/planilha.ts` | CSV e XLSX sem dependência: zip (STORE e DEFLATE), leitura e gravação. |
| `src/telas/orcamento/armazenamento.ts` | Tabelas e parâmetros no IndexedDB (banco `openstrut-orcamento`). |
| `src/telas/orcamento/estado.ts` | Composição efetiva de cada papel, `useOrcamento` (aba e relatório). |
| `src/telas/orcamento/exportar.ts` | Abas do XLSX e o CSV. |
| `src/telas/orcamento/SecaoOrcamento.tsx` | Tabelas de apresentação e `secaoOrcamento()` para o relatório. |
| `src/telas/orcamento/TelaOrcamento.tsx` | A aba. |

A entrada na tela é a aba "Orçamento" em `src/telas/obra/TelaObra.tsx` (um `TabsTrigger` e um `TabsContent`).

## Quantidades

`levantamentoDaObra(obra, resultado, detalhamento)`:

- **Concreto e fôrma** por elemento, com as mesmas funções e o mesmo critério de `calcularQuantitativos` (`quantLaje`, `quantViga`, `quantVigaDesinit` no modo original, `quantPilar` com o encontro viga-pilar), já multiplicados pelas repetições. O teste `levantamento.test.ts` confere que a soma bate com os quantitativos por pavimento e tipo em seis obras (NB-1/78 original e corrigido, NBR 6118, com e sem repetição).
- **Aço** pelas barras do detalhamento (a "Tabela de aço" da aba Resultados), por categoria e bitola, com ganchos e ancoragens e sem perda. Não é a estimativa do "Resumo de aço e concreto". O teste confere a soma por bitola contra `det.tabelaObra`.
- **Fundação** (só NB-1/78): a carga na fundação de cada coluna que nasce no nível 0, do resumo do PILAREDI (`resultado.sistrut.fundacoes`, em t). Uma coluna que nasce sobre viga fica de fora, porque a carga dela chega à fundação pelas colunas que recebem a viga. A NBR 6118 da V2 não tem esse resumo.
- **Área construída**: soma de lx·ly das lajes de cada pavimento × repetições.

## Composições

Cada papel (concreto do fck da obra, aço de cada categoria e bitola, fabricação e montagem de fôrma de laje, viga e pilar, armação, concretagem, fundação) tem uma composição, que é uma lista de itens da tabela com coeficiente. O preço unitário é Σ coeficiente × preço. Composição vazia, código fora da tabela ou item sem preço deixam o papel sem preço, e o total fica parcial com aviso.

| Linha | Quantidade |
|---|---|
| Concreto | m³ × (1 + perda de concreto) |
| Concretagem (lançamento, adensamento, acabamento) | m³ |
| Aço de cada bitola | kg × (1 + perda de aço) |
| Armação (corte, dobra e montagem, sem o aço) | kg sem perda |
| Fôrma (fabricação) de cada tipo | área a fabricar × (1 + perda de fôrma) |
| Fôrma (montagem e desmontagem) de cada tipo | área total |
| Fundação (opcional) | tf de carga na fundação |

Reaproveitamento: a área de fôrma a fabricar de cada tipo é máx(maior área de um nível; área total ÷ usos), nunca acima da área total. Os níveis são os pavimentos desdobrados pelas repetições. O custo de fabricação é rateado entre os elementos do tipo na proporção da área de cada um.

BDI: custo total = custo direto × (1 + BDI). A tela tem a fórmula do Acórdão TCU 2622/2013, BDI = (1 + AC + S + R + G)(1 + DF)(1 + L) / (1 − I) − 1, com as parcelas que o usuário informa. O app não sugere valor de BDI (o padrão é 0 %).

Padrões das perdas, que são convenções do app e se editam na tela: concreto 5 %, aço 10 % (a mesma perda da tabela de aço do detalhamento), fôrma 10 %, 4 usos por jogo de fôrma (as 4 utilizações das composições de montagem da SINAPI usadas como padrão).

## Tabela de referência (SINAPI)

Fonte: SINAPI, relatório mensal 09/2026, arquivo `SINAPI-2026-09-formato-xlsx.zip` de https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-2026-09-formato-xlsx.zip (SHA-256 `feef29cd107f4bdde9bc10ba03d71eb4d8b6b2e0e95fe9020c4fe72aabe2a04c`), planilha `SINAPI_Referência_2026_09.xlsx`, emissão 09/10/2026. UF SP, sem desoneração: insumos da aba ISD (preço mediano), composições da aba CSD. Cada preço foi lido da planilha oficial pelo importador do app e conferido contra duas pesquisas independentes.

Composições padrão (coeficientes do Analítico 09/2026):

| Papel | Composição |
|---|---|
| Concreto C20 a C40 | insumo 1524, 1527, 1525, 11145, 34479 (usinado bombeável, com bombeamento, sem lançamento). fck fora de 20 a 40 fica sem composição (a SINAPI não tem C15). |
| Aço CA-50 | 32 (6,3), 33 (8,0), 34 (10,0), 43055 (12,5 ou 16,0), 43056 (20,0 ou 25,0), 43057 (32,0). CA-60: 43059 (4,2 a 7,0). |
| Concretagem | 103673, inteira. |
| Fôrma, fabricação | 92267 (laje), 92265 (viga), 92263 (pilar), compensado resinado 17 mm. |
| Fôrma, montagem e desmontagem | 92514 (laje, pé-direito simples), 92456 (viga, escoramento metálico) e 92419 (pilar), 4 utilizações, sem a subcomposição de fabricação. |
| Armação | 92762 (CA-50 10,0 mm, montagem) sem a 92803, mais a 92803 (corte e dobra) sem o aço: 88245 × 0,048, 88238 × 0,0078, arame 43132 × 0,025, espaçador 39017 × 0,543. |

As composições da SINAPI de montagem de fôrma já trazem uma fração da fôrma fabricada (0,341, 0,414 e 0,263 m²/m² nas três acima), e as de armação trazem o aço com 11 % de perda. O app cobra o material à parte, com a perda e o reaproveitamento da tela, e deixa na composição de mão de obra o resto. O teste `sinapi.test.ts` soma de volta o material e confere o custo publicado na CSD: 92514 = R$ 57,18, 92456 = R$ 177,28, 92419 = R$ 101,51, 92762 = R$ 10,10 (SP, 09/2026).

Os preços mudam todo mês e por UF. Para outro mês, outra UF ou com desoneração, importe o ZIP mensal da SINAPI.

## Importação

`abrirPlanilha(nome, dados)` aceita:

- CSV (separador `;`, `,` ou tab, UTF-8 ou latin1) e XLSX com as colunas código, descrição, unidade e preço. O cabeçalho é achado nas primeiras 40 linhas pelos nomes ("código...", "descrição...", "unid...", "preço/custo/valor...").
- O XLSX da SINAPI e o ZIP mensal (o app abre a planilha de referência de dentro do ZIP). Abas de insumos (ISD, ICD, ISE): cabeçalho na linha 10, preço numa coluna por UF. Abas de composições (CSD, CCD, CSE): a UF fica na linha 9, sobre a coluna "Custo (R$)", e o código está numa fórmula `HYPERLINK(...; código)` com valor em cache 0; o leitor usa o código da fórmula. O mês de referência e a desoneração saem da aba (linha "Mês de Referência", nome ISD/CSD = sem, ICD/CCD = com).
- O `.xls` antigo não é lido.

A importação cria uma tabela nova ou junta os itens à tabela atual (o código que já existe recebe o preço novo). Para ter insumos e composições da SINAPI numa tabela só, importe a ISD como nova e junte a CSD.

As tabelas importadas, as edições de preço e os parâmetros ficam no IndexedDB do navegador, fora do arquivo da obra. Editar a tabela de referência cria uma cópia editada com o mesmo id, e "Desfazer edições da referência" apaga a cópia.

## Comparação entre os modos (NB-1/78)

A aba recalcula a obra no outro modo (`levantamentoNoModo`) e orça os dois com a mesma tabela e os mesmos parâmetros. Mostra o custo direto por tipo, o total com BDI e a carga na fundação de cada modo, e a diferença original − corrigido. O app não dimensiona fundação. Por isso a diferença de fundação aparece em tf, e em R$ só quando o usuário dá uma composição à fundação (R$ por tf). É assim que aparece o caso da Alpha1, em que um pilar que nasce sobre viga e continua a coluna de baixo leva a carga dele à fundação duas vezes no modo original.

## Exportação

CSV (`;`, vírgula decimal, BOM UTF-8; as tabelas uma abaixo da outra) e XLSX (abas Resumo, Por insumo, Por pavimento, Por tipo, Por elemento, Linhas e, na NB-1/78, Comparação). O XLSX é gerado sem biblioteca: zip sem compressão com o XML mínimo do Office Open XML.

## Relatório impresso

O relatório é de outro agente. A seção está pronta em `secaoOrcamento(r, comp?)` (`SecaoOrcamento.tsx`). Ligação sugerida em `src/telas/relatorio/Relatorio.tsx`:

```tsx
import { useOrcamento } from "../orcamento/estado";
import { secaoOrcamento } from "../orcamento/SecaoOrcamento";

// dentro do componente, com o resultado e o detalhamento que o relatório já tem
const { atual } = useOrcamento(obra, calculo.tipo === "ok" ? calculo.resultado : null, detalhamento);
// ...
{incluirOrcamento && atual && secaoOrcamento(atual)}
```

`incluirOrcamento` é a opção do relatório (desligada por padrão). A seção usa a tabela e os parâmetros que o usuário deixou na aba Orçamento. Para incluir a comparação entre os modos, monte a `Comparacao` como `TelaOrcamento` faz e passe como segundo argumento.

## Limitações

- Estimativa da estrutura: concreto, aço e fôrma com a mão de obra. Não entram escoramento de laje além do que está na composição de montagem, cura, juntas, impermeabilização, transporte vertical, canteiro, nem a fundação dimensionada.
- Aço pelo detalhamento do app. Elemento sem barras no detalhamento fica sem aço, e a aba lista esses elementos.
- Mão de obra de armação única para todas as bitolas (a de 10 mm da SINAPI). Na SINAPI ela cai com a bitola: na montagem, 0,1069 h/kg de armador no CA-60 5,0 mm (92759), 0,0392 no CA-50 10,0 mm (92762) e 0,0257 no CA-50 12,5 mm (92763).
- Fôrma: um jogo por tipo de elemento; o reaproveitamento não considera a sequência real da obra nem a perda por uso.
- Área construída pela área das lajes nos eixos, sem projeções, escadas nem vazios.
- Fundação só paramétrica (R$/tf) e só na NB-1/78.
- A tabela de referência é de um mês e uma UF. Um item agrupado da SINAPI (12,5 ou 16 mm; 20 ou 25 mm; CA-60 4,2 a 7,0 mm) tem o mesmo preço para as bitolas do grupo.

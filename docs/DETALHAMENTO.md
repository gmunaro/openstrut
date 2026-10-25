# Detalhamento de armaduras de vigas (fase 5)

Motor puro em `src/calculo/detalhamento/`. A ligação com o resultado do cálculo e as telas ficam em `src/telas/detalhamento.ts`. Unidades: comprimentos e abscissas em cm, φ em mm, cortante em kN, tensões em MPa.

## Arquivos e funções

| Arquivo | Exporta |
|---|---|
| `ancoragem.ts` | `barraLisa`, `alturaGancho6118`, `aderencia6118`, `aderenciaNb178`, `ancoragemBasica6118`, `ancoragemBasicaNb178`, `ancoragemNecessaria6118`, `ancoragemNecessariaNb178`, `pinoDobramento`, `gancho6118`, `ganchoNb178`, `ganchosEstribo6118`, `ganchosEstriboNb178` |
| `vigas.ts` | `decalagem6118`, `decalagemNb178`, `RegrasDetalhamento`, `REGRAS_6118`, `REGRAS_NB178`, `regrasDetalhamento(id)`, `detalharViga(entrada, regras)`, `phiPortaEstribos` |
| `tabelaAco.ts` | `massaLinear`, `tabelaAco(itens, perda = 0,10)` |

O que muda de uma norma para outra fica em `RegrasDetalhamento`: zona de aderência, lb, lb,nec, decalagem, ganchos de barra e de estribo. A geometria do detalhamento é a mesma para as duas normas.

### Como integrar

`detalharViga` recebe:
- `tramos`: os `TramoResultado` de `analisaVigaContinua`, com a envoltória característica;
- `dimensionamento`: um item por tramo com `positivo`, `negativoEsq`, `negativoDir` e `estribo`. O tipo é compatível com `ResultadoTramo` de `fluxo.ts`, então `ResultadoViga.tramos` serve direto;
- `bw`, `h`, `d` e `cobrimento` em cm, e `gamaF`, o mesmo coeficiente que o dimensionamento usou;
- `larguraApoios`: n + 1 larguras de apoio na direção da viga, em cm. Use 0 na ponta livre de balanço. Saem das seções dos pilares ou da largura da viga de apoio.

`PosicaoArmadura` também satisfaz `ItemAco`, então `tabelaAco(detalhamento.posicoes)` dá o resumo da viga. A mesma `tabelaAco` serve para lajes e pilares: basta passar `{ phi, quantidade, comprimento, aco }`.

## Regras: NBR 6118:2023

Fontes: Bastos, *Ancoragem e emenda de armaduras* (UNESP, mar/2024), chamada aqui de F4, e Bastos, *Vigas de concreto armado* (UNESP, abr/2024), chamada de F6. O texto da norma não foi lido.

| Regra | Fórmula / valor | Item | Fonte |
|---|---|---|---|
| Zona de aderência | Barra horizontal. Com h < 60 cm, boa até 30 cm acima da face inferior. Com h ≥ 60 cm, boa a pelo menos 30 cm abaixo da face superior. Fora disso, má. Junta de concretagem não é considerada | 9.3.1 | F4 item 3, Fig. 18 |
| Resistência de aderência | fbd = η1 η2 η3 fctd, com fctd = 0,7 · 0,3 fck^(2/3) / 1,4. η1: CA-50 = 2,25; CA-25 e CA-60 = 1,0. η2: boa = 1,0; má = 0,7. η3 = 1 para φ < 32 e (132 − φ)/100 a partir de 32 | 9.3.2.1 | F4 Eq. 1 |
| lb | φ/4 · fyd/fbd ≥ 25 φ | 9.4.2.4 | F4 Eq. 3 |
| lb,nec | α lb As,calc/As,ef ≥ lb,mín = máx(0,3 lb; 10 φ; 10 cm). α = 0,7 com gancho, 1,0 sem gancho. A razão As,calc/As,ef fica limitada a 1 | 9.4.2.5 | F4 Eq. 4 e 5 |
| Gancho de 90° (nervurada) | Ponta reta de 8 φ. Pino D pela Tabela 9.1: φ < 20 → CA-25 4φ, CA-50 5φ, CA-60 6φ; φ ≥ 20 → CA-25 5φ, CA-50 8φ. Acréscimo = 8 φ + D/2 + φ, medido por fora | 9.4.2.3 | F4 item 5.2.3, Tabela 1 |
| Gancho semicircular (barra lisa, CA-25) | Ponta reta de 2 φ. Acréscimo = π (D + φ)/2 + 2 φ, pelo eixo, sem descontar o trecho D/2 + φ já contado no reto. Altura por fora: D + 2 φ | 9.4.2.3 a (barra lisa leva gancho semicircular) | F4 p. 13-14 |
| Barra lisa tracionada | Ancoragem obrigatoriamente com gancho: toda ponta de positivo e de negativo leva gancho, também dentro do vão e no apoio interno; lb,nec usa α = 0,7 | 9.4.2.1 a | F4 p. 12 |
| Ganchos do estribo | 135° com ponta de 5 φt, no mínimo 5 cm, em cada um dos dois ganchos | 9.4.6.1 a | F4 item 5.2.5 |
| Decalagem (Modelo I, estribo vertical) | al = d VSd,máx / (2 (VSd,máx − Vc)), com 0,5 d ≤ al ≤ d. al = d quando VSd ≤ Vc. Vc = Vc0 = 0,6 fctd bw d. VSd = γf · máx(vEsq, vDir) do tramo | 17.4.2.2 c | F6 Eq. 31 |
| Ponto de corte | A barra vai até lb,nec além do ponto A e pelo menos 10 φ além do ponto B, ambos no diagrama decalado. Fica o maior dos dois | 18.3.2.3 | F6 item 13.2, Fig. 37 |
| Apoio interno, positivo | A barra entra 10 φ além da face do apoio | 18.3.2.4.1 | F6 item 14.3 |
| Apoio extremo, positivo | As,anc = (al/d) Vd/fyd. lb,ef = b − c ≥ máx(lb,nec com gancho; lb,mín; r + 5,5 φ; 6 cm) | 18.3.2.4 b e 18.3.2.4.1 | F6 Eq. 39 a 44 |

## Regras: NB-1/78

A referência de comportamento é a V1 (repositório da V1, privado), nos arquivos `DESCALC.BM` e `T_DESCALC.BAS`. Onde a V1 reconstruída não tem a regra, vale o padrão do SISTRUT 4.0 original, no arquivo `SISTRUT.DSP` (linhas citadas abaixo).

| Regra | Valor | Fonte |
|---|---|---|
| lb | τbu = 0,42 fcd^(2/3) em MPa; lb = φ/4 · fyd/τbu. Sem o mínimo de 25 φ | V1 `DcAncoragem#` |
| lb, barra lisa (CA-25) | τbu = 0,28 fcd^(1/2) (ηb ≤ 1). Ex.: C15, φ10: lb = 59,3 cm (com 0,42 fcd^(2/3) daria 26,6) | Fiorin, dissertação EESC-USP (1998), item 5.1, p. 137 do PDF, citando a NBR 6118:1978. A V1 só tem a fórmula da nervurada |
| Gancho obrigatório na barra lisa | Mesma geometria da 6118 (todas as pontas tracionadas), com o gancho de 10 φ da V1 | A favor da segurança; Fiorin (1998, p. 138 do PDF) também cita o gancho obrigatório na barra lisa |
| Zona de aderência | Barra superior com h ≥ 30 cm: má aderência, τbu × 2/3, ou seja, lb × 1,5. O resto é boa | V1 `DcAncoragemNeg#` |
| lb,nec | Igual a lb, sem redução por As,calc/As,ef nem por gancho. Exceção: no apoio extremo vale a regra do SISTRUT (item 4) | V1 `DcDetalha%`; DSP linha 332 ("reduzir ancoragem positiva" = N) |
| Gancho de barra | 10 φ | V1 `DcDetalha%` |
| Ganchos do estribo | 2 × 10 φt | V1 `DcComprEstribo#` |
| Decalagem | al = 0,75 d | DSP linha 84. A V1 reconstruída não decala |

## Geometria comum (`detalharViga`)

A ordem por tramo é a da V1 `DcDetalha%`: negativo da extremidade esquerda (só no 1º tramo), positivo, negativo do apoio direito, porta-estribos, estribos. O negativo de um apoio interno é listado no tramo à esquerda dele. A abscissa x parte do primeiro nó da viga.

- **Positivo.** Todas as barras vão de apoio a apoio; a armadura não é escalonada.
  - Em apoio extremo, a barra vai até a face externa menos o cobrimento, com gancho, e a ancoragem é conferida.
  - Em apoio interno, a barra para no mais longe de três pontos: 10 φ além da face; 10 φ além do zero da envoltória mais al; lb,nec além do pico mais al.
  - Em ponta livre, a barra vai até a ponta menos o cobrimento, com gancho.
- **Negativo.** A seção do nó é a de maior As,ef entre os dois tramos vizinhos. Para cada lado, a barra se estende pelo maior entre:
  - 0,25 × o maior vão adjacente que não é balanço, mais lb (regra da V1);
  - o diagrama: al + lb,nec, ou zero da envoltória + al + 10 φ.

  A extensão fica limitada ao vão. Se cobre o vão inteiro e o outro nó é apoio extremo, a barra entra nele com gancho. Se o outro nó é interno, a barra passa o eixo dele por máx(extensão − vão; lb,nec), porque ali ainda está tracionada (18.3.2.3); se isso passa do tramo seguinte, a barra para no fim dele e sai aviso. No balanço, vai até a ponta menos o cobrimento, com gancho. Em apoio extremo com negativo (ligação viga-pilar da 6118), a barra tem gancho dentro do apoio e a ancoragem é conferida.
- **Porta-estribos.** São 2 barras no trecho que o negativo não cobre, com transpasse de 15 cm (DSP linha 322). Em apoio extremo sem negativo, vão até a face externa menos o cobrimento. A bitola depende de h: até 70 cm, 6,3 mm; até 85, 8 mm; até 120, 10 mm; acima, 12,5 mm (DSP linhas 292 a 297, com o piso de 6,3 mm da V1).
- **Balanço sem positivo.** Leva 2 barras inferiores construtivas, da ponta menos o cobrimento até 15 cm além da face do apoio, para montar os estribos.
- **Estribos.** Vão de face a face de apoio; no balanço, da face até a ponta menos o cobrimento. n = ⌈l/s⌉ + 1, com s do dimensionamento. Comprimento = 2 (bw − 2c) + 2 (h − 2c) + ganchos, pelo perímetro externo e sem desconto das curvas. São estribos de 2 ramos, com o aço de `mat.acoEstribo`.
- **Arredondamento.** Trecho reto e cada gancho são arredondados para cima ao cm. As abscissas `xInicio` e `xFim` não são arredondadas.
- **Avisos.**
  - Ancoragem insuficiente em apoio extremo.
  - Barra maior que 12 m, o comprimento comercial citado em F4 item 6. A emenda não é detalhada.
  - Armadura dupla: A's não é detalhada, no positivo do tramo e no negativo do apoio (a maior A's dos dois tramos vizinhos).
  - Negativo que precisa passar além do tramo seguinte.
  - Entrada com número de tramos, dimensionamentos ou larguras inconsistente.

### Diferenças para a V1 (`DcDetalha%`)

A V1 reconstruída simplifica:
- usa o vão teórico sem as larguras dos apoios;
- faz o positivo com L + 2 × 10 φ;
- põe lb reto mais gancho de 10 φ dentro do apoio extremo;
- conta os estribos como INT(L/s) + 1 ao longo do vão teórico;
- não decala o diagrama.

Por isso, na NB-1/78, só os valores de lb, gancho e estribo batem com a V1. Os comprimentos das posições usam a geometria acima.

## Tabela de aço (`tabelaAco`)

- Massa linear = π φ²/4 · 7850 kg/m³ (V1 `DcPesoMetro#`; 6118 8.3.3).
- O agrupamento é por categoria de aço e bitola, com comprimento total em m e massa em kg.
- Os totais incluem a perda. O padrão é 10 %, uma convenção de orçamento e não item de norma; o chamador pode passar outra.
- Itens com quantidade ou comprimento ≤ 0 não entram.

## [VERIFICAR]

1. NB-1/78, τbu = 0,42 fcd^(2/3) e o fator 1,5 de má aderência: o item da NB-1/78 não foi lido. Vêm da V1 reconstruída.
2. NB-1/78, reduções de lb (As,calc/As,ef e gancho): não aplicadas, como na V1. Fica o comprimento maior.
3. NB-1/78, decalagem de 0,75 d: é o padrão do SISTRUT 4.0, e o item da norma não foi lido.
4. NB-1/78, ancoragem no apoio extremo: a regra com que o SISTRUT decide os grampos (DESINIT.BAS:2092-2225; `grampos` em `sistrut/vigas/desinitBarras.ts`): Anec = máx(Vd/(2 fyd); As/3) e exigido = máx(lb·máx(0,33; Anec/As,ef) − 10 φ; 13,5 φ; 6 cm), em que o −10 φ é o gancho (`apoioExtremoNb178`). O aviso sai onde o SISTRUT automático poria grampo. A regra da 6118 com o mínimo de 0,3·lb, usada antes, acusava as V1 da obra do André (φ12,5 em apoio de 19 cm: 19,8 > 17 cm), que o SISTRUT nunca acusou (16,9 ≤ 17,0). A redução da parcela As,mín/3 do original não entra, porque a As calculada já tem o mínimo.
5. Tabela 9.1 sem CA-60 com φ ≥ 20 mm: usa 8 φ.
6. η1 = 1,0 para CA-60: valor de F4 para a edição 2023. `docs/norma/NBR6118-2023.md` ainda marca o item como [VERIFICAR].
13. NB-1/78, τbu = 0,28 fcd^(1/2) da barra lisa: fonte secundária (Fiorin, 1998); o texto da NB-1/78 não foi lido. A mesma fonte põe o CA-60 no grupo ηb ≤ 1 (0,28 fcd^(1/2)); aqui o CA-60 continua com a fórmula da V1 (0,42 fcd^(2/3)), que dá lb menor.

## Testes

Arquivos `src/calculo/detalhamento/*.test.ts`. Os valores esperados vêm de três fontes:
- conta à mão, escrita nos comentários;
- Tabela A-1 de F4, p. 25: C25, CA-50, φ10 = 38/54 e φ16 = 60/86 (boa/má);
- testes da V1 em `T_DESCALC.BAS`: lb φ10 = 52,90 cm; × 1,5 = 79,357 cm; φ16 má = 126,971 cm; estribo 20 × 50 = 130 cm; 2 φ10 × 320 cm = 6,4 m; φ10 = 0,6165 kg/m.

As envoltórias das vigas de teste (biapoiada e 2 tramos com balanço) são escritas pela fórmula fechada e não saem de `analisaVigaContinua`.

## Lajes e pilares

Motor puro em `src/calculo/detalhamento/lajes.ts` e `pilares.ts`, ligado às telas por `src/telas/detalhamento.ts`. A negativa de um bordo comum sai só numa das lajes quando a vizinha cobre o bordo inteiro; com contato parcial, as duas lajes a detalham. As posições têm o formato de `PosicaoArmadura`: `PosicaoLaje` e `PosicaoPilar` trocam só o `tipo` e, na laje, acrescentam `direcao` e `bordo`. Elas também servem de itens para `tabelaAco(det.posicoes)`. Unidades: vãos de laje em m na entrada; comprimentos, cotas e larguras em cm; φ em mm.

| Arquivo | Exporta |
|---|---|
| `lajes.ts` | `RegrasLaje`, `REGRAS_LAJE_6118`, `REGRAS_LAJE_NB178`, `regrasLaje(id)`, `detalharLaje(entrada, regras)`, `PosicaoLaje`, `LajeDetalhamentoEntrada` |
| `pilares.ts` | `RegrasPilar`, `REGRAS_PILAR_6118`, `REGRAS_PILAR_NB178`, `regrasPilar(id)`, `traspasse6118`, `traspasseNb178`, `ALFA_0T_TODAS`, `barrasDesprotegidas`, `detalharPilar(entrada, regras)`, `PosicaoPilar`, `PilarDetalhamentoEntrada` |

A aderência, lb, lb,nec, os ganchos de barra e os ganchos de estribo vêm de `ancoragem.ts`, por meio de `REGRAS_6118` e `REGRAS_NB178` de `vigas.ts`.

### Como integrar

- **`detalharLaje`** recebe a geometria da `LajeEntrada` (lx, ly em m; h; vínculos), o cobrimento, a largura da viga de cada bordo (bordo livre = 0) e a `LajeArmadura` (`barrasX`, `barrasY`, `barrasNegativos`, `asNegativos`). Também recebe as reações características de `LajeEsforcos.reacoes` e o γf.
  - `vaoMenorVizinha[bordo]`: menor vão, em m, da laje do outro lado de cada bordo engastado.
  - `hVizinhaMin[bordo]`: menor espessura, em cm, das lajes do outro lado de cada bordo engastado. `entradasDetalhamentoLajes` a preenche pelos contatos.
  - `negativoNaVizinha`: lista os bordos cuja negativa a laje vizinha já detalhou. Sem ela, a negativa de um bordo comum sai nas duas lajes.
- **`detalharPilar`** recebe os lances da base para o topo. Cada lance traz o pé-direito (piso a piso, cm), a seção b × h, o `PilarResultado` (`barras` e `estribo`) e, se houver, o arranjo por face (`porFaceX` = barras em cada face de comprimento h; `porFaceY` = em cada face de comprimento b; os cantos contam nas duas). O `PilarResultado` não traz o arranjo. Sem ele, o detalhamento usa `arranjoBarras` da V1 sem demanda, que põe a metade maior das intermediárias nas faces mais longas.

### Regras: lajes

Fonte: Bastos, *Lajes de Concreto* (UNESP). As páginas são as impressas.

| Regra | NBR 6118:2023 | NB-1/78 (V1) |
|---|---|---|
| Positivo: quantidade | ⌈l0/s⌉ + 1, com l0 de face a face dos apoios (no bordo livre, até a borda − c) | igual (geometria comum) |
| Positivo: apoio com continuidade (engastado) | 4 cm além do eixo (20.1; Bastos item 3.12.6, p. 36) | 10 φ além do eixo (`LAJEPROC.BAS` `ImprimeLinha`: vão + 2 · 10 φ) |
| Positivo: apoio sem continuidade (apoiado) | até a face externa − c (Bastos p. 62). Ancoragem conferida: As,anc = 1,5 γf R/fyd (19.4.1 com al = 1,5 d; 18.3.2.4 b), lb,ef = b − c ≥ máx(lb,nec; 6 cm) reta; senão gancho de `gancho6118` com lb,ef ≥ máx(lb,nec com gancho; r + 5,5 φ; 6 cm) (18.3.2.4.1). Aviso se não passa, se a ponta fica a menos de 4 cm do eixo ou se o gancho não cabe em h − 2c | 10 φ além do eixo, limitado à face externa − c; sem conferência |
| Positivo: bordo livre | para na borda − c; aviso de armadura de borda livre (20.2) não detalhada | igual |
| Positivo com barra lisa (CA-25) | gancho semicircular em todas as pontas (9.4.2.1 a e 9.4.2.3); no apoio sem continuidade, a ancoragem é conferida como "com gancho" | gancho de 10 φ em todas as pontas |
| Negativa com barra lisa (CA-25) | as pernas de h − 2c não valem como gancho (só o semicircular vale): lb,nec sem α = 0,7 e aviso por bordo | como a V1, sem aviso |
| Negativa sobre bordo engastado | 0,25 x + lb,nec para cada lado do eixo, x = maior dos menores vãos das duas lajes (Bastos item 3.12.5, Eq. 68 e 69, arranjo 1 da Fig. 32, p. 35). Medida a partir do eixo, como em Bastos: x é o vão teórico, o triângulo tem base 2 · 0,25 x centrada no apoio e o exemplo da p. 63 soma 1,5 c1 + ganchos, sem a largura da viga. lb,nec com As,calc/As,ef e α = 0,7 se o gancho tem ≥ 8 φ (9.4.2.3) | 0,25 x + lb (sem redução) |
| Negativa: lado da própria laje | limitada ao vão; com o bordo oposto livre (balanço), até a borda − c | igual |
| Gancho das negativas | h − 2c em cada ponta (Bastos p. 63: "gancho = h − 4 cm" com c = 2). No bordo engastado, h = a menor espessura entre a laje e as vizinhas do bordo, porque a barra entra nelas (também no contato parcial, em que as duas lajes detalham) | h − 2 cm (V1 `ImprimeLinha`), com o mesmo h mínimo |
| Negativa de borda (bordo apoiado com `barrasNegativos`) | da face externa − c até 0,15 do menor vão além da face interna, ganchos h − 2c (19.3.3.2; Bastos p. 33) | a V1 não tem; só sai se a armadura trouxer |
| Distribuição das negativas | máx(20 % de As,neg; 0,9 cm²/m; 0,5 ρmín · 100 h), s ≤ 33 cm (Tabela 19.1 e 20.1; Bastos p. 33-34). Malha por `escolheMalha` | máx(As,neg/5; 0,9 cm²/m), s ≤ 20 cm |
| Distribuição: geometria | paralela ao bordo, de face a face dos apoios vizinhos; ⌈l/s⌉ barras de cada lado, com l = trecho da negativa fora da viga | igual |

### Regras: pilares

Fontes: Bastos, *Ancoragem e emenda de armaduras* (F4) e Bastos, *Pilares* (jun/2024).

| Regra | NBR 6118:2023 | NB-1/78 |
|---|---|---|
| Aderência | barra vertical: boa (9.3.1 a) | boa |
| Traspasse | l0t = α0t lb,nec ≥ máx(0,3 α0t lb; 15 φ; 20 cm), α0t = 2,0 (todas as barras na mesma seção, Tabela 9.4). lb,nec sem gancho e com As,calc/As,ef = 1. Fórmula das tracionadas, a favor da segurança (9.5.2.2.1; F4 Eq. 6 e 7, Tabela 4, p. 19-20) | l0 = ⌈lb⌉, lb de boa aderência da V1 (`DESEDC.BM` `DecEmenda#`) |
| Bitola da emenda | a menor das duas (9.5.2.1: o traspasse é calculado pela barra de menor diâmetro; F4 p. 18) | igual |
| Longitudinais | do piso do lance ao topo + l0; no último lance, até o topo − c, sem gancho | igual |
| Estribos | em toda a altura do lance (18.4.3); ⌈L/s⌉ por lance, + 1 na base do primeiro; comprimento 2 (b − 2c) + 2 (h − 2c) + `ganchosEstribo6118`. O φt e o s vêm do `PilarResultado` e são conferidos com `estriboPilar` (18.4.3); se ficam abaixo dele, sai aviso | igual, com `ganchosEstriboNb178`; sem conferência (a regra de `pilarNb178` não é exportada) |
| Estribo suplementar | o canto protege até 2 barras, sem contar a de canto, a ≤ 20 φt dela, eixo a eixo (18.2.4; Bastos, Pilares, item 15.1, Fig. 156, p. 154). Um grampo por barra desprotegida da face, atravessando a seção: lado − 2c + ganchos de estribo, com o φt e o s do estribo | mesma regra |

### Diferenças para a V1 (`LAJEPROC.BAS`)

- A V1 conta INT(L/s) + 1 sobre o vão teórico; aqui a quantidade é ⌈l0/s⌉ + 1 sobre o vão livre.
- A V1 faz a negativa com 0,25 do menor vão da própria laje para cada lado, sem lb. Aqui vale o critério da NB-1/78 citado por Bastos: 0,25 x + lb, com x da maior das duas lajes.
- A V1 não detalha a distribuição das negativas nem os pilares.

### [VERIFICAR] de lajes e pilares

7. NB-1/78, ancoragem do positivo da laje no apoio: não é conferida, como na V1.
8. NB-1/78, negativa da laje com + lb: vem do critério citado por Bastos. A V1 usa só 0,25 lmenor da própria laje.
9. NB-1/78, distribuição das negativas: usa a regra da distribuição de laje armada numa direção (V1 `LAJCALC.BM`), com s ≤ 20 cm.
10. NB-1/78, traspasse de pilar = lb: é a emenda do editor de vigas da V1. O item da NB-1/78 não foi lido.
11. NB-1/78, regra dos 20 φt: aplicada como na 6118 18.2.4. O item da NB-1/78 não foi lido.
12. 6118, traspasse de pilar pela fórmula das barras tracionadas (α0t = 2,0) e com As,calc/As,ef = 1: a favor da segurança. Para barras sempre comprimidas, 9.5.2.3 permite l0c = lb,nec ≥ máx(0,6 lb; 15 φ; 20 cm).

### Testes

Arquivos `lajes.test.ts` e `pilares.test.ts`. Os esperados vêm de conta à mão, escrita nos comentários, e de duas conferências publicadas:
- Bastos, Lajes, p. 63: c1 = 0,25 · 586 + 21 = 167,5 cm. O lb com gancho de φ8 em C25 é 21 cm (0,7 · 30,13).
- Barra lisa: lb de φ10 CA-25 em C15 = 59,30 cm na NB-1/78 (Fiorin) e 59,57 cm na 6118, conta à mão em `ancoragem.test.ts`; ganchos nas pontas tracionadas em `vigas.test.ts` e `lajes.test.ts`.
- Bastos, Pilares, p. 154 (pilar P8, 15 × 50, 10 φ12,5 por face, φt 5 mm): 20 φt = 10 cm, eixo a eixo 4,5 cm, e 4 barras por face precisam de grampo.

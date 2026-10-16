# Modo de cálculo: "Como o SISTRUT original" e "Corrigido"

Pela NB-1/78 a V2 calcula pelo método do SISTRUT 4.0, portado do original em `src/calculo/sistrut/`. A obra escolhe o modo em `Obra.modoCalculo`:

- **`"original"`** ("Como o SISTRUT original"): reproduz o SISTRUT número a número, inclusive os defeitos. Calcula nas unidades do original (t, m, cm, t/cm², t·m), arredonda para Float32 a cada atribuição, como o QuickBASIC 4.5, e usa os parâmetros "SISTRUT" de fábrica (`sistrut/base/parametros.ts`). Converte para SI só na saída.
- **`"corrigido"`** (padrão; um arquivo sem o campo também é lido assim): roda os mesmos algoritmos, em float64, com materiais SI (aço de 500 MPa, concreto de 25 kN/m³) e os cobrimentos da obra, e troca só os defeitos da lista abaixo.

A NBR 6118:2023 não tem modo: ela usa o fluxo próprio da V2 (`calculo/fluxo.ts`, `Norma.caminho = "v2"`), e o campo é ignorado.

Referências: `<EXE>.BAS:<linha>` é a V1 nova, retradução fiel do original (`_Arquivo/Sistrust/dist/src-original/<família>/`), conferida byte a byte contra o original no DOSBox-X (o oráculo, `C:/tmp/oraculo/`). `R1`..`R12` e `D-n` são os defeitos do PLANO da paridade (`C:/tmp/v2-paridade/PLANO.md` 4.2) e dos relatórios das tarefas (`C:/tmp/v2-paridade/T7-CONTRATOS.md`).

## API

- `calcularObra(obra, norma)` (`calculo/fluxo.ts`). Com a NB-1/78 (`normas/index.ts`, `nb178.caminho = "sistrut"`), chama `calcularObraPeloSistrut` (`calculo/fluxoSistrut.ts`) no modo `obra.modoCalculo`. O `ResultadoObra` sai em SI, no formato de sempre (lajes, montagem, vigas, pilares), para a interface, o relatório e o detalhamento.
- `ResultadoObra.sistrut` (`ResultadoSistrut`, `calculo/sistrut/obra.ts`) guarda tudo o que o original imprime, nas unidades dele e sem conversão. É isso que o comparador lê; ver "Formato de `resultado.sistrut`".
- `calcularObraSistrut(obra, { modo })` (`calculo/sistrut/obra.ts`) faz o mesmo cálculo sem a projeção em SI.
- `calcularQuantitativos(obra, resultado)` (`calculo/quantitativos.ts`) devolve os quantitativos, com a fonte de cada número em `Quantitativos.fonte`.

### Como montar uma obra que reproduz um caso do original

Uma obra da V2 vira a entrada do original assim (`sistrut/obra.ts`):

| Obra da V2 | Original |
|---|---|
| `materiais.fck` (MPa) | fck nominal = fck/100 t/cm². Os 15 MPa do padrão viram 0,15 t/cm², o que o usuário do original digitava para 150 kgf/cm². No corrigido, a conversão exata: fck/98,0665. |
| `materiais.aco` | CA-25/50/60 = 2,5/5/6 t/cm² no original; 250/500/600 MPa convertidos no corrigido. |
| `materiais.classeAco` | classe do aço (o padrão do .LAP é B; o da V2 é A). O CA-25 é sempre A. |
| cobrimentos | Original: os do SISTRUT (.LAP 1,5 + 0,5; .DSP 2,0 + 2,0; .PIP 2,0) e os da obra não entram. Corrigido: os da obra. |
| laje retangular | polígono horário a partir do canto inferior esquerdo; os cantos das vizinhas que caem num bordo viram vértices, como o usuário do LAJEGEOM compartilharia; os vértices são numerados pela coordenada. |
| `laje.revestimento` (kN/m²) | carga permanente, kN/m² ÷ 9,80665 = t/m². |
| `laje.sobrecarga` (kN/m²) | carga de ocupação no polígono da laje, com total = parcela acidental. |
| `laje.h` | imposição de H (LAJECALC 4); o peso próprio é H·densidade/100. |
| `laje.mu` | 1 (o padrão da V2) = não informado: μ pela relação das cordas (LAJECALC 2) na maciça, e o μ 0 que o LAJECALC 2 deixa na laje comum não calculada; outro valor = μ informado (<R>elação). Para reproduzir um .LAJ com μ gravado, informe o μ (ex.: 0,8). Não dá para impor exatamente μ = 1 (o importador avisa). Na pré-moldada não entra. |
| `laje.poligono` (opcional) | polígono horário da laje (lado k = vértice k → k+1). O LAJEGEOM só grava o horário: descarta o polígono com Σ(x_k + x_k+1)(y_k − y_k+1)/2 ≤ 0 (LAJEGEOM.BAS:3107-3113). Vai ao LAJECALC como está, sem acrescentar os cantos das vizinhas, e a ordem numera os lados (o R2 depende dela; a soma das cargas por região também, em SINGLE: o v2par_laje_umadir dá total 27,675001 pelo polígono gravado e 27,674999 pelo retângulo da V2). x, y, lx e ly são o retângulo envolvente, que o arquivo recalcula ao abrir e ao salvar; a tela e o fluxo da NBR 6118 usam esse retângulo. Ausente = o retângulo. |
| `laje.vinculosLados` (opcional) | vínculo forçado por lado do polígono (livre → 1, apoiado → 0, engastado → 22, como em `laje.vinculos`, que a laje com polígono não usa); null = pela vizinhança. Engastado num lado sem vizinha = "trecho engastado" (continuidade com laje B −1). |
| `laje.anguloArmadura` (opcional) | ângulo da armadura principal, graus (LAJECALC 2, A_1210(·,0)); ausente = 0 na maciça e −1 na comum não calculada (o que o LAJECALC 2 grava sem <D>ireção, LAJECALC.BAS:4548). Na pré-moldada, a inclinação das nervuras (A_10cc(·,5), LAJEGEOM.BAS:3532), que a montagem usa; ausente = 0. |
| `laje.tipo` (opcional) | `"macica"` (0, o padrão); `"pre-moldada"` (1): o LAJECALC não calcula nem impõe H, a montagem leva a carga às vigas na direção das nervuras, sem peso próprio da laje (o peso dela está na permanente, LAJEGEOM.BAS:3383-3386); `"comum-nao-calculada"` (3): o LAJECALC calcula e o LAJEPROC não arma. A nenhuma das duas o original liga continuidade (a automática só liga maciças e o assistente do LAJECALC 1 recusa as outras, LAJECALC.BAS:3695, 3912): engaste forçado nelas é ignorado com aviso. |
| `laje.armaduraImposta` (opcional) | positivas impostas no LAJEPROC (bitola, mm; espaçamento, cm), o A_12fc(i,2..3) negativo: o LAJEPROC as mantém se bastam (LAJEPROC.BAS:451-456). |
| `laje.negativasImpostas` (opcional) | negativa imposta no LAJECALC na continuidade de cada lado do polígono (A_11e0(c,4) positivo, CINT(1000·índice da bitola + espaçamento), LAJECALC.BAS:4166): a otimização reduz o i até ela bastar e o LAJEPROC só a confere. O código negativo que o LAJEPROC grava ali é a escolha automática dele, refeita a cada rodada (LAJEPROC.BAS:892): não é entrada. |
| `pavimento.trechosPilares` (opcional) | trecho do pilar-parede no LAJEGEOM (A_1156: x1, y1, x2, y2), pelo id do pilar. A montagem recebe então os pilares do LAJEGEOM (`geometriaPilares`): o bordo de laje sobre o pilar-parede e a alvenaria sobre ele vão ao pilar, como no original. Sem trechos, a montagem usa os pilares dos eixos, como antes. |
| `pavimento.cargasOcupacao` (opcional) | cargas de ocupação por área do LAJEGEOM 3 (A_1014), com polígono próprio (em qualquer sentido), total e parcela acidental em kN/m². Vão ao painel depois das sobrecargas das lajes. Na entrada da tela, as áreas que contêm o centroide da laje somam a parte permanente (total − acidental) ao g e a acidental ao q; a flecha do corrigido usa esse q. O LAJECALC e o LAJEMONT usam os polígonos exatos. |
| `pavimento.alvenarias` (opcional) | alvenarias do LAJEGEOM 3 em qualquer posição, kN/m: sobre uma viga vão para ela; sobre a laje entram na carga dela (LAJECALC) e a montagem as distribui pela posição. Vão ao painel depois das cargas lineares das vigas. |
| `obra.parametrosLaje` (opcional) | parâmetros do .LAP (LAJE 7 e LAJECALC 7) que a obra edita (`ParametrosLajeObra`, tipo próprio do domínio), nas unidades do .LAP e com os nomes de `PARAMETROS_LAJE` (`sistrut/base/parametros.ts`; o adaptador é `aplicaParametrosLaje` em `sistrut/obra.ts`): ex. `{ relacaoNegPosMin: 0.35 }` (v2par_laje_r3), `{ gamaF: 1.5, eficienciaNegativa: 0.9 }` (retrad_laje_param). As tabelas indexadas têm o tamanho da de fábrica (10 bitolas, 15 linhas de μ, 4 de espaçamento mínimo, 6 de bitola por H). Valem nos dois modos; no original, em SINGLE. γf, γc e γs do .LAP valem só nas lajes: vigas e pilares recebem os γ de fábrica de `PARAMETROS_LAJE` (1,4/1,4/1,15, os mesmos do .DSP e do .PIP de fábrica), também quando a obra edita os do .LAP. fck, fyk e a classe do aço vêm de `materiais`; o cobrimento e a densidade, do modo (original: os do .LAP de fábrica; corrigido: os da obra e 25 kN/m³), e não são editáveis aqui. Ausente = o .LAP de fábrica. |
| `laje.vinculos` | livre → código 1, apoiado → 0, engastado → 22. Sem vínculo forçado vale a continuidade automática (lado com os mesmos dois vértices → 22). |
| vigas | nós e apoios pela regra da V2 (`geometriaDasVigas`): pilar sobre o eixo; num cruzamento sem pilar, a viga que termina se apoia na que passa; quando as duas terminam ali, a que ficaria sem 2 apoios se apoia na outra (é o "Vx apoia em Vy" do LAJEMONT). O eixo vai em ordem crescente. Essa última regra também vale no fluxo da V2 (NBR 6118): antes, a viga sobre as pontas de dois balanços ficava sem cálculo e a carga dela não chegava aos pilares. |
| `viga.pesoProprio` (kN/m, opcional) | o peso digitado no LAJEGEOM, gravado em kg/m inteiro (CINT). Ausente: bw·h·densidade. O mais comum é o predominante, os outros viram exceções. |
| `viga.cargaLinear` | alvenaria sobre o eixo da viga. |
| nomes de pilares e vigas | o .VIG grava J = 1 + (número do pilar)/100000 e um bit muda o x impresso. Para bater no último dígito, use os nomes e números do original. |
| pilares | uma coluna por posição, da fundação (cota 0) até o último pavimento em que o pilar existe; o .REP de cada pavimento (e de cada repetição) vai para o seu nível; vínculo "continuidade" em todos os níveis. |
| `obra.otimizaNegativos` (opcional) | roda a otimização dos negativos (LAJECALC 6). Ausente = roda. No original é um passo que o usuário escolhe: use `false` para casos rodados sem ele (ex.: v2par_laje_r2). |

Exemplos prontos: `sistrut/__e2e__/obraE2E.ts` (casos a, b e c) e `sistrut/__e2e__/obraVBX.ts` (v2par_viga_fluxo). Para uma obra que o original gravou, use o importador abaixo.

### Importador de obra do SISTRUT (.LAJ)

`importarLaj(texto, opcoes)` (`armazenamento/sistrut/laje.ts`) lê o .LAJ do original (o arquivo texto com cabeçalho que o LAJEGRAV grava depois do LAJEGEOM, do LAJECALC e do LAJEMONT; formato em LAJEGRAV.BAS:484-626, leitor `sistrut/montagem/obraLaj.ts`) e devolve `{ ok, obra, avisos }`: uma obra da V2 com um pavimento, no modo original, já validada pelo leitor do arquivo da V2.

- Lajes: o polígono na ordem gravada (`laje.poligono`), o tipo, a carga permanente, o H gravado (A_12fc; sem ele, o H mínimo A_12ca), e o ângulo e o μ do POLÍGONO (A_1210(A_10cc(i,0)), não a linha da laje). Na pré-moldada, a coluna 5 do A_10cc é a inclinação das nervuras (vira `anguloArmadura`) e o peso próprio é 0; o −1 que o LAJECALC 2 grava como ângulo das lajes não maciças não entra. As positivas impostas no LAJEPROC (A_12fc(i,2..3) negativos) vão para `laje.armaduraImposta`. Os nomes são os do original (prefixo + nível + ordem, sem os vazios do tipo 2).
- Vínculos: o .LAJ grava os códigos finais (depois da otimização), e a V2 roda o LAJECALC de novo. Por isso o importador grava só o que o usuário escolheu: lado com código 1 = livre; trecho engastado sem vizinha (A_11e0 com laje B −1) = engastado; lado que a continuidade automática da V2 ligaria e que o original não ligou = apoiado (com a seção de continuidades: ficou sem continuidade; sem ela: as lajes são de grupos diferentes, LAJECALC.BAS:3709); continuidade entre duas lajes = sem vínculo forçado (a automática a refaz com 22 e a otimização chega ao mesmo código). A negativa imposta no LAJECALC (A_11e0(c,4) positivo) vai para `laje.negativasImpostas` do lado A.
- Cargas de ocupação (A_1014) e alvenarias (A_0fe6) vão para `pavimento.cargasOcupacao` e `pavimento.alvenarias`, em kN/m² e kN/m.
- Vigas: uma por eixo do .LAJ, de ponta a ponta (eixo que não é reto horizontal ou vertical vira aviso e fica de fora). Pilares nas posições gravadas; o pilar-parede (x2, y2 ≠ x1, y1) fica no centro do trecho com o comprimento dele na seção e o trecho em `pavimento.trechosPilares`.
- Avisos do que a obra não representa: tipo de laje desconhecido (lido como maciça); μ = 1 digitado (numa maciça cujas cordas dão outro μ, ou num tipo 3); código de continuidade ≠ 22 sem a otimização (i digitado no LAJECALC 1); continuidade que a automática não acha; dois trechos engastados sem vizinha num lado comum; engaste em laje não maciça; pilar-parede (os apoios das vigas sobre ele seguem a regra da V2); cruzamento de vigas sem pilar (a escolha "Vx apoia em Vy" do LAJEMONT não fica no .LAJ; vale a regra da V2); eixo decrescente ou não reto; barra imposta fora das tabelas do .LAP.
- O que o .LAJ não tem vem de `opcoes`: `materiais` (padrão: fck 15 MPa, CA-50 classe B, cobrimentos 1,5/2/2), `parametrosLaje`, `otimizaNegativos` (se a opção 6 rodou; ausente = rodou), `secaoVigas` (padrão 12 × 50, os 150 kg/m do padrão do LAJEMONT), `vigas` (seção e peso próprio por nome), `secaoPilares` (20 × 20) e `peDireito` (3 m).

O teste `armazenamento/sistrut/laje.test.ts` importa o .LAJ que o original gravou em cada run e confere pelo motor todos os números impressos (tabela em "Casos de referência"). Os .LAJ e os JSONs dos casos v2par de laje estão versionados em `sistrut/__oraculo__/__laj__/`, e o teste não depende de `C:/tmp`.

### Flecha do corrigido em laje com polígono

A flecha (R1) é a da placa retangular: com polígono, os vãos são a maior corda horizontal e a maior vertical (9 retas que dividem a faixa em 10, a regra das cordas do LAJECALC 2; `maiorCorda` e `LajeDoPainel.vaosFlecha` em `sistrut/obra.ts`), com os vínculos por bordo da V2. Na laje em L 6 × 5 dá 6 × 5. É aproximação: não há fórmula de flecha para a placa poligonal.

### Formato de `resultado.sistrut`

`ResultadoSistrut` (tipos em `sistrut/base/tipos.ts` e `sistrut/obra.ts`), tudo nas unidades do original:

- `modo`, `materiais` (fck, fyk em t/cm², classe, γ) e `parametros` (`laje`, `dsp`, `viga`, `pilar`, `pip`): as tabelas usadas.
- `pavimentos[]` (`PavimentoSistrut`), um por pavimento da obra (`pavimentoId`):
  - `lajesDoPainel`: id da laje na V2, bordo da V2 de cada lado do original (num lado inclinado, o da normal externa mais próxima), as cargas de ocupação sobre a laje (`ocupacao`, kN/m²) e os vãos da flecha (`vaosFlecha`). `painel`: a entrada do LAJECALC (lajes com códigos, vértices, μ; cargas por área; alvenarias; continuidades).
  - `espessuras[laje]`: espessura mínima (LAJECALC 3): H, x/d, barra, peso próprio, q; e a flecha no corrigido.
  - `esforcosAntesOtimizacao` e `esforcos` (`EsforcosLajes`): momentos por laje (`mPositivoPrincipalTcm` e os outros M em t·cm/m, q, peso próprio, coeficiente de carga e os termos dele, fatores por bordo), lajes com os códigos finais e as continuidades.
  - `armadurasAntesOtimizacao[laje]` e `armaduras[laje]`: As+ e As− da opção 5, x/d e a barra da seção de maior x.
  - `lajeproc`: barras do LAJEPROC, as positivas por laje e uma negativa por continuidade.
  - `eixos`, `geometriaVigas`, `idVigas`: o que o LAJEMONT recebeu.
  - `montagem` (`MontagemPavimentoSistrut`): reações por bordo (área, Área, Estru, Peso, linear e acidental, em t/m), os totais do relatório (inclusive os nominais) e o .VIG de cada viga (`vigas[]`, com o registro de 855 bytes e o quadro de alvenarias).
  - `vigasVig`: o .VIG com as cargas indexadas já resolvidas pelo VIGA.
  - `analises[]` (`AnaliseVigaSistrut`): apoios (M, R, Rmax, Rmin, Mmax), tramos (Ve, x, M+, Vd, f·EJ e envoltória), balanços, MEP, momentos levados aos pilares e a tabela de engastamento perfeito. `naoProcessadas`: as vigas que o VIGA não processou.
  - `rep[]`: as linhas do .REP (total, parcelas com o texto truncado, momentos com o texto).
  - `vigas[]` (`VigaSistrut`): `entrada` do DESDIM (o .VIG, as seções e o .FOR); `dimensionamento` (DESDIM: por apoio e por tramo, x/d, Mk, As, As′, arranjo, Vk, Asw, estribos dos dois lados, flecha, fissuração e os esforços do DESCALC); `detalhamento` (DESINIT: posições com quantidade, bitola, comprimento, início e fim, dobras, e os trechos de estribo); `quadro` (.TAB: volume e fôrma em centésimos, comprimento e peso por bitola, taxa).
  - `avisos` e `memoria`.
  - `otimizacaoParada` (`OtimizacaoParada`, só no original): onde a otimização dos negativos entra em laço sem fim (R3), a tela parada: laje, lado, relação que o laço tenta gravar, código e os lados com M−, As e Mneg/Mpos. O pavimento leva o aviso "não converge" e os esforços de antes da otimização (v2par_laje_r3).
- `colunas[]`: as colunas do PILGEEDI (níveis, cotas, seções e vínculos). `lances[]`: um por coluna e nível, com `pavimentoId`, `repeticao`, `pilarId` e `carga` (Nk, Mk do caso "e", da flambagem e da base, peso próprio, le). Cada lance traz o `dimensionamento` do PILAREDI: λ, casos 1e/1f/2e/2f (Mk atuante, MR de 1ª e 2ª ordem, ângulo da LN, 1/r, x/d, deformações, veredito), As, taxa, barras, estribo e recusa.
- `quadros[]` e `resumoVigas`: quadros das vigas e resumo do DESENHO (item 4).
- `avisos` e `falhas[]` (`{ pavimentoId, texto }`): carga que não chega à fundação (pilar que não continua até a fundação, linha do .REP sem coluna). A projeção as põe em `ResultadoPavimento.falhas`, com as lajes sem cálculo, as vigas não processadas e os bordos de laje sem viga.

Na projeção em SI, `PilarResultado.mkX/mkY` é o Mk característico (o "Mx/My" impresso pelo PILAR/PILAREDI) e `mdX/mdY` vale γf × Mk. Com μ > 1, o M+ principal (sem redução) está em y: a projeção põe `my` e a armadura principal do LAJEPROC em y. Bitolas e espaçamentos saem nominais (6,3, não 6,3000002), e `BarrasNaAlma.grupos` traz os dois grupos do arranjo de viga do .DSP.

## Defeitos do original corrigidos no modo corrigido

Cada linha diz o que o original faz (e o modo original reproduz) e o que o corrigido faz. Todo item tem teste com conta à mão ou com o número do oráculo na família.

| # | Família | Original (defeito) | Corrigido | Fonte e teoria | Código |
|---|---|---|---|---|---|
| R1 | laje | Flecha nunca verificada: o .LAP declara L/f 300/500 e deformação lenta, mas nenhum módulo usa; H mínimo só por flexão; coluna L/f sempre 0 | A espessura mínima procura também a flecha (vão/300 total e vão/500 acidental) e o H da obra gera aviso se a flecha passar do limite | LAJE.BAS:1374-1387; LAJECALC.BAS:752, 781. limites de flecha da NB-1/78 [VERIFICAR o item] | `lajes/espessura.ts`, `fluxoSistrut.ts` |
| R2 | laje | LAJEPROC não refaz o vizinho quando o lado dele tem o mesmo número do lado atual: a negativa da continuidade pode sair só com a As da própria laje | Refaz sempre o vizinho: a negativa é a maior dos dois lados | LAJEPROC.BAS:836, 855 (`V_16a8 <> V_0efc`). A armadura de continuidade cobre o maior momento dos dois lados | `lajes/proc.ts:132` |
| R3 | laje | A otimização dos negativos reduz o coeficiente com 2 casas e grava o código com 1 (CINT(coef·10 + 2)): o mesmo bordo se repete sem fim | Grava 2 + 10·coef sem CINT (aceita código fracionário) e converge. No original, onde ele travaria, o motor para com `ErroNaoConverge` e avisa | LAJECALC.BAS:2113, 2123, 2145 | `lajes/otimizacao.ts` |
| M-a | montagem | Num nó sem saída do traçado da região do bordo, a região vale 0 e a carga dela some | O recuo continua o traçado e a carga chega à viga (equilíbrio) | LAJEMONT.BAS:2970-2973 (L_224c8) | `montagem/regioes.ts:133` |
| M-b | montagem | Eixo de viga em ordem decrescente: os pontos são inseridos supondo ordem crescente e saem embaralhados (com aviso) | Insere ao longo do eixo | LAJEMONT.BAS:4752-4814 | `montagem/vigas.ts:205` |
| R5 | viga | Parcela de reação no .REP truncada INT(R·100)/100 (até 0,01 t por viga e apoio, sempre a menos) | Soma sem truncar e arredonda o total | VIGA.BAS:2412-2420. Equilíbrio: o pilar recebe a reação inteira | `vigas/rep.ts` |
| V-a | viga | Reação indexada (viga sobre viga) truncada INT(R·1000)/1000 | A reação inteira | VIGA.BAS:1697-1706. Equilíbrio, como no R5 | `vigas/vicalc.ts:860` |
| R6 | viga | Redução dos negativos lida do INI sem piso (MIN(v, 15)) e % de acidental gerada sem validação | Limita a 0,15..1 e a 4..96 % | VIGA.BAS:612, ≈5434 (U62-025). Só muda número com INI editado à mão | `vigas/vicalc.ts:148, 158` |
| H | DESDIM | As,mín de viga 0,0015·bw·hw (.DSP) para qualquer aço | 0,25 % com CA-25 (fyk < 3 t/cm²), 0,15 % nos outros | DESENHO.BAS:4820; DESDIM.BAS:2849, 2958. NB-1/78 segundo Silva e Araújo, Revista Essentia 16 (2015): 0,25 % para CA-25 e CA-30 [VERIFICAR o texto da norma] | `vigas/desdim-flexao.ts:161` |
| R8 | DESDIM | σs no trecho elástico dividido por γs (salto em εyd) | σs = Es·εs até fyd | DESDIM 0x18c00 (U03-045). Lei de Hooke no trecho elástico do diagrama do aço [VERIFICAR o item da NB-1/78] | `vigas/desdim-flexao.ts:55` |
| R9 | DESDIM | Área 0,00 do φ32 na tabela do .DSP | 8,04 cm² (π·3,2²/4). O φ4 continua com área 0, a convenção do original para desativar a bitola; com área, o estribo sairia de 4 mm, abaixo do mínimo de 5 mm (`ESTRIBO_PHI_MIN`) | DESDIM.BAS:4934; DESENHO.BAS:4790-4819 (U04-005) | `base/parametros.ts`, `vigas/desdim-barras.ts`, `vigas/desinitDescalc.ts` |
| D-ψ | DESDIM | ρ do ψ = 0,225 + 15ρ sempre no piso 0,001: a As (coluna 5 de A_128e) só é gravada pelo DESAUXDI depois do dimensionamento | ρ = As/(3·bw·h) com a As de flexão do tramo (no balanço, a do apoio) | DESDIM.BAS:5004 (T4a). NB-1/78: τc = ψ·√fck cresce com a taxa da armadura longitudinal de tração (U03-026) | `vigas/desdim.ts` (`asRhoDo`) |
| R11 | DESINIT | Salto errado no ramo "barra longa demais" | Segue o laço | DESINIT 0x46d2b (U18-015) | `vigas/desinitBarras.ts:1041` |
| D-1 | pilar | Fluência com e^(X−1) | e^X − 1 | PILAR.BAS:4818-4821. excentricidade de fluência ec = (eg + ea)·(e^(φ·Ng/(Ne − Ng)) − 1) [VERIFICAR o item da NB-1/78] | `pilares/esforcos.ts:112` |
| D-3 | pilar | Nk = 0 divide por zero na busca do equilíbrio | Testa com max(\|Nk\|, 1) | PILAR.BAS:5078, 5147; PILAREDI.BAS:5105 | `pilares/elu.ts:65, 313`, `pilares/armadura.ts:503` |
| D-6 | pilar | Seção poligonal anti-horária dá área negativa | Inverte o sentido | PILAR/PILAREDI (área pela fórmula dos trapézios) | `pilares/secao.ts:496`, `pilares/armadura.ts:91` |
| D-7 | pilar | "ok" com > estrito: MR igual ao atuante não atende | ≥ | PILAR.BAS:5534. A NB-1/78 aceita resistente = solicitante | `pilares/elu.ts:458` |
| D-8 | pilar | Redução de sobrecarga aplicada também sobre o peso próprio | Só sobre a carga das vigas | PILAREDI.BAS:6602-6615, 978-987. A redução de cargas acidentais em pilares (NBR 6120) não incide sobre o peso próprio [VERIFICAR o item] | `pilares/carga.ts:454` |
| D-17 | pilar | Ajuste do ângulo da linha neutra pode entrar em laço | Bissecção | PILAR.BAS:5286, 5315 | `pilares/elu.ts:231` |
| P-a | pilar | Momento da viga levado do .REP ao pilar com inclinação 0 (todo momento na direção x) e rigidez de viga 0 (o pilar leva 100 % do MEP): são os padrões do PILGEEDI até o usuário editar | Inclinação pela direção da viga (0° ou 90°) e rigidez bw·h³/12, que a fórmula do PILAREDI já usa para repartir o MEP entre a viga e os lances | PILGEEDI.BAS:597-640; PILAREDI.BAS:7470-7520 | `sistrut/obra.ts` (`.REP` do corrigido), `pilares/carga.ts` |

D-2 (laço sem fim no PILAREDI) para nos dois modos com `ErroNaoConverge`, porque o original não termina. D-4 (λ = 80 exato) e D-9 não são corrigidos.

### Outras diferenças do corrigido (não são defeito)

- **Precisão:** float64 no lugar do Float32 por atribuição. Onde o float64 erra o piso de um número que o SINGLE acerta, o `INT` leva folga de 1e-9 relativa (`vigas/desinitComum.ts:412`, `quant/vigas.ts:19`; 4 − 2,2 = 1,7999… daria 189 cm em vez de 190). Exceção nomeada: a razão das cordas 1,8/6 vale 0,29999999 em SINGLE, μ 0,5 no original, e 0,3 em float64, μ 0,4 no corrigido (teste da T1).
- **Materiais:** aço de 500 MPa (5,0986 t/cm²) no lugar de 5 t/cm²; concreto de 25 kN/m³ (2,5493 t/m³) no lugar de 2,5 t/m³; fck convertido exato.
- **Cobrimentos:** os da obra no lugar dos do .LAP/.DSP/.PIP.
- **Quantitativos de viga:** volume e fôrma pelos eixos e abaixo da laje, a regra da V2. O DESINIT usa vão livre e altura inteira e conta de novo a faixa da laje que a laje já conta. O aço é o do DESINIT nos dois modos.

### Defeitos reproduzidos nos dois modos

- LAJEPROC: uma seção negativa que não passa herda o As da posição anterior (`lajes/proc.ts`).
- Lado que coincide só em parte com o da vizinha não vira continuidade (D10 do livro). Entre duas lajes da V2 isso não acontece, porque os cantos das vizinhas viram vértices.
- Laje comum não calculada sem <R>elação: o LAJECALC 2 não lhe dá μ (fica 0) e o preparo divide por √μ (LAJECALC.BAS:7239): o QuickBASIC para com "Division by zero" e o ON ERROR volta ao menu (LAJECALC.BAS:169-174). A V2 reproduz nos dois modos: a laje fica sem momentos, com aviso, e a montagem a carrega. No original a opção 5 "todas" também para ali e as lajes seguintes ficam sem cálculo nessa rodada; a V2 calcula as outras.
- Bordo de laje sem viga embaixo: o LAJEMONT soma a reação no "total dos pilares" e não a leva a pilar nenhum (sai em branco no .REP). A V2 reproduz e marca a falha no pavimento: essa carga não chega aos pilares.
- Potência do BRUN45 (`X^2` por logaritmo): com M = 0 dá x > 0 e As mínima. Hoje é aproximado por `X * 2 ** -64` (`lajes/flexao.ts:62`), conferido num ponto só (H 10). O algoritmo do `^` está sendo determinado e vai para `base/f32.ts` como função única.

## O que não existe no SISTRUT

Isto é calculado pela V2 nos dois modos e marcado como tal:

- **Quantitativos de laje e de pilar:** volume, fôrma e aço. O SISTRUT não calcula nenhum deles. `Quantitativos.fonte` diz "v2" e a memória tem a marca "não existe no SISTRUT". O aço da laje em balanço segue a regra D da V2 (`quantitativos.ts`, `comprimentoNegativa`).
- **Flecha das lajes no modo original:** sai 0, porque o original não calcula.
- **Parcela permanente das reações** (`reacaoG`): o VICALC é refeito só com as cargas permanentes do .VIG.
- **Diagrama de momentos por pontos:** a estática de cada tramo com o M e o V da análise.
- **Nd e Md dos pilares:** γf × as ações características do PILAREDI.
- **Detalhamento da tela** (`telas/detalhamento.ts`): de lajes, vigas e pilares, pelas regras da V2 sobre os esforços projetados. O detalhamento do DESINIT está em `resultado.sistrut.pavimentos[].vigas[].detalhamento` e alimenta os quantitativos de viga, mas a tela ainda não o mostra.

## O que saiu: itens B a H antigos

Os itens B a H deste documento foram feitos contra a V1 antiga, a reconstrução anterior a V1 nova (PLANO 4.1):

- **B** (armadura longitudinal no τc, `VcAsLong#`): não é regra do SISTRUT. O DESDIM usa ψ = 0,225 + 15ρ. A regra fica só no fluxo da V2 (NBR 6118).
- **C** (apoio "-" do .VIG da V1 antiga vira ponta livre): fica, no importador da V1 antiga (`importarV1.ts`).
- **D** (aço da laje em balanço): fica, como regra da V2.
- **E** (negativa contada duas vezes), **F** (volume de "tela" e "relatório") e **G** (fôrma de "tela" e "relatório"): **saíram**. Reproduziam código inventado da V1 antiga (`ImprimeLinha`, `FORMCALC.BM`). O FORMEDCA e o FORMIMP do SISTRUT não calculam volume nem fôrma, e o LAJEPROC não calcula peso.
- **H**: virou correção do DESDIM (tabela acima), com a referência do .DSP.

## O que ficou sem verificação no oráculo

- **Modo corrigido:** não há número de referência para ele. Cada correção tem teste com conta à mão na família, e o corrigido roda a obra E2E sem aviso.
- **Pilares com momento de viga** (MEP do .REP), pelo motor: o caso c só tem o P5, sem momento. Os casos v2par_pilar_* foram conferidos na família (T5), não pela obra.
- **Vários pavimentos e pavimento-tipo contra o original:** só a acumulação da família foi conferida (v2par_pilar_niveis, T5). Pelo motor, só os testes genéricos.
- **DESDIM/DESINIT das vigas da E2E:** o oráculo não detalhou essas vigas. A regra foi conferida na viga do retrad_des_det e nos v2par_des_*, e o volume e a fôrma da E2E saem de conta à mão (2,79 m³ e 46,34 m², `modoCalculo.test.ts`).
- **Campos de laje sem caso no oráculo:** polígono que não é retângulo, pré-moldada, laje comum não calculada, pilar-parede, armaduras impostas e ângulo na montagem (todos os runs são retângulos maciços; o ângulo 90° do LAJECALC tem o retrad_laje_calc2). Têm teste com conta à mão (`sistrut/obra.lajes.test.ts` e as variantes do E2E.LAJ em `armazenamento/sistrut/laje.test.ts`): equilíbrio e triângulos de 45° da laje em L, faixa de uma direção da pré-moldada a 0° e a 90°, fatores de direção do tipo 3 a −1°, triângulo de 4 m² no pilar-parede, positiva imposta que basta e negativa imposta que faz a otimização reduzir o i. A divisão por zero do tipo 3 sem μ vem da leitura do LAJECALC.BAS:7239 e do ON ERROR, não de um run.
- **Detalhamento da tela:** é pelas regras da V2, não pelo DESINIT.
- **e2e do Playwright** (`e2e/modo-calculo.spec.ts`): o texto foi ajustado, mas o teste não foi rodado.

## O que o modelo da obra ainda não representa

Estes recursos do original não têm campo na obra da V2, então os casos que dependem deles não são reproduzíveis:

- lajes: coeficiente i digitado trecho a trecho no LAJECALC 1 (a obra só tem engastado = 22, apoiado e livre; o código menor sai só da otimização); grupo da laje (A_10cc(·,3)) como campo (a V2 deixa 0 em todas; o importador traduz grupos diferentes em lados apoiados); dois trechos engastados sem vizinha num lado comum a duas lajes (viram continuidade); continuidade entre lados que só coincidem em parte; μ informado igual a 1; a parada da opção 5 "todas" nas lajes seguintes a um tipo 3 sem μ;
- montagem: a escolha "Vx apoia em Vy" do LAJEMONT nos cruzamentos sem pilar (não fica no .LAJ e pediria um campo de viga; vale a regra da V2) e os apoios das vigas nas pontas de um pilar-parede (a V2 põe o pilar no centro do trecho);
- os parâmetros do .DSP, do VIGA.INI e do .PIP (só os padrões "SISTRUT"; os do .LAP estão em `obra.parametrosLaje`);
- acidental gerada por % (v2par_viga_r6), acidentais "S" (envoltória) e reação máxima;
- cargas concentradas em viga, momentos externos, engaste nas extremidades e J por tramo;
- seção T, seções diferentes por tramo e acidentais próprias da viga (v2par_des_especial);
- pilares não retangulares, vínculos por nível, vento e excentricidade entre seções;
- predimensionamento de pilar (PILAREDI 3.1) e verificação de seção dada (PILAR opção 6). A verificação existe na família, `verificaPilarSistrut` em `sistrut/pilares/verificacao.ts`, mas não entra no cálculo da obra.

## Casos de referência

- **E2E** (`sistrut/__e2e__/obraE2E.ts`): 4 lajes 4×5 h 10, vigas 12×40 e 12×50, pilares P1..P9 20×20, pé-direito 3. `sistrut/obra.test.ts` confere no modo original todos os números de `caso_a_laje`, `caso_b_viga`, `caso_c_pilaredi` e `retrad_lajeproc`, exceto os ids de `NAO_PRODUZIDOS` (eco do H e predimensionamento).
- **VBX** (`sistrut/__e2e__/obraVBX.ts`): `v2par_viga_fluxo`, os 259 valores (viga sobre as pontas de dois balanços, .REP com P4 −0,01).
- **.LAJ importados** (`armazenamento/sistrut/laje.test.ts`): o .LAJ que o original gravou no run, importado e calculado no modo original. Todos os valores impressos batem: lajes (espessura mínima, imposição de H, momentos e armaduras antes e depois da otimização, μ, códigos, barras do LAJEPROC), montagem (reações por bordo, totais, quadro de alvenarias) e, no cargas, o VIGA e o .REP.

  | caso | valores | batem | opções |
  |---|---|---|---|
  | caso_a_laje | 271 | 263 | vigas V1-V3 12 × 40; os 8 restantes são a coluna L/f, que o original imprime sempre 0 (não calcula flecha, R1) |
  | v2par_laje_livre | 122 | 122 | |
  | v2par_laje_balanco | 115 | 115 | |
  | v2par_laje_umadir | 136 | 136 | |
  | v2par_laje_assim | 264 | 264 | |
  | v2par_laje_otim | 136 | 136 | |
  | v2par_laje_r2 | 120 | 120 | `otimizaNegativos: false` |
  | v2par_laje_r3 | 56 | 56 | OTIM.LAJ (o run do r3 não grava) e `parametrosLaje: { relacaoNegPosMin: 0.35 }`; sai com o aviso "não converge" e a tela parada |
  | v2par_laje_cargas | 283 | 283 | |
  | retrad_laje_calc2 | 84 | 78 | E2E com a L1 a 90° (μ pelas cordas), L2 com μ 1,5, lados apoiados e o x = 0 da L1 engastado; restam 2 valores da tela antes da edição e 4 da coluna L/f |
  | retrad_laje_param | 99 | 85 | E2E com fck 20, aço A, γf 1,5 e eficiência 0,9; restam 10 da tela (padrões e unidades) e 4 da coluna L/f |

  Os ids `.mu` são conferidos com o μ da obra não informado (o LAJECALC 2 o recalcula pelas cordas, como nos roteiros), não com o μ lido do próprio .LAJ; o de balanco (L1, L2) e o de assim (L2, L3) valem o corrigido pela T1 (`lajes/__casos_t1__`): o JSON da T10 o leu pela linha da laje, e o .LAJ o grava por polígono. As ids impressas da imposição de H (x/d e barra) são as de antes da otimização, e a coluna "Acid." é (alvenaria + cargas por área)/área.
- **q1** (`modoCalculo.test.ts`, `formas.test.ts`): L1 4×5 apoiada e L2 em balanço 1,5×5; item D e fôrma de 53,724 m² pela regra da V2.
- **FLUXO e BALC da V1 antiga** (`fluxo.test.ts`, `armazenamento/importarV1*.test.ts`): conferem o fluxo genérico da V2 (`caminho: "v2"`, o mesmo da NBR 6118) com os métodos NB-1/78 da V1 antiga contra a V1 antiga. Não são o SISTRUT.

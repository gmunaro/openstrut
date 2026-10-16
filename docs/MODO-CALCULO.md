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
| `laje.mu` | 1 (o padrão da V2) = μ pela relação das cordas (LAJECALC 2); outro valor = μ informado. Para reproduzir um .LAJ com μ gravado, informe o μ (ex.: 0,8). Não dá para impor exatamente μ = 1. |
| `laje.vinculos` | livre → código 1, apoiado → 0, engastado → 22. Sem vínculo forçado vale a continuidade automática (lado com os mesmos dois vértices → 22). |
| vigas | nós e apoios pela regra da V2 (`geometriaDasVigas`): pilar sobre o eixo; num cruzamento sem pilar, a viga que termina se apoia na que passa; quando as duas terminam ali, a que ficaria sem 2 apoios se apoia na outra (é o "Vx apoia em Vy" do LAJEMONT). O eixo vai em ordem crescente. Essa última regra também vale no fluxo da V2 (NBR 6118): antes, a viga sobre as pontas de dois balanços ficava sem cálculo e a carga dela não chegava aos pilares. |
| `viga.pesoProprio` (kN/m, opcional) | o peso digitado no LAJEGEOM, gravado em kg/m inteiro (CINT). Ausente: bw·h·densidade. O mais comum é o predominante, os outros viram exceções. |
| `viga.cargaLinear` | alvenaria sobre o eixo da viga. |
| nomes de pilares e vigas | o .VIG grava J = 1 + (número do pilar)/100000 e um bit muda o x impresso. Para bater no último dígito, use os nomes e números do original. |
| pilares | uma coluna por posição, da fundação (cota 0) até o último pavimento em que o pilar existe; o .REP de cada pavimento (e de cada repetição) vai para o seu nível; vínculo "continuidade" em todos os níveis. |
| `obra.otimizaNegativos` (opcional) | roda a otimização dos negativos (LAJECALC 6). Ausente = roda. No original é um passo que o usuário escolhe: use `false` para casos rodados sem ele (ex.: v2par_laje_r2). |

Exemplos prontos: `sistrut/__e2e__/obraE2E.ts` (casos a, b e c) e `sistrut/__e2e__/obraVBX.ts` (v2par_viga_fluxo).

### Entrada de viga do VIGA e do DESENHO

O que o usuário do original digita no VIGA e no DESENHO depois da montagem fica em campos opcionais da viga e da obra (`dominio/obra.ts`). O motor aplica esses campos ao registro que a montagem grava (`sistrut/edicaoVig.ts`), e o resultado é o .VIG que o VIGA lê (`PavimentoSistrut.vig`). Trechos e apoios seguem a ordem do eixo crescente (x na viga horizontal, y na vertical), como no .VIG. O trecho 0 é o primeiro, ou seja, o balanço esquerdo quando ele existe. O apoio 0 é o primeiro apoio.

| Obra da V2 | Original |
|---|---|
| `viga.cargas` | as divisões do .VIG (P/Pac de D(k−1) a D(k), F/Fac em D(k)). Uma distribuída (kN/m, de `inicio` a `fim`) corta as divisões nas suas pontas e soma P nas que ficam entre elas. Uma concentrada (kN) corta na `posicao` e soma F na divisão que termina ali. As posições são em m a partir da ponta esquerda do trecho; no balanço esquerdo o motor converte para o registro, que vai da ponta para o apoio e mede D a partir do apoio. `total` inclui a `acidental`. Sem `acidental`, vale a acidental gerada pelo % quando o VIGA.INI diz "G" (VIGA.BAS:1294-1298) e zero quando diz "F". |
| `viga.somenteCargasProprias` | o .VIG digitado no VIGA: a montagem não leva carga à viga (lajes, peso próprio, `cargaLinear`). Ficam só `cargas` e a reação das vigas apoiadas nela (indexada). |
| `viga.vaos` | vão de cada trecho como digitado (m). Sem o campo, o vão vem da planta, medido em SINGLE pelas coordenadas, como faz o LAJEMONT. O vão digitado só entra se bater com a planta a menos de 5 mm; senão o motor avisa. |
| `viga.inercias` | J de cada trecho. Sem o campo, vale o da montagem, que grava a marca do pilar: 1 + número/100000. |
| `viga.engaste`, `viga.momentosExternos` | Ee/Ed e os momentos externos dos apoios extremos (kN·m). Os momentos só entram com `parametrosViga.viga.momentosExternos`. |
| `viga.apoiosDesconsiderados` | o "*" no número do pilar (VIGA opção 7): a reação do apoio não vai a pilar nenhum. |
| `viga.secoes` | o .SEC: bw, h e mesa bf/hf por trecho (seção T) e bw, h por apoio. Sem o campo, bw × h em toda a viga. |
| `viga.forma` | o .FOR: por trecho, vão livre, pe/Hle/pd/Hld, eixo e alinhamento; por apoio, largura, tipo, título, código, LPs e Dis. Cada campo ausente vem da planta. |
| `obra.parametrosViga.viga` / `.dsp` | o VIGA.INI e o .DSP. Cada campo presente substitui o de fábrica inteiro (uma tabela vem inteira). Os valores ficam nas unidades do original. No modo original, o DESDIM usa o fck, o fyk, a classe do aço e os γ do .DSP, quando a obra os informa (DESENHO.BAS:4774-4789). No corrigido, valem os materiais e o cobrimento da obra. A % de acidental gerada vale como na tela (opção 8, sem limite, R6). Quem lê um VIGA.INI aplica o limite 4..96 da leitura. |

### Importar a parte de viga de uma obra do SISTRUT

`importarVigasSistrut(arquivos, obra?, pavimentoId?)` (`armazenamento/sistrut/viga.ts`) lê o .VIG (registro de 855 bytes), o .SEC (346 bytes por viga), o .FOR (616 bytes por viga), um .DSP (texto lido como o DESENHO lê, L_23333) e o VIGA.INI. O leiaute de cada arquivo está no cabeçalho do arquivo.

- **Sem obra (gerar)**: cada viga fica numa linha horizontal própria, com um pilar em cada apoio. O nome do pilar sai da marca no J (CINT((J − INT(J·100)/100)·100000), VIGA opção 7). A marca 471 vira apoio desconsiderado. Apoio sem marca leva o nome `<viga>.A<k>` e gera aviso. A viga recebe `somenteCargasProprias`, `vaos`, `inercias` e `cargas` (uma distribuída por divisão com P e uma concentrada por F, com a acidental explícita), além de engastes, momentos externos, `secoes` e `forma`. O .DSP e o VIGA.INI entram em `parametrosViga`, só com os campos que diferem do de fábrica. O fck, o aço e a classe da obra saem do .DSP. A obra fica no modo original.
- **Com obra (completar)**: as vigas casam pelo nome no pavimento. O importador compara o .VIG com o registro que a montagem da própria obra grava. Se as divisões diferem em mais de 1e-5 relativo, a viga recebe as cargas do .VIG com `somenteCargasProprias`. Vãos, J e engastes entram só se diferem. `secoes` e `forma` entram sempre que o .SEC e o .FOR trazem a viga. A F de uma divisão em que a planta já tem a reação de uma viga apoiada não entra.

A obra sai validada por `lerObra`. Um registro vazio de .SEC ou .FOR (o QB preenche com zeros os registros que pula) é ignorado. O DESENHO.INI não é lido: os coeficientes de medida e força dele ficam em `parametrosViga.dsp` (`coeficienteMedida`, `coeficienteForca`).

### Formato de `resultado.sistrut`

`ResultadoSistrut` (tipos em `sistrut/base/tipos.ts` e `sistrut/obra.ts`), tudo nas unidades do original:

- `modo`, `materiais` (fck, fyk em t/cm², classe, γ) e `parametros` (`laje`, `dsp`, `viga`, `pilar`, `pip`): as tabelas usadas.
- `pavimentos[]` (`PavimentoSistrut`), um por pavimento da obra (`pavimentoId`):
  - `lajesDoPainel`: id da laje na V2 e bordo da V2 de cada lado do original. `painel`: a entrada do LAJECALC (lajes com códigos, vértices, μ; cargas por área; alvenarias; continuidades).
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
- **Casos de laje v2par_*** (balanço, bordo livre, uma direção, assimetria, otimização, R2, R3, cargas): conferidos nas famílias (T1, T2, T6), não pela obra da V2. As obras da V2 desses casos são as do comparador.
- **Detalhamento da tela:** é pelas regras da V2, não pelo DESINIT.
- **e2e do Playwright** (`e2e/modo-calculo.spec.ts`): o texto foi ajustado, mas o teste não foi rodado.
- **Entrada de viga no modo corrigido:** as obras importadas rodam sem aviso (`armazenamento/sistrut/viga.test.ts`), mas não há número de referência.
- **v2par_viga_r6 pelos arquivos:** a VR6 foi digitada no VIGA e o original não gravou o .VIG (o run não tem `obra/`). A obra do teste repete o roteiro.
- **retrad_des_p3:** a sonda não gravou a seção. O .SEC e o .FOR do run só têm zeros, e o único valor do caso (a seção digitada na tela) não está em arquivo nenhum.
- **Montagem × LAJEMONT no último bit:** o .VIG que a montagem da V2 grava para a E2E (V3 tramo 2, V6 tramo 1) e para a VBX (V2 tramo 2) difere do que o original gravou em poucos ulps do SINGLE em P e Pac. Os números impressos batem nos dois caminhos. Ao completar uma obra, o importador não trata essa diferença como edição (tolerância relativa de 1e-5).

## O que o modelo da obra ainda não representa

Estes recursos do original não têm campo na obra da V2, então os casos que dependem deles não são reproduzíveis:

- polígonos de laje quaisquer e ângulo da armadura principal (só retângulos alinhados, ângulo 0);
- cargas de ocupação por área com polígono próprio e parcela acidental diferente da total (a V2 tem revestimento e sobrecarga por laje);
- alvenaria sobre laje (só a carga linear sobre a viga). A montagem da T6 já distribui a alvenaria sobre laje pela posição e bate com o v2par_laje_cargas;
- tipos de laje pré-moldada e "comum não calculada";
- piso Mneg/Mpos editável (v2par_laje_r3) e os demais parâmetros do .LAP/.PIP (só os padrões "SISTRUT"). O VIGA.INI e o .DSP já são da obra (`parametrosViga`);
- vigas: a armadura que o usuário altera nas telas do DESDIM ("Altero a armadura", as janelas de fissuração) e o arranjo da armadura comprimida que ele digita (`ExtrasDesinit.comprimidaTramos/Apoios`). Vale o que o DESDIM escolhe;
- vigas: repetições por viga do DESENHO (o "rept" do .TAB). O motor usa as do pavimento;
- vigas: carga indexada (viga sobre viga) de um .VIG importado sem planta. Sem a geometria, a reação da viga apoiada não chega, e o importador avisa. Com a obra do .LAJ, a planta traz o apoio. O .VIG regravado pelo VIGA já traz a F resolvida e não precisa disso;
- vigas: número de pilar digitado na tela da opção 7 quando o J não traz a marca. O importador dá o nome `<viga>.A<k>` e avisa;
- pilares não retangulares, vínculos por nível, vento e excentricidade entre seções;
- predimensionamento de pilar (PILAREDI 3.1) e verificação de seção dada (PILAR opção 6). A verificação existe na família, `verificaPilarSistrut` em `sistrut/pilares/verificacao.ts`, mas não entra no cálculo da obra.

## Casos de referência

- **E2E** (`sistrut/__e2e__/obraE2E.ts`): 4 lajes 4×5 h 10, vigas 12×40 e 12×50, pilares P1..P9 20×20, pé-direito 3. `sistrut/obra.test.ts` confere no modo original todos os números de `caso_a_laje`, `caso_b_viga`, `caso_c_pilaredi` e `retrad_lajeproc`, exceto os ids de `NAO_PRODUZIDOS` (eco do H e predimensionamento).
- **VBX** (`sistrut/__e2e__/obraVBX.ts`): `v2par_viga_fluxo`, os 259 valores (viga sobre as pontas de dois balanços, .REP com P4 −0,01).
- **Importação da parte de viga** (`armazenamento/sistrut/viga.oraculo.test.ts`, pulado sem os runs): os arquivos que o original gravou viram a obra, que passa pelo motor no modo original. Valores conferidos (os que faltam são de laje ou montagem, que não estão no .VIG, ou do desenho gráfico do DESIMP):

  | caso | arquivos do original | conferidos |
  |---|---|---|
  | caso_b_viga, gerada | E2E.VIG (run caso_a_laje) | 252 de 252: análise do VIGA e .REP |
  | caso_b_viga, completando a obra E2E | E2E.VIG | 252 de 252 |
  | v2par_viga_fluxo, gerada | VBX.VIG (regravado pelo VIGA) | 123 de 259: todos os de viga e .REP; os 136 restantes são de laje e montagem |
  | v2par_viga_fluxo, completando a obra VBX | VBX.VIG | 123 de 259 |
  | v2par_viga_r6 | nenhum (obra do roteiro) | 56 de 56: acidental gerada a 150 %, envoltória e reações mínimas negativas |
  | v2par_des_3tramos | ASS.VIG (run v2par_laje_assim), ASS.SEC/.FOR | 128 de 128, mais o .TAB e o quadro de ferros |
  | v2par_des_2tramos | ASS.VIG, ASS.SEC/.FOR | 96 de 96, mais o .TAB e o quadro de ferros |
  | v2par_des_especial | DSX.VIG/.SEC/.FOR, V2P.DSP | 159 de 159, mais o .TAB e o quadro de ferros |
  | retrad_des_det, gerada e completando a E2E | E2E.VIG, E2E.SEC/.FOR | 113 de 126, mais o .TAB; os 13 restantes são cotas, corte e anotações do desenho, eixo do .FOR e textos de tela |
  | retrad_des_p5 / p6 | E2E.VIG, E2E.SEC/.FOR | 2 de 2 / 27 de 27 |
  | retrad_des_menu / p10 | E2E.VIG/.SEC/.FOR da obra de partida | 53 de 57 / 13 de 13, mais o .TAB |

  Na análise do DESDIM, o teste roda o DESCALC sobre a entrada que o motor montou (o .VIG editado, as seções e o .DSP da obra).
- **q1** (`modoCalculo.test.ts`, `formas.test.ts`): L1 4×5 apoiada e L2 em balanço 1,5×5; item D e fôrma de 53,724 m² pela regra da V2.
- **FLUXO e BALC da V1 antiga** (`fluxo.test.ts`, `armazenamento/importarV1*.test.ts`): conferem o fluxo genérico da V2 (`caminho: "v2"`, o mesmo da NBR 6118) com os métodos NB-1/78 da V1 antiga contra a V1 antiga. Não são o SISTRUT.

# Durabilidade e dimensionamento de lajes maciças: valores da ABNT NBR 6118 (2014 e 2023)

Data: 2026-10-12
Status: seções 1 a 6 presentes. Lacunas registradas em cada seção (ver 6.6 e as pendências em aberto).

## Convenções

- **Edição**: `2014` = NBR 6118:2014; `2023` = NBR 6118:2023. Quando a fonte usa a numeração de 2014 e não confirma o texto de 2023, o valor é marcado como `2014` e a linha de 2023 aparece como `[VERIFICAR]`.
- **Página**: "PDF n" é a página do arquivo; "imp. n" é a página impressa.
- **[VERIFICAR]**: valor encontrado em fonte secundária ou em conflito entre fontes; não confirmado no texto normativo.
- **[NÃO ENCONTRADO]**: valor não localizado nas fontes consultadas.
- **[INTERPRETAÇÃO]**: conclusão deste relatório a partir de um texto ou tabela; não consta literalmente da fonte.
- **[NÃO CONFIRMADO]**: afirmação de fonte secundária ou de memória que não foi conferida no texto citado.
- **[NÃO LIDO]**: obra ou trecho citado, mas não consultado.
- **[NÃO TRANSCRITO]**: página ou item consultado (ou renderizado), mas não copiado para o relatório.
- **[NÃO NORMATIVO]**: material que não é texto da NBR 6118 (por exemplo, tabelas de Bares/Pinheiro e recomendações de apostila).
- **Símbolos**: nos PDFs, os símbolos gregos vieram corrompidos na extração de texto. Os valores numéricos foram conferidos; símbolos que precisaram ser reconstruídos estão marcados como "(reconstruído)".
- **Fontes-base** (sigla usada abaixo):
  - **[LAJES]** Bastos, P. S. S. *Lajes de Concreto*. UNESP Bauru, out/2023, 96 p. https://wwwp.feb.unesp.br/pbastos/concreto1/Lajes.pdf (PDF e página impressa conferidos; página impressa = página PDF − 4).
  - **[FUND]** Bastos, P. S. S. *Fundamentos do Concreto Armado*. UNESP Bauru, 2023, 96 p. Arquivo local: `norma-scratch/pdf/fundamentos-ca.pdf` (página impressa = página PDF − 6). Origem da URL: [VERIFICAR] (não registrada na pesquisa anterior).
  - **[NBR14]** ABNT NBR 6118:2014, citada através de [LAJES] e [FUND] (texto normativo não lido diretamente).
  - **[NBR23]** ABNT NBR 6118:2023, texto normativo não lido diretamente nesta pesquisa.

## 1. Classes de agressividade ambiental (CAA), Tab. 6.1

Valores da Tabela 6.1 da NBR 6118 (edição 2014, numeração usada pelas fontes).

| Classe | Agressividade | Classificação geral do tipo de ambiente (para efeito de projeto) | Risco de deterioração da estrutura |
|---|---|---|---|
| I | Fraca | Rural; Submersa | Insignificante |
| II | Moderada | Urbano (notas 1 e 2) | Pequeno |
| III | Forte | Marinho (nota 1); Industrial (notas 1 e 2) | Grande |
| IV | Muito forte | Industrial (notas 1 e 3); Respingos de maré | Elevado |

Fontes:
- [FUND] Tab. 3.1 = Tab. 6.1 da NBR 6118. PDF 50, imp. 44. `fundamentos-ca.txt:2359–2378`. Edição: 2014.
- [LAJES] Tab. 6 = Tab. 6.1 da NBR 6118. PDF 16, imp. 12. `lajes-bastos.txt:783–802`. Edição: 2014.
- Edição 2023: [VERIFICAR]. Nenhuma das duas apostilas reproduz a Tab. 6.1 de 2023 e o texto normativo de 2023 não foi lido. As notas 1 a 3 (microclima, clima seco, ambientes químicos) foram lidas em [FUND] `fundamentos-ca.txt:2380–2389` e em [LAJES]; as mesmas notas em 2023 são [VERIFICAR].

Observação: "Respingos de maré" aparece em [LAJES] com a mesma linha; a Tab. 3.1 de [FUND] usa "Respingos de mar" (mesma entrada, grafia truncada pelo PDF).

## 2. Relação água/cimento e classe de concreto, Tab. 7.1

Valores da Tabela 7.1 da NBR 6118 (edição 2014), por classe de agressividade ambiental (CAA). CA = concreto armado; CP = concreto protendido.

| Concreto | Grandeza | CAA I | CAA II | CAA III | CAA IV |
|---|---|---|---|---|---|
| CA | Relação a/c em massa | 0,65 | 0,60 | 0,55 | 0,45 |
| CA | Classe de concreto (NBR 8953) | C20 | C25 | C30 | C40 |
| CP | Relação a/c em massa | 0,60 | 0,55 | 0,50 | 0,45 |
| CP | Classe de concreto (NBR 8953) | C25 | C30 | C35 | C40 |

Fontes:
- [FUND] Tab. 3.2 = Tab. 7.1 da NBR 6118. PDF 51, imp. 45. `fundamentos-ca.txt:2420–2431`. Edição: 2014.
- [LAJES] Tab. 5 = Tab. 7.1 da NBR 6118. PDF 16, imp. 12. `lajes-bastos.txt:753–765`. Edição: 2014.

Notas da tabela (2014, conforme as duas fontes):
- O concreto deve atender à NBR 12655. As classes vêm da NBR 8953.
- Item 7.4.3 (NBR 6118, 2014): consumo mínimo de cimento e demais requisitos da NBR 12655. Os valores de consumo não foram transcritos nas fontes consultadas. [NÃO ENCONTRADO] nas fontes lidas.

Edição 2023:
- Valores de a/c e classe de concreto da Tab. 7.1 de 2023: [VERIFICAR]. O texto normativo de 2023 não foi lido. Nenhuma das apostilas consultadas reproduz a tabela de 2023.
- Referência à NBR 8953 em 2023: [VERIFICAR].

## 3. Cobrimento nominal, Tab. 7.2, tolerância de execução (Δc) e regra do diâmetro

### 3.1 Tabela 7.2 (c = 10 mm), cobrimento nominal em mm

| Tipo de estrutura | Componente ou elemento | CAA I | CAA II | CAA III | CAA IV (nota c) |
|---|---|---|---|---|---|
| Concreto armado | Laje (nota b) | 20 | 25 | 35 | 45 |
| Concreto armado | Viga / pilar | 25 | 30 | 40 | 50 |
| Concreto armado | Elementos estruturais em contato com o solo (nota d) | [NÃO ENCONTRADO] na CAA I | 30 | 40 | 50 |
| Concreto protendido (nota a) | Laje | 25 | 30 | 40 | 50 |
| Concreto protendido (nota a) | Viga / pilar | 30 | 35 | 45 | 55 |

Notas da tabela (2014, texto citado nas duas fontes):
- (a) Cobrimento nominal da bainha ou dos fios, cabos e cordoalhas. A armadura passiva segue os valores de concreto armado.
- (b) Face superior de lajes e vigas revestidas com contrapiso, carpete, madeira, argamassa de acabamento, piso de elevado desempenho, cerâmico ou asfáltico: pode-se substituir pelas exigências de 7.4.7.5, com cnom ≥ 15 mm.
- (c) Superfícies expostas a ambientes agressivos (reservatórios, ETA/ETE, condutos de esgoto, canaletas de efluentes etc.): usar os cobrimentos da CAA IV.
- (d) Trecho de pilares em contato com o solo junto aos elementos de fundação: cnom ≥ 45 mm.

Fontes:
- [FUND] Tab. 3.3 = Tab. 7.2 da NBR 6118. PDF 52, imp. 46. `fundamentos-ca.txt:2505–2520`. Conferido por render (`norma-scratch/png/fund-52.png`). Edição: 2014.
- [LAJES] Tab. 7 = Tab. 7.2 da NBR 6118. PDF 17, imp. 13 (notas no imp. 14, PDF 18). `lajes-bastos.txt:849–864`. Edição: 2014.
- Edição 2023: [VERIFICAR]. Nenhuma das apostilas reproduz a Tab. 7.2 de 2023 e o texto normativo de 2023 não foi lido. Fonte secundária em `nbr-research/` (UFU, memorial federal) não confirma os valores de 2023.

Observação sobre a linha "contato com o solo": o valor da CAA I não consta na tabela (célula vazia no texto e no render). Não foi inferido.

### 3.2 Regras de cálculo do cobrimento

| Regra | Texto/valor | Item | Fonte | Edição |
|---|---|---|---|---|
| Cobrimento nominal | cnom = cmin + c (Eq. 3.1 em [FUND]; Eq. 13 em [LAJES]) | 7.4.7.2 | [FUND] `fundamentos-ca.txt:2465`; [LAJES] `lajes-bastos.txt:823`, PDF 17, imp. 13 | 2014 |
| Tolerância de execução mínima | c ≥ 10 mm em obras correntes | 7.4.7.3 | [FUND] `fundamentos-ca.txt:2469`; [LAJES] `lajes-bastos.txt:827` | 2014 |
| Tolerância reduzida | c = 5 mm para estruturas projetadas conforme NBR 9062, com controle rigoroso explicitado no projeto; permite redução de 5 mm na Tab. 7.2 | 7.4.7.4 | [FUND] `fundamentos-ca.txt:2470–2483`; [LAJES] `lajes-bastos.txt:827–831` | 2014 |
| Concreto de classe superior | Tab. 7.2 pode ser reduzida em até 5 mm | 7.4.7.6 | [FUND] `fundamentos-ca.txt:2544–2545`; [LAJES] `lajes-bastos.txt:878–879` | 2014 |
| Pré-fabricados | Valores de cobrimento seguem a NBR 9062 | 7.4.7.7 | [FUND] `fundamentos-ca.txt:2546–2547`; [LAJES] `lajes-bastos.txt:880–881` | 2014 |
| Cobrimento vale para a face externa da armadura | "superfície da armadura externa, em geral face externa do estribo" | 7.4.7.5 (nota) | [FUND] nota 69 | 2014 |
| Agregado graúdo | dmáx,agr ≤ 1,2 × cnom | 7.4.7.6 | [FUND] `fundamentos-ca.txt:2492–2495` (Eq. 3.3); [LAJES] `lajes-bastos.txt:838–839` | 2014 |

Regra do diâmetro (cnom em função de φ, reconstruído):
- Barra isolada: cnom ≥ φbarra (símbolo reconstruído a partir de [FUND] `fundamentos-ca.txt:2488` e [LAJES] `lajes-bastos.txt:835`; o texto extraído está corrompido).
- Feixe: cnom ≥ φn, com φn = φ·√n (n = número de barras do feixe; reconstruído).
- Bainha: cnom ≥ 0,5 × φbainha.
- Valores de [FUND] e [LAJES] conferem entre si, mas a grafia dos símbolos é reconstruída. Confirmar no texto normativo de 2014.

### 3.3 Conflito 2014 × 2023 para o item 7.4.7.4 (c = 5 mm) [VERIFICAR]

- O texto de 2014 citado por [LAJES] (`lajes-bastos.txt:827–831`) diz: "Para estruturas projetadas de acordo com a ABNT NBR 9062, quando houver um controle adequado de qualidade [...] pode ser adotado o valor c = 5 mm". Ou seja, a própria citação menciona a NBR 9062.
- A UFU (`nbr-research/ufu_tcc.txt:347–355`) afirma que, na NBR 6118:2014, o item 7.4.7.4 "poderia ser aplicado em qualquer estrutura de concreto", e que a versão de 2023 restringe o uso a estruturas de concreto pré-moldado projetadas conforme a NBR 9062.
- Leitura de 2014 da UFU não é confirmada pelo trecho citado pela apostila, que menciona a NBR 9062 na condição de projeto. Conflito não resolvido: [VERIFICAR] no texto normativo de 2014 e de 2023.
- Impacto para software: a redução de c para 5 mm deve ser condicionada a um flag de projeto (controle rigoroso explicitado), e não aplicada por padrão a qualquer estrutura, até a leitura da norma.

Limitações desta seção:
- Valores de 2023 para Tab. 7.2 e para 7.4.7.4 não foram confirmados em texto normativo.
- Símbolos de Eq. 14/3.2 (regra do diâmetro) foram reconstruídos a partir de texto corrompido.

## 4. Lajes maciças: espessura, vão efetivo, armadura mínima, espaçamentos, x/d, redistribuição e VRd1

Fonte principal: [LAJES]. Os valores desta seção são os que a apostila cita com numeração de 2014. Todas as linhas de edição 2023 estão como [VERIFICAR] (ver 4.9).

### 4.1 Espessura mínima (13.2.4.1)

| Caso | Espessura mínima (cm) |
|---|---|
| a) Laje de cobertura não em balanço | 7 |
| b) Laje de piso não em balanço | 8 |
| c) Laje em balanço | 10 |
| d) Laje que suporta veículos de peso total ≤ 30 kN | 10 |
| e) Laje que suporta veículos de peso total > 30 kN | 12 |
| f) Laje com protensão apoiada em vigas | 15; vão mínimo l/42 (piso biapoiada) e l/50 (piso contínua) |
| g) Laje lisa / laje cogumelo, fora do capitel | 16 / 14 |

Fonte: [LAJES] item 3.5, PDF 15, imp. 11. `lajes-bastos.txt:713–722`. Edição: 2014. Texto da apostila: "A NBR 6118 (item 13.2.4.1) estabelece que a espessura mínima para as lajes maciças deve respeitar..."

Coeficiente adicional n para lajes em balanço (Tab. 13.2 da NBR 6118, reproduzida como Tab. 4 em [LAJES]):
- n = 1,95 − 0,05·h, com h em cm. Valores tabelados: n = 1,00 para h = 19 cm e n = 1,45 para h = 10 cm (passo de 1 cm em h e 0,05 em n).
- Os esforços solicitantes de cálculo das lajes em balanço devem ser multiplicados por n.
- Fonte: [LAJES] Tab. 4, PDF 15, imp. 11. `lajes-bastos.txt:724–735`. Edição: 2014.

### 4.2 Vão efetivo (14.6.2.4)

- lef = l0 + a1 + a2 (Eq. 4). Fonte: [LAJES] item 3.2, PDF 6–7, imp. 2–3. `lajes-bastos.txt:228–234`. Edição: 2014. A apostila cita "NBR 6118, item 14.6.2.4" (`lajes-bastos.txt:229`).
- a1 ≤ t1/2 e a1 ≤ 0,3·h; a2 com t2 (Eq. 3). Os sinais "≤" não vieram no texto extraído; forma reconstruída a partir de `lajes-bastos.txt:238–239`. Dimensões l0, t1, t2 e h na Figura 3 (`lajes-bastos.txt:241–247`).
- Edição 2023: [VERIFICAR]. O item de 2023 correspondente não foi confirmado.

### 4.3 Armadura mínima de flexão

#### 4.3.1 Tabela 19.1 (armaduras passivas aderentes)

Reproduzida como Tab. 10 em [LAJES], PDF 37, imp. 33. Valores conferidos na imagem `norma-scratch/png/lajes-37.png`. Notação: ρs = As/(bw·h); ρp = Ap/(bw·h); ρmín definido em 17.3.5.2.1 (citado em `lajes-bastos.txt:2064`).

| Armadura | Elementos sem armaduras ativas | Com armadura ativa aderente | Com armadura ativa não aderente |
|---|---|---|---|
| Negativas | ρs ≥ ρmín | ρs ≥ ρmín; ρp ≥ 0,67·ρmín | ρs ≥ ρmín; 0,5·ρp ≥ 0,67·ρmín (ver 19.3.3.2) |
| Negativas de bordas sem continuidade | ρs ≥ 0,67·ρmín (valor único para as três colunas) | | |
| Positivas de lajes armadas nas duas direções | ρs ≥ 0,67·ρmín | ρs ≥ 0,67·ρmín; ρp ≥ 0,5·ρmín | ρs ≥ ρmín; 0,5·ρp ≥ 0,5·ρmín |
| Positiva principal, laje armada em uma direção | ρs ≥ ρmín | ρs ≥ ρmín; ρp ≥ 0,5·ρmín | ρs ≥ ρmín; 0,5·ρp ≥ 0,5·ρmín |
| Positiva secundária, laje armada em uma direção | As/s ≥ 20 % da armadura principal; As/s ≥ 0,9 cm²/m; ρs ≥ 0,5·ρmín (valor único para as duas primeiras colunas) | | — |

Fonte: [LAJES] Tab. 10, PDF 37, imp. 33. `lajes-bastos.txt:2035–2064` (texto extraído, símbolos ilegíveis; valores da tabela conferidos na imagem). Edição: 2014.

#### 4.3.2 Tabela 17.3 (taxas mínimas para vigas retangulares)

Reproduzida como Tab. 11 em [LAJES], PDF 37, imp. 33. Conferida na imagem.

| fck (MPa) | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 | 85 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ρmín (%) | 0,150 | 0,150 | 0,150 | 0,164 | 0,179 | 0,194 | 0,208 | 0,211 | 0,219 | 0,226 | 0,233 | 0,239 | 0,245 | 0,251 | 0,256 |

Nota (a) da tabela: os valores de ρmín pressupõem aço CA-50, d/h = 0,8, γc = 1,4 e γs = 1,15. Se forem diferentes, ρmín deve ser recalculado. ρmín = As,mín/Ac. Fonte: [LAJES] Tab. 11, PDF 37, imp. 33. `lajes-bastos.txt:2066–2077`. Edição: 2014.

#### 4.3.3 Negativa de borda sem continuidade (19.3.3.2)

- Texto citado pela apostila: "Essa armadura deve se estender até pelo menos 0,15 do vão menor da laje a partir da face do apoio." O símbolo que indica o vão (l) não veio no texto extraído; a imagem mostra a mesma frase sem o símbolo.
- Nota de rodapé 14 da apostila: "No item consta também a prescrição para o caso de lajes lisas e lajes-cogumelo."
- Fonte: [LAJES] PDF 37, imp. 33. `lajes-bastos.txt:2079–2084` e nota 14 (`:2106`). Edição: 2014.

### 4.4 Diâmetro máximo (20.1)

- Texto citado: "Qualquer barra da armadura de flexão deve ter diâmetro no máximo igual a h/8." Fonte: [LAJES] item 3.12.2, PDF 37, imp. 33. `lajes-bastos.txt:2086–2087`. Edição: 2014.
- Diâmetro mínimo de armadura negativa: a norma não fixa valor (texto da apostila). A apostila cita 6,3 mm como costume para evitar deformação na execução e recomenda 8 mm ou 10 mm. Fonte: [LAJES] PDF 38, imp. 34. `lajes-bastos.txt:2124–2128`. Recomendação da apostila, não é norma.
- Edição 2023: [VERIFICAR].

### 4.5 Espaçamentos (20.1)

| Regra | Valor | Fonte | Edição |
|---|---|---|---|
| Armadura principal de flexão | s ≤ 2h e s ≤ 20 cm; prevalece o menor na região dos maiores momentos (Eq. 66) | [LAJES] item 3.12.3, PDF 37, imp. 33. `lajes-bastos.txt:2089–2098` | 2014 |
| Barras com diâmetro ≥ 20 mm | espaçamento máximo pode ser 15·φ | [LAJES] PDF 37, imp. 33. `lajes-bastos.txt:2100–2101` | 2014 |
| Armadura secundária de flexão | ≥ 20 % da principal; espaçamento ≤ 33 cm; emendas com os mesmos critérios da principal | [LAJES] PDF 37–38, imp. 33–34. `lajes-bastos.txt:2103–2110`; Tab. 10 | 2014 |
| Espaçamento mínimo entre barras (Eq. 67): a_h,mín ≥ máx{2 cm; φℓ; 1,2·dmáx,agr}. A apostila diz que a recomendação é para vigas e não cita a origem do valor. Não há indicação de que valha para lajes. | [LAJES] PDF 38, imp. 34, imagem `norma-scratch/png/lajes-38.png`. `lajes-bastos.txt:2112–2118` | Recomendação da apostila para vigas; não é norma para lajes |

Observação da apostila: na prática, adotam-se espaçamentos entre barras superiores a 7 ou 8 cm (`lajes-bastos.txt:2120–2122`). Recomendação, não norma.

Edição 2023 para todas as linhas desta subseção: [VERIFICAR].

### 4.6 Posição da linha neutra no ELU (x/d)

Eq. 50 (limites para ductilidade; a apostila cita 14.6.4.3, `lajes-bastos.txt:1737`):
- x/d ≤ 0,45 para concretos com fck ≤ 50 MPa.
- x/d ≤ 0,35 para concretos com 50 < fck ≤ 90 MPa.
- Os limites podem ser alterados com detalhes especiais de armadura (por exemplo, confinamento), `lajes-bastos.txt:1750–1751`.

Fonte: [LAJES] PDF 32, imp. 28. `lajes-bastos.txt:1743–1751`. Edição: 2014. Edição 2023: [VERIFICAR].

### 4.7 Redistribuição de momentos (14.6.4.3, Eq. 51 e 52)

Eq. 51 (x/d após redistribuição de M para M', com δ como coeficiente de redistribuição; símbolo δ reconstruído):
- x/d ≤ (δ − 0,44)/1,25 para fck ≤ 50 MPa.
- x/d ≤ (δ − 0,56)/1,25 para 50 < fck ≤ 90 MPa.

Eq. 52 (limites de δ):
- δ ≥ 0,90 para estruturas de nós móveis.
- δ ≥ 0,75 para qualquer outro caso.

Fonte: [LAJES] PDF 32, imp. 28. `lajes-bastos.txt:1753–1763`. Edição: 2014. Redistribuição fora desses limites só com análise não linear ou plástica, com verificação explícita da capacidade de rotação das rótulas plásticas (`lajes-bastos.txt:1765–1767`). Edição 2023: [VERIFICAR].

### 4.8 Força cortante em lajes sem armadura transversal (VRd1)

- Dispensa de armadura transversal (Eq. 56): VSd ≤ VRd1, com VSd na distância d da face do apoio. Aplica-se a lajes maciças ou nervuradas, conforme 17.4.1.1.2-b. Fonte: [LAJES] item 3.11.2.1, PDF 34, imp. 30. `lajes-bastos.txt:1871–1877`. Edição: 2014.
- Eq. 57: VRd1 = [τRd · k · (1,2 + 40·ρ1 + 0,15·σcp)] · bw · d. Eq. 58: σcp = NSd/Ac, com compressão positiva; NSd é a força longitudinal devida à protensão ou ao carregamento. Símbolos reconstruídos a partir de `lajes-bastos.txt:1881–1886`. Fonte: PDF 34, imp. 30.
- Eq. 59 (sem protensão ou força normal de compressão, σcp = 0): VRd1 = [τRd · k · (1,2 + 40·ρ1)] · bw · d. `lajes-bastos.txt:1888–1890`. PDF 34, imp. 30.
- Eq. 60: τRd = 0,25·fctd. Eq. 61: fctd = fctk,inf/γc. `lajes-bastos.txt:1892–1894`. PDF 34, imp. 30. fctk,inf = 0,7·fct,m (Eq. 27 em [LAJES], `lajes-bastos.txt:1372`; a página é tratada na seção 5).
- Eq. 62: ρ1 = As1/(bw·d), não maior que 0,02. `lajes-bastos.txt:1896–1897`. PDF 34, imp. 30.
- k: 1 quando 50 % da armadura inferior não chega até o apoio. Nos demais casos, k = |1,6 − d| não menor que 1, com d em metros. `lajes-bastos.txt:1901–1904`. PDF 34, imp. 30.
- τRd: o valor de fck usado deve ser limitado a 60 MPa. `lajes-bastos.txt:1907–1908`. PDF 35, imp. 31.
- As1 deve estender-se até no mínimo d + b,nec além da seção (Figura 29). Eq. 63 (b,nec, item 9.4.2.5) e Eq. 64 (b,mín = máx(0,3·ℓb; 10·φ; 100 mm), reconstruída). Valores de b,nec (1,0 sem gancho; 0,7 com gancho e cobrimento ≥ 3φ; 0,7 com barras transversais soldadas; 0,5 com soldadas e gancho com cobrimento ≥ 3φ). `lajes-bastos.txt:1910–1929`. PDF 35, imp. 31.
- Edição 2014. Edição 2023: [VERIFICAR].

Limitação: os símbolos gregos e os operadores matemáticos de Eq. 57 a 64 não vieram corretos no texto extraído. Os valores numéricos e a estrutura das fórmulas batem com o texto. A forma completa foi reconstruída e deve ser conferida no texto normativo de 2014.

### 4.9 Edição 2023 (seção 4)

- Nenhum valor desta seção foi lido no texto da NBR 6118:2023. Todos os itens acima estão como [VERIFICAR] para 2023.
- A apostila declara conformidade com a NBR 6118:2023 (`lajes-bastos.txt:23`), mas cita numeração de 2014: 13.2.4.1 (`:713`), 14.6.2.4 (`:229`), 14.6.4.3 (`:1737`), 17.4.1.1.2-b (`:1873`), 17.3.5.2.1 (`:2064`), 19.3.3.2 (`:2009`, `:2079`), 20.1 (`:2087`). Os valores acima são os de 2014 citados pela apostila.
- Coeficientes de minoração (γc e γs), tabelas em fontes secundárias:
  - `nbr-research/udesc.txt:535–539` (tabela sob "NBR 6118:2014"): combinações normais γc = 1,4 e γs = 1,15; especiais ou de construção γc = 1,2 e γs = 1,15; excepcionais γc = 1,2 e γs = 1,0.
  - `nbr-research/udesc.txt:1150–1158` (tabela sob "NBR 6118:2023", com a fonte "ABNT, 2024" na própria tabela): mesmos valores. Fonte secundária, não confirmada no texto normativo.
  - `nbr-research/lajss.txt:156–172`: tabela 2014 com leitura ambígua do layout. A linha "Special or construction" traz γs = 1,0 e não 1,15, divergindo de `udesc.txt`. [VERIFICAR] no texto normativo.
- A apostila usa γc = 1,4 e γs = 1,15 (`lajes-bastos.txt:2074`; ver também `lajes-bastos.txt:2597` e `:4283`).

### 4.10 Verificação desta seção

- Verificado no texto da apostila (PDF e página impressa indicados): espessura (4.1), coeficiente n (4.1), vão efetivo (4.2), x/d e redistribuição (4.6 e 4.7), VRd1 (4.8), negativa de borda (4.3.3), h/8 e espaçamentos (4.4 e 4.5).
- Verificado na imagem `png/lajes-37.png` (PDF 37, imp. 33, nova conferência): Tab. 19.1 (Tab. 10 da apostila), Tab. 17.3 (Tab. 11), nota 14, item 3.12.2 (h/8), item 3.12.3 (Eq. 66), 15φ e armadura secundária (20 % e 33 cm).
- Verificado na imagem `png/lajes-38.png` (PDF 38, imp. 34): Eq. 67 (chave de espaçamento mínimo) e a nota sobre diâmetro negativo (6,3 mm usual; 8 mm e 10 mm recomendados).
- Imagem `png/lajes-31.png` (PDF 31, imp. 27): não é desta seção; as notas 1 a 5 que ela mostra estão na seção 5.
- Não verificado: qualquer valor de edição 2023; texto normativo de 2014 (todos os valores vêm de [LAJES]); símbolos gregos e operadores de Eq. 3, 51, 52, 57 a 64 (reconstruídos); origem normativa do espaçamento mínimo da Eq. 67 (a apostila não cita a origem; a aplicação a lajes não é confirmada).

## 5. Flecha em lajes: momento de fissuração, flecha imediata e diferida, limites (Tab. 9)

Fonte principal: [LAJES] item 3.10 (`lajes-bastos.txt:1301–1740`; PDF 22–31, imp. 22–28). A apostila usa a numeração de 2014 (itens 17.3.1, 17.3.2, 13.3 e 11.8.3). Todas as linhas de edição 2023 desta seção estão como [VERIFICAR] (ver 5.7).

Escopo: a apostila trata a flecha de lajes do mesmo modo que a de vigas, com base em 19.3.1 (imp. 22, `lajes-bastos.txt:1307–1310`). Aplicar a Eq. 31 (inércia equivalente, formulada "em vigas") a lajes maciças é interpretação da apostila. [INTERPRETAÇÃO]

### 5.1 Momento de fissuração e estádio (Eq. 25 a 30)

| Grandeza | Valor ou expressão | Item / equação | Página | Fonte | Edição |
|---|---|---|---|---|---|
| Momento de fissuração | Mr = α · fct · Ic / yt | Eq. 25 | imp. 22, PDF 26 | [LAJES] `lajes-bastos.txt:1342–1347` | 2014 |
| Fator de forma α | 1,2 para seções T ou duplo T; 1,3 para seções I ou T invertido; 1,5 para seções retangulares | Eq. 25 | imp. 22 | [LAJES] `lajes-bastos.txt:1345–1347` | 2014 |
| fct na Eq. 25 | fctk,inf na verificação de formação de fissuras; fct,m na verificação de deformação excessiva | 8.2.5 | imp. 22 | [LAJES] `lajes-bastos.txt:1354–1358` | 2014 |
| Protensão | Deve ser considerado o efeito da protensão no cálculo de Mr | 17.3.1 | imp. 22 | [LAJES] `lajes-bastos.txt:1360–1361` | 2014 |
| fct,m (fck ≤ 50 MPa) | 0,3 · fck^(2/3) | Eq. 26 | imp. 22 | [LAJES] `lajes-bastos.txt:1368` | 2014 |
| fctk,inf | 0,7 · fct,m | Eq. 27 | imp. 22 | [LAJES] `lajes-bastos.txt:1372` | 2014 |
| fctk,sup | 1,3 · fct,m | Eq. 28 | imp. 22 | [LAJES] `lajes-bastos.txt:1374` | 2014 |
| fct,m (fck > 50 MPa) | 2,12 · ln[1 + 0,1 · (fck + 8)], com fck e fct,m em MPa | Eq. 29 | imp. 22 | [LAJES] `lajes-bastos.txt:1378` | 2014 |

Notas da seção:
- Eq. 26 está como "0,3 3 fck2" no texto extraído. A forma 0,3 · fck^(2/3) é a leitura usual; o símbolo do expoente foi reconstruído. Imagem: `norma-scratch/png/lajes-26.png` (lida).
- Eq. 25: os símbolos de α e de fct estão corrompidos no texto extraído. Os valores de α (1,2; 1,3; 1,5) vêm do texto citado e foram lidos na imagem `lajes-26.png`.
- Estádio (imp. 23, `lajes-bastos.txt:1383–1389`): se Ma > Mr, a seção está no estádio II (Ecs e posição da linha neutra no estádio II). Se Ma < Mr, está no estádio I, com Ic (Eq. 32).
- Combinação para Ma: combinação rara (11.8.3; Tab. 11.4 da NBR 6118, `lajes-bastos.txt:1392–1400`). Ação vinda da Eq. 30 (imp. 23, PDF 27; imagem `lajes-27.png`):
  - Fd,ser = Fgik + Fq1k + Σ ψ1j · Fqjk (Eq. 30). ψ1 é o fator de combinação frequente para ELS (Tab. 11.2). 
  - Em lajes residenciais com uma única ação variável, a Eq. 30 fica reduzida aos dois primeiros termos (`lajes-bastos.txt:1409–1410`).

### 5.2 Flecha imediata: inércia equivalente (17.3.2.1.1; Eq. 31 a 38)

| Grandeza | Valor ou expressão | Item / equação | Página | Fonte | Edição |
|---|---|---|---|---|---|
| Inércia equivalente | (EI)eq,t0 = Ecs · { (Mr/Ma)³ · Ic + [1 − (Mr/Ma)³] · III } ≤ Ecs · Ic | Eq. 31 | imp. 23, PDF 27 | [LAJES] imagem `lajes-27.png` | 2014 |
| Inércia bruta | Ic = b · h³ / 12 | Eq. 32 | imp. 23 | [LAJES] `lajes-bastos.txt:1431` | 2014 |
| Relação de módulos | αe = Es / Ecs | Eq. 33 | imp. 23 | [LAJES] `lajes-bastos.txt:1436` | 2014 |
| Módulo secante | Ecs = αi · Eci | Eq. 34 | imp. 23 | [LAJES] `lajes-bastos.txt:1451`; imagem `lajes-27.png` | 2014 |
| αi | 0,8 + 0,2 · fck/80, com αi ≤ 1,0 | Eq. 34 | imp. 23 | [LAJES] `lajes-bastos.txt:1453–1454`; imagem `lajes-27.png` | 2014 |
| Eci, fck ≤ 50 MPa | αE · 5600 · √fck, com Eci e fck em MPa | Eq. 35 | imp. 24, PDF 28 | [LAJES] imagem `lajes-28.png` | 2014 |
| αE (Eq. 35) | 1,2 basalto e diabásio; 1,0 granito e gnaisse; 0,9 calcário; 0,7 arenito | Eq. 35 | imp. 24 | [LAJES] imagem `lajes-28.png` | 2014 |
| Eci, fck > 50 MPa | 21,5 · 10³ · αE · (fck/10 + 1,25)^(1/3), com Eci e fck em MPa | Eq. 36 | imp. 24 | [LAJES] imagem `lajes-28.png` | 2014 |
| Ma | Momento na seção crítica do vão: máximo no vão (biapoiada ou contínua) e no apoio (balanço), para a combinação considerada | Eq. 31 (texto) | imp. 23 | [LAJES] `lajes-bastos.txt:1442–1444` | 2014 |
| Mr em barras lisas | Reduzido à metade | Eq. 31 (texto) | imp. 23 | [LAJES] `lajes-bastos.txt:1439–1440` | 2014 |

Estádio II (posição da linha neutra e inércia; imp. 24, PDF 28; imagem `lajes-28.png`):
- Forma geral (com A's): x² + (2 · αe / b) · (As + A's) · x − (2 · αe / b) · (As · d + A's · d') = 0 (equação de xII; a forma com A's é a da imagem).
- Eq. 37 (A's = 0): xII² + (2 · As · αe / b) · xII − (2 · As · d · αe / b) = 0, com b = 100 cm nas lajes maciças.
- Forma geral da inércia: III = b · xII³ / 12 + b · xII · (xII/2)² + αe · A's · (xII − d')² + αe · As · (d − xII)².
- Eq. 38 (A's = 0): III = b · xII³ / 12 + b · xII · (xII/2)² + αe · As · (d − xII)².

Notas da seção:
- A apostila diz que a Eq. 31 é a "avaliação aproximada da flecha imediata em vigas" (imp. 23). A nota 9 (imp. 23, `lajes-bastos.txt:1456`) registra que a norma dá outro valor de rigidez para vãos de vigas contínuas. A nota não transcreve esse valor. [NÃO ENCONTRADO]
- Es (módulo de elasticidade do aço) não foi transcrito nesta seção. [NÃO TRANSCRITO]
- A apostila também cita o módulo de elasticidade obtido por ensaio conforme NBR 8522-1 e 8522-2 (imp. 23, `lajes-bastos.txt:1448–1449`).
- Contradição interna da apostila: Ma (para Eq. 31) usa a combinação rara (imp. 23, `lajes-bastos.txt:1478–1479`), e a carga p da Eq. 45 usa a combinação quase permanente (imp. 27, ver 5.5). Ambas as leituras estão no texto; a norma de 2014 não foi lida para decidir. [VERIFICAR]

### 5.3 Flecha diferida: coeficiente ξ e αf (17.3.2.1.2; Eq. 39 a 44; Tab. 8)

| Grandeza | Valor ou expressão | Item / equação | Página | Fonte | Edição |
|---|---|---|---|---|---|
| Fator de fluência | αf = Δξ / (1 + 50 · ρ') | Eq. 39 | imp. 24, PDF 28 | [LAJES] imagem `lajes-28.png`; texto `lajes-bastos.txt:1520–1521` | 2014 |
| Taxa de armadura comprimida | ρ' = A's / (b · d) | Eq. 40 | imp. 24 | [LAJES] imagem `lajes-28.png` | 2014 |
| Variação de ξ | Δξ = ξ(t) − ξ(t0) | Eq. 41 | imp. 25, PDF 29 | [LAJES] imagem `lajes-29.png` | 2014 |
| ξ(t), t ≤ 70 meses | 0,68 · (0,996^t) · t^0,32 | Eq. 42 | imp. 25 | [LAJES] imagem `lajes-29.png` | 2014 |
| ξ(t), t > 70 meses | 2 | Eq. 43 | imp. 25 | [LAJES] `lajes-bastos.txt:1538` | 2014 |
| Idade ponderada | t0 = Σ(Pi · t0i) / ΣPi | Eq. 44 | imp. 25 | [LAJES] imagem `lajes-29.png` | 2014 |
| Flecha total | flecha imediata · (1 + αf) | texto (imp. 25); Eq. 49 | imp. 25; imp. 27 | [LAJES] `lajes-bastos.txt:1560`, `:1723` | 2014 |

Tabela 8 - Valores do coeficiente ξ em função do tempo (Tabela 17.1 da NBR 6118; imp. 25, PDF 29; imagem `lajes-29.png`):

| t (meses) | 0 | 0,5 | 1 | 2 | 3 | 4 | 5 | 10 | 20 | 40 | ≥ 70 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ξ(t) | 0 | 0,54 | 0,68 | 0,84 | 0,95 | 1,04 | 1,12 | 1,36 | 1,64 | 1,89 | 2 |

Verificação da Tab. 8 com Eq. 42 (cálculo feito neste trabalho, Python, arredondamento a 2 casas): t = 0,5 → 0,5436; t = 1 → 0,6773; t = 2 → 0,8421; t = 3 → 0,9549; t = 4 → 1,0428; t = 5 → 1,1155; t = 10 → 1,3649; t = 20 → 1,6369; t = 40 → 1,886. Todos batem com a tabela. Esta é uma conferência da aritmética da equação, não uma leitura da norma.

Notas da seção:
- Eq. 42 vale para t ≤ 70 meses. Eq. 43 vale para t > 70 meses. [Forma lida na imagem]
- t é o tempo em meses para o qual se quer a flecha diferida. t0 é a idade, em meses, da aplicação da carga de longa duração, com t = 0 na concretagem (imp. 25).
- A apostila cita a flecha diferida "pelo fator αf" do item 17.3.2.1.2 (imp. 24, `lajes-bastos.txt:1515–1518`).

### 5.4 Limites de deslocamento (13.3; Tab. 9; notas a–g; NOTAS 1–5)

Tabela 9 - Limites para deslocamentos (Tabela 13.3 da NBR 6118). Imp. 26, PDF 30. Imagem: `norma-scratch/png/lajes-30.png` (lida). Texto: `lajes-bastos.txt:1586–1665`. Edição 2014. Os símbolos "θ" e "ψ" saíram corrompidos no texto extraído; foram lidos na imagem.

| Tipo de efeito | Razão da limitação | Exemplo | Deslocamento a considerar | Deslocamento-limite |
|---|---|---|---|---|
| Aceitabilidade sensorial | Visual | Deslocamentos visíveis em elementos estruturais | Total | /250 |
| Aceitabilidade sensorial | Outro | Vibrações sentidas no piso | Devido a cargas variáveis de utilização | /350 |
| Efeitos estruturais em serviço | Superfícies que devem drenar água | Coberturas e varandas | Total | /250 a) |
| Efeitos estruturais em serviço | Pavimentos que devem permanecer planos | Ginásios e pistas de boliche | Total | /350 + contraflecha b) |
| Efeitos estruturais em serviço | Pavimentos que devem permanecer planos | Laboratórios | Ocorrido após a construção do piso | /600 |
| Efeitos estruturais em serviço | Elementos que suportam equipamentos sensíveis | (não informado) | Ocorrido após o nivelamento do equipamento | Recomendação do fabricante do equipamento |
| Efeitos em elementos não estruturais | Paredes | Alvenaria, caixilhos e revestimentos | Após a construção da parede | /500 c) e 10 mm e θ = 0,0017 rad d) |
| Efeitos em elementos não estruturais | Paredes | Divisórias leves e caixilhos telescópicos | Ocorrido após a instalação da divisória | /250 c) e 25 mm |
| Efeitos em elementos não estruturais | Paredes | Movimento lateral de edifícios | Provocado pela ação do vento, para combinação frequente (ψ1 = 0,30) | H/1700 e Hi/850 e) entre pavimentos f) |
| Efeitos em elementos não estruturais | Paredes | Movimentos térmicos verticais | Provocado por diferença de temperatura | /400 g) e 15 mm |
| Efeitos em elementos não estruturais | Paredes | Movimentos térmicos horizontais | Provocado por diferença de temperatura | Hi/500 |
| Efeitos em elementos não estruturais | Forros | Revestimentos colados | Ocorrido após a construção do forro | /350 |
| Efeitos em elementos não estruturais | Forros | Revestimentos pendurados ou com juntas | Ocorrido após a construção do forro | /175 |
| Efeitos em elementos não estruturais | Pontes rolantes | Desalinhamento de trilhos | Provocado pelas ações decorrentes da frenação | H/400 |
| Efeitos em elementos estruturais | Afastamento em relação às hipóteses de cálculo | (não informado) | Se os deslocamentos forem relevantes, seus efeitos sobre tensões ou estabilidade devem ser considerados e incorporados ao modelo estrutural | Sem valor numérico |

Notas de rodapé da Tab. 9 (imp. 26, `lajes-bastos.txt:1647–1665`):
- a) As superfícies devem ter inclinação suficiente, ou o deslocamento previsto deve ser compensado por contraflechas, para não haver acúmulo de água.
- b) Os deslocamentos podem ser parcialmente compensados por contraflechas. A contraflecha isolada não pode causar desvio do plano maior que /350.
- c) O vão deve ser tomado na direção em que a parede ou a divisória se desenvolve.
- d) Rotação nos elementos que suportam paredes.
- e) H é a altura total do edifício e Hi é o desnível entre dois pavimentos vizinhos.
- f) O limite aplica-se ao deslocamento lateral entre dois pavimentos consecutivos, devido a ações horizontais. Não se incluem os deslocamentos por deformações axiais dos pilares. Aplica-se também ao deslocamento vertical relativo das extremidades de lintéis ligados a duas paredes de contraventamento, sendo Hi o comprimento do lintel.
- g) O vão refere-se à distância entre o pilar externo e o primeiro pilar interno.

NOTAS 1 a 5 (imp. 27, PDF 31; imagem `norma-scratch/png/lajes-31.png`; `lajes-bastos.txt:1668–1679`). A caixa não indica se é transcrição da norma ou comentário da apostila. [VERIFICAR origem]
1. Os valores-limite supõem vão ℓ apoiado nas duas extremidades em apoios que não se movem. Em balanços, o vão equivalente é o dobro do comprimento do balanço.
2. Para elementos de superfície, os limites consideram ℓ como o menor vão. Na verificação de paredes e divisórias interessa a direção em que a parede se desenvolve, com ℓ limitado a duas vezes o vão menor.
3. O deslocamento total deve ser obtido pela combinação das ações características ponderadas pelos coeficientes da Seção 11.
4. Deslocamentos excessivos podem ser parcialmente compensados por contraflechas.
5. Para a flecha de longa duração, adotar a combinação quase permanente.

Cruzamento secundário: Teshima (2012), TCC da Unesp Guaratinguetá, pp. 42–43 do documento (`norma-scratch/nbr-research/unesp_repo.txt:1100–1140`). A tabela de limites traz /600, /500 ou 10 mm, α = 0,0017, /250 ou 25 mm, os mesmos valores da Tab. 9 desta seção. Fonte secundária; edição de base da norma não confirmada no trecho lido (provável edição anterior a 2014). [VERIFICAR]

Observações para software:
- Para o limite de aceitabilidade visual (/250, "Total"), a nota 2 manda usar o menor vão em lajes de superfície.
- Balanço: usar 2 · comprimento do balanço como vão (nota 1).
- Flecha de longa duração: combinação quase permanente (nota 5; Eq. 47 e Eq. 45).

### 5.5 Flecha imediata em lajes maciças armadas em duas direções (Eq. 45 a 49; Tabelas A-1 a A-4)

| Grandeza | Valor ou expressão | Item / equação | Página | Fonte | Edição |
|---|---|---|---|---|---|
| Flecha imediata | ai = α · b · p · ℓx⁴ / (1200 · EI) | Eq. 45 | imp. 27, PDF 31 | [LAJES] imagem `lajes-31.png` | 2014 |
| Flecha imediata, b = 100 cm | ai = α · p · ℓx⁴ / (12 · EI) | Eq. 46 | imp. 27 | [LAJES] imagem `lajes-31.png`; `lajes-bastos.txt:1691–1694` | 2014 |
| Ação de serviço, quase permanente | Fd,ser = Fgik + Σ ψ2j · Fqjk | Eq. 47 | imp. 27 | [LAJES] `lajes-bastos.txt:1712` | 2014 |
| Rigidez EI | Se Ma > Mr: EI = (EI)eq (Eq. 31). Se Ma < Mr: EI = Ecs · Ic | Eq. 48 | imp. 27 | [LAJES] `lajes-bastos.txt:1718–1719`; imagem `lajes-31.png` | 2014 |
| Flecha total | at = ai · (1 + αf) | Eq. 49 | imp. 27 | [LAJES] `lajes-bastos.txt:1723`; imagem `lajes-31.png` | 2014 |

Definições do texto (imp. 27, `lajes-bastos.txt:1696–1700`):
- ai: flecha imediata. p: carregamento na laje, com a combinação quase permanente. ℓx: menor vão. b: largura unitária da laje.
- α: coeficiente tabelado em função da relação entre os vãos (ver Tabelas A-1 a A-4). A variável exata da tabela não foi confirmada no texto extraído. [VERIFICAR]
- Unidades de p, ℓx e EI não aparecem na página. [NÃO CONFIRMADO]
- Ψ2 (Eq. 47): fator de redução para combinação quase permanente em ELS (Tab. 11.2). Não transcrito.

Coeficientes α das Tabelas A-1 a A-4 (carregamento uniforme e triangular): [NÃO TRANSCRITO nesta seção]. As tabelas estão em `lajes-bastos.txt:4687–5001` (texto extraído). Os valores de α não foram copiados para esta seção.

### 5.6 Flecha imediata em lajes armadas em uma direção (3.10.5.2)

- A apostila calcula a flecha de laje armada em uma direção como viga de largura 1 m (imp. 28, PDF 32, `lajes-bastos.txt:1728–1730`). A flecha total é dada pela Eq. 49.
- As equações das Figuras 17, 18 e 19 dão a flecha imediata. [NÃO TRANSCRITO: figuras não lidas nesta seção]

### 5.7 Edição 2023 (seção 5)

- Nenhum valor desta seção foi lido no texto da NBR 6118:2023. Todos os itens acima estão como [VERIFICAR] para 2023.
- Fonte secundária: `norma-scratch/nbr-research/ufu_tcc.txt:655–680` (Kimura, 2023). Afirma que a edição 2023 manteve a equação única do item 17.3.2.1.1 e acrescentou alternativa para vãos de vigas contínuas. Essa fonte não cita o texto normativo. No mesmo trecho, a figura 27 aparece rotulada como "NBR 6118:2014", o que contradiz a afirmação. [VERIFICAR]
- `NBR6118-2023.md` (outro documento do projeto, linhas 177 e 253) repete a mesma afirmação sobre 17.3.2.1.1. Não é fonte independente.
- Tab. 9 (Tab. 13.3 em 2014): os valores de 2023 não foram lidos. [VERIFICAR]

### 5.8 Verificação desta seção

- Verificado por imagem (PDF e imp. indicados):
  - `lajes-26.png` (PDF 26, imp. 22): Eq. 25 a 29. Lida.
  - `lajes-27.png` (PDF 27, imp. 23): Eq. 30 a 34, conferidas.
  - `lajes-28.png` (PDF 28, imp. 24): Eq. 35 a 40, conferidas.
  - `lajes-29.png` (PDF 29, imp. 25): Eq. 41 a 44 e Tab. 8, conferidas.
  - `lajes-30.png` (PDF 30, imp. 26): Tab. 9, lida.
  - `lajes-31.png` (PDF 31, imp. 27): NOTAS 1 a 5 e Eq. 45 a 49, conferidas.
- Verificado por cálculo: Eq. 42 reproduz os nove valores da Tab. 8 (ver 5.3). Eq. 46 é Eq. 45 com b = 100 cm (100/1200 = 1/12).
- Verificado no texto da apostila: Eq. 25 a 49, Tab. 8, Tab. 9, notas a–g, NOTAS 1 a 5.
- Pistas de uso (não lidas nesta seção): a apostila aplica as Eq. 25, 26, 31, 39 e 46 em exemplos (PDF 59 a 62, imp. 55 a 58, segundo a busca de termos). [NÃO LIDO]
- Não verificado:
  - Qualquer valor de edição 2023.
  - Es (Eq. 33) e o valor de αe.
  - Coeficientes α das Tabelas A-1 a A-4 e as Figuras 17 a 19.
  - Unidades de p, ℓx e EI nas Eq. 45 e 46.
  - Origem normativa da caixa NOTAS 1 a 5 (norma ou apostila).
  - Se a Eq. 31 vale para lajes maciças (a apostila a formula para vigas).
  - Argumento da tabela α na Eq. 45.

## 6. Tabelas de Bares, adaptadas por Pinheiro (1994): momentos em lajes maciças

Escopo: coeficientes μ para momentos fletores em lajes maciças retangulares com carga uniforme (Tabelas A-8 a A-12 da apostila). Foram transcritas A-8, A-9 e A-10 (6.3). A-11 e A-12 não foram transcritas (6.6). As Tabelas A-13 a A-17 (carga triangular) estão fora do escopo.

Não são texto normativo da NBR 6118 e a apostila não as relaciona a nenhuma edição da norma. Edição: não se aplica. [NÃO NORMATIVO]

O motor não usa mais estes valores impressos: `tabelasBares.ts` é gerado pela teoria de placas (`scripts/bares`, `bares-reacoes-flechas.md`). A transcrição abaixo fica como referência publicada; a comparação está em `bares-reacoes-flechas.md`, seção 5.

### 6.1 Origem e atribuição

| Item | Fonte | Página | Situação |
|---|---|---|---|
| Autor das tabelas | Bares, citado em [LAJES] | `lajes-bastos.txt:1121`, `:1127`, `:1133`, `:4131` (PDF 22 e PDF 73) | Bares não tem entrada na bibliografia da apostila. Obra original [NÃO ENCONTRADO] e [NÃO LIDO] |
| Adaptação | Pinheiro, L. M. *Concreto armado: tabelas e ábacos*. São Carlos: Escola de Engenharia de São Carlos, USP, Departamento de Engenharia de Estruturas, 1994 | [LAJES] `lajes-bastos.txt:4674–4675`, PDF 86 (imp. 82) | Referência lida; obra [NÃO LIDO] |
| Uso pela apostila | [LAJES] Bastos, P. S. S. *Lajes de Concreto*. UNESP Bauru, out/2023, 96 p. | `lajes-bastos.txt:1119–1149`, PDF 22 (imp. 18) | Lido e conferido na imagem `png/lajes-bastos-22.png` |
| Czerny | Citado como autor de tabelas | `lajes-bastos.txt:1119–1121` (PDF 22, imp. 18) e `:4129–4131` (PDF 73, imp. 69) | [NÃO ENCONTRADO] (ver 6.5) |

O texto da apostila (`lajes-bastos.txt:1125–1129`, PDF 22, imp. 18) diz: "No caso deste texto são utilizadas as tabelas apresentadas no anexo (Tabela A-8 a Tabela A-17), desenvolvidas por Bares e adaptadas por PINHEIRO (1994)."

O rodapé de cada tabela traz a origem. A posição do rodapé foi conferida: título e rodapé de cada tabela estão na mesma página PDF, em A-1 a A-17.

| Tabelas | Rodapé impresso | PDF (imp.) | Uso neste relatório |
|---|---|---|---|
| A-1 a A-4 (flechas) | "Valores extraídos de BARES e adaptada por PINHEIRO (1994)" | 87 a 90 (imp. 83 a 86) | Fora do escopo; não transcritas |
| A-5 a A-7 (reações de apoio) | "Tabela elaborada por PINHEIRO (1994) conforme NBR 6118" | 91 a 93 (imp. 87 a 89) | Fora do escopo; a edição da NBR não é indicada |
| A-8 a A-10 (momentos, carga uniforme) | "Valores extraídos de BARES e adaptada por PINHEIRO (1994)" | 94 a 96 (imp. 90 a 92) | Transcritas em 6.3 |
| A-11 e A-12 (momentos, carga uniforme) | "Valores extraídos de BARES e adaptada por PINHEIRO (1994)" | 97 a 98 (imp. 93 a 94) | Não transcritas (6.6) |
| A-13 a A-17 (momentos, carga triangular) | "Valores extraídos de BARES e adaptada por PINHEIRO (1994)" | 99 a 103 (imp. 95 a 99) | Fora do escopo |

O número impresso é PDF − 4. Foi conferido na imagem para PDF 22 (imp. 18) e PDF 94 a 96 (imp. 90 a 92). Os demais são calculados pela mesma regra e não foram conferidos na imagem.

No texto corrido, a apostila atribui a Bares as Tabelas A-8 a A-17. As Tabelas A-1 a A-4 recebem o mesmo rótulo só no rodapé, sem menção no texto corrido.

### 6.2 Uso indicado na apostila

Fonte: [LAJES], PDF 22 (imp. 18), salvo indicação.

- Momento: M = μ · p · ℓx² / 100 (Eq. 21; `lajes-bastos.txt:1137`).
- Unidades, na própria página: M em kN·m/m; p em kN/m² (carga uniforme ou triangular); ℓx em m (menor vão da laje).
- λ = ℓy / ℓx. Cada tabela tem as linhas λ = 1,00 a 2,00, com passo 0,05, e uma linha "> 2,00". São 22 linhas por tabela, conferidas em `bares-tabelas.md`.
- μx e μy: coeficientes para momentos positivos nas direções paralelas a ℓx e ℓy (`lajes-bastos.txt:1142–1144`).
- μ'x e μ'y: coeficientes para momentos negativos nas bordas perpendiculares às direções ℓx e ℓy (`lajes-bastos.txt:1145–1147`).
- Tipos de laje (1, 2A, 2B, 3, 4A, 4B, 5A, 5B, 6): cada tabela mostra um desenho com as vinculações. O desenho não foi transcrito. [NÃO TRANSCRITO] Sem o desenho, a coluna de cada tipo não pode ser aplicada a uma laje. As imagens estão em `png/lajes-94.png` a `png/lajes-96.png`.

### 6.3 Tabelas transcritas (A-8, A-9 e A-10)

Transcrição das nove subtabelas feita a partir das imagens das páginas PDF 94 a 96 (imp. 90 a 92), conferida linha a linha contra as imagens. A leitura foi visual, sem OCR. Os cabeçalhos informam a página PDF.


#### Tabela A-8 (PDF p. 94), 22 linhas

**Tipo 1**

| λ = ly/lx | μx | μy |
|---|---|---|
| 1,00 | 4,23 | 4,23 |
| 1,05 | 4,62 | 4,25 |
| 1,10 | 5,00 | 4,27 |
| 1,15 | 5,38 | 4,25 |
| 1,20 | 5,75 | 4,22 |
| 1,25 | 6,10 | 4,17 |
| 1,30 | 6,44 | 4,12 |
| 1,35 | 6,77 | 4,06 |
| 1,40 | 7,10 | 4,00 |
| 1,45 | 7,41 | 3,95 |
| 1,50 | 7,72 | 3,89 |
| 1,55 | 7,99 | 3,82 |
| 1,60 | 8,26 | 3,74 |
| 1,65 | 8,50 | 3,66 |
| 1,70 | 8,74 | 3,58 |
| 1,75 | 8,95 | 3,53 |
| 1,80 | 9,16 | 3,47 |
| 1,85 | 9,35 | 3,38 |
| 1,90 | 9,54 | 3,29 |
| 1,95 | 9,73 | 3,23 |
| 2,00 | 9,91 | 3,16 |
| > 2,00 | 12,50 | 3,16 |

**Tipo 2A**

| λ = ly/lx | μx | μy | μ'y |
|---|---|---|---|
| 1,00 | 2,91 | 3,54 | 8,40 |
| 1,05 | 3,26 | 3,64 | 8,79 |
| 1,10 | 3,61 | 3,74 | 9,18 |
| 1,15 | 3,98 | 3,80 | 9,53 |
| 1,20 | 4,35 | 3,86 | 9,88 |
| 1,25 | 4,72 | 3,89 | 10,16 |
| 1,30 | 5,09 | 3,92 | 10,41 |
| 1,35 | 5,44 | 3,93 | 10,64 |
| 1,40 | 5,79 | 3,94 | 10,86 |
| 1,45 | 6,12 | 3,91 | 11,05 |
| 1,50 | 6,45 | 3,88 | 11,23 |
| 1,55 | 6,76 | 3,85 | 11,39 |
| 1,60 | 7,07 | 3,81 | 11,55 |
| 1,65 | 7,28 | 3,78 | 11,67 |
| 1,70 | 7,49 | 3,74 | 11,79 |
| 1,75 | 7,53 | 3,69 | 11,88 |
| 1,80 | 7,56 | 3,63 | 11,96 |
| 1,85 | 8,10 | 3,58 | 12,05 |
| 1,90 | 8,63 | 3,53 | 12,14 |
| 1,95 | 8,86 | 3,45 | 12,17 |
| 2,00 | 9,08 | 3,36 | 12,20 |
| > 2,00 | 12,50 | 3,36 | 12,20 |

**Tipo 2B**

| λ = ly/lx | μx | μ'x | μy |
|---|---|---|---|
| 1,00 | 3,54 | 8,40 | 2,91 |
| 1,05 | 3,77 | 8,79 | 2,84 |
| 1,10 | 3,99 | 9,17 | 2,76 |
| 1,15 | 4,19 | 9,49 | 2,68 |
| 1,20 | 4,38 | 9,80 | 2,59 |
| 1,25 | 4,55 | 10,06 | 2,51 |
| 1,30 | 4,71 | 10,32 | 2,42 |
| 1,35 | 4,86 | 10,54 | 2,34 |
| 1,40 | 5,00 | 10,75 | 2,25 |
| 1,45 | 5,12 | 10,92 | 2,19 |
| 1,50 | 5,24 | 11,09 | 2,12 |
| 1,55 | 5,34 | 11,23 | 2,04 |
| 1,60 | 5,44 | 11,36 | 1,95 |
| 1,65 | 5,53 | 11,48 | 1,87 |
| 1,70 | 5,61 | 11,60 | 1,79 |
| 1,75 | 5,68 | 11,72 | 1,74 |
| 1,80 | 5,75 | 11,84 | 1,68 |
| 1,85 | 5,81 | 11,94 | 1,67 |
| 1,90 | 5,86 | 12,03 | 1,59 |
| 1,95 | 5,90 | 12,08 | 1,54 |
| 2,00 | 5,94 | 12,13 | 1,48 |
| > 2,00 | 7,03 | 12,50 | 1,48 |

#### Tabela A-9 (PDF p. 95), 22 linhas

**Tipo 3**

| λ = ly/lx | μx | μ'x | μy | μ'y |
|---|---|---|---|---|
| 1,00 | 2,69 | 6,99 | 2,69 | 6,99 |
| 1,05 | 2,94 | 7,43 | 2,68 | 7,18 |
| 1,10 | 3,19 | 7,87 | 2,67 | 7,36 |
| 1,15 | 3,42 | 8,28 | 2,65 | 7,50 |
| 1,20 | 3,65 | 8,69 | 2,62 | 7,63 |
| 1,25 | 3,86 | 9,03 | 2,56 | 7,72 |
| 1,30 | 4,06 | 9,37 | 2,50 | 7,81 |
| 1,35 | 4,24 | 9,65 | 2,45 | 7,88 |
| 1,40 | 4,42 | 9,93 | 2,39 | 7,94 |
| 1,45 | 4,58 | 10,17 | 2,32 | 8,00 |
| 1,50 | 4,73 | 10,41 | 2,25 | 8,06 |
| 1,55 | 4,86 | 10,62 | 2,16 | 8,09 |
| 1,60 | 4,99 | 10,82 | 2,07 | 8,12 |
| 1,65 | 5,10 | 10,99 | 1,99 | 8,14 |
| 1,70 | 5,21 | 11,16 | 1,91 | 8,15 |
| 1,75 | 5,31 | 11,30 | 1,85 | 8,16 |
| 1,80 | 5,40 | 11,43 | 1,78 | 8,17 |
| 1,85 | 5,48 | 11,55 | 1,72 | 8,17 |
| 1,90 | 5,56 | 11,67 | 1,66 | 8,18 |
| 1,95 | 5,63 | 11,78 | 1,63 | 8,19 |
| 2,00 | 5,70 | 11,89 | 1,60 | 8,20 |
| > 2,00 | 7,03 | 12,50 | 1,60 | 8,20 |

**Tipo 4A**

| λ = ly/lx | μx | μy | μ'y |
|---|---|---|---|
| 1,00 | 2,01 | 3,09 | 6,99 |
| 1,05 | 2,32 | 3,23 | 7,43 |
| 1,10 | 2,63 | 3,36 | 7,87 |
| 1,15 | 2,93 | 3,46 | 8,26 |
| 1,20 | 3,22 | 3,56 | 8,65 |
| 1,25 | 3,63 | 3,64 | 9,03 |
| 1,30 | 3,99 | 3,72 | 9,33 |
| 1,35 | 4,34 | 3,77 | 9,69 |
| 1,40 | 4,69 | 3,82 | 10,00 |
| 1,45 | 5,03 | 3,86 | 10,25 |
| 1,50 | 5,37 | 3,90 | 10,49 |
| 1,55 | 5,70 | 3,90 | 10,70 |
| 1,60 | 6,03 | 3,89 | 10,91 |
| 1,65 | 6,35 | 3,85 | 11,08 |
| 1,70 | 6,67 | 3,81 | 11,24 |
| 1,75 | 6,97 | 3,79 | 11,39 |
| 1,80 | 7,27 | 3,76 | 11,53 |
| 1,85 | 7,55 | 3,72 | 11,65 |
| 1,90 | 7,82 | 3,67 | 11,77 |
| 1,95 | 8,09 | 3,60 | 11,83 |
| 2,00 | 8,35 | 3,52 | 11,88 |
| > 2,00 | 12,50 | 3,52 | 11,88 |

**Tipo 4B**

| λ = ly/lx | μx | μ'x | μy |
|---|---|---|---|
| 1,00 | 3,09 | 6,99 | 2,01 |
| 1,05 | 3,22 | 7,20 | 1,92 |
| 1,10 | 3,35 | 7,41 | 1,83 |
| 1,15 | 3,46 | 7,56 | 1,73 |
| 1,20 | 3,57 | 7,70 | 1,63 |
| 1,25 | 3,66 | 7,82 | 1,56 |
| 1,30 | 3,74 | 7,93 | 1,49 |
| 1,35 | 3,80 | 8,02 | 1,41 |
| 1,40 | 3,86 | 8,11 | 1,33 |
| 1,45 | 3,91 | 8,13 | 1,26 |
| 1,50 | 3,96 | 8,15 | 1,19 |
| 1,55 | 4,00 | 8,20 | 1,14 |
| 1,60 | 4,04 | 8,25 | 1,08 |
| 1,65 | 4,07 | 8,28 | 1,03 |
| 1,70 | 4,10 | 8,30 | 0,98 |
| 1,75 | 4,12 | 8,31 | 0,95 |
| 1,80 | 4,14 | 8,32 | 0,91 |
| 1,85 | 4,15 | 8,33 | 0,87 |
| 1,90 | 4,16 | 8,33 | 0,83 |
| 1,95 | 4,16 | 8,33 | 0,80 |
| 2,00 | 4,17 | 8,33 | 0,76 |
| > 2,00 | 4,17 | 8,33 | 0,76 |

#### Tabela A-10 (PDF p. 96), 22 linhas

**Tipo 5A**

| λ = ly/lx | μx | μ'x | μy | μ'y |
|---|---|---|---|---|
| 1,00 | 2,02 | 5,46 | 2,52 | 6,17 |
| 1,05 | 2,27 | 5,98 | 2,56 | 6,46 |
| 1,10 | 2,52 | 6,50 | 2,60 | 6,75 |
| 1,15 | 2,76 | 7,11 | 2,63 | 6,97 |
| 1,20 | 3,00 | 7,72 | 2,65 | 7,19 |
| 1,25 | 3,23 | 8,81 | 2,64 | 7,36 |
| 1,30 | 3,45 | 8,59 | 2,61 | 7,51 |
| 1,35 | 3,66 | 8,74 | 2,57 | 7,63 |
| 1,40 | 3,86 | 8,88 | 2,53 | 7,74 |
| 1,45 | 4,05 | 9,16 | 2,48 | 7,83 |
| 1,50 | 4,23 | 9,44 | 2,43 | 7,91 |
| 1,55 | 4,39 | 9,68 | 2,39 | 7,98 |
| 1,60 | 4,55 | 9,91 | 2,34 | 8,02 |
| 1,65 | 4,70 | 10,13 | 2,28 | 8,03 |
| 1,70 | 4,84 | 10,34 | 2,22 | 8,10 |
| 1,75 | 4,97 | 10,53 | 2,15 | 8,13 |
| 1,80 | 5,10 | 10,71 | 2,08 | 8,17 |
| 1,85 | 5,20 | 10,88 | 2,02 | 8,16 |
| 1,90 | 5,30 | 11,04 | 1,96 | 8,14 |
| 1,95 | 5,40 | 11,20 | 1,88 | 8,13 |
| 2,00 | 5,50 | 11,35 | 1,80 | 8,12 |
| > 2,00 | 7,03 | 12,50 | 1,80 | 8,12 |

**Tipo 5B**

| λ = ly/lx | μx | μ'x | μy | μ'y |
|---|---|---|---|---|
| 1,00 | 2,52 | 6,17 | 2,02 | 5,46 |
| 1,05 | 2,70 | 6,47 | 1,97 | 5,56 |
| 1,10 | 2,87 | 6,76 | 1,91 | 5,65 |
| 1,15 | 3,02 | 6,99 | 1,84 | 5,70 |
| 1,20 | 3,16 | 7,22 | 1,77 | 5,75 |
| 1,25 | 3,28 | 7,40 | 1,70 | 5,75 |
| 1,30 | 3,40 | 7,57 | 1,62 | 5,76 |
| 1,35 | 3,50 | 7,70 | 1,55 | 5,75 |
| 1,40 | 3,59 | 7,82 | 1,47 | 5,74 |
| 1,45 | 3,67 | 7,91 | 1,41 | 5,73 |
| 1,50 | 3,74 | 8,00 | 1,35 | 5,72 |
| 1,55 | 3,80 | 8,07 | 1,29 | 5,69 |
| 1,60 | 3,86 | 8,14 | 1,23 | 5,66 |
| 1,65 | 3,91 | 8,20 | 1,18 | 5,62 |
| 1,70 | 3,95 | 8,25 | 1,13 | 5,58 |
| 1,75 | 3,99 | 8,30 | 1,07 | 5,56 |
| 1,80 | 4,02 | 8,34 | 1,00 | 5,54 |
| 1,85 | 4,05 | 8,38 | 0,97 | 5,55 |
| 1,90 | 4,08 | 8,42 | 0,94 | 5,56 |
| 1,95 | 4,10 | 8,45 | 0,91 | 5,60 |
| 2,00 | 4,12 | 8,47 | 0,88 | 5,64 |
| > 2,00 | 4,17 | 8,33 | 0,88 | 5,64 |

**Tipo 6**

| λ = ly/lx | μx | μ'x | μy | μ'y |
|---|---|---|---|---|
| 1,00 | 2,02 | 5,15 | 2,02 | 5,15 |
| 1,05 | 2,22 | 5,50 | 2,00 | 5,29 |
| 1,10 | 2,42 | 5,85 | 1,98 | 5,43 |
| 1,15 | 2,65 | 6,14 | 1,94 | 5,51 |
| 1,20 | 2,87 | 6,43 | 1,89 | 5,59 |
| 1,25 | 2,97 | 6,67 | 1,83 | 5,64 |
| 1,30 | 3,06 | 6,90 | 1,77 | 5,68 |
| 1,35 | 3,19 | 7,09 | 1,71 | 5,69 |
| 1,40 | 3,32 | 7,28 | 1,65 | 5,70 |
| 1,45 | 3,43 | 7,43 | 1,57 | 5,71 |
| 1,50 | 3,53 | 7,57 | 1,49 | 5,72 |
| 1,55 | 3,61 | 7,68 | 1,43 | 5,72 |
| 1,60 | 3,69 | 7,79 | 1,36 | 5,72 |
| 1,65 | 3,76 | 7,88 | 1,29 | 5,72 |
| 1,70 | 3,83 | 7,97 | 1,21 | 5,72 |
| 1,75 | 3,88 | 8,05 | 1,17 | 5,72 |
| 1,80 | 3,92 | 8,12 | 1,13 | 5,72 |
| 1,85 | 3,96 | 8,18 | 1,07 | 5,72 |
| 1,90 | 3,99 | 8,24 | 1,01 | 5,72 |
| 1,95 | 4,02 | 8,29 | 0,99 | 5,72 |
| 2,00 | 4,05 | 8,33 | 0,96 | 5,72 |
| > 2,00 | 4,17 | 8,33 | 0,96 | 5,72 |

### 6.4 Valores que parecem anômalos em A-8 a A-10

Os valores abaixo vêm de `bares-tabelas.md`, conferidos contra as imagens `png/lajes-94.png` a `png/lajes-96.png` na etapa anterior. Nenhum valor foi corrigido. Todos ficam [VERIFICAR] até que uma nova leitura da imagem ou a obra de Bares confirme.

| Tabela | Tipo | Coluna | Valores (λ entre parênteses) | Observação |
|---|---|---|---|---|
| A-8 | 1 | μx | 9,91 (2,00) → 12,50 ("> 2,00") | Salto entre 2,00 e "> 2,00" |
| A-8 | 2A | μx | 7,53 (1,75), 7,56 (1,80), 8,10 (1,85), 8,63 (1,90), 9,08 (2,00) → 12,50 ("> 2,00") | Salto entre 2,00 e "> 2,00" |
| A-8 | 2B | μ'x | 12,13 (2,00) → 12,50 ("> 2,00") | Salto pequeno. Na mesma tabela, μx vai de 5,94 (2,00) a 7,03 ("> 2,00") |
| A-9 | 3 | μx | 5,70 (2,00) → 7,03 ("> 2,00") | Salto. Na mesma tabela, μ'x vai de 11,89 (2,00) a 12,50 ("> 2,00") |
| A-9 | 4A | μx | 8,35 (2,00) → 12,50 ("> 2,00") | Salto entre 2,00 e "> 2,00" |
| A-10 | 5A | μx | 5,50 (2,00) → 7,03 ("> 2,00") | Salto entre 2,00 e "> 2,00" |
| A-10 | 5A | μ'x | 7,11 (1,15), 7,72 (1,20), 8,81 (1,25), 8,59 (1,30), 8,74 (1,35) | Pico isolado em 1,25. A série cresce até 1,25 e cai em 1,30, fora da tendência das linhas vizinhas. Possível erro de leitura ou de impressão |
| A-10 | 5B | μ'x | 8,47 (2,00) → 8,33 ("> 2,00") | Queda no último valor. Na mesma tabela, μx vai de 4,12 (2,00) a 4,17 ("> 2,00") |

Observações:

- A-9, Tipo 4B, μ'x vai de 8,25 (1,60) a 8,33 (1,85) e fica nesse valor até "> 2,00". É um platô, não um salto. Não é tratado como anomalia.
- [INTERPRETAÇÃO] O valor 12,50 corresponde a μ = 100/8, ou seja, M = p·ℓx²/8, o momento de uma viga biapoiada de vão ℓx. A linha "> 2,00" parece usar esse caso de laje armada em uma direção. A apostila não explica nem o salto em λ = 2,00 nem a origem do valor "> 2,00". Esta explicação é interpretação deste relatório, não consta do texto lido.

### 6.5 Czerny

[NÃO ENCONTRADO] Valores tabelados de Czerny. A apostila cita Czerny apenas como autor de tabelas, sem coeficientes, em `lajes-bastos.txt:1119` (PDF 22, imp. 18) e `lajes-bastos.txt:4131` (PDF 73, imp. 69). Nenhum rodapé de A-1 a A-17 cita Czerny. A obra de Czerny não foi consultada. [NÃO LIDO]

### 6.6 Verificação

Verificado no texto da apostila, nesta etapa:

- `lajes-bastos.txt:1117–1149` (PDF 22, imp. 18): menções a Bares e Czerny, texto de adaptação por Pinheiro, Eq. 21, unidades e convenção de μ.
- `lajes-bastos.txt:4129–4131` (PDF 73, imp. 69) e `:4674–4675` (PDF 86, imp. 82).
- Busca por "Bares" e "Czerny" no arquivo inteiro: as ocorrências são as citadas acima e os 14 rodapés "Valores extraídos de BARES" (A-1 a A-4 e A-8 a A-17). Nenhum dos dois aparece em entrada bibliográfica.
- Rodapés "Tabela elaborada por PINHEIRO (1994) conforme NBR 6118" (`:5061`, `:5128`, `:5195`, A-5 a A-7).

Verificado na imagem, em etapa anterior:

- PDF 22 (`png/lajes-bastos-22.png`): Eq. 21, unidades (kN·m/m, kN/m², m) e convenção de μ.
- PDF 94 a 96 (`png/lajes-94.png` a `png/lajes-96.png`, imp. 90 a 92): valores de A-8 a A-10 conferidos linha a linha contra `bares-tabelas.md`.

Verificado na estrutura de `bares-tabelas.md`, nesta etapa:

- Nove subtabelas (Tipos 1, 2A, 2B, 3, 4A, 4B, 5A, 5B e 6), 22 linhas de dado cada: 21 valores de λ de 1,00 a 2,00 com passo 0,05, mais "> 2,00".

Não verificado:

- A-11 e A-12 (PDF 97 e 98, imp. 93 e 94): páginas renderizadas, sem transcrição. [NÃO TRANSCRITO] Os números impressos são estimados pela regra PDF − 4 e não foram conferidos na imagem.
- A-13 a A-17 (carga triangular): fora do escopo.
- Desenhos de vinculação de cada tipo: [NÃO TRANSCRITO]. Por isso a correspondência tipo → vinculação não foi verificada.
- Obras primárias de Bares e de Pinheiro (1994): [NÃO LIDO].
- Números impressos de PDF 73 e 86: calculados pela regra PDF − 4, não conferidos na imagem.
- Anomalias da 6.4: não confirmadas contra a obra original nem por nova leitura da imagem.
- Valores das Tabelas A-1 a A-7: não transcritos e não verificados.

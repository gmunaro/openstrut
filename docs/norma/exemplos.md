# Exemplos numéricos resolvidos: NBR 6118 (2014/2023)

Coletados em 2026-10-12 para virarem casos de teste automatizados. Os valores são os impressos pelo autor, sem rearredondamento. Quando o autor escreve um resultado arredondado (ex.: "5,0" para um produto que dá 5,04), o valor impresso é mantido e o produto bruto aparece entre parênteses, só para conferência.

## Convenções

- **p. X**: número de página impresso no cabeçalho do topo da página. O texto entre o cabeçalho X e o cabeçalho X+1 está na página X. Conferido pelo índice da apostila (3.17 na p. 43; 3.17.1 na p. 45; 3.17.6.2 na p. 57).
- **Edição da norma**: o que o próprio exemplo ou a apostila declaram. Quando o exemplo cita "NBR 6118" sem ano, está escrito assim.
- **bruto**: produto que eu recalculei a partir dos valores impressos, entre parênteses, só para conferência.
- **não verificado**: não confirmei por texto extraído ou figura.
- **figura**: informação que só aparece em figura. Não consegui renderizar figuras neste ambiente (sem `pdftoppm`).

## Ressalva de acesso e procedência

- `https://wwwp.feb.unesp.br/` tem certificado TLS expirado. Os PDFs foram baixados com `curl -k` (sem verificação de certificado) para `C:/Users/MunaroPC/AppData/Local/Temp/bastos/`. O texto foi extraído com `pdftotext -layout -enc UTF-8`.
- Os metadados de criação dos PDFs (não confundir com a data de publicação do exemplo) são: Lajes 2023-11-27; FlexaoSimples 2023-11-27; Vigas 2024-04-30; Cortante 2025-03-25; Pilares 2024-06-20.
- Edição declarada pela própria apostila: a apresentação (texto antes da p. 1, linha 23 do texto extraído) diz que o texto segue "as novas prescrições contidas na NBR 6118/2023". A nota 2 da p. 1 cita "NBR 6118, ABNT, 2023". Os exemplos de lajes citam "NBR 6118" sem ano, salvo onde indicado.

---

## Lajes maciças

Fonte comum: Paulo Sérgio dos Santos Bastos, *Lajes de Concreto*, apostila UNESP/FEB (Bauru), DEC. URL: `https://wwwp.feb.unesp.br/pbastos/concreto1/Lajes.pdf`. Exemplo 3.16.2 nas pp. 41 a 43; exemplo 3.17 nas pp. 43 a 60.

### E01: Laje maciça retangular com uma borda livre, esforços por tabela de Bares (exemplo 3.16.2)

**Fonte**: exemplo 3.16.2, pp. 41 a 43. Tabelas do anexo: A-22 (p. 104) e A-24 (p. 106).

**Edição da norma**: nenhuma para os esforços (teoria de placas por tabela). A única menção a norma é "NB6118/03" (p. 43), na alternativa por áreas de influência.

**Entrada**
- Enunciado (p. 41): "Considerando a laje da Figura 44, calcular os esforços solicitantes. Dado: F = 6,0 kN/m² (carga total uniformemente distribuída na área)". Lados engastados (p. 41).
- Vãos: x = 3,0 m (menor), y = 4,5 m. λ = y/x = 1,5 (p. 42).
- Vinculação: o texto diz "devido aos lados engastados" (p. 42). O esquema da Figura 44 (p. 42) é **figura, não verificado**.
- Tabelas usadas: A-22, linha 1, "carga 1 (uniforme na área)"; A-24, caso A-25 (p. 42, com os valores na p. 43).

**Intermediários**
- P = F · x · y = 6,0 · 3,0 · 4,5 = 81,0 kN (p. 42).
- Coeficientes da Tabela A-22, linha 1, λ = 1,5 (p. 42): mr = 22,5; mx = 27,6; my = 130; −nr = 11,2; −nx = 14,1; −ny = 19,3.
- Coeficientes da Tabela A-24, caso A-25 (p. 43): Vx1 = 0,50; Vx2 = 0,28; Vy = 0,22.

**Resultados (momentos, p. 42)**

| Grandeza | Coef. | Cálculo (P/coef.) | Valor impresso |
|---|---|---|---|
| Mr (vão, direção r) | mr = 22,5 | 81,0 / 22,5 | 3,60 kN·m (360 kN·cm) |
| Mx | mx = 27,6 | 81,0 / 27,6 | 2,93 kN·m (293 kN·cm) |
| My | my = 130 | 81,0 / 130 | 0,62 kN·m (62 kN·cm) |
| Xr (engaste r) | −nr = 11,2 | 81,0 / 11,2 | 7,23 kN·m (723 kN·cm) |
| Xx (engaste x) | −nx = 14,1 | 81,0 / 14,1 | 5,74 kN·m (574 kN·cm) |
| Xy (engaste y) | −ny = 19,3 | 81,0 / 19,3 | 4,20 kN·m (420 kN·cm) |

O momento volvente Mxy não foi considerado, porque o texto diz que é pequeno devido aos lados engastados (p. 42).

**Resultados (reações, p. 43)**
- Rx1 = p · Lx · Vx1 = 6,0 · 3,0 · 0,50 = **9,0 kN/m**.
- Rx2 = p · Lx · Vx2 = 6,0 · 3,0 · 0,28 = **5,0 kN/m** (bruto 5,04).
- Ry = p · Ly · Vy = 6,0 · 4,5 · 0,22 = **5,9 kN/m** (bruto 5,94).
- Verificação impressa: (5,0 + 9,0) · 4,5 + 5,9 · 3,0 = 80,7 kN ≈ 81,0 kN (p. 43).
- Alternativa por áreas de influência, citada como "NB6118/03" (p. 43): Rx1 = 9,0 kN; Rx2 = 5,2 kN; Ry = 5,7 kN.

**Armadura, flecha**: o exemplo não dimensiona armadura nem calcula flecha.

---

### E02: Laje L2 do pavimento, armada em duas direções: pré-dimensionamento, ações, esforços, armadura e flecha (exemplo 3.17)

**Fonte**: exemplo 3.17, pp. 43 a 57 (texto; L2 nas pp. 45 a 57).

**Edição da norma**: "NBR 6118" sem ano no exemplo. A apresentação da apostila declara a NBR 6118/2023 (ver Ressalva).

**Entrada**
- Vãos efetivos (Tabela 14, p. 45): x = 586 cm; y = 606 cm; y/x = 1,03; tipo 3; armada em duas direções.
- Vãos efetivos: a1 = a2 = 3 cm (t/2 = 20/2 = 10 cm, 0,3·h = 3 cm, para h = 10 cm inicial) e ℓef = ℓ0 + a1 + a2 (p. 45).
- Pré-dimensionamento (Tabela 15, p. 46): ℓ* = 0,7 · y = 424 cm (4,24 m); n = 2; d = (2,5 − 0,1 · n) · ℓ* = 9,8 cm (impresso; bruto 9,75).
- Altura adotada: h = d + 2,5 = 12,3 arredondado para **h = 12 cm** (p. 46).
- Ações (Tabela 16, p. 47), em kN/m²:
  - peso próprio 0,12 · 25 = 3,00;
  - revestimento inferior 0,02 · 19 = 0,38;
  - piso 0,03 · 21 + 0,15 = 0,78;
  - parede: 0,12 (impresso);
  - permanente 4,28;
  - variável 1,5;
  - total 5,78 kN/m².

**Intermediários (reações, Tabela 17, p. 49)**: Vx = 7,69 kN/m; V'x = 11,25 kN/m; Vy = 7,35 kN/m; V'y = 10,74 kN/m. O cálculo está nas linhas 2932 a 2936 do texto extraído (p. 49).

**Intermediários (momentos característicos, Tabela 18, p. 52)**: Mx = 5,84; M'x = 14,75; My = 5,32; M'y = 14,25 kN·m/m.

**Armadura negativa (p. 53)**
- Mk negativo da L2 = 1425 kN·cm/m (Figura 56, texto p. 52/53). Este valor coincide com M'y = 14,25 kN·m/m da Tabela 18 (observação minha).
- Md = γf · Mk = 1,4 · 1425 = 1995 kN·cm/m.
- d = h − 2 = 10 cm.
- Kc = bw · d² / Md = 5,0 (bruto 5,01).
- Ks = 0,025 (Tabela A-25, C25, domínio 2); βx = 0,18 ≤ 0,45 ok.
- As = Ks · Md / d = 4,99 cm²/m (bruto 4,99) ≥ 0,15 h = 1,80 cm²/m ok.

**Armadura negativa da L3 (p. 53), usada para compatibilização**
- Mk = 1663 kN·cm/m; Md = 1,4 · 1663 = 2328,2 kN·cm/m; d = 11 cm; Kc = 5,2; βx = 0,17.
- As impresso = 5,30 cm²/m (p. 53); bruto 5,29 (0,025 · 2328,2 / 11 = 5,2913). Divergência de arredondamento, **registrada**: o teste deve usar 5,30 impresso e tolerância de arredondamento.
- Mínimo 0,15 · 13 = 1,95 cm²/m ok.

**Compatibilização (p. 54)**: "entre as duas armaduras negativas calculadas adota-se a maior (5,30 cm²/m)", ao longo da borda comum às duas lajes. O texto cita a NBR 6118 (item 14.7.6.2) para a compatibilização.

**Armadura positiva (p. 54)**
- Mk = 584 kN·cm/m (Mx = 5,84 kN·m/m, Tabela 18).
- d = h − 2,5 = 9,5 cm; Md = 1,4 · 584 = 817,6 kN·cm/m.
- Kc = 11,0 (bruto 11,04); Ks = 0,024; βx = 0,08.
- As = 2,07 cm²/m (bruto 2,07) ≥ 0,10 h = 1,20 cm²/m ok.

**Flecha (pp. 55 a 57)**
- Momento de fissuração: Mr = α · fct · Ic / yt = 1,5 · 0,2565 · 14400 / 6 = 923 kN·cm (p. 56). fct,m = 0,3 · fck^(2/3) = 0,2565 kN/cm² (fck = 25 MPa).
- Ma = 584 kN·cm (maior entre 584 e 532, Figura 56) (p. 56). Ma < Mr, portanto Estádio I (p. 56).
- Ecs = αi · 5600 · √fck = 0,86 · 5600 · 5 = 24 080 MPa (impresso, p. 56). Com αi sem arredondamento (0,8 + 0,2 · 25/80 = 0,8625) daria 24 150 MPa. Usar 24 080 impresso.
- EI = Ecs · Ic = 2408 · 14400 = **34 675 200 kN·cm²** (p. 56).
- Fd,ser = Σ Fgik + Σ ψ2j Fqjk = 4,28 + 0,3 · 1,5 = 4,73 kN/m² (p. 56). Carga na laje: 4,73 · 10⁻³ kN/cm².
- ai = (α/12) · p · x⁴ / EI, com α = 2,72 (Tabela A-1, duas direções). Resultado impresso: **ai = 0,36 cm** (p. 56). Conta sem arredondamento: 0,3646 cm (bruto).
- Coeficiente ξ: ξ(t∞) = 2,00; ξ(t0) = 0,68 (Tabela 8); Δξ = 1,32.
- at = ai · (1 + Δξ) = 0,36 · 2,32 = 0,835 (bruto); impresso **at = 0,85 cm** (p. 57). Com ai sem arredondamento, 0,3646 · 2,32 = 0,846, que arredonda para 0,85.
- Limites (Tabela 9, p. 57): L/250 = 586/250 = **2,34 cm**; L/350 = 586/350 = **1,67 cm** (impressos). at = 0,85 cm < ambos: aceito.

---

### E03: Laje L1 em balanço (varanda), armada em uma direção: esforços, armadura e flecha (exemplo 3.17)

**Fonte**: exemplo 3.17, L1 nas pp. 45 a 59.

**Edição da norma**: "NBR 6118" sem ano no exemplo (ver Ressalva).

**Entrada**
- Vão efetivo x = 163 cm (Tabela 14, nota a, p. 45). Laje armada em uma direção, com três bordas livres e engastada na L2 (nota a, p. 45). Calculada como barra engastada na L2 e livre na outra extremidade (p. 45).
- Ações (Tabela 16, p. 47), em kN/m²: peso próprio 3,00; revestimento inferior 0,38; piso 0,78; parede (gradil) 0,17; permanente 4,33; variável 2,5 (varanda com acesso público; Tabela 3 da apostila, texto l.2586 e l.655-666); total 6,83.
- Gradil (nota 3, p. 47): carga linear de 0,5 kN/m (50 kgf/m) na borda livre. Parede equivalente: 2 · (0,5 · 1,63) / (1,63 · 6,0) = 0,17 kN/m² (bruto 0,1667).
- Parapeito: carga linear de 2 kN/m (NBR 6120, Figura 51). Não entra no cálculo de flecha (p. 58).
- Altura h = 12 cm; d = h − 2 = 10 cm.

**Armadura (p. 54)**
- Mk = 1314 kN·cm/m. **Origem não verificada**: o texto usa o valor direto na fórmula (p. 54), mas não explica sua obtenção no trecho lido. A Figura 57 (p. 54) mostra valores de momento, e não consegui ler a figura.
- Md = 1,4 · 1,35 · 1314 = 2483,5 kN·cm/m (bruto 2483,46). O coeficiente n = 1,35 vem da Tabela 4 para h = 12 cm (p. 54).
- Kc = 4,0 (bruto 4,03); Ks = 0,025; βx = 0,23 ≤ 0,45 ok.
- As = 6,21 cm²/m (bruto 6,21) ≥ 0,15 h = 1,80 cm²/m ok.
- Adotado (p. 58): φ 8 mm c/ 8 cm = 6,25 cm²/m (Figura 59, figura não verificada).

**Flecha (pp. 57 a 59)**
- Mr = 923 kN·cm (p. 57; igual ao da L2 por ter a mesma altura h = 12 cm).
- Ma = 6,83 · 1,63² / 2 + 0,5 · 1,63 = 9,89 kN·m = **989 kN·cm** (p. 58). Ma > Mr, portanto Estádio II (p. 58).
- Relação modular αe = Es / Ecs = 21000 / 2408 = 8,72 (p. 58).
- Linha neutra no Estádio II: xII = 2,70 cm (p. 58). Momento de inércia no Estádio II: III = 3560,4 cm⁴ (p. 58).
- (EI)eq = Ecs · [(Mr/Ma)³ · Ic + (1 − (Mr/Ma)³) · III] = **29 790 540 kN·cm²** (impresso, p. 58). Recálculo meu dá cerca de 29,8 · 10⁶ kN·cm², consistente dentro de arredondamento.
- Ecs · Ic = 2408 · 14400 = 34 675 200 kN·cm² (p. 58; o texto usa como comparação, "ok!").
- Fd,ser = Σ Fgik + Σ ψ2j Fqjk = 4,33 + 0,4 · 2,5 = 5,33 kN/m² (p. 59). ψ2 = 0,4 (texto; p. 59). Carga linear equivalente: 5,33 kN/m (largura 1 m). Carga do gradil P = 0,5 kN/m (p. 59; texto l.3628: "A carga do gradil (P) é 0,5 kN/m").
- ai = (1/8) · p · x⁴ / EI + (1/3) · P · x³ / EI = **0,18 cm** (impresso, p. 59). Fórmula de balanço: ver item 3.17.6.2 do texto; a extração desta linha está com problemas de formatação. O valor 0,18 fecha com os termos acima (conferido por mim).
- Coeficiente ξ = 1,32 (mesmo da L2); at = 0,18 · (1 + 1,32) = **0,42 cm** (p. 59).
- Limites para balanço (2 · L): 2 · 163 / 250 = **1,30 cm**; 2 · 163 / 350 = **0,93 cm** (impressos, p. 59). at = 0,42 cm < ambos: aceito.

---

## Pendências desta seção (Lajes)

- **Mk = 1314 kN·cm/m da L1** (p. 54): origem não explicitada no texto lido. Figura 57 não legível aqui. Usar como valor de entrada, marcado como não verificado de origem.
- **Tabela 19 (p. 55)**: extração com linhas misturadas. Linha de L1 (h 12, Mr 923, Ma 989, EI 29 790 540, ai 0,18, at 0,42, ψ2q 1,00) e linha de L2 (h 12, Mr 923, Ma 584, α 2,72, EI 34 675 200, ai 0,36, at 0,85) são legíveis. A linha h 13, Mr 1083, Ma 721, EI 44 086 467 é da L3 (inferência por coerência; não usada nos testes).
- **As da L3**: 5,30 impresso, 5,29 bruto. Registrado.
- **αi = 0,86** impresso (0,8625 sem arredondamento): altera Ecs em cerca de 0,3%. Usar 24 080 MPa impresso.
- **Unidade de P na flecha da L1**: resolvida. O texto diz "A carga do gradil (P) é 0,5 kN/m" (p. 59, texto l.3628). O resultado 0,18 cm fecha com P = 0,5 kN/m.
- **at da L2**: 0,85 impresso; 0,835 com ai impresso (0,36), 0,846 com ai sem arredondamento. Usar tolerância no teste.
- Não há dimensionamento de armadura positiva da L1 nem de flecha da L3/L4 neste conjunto.

---

## Vigas em flexão normal simples e dupla armadura

Fonte comum: Paulo Sérgio dos Santos Bastos, *Flexão Normal Simples - Vigas*, apostila UNESP/FEB (Bauru), capa datada out/2023. URL: `https://wwwp.feb.unesp.br/pbastos/concreto1/FlexaoSimples.pdf`. Exemplos 7.3 (pp. 17 a 30) e 8.3 (pp. 37 a 43), conforme o sumário (7 → p. 13; 7.3 → p. 17; 8 → p. 33; 8.3 → p. 37; 9 → p. 43). O arquivo `Vigas.pdf` (concreto2) não foi usado nesta seção.

**Edição da norma (vale para os cinco exemplos)**: os exemplos citam "NBR 6118" sem ano. A apresentação (texto antes da p. 1, l.22) diz "NBR 6118/2023". A bibliografia (l.140) cita a NBR 6118 sem ano. A l.109 traz "NBR 6118/232", que parece "2023" com nota colada na extração; **não verificado**. Para a armadura de pele, o texto usa a "NB 1/1978" (0,05% · bw · h), recomendada para h ≥ 50 cm (l.601, l.1552, l.1856). A própria apostila diz que a NBR 6118 (Eq. 11) só exige pele para h > 60 cm (l.1855).

**Figuras**: as figuras desta seção (18 a 35) não foram renderizadas neste ambiente. Os rótulos vêm do texto extraído. Qualquer valor que só aparece na figura está marcado como **figura, não verificado**.

---

### E04: Viga biapoiada com armadura simples, momento positivo (exemplo 7.3, nº 1)

**Fonte**: exemplo 7.3, nº 1, pp. 18 a 23 (l.1081 a 1398 do texto extraído). Figuras 18 a 21 (**figura, não verificado**).

**Entrada**
- Momento característico máximo: Mk,máx = +10.000 kN·cm. Md = γf · Mk = 1,4 · 10.000 = 14.000 kN·cm.
- Seção: h = 50 cm; bw = 20 cm; d inicial = 47 cm; c = 2,0 cm; t = 5 mm.
- Materiais: C20 (Grupo I), CA-50; γc = 1,4; γs = 1,15; brita 1 (dmáx = 19 mm).

**Intermediários e resultados**

| Grandeza | Valor impresso | Origem no texto |
|---|---|---|
| x2lim / x3lim | 12,2 cm / 29,6 cm | l.1081 a 1137 |
| x (Eq. 23) | 18,1 cm | l.1137-1138 (raiz 99,4 descartada) |
| x/d | 0,39 | ≤ 0,45, ok |
| As (Eq. 25) | 8,10 cm² | |
| As,mín | 1,50 cm² | Tabela 2 (0,15% · 20 · 50) |
| Kc | 3,2 | |
| x̄ | 0,38 | |
| Ks | 0,027 | |
| As (Eq. 33) | 8,04 cm² | |

**Arranjos testados** (l.1233-1235): 16Ø8 (8,00); 10Ø10 (8,00); 7Ø12,5 (8,75); 4Ø16 (8,00); 3Ø16 + 2Ø12,5 (8,50); 3Ø20 (9,45); 2Ø20 + 1Ø16 (8,30); 2Ø20 + 2Ø12,5 (8,80). As áreas seguem a Tabela A-4.

**Adotado**: 4Ø16 = 8,00 cm² (Figura 20, l.1299-1303). O texto indica 7Ø12,5 como "atividade do estudante" (l.1300).

**Detalhamento**
- acg = 2,0 + 0,5 + 1,6/2 = 3,3 cm; d = 50 − 3,3 = **46,7 cm**.
- Armadura de pele: 0,50 cm² (NB 1/1978); adotado 3Ø5 (0,60 cm²); dois porta-estribos.
- εsd = 5,5‰ (Eq. 27, l.1378-1379).

**Observação**: x e As foram calculados com d = 47 cm (inicial), não com d = 46,7 cm.

---

### E05: Viga para momento máximo positivo, dois casos de dimensionamento (exemplo 7.3, nº 2)

**Fonte**: exemplo 7.3, nº 2, pp. 23 a 28 (l.1399 a 1686). Figuras 22 a 26 (**figura, não verificado**).

**Entrada**
- Materiais: C25; CA-50; brita 1.
- Seção: bw = 20 cm; t = 5 mm; c = 2,5 cm.
- Mk,máx = +12.570 kN·cm; Md = 17.598 kN·cm (l.1434).

**Caso (a): x = x2lim = 0,26d**
- Kc = 3,5; Ks = 0,026 (l.1441-1442); d = 55,5 cm.
- As = 8,24 cm² (l.1451). Arranjo 3Ø16 + 2Ø12,5 = 8,50 cm².
- x = 14,4 cm.
- ah,mín = 2,3 cm. ah = 1,7 cm com 5 barras em uma camada (l.1517). ah = 2,7 cm com 3Ø16 + 1Ø12,5 na primeira camada (l.1525).
- h = 60,1 → **60 cm**; acg = 4,6 cm.
- As,mín = 1,80 cm². Armadura de pele = 0,6 cm² (l.1554).

**Caso (b): x = 0,45d**
- Kc = 2,2; Ks = 0,028 (l.1561-1562); d = 44,0 cm.
- As = 11,20 cm²; arranjo 6Ø16 = 12,00 cm²; x = 19,8 cm; εsd = 4,3‰.
- Detalhamento: 4Ø16 + 2Ø16 em duas camadas; av,mín = 2,0 cm; acg = 5,1 cm; h = 49,1 → **50 cm** adotado (l.1661-1662).

**Comparação impressa** (l.1666-1668): caso (a), h = 60 cm, As = 8,24 cm²; caso (b), h = 50 cm, As = 11,20 cm².

**Observação**: no caso (a), 60 − 4,6 = 55,4 cm, e o texto usa d = 55,5 cm. A diferença vem do h = 60,1 usado antes do arredondamento; não usar como teste de precisão.

---

### E06: Viga de apoio com momento negativo, armadura simples (exemplo 7.3, nº 3)

**Fonte**: exemplo 7.3, nº 3, pp. 28 a 30 (l.1687 a 1858). Figura 27 (**figura, não verificado**).

**Entrada**
- Materiais: C25; CA-50; brita 1.
- Seção: h = 60 cm; bw = 22 cm; c = 2,5 cm; t = 6,3 mm; acg adotado = 5 cm; d = 55 cm.
- Mk = −15.000 kN·cm; Md = −21.000 kN·cm (o texto usa o valor absoluto nas equações).
- Nota 22 (texto): fyd = 43,48 kN/cm². Nota 23 (texto): "erro gravíssimo"; o conteúdo da nota não foi transcrito e **não verificado**.

**Resultados**

| Grandeza | Valor impresso | Origem no texto |
|---|---|---|
| x2lim / x3lim | 14,3 cm / 34,7 cm | |
| x (Eq. 23) | 16,2 cm | l.1731-1735 |
| x/d | 0,29 | |
| As (Eq. 25) | 9,95 cm² | l.1748 |
| As,mín | 1,98 cm² | |
| Kc | 3,2 | |
| Ks | 0,026 | |
| As | 9,93 cm² | l.1771 |

**Arranjo adotado**: 5Ø16 = 10,00 cm².

**Espaçamentos**
- ah calculado para 4 barras Ø16: 3,1 cm (l.1789). Para 3 barras Ø16: 5,5 cm (l.1793). A extração perdeu um fator 2 nessas linhas; a conta com o fator confirma os valores.
- ah,mín = 2,3 cm; av,mín = 2,0 cm.
- acg = 2,5 + 0,63 + 1,6 + 0,5 = 5,2 cm.
- Armadura de pele: Asp = 0,66 cm² (exigido); texto indica 3Ø5 (l.1826 em diante).
- O texto menciona vibrador de 49 mm (l.1826-1829); o raciocínio não foi transcrito.

---

### E07: Viga contínua, apoio interno, armadura dupla por x > 0,45d (exemplo 8.3, nº 1)

**Fonte**: exemplo 8.3, nº 1, pp. 37 a 40 (l.2246 a 2494). Figura 32 (**figura, não verificado**).

**Entrada**
- Materiais: C25; CA-50; brita 1.
- Seção: bw = 20 cm; h = 50 cm; c = 2,0 cm; t = 6,3 mm.
- Mk = −15.700 kN·cm; Md = −21.980 kN·cm (l.2266).
- acg = 5 cm → d = 45 cm; d' = 3 cm.

**Resultados, método 1 (equações de x e M2d)**

| Grandeza | Valor impresso | Origem no texto |
|---|---|---|
| x2lim / x3lim | 11,7 cm / 28,4 cm | |
| x (Eq. 23) | 26,2 cm | l.2289 |
| x/d | 0,58 > 0,45 → armadura dupla | l.2299 |
| x adotado | 0,45d = 20,25 cm | l.2320 |
| M1d | 18.147 kN·cm | l.2326 (recálculo: 18.146,9) |
| M2d | 3.833 kN·cm | l.2331 |
| σ'sd | 43,5 kN/cm² | Tabela A-5 |
| A's | 2,10 cm² | l.2336; adotado 2Ø12,5 = 2,50 cm² |
| As1 | 11,31 cm² | l.2343 |
| As2 | 2,10 cm² | l.2349 |
| As | 13,41 cm² | l.2356; adotado 3Ø20 + 2Ø16 = 13,45 cm² |

**Resultados, método 2 (via Kc e K's, l.2361-2392)**
- Kc = 1,8; x/d = 0,58; Kc lim = 2,2; Ks lim = 0,028.
- M1d = 18.409 kN·cm; M2d = 3.571 kN·cm.
- K's = 0,023; A's = 1,96 cm² (adotado 2Ø12,5 = 2,50 cm²).
- As = 13,41 cm² (igual ao método 1).

**Detalhamento**
- 3Ø20 na primeira camada; ah = 4,4 cm (l.2409-2411). A fórmula impressa tem "2,0" lido como Ø20 na extração; o resultado confere.
- ah,mín = 2,3 cm; o texto indica ajuste de espaçamento pela agulha de 49 mm (l.2409-2411).
- av,mín = 2,0 cm.
- acg = 2,0 + 0,63 + 2,0 + 0,5 = 5,1 cm (l.2471).
- d' de detalhamento = 2,0 + 0,63 + 1,25/2 = 3,3 cm (l.2480). O projeto usou d' = 3 cm.
- Armadura de pele: 0,50 cm² (l.2488); texto indica 3Ø5.

---

### E08: Viga contínua, apoio interno, C30, armadura dupla (exemplo 8.3, nº 2)

**Fonte**: exemplo 8.3, nº 2, pp. 41 a 43 (l.2497 a 2615). Figuras 33 e 34 (**figura, não verificado**). O valor de Mk está no texto (l.2508), não só na figura.

**Entrada**
- Materiais: C30; CA-50; brita 1.
- Seção: bw = 14 cm; h = 60 cm; c = 2,5 cm; t = 6,3 mm.
- Mk = −18.500 kN·cm (l.2508); Md = −25.900 kN·cm (l.2520).
- acg inicial = 6 cm → d = 54 cm; d' = 4 cm (d'/d = 0,07).

**Resultados**
- Kc = 1,6 (l.2524). x/d = 0,56 > 0,45: domínio 3 (Eq. 41, l.2527-2528) → armadura dupla.
- Para x = 0,45d: Kc lim = 1,9; Ks lim = 0,028 (l.2531-2532).
- M1d = 21.486 kN·cm (l.2536); M2d = 4.414 kN·cm (l.2541).
- K's = 0,023 (l.2543); A's = 2,03 cm² (l.2546); adotado 2Ø12,5 = 2,50 cm².
- As = 13,17 cm² (l.2549).
- As,mín = 1,26 cm² (l.2558).
- Arranjo: 3Ø20 + 2Ø16 = 13,45 cm² (l.2561). A disposição em camadas não está confirmada no trecho lido.

**Espaçamento e cobrimento**
- ah = 14 − 2 · (2,5 + 0,63 + 2,0) = 3,7 cm (l.2580). A extração perdeu fatores; "2,0" aqui é lido como Ø20 e o resultado confere.
- av,mín = 2,0 cm (l.2586-2589).
- acg = 2,5 + 0,63 + 2,0 + 2,0 = 7,1 cm (l.2594).

**Recálculo com d = 52,9 cm (l.2598)**: As = 13,39 cm²; A's = 2,48 cm². Confere com o texto.

**Detalhamento final**
- d' = 2,5 + 0,63 + 1,25/2 = 3,8 cm (l.2607).
- Armadura de pele: Asp = 0,42 cm² (0,05% · 14 · 60); texto indica 3Ø4,2 (l.2615).

---

## Pendências desta seção (Vigas)

- **Figuras 18 a 35** não renderizadas. Valores que só aparecem nelas estão como **não verificado**.
- **Espaçamentos ah** (7.3 nº 2 l.1517 e l.1525; 7.3 nº 3 l.1789 e l.1793; 8.3 nº 2 l.2580): a extração perdeu fatores. As contas com os fatores batem com o impresso.
- **7.3 nº 3, disposição de 5Ø16**: não está claro no trecho lido se é em uma ou duas camadas. Pela mesma fórmula, 5 barras Ø16 em uma camada dão ah ≈ 1,9 cm (conta minha), abaixo de ah,mín = 2,3 cm. Antes de usar ah desse caso como teste, conferir a figura 27.
- **7.3 nº 3, pele**: Asp exigido = 0,66 cm²; "3Ø5" tem área de cerca de 0,59 cm² (conta minha com Ø5 mm). A diferença está no texto e não foi corrigida.
- **8.3 nº 1, M1d**: impresso 18.147; recálculo 18.146,9. Diferença de arredondamento.
- **Resíduo da Eq. 23 com x impresso** (arredondamento de x): 7.3 nº 1, −18 kN·cm (x = 18,1); 7.3 nº 3, −1,9 (x = 16,2); 8.3 nº 1, −15,4 (x = 26,2). Registrado.
- **d' de projeto x d' de detalhamento**: 8.3 nº 1 usa 3 cm e detalha 3,3 cm; 8.3 nº 2 usa 4 cm e detalha 3,8 cm.
- **Vigas.pdf**: não consultado nesta seção.
- **Ábaco de flexão (Venturini)**: não usado nesta seção. ω e As não verificados.
---

## Força cortante, modelo de cálculo I (NBR 6118)

Fonte comum: Paulo Sérgio dos Santos Bastos, *Dimensionamento de Vigas de Concreto Armado à Força Cortante*, notas de aula da disciplina 2123 (UNESP/FEB, Bauru), capa datada março/2025. URL: `https://wwwp.feb.unesp.br/pbastos/concreto2/Cortante.pdf`. Texto usado: `Cortante.u8.txt` (extração UTF-8 do PDF). Exemplos 5.15 (pp. 41 a 46) e 5.16 (pp. 49 a 51), conforme o sumário e os cabeçalhos "UNESP – Bauru/SP ... N" (cada cabeçalho abre a página N).

**Edição da norma**: o texto diz usar a "NBR 6118/23" (l.2646) e cita a "NBR 6118/2023" na apresentação (l.24, l.118) e na referência (l.163). Cita a versão de 2003 como origem do Modelo II (l.28). Os exemplos não repetem o ano no enunciado. As equações simplificadas (Tabela 5.2, usada em E09 e E10) são do próprio texto; **não verificado** contra a NBR 6118.

**Figuras**: as figuras 5.37 e 5.40 não foram renderizadas. Os rótulos vêm do texto extraído. Valores que só aparecem nelas estão marcados como **figura, não verificado**.

**Modelo I**: treliça de Ritter-Mörsch, com ângulo θ = 45° fixo. Estribos verticais (α = 90°) em todos os exemplos desta seção.

---

### E09: Viga biapoiada, 14 × 46 cm, carga uniforme (exemplo 5.15, Modelo I)

**Fonte**: exemplo 5.15, p. 41 (dados e Figura 5.37, l.2345 a 2372); Modelo I com equações teóricas, pp. 42 a 43 (l.2391 a 2483); Modelo I com equações simplificadas, p. 45 (l.2577 a 2599); comparação, Tabela 5.5, p. 46 (l.2650 a 2666).

**Entrada**
- Concreto C25: fck = 25 MPa. Aço CA-50 ou CA-60.
- Coeficientes: γc = γf = 1,4; γs = 1,15.
- Seção retangular: bw = 14 cm; d = 46 cm; c = 2,0 cm (l.2345 a 2372). Altura h = 50 cm (rótulo da figura, **figura, não verificado**).
- Vão de 5,0 m (figura, **figura, não verificado**), biapoiada. A carga uniforme não é legível na extração (rótulo "403,k7Nk/mN/m", l.2354). O valor q_k = 43,7 kN/m reproduz Vk = 109,3 kN (conta minha: 43,7 · 5,0 / 2 = 109,25 kN). Tratar como **inferido**, não lido.
- Força cortante característica no apoio: Vk = 109,3 kN (l.2372).

**Intermediários (equações teóricas, item 5.9)**
- VSd = γf · Vk = 1,4 · 109,3 = **153,0 kN** (l.2372).
- fcd = fck / γc = 25 / 1,4 = 17,86 MPa = 1,786 kN/cm² (conta minha; a extração perdeu a fração, l.2411).
- fct,m = 0,3 · ∛(fck²) = 0,3 · ∛625 = **2,56 MPa** (l.2441).
- Asw,mín = 20 · 0,256 · 14 / 50 = **1,44 cm²/m** (l.2443). O fywk = 50 kN/cm² é a convenção da nota 33 (l.2446 a 2449): nos exemplos, a armadura mínima usa sempre o CA-50, inclusive quando o estribo é CA-60.
- fctd = 0,7 · fct,m / γc = 0,7 · 0,3 · ∛625 / 1,4 = **1,28 MPa = 0,128 kN/cm²** (l.2465).
- Vc0 = 0,6 · fctd · bw · d = 0,6 · 0,128 · 14 · 46 = **49,6 kN** (l.2468). Com fctd sem arredondar (1,2825 MPa), a conta dá 49,55 kN (conta minha).
- Vsw = VSd − Vc = 153,0 − 49,6 = **103,4 kN** (l.2472).

**Resultados (Modelo I, equações teóricas)**

| Grandeza | Valor impresso | Origem no texto | Conferência |
|---|---|---|---|
| VRd2 (Eq. 5.19) | 279,5 kN | l.2411 | 0,27 · (1 − 25/250) · (25/1,4) · 14 · 46 = 279,5 (conta minha) |
| VSd ≤ VRd2 | 153,0 ≤ 279,5, ok | texto, mesmo trecho | |
| Vc0 (Eq. 5.20) | 49,6 kN | l.2468 | ver intermediários |
| Vsw | 103,4 kN | l.2472 | 153,0 − 49,6 |
| Asw,90 / s (Eq. 5.29) | 0,0573 cm²/cm | l.2480 | 103,4 / (39,2 · 46) = 0,0573 (conta minha) |
| **Asw,90** | **5,73 cm²/m** | l.2483 | maior que Asw,mín = 1,44 cm²/m: a calculada é a adotada |

**Resultados (Modelo I, equações simplificadas, Tabela 5.2 do texto)**

| Grandeza | Valor impresso | Origem no texto | Conferência |
|---|---|---|---|
| VRd2 = 0,43 · bw · d | 276,9 kN | l.2584 | 0,43 · 14 · 46 = 276,9 (conta minha) |
| VSd,mín = 0,117 · bw · d | 75,3 kN | l.2592 | 0,117 · 644 = 75,35 (conta minha) |
| Asw = 2,55 · VSd/d − 0,20 · bw | **5,68 cm²/m** | l.2599 | 2,55 · 153,0 / 46 − 2,8 = 5,68 (conta minha) |

**Comparação impressa (Tabela 5.5, l.2650 a 2666)**: Modelo I com θ = 45°: 5,73 cm²/m (teórica) e 5,68 cm²/m (simplificada). NB1/78 + Anexo NB 116 com θ = 45°: 6,20 cm²/m. Asw,mín = 1,44 cm²/m (NBR 6118) e 1,68 cm²/m (NB 116).

**Observação**
- Os valores de Asw são por metro de viga (cm²/m). O detalhamento dos estribos está em 5.15.4 (l.2681), fora desta seção.
- O texto diz que o Modelo I dá armadura muito próxima do Modelo II com θ = 39° (l.2674 a 2676). Não usado aqui.

---

### E10: Viga com carga distribuída e carga concentrada, apoios A e B com cortantes diferentes (exemplo 5.16, Modelo I)

**Fonte**: exemplo 5.16, p. 49 (dados e Figura 5.40, l.2823 a 2857); Modelo I com equações teóricas, pp. 49 a 51 (cálculo de VRd2 e Asw em p. 50, Asw em p. 51; l.2871 a 2943); Modelo I com equações simplificadas, p. 51 (l.2944 a 2982).

**Entrada**
- Concreto C25: fck = 25 MPa. Aço CA-50 ou CA-60 (armadura mínima com CA-50, l.2899).
- Coeficientes: γc = γf = 1,4; γs = 1,15. Cobrimento c = 2,5 cm (l.2826 a 2827).
- Seção: bw = 25 cm (l.2907); d = 80 cm (l.2827). A altura h da viga analisada não consta do texto legível. O texto diz "A altura da viga transversal é de 60 cm, responsável pela força de 150 kN" (l.2827 a 2828). Esse 60 cm não é usado como h da viga, porque d = 80 cm exige h > 80 cm (conta minha).
- Vão entre eixos de 700 cm, carga distribuída de 29 kN/m e carga concentrada de 150 kN a 400 cm do apoio A (rótulos da Figura 5.40, **figura, não verificado**).
- Forças cortantes características: Vk,A = 165,8 kN; Vk,B = 187,2 kN (l.2834 a 2836).
- Conferência por equilíbrio (conta minha, com os rótulos acima): R_A = q·L/2 + P·b/L = 29 · 7,00 / 2 + 150 · 3,00 / 7,00 = 101,5 + 64,3 = 165,8 kN. R_B = 101,5 + 150 · 4,00 / 7,00 = 187,2 kN. Confere com os valores impressos.
- Forças de cálculo não reduzidas (l.2830 a 2832).

**Intermediários (equações teóricas, item 5.9)**
- VSd,A = γf · Vk,A = 1,4 · 165,8 = **232,1 kN**. VSd,B = 1,4 · 187,2 = **262,1 kN** (l.2834 a 2836).
- fct,m = 0,3 · ∛625 = **2,56 MPa = 0,256 kN/cm²** (l.2905).
- Asw,mín = 20 · 0,256 · 25 / 50 = **2,56 cm²/m** (l.2907).
- fctd = **1,28 MPa = 0,128 kN/cm²** (l.2920).
- Vc0 = 0,6 · fctd · bw · d = **153,9 kN** (l.2923). Com fctd = 0,128 exato, a conta dá 153,6 kN (conta minha). O valor impresso corresponde a fctd sem arredondar (1,2825 MPa, conta minha: 153,9).
- Vsw,A = 232,1 − 153,9 = **78,2 kN**; Vsw,B = 262,1 − 153,9 = **108,2 kN** (l.2926 a 2927).

**Resultados (Modelo I, equações teóricas)**

| Grandeza | Apoio A | Apoio B | Origem no texto | Conferência |
|---|---|---|---|---|
| VRd2 (Eq. 5.19) | 867,9 kN | 867,9 kN | l.2887 | 0,27 · 0,9 · 1,786 · 25 · 80 = 867,9 (conta minha) |
| Asw,90 / s | 0,0249 cm²/cm | 0,0345 cm²/cm | l.2934, l.2940 | 78,2 / 3136 = 0,0249; 108,2 / 3136 = 0,0345 (conta minha) |
| Asw,90 calculada | 2,49 cm²/m | 3,45 cm²/m | l.2939, l.2943 | |
| Asw,mín | 2,56 cm²/m | 2,56 cm²/m | l.2907 | |
| **Asw adotada (texto)** | **2,56 cm²/m (mínima)** | **3,45 cm²/m** | l.2939, l.2943 | apoio A: a calculada (2,49) é menor que a mínima |

**Resultados (Modelo I, equações simplificadas, Tabela 5.2 do texto)**

| Grandeza | Apoio A | Apoio B | Origem no texto | Conferência |
|---|---|---|---|---|
| VRd2 = 0,43 · bw · d | 860,0 kN | 860,0 kN | l.2951 | 0,43 · 25 · 80 = 860,0 (conta minha) |
| VSd,mín = 0,117 · bw · d | 234,0 kN | 234,0 kN | l.2965 | 0,117 · 2000 = 234,0 (conta minha) |
| Situação | VSd,A = 232,1 < 234,0: armadura mínima | VSd,B = 262,1 > 234,0: calcular | l.2967 a 2979 | |
| Asw (só comprovação, apoio A) | 2,40 cm²/m | | l.2974 | 2,55 · 232,1 / 80 − 5,0 = 2,40 (conta minha); menor que 2,56 |
| **Asw (apoio B)** | | **3,35 cm²/m** | l.2981 | 2,55 · 262,1 / 80 − 5,0 = 3,35 (conta minha) |

**Observação**
- No apoio A, o texto adota a armadura mínima (2,56 cm²/m), não a calculada (2,49 cm²/m). Para teste, o valor de projeto é 2,56.
- No apoio B, a equação teórica dá 3,45 cm²/m e a simplificada dá 3,35 cm²/m. A diferença de 0,10 cm²/m vem das duas formulações e está impressa no texto (l.2943 e l.2981).
- O texto não diz o número de estribos nem o diâmetro neste exemplo.

---

## Pendências desta seção (Cortante)

- **Figuras 5.37 e 5.40** não renderizadas. A carga q = 43,7 kN/m de E09 é inferida de Vk. Em E10, q = 29 kN/m, P = 150 kN, a posição de 400 cm e o vão de 700 cm vêm do rótulo da figura e não foram verificados; a conferência por equilíbrio (R_A = 165,8 e R_B = 187,2) fecha com esses valores.
- **Altura h** de E09 (50 cm) e de E10 (não lida): não verificada.
- **Vc0 de E10** (153,9 kN): o impresso usa fctd sem arredondar. Com 0,128 exato, a conta dá 153,6 kN. Registrado como impresso.
- **Tabela 5.5** (E09, l.2650 a 2666): a linha "NBR 6118, 45°, 6,98 / 6,97" é o Modelo II com θ = 45°, pelo texto (l.2668 a 2670). Não usada como teste; a extração da tabela não é confiável.
- **Tabela 5.2** (equações simplificadas) e **Eqs. 5.19, 5.20 e 5.29** (teóricas): reproduzidas do texto. Não conferidas contra a NBR 6118 original.
- **Ano da norma**: o texto cita NBR 6118/23 (l.2646). Nenhum enunciado repete o ano.
- **Cortante.pdf**: a leitura foi feita no `Cortante.u8.txt`, não página a página contra o PDF.
- Exemplos 5.16.3 (Modelo II), 5.17, 5.18 e 5.19 não usados nesta seção.

## Pilares

Fonte comum: Paulo Sérgio Bastos, *Flexão composta e pilares de concreto armado*, UNESP/FEB, Bauru/SP, capa datada junho/2024. URL: `https://wwwp.feb.unesp.br/pbastos/concreto2/Pilares.pdf`. O certificado do servidor está expirado; o acesso foi feito com `curl -k`. Cabeçalho HTTP 200, Last-Modified 20/06/2024, 5.368.323 bytes. Texto usado: `Pilares.u8.txt` (extração UTF-8 do PDF). Os cabeçalhos "UNESP, Bauru/SP ... Parte II – Pilares N" abrem a página N, conferido com o sumário (l.157 a 170).

**Edição declarada no texto geral**: a apresentação (Pilares.u8.txt, l.24) diz que a segunda parte apresenta prescrições da NBR 6118/2023. Isso não confirma a edição de cada exemplo (ver Edição da norma em E11, E12 e E13).

**Figuras**: as figuras dos exemplos (84 a 107 e 126 a 134) não foram renderizadas, porque a leitura do PDF falhou sem `pdftoppm`. Valores que só aparecem nelas estão marcados como **figura, não verificado**. ω e As lidos de ábaco estão marcados como **de ábaco, não verificado**.

**Ábacos**: E11 e E12 usam o ábaco A-4 de Venturini (1987), flexão reta, com d'/h = 0,20 (Figuras 87 e 89 em E11). E13 usa o ábaco 5A/5B de Pinheiro (2009), flexão oblíqua, para o arranjo 2, de 8 barras (Figuras 131 a 133; nota 88, l.7224).

**Equação 103 (reconstruída)**: o texto não traz a equação legível. A forma abaixo foi reconstruída dos números impressos: 19.200·M² − L·M − C = 0, com L = λ²·h·Nd − 3.840·h·Nd + 19.200·αb·M1d,A e C = 3.840·αb·h·Nd·M1d,A. Quando M1d,A < M1d,mín, o texto põe M1d,mín no lugar de M1d,A (E12, l.5752 a 5753). A forma reproduz L, C e as raízes impressas em E11, E12 e E13 quando λ é truncado (48,4 e 67,3), como o texto faz (conta minha). **Não confirmada contra a NBR 6118.**

**Nota sobre as contas**: as contas do texto arredondam ν (0,65; 0,62; 0,78) antes de 1/r, e λ (48,4; 67,3) antes da Eq. 103. Os valores exatos e as diferenças estão nas observações de cada exemplo e em Pendências.

---

### E11: Pilar intermediário, 20 × 50 cm, Nk = 1.000 kN, le = 280 cm (exemplo 13.1.1, intermediário)

**Fonte**: exemplo 13.1.1, pp. 79 a 86 (l.4394 a 4757; Figuras 84 a 90). Dados em l.4394 a 4400; Eq. 113 em l.4417; e1 = 0 e λ1 em l.4453 a 4456; Eq. 103 em l.4574 a 4582; ábaco em l.4600 a 4611; rigidez em l.4664 a 4681; excentricidade acidental em l.4695 a 4731; resumo em l.4734 a 4756.

**Entrada**
- Concreto C30: fck = 3,0 kN/cm²; fcd = 2,143 kN/cm² (conta minha: 3,0/1,4).
- Aço CA-50: fyd = 43,5 kN/cm² (l.4392). γc = γf = 1,4; γs = 1,15 (l.4392).
- Seção 20 × 50 cm: Ac = 1.000 cm²; hx = 50 cm; hy = 20 cm (l.4396 a 4397; hx e hy deduzidos de λx e λy em l.4426 e 4431). d' = 4,0 cm (l.4398).
- Nk = 1.000 kN (l.4396). n = 1,0 (Tabela 6, em função de hy = 20 cm; l.4417).
- Momentos de 1ª ordem nulos: pilar intermediário, e1 = 0 (l.4453 a 4456).
- Comprimento equivalente: ex = ey = 280 cm (l.4397; l.4402 a 4403).
- Altura H = 2,8 m para θ1 (l.4695 a 4702).

**Intermediários por direção**

| Grandeza | Dir. x | Dir. y | Origem no texto | Conferência |
|---|---|---|---|---|
| Nd (Eq. 113) | 1.400 kN | 1.400 kN | l.4417 | 1,0 · 1,4 · 1.000 |
| ν = Nd/(Ac·fcd) | 0,65 | 0,65 | l.4475 a 4476 | 1.400/(1.000 · 2,143) = 0,6533, arredondado a 0,65 no texto |
| λ = 3,46·le/h | 19,4 | 48,4 | l.4426; l.4431 | 3,46·280/50 = 19,38; 3,46·280/20 = 48,44 (texto usa 48,4) |
| λmáx (Eq. 63) | 90 | 90 | l.4429 | λ = 48,4 ≤ 90, ok (nota 61) |
| αb | 1,0 | 1,0 | l.4453 a 4456 | intermediário |
| λ1 | 35 | 35 | l.4453 a 4456 | (25 + 0)/1,0 = 25 < 35, logo λ1 = 35 |
| Efeitos de 2ª ordem | não considerados (19,4 < 35) | considerados (48,4 > 35) | l.4460 a 4461 | |
| e1 | 0 | 0 | l.4453 a 4456 | pilar intermediário |
| e1,mín | 3,00 cm | 2,10 cm | l.4440; l.4444 | M1d,mín / Nd |
| M1d,mín (Eq. 92) | 4.200 kN·cm | 2.940 kN·cm | l.4440; l.4444 | 1.400 · (1,5 + 0,03·50) = 4.200; 1.400 · (1,5 + 0,03·20) = 2.940 |
| 1/r (Eq. 77) | — | 2,1739·10⁻⁴ cm⁻¹ | l.4486 a 4488 | 0,005/(20 · (0,65 + 0,5)) |
| e2 (Eq. 75) | — | 1,70 cm | l.4492 | (280²/10) · 2,1739·10⁻⁴ = 1,704 |
| M2d (Eq. 76) | — | 2.380 kN·cm | l.4497 | 1.400 · 1,70 |
| Md,tot, curvatura aproximada | 4.200 kN·cm | 5.320 kN·cm | l.4504 a 4505 | y: 2.940 + 2.380 = 5.320 |
| Md,tot, rigidez aproximada (Eq. 103) | — | 4.453 kN·cm | l.4574 a 4582 | ver raiz abaixo |

**Eq. 103, direção y (reconstruída)**: M1d,A = M1d,mín,y = 2.940 kN·cm; αb = 1,0; h = 20 cm; Nd = 1.400 kN; λ = 48,4. L = 14.519.680 (l.4579). C = 3,161088·10¹¹ (l.4579 a 4581). Raiz positiva: **Md,tot,y = 4.453 kN·cm** (l.4582). Conta minha com λ = 48,44: raiz 4.456.

**Armadura, direção y**

| Método | μ (ou ey/h) | d'/h | ω | As (cm²) | Origem no texto | Marcação |
|---|---|---|---|---|---|---|
| Curvatura aproximada, Md,tot,y = 5.320 | 0,12 | 0,20 | 0,22 | 10,84 | l.4599 a 4611 | ω **de ábaco**, Venturini A-4, Figura 87, **não verificado** |
| Rigidez aproximada, Md,tot,y = 4.453 | 0,10 | 0,20 | 0,13 | 6,40 | l.4664 a 4681 | ω **de ábaco**, **não verificado** |
| Curvatura aproximada com ea | ey/h = 0,08 | 0,20 | 0,08 | 3,94 | l.4722 a 4731 | ω **de ábaco**, **não verificado** |

As conferidas: 0,22 · 1.000 · 2,143/43,5 = 10,84; 0,13 · 1.000 · 2,143/43,5 = 6,40; 0,08 · 1.000 · 2,143/43,5 = 3,94 (conta minha). Armadura adotada no texto para 10,84 cm²: 10 Ø 12,5 mm (12,50 cm²) ou 6 Ø 16 mm (12,00 cm²) (l.4604 a 4611).

**Excentricidade acidental, direção y**: θ1 = 1/(100·√H) = 0,00598 rad, com H = 2,8 m. O mínimo é 1/300 = 0,00333 rad (l.4695 a 4699). ea = θ1·le/2 = 0,84 cm (l.4702). ey = ea + e2y = 0,84 + 1,70 = 2,54 cm (l.4722 a 4723; Figura 90, **figura, não verificado**).

**Edição da norma**: o texto diz que o valor de 0,84 cm é o "novo valor da NBR 6118 para a excentricidade acidental" (l.4749 a 4750). Diz que a versão antiga (NB 1/78) dava 2,0 cm neste caso e que a redução veio com a NBR 6118 de 2003, "que está mantido na versão de 2023" (l.4750 a 4751). A versão de 2014 não aparece nos trechos lidos. As equações não trazem ano. O texto afirma seguir 2003 e 2023 para a excentricidade acidental. **Não confirmado** contra a norma.

**Observação**
- O resumo impresso (l.4734 a 4739) mistura dois tipos de percentual. Para 6,40, "41" é redução: 1 − 6,40/10,84 = 40,9%. Para 3,94, "36 %" é razão: 3,94/10,84 = 36,3%. Registrado como impresso.
- l.4754: "a armadura resulta 8,37 cm2, com redução de 23 % do valor de 10,84 cm2". A razão 8,37/10,84 confere com 23% de redução, mas 8,37 cm² não aparece em nenhuma conta do exemplo. Para a mesma excentricidade acidental de 0,84 cm, o texto dá 3,94 cm² (l.4731). **Divergência impressa, não resolvida.**
- O texto calcula com M1d,mín e obtém 10,84 cm², enquanto a excentricidade acidental dá 3,94 cm² (36%). Esse é o ponto que o texto usa para comparar a NB 1/78 e a NBR 6118 (l.4745 a 4751).

---

### E12: Pilar de extremidade, 20 × 70 cm, Nk = 1.110 kN, le = 280 cm (exemplo 13.2.1)

**Fonte**: exemplo 13.2.1, pp. 97 a 104 (l.5435 a 5856; Figuras 102 a 107). Enunciado e nota 76 em l.5435 a 5440, com referência a Fusco (1981, p. 297), "com a diferença da alteração do concreto, de C15 para C25 e da largura do pilar, de 25 cm para 20 cm". Dados em l.5447 a 5453; Eq. 113 em l.5478; Eq. 103 em l.5752 a 5759; ábaco em l.5779 a 5784; rigidez em l.5794 a 5800; excentricidade acidental em l.5809 a 5843; resumo em l.5849 a 5855.

**Entrada**
- Concreto C25: fck = 2,5 kN/cm²; fcd = 1,786 kN/cm² (conta minha: 2,5/1,4).
- Aço CA-50: fyd = 43,5 kN/cm² (l.5433). d' = 4 cm (l.5433).
- Seção 20 × 70 cm: Ac = 1.400 cm²; hx = 20 cm; hy = 70 cm (l.5447 a 5453).
- Nk = 1.110 kN; n = 1,0 (Tabela 6) (l.5478).
- M1d,A,x = −M1d,B,x = 2.170 kN·cm (l.5481). Viga V1 não contínua na direção x (l.5481 a 5484). Excentricidade inicial igual em módulo no topo e na base.
- ex = ey = 280 cm (l.5453).
- Altura H = 2,8 m para θ1 (l.5809).

**Intermediários por direção**

| Grandeza | Dir. x | Dir. y | Origem no texto | Conferência |
|---|---|---|---|---|
| Nd (Eq. 113) | 1.554 kN | 1.554 kN | l.5478 | 1,0 · 1,4 · 1.110 = 1.554 |
| ν = Nd/(Ac·fcd) | 0,62 | 0,62 | l.5586 a 5587 | 1.554/(1.400 · 1,786) = 0,6216 |
| λ = 3,46·le/h | 48,4 | 13,8 | l.5523; l.5528 | 3,46·280/20 = 48,44; 3,46·280/70 = 13,83 |
| λmáx (Eq. 63) | 90, ok | — | l.5526 | λ = 48,4 ≤ 90 |
| e1 | 1,40 cm | 0 | l.5486; l.5556 a 5560 | 2.170/1.554 = 1,396 |
| M1d,A | 2.170 kN·cm | — | l.5481 | impresso |
| M1d,mín (Eq. 92) | 3.263 kN·cm | 5.594 kN·cm | l.5535; l.5538 | 1.554 · (1,5 + 0,03·20) = 3.263; 1.554 · (1,5 + 0,03·70) = 5.594 |
| e1,mín | 2,10 cm | 3,60 cm | l.5535; l.5538 | M1d,mín / Nd |
| αb | 1,0 | 1,0 | l.5547 a 5553; l.5556 a 5560 | x: M1d,A,x = 2.170 < M1d,mín,x = 3.263, logo αb = 1,0; y: e1y = 0 |
| λ1 | 35 | 35 | l.5547 a 5553; l.5556 a 5560 | x: (25 + 12,5·1,40/20)/1,0 = 25,9 → 35; y: 25,0 → 35 |
| Efeitos de 2ª ordem | considerados (48,4 > 35) | não considerados (13,8 < 35) | l.5564 a 5565 | |
| 1/r (Eq. 77) | 2,2321·10⁻⁴ cm⁻¹ | — | l.5593 | 0,005/(20 · (0,62 + 0,5)) |
| e2 (Eq. 75) | 1,75 cm | — | l.5599 | 7.840 · 2,2321·10⁻⁴ = 1,750 |
| M2d (Eq. 76) | 2.720 kN·cm | — | l.5604 | 1.554 · 1,75 = 2.719,5, arredondado |
| Md,tot, seção de extremidade A | 3.263 kN·cm | 5.594 kN·cm | l.5623; l.5639 | x: max(2.170; 3.263); y: só M1d,mín,y |
| Md,tot, seção central, curvatura | 5.983 kN·cm | 5.594 kN·cm | l.5634; l.5639 | 3.263 + 2.720 = 5.983 |
| Md,tot, Eq. 97 | 5.983 kN·cm | — | l.5743 | 3.263 + 1.554 · 7.840 · 2,2321·10⁻⁴ = 5.982,45 (impresso 5.983) |
| Md,tot, rigidez (Eq. 103) | 4.943 kN·cm | — | l.5752 a 5759 | ver raiz abaixo |

**Eq. 103, direção x (reconstruída)**: como M1d,A,x = 2.170 < M1d,mín,x = 3.263, a equação usa 3.263 no lugar de M1d,A (l.5752 a 5753). h = 20 cm; Nd = 1.554 kN; λ = 48,4; αb = 1,0. L = 16.109.165 (l.5758; conta minha com λ = 48,4: 16.109.164,8). C = 3,894299·10¹¹ = 3.840 · 20 · 1.554 · 3.263 (l.5758; conta minha). Raiz positiva: **Md,tot,x = 4.943 kN·cm**, com M1d,A,x = 2.170 kN·cm conferido (l.5759). Conta minha com λ = 48,44: raiz 4.946.

**Armadura, direção x**

| Método | μ (ou ν·ex/h) | d'/h | ω | As (cm²) | Origem no texto | Marcação |
|---|---|---|---|---|---|---|
| Curvatura aproximada, Md,tot,x = 5.983 | 0,12 | 0,20 | 0,19 | 10,92 | l.5770 a 5784 | ω **de ábaco**, Venturini A-4, **não verificado** |
| Rigidez aproximada, Md,tot,x = 4.943 | 0,10 | 0,20 | 0,10 | 5,75 | l.5794 a 5800 | ω **de ábaco**, **não verificado** |
| Curvatura aproximada com ea, ex = 3,15 cm | 0,10 | 0,20 | 0,10 | 5,75 | l.5823 a 5843 | ω **de ábaco**, Figura 107, **não verificado** |

As conferidas: 0,19 · 2.500/43,5 = 10,92; 0,10 · 2.500/43,5 = 5,75 (conta minha, com Ac·fcd = 1.400 · 1,786 = 2.500 kN). μx = 5.983/(20 · 1.400 · 1,786) = 0,12 (conta minha). Armadura adotada no texto para 10,92 cm²: 10 Ø 12,5 mm (12,50 cm²) (l.5782 a 5784).

**Excentricidade acidental, direção x**: θ1 = 0,00598 rad, H = 2,8 m (l.5809 a 5813). ea = 0,84 cm (l.5815). e1x,C = 0,56 cm (l.5701 a 5705). O cálculo impresso está parcialmente ilegível no texto extraído, mas o resultado confere com 0,4 · 1,40 = 0,56 (conta minha). ex = e1x,C + ea + e2x = 0,56 + 0,84 + 1,75 = 3,15 cm (l.5823). μx = 0,62 · 3,15/20 = 0,10 (l.5838).

**Edição da norma**: o trecho cita "NBR6118" sem ano, na nota 82 (l.5761), para a equação do momento total. A excentricidade acidental (θ1 com H = 2,8 m) não traz ano. O texto geral (l.24) diz que a segunda parte segue a NBR 6118/2023; isso não é confirmação por exemplo. O exemplo não indica a edição (2003, 2014 ou 2023). **Não confirmado** contra a norma.

**Observação**
- Dir. y: "não existem momentos fletores MA e M2" (l.5746), logo Md,tot,y = M1d,mín,y = 5.594 kN·cm (nota 82).
- Resumo impresso (l.5849 a 5855): 10,92 (100%); 5,75 (48); 5,75 (48). A redução exata de 5,75 em relação a 10,92 é 47,3%, e a razão é 52,7%. O "48%" não confere com nenhuma das duas. Registrado como impresso.
- l.5628 a 5631: o trecho do M1d,C,x está ilegível (868 e 434 aparecem misturados). Não afeta o resultado, porque M1d,mín,x = 3.263 prevalece.
- A divergência de "200" na soma de L (Eq. 103) não se confirma: com λ = 48,4 o L é 16.109.164,8, igual ao impresso (16.109.165).

---

### E13: Pilar de canto, 18 × 50 cm, Nk = 850 kN, le = 350 cm (exemplo 13.3.1, canto)

**Fonte**: exemplo 13.3.1, pp. 122 a 131 (l.6879 a 7339; Figuras 126 a 134). Dados em l.6883 a 6892; Nd e momentos de 1ª ordem em l.6904 a 6911; esbeltez e λ1 em l.6923 a 6979; M1d,mín em l.6938 a 6941; M1d,C em l.7029 a 7047; Eq. 97 em l.7144 a 7164; Eq. 103 em l.7168 a 7177; ábacos em l.7196 a 7338. Nota 88 (Pinheiro, 2009) em l.7224.

**Entrada**
- Concreto C25: fck = 2,5 kN/cm²; fcd = 1,786 kN/cm² (conta minha: 2,5/1,4).
- Aço: fyd = 43,5 kN/cm² (uso em l.7245 e l.7268). O tipo de aço não consta no trecho de entrada.
- Coeficientes: γf = γc = 1,4; n = 1,05 (Tabela 6) (l.6904).
- Seção 18 × 50 cm: Ac = 900 cm²; hx = 18 cm; hy = 50 cm (l.6888; l.6923; l.6928). d'x = d'y = 5,0 cm (l.7196 a 7197).
- Nk = 850 kN (l.6883).
- M1k,A,x = −M1k,B,x = 2.041 kN·cm; M1k,A,y = −M1k,B,y = 1.360,5 kN·cm (l.6885 a 6886). Momentos de cálculo M1d,A,x = −M1d,B,x = 3.000 kN·cm e M1d,A,y = −M1d,B,y = 2.000 kN·cm (l.6910 a 6911).
- ex = ey = 350 cm (l.6888 a 6889; l.6923; l.6928).
- Altura H = 3,5 m para θ1 (l.7278 a 7285).

**Intermediários por direção**

| Grandeza | Dir. x | Dir. y | Origem no texto | Conferência |
|---|---|---|---|---|
| Nd (Eq. 113) | 1.250 kN | 1.250 kN | l.6904 | 1,05 · 1,4 · 850 = 1.249,5, impresso como 1.250 |
| M1d,A (1,05 · 1,4 · M1k,A) | 3.000 kN·cm | 2.000 kN·cm | l.6910 a 6911 | 1,47 · 2.041 = 3.000; 1,47 · 1.360,5 = 2.000 |
| e1,A = M1d,A/Nd | 2,40 cm | 1,60 cm | l.6915 a 6919 | 3.000/1.250; 2.000/1.250 |
| ν = Nd/(Ac·fcd) | 0,78 | 0,78 | l.6995 a 6996 | 1.250/(900 · 1,786) = 0,7778 |
| λ = 3,46·le/h | 67,3 | 24,2 | l.6923; l.6928 | 3,46·350/18 = 67,28; 3,46·350/50 = 24,22 |
| λmáx (Eq. 63) | 67,3, ok | — | l.6931 | λ ≤ 90 |
| M1d,mín (Eq. 92) | 2.550 kN·cm | 3.750 kN·cm | l.6938; l.6941 | 1.250 · (1,5 + 0,03·18) = 2.550; 1.250 · (1,5 + 0,03·50) = 3.750 |
| e1,mín | 2,04 cm | 3,00 cm | l.6938; l.6941 | M1d,mín / Nd |
| αb | 0,4 (piso) | 1,0 | l.6950 a 6955; l.6963 a 6973 | x: 0,6 + 0,4·(−3.000/3.000) = 0,2, e o piso de 0,4 se aplica; y: M1d,A,y = 2.000 < M1d,mín,y = 3.750, logo αb = 1,0 |
| λ1 | 66,7 | 35 | l.6957 a 6961; l.6963 a 6973 | x: (25 + 12,5·2,40/18)/0,4 = 66,67; y: (25 + 12,5·1,60/50)/1,0 = 25,4 → 35 |
| Efeitos de 2ª ordem | considerados (67,3 > 66,7) | não considerados (24,2 < 35) | l.6977 a 6979 | |
| M1d,C (Eq. 94/96) | 1.200 kN·cm, menor que 2.550: usa M1d,mín | 800 kN·cm, menor que 3.750: usa M1d,mín | l.7029 a 7033; l.7042 a 7047 | |
| 1/r (Eq. 77) | 2,1701·10⁻⁴ cm⁻¹ | — | l.7002 | 0,005/(18 · (0,78 + 0,5)); limite 0,005/h = 2,7778·10⁻⁴, ok |
| e2 (Eq. 75) | 2,66 cm | — | l.7006 | (350²/10) · 2,1701·10⁻⁴ = 2,66; com ν exato, 2,663 |
| M2d (Eq. 76) | 3.325 kN·cm | — | l.7011 | 1.250 · 2,66; a figura mostra 3.323 (l.7057) |
| Md,tot, seção de extremidade A | 3.000 kN·cm | 3.750 kN·cm | l.7022 a 7025 | x: max(3.000; 2.550); y: M1d,mín,y |
| Md,tot, seção central, curvatura | 5.875 kN·cm | 3.750 kN·cm | l.7037; l.7047 | x: 2.550 + 3.325 = 5.875 |
| Md,tot, Eq. 97 | 5.873 kN·cm | 3.750 kN·cm | l.7144 a 7164 | 2.550 + 1.250 · 12.250 · 2,1701·10⁻⁴ = 5.873 |
| Md,tot, rigidez (Eq. 103) | 3.535 kN·cm | — | l.7173 a 7177 | ver raiz abaixo |

**Eq. 103, direção x (reconstruída)**: M1d,A,x = 3.000 ≥ M1d,mín,x = 2.550, logo não há substituição. h = 18 cm; Nd = 1.250 kN; λ = 67,3; αb = 0,4. L = 38.549.025 (l.7173). C = 1,0368·10¹¹ = 3.840 · 0,4 · 18 · 1.250 · 3.000 (l.7173). Raiz positiva: **Md,tot,x = 3.535 kN·cm**, com M1d,A,x = 3.000 kN·cm conferido (l.7177). Conta minha: 3.535,24. Com λ exato (67,28): raiz 3.533.

**Armadura**

| Método | μx | μy | d'x/hx | d'y/hy | ω | As (cm²) | Origem no texto | Marcação |
|---|---|---|---|---|---|---|---|---|
| Curvatura aproximada, Md,tot,x = 5.875; Md,tot,y = 3.750 | 0,20 | 0,05 | 0,25 (texto); 0,28 (5,0/18) | 0,10 | 0,826 | 30,52 | l.7186 a 7245 | ω **de ábaco**, Pinheiro 5A/5B, Figura 133, **não verificado** |
| Rigidez aproximada, Md,tot,x = 3.535; Md,tot,y = 3.750 | 0,12 | 0,05 | 0,25 (texto) | 0,10 | 0,462 | 17,07 | l.7257 a 7270 | ω **de ábaco**, **não verificado** |
| Curvatura aproximada com ea, ex = 4,56 cm, ey = 0,64 cm | 0,20 | 0,01 | 0,25 (texto) | 0,10 | 0,714 | 26,38 | l.7310 a 7326 | ω **de ábaco**, Figura 134 ilegível, **não verificado** |

Interpolações em ν = 0,78, lidas no ábaco 5 (l.7235 a 7239; l.7259 a 7266; l.7317 a 7320): curvatura, ω(0,60) = 0,70 e ω(0,80) = 0,84, logo ω = 0,70 + 0,14 · 0,9 = 0,826. Rigidez, ω(0,60) = 0,30 e ω(0,80) = 0,48, logo ω = 0,462. Ea, ω(0,60) = 0,57 e ω(0,80) = 0,73, logo ω = 0,714 (conta minha da interpolação linear). As conferidas: 0,826 · 900 · 1,786/43,5 = 30,52; 0,462 · 900 · 1,786/43,5 = 17,07; 0,714 · 900 · 1,786/43,5 = 26,38 (conta minha).

**Excentricidade acidental**: θ1 = 1/(100·√3,5) = 0,005345 rad, mínimo 0,00333 (l.7278 a 7282). ea = 0,005345 · 350/2 = 0,94 cm (l.7285). Com ea: e1x,C = 0,4 · 2,40 = 0,96 cm (l.7100); ex = 0,96 + 0,94 + 2,66 = 4,56 cm (l.7310). ey = 0,64 cm no texto (l.7311), sem ea, contra eay = 0,94 cm (l.7285).

**Edição da norma**: no trecho de 6879 a 7339 não há menção à NBR 6118 nem ano de edição. θ1 (Eq. 79/80) e ea aparecem sem ano. **Não confirmado** contra a norma.

**Observação**
- A direção crítica é x, com momento de 5.875 kN·cm (l.6981 a 6985). A verificação das extremidades é didática (l.6981 a 6985).
- O texto aponta a nota 87 (l.7199): "Utilizar um ábaco com relação d’/h menor é contra a segurança." O texto usa d'x/hx = 0,25, enquanto 5,0/18 = 0,28. Registrado como divergência.
- Arranjo: o texto escolhe o arranjo 2, de 8 barras (l.7202 a 7214), e descarta o arranjo 4 (espaçamento máximo de 40 cm, comprimento de 50 cm) e o arranjo 1. Os arranjos da Figura 131 não foram renderizados.
- Resumo impresso (l.7334 a 7338): 30,52 (100%), 17,07 (44%), 26,38 (14%). Os percentuais são reduções: 1 − 17,07/30,52 = 44,1% e 1 − 26,38/30,52 = 13,6%. A linha de método está desalinhada no texto extraído.
- ex = 4,70 cm (l.7139) é 2,04 + 2,66, usado no caso de curvatura aproximada. ex = 4,56 cm (l.7310) é 0,96 + 0,94 + 2,66, usado no caso com ea. São dois casos no mesmo exemplo.

---

## Pendências desta seção (Pilares)

- **Ábacos**: as figuras de Venturini (A-4, Figuras 87 e 89), de Pinheiro (5A/5B, Figura 133) e as Figuras 107 e 134 não foram renderizadas. Todos os ω e As lidos de ábaco estão **não verificados**. Os ω de E13 são interpolações minhas sobre dois pontos de ábaco do texto (ν = 0,60 e 0,80).
- **Eq. 103**: reconstruída dos números impressos (ver nota acima). **Não confirmada contra a NBR 6118**. A seção 6 de `docs/norma/NBR6118-2023.md` (l.195 a 230) está marcada [VERIFICAR]. Nenhuma equação de pilar foi confirmada contra a norma.
- **Demais equações** (Eq. 62, 63, 75 a 77, 79, 80, 92, 94, 96, 97 e 113): reproduzidas do texto. Não conferidas contra a norma.
- **Edição da norma**: E11 cita 2003 e 2023 (l.4750 a 4751). E12 cita "NBR6118" sem ano (l.5761). E13 não cita no trecho lido. Nenhum exemplo cita 2014. Não confirmado qual edição as contas seguem.
- **Divergências impressas, sem correção**:
  - E11: 8,37 cm² (l.4754) contra 3,94 cm² (l.4731), para a mesma excentricidade acidental de 0,84 cm.
  - E11, resumo: 6,40 = 41% (redução) e 3,94 = 36% (razão), na mesma linha de percentuais.
  - E12, resumo: 5,75 = 48%; a redução exata é 47,3%.
  - E12, l.5628 a 5631: M1d,C,x ilegível (868 e 434 misturados). Sem efeito no resultado.
  - E13: Md,tot,x = 5.875 (l.7037, com e2 = 2,66) contra 5.873 (Eq. 97, l.7157 e 7164). A diferença vem do arredondamento de e2 (2,663 exato dá 5.873; conta minha).
  - E13: M2d,x = 3.325 (l.7011), 3.323 (figura, l.7057) e cerca de 3.329 com e2 exato (conta minha).
  - E13: Nd = 1.250 impresso, contra 1.249,5 na conta com n = 1,05.
  - E13: d'x/hx = 0,25 usado (l.7196 a 7197), contra 0,28; nota 87 (l.7199) diz que o uso de d'/h menor é contra a segurança.
  - E13: ey = 0,64 cm sem ea (l.7311), contra eay = 0,94 cm (l.7285) e a soma 0,64 + 0,94 = 1,58 cm. A Figura 134 não é legível (valores "1,5582" e "0,8984" no texto extraído).
  - E13: αb,x impresso como "b,x = 0,4", com trecho garbled. A fórmula dá 0,2, e o piso de 0,4 foi aplicado.
  - E13: ex = 4,70 (l.7139) e ex = 4,56 (l.7310) em casos diferentes do mesmo exemplo.
  - E11, E12 e E13: o texto trunca λ (48,4 e 67,3) nas contas da Eq. 103. Com λ exato (48,44; 48,44; 67,28), as raízes são 4.456 (E11, y), 4.946 (E12, x) e 3.533 (E13, x), contra 4.453, 4.943 e 3.535 impressos (conta minha).
  - ν arredondado antes de 1/r: E11 (0,6533 para 0,65) e E12 (0,6216 para 0,62). Com ν exato, M2d de E12 fica cerca de 2.715 kN·cm, contra 2.720 impresso (conta minha).
- **Seções não lidas**: 13.1.2 (l.4759), 13.1.3 (l.5022), 13.1.4 (l.5278), 13.2.2 (l.5857) e 13.3.2 (l.7340). Fora do escopo de um exemplo por tipo.
- **Pinheiro (2009)**: a URL da nota 88 (l.7224) não foi acessada. Libânio Pinheiro (USP), UFPR e UFSC não foram consultados nesta seção.
- **Pilares.pdf**: lido só pelo texto extraído (`Pilares.u8.txt`). Figuras e cálculos gráficos não conferidos.

---

# Fórmulas e limites da NBR 6118 para vigas e pilares de concreto armado

Data da coleta: 2026-10-12.

## Escopo, versões e legenda

- **Versão normativa das fontes.** Todas as fontes lidas são apostilas de 2023 a 2025 que aplicam a NBR 6118:2023. O texto oficial da ABNT não foi lido (norma paga). Valores da NBR 6118:2014 aparecem só quando a apostila os cita de forma explícita; nos demais casos a coluna 2014 fica como [NÃO ENCONTRADO].
- **O que mudou em 2023.** As fontes lidas não listam as diferenças item a item entre 2014 e 2023. Todas as comparações de versão ficam [NÃO ENCONTRADO] ou PENDENTE.
- **Status.**
  - CONFIRMADO: fonte lida, símbolos legíveis, linha ou página indicada.
  - RESSALVA: fórmula legível no contexto, mas símbolos perdidos na extração do PDF; conferir no PDF antes de usar.
  - PENDENTE: conflito entre fontes, trecho cortado ou não lido.
  - [NÃO ENCONTRADO]: nenhuma fonte lida traz o item.
- **Notação.** A apostila de flexão (F1) usa αc para o coeficiente do bloco de tensões. A apostila de pilares (F5) usa α1 para o mesmo parâmetro.
- **Referências de linha.** Os números "arquivo.txt:linha" apontam para o texto extraído em `C:/Users/MunaroPC/AppData/Local/Temp/norma-scratch/` (versões UTF-8 em `/tmp/`). Não são linhas do PDF.
- **Certificado TLS.** O certificado de wwwp.feb.unesp.br estava expirado. Os PDFs foram baixados com `curl -k`, só para leitura, sem execução.

## Fontes

| Código | Título | Autor | Data (capa) | URL | Arquivo local |
|---|---|---|---|---|---|
| F1 | Flexão Normal Simples – Vigas | Paulo Sérgio dos Santos Bastos (UNESP Bauru) | out/2023 | https://wwwp.feb.unesp.br/pbastos/concreto1/FlexaoSimples.pdf | FlexaoSimples.txt |
| F2 | Fundamentos do Concreto Armado | Bastos (UNESP Bauru) | set/2023 | https://wwwp.feb.unesp.br/pbastos/concreto1/Fundamentos%20CA.pdf | Fundamentos_CA.txt |
| F3 | Dimensionamento de vigas de concreto armado à força cortante | Bastos (UNESP Bauru) | mar/2025 | https://wwwp.feb.unesp.br/pbastos/concreto2/Cortante.pdf | Cortante.txt |
| F4 | Ancoragem e emenda de armaduras | Bastos (UNESP Bauru) | mar/2024 | https://wwwp.feb.unesp.br/pbastos/concreto2/Ancoragem.pdf | Ancoragem.txt |
| F5 | Flexão composta e pilares de concreto armado | Bastos (UNESP Bauru) | jun/2024 | https://wwwp.feb.unesp.br/pbastos/concreto2/Pilares.pdf | Pilares.txt |
| F6 | Vigas de concreto armado – dimensionamento, flecha e fissuração | Bastos (UNESP Bauru) | abr/2024 (capa) | https://wwwp.feb.unesp.br/pbastos/concreto2/Vigas.pdf | Vigas.txt |

Fontes citadas e não lidas diretamente:
- Carvalho e Figueiredo (2014), *Cálculo e detalhamento de estruturas usuais de concreto armado*, 4ª ed., EDUFSCar. Citado em F1 como "Segundo a NBR 6118/2014" (FlexaoSimples.txt, perto da linha 4710). Não confirmado.
- Pinheiro, L. M. et al. (USP, 2009), ábacos de flexão oblíqua (`Abacos_Flexao_Obliqua_Pinheiro.pdf`). Não convertidos nesta coleta.
- NBR 8681 (ações e segurança). Só há citação secundária em F2 (Tabela 3.7, citação do item 4.2.3.1). Texto original não lido.

Fontes web usadas só para indicar conflito (não confirmadas):
- Fonte secundária em português, sobre a NBR 6118:2023 e o coeficiente ηc (≤40 MPa = 1,00; 50 = 0,93; 60 = 0,87; 70 = 0,83; 80 = 0,79; 90 = 0,76). Busca web de 2026-10-12. Os valores batem com (40/fck)^(1/3). Atribui o coeficiente ao item 8.2.10.1 da norma de 2023. Não verificado no texto da norma.
- UFPel, EN_03297.pdf (https://wp.ufpel.edu.br/grupodeestudosanalisedeestruturas/files/2024/12/EN_03297.pdf). Retornou HTTP 403 em 2026-10-12. Não lido.
- LAJSS (https://lajss.org/index.php/LAJSS/article/download/8343/3204/26523). PDF binário sem texto extraível. Não lido.

---

## 1. Materiais (itens 8.2, 8.3 e 12)

| Grandeza | Fórmula / valor | Item NBR | Fonte | Versão | Status |
|---|---|---|---|---|---|
| Resistência de cálculo do concreto | fcd = fck / γc | 12.4 (número não confirmado) | F2 Tabela 3.4 = Tabela 12.1, Fundamentos_CA.txt:2190-2194 | 2023 | CONFIRMADO |
| Coeficiente γc, combinações normais | γc = 1,4 | Tabela 12.1 | F2, Fundamentos_CA.txt:2190-2194 | 2023 | CONFIRMADO |
| Coeficiente γc, combinações especiais ou de construção | γc = 1,2 | Tabela 12.1 | F2, Fundamentos_CA.txt:2200 | 2023 | CONFIRMADO (só γc; γs nesse caso não lido) |
| Resistência de cálculo do aço | fyd = fyk / γs | 12.4 (número não confirmado) | F1, Tabela 2 premissas; F2 | 2023 | CONFIRMADO |
| Coeficiente γs | γs = 1,15 | Tabela 12.1 | F2 e F1 (premissa da Tabela 17.3) | 2023 | CONFIRMADO |
| Deformação de escoamento do CA-50 | εyd = fyd / Es = 2,07‰ (cálculo por fórmula, Es = 210 GPa) | 8.3 | F1 Tabela 1, p. 6 (valor não lido na coleta) | 2023 | PENDENTE (confirmar valor na Tabela 1 da F1) |
| Resistência média à tração | fct,m = 0,3 fck^(2/3) (MPa) | 8.2.5 | F1 Eq. 7-9, p. 9, FlexaoSimples.txt:420-434; F6 Vigas.txt:2686-2700 | 2023 | CONFIRMADO |
| Resistência inferior à tração | fctk,inf = 0,7 fct,m | 8.2.5 | F6, Vigas.txt:2686-2700 | 2023 | CONFIRMADO |
| Resistência superior à tração | fctk,sup = 1,3 fct,m | 8.2.5 | F6, Vigas.txt:2686-2700 | 2023 | CONFIRMADO |
| Resistência de cálculo à tração | fctd = fctk,inf / γc = 0,7 · 0,3 fck^(2/3) / γc | 8.2.5 | F3 Eq. 5.21, Cortante.txt:1162-1199 | 2023 | CONFIRMADO |
| Módulo de elasticidade tangente inicial | Eci = αE · 5600 · √fck (MPa), para fck ≤ 50 MPa | 8.2.8 (número não confirmado) | F6, Vigas.txt:3466-3530 | 2023 | CONFIRMADO |
| Coeficiente αE | Basalto 1,2; granito 1,0; calcário 0,9; arenito 0,7 | 8.2.8 | F6, Vigas.txt:3466-3530 | 2023 | CONFIRMADO |
| Módulo secante | Ecs = αi · Eci, com αi = 0,8 + 0,2 · fck/80 ≤ 1,0 | 8.2.8 | F6, Vigas.txt:3466-3530 | 2023 | CONFIRMADO |
| Grupos de resistência | Grupo I: fck ≤ 50 MPa. Grupo II: 55 ≤ fck ≤ 90 MPa | 8.2.1 (número não confirmado) | F5, Pilares.txt:128 (nota) | 2023 | CONFIRMADO |
| Diferença 2014 para 2023 nos itens acima | — | — | — | 2014 | [NÃO ENCONTRADO] |

---

## 2. Flexão simples em vigas

| Grandeza | Fórmula / valor | Item NBR | Fonte | Versão | Status |
|---|---|---|---|---|---|
| Momento mínimo de fissuração | Md,mín = 0,8 · W0 · fctk,sup | 17.3.5.1 (princípio) e 17.3.5.2.1 (fórmula) | F1 Eq. 7, p. 9, FlexaoSimples.txt:406 e 420-434 | 2023 | CONFIRMADO |
| Armadura mínima de tração por momento | As,mín = ρmín · Ac (Eq. 10) | 17.3.5.2.1 | F1, FlexaoSimples.txt:444-470 | 2023 | CONFIRMADO |
| Armadura mínima alternativa, taxa ρmín | Tabela 17.3, por fck (ver tabela abaixo). Premissas: CA-50, d/h = 0,8, γc = 1,4, γs = 1,15. Se mudarem, ρmín deve ser recalculado | 17.3.5.2.1 e Tabela 17.3 | F1 Tabela 2, p. 10, FlexaoSimples.txt:444-470 | 2023 | CONFIRMADO |
| Armadura mínima, numeração 2014 | F1 cita o item 19.3.3.2 e a Tabela 19.1 (FlexaoSimples.txt:417). Não comparado com 2014 | 19.3.3.2 / Tabela 19.1 | F1, FlexaoSimples.txt:417 | 2014 | PENDENTE (sem texto 2014 para comparar) |
| Armadura máxima | As + A's ≤ 4% · Ac, fora da zona de emenda, com dutilidade do item 14.6.4.3 | 17.3.5.2.4 | F1 Eq. 6, p. 9, FlexaoSimples.txt:411 | 2023 | CONFIRMADO |
| Bloco retangular, altura da zona comprimida | y = λ · x, com λ = 0,8 para fck ≤ 50 MPa e λ = 0,8 − (fck − 50)/400 para fck > 50 MPa | 17.2.2 (número não confirmado) | F1 Eq. 15, p. 13, FlexaoSimples.txt:619-662 | 2023 | CONFIRMADO |
| Coeficiente de resistência do bloco, αc | F1 Eq. 16: αc = 1,0 para fck ≤ 40 MPa; αc = (40/fck)^(1/3) para fck > 40 MPa (FlexaoSimples.txt:662). F5 Eq. 7: αc = 0,85 para Grupo I e 0,85 · [1 − (fck − 50)/200] para Grupo II (Pilares.txt:255-300). Pedido inicial do usuário: 0,85 para fck ≤ 50. Fonte web não confirmada indica (40/fck)^(1/3) para 2023 | 17.2.2 e 8.2.10.1 (conferir) | F1 Eq. 16 p. 13; F5 Eq. 7 | 2023 | PENDENTE (conflito entre F1 e F5; usar só depois de conferir no texto da NBR 6118:2023) |
| Limite de altura da zona comprimida | x/d ≤ 0,45 para fck ≤ 50 MPa; x/d ≤ 0,35 para 50 < fck ≤ 90 MPa | 14.6.4.3 | F1 Eq. 26, pp. 16-17, FlexaoSimples.txt:818-862 | 2023 | CONFIRMADO |
| Momento resistido pela seção (retangular, bw) | Md = 0,68 · bw · x · fcd · (d − 0,4x). Válida com αc = 0,85 e λ = 0,8 (fck ≤ 50) | 17.2.2 | F1 Eq. 23, pp. 16-17, FlexaoSimples.txt:818-862 | 2023 | CONFIRMADO para fck ≤ 50. Para fck > 50 o 0,68 muda (PENDENTE, depende do αc) |
| Área de aço | As = Md / [σsd · (d − 0,4x)] | 17.2 | F1 Eq. 25, pp. 16-17, FlexaoSimples.txt:818-862 | 2023 | CONFIRMADO |
| Coeficiente Kc | Kc = bw · d² / Md (kN e cm) | — (tabela de dimensionamento) | F1 Eq. 31, FlexaoSimples.txt:900-990; Tabelas A-1 e A-2 | 2023 | CONFIRMADO |
| Coeficiente Ks | Ks = As · d / Md (kN e cm) | — (tabela de dimensionamento) | F1 Eq. 33, FlexaoSimples.txt:900-990; Tabelas A-1 e A-2 | 2023 | CONFIRMADO |
| Diferença 2014 para 2023 nos itens acima | — | — | — | 2014 | [NÃO ENCONTRADO] |

Tabela 17.3 (F1 Tabela 2, p. 10; FlexaoSimples.txt:444-470). Taxa mínima de armadura de flexão, ρmín (%), para vigas retangulares:

| fck (MPa) | 20 | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 | 85 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ρmín (%) | 0,150 | 0,150 | 0,150 | 0,164 | 0,179 | 0,194 | 0,208 | 0,211 | 0,219 | 0,226 | 0,233 | 0,239 | 0,245 | 0,251 | 0,256 |

Status: CONFIRMADO para 2023. A correspondência entre a coluna de fck e cada valor foi lida na extração. Conferir uma linha no PDF antes de usar.

---

## 3. Força cortante

| Grandeza | Fórmula / valor | Item NBR | Fonte | Versão | Status |
|---|---|---|---|---|---|
| Cortante resistente de compressão diagonal | VRd2 = 0,27 · αv2 · fcd · bw · d (θ = 90°) | 17.4.2.2 | F3 Eq. 5.16-5.17, Cortante.txt:1080-1100 | 2023 | CONFIRMADO |
| Coeficiente αv2 | αv2 = 1 − fck/250 (fck em MPa) | 17.4.2.2 | F3, Cortante.txt:1915-1928 | 2023 | CONFIRMADO para fck ≤ 50. Para fck > 50 a apostila não foi conferida (PENDENTE) |
| Parcela de cortante do concreto (flexão simples) | Vc0 = 0,6 · fctd · bw · d | 17.4.2.2 | F3 Eq. 5.20, Cortante.txt:1140-1160 | 2023 | CONFIRMADO (uso de Vc = Vc0 em flexão simples não relido) |
| Resistência de cálculo à tração | fctd = 0,7 · 0,3 fck^(2/3) / γc | 17.4.2.2 | F3 Eq. 5.21, Cortante.txt:1162-1199 | 2023 | CONFIRMADO |
| Parcela da armadura transversal | Vsw = (Asw / s) · 0,9 · d · fywd | 17.4.2.2 | F3 Eq. 5.22, Cortante.txt:1200-1215 | 2023 | RESSALVA (símbolos perdidos na extração) |
| Tensão de cálculo do estribo | fywd ≤ fyd para estribos, e fywd ≤ 435 MPa | 17.4.2.2 | F3 Eq. 5.22 e nota 24, Cortante.txt:1200-1215 | 2023 | CONFIRMADO |
| Taxa mínima de armadura transversal | ρsw,mín = 0,2 · fct,m / fywk | 17.4.1.1 (número não confirmado) | F3 Eq. 5.53, Cortante.txt:2040-2052 | 2023 | CONFIRMADO |
| Espaçamento mínimo entre estribos | smín = espessura do vibrador + 1 cm | 18.3.3.2 | F3, Cortante.txt:2585-2622 | 2023 | CONFIRMADO (valor do vibrador não lido) |
| Espaçamento máximo entre estribos | smáx = min(0,6 d; 30 cm) se VSd ≤ 0,67 VRd2; senão smáx = min(0,3 d; 20 cm) | 18.3.3.2 | F3 Eq. 5.67-5.69, Cortante.txt:2585-2622 | 2023 | CONFIRMADO |
| Espaçamento de ramos transversais | st,máx = min(d; 80 cm) se VSd ≤ 0,20 VRd2; senão st,máx = min(0,6 d; 35 cm) | 18.3.3.2 | F3 Eq. 5.67-5.69, Cortante.txt:2585-2622 | 2023 | CONFIRMADO |
| Diferença 2014 para 2023 nos itens acima | — | — | — | 2014 | [NÃO ENCONTRADO] |

---

## 4. Ancoragem (item 9.4)

| Grandeza | Fórmula / valor | Item NBR | Fonte | Versão | Status |
|---|---|---|---|---|---|
| Tensão de aderência de cálculo | fbd = η1 · η2 · η3 · fctd | 9.3.2.1 | F4 Eq. 1, Ancoragem.txt:320-360 | 2023 | CONFIRMADO |
| Coeficiente η1 (superfície) | η1 = 1,0 para CA-25 e CA-60; η1 = 2,25 para CA-50 | 9.3.2.1 | F4, Ancoragem.txt:320-360 | 2023 | CONFIRMADO |
| Coeficiente η2 (posição na peça) | η2 = 1,0 para boa aderência; η2 = 0,7 para má aderência | 9.3.2.1 | F4, Ancoragem.txt:320-360 | 2023 | CONFIRMADO |
| Coeficiente η3 (diâmetro) | η3 = 1,0 para φ < 32 mm; η3 = (132 − φ)/100 para φ ≥ 32 mm | 9.3.2.1 | F4, Ancoragem.txt:320-360 | 2023 | CONFIRMADO para 2023. Versão 2014 PENDENTE |
| Comprimento de ancoragem básico | lb = (φ / 4) · (fyd / fbd) | 9.4.2.4 | F4 Eq. 3, Ancoragem.txt:395-435 | 2023 | CONFIRMADO |
| Comprimento de ancoragem necessário | lb,nec = α · lb · (As,calc / As,ef), com lb,nec ≥ lb,mín. α = 1,0 sem gancho; α = 0,7 com gancho, cobrimento normal ao gancho ≥ 3φ; α = 0,7 com barras transversais soldadas (9.4.2.2); α = 0,5 com soldadas e gancho com cobrimento ≥ 3φ | 9.4.2.5 | F4 Eq. 4, Ancoragem.txt:444-470 e 470-500 | 2023 | RESSALVA (fórmula com símbolos perdidos; conferir no PDF) |
| Comprimento mínimo de ancoragem | lb,mín ≥ max(0,3 lb; 10 φ; 100 mm) | 9.4.2.5 | F4 Eq. 5 e nota da Tabela A-2, Ancoragem.txt:470-500 e 955-970 | 2023 | RESSALVA (conferir no PDF) |
| Valores tabelados de lb (CA-50 e CA-60, fck ≤ 50 MPa, com e sem gancho) | Tabelas A-1 (CA-50) e A-2 (CA-60), em função de φ e fck, para boa e má aderência | Anexo A (apostila) | F4 Tabelas A-1 e A-2, Ancoragem.txt:940-1040 | 2023 | CONFIRMADO no formato; valores numéricos não transcritos nesta coleta |
| Diferença 2014 para 2023 nos itens acima | η3 (2014) e lb,nec / lb,mín (2014) | — | — | 2014 | PENDENTE |

---

## 5. Pilares (itens 11.3.3.4.3, 15, 17.2.5 e 18.4)

| Grandeza | Fórmula / valor | Item NBR | Fonte | Versão | Status |
|---|---|---|---|---|---|
| Dimensão mínima da seção | b ≥ 19 cm. Para 14 cm ≤ b < 19 cm, multiplicar esforços por n = 1,95 − 0,05 · b (b em cm). Exemplo: n = 1,25 para b = 14 cm | 13.2.3 (número não confirmado) | F5 Tabela 6, Pilares.txt:8418 e 14347 | 2023 | RESSALVA (item não confirmado no texto) |
| Índice de esbeltez | λ = le / i | 15.8.2 (número não confirmado) | F5 Eq. 63, Pilares.txt:4368-4380 | 2023 | CONFIRMADO |
| Classificação do pilar por esbeltez | Curto: λ ≤ 35. Médio: 35 < λ ≤ 90. Medianamente esbelto: 90 < λ ≤ 140. Esbelto: 140 < λ ≤ 200 | 15.8.2 | F5 Eq. 63, Pilares.txt:4368-4380 | 2023 | CONFIRMADO |
| Fluência obrigatória | Obrigatória para λ > 90 | 15.8.4 (número não confirmado) | F5, Pilares.txt:5600-5626 (nota 51) | 2023 | CONFIRMADO |
| Método geral obrigatório | Obrigatório para λ > 140 | 15.8.3 (número não confirmado) | F5, Pilares.txt (texto resumido, linha não recolocada) | 2023 | PENDENTE (linha exata não recolocada) |
| Esbeltez-limite λ1 | λ1 = (25 + 12,5 · e1/h) / αb | 15.8.2 | F5 Eq. 83, Pilares.txt:5268-5282 | 2023 | RESSALVA (fórmula legível; limites 35 ≤ λ1 ≤ 90 não visíveis no extrato) |
| Limites de λ1 | 35 ≤ λ1 ≤ 90 | 15.8.2 | — | 2023 | PENDENTE (símbolos perdidos) |
| Coeficiente αb | αb = 0,6 + 0,4 · MB/MA, com 0,4 ≤ αb ≤ 1,0. MA e MB são os momentos de 1ª ordem nas extremidades (nós fixos) ou totais, 1ª + 2ª ordem global (nós móveis). MA é o maior valor absoluto | 15.8.2 | F5 Eq. 84, Pilares.txt:5310-5318 | 2023 | RESSALVA ("0,6" perdido no extrato; conferir no PDF) |
| Momento mínimo de 1ª ordem | M1d,mín = Nd · (0,015 + 0,03 · h), h em metros | 11.3.3.4.3 | F5 Eq. 92, Pilares.txt:5655-5672 | 2023 | CONFIRMADO |
| Excentricidade mínima | e1,mín = 1,5 + 0,03 · h (h em cm) | 11.3.3.4.3 | Equivalente a Eq. 92 com e = M/N. Linha não recolocada nesta coleta | 2023 | RESSALVA (linha exata não recolocada) |
| Curvatura aproximada | 1/r = 0,005 / [h · (ν + 0,5)], com ν = Nd / (Ac · fcd) | 15.8.3 (número não confirmado) | F5, Pilares.txt:5706 e 6237 (texto garbled) | 2023 | RESSALVA (conferir no PDF) |
| Armadura longitudinal mínima | As,mín = 0,15 · Nd / fyd ≥ 0,004 · Ac | 17.3.5.3.2 (número não confirmado) | F5 Eq. 108, Pilares.txt:6650-6668 | 2023 | CONFIRMADO |
| Armadura longitudinal máxima | As,máx = 0,08 · Ac (4% na região de emenda) | 17.3.5.3.3 (número não confirmado) | F5 Eq. 109, Pilares.txt:6663; limite de 4% em Pilares.txt:14645-14798 | 2023 | CONFIRMADO |
| Diâmetro da barra longitudinal | φ ≥ 10 mm e φ ≤ b / 8 | 18.4.2.1 (número não confirmado) | F5 Eq. 105, Pilares.txt | 2023 | CONFIRMADO (linha exata não recolocada) |
| Espaçamento livre entre barras | ≥ max(2 cm; φ; 1,2 · dmáx,agr) | 18.4.2.2 (número não confirmado) | F5, Pilares.txt | 2023 | CONFIRMADO (linha exata não recolocada) |
| Espaçamento máximo entre eixos | ≤ 2b e ≤ 40 cm | 18.4.2.2 (número não confirmado) | F5 Eq. 107, Pilares.txt | 2023 | CONFIRMADO (linha exata não recolocada) |
| Flexão oblíqua | Ábacos de Pinheiro et al. (USP, 2009). Expoente α não confirmado | — | Abacos_Flexao_Obliqua_Pinheiro.pdf (não convertido) | — | [NÃO ENCONTRADO] (expoente α) |
| Diferença 2014 para 2023 nos itens acima | — | — | — | 2014 | [NÃO ENCONTRADO] |

---

## 6. Combinações de ações (NBR 8681; itens 11.7 e 11.8)

| Grandeza | Fórmula / valor | Item NBR | Fonte | Versão | Status |
|---|---|---|---|---|---|
| Ações de referência | NBR 8681 (ações e segurança) | 4.2.3.1 (citação) | F2 Tabela 3.7, citação de NBR 8681 item 4.2.3.1 (Fundamentos_CA.txt:2446-2475) | 2023 | [NÃO ENCONTRADO] no texto da NBR 8681. Só citação secundária |
| Coeficiente γg, ação permanente desfavorável | γg = 1,4 (normal) | 11.7, Tabela 11.1 | F2 Tabela 3.7 = Tabela 11.1, Fundamentos_CA.txt:2476-2500 | 2023 | CONFIRMADO (nota "a" da tabela não lida, possível 1,35 em casos específicos: UNVERIFIED) |
| Coeficiente γg, ação permanente favorável | γg = 1,0 | 11.7, Tabela 11.1 | F2, Fundamentos_CA.txt:2476-2500 | 2023 | CONFIRMADO |
| Coeficiente γq, ação variável | γq = 1,4 (desfavorável); 0 (favorável) | 11.7, Tabela 11.1 | F2, Fundamentos_CA.txt:2476-2500 | 2023 | CONFIRMADO |
| Protensão | γp = 1,2 (desfavorável); 0,9 (favorável) | 11.7, Tabela 11.1 | F2, Fundamentos_CA.txt:2476-2500 | 2023 | CONFIRMADO |
| Recalques de apoio e retração | 1,2 (desfavorável); 0 (favorável) | 11.7, Tabela 11.1 | F2, Fundamentos_CA.txt:2476-2500 | 2023 | CONFIRMADO |
| Combinações especiais ou de construção | γg = 1,3 (desfavorável); 1,0 (favorável) | 11.7, Tabela 11.1 | F2, Fundamentos_CA.txt:2476-2500 | 2023 | CONFIRMADO |
| Combinação última normal (ELU) | Fd = Σ γg Fgik + γq [Fq1k + Σ ψ0j Fqjk]. Forma do texto extraído com símbolos perdidos: "Fd = γg Fgk + γg Fgk + γq (Fq1k + Σ ψ0j Fqjk) + γq ψ0 Fqk". A fórmula exata está PENDENTE | 11.8.3, Tabela 11.3 | F2 Tabela 3.5 = Tabela 11.3, Fundamentos_CA.txt:2326-2345 | 2023 | PENDENTE (conferir no PDF) |
| Fatores de combinação ψ0, ψ1, ψ2 (edifícios, sem predominância de equipamentos fixos ou de concentração de pessoas) | ψ0 = 0,5; ψ1 = 0,4; ψ2 = 0,3 | 11.8.3, Tabela 11.2 | F6 Tabela 4 = Tabela 11.2, Vigas.txt:2791-2817; F2 Tabela 3.8, Fundamentos_CA.txt:2540-2555 | 2023 | CONFIRMADO |
| ψ0, ψ1, ψ2 (edifícios, com predominância de equipamentos fixos ou alta concentração de pessoas) | ψ0 = 0,7; ψ1 = 0,6; ψ2 = 0,4 | 11.8.3, Tabela 11.2 | F6 Tabela 4, Vigas.txt:2791-2817 | 2023 | CONFIRMADO |
| ψ0, ψ1, ψ2 (biblioteca, arquivos, oficinas e garagens) | ψ0 = 0,8; ψ1 = 0,7; ψ2 = 0,6 | 11.8.3, Tabela 11.2 | F6 Tabela 4, Vigas.txt:2791-2817 | 2023 | CONFIRMADO |
| ψ0, ψ1, ψ2 (vento) | ψ0 = 0,6; ψ1 = 0,3; ψ2 = 0 | 11.8.3, Tabela 11.2 | F6 Tabela 4, Vigas.txt:2791-2817 | 2023 | CONFIRMADO |
| ψ0, ψ1, ψ2 (temperatura) | Não visível no extrato da Tabela 11.2 (cortado) | 11.8.3, Tabela 11.2 | F2 Tabela 3.8 (citação de temperatura), Fundamentos_CA.txt:2540-2555 | 2023 | PENDENTE |
| Combinação quase permanente de serviço | Fd,ser = Σ Fgik + Σ ψ2j · Fqjk | 11.8.3 (Eq. 57, combinação de serviço) | F6 Eq. 57, Vigas.txt:2781 | 2023 | CONFIRMADO |
| Diferença 2014 para 2023 nos itens acima | — | — | — | 2014 | PENDENTE |

---

## Pendências consolidadas

Itens que não podem ser usados no software sem conferência no texto oficial da NBR 6118:2023 ou no PDF da apostila:

1. **αc (bloco de tensões, fck > 40 ou 50).** F1 usa (40/fck)^(1/3). F5 usa 0,85 · [1 − (fck − 50)/200] para Grupo II. O pedido inicial pede 0,85 para fck ≤ 50. A fonte web não confirmada indica (40/fck)^(1/3) para 2023. Decisão necessária antes de implementar.
2. **Forma exata da combinação última (Tabela 11.3).** O extrato tem símbolos perdidos.
3. **Coeficiente ψ0 para temperatura (Tabela 11.2)** e nota "a" da Tabela 11.1 (γg = 1,35 possível).
4. **αb (Eq. 84).** O "0,6" está perdido no extrato.
5. **Limites de λ1 (35 ≤ λ1 ≤ 90).** Não visíveis no extrato.
6. **αv2 = 1 − fck/250 para fck > 50.** Não conferido na F3.
7. **Expoente α para flexão oblíqua.** Não convertido (ábacos de Pinheiro).
8. **Curvatura aproximada e forma completa de Eq. 5.22 (Vsw) e Eq. 4 (lb,nec).** Texto com símbolos perdidos.
9. **Comparação 2014 para 2023 em todos os itens.** Nenhuma fonte 2014 foi lida. As diferenças por item ficam [NÃO ENCONTRADO].
10. **Números de item marcados como "não confirmado"** (ex.: 15.8.3, 17.3.5.3.2, 18.4.2.1) foram indicados a partir do contexto das apostilas, não lidos no texto da norma.

## Verificação realizada

- Releitura nesta sessão: Tabela 17.3 (F1 Tabela 2) e Tabela 11.2 (F6 Tabela 4), conferidas no texto extraído. As demais linhas citadas vêm da coleta anterior e não foram relidas uma a uma nesta redação. Os números de linha são aproximados.
- Não foi executado nenhum teste de software. Este arquivo não altera código do projeto.
- O arquivo `docs/norma/NBR6118-2023.md` e `docs/norma/exemplos.md` não foram lidos nem alterados nesta tarefa.

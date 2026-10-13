# Pendências [VERIFICAR] de norma: SISTRUT V2

Data da pesquisa: 2026-10-12.

## Como ler este documento

- **Regra geral:** nenhum valor foi inventado. Onde nenhuma fonte foi lida, o item diz "não confirmado".
- **Normas ABNT são pagas.** Todas as fontes abaixo são secundárias (apostilas, TCCs, artigos). Nenhuma reproduz o texto normativo integral. Quando uma fonte cita a norma, isso é dito explicitamente.
- **Caminhos locais** são relativos a `C:/Users/MunaroPC/AppData/Local/Temp/`:
  - `nbr-research/` = pasta de textos extraídos de fontes sobre a NBR 6118 e 6120.
  - `norma-scratch/` = pasta de textos extraídos das apostilas de Bastos e de artigos.
- **Grau de confiança:**
  - Alta: duas ou mais fontes independentes concordam, com edição declarada.
  - Média: uma fonte com edição declarada, ou duas sem edição declarada.
  - Baixa: uma fonte sem edição declarada, ou paráfrase de terceiros.
  - Não confirmado: nenhuma fonte lida confirma o valor.
- **Símbolos:** o pedido chama o coeficiente de compressão de η. As apostilas usam αc. Este documento usa αc e aponta a correspondência no item 4.

---

## Item 1. NBR 6120:2019, Tabela 10 (sobrecargas) e pesos específicos

### Resposta

**Sobrecargas**

- **Residencial, dormitórios e salas: 1,5 kN/m².** Confiança média.
  - Fonte 1: Costa (2023), `nbr-research/costa2023.txt:6160`. Texto: "Comparando com o valor nominal da NBR 6120 (ABNT, 2019) para edifícios residenciais, q = 1,5 kN/m²".
  - Fonte 2: material da disciplina PEF2603 (USP), citado por busca web. Trecho de resultado de busca: "1,5 KN/m² (residências, dormitórios salas etc.)". URL da busca: `https://edisciplinas.usp.br/pluginfile.php/7493554/mod_resource/content/3/PEF2603-2023%20-%20Aula%208%20-%20Lajes%20-%20Levantamento%20de%20cargas.pdf`. Não foi aberto o PDF completo. Confirmar antes de usar.
- **Garagens de veículos com PBT até 30 kN: 3,0 kN/m².** Confiança média.
  - Fonte: Costa (2023), `nbr-research/costa2023.txt:8422`, e `nbr-research/costa2023.txt:8889` ("para o projeto de garagens e demais áreas de circulação de veículos é q = 3,0 kN/m²"). Ambas citam NBR 6120 (ABNT, 2019).
- **Escritórios, cozinha, banheiro, área de serviço, despensa, corredores, escadas, forro sem acesso e terraço: não confirmados.** Nenhuma fonte lida traz a tabela 2019 completa. Costa (2023) traz valor de 3,0 kN/m² para salas de aula (`costa2023.txt:6382`), que não corresponde ao item pedido.
- **Ponto de atenção.** A busca web para escritórios e garagens não trouxe valor confirmado. Os resultados citados sem fonte não foram usados.

**Pesos específicos**

- **Concreto armado: 25 kN/m³ (2.500 kg/m³).** Confiança alta para o valor de projeto, média para a fonte normativa.
  - O valor vem de NBR 6118, item 8.2.2, e não da NBR 6120. Fonte: Bastos, *Fundamentos do Concreto Armado* (UNESP Bauru, set/2023), `norma-scratch/Fundamentos_CA.txt:2233`. Texto: "considerando-se a massa específica para o concreto simples de 2.400 kg/m³ e 2.500 kg/m³ para o Concreto Armado e Protendido, conforme apresentado no item 8.2.2 da NBR 6118".
  - Também em Bastos, `norma-scratch/Torcao.txt:4238`: "peso específico do Concreto Armado: γconc = 25 kN/m³".
- **Argamassa de revestimento: 19 kN/m³.** Confiança baixa. Edição da norma não declarada.
  - Fonte: Bastos, `norma-scratch/Torcao.txt:4241`: "conforme NBR 6120: argamassa de revestimento com γarg,rev = 19 kN/m³".
- **Tijolo maciço: 18 kN/m³. Bloco cerâmico furado: 13 kN/m³.** Confiança baixa. Edição não declarada.
  - Fonte: Bastos, `norma-scratch/FlexaoSimples.txt:385`: "De acordo com a NBR 6120, o peso específico é de 18 kN/m³ para o tijolo maciço e 13 kN/m³ para o bloco cerâmico furado."
  - As tabelas de pesos citadas em Bastos (`norma-scratch/Vigas.txt:1438–1454`, "Tabela 3, parte da Tabela 1 da NBR 6120") provavelmente seguem a numeração da edição de 1980. Não confirmado para 2019.
- **Contrapiso, revestimento de gesso e outros materiais: não confirmados.**

### Fontes

| Fonte | Localização | Edição declarada | Reproduz o texto normativo? |
|---|---|---|---|
| Costa (2023), tese EESC/USP | `nbr-research/costa2023.txt:6160, 8422, 8889` | NBR 6120:2019 | Não. Cita o valor. |
| Bastos (2023), *Fundamentos do CA*, UNESP | `norma-scratch/Fundamentos_CA.txt:2233` | NBR 6118 item 8.2.2 | Não. Cita item e valor. |
| Bastos (2023), *Torção*, UNESP | `norma-scratch/Torcao.txt:4238, 4241` | Não declarada | Não. |
| Bastos, *Flexão Simples*, UNESP | `norma-scratch/FlexaoSimples.txt:385` | Não declarada | Não. |
| PEF2603, USP (2023), aula 8 | Busca web (ver URL acima) | NBR 6120:2019 (citada) | Não. Aula. Não aberta. |

### Mudou entre 2014 e 2023?

- A NBR 6120 é de 2019 e não tem edição 2014 nem 2023. O pedido compara 2014 com 2023, mas a 6120 não muda nesse intervalo.
- Mudança 1980 para 2019: a edição de 1980 é citada por Santiago (2019), `nbr-research/santiago2019.txt:1841, 1960`, que usa a NBR 6120:1980 em cálculo. Não foi feita comparação de valores 1980 e 2019 neste levantamento. **Não confirmado.**

### Pendências

- Obter a Tabela 10 completa da NBR 6120:2019 (texto integral ou material que a reproduza). Sem isso, escritórios, cozinha, banheiro, corredores, escadas, forro e terraço continuam sem valor.
- Confirmar a tabela de pesos específicos de 2019 (numeração e valores de alvenaria e revestimento).

---

## Item 2. NBR 6118, Tabela 11.2: coeficientes ψ0, ψ1, ψ2

### Resposta

| Tipo de uso | ψ0 | ψ1 | ψ2 |
|---|---|---|---|
| Residencial (sem predominância de equipamentos fixos nem alta concentração de pessoas) | 0,5 | 0,4 | 0,3 |
| Comercial, escritórios, estações, prédios públicos (predominância de equipamentos ou alta concentração de pessoas) | 0,7 | 0,6 | 0,4 |
| Bibliotecas, arquivos, oficinas e garagens | 0,8 | 0,7 | 0,6 |

Confiança: média-alta para os valores. Três fontes reproduzem os mesmos números. Edição 2023 declarada em apenas uma delas, e sem edição na tabela.

### Fontes

1. **Teshima (2012), TCC UNESP Guaratinguetá, p. 35.** Tabela 1, "TABELA DE ψ (NBR6118 - tabela 11.2)". Edição citada: **2003**. Local: `nbr-research/unesp_repo.txt:801–826`. Reproduz os valores da tabela, não o texto da norma. Inclui também vento (0,6 / 0,3 / 0) e temperatura (0,6 / 0,5 / 0,3).
2. **Bastos (set/2023), *Fundamentos do Concreto Armado*, UNESP Bauru, Tabela 3.8, p. 62.** Título da tabela: "Valores do coeficiente ψ2 (Tabela 11.2 da NBR 6118)". Local: `norma-scratch/Fundamentos_CA.txt:2541–2573`. O cabeçalho do documento diz seguir a NBR 6118:2023 (`Fundamentos_CA.txt:12`). A tabela mostra os três coeficientes. Reproduz a tabela, não o texto da norma.
3. **Bastos, *Vigas de Concreto Armado*, UNESP Bauru, Tabela 4, p. 50.** Título: "Tabela 11.2 da NBR 6118". Local: `norma-scratch/Vigas.txt:2781–2820`. Mesmos valores.
4. **Costa (2023), tese EESC/USP, Tabela 2.3.** Local: `nbr-research/costa2023.txt:1745–1930`. Cross-check parcial. A extração da tabela está desalinhada. Valores legíveis para comerciais (2,5 / 0,7 / 0,6 / 0,4), coerentes com a linha 2 acima. A linha residencial não é legível.

### Mudou entre 2014 e 2023?

- **Não confirmado** para 2014 e 2023 como texto normativo.
- Indício: Teshima cita a edição de 2003 com os mesmos valores que Bastos (2023) reproduz. Isso sugere que a tabela não mudou entre 2003 e 2023. É inferência, não confirmação. A edição de 2014 não foi verificada.

### Pendências

- Confirmar a Tabela 11.2 do texto da NBR 6118:2023 (ou de uma fonte que cite a edição 2023 da tabela). O que está em `NBR6118-2023.md` linhas 114–115 pode ser atualizado depois disso. Não foi editado nada neste levantamento.
- Confirmar se "garagens" entra na mesma linha de "bibliotecas, arquivos e oficinas" em 2023 (as fontes lidas agrupam os quatro).

---

## Item 3. NBR 6118, item 14.7.6.2: compatibilização de momentos negativos

### Resposta

- **Permitido pela NBR 6118:2014.** Confiança baixa. A permissão aparece como paráfrase de terceiro, com edição declarada.
  - Fonte: Rodovalho (2018), RECIEC, seção 2.2.6, p. 159, `norma-scratch/txt/reciec_2018.txt:147–153`. Texto: "é permitido pela NBR 6118 (ABNT, 2014) um processo de compatibilização desses momentos (CLÍMACO, 2016)."
  - O texto cita a norma, mas não reproduz o item 14.7.6.2 e não dá o número do item.
- **Regra de 80%** (limite de redução do momento negativo): **não confirmado.** A fonte lida não traz o critério. A busca web trouxe o valor 80% sem fonte. Não usar.
- **Correção dos momentos positivos** para compensar a redução do negativo: **não confirmado.**

### Fontes

| Fonte | Localização | Edição declarada | Reproduz o texto normativo? |
|---|---|---|---|
| Rodovalho (2018), RECIEC, seção 2.2.6 | `norma-scratch/txt/reciec_2018.txt:147–153`, p. 159 | NBR 6118:2014 | Não. Paráfrase; cita a norma e Clímaco (2016). |

### Mudou entre 2014 e 2023?

- **Não verificado.** Nenhuma fonte lida traz o texto de 2023 do item 14.7.6.2. Não é possível afirmar se a permissão foi mantida, alterada ou detalhada.

### Pendências

- Obter o texto do item 14.7.6.2 da NBR 6118:2014 e da NBR 6118:2023, ou material que o reproduza (apostila, Clímaco 2016, ou a fonte citada por Rodovalho).
- Confirmar se a regra de 80% existe, em que condição, e como se corrigem os positivos.

---

## Item 4. NBR 6118, item 8.2.10.1: coeficiente de compressão do concreto (η ou αc) em 2023

### Resposta

**Correspondência de símbolos.** O pedido chama o coeficiente de η. As apostilas usam αc. Este item usa αc.

**2014 (confirmado):**

- αc = 1,0 para fck ≤ 40 MPa.
- αc = (40/fck)^(1/3) para fck > 40 MPa.
- Confiança: **alta.** Duas fontes independentes com edição 2014 declarada (UFPel e LAJSS). Três apostilas de Bastos, sem edição declarada, trazem a mesma fórmula.
  - Bastos, *Fundamentos do Concreto Armado*, `norma-scratch/Fundamentos_CA.txt:854–855`. Texto: "a) 1,0 para fck ≤ 40 MPa; b) (40/fck)^(1/3) para fck > 40 MPa."
  - Bastos, *Flexão Simples*, `norma-scratch/FlexaoSimples.txt:659–660`, Eq. 16.
  - Bastos, *Pilares*, `norma-scratch/Pilares.txt:137–138`.
  - Motta, Santos e Couto (UFPel, EN_03297, 2023), eq. 11: η = (40/fck)^(1/3) ≤ 1,0, atribuída à NBR 6118:2014. Símbolos perdidos na extração. Fonte: `nbr-research/ufpel_en03297.txt:60–104`.
  - Machado, Campos Filho e Real, *Latin American Journal of Solids and Structures* (2025), DOI `10.1590/1679-7825/e8343`, eq. 1–4 e 7–10, para a edição de 2014. Fonte: `nbr-research/lajss.txt:103–175`.

**2023 (não confirmado):**

- A fórmula de 2023 **não foi lida** em nenhuma fonte.
- Indício de mudança no item 8.2.10.1: TCC UFU (2023) afirma que o item ganhou um diagrama tensão-deformação não linear, além do idealizado. Fonte: `nbr-research/ufu_tcc.txt:420–427`. Texto: "No item 8.2.10.1 será previsto além do diagrama tensão-deformação idealizado, Figura 9, um diagrama de tensão deformação para análise estrutural não linear, já presente no FIB Model Code, 2010". A figura do diagrama é marcada como "Fonte: FIB International, 2010. - Adaptado".
- UFPel, EN_03297 (2023), descreve a formulação de 2023 como uma combinação dos dois modelos do EC2, com fator de fragilidade 0,85 e coeficiente entre 0,8 e 1,0. Não traz fórmula legível de αc. Fonte: `nbr-research/ufpel_en03297.txt:105–160`. É interpretação do artigo, não texto normativo.
- LAJSS (2025) compara confiabilidade das seções dimensionadas pelas edições de 2014 e 2023. Diz que o dimensionamento de 2023 chega a até 19% a mais de área de aço, por causa do coeficiente de minoração do concreto, e que a confiabilidade não melhora em relação a 2014. Não trata de αc. Fonte: `nbr-research/lajss.txt`, resumo.

### Fontes

| Fonte | Localização | Edição declarada | Reproduz o texto normativo? |
|---|---|---|---|
| Bastos, *Fundamentos do CA* | `norma-scratch/Fundamentos_CA.txt:854–855` | Não declarada | Não. Fórmula em apostila. |
| Bastos, *Flexão Simples* | `norma-scratch/FlexaoSimples.txt:659–660` | Não declarada | Não. |
| Bastos, *Pilares* | `norma-scratch/Pilares.txt:137–138` | Não declarada | Não. |
| Motta, Santos e Couto, UFPel, EN_03297 | `nbr-research/ufpel_en03297.txt:60–160` | 2014 e 2023 citadas | Não. Artigo, símbolos perdidos. |
| Machado, Campos Filho e Real, LAJSS 2025 | `nbr-research/lajss.txt:103–175` | 2014 e 2023 | Não. Artigo. |
| TCC UFU (2023), item 2.8 | `nbr-research/ufu_tcc.txt:420–427` | 2023 | Não. Trabalho de graduação. |

### Mudou entre 2014 e 2023?

- **Indício de mudança, não confirmado.** O TCC UFU diz que o 8.2.10.1 ganhou diagrama não linear em 2023. O artigo UFPel descreve a formulação de 2023 como combinação de dois modelos do EC2. Nenhuma das duas fontes dá a fórmula nova de αc.
- O valor de αc para 2023 **não está verificado.**

### Pendências

- Obter o texto do item 8.2.10.1 da NBR 6118:2023.
- Confirmar se o diagrama idealizado de 2023 mantém αc = (40/fck)^(1/3) ou usa outro coeficiente, e se a mudança afeta só a análise não linear.
- Não alterar `NBR6118-2023.md` nem o código do projeto sem esse texto.

---

## Item 5. NBR 6118, item 17.2.5: expoente α da flexão oblíqua simplificada

### Resposta

**2014 (confirmado por fonte secundária):**

- α = 1 em geral, a favor da segurança.
- α = 1,2 para seção retangular.
- Confiança: **média.** Uma fonte com edição declarada.
  - Cruz e Couto (UFPel, EN_02759, 2020), `norma-scratch/txt/ufpel_2759.txt`. Título do artigo: "Avaliação do parâmetro do processo aproximado para o dimensionamento à flexão composta oblíqua". Texto: "A NBR 6118 (ABNT, 2014) recomenda que em geral pode ser adotado α=1, a favor da segurança. No caso de seções retangulares, pode-se adotar α=1,2."
  - Bastos, *Pilares*, `norma-scratch/Pilares.txt:3945`: cita o item 17.2.5 como processo aproximado, sem o expoente. Não confirma o valor.

**2023 (não verificado):**

- Nenhuma fonte lida traz o valor de α de 2023.

### Fontes

| Fonte | Localização | Edição declarada | Reproduz o texto normativo? |
|---|---|---|---|
| Cruz e Couto, UFPel, EN_02759 (2020) | `norma-scratch/txt/ufpel_2759.txt` | NBR 6118:2014 | Não. Cita a norma. |
| Bastos, *Pilares* | `norma-scratch/Pilares.txt:3945` | Não declarada | Não. Só menciona o item. |
| Pinheiro, ábacos de flexão oblíqua (USP) | Link encontrado em busca; endereço não registrado nesta versão | Não lido | Não lido. |

### Mudou entre 2014 e 2023?

- **Não verificado.**

### Pendências

- Abrir o PDF de Pinheiro (ábacos). O WebFetch e o curl falharam com `SEC_E_CERT_EXPIRED`. Não usei `-k`. Tentar outro endereço ou outra cópia.
- Confirmar α de 2023 em material que cite a edição de 2023.

---

## Item 6. NBR 6118, item 17.4.1.1.1: taxa mínima de estribos ρsw,min e limite de fywk

### Resposta

**Fórmula (confirmada em apostilas, edição não declarada):**

- ρsw,min = 0,2 · fct,m / fywk.
- fct,m = 0,3 · ∛(fck²). A raiz cúbica foi reconstruída do texto extraído, que perdeu o símbolo. O exemplo de Vigas (fck = 30 MPa, fct,m = 2,90 MPa) confirma a leitura.
- Asw,min (cm²/m, estribo vertical, s = 100 cm) = 20 · fct,m · bw / fywk, com bw em cm e fywk em kN/cm².
- Confiança: **média.** Três apostilas de Bastos com a mesma fórmula.
  - Bastos, *Cortante*, `norma-scratch/Cortante.txt:1856–1885`, Eq. 5.45 e 5.46. Cita o item 17.4.1.1.1 em `Cortante.txt:1826`.
  - Bastos, *Torção*, `norma-scratch/Torcao.txt:1321–1336`, Eq. 29, para torção, com "fywk ≤ 500 MPa".
  - Bastos, *Vigas*, `norma-scratch/Vigas.txt:7115–7127`, exemplo: estribo Ø5 mm CA-60, fywk = 60 kN/cm².

**Limite de fywk (em conflito, não resolvido):**

- Bastos, *Torção* (`Torcao.txt:1336`): "fywk ≤ 500 MPa" na Eq. 29.
- Bastos, *Cortante* (`Cortante.txt:3037`) e *Vigas* (`Vigas.txt:7127`): usam CA-60 com fywk = 60 kN/cm² (600 MPa).
- As apostilas se contradizem. Uma admite 500 MPa como teto; as outras usam 600 MPa para CA-60.
- Limite de tensão de cálculo do estribo: fywd ≤ 435 MPa (item 17.4.2.2), confirmado em `Cortante.txt:1281, 1301` e `Torcao.txt:1285`. Esse limite trata da tensão de cálculo, não do fywk da fórmula de ρsw,min. Não confundir.

### Fontes

| Fonte | Localização | Edição declarada | Reproduz o texto normativo? |
|---|---|---|---|
| Bastos, *Cortante* | `norma-scratch/Cortante.txt:1826, 1856–1885, 3037` | Não declarada | Não. Cita item e fórmula. |
| Bastos, *Torção* | `norma-scratch/Torcao.txt:1285, 1321–1336` | Não declarada | Não. |
| Bastos, *Vigas* | `norma-scratch/Vigas.txt:7115–7127` | Não declarada | Não. Exemplo numérico. |

### Mudou entre 2014 e 2023?

- **Não verificado.** As apostilas não declaram edição, e nenhuma fonte lida compara 2014 e 2023 para ρsw,min.
- `Cortante.txt:1822` trata de armadura transversal em lajes (250 MPa para lajes até 15 cm; 435 MPa para lajes acima de 35 cm). Não é o ρsw,min de vigas, e a edição não é declarada.

### Pendências

- Obter o texto do item 17.4.1.1.1 da NBR 6118:2014 e de 2023, para confirmar a fórmula e o limite de fywk.
- Decidir qual limite de fywk o SISTRUT aplica (500 MPa, 600 MPa ou outro) só depois dessa confirmação. Não alterar o código antes.

---

## Item 7. NB-1/78: estribo a 435 MPa, taxa mínima 0,14%, má aderência e τwu1

### Resposta

Resultado parcial. Só a taxa de flexão da NB-1 foi lida, em fonte secundária. Os demais valores pedidos não foram encontrados em fonte lida.

- **Taxa mínima de armadura de tração (flexão), NB-1/78:** 0,25% para CA-25 e CA-30, e 0,15% para CA-40, CA-50 e CA-60. Confiança: **média-baixa.**
  - Fonte: Silva e Araújo (2015), "Estudo das taxas mínimas de armadura de tração em vigas de concreto armado segundo a ABNT NBR 6118:2014", *Essentia* (Sobral), v. 16, n. esp., p. 38–54. Local: `norma-scratch/txt/essentia_68.txt:79–107`. Texto: "a NB-1/1978 exigia que se considerasse a taxa de 0,25% ... para aço CA-25 ou CA-30, e 0,15% para aços CA-40, CA-50 ou CA-60".
  - O artigo atribui o cálculo a Sissekind (1987). Não reproduz a NB-1.
  - O valor de **0,14% não aparece** nessa fonte. O artigo diz 0,15%. Se o 0,14% do pedido se refere à armadura de estribo, não encontrei fonte para ele.
- **Estribo a 435 MPa na NB-1/78:** **não confirmado.** O 435 MPa das apostilas é o fyd do CA-50 (fyk/1,15) e o limite de cálculo do estribo na NBR 6118 de 2003 e 2014 (item 17.4.2.2). Nenhuma fonte lida diz que a NB-1 usava 435 MPa para estribo.
  - Lead: Bastos, *Cortante*, `norma-scratch/Cortante.txt:5184–5202`, Tabela 5.7, compara Asw_90 pela NBR 6118 (Modelos I e II) e pela NB 1/78, com e sem o anexo NB 116/89. A tabela usa γc = γf = 1,4 e γs = 1,15. Os parâmetros da NB-1 não aparecem no trecho lido. Com os valores da tabela seria possível inferir a tensão usada pela NB-1. Não feito neste levantamento.
- **Má aderência e τwu1:** **não confirmado.** Nenhuma fonte lida traz o coeficiente de má aderência nem o τwu1 da NB-1. Buscas em web e pastas locais não retornaram fonte confiável.
- **Histórico (confirmado):** NB-1 com última edição em 1978, renomeada para NBR 6118 em 1980, substituída em 2003, reeditada em 2007 e substituída pela de 2014. Fonte: Bastos, `norma-scratch/Fundamentos_CA.txt:231`. Esse histórico não contém os valores pedidos.

### Fontes

| Fonte | Localização | Edição declarada | Reproduz o texto normativo? |
|---|---|---|---|
| Silva e Araújo (2015), *Essentia* | `norma-scratch/txt/essentia_68.txt:79–107` (taxas de flexão); `:270–285, 410–420` (NBR 6118:2014) | NB-1/1978 citada | Não. Cita Sissekind (1987). |
| Bastos, *Fundamentos do CA* | `norma-scratch/Fundamentos_CA.txt:231` | Histórico | Não. |
| Bastos, *Cortante* | `norma-scratch/Cortante.txt:5184–5202` | NB 1/78 com anexo NB 116/89 | Não. Tabela comparativa, sem os parâmetros da NB-1. |

### Mudou entre 2014 e 2023?

- **Não é comparação direta.** O artigo registra que a NBR 6118:2003 substituiu a NB-1/1978 e passou a exigir momento fletor mínimo para a armadura de tração. A NBR 6118:2014 exige taxa mínima absoluta de 0,15% (`essentia_68.txt:270–285`). Isso é sobre flexão.
- Os valores de estribo da NB-1 não foram comparados com 2014 nem com 2023.

### Pendências

- Obter o texto da NB-1/1978 (ABNT), ou material que a reproduza com itens, para confirmar o estribo, a taxa de 0,14%, a má aderência e o τwu1. A norma não é pública.
- Verificar a Tabela 5.7 de Bastos (`Cortante.txt:5184–5202`) para inferir a tensão de estribo da NB-1. Só serve para comparação histórica, não para o SISTRUT.
- Até lá, não usar 435 MPa, 0,14%, má aderência ou τwu1 como valores da NB-1 no projeto.

---

## Tabela resumo

| Item | Resposta | Confiança | Fonte |
|---|---|---|---|
| 1. Sobrecargas NBR 6120:2019 | Residencial 1,5 kN/m²; garagens 3,0 kN/m². Demais valores não confirmados. Concreto armado 25 kN/m³. Argamassa 19 kN/m³; alvenaria 18 e 13 kN/m³ (edição não declarada). | Média para sobrecargas citadas; baixa para pesos de alvenaria e argamassa | Costa (2023), `nbr-research/costa2023.txt:6160, 8422, 8889`; Bastos, `norma-scratch/Fundamentos_CA.txt:2233`, `Torcao.txt:4238, 4241`, `FlexaoSimples.txt:385` |
| 2. ψ0, ψ1, ψ2 (Tabela 11.2) | Residencial 0,5 / 0,4 / 0,3; comercial 0,7 / 0,6 / 0,4; bibliotecas, arquivos, oficinas e garagens 0,8 / 0,7 / 0,6. Edição 2014 e 2023 não confirmada. | Média-alta | Teshima (2012), `nbr-research/unesp_repo.txt:801–826` (cita 2003); Bastos, `norma-scratch/Fundamentos_CA.txt:2541–2573` (cita NBR 6118:2023); Bastos, `norma-scratch/Vigas.txt:2781–2820` |
| 3. Compatibilização de momentos (14.7.6.2) | 2014 permite compatibilização (paráfrase). Regra de 80% e correção dos positivos não confirmadas. 2023 não verificado. | Baixa | Rodovalho (2018), RECIEC, p. 159, `norma-scratch/txt/reciec_2018.txt:147–153` (cita NBR 6118:2014 e Clímaco 2016) |
| 4. Coeficiente de compressão (8.2.10.1) | 2014: αc = 1,0 para fck ≤ 40 MPa; (40/fck)^(1/3) para fck > 40 MPa. 2023: não confirmado; indício de mudança no diagrama. | Alta para 2014; não confirmado para 2023 | Bastos, `norma-scratch/Fundamentos_CA.txt:854–855`; Motta, Santos e Couto, `nbr-research/ufpel_en03297.txt:60–104`; Machado et al., `nbr-research/lajss.txt`; TCC UFU, `nbr-research/ufu_tcc.txt:420–427` (2023) |
| 5. Expoente α, flexão oblíqua (17.2.5) | 2014: α = 1 em geral; α = 1,2 para seção retangular. 2023 não verificado. | Média (2014); não verificado (2023) | Cruz e Couto, UFPel, EN_02759 (2020), `norma-scratch/txt/ufpel_2759.txt`, que cita NBR 6118:2014. Pinheiro não lido (certificado expirado). |
| 6. ρsw,min e limite de fywk (17.4.1.1.1) | ρsw,min = 0,2 · fct,m / fywk; fct,m = 0,3 · ∛(fck²). Limite de fywk em conflito: 500 MPa (Torção) ou 600 MPa para CA-60 (Cortante e Vigas). fywd ≤ 435 MPa para estribos (17.4.2.2). | Média para a fórmula; não resolvido para o limite de fywk | Bastos, `norma-scratch/Cortante.txt:1856–1885, 3037`; `Torcao.txt:1336`; `Vigas.txt:7115–7127` |
| 7. NB-1/78 (estribo 435 MPa, 0,14%, má aderência, τwu1) | Não resolvido. NB-1 (flexão): 0,25% para CA-25/30 e 0,15% para CA-40/50/60, segundo artigo. 0,14%, 435 MPa para estribo, má aderência e τwu1 não confirmados. | Média-baixa para a taxa de flexão (fonte secundária); não confirmado para os demais | Silva e Araújo (2015), *Essentia*, `norma-scratch/txt/essentia_68.txt:79–107`; Bastos, `norma-scratch/Fundamentos_CA.txt:231`; `Cortante.txt:5184–5202` (lead) |

### Pendências gerais

- Obter as normas (NBR 6118:2014 e 2023, NBR 6120:2019, NB-1/1978) ou fontes que reproduzam os itens. Sem o texto normativo, os itens 3, 4 (2023), 5 (2023), 6 (limite de fywk) e 7 continuam em aberto.
- Não alterar `NBR6118-2023.md`, `SPEC.md` nem `MOTOR-6118.md` sem pedido. Nenhum código do projeto foi alterado nesta pesquisa.

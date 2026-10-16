# Tabelas de lajes (tipos de Bares/Pinheiro): como o app calcula momentos, reações e flechas

## 1. Escopo e status

O motor da NBR 6118 (`src/calculo/normas/nbr6118-2023/lajes.ts`) calcula lajes maciças retangulares com carga uniforme e bordos apoiados ou engastados por coeficientes tabelados em λ = ly/lx. Os coeficientes ficam em `src/calculo/normas/nbr6118-2023/tabelasBares.ts`, um arquivo **gerado** por `scripts/bares/gerar.ts`:

```
bun scripts/bares/gerar.ts
```

O gerador é determinístico (mesma saída a cada execução) e não lê nenhuma tabela publicada: calcula os coeficientes pela teoria de placas e pelo processo das áreas. O app manteve a numeração dos tipos (1 a 6) e o formato das tabelas de Bares adaptadas por Pinheiro, que a apostila de Bastos (*Lajes de Concreto*, UNESP, 2023, Anexo) usa e que o motor seguia antes, para que a memória de cálculo continue comparável com a literatura.

Não normativo: a análise elástica por tabelas é uma escolha do app (docs/SPEC.md); a NBR 6118 admite análise linear (14.7.3) e o processo das áreas para as reações (14.7.6.1), mas não traz tabelas. [NÃO NORMATIVO]

Fora do escopo: lajes com bordo livre (só o balanço com três bordos livres, tratado como faixa engastada em `lajes.ts`) e cargas triangulares. A apostila tem tabelas para esses casos; o app não as usa.

## 2. Convenções

- lx é o vão horizontal do desenho da tabela e o **menor** vão; ly = λ·lx, com 1 ≤ λ. Se o menor vão da laje é o vertical da planta, `lajes.ts` transpõe a tabela.
- x-bordos: perpendiculares a lx (esquerdo E e direito D). y-bordos: perpendiculares a ly (inferior I e superior S).
- Tipo = quantidade de engastes (nx nos x-bordos, ny nos y-bordos). Na orientação da tabela:

| Tipo | (nx, ny) | Engastados |
|---|---|---|
| 1 | (0, 0) | nenhum |
| 2A | (0, 1) | I |
| 2B | (1, 0) | D |
| 3 | (1, 1) | D, I |
| 4A | (0, 2) | I, S |
| 4B | (2, 0) | E, D |
| 5A | (1, 2) | D, I, S |
| 5B | (2, 1) | E, D, I |
| 6 | (2, 2) | todos |

  Nos tipos assimétricos, qual dos dois bordos opostos é o engastado não muda os coeficientes (espelhamento).
- Colunas (22 posições: λ = 1,00 a 2,00 de 0,05 em 0,05, e a linha "> 2,00"):
  - `mx`, `my` (μx, μy): momentos positivos **no centro** da placa; M = μ · p · lx² / 100.
  - `mxNeg`, `myNeg` (μ'x, μ'y): módulo do maior momento negativo **ao longo do bordo** engastado; mesma fórmula. Nos bordos simétricos (o oposto tem o mesmo vínculo) é o meio do bordo; nos tipos 3, 5A (μ'y) e 5B (μ'x) o máximo fica deslocado para o canto apoiado.
  - `vx`, `vy` (νx, νy): reação nos bordos apoiados; `vxNeg`, `vyNeg` (ν'x, ν'y): nos engastados; V = ν · p · lx / 10.
  - `alfa` (α): flecha elástica no centro, a = α · p · lx⁴ / (1200 · EI), com EI da faixa de 1 m (E·h³/12). `lajes.ts` aplica a rigidez de Branson e a fluência sobre essa flecha.
- Interpolação: `coeficienteBares` (em `lajes.ts`) interpola linearmente entre linhas; λ > 2 usa a linha "> 2,00".

## 3. Momentos e flecha: teoria de placas

Placa delgada (Kirchhoff), isótropa, elástica linear, carga uniforme q, rigidez D = E h³ / (12 (1 − ν²)). Equação: D ∇⁴w = q, com w = 0 em todos os bordos, momento nulo nos apoiados e rotação nula nos engastados. Momentos: Mx = −D (w,xx + ν w,yy), My = −D (w,yy + ν w,xx).

### 3.1 Método (scripts/bares/placas.ts)

Superposição, como em Timoshenko & Woinowsky-Krieger, *Theory of Plates and Shells* (2ª ed., 1959, cap. 6):

1. Placa toda apoiada sob q: faixa apoiada em forma fechada mais a correção de Lévy em série de senos em x (exata, termo a termo).
2. Em cada bordo engastado, a mesma placa apoiada sob um momento distribuído M(s) = Σ Eₖ sen(kπs/L), também resolvida por Lévy.
3. Os coeficientes Eₖ saem de impor rotação nula em cada bordo engastado, projetada na mesma base de senos. A projeção da série do bordo perpendicular é fechada: integrando por partes contra o operador de Lévy, ∫ f(t) sen(kπt/L) dt depende só da carga e dos momentos nas pontas. Resulta um sistema linear denso de K equações por bordo engastado.

A única aproximação é truncar as séries de momento de bordo em K termos. K = 100 é o usado. Na tabela inteira (9 tipos, λ = 1,00 a 2,00), dobrar para K = 200 muda os coeficientes no máximo 4,6·10⁻⁵ (tipo 3, λ = 1,85, μ'x) e não muda nenhuma célula arredondada; a precisão publicada é 0,005. Com K = 50 a diferença para K = 100 chega a 3,3·10⁻⁴ e duas células mudam. O teste `tabelasBares.test.ts` compara K com 2K nos piores casos, com tolerância de 10⁻⁴. As funções hiperbólicas são avaliadas como razões com exponenciais negativas, sem estouro numérico.

### 3.2 Coeficiente de Poisson

ν = 0,15. Não é o 0,2 da NBR 6118 (8.2.9): é o valor que reproduz as tabelas de Bares/Pinheiro que o motor usava. Na placa quadrada apoiada, μ = 100 · 0,03683 · (1 + ν) e α = 1200 · 0,004062 · (1 − ν²); com ν = 0,15 dão 4,24 e 4,77, contra 4,42 e 4,68 com ν = 0,2, e a tabela antiga estava no primeiro par (a menos de uma unidade na segunda casa). O ajuste por outros tipos confirma ν ≈ 0,15, e a fonte também diz: Pinheiro, Muzardo e Santos (EESC-USP, 2003, nota 11.12) descrevem as tabelas como "baseadas nas de BARES (1972), com coeficiente de Poisson igual a 0,15". O gerador usa o mesmo ν, de modo que a comparação da seção 5 não tem efeito de ν. Trocar para 0,2 mudaria regra de cálculo, fora do escopo da troca de fonte. [VERIFICAR] se o app deve adotar 0,2.

### 3.3 Linha "> 2,00"

Na direção x (vão lx), a faixa de 1 m como viga vinculada pelos x-bordos: μx = 100/8, 100·9/128 ou 100/24; μ'x = 100/8 ou 100/12; α = 1200 · 5/384, 1200 · 0,0054159 (máximo da viga apoiada-engastada, em x = (1 + √33)/16 · l) ou 1200/384, sem o fator 1 − ν². Na direção y, a linha repete λ = 2,00. É a convenção da tabela antiga.

## 4. Reações: processo das áreas (scripts/bares/reacoes.ts)

NBR 6118 14.7.6.1: a carga de cada região limitada pelas retas que saem dos cantos vai para o bordo da região; as retas fazem 45° entre bordos de mesmo vínculo e 60° a partir do engastado quando o outro é apoiado. O gerador obtém essa divisão atribuindo cada ponto ao bordo de menor k·d (d = distância ao bordo, k = 1 no engastado e k = √3 = tg 60° no apoiado) e recortando o retângulo pelos semiplanos correspondentes; as áreas são exatas.

Metade do alívio: num par de bordos opostos com um engastado e outro apoiado, o apoiado recebe de volta metade do alívio. Como na viga apoiada-engastada (R = pl/2 ∓ X/l), o alívio é metade da diferença entre as duas reações, e só metade dele é descontada (previsão de engaste parcial, a mesma regra da tabela antiga):

ν_apoiado = ν_área + (ν'_área − ν_área) / 4.

Por isso a soma das reações dos tipos assimétricos passa da carga total (até ~7 %, tipo 3 em λ = 1). Na linha "> 2,00", a faixa como viga: 1/2 (apoiada ou biengastada), 5/8 no engaste e 3/8 + 1/16 = 7/16 no apoio da apoiada-engastada.

## 5. Comparação com a tabela impressa

Tabela impressa: Bares adaptada por Pinheiro, no Anexo de Bastos. A transcrição está em `durabilidade-lajes.md` 6.3 (A-8 a A-10, momentos) e em `bares-tabelas-impressas.md` (A-1, flechas; A-5 a A-7, reações). Era a tabela que o motor usava antes do gerador.

### 5.1 Casos clássicos

Valor impresso, valor calculado pelo gerador (três casas, antes de arredondar) e diferença entre o impresso e a célula da tabela gerada (duas casas), em centésimos. Na última coluna, a solução de Timoshenko & Woinowsky-Krieger (Tabelas 8 e 35, ν = 0,3) levada para ν = 0,15: as curvaturas κx = (Mx − 0,3 My)/0,91 e κy saem dos dois momentos, M = κ + 0,15 κ', e α = 1200 · (1 − 0,15²) · w. Os valores de T&W têm três algarismos, e por isso a conversão vale a menos de ±0,01.

| Caso | Coef. | Impresso | Calculado | Tabela | Δ | T&W, ν = 0,15 |
|---|---|---|---|---|---|---|
| Tipo 1 (apoiada), λ = 1,00 | μx = μy | 4,23 | 4,236 | 4,24 | +1 | 4,24 |
| | α | 4,76 | 4,765 | 4,77 | +1 | 4,76 |
| Tipo 1, λ = 1,50 | μx | 7,72 | 7,696 | 7,70 | −2 | 7,70 |
| | μy | 3,89 | 3,893 | 3,89 | 0 | 3,89 |
| | α | 9,03 | 9,060 | 9,06 | +3 | 9,06 |
| Tipo 1, λ = 2,00 | μx | 9,91 | 9,907 | 9,91 | 0 | 9,91 |
| | μy | 3,16 | 3,188 | 3,19 | +3 | 3,19 |
| | α | 11,89 | 11,881 | 11,88 | −1 | 11,88 |
| Tipo 6 (engastada), λ = 1,00 | μx = μy | 2,02 | 2,026 | 2,03 | +1 | 2,03 (*) |
| | μ'x = μ'y | 5,15 | 5,133 | 5,13 | −2 | 5,13 |
| | α | 1,49 | 1,484 | 1,48 | −1 | 1,48 |
| Tipo 6, λ = 2,00 | μx | 4,05 | 4,058 | 4,06 | +1 | 4,06 |
| | μy | 0,96 | 0,981 | 0,98 | +2 | 0,98 |
| | μ'x | 8,33 | 8,287 | 8,29 | −4 | 8,29 |
| | μ'y | 5,72 | 5,699 | 5,70 | −2 | 5,71 |
| | α | 2,96 | 2,971 | 2,97 | +1 | 2,98 (**) |

Impressos: Pinheiro, *Tabelas de lajes* (EESC-USP, 2007), Tabelas 2.3a (tipo 1, p. 11), 2.3c (tipo 6, p. 13) e 2.5a (α, p. 21); os mesmos números estão no Anexo de Bastos (A-1, A-8 e A-10) e na transcrição deste repositório. As duas fontes não são independentes: ambas vêm de Bares (1972) pela adaptação de Pinheiro.

(*) T&W imprime 0,0231 qa² no centro (ν = 0,3), valor de Hencky; soluções mais finas da mesma placa dão 0,0229 qa², que leva a 2,03 (o FD da seção 5.2 também dá 2,03). Com 0,0231 a conversão daria 2,04.

(**) T&W imprime w = 0,00254 qa⁴/D, com três algarismos; o intervalo de arredondamento (0,002535 a 0,002545) dá α de 2,97 a 2,98. O FD dá 2,971.

Na amostra, o gerador fica a até 0,03 do impresso, com uma exceção, e a até 0,01 da solução clássica convertida. A exceção é o μ'x do tipo 6 em λ = 2,00: o impresso 8,33 é o −pl²/12 da faixa infinita, mas a placa 2 : 1 ainda não chegou lá. T&W dá −0,0829 qa² (8,29), o mesmo do gerador e do FD. O teste `tabelasBares.test.ts` fixa a amostra contra o impresso (até 0,03) e esse μ'x contra T&W.

### 5.2 Conferência independente por diferenças finitas

Para conferir os tipos com engaste, onde entra o sistema dos momentos de bordo, a mesma placa foi resolvida por diferenças finitas (estêncil de 13 pontos, pontos fantasmas para apoio e engaste, malhas h = lx/20, lx/40 e lx/80 com extrapolação de Richardson), sem nada em comum com `placas.ts`. Doze casos (tipo 1 e 6 em λ = 1; 1,5; 2; 2A e 5B em 1,5; 3 em 1 e 1,5; 4B em 2; 5A em 1,25): μx, μy e α batem com o gerador a menos de 0,001; μ'x e μ'y a menos de 0,01. As diferenças negativas (FD menor) vêm de o FD procurar o máximo só nos nós da malha. O script ficou fora do repositório, porque a tabela não depende dele.

Convergência da série: entre 100 e 200 termos por bordo, a maior diferença na tabela inteira é 4·10⁻⁵ (5A, λ = 1,5, μ'x), e nenhuma célula arredondada muda.

### 5.3 Tabela inteira

1386 entradas (9 tipos × colunas × 22 linhas). Contagem das entradas que batem em ±1 na segunda casa e maior diferença, em centésimos:

| Tipo | μ (positivos) | μ' (negativos) | ν (reações) | α (flecha) |
|---|---|---|---|---|
| 1 | 29/44 (+3) | — | 44/44 (0) | 8/22 (+4) |
| 2A | 23/44 (+63) | 8/22 (−10) | 66/66 (0) | 15/22 (+3) |
| 2B | 31/44 (−5) | 11/22 (+6) | 66/66 (0) | 7/22 (+10) |
| 3 | 27/44 (+8) | 15/44 (−6) | 87/88 (+3) | 11/22 (+3) |
| 4A | 24/44 (+8) | 14/22 (+5) | 43/44 (+3) | 19/22 (−2) |
| 4B | 40/44 (+3) | 9/22 (+10) | 44/44 (0) | 9/22 (+11) |
| 5A | 23/44 (−5) | 5/44 (−109) | 66/66 (+1) | 13/22 (+4) |
| 5B | 39/44 (+4) | 4/44 (+16) | 66/66 (0) | 6/22 (+7) |
| 6 | 25/44 (−10) | 16/44 (−5) | 44/44 (0) | 10/22 (+3) |
| total | 261/396 | 82/264 | 526/528 | 98/198 |

Leitura:

- Reações: 526 de 528 batem; as duas que não batem (tipo 3 νx em λ = 1,30 e 4A νx em 1,85) já estavam marcadas como suspeitas de impressão.
- Momentos e flechas: 441 de 858 batem em ±1; 234 diferem 2 ou 3; 82 diferem 4 ou 5; 101 diferem mais. Mediana da diferença relativa 0,3 %, 95 % abaixo de 2,4 %.
- As maiores diferenças ficam em três trechos da tabela impressa: 2A μx em λ = 1,65 a 1,85 (até 0,63, em 1,80), 5A μ'x em λ = 1,10 a 1,35 (até 1,09, em 1,25) e 6 μx em λ = 1,15 a 1,25 (até 0,10). A tabela antiga só marcava como suspeitas 2A μx em 1,75 a 1,85 e 5A μ'x em 1,25; o resto desses trechos não estava marcado. Há também trechos de λ alto nos tipos 4B, 5A e 5B (μ' e α, até 0,16).
- Nos tipos 4B e 5B, μ'x em λ = 2,00 (8,43 e 8,38) passa do −pl²/12 = 8,33 da linha "> 2,00": o momento no meio do bordo engastado longo ainda não chegou ao valor da faixa e passa dele antes de convergir. O FD da seção 5.2 confirma o 8,43. A tabela impressa já tinha esse degrau no 5B (8,47 → 8,33). Como λ > 2 usa a linha "> 2,00", o μ'x cai cerca de 1 % ao passar de λ = 2.
- A diferença não é de convenção: na placa toda apoiada (tipo 1), que tem solução exata por série de Navier/Lévy, a flecha impressa erra para os dois lados (5,26 contra 5,24 exato em λ = 1,05, +0,02; 9,71 contra 9,75 em λ = 1,60, −0,04), o que nenhum ν ou ponto de leitura explica. A tabela antiga trazia o erro do método numérico de Bares e da interpolação/transcrição. O gerador reproduz os valores clássicos de Timoshenko & Woinowsky-Krieger (teste `tabelasBares.test.ts`).
- Testes do motor que usavam coeficientes impressos foram atualizados para os gerados: em geral ±0,01 (tipo 1 e 2A em λ = 1, 2B em λ = 1,25), mais 0,03 no α do 2B em λ = 1,25, 0,05 no μ' do tipo 3 em λ = 1 e a célula suspeita 2A μx em λ = 1,80 (7,56 → 8,19). A lista de células suspeitas e o aviso que o motor dava ao interpolar sobre elas saíram: a tabela gerada não tem célula marcada. O exemplo de Bastos (E02, tipo 3, λ = 1,05) usa os coeficientes impressos; com os gerados os momentos diferem até 0,06 kN·m/m e o teste aceita 0,07 (ver `docs/norma/exemplos.md`).

### 5.4 Efeito numa obra típica

Pavimento 3 × 3 de lajes (vãos 4,0, 3,0 e 4,5 m em x e 5,0, 3,0 e 4,0 m em y; h = 11 cm, revestimento 1,0 e sobrecarga 1,5 kN/m², pilares 20 × 40), repetido 4 vezes (16 pilares por nível): tipos 3 (cantos), 5B (bordas; nas de vão horizontal maior a tabela é transposta) e 6 (centro), λ de 1,00 a 1,67. Mesma obra calculada pela 6118 com a tabela impressa e com a gerada:

| Grandeza | Média da diferença | Maior diferença |
|---|---|---|
| μ positivo (mx, my) | 0,3 % | +0,74 % |
| negativo compatibilizado | 0,6 % | +1,84 % |
| flecha | 0,6 % | +1,41 % |
| armadura das lajes | 0,1 % | −0,75 % |
| reações, vigas (As, Asw), pilares (Nk, As) | 0 | 0 |

As reações das duas tabelas são iguais nesses λ, e por isso nada muda das vigas para baixo. Diferenças maiores só aparecem perto das células que a tabela impressa tinha fora da tendência (por exemplo, a laje 2A com λ = 1,80: μx 7,56 → 8,19, +8,3 %). A conta foi feita por um script fora do repositório, que roda `calcularObra` duas vezes e troca `BARES` em memória pela tabela impressa entre as duas.

## 6. Pendências

1. [VERIFICAR] ν = 0,15 (seção 3.2) contra o 0,2 da NBR 6118 8.2.9.
2. μx e μy são valores no centro. Nos tipos assimétricos o positivo máximo fica fora do centro e é maior (tipo 3, λ = 1: 2,92 a 0,39 lx do x-bordo apoiado e 0,43 ly do y-bordo apoiado, contra 2,69 no centro; série e FD em malha fina dão 2,925). É a convenção das tabelas de Bares; mudar seria mudar regra de cálculo. [VERIFICAR]
3. Lajes com bordo livre e cargas triangulares não têm tabela gerada.

# Verificação de pendências

Data: 2026-10-12. Escopo: (1) células [VERIFICAR] da seção 7 de `bares-reacoes-flechas.md`, com segunda fonte das mesmas tabelas de Bares (adaptação Pinheiro); (2) fonte para dois itens de cálculo (NB-1/78). Este arquivo não altera `bares-reacoes-flechas.md`.

## Resumo

- Células confirmadas por fonte independente: 0.
- Células corrigidas com fonte: 0.
- Células inconclusivas: 5. Nenhuma fonte acessível traz a mesma configuração (tipos 7, 9, 10 com borda livre e tipo 18 triangular) com as mesmas tabelas.
- Item (a), limite 435 MPa: não encontrado na NB-1/78. A limitação aparece atribuída à NBR 6118:2014, item 17.4.2.
- Item (b), compatibilização de momentos: critério "maior entre a média e 80% do maior" confirmado em fonte secundária (Pinheiro et al., EESC-USP, 2003). Não atribuído à NB-1/78 em nenhuma fonte encontrada.

## Tarefa 1: células [VERIFICAR]

Valores do arquivo lidos em `bares-reacoes-flechas.md`.

| # | Linha | Tabela | Tipo | Coluna | γ | Transcrito | Vizinhas (mesma coluna) | Segunda fonte | Veredito |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 185 | A-2 | 9 | α | 1,75 | 12,23 | 1,70 = 11,01; 1,80 = 11,44; 1,85 = 11,66; 1,90 = 11,88; 1,95 = 12,10; 2,00 = 12,32 | Nenhuma. Doctum e IFMG não trazem tipo 9 com borda livre. | Inconclusivo |
| 2 | 233 | A-3 | 18 | α | 2,00 | 1,60 (impresso "160") | 1,80 = 1,43; 1,85 = 1,47; 1,90 = 1,51; 1,95 = 1,56 | Nenhuma. Doctum e IFMG não trazem tipos triangulares (11-22). | Inconclusivo (tendência sustenta 1,60, sem fonte) |
| 3 | 427 | A-11 | 7 | μy | > 2,00 | 12,50 | 1,80 = 10,65; 1,95 = 11,02; 2,00 = 11,14 | Nenhuma. Doctum casos 7-9 têm outra configuração (ver nota). | Inconclusivo |
| 4 | 476 | A-12 | 9 | μy | > 2,00 | 12,50 | 1,95 = 10,13; 2,00 = 10,31 | Nenhuma. Mesma limitação do item 3. | Inconclusivo |
| 5 | 458 | A-12 | 10 | μ'yb | 1,15 | 6,49 | 1,10 = 8,50; 1,20 = 8,48; 1,30 = 8,47 | Nenhuma. Doctum e IFMG não trazem tipo 10. | Inconclusivo |

### Fontes consultadas

- IFMG, anexo B, Pinheiro (1993), tipos 1, 2A, 2B, 3, 4A, 4B, 5A, 5B e 6. Pp. 58-66 do PDF (`C:/tmp/pesquisa-bares/ifmg-doc/ifmg.pdf`). URL do repositório: https://repositorio.ifmg.edu.br/bitstreams/3304438d-0862-4df4-bd94-7718acce94f8/download (URL não conferida na sessão; confirmar). Não cobre tipos 7-10 nem 18. Coeficiente de Poisson ν = 0,15 (seção 3.4.2, `C:/tmp/pesquisa-bares-txt/ifmg-doc.txt` linhas 733-738).
- Doctum (TCC, arquivo "TCC NORTHON E ROMÁRIO"), ν = 0,20. URL: https://dspace.doctum.edu.br/jspui/bitstream/123456789/444/1/TCC%20NORTHON%20E%20ROM%c3%81RIO.pdf. Tabela 3 (α, casos 1-9) no PDF p. 41; Tabela 4 (μ, casos 1-3) no PDF p. 42; Anexo G (casos 7-9) no PDF p. 79. Não cobre tipos 7-10 com borda livre nem triangulares.
- UEPG, artigo sobre tabelas de Bares e grelhas (`C:/tmp/pesquisa-bares-txt/uepg-ret.txt`). Sem valores de borda livre no texto extraído.
- Bastos (`lajes-bastos.pdf`, md5 dca1c10d4e5bc93826e0617687408772) é a fonte da transcrição. Não conta como independente.

### Nota sobre a convenção de ν

IFMG (Pinheiro, ν = 0,15) e Doctum (Bares, ν = 0,20) não são comparáveis diretamente. Exemplo com o caso quadrado simplesmente apoiado: μx = 4,23 no IFMG (anexo B, tipo 1, γ = 1,00, p. 58 do PDF) e μx = 4,41 no Doctum (Tabela 4, caso 1, λ = 1,00, PDF p. 42). Qualquer confirmação numérica precisa ser feita na mesma convenção de ν.

### Notas sobre as hipóteses (todas unverified)

- Item 1: interpolação linear entre 1,70 (11,01) e 1,80 (11,44) dá cerca de 11,23 em γ = 1,75. Hipótese: erro de digitação 11 → 12. Não confirmado por fonte.
- Item 2: a sequência 1,43 / 1,47 / 1,51 / 1,56 tem passos de 0,04-0,05. O valor 1,60 em γ = 2,00 segue o padrão. Não há correção a propor.
- Item 3: o valor 12,50 coincide com pl²/8, o limite de faixa biapoiada. No IFMG, o valor 12,50 aparece na linha γ = ∞ de tipos 1 e 2A, na primeira coluna de momento. A linha ">2,00" do arquivo copia o valor de 2,00 nas demais colunas, então 12,50 é uma quebra de padrão. Pode ser limite teórico ou erro; não há como decidir sem a tabela do tipo 7.
- Item 4: mesma análise do item 3.
- Item 5: os vizinhos (8,50; 8,48; 8,47) sugerem cerca de 8,49 em γ = 1,15. Hipótese: erro de digitação 8 → 6. Não confirmado por fonte.
- Observação fora da seção 7: na Tabela A-12, linha ">2,00", as colunas 10μy = 4,17 e 10μ'y = 8,33 coincidem com pl²/24 e pl²/12 (teoria de faixa engastada). As demais colunas copiam 2,00 (4,06 e 8,30). Pode ser limite teórico, não erro. Não listado na seção 7.

### Nota sobre o Doctum casos 7-9

O Doctum (Anexo G, PDF p. 79) traz casos 7-9 de Bares. Pela leitura feita, esses casos não têm borda livre e não correspondem aos tipos 7-10 do arquivo. O valor 12,50 aparece no caso 7, λ = ∞, como μ'x. É coincidência numérica de outra configuração, não segunda fonte.

### Pastas inválidas (downloads que não são PDF)

Estas pastas foram criadas e contêm HTML (erro ou login), não PDF. Não foram usadas:
- `C:/tmp/pesquisa-bares/utfpr-leite2017/lajesmacicasconcretoarmado.pdf` (1,2 KB).
- `C:/tmp/pesquisa-bares/usp-pef2603-aula7/aula7.pdf` (14 KB).
- `C:/tmp/pesquisa-bares/puc-rio-cap6/cap6.pdf` (292 B).

## Tarefa 2

### (a) Limite de 435 MPa para fyd na armadura transversal (NB-1/78)

Resultado: não confirmado na NB-1/78. Não foi encontrado texto da NB-1/78 em nenhuma fonte acessível.

Fontes:
- Meller, B. J.; Vargas, A. (UNESC, 2016), "Análise dos modelos de cálculo propostos pela NBR 6118:2014 para o dimensionamento de estribos em vigas", p. 5. URL: https://repositorio.unesc.net/bitstream/1/4238/1/Bruna%20Just%20Meller.pdf. Texto: "A norma ainda preconiza em seu item 17.4.2 que a tensão na armadura transversal passiva (fywd) é limitada ao valor da resistência de cálculo de escoamento do aço (fyd), no caso de estribos, e não pode tomar valores superiores a 435 MPa. Por esse motivo, mesmo quando se utiliza CA60, o valor limite de fyd é 435 MPa." A norma citada é a NBR 6118:2014, não a NB-1/78.
- Pinheiro, Muzardo, Santos (EESC-USP, 2003), "Lajes maciças", cap. 11, seção 11.7 (pp. 11.21-11.22). URL: https://www.fec.unicamp.br/~almeida/au405/Lajes/Lajes_Macicas_EESC.pdf. Cita NBR 6118 (2001), item 19.4.2, para estribos. Não menciona 435 MPa. Cita NBR 6118 (1978) apenas para pré-dimensionamento de balanço, p. 11.7.

Conclusão: o limite de 435 MPa é atribuído a norma posterior (NBR 6118:2014, item 17.4.2). Se a NB-1/78 tinha regra equivalente, não foi encontrado. Para confirmar, é preciso o texto da NB-1/78 (ABNT) ou um comentário técnico que a cite. Unverified.

### (b) Compatibilização de momentos negativos entre lajes adjacentes

Resultado: critério "maior valor entre a média dos dois momentos e 80% do maior" confirmado em fonte secundária. Não foi atribuído à NB-1/78.

Fontes:
- Pinheiro, Muzardo, Santos (EESC-USP, 2003), "Lajes maciças", cap. 11, seção 11.4.4, p. 11.13. URL: https://www.fec.unicamp.br/~almeida/au405/Lajes/Lajes_Macicas_EESC.pdf. Texto: "Na compatibilização dos momentos negativos, o critério usual consiste em adotar o maior valor entre a média dos dois momentos e 80% do maior. Esse critério apresenta razoável aproximação quando os dois momentos são da mesma ordem de grandeza." Regra para positivos: se a correção reduz o positivo, a redução é ignorada; se aumenta, soma-se a média das variações negativas.
- Richartz, F. S. (UFSC, TCC II), seção 2.2.5, p. 20. URL: https://repositorio.ufsc.br/bitstream/handle/123456789/127306/TCC%20II%20-%20Felipe%20Schmitt%20Richartz.pdf?sequence=1&isAllowed=y. Atribui à NBR 6118:2014, item 14.7.6.2: "quando houver predominância de cargas permanentes, as lajes vizinhas podem ser consideradas como isoladas, realizando-se compatibilização dos momentos sobre os apoios de forma aproximada". A fórmula (20) não foi legível na extração de texto; o critério de média e 80% aparece no texto sem o número da equação.

Conclusão: o critério é prática usual confirmada por duas fontes secundárias. A norma citada nas fontes é a NBR 6118:2014, item 14.7.6.2, que permite compatibilização aproximada, mas não traz o critério de 80% no texto encontrado. Item da NB-1/78 não encontrado. Unverified quanto à NB-1/78.

## Limitações

- Não foi possível acessar `wwwp.feb.unesp.br` (Bastos, `Lajes.pdf` e `Cortante.pdf`): certificado expirado. Não foram usados.
- Nenhum download foi executado com `-k` ou desativação de verificação de certificado.
- PDFs baixados via WebFetch foram salvos em `C:/Users/MunaroPC/.claude/projects/.../tool-results/` e lidos com `pdftotext`. Não foram executados.

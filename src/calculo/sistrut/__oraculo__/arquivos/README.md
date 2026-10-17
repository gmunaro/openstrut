# Arquivos do oráculo usados pelos testes

Cópia dos arquivos que os testes de paridade com o SISTRUT 4.0 original leem: o que o
original gravou e imprimiu rodando no DOSBox-X (o oráculo) e os JSONs de valores
esperados que ficavam fora do repositório. Os testes os leem por
`arquivoOraculo("<caminho abaixo>")` (`../arquivosOraculo.ts`). Se um arquivo
faltar, o teste que o usa falha com o caminho; ele não é pulado.

## De onde veio

A pasta espelha as pastas de trabalho do porte, com os mesmos nomes (os do DOS em
maiúsculas, exatos):

| pasta aqui | origem na máquina do dono | o que é |
|---|---|---|
| `oraculo/runs/<run>/` | `C:/tmp/oraculo/runs/<run>/` | um run do original: `impressora.prn` (o que foi impresso), `telas/*.txt` (as telas capturadas) e `obra/` (os arquivos que ele gravou) |
| `oraculo/casos/<caso>.dados/` | `C:/tmp/oraculo/casos/<caso>.dados/` | a obra de partida que o run do caso recebeu |
| `oraculo/orig/` | `C:/tmp/oraculo/orig/` | os arquivos de parâmetros da instalação do original (.DSP, .LAP, .PIP e os .INI) |
| `v2-paridade/oraculo-novos/` | `C:/tmp/v2-paridade/oraculo-novos/` | JSONs de valores esperados da rodada 2 (comparador da V1) |
| `v1-par2/paridade/casos/` | `C:/wt/v1-par2/paridade/casos/` (worktree da V1) | os JSONs dos `v2par_des_*` com a fonte do cobrimento corrigida |

O nome do run é `<caso>-<data>-<hora>`. Os JSONs e os comentários do código citam os
arquivos por esses caminhos (`oraculo/runs/<run>/obra/E2E.VIG`, campo `run` dos JSONs).
Só entrou o que algum teste lê (lista abaixo); os roteiros (`oraculo/casos/*.txt`) e o
restante dos runs não foram copiados.

## O que foi alterado em relação à origem

Todo o resto é cópia byte a byte. O `.gitattributes` marca a pasta com `-text`, porque os
arquivos do DOS misturam CRLF e LF e os testes leem os bytes.

1. **Texto de identificação do original, nos arquivos de texto** (`impressora.prn`,
   `telas/*.txt`, `.DSP`, `.LAP`, `.PIP`). O repositório é público. Por decisão do dono, o
   cabeçalho que identifica a empresa e os autores do original foi trocado por um texto
   neutro de **mesma largura**, completado com espaços. Assim, nenhuma linha muda de
   tamanho nem de posição:

   | no original | aqui |
   |---|---|
   | `SISTRUT` + espaços + `Software e Tecnologia s/c Ltda` (ou `ltda`), nos cabeçalhos de tela e dos .DSP/.LAP/.PIP | `OpenStrut` + espaços |
   | o nome do autor no cabeçalho dos .DSP/.LAP/.PIP e das telas | `(omitido)` + espaços |
   | o nome do autor na linha `CRIADA POR` dos .DSP/.LAP/.PIP | `(omitido)` + espaços |
   | o nome do engenheiro no cabeçalho de cada página impressa e de algumas telas | `(omitido)` + espaços |

   As linhas trocadas são comentários (as que começam com `*` nos .DSP/.LAP/.PIP) ou
   cabeçalho de página e de tela: nenhum valor conferido pelos testes sai delas. Os
   bytes de dados ficam iguais. `lerDsp`, `lerPip` e os testes de parâmetros leem os
   arquivos trocados e dão o mesmo resultado que com os originais. As fixtures
   `src/telas/__fixtures__/sistrut/SISTRUT.DSP` e `.PIP` receberam a mesma troca.

2. **Arquivos de dados** (`.LAJ`, `.VIG`, `.REP`, `.RLP`, `.COL`, `.SEC`, `.FOR`, `.TAB`,
   `.DXF`): sem troca. A primeira linha dos `.LAJ`, `.REP`, `.RLP` e `.COL`,
   `SISTRUT Software e Tecnologia s/c Ltda`, é a assinatura do formato: o original a
   grava, a V2 a reconhece (`formatoLaj`) e a grava no `.REP` (`linhasArquivoRep`).

3. **JSONs** (`v2-paridade/`, `v1-par2/`): os caminhos de máquina perderam o prefixo
   (`C:/tmp/` sai, `C:/wt/v1-par2/` vira `v1-par2/`), para o campo `run` apontar para
   esta pasta. No `v1-par2/.../v2par_des_3tramos.json`, a citação do cabeçalho do original
   virou "cabeçalho de identificação do original". O resto é igual ao de origem, e o
   `oxfmt` ignora a pasta.

## Caso novo

Copie o arquivo para o caminho espelhado (mesmo nome, mesmo caso), aplique a troca do
item 1 se for texto do original e leia com `arquivoOraculo`.

## Arquivos (tamanho em bytes, testes que leem)


### `oraculo/casos/caso_c_pilaredi.dados/`

| arquivo | bytes | testes |
|---|---:|---|
| `E2E.REP` | 878 | pilar.test.ts, pilaresDaObra.test.ts |
| `E2E.RLP` | 554 | pilar.test.ts, pilaresDaObra.test.ts |

### `oraculo/casos/retrad_des_menu.dados/`

| arquivo | bytes | testes |
|---|---:|---|
| `E2E.FOR` | 616 | viga.oraculo.test.ts |
| `E2E.SEC` | 346 | viga.oraculo.test.ts |
| `E2E.TAB` | 70 | viga.oraculo.test.ts |
| `E2E.VIG` | 5985 | viga.oraculo.test.ts |

### `oraculo/casos/retrad_des_p10.dados/`

| arquivo | bytes | testes |
|---|---:|---|
| `E2E.FOR` | 616 | viga.oraculo.test.ts |
| `E2E.SEC` | 346 | viga.oraculo.test.ts |
| `E2E.TAB` | 70 | viga.oraculo.test.ts |
| `E2E.VIG` | 5985 | viga.oraculo.test.ts |

### `oraculo/casos/retrad_frm_edita.dados/`

| arquivo | bytes | testes |
|---|---:|---|
| `E2E.COL` | 2369 | pilar.test.ts |

### `oraculo/casos/v2par_des_especial.dados/`

| arquivo | bytes | testes |
|---|---:|---|
| `V2P.DSP` | 15711 | viga.oraculo.test.ts |

### `oraculo/orig/`

| arquivo | bytes | testes |
|---|---:|---|
| `DESENHO.INI` | 1509 | viga.rodada2.test.ts |
| `PILAR.INI` | 3264 | parametros.test.ts |
| `SISTRUT.DSP` | 15616 | parametros.test.ts, viga.revisao.test.ts, viga.test.ts |
| `SISTRUT.LAP` | 10297 | parametros.test.ts |
| `SISTRUT.PIP` | 13724 | parametros.test.ts, pilar.test.ts |
| `VIGA.INI` | 1460 | parametros.test.ts, viga.revisao.test.ts, viga.test.ts |

### `oraculo/runs/caso_a_laje-20261015-041425/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 21574 | oraculo.test.ts |
| `obra/E2E.LAJ` | 1852 | viga.rodada2.test.ts |
| `obra/E2E.VIG` | 5985 | reacoes.test.ts, viga.oraculo.test.ts, viga.rodada2.test.ts |

### `oraculo/runs/caso_b_viga-20261014-182718/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 10353 | oraculo.test.ts |
| `obra/E2E.REP` | 878 | oraculo.test.ts, vicalc.test.ts |

### `oraculo/runs/caso_c_pilar-20261014-182757/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 2098 | oraculo.test.ts |

### `oraculo/runs/caso_c_pilaredi-20261015-041842/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 1342 | oraculo.test.ts |
| `telas/004_e04_tipo_secao.txt` | 2345 | oraculo.test.ts |
| `telas/005_e05_predimensionamento.txt` | 2345 | oraculo.test.ts |

### `oraculo/runs/retrad_arm_param-20261014-202844/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 4834 | oraculo.test.ts |
| `telas/001_m01.txt` | 2345 | oraculo.test.ts |
| `telas/002_p01.txt` | 2345 | oraculo.test.ts |
| `telas/003_u01.txt` | 2345 | oraculo.test.ts |
| `telas/007_d01.txt` | 2345 | oraculo.test.ts |
| `telas/009_d03.txt` | 2025 | oraculo.test.ts |
| `telas/010_d04.txt` | 2025 | oraculo.test.ts |
| `telas/011_d05.txt` | 2025 | oraculo.test.ts |

### `oraculo/runs/retrad_des_det-20261015-082506/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 54203 | oraculo.test.ts |
| `obra/E2E.FOR` | 616 | viga.oraculo.test.ts |
| `obra/E2E.SEC` | 346 | viga.oraculo.test.ts |
| `obra/E2E.TAB` | 70 | viga.oraculo.test.ts, vigas.test.ts |
| `obra/R1__E2E.DXF` | 21952 | oraculo.test.ts |
| `telas/023_d23.txt` | 2473 | oraculo.test.ts |
| `telas/024_d24.txt` | 2473 | oraculo.test.ts |
| `telas/028_d28.txt` | 2647 | oraculo.test.ts |

### `oraculo/runs/retrad_des_edc-20261015-082513/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/E2E.TAB` | 70 | desinitEdicao.test.ts, InicioSistrut.test.ts |
| `obra/R1__E2E.EDV` | 418 | desinitEdicao.test.ts, InicioSistrut.test.ts |

### `oraculo/runs/retrad_des_menu-20261015-082520/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 1343 | oraculo.test.ts |
| `telas/005_p01.txt` | 2345 | oraculo.test.ts |

### `oraculo/runs/retrad_des_p10-20261015-082955/`

| arquivo | bytes | testes |
|---|---:|---|
| `telas/017_r04.txt` | 2345 | vigas.test.ts |

### `oraculo/runs/retrad_des_p3-20261015-082945/`

| arquivo | bytes | testes |
|---|---:|---|
| `telas/001_e01.txt` | 2345 | desdim.test.ts |

### `oraculo/runs/retrad_des_p5-20261015-082948/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/E2E.FOR` | 616 | viga.oraculo.test.ts |
| `obra/E2E.SEC` | 346 | viga.oraculo.test.ts |
| `obra/E2E.TAB` | 70 | vigas.test.ts |
| `telas/008_f08.txt` | 2703 | desdim.test.ts |

### `oraculo/runs/retrad_des_p6-20261015-082952/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 45795 | desdim.test.ts |
| `obra/E2E.FOR` | 616 | viga.oraculo.test.ts |
| `obra/E2E.SEC` | 346 | viga.oraculo.test.ts |
| `obra/E2E.TAB` | 70 | vigas.test.ts |
| `telas/014_g14.txt` | 2025 | desdim.test.ts |
| `telas/018_g18.txt` | 3061 | desdim.test.ts |

### `oraculo/runs/retrad_frm_sonda_pil-20261014-202358/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/E2E.COL` | 2369 | pilar.test.ts, pilaresDaObra.test.ts |

### `oraculo/runs/retrad_laje_calc2-20261015-082441/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 16518 | oraculo.test.ts |
| `telas/012_k11.txt` | 200 | oraculo.test.ts |
| `telas/015_k14.txt` | 184 | oraculo.test.ts |

### `oraculo/runs/retrad_laje_param-20261015-082447/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 16515 | oraculo.test.ts |
| `telas/003_r01.txt` | 2345 | oraculo.test.ts |
| `telas/014_r12.txt` | 2345 | oraculo.test.ts |
| `telas/018_m00.txt` | 2345 | oraculo.test.ts |
| `telas/019_m01.txt` | 2345 | oraculo.test.ts |
| `telas/021_m02.txt` | 2345 | oraculo.test.ts |
| `telas/025_c02.txt` | 2345 | oraculo.test.ts |
| `telas/026_c03.txt` | 2345 | oraculo.test.ts |
| `telas/028_c05.txt` | 2345 | oraculo.test.ts |

### `oraculo/runs/retrad_lajeproc-20261015-082452/`

| arquivo | bytes | testes |
|---|---:|---|
| `telas/011_m01.txt` | 2345 | oraculo.test.ts |
| `telas/015_m05.txt` | 2345 | oraculo.test.ts |
| `telas/017_m07.txt` | 2345 | oraculo.test.ts |

### `oraculo/runs/retrad_pil_dim-20261015-082854/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 18163 | oraculo.test.ts |
| `telas/005_e05_predimensionamento.txt` | 2345 | oraculo.test.ts |

### `oraculo/runs/retrad_pil_geo-20261015-082515/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/E2E.COL` | 474 | pilar.test.ts |

### `oraculo/runs/retrad_pil_poliinv-20261015-084151/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 1336 | casos.test.ts |
| `telas/012_s07.txt` | 2345 | casos.test.ts |
| `telas/013_s08.txt` | 2345 | casos.test.ts |

### `oraculo/runs/retrad_pil_secoes-20261015-083558/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 3211 | casos.test.ts |
| `telas/006_s02.txt` | 2345 | casos.test.ts |

### `oraculo/runs/retrad_pil_trava-20261015-083047/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 1790 | casos.test.ts |

### `oraculo/runs/retrad_pil_verif2-20261015-082939/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 3958 | casos.test.ts |

### `oraculo/runs/retrad_viga_a1-20261015-065711/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/NOVA.VIG` | 2565 | viga.rodada2.test.ts |
| `telas/026_q04_v10.txt` | 2025 | vicalc.test.ts |
| `telas/029_q07_v11.txt` | 2025 | vicalc.test.ts |

### `oraculo/runs/retrad_viga_c1-20261015-065711/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 2512 | vicalc.test.ts |
| `obra/E2E.REP` | 607 | vicalc.test.ts |
| `obra/E2E.VIG` | 5985 | viga.rodada2.test.ts |
| `telas/030_r12_v2.txt` | 2025 | vicalc.test.ts |
| `telas/031_r13_v2.txt` | 2025 | vicalc.test.ts |
| `telas/032_r14_v4.txt` | 2025 | vicalc.test.ts |
| `telas/033_r15_v4.txt` | 2025 | vicalc.test.ts |
| `telas/034_r16_v5.txt` | 2025 | vicalc.test.ts |
| `telas/035_r17_v5.txt` | 2025 | vicalc.test.ts |

### `oraculo/runs/retrad_viga_p3-20261015-070028/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 27288 | vicalc.test.ts |

### `oraculo/runs/retrad_viga_x1-20261015-065711/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 8205 | vicalc.test.ts |
| `obra/IDX.REP` | 444 | vicalc.test.ts, viga.rodada2.test.ts |
| `obra/IDX.VIG` | 2565 | viga.rodada2.test.ts |

### `oraculo/runs/sonda-20261013-221414/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/E2E.COL` | 442 | pilar.test.ts, pilaresDaObra.test.ts |

### `oraculo/runs/v2par_des_2tramos-20261015-165207/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 49578 | desdim.test.ts, desinitV2par.test.ts, vicalc.test.ts |
| `obra/ASS.FOR` | 3080 | viga.oraculo.test.ts |
| `obra/ASS.SEC` | 1730 | viga.oraculo.test.ts |
| `obra/ASS.TAB` | 350 | desinitV2par.test.ts, viga.oraculo.test.ts |

### `oraculo/runs/v2par_des_3tramos-20261015-165027/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 58827 | desdim.test.ts, desinitV2par.test.ts, vicalc.test.ts |
| `obra/ASS.FOR` | 616 | viga.oraculo.test.ts |
| `obra/ASS.SEC` | 346 | viga.oraculo.test.ts |
| `obra/ASS.TAB` | 70 | desinitV2par.test.ts, viga.oraculo.test.ts |

### `oraculo/runs/v2par_des_especial-20261015-171646/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 60657 | desdim.test.ts, desinitV2par.test.ts, vicalc.test.ts |
| `obra/DSX.FOR` | 616 | viga.oraculo.test.ts |
| `obra/DSX.SEC` | 346 | viga.oraculo.test.ts |
| `obra/DSX.TAB` | 70 | desinitV2par.test.ts, viga.oraculo.test.ts |
| `obra/DSX.VIG` | 1710 | viga.oraculo.test.ts |
| `telas/025_h02_fissura_apoios.txt` | 2277 | desdim.test.ts, desinitV2par.test.ts |
| `telas/026_h03_fissura_tramos.txt` | 2417 | desdim.test.ts, desinitV2par.test.ts |

### `oraculo/runs/v2par_laje_assim-20261015-163200/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/ASS.LAJ` | 2026 | casosNovos.test.ts |
| `obra/ASS.VIG` | 6840 | casosNovos.test.ts, viga.oraculo.test.ts |

### `oraculo/runs/v2par_laje_balanco-20261015-162752/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/BAL.LAJ` | 1203 | casosNovos.test.ts |
| `obra/BAL.VIG` | 4275 | casosNovos.test.ts |

### `oraculo/runs/v2par_laje_cargas-20261015-164316/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 42538 | vicalc.test.ts |
| `obra/CAR.LAJ` | 1399 | casosNovos.test.ts |
| `obra/CAR.REP` | 693 | vicalc.test.ts |
| `obra/CAR.VIG` | 5130 | casosNovos.test.ts |

### `oraculo/runs/v2par_laje_livre-20261015-162737/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/LIV.LAJ` | 1238 | casosNovos.test.ts |
| `obra/LIV.VIG` | 4275 | casosNovos.test.ts |

### `oraculo/runs/v2par_laje_umadir-20261015-162808/`

| arquivo | bytes | testes |
|---|---:|---|
| `obra/UMD.LAJ` | 1324 | casosNovos.test.ts |
| `obra/UMD.VIG` | 5130 | casosNovos.test.ts |

### `oraculo/runs/v2par_pilar_lambda-20261015-164824/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 6129 | casos.test.ts |

### `oraculo/runs/v2par_pilar_mk-20261015-170447/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 5967 | casos.test.ts |

### `oraculo/runs/v2par_pilar_niveis-20261015-164933/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 4026 | casos.test.ts |
| `telas/010_e10_predim.txt` | 2345 | casos.test.ts |

### `oraculo/runs/v2par_pilar_trava-20261015-171708/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 1788 | casos.test.ts |
| `telas/005_t02_trava.txt` | 2891 | casos.test.ts |

### `oraculo/runs/v2par_viga_fluxo-20261015-164332/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 48595 | vicalc.test.ts |
| `obra/VBX.LAJ` | 1229 | casosNovos.test.ts, viga.rodada2.test.ts |
| `obra/VBX.REP` | 519 | vicalc.test.ts |
| `obra/VBX.VIG` | 5130 | casosNovos.test.ts, viga.oraculo.test.ts, viga.rodada2.test.ts |

### `oraculo/runs/v2par_viga_r6-20261015-184612/`

| arquivo | bytes | testes |
|---|---:|---|
| `impressora.prn` | 2062 | vicalc.test.ts |

### `v1-par2/paridade/casos/`

| arquivo | bytes | testes |
|---|---:|---|
| `v2par_des_2tramos.json` | 17330 | viga.oraculo.test.ts |
| `v2par_des_3tramos.json` | 22461 | viga.oraculo.test.ts |
| `v2par_des_especial.json` | 30793 | viga.oraculo.test.ts |

### `v2-paridade/oraculo-novos/`

| arquivo | bytes | testes |
|---|---:|---|
| `v2par_laje_assim.json` | 61850 | casosNovos.test.ts |
| `v2par_laje_balanco.json` | 29408 | casosNovos.test.ts |
| `v2par_laje_cargas.json` | 59955 | casosNovos.test.ts |
| `v2par_laje_livre.json` | 30529 | casosNovos.test.ts |
| `v2par_laje_umadir.json` | 33314 | casosNovos.test.ts |
| `v2par_viga_fluxo.json` | 55606 | casosNovos.test.ts, viga.oraculo.test.ts |
| `v2par_viga_r6.json` | 10847 | viga.oraculo.test.ts |

Total: 148 arquivos, 1155524 bytes.

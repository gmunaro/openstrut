# Ferramentas do porte SISTRUT

Scripts que geraram partes de `src/calculo/sistrut/` a partir do SISTRUT 4.0 (V1 em QuickBASIC) e do oráculo (o original rodando no DOSBox-X). Nenhum deles roda no build, no lint ou nos testes do repositório. `tsconfig.json`, `oxlint src` e `oxfmt src` não incluem `scripts/`.

Dependências: Python 3.12 ou mais novo (o `traduz.py` usa f-string com barra invertida, que o 3.10 recusa), Bun para os `.ts`, Git Bash para os `.sh`. O T10 também precisa de Docker e do oráculo em `C:/tmp/oraculo` (fora do repositório).

Entradas comuns, todas fora do repositório:

- `C:/Users/MunaroPC/Desktop/Projetos Pessoais/_Arquivo/Sistrust/dist/src-original/laje/LAJECALC.BAS`, o fonte da V1 nova que o T1 traduz.
- `C:/tmp/oraculo/runs/v2par_<caso>-<data>/`, os runs do oráculo (`impressora.prn`, `telas/`, `obra/*.LAJ`).
- `C:/tmp/v2-paridade/oraculo-novos/v2par_<caso>.json`, os casos que o T10 extraiu.

## t1-tradutor

Traduz trechos do `LAJECALC.BAS` para TypeScript, comando a comando. Cada SUB vira uma função com uma máquina de estados (`switch` dentro de `for`) que mantém GOTO, GOSUB/RETURN e FOR/NEXT, e arredonda cada atribuição `!` para SINGLE. Gerou `src/calculo/sistrut/lajes/charneiras.ts`, `coeficiente.ts` e `momentos.ts`.

- `traduz.py <saida.ts> <nome>:<ini>-<fim>[:gosub=<rotulo>][:exporta=a,b][:pula=x-y] ...` traduz as linhas `ini..fim` do `.BAS` (caminho fixo em `BAS`).
- `sh gera.sh` chama o `traduz.py` com as faixas de linhas de cada arquivo e grava `ger_charneiras.ts`, `ger_coeficiente.ts` e `ger_momentos.ts` nesta pasta (ignorados pelo git).
- `sh monta.sh` roda o `gera.sh`, junta `cab_<f>.ts` (cabeçalho escrito à mão) com `ger_<f>.ts` sem as 3 primeiras linhas, grava em `DEST/<f>.ts` e formata com `oxfmt`.
- `python -I fixtures.py` gera `src/calculo/sistrut/lajes/__casos_t1__/v2par_laje_<caso>.json`. Lê o `.LAJ` final de cada run com `lajinfo_t1.py` e filtra do JSON da T10 os valores do estágio T1. Grava μ por polígono e corrige o `.mu` herdado da T10 (campo `obs` do JSON).
- `python -I lajinfo_t1.py <arquivo.LAJ>` imprime a obra do `.LAJ` em JSON (ordem do `LAJEGRAV.BAS:483-620`).

`monta.sh` e `fixtures.py` gravam em `C:/wt/v2-par-t1/...`, o worktree onde a T1 foi feita. Para rodar aqui, troque `DEST` (e o `cd` do `monta.sh`) pela raiz deste repositório.

## t2-fixtures

- `python -I extrai.py <pasta>` lê o `.LAJ` final de 8 runs (`v2par_laje_*` e `v2par_viga_fluxo`) e grava `<pasta>/<caso>.laj.json`, com μ e ângulo por polígono e H e M+ por laje. Esses arquivos estão em `src/calculo/sistrut/lajes/__casos_t2__/`.
- `bun rel.ts` roda `espessuraMinimaLaje`, `armadurasLaje`, `otimizaNegativos` e `lajeproc` sobre os `CASOS_T2` e imprime, por valor, o impresso pelo oráculo e o calculado, mais o total de valores que batem. Importa de `C:/wt/v2-par-t2/src/calculo/sistrut` (constante `B` na linha 1). Troque para a raiz deste repositório antes de rodar.

## t10-oraculo

Monta roteiros de teclas, roda os casos `v2par_*` no oráculo e na V1 nova e extrai os valores impressos para JSON.

- `python -I extrai_v2par.py <caso> <pasta do run> <saida.json>` gera o JSON do caso (formato de `__oraculo__/`). As definições de cada caso (programa, entrada, extratores, valores lidos de tela) estão em `casos_v2par.py`. O `.LAJ` é lido com `lajinfo.py`.
- `bash mk.sh <familia> <nome>` monta `C:/tmp/oraculo/casos/v2par_<nome>.txt` a partir de `C:/wt/v1-v2par/tests/retraducao/<familia>/v2par_<nome>.sufixo.txt`.
- `bash oraculo.sh <nome> [limite s]` roda o caso no oráculo com o relógio fixo em 2026-10-14 12:00:00.
- `bash lote.sh <familia> <caso>...` e `bash lote2.sh <familia>:<caso>...` rodam `mk.sh` e `oraculo.sh` com até 3 contêineres ao mesmo tempo. Gravam `run_<caso>.log` e `lote.log` nesta pasta (ignorados pelo git).
- `bash v1.sh <familia> <nome> <EXE> [run]` roda o caso na V1 nova (`C:/wt/v1-v2par/build/v2par-bin`) e compara com o run mais recente do oráculo. `bash compila_v1.sh` compila esses EXE.
- `bash gen_laje.sh <nome> <obra> <H> <lajes> <geo> [tail]` e `python -I gen_des.py ...` geram os `.sufixo.txt` de laje e de desenho no worktree da V1. `geo_*.txt`, `geo_laje_otim.tpl`, `laje_tail*.txt` e `tail_*.txt` são os trechos de roteiro que eles juntam. `viga7.sh` e `viga_idx.sh` imprimem trechos de roteiro do VIGA. `varre_otim.sh` varia a largura da faixa do caso `laje_otim` na V1.
- `python -I resumos.py` escreve `v2par_<caso>.resultado.md` no worktree da V1. `python -I lajdec.py <.LAJ>` imprime o `.LAJ` decodificado. `python -I prn2txt.py <prn> [txt]` converte o `.prn` ESC/P em texto com `C:/tmp/oraculo/docker/escp.py`.

## O que mudou em relação às cópias de `C:/tmp`

- `t10-oraculo/lajinfo.py` e `t1-tradutor/lajinfo_t1.py` liam μ e ângulo com o índice da laje (`dirmu[l + 1]`). O LAJECALC grava em `A_1210(A_10cc(i, 0), .)`, indexado pelo polígono. Agora usam `dirmu[int(c[0])]`. Esse erro deu `.mu` trocado em `v2par_laje_balanco` (L1/L2) e `v2par_laje_assim` (L2/L3). Conferido contra os runs: o resultado agora coincide com `__casos_t2__/*.laj.json`.
- `t10-oraculo/extrai_v2par.py` gravava a fonte de `<viga>.cobrimento` como `iarm - 1`, uma linha abaixo de onde "Cobrimento" está impresso. Agora grava a linha que casou. Nos runs `v2par_des_*` a fonte passa de 41/46/58 para 40/45/57.
- `F=` dos `gen_laje.sh`, `lote.sh`, `lote2.sh` e `varre_otim.sh` e os caminhos de `fixtures.py` apontavam para a própria pasta em `C:/tmp`. Agora são relativos ao script.
- `t1-tradutor/cab_charneiras.ts` cita `scripts/sistrut/t1-tradutor/traduz.py` em vez de `C:/tmp/t1-scratch/traduz.py`. O `charneiras.ts` do repositório ainda tem o caminho antigo até o próximo `monta.sh`.

Os demais caminhos absolutos (`C:/tmp/oraculo`, `C:/wt/v1-v2par`, `C:/wt/v2-par-t1`, `C:/wt/v2-par-t2`, o `.BAS` da V1) apontam para fora destas pastas e ficaram como estavam.

Erro conhecido sem correção: `t10-oraculo/lajinfo.py` lê `cargas_area` em blocos de `nv + 3` linhas. O certo é `nv + 2` (S_50187, `LAJECALC.BAS:7674-7701`), como está em `lajinfo_t1.py`. Isso afeta `entrada.obra.obra_gravada_pelo_original.cargas_area` do `v2par_laje_cargas.json`, não os valores.

## O que não foi versionado

Origem: `C:/tmp/t1-scratch/`, `C:/Users/MunaroPC/AppData/Local/Temp/t2r2/` (o `/tmp/t2r2` do Git Bash) e `C:/tmp/v2-paridade/oraculo-novos/_ferramentas/`.

- T1: `ger_charneiras.ts` (222 KB), `ger_coeficiente.ts` (134 KB) e `ger_momentos.ts` (15 KB), que o `gera.sh` regenera. `gerado.ts` (343 KB), saída de uma versão anterior. `s4019b.txt`, `s50187.txt` e `s578ad.txt`, trechos copiados do `.BAS`. `obra_*.json`, saída do `lajinfo_t1.py` (o `obra_r3.json` está vazio). `compara.ts` e `explora*.ts`, testes manuais com imports de `C:/wt/v2-par-t1` que nenhum script chama.
- T2: `dump.py` e `coef.mjs` (exploração e conta à mão do coeficiente), `bal.bak` e `flexao.bak` (cópias de arquivos de `src`). Uma versão anterior do `rel.ts` está em `/tmp/t2rel/`.
- T10: `cmp_*.txt` (saída do `v1.sh`), `run_*.log`, `lote.log` e `compila.log`.
- Os runs do oráculo, o próprio oráculo (`C:/tmp/oraculo`) e o fonte da V1 ficam fora do repositório.

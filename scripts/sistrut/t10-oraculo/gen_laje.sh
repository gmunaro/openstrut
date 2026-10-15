#!/usr/bin/env bash
# Gera tests/retraducao/laje/v2par_<nome>.sufixo.txt = <cabecalho+geometria> + trecho comum (laje_tail.txt)
# Uso: gen_laje.sh <nome> <obra> <H> <lajes "1 a n"> <arquivo com cabecalho e LAJEGEOM 1..6> [tail]
F=$(cd "$(dirname "$0")" && pwd)
nome="$1"; obra="$2"; h="$3"; lj="$4"; geo="$5"; tail="${6:-$F/laje_tail.txt}"
out=/c/wt/v1-v2par/tests/retraducao/laje/v2par_$nome.sufixo.txt
{ cat "$geo"; echo '9{ESPERA LAJES EM REGIME}{ESPERA escolha opcao}{PAUSA 2}{TELA l02}'
  sed -e "s/@H@/$h/" -e "s/@LAJES@/$lj/" -e "s/@OBRA@/$obra/" "$tail"; } > "$out"
echo "$out"

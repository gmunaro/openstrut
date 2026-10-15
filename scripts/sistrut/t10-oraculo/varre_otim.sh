#!/usr/bin/env bash
# Varre a largura da faixa do caso laje_otim na V1 (sem gravar no repositorio). Uso: varre_otim.sh w1 w2 ...
F=$(cd "$(dirname "$0")" && pwd); raiz=/c/wt/v1-v2par; T=$raiz/build/v2par-varre; mkdir -p $T
for w in "$@"; do
  x=$(python -c "print(round(6+$w,3))")
  s=$T/otim_$w.sufixo.txt
  { sed -e "s/@W@/$x/" -e "s/@L@/$w/" $F/geo_laje_otim.tpl; echo '9{ESPERA LAJES EM REGIME}{ESPERA escolha opcao}{PAUSA 2}{TELA l02}'
    sed -e "s/@H@/10/" -e "s/@LAJES@/1 a 2/" -e "s/@OBRA@/OTIM/" $F/laje_tail.txt; } > $s
  c=$T/c_$w; rm -rf $c; mkdir -p $c/SISTRUT/EXEC40; cp /c/tmp/oraculo/orig/*.INI /c/tmp/oraculo/orig/SISTRUT.* $c/SISTRUT/EXEC40/ 2>/dev/null; cp /c/tmp/retrad/viga/base/SISTRUT.INI $c/SISTRUT/
  bash $raiz/tools/roda_retrad.sh $raiz/build/v2par-bin LAJE $s $T/run_$w $c ${LIM:-120} >/dev/null 2>&1; echo "w=$w rc=$?"
done; wait

#!/usr/bin/env bash
# Roda o caso v2par na V1 nova (EXE compilados de src-original em build/v2par-bin) e compara
# com a execucao mais recente do oraculo (ou a pasta dada).
# Uso: v1.sh <familia> <nome> <EXE inicial> [run do oraculo]
set -u
fam="$1"; nome="$2"; exe="$3"; o="${4:-}"
raiz=/c/wt/v1-v2par
bin=$raiz/build/v2par-bin
trab=$raiz/build/v2par-trab
cdir=$trab/c_$nome; out=$trab/run_$nome
rm -rf "$cdir"; mkdir -p "$cdir/SISTRUT/EXEC40"
cp /c/tmp/oraculo/orig/*.INI /c/tmp/oraculo/orig/SISTRUT.* "$cdir/SISTRUT/EXEC40/"
cp /c/tmp/retrad/viga/base/SISTRUT.INI "$cdir/SISTRUT/"
d=/c/tmp/oraculo/casos/v2par_$nome.dados; [ -d "$d" ] && cp "$d"/* "$cdir/"
bash $raiz/tools/roda_retrad.sh "$bin" "$exe" "$raiz/tests/retraducao/$fam/v2par_$nome.sufixo.txt" "$out" "$cdir" "${LIMITE:-900}"
[ -z "$o" ] && o=$(ls -d /c/tmp/oraculo/runs/v2par_$nome-* 2>/dev/null | tail -1)
echo "##### $nome (oraculo: ${o:-nenhum})"
[ -n "$o" ] && python -I $raiz/tools/compara_retrad.py "$o" "$out" --obra "$cdir"

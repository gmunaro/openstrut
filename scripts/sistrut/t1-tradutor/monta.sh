#!/bin/sh
# Monta os arquivos de src/calculo/sistrut/lajes/ (cabeçalho à mão + tradução) e formata.
cd "$(dirname "$0")"
sh gera.sh > /dev/null || exit 1
DEST=C:/wt/v2-par-t1/src/calculo/sistrut/lajes
for f in charneiras coeficiente momentos; do
  { cat cab_$f.ts; echo; tail -n +4 ger_$f.ts; } > $DEST/$f.ts
done
cd C:/wt/v2-par-t1 && ./node_modules/.bin/oxfmt src/calculo/sistrut/lajes/ 2>&1 | tail -3
wc -l $DEST/*.ts

#!/bin/sh
# Monta os arquivos de src/calculo/sistrut/lajes/ (cabeçalho à mão + tradução) e formata.
cd "$(dirname "$0")"
sh gera.sh > /dev/null || exit 1
# Destino: a pasta lajes/ do repositório, ou DEST=<pasta> para conferir em outro lugar.
RAIZ="$(git rev-parse --show-toplevel)"
DEST="${DEST:-$RAIZ/src/calculo/sistrut/lajes}"
for f in charneiras coeficiente momentos; do
  { cat cab_$f.ts; echo; tail -n +4 ger_$f.ts; } > $DEST/$f.ts
done
(cd "$RAIZ" && bun x oxfmt "$DEST" 2>&1 | tail -3)
wc -l $DEST/*.ts

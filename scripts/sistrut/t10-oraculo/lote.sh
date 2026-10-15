#!/usr/bin/env bash
# Roda casos v2par no oraculo, no maximo 3 por vez. Uso: lote.sh <familia> caso1 caso2 ...
F=$(cd "$(dirname "$0")" && pwd); fam="$1"; shift
for c in "$@"; do
  while [ "$(docker ps --format '{{.Names}}' | grep -c '^oraculo-')" -ge 3 ]; do sleep 10; done
  bash $F/mk.sh $fam $c >/dev/null
  ( bash $F/oraculo.sh $c 1200 > $F/run_$c.log 2>&1; echo "$c rc=$?" >> $F/lote.log ) &
  sleep 15
done
wait

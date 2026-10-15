#!/usr/bin/env bash
# Igual ao lote.sh, mas com pares familia:caso. Uso: lote2.sh laje:laje_cargas viga:viga_fluxo ...
F=$(cd "$(dirname "$0")" && pwd)
for fc in "$@"; do
  fam="${fc%%:*}"; c="${fc#*:}"
  while [ "$(docker ps --format '{{.Names}}' | grep -c '^oraculo-')" -ge 3 ]; do sleep 10; done
  bash $F/mk.sh $fam $c >/dev/null
  ( bash $F/oraculo.sh $c 1500 > $F/run_$c.log 2>&1; echo "$c rc=$?" >> $F/lote.log ) &
  sleep 15
done
wait

#!/usr/bin/env bash
# Roda um caso v2par no oraculo com o relogio congelado em 10-14-2026 12:00:00.
# Uso: oraculo.sh <nome> [limite s]
cd /c/tmp/oraculo
ORACULO_BASE=/orig/instalado ORACULO_RELOGIO=congelado ORACULO_DATA="2026-10-14 12:00:00" \
  bash rodar.sh "casos/v2par_$1.txt" "" "${2:-900}"

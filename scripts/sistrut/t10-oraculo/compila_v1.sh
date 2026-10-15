#!/usr/bin/env bash
# Compila todos os src-original/*/*.BAS do worktree C:/wt/v1-v2par (sem regenerar) em build/v2par-bin.
raiz=/c/wt/v1-v2par
bin=$raiz/build/v2par-bin
mkdir -p "$bin"
for f in $raiz/src-original/*/*.BAS; do
  e=$(basename "$f" .BAS)
  [ -f "$bin/$e.exe" ] && { echo "$e: ja existe"; continue; }
  bash $raiz/tools/qbcompile.sh "$(cygpath -aw "$f")" "$(cygpath -aw "$bin/$e.exe")" > "$bin/$e.compila.txt" 2>&1
  if [ -f "$bin/$e.exe" ]; then echo "$e: ok"; else echo "$e: FALHOU"; fi
done

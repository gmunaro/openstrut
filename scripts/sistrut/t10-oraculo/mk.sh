#!/usr/bin/env bash
# Monta C:/tmp/oraculo/casos/v2par_<nome>.txt a partir de
# C:/wt/v1-v2par/tests/retraducao/<familia>/v2par_<nome>.sufixo.txt (entrada pelo gerenciador + sufixo).
# Uso: mk.sh <familia> <nome>      familia: laje | viga | pilar | desenho
set -eu
fam="$1"; nome="$2"
suf="/c/wt/v1-v2par/tests/retraducao/$fam/v2par_$nome.sufixo.txt"
caso="/c/tmp/oraculo/casos/v2par_$nome.txt"
case "$fam" in
  laje) entra='L{ENTER}{ESPERA escolha opcao}{PAUSA 2}' ;;
  viga) entra='V{ENTER}{ESPERA escolha opcao}{PAUSA 2}' ;;
  pilar) entra='i{ENTER}{ESPERA PILARES DE CONCRETO}{ESPERA escolha opcao}{PAUSA 2}' ;;
  desenho) entra='V{PAUSA 2}{RIGHT}{PAUSA 2}{ENTER}{ESPERA escolha opcao|60}{PAUSA 2}' ;;
  *) echo "familia?"; exit 2 ;;
esac
# 1a linha "# modulo: LAJE": o caso comeca no LAJE mesmo estando em outra familia (fluxo da obra)
head -1 "$suf" | grep -q "modulo: LAJE" && entra='L{ENTER}{ESPERA escolha opcao}{PAUSA 2}'
head -1 "$suf" | grep -q "modulo: VIGA" && entra='V{ENTER}{ESPERA VIGAS CONTINUAS}{ESPERA escolha opcao}{PAUSA 2}'

{
  echo '# exe: PATH C:\SISTRUT;Z:\|CD \|SISTRUT\SISTRUT'
  echo "# Caso v2par_$nome (T10 da paridade V2) no ORIGINAL (ORACULO_BASE=/orig/instalado)."
  echo "# Gerado de tests/retraducao/$fam/v2par_$nome.sufixo.txt (worktree v1-v2par)."
  echo "{ESPERA Configuracao|60}{LIMITE 400}$entra"
  cat "$suf"
} > "$caso"
echo "$caso"

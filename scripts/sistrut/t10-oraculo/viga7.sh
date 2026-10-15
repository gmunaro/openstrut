#!/usr/bin/env bash
# Imprime o trecho do roteiro: sai do LAJE para o gerenciador, entra no VIGA, opcao 7 da obra <obra> com <n> registros
# (impressao, .REP gravado), volta ao gerenciador e sai. Uso: viga7.sh <obra> <n>
o="$1"; n="$2"
echo "{F2}{ENTER}{ESPERA Configuracao|60}{PAUSA 2}V{ENTER}{ESPERA VIGAS CONTINUAS}{ESPERA escolha opcao}{PAUSA 2}{TELA x01_viga}"
echo "7{ESPERA Nome da Obra}{PAUSA 1}$o{ENTER}{ESPERA Listo as Vigas}{PAUSA 1}{TELA x02_listo}S{ENTER}{ESPERA Qualquer Tecla}{PAUSA 1}{TELA x03_lista}{ENTER}{ESPERA Relisto}{PAUSA 1}{TELA x04_relisto}{ENTER}{ESPERA Continuo}{PAUSA 1}{ENTER}{ESPERA Todas as Vigas}{PAUSA 1}{TELA x05_todas}S{ENTER}"
for i in $(seq 1 $n); do printf '{ESPERA Registro %s}{PAUSA 1}{TELA x06_reg%s}{ENTER}' $i $i; done; echo
echo "{ESPERA Vigas Apoiadas}{PAUSA 1}{TELA x07_mult}{ENTER}{ESPERA Imprimo os Resultados}{PAUSA 1}S{ENTER}{ESPERA Diagrama de Esforcos}{ENTER}{ESPERA esquema estrutural}{ENTER}{ESPERA Dados Corretos}{PAUSA 1}{ENTER}{ESPERA para seguir}{PAUSA 1}{ENTER}{ESPERA GRAVO A SOMATORIA|300}{PAUSA 1}{TELA x08_reacoes}S{ENTER}{ESPERA escolha opcao}{PAUSA 3}{TELA x09_menu_fim}"
echo "{F2}{ENTER}{ESPERA Configuracao|60}{PAUSA 2}{F2}"

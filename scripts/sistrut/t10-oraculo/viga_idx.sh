#!/usr/bin/env bash
# Trecho: LAJE -> gerenciador -> VIGA; le <obra> (registros 1 A n), processa 1 A n (impressao), regrava, opcao 7
# (impressao, .REP), volta e sai. Uso: viga_idx.sh <obra> <n>
o="$1"; n="$2"
echo "{F2}{ENTER}{ESPERA Configuracao|60}{PAUSA 2}V{ENTER}{ESPERA VIGAS CONTINUAS}{ESPERA escolha opcao}{PAUSA 2}{TELA x01_viga}"
echo "6{ESPERA Gravacao e Leitura}{ESPERA escolha opcao}{PAUSA 2}5{ESPERA RETORNO}{PAUSA 2}$o{ENTER}{ESPERA intervalo}{PAUSA 2}{TELA x02_le}1 A $n{ENTER}{ESPERA Coloca-las}{PAUSA 2}{TELA x03_coloca}{ENTER}{ESPERA Dados Corretos}{PAUSA 2}{ENTER}{ESPERA Catalogo}{PAUSA 3}{TELA x04_catalogo}"
echo "8{ESPERA VIGAS CONTINUAS}{ESPERA escolha opcao}{PAUSA 2}4{ESPERA Qualquer Tecla}{PAUSA 2}{TELA x05_lista}{ENTER}{ESPERA escolha opcao}{PAUSA 2}"
echo "2{ESPERA Calcular posicoes}{PAUSA 2}1 A $n{ENTER}{ESPERA Imprimo os resultados}{PAUSA 1}S{ENTER}{ESPERA Desenho diagramas}{PAUSA 1}{ENTER}{ESPERA esquema estrutural}{PAUSA 1}{ENTER}{ESPERA Dados Corretos}{PAUSA 1}{TELA x06_proc}{ENTER}{ESPERA para seguir}{PAUSA 1}{TELA x07_seguir}{ENTER}{ESPERA escolha opcao|300}{PAUSA 3}{TELA x08_menu}"
echo "6{ESPERA Gravacao e Leitura}{ESPERA escolha opcao}{PAUSA 2}1{ESPERA NAO CRIAR}{PAUSA 2}$o{ENTER}{ESPERA Gravacao e Leitura}{ESPERA escolha opcao}{PAUSA 2}2{ESPERA posicoes da memoria}{PAUSA 2}1 A $n{ENTER}{ESPERA do Registro}{PAUSA 2}1{ENTER}{ESPERA Dados Corretos}{PAUSA 2}{ENTER}{ESPERA Gravacao e Leitura}{ESPERA escolha opcao}{PAUSA 2}{TELA x09_gravado}"
echo "8{ESPERA VIGAS CONTINUAS}{ESPERA escolha opcao}{PAUSA 2}"
echo "7{ESPERA Nome da Obra}{PAUSA 1}$o{ENTER}{ESPERA Listo as Vigas}{PAUSA 1}{ENTER}{ESPERA Continuo}{PAUSA 1}{ENTER}{ESPERA Todas as Vigas}{PAUSA 1}S{ENTER}"
for i in $(seq 1 $n); do printf '{ESPERA Registro %s}{PAUSA 2}{TELA x10_reg%s}{ENTER}' $i $i; done; echo
echo "{ESPERA Vigas Apoiadas}{PAUSA 1}{TELA x11_mult}{ENTER}{ESPERA Imprimo os Resultados}{PAUSA 1}S{ENTER}{ESPERA Diagrama de Esforcos}{ENTER}{ESPERA esquema estrutural}{ENTER}{ESPERA Dados Corretos}{PAUSA 1}{ENTER}{ESPERA para seguir}{PAUSA 1}{ENTER}{ESPERA GRAVO A SOMATORIA|300}{PAUSA 1}{TELA x12_reacoes}S{ENTER}{ESPERA escolha opcao}{PAUSA 3}{TELA x13_menu_fim}"
echo "{F2}{ENTER}{ESPERA Configuracao|60}{PAUSA 2}{F2}"

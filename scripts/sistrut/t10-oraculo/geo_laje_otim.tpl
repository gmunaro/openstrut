# T10 v2par_laje_otim (sufixo a partir do menu do LAJE). Partida: C: sem obra.
# Objetivo: R3 do PLANO (LAJECALC.BAS:2113/2123/2145): otimizacao dos negativos que reduz o coeficiente
# em 2 casas (INT(100*coef*M2/M1)/100) e grava em 1 casa (CINT(coef*10+2), ao par).
# Obra OTIM: eixos horizontais y = 0, 6; verticais x = 0, 6, @W@. L1 6 x 6 ao lado de uma faixa L2
# (@L@ x 6), continuas em x = 6. Arquitetura e ocupacao (0.15/0.15 t/m2) no contorno; vigas no
# contorno e em x = 6; pilares nos 6 cruzamentos; lajes macicas, permanente 0.1, peso proprio 0.25.
{TELA l01}2{ESPERA Geometria do Painel}{ESPERA escolha opcao}{PAUSA 2}{TELA g01_menu}
1{ESPERA Eixo HORIZONTAL}{PAUSA 1}0{ENTER}6{ENTER}V{ENTER}0{ENTER}6{ENTER}@W@{ENTER}{PAUSA 1}{TELA g02_eixos}{ENTER}{ESPERA Geometria do Painel}{ESPERA escolha opcao}{PAUSA 2}
2{ESPERA Nome da Obra|30}{PAUSA 1}OTIM{ENTER}{ESPERA A R Q U I T E T U R A}{PAUSA 2}I{RIGHT}{RIGHT}{ENTER}{UP}{ENTER}{LEFT}{LEFT}{ENTER}{DOWN}{ENTER}{PAUSA 2}{TELA g03_arq}F{ESPERA escolha opcao}{PAUSA 2}
3{ESPERA C A R G A S}{PAUSA 2}A{PAUSA 2}I{RIGHT}{RIGHT}{ENTER}{UP}{ENTER}{LEFT}{LEFT}{ENTER}{DOWN}{ENTER}{ESPERA Carga de Ocupacao Total}{PAUSA 1}0.15{ENTER}{ESPERA Parcela Acidental}{PAUSA 1}0.15{ENTER}{ESPERA Carga por Area}{PAUSA 2}{TELA g04_ocup}F{ESPERA escolha opcao}{PAUSA 2}
4{ESPERA E S T R U T U R A}{PAUSA 2}I{RIGHT}{RIGHT}{ENTER}I{UP}{ENTER}I{LEFT}{LEFT}{ENTER}I{DOWN}{ENTER}{RIGHT}I{UP}{ENTER}{PAUSA 2}{TELA g05_estr}F{ESPERA escolha opcao}{PAUSA 2}
5{ESPERA P I L A R E S}{PAUSA 2}{ENTER}{ESPERA Nome do Pilar}{ENTER}{RIGHT}I{ENTER}{ESPERA Nome do Pilar}{ENTER}{RIGHT}I{ENTER}{ESPERA Nome do Pilar}{ENTER}{UP}I{ENTER}{ESPERA Nome do Pilar}{ENTER}{LEFT}I{ENTER}{ESPERA Nome do Pilar}{ENTER}{LEFT}I{ENTER}{ESPERA Nome do Pilar}{PAUSA 1}{ENTER}{PAUSA 2}{TELA g06_pil}F{ESPERA escolha opcao}{PAUSA 2}
6{ESPERA C A R G A S   D E   L A J E}{PAUSA 2}{TELA g07_lajes}T{ESPERA lajes Macicas}{PAUSA 1}M{ENTER}{PAUSA 3}{ENTER}{ESPERA <F>im}{PAUSA 2}C{ESPERA Todas as Lajes}{PAUSA 1}T{ENTER}{ESPERA Carga permanente}{PAUSA 1}0.1{ENTER}{PAUSA 1}0.25{ENTER}{PAUSA 3}{ENTER}{ESPERA <F>im}{PAUSA 2}{TELA g08_lajes}F{ESPERA Posicionadas}{PAUSA 2}{TELA g09_menu}

"""Gera tests/retraducao/desenho/v2par_<nome>.sufixo.txt (item 1 do DESENHO, como o caso det, + item 4 + saida).
Uso: gen_des.py <nome> <obra> <registro> <bw,hw,bf,hf> <vaos livres separados por ,> <titulos dos apoios ,> <viga> <comentario>"""
import sys
nome, obra, reg, secao, vaos, tit, viga, coment = sys.argv[1:9]
vaos = vaos.split(','); tit = tit.split(',')
L = [f"# {l}" for l in coment.split('|')]
L.append(f"1{{ESPERA Nome da Obra}}{{PAUSA 2}}{{TELA d01}}{obra}{{ENTER}}{{ESPERA Listo as Vigas}}{{PAUSA 1}}{{ENTER}}{{ESPERA Continuo}}{{PAUSA 1}}{{ENTER}}{{ESPERA Todas as Vigas}}{{PAUSA 1}}{{ENTER}}{{ESPERA Processar Registros}}{{PAUSA 1}}{{TELA d05}}")
L.append(f"{reg}{{ENTER}}{{ESPERA Bw , Hw}}{{PAUSA 2}}{{TELA d06}}{secao}{{ENTER}}{{ESPERA Secoes Diferentes}}{{PAUSA 1}}{{ENTER}}{{ESPERA Retangular}}{{PAUSA 1}}{{ENTER}}{{ESPERA Dados Corretos}}{{PAUSA 1}}{{TELA d09}}{{ENTER}}")
for i, t in enumerate(tit):
    L.append(f"{{ESPERA Largura do Apoio {i}}}{{PAUSA 1}}{{TELA d1{i}_apoio}}20{{ENTER}}{{ESPERA Tipo do Apoio}}{{PAUSA 1}}{{ENTER}}{{ESPERA Titulo}}{{PAUSA 1}}{t}{{ENTER}}{{ESPERA orre}}{{PAUSA 1}}{{ENTER}}")
s = "{ESPERA Dados Corretos}{PAUSA 1}{TELA d20}{ENTER}"
for i, v in enumerate(vaos):
    s += f"{{ESPERA Vao Livre do Tramo {i+1}}}{{PAUSA 1}}{{TELA d2{i+1}_vao}}{v}{{ENTER}}"
L.append(s)
L.append("{ESPERA Superior dos Tramos}{PAUSA 1}{TELA d25}{ENTER}{ESPERA Centraliza}{PAUSA 1}{ENTER}{ESPERA Lajes no Corte}{PAUSA 1}N{ENTER}{ESPERA Dados Corretos}{PAUSA 1}{TELA d28}{ENTER}")
L.append("{ESPERA Deseja Alterar}{PAUSA 1}{TELA d29}{ENTER}{ESPERA esforcos S}{PAUSA 1}S{ENTER}{ESPERA resultados de Armacao}{PAUSA 1}S{ENTER}{ESPERA somente os diagramas}{PAUSA 1}S{ENTER}")
L.append("{ESPERA diagramas e a Armacao}{PAUSA 1}S{ENTER}{ESPERA VIDEO}{PAUSA 1}{TELA d34}{ENTER}{ESPERA Altero a armadura}{PAUSA 1}{TELA d35}{ENTER}")
L.append("{ESPERA desenho definitivo}{PAUSA 1}{TELA d36}S{ENTER}{ESPERA Escala 1/.. 200 100 *50*}{PAUSA 1}{ENTER}{ESPERA Edito}{PAUSA 1}{ENTER}{ESPERA padrao CAD}{PAUSA 1}{TELA d39}N{ENTER}")
L.append("{ESPERA medidas de forma}{PAUSA 1}{TELA d41}{ENTER}{ESPERA dobramento}{PAUSA 1}{ENTER}")
L.append(f"{{ESPERA CAB 1)}}{{PAUSA 1}}OBRA {obra}{{ENTER}}{{ESPERA CAB 2)}}{{PAUSA 1}}VIGA {viga}{{ENTER}}{{ESPERA CAB 3)}}{{PAUSA 1}}SISTRUT{{ENTER}}{{ESPERA NOT 1)}}{{PAUSA 1}}NOTA UM{{ENTER}}{{ESPERA NOT 2)}}{{PAUSA 1}}NOTA DOIS{{ENTER}}")
L.append("{ESPERA repeticoes *FIM*}{PAUSA 1}{TELA i01}{ENTER}{ESPERA Dados Corretos}{PAUSA 1}{TELA i02}{ENTER}{PAUSA 8}{TELA i03}")
L.append("{ENTER}{ESPERA escolha opcao|300}{PAUSA 3}{TELA i04_menu}")
L.append(f"4{{ESPERA Nome da Obra}}{{PAUSA 2}}{obra}{{ENTER}}{{ESPERA a anular}}{{PAUSA 2}}{{TELA r02}}{{ENTER}}{{ESPERA Resumo Geral}}{{PAUSA 2}}S{{ENTER}}{{ESPERA para seguir}}{{PAUSA 2}}{{ENTER}}{{ESPERA Qualquer Tecla}}{{PAUSA 3}}{{TELA r04_resumo}}{{ENTER}}{{ESPERA escolha opcao}}{{PAUSA 2}}{{TELA r05}}")
L.append("{F2}{ENTER}{ESPERA Configuracao|60}{PAUSA 2}{F2}")
open(f"C:/wt/v1-v2par/tests/retraducao/desenho/v2par_{nome}.sufixo.txt", "w").write("\n".join(L) + "\n")

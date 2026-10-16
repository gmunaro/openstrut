"""Definicao dos casos v2par (T10): programa, descricao, entrada, extratores e valores lidos de telas.
"lajes" (obra lida do .LAJ do run) e "telas" (regex em telas/*.txt) sao resolvidos pelo extrai_v2par.py."""

PARAM_LAJE = {
    "norma": "NB-1/78, parametrização SISTRUT de fábrica (LAJE.INI/SISTRUT.LAP da instalação oficial)",
    "fck_tcm2": 0.15, "fyk_tcm2": 5, "classeAco": "B", "gama_f": 1.4, "gama_c": 1.4, "gama_s": 1.15,
    "cobrimentoLaje_cm": 1.5, "acrescimoAlturaUtil_cm": 0.5, "densidadeConcreto_tm3": 2.5,
    "MnegMpos_min": 0.30, "MnegMpos_max": 2.00, "eficienciaNegativa": 1.0, "Hmin_Hmax_cm": [6, 40],
    "unidades": "t, m, cm; cargas de laje em t/m2; cargas de viga em t/m",
}
NOTA_LAJ = ("'obra_gravada_pelo_original' é o .LAJ que o original gravou neste run (LAJEGRAV, depois do LAJECALC e do "
            "LAJEMONT, antes do LAJEPROC). Coordenadas em m. Cada laje é um polígono no sentido horário que começa no "
            "vértice de menor número; 'lado k' vai do vértice k ao k+1. Código do lado: 0 apoiado (viga), 1 livre "
            "(trecho só de arquitetura), >2 engastado com i = (código−2)/10. A continuidade automática (LAJECALC 1) "
            "dá código 22 (i = 2,0) aos dois lados com os mesmos dois vértices; os códigos gravados são os FINAIS, "
            "depois da otimização (LAJECALC 6) quando ela roda. 'vigas_nos_m' = nós de cada viga gerada pelo "
            "LAJEMONT (nome V1..Vn usado nos relatórios); 'pilares' = posição de cada pilar.")
SEQ_LAJE = [
    "LAJEGEOM 1: eixos; 2: nome da obra e arquitetura; 3: cargas (alvenarias lineares e cargas de ocupação por área); "
    "4: estrutura (trechos de viga); 5: pilares; 6: todas as lajes maciças, carga permanente 0,10 t/m2 e peso próprio 0,25 t/m2",
    "LAJECALC 1: continuidade automática, sem alterações; 2: direção padrão (0 grau) e μ pela tabela de relação de vãos",
    "LAJECALC 3: espessuras mínimas de todas as lajes (impressas)",
    "LAJECALC 4: H = 10 cm imposto em todas as lajes (impresso)",
    "LAJECALC 5: momentos e armaduras de todas as lajes (impressos)",
    "LAJECALC 6: otimização dos negativos em todas as lajes",
    "LAJECALC 5 de novo (impresso; os ids sem sufixo são esta impressão, os .antesOtim a anterior)",
    "LAJEGEOM 7 (LAJEMONT): geração de .VIG/.RLP com peso próprio predominante das vigas 0,15 t/m, sem exceções, relatório de carregamento impresso",
    "LAJEGRAV: grava a obra; LAJEPROC 1 (escolha automática de todas as armaduras), 2 (desenho das positivas), 3 (desenho das negativas), 5 (impressão gráfica)",
]


def laje_caso(obra, descricao, especifico, seq=SEQ_LAJE, extra_ext=(), programa=None, manuais=(), telas=(), cmp=None):
    return {
        "programa": programa or "LAJEGEOM + LAJECALC + LAJEMONT (LAJEGEOM 7) + LAJEPROC",
        "descricao": descricao,
        "entrada": {"parametros": PARAM_LAJE, "obra": especifico, "sequencia": list(seq), "notas": NOTA_LAJ},
        "extratores": ["laje", *extra_ext], "laj": obra, "manuais": list(manuais), "telas": list(telas),
        "comparacao_v1": cmp,
    }


def proc(fonte_pos, fonte_neg, pos, neg):
    """Rotulos do LAJEPROC lidos nos desenhos (telas graficas CGA, PNG)."""
    out = []
    for L, (p, s) in pos.items():
        out.append({"id": f"{L}.proc.posPrinc", "impresso": p, "unidade": "", "fonte": fonte_pos,
                    "grandeza": f"{L} armadura positiva escolhida pelo LAJEPROC, rótulo com traço '—' (direção do ângulo da armadura, x)",
                    "obs": "lido no desenho (tela gráfica); bitola em mm e espaçamento em cm"})
        out.append({"id": f"{L}.proc.posSec", "impresso": s, "unidade": "", "fonte": fonte_pos,
                    "grandeza": f"{L} armadura positiva escolhida pelo LAJEPROC, rótulo sem traço (direção y)",
                    "obs": "lido no desenho (tela gráfica)"})
    for par, r in neg.items():
        out.append({"id": f"{par}.proc.neg", "impresso": r, "unidade": "", "fonte": fonte_neg,
                    "grandeza": f"armadura negativa da continuidade {par} escolhida pelo LAJEPROC (um código por continuidade)",
                    "obs": "lido no desenho das negativas (tela gráfica); o rótulo aparece uma vez de cada lado"})
    return out


SEQ_SEM_OTIM = [s for s in SEQ_LAJE if not s.startswith(("LAJECALC 6", "LAJECALC 5 de novo"))]
SEQ_VIGA7 = ["F2 → gerenciador → VIGA, opção 7 da obra (todas as vigas, apoios como gravados pelo LAJEMONT, multiplicador dos "
             "momentos 100 %, impressão dos resultados, sem diagramas nem esquema), grava o .REP. VIGA.INI de fábrica: "
             "cargas totais (acidentais N), redução dos negativos 100 %, reações estáticas"]

CASOS = {
    "v2par_laje_livre": laje_caso(
        "LIV",
        "Duas lajes 4 × 5 m lado a lado com o bordo superior LIVRE (sem viga em y = 5: trecho só de arquitetura, código 1). "
        "Exercita o padrão de charneiras com bordo livre (L13), a continuidade com bordo livre adjacente e as reações sem o bordo livre.",
        {"descricao": "eixos x 0/4/8, y 0/5; arquitetura no contorno 8 × 5; ocupação 0,15 (acidental 0,15) t/m2 em toda a área; "
                      "vigas em y = 0 (0..8), x = 8 (0..5), x = 4 (5..0), x = 0 (0..5); SEM viga em y = 5; pilares nos 6 cruzamentos; "
                      "L1 = x 0..4, L2 = x 4..8 (continuas em x = 4)"},
        manuais=proc("telas/035_p04_desenho.png", "telas/038_p05n_desenho.png",
                     {"L1": ("#6.3c/15", "#6.3c/20"), "L2": ("#6.3c/17.5", "#6.3c/20")}, {"L1-L2": "#6.3c/7.5"}),
        cmp="igual (46 de 47; só o FRE do LAJEGRAV); impressora 34.069 bytes e LIV.LAJ/.BAK/.VIG/.RLP iguais"),
    "v2par_laje_balanco": laje_caso(
        "BAL",
        "Laje interna 4 × 5 m com laje em BALANÇO 4 × 1,5 m (três bordos livres, engastada na interna pela continuidade em y = 5). "
        "O original dá ao balanço M+ 0,00 e M− negativo (−0,56), e As+ mínima 1,50.",
        {"descricao": "eixos x 0/4, y 0/5/6,5; arquitetura no contorno 4 × 6,5; ocupação 0,15 (0,15) t/m2 em toda a área; "
                      "vigas no retângulo 4 × 5: y = 0 (0..4), x = 4 (0..5), y = 5 (4..0), x = 0 (5..0); pilares nos 4 cantos do "
                      "retângulo; L1 = balanço y 5..6,5; L2 = interna"},
        manuais=proc("telas/035_p04_desenho.png", "telas/038_p05n_desenho.png",
                     {"L1": ("#6.3c/20", "#6.3c/20"), "L2": ("#6.3c/20", "#6.3c/20")}, {"L1-L2": "#6.3c/10"}),
        cmp="DIFERENTE: 45 de 47 (FRE e a impressora). Na impressora (impressora.prn byte 1786; impressora.txt linhas 63 e 97, "
            "tabela ARMADURAS NAS LAJES antes e depois da otimização), a L1 (balanço, M+ = −0,28 impresso 0,00) sai no original "
            "com As+ principal 1.50 e As+ secundário 1.50 e na V1 nova com -1.00 e -1.00. Provável defeito da V1 na flexão com "
            "M+ ≤ 0 (LAJECALC.BAS:660-700 e GOSUB L_14312, 929-953). Telas e BAL.LAJ/.VIG/.RLP iguais"),
    "v2par_laje_umadir": laje_caso(
        "UMD",
        "Duas lajes 3 × 7,5 m (ly/lx = 2,5 > 2, 'armada em uma direção' no critério usual) contínuas no lado maior. "
        "O original não tem regra de uma direção: usa o mesmo padrão de charneiras com μ da tabela (0,55).",
        {"descricao": "eixos x 0/3/6, y 0/7,5; arquitetura e ocupação 0,15 (0,15) no contorno 6 × 7,5; vigas no contorno e em x = 3; "
                      "pilares nos 6 cruzamentos; L1 = x 0..3, L2 = x 3..6"},
        manuais=proc("telas/035_p04_desenho.png", "telas/038_p05n_desenho.png",
                     {"L1": ("#6.3c/20", "#6.3c/20"), "L2": ("#6.3c/20", "#6.3c/20")}, {"L1-L2": "#6.3c/12.5"}),
        cmp="igual (46 de 47; só o FRE); impressora 34.337 bytes e UMD.LAJ/.BAK/.VIG/.RLP iguais"),
    "v2par_laje_assim": laje_caso(
        "ASS",
        "Planta em T com 4 lajes de vãos diferentes: vínculos assimétricos (L2 com 3 bordos contínuos e 1 apoiado; L1, L3 e L4 "
        "com 1 contínuo) e otimização dos negativos que MUDA o coeficiente: L3 lado 3 de 22 para 16 (i 2,0 → 1,4) e L4 lado 1 "
        "de 22 para 15 (i 1,3), com M+ recalculado (L3 0,32 → 0,36; L4 0,31 → 0,35).",
        {"descricao": "eixos x 0/3/8/12, y 0/4/9; arquitetura e ocupação 0,15 (0,15) no contorno do T (0,4)-(3,4)-(3,0)-(8,0)-(8,4)-(12,4)-(12,9)-(0,9); "
                      "vigas em todos os bordos; pilares nos 10 cruzamentos; L1 = 3 × 5 (x 0..3, y 4..9), L2 = 5 × 5 (x 3..8, y 4..9), "
                      "L3 = 4 × 5 (x 8..12, y 4..9), L4 = 5 × 4 (x 3..8, y 0..4)"},
        manuais=proc("telas/035_p04_desenho.png", "telas/038_p05n_desenho.png",
                     {"L1": ("#6.3c/20", "#6.3c/20"), "L2": ("#6.3c/20", "#6.3c/20"), "L3": ("#6.3c/20", "#6.3c/20"), "L4": ("#6.3c/20", "#6.3c/20")},
                     {"L1-L2": "#6.3c/15", "L2-L3": "#6.3c/12.5", "L2-L4": "#6.3c/15"}),
        cmp="igual (46 de 47; só o FRE); ASS.LAJ/.VIG/.RLP iguais"),
    "v2par_laje_otim": laje_caso(
        "OTIM",
        "Laje 6 × 6 m ao lado de uma faixa de 1,8 × 6 m: a otimização dos negativos reduz o coeficiente do lado da L1 de 2,0 "
        "(código 22) até o piso Mneg/Mpos mínimo de fábrica, 0,30 (código 5), e para ali ('coef1 = F7A'). Referência do caso "
        "R3 sem travar: com o piso 0,30 a otimização sempre converge (v2par_laje_r3 mostra o laço com o piso 0,35).",
        {"descricao": "eixos x 0/6/7,8, y 0/6; arquitetura e ocupação 0,15 (0,15) no contorno 7,8 × 6; vigas no contorno e em x = 6; "
                      "pilares nos 6 cruzamentos; L1 = 6 × 6, L2 = faixa 1,8 × 6"},
        manuais=proc("telas/035_p04_desenho.png", "telas/038_p05n_desenho.png",
                     {"L1": ("#6.3c/7.5", "#6.3c/7.5"), "L2": ("#6.3c/20", "#6.3c/20")}, {"L1-L2": "#6.3c/20"}),
        cmp="igual (46 de 47; só o FRE); OTIM.LAJ/.VIG/.RLP iguais"),
    "v2par_laje_r2": laje_caso(
        "RDOIS",
        "R2 do PLANO (LAJEPROC.BAS:855): continuidade em que o lado da vizinha tem o MESMO número do lado da laje atual (L1 lado 3 "
        "com L2 lado 3). O LAJEPROC não recalcula a vizinha e grava um código por continuidade com a As da última laje processada: "
        "a negativa sai # 6.3 c/10 (3,15 cm2/m), que atende a L2 (As− 2,86) mas não a L1 (As− 4,70, que pede # 8.0 c/10). "
        "Sem otimização, para os M− das duas lajes ficarem diferentes (2 × M+ de cada uma).",
        {"descricao": "eixos x 0/6/10, y 0/5; arquitetura e ocupação 0,15 (0,15) no contorno 10 × 5; vigas desenhadas NESTA ORDEM (a ordem "
                      "numera os vértices): x = 0 de (0,0) a (0,5); x = 10 de (10,5) a (10,0); y = 5 de (10,5) a (0,5); y = 0 de (0,0) a (10,0); "
                      "x = 6 de (6,0) a (6,5); pilares nos 6 cruzamentos; L1 = 6 × 5 começa em (0,0), L2 = 4 × 5 começa em (10,5): o lado comum "
                      "x = 6 é o lado 3 das duas"},
        seq=SEQ_SEM_OTIM,
        manuais=proc("telas/032_p04_desenho.png", "telas/035_p05n_desenho.png",
                     {"L1": ("#6.3c/12.5", "#6.3c/12.5"), "L2": ("#6.3c/20", "#6.3c/20")}, {"L1-L2": "#6.3c/10"}),
        cmp="igual (43 de 44; só o FRE); RDOIS.LAJ/.VIG/.RLP iguais. A V1 nova reproduz o R2 (mesma negativa # 6.3 c/10)"),
    "v2par_laje_r3": laje_caso(
        "OTIM",
        "R3 do PLANO (LAJECALC.BAS:2111-2145): a otimização dos negativos NÃO CONVERGE quando o piso Mneg/Mpos mínimo não é "
        "múltiplo de 0,1. Mesma obra do v2par_laje_otim com o parâmetro 'Minima Relacao Mneg/Mpos' (LAJECALC 7, item 6) em 0,35: "
        "o coeficiente reduzido vira max(INT(100·c·M2/M1)/100; 0,35) = 0,35 em SINGLE (0,3499999940), gravado como "
        "CINT(0,35·10 + 2) = CINT(5,4999999) = 5 (0,30); como 0,30 ≠ 0,35 e (M1 − M2)/M1 > 10 %, o mesmo bordo é refeito para "
        "sempre. Telas aos 30 s e 60 s iguais ('Relacao Mneg/Mpos da Laje L1 alterada para .35 .. Aguarde'); F2 interrompe e volta ao LAJE. "
        "Com o piso de fábrica 0,30 não há laço (o mesmo CINT faz o código andar: 0,4 → 0,3 = piso).",
        {"descricao": "a do v2par_laje_otim; antes do LAJECALC 1: LAJECALC 7 → item 6 'Minima Relacao Mneg/Mpos' = 0.35 → 8"},
        seq=[SEQ_LAJE[0], "LAJECALC 7 → 6: Mínima Relação Mneg/Mpos = 0,35", *SEQ_LAJE[1:5],
             "LAJECALC 6: otimização (não termina; 2 telas a 30 s e 60 s; F2 sai para o menu do LAJE)"],
        telas=[
            {"id": "L1.otim.M", "tela": "c10_trava", "re": r"^\s*M =\s+(\S+)\s+As", "ocorrencia": 0, "unidade": "tm/m",
             "grandeza": "L1 M− do lado em otimização (tela da otimização, laço)"},
            {"id": "L1.otim.As", "tela": "c10_trava", "re": r"As =\s+(\S+)\s+Mneg", "ocorrencia": 0, "unidade": "cm2/m",
             "grandeza": "L1 As− do lado em otimização"},
            {"id": "L1.otim.MnegMpos", "tela": "c10_trava", "re": r"Mneg/Mpos =\s+(\S+)", "ocorrencia": 0, "unidade": "",
             "grandeza": "L1 relação Mneg/Mpos gravada (0,30 = código 5) durante o laço"},
            {"id": "L2.otim.M", "tela": "c10_trava", "re": r"^\s*M =\s+(\S+)\s+As", "ocorrencia": 1, "unidade": "tm/m",
             "grandeza": "L2 (vizinha) M− na continuidade"},
            {"id": "L2.otim.As", "tela": "c10_trava", "re": r"As =\s+(\S+)\s+Mneg", "ocorrencia": 1, "unidade": "cm2/m",
             "grandeza": "L2 (vizinha) As− na continuidade"},
            {"id": "L2.otim.MnegMpos", "tela": "c10_trava", "re": r"Mneg/Mpos =\s+(\S+)", "ocorrencia": 1, "unidade": "",
             "grandeza": "L2 relação Mneg/Mpos"},
            {"id": "L1.otim.alteradaPara", "tela": "c10_trava", "re": r"alterada para\s+(\S+)", "ocorrencia": 0, "unidade": "",
             "grandeza": "valor da relação que o laço tenta gravar (repete para sempre)"},
            {"id": "L1.otim.alteradaPara.60s", "tela": "c11_trava", "re": r"alterada para\s+(\S+)", "ocorrencia": 0, "unidade": "",
             "grandeza": "mesma tela 30 s depois (prova do laço)"},
        ],
        cmp="sem comparação útil: a V1 nova também entra no laço (LAJECALC.exe a ~5 % de CPU, nenhuma tela depois de c09_otim), "
            "mas o roteiro da V1 não avança porque o RT45 só lê teclas (e o ON KEY) quando o programa pede tecla; o F2 que tira o "
            "original do laço não chega. Diferença de comportamento do ON KEY durante laço sem leitura de teclado"),
    "v2par_laje_cargas": laje_caso(
        "CAR",
        "Cargas por área (dois polígonos de ocupação sobrepostos, com parcela acidental) e alvenarias sobre viga e sobre laje, "
        "do LAJEGEOM ao LAJEMONT (.VIG) e ao VIGA (opção 7, .REP).",
        {"descricao": "eixos x 0/4/6/8 (x = 6 só de referência), y 0/5; arquitetura no contorno 8 × 5; alvenaria (0,0)-(8,0) 0,5 t/m "
                      "(sobre a viga y = 0) e (6,0)-(6,5) 0,4 t/m (no meio da L2, sem viga); ocupação A1 no contorno total 0,15 "
                      "acidental 0,10 t/m2; A2 em (0,0)-(4,0)-(4,5)-(0,5) total 0,30 acidental 0,20 t/m2; vigas y = 0 (0..8), "
                      "x = 8 (0..5), y = 5 (8..0), x = 0 (5..0), x = 4 (0..5); pilares nos 6 cruzamentos de x 0/4/8 com y 0/5; "
                      "L1 = x 0..4, L2 = x 4..8"},
        seq=SEQ_LAJE + SEQ_VIGA7, extra_ext=("viga",), programa="LAJEGEOM + LAJECALC + LAJEMONT + LAJEPROC + VIGA (opção 7)",
        manuais=[],  # preenchido pelos rotulos lidos (abaixo)
        cmp="igual (65 de 66; só o FRE); impressora 42.538 bytes e CAR.LAJ/.BAK/.VIG/.RLP/.REP iguais"),
}

# ------------------------------------------------------------------ viga no fluxo da obra
CASOS["v2par_viga_fluxo"] = laje_caso(
    "VBX",
    "Viga com BALANÇO e CARGA INDEXADA no fluxo da obra (LAJEMONT → VIGA) e reações no .REP com truncamento (R5). Pilares só "
    "em x = 0 e x = 4: as vigas V1 (y = 5) e V2 (y = 0) têm balanço de 4 m e a V5 (x = 8) se apoia nas pontas dos balanços "
    "('V5 apoia em V1' e 'V5 apoia em V2' no LAJEMONT). O VIGA 7 recusa obra com carga indexada ('Leia o arquivo, processe e "
    "regrave'): lê, processa (opção 2: V3, V4, V5 e só então V1 e V2 com a reação da V5 como carga F = 1,67 t na ponta), regrava "
    "e roda a opção 7. No .REP o P4 recebe −1,67 (V1) + 1,66 (V3: R = 1,67 truncado) = −0,01.",
    {"descricao": "eixos x 0/4/8, y 0/5; arquitetura e ocupação 0,15 (0,15) no contorno 8 × 5; vigas y = 0 (0..8), x = 8 (0..5), "
                  "y = 5 (8..0), x = 0 (5..0), x = 4 (0..5); pilares P1 (0,0), P2 (4,0), P3 (4,5), P4 (0,5); LAJEMONT: V1 = y 5, "
                  "V2 = y 0, V3 = x 0, V4 = x 4, V5 = x 8; nos cruzamentos sem pilar escolhido 'V5 apoia em V1' e 'V5 apoia em V2'; "
                  "L1 = x 0..4, L2 = x 4..8"},
    seq=[*SEQ_LAJE[:7], "LAJEGEOM 7 (LAJEMONT): 'V5 apoia em V1' (tecla para trocar da opção 1 para a 2, confirma), 'V5 apoia em V2', "
         "indexações corretas; peso próprio predominante 0,15 t/m; relatório impresso", SEQ_LAJE[8],
         "F2 → gerenciador → VIGA: 6 → 5 lê VBX registros 1 A 5; 4 lista; 2 processa 1 A 5 com impressão; 6 → 1/2 regrava VBX "
         "(registros 1 A 5 a partir do 1); 7 da obra VBX (apoios como gravados; a V5 tem os dois apoios 'desconsiderado'), "
         "multiplicador 100 %, impressão, grava VBX.REP. VIGA.INI de fábrica"],
    extra_ext=("viga",), programa="LAJEGEOM + LAJECALC + LAJEMONT + LAJEPROC + VIGA (opções 6, 2 e 7)",
    cmp="igual na V1 nova (ver V2PAR.md)")

# ------------------------------------------------------------------ pilares
PARAM_PILAR = {"norma": "NB-1/78 (PILAR.INI e SISTRUT.PIP de fábrica)", "fck_tcm2": 0.15, "fyk_tcm2": 5, "classeAco": "B",
               "fluencia": 0, "secaoComprimidaCritica": "N (resposta à pergunta 'Secao comprimida')"}
CASOS["v2par_pilar_mk"] = {
    "programa": "PILAR opção 6 (verificação NB-1/78)",
    "descricao": "Pilar avulso com Mk inicial ≠ 0: o Mk entra no momento solicitante junto com o acidental (Mx = Mk(i) + ea·Nk(a)) "
                 "em casos separados por direção; flexo-compressão reta e flexão oblíqua. Os ids têm o prefixo e<k>. do conjunto de esforços.",
    "entrada": {"parametros": PARAM_PILAR,
                "secao": {"tipo": "retangular", "B_cm": 20, "H_cm": 30, "cLinha_cm": 3, "barrasBordaSuperior": 2,
                          "barrasBordaInferior": 2, "barrasLaterais": 0, "bitola_mm": 16},
                "conjuntos": [{"k": 1, "Nk_t": 30, "Mxk_tm": 1.5, "Myk_tm": 0, "Lxe_m": 3, "Lye_m": 3},
                              {"k": 2, "Nk_t": 30, "Mxk_tm": 1.0, "Myk_tm": 0.6, "Lxe_m": 3, "Lye_m": 3},
                              {"k": 3, "Nk_t": 20, "Mxk_tm": 0.8, "Myk_tm": 0, "Lxe_m": 3, "Lye_m": 3}],
                "notas": "B é a largura (paralela a x) e H a altura; Mxk gira em torno de x (usa H). Sem desenho da seção; verificações impressas."},
    "extratores": ["pilar"],
}
CASOS["v2par_pilar_lambda"] = {
    "programa": "PILAR opção 6 (verificação NB-1/78)",
    "descricao": "Pilar avulso com esbeltez acima de 80 (λ = CINT(L/i·100) inteiro): seção do caso c com le 5 m (λ 87), le 6/3 m "
                 "(λx 104: 'SITUACAO DE INSTABILIDADE' na direção x) e le 4,8 m com Mk 0,2 (λ 83). Fluência 0 (padrão). "
                 "Ids com o prefixo e<k>. do conjunto.",
    "entrada": {"parametros": PARAM_PILAR,
                "secao": {"tipo": "retangular", "B_cm": 20, "H_cm": 20, "cLinha_cm": 3, "barrasBordaSuperior": 2,
                          "barrasBordaInferior": 2, "barrasLaterais": 0, "bitola_mm": 12.5},
                "conjuntos": [{"k": 1, "Nk_t": 17.37, "Mxk_tm": 0, "Myk_tm": 0, "Lxe_m": 5, "Lye_m": 5},
                              {"k": 2, "Nk_t": 17.37, "Mxk_tm": 0, "Myk_tm": 0, "Lxe_m": 6, "Lye_m": 3},
                              {"k": 3, "Nk_t": 12, "Mxk_tm": 0.2, "Myk_tm": 0, "Lxe_m": 4.8, "Lye_m": 4.8}]},
    "extratores": ["pilar"],
    "comparacao_v1": "igual (10 de 10; impressora 6.129 bytes)",
}
CASOS["v2par_pilar_niveis"] = {
    "programa": "PILAREDI (PILGEEDI + PIPROEDI)",
    "descricao": "Pilar de edifício com vários níveis: coluna P5 do E2E.REP (17,37 t) de FUND a COB com a carga introduzida nos "
                 "níveis 2, 3 e 4 (acumula 17,37 / 34,74 / 52,11 t) mais o peso próprio (Δcota·A·2,5); seção 25 × 40; "
                 "dimensionamento variando a armadura de nível em nível (um relatório por lance: FUND, PAV1, PAV2). "
                 "Ids com o nível: P5.FUND.1f.MRx2a.",
    "entrada": {"parametros": PARAM_PILAR | {"cobrimento_cm": 2.0},
                "obraDePartida": "E2E.REP gravado pelo VIGA original no caso b (C:/tmp/oraculo/casos/v2par_pilar_niveis.dados): P5 = 17,37 t",
                "niveis": [{"n": 1, "cota_m": 0, "nome": "FUND"}, {"n": 2, "cota_m": 3, "nome": "PAV1"},
                           {"n": 3, "cota_m": 6, "nome": "PAV2"}, {"n": 4, "cota_m": 9, "nome": "COB"}],
                "coluna": {"nome": "P5", "nivelInferior": 1, "nivelSuperior": 4},
                "cargas": "leitura do E2E.REP (opção 5) três vezes, introduzindo a carga do P5 (S) nos níveis 2, 3 e 4; os outros pilares "
                          "do .REP ignorados (A); 'Defino seção' N",
                "travamentos": "padrão (travada nos dois sentidos em todos os níveis)",
                "secao": {"tipo": "retangular", "B_cm": 25, "H_cm": 40},
                "dimensionamento": "posição 1, varia a armadura ao longo da coluna de 1 em 1 nível, sem parar, relatório impresso; aceita a armadura proposta"},
    "extratores": ["pilaredi"],
    "telas": [
        {"id": "P5.predim.cargaNivel", "tela": "e10_predim", "re": r"Nivel FUND\s+(\S+) t", "ocorrencia": 0, "unidade": "t",
         "grandeza": "predimensionamento: carga no nível FUND (cargas do .REP acumuladas)"},
        {"id": "P5.predim.carga", "tela": "e10_predim", "re": r"CARGA :\s+(\S+) t", "ocorrencia": 0, "unidade": "t",
         "grandeza": "predimensionamento: CARGA (com peso próprio estimado)"},
        {"id": "P5.predim.sigmaAdmComp", "tela": "e10_predim", "re": r"Compressao :.*admissivel\s+(\S+) t/cm2", "ocorrencia": 0,
         "unidade": "t/cm2", "grandeza": "predimensionamento: tensão máxima admissível na compressão"},
        {"id": "P5.predim.sigmaComp", "tela": "e10_predim", "re": r"maxima de\s+(\S+)\s+t/cm2", "ocorrencia": 0, "unidade": "t/cm2",
         "grandeza": "predimensionamento: tensão máxima de compressão encontrada"},
        {"id": "P5.predim.sigmaAdmCompM", "tela": "e10_predim", "re": r"Compressao \+ Momento :.*admissivel\s+(\S+) t/cm2",
         "ocorrencia": 0, "unidade": "t/cm2", "grandeza": "predimensionamento: tensão admissível com momento"},
        {"id": "P5.predim.sigmaCompM", "tela": "e10_predim", "re": r"maxima de\s+(\S+)\s+t/cm2", "ocorrencia": 1, "unidade": "t/cm2",
         "grandeza": "predimensionamento: tensão máxima com momento encontrada"},
    ],
}

# ------------------------------------------------------------------ detalhamento de vigas
PARAM_DES = {"norma": "NB-1/78 (DESENHO.INI e SISTRUT.DSP de fábrica)", "fck_tcm2": 0.15, "fyk_tcm2": 5, "classeAco": "B",
             "cobrimento_cm": 2.0}
SEQ_DES = ("DESENHO 1: obra ASS, registro {reg}; seção {sec} (Bw, Hw, Bf, Hf), seções iguais, retangular; apoios de 20 cm, tipo padrão, "
           "títulos {tit}; vãos livres {vaos} cm; face superior e centralização padrão; sem lajes no corte; imprime esforços e "
           "armação (S, S), diagramas (S, S) em escala VIDEO; não altera a armadura; desenho definitivo 1/50 na impressora, sem "
           "edição e sem CAD; cabeçalhos 'OBRA ASS', 'VIGA {viga}', 'SISTRUT', notas 'NOTA UM', 'NOTA DOIS'; depois DESENHO 4: "
           "resumo geral de consumo da obra ASS impresso")
OBRA_ASS = ("Obra ASS gravada pelo original no caso v2par_laje_assim (ASS.LAJ/.VIG/.RLP em C:/tmp/oraculo/casos/v2par_des_*.dados). "
            "As cargas da viga são as do ASS.VIG (impressas como <V>.t<k>.P; o DESDIM analisa a viga de novo, VIGA.INI de fábrica).")
CASOS["v2par_des_3tramos"] = {
    "programa": "DESENHO → DESDIM → DESGRAF → DESINIT → DESIMP; DESENHO 4",
    "descricao": "Dimensionamento e detalhamento (DESDIM/DESINIT) de viga de 3 tramos (3, 5 e 4 m), com o resumo de consumo.",
    "entrada": {"parametros": PARAM_DES, "obra": OBRA_ASS,
                "viga": {"registro": 1, "nome": "V1", "linha": "y = 9 m, nós x 0, 3, 8, 12", "tramos_m": [3, 5, 4],
                         "Bw_cm": 20, "Hw_cm": 50, "Bf_cm": 0, "Hf_cm": 0, "apoios_cm": [20, 20, 20, 20],
                         "vaosLivres_cm": [280, 480, 380]},
                "sequencia": [SEQ_DES.format(reg=1, sec="20, 50, 0, 0", tit="P1..P4", vaos="280, 480, 380", viga="V1")]},
    "extratores": ["desenho"],
}
CASOS["v2par_des_2tramos"] = {
    "programa": "DESENHO → DESDIM → DESGRAF → DESINIT → DESIMP; DESENHO 4",
    "descricao": "Dimensionamento e detalhamento (DESDIM/DESINIT) de viga de 2 tramos desiguais (4 e 5 m; o tramo 2 recebe a laje "
                 "5 × 5 e a 5 × 4) com o resumo de consumo.",
    "entrada": {"parametros": PARAM_DES, "obra": OBRA_ASS,
                "viga": {"registro": 5, "nome": "V5", "linha": "x = 3 m, nós y 0, 4, 9", "tramos_m": [4, 5],
                         "Bw_cm": 15, "Hw_cm": 45, "Bf_cm": 0, "Hf_cm": 0, "apoios_cm": [20, 20, 20],
                         "vaosLivres_cm": [380, 480]},
                "sequencia": [SEQ_DES.format(reg=5, sec="15, 45, 0, 0", tit="P1..P3", vaos="380, 480", viga="V5")]},
    "extratores": ["desenho"],
}

CASOS["v2par_laje_r3"]["laj"] = None  # o original fica no laco antes de gravar a obra
CASOS["v2par_laje_cargas"]["manuais"] = proc("telas/040_p04_desenho.png", "telas/043_p05n_desenho.png",
                                             {"L1": ("#6.3c/12.5", "#6.3c/15"), "L2": ("#6.3c/17.5", "#6.3c/20")}, {"L1-L2": "#6.3c/7.5"})

# ------------------------------------------------------------------ ajustes depois das rodadas
CASOS["v2par_pilar_mk"]["entrada"]["conjuntos"] = [
    {"k": 1, "Nk_t": 30, "Mxk_tm": 1.5, "Myk_tm": 0, "Lxe_m": 3, "Lye_m": 3},
    {"k": 2, "Nk_t": 30, "Mxk_tm": 0.5, "Myk_tm": 0.3, "Lxe_m": 3, "Lye_m": 3},
    {"k": 3, "Nk_t": 20, "Mxk_tm": 0.6, "Myk_tm": 0.4, "Lxe_m": 3, "Lye_m": 3}]
CASOS["v2par_pilar_mk"]["descricao"] = (
    "Pilar avulso com Mk inicial ≠ 0: o Mk entra no momento solicitante junto com o acidental (Mx = Mk(i) + ea·Nk(a)) em casos "
    "separados por direção. Conjunto 1: flexo-compressão reta, 'SITUACAO DE INSTABILIDADE'; conjuntos 2 e 3: flexão oblíqua com Mk "
    "nas duas direções, 'ok'. Ids com o prefixo e<k>. do conjunto. (As combinações que travam o original estão no v2par_pilar_trava.)")
CASOS["v2par_pilar_mk"]["comparacao_v1"] = "igual (10 de 10; impressora 5.967 bytes)"
CASOS["v2par_pilar_niveis"]["comparacao_v1"] = "igual (14 de 14; impressora 4.026 bytes)"
CASOS["v2par_viga_fluxo"]["comparacao_v1"] = (
    "DIFERENTE: 65 de 71. 3 telas de FRE; 2 telas da escolha de apoio do LAJEMONT (v02a, v02c) com 27 pixels: a seta que pisca "
    "por TIMER (laço de 0,08 s), dependente do relógio real; e a impressora (byte 39184; impressora.txt linhas 268, 304, 340 e 376): "
    "coluna f*EJ do tramo 1 das vigas V1 e V2 (tramo com M+ = 0 em x = 0, ao lado do balanço) sai ' 0.00' no original e '-0.00' na "
    "V1 nova, nas duas impressões (opções 2 e 7). Provável defeito da V1 no PRINT USING de valor negativo minúsculo ou −0. "
    "VBX.LAJ/.VIG/.RLP/.REP iguais byte a byte")
CASOS["v2par_des_3tramos"]["comparacao_v1"] = (
    "igual nos números (30 de 31): impressora 58.827 bytes e ASS.FOR/.SEC/.TAB iguais; a tela d09 difere só no cabeçalho "
    "de identificação do original, cortado pela janela, que a tabela de marca do compara_retrad.py não troca (artefato da marca)")
CASOS["v2par_des_2tramos"]["comparacao_v1"] = (
    "igual nos números (28 de 29): impressora 49.578 bytes e ASS.FOR/.SEC/.TAB iguais; a tela d09 difere só no cabeçalho cortado "
    "pela janela (artefato da troca de marca)")

CASOS["v2par_pilar_trava"] = {
    "programa": "PILAR opção 6 (verificação NB-1/78)",
    "descricao": "Achado da T10: o PILAR opção 6 não termina a verificação de alguns casos de flexão oblíqua (laço na busca do momento "
                 "resistente). Seção 20 × 30, c' 3, 2 + 2 φ16, Nk 20 t, Mxk 0,8, Myk 0, le 3 m: o caso 1/2 termina 'ok'; o caso 2/2 "
                 "(Mx 0,80 inicial, My acidental, inclinação 27°) fica em 'Esforcos resistentes do Pilar — Aguarde ...' aos 30 s e aos "
                 "60 s; F2 leva a 'Erro de Operacao'. Também travam (V1 nova, código nativo): Nk 30, Mxk 1,0, Myk 0,6 (caso 1, 21°) e "
                 "Nk 30, Mxk 0,8 (caso 2, 37°). Terminam: inclinações 15°, 18°, 22°, 53°, 61°, 72°.",
    "entrada": {"parametros": PARAM_PILAR,
                "secao": {"tipo": "retangular", "B_cm": 20, "H_cm": 30, "cLinha_cm": 3, "barrasBordaSuperior": 2,
                          "barrasBordaInferior": 2, "barrasLaterais": 0, "bitola_mm": 16},
                "conjuntos": [{"k": 1, "Nk_t": 20, "Mxk_tm": 0.8, "Myk_tm": 0, "Lxe_m": 3, "Lye_m": 3}]},
    "extratores": ["pilar"],
    "telas": [{"id": "e1.c2.Mtotal.tela", "tela": "t02_trava", "re": r"Mtotal=\s*(\S+) tm", "ocorrencia": 0, "unidade": "tm",
               "grandeza": "caso 2: momento solicitante total na tela do laço (60 s)"},
              {"id": "e1.c2.incl.tela", "tela": "t02_trava", "re": r"incl\s+(\S+) graus", "ocorrencia": 0, "unidade": "graus",
               "grandeza": "caso 2: inclinação do momento na tela do laço"}],
    "comparacao_v1": "sem comparação útil: a V1 nova também não termina o caso 2 (PILAR.exe a 100 % de CPU por mais de 5 min), mas o "
                     "roteiro da V1 não avança durante o laço (o RT45 só atende teclas e ON KEY quando o programa lê o teclado)",
}

CASOS["v2par_des_especial"] = {
    "programa": "VIGA (opções 8, 1, 6) → DESENHO (6, 5, 1, 4) → DESDIM → DESGRAF → DESINIT → DESIMP",
    "descricao": "Dimensionamento de viga com: seção T (Bf 80, Hf 10) nos tramos; armadura dupla no apoio 1 (x/d no limite do aço A, "
                 "0,628; Ast 10,18 e Asc 2,61); aço classe A; balanço à esquerda e à direita; carga concentrada de 3 t a 0,4 m do apoio "
                 "(alívio do cortante: Vke 8,98 no DESDIM contra Ve 10,98 da análise); flecha com inércia fissurada e deformação lenta "
                 "(impressa, 1,97 cm no tramo 1); verificação de fissuração (só na tela: janelas 'Fissura(1)' por apoio e por tramo; o "
                 "original não imprime fissuração); envoltória de acidentais (acidentais S: linhas 'max' na impressão).",
    "entrada": {
        "parametros": PARAM_DES | {"classeAco": "A", "parametrizacao": "V2P.DSP = SISTRUT.DSP com: TIPO DE ACO A; CARGAS ACIDENTAIS "
                                   "ENVOLTORIAS S; FLECHA COM INERCIA FISSURADA S; FLECHA COM DEFORMACAO LENTA S; VERIFICO FISSURACAO S; "
                                   "LIMITES DE VERIFICACAO A FISSURACAO 1 (o resto igual: Ec × 0,9, cobrimento 2 + 2, alívio do cortante S, "
                                   "γ 1,4/1,4/1,15, As mín 0,0015·Bw·Hw...)"},
        "viga": {"obra": "DSX", "nome": "D1", "VIGA_INI": "acidentais S, fornecidas (VIGA opção 8, item 2)",
                 "tramos": [
                     {"tramo": 0, "tipo": "balanço esquerdo", "L_m": 1.5, "divisoes": [{"P_tm": 3, "D_m": 1.5, "F_t": 0, "Pac_tm": 0.5, "Fac_t": 0}]},
                     {"tramo": 1, "L_m": 6, "divisoes": [{"P_tm": 3, "D_m": 0.4, "F_t": 3, "Pac_tm": 0.5, "Fac_t": 0},
                                                         {"P_tm": 3, "D_m": 6, "F_t": 0, "Pac_tm": 0.5, "Fac_t": 0}]},
                     {"tramo": 2, "L_m": 4, "divisoes": [{"P_tm": 3, "D_m": 4, "F_t": 0, "Pac_tm": 0.5, "Fac_t": 0}]},
                     {"tramo": 3, "tipo": "balanço direito", "L_m": 1.2, "divisoes": [{"P_tm": 3, "D_m": 1.2, "F_t": 3, "Pac_tm": 0.5, "Fac_t": 0}]}],
                 "inercia": "constante (J = 1)", "engastes": "nenhum",
                 "convencao": "cada divisão: P (t/m) distribuída até a posição D (m, medida do início do tramo) e F (t) concentrada em D; "
                              "Pac/Fac = parcela acidental"},
        "detalhamento": {"secaoTramos": {"Bw_cm": 20, "Hw_cm": 40, "Bf_cm": 80, "Hf_cm": 10},
                         "apoios": "retangulares 20 × 40; larguras 20 cm (P1, P2, P3)", "balancos": "retangulares 20 × 40",
                         "vaosLivres_cm": [140, 580, 380, 110], "lajesNoCorte": "N"},
        "sequencia": ["VIGA 8 → 2: acidentais S, F; VIGA 1: obra DSX, viga D1 (dados acima); VIGA 6: cria DSX e grava a posição 1",
                      "F2 → gerenciador → DESENHO; 6: pasta dos .DSP = C:\\ (V2P.DSP fornecido na raiz); 5: P = V2P",
                      "1: DSX registro 1, seção 20,40,80,10, apoios retangulares, apoios de 20 cm, vãos livres; imprime esforços e armação; "
                      "diagramas VIDEO; 'Altero a armadura' S; desenho definitivo 1/50 na impressora, sem edição e sem CAD; cabeçalhos "
                      "OBRA DSX / VIGA D1 / SISTRUT, notas NOTA UM / NOTA DOIS",
                      "aviso 'Momento Aplicado acima de 40% do Momento Limite da Armadura simples' → Continuo S; Altero a Armacao N; "
                      "janelas de fissuração (apoios, tramos) → Modifico N; Continuo S",
                      "DESENHO 4: resumo geral de consumo da obra DSX (impresso)"]},
    "extratores": ["desenho"],
    "telas": [
        *[{"id": f"D1.a{a}.fissura", "tela": "h02_fissura_apoios", "re": rf"[^\d\s.]\s+{a}\s+(\S+#\S+)\s+(\d*\.\d+)", "ocorrencia": 0,
           "grupo": 2, "unidade": "", "grandeza": f"D1 apoio {a}: valor da coluna 'Fissura(1)' (verificação de fissuração, limite 1)"}
          for a in (0, 1, 2)],
        *[{"id": f"D1.t{t}.fissura", "tela": "h03_fissura_tramos", "re": rf"[^\d\s.]\s+{t}\s+(\S+#\S+)\s+(\d*\.\d+)", "ocorrencia": 0,
           "grupo": 2, "unidade": "", "grandeza": f"D1 tramo {t}: valor da coluna 'Fissura(1)'"} for t in (1, 2)],
    ],
}
CASOS["v2par_viga_fluxo"]["manuais"] = proc("telas/041_p04_desenho.png", "telas/044_p05n_desenho.png",
                                            {"L1": ("#6.3c/20", "#6.3c/20"), "L2": ("#6.3c/20", "#6.3c/20")}, {"L1-L2": "#6.3c/10"})

CASOS["v2par_des_especial"]["comparacao_v1"] = (
    "DIFERENTE só no arquivo DSX.SEC (32 de 35 iguais): bytes 21, 25, 93 e 97 = Bf e Hf dos dois balanços (seções retangulares), "
    "gravados como −0,0 (00 00 00 80) no original e +0,0 na V1 nova. Impressora 60.657 bytes e DSX.VIG/.FOR/.TAB iguais; as outras "
    "diferenças são o FRE do VIGA e a tela d09_secoes (cabeçalho cortado pela janela, artefato da troca de marca)")

CASOS["v2par_viga_r6"] = {
    "programa": "VIGA opção 8 (parâmetros) e opção 3 (processar uma viga)",
    "descricao": "R6 do PLANO (VIGA.BAS ≈5434, U62-025): o percentual de carga acidental gerada é validado com 'VAL > 96 AND VAL < 4' "
                 "(AND no lugar de OR), então a tela aceita qualquer valor. Com 150 % a acidental gerada (3,0 t/m) passa a carga total "
                 "(2,0 t/m): a envoltória usa permanente −1 t/m e dá reações mínimas negativas. A outra metade do R6 (redução dos "
                 "negativos lida do VIGA.INI sem piso) só se provoca editando o VIGA.INI da instalação; não tem caso.",
    "entrada": {"parametros": {"VIGA_INI": "de fábrica, alterado na opção 8: item 2 = acidentais S, Geradas, 150 %",
                               "reducaoNegativos": "100 %", "reacoes": "estáticas", "unidades": "t, m"},
                "viga": {"obra": "R6", "nome": "VR6", "tramos": [{"L_m": 4, "P_tm": 2}, {"L_m": 5, "P_tm": 2}],
                         "balancos": "nenhum", "engastes": "nenhum", "inercia": "constante"},
                "saida": "opção 3: imprime os resultados, sem diagramas, sem parar, sem esquema"},
    "extratores": ["viga"],
}
CASOS["v2par_viga_r6"]["comparacao_v1"] = "igual (7 de 7; impressora 2.062 bytes)"

"""Extrai os valores impressos de um run v2par (oraculo ou V1 nova) para o JSON de caso da paridade V2.

Uso: python extrai_v2par.py <caso> <pasta do run> <saida.json>
O formato e os ids seguem C:/wt/v1-par2/paridade/README.md e original/extrair.ts:
  lajes  L1.M+princ, L1.As-maior, L1>V4.area; vigas V1.t1.M+, V1.a0.R, V1.MEP0; .REP REP.P5, REP.P5.carga.V2;
  pilar avulso P.lambdaX, c1.Mx (aqui com o prefixo e<k>. do conjunto de esforcos); PILAREDI P5.1f.MRx2a, P5.As
  (aqui com o nivel: P5.FUND.1f.MRx2a).
Fonte "impressora.prn:<linha>" = linha do arquivo bruto quebrado em \\n (igual ao linhasPrn do extrair.ts).
Os valores lidos de telas graficas (desenho do LAJEPROC) e do .LAJ vem de ENTRADAS[caso]["manuais"].
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from casos_v2par import CASOS  # noqa: E402

N = r"(-?\d*\.?\d+)"
S = r"\s+"


class Coleta:
    def __init__(self, linhas):
        self.linhas = linhas
        self.valores = []
        self.ids = set()

    def add(self, id_, impresso, i, grandeza, unidade, fonte=None, **extra):
        if id_ in self.ids:
            raise SystemExit(f"id repetido: {id_}")
        self.ids.add(id_)
        v = {"id": id_, "grandeza": grandeza, "unidade": unidade, "impresso": impresso,
             "fonte": fonte or f"impressora.prn:{i + 1}"}
        v.update({k: x for k, x in extra.items() if x not in (None, False, "")})
        self.valores.append(v)

    def todas(self, re_, desde=0, ate=None):
        ate = len(self.linhas) if ate is None else ate
        return [i for i in range(desde, ate) if re.search(re_, self.linhas[i])]


def linhas_prn(caminho):
    b = open(caminho, "rb").read().decode("latin-1")
    return [re.sub(r"[\x00-\x1f\x7f]", "", l) for l in b.split("\n")]


# ------------------------------------------------------------------ LAJECALC + LAJEGEOM 7
RE_ESP = re.compile(rf"^\s*(L\d+){S}{N}{S}{N}{S}{N}{S}#\s*{N}\s*c/\s*{N}{S}{N}{S}{N}{S}{N}{S}{N}")
RE_4COL = re.compile(rf"^\s*(L\d+){S}{N}{S}{N}{S}{N}{S}{N}{S}{N}\s*$")


def tabela(c, i0, re_):
    fim = next(i for i in range(i0 + 1, len(c.linhas)) if re.search(r"Fck|Total das Cargas", c.linhas[i]))
    return [(m, i) for i in range(i0 + 1, fim) if (m := re_.match(c.linhas[i]))]


def laje(c):
    for i0 in c.todas(r"CALCULO DAS ESPESSURAS MINIMAS"):
        for m, i in tabela(c, i0, RE_ESP):
            L = m[1]
            c.add(f"{L}.Hmin", m[2], i, f"{L} espessura mínima", "cm")
            c.add(f"{L}.Hmin.x/d", m[3], i, f"{L} x/d com H mínimo", "")
            c.add(f"{L}.Hmin.As.phi", m[5], i, f"{L} bitola da armadura com H mínimo", "mm")
            c.add(f"{L}.Hmin.As.s", m[6], i, f"{L} espaçamento da armadura com H mínimo", "cm")
            c.add(f"{L}.Hmin.perm", m[7], i, f"{L} carga permanente (coluna Perm.)", "t/m2")
            c.add(f"{L}.Hmin.acid", m[8], i, f"{L} coluna Acid. (ocupação total + alvenaria/área)", "t/m2")
            c.add(f"{L}.Hmin.pp", m[9], i, f"{L} peso próprio com H mínimo", "t/m2")
            c.add(f"{L}.Hmin.p", m[10], i, f"{L} carga total com H mínimo", "t/m2")
    for i0 in c.todas(r"IMPOSICAO DAS ESPESSURAS"):
        for m, i in tabela(c, i0, RE_ESP):
            L = m[1]
            c.add(f"{L}.H", m[2], i, f"{L} espessura imposta", "cm")
            c.add(f"{L}.x/d", m[3], i, f"{L} x/d com H imposto", "")
            c.add(f"{L}.As.phi", m[5], i, f"{L} bitola da armadura (tabela de espessuras)", "mm")
            c.add(f"{L}.As.s", m[6], i, f"{L} espaçamento da armadura (tabela de espessuras)", "cm")
            c.add(f"{L}.perm", m[7], i, f"{L} carga permanente", "t/m2")
            c.add(f"{L}.acid", m[8], i, f"{L} coluna Acid. (ocupação total + alvenaria/área)", "t/m2")
            c.add(f"{L}.pp", m[9], i, f"{L} peso próprio", "t/m2")
            c.add(f"{L}.p", m[10], i, f"{L} carga total p", "t/m2")
    for cab, cols, u in ((r"MOMENTOS ATUANTES NAS LAJES", ("M+princ", "M+sec", "M-maior", "M-menor"), "tm/m"),
                         (r"ARMADURAS NAS LAJES", ("As+princ", "As+sec", "As-maior", "As-menor"), "cm2/m")):
        imps = c.todas(cab)
        for k, i0 in enumerate(imps):
            ultima = k == len(imps) - 1
            suf = "" if ultima else ".antesOtim"
            obs = "última impressão" + (", depois da otimização dos negativos" if len(imps) > 1 else "") if ultima \
                else "primeira impressão, antes da otimização dos negativos"
            if len(imps) > 2 and not ultima:
                raise SystemExit("mais de 2 impressões de momentos")
            for m, i in tabela(c, i0, RE_4COL):
                L = m[1]
                for j, nome in enumerate(cols):
                    c.add(f"{L}.{nome}{suf}", m[3 + j], i, f"{L} {nome}", u, obs=obs)
    # alvenarias e peso proprio por tramo de viga (LAJEMONT)
    i0s = c.todas(r"ALVENARIAS SOBRE AS VIGAS")
    if i0s:
        i0 = i0s[-1]
        fim = c.todas(r"ALVENARIAS SOBRE OS PILARES", i0)[0]
        V = ""
        for i in range(i0 + 1, fim):
            m = re.match(rf"^\s*(V\d+)?{S}(\d+)\(\s*(\d+)a\){S}{N}{S}{N}\s*$", c.linhas[i])
            if not m:
                continue
            V = m[1] or V
            t = m[2]
            c.add(f"{V}.t{t}.ppViga", m[4], i, f"{V} tramo {t}: peso próprio da viga (LAJEMONT)", "t/m")
            c.add(f"{V}.t{t}.alv", m[5], i, f"{V} tramo {t}: alvenaria sobre a viga", "t/m")
    i0s = c.todas(r"REACOES DE LAJES NAS VIGAS")
    if i0s:
        i0 = i0s[-1]
        fim = c.todas(r"Total das Cargas", i0)[0]
        re_sub = re.compile(rf"^\s*(L\d+)?{S}(\d+){S}{N} m2{S}{N}{S}{N}{S}{N}{S}{N}{S}(\S+)\s*$")
        linhas, laje_ = [], ""
        for i in range(i0, fim):
            m = re_sub.match(c.linhas[i])
            if m:
                laje_ = m[1] or laje_
                linhas.append((laje_, m, i))
        chaves = [f"{l}>{m[8]}" for l, m, _ in linhas]
        for (l, m, i), k in zip(linhas, chaves):
            if chaves.count(k) > 1:
                k = f"{k}.s{m[2]}"
            ap = m[8]
            g = f"{l} → {ap} (sub-área {m[2]} = lado {m[2]} da laje)"
            c.add(f"{k}.area", m[3], i, f"{g}: área de influência", "m2")
            c.add(f"{k}.qLinear", m[4], i, f"{g}: carga linear de alvenaria", "t/m")
            c.add(f"{k}.qArea", m[5], i, f"{g}: carga linear de ocupação (total)", "t/m")
            c.add(f"{k}.qEstru", m[6], i, f"{g}: carga linear de estrutura (permanente)", "t/m")
            c.add(f"{k}.qPeso", m[7], i, f"{g}: carga linear de peso próprio", "t/m")
        totais = [
            ("total.cargasLineares", r"Total das Cargas Lineares \.+", "total das cargas lineares (alvenarias)"),
            ("total.cargasLinearesConsiderado", r"Total Considerado das Cargas Lineares \.+", "total considerado das cargas lineares"),
            ("total.cargasArea", r"Total das Cargas por Area \.+", "total das cargas por área"),
            ("total.cargasAreaConsiderado", r"Total Considerado das Cargas por Area \.+", "total considerado das cargas por área"),
            ("total.ppVigas", r"Total do Peso Proprio das Vigas \.+", "peso próprio das vigas"),
            ("total.ppLajes", r"Total do Peso Proprio das Lajes \.+", "peso próprio das lajes"),
            ("total.estrutura", r"Total das Cargas de Estrutura \.+", "cargas de estrutura"),
            ("total.painel", r"Total das Cargas no Painel \.+", "total das cargas no painel"),
            ("total.vigas", r"Total das Cargas aplicadas nas Vigas \.+", "cargas aplicadas nas vigas"),
            ("total.pilares", r"Total das Cargas aplicadas nos Pilares \.+", "cargas aplicadas nos pilares"),
            ("total.vigasPilares", r"Total das Cargas aplicadas nas Vigas\+Pilares \.+", "cargas aplicadas nas vigas + pilares"),
        ]
        for id_, re_, g in totais:
            for i in c.todas(re_, i0):
                m = re.search(rf"{N}\s*t\s*$", c.linhas[i])
                c.add(id_, m[1], i, g, "t")
                break


# ------------------------------------------------------------------ VIGA (opcao 2/7) e DESDIM (esforcos)
def blocos_viga(c, ate):
    """Inicio de cada VIGA-Vn antes de `ate`; fica a ultima impressao de cada viga."""
    ini = [i for i in range(ate) if re.match(r"^\s*VIGA-(\S+)", c.linhas[i])]
    ult = {}
    for k, i in enumerate(ini):
        V = re.match(r"^\s*VIGA-(\S+)", c.linhas[i])[1]
        fim = ini[k + 1] if k + 1 < len(ini) else ate
        ult[V] = (i, fim)
    return ult


def viga_esforcos(c, V, i0, fim, pre=""):
    secao, tramo, eep = "", 0, False
    for i in range(i0 + 1, fim):
        l = c.linhas[i]
        if re.search(r"TRAMO\s+L\(m\)", l):
            secao = "dados"
            continue
        if re.search(r"APOIO\s+M-", l):
            secao = "apoios"
            continue
        if re.search(r"TRAMO\s+Ve\(t\)", l):
            secao = "tramos"
            continue
        if re.search(r"Esforcos de Engastamento Perfeito", l):
            eep = True
            continue
        if re.search(r"^\s*\.{20,}", l) and secao == "tramos" and eep:
            secao = ""
            continue
        if re.search(r"APOIO\s+Bw|TRAMO\s+Bw", l):
            break
        m = re.search(r"soma das reacoes estaticas\s+(\S+)\s*t", l)
        if m:
            c.add(f"{pre}{V}.somaR", m[1], i, f"{V} soma das reações estáticas", "t")
            continue
        m = re.search(r"Momento Engastamento Perfeito apoio\((\d+)\)\s+(\S+)\s*tm", l)
        if m:
            c.add(f"{pre}{V}.MEP{m[1]}", m[2], i, f"{V} momento de engastamento perfeito no apoio {m[1]}", "tm")
            continue
        if secao == "dados":
            m = re.match(rf"^\s*(b\s+)?(\d+){S}{N}{S}{N}\s*$", l)
            if m:
                tramo, div = int(m[2]), 0
                bal = " (balanço)" if m[1] else ""
                c.add(f"{pre}{V}.t{tramo}.L", m[3], i, f"{V} tramo {tramo}{bal}: comprimento", "m")
                c.add(f"{pre}{V}.t{tramo}.J", m[4], i, f"{V} tramo {tramo}{bal}: inércia relativa J", "")
                continue
            m = re.match(rf"^{S}{N}{S}{N}{S}{N}\s*$", l)
            if m:
                div += 1
                k = f"{pre}{V}.t{tramo}" + (f".d{div}" if div > 1 else "")
                g = f"{V} tramo {tramo}" + (f", divisão {div}" if div > 1 else "")
                c.add(f"{k}.P", m[1], i, f"{g}: carga distribuída P", "t/m")
                c.add(f"{k}.D", m[2], i, f"{g}: posição D da divisão / da carga F", "m")
                c.add(f"{k}.F", m[3], i, f"{g}: carga concentrada F em D (reação indexada quando há viga apoiada)", "t")
                continue
            m = re.match(rf"^\s*ac{S}{N}{S}{N}\s*$", l)
            if m:
                k = f"{pre}{V}.t{tramo}" + (f".d{div}" if div > 1 else "")
                g = f"{V} tramo {tramo}" + (f", divisão {div}" if div > 1 else "")
                c.add(f"{k}.Pac", m[1], i, f"{g}: parcela acidental da carga distribuída", "t/m")
                c.add(f"{k}.Fac", m[2], i, f"{g}: parcela acidental da carga concentrada", "t")
                continue
        if secao == "apoios":
            m = re.match(rf"^\s*(\d+){S}{N}{S}{N}(?:\s+P\s*(\d+))?\s*$", l)
            if m:
                ap = m[1]
                obs = f"apoio no pilar P{m[4]}" if m[4] else None
                c.add(f"{pre}{V}.a{ap}.M-", m[2], i, f"{V} apoio {ap} M−", "tm", obs=obs)
                c.add(f"{pre}{V}.a{ap}.R", m[3], i, f"{V} apoio {ap} reação", "t", obs=obs)
                continue
            m = re.match(rf"^\s*max{S}{N}{S}{N}{S}{N}\s*$", l)
            if m:
                g = f"{V} apoio {ap} (envoltória de acidentais)"
                c.add(f"{pre}{V}.a{ap}.max.M-", m[1], i, f"{g}: M− máximo", "tm")
                c.add(f"{pre}{V}.a{ap}.max.R", m[2], i, f"{g}: reação máxima", "t")
                c.add(f"{pre}{V}.a{ap}.min.R", m[3], i, f"{g}: reação mínima", "t")
                continue
        if secao == "tramos":
            m = re.match(rf"^\s*(\d+){S}{N}{S}{N}{S}{N}{S}{N}(?:{S}{N})?\s*$", l)
            if m:
                t = m[1]
                k = f"{pre}{V}.t{t}" + (".EEP" if eep else "")
                g = f"{V} tramo {t}" + (" (esforços de engastamento perfeito)" if eep else "")
                c.add(f"{k}.Ve", m[2], i, f"{g}: cortante à esquerda", "t")
                c.add(f"{k}.x", m[3], i, f"{g}: posição do M+", "m")
                c.add(f"{k}.M+", m[4], i, f"{g}: M+", "tm")
                c.add(f"{k}.Vd", m[5], i, f"{g}: cortante à direita", "t")
                if m[6]:
                    c.add(f"{k}.fEJ", m[6], i, f"{g}: flecha × EJ", "")
                continue
            m = re.match(rf"^\s*max{S}{N}{S}{N}{S}{N}{S}{N}(?:{S}{N})?\s*$", l)
            if m:
                g = f"{V} tramo {t} (envoltória de acidentais, máximos)"
                c.add(f"{pre}{V}.t{t}.max.Ve", m[1], i, f"{g}: cortante à esquerda", "t")
                c.add(f"{pre}{V}.t{t}.max.x", m[2], i, f"{g}: posição do M+", "m")
                c.add(f"{pre}{V}.t{t}.max.M+", m[3], i, f"{g}: M+", "tm")
                c.add(f"{pre}{V}.t{t}.max.Vd", m[4], i, f"{g}: cortante à direita", "t")
                if m[5]:
                    c.add(f"{pre}{V}.t{t}.max.fEJ", m[5], i, f"{g}: flecha × EJ", "")
                continue
            m = re.match(rf"^\s*(\d+){S}{N}\s*$", l)
            if m and l.index(m[2]) > 40:
                c.add(f"{pre}{V}.t{m[1]}.Vd", m[2], i, f"{V} tramo {m[1]} (balanço à esquerda): cortante à direita", "t")
                continue
            if m:
                c.add(f"{pre}{V}.t{m[1]}.Ve", m[2], i, f"{V} tramo {m[1]} (balanço): cortante à esquerda", "t")


def viga(c):
    rep = c.todas(r"Reacoes de Apoio")
    ate = rep[-1] if rep else len(c.linhas)
    for V, (i0, fim) in blocos_viga(c, ate).items():
        viga_esforcos(c, V, i0, fim)
    if not rep:
        return
    pilar = ""
    for i in range(rep[-1], len(c.linhas)):
        l = c.linhas[i]
        for m in re.finditer(r"P\s*(\d+)\s+-\s+(-?\d*\.?\d+)", l):
            c.add(f"REP.P{m[1]}", m[2], i, f"P{m[1]} carga total no .REP", "t",
                  obs="soma das parcelas, cada uma truncada na 2ª casa")
        m = re.match(r"^\s*P\s*(\d+)\s+carga\s+(.*)$", l)
        if m:
            pilar = f"P{m[1]}"
            for p in re.finditer(r"(-?\d*\.?\d+)\s+\((V\d+)\)", m[2]):
                c.add(f"REP.{pilar}.carga.{p[2]}", p[1], i, f"{pilar} parcela da carga vinda de {p[2]}", "t", casas=2, trunca=True)
        m = re.match(r"^\s*momento\s*(.*)$", l)
        if m and pilar:
            for p in re.finditer(r"(-?\d*\.?\d+)@(\d+)\s+\[(\d+)\]\s+\((V\d+)\)", m[1]):
                c.add(f"REP.{pilar}.momento.{p[4]}", p[1], i, f"{pilar} momento vindo de {p[4]}", "tm", casas=2, trunca=True,
                      obs=f'impresso "{p[1]}@{p[2]} [{p[3]}]"')


# ------------------------------------------------------------------ PILAR opcao 6 (varios conjuntos)
def pilar(c):
    inis = c.todas(r"Verificacao de Pilares segundo a Norma")
    for k, i0 in enumerate(inis):
        e = f"e{k + 1}."
        fim = inis[k + 1] if k + 1 < len(inis) else len(c.linhas)
        caso, resistente = "", False
        for i in range(i0, fim):
            l = c.linhas[i]
            for eixo in ("x", "y"):
                m = re.search(rf"J{eixo} = (\S+) cm4", l)
                if m:
                    c.add(f"{e}P.J{eixo}", m[1], i, f"conjunto {k + 1}: momento de inércia J{eixo}", "cm4")
            m = re.search(r"Lambda x = (\S+)\s+Lambda y = (\S+)", l)
            if m:
                c.add(f"{e}P.lambdaX", m[1], i, f"conjunto {k + 1}: esbeltez λx", "")
                c.add(f"{e}P.lambdaY", m[2], i, f"conjunto {k + 1}: esbeltez λy", "")
                continue
            m = re.search(r"Situacao - (.+?)\s+caso (\d+)/\d+", l)
            if m:
                caso, resistente = f"{e}c{m[2]}", False
                c.add(f"{caso}.situacao", m[1], i, f"conjunto {k + 1}, caso {m[2]}: situação", "")
                continue
            if not caso:
                continue
            g = f"conjunto {k + 1}, caso {caso.split('c')[-1]}"
            if re.search(r"Esforcos resistentes", l):
                resistente = True
            elif not resistente and (m := re.match(r"^\s*M([xy]) = .*=\s*(\S+) \(tm\)", l)):
                c.add(f"{caso}.M{m[1]}", m[2], i, f"{g}: momento solicitante M{m[1]} (inicial + acidental)", "tm")
            elif not resistente and (m := re.search(r"Mtotal=\s*(\S+) tm\s+incl (\S+) graus", l)):
                c.add(f"{caso}.Mtotal", m[1], i, f"{g}: momento solicitante total", "tm")
                c.add(f"{caso}.incl", m[2], i, f"{g}: inclinação do momento", "graus")
            elif resistente and (m := re.match(r"^\s*M([xy])=\s*(\S+)\(1a\)(?:-\s*(\S+)\(2a\))?=\s*(\S+) tm", l)):
                gg = f"{g}: momento resistente M{m[1]}"
                c.add(f"{caso}.MR{m[1]}1a", m[2], i, f"{gg} de 1ª ordem", "tm")
                if m[3]:
                    c.add(f"{caso}.MR{m[1]}2a", m[3], i, f"{gg}, parcela de 2ª ordem", "tm")
                c.add(f"{caso}.MR{m[1]}", m[4], i, gg, "tm")
            elif resistente and (m := re.search(r"Mtotal=\s*(\S+?)\s*tm", l)):
                c.add(f"{caso}.MRtotal", m[1], i, f"{g}: momento resistente total", "tm")
            elif (m := re.search(r"ln= (\S+) graus\s+Xln= (\S+) cm\s+1/r= (\S+)", l)):
                c.add(f"{caso}.ln", m[1], i, f"{g}: inclinação da linha neutra", "graus")
                c.add(f"{caso}.Xln", m[2], i, f"{g}: profundidade da linha neutra", "cm")
                c.add(f"{caso}.1/r", m[3], i, f"{g}: curvatura 1/r", "10-3/cm")
            elif (m := re.search(r"Def con\s+(\S+) /oo\s+Def aco\s+(\S+) /oo", l)):
                c.add(f"{caso}.defCon", m[1], i, f"{g}: deformação do concreto", "‰")
                c.add(f"{caso}.defAco", m[2], i, f"{g}: deformação do aço", "‰")
            elif re.search(r"SITUACAO DE INSTABILIDADE", l):
                c.add(f"{caso}.veredito", "SITUACAO DE INSTABILIDADE", i, f"{g}: veredito", "")
            elif (m := re.search(r"M\(1a\)\s+(\S+)\s+-\s+M\(2a\)\s+(\S+)\s+<\s+M\(Atuante\)\s+(\S+)", l)):
                c.add(f"{caso}.MR1a", m[1], i, f"{g}: momento resistente de 1ª ordem (instabilidade)", "tm")
                c.add(f"{caso}.MR2a", m[2], i, f"{g}: parcela de 2ª ordem (instabilidade)", "tm")
                c.add(f"{caso}.Matuante", m[3], i, f"{g}: momento atuante na comparação", "tm")
            elif (m := re.match(r"^\s*(ok|nao ok|não ok|insuficiente.*)\s*$", l, re.I)):
                c.add(f"{caso}.veredito", m[1], i, f"{g}: veredito", "")


# ------------------------------------------------------------------ PILAREDI (varios niveis)
COLS = [("Mkx", "Mk atuante x", "tm"), ("Mky", "Mk atuante y", "tm"), ("Mktot", "Mk atuante total", "tm"),
        ("MRx1a", "Mk resistente x, 1ª ordem", "tm"), ("MRx2a", "Mk resistente x, 2ª ordem", "tm"),
        ("MRy1a", "Mk resistente y, 1ª ordem", "tm"), ("MRy2a", "Mk resistente y, 2ª ordem", "tm"),
        ("MRtot", "Mk resistente total", "tm"), ("incLN", "inclinação da linha neutra", "graus"),
        ("1/r", "curvatura 1/r", "10-3/cm"), ("x/d", "x/d", ""), ("defCon", "deformação do concreto", "‰"),
        ("defAco", "deformação do aço", "‰")]


def pilaredi(c):
    inis = c.todas(r"Nivel Dimensionado")
    re_caso = re.compile(r"^\s*(\d?)([ef])" + f"{S}{N}" * 13 + r"\s*$")
    for k, i0 in enumerate(inis):
        fim = inis[k + 1] if k + 1 < len(inis) else len(c.linhas)
        col = next(c.linhas[j] for j in range(i0, -1, -1) if "COLUNA - " in c.linhas[j])
        P = "P" + re.search(r"COLUNA - P\s*(\d+)", col)[1]
        niv = re.search(r"Nivel Dimensionado\s+(\S+)", c.linhas[i0])[1]
        p = f"{P}.{niv}"
        m = re.search(r"Lbx=\s*(\S+)\s+Lby=\s*(\S+)", c.linhas[i0])
        c.add(f"{p}.lambdaX", m[1], i0, f"{P} nível {niv}: esbeltez λx", "")
        c.add(f"{p}.lambdaY", m[2], i0, f"{P} nível {niv}: esbeltez λy", "")
        num = ""
        for i in range(i0 + 1, fim):
            l = c.linhas[i]
            if (m := re.search(r"Nk =\s*(\S+) t\s+Mkx i =\s*(\S+) tm\s+Mky i =\s*(\S+) tm", l)):
                c.add(f"{p}.Nk", m[1], i, f"{P} nível {niv}: Nk (cargas do .REP acumuladas + peso próprio)", "t")
                c.add(f"{p}.Mkxi", m[2], i, f"{P} nível {niv}: Mkx inicial", "tm")
                c.add(f"{p}.Mkyi", m[3], i, f"{P} nível {niv}: Mky inicial", "tm")
            elif (m := re.search(r"Cobrimento\s+(\S+) cm", l)):
                c.add(f"{p}.cobrimento", m[1], i, f"{P} nível {niv}: cobrimento", "cm")
            elif (m := re_caso.match(l)):
                num = m[1] or num
                caso = f"{num}{m[2]}"
                for j, (id_, g, u) in enumerate(COLS):
                    c.add(f"{p}.{caso}.{id_}", m[3 + j], i, f"{P} nível {niv}, caso {caso}: {g}", u)
            elif (m := re.search(r"Bw =\s*(\S+)\s+Hw =\s*(\S+)", l)):
                c.add(f"{p}.Bw", m[1], i, f"{P} nível {niv}: largura da seção", "cm")
                c.add(f"{p}.Hw", m[2], i, f"{P} nível {niv}: altura da seção", "cm")
            elif (m := re.search(r"As\s+(\S+) cm2\s+Taxa\s+(\S+)%\s+(\d+)\s+#\s*(\S+)\s+#\s*(\S+)\s+c/\s*(\S+)", l)):
                c.add(f"{p}.As", m[1], i, f"{P} nível {niv}: armadura As", "cm2")
                c.add(f"{p}.taxa", m[2], i, f"{P} nível {niv}: taxa de armadura", "%")
                c.add(f"{p}.barras.n", m[3], i, f"{P} nível {niv}: número de barras", "")
                c.add(f"{p}.barras.phi", m[4], i, f"{P} nível {niv}: bitola das barras", "mm")
                c.add(f"{p}.estribo.phi", m[5], i, f"{P} nível {niv}: bitola do estribo", "mm")
                c.add(f"{p}.estribo.s", m[6], i, f"{P} nível {niv}: espaçamento do estribo", "cm")


# ------------------------------------------------------------------ DESDIM (detalhamento) e resumo do DESENHO
BITOLAS = ["4", "5", "6.3", "8", "10", "12.5", "16", "20", "25", "32"]


def desenho(c):
    ini = [i for i in range(len(c.linhas)) if re.match(r"^\s*VIGA-(\S+)", c.linhas[i])]
    i0 = ini[0]
    V = re.match(r"^\s*VIGA-(\S+)", c.linhas[i0])[1]
    iarm = c.todas(r"APOIO\s+Bw\s+Hw", i0)[0]
    viga_esforcos(c, V, i0, iarm)
    # fonte = a linha onde "Cobrimento" foi impresso (duas acima do cabecalho APOIO), nao iarm - 1
    icob = [i for i in range(iarm - 3, iarm) if re.search(r"Cobrimento\s+\S+\s+cm", c.linhas[i])]
    if icob:
        m = re.search(r"Cobrimento\s+(\S+)\s+cm", c.linhas[icob[-1]])
        c.add(f"{V}.cobrimento", m[1], icob[-1], f"{V} cobrimento (DESDIM)", "cm")
    itr = c.todas(r"TRAMO\s+Bw\s+Hw\s+Bf", iarm)[0]
    for i in range(iarm + 1, itr):
        l = c.linhas[i]
        if (m := re.match(rf"^\s*(\d+){S}(\d+){S}(\d+){S}{N}{S}{N}{S}{N}{S}{N}\s*$", l)):
            a = m[1]
            g = f"{V} apoio {a}"
            c.add(f"{V}.a{a}.x/d", m[4], i, f"{g}: x/d", "")
            c.add(f"{V}.a{a}.Mk", m[5], i, f"{g}: Mk", "tm")
            c.add(f"{V}.a{a}.Ast", m[6], i, f"{g}: armadura tracionada", "cm2")
            c.add(f"{V}.a{a}.Asc", m[7], i, f"{g}: armadura comprimida", "cm2")
            nb = c.linhas[i + 1].split()
            c.add(f"{V}.a{a}.barras", nb[0], i + 1, f"{g}: barras da armadura tracionada", "")
    fim = c.todas(r"OBRA\s+\S+\s*$|^\s*$", itr + 3)
    for i in range(itr + 1, len(c.linhas)):
        l = c.linhas[i]
        if (m := re.match(rf"^\s*(\d+){S}(\d+){S}(\d+){S}(\d+){S}(\d+){S}{N}{S}{N}{S}{N}{S}{N}{S}{N}{S}{N}{S}{N}{S}{N}\s*$", l)):
            t = m[1]
            g = f"{V} tramo {t}"
            for k_, (id_, gg, u) in enumerate([("x/d", "x/d", ""), ("Mk", "Mk", "tm"), ("Ast", "armadura tracionada", "cm2"),
                                                ("Asc", "armadura comprimida", "cm2"), ("Vke", "cortante à esquerda", "t"),
                                                ("Aee", "estribos à esquerda", "cm2/m"), ("Vkd", "cortante à direita", "t"),
                                                ("Aed", "estribos à direita", "cm2/m")]):
                c.add(f"{V}.t{t}.{id_}", m[6 + k_], i, f"{g}: {gg}", u)
            seg = c.linhas[i + 1].split()
            c.add(f"{V}.t{t}.flecha", seg[0], i + 1, f"{g}: flecha", "cm")
            c.add(f"{V}.t{t}.barras", seg[1], i + 1, f"{g}: barras da armadura tracionada", "")
            c.add(f"{V}.t{t}.estriboE", seg[3], i + 1, f"{g}: estribo à esquerda", "")
            c.add(f"{V}.t{t}.estriboD", seg[4], i + 1, f"{g}: estribo à direita", "")
        if (m := re.match(rf"^\s*(\d+){S}(\d+){S}(\d+){S}{N}{S}{N}\s*$", l)):
            t = m[1]
            lado = ("Vkd", "Aed", "estriboD", "direita") if l.index(m[4], 20) > 60 else ("Vke", "Aee", "estriboE", "esquerda")
            g = f"{V} tramo {t} (balanço)"
            c.add(f"{V}.t{t}.{lado[0]}", m[4], i, f"{g}: cortante à {lado[3]}", "t")
            c.add(f"{V}.t{t}.{lado[1]}", m[5], i, f"{g}: estribos à {lado[3]}", "cm2/m")
            c.add(f"{V}.t{t}.{lado[2]}", c.linhas[i + 1].split()[0], i + 1, f"{g}: estribo à {lado[3]}", "")
        if re.search(r"OBRA\s+\S+\s*$", l) and i > itr + 2:
            break
    # resumo geral de consumo (item 4)
    ir = c.todas(r"Viga\s+rept\s+4\s+5")
    if ir:
        ir = ir[-1]
        for i in range(ir, len(c.linhas)):
            l = c.linhas[i]
            m = re.match(r"^\s*\d+\)(\S+)\s+(\d+)\s+(.*)$", l)
            if m:
                nums = m[3].split()
                c.add(f"resumo.{m[1]}.rept", m[2], i, f"resumo: repetições da {m[1]}", "")
                for b, x in zip(BITOLAS, nums[:10]):
                    c.add(f"resumo.{m[1]}.comp.{b}", x, i, f"resumo: comprimento das barras de {b} mm da {m[1]}", "m")
                c.add(f"resumo.{m[1]}.Vconc", nums[10], i, f"resumo: volume de concreto da {m[1]}", "m3")
                c.add(f"resumo.{m[1]}.Afor", nums[11], i, f"resumo: área de fôrma da {m[1]}", "m2")
            m = re.match(r"^\s*TOTAIS\s+(.*)$", l)
            if m:
                nums = m[1].split()
                for b, x in zip(BITOLAS, nums[:10]):
                    c.add(f"resumo.total.comp.{b}", x, i, f"resumo: comprimento total de {b} mm", "m")
                c.add("resumo.total.Vconc", nums[10], i, "resumo: volume total de concreto", "m3")
                c.add("resumo.total.Afor", nums[11], i, "resumo: área total de fôrma", "m2")
            m = re.match(r"^\s*PESOS TOTAIS\s+(.*)$", l)
            if m:
                for b, x in zip(BITOLAS, m[1].split()):
                    c.add(f"resumo.peso.{b}", x, i, f"resumo: peso total de {b} mm", "kg")
                break


PROG = {"laje": laje, "viga": viga, "pilar": pilar, "pilaredi": pilaredi, "desenho": desenho}


def telas(c, run, specs):
    pasta = os.path.join(run, "telas")
    arqs = sorted(os.listdir(pasta))
    for t in specs:
        nome = next(a for a in arqs if a.endswith(f"_{t['tela']}.txt"))
        linhas = open(os.path.join(pasta, nome), encoding="utf-8", errors="replace").read().split(chr(10))
        achados = [(i, m) for i, l in enumerate(linhas) for m in [re.search(t["re"], l)] if m]
        i, m = achados[t.get("ocorrencia", 0)]
        c.add(t["id"], m[t.get("grupo", 1)], i, t["grandeza"], t["unidade"], fonte=f"telas/{nome}:{i + 1}")


def obra_laj(c, run, d):
    from lajinfo import ler
    arq = f"{d['laj']}.LAJ"
    o = ler(os.path.join(run, "obra", arq))
    d["entrada"]["obra"]["obra_gravada_pelo_original"] = o
    for L, lj in o["lajes"].items():
        c.add(f"{L}.mu", str(lj["mu"]), 0, f"{L} μ (relação M+ secundário/principal) gravado pelo LAJECALC 2", "",
              fonte=f"obra/{arq}", obs="não é impresso; valor do .LAJ")
        for ld in lj["lados"]:
            if ld["codigo"] > 2:
                c.add(f"{L}.lado{ld['lado']}.codigo", str(ld["codigo"]), 0,
                      f"{L} código final do lado {ld['lado']} ({ld['de']} → {ld['para']}); i = (código − 2)/10", "",
                      fonte=f"obra/{arq}", obs="não é impresso; valor do .LAJ (depois da otimização, se houve)")


def main():
    caso, run, saida = sys.argv[1:4]
    d = CASOS[caso]
    c = Coleta(linhas_prn(os.path.join(run, "impressora.prn")))
    for p in d["extratores"]:
        PROG[p](c)
    if d.get("laj"):
        obra_laj(c, run, d)
    for v in d.get("manuais", []):
        c.add(v["id"], v["impresso"], 0, v["grandeza"], v["unidade"], fonte=v["fonte"], obs=v.get("obs"))
    telas(c, run, d.get("telas", []))
    out = {"caso": caso, "run": run.replace("\\", "/").replace("/c/tmp/", "C:/tmp/").rstrip("/"), "programa": d["programa"],
           "descricao": d["descricao"], "entrada": d["entrada"], "valores": c.valores}
    if d.get("comparacao_v1"):
        out["comparacao_v1"] = d["comparacao_v1"]
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(chr(10))
    print(f"{caso}: {len(c.valores)} valores -> {saida}")


if __name__ == "__main__":
    main()

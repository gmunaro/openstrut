"""Tradutor mecanico do pseudo-BASIC da V1 nova (LAJECALC.BAS) para TypeScript.

Gera uma maquina de estados (switch dentro de for) que preserva GOTO, FOR/NEXT,
GOSUB/RETURN e a atribuicao SINGLE (`g.s`) de cada variavel `!`. Uso:

    python traduz.py <saida.ts> <nome>:<ini>-<fim>[:opcoes] ...

Cada unidade vira `export function <nome>(g: EstadoLajecalc): void`.
Opcoes: "gosub=<rotulo>" traduz so a sub-rotina que comeca no rotulo (RETURN com
pilha vazia sai da funcao).
"""

import re
import sys

BAS = r"C:/Users/MunaroPC/Desktop/Projetos Pessoais/_Arquivo/Sistrust/dist/src-original/laje/LAJECALC.BAS"

# ------------------------------------------------------------------ lexer

TOK = re.compile(
    r"""\s*(?:
    (?P<num>(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?(?:\#\#|\#|!|&|%)?)
  | (?P<str>"[^"]*")
  | (?P<id>[A-Za-z_][A-Za-z0-9_]*(?:\#\#|\#|!|%|&|\$)?)
  | (?P<op><>|<=|>=|=|<|>|\+|-|\*|/|\\|\^|\(|\)|,)
    )""",
    re.X,
)


def lex(s):
    pos = 0
    out = []
    s = s.rstrip()
    while pos < len(s):
        m = TOK.match(s, pos)
        if not m or m.end() == pos:
            if s[pos:].strip() == "":
                break
            raise SyntaxError(f"lex: {s[pos:]!r} em {s!r}")
        pos = m.end()
        for k in ("num", "str", "id", "op"):
            if m.group(k) is not None:
                out.append((k, m.group(k)))
                break
    return out


# ------------------------------------------------------------------ nomes

def sufixo(nome):
    for suf in ("##", "#", "!", "%", "&", "$"):
        if nome.endswith(suf):
            return nome[: -len(suf)], suf
    return nome, ""


FUNCOES = {
    "RT_CINT%": "qbCint",
    "CINT": "qbCint",
    "RT_CLNG&": "qbClng",
    "FX##": "",
    "RT_SNG!": "g.s",
    "RT_DBL#": "",
    "RT_POT##": "pot",
    "RT_SQR##": "Math.sqrt",
    "RT_SIN##": "Math.sin",
    "RT_COS##": "Math.cos",
    "RT_TAN##": "Math.tan",
    "ATN": "Math.atan",
    "ABS": "Math.abs",
    "INT": "qbInt",
}


class Unidade:
    def __init__(self, nome):
        self.nome = nome
        self.locais = {}  # nome base -> sufixo
        self.matrizes_locais = {}  # nome base -> (sufixo, ndims)
        self.globais = {}  # nome base -> sufixo
        self.matrizes_globais = {}  # nome base -> (sufixo, ndims)
        self.exportados = set()

    def var(self, nome):
        base, suf = sufixo(nome)
        if base in self.exportados:
            self.globais[base] = suf
            return "g." + base, suf
        if base.startswith("L_BP"):
            d = self.locais
            pref = ""
        else:
            d = self.globais
            pref = "g."
        if base in d and d[base] != suf:
            raise ValueError(f"{base} com sufixos {d[base]} e {suf}")
        d[base] = suf
        return pref + base, suf

    def matriz(self, nome, ndims):
        base, suf = sufixo(nome)
        if base.startswith("L_BP") and base not in self.exportados:
            d = self.matrizes_locais
            pref = ""
        else:
            d = self.matrizes_globais
            pref = "g."
        if base in d and d[base][0] != suf:
            raise ValueError(f"matriz {base} com sufixos {d[base][0]} e {suf}")
        if base in d and ndims is not None and d[base][1] is not None and d[base][1] != ndims:
            raise ValueError(f"matriz {base} com {d[base][1]} e {ndims} dimensoes")
        nd = ndims if ndims is not None else (d.get(base, (suf, None))[1])
        d[base] = (suf, nd)
        return pref + base, suf


# ------------------------------------------------------------------ parser de expressoes
# Resultado: (codigo, tipo) com tipo "b" (booleano TS), "n" (numero) ou "s" (texto).


class Parser:
    def __init__(self, toks, un):
        self.t = toks
        self.i = 0
        self.un = un

    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else (None, None)

    def take(self, val=None):
        tk = self.peek()
        if val is not None and tk[1] != val:
            raise SyntaxError(f"esperava {val!r}, veio {tk!r} em {self.t}")
        self.i += 1
        return tk

    def kw(self, w):
        tk = self.peek()
        return tk[0] == "id" and tk[1].upper() == w

    # conversoes
    @staticmethod
    def num(e):
        c, t = e
        if t == "b":
            return f"({c} ? -1 : 0)"
        return c

    @staticmethod
    def booleano(e):
        c, t = e
        if t == "b":
            return c
        return f"({c} !== 0)"

    def expr(self):
        return self.or_()

    def or_(self):
        a = self.and_()
        while self.kw("OR"):
            self.take()
            b = self.and_()
            if a[1] == "b" and b[1] == "b":
                a = (f"({a[0]} || {b[0]})", "b")
            else:
                a = (f"(qbCint({self.num(a)}) | qbCint({self.num(b)}))", "n")
        return a

    def and_(self):
        a = self.not_()
        while self.kw("AND"):
            self.take()
            b = self.not_()
            if a[1] == "b" and b[1] == "b":
                a = (f"({a[0]} && {b[0]})", "b")
            else:
                a = (f"(qbCint({self.num(a)}) & qbCint({self.num(b)}))", "n")
        return a

    def not_(self):
        if self.kw("NOT"):
            self.take()
            a = self.not_()
            if a[1] == "b":
                return (f"!{a[0]}", "b")
            return (f"~qbCint({a[0]})", "n")
        return self.rel()

    def rel(self):
        a = self.add()
        ops = {"=": "===", "<>": "!==", "<": "<", ">": ">", "<=": "<=", ">=": ">="}
        while self.peek()[0] == "op" and self.peek()[1] in ops:
            op = self.take()[1]
            b = self.add()
            a = (f"({self.num(a)} {ops[op]} {self.num(b)})", "b")
        return a

    def add(self):
        a = self.idiv()
        while self.peek()[0] == "op" and self.peek()[1] in ("+", "-"):
            op = self.take()[1]
            b = self.idiv()
            a = (f"({self.num(a)} {op} {self.num(b)})", "n")
        return a

    def idiv(self):
        a = self.mul()
        while self.peek() == ("op", "\\"):
            self.take()
            b = self.mul()
            a = (f"qbFix(qbClng({self.num(a)}) / qbClng({self.num(b)}))", "n")
        return a

    def mul(self):
        a = self.unary()
        while self.peek()[0] == "op" and self.peek()[1] in ("*", "/"):
            op = self.take()[1]
            b = self.unary()
            a = (f"({self.num(a)} {op} {self.num(b)})", "n")
        return a

    def unary(self):
        if self.peek() == ("op", "-"):
            self.take()
            a = self.unary()
            return (f"-{self.num(a)}", "n")
        if self.peek() == ("op", "+"):
            self.take()
            return self.unary()
        return self.pow_()

    def pow_(self):
        a = self.atom()
        while self.peek() == ("op", "^"):
            self.take()
            b = self.atom()
            a = (f"pot({self.num(a)}, {self.num(b)})", "n")
        return a

    def args(self):
        self.take("(")
        out = []
        if self.peek() == ("op", ")"):
            self.take()
            return out
        while True:
            out.append(self.expr())
            if self.peek() == ("op", ","):
                self.take()
                continue
            self.take(")")
            return out

    def atom(self):
        k, v = self.peek()
        if k == "num":
            self.take()
            base = re.sub(r"(##|#|!|&|%)$", "", v)
            if base.startswith("."):
                base = "0" + base
            if base.endswith("."):
                base = base + "0"
            return (base, "n")
        if k == "str":
            self.take()
            return (v, "s")
        if k == "op" and v == "(":
            self.take()
            e = self.expr()
            self.take(")")
            return (f"({e[0]})", e[1])
        if k == "id":
            self.take()
            nome = v
            if self.peek() == ("op", "("):
                if nome in FUNCOES or nome.upper() in FUNCOES:
                    fn = FUNCOES.get(nome, FUNCOES.get(nome.upper()))
                    a = self.args()
                    cods = [self.num(x) for x in a]
                    if nome == "RT_FRE&":
                        return ("0", "n")
                    if fn == "":
                        return (f"({cods[0]})", "n")
                    return (f"{fn}({', '.join(cods)})", "n")
                if nome == "RT_FRE&":
                    self.args()
                    return ("0", "n")
                if nome.startswith(("A_", "L_BP")):
                    a = self.args()
                    ref, suf = self.un.matriz(nome, len(a))
                    cods = [self.num(x) for x in a]
                    return (f"{ref}.get({', '.join(cods)})", "s" if suf == "$" else "n")
                raise SyntaxError(f"funcao desconhecida {nome}")
            ref, suf = self.un.var(nome)
            return (ref, "s" if suf == "$" else "n")
        raise SyntaxError(f"atomo inesperado {self.peek()} em {self.t}")


def expr_de(toks, un):
    p = Parser(toks, un)
    e = p.expr()
    if p.i != len(toks):
        raise SyntaxError(f"sobrou {toks[p.i:]} em {toks}")
    return e


# ------------------------------------------------------------------ atribuicao


def arredonda(suf, cod):
    if suf in ("!",):
        return f"g.s({cod})"
    if suf in ("%", "&"):
        return f"qbCint({cod})" if suf == "%" else f"qbClng({cod})"
    return cod


def lvalue(toks, un):
    """Devolve (setter(cod) -> str, getter, sufixo)."""
    k, v = toks[0]
    if k != "id":
        raise SyntaxError(f"lvalue {toks}")
    if len(toks) > 1:
        p = Parser(toks, un)
        p.take()
        a = p.args()
        if p.i != len(toks):
            raise SyntaxError(f"lvalue {toks}")
        ref, suf = un.matriz(v, len(a))
        idx = ", ".join(Parser.num(x) for x in a)
        return (lambda c: f"{ref}.set({c}, {idx});"), f"{ref}.get({idx})", suf
    ref, suf = un.var(v)
    return (lambda c: f"{ref} = {c};"), ref, suf


def divide_igual(toks):
    nivel = 0
    for j, (k, v) in enumerate(toks):
        if v == "(":
            nivel += 1
        elif v == ")":
            nivel -= 1
        elif v == "=" and nivel == 0:
            return toks[:j], toks[j + 1 :]
    raise SyntaxError(f"sem = em {toks}")


def divide_virgula(toks):
    nivel = 0
    for j, (k, v) in enumerate(toks):
        if v == "(":
            nivel += 1
        elif v == ")":
            nivel -= 1
        elif v == "," and nivel == 0:
            return toks[:j], toks[j + 1 :]
    raise SyntaxError(f"sem , em {toks}")


# ------------------------------------------------------------------ traducao de uma unidade


def le_linhas(ini, fim):
    with open(BAS, encoding="latin-1") as f:
        todas = f.read().split("\n")
    return [(n, todas[n - 1]) for n in range(ini, fim + 1)]


# Comandos trocados de proposito (com o motivo no comentario gerado).
SUBSTITUI = {
    # i do bordo na bissetriz: o LAJECALC trunca em 2 casas (LAJECALC.BAS:3425). A copia
    # do LAJEMONT, que nao trunca, tem porte proprio (src/calculo/sistrut/montagem/charneiras.ts).
    3425: "L_BP22 = g.s(qbInt(L_BP22 * 100.0) / 100.0);",
}

IGNORA = re.compile(
    r"^\s*(?:'|DIM\s|SUB\s|END SUB|IF RT_EVENTO|RT_PSET|RT_LINE|RT_CIRCLE|COLOR|LOCATE|PRINT|ON\s)"
)


def traduz(nome, ini, fim, gosub=None, prologo=(), exportados=(), pula=()):
    un = Unidade(nome)
    un.exportados = set(exportados)
    linhas = [(n, t) for n, t in le_linhas(ini, fim) if not any(a <= n <= b for a, b in pula)]
    stmts = []  # (linha, tipo, dados)
    for n, txt in linhas:
        cod = re.sub(r"\s*'@[0-9a-f]+.*$", "", txt)
        cod = re.sub(r"\s+'\s.*$", "", cod)
        cod = cod.strip()
        if not cod or IGNORA.match(cod):
            continue
        m = re.match(r"^(L_[0-9a-fA-F]+):\s*(?:'.*)?$", cod)
        if m:
            stmts.append((n, "label", m.group(1)))
            continue
        stmts.append((n, "cmd", cod))

    if gosub:
        k = next(i for i, s in enumerate(stmts) if s[1] == "label" and s[2] == gosub)
        stmts = stmts[k:]

    # ids de casos
    ids = {}
    proximo_id = [1]

    def novo_id():
        v = proximo_id[0]
        proximo_id[0] += 1
        return v

    for s in stmts:
        if s[1] == "label":
            ids[s[2]] = novo_id()

    corpo = []  # lista de ("case", id) ou ("code", str, terminal)
    pilha_for = []
    temps = []

    def emite(c, terminal=False, linha=None):
        corpo.append(("code", c + (f" // {linha}" if linha else ""), terminal))

    def caso(i):
        corpo.append(("case", i))

    def salto(rot):
        if rot not in ids:
            raise KeyError(f"rotulo {rot} fora da unidade {nome}")
        return f"pc = {ids[rot]}; continue;"

    for n, tipo, dado in stmts:
        if tipo == "label":
            caso(ids[dado])
            corpo.append(("code", f"// {dado}", False))
            continue
        c = dado
        if n in SUBSTITUI:
            emite(SUBSTITUI[n], linha=n)
            continue
        try:
            m = re.match(r"^IF (.*) THEN GOTO (L_[0-9a-fA-F]+)$", c)
            if m:
                e = expr_de(lex(m.group(1)), un)
                emite(f"if ({Parser.booleano(e)}) {{ {salto(m.group(2))} }}", linha=n)
                continue
            m = re.match(r"^GOTO (L_[0-9a-fA-F]+)$", c)
            if m:
                emite(salto(m.group(1)), terminal=True, linha=n)
                continue
            m = re.match(r"^GOSUB (L_[0-9a-fA-F]+)$", c)
            if m:
                volta = novo_id()
                emite(f"pilha.push({volta}); {salto(m.group(1))}", terminal=True, linha=n)
                caso(volta)
                continue
            if c == "RETURN":
                if gosub:
                    emite("if (pilha.length === 0) return; pc = pilha.pop() ?? 0; continue;", terminal=True, linha=n)
                else:
                    emite("pc = pilha.pop() ?? 0; continue;", terminal=True, linha=n)
                continue
            m = re.match(r"^FOR (\S+) = (.*) TO (.*?)(?: STEP (.*))?$", c)
            if m:
                setv, getv, suf = lvalue(lex(m.group(1)), un)
                k = len(temps)
                temps.append(k)
                ini_e = Parser.num(expr_de(lex(m.group(2)), un))
                lim_e = Parser.num(expr_de(lex(m.group(3)), un))
                passo = Parser.num(expr_de(lex(m.group(4)), un)) if m.group(4) else "1"
                corpo_id = novo_id()
                fim_id = novo_id()
                emite(setv(arredonda(suf, ini_e)), linha=n)
                emite(f"lim{k} = {arredonda(suf, lim_e)};")
                emite(f"passo{k} = {arredonda(suf, passo)};")
                emite(f"if (passo{k} >= 0 ? {getv} > lim{k} : {getv} < lim{k}) {{ pc = {fim_id}; continue; }}")
                caso(corpo_id)
                pilha_for.append((m.group(1), k, corpo_id, fim_id, setv, getv, suf))
                continue
            m = re.match(r"^NEXT (\S+)$", c)
            if m:
                v, k, corpo_id, fim_id, setv, getv, suf = pilha_for.pop()
                if v != m.group(1):
                    raise SyntaxError(f"NEXT {m.group(1)} fecha FOR {v}")
                emite(setv(arredonda(suf, f"{getv} + passo{k}")), linha=n)
                emite(f"if (passo{k} >= 0 ? {getv} <= lim{k} : {getv} >= lim{k}) {{ pc = {corpo_id}; continue; }}")
                emite(f"pc = {fim_id}; continue;", terminal=True)
                caso(fim_id)
                continue
            m = re.match(r"^CALL (MIXT_082a_Maior|MIXT_0877_Menor)\((.*)\)$", c)
            if m:
                p = Parser(lex("(" + m.group(2) + ")"), un)
                a = p.args()
                # terceiro argumento e lvalue simples
                toks3 = lex(m.group(2))
                # separa os tres argumentos por virgula de nivel 0
                partes = []
                nivel = 0
                atual = []
                for tk in toks3:
                    if tk[1] == "(":
                        nivel += 1
                    if tk[1] == ")":
                        nivel -= 1
                    if tk[1] == "," and nivel == 0:
                        partes.append(atual)
                        atual = []
                    else:
                        atual.append(tk)
                partes.append(atual)
                setv, _, suf = lvalue(partes[2], un)
                op = ">" if "Maior" in m.group(1) else "<"
                x = Parser.num(a[0])
                y = Parser.num(a[1])
                emite(setv(arredonda(suf, f"({x} {op} {y} ? {x} : {y})")), linha=n)
                continue
            m = re.match(r"^CALL (S_[0-9a-f]+)$", c)
            if m:
                emite(f"{m.group(1)}(g);", linha=n)
                continue
            m = re.match(r"^SWAP (.*)$", c)
            if m:
                a, b = divide_virgula(lex(m.group(1)))
                seta, geta, _ = lvalue(a, un)
                setb, getb, _ = lvalue(b, un)
                emite(f"{{ const t = {geta}; {seta(getb)} {setb('t')} }}", linha=n)
                continue
            m = re.match(r"^REDIM (\S+?)\((.*)\)$", c)
            if m:
                nomev = m.group(1)
                limites = []
                toks = lex(m.group(2))
                # separa por virgula de nivel 0
                partes = []
                nivel = 0
                atual = []
                for tk in toks:
                    if tk[1] == "(":
                        nivel += 1
                    if tk[1] == ")":
                        nivel -= 1
                    if tk[1] == "," and nivel == 0:
                        partes.append(atual)
                        atual = []
                    else:
                        atual.append(tk)
                partes.append(atual)
                vazia = False
                for parte in partes:
                    j = next(i for i, tk in enumerate(parte) if tk == ("id", "TO"))
                    lo = Parser.num(expr_de(parte[:j], un))
                    hi = Parser.num(expr_de(parte[j + 1 :], un))
                    if lo == "-32768":
                        vazia = True
                    limites.append(f"[{lo}, {hi}]")
                ref, suf = un.matriz(nomev, len(partes))
                if vazia:
                    emite(f"{ref} = g.matriz({suf!r}, []);", linha=n)
                else:
                    emite(f"{ref} = g.matriz({suf!r}, [{', '.join(limites)}]);", linha=n)
                continue
            m = re.match(r"^ERASE (\S+)$", c)
            if m:
                ref, suf = un.matriz(m.group(1), None)
                emite(f"{ref} = g.matriz({suf!r}, []);", linha=n)
                continue
            # atribuicao
            esq, dir_ = divide_igual(lex(c))
            setv, _, suf = lvalue(esq, un)
            e = expr_de(dir_, un)
            if suf == "$":
                emite(setv(e[0]), linha=n)
            else:
                emite(setv(arredonda(suf, Parser.num(e))), linha=n)
        except Exception as ex:
            raise SystemExit(f"{nome} linha {n}: {c}\n  -> {ex}")

    if pilha_for:
        raise SystemExit(f"{nome}: FOR sem NEXT {pilha_for}")

    # monta a funcao
    out = []
    out.append(f"/** Traducao mecanica de LAJECALC.BAS:{ini}-{fim}{' (sub-rotina ' + gosub + ')' if gosub else ''}. */")
    out.append(f"export function {nome}(g: EstadoLajecalc): void {{")
    codigo_total = chr(10).join(item[1] for item in corpo if item[0] == "code")
    for base, suf in sorted(un.locais.items()):
        lidos = re.findall(r"\b" + base + r"\b(?!\s*=[^=])", codigo_total)
        if not lidos:
            out.append("  // oxlint-disable-next-line no-unused-vars -- gravada e nunca lida no original")
        out.append(f"  let {base} = {'\"\"' if suf == '$' else '0'};")
    for base, (suf, nd) in sorted(un.matrizes_locais.items()):
        out.append(f"  let {base} = g.matriz({suf!r}, []);")
    for k in temps:
        out.append(f"  let lim{k} = 0;")
        out.append(f"  let passo{k} = 0;")
    for p in prologo:
        out.append("  " + p)
    usa_pilha = any(item[0] == "code" and "pilha" in item[1] for item in corpo)
    if usa_pilha:
        out.append("  const pilha: number[] = [];")
    out.append("  let pc = 0;")
    out.append("  for (;;) {")
    out.append("    switch (pc) {")
    out.append("      case 0:")
    terminal = False
    for item in corpo:
        if item[0] == "case":
            if not terminal:
                out.append(f"        pc = {item[1]}; continue;")
            out.append(f"      case {item[1]}:")
            terminal = False
        elif terminal and not item[1].startswith("//"):
            # comando inalcancavel no original (depois de GOTO/RETURN, sem rotulo)
            out.append("        // inalcancavel: " + item[1].split(" // ")[0])
        else:
            out.append("        " + item[1])
            if not item[1].startswith("//"):
                terminal = item[2]
    if not terminal:
        out.append("        return;")
    out.append("      default:")
    out.append("        throw new Error(`" + nome + ": pc ${pc}`);")
    out.append("    }")
    out.append("  }")
    out.append("}")
    return "\n".join(out), un


if __name__ == "__main__":
    saida = sys.argv[1]
    textos = []
    globais = {}
    matrizes = {}
    for arg in sys.argv[2:]:
        partes = arg.split(":")
        nome = partes[0]
        ini, fim = map(int, partes[1].split("-"))
        gosub = None
        exportados = ()
        prologo = ()
        pula = []
        for op in partes[2:]:
            if op.startswith("gosub="):
                gosub = op[len("gosub=") :]
            if op.startswith("exporta="):
                exportados = op[len("exporta=") :].split(",")
            if op.startswith("pula="):
                a, b = op[len("pula=") :].split("-")
                pula.append((int(a), int(b)))
        if nome == "L_3744e":
            prologo = ('L_BP5c = g.matriz("!", [[0, g.V_0e50], [0, 7]]);',)
        txt, un = traduz(nome, ini, fim, gosub, prologo, exportados, pula)
        textos.append(txt)
        for b, s in un.globais.items():
            globais.setdefault(b, s)
        for b, (s, nd) in un.matrizes_globais.items():
            matrizes.setdefault(b, (s, nd))
    with open(saida, "w", encoding="utf-8") as f:
        f.write("// GLOBAIS: " + ", ".join(f"{b}{s}" for b, s in sorted(globais.items())) + "\n")
        f.write("// MATRIZES: " + ", ".join(f"{b}{s}/{nd}" for b, (s, nd) in sorted(matrizes.items())) + "\n\n")
        f.write("\n\n".join(textos) + "\n")

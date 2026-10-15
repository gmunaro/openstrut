"""Decodifica um .LAJ (texto, ordem do LAJEGRAV.BAS:483-620). Uso: lajdec.py <arquivo.LAJ>"""
import sys
L = [l.strip() for l in open(sys.argv[1], encoding="latin-1").read().splitlines()]
i = 3
def n():
    global i
    v = L[i]; i += 1
    try:
        return float(v)
    except ValueError:
        return v
nivel = n(); e34 = n()
k = int(n()); eh = [n() for _ in range(k)]
k = int(n()); ev = [n() for _ in range(k)]
print("eixos H", eh, "V", ev)
if n() == 1:
    k = int(n()); arq = [[n() for _ in range(4)] for _ in range(k)]; print("arquitetura", arq)
if n() == 1:
    k = int(n()); alv = [[n() for _ in range(5)] for _ in range(k)]; print("alvenarias (x1,y1,x2,y2,q)", alv)
    a0 = int(n()); a1 = n(); area = [[n(), n()] for _ in range(a0)]; print("cargas area", area)
if n() == 1:
    k = int(n()); est = [[n() for _ in range(4)] for _ in range(k)]; print("estrutura", est)
nl = n(); pref = n(); e52 = n(); e3c = n()
print("nivel", nl, "prefixo", pref)
if e3c == 1:
    k = int(n()); vert = [[n(), n()] for _ in range(k + 1)]; print("vertices", {j: vert[j] for j in range(1, k + 1)})
    np_ = int(n()); pol = []
    for p in range(np_):
        nv = int(n()); pol.append([(int(n()), int(n())) for _ in range(nv)])
    cc = [[n() for _ in range(9)] for _ in range(np_)]
    for l in range(np_):
        c = cc[l]; vs = pol[int(c[0]) - 1] if c[0] >= 1 else []
        print(f"laje {l+1} (poligono {int(c[0])}): tipo {c[1]} area {c[2]} perm {c[4]} pp {c[5]} rotulo ({c[6]},{c[7]})")
        for j in range(len(vs) - 1):
            a, b = vs[j][0], vs[j + 1][0]
            print(f"   lado {j+1}: {vert[a]} -> {vert[b]}  codigo {vs[j][1]}")
if n() == 1:
    a = n(); b = n(); k = int(a)
    for _ in range(k):
        [n() for _ in range(4)]; n()
if n() == 1:
    n(); n(); k = int(n()); n()
    for _ in range(k):
        n(); m = int(n()); [n() for _ in range(m)]
if n() == 1:
    k = int(n())
    c = [[n() for _ in range(5)] for _ in range(k + 1)]
    print("continuidades (lajeA, ladoA, lajeB, ladoB, arm):", c[1:])
if n() == 1:
    d = [[n(), n()] for _ in range(np_ + 1)]; print("direcao/mu (ang, mu):", d)
if n() == 1:
    print("A_12ca:", [n() for _ in range(np_ + 1)])
if n() == 1:
    print("A_12fc (H, M+, codP, codS):", [[n() for _ in range(4)] for _ in range(np_ + 1)])
print("resto:", L[i:i+3])

"""Extrai do .LAJ final de cada run v2par o estado de laje que a T2 usa como entrada.
mu/angulo por POLIGONO (A_1210(V_177c,.), LAJECALC.BAS:1907), H e M+ por laje (A_12fc(i,0..1))."""
import json, glob, sys
L = None
def ler(caminho):
    L = [l.strip() for l in open(caminho, encoding="latin-1").read().splitlines()]
    pos = [3]
    def n():
        v = L[pos[0]]; pos[0] += 1
        try: return float(v)
        except ValueError: return v
    n(); n()
    k = int(n()); [n() for _ in range(k)]
    k = int(n()); [n() for _ in range(k)]
    if n() == 1:
        k = int(n()); [[n() for _ in range(4)] for _ in range(k)]
    if n() == 1:
        k = int(n()); [[n() for _ in range(5)] for _ in range(k)]
        nl = int(n()); n(); [[n(), n()] for _ in range(nl)]
    if n() == 1:
        k = int(n()); [[n() for _ in range(4)] for _ in range(k)]
    n(); pref = n(); n(); e3c = n()
    k = int(n()); vert = [[n(), n()] for _ in range(k + 1)]
    np_ = int(n()); pol = []
    for _ in range(np_):
        nv = int(n()); pol.append([(int(n()), int(n())) for _ in range(nv)])
    cc = [[n() for _ in range(9)] for _ in range(np_)]
    if n() == 1:
        k = int(n()); n()
        for _ in range(k): [n() for _ in range(4)]; n()
    if n() == 1:
        n(); n(); k = int(n()); n()
        for _ in range(k):
            n(); m = int(n()); [n() for _ in range(m)]
    cont = []
    if n() == 1:
        k = int(n()); rows = [[n() for _ in range(5)] for _ in range(k + 1)]
        cont = [{"lajeA": f"{pref}{int(r[0])}", "bordoA": int(r[1]) - 1,
                 "lajeB": None if r[2] == -1 else f"{pref}{int(r[2])}", "bordoB": int(r[3]) - 1,
                 "armaduraImposta": int(r[4])} for r in rows[1:]]
    dirmu = [[n(), n()] for _ in range(np_ + 1)] if n() == 1 else []
    if n() == 1: [n() for _ in range(len(cc) + 1)]
    h = [[n() for _ in range(4)] for _ in range(len(cc) + 1)] if n() == 1 else []
    lajes = []
    for l, c in enumerate(cc):
        p = int(c[0]); vs = pol[p - 1]
        lajes.append({"nome": f"{pref}{l + 1}", "tipo": int(c[1]), "poligono": p,
                      "vertices": [vert[vs[j][0]] for j in range(len(vs) - 1)],
                      "codigosFinais": [vs[j][1] for j in range(len(vs) - 1)],
                      "angulo": dirmu[p][0], "mu": dirmu[p][1], "area": c[2], "cargaPermanente": c[4],
                      "h": h[l + 1][0], "mPositivoFinalTcm": h[l + 1][1]})
    return {"lajes": lajes, "continuidades": cont}
saida = sys.argv[1]
for nome in ["v2par_laje_livre", "v2par_laje_balanco", "v2par_laje_umadir", "v2par_laje_assim", "v2par_laje_otim",
             "v2par_laje_r2", "v2par_laje_cargas", "v2par_viga_fluxo"]:
    run = sorted(glob.glob(f"C:/tmp/oraculo/runs/{nome}-*"))[-1].replace("\\", "/")
    laj = sorted(glob.glob(run + "/obra/*.LAJ"))[-1].replace("\\", "/")
    o = ler(laj); o = {"caso": nome, "laj": laj, **o}
    json.dump(o, open(f"{saida}/{nome}.laj.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(nome, [(x["nome"], x["poligono"], x["mu"], x["codigosFinais"], x["mPositivoFinalTcm"]) for x in o["lajes"]], o["continuidades"])

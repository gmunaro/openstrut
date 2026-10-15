"""Le um .LAJ gravado pelo LAJEGRAV (texto, ordem de LAJEGRAV.BAS:483-620) e devolve a obra em dicionario.
Uso direto: python lajinfo.py <arquivo.LAJ>  (imprime o JSON)."""
import json
import sys


def ler(caminho):
    L = [l.strip() for l in open(caminho, encoding="latin-1").read().splitlines()]
    pos = [3]

    def n():
        v = L[pos[0]]
        pos[0] += 1
        try:
            f = float(v)
            return int(f) if f == int(f) else round(f, 6)
        except ValueError:
            return v

    o = {}
    n()  # numero de niveis/obra (V_0e52)
    n()  # V_0e34
    k = int(n()); o["eixos_y_m"] = [n() for _ in range(k)]
    k = int(n()); o["eixos_x_m"] = [n() for _ in range(k)]
    if n() == 1:
        k = int(n()); o["arquitetura_trechos"] = [[n() for _ in range(4)] for _ in range(k)]
    if n() == 1:
        k = int(n()); o["alvenarias"] = [dict(zip(("x1", "y1", "x2", "y2", "carga_tm"), [n() for _ in range(5)])) for _ in range(k)]
        nl = int(n()); na = n()
        rows = [[n(), n()] for _ in range(nl)]
        areas, r = [], 0
        while r < len(rows):
            nv = int(rows[r][0]); tot, acid = rows[r + 1]
            areas.append({"total_tm2": tot, "parcela_acidental_tm2": acid, "poligono": rows[r + 2:r + 3 + nv]})
            r += 3 + nv
        o["cargas_area"] = areas
    if n() == 1:
        k = int(n()); o["estrutura_trechos_na_ordem_desenhada"] = [[n() for _ in range(4)] for _ in range(k)]
    n(); pref = n(); n(); e3c = n()
    vert, pol, cc = [], [], []
    if e3c == 1:
        k = int(n()); vert = [[n(), n()] for _ in range(k + 1)]
        np_ = int(n())
        for _ in range(np_):
            nv = int(n()); pol.append([(int(n()), int(n())) for _ in range(nv)])
        cc = [[n() for _ in range(9)] for _ in range(np_)]
        o["vertices_numerados"] = {j: vert[j] for j in range(1, k + 1)}
    if n() == 1:
        k = int(n()); n()
        pil = {}
        for _ in range(k):
            x1, y1, x2, y2 = [n() for _ in range(4)]
            pil["P" + str(n()).strip()] = [x1, y1]
        o["pilares"] = pil
    if n() == 1:
        n(); pv = n(); k = int(n()); n()
        vigas = {}
        for _ in range(k):
            nome = n(); m = int(n())
            vigas[f"{pv}{str(nome).strip()}"] = [vert[int(n())] for _ in range(m)]
        o["vigas_nos_m"] = vigas
    cont = []
    if n() == 1:
        k = int(n())
        rows = [[n() for _ in range(5)] for _ in range(k + 1)]
        cont = [{"lajeA": f"{pref}{r[0]}", "ladoA": r[1], "lajeB": f"{pref}{r[2]}", "ladoB": r[3], "armadura_imposta": r[4]} for r in rows[1:]]
    dirmu = []
    if n() == 1:
        dirmu = [[n(), n()] for _ in range(len(cc) + 1)]
    if n() == 1:
        [n() for _ in range(len(cc) + 1)]
    h = []
    if n() == 1:
        h = [[n() for _ in range(4)] for _ in range(len(cc) + 1)]
    lajes = {}
    for l, c in enumerate(cc):
        vs = pol[int(c[0]) - 1]
        lados = [{"lado": j + 1, "de": vert[vs[j][0]], "para": vert[vs[j + 1][0]],
                  "codigo": vs[j][1]} for j in range(len(vs) - 1)]
        d = {"tipo": {0: "macica", 1: "pre-moldada", 2: "vazio", 3: "comum nao calculada"}.get(c[1], c[1]),
             "area_m2": c[2], "carga_permanente_tm2": c[4], "peso_proprio_digitado_tm2": c[5], "lados": lados}
        if dirmu:
            # A_1210 e indexado pelo poligono da laje (A_10cc(i, 0) = c[0]), nao pela laje
            d["angulo_armadura_graus"], d["mu"] = dirmu[int(c[0])]
        if h:
            d["H_gravado_cm"] = h[l + 1][0]
        lajes[f"{pref}{l + 1}"] = d
    o["lajes"] = lajes
    o["continuidades"] = cont
    return o


if __name__ == "__main__":
    print(json.dumps(ler(sys.argv[1]), ensure_ascii=False, indent=1))

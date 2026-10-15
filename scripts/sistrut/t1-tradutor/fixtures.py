"""Gera src/calculo/sistrut/lajes/__casos_t1__/<caso>.json: obra decodificada do .LAJ
final do run (lajinfo_t1.py) + os valores do oraculo que sao do estagio T1."""
import glob, json, os, re, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
src = open(os.path.join(AQUI, "lajinfo_t1.py"), encoding="utf8").read()
src = src.replace('o["lajes"] = lajes', 'o["lajes"] = lajes; o["_cc0"] = [c[0] for c in cc]; o["_dirmu"] = dirmu')
ns = {}
exec(compile(src.replace('if __name__ == "__main__":', "if False:"), "lajinfo", "exec"), ns)
DEST = "C:/wt/v2-par-t1/src/calculo/sistrut/lajes/__casos_t1__"
MEU = re.compile(r"^L\d+(\.M[+-](princ|sec|maior|menor)(\.antesOtim)?|\.mu|\.lado\d+\.codigo|\.p|\.pp|\.acid|\.H|\.Hmin|\.Hmin\.pp|\.Hmin\.p|\.otim\.M|>V\d+\.area)$")
for caso in ["livre", "balanco", "umadir", "assim", "otim", "r2", "r3", "cargas"]:
    oj = json.load(open(f"C:/tmp/v2-paridade/oraculo-novos/v2par_laje_{caso}.json", encoding="utf8"))
    obra_caso = "otim" if caso == "r3" else caso
    laj = glob.glob(f"C:/tmp/oraculo/runs/v2par_laje_{obra_caso}-*/obra/*.LAJ")[-1]
    o = ns["ler"](laj)
    lajes = []
    for k, (nome, l) in enumerate(o["lajes"].items()):
        lajes.append({
            "nome": nome,
            "vertices": [x["de"] for x in l["lados"]],
            "indices": l["indices"],
            "grupo": l["grupo"],
            "codigosFinais": [x["codigo"] for x in l["lados"]],
            "cargaPermanente": l["carga_permanente_tm2"],
            "pesoProprio": l["peso_proprio_digitado_tm2"],
            "h": l["H_gravado_cm"],
            # A_1210 e indexado pelo poligono da laje (A_10cc(i, 0)), nao pela laje
            "muGravado": o["_dirmu"][o["_cc0"][k]][1],
        })
    valores = []
    for v in oj["valores"]:
        if not MEU.match(v["id"]):
            continue
        v = dict(v)
        m = re.match(r"^(L\d+)\.mu$", v["id"])
        if m:
            certo = next(l["muGravado"] for l in lajes if l["nome"] == m.group(1))
            if abs(float(v["impresso"]) - certo) > 1e-9:
                v["obs"] = (f"corrigido pela T1: o JSON da T10 trazia {v['impresso']}, lido da linha da laje; "
                            "o LAJECALC grava μ em A_1210(polígono, 1) (LAJECALC.BAS:35ce6, V_177c = A_10cc(L, 0)) "
                            "e o .LAJ grava por polígono")
                v["impresso"] = repr(certo)
        valores.append(v)
    saida = {
        "caso": oj["caso"],
        "run": oj["run"],
        "descricao": oj["descricao"],
        "obra": laj.replace("\\", "/"),
        "parametros": {"relacaoNegPosMin": 0.35} if caso == "r3" else {},
        "lajes": lajes,
        "cargasPorArea": [{"total": c["total_tm2"], "acidental": c["parcela_acidental_tm2"], "vertices": c["poligono"]} for c in o.get("cargas_area", [])],
        "alvenarias": [{"inicio": [a["x1"], a["y1"]], "fim": [a["x2"], a["y2"]], "carga": a["carga_tm"]} for a in o.get("alvenarias", [])],
        "continuidadesFinais": [{"lajeA": c["lajeA"], "bordoA": c["ladoA"] - 1, "lajeB": c["lajeB"], "bordoB": c["ladoB"] - 1} for c in o["continuidades"]],
        "valores": valores,
    }
    json.dump(saida, open(f"{DEST}/v2par_laje_{caso}.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(caso, len(valores), "valores", [l["muGravado"] for l in lajes])

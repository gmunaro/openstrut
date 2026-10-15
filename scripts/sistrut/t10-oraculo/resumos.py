"""Escreve tests/retraducao/<familia>/v2par_<caso>.resultado.md (resumo do run do oraculo e da comparacao com a V1 nova).
Uso: python resumos.py"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from casos_v2par import CASOS  # noqa: E402

F = os.path.dirname(os.path.abspath(__file__))
WT = "C:/wt/v1-v2par/tests/retraducao"
FAM = {"laje_": "laje", "viga_": "viga", "pilar_": "pilar", "des_": "desenho"}


def ultimo_run(nome):
    rs = sorted(glob.glob(f"C:/tmp/oraculo/runs/v2par_{nome}-*"))
    return rs[-1].replace("\\", "/") if rs else None


def main():
    for caso, d in CASOS.items():
        nome = caso[len("v2par_"):]
        fam = next(v for k, v in FAM.items() if nome.startswith(k))
        run = ultimo_run(nome)
        log = open(f"{run}/log.txt", encoding="utf-8", errors="replace").read().strip() if run else "(sem run)"
        cmp_ = os.path.join(F, f"cmp_{nome}.txt")
        linhas = []
        if os.path.exists(cmp_):
            for l in open(cmp_, encoding="utf-8", errors="replace"):
                if re.match(r"(OK|DIFERE)\s|\s+linha|.*iguais, \d+ diferentes|marca:", l):
                    linhas.append(l.rstrip())
        js = f"C:/tmp/v2-paridade/oraculo-novos/{caso}.json"
        nval = len(json.load(open(js, encoding="utf-8"))["valores"]) if os.path.exists(js) else 0
        txt = [f"# {caso}", "",
               f"Roteiro: `v2par_{nome}.sufixo.txt` (caso do oráculo `C:/tmp/oraculo/casos/{caso}.txt`, gerado do sufixo).", "",
               f"Objetivo: {d['descricao']}", "",
               f"Oráculo: `{run}`", "", "```", log, "```", "",
               "V1 nova: EXE compilados de `src-original` (main 75cbbab) em `build/v2par-bin`, rodados com `tools/roda_retrad.sh`; "
               "comparação com `tools/compara_retrad.py <run> <saída V1> --obra <C: da V1>`.", "",
               f"Resultado: {d.get('comparacao_v1') or '(ver lista)'}", ""]
        if linhas:
            txt += ["```", *linhas, "```", ""]
        txt += [f"Valores de referência: `C:/tmp/v2-paridade/oraculo-novos/{caso}.json` ({nval} valores).", ""]
        open(f"{WT}/{fam}/v2par_{nome}.resultado.md", "w", encoding="utf-8").write("\n".join(txt))
        print(fam, nome, nval)


if __name__ == "__main__":
    main()

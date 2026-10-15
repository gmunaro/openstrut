"""Converte impressora.prn (ESC/P) em texto com o escp.py do oraculo. Uso: prn2txt.py <prn> [saida.txt]"""
import sys
sys.path.insert(0, "C:/tmp/oraculo/docker")
import escp
t = escp.texto(open(sys.argv[1], "rb").read())
if isinstance(t, bytes):
    t = t.decode("cp437", "replace")
if len(sys.argv) > 2:
    open(sys.argv[2], "w", encoding="utf-8").write(t)
else:
    sys.stdout.reconfigure(encoding="utf-8")
    print(t)

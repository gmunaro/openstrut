#!/bin/sh
# Regenera os trechos traduzidos do LAJECALC.BAS usados por src/calculo/sistrut/lajes/.
cd "$(dirname "$0")"
EXP578=exporta=L_BP1a,L_BP1e,L_BP22,L_BP26,L_BP2a,L_BP2e,L_BP32,L_BP64,L_BP76,L_BPac,L_BP88,L_BP9a,L_BPc2:pula=8761-8766
python traduz.py ger_charneiras.ts S_4019b:4981-7127 S_578adSegmentos:8173-8340:$EXP578 L_5941c:8414-8598:gosub=L_5941c:$EXP578 S_21e5d:3233-3429 S_2175d:3130-3231 S_23341:3431-3478 S_23948:3480-3542 S_2018c:2726-3128 || exit 1
python traduz.py ger_coeficiente.ts S_50187:7129-8171 S_578ad:8173-8768:$EXP578 || exit 1
python traduz.py ger_momentos.ts L_3744e:4370-4979:gosub=L_3744e || exit 1
head -2 ger_charneiras.ts ger_coeficiente.ts ger_momentos.ts | cut -c1-600
wc -l ger_*.ts

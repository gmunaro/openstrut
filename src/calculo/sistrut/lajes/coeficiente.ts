// Preparação da laje (LACALCU SUB 1, S_50187) e coeficiente de carga (LACALCU SUB 2,
// S_578ad) do SISTRUT 4.0. As duas SUBs vêm traduzidas comando a comando do
// LAJECALC.BAS da V1 nova (ver o cabeçalho de charneiras.ts) e rodam na mesma
// máquina (`EstadoLajecalc`) que o padrão de charneiras.
//
// Uso: `preparaLaje` gira o polígono pelo ângulo da armadura, aplica a afinidade
// por √μ e soma alvenarias e cargas por área; `coeficienteDeCarga` dá o
// coeficiente c com M+ = q/c sobre o padrão de charneiras do polígono preparado.
import type {
  CoeficienteCarga,
  CoeficienteDeCarga,
  LajePreparada,
  LajeSistrut,
  ModoSistrut,
  PainelLajes,
  ParametrosLaje,
  PreparaLaje,
} from "../base/tipos";
import { ErroQB, qbCint, qbClng, qbFix, qbInt } from "../base/f32";
import { EstadoLajecalc, S_2018c, carregaPadrao } from "./charneiras";

/** Área da laje como o LAJEGEOM a grava em A_10cc(i, 2): Σ (x_k + x_k+1)(y_k − y_k+1)/2
 *  acumulada em SINGLE (LAJEGEOM.BAS:3107-3115). Positiva no sentido horário. */
export function areaDaLaje(laje: LajeSistrut, modo: ModoSistrut, parametros: ParametrosLaje) {
  const g = new EstadoLajecalc(parametros, modo);
  const v = laje.vertices;
  let area = 0;
  for (let k = 0; k < v.length; k++) {
    const a = v[k];
    const b = v[(k + 1) % v.length];
    if (a && b) area = g.s(((g.s(a.x) + g.s(b.x)) * (g.s(a.y) - g.s(b.y))) / 2 + area);
  }
  return area;
}

/** Carrega na máquina a laje (A_1070, A_109e, A_10fa, A_10cc(1, ·), A_1210(1, ·)),
 *  as alvenarias (A_0fe6) e as cargas por área (A_1014) do painel. */
export function carregaLaje(g: EstadoLajecalc, laje: LajeSistrut, painel: PainelLajes) {
  const n = laje.vertices.length;
  g.carregaPoligono(laje.vertices, laje.codigos, laje.tipo);
  g.A_1070 = g.matriz("!", [
    [0, n],
    [0, 1],
  ]);
  laje.vertices.forEach((v, k) => {
    g.A_1070.set(v.x, k + 1, 0);
    g.A_1070.set(v.y, k + 1, 1);
  });
  g.A_10cc.set(laje.cargaPermanente, 1, 4);
  g.A_10cc.set(laje.pesoProprio, 1, 5);
  g.A_1210.set(laje.angulo, 1, 0);
  g.A_1210.set(laje.mu, 1, 1);
  // alvenarias: A_0fe6(0, 0) = quantidade; (k, 0..4) = x1, y1, x2, y2, carga/m
  const alv = painel.alvenarias;
  g.A_0fe6 = g.matriz("!", [
    [0, alv.length],
    [0, 4],
  ]);
  g.A_0fe6.set(alv.length, 0, 0);
  alv.forEach((a, k) => {
    [a.inicio.x, a.inicio.y, a.fim.x, a.fim.y, a.carga].forEach((v, j) =>
      g.A_0fe6.set(v, k + 1, j),
    );
  });
  // cargas por área (A_1014; LAJECALC.BAS:7674-7701): (0, 1) = quantidade; cada bloco
  // começa em b com (b, 0) = nº de vértices, (b + 1, 0..1) = total e acidental e os
  // vértices em (b + 1 + k, 0..1); o bloco seguinte começa em b + nº + 2.
  const cargas = painel.cargasPorArea;
  const linhas = cargas.reduce((s, c) => s + c.vertices.length + 2, 1);
  g.A_1014 = g.matriz("!", [
    [0, linhas],
    [0, 1],
  ]);
  g.A_1014.set(cargas.length, 0, 1);
  let b = 1;
  for (const c of cargas) {
    g.A_1014.set(c.vertices.length, b, 0);
    g.A_1014.set(c.total, b + 1, 0);
    g.A_1014.set(c.acidental, b + 1, 1);
    c.vertices.forEach((v, k) => {
      g.A_1014.set(v.x, b + 2 + k, 0);
      g.A_1014.set(v.y, b + 2 + k, 1);
    });
    b += c.vertices.length + 2;
  }
}

/** Lê a laje preparada da máquina depois do S_50187. */
export function preparadaDoEstado(
  g: EstadoLajecalc,
  laje: LajeSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): LajePreparada {
  return {
    poligono: g.poligono(),
    alvenaria: g.A_10cc.get(0, 2),
    cargaArea: g.A_10cc.get(0, 3),
    cargaAreaAcidental: g.A_10cc.get(0, 4),
    area: areaDaLaje(laje, modo, parametros),
  };
}

/** Preparação da laje (LACALCU SUB 1, LAJECALC.BAS:7128-8171; livros_laje.md 1.5):
 *  alvenaria sobre bordo livre (fator 0 sobre bordo apoiado ou engastado), cargas
 *  por área recortadas pela laje, giro pelo ângulo com INT(100·v)/100 e afinidade
 *  por √μ (μ < 1 estica y; μ > 1 estica x). E2E L1 (4 × 5, μ 0,8): 4 × 5,59. */
export const preparaLaje: PreparaLaje = (laje, painel, parametros, modo) => {
  const g = new EstadoLajecalc(parametros, modo);
  carregaLaje(g, laje, painel);
  S_50187(g);
  return preparadaDoEstado(g, laje, parametros, modo);
};

/** Lê os termos do coeficiente de carga da máquina depois do S_578ad. */
export function coeficienteDoEstado(g: EstadoLajecalc): CoeficienteCarga {
  return {
    coeficiente: g.A_1210.get(0, 1),
    l1a: g.L_BP1a,
    l32: g.L_BP32,
    l1e: g.L_BP1e,
    l22: g.L_BP22,
    l26: g.L_BP26,
    l2a: g.L_BP2a,
    l2e: g.L_BP2e,
  };
}

/** Coeficiente de carga (LACALCU SUB 2, LAJECALC.BAS:8172-8411; livros_laje.md 1.7):
 *  c = (l_1a + l_32 + (1 + cantos)·l_2a − 2·l_22)/(l_1e/3 + l_2e − l_26/3), com
 *  rotação unitária de cada região em torno do seu bordo; sinal trocado se l_1a = 0.
 *  E2E: l_1a + l_32 = 38,36, l_1e/3 = 18,2491, l_22 = 1,5052, l_26 = 2,1955 → 2,0180.
 *  Roda sobre `padrao.bruto` (os segmentos no formato do original); o i de cada bordo
 *  sai dos códigos guardados nele (LAJECALC.BAS:8742-8757). */
export const coeficienteDeCarga: CoeficienteDeCarga = (padrao, parametros, modo) => {
  const g = new EstadoLajecalc(parametros, modo);
  carregaPadrao(g, padrao.bruto);
  S_578ad(g);
  return coeficienteDoEstado(g);
};

// ===== TRADUÇÃO MECÂNICA de LAJECALC.BAS (gerada por traduz.py; não editar à mão) =====

/** Traducao mecanica de LAJECALC.BAS:7129-8171. */
export function S_50187(g: EstadoLajecalc): void {
  let L_BP0e = 0;
  let L_BP100 = 0;
  let L_BP104 = 0;
  let L_BP108 = 0;
  let L_BP10c = 0;
  let L_BP110 = 0;
  let L_BP114 = 0;
  let L_BP118 = 0;
  let L_BP11c = 0;
  let L_BP12 = 0;
  let L_BP120 = 0;
  let L_BP124 = 0;
  let L_BP128 = 0;
  let L_BP12c = 0;
  let L_BP130 = 0;
  let L_BP134 = 0;
  let L_BP138 = 0;
  let L_BP13c = 0;
  let L_BP140 = 0;
  let L_BP144 = 0;
  let L_BP148 = 0;
  let L_BP14c = 0;
  let L_BP150 = 0;
  let L_BP154 = 0;
  let L_BP158 = 0;
  let L_BP15c = 0;
  let L_BP16 = 0;
  let L_BP164 = 0;
  let L_BP168 = 0;
  let L_BP16c = 0;
  let L_BP170 = 0;
  let L_BP174 = 0;
  let L_BP178 = 0;
  let L_BP17c = 0;
  let L_BP180 = 0;
  let L_BP184 = 0;
  let L_BP188 = 0;
  let L_BP18c = 0;
  let L_BP190 = 0;
  let L_BP194 = 0;
  let L_BP198 = 0;
  let L_BP19c = 0;
  let L_BP1a = 0;
  let L_BP1a0 = 0;
  let L_BP1a4 = 0;
  let L_BP1a8 = 0;
  let L_BP1ac = 0;
  let L_BP1b0 = 0;
  let L_BP1b4 = 0;
  let L_BP1b8 = 0;
  let L_BP1bc = 0;
  let L_BP1c0 = 0;
  let L_BP1c4 = 0;
  let L_BP1c8 = 0;
  let L_BP1cc = 0;
  let L_BP1d0 = 0;
  let L_BP1d4 = 0;
  let L_BP1d8 = 0;
  let L_BP1dc = 0;
  let L_BP1e = 0;
  let L_BP1e0 = 0;
  let L_BP1e4 = 0;
  let L_BP1e8 = 0;
  let L_BP1ec = 0;
  let L_BP1f0 = 0;
  let L_BP1f4 = 0;
  let L_BP1f8 = 0;
  let L_BP1fc = 0;
  let L_BP200 = 0;
  let L_BP204 = 0;
  let L_BP208 = 0;
  let L_BP20c = 0;
  let L_BP210 = 0;
  let L_BP214 = 0;
  let L_BP218 = 0;
  let L_BP21c = 0;
  let L_BP22 = 0;
  let L_BP220 = 0;
  let L_BP224 = 0;
  let L_BP228 = 0;
  let L_BP22c = 0;
  let L_BP230 = 0;
  let L_BP234 = 0;
  let L_BP238 = 0;
  let L_BP23c = 0;
  let L_BP240 = 0;
  let L_BP244 = 0;
  let L_BP248 = 0;
  let L_BP24c = 0;
  let L_BP250 = 0;
  let L_BP254 = 0;
  let L_BP258 = 0;
  let L_BP25c = 0;
  let L_BP26 = 0;
  let L_BP260 = 0;
  let L_BP264 = 0;
  let L_BP268 = 0;
  let L_BP26c = 0;
  let L_BP270 = 0;
  let L_BP274 = 0;
  let L_BP278 = 0;
  let L_BP27c = 0;
  let L_BP280 = 0;
  let L_BP284 = 0;
  let L_BP288 = 0;
  let L_BP28c = 0;
  let L_BP290 = 0;
  let L_BP294 = 0;
  let L_BP298 = 0;
  let L_BP29c = 0;
  let L_BP2a = 0;
  let L_BP2a0 = 0;
  let L_BP2a4 = 0;
  let L_BP2a8 = 0;
  let L_BP2ac = 0;
  let L_BP2b0 = 0;
  let L_BP2b4 = 0;
  let L_BP2b8 = 0;
  let L_BP2bc = 0;
  let L_BP2c0 = 0;
  let L_BP2c4 = 0;
  let L_BP2c8 = 0;
  let L_BP2cc = 0;
  let L_BP2d0 = 0;
  let L_BP2d4 = 0;
  let L_BP2d8 = 0;
  let L_BP2dc = 0;
  let L_BP2e = 0;
  let L_BP2e0 = 0;
  let L_BP2e4 = 0;
  let L_BP2e8 = 0;
  let L_BP2ec = 0;
  let L_BP2f0 = 0;
  let L_BP2f4 = 0;
  let L_BP2f8 = 0;
  let L_BP2fc = 0;
  let L_BP300 = 0;
  let L_BP304 = 0;
  let L_BP308 = 0;
  let L_BP30c = 0;
  let L_BP310 = 0;
  let L_BP314 = 0;
  let L_BP318 = 0;
  let L_BP31c = 0;
  let L_BP32 = 0;
  let L_BP320 = 0;
  let L_BP324 = 0;
  let L_BP328 = 0;
  let L_BP36 = 0;
  let L_BP3a = 0;
  let L_BP3e = 0;
  let L_BP42 = 0;
  let L_BP46 = 0;
  let L_BP52 = 0;
  let L_BP56 = 0;
  let L_BP5a = 0;
  let L_BP5e = 0;
  let L_BP62 = 0;
  let L_BP64 = 0;
  let L_BP68 = 0;
  let L_BPdc = 0;
  let L_BPe0 = 0;
  let L_BPe4 = 0;
  let L_BPe8 = 0;
  let L_BPec = 0;
  let L_BPf0 = 0;
  let L_BPf4 = 0;
  let L_BPf8 = 0;
  let L_BPfc = 0;
  let L_BP7a = g.matriz("!", []);
  let L_BP8c = g.matriz("!", []);
  let L_BP9e = g.matriz("%", []);
  let L_BPb4 = g.matriz("!", []);
  let L_BPc6 = g.matriz("!", []);
  let L_BPd8 = g.matriz("!", []);
  let lim0 = 0;
  let passo0 = 0;
  let lim1 = 0;
  let passo1 = 0;
  let lim2 = 0;
  let passo2 = 0;
  let lim3 = 0;
  let passo3 = 0;
  let lim4 = 0;
  let passo4 = 0;
  let lim5 = 0;
  let passo5 = 0;
  let lim6 = 0;
  let passo6 = 0;
  let lim7 = 0;
  let passo7 = 0;
  let lim8 = 0;
  let passo8 = 0;
  let lim9 = 0;
  let passo9 = 0;
  let lim10 = 0;
  let passo10 = 0;
  let lim11 = 0;
  let passo11 = 0;
  let lim12 = 0;
  let passo12 = 0;
  let lim13 = 0;
  let passo13 = 0;
  let lim14 = 0;
  let passo14 = 0;
  let lim15 = 0;
  let passo15 = 0;
  let lim16 = 0;
  let passo16 = 0;
  let lim17 = 0;
  let passo17 = 0;
  let lim18 = 0;
  let passo18 = 0;
  let lim19 = 0;
  let passo19 = 0;
  let lim20 = 0;
  let passo20 = 0;
  let lim21 = 0;
  let passo21 = 0;
  let lim22 = 0;
  let passo22 = 0;
  let lim23 = 0;
  let passo23 = 0;
  let lim24 = 0;
  let passo24 = 0;
  let lim25 = 0;
  let passo25 = 0;
  let lim26 = 0;
  let passo26 = 0;
  let lim27 = 0;
  let passo27 = 0;
  let lim28 = 0;
  let passo28 = 0;
  let lim29 = 0;
  let passo29 = 0;
  let lim30 = 0;
  let passo30 = 0;
  let lim31 = 0;
  let passo31 = 0;
  let lim32 = 0;
  let passo32 = 0;
  let lim33 = 0;
  let passo33 = 0;
  let lim34 = 0;
  let passo34 = 0;
  let lim35 = 0;
  let passo35 = 0;
  let lim36 = 0;
  let passo36 = 0;
  let lim37 = 0;
  let passo37 = 0;
  let lim38 = 0;
  let passo38 = 0;
  let lim39 = 0;
  let passo39 = 0;
  let lim40 = 0;
  let passo40 = 0;
  let lim41 = 0;
  let passo41 = 0;
  const pilha: number[] = [];
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        L_BP7a = g.matriz("!", []); // 7161
        L_BP8c = g.matriz("!", []); // 7162
        L_BP9e = g.matriz("%", []); // 7163
        L_BPb4 = g.matriz("!", []); // 7164
        L_BPc6 = g.matriz("!", []); // 7165
        L_BPd8 = g.matriz("!", []); // 7166
        L_BP7a = g.matriz("!", [[0, 1]]); // 7168
        L_BP8c = g.matriz("!", [[0, 1]]); // 7169
        L_BP9e = g.matriz("%", [[0, 1]]); // 7170
        L_BPb4 = g.matriz("!", [
          [0, 1],
          [0, 1],
        ]); // 7171
        L_BPc6 = g.matriz("!", [[0, 20]]); // 7172
        L_BPd8 = g.matriz("!", [[0, 20]]); // 7173
        if (!(g.A_10cc.get(qbCint(g.V_0f0c), 1) === 2.0)) {
          pc = 1;
          continue;
        } // 7174
        pc = 156;
        continue; // 7175
      case 1:
        // L_50290
        g.V_177c = g.s(g.A_10cc.get(qbCint(g.V_0f0c), 0)); // 7177
        g.A_15b0 = g.matriz("!", []); // 7178
        g.A_15de = g.matriz("!", []); // 7179
        g.A_15b0 = g.matriz("!", [[0, 50]]); // 7180
        g.A_15de = g.matriz("!", [[0, 50]]); // 7181
        g.A_15b0.set(g.s(g.A_109e.get(qbCint(g.V_177c), 0)), 0); // 7182
        L_BPdc = g.s(g.A_109e.get(qbCint(g.V_177c), 0)); // 7183
        g.V_0f10 = g.s(1.0); // 7184
        lim0 = g.s(L_BPdc);
        passo0 = g.s(1);
        if (passo0 >= 0 ? g.V_0f10 > lim0 : g.V_0f10 < lim0) {
          pc = 158;
          continue;
        }
        pc = 157;
        continue;
      case 157:
        g.A_15b0.set(
          g.s(g.A_1070.get(g.A_109e.get(qbCint(g.V_177c), qbCint(g.V_0f10)), 0)),
          qbCint(g.V_0f10),
        ); // 7185
        g.A_15de.set(
          g.s(g.A_1070.get(g.A_109e.get(qbCint(g.V_177c), qbCint(g.V_0f10)), 1)),
          qbCint(g.V_0f10),
        ); // 7186
        g.V_0f10 = g.s(g.V_0f10 + passo0); // 7187
        if (passo0 >= 0 ? g.V_0f10 <= lim0 : g.V_0f10 >= lim0) {
          pc = 157;
          continue;
        }
        pc = 158;
        continue;
      case 158:
        L_BP42 = g.s(0.0); // 7188
        L_BPe0 = g.s(g.A_15b0.get(0) - 1.0); // 7189
        g.V_0f04 = g.s(1.0); // 7190
        lim1 = g.s(L_BPe0);
        passo1 = g.s(1);
        if (passo1 >= 0 ? g.V_0f04 > lim1 : g.V_0f04 < lim1) {
          pc = 160;
          continue;
        }
        pc = 159;
        continue;
      case 159:
        L_BP42 = g.s(
          L_BP42 -
            ((g.A_15b0.get(qbCint(g.V_0f04)) + g.A_15b0.get(qbCint(g.V_0f04 + 1.0))) *
              (g.A_15de.get(qbCint(g.V_0f04)) - g.A_15de.get(qbCint(g.V_0f04 + 1.0)))) /
              2.0,
        ); // 7191
        g.V_0f04 = g.s(g.V_0f04 + passo1); // 7192
        if (passo1 >= 0 ? g.V_0f04 <= lim1 : g.V_0f04 >= lim1) {
          pc = 159;
          continue;
        }
        pc = 160;
        continue;
      case 160:
        pilha.push(161);
        pc = 10;
        continue; // 7193
      case 161:
        pilha.push(162);
        pc = 79;
        continue; // 7194
      case 162:
        g.A_10cc.set(g.s(L_BP56), 0, 2); // 7195
        g.A_10cc.set(g.s(L_BP5a), 0, 3); // 7196
        g.A_10cc.set(g.s(L_BP5e), 0, 4); // 7197
        L_BP7a = g.matriz("!", []); // 7198
        L_BP8c = g.matriz("!", []); // 7199
        L_BPc6 = g.matriz("!", []); // 7200
        L_BPd8 = g.matriz("!", []); // 7201
        L_BP9e = g.matriz("%", []); // 7202
        L_BPb4 = g.matriz("!", []); // 7203
        if (!(g.A_1210.get(qbCint(g.V_177c), 0) !== 0.0)) {
          pc = 4;
          continue;
        } // 7204
        L_BP52 = (g.A_1210.get(qbCint(g.V_177c), 0) * g.V_0e68_pi) / 180.0; // 7205
        L_BPe4 = g.s(g.A_15b0.get(0)); // 7206
        g.V_0f10 = g.s(1.0); // 7207
        lim2 = g.s(L_BPe4);
        passo2 = g.s(1);
        if (passo2 >= 0 ? g.V_0f10 > lim2 : g.V_0f10 < lim2) {
          pc = 164;
          continue;
        }
        pc = 163;
        continue;
      case 163:
        g.V_0ef4 =
          g.A_15b0.get(qbCint(g.V_0f10)) * Math.cos(L_BP52) -
          g.A_15de.get(qbCint(g.V_0f10)) * Math.sin(L_BP52); // 7208
        g.V_0efc =
          g.A_15b0.get(qbCint(g.V_0f10)) * Math.sin(L_BP52) +
          g.A_15de.get(qbCint(g.V_0f10)) * Math.cos(L_BP52); // 7209
        g.A_15b0.set(g.s(qbInt(100.0 * g.V_0ef4) / 100.0), qbCint(g.V_0f10)); // 7210
        g.A_15de.set(g.s(qbInt(100.0 * g.V_0efc) / 100.0), qbCint(g.V_0f10)); // 7211
        g.V_0f10 = g.s(g.V_0f10 + passo2); // 7212
        if (passo2 >= 0 ? g.V_0f10 <= lim2 : g.V_0f10 >= lim2) {
          pc = 163;
          continue;
        }
        pc = 164;
        continue;
      case 164:
        g.V_0ef4 = g.A_15b0.get(1); // 7213
        g.V_0efc = g.A_15de.get(1); // 7214
        L_BPe8 = g.s(g.A_15b0.get(0)); // 7215
        g.V_0f10 = g.s(1.0); // 7216
        lim3 = g.s(L_BPe8);
        passo3 = g.s(1);
        if (passo3 >= 0 ? g.V_0f10 > lim3 : g.V_0f10 < lim3) {
          pc = 166;
          continue;
        }
        pc = 165;
        continue;
      case 165:
        if (!(g.A_15b0.get(qbCint(g.V_0f10)) < g.V_0ef4)) {
          pc = 2;
          continue;
        } // 7217
        g.V_0ef4 = g.A_15b0.get(qbCint(g.V_0f10)); // 7218
        pc = 2;
        continue;
      case 2:
        // L_508b6
        if (!(g.A_15de.get(qbCint(g.V_0f10)) < g.V_0efc)) {
          pc = 3;
          continue;
        } // 7220
        g.V_0efc = g.A_15de.get(qbCint(g.V_0f10)); // 7221
        pc = 3;
        continue;
      case 3:
        // L_5090e
        g.V_0f10 = g.s(g.V_0f10 + passo3); // 7223
        if (passo3 >= 0 ? g.V_0f10 <= lim3 : g.V_0f10 >= lim3) {
          pc = 165;
          continue;
        }
        pc = 166;
        continue;
      case 166:
        L_BPec = g.s(g.A_15b0.get(0)); // 7224
        g.V_0f10 = g.s(1.0); // 7225
        lim4 = g.s(L_BPec);
        passo4 = g.s(1);
        if (passo4 >= 0 ? g.V_0f10 > lim4 : g.V_0f10 < lim4) {
          pc = 168;
          continue;
        }
        pc = 167;
        continue;
      case 167:
        g.A_15b0.set(g.s(g.A_15b0.get(qbCint(g.V_0f10)) - g.V_0ef4), qbCint(g.V_0f10)); // 7226
        g.A_15de.set(g.s(g.A_15de.get(qbCint(g.V_0f10)) - g.V_0efc), qbCint(g.V_0f10)); // 7227
        g.V_0f10 = g.s(g.V_0f10 + passo4); // 7228
        if (passo4 >= 0 ? g.V_0f10 <= lim4 : g.V_0f10 >= lim4) {
          pc = 167;
          continue;
        }
        pc = 168;
        continue;
      case 168:
        pc = 4;
        continue;
      case 4:
        // L_50a17
        if (!(g.A_1210.get(qbCint(g.V_177c), 1) !== 1.0)) {
          pc = 9;
          continue;
        } // 7230
        if (!(g.A_1210.get(qbCint(g.V_177c), 1) < 1.0)) {
          pc = 6;
          continue;
        } // 7231
        g.V_0efc = g.A_15de.get(1); // 7232
        L_BPf0 = g.s(g.A_15b0.get(0)); // 7233
        g.V_0f10 = g.s(1.0); // 7234
        lim5 = g.s(L_BPf0);
        passo5 = g.s(1);
        if (passo5 >= 0 ? g.V_0f10 > lim5 : g.V_0f10 < lim5) {
          pc = 170;
          continue;
        }
        pc = 169;
        continue;
      case 169:
        if (!(g.A_15de.get(qbCint(g.V_0f10)) < g.V_0efc)) {
          pc = 5;
          continue;
        } // 7235
        g.V_0efc = g.A_15de.get(qbCint(g.V_0f10)); // 7236
        pc = 5;
        continue;
      case 5:
        // L_50b1e
        g.V_0f10 = g.s(g.V_0f10 + passo5); // 7238
        if (passo5 >= 0 ? g.V_0f10 <= lim5 : g.V_0f10 >= lim5) {
          pc = 169;
          continue;
        }
        pc = 170;
        continue;
      case 170:
        // μ 0 (o da laje comum não calculada sem <R>elação no LAJECALC 2): o QB4.5 para
        // com "Division by zero" e o ON ERROR volta ao menu (LAJECALC.BAS:169-174)
        if (g.A_1210.get(qbCint(g.V_177c), 1) === 0)
          throw new ErroQB(11, "Division by zero em 1/√μ: a laje está sem a relação μ (μ = 0)");
        L_BP52 = 1.0 / g.raiz(g.A_1210.get(qbCint(g.V_177c), 1)); // 7239
        L_BPf4 = g.s(g.A_15b0.get(0)); // 7240
        g.V_0f10 = g.s(1.0); // 7241
        lim6 = g.s(L_BPf4);
        passo6 = g.s(1);
        if (passo6 >= 0 ? g.V_0f10 > lim6 : g.V_0f10 < lim6) {
          pc = 172;
          continue;
        }
        pc = 171;
        continue;
      case 171:
        g.A_15de.set(
          g.s(
            qbInt((g.A_15de.get(qbCint(g.V_0f10)) - g.V_0efc) * 100.0 * L_BP52) / 100.0 + g.V_0efc,
          ),
          qbCint(g.V_0f10),
        ); // 7242
        g.V_0f10 = g.s(g.V_0f10 + passo6); // 7243
        if (passo6 >= 0 ? g.V_0f10 <= lim6 : g.V_0f10 >= lim6) {
          pc = 171;
          continue;
        }
        pc = 172;
        continue;
      case 172:
        pc = 8;
        continue; // 7244
      case 6:
        // L_50c36
        g.V_0ef4 = g.A_15b0.get(1); // 7246
        L_BPf8 = g.s(g.A_15b0.get(0)); // 7247
        g.V_0f10 = g.s(1.0); // 7248
        lim7 = g.s(L_BPf8);
        passo7 = g.s(1);
        if (passo7 >= 0 ? g.V_0f10 > lim7 : g.V_0f10 < lim7) {
          pc = 174;
          continue;
        }
        pc = 173;
        continue;
      case 173:
        if (!(g.A_15b0.get(qbCint(g.V_0f10)) < g.V_0ef4)) {
          pc = 7;
          continue;
        } // 7249
        g.V_0ef4 = g.A_15b0.get(qbCint(g.V_0f10)); // 7250
        pc = 7;
        continue;
      case 7:
        // L_50cd2
        g.V_0f10 = g.s(g.V_0f10 + passo7); // 7252
        if (passo7 >= 0 ? g.V_0f10 <= lim7 : g.V_0f10 >= lim7) {
          pc = 173;
          continue;
        }
        pc = 174;
        continue;
      case 174:
        L_BP52 = 1.0 / g.raiz(1.0 / g.A_1210.get(qbCint(g.V_177c), 1)); // 7253
        L_BPfc = g.s(g.A_15b0.get(0)); // 7254
        g.V_0f10 = g.s(1.0); // 7255
        lim8 = g.s(L_BPfc);
        passo8 = g.s(1);
        if (passo8 >= 0 ? g.V_0f10 > lim8 : g.V_0f10 < lim8) {
          pc = 176;
          continue;
        }
        pc = 175;
        continue;
      case 175:
        g.A_15b0.set(
          g.s(
            qbInt((g.A_15b0.get(qbCint(g.V_0f10)) - g.V_0ef4) * 100.0 * L_BP52) / 100.0 + g.V_0ef4,
          ),
          qbCint(g.V_0f10),
        ); // 7256
        g.V_0f10 = g.s(g.V_0f10 + passo8); // 7257
        if (passo8 >= 0 ? g.V_0f10 <= lim8 : g.V_0f10 >= lim8) {
          pc = 175;
          continue;
        }
        pc = 176;
        continue;
      case 176:
        pc = 8;
        continue;
      case 8:
        // L_50ded
        pc = 9;
        continue;
      case 9:
        // L_50df2
        pc = 156;
        continue; // 7260
      case 10:
        // L_50dff
        L_BP62 = qbCint(0); // 7263
        L_BP1e = g.s(g.A_15b0.get(1)); // 7264
        L_BP22 = g.s(g.A_15de.get(1)); // 7265
        L_BP26 = g.s(g.A_15b0.get(1)); // 7266
        L_BP2a = g.s(g.A_15de.get(1)); // 7267
        L_BP100 = g.s(g.A_15b0.get(0) - 1.0); // 7268
        g.V_1778 = g.s(2.0); // 7269
        lim9 = g.s(L_BP100);
        passo9 = g.s(1);
        if (passo9 >= 0 ? g.V_1778 > lim9 : g.V_1778 < lim9) {
          pc = 178;
          continue;
        }
        pc = 177;
        continue;
      case 177:
        L_BP104 = g.s(g.A_15b0.get(qbCint(g.V_1778))); // 7270
        L_BP108 = g.s(L_BP1e < L_BP104 ? L_BP1e : L_BP104); // 7271
        g.A_15b0.set(g.s(L_BP104), qbCint(g.V_1778)); // 7273
        L_BP1e = g.s(L_BP108); // 7274
        L_BP10c = g.s(g.A_15de.get(qbCint(g.V_1778))); // 7275
        L_BP110 = g.s(L_BP22 < L_BP10c ? L_BP22 : L_BP10c); // 7276
        g.A_15de.set(g.s(L_BP10c), qbCint(g.V_1778)); // 7278
        L_BP22 = g.s(L_BP110); // 7279
        L_BP114 = g.s(g.A_15b0.get(qbCint(g.V_1778))); // 7280
        L_BP118 = g.s(L_BP26 > L_BP114 ? L_BP26 : L_BP114); // 7281
        g.A_15b0.set(g.s(L_BP114), qbCint(g.V_1778)); // 7283
        L_BP26 = g.s(L_BP118); // 7284
        L_BP11c = g.s(g.A_15de.get(qbCint(g.V_1778))); // 7285
        L_BP120 = g.s(L_BP2a > L_BP11c ? L_BP2a : L_BP11c); // 7286
        g.A_15de.set(g.s(L_BP11c), qbCint(g.V_1778)); // 7288
        L_BP2a = g.s(L_BP120); // 7289
        g.V_1778 = g.s(g.V_1778 + passo9); // 7290
        if (passo9 >= 0 ? g.V_1778 <= lim9 : g.V_1778 >= lim9) {
          pc = 177;
          continue;
        }
        pc = 178;
        continue;
      case 178:
        L_BP56 = g.s(0.0); // 7291
        L_BP124 = g.s(g.A_0fe6.get(0, 0)); // 7292
        g.V_0f04 = g.s(1.0); // 7293
        lim10 = g.s(L_BP124);
        passo10 = g.s(1);
        if (passo10 >= 0 ? g.V_0f04 > lim10 : g.V_0f04 < lim10) {
          pc = 180;
          continue;
        }
        pc = 179;
        continue;
      case 179:
        g.V_16d0 = g.A_0fe6.get(qbCint(g.V_0f04), 0); // 7294
        g.V_16d8 = g.A_0fe6.get(qbCint(g.V_0f04), 1); // 7295
        g.V_16e0 = g.A_0fe6.get(qbCint(g.V_0f04), 2); // 7296
        g.V_16e8 = g.A_0fe6.get(qbCint(g.V_0f04), 3); // 7297
        L_BP128 = g.s(g.V_16d0 / 1.0); // 7298
        L_BP12c = g.s(g.V_16e0 / 1.0); // 7299
        L_BP130 = g.s(L_BP128 < L_BP12c ? L_BP128 : L_BP12c); // 7300
        L_BP134 = g.s(g.V_16d0 / 1.0); // 7302
        L_BP138 = g.s(g.V_16e0 / 1.0); // 7303
        L_BP13c = g.s(L_BP134 > L_BP138 ? L_BP134 : L_BP138); // 7304
        if (!(L_BP13c < L_BP1e || L_BP130 > L_BP26)) {
          pc = 11;
          continue;
        } // 7306
        pc = 34;
        continue; // 7307
      case 11:
        // L_51202
        L_BP140 = g.s(g.V_16d8 / 1.0); // 7309
        L_BP144 = g.s(g.V_16e8 / 1.0); // 7310
        L_BP148 = g.s(L_BP140 < L_BP144 ? L_BP140 : L_BP144); // 7311
        L_BP14c = g.s(g.V_16d8 / 1.0); // 7313
        L_BP150 = g.s(g.V_16e8 / 1.0); // 7314
        L_BP154 = g.s(L_BP14c > L_BP150 ? L_BP14c : L_BP150); // 7315
        if (!(L_BP154 < L_BP22 || L_BP148 > L_BP2a)) {
          pc = 12;
          continue;
        } // 7317
        pc = 34;
        continue; // 7318
      case 12:
        // L_512b2
        L_BPc6.set(g.s(1.0), 0); // 7320
        g.V_0ef4 = g.V_16d0; // 7321
        g.V_0efc = g.V_16d8; // 7322
        g.V_1784 = g.s(1.0); // 7323
        L_BP158 = g.s(0.0); // 7324
        pilha.push(181);
        pc = 35;
        continue; // 7325
      case 181:
        if (!(g.V_178c / 2.0 === qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 13;
          continue;
        } // 7326
        g.V_1784 = g.s(0.0); // 7327
        pc = 14;
        continue; // 7328
      case 13:
        // L_51373
        L_BPc6.set(g.s(g.V_16d0), qbCint(L_BPc6.get(0))); // 7330
        L_BPd8.set(g.s(g.V_16d8), qbCint(L_BPc6.get(0))); // 7331
        L_BPc6.set(g.s(L_BPc6.get(0) + 1.0), 0); // 7332
        pc = 14;
        continue;
      case 14:
        // L_5141a
        g.V_0ef4 = g.V_16e0; // 7334
        g.V_0efc = g.V_16e8; // 7335
        g.V_1788 = g.s(1.0); // 7336
        pilha.push(182);
        pc = 35;
        continue; // 7337
      case 182:
        if (!(g.V_178c / 2.0 === qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 15;
          continue;
        } // 7338
        g.V_1788 = g.s(0.0); // 7339
        pc = 16;
        continue; // 7340
      case 15:
        // L_514aa
        L_BPc6.set(g.s(g.V_16e0), qbCint(L_BPc6.get(0))); // 7342
        L_BPd8.set(g.s(g.V_16e8), qbCint(L_BPc6.get(0))); // 7343
        L_BPc6.set(g.s(L_BPc6.get(0) + 1.0), 0); // 7344
        pc = 16;
        continue;
      case 16:
        // L_51551
        L_BP15c = g.s(g.A_15b0.get(0) - 1.0); // 7346
        g.V_0f14 = g.s(1.0); // 7347
        lim11 = g.s(L_BP15c);
        passo11 = g.s(1);
        if (passo11 >= 0 ? g.V_0f14 > lim11 : g.V_0f14 < lim11) {
          pc = 184;
          continue;
        }
        pc = 183;
        continue;
      case 183:
        g.V_16f0 = g.A_15b0.get(qbCint(g.V_0f14)); // 7348
        g.V_16f8 = g.A_15de.get(qbCint(g.V_0f14)); // 7349
        g.V_1708 = g.V_0f14 + 1.0; // 7350
        if (!(g.A_15b0.get(0) === g.V_1708)) {
          pc = 17;
          continue;
        } // 7351
        g.V_1708 = 1.0; // 7352
        pc = 17;
        continue;
      case 17:
        // L_5161c
        g.V_1700 = g.A_15b0.get(qbCint(g.V_1708)); // 7354
        g.V_1708 = g.A_15de.get(qbCint(g.V_1708)); // 7355
        S_2018c(g); // 7356
        if (!(g.V_0f1c !== "NAO")) {
          pc = 18;
          continue;
        } // 7358
        L_BPc6.set(g.s(g.V_0ef4), qbCint(L_BPc6.get(0))); // 7359
        L_BPd8.set(g.s(g.V_0efc), qbCint(L_BPc6.get(0))); // 7360
        L_BPc6.set(g.s(L_BPc6.get(0) + 1.0), 0); // 7361
        pc = 18;
        continue;
      case 18:
        // L_51732
        g.V_0f14 = g.s(g.V_0f14 + passo11); // 7363
        if (passo11 >= 0 ? g.V_0f14 <= lim11 : g.V_0f14 >= lim11) {
          pc = 183;
          continue;
        }
        pc = 184;
        continue;
      case 184:
        L_BPc6.set(g.s(L_BPc6.get(0) - 1.0), 0); // 7364
        if (!(L_BPc6.get(0) < 2.0)) {
          pc = 19;
          continue;
        } // 7365
        pc = 34;
        continue; // 7366
      case 19:
        // L_517c4
        if (!(L_BPc6.get(0) > g.V_1784 + g.V_1788)) {
          pc = 25;
          continue;
        } // 7368
        g.V_1778 = g.s(1.0); // 7369
        pc = 20;
        continue;
      case 20:
        // L_5180a
        g.V_0f14 = g.s(g.V_1778 + 1.0); // 7371
        pc = 21;
        continue;
      case 21:
        // L_51826
        if (
          !(
            Math.abs(L_BPd8.get(qbCint(g.V_1778)) - L_BPd8.get(qbCint(g.V_0f14))) < g.V_133a &&
            Math.abs(L_BPc6.get(qbCint(g.V_1778)) - L_BPc6.get(qbCint(g.V_0f14))) < g.V_133a
          )
        ) {
          pc = 23;
          continue;
        } // 7373
        if (!(L_BPc6.get(0) > g.V_0f14)) {
          pc = 22;
          continue;
        } // 7374
        L_BP164 = L_BPc6.get(0) - 1.0; // 7375
        g.V_0ef4 = g.V_0f14; // 7376
        lim12 = L_BP164;
        passo12 = 1;
        if (passo12 >= 0 ? g.V_0ef4 > lim12 : g.V_0ef4 < lim12) {
          pc = 186;
          continue;
        }
        pc = 185;
        continue;
      case 185:
        L_BPc6.set(g.s(L_BPc6.get(qbCint(g.V_0ef4 + 1.0))), qbCint(g.V_0ef4)); // 7377
        L_BPd8.set(g.s(L_BPd8.get(qbCint(g.V_0ef4 + 1.0))), qbCint(g.V_0ef4)); // 7378
        g.V_0ef4 = g.V_0ef4 + passo12; // 7379
        if (passo12 >= 0 ? g.V_0ef4 <= lim12 : g.V_0ef4 >= lim12) {
          pc = 185;
          continue;
        }
        pc = 186;
        continue;
      case 186:
        pc = 22;
        continue;
      case 22:
        // L_519e3
        L_BPc6.set(g.s(L_BPc6.get(0) - 1.0), 0); // 7381
        pc = 24;
        continue; // 7382
      case 23:
        // L_51a1f
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 7384
        pc = 24;
        continue;
      case 24:
        // L_51a3a
        if (!(L_BPc6.get(0) < g.V_0f14)) {
          pc = 21;
          continue;
        } // 7386
        g.V_1778 = g.s(g.V_1778 + 1.0); // 7387
        if (!(L_BPc6.get(0) <= g.V_1778)) {
          pc = 20;
          continue;
        } // 7388
        pc = 25;
        continue;
      case 25:
        // L_51aa9
        if (!(L_BPc6.get(0) >= 2.0)) {
          pc = 33;
          continue;
        } // 7390
        if (!(L_BPc6.get(1) === L_BPc6.get(2))) {
          pc = 27;
          continue;
        } // 7391
        L_BP168 = g.s(L_BPc6.get(0) - 1.0); // 7392
        g.V_1778 = g.s(1.0); // 7393
        lim13 = g.s(L_BP168);
        passo13 = g.s(1);
        if (passo13 >= 0 ? g.V_1778 > lim13 : g.V_1778 < lim13) {
          pc = 188;
          continue;
        }
        pc = 187;
        continue;
      case 187:
        L_BP16c = g.s(L_BPc6.get(0)); // 7394
        g.V_0ef0 = g.s(g.V_1778 + 1.0); // 7395
        lim14 = g.s(L_BP16c);
        passo14 = g.s(1);
        if (passo14 >= 0 ? g.V_0ef0 > lim14 : g.V_0ef0 < lim14) {
          pc = 190;
          continue;
        }
        pc = 189;
        continue;
      case 189:
        if (!(L_BPd8.get(qbCint(g.V_1778)) > L_BPd8.get(qbCint(g.V_0ef0)))) {
          pc = 26;
          continue;
        } // 7396
        {
          const t = L_BPc6.get(qbCint(g.V_1778));
          L_BPc6.set(L_BPc6.get(qbCint(g.V_0ef0)), qbCint(g.V_1778));
          L_BPc6.set(t, qbCint(g.V_0ef0));
        } // 7397
        {
          const t = L_BPd8.get(qbCint(g.V_1778));
          L_BPd8.set(L_BPd8.get(qbCint(g.V_0ef0)), qbCint(g.V_1778));
          L_BPd8.set(t, qbCint(g.V_0ef0));
        } // 7398
        pc = 26;
        continue;
      case 26:
        // L_51c2e
        g.V_0ef0 = g.s(g.V_0ef0 + passo14); // 7400
        if (passo14 >= 0 ? g.V_0ef0 <= lim14 : g.V_0ef0 >= lim14) {
          pc = 189;
          continue;
        }
        pc = 190;
        continue;
      case 190:
        g.V_1778 = g.s(g.V_1778 + passo13); // 7401
        if (passo13 >= 0 ? g.V_1778 <= lim13 : g.V_1778 >= lim13) {
          pc = 187;
          continue;
        }
        pc = 188;
        continue;
      case 188:
        pc = 29;
        continue; // 7402
      case 27:
        // L_51c8e
        L_BP170 = g.s(L_BPc6.get(0) - 1.0); // 7404
        g.V_1778 = g.s(1.0); // 7405
        lim15 = g.s(L_BP170);
        passo15 = g.s(1);
        if (passo15 >= 0 ? g.V_1778 > lim15 : g.V_1778 < lim15) {
          pc = 192;
          continue;
        }
        pc = 191;
        continue;
      case 191:
        L_BP174 = g.s(L_BPc6.get(0)); // 7406
        g.V_0ef0 = g.s(g.V_1778 + 1.0); // 7407
        lim16 = g.s(L_BP174);
        passo16 = g.s(1);
        if (passo16 >= 0 ? g.V_0ef0 > lim16 : g.V_0ef0 < lim16) {
          pc = 194;
          continue;
        }
        pc = 193;
        continue;
      case 193:
        if (!(L_BPc6.get(qbCint(g.V_1778)) > L_BPc6.get(qbCint(g.V_0ef0)))) {
          pc = 28;
          continue;
        } // 7408
        {
          const t = L_BPc6.get(qbCint(g.V_1778));
          L_BPc6.set(L_BPc6.get(qbCint(g.V_0ef0)), qbCint(g.V_1778));
          L_BPc6.set(t, qbCint(g.V_0ef0));
        } // 7409
        {
          const t = L_BPd8.get(qbCint(g.V_1778));
          L_BPd8.set(L_BPd8.get(qbCint(g.V_0ef0)), qbCint(g.V_1778));
          L_BPd8.set(t, qbCint(g.V_0ef0));
        } // 7410
        pc = 28;
        continue;
      case 28:
        // L_51db4
        g.V_0ef0 = g.s(g.V_0ef0 + passo16); // 7412
        if (passo16 >= 0 ? g.V_0ef0 <= lim16 : g.V_0ef0 >= lim16) {
          pc = 193;
          continue;
        }
        pc = 194;
        continue;
      case 194:
        g.V_1778 = g.s(g.V_1778 + passo15); // 7413
        if (passo15 >= 0 ? g.V_1778 <= lim15 : g.V_1778 >= lim15) {
          pc = 191;
          continue;
        }
        pc = 192;
        continue;
      case 192:
        pc = 29;
        continue;
      case 29:
        // L_51e11
        g.V_0f14 = g.s(1.0); // 7415
        pc = 30;
        continue;
      case 30:
        // L_51e27
        if (!(g.V_0f14 + 1.0 > L_BPc6.get(0))) {
          pc = 31;
          continue;
        } // 7417
        pc = 34;
        continue; // 7418
      case 31:
        // L_51e63
        g.V_16d0 = L_BPc6.get(qbCint(g.V_0f14)); // 7420
        g.V_16d8 = L_BPd8.get(qbCint(g.V_0f14)); // 7421
        g.V_16e0 = L_BPc6.get(qbCint(g.V_0f14 + 1.0)); // 7422
        g.V_16e8 = L_BPd8.get(qbCint(g.V_0f14 + 1.0)); // 7423
        L_BP178 = g.s(1.0); // 7424
        pilha.push(195);
        pc = 49;
        continue; // 7425
      case 195:
        if (!(L_BP3e !== -1.0)) {
          pc = 32;
          continue;
        } // 7426
        L_BP178 = g.s(L_BP3e); // 7427
        pc = 32;
        continue;
      case 32:
        // L_51f55
        L_BP56 = g.s(
          g.raiz(
            g.pot(L_BPc6.get(qbCint(g.V_0f14)) - L_BPc6.get(qbCint(g.V_0f14 + 1.0)), 2.0) +
              g.pot(L_BPd8.get(qbCint(g.V_0f14)) - L_BPd8.get(qbCint(g.V_0f14 + 1.0)), 2.0),
          ) *
            g.A_0fe6.get(qbCint(g.V_0f04), 4) *
            L_BP178 +
            L_BP56,
        ); // 7429
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 7430
        pc = 30;
        continue; // 7431
      case 33:
        // L_52043
        pc = 34;
        continue;
      case 34:
        // L_52048
        g.V_0f04 = g.s(g.V_0f04 + passo10); // 7434
        if (passo10 >= 0 ? g.V_0f04 <= lim10 : g.V_0f04 >= lim10) {
          pc = 179;
          continue;
        }
        pc = 180;
        continue;
      case 180:
        L_BP17c = g.s(L_BP17c + L_BP56); // 7435
        pc = pilha.pop() ?? 0;
        continue; // 7436
      case 35:
        // L_5209d
        g.V_178c = g.s(0.0); // 7438
        L_BP180 = g.s(g.A_15b0.get(0) - 1.0); // 7439
        g.V_1778 = g.s(1.0); // 7440
        lim17 = g.s(L_BP180);
        passo17 = g.s(1);
        if (passo17 >= 0 ? g.V_1778 > lim17 : g.V_1778 < lim17) {
          pc = 197;
          continue;
        }
        pc = 196;
        continue;
      case 196:
        L_BP0e = g.s(g.A_15b0.get(qbCint(g.V_1778))); // 7441
        L_BP12 = g.s(g.A_15de.get(qbCint(g.V_1778))); // 7442
        L_BP1a = g.s(g.V_1778 + 1.0); // 7443
        if (!(g.A_15b0.get(0) === L_BP1a)) {
          pc = 36;
          continue;
        } // 7444
        L_BP1a = g.s(1.0); // 7445
        pc = 36;
        continue;
      case 36:
        // L_52179
        L_BP16 = g.s(g.A_15b0.get(qbCint(L_BP1a))); // 7447
        L_BP1a = g.s(g.A_15de.get(qbCint(L_BP1a))); // 7448
        if (
          !(
            (Math.abs(g.V_0efc - L_BP1a) < g.V_133a && Math.abs(g.V_0ef4 - L_BP16) < g.V_133a) ||
            (Math.abs(g.V_0efc - L_BP12) < g.V_133a && Math.abs(g.V_0ef4 - L_BP0e) < g.V_133a)
          )
        ) {
          pc = 37;
          continue;
        } // 7449
        g.V_178c = g.s(L_BP158); // 7450
        pc = 48;
        continue; // 7451
      case 37:
        // L_52278
        L_BP184 = g.s(L_BP0e < L_BP16 ? L_BP0e : L_BP16); // 7453
        if (!(L_BP184 > g.V_133a + g.V_0ef4)) {
          pc = 38;
          continue;
        } // 7455
        pc = 47;
        continue; // 7456
      case 38:
        // L_522b2
        L_BP188 = g.s(L_BP12 < L_BP1a ? L_BP12 : L_BP1a); // 7458
        L_BP18c = g.s(L_BP12 > L_BP1a ? L_BP12 : L_BP1a); // 7460
        if (!(L_BP18c < g.V_0efc || L_BP188 > g.V_0efc)) {
          pc = 39;
          continue;
        } // 7462
        pc = 47;
        continue; // 7463
      case 39:
        // L_5231c
        L_BP190 = g.s(L_BP0e > L_BP16 ? L_BP0e : L_BP16); // 7465
        if (!((g.V_0ef4 - g.V_133a > L_BP190 || L_BP12 !== g.V_0efc) && L_BP12 === L_BP1a)) {
          pc = 40;
          continue;
        } // 7467
        pc = 47;
        continue; // 7468
      case 40:
        // L_52394
        L_BP194 = g.s(L_BP12 > L_BP1a ? L_BP12 : L_BP1a); // 7470
        L_BP198 = g.s(L_BP12 < L_BP1a ? L_BP12 : L_BP1a); // 7472
        L_BP19c = g.s(L_BP0e > L_BP16 ? L_BP0e : L_BP16); // 7474
        if (!(L_BP19c <= g.V_0ef4 && L_BP198 <= g.V_0efc && L_BP194 > g.V_0efc)) {
          pc = 42;
          continue;
        } // 7476
        g.V_178c = g.s(g.V_178c + 1.0); // 7477
        if (!(Math.abs(g.V_0ef4 - L_BP0e) < g.V_133a && Math.abs(L_BP0e - L_BP16) < g.V_133a)) {
          pc = 41;
          continue;
        } // 7478
        g.V_178c = g.s(L_BP158); // 7479
        pc = 48;
        continue; // 7480
      case 41:
        // L_524a0
        pc = 47;
        continue; // 7482
      case 42:
        // L_524ad
        if (!(L_BP12 === L_BP1a)) {
          pc = 43;
          continue;
        } // 7484
        g.V_178c = g.s(L_BP158); // 7485
        pc = 48;
        continue; // 7486
      case 43:
        // L_524df
        L_BP1a0 = g.s(L_BP12 > L_BP1a ? L_BP12 : L_BP1a); // 7488
        if (!(L_BP1a0 === g.V_0efc)) {
          pc = 44;
          continue;
        } // 7490
        pc = 47;
        continue; // 7491
      case 44:
        // L_52514
        if (
          !(
            g.V_133a + g.V_0ef4 >=
            L_BP0e + ((g.V_0efc - L_BP12) * (L_BP16 - L_BP0e)) / (L_BP1a - L_BP12)
          )
        ) {
          pc = 46;
          continue;
        } // 7493
        g.V_178c = g.s(g.V_178c + 1.0); // 7494
        if (
          !(
            Math.abs(
              g.V_0ef4 - (L_BP0e + ((g.V_0efc - L_BP12) * (L_BP16 - L_BP0e)) / (L_BP1a - L_BP12)),
            ) < g.V_133a
          )
        ) {
          pc = 45;
          continue;
        } // 7495
        g.V_178c = g.s(L_BP158); // 7496
        pc = 48;
        continue; // 7497
      case 45:
        // L_525d1
        pc = 46;
        continue;
      case 46:
        // L_525d6
        pc = 47;
        continue;
      case 47:
        // L_525db
        g.V_1778 = g.s(g.V_1778 + passo17); // 7501
        if (passo17 >= 0 ? g.V_1778 <= lim17 : g.V_1778 >= lim17) {
          pc = 196;
          continue;
        }
        pc = 197;
        continue;
      case 197:
        pc = 48;
        continue;
      case 48:
        // L_5260c
        pc = pilha.pop() ?? 0;
        continue; // 7503
      case 49:
        // L_5261b
        L_BP3e = g.s(-1.0); // 7505
        if (!(L_BP62 === 1)) {
          pc = 50;
          continue;
        } // 7506
        pc = pilha.pop() ?? 0;
        continue; // 7507
      case 50:
        // L_52648
        L_BP1a4 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 7509
        g.V_1778 = g.s(1.0); // 7510
        lim18 = g.s(L_BP1a4);
        passo18 = g.s(1);
        if (passo18 >= 0 ? g.V_1778 > lim18 : g.V_1778 < lim18) {
          pc = 199;
          continue;
        }
        pc = 198;
        continue;
      case 198:
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_1778)); // 7511
        g.V_17f0 = g.A_15de.get(qbCint(g.V_1778)); // 7512
        g.V_17f8 = g.V_1778 + 1.0; // 7513
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_17f8)) {
          pc = 51;
          continue;
        } // 7514
        g.V_17f8 = 1.0; // 7515
        pc = 51;
        continue;
      case 51:
        // L_5272d
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_17f8)); // 7517
        g.V_17f8 = g.A_15de.get(qbCint(g.V_17f8)); // 7518
        L_BP64 = qbCint(1); // 7519
        pilha.push(200);
        pc = 58;
        continue; // 7520
      case 200:
        if (!(L_BP3e !== -1.0)) {
          pc = 52;
          continue;
        } // 7521
        pc = 53;
        continue; // 7522
      case 52:
        // L_527b4
        g.V_1778 = g.s(g.V_1778 + passo18); // 7524
        if (passo18 >= 0 ? g.V_1778 <= lim18 : g.V_1778 >= lim18) {
          pc = 198;
          continue;
        }
        pc = 199;
        continue;
      case 199:
        pc = 53;
        continue;
      case 53:
        // L_527e0
        if (!(g.A_10cc.get(qbCint(g.V_0f0c), 1) === 1.0 || L_BP3e !== -1.0)) {
          pc = 54;
          continue;
        } // 7526
        pc = pilha.pop() ?? 0;
        continue; // 7527
      case 54:
        // L_52843
        L_BP1a8 = g.s(g.A_15b0.get(0) - 1.0); // 7529
        g.V_1778 = g.s(1.0); // 7530
        lim19 = g.s(L_BP1a8);
        passo19 = g.s(1);
        if (passo19 >= 0 ? g.V_1778 > lim19 : g.V_1778 < lim19) {
          pc = 202;
          continue;
        }
        pc = 201;
        continue;
      case 201:
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_1778)); // 7531
        g.V_17f0 = g.A_15de.get(qbCint(g.V_1778)); // 7532
        g.V_17f8 = g.V_1778 + 1.0; // 7533
        if (!(g.A_15b0.get(0) === g.V_17f8)) {
          pc = 55;
          continue;
        } // 7534
        g.V_17f8 = 1.0; // 7535
        pc = 55;
        continue;
      case 55:
        // L_5290e
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_17f8)); // 7537
        g.V_17f8 = g.A_15de.get(qbCint(g.V_17f8)); // 7538
        L_BP64 = qbCint(2); // 7539
        pilha.push(203);
        pc = 58;
        continue; // 7540
      case 203:
        if (!(L_BP3e !== -1.0)) {
          pc = 56;
          continue;
        } // 7541
        pc = 57;
        continue; // 7542
      case 56:
        // L_52995
        g.V_1778 = g.s(g.V_1778 + passo19); // 7544
        if (passo19 >= 0 ? g.V_1778 <= lim19 : g.V_1778 >= lim19) {
          pc = 201;
          continue;
        }
        pc = 202;
        continue;
      case 202:
        pc = 57;
        continue;
      case 57:
        // L_529c1
        pc = pilha.pop() ?? 0;
        continue; // 7546
      case 58:
        // L_529d0
        L_BP1ac = g.s(g.V_17e0 / 1.0); // 7548
        L_BP1b0 = g.s(g.V_17e8 / 1.0); // 7549
        L_BP1b4 = g.s(L_BP1ac > L_BP1b0 ? L_BP1ac : L_BP1b0); // 7550
        L_BP1b8 = g.s(g.V_16d0 / 1.0); // 7552
        L_BP1bc = g.s(g.V_16e0 / 1.0); // 7553
        L_BP1c0 = g.s(L_BP1b8 < L_BP1bc ? L_BP1b8 : L_BP1bc); // 7554
        L_BP1c4 = g.s(g.V_17e0 / 1.0); // 7556
        L_BP1c8 = g.s(g.V_17e8 / 1.0); // 7557
        L_BP1cc = g.s(L_BP1c4 < L_BP1c8 ? L_BP1c4 : L_BP1c8); // 7558
        L_BP1d0 = g.s(g.V_16d0 / 1.0); // 7560
        L_BP1d4 = g.s(g.V_16e0 / 1.0); // 7561
        L_BP1d8 = g.s(L_BP1d0 > L_BP1d4 ? L_BP1d0 : L_BP1d4); // 7562
        if (!(L_BP1cc > L_BP1d8 || L_BP1b4 < L_BP1c0)) {
          pc = 59;
          continue;
        } // 7564
        pc = pilha.pop() ?? 0;
        continue; // 7565
      case 59:
        // L_52af5
        L_BP1dc = g.s(g.V_17f0 / 1.0); // 7567
        L_BP1e0 = g.s(g.V_17f8 / 1.0); // 7568
        L_BP1e4 = g.s(L_BP1dc > L_BP1e0 ? L_BP1dc : L_BP1e0); // 7569
        L_BP1e8 = g.s(g.V_16d8 / 1.0); // 7571
        L_BP1ec = g.s(g.V_16e8 / 1.0); // 7572
        L_BP1f0 = g.s(L_BP1e8 < L_BP1ec ? L_BP1e8 : L_BP1ec); // 7573
        L_BP1f4 = g.s(g.V_17f0 / 1.0); // 7575
        L_BP1f8 = g.s(g.V_17f8 / 1.0); // 7576
        L_BP1fc = g.s(L_BP1f4 < L_BP1f8 ? L_BP1f4 : L_BP1f8); // 7577
        L_BP200 = g.s(g.V_16d8 / 1.0); // 7579
        L_BP204 = g.s(g.V_16e8 / 1.0); // 7580
        L_BP208 = g.s(L_BP200 > L_BP204 ? L_BP200 : L_BP204); // 7581
        if (!(L_BP1fc > L_BP208 || L_BP1e4 < L_BP1f0)) {
          pc = 60;
          continue;
        } // 7583
        pc = pilha.pop() ?? 0;
        continue; // 7584
      case 60:
        // L_52c15
        if (!(g.V_17e0 === g.V_17e8)) {
          pc = 70;
          continue;
        } // 7586
        if (!(g.V_16d0 !== g.V_16e0)) {
          pc = 61;
          continue;
        } // 7587
        pc = pilha.pop() ?? 0;
        continue; // 7588
      case 61:
        // L_52c55
        L_BP20c = g.s(g.V_17f0 / 1.0); // 7590
        L_BP210 = g.s(g.V_17f8 / 1.0); // 7591
        L_BP214 = g.s(L_BP20c > L_BP210 ? L_BP20c : L_BP210); // 7592
        L_BP218 = g.s(g.V_16d8 / 1.0); // 7594
        L_BP21c = g.s(g.V_16e8 / 1.0); // 7595
        L_BP220 = g.s(L_BP218 < L_BP21c ? L_BP218 : L_BP21c); // 7596
        L_BP224 = g.s(g.V_17f0 / 1.0); // 7598
        L_BP228 = g.s(g.V_17f8 / 1.0); // 7599
        L_BP22c = g.s(L_BP224 < L_BP228 ? L_BP224 : L_BP228); // 7600
        L_BP230 = g.s(g.V_16d8 / 1.0); // 7602
        L_BP234 = g.s(g.V_16e8 / 1.0); // 7603
        L_BP238 = g.s(L_BP230 > L_BP234 ? L_BP230 : L_BP234); // 7604
        if (!(L_BP22c === L_BP238 || L_BP214 === L_BP220)) {
          pc = 62;
          continue;
        } // 7606
        pc = pilha.pop() ?? 0;
        continue; // 7607
      case 62:
        // L_52d75
        pc = 63;
        continue;
      case 63:
        // L_52d7a
        if (!(L_BP64 === 1)) {
          pc = 68;
          continue;
        } // 7610
        if (!(g.A_10cc.get(qbCint(g.V_0f0c), 1) === 1.0)) {
          pc = 64;
          continue;
        } // 7611
        L_BP3e = g.s(0.0); // 7612
        pc = 67;
        continue; // 7613
      case 64:
        // L_52dda
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1778)) !== 1)) {
          pc = 65;
          continue;
        } // 7615
        L_BP3e = g.s(0.0); // 7616
        pc = 65;
        continue;
      case 65:
        // L_52e1c
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1778)) === 1)) {
          pc = 66;
          continue;
        } // 7618
        L_BP3e = g.s(1.0); // 7619
        pc = 66;
        continue;
      case 66:
        // L_52e5e
        pc = 67;
        continue;
      case 67:
        // L_52e63
        pc = 69;
        continue; // 7622
      case 68:
        // L_52e6b
        L_BP3e = g.s(0.5); // 7624
        pc = 69;
        continue;
      case 69:
        // L_52e80
        pc = pilha.pop() ?? 0;
        continue; // 7626
      // inalcancavel: pc = 78; continue;
      case 70:
        // L_52e92
        if (!(g.V_16d0 === g.V_16e0)) {
          pc = 71;
          continue;
        } // 7630
        pc = pilha.pop() ?? 0;
        continue; // 7631
      case 71:
        // L_52eb7
        L_BP23c = g.s(g.V_17e0 / 1.0); // 7633
        L_BP240 = g.s(g.V_17e8 / 1.0); // 7634
        L_BP244 = g.s(L_BP23c > L_BP240 ? L_BP23c : L_BP240); // 7635
        L_BP248 = g.s(g.V_16d0 / 1.0); // 7637
        L_BP24c = g.s(g.V_16e0 / 1.0); // 7638
        L_BP250 = g.s(L_BP248 < L_BP24c ? L_BP248 : L_BP24c); // 7639
        L_BP254 = g.s(g.V_17e0 / 1.0); // 7641
        L_BP258 = g.s(g.V_17e8 / 1.0); // 7642
        L_BP25c = g.s(L_BP254 < L_BP258 ? L_BP254 : L_BP258); // 7643
        L_BP260 = g.s(g.V_16d0 / 1.0); // 7645
        L_BP264 = g.s(g.V_16e0 / 1.0); // 7646
        L_BP268 = g.s(L_BP260 > L_BP264 ? L_BP260 : L_BP264); // 7647
        if (!(L_BP25c === L_BP268 || L_BP244 === L_BP250)) {
          pc = 72;
          continue;
        } // 7649
        pc = pilha.pop() ?? 0;
        continue; // 7650
      case 72:
        // L_52fd7
        if (
          !(
            Math.abs(
              (g.V_16e8 - g.V_16d8) / (g.V_16e0 - g.V_16d0) -
                (g.V_17f8 - g.V_17f0) / (g.V_17e8 - g.V_17e0),
            ) > g.V_133e
          )
        ) {
          pc = 73;
          continue;
        } // 7652
        pc = pilha.pop() ?? 0;
        continue; // 7653
      case 73:
        // L_5302b
        if (!(g.V_17e0 !== g.V_16e0 && g.V_17e0 !== g.V_16d0)) {
          pc = 75;
          continue;
        } // 7655
        if (
          !(
            Math.abs(
              (g.V_16e8 - g.V_17f0) / (g.V_16e0 - g.V_17e0) -
                (g.V_17f0 - g.V_16d8) / (g.V_17e0 - g.V_16d0),
            ) > g.V_133e
          )
        ) {
          pc = 74;
          continue;
        } // 7656
        pc = pilha.pop() ?? 0;
        continue; // 7657
      case 74:
        // L_530bd
        pc = 77;
        continue; // 7659
      case 75:
        // L_530c5
        if (!(g.V_17f0 !== g.V_16e8 && g.V_17f0 !== g.V_16d8)) {
          pc = 76;
          continue;
        } // 7661
        pc = pilha.pop() ?? 0;
        continue; // 7662
      case 76:
        // L_5310d
        pc = 77;
        continue;
      case 77:
        // L_53112
        pc = 63;
        continue; // 7665
      case 78:
        // L_5311f
        pc = pilha.pop() ?? 0;
        continue; // 7667
      case 79:
        // L_5312e
        L_BP5a = g.s(0.0); // 7669
        L_BP5e = g.s(0.0); // 7670
        if (!(g.A_1014.get(0, 1) === 0.0)) {
          pc = 80;
          continue;
        } // 7671
        pc = pilha.pop() ?? 0;
        continue; // 7672
      case 80:
        // L_5318a
        g.V_0f14 = g.s(1.0); // 7674
        L_BP26c = g.s(g.A_1014.get(0, 1)); // 7675
        g.V_0f04 = g.s(1.0); // 7676
        lim20 = g.s(L_BP26c);
        passo20 = g.s(1);
        if (passo20 >= 0 ? g.V_0f04 > lim20 : g.V_0f04 < lim20) {
          pc = 205;
          continue;
        }
        pc = 204;
        continue;
      case 204:
        L_BP7a = g.matriz("!", []); // 7677
        L_BP8c = g.matriz("!", []); // 7678
        L_BP7a = g.matriz("!", [[0, 50]]); // 7679
        L_BP8c = g.matriz("!", [[0, 50]]); // 7680
        L_BP7a.set(g.s(g.A_1014.get(qbCint(g.V_0f14), 0) + 1.0), 0); // 7681
        L_BP270 = g.s(g.A_1014.get(qbCint(g.V_0f14), 0)); // 7682
        g.V_1778 = g.s(1.0); // 7683
        lim21 = g.s(L_BP270);
        passo21 = g.s(1);
        if (passo21 >= 0 ? g.V_1778 > lim21 : g.V_1778 < lim21) {
          pc = 207;
          continue;
        }
        pc = 206;
        continue;
      case 206:
        L_BP7a.set(g.s(g.A_1014.get(qbCint(g.V_0f14 + g.V_1778 + 1.0), 0)), qbCint(g.V_1778)); // 7684
        L_BP8c.set(g.s(g.A_1014.get(qbCint(g.V_0f14 + g.V_1778 + 1.0), 1)), qbCint(g.V_1778)); // 7685
        g.V_1778 = g.s(g.V_1778 + passo21); // 7686
        if (passo21 >= 0 ? g.V_1778 <= lim21 : g.V_1778 >= lim21) {
          pc = 206;
          continue;
        }
        pc = 207;
        continue;
      case 207:
        L_BP7a.set(g.s(L_BP7a.get(1)), qbCint(g.V_1778)); // 7687
        L_BP8c.set(g.s(L_BP8c.get(1)), qbCint(g.V_1778)); // 7688
        L_BP46 = g.s(0.0); // 7689
        L_BP274 = g.s(L_BP7a.get(0) - 1.0); // 7690
        g.V_1778 = g.s(1.0); // 7691
        lim22 = g.s(L_BP274);
        passo22 = g.s(1);
        if (passo22 >= 0 ? g.V_1778 > lim22 : g.V_1778 < lim22) {
          pc = 209;
          continue;
        }
        pc = 208;
        continue;
      case 208:
        L_BP46 = g.s(
          ((L_BP7a.get(qbCint(g.V_1778)) + L_BP7a.get(qbCint(g.V_1778 + 1.0))) *
            (L_BP8c.get(qbCint(g.V_1778)) - L_BP8c.get(qbCint(g.V_1778 + 1.0)))) /
            2.0 +
            L_BP46,
        ); // 7692
        g.V_1778 = g.s(g.V_1778 + passo22); // 7693
        if (passo22 >= 0 ? g.V_1778 <= lim22 : g.V_1778 >= lim22) {
          pc = 208;
          continue;
        }
        pc = 209;
        continue;
      case 209:
        L_BP46 = g.s(Math.abs(L_BP46)); // 7694
        pilha.push(210);
        pc = 82;
        continue; // 7695
      case 210:
        if (!(Math.abs(L_BP278) > 0.0)) {
          pc = 81;
          continue;
        } // 7696
        L_BP5a = g.s(Math.abs(L_BP278) * g.A_1014.get(qbCint(g.V_0f14 + 1.0), 0) + L_BP5a); // 7697
        L_BP5e = g.s(Math.abs(L_BP278) * g.A_1014.get(qbCint(g.V_0f14 + 1.0), 1) + L_BP5e); // 7698
        L_BP27c = g.s(Math.abs(L_BP278) * g.A_1014.get(qbCint(g.V_0f14 + 1.0), 0) + L_BP27c); // 7699
        pc = 81;
        continue;
      case 81:
        // L_53598
        g.V_0f14 = g.s(g.A_1014.get(qbCint(g.V_0f14), 0) + g.V_0f14 + 2.0); // 7701
        g.V_0f04 = g.s(g.V_0f04 + passo20); // 7702
        if (passo20 >= 0 ? g.V_0f04 <= lim20 : g.V_0f04 >= lim20) {
          pc = 204;
          continue;
        }
        pc = 205;
        continue;
      case 205:
        pc = pilha.pop() ?? 0;
        continue; // 7703
      case 82:
        // L_53607
        L_BP2e = g.s(L_BP7a.get(1) + g.V_133a); // 7705
        L_BP32 = g.s(L_BP8c.get(1) + g.V_133a); // 7706
        L_BP36 = g.s(L_BP7a.get(1) - g.V_133a); // 7707
        L_BP3a = g.s(L_BP8c.get(1) - g.V_133a); // 7708
        L_BP280 = g.s(L_BP7a.get(0) - 1.0); // 7709
        g.V_1778 = g.s(2.0); // 7710
        lim23 = g.s(L_BP280);
        passo23 = g.s(1);
        if (passo23 >= 0 ? g.V_1778 > lim23 : g.V_1778 < lim23) {
          pc = 212;
          continue;
        }
        pc = 211;
        continue;
      case 211:
        L_BP284 = g.s(L_BP2e + g.V_133a); // 7711
        L_BP288 = g.s(L_BP7a.get(qbCint(g.V_1778))); // 7712
        L_BP28c = g.s(L_BP284 < L_BP288 ? L_BP284 : L_BP288); // 7713
        L_BP7a.set(g.s(L_BP288), qbCint(g.V_1778)); // 7715
        L_BP2e = g.s(L_BP28c); // 7716
        L_BP290 = g.s(L_BP32 + g.V_133a); // 7717
        L_BP294 = g.s(L_BP8c.get(qbCint(g.V_1778))); // 7718
        L_BP298 = g.s(L_BP290 < L_BP294 ? L_BP290 : L_BP294); // 7719
        L_BP8c.set(g.s(L_BP294), qbCint(g.V_1778)); // 7721
        L_BP32 = g.s(L_BP298); // 7722
        L_BP29c = g.s(L_BP36 - g.V_133a); // 7723
        L_BP2a0 = g.s(L_BP7a.get(qbCint(g.V_1778))); // 7724
        L_BP2a4 = g.s(L_BP29c > L_BP2a0 ? L_BP29c : L_BP2a0); // 7725
        L_BP7a.set(g.s(L_BP2a0), qbCint(g.V_1778)); // 7727
        L_BP36 = g.s(L_BP2a4); // 7728
        L_BP2a8 = g.s(L_BP3a - g.V_133a); // 7729
        L_BP2ac = g.s(L_BP8c.get(qbCint(g.V_1778))); // 7730
        L_BP2b0 = g.s(L_BP2a8 > L_BP2ac ? L_BP2a8 : L_BP2ac); // 7731
        L_BP8c.set(g.s(L_BP2ac), qbCint(g.V_1778)); // 7733
        L_BP3a = g.s(L_BP2b0); // 7734
        g.V_1778 = g.s(g.V_1778 + passo23); // 7735
        if (passo23 >= 0 ? g.V_1778 <= lim23 : g.V_1778 >= lim23) {
          pc = 211;
          continue;
        }
        pc = 212;
        continue;
      case 212:
        L_BP278 = g.s(0.0); // 7736
        if (!(L_BP36 <= L_BP1e || L_BP2e >= L_BP26 || L_BP3a <= L_BP22 || L_BP32 >= L_BP2a)) {
          pc = 83;
          continue;
        } // 7737
        pc = pilha.pop() ?? 0;
        continue; // 7738
      case 83:
        // L_53955
        L_BP9e = g.matriz("%", []); // 7740
        L_BP9e = g.matriz("%", [[0, 50]]); // 7741
        L_BP158 = g.s(1.0); // 7742
        L_BP2b4 = g.s(L_BP7a.get(0) - 1.0); // 7743
        g.V_0ef0 = g.s(1.0); // 7744
        lim24 = g.s(L_BP2b4);
        passo24 = g.s(1);
        if (passo24 >= 0 ? g.V_0ef0 > lim24 : g.V_0ef0 < lim24) {
          pc = 214;
          continue;
        }
        pc = 213;
        continue;
      case 213:
        g.V_0ef4 = L_BP7a.get(qbCint(g.V_0ef0)); // 7745
        g.V_0efc = L_BP8c.get(qbCint(g.V_0ef0)); // 7746
        pilha.push(215);
        pc = 35;
        continue; // 7747
      case 215:
        if (!(g.V_178c / 2.0 !== qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 84;
          continue;
        } // 7748
        L_BP9e.set(qbCint(1), qbCint(g.V_0ef0)); // 7749
        pc = 84;
        continue;
      case 84:
        // L_53a73
        g.V_0ef0 = g.s(g.V_0ef0 + passo24); // 7751
        if (passo24 >= 0 ? g.V_0ef0 <= lim24 : g.V_0ef0 >= lim24) {
          pc = 213;
          continue;
        }
        pc = 214;
        continue;
      case 214:
        L_BPb4 = g.matriz("!", []); // 7752
        L_BPb4 = g.matriz("!", [
          [0, 1],
          [0, 1],
        ]); // 7753
        L_BP2b8 = g.s(g.A_15b0.get(0) - 1.0); // 7754
        g.V_0ef0 = g.s(1.0); // 7755
        lim25 = g.s(L_BP2b8);
        passo25 = g.s(1);
        if (passo25 >= 0 ? g.V_0ef0 > lim25 : g.V_0ef0 < lim25) {
          pc = 217;
          continue;
        }
        pc = 216;
        continue;
      case 216:
        g.V_16d0 = g.A_15b0.get(qbCint(g.V_0ef0)); // 7756
        g.V_16d8 = g.A_15de.get(qbCint(g.V_0ef0)); // 7757
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_0ef0 + 1.0)); // 7758
        g.V_16e8 = g.A_15de.get(qbCint(g.V_0ef0 + 1.0)); // 7759
        L_BP2bc = g.s(L_BP7a.get(0) - 1.0); // 7760
        L_BP68 = g.s(1.0); // 7761
        lim26 = g.s(L_BP2bc);
        passo26 = g.s(1);
        if (passo26 >= 0 ? L_BP68 > lim26 : L_BP68 < lim26) {
          pc = 219;
          continue;
        }
        pc = 218;
        continue;
      case 218:
        g.V_16f0 = L_BP7a.get(qbCint(L_BP68)); // 7762
        g.V_16f8 = L_BP8c.get(qbCint(L_BP68)); // 7763
        g.V_1700 = L_BP7a.get(qbCint(L_BP68 + 1.0)); // 7764
        g.V_1708 = L_BP8c.get(qbCint(L_BP68 + 1.0)); // 7765
        S_2018c(g); // 7766
        if (
          !(
            (Math.abs(g.V_0efc - g.V_16e8) < g.V_133a &&
              Math.abs(g.V_0ef4 - g.V_16e0) < g.V_133a) ||
            (Math.abs(g.V_0efc - g.V_16d8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_16d0) < g.V_133a)
          )
        ) {
          pc = 85;
          continue;
        } // 7768
        g.V_0f1c = "NAO"; // 7769
        pc = 85;
        continue;
      case 85:
        // L_53d26
        if (
          !(
            (Math.abs(g.V_0efc - g.V_1708) < g.V_133a &&
              Math.abs(g.V_0ef4 - g.V_1700) < g.V_133a) ||
            (Math.abs(g.V_0efc - g.V_16f8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_16f0) < g.V_133a)
          )
        ) {
          pc = 86;
          continue;
        } // 7771
        g.V_0f1c = "NAO"; // 7772
        pc = 86;
        continue;
      case 86:
        // L_53dcc
        if (!(g.V_0f1c === "")) {
          pc = 88;
          continue;
        } // 7774
        g.V_17e0 = g.V_16f0; // 7775
        g.V_17f0 = g.V_16f8; // 7776
        g.V_17e8 = g.V_1700; // 7777
        g.V_17f8 = g.V_1708; // 7778
        L_BP64 = qbCint(2); // 7779
        L_BP3e = g.s(1.0); // 7780
        pilha.push(220);
        pc = 58;
        continue; // 7781
      case 220:
        if (!(L_BP3e === 1.0)) {
          pc = 87;
          continue;
        } // 7782
        L_BPb4.set(g.s(L_BPb4.get(0, 0) + 1.0), 0, 0); // 7783
        pc = 87;
        continue;
      case 87:
        // L_53e9e
        pc = 88;
        continue;
      case 88:
        // L_53ea3
        L_BP68 = g.s(L_BP68 + passo26); // 7786
        if (passo26 >= 0 ? L_BP68 <= lim26 : L_BP68 >= lim26) {
          pc = 218;
          continue;
        }
        pc = 219;
        continue;
      case 219:
        g.V_0ef0 = g.s(g.V_0ef0 + passo25); // 7787
        if (passo25 >= 0 ? g.V_0ef0 <= lim25 : g.V_0ef0 >= lim25) {
          pc = 216;
          continue;
        }
        pc = 217;
        continue;
      case 217:
        L_BP2c0 = g.s(L_BP7a.get(0) - 1.0); // 7788
        g.V_0ef0 = g.s(1.0); // 7789
        lim27 = g.s(L_BP2c0);
        passo27 = g.s(1);
        if (passo27 >= 0 ? g.V_0ef0 > lim27 : g.V_0ef0 < lim27) {
          pc = 222;
          continue;
        }
        pc = 221;
        continue;
      case 221:
        L_BPb4.set(g.s(L_BP9e.get(qbCint(g.V_0ef0)) + L_BPb4.get(0, 1)), 0, 1); // 7790
        g.V_0ef0 = g.s(g.V_0ef0 + passo27); // 7791
        if (passo27 >= 0 ? g.V_0ef0 <= lim27 : g.V_0ef0 >= lim27) {
          pc = 221;
          continue;
        }
        pc = 222;
        continue;
      case 222:
        if (!(L_BPb4.get(0, 0) === 0.0 && L_BPb4.get(0, 1) === L_BP7a.get(0) - 1.0)) {
          pc = 89;
          continue;
        } // 7792
        L_BP278 = g.s(L_BP46); // 7793
        pc = pilha.pop() ?? 0;
        continue; // 7794
      case 89:
        // L_54039
        if (!(L_BPb4.get(0, 0) === 0.0)) {
          pc = 92;
          continue;
        } // 7796
        L_BP2c4 = g.s(g.A_15b0.get(0)); // 7797
        L_BP2c8 = g.s(L_BP7a.get(0)); // 7798
        L_BP2cc = g.s(L_BP2c4 > L_BP2c8 ? L_BP2c4 : L_BP2c8); // 7799
        L_BP7a.set(g.s(L_BP2c8), 0); // 7801
        g.A_15b0.set(g.s(L_BP2c4), 0); // 7802
        L_BP2d0 = g.s(L_BP2cc); // 7803
        g.V_0ef0 = g.s(0.0); // 7804
        lim28 = g.s(L_BP2d0);
        passo28 = g.s(1);
        if (passo28 >= 0 ? g.V_0ef0 > lim28 : g.V_0ef0 < lim28) {
          pc = 224;
          continue;
        }
        pc = 223;
        continue;
      case 223:
        {
          const t = g.A_15b0.get(qbCint(g.V_0ef0));
          g.A_15b0.set(L_BP7a.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP7a.set(t, qbCint(g.V_0ef0));
        } // 7805
        {
          const t = g.A_15de.get(qbCint(g.V_0ef0));
          g.A_15de.set(L_BP8c.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP8c.set(t, qbCint(g.V_0ef0));
        } // 7806
        g.V_0ef0 = g.s(g.V_0ef0 + passo28); // 7807
        if (passo28 >= 0 ? g.V_0ef0 <= lim28 : g.V_0ef0 >= lim28) {
          pc = 223;
          continue;
        }
        pc = 224;
        continue;
      case 224:
        L_BP9e = g.matriz("%", []); // 7808
        L_BP9e = g.matriz("%", [[0, 1]]); // 7809
        L_BP158 = g.s(1.0); // 7810
        L_BP2d4 = g.s(L_BP7a.get(0) - 1.0); // 7811
        g.V_0ef0 = g.s(1.0); // 7812
        lim29 = g.s(L_BP2d4);
        passo29 = g.s(1);
        if (passo29 >= 0 ? g.V_0ef0 > lim29 : g.V_0ef0 < lim29) {
          pc = 226;
          continue;
        }
        pc = 225;
        continue;
      case 225:
        g.V_0ef4 = L_BP7a.get(qbCint(g.V_0ef0)); // 7813
        g.V_0efc = L_BP8c.get(qbCint(g.V_0ef0)); // 7814
        pilha.push(227);
        pc = 35;
        continue; // 7815
      case 227:
        if (!(g.V_178c / 2.0 !== qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 90;
          continue;
        } // 7816
        L_BP9e.set(qbCint(L_BP9e.get(1) + 1), 1); // 7817
        pc = 90;
        continue;
      case 90:
        // L_542c2
        g.V_0ef0 = g.s(g.V_0ef0 + passo29); // 7819
        if (passo29 >= 0 ? g.V_0ef0 <= lim29 : g.V_0ef0 >= lim29) {
          pc = 225;
          continue;
        }
        pc = 226;
        continue;
      case 226:
        if (!(L_BP9e.get(1) === L_BP7a.get(0) - 1.0)) {
          pc = 91;
          continue;
        } // 7820
        L_BP278 = g.s(L_BP42); // 7821
        pc = 91;
        continue;
      case 91:
        // L_5433a
        L_BP2d8 = g.s(g.A_15b0.get(0)); // 7823
        L_BP2dc = g.s(L_BP7a.get(0)); // 7824
        L_BP2e0 = g.s(L_BP2d8 > L_BP2dc ? L_BP2d8 : L_BP2dc); // 7825
        L_BP7a.set(g.s(L_BP2dc), 0); // 7827
        g.A_15b0.set(g.s(L_BP2d8), 0); // 7828
        L_BP2e4 = g.s(L_BP2e0); // 7829
        g.V_0ef0 = g.s(0.0); // 7830
        lim30 = g.s(L_BP2e4);
        passo30 = g.s(1);
        if (passo30 >= 0 ? g.V_0ef0 > lim30 : g.V_0ef0 < lim30) {
          pc = 229;
          continue;
        }
        pc = 228;
        continue;
      case 228:
        {
          const t = g.A_15b0.get(qbCint(g.V_0ef0));
          g.A_15b0.set(L_BP7a.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP7a.set(t, qbCint(g.V_0ef0));
        } // 7831
        {
          const t = g.A_15de.get(qbCint(g.V_0ef0));
          g.A_15de.set(L_BP8c.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP8c.set(t, qbCint(g.V_0ef0));
        } // 7832
        g.V_0ef0 = g.s(g.V_0ef0 + passo30); // 7833
        if (passo30 >= 0 ? g.V_0ef0 <= lim30 : g.V_0ef0 >= lim30) {
          pc = 228;
          continue;
        }
        pc = 229;
        continue;
      case 229:
        pc = pilha.pop() ?? 0;
        continue; // 7834
      case 92:
        // L_54484
        L_BPb4 = g.matriz("!", []); // 7836
        L_BPb4 = g.matriz("!", [
          [0, 50],
          [0, 3],
        ]); // 7837
        L_BPb4.set(g.s(g.A_15b0.get(0) - 1.0), 0, 0); // 7838
        L_BP2e8 = g.s(g.A_15b0.get(0) - 1.0); // 7839
        g.V_0ef0 = g.s(1.0); // 7840
        lim31 = g.s(L_BP2e8);
        passo31 = g.s(1);
        if (passo31 >= 0 ? g.V_0ef0 > lim31 : g.V_0ef0 < lim31) {
          pc = 231;
          continue;
        }
        pc = 230;
        continue;
      case 230:
        L_BPb4.set(g.s(g.A_15b0.get(qbCint(g.V_0ef0))), qbCint(g.V_0ef0), 0); // 7841
        L_BPb4.set(g.s(g.A_15de.get(qbCint(g.V_0ef0))), qbCint(g.V_0ef0), 1); // 7842
        L_BPb4.set(g.s(g.A_15b0.get(qbCint(g.V_0ef0 + 1.0))), qbCint(g.V_0ef0), 2); // 7843
        L_BPb4.set(g.s(g.A_15de.get(qbCint(g.V_0ef0 + 1.0))), qbCint(g.V_0ef0), 3); // 7844
        g.V_0ef0 = g.s(g.V_0ef0 + passo31); // 7845
        if (passo31 >= 0 ? g.V_0ef0 <= lim31 : g.V_0ef0 >= lim31) {
          pc = 230;
          continue;
        }
        pc = 231;
        continue;
      case 231:
        L_BPb4.set(g.s(L_BP7a.get(0) - 1.0 + L_BPb4.get(0, 0)), 0, 0); // 7846
        L_BP2ec = g.s(L_BP7a.get(0) - 1.0); // 7847
        g.V_0ef0 = g.s(1.0); // 7848
        lim32 = g.s(L_BP2ec);
        passo32 = g.s(1);
        if (passo32 >= 0 ? g.V_0ef0 > lim32 : g.V_0ef0 < lim32) {
          pc = 233;
          continue;
        }
        pc = 232;
        continue;
      case 232:
        L_BPb4.set(g.s(L_BP7a.get(qbCint(g.V_0ef0))), qbCint(g.A_15b0.get(0) - 1.0 + g.V_0ef0), 0); // 7849
        L_BPb4.set(g.s(L_BP8c.get(qbCint(g.V_0ef0))), qbCint(g.A_15b0.get(0) - 1.0 + g.V_0ef0), 1); // 7850
        L_BPb4.set(
          g.s(L_BP7a.get(qbCint(g.V_0ef0 + 1.0))),
          qbCint(g.A_15b0.get(0) - 1.0 + g.V_0ef0),
          2,
        ); // 7851
        L_BPb4.set(
          g.s(L_BP8c.get(qbCint(g.V_0ef0 + 1.0))),
          qbCint(g.A_15b0.get(0) - 1.0 + g.V_0ef0),
          3,
        ); // 7852
        g.V_0ef0 = g.s(g.V_0ef0 + passo32); // 7853
        if (passo32 >= 0 ? g.V_0ef0 <= lim32 : g.V_0ef0 >= lim32) {
          pc = 232;
          continue;
        }
        pc = 233;
        continue;
      case 233:
        g.V_0ef0 = g.s(1.0); // 7854
        pc = 93;
        continue;
      case 93:
        // L_5487a
        g.V_16d0 = L_BPb4.get(qbCint(g.V_0ef0), 0); // 7856
        g.V_16d8 = L_BPb4.get(qbCint(g.V_0ef0), 1); // 7857
        g.V_16e0 = L_BPb4.get(qbCint(g.V_0ef0), 2); // 7858
        g.V_16e8 = L_BPb4.get(qbCint(g.V_0ef0), 3); // 7859
        L_BP68 = g.s(g.V_0ef0 + 1.0); // 7860
        pc = 94;
        continue;
      case 94:
        // L_54940
        g.V_16f0 = L_BPb4.get(qbCint(L_BP68), 0); // 7862
        g.V_16f8 = L_BPb4.get(qbCint(L_BP68), 1); // 7863
        g.V_1700 = L_BPb4.get(qbCint(L_BP68), 2); // 7864
        g.V_1708 = L_BPb4.get(qbCint(L_BP68), 3); // 7865
        S_2018c(g); // 7866
        if (
          !(
            (Math.abs(g.V_0efc - g.V_16e8) < g.V_133a &&
              Math.abs(g.V_0ef4 - g.V_16e0) < g.V_133a) ||
            (Math.abs(g.V_0efc - g.V_16d8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_16d0) < g.V_133a)
          )
        ) {
          pc = 96;
          continue;
        } // 7868
        if (
          !(
            (Math.abs(g.V_0efc - g.V_1708) < g.V_133a &&
              Math.abs(g.V_0ef4 - g.V_1700) < g.V_133a) ||
            (Math.abs(g.V_0efc - g.V_16f8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_16f0) < g.V_133a)
          )
        ) {
          pc = 95;
          continue;
        } // 7869
        g.V_0f1c = "NAO"; // 7870
        pc = 95;
        continue;
      case 95:
        // L_54b2c
        pc = 96;
        continue;
      case 96:
        // L_54b31
        if (!(g.V_0f1c === "")) {
          pc = 100;
          continue;
        } // 7873
        g.V_17e0 = g.V_16f0; // 7874
        g.V_17f0 = g.V_16f8; // 7875
        g.V_17e8 = g.V_1700; // 7876
        g.V_17f8 = g.V_1708; // 7877
        L_BP64 = qbCint(2); // 7878
        L_BP3e = g.s(1.0); // 7879
        pilha.push(234);
        pc = 58;
        continue; // 7880
      case 234:
        if (!(L_BP3e === 1.0)) {
          pc = 99;
          continue;
        } // 7881
        if (
          !(
            (Math.abs(g.V_0efc - g.V_16e8) > g.V_133a ||
              Math.abs(g.V_0ef4 - g.V_16e0) > g.V_133a) &&
            (Math.abs(g.V_0efc - g.V_16d8) > g.V_133a || Math.abs(g.V_0ef4 - g.V_16d0) > g.V_133a)
          )
        ) {
          pc = 97;
          continue;
        } // 7882
        L_BPb4.set(g.s(L_BPb4.get(0, 0) + 1.0), 0, 0); // 7883
        L_BPb4.set(g.s(g.V_0ef4), qbCint(L_BPb4.get(0, 0)), 0); // 7884
        L_BPb4.set(g.s(g.V_0efc), qbCint(L_BPb4.get(0, 0)), 1); // 7885
        L_BPb4.set(g.s(L_BPb4.get(qbCint(g.V_0ef0), 2)), qbCint(L_BPb4.get(0, 0)), 2); // 7886
        L_BPb4.set(g.s(L_BPb4.get(qbCint(g.V_0ef0), 3)), qbCint(L_BPb4.get(0, 0)), 3); // 7887
        L_BPb4.set(g.s(g.V_0ef4), qbCint(g.V_0ef0), 2); // 7888
        L_BPb4.set(g.s(g.V_0efc), qbCint(g.V_0ef0), 3); // 7889
        g.V_16e0 = g.V_0ef4; // 7890
        g.V_16e8 = g.V_0efc; // 7891
        pc = 97;
        continue;
      case 97:
        // L_54e32
        if (
          !(
            (Math.abs(g.V_0efc - g.V_1708) > g.V_133a ||
              Math.abs(g.V_0ef4 - g.V_1700) > g.V_133a) &&
            (Math.abs(g.V_0efc - g.V_16f8) > g.V_133a || Math.abs(g.V_0ef4 - g.V_16f0) > g.V_133a)
          )
        ) {
          pc = 98;
          continue;
        } // 7893
        L_BPb4.set(g.s(L_BPb4.get(0, 0) + 1.0), 0, 0); // 7894
        L_BPb4.set(g.s(g.V_0ef4), qbCint(L_BPb4.get(0, 0)), 0); // 7895
        L_BPb4.set(g.s(g.V_0efc), qbCint(L_BPb4.get(0, 0)), 1); // 7896
        L_BPb4.set(g.s(L_BPb4.get(qbCint(L_BP68), 2)), qbCint(L_BPb4.get(0, 0)), 2); // 7897
        L_BPb4.set(g.s(L_BPb4.get(qbCint(L_BP68), 3)), qbCint(L_BPb4.get(0, 0)), 3); // 7898
        L_BPb4.set(g.s(g.V_0ef4), qbCint(L_BP68), 2); // 7899
        L_BPb4.set(g.s(g.V_0efc), qbCint(L_BP68), 3); // 7900
        pc = 98;
        continue;
      case 98:
        // L_55071
        pc = 99;
        continue;
      case 99:
        // L_55076
        pc = 100;
        continue;
      case 100:
        // L_5507b
        L_BP68 = g.s(L_BP68 + 1.0); // 7904
        if (!(L_BPb4.get(0, 0) < L_BP68)) {
          pc = 94;
          continue;
        } // 7905
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 7906
        if (!(L_BPb4.get(0, 0) <= g.V_0ef0)) {
          pc = 93;
          continue;
        } // 7907
        L_BP9e = g.matriz("%", []); // 7908
        L_BP9e = g.matriz("%", [[0, 50]]); // 7909
        L_BP158 = g.s(1.0); // 7910
        L_BP2f0 = g.s(L_BP7a.get(0) - 1.0); // 7911
        g.V_0ef0 = g.s(1.0); // 7912
        lim33 = g.s(L_BP2f0);
        passo33 = g.s(1);
        if (passo33 >= 0 ? g.V_0ef0 > lim33 : g.V_0ef0 < lim33) {
          pc = 236;
          continue;
        }
        pc = 235;
        continue;
      case 235:
        g.V_0ef4 = L_BP7a.get(qbCint(g.V_0ef0)); // 7913
        g.V_0efc = L_BP8c.get(qbCint(g.V_0ef0)); // 7914
        pilha.push(237);
        pc = 35;
        continue; // 7915
      case 237:
        if (!(g.V_178c / 2.0 !== qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 101;
          continue;
        } // 7916
        L_BP9e.set(qbCint(1), qbCint(g.V_0ef0)); // 7917
        pc = 101;
        continue;
      case 101:
        // L_55217
        g.V_0ef0 = g.s(g.V_0ef0 + passo33); // 7919
        if (passo33 >= 0 ? g.V_0ef0 <= lim33 : g.V_0ef0 >= lim33) {
          pc = 235;
          continue;
        }
        pc = 236;
        continue;
      case 236:
        L_BP2f4 = g.s(L_BP7a.get(0) - 1.0); // 7920
        g.V_0ef0 = g.s(1.0); // 7921
        lim34 = g.s(L_BP2f4);
        passo34 = g.s(1);
        if (passo34 >= 0 ? g.V_0ef0 > lim34 : g.V_0ef0 < lim34) {
          pc = 239;
          continue;
        }
        pc = 238;
        continue;
      case 238:
        if (!(L_BP9e.get(qbCint(g.V_0ef0)) === 0)) {
          pc = 105;
          continue;
        } // 7922
        g.V_0ef4 = L_BP7a.get(qbCint(g.V_0ef0)); // 7923
        g.V_0efc = L_BP8c.get(qbCint(g.V_0ef0)); // 7924
        L_BP68 = g.s(1.0); // 7925
        pc = 102;
        continue;
      case 102:
        // L_552fc
        if (
          !(
            (Math.abs(g.V_0efc - L_BPb4.get(qbCint(L_BP68), 3)) < g.V_133a &&
              Math.abs(g.V_0ef4 - L_BPb4.get(qbCint(L_BP68), 2)) < g.V_133a) ||
            (Math.abs(g.V_0efc - L_BPb4.get(qbCint(L_BP68), 1)) < g.V_133a &&
              Math.abs(g.V_0ef4 - L_BPb4.get(qbCint(L_BP68), 0)) < g.V_133a)
          )
        ) {
          pc = 103;
          continue;
        } // 7927
        pilha.push(240);
        pc = 154;
        continue; // 7928
      case 240:
        pc = 104;
        continue; // 7929
      case 103:
        // L_5541b
        L_BP68 = g.s(L_BP68 + 1.0); // 7931
        pc = 104;
        continue;
      case 104:
        // L_55434
        if (!(L_BPb4.get(0, 0) < L_BP68)) {
          pc = 102;
          continue;
        } // 7933
        pc = 105;
        continue;
      case 105:
        // L_55463
        g.V_0ef0 = g.s(g.V_0ef0 + passo34); // 7935
        if (passo34 >= 0 ? g.V_0ef0 <= lim34 : g.V_0ef0 >= lim34) {
          pc = 238;
          continue;
        }
        pc = 239;
        continue;
      case 239:
        L_BP2f8 = g.s(g.A_15b0.get(0)); // 7936
        L_BP2fc = g.s(L_BP7a.get(0)); // 7937
        L_BP300 = g.s(L_BP2f8 > L_BP2fc ? L_BP2f8 : L_BP2fc); // 7938
        L_BP7a.set(g.s(L_BP2fc), 0); // 7940
        g.A_15b0.set(g.s(L_BP2f8), 0); // 7941
        L_BP304 = g.s(L_BP300); // 7942
        g.V_0ef0 = g.s(0.0); // 7943
        lim35 = g.s(L_BP304);
        passo35 = g.s(1);
        if (passo35 >= 0 ? g.V_0ef0 > lim35 : g.V_0ef0 < lim35) {
          pc = 242;
          continue;
        }
        pc = 241;
        continue;
      case 241:
        {
          const t = g.A_15b0.get(qbCint(g.V_0ef0));
          g.A_15b0.set(L_BP7a.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP7a.set(t, qbCint(g.V_0ef0));
        } // 7944
        {
          const t = g.A_15de.get(qbCint(g.V_0ef0));
          g.A_15de.set(L_BP8c.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP8c.set(t, qbCint(g.V_0ef0));
        } // 7945
        g.V_0ef0 = g.s(g.V_0ef0 + passo35); // 7946
        if (passo35 >= 0 ? g.V_0ef0 <= lim35 : g.V_0ef0 >= lim35) {
          pc = 241;
          continue;
        }
        pc = 242;
        continue;
      case 242:
        L_BP9e = g.matriz("%", []); // 7947
        L_BP9e = g.matriz("%", [[0, 50]]); // 7948
        L_BP158 = g.s(1.0); // 7949
        L_BP308 = g.s(L_BP7a.get(0) - 1.0); // 7950
        g.V_0ef0 = g.s(1.0); // 7951
        lim36 = g.s(L_BP308);
        passo36 = g.s(1);
        if (passo36 >= 0 ? g.V_0ef0 > lim36 : g.V_0ef0 < lim36) {
          pc = 244;
          continue;
        }
        pc = 243;
        continue;
      case 243:
        g.V_0ef4 = L_BP7a.get(qbCint(g.V_0ef0)); // 7952
        g.V_0efc = L_BP8c.get(qbCint(g.V_0ef0)); // 7953
        pilha.push(245);
        pc = 35;
        continue; // 7954
      case 245:
        if (!(g.V_178c / 2.0 !== qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 106;
          continue;
        } // 7955
        L_BP9e.set(qbCint(1), qbCint(g.V_0ef0)); // 7956
        pc = 106;
        continue;
      case 106:
        // L_556e7
        g.V_0ef0 = g.s(g.V_0ef0 + passo36); // 7958
        if (passo36 >= 0 ? g.V_0ef0 <= lim36 : g.V_0ef0 >= lim36) {
          pc = 243;
          continue;
        }
        pc = 244;
        continue;
      case 244:
        L_BP30c = g.s(L_BP7a.get(0) - 1.0); // 7959
        g.V_0ef0 = g.s(1.0); // 7960
        lim37 = g.s(L_BP30c);
        passo37 = g.s(1);
        if (passo37 >= 0 ? g.V_0ef0 > lim37 : g.V_0ef0 < lim37) {
          pc = 247;
          continue;
        }
        pc = 246;
        continue;
      case 246:
        if (!(L_BP9e.get(qbCint(g.V_0ef0)) === 0)) {
          pc = 110;
          continue;
        } // 7961
        g.V_0ef4 = L_BP7a.get(qbCint(g.V_0ef0)); // 7962
        g.V_0efc = L_BP8c.get(qbCint(g.V_0ef0)); // 7963
        L_BP68 = g.s(1.0); // 7964
        pc = 107;
        continue;
      case 107:
        // L_557cc
        if (
          !(
            (Math.abs(g.V_0efc - L_BPb4.get(qbCint(L_BP68), 3)) < g.V_133a &&
              Math.abs(g.V_0ef4 - L_BPb4.get(qbCint(L_BP68), 2)) < g.V_133a) ||
            (Math.abs(g.V_0efc - L_BPb4.get(qbCint(L_BP68), 1)) < g.V_133a &&
              Math.abs(g.V_0ef4 - L_BPb4.get(qbCint(L_BP68), 0)) < g.V_133a)
          )
        ) {
          pc = 108;
          continue;
        } // 7966
        pilha.push(248);
        pc = 154;
        continue; // 7967
      case 248:
        pc = 109;
        continue; // 7968
      case 108:
        // L_558eb
        L_BP68 = g.s(L_BP68 + 1.0); // 7970
        pc = 109;
        continue;
      case 109:
        // L_55904
        if (!(L_BPb4.get(0, 0) < L_BP68)) {
          pc = 107;
          continue;
        } // 7972
        pc = 110;
        continue;
      case 110:
        // L_55933
        g.V_0ef0 = g.s(g.V_0ef0 + passo37); // 7974
        if (passo37 >= 0 ? g.V_0ef0 <= lim37 : g.V_0ef0 >= lim37) {
          pc = 246;
          continue;
        }
        pc = 247;
        continue;
      case 247:
        L_BP310 = g.s(g.A_15b0.get(0)); // 7975
        L_BP314 = g.s(L_BP7a.get(0)); // 7976
        L_BP318 = g.s(L_BP310 > L_BP314 ? L_BP310 : L_BP314); // 7977
        L_BP7a.set(g.s(L_BP314), 0); // 7979
        g.A_15b0.set(g.s(L_BP310), 0); // 7980
        L_BP31c = g.s(L_BP318); // 7981
        g.V_0ef0 = g.s(0.0); // 7982
        lim38 = g.s(L_BP31c);
        passo38 = g.s(1);
        if (passo38 >= 0 ? g.V_0ef0 > lim38 : g.V_0ef0 < lim38) {
          pc = 250;
          continue;
        }
        pc = 249;
        continue;
      case 249:
        {
          const t = g.A_15b0.get(qbCint(g.V_0ef0));
          g.A_15b0.set(L_BP7a.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP7a.set(t, qbCint(g.V_0ef0));
        } // 7983
        {
          const t = g.A_15de.get(qbCint(g.V_0ef0));
          g.A_15de.set(L_BP8c.get(qbCint(g.V_0ef0)), qbCint(g.V_0ef0));
          L_BP8c.set(t, qbCint(g.V_0ef0));
        } // 7984
        g.V_0ef0 = g.s(g.V_0ef0 + passo38); // 7985
        if (passo38 >= 0 ? g.V_0ef0 <= lim38 : g.V_0ef0 >= lim38) {
          pc = 249;
          continue;
        }
        pc = 250;
        continue;
      case 250:
        g.V_0ef0 = g.s(1.0); // 7986
        pc = 111;
        continue;
      case 111:
        // L_55ab0
        L_BP68 = g.s(g.V_0ef0 + 1.0); // 7988
        pc = 112;
        continue;
      case 112:
        // L_55aca
        if (
          !(
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 2) - L_BPb4.get(qbCint(L_BP68), 2)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 3) - L_BPb4.get(qbCint(L_BP68), 3)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 1) - L_BPb4.get(qbCint(L_BP68), 1)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 0) - L_BPb4.get(qbCint(L_BP68), 0)) < g.V_133a
          )
        ) {
          pc = 113;
          continue;
        } // 7990
        pc = 115;
        continue; // 7991
      case 113:
        // L_55c38
        if (
          !(
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 2) - L_BPb4.get(qbCint(L_BP68), 0)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 3) - L_BPb4.get(qbCint(L_BP68), 1)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 1) - L_BPb4.get(qbCint(L_BP68), 3)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 0) - L_BPb4.get(qbCint(L_BP68), 2)) < g.V_133a
          )
        ) {
          pc = 114;
          continue;
        } // 7993
        pc = 115;
        continue; // 7994
      case 114:
        // L_55da6
        pc = 116;
        continue; // 7996
      case 115:
        // L_55db3
        pilha.push(251);
        pc = 154;
        continue; // 7998
      case 251:
        pc = 116;
        continue;
      case 116:
        // L_55dca
        L_BP68 = g.s(L_BP68 + 1.0); // 8000
        if (!(L_BPb4.get(0, 0) < L_BP68)) {
          pc = 112;
          continue;
        } // 8001
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 8002
        if (!(L_BPb4.get(0, 0) <= g.V_0ef0)) {
          pc = 111;
          continue;
        } // 8003
        L_BP68 = g.s(1.0); // 8004
        pc = 117;
        continue;
      case 117:
        // L_55e64
        g.V_1784 = g.s(0.0); // 8006
        g.V_1788 = g.s(0.0); // 8007
        g.V_0ef0 = g.s(1.0); // 8008
        pc = 118;
        continue;
      case 118:
        // L_55e9c
        if (
          !(
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 1) - L_BPb4.get(qbCint(g.V_0ef0), 3)) < g.V_133a &&
              Math.abs(L_BPb4.get(qbCint(L_BP68), 0) - L_BPb4.get(qbCint(g.V_0ef0), 2)) <
                g.V_133a) ||
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 1) - L_BPb4.get(qbCint(g.V_0ef0), 1)) < g.V_133a &&
              Math.abs(L_BPb4.get(qbCint(L_BP68), 0) - L_BPb4.get(qbCint(g.V_0ef0), 0)) < g.V_133a)
          )
        ) {
          pc = 119;
          continue;
        } // 8010
        g.V_1784 = g.s(g.V_1784 + 1.0); // 8011
        pc = 119;
        continue;
      case 119:
        // L_5601f
        if (
          !(
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 3) - L_BPb4.get(qbCint(g.V_0ef0), 3)) < g.V_133a &&
              Math.abs(L_BPb4.get(qbCint(L_BP68), 2) - L_BPb4.get(qbCint(g.V_0ef0), 2)) <
                g.V_133a) ||
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 3) - L_BPb4.get(qbCint(g.V_0ef0), 1)) < g.V_133a &&
              Math.abs(L_BPb4.get(qbCint(L_BP68), 2) - L_BPb4.get(qbCint(g.V_0ef0), 0)) < g.V_133a)
          )
        ) {
          pc = 120;
          continue;
        } // 8013
        g.V_1788 = g.s(g.V_1788 + 1.0); // 8014
        pc = 120;
        continue;
      case 120:
        // L_5619e
        if (!(g.V_1788 > 2.0 && g.V_1784 > 2.0)) {
          pc = 121;
          continue;
        } // 8016
        pc = 122;
        continue; // 8017
      case 121:
        // L_561e4
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 8019
        if (!(L_BPb4.get(0, 0) < g.V_0ef0)) {
          pc = 118;
          continue;
        } // 8020
        pc = 122;
        continue;
      case 122:
        // L_56226
        if (!(g.V_1788 === 1.0 || g.V_1784 === 1.0 || (g.V_1788 > 2.0 && g.V_1784 > 2.0))) {
          pc = 141;
          continue;
        } // 8022
        if (
          !(
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 1) - L_BPb4.get(qbCint(L_BP68), 3)) >= g.V_133a ||
              Math.abs(L_BPb4.get(qbCint(L_BP68), 0) - L_BPb4.get(qbCint(L_BP68), 2)) >=
                g.V_133a) &&
            g.V_1788 > 2.0 &&
            g.V_1784 > 2.0
          )
        ) {
          pc = 140;
          continue;
        } // 8023
        g.V_1778 = g.s(1.0); // 8024
        g.V_16f0 = L_BPb4.get(qbCint(L_BP68), 0); // 8025
        g.V_16f8 = L_BPb4.get(qbCint(L_BP68), 1); // 8026
        g.V_1700 = L_BPb4.get(qbCint(L_BP68), 2); // 8027
        g.V_1708 = L_BPb4.get(qbCint(L_BP68), 3); // 8028
        pc = 123;
        continue;
      case 123:
        // L_56444
        if (!(g.V_1778 !== L_BP68)) {
          pc = 126;
          continue;
        } // 8030
        if (
          !(
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 1) - L_BPb4.get(qbCint(g.V_1778), 3)) < g.V_133a &&
              Math.abs(L_BPb4.get(qbCint(L_BP68), 0) - L_BPb4.get(qbCint(g.V_1778), 2)) <
                g.V_133a) ||
            (Math.abs(L_BPb4.get(qbCint(L_BP68), 1) - L_BPb4.get(qbCint(g.V_1778), 1)) < g.V_133a &&
              Math.abs(L_BPb4.get(qbCint(L_BP68), 0) - L_BPb4.get(qbCint(g.V_1778), 0)) < g.V_133a)
          )
        ) {
          pc = 125;
          continue;
        } // 8031
        g.V_16d0 = L_BPb4.get(qbCint(g.V_1778), 0); // 8032
        g.V_16d8 = L_BPb4.get(qbCint(g.V_1778), 1); // 8033
        g.V_16e0 = L_BPb4.get(qbCint(g.V_1778), 2); // 8034
        g.V_16e8 = L_BPb4.get(qbCint(g.V_1778), 3); // 8035
        S_2018c(g); // 8036
        if (
          !(Math.abs(g.V_0efc - g.V_16f8) >= g.V_133a || Math.abs(g.V_0ef4 - g.V_16f0) >= g.V_133a)
        ) {
          pc = 124;
          continue;
        } // 8038
        pc = 127;
        continue; // 8039
      case 124:
        // L_566d2
        pc = 125;
        continue;
      case 125:
        // L_566d7
        pc = 126;
        continue;
      case 126:
        // L_566dc
        g.V_1778 = g.s(g.V_1778 + 1.0); // 8043
        if (!(L_BPb4.get(0, 0) < g.V_1778)) {
          pc = 123;
          continue;
        } // 8044
        pc = 127;
        continue;
      case 127:
        // L_5671e
        if (!(L_BPb4.get(0, 0) < g.V_1778)) {
          pc = 139;
          continue;
        } // 8046
        g.V_1778 = g.s(1.0); // 8047
        pc = 128;
        continue;
      case 128:
        // L_56760
        if (
          !(
            (Math.abs(g.V_16f8 - L_BPb4.get(qbCint(g.V_1778), 3)) < g.V_133a &&
              Math.abs(g.V_16f0 - L_BPb4.get(qbCint(g.V_1778), 2)) < g.V_133a) ||
            (Math.abs(g.V_16f0 - L_BPb4.get(qbCint(g.V_1778), 0)) < g.V_133a &&
              Math.abs(g.V_16f8 - L_BPb4.get(qbCint(g.V_1778), 1)) < g.V_133a &&
              g.V_1778 !== L_BP68)
          )
        ) {
          pc = 136;
          continue;
        } // 8049
        g.V_16d0 = L_BPb4.get(qbCint(g.V_1778), 0); // 8050
        g.V_16d8 = L_BPb4.get(qbCint(g.V_1778), 1); // 8051
        if (
          !(Math.abs(g.V_16f8 - g.V_16d8) < g.V_133a && Math.abs(g.V_16f0 - g.V_16d0) < g.V_133a)
        ) {
          pc = 129;
          continue;
        } // 8052
        g.V_16d0 = L_BPb4.get(qbCint(g.V_1778), 2); // 8053
        g.V_16d8 = L_BPb4.get(qbCint(g.V_1778), 3); // 8054
        pc = 129;
        continue;
      case 129:
        // L_56989
        g.V_0ef0 = g.s(1.0); // 8056
        pc = 130;
        continue;
      case 130:
        // L_569a0
        if (
          !(
            (Math.abs(g.V_1708 - L_BPb4.get(qbCint(g.V_0ef0), 3)) < g.V_133a &&
              Math.abs(g.V_1700 - L_BPb4.get(qbCint(g.V_0ef0), 2)) < g.V_133a) ||
            (Math.abs(g.V_1700 - L_BPb4.get(qbCint(g.V_0ef0), 0)) < g.V_133a &&
              Math.abs(g.V_1708 - L_BPb4.get(qbCint(g.V_0ef0), 1)) < g.V_133a &&
              g.V_0ef0 !== L_BP68 &&
              g.V_0ef0 !== g.V_1778)
          )
        ) {
          pc = 134;
          continue;
        } // 8058
        g.V_16e0 = L_BPb4.get(qbCint(g.V_0ef0), 0); // 8059
        g.V_16e8 = L_BPb4.get(qbCint(g.V_0ef0), 1); // 8060
        if (
          !(Math.abs(g.V_1708 - g.V_16e8) < g.V_133a && Math.abs(g.V_1700 - g.V_16e0) < g.V_133a)
        ) {
          pc = 131;
          continue;
        } // 8061
        g.V_16e0 = L_BPb4.get(qbCint(g.V_0ef0), 2); // 8062
        g.V_16e8 = L_BPb4.get(qbCint(g.V_0ef0), 3); // 8063
        pc = 131;
        continue;
      case 131:
        // L_56be4
        if (
          !(Math.abs(g.V_16d8 - g.V_16e8) < g.V_133a && Math.abs(g.V_16d0 - g.V_16e0) < g.V_133a)
        ) {
          pc = 133;
          continue;
        } // 8065
        L_BP68 = g.s(g.V_1778); // 8066
        pilha.push(252);
        pc = 154;
        continue; // 8067
      case 252:
        if (!(g.V_0ef0 > g.V_1778)) {
          pc = 132;
          continue;
        } // 8068
        g.V_0ef0 = g.s(g.V_0ef0 - 1.0); // 8069
        pc = 132;
        continue;
      case 132:
        // L_56c80
        L_BP68 = g.s(g.V_0ef0); // 8071
        pilha.push(253);
        pc = 154;
        continue; // 8072
      case 253:
        L_BP68 = g.s(0.0); // 8073
        pc = 135;
        continue; // 8074
      case 133:
        // L_56cba
        pc = 134;
        continue;
      case 134:
        // L_56cbf
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 8077
        if (!(L_BPb4.get(0, 0) < g.V_0ef0)) {
          pc = 130;
          continue;
        } // 8078
        pc = 135;
        continue;
      case 135:
        // L_56d00
        pc = 136;
        continue;
      case 136:
        // L_56d05
        if (!(L_BP68 === 0.0)) {
          pc = 137;
          continue;
        } // 8081
        pc = 138;
        continue; // 8082
      case 137:
        // L_56d27
        g.V_1778 = g.s(g.V_1778 + 1.0); // 8084
        if (!(L_BPb4.get(0, 0) < g.V_1778)) {
          pc = 128;
          continue;
        } // 8085
        pc = 138;
        continue;
      case 138:
        // L_56d68
        pc = 142;
        continue; // 8087
      case 139:
        // L_56d75
        pc = 140;
        continue;
      case 140:
        // L_56d7a
        pilha.push(254);
        pc = 154;
        continue; // 8090
      case 254:
        pc = 143;
        continue; // 8091
      case 141:
        // L_56d8f
        pc = 142;
        continue;
      case 142:
        // L_56d94
        L_BP68 = g.s(L_BP68 + 1.0); // 8094
        pc = 143;
        continue;
      case 143:
        // L_56db2
        if (!(L_BPb4.get(0, 0) < L_BP68)) {
          pc = 117;
          continue;
        } // 8096
        L_BP68 = g.s(1.0); // 8097
        pc = 144;
        continue;
      case 144:
        // L_56df1
        g.V_0ee8 = g.s(0.0); // 8099
        L_BP320 = g.s(L_BPb4.get(0, 0)); // 8100
        g.V_0ef0 = g.s(L_BP68 + 1.0); // 8101
        lim39 = g.s(L_BP320);
        passo39 = g.s(1);
        if (passo39 >= 0 ? g.V_0ef0 > lim39 : g.V_0ef0 < lim39) {
          pc = 256;
          continue;
        }
        pc = 255;
        continue;
      case 255:
        if (
          !(
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 1) - L_BPb4.get(qbCint(L_BP68), 3)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 0) - L_BPb4.get(qbCint(L_BP68), 2)) < g.V_133a
          )
        ) {
          pc = 145;
          continue;
        } // 8102
        pc = 147;
        continue; // 8103
      case 145:
        // L_56ef7
        if (
          !(
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 3) - L_BPb4.get(qbCint(L_BP68), 3)) < g.V_133a &&
            Math.abs(L_BPb4.get(qbCint(g.V_0ef0), 2) - L_BPb4.get(qbCint(L_BP68), 2)) < g.V_133a
          )
        ) {
          pc = 146;
          continue;
        } // 8105
        {
          const t = L_BPb4.get(qbCint(g.V_0ef0), 0);
          L_BPb4.set(L_BPb4.get(qbCint(g.V_0ef0), 2), qbCint(g.V_0ef0), 0);
          L_BPb4.set(t, qbCint(g.V_0ef0), 2);
        } // 8106
        {
          const t = L_BPb4.get(qbCint(g.V_0ef0), 1);
          L_BPb4.set(L_BPb4.get(qbCint(g.V_0ef0), 3), qbCint(g.V_0ef0), 1);
          L_BPb4.set(t, qbCint(g.V_0ef0), 3);
        } // 8107
        pc = 147;
        continue; // 8108
      case 146:
        // L_57040
        pc = 149;
        continue; // 8110
      case 147:
        // L_5704d
        if (!(L_BP68 + 1.0 < g.V_0ef0)) {
          pc = 148;
          continue;
        } // 8112
        {
          const t = L_BPb4.get(qbCint(g.V_0ef0), 0);
          L_BPb4.set(L_BPb4.get(qbCint(L_BP68 + 1.0), 0), qbCint(g.V_0ef0), 0);
          L_BPb4.set(t, qbCint(L_BP68 + 1.0), 0);
        } // 8113
        {
          const t = L_BPb4.get(qbCint(g.V_0ef0), 1);
          L_BPb4.set(L_BPb4.get(qbCint(L_BP68 + 1.0), 1), qbCint(g.V_0ef0), 1);
          L_BPb4.set(t, qbCint(L_BP68 + 1.0), 1);
        } // 8114
        {
          const t = L_BPb4.get(qbCint(g.V_0ef0), 2);
          L_BPb4.set(L_BPb4.get(qbCint(L_BP68 + 1.0), 2), qbCint(g.V_0ef0), 2);
          L_BPb4.set(t, qbCint(L_BP68 + 1.0), 2);
        } // 8115
        {
          const t = L_BPb4.get(qbCint(g.V_0ef0), 3);
          L_BPb4.set(L_BPb4.get(qbCint(L_BP68 + 1.0), 3), qbCint(g.V_0ef0), 3);
          L_BPb4.set(t, qbCint(L_BP68 + 1.0), 3);
        } // 8116
        pc = 148;
        continue;
      case 148:
        // L_57196
        g.V_0ee8 = g.s(1.0); // 8118
        L_BP68 = g.s(L_BP68 + 1.0); // 8119
        pc = 149;
        continue;
      case 149:
        // L_571c0
        g.V_0ef0 = g.s(g.V_0ef0 + passo39); // 8121
        if (passo39 >= 0 ? g.V_0ef0 <= lim39 : g.V_0ef0 >= lim39) {
          pc = 255;
          continue;
        }
        pc = 256;
        continue;
      case 256:
        if (!(L_BPb4.get(0, 0) > L_BP68)) {
          pc = 151;
          continue;
        } // 8122
        if (!(g.V_0ee8 === 0.0)) {
          pc = 150;
          continue;
        } // 8123
        L_BP68 = g.s(L_BP68 + 1.0); // 8124
        pc = 150;
        continue;
      case 150:
        // L_5724a
        pc = 144;
        continue; // 8126
      case 151:
        // L_57257
        L_BPb4.set(g.s(L_BPb4.get(1, 0)), qbCint(L_BPb4.get(0, 0) + 1.0), 0); // 8128
        L_BPb4.set(g.s(L_BPb4.get(1, 1)), qbCint(L_BPb4.get(0, 0) + 1.0), 1); // 8129
        L_BP278 = g.s(0.0); // 8130
        g.V_0ee8 = g.s(1.0); // 8131
        L_BP68 = g.s(0.0); // 8132
        L_BP324 = g.s(L_BPb4.get(0, 0)); // 8133
        g.V_0ef0 = g.s(1.0); // 8134
        lim40 = g.s(L_BP324);
        passo40 = g.s(1);
        if (passo40 >= 0 ? g.V_0ef0 > lim40 : g.V_0ef0 < lim40) {
          pc = 258;
          continue;
        }
        pc = 257;
        continue;
      case 257:
        g.V_16d0 = L_BPb4.get(qbCint(g.V_0ef0 + 1.0), 0); // 8135
        g.V_16d8 = L_BPb4.get(qbCint(g.V_0ef0 + 1.0), 1); // 8136
        if (
          !(
            L_BPb4.get(qbCint(g.V_0ef0), 3) !== L_BPb4.get(qbCint(g.V_0ef0 + 1.0), 1) ||
            L_BPb4.get(qbCint(g.V_0ef0), 2) !== L_BPb4.get(qbCint(g.V_0ef0 + 1.0), 0)
          )
        ) {
          pc = 152;
          continue;
        } // 8137
        g.V_16d0 = L_BPb4.get(qbCint(g.V_0ef0), 2); // 8138
        g.V_16d8 = L_BPb4.get(qbCint(g.V_0ef0), 3); // 8139
        pc = 152;
        continue;
      case 152:
        // L_574c5
        L_BP68 = g.s(
          L_BP68 +
            ((L_BPb4.get(qbCint(g.V_0ef0), 0) + g.V_16d0) *
              (L_BPb4.get(qbCint(g.V_0ef0), 1) - g.V_16d8)) /
              2.0,
        ); // 8141
        if (
          !(
            L_BPb4.get(qbCint(g.V_0ef0), 3) === L_BPb4.get(qbCint(g.V_0ee8), 1) &&
            L_BPb4.get(qbCint(g.V_0ef0), 2) === L_BPb4.get(qbCint(g.V_0ee8), 0)
          )
        ) {
          pc = 153;
          continue;
        } // 8142
        L_BP278 = g.s(Math.abs(L_BP68) + L_BP278); // 8143
        L_BP68 = g.s(0.0); // 8144
        g.V_0ee8 = g.s(g.V_0ef0 + 1.0); // 8145
        pc = 153;
        continue;
      case 153:
        // L_57613
        g.V_0ef0 = g.s(g.V_0ef0 + passo40); // 8147
        if (passo40 >= 0 ? g.V_0ef0 <= lim40 : g.V_0ef0 >= lim40) {
          pc = 257;
          continue;
        }
        pc = 258;
        continue;
      case 258:
        L_BPb4 = g.matriz("!", []); // 8148
        L_BP9e = g.matriz("%", []); // 8149
        pc = pilha.pop() ?? 0;
        continue; // 8150
      case 154:
        // L_57667
        if (!(L_BPb4.get(0, 0) > L_BP68)) {
          pc = 155;
          continue;
        } // 8152
        L_BP328 = g.s(L_BPb4.get(0, 0) - 1.0); // 8153
        g.V_0ee8 = g.s(L_BP68); // 8154
        lim41 = g.s(L_BP328);
        passo41 = g.s(1);
        if (passo41 >= 0 ? g.V_0ee8 > lim41 : g.V_0ee8 < lim41) {
          pc = 260;
          continue;
        }
        pc = 259;
        continue;
      case 259:
        L_BPb4.set(g.s(L_BPb4.get(qbCint(g.V_0ee8 + 1.0), 0)), qbCint(g.V_0ee8), 0); // 8155
        L_BPb4.set(g.s(L_BPb4.get(qbCint(g.V_0ee8 + 1.0), 1)), qbCint(g.V_0ee8), 1); // 8156
        L_BPb4.set(g.s(L_BPb4.get(qbCint(g.V_0ee8 + 1.0), 2)), qbCint(g.V_0ee8), 2); // 8157
        L_BPb4.set(g.s(L_BPb4.get(qbCint(g.V_0ee8 + 1.0), 3)), qbCint(g.V_0ee8), 3); // 8158
        g.V_0ee8 = g.s(g.V_0ee8 + passo41); // 8159
        if (passo41 >= 0 ? g.V_0ee8 <= lim41 : g.V_0ee8 >= lim41) {
          pc = 259;
          continue;
        }
        pc = 260;
        continue;
      case 260:
        pc = 155;
        continue;
      case 155:
        // L_5781d
        L_BPb4.set(g.s(L_BPb4.get(0, 0) - 1.0), 0, 0); // 8161
        pc = pilha.pop() ?? 0;
        continue; // 8162
      case 156:
        // L_57862
        L_BPb4 = g.matriz("!", []); // 8164
        L_BP9e = g.matriz("%", []); // 8165
        L_BP7a = g.matriz("!", []); // 8166
        L_BP8c = g.matriz("!", []); // 8167
        L_BPc6 = g.matriz("!", []); // 8168
        L_BPd8 = g.matriz("!", []); // 8169
        return;
      default:
        throw new Error(`S_50187: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:8173-8768. */
export function S_578ad(g: EstadoLajecalc): void {
  let L_BP0e = 0;
  let L_BP102 = 0;
  let L_BP106 = 0;
  let L_BP10a = 0;
  let L_BP10e = 0;
  let L_BP112 = 0;
  let L_BP116 = 0;
  let L_BP11a = 0;
  let L_BP11e = 0;
  let L_BP12 = 0;
  let L_BP122 = 0;
  let L_BP126 = 0;
  let L_BP12a = 0;
  let L_BP12e = 0;
  let L_BP132 = 0;
  let L_BP136 = 0;
  let L_BP13a = 0;
  let L_BP13e = 0;
  let L_BP142 = 0;
  let L_BP146 = 0;
  let L_BP14a = 0;
  // oxlint-disable-next-line no-unused-vars -- gravada e nunca lida no original
  let L_BP16 = 0;
  let L_BP36 = 0;
  let L_BP3a = 0;
  let L_BP3e = 0;
  let L_BP42 = 0;
  let L_BP46 = 0;
  let L_BP4a = 0;
  let L_BP4e = 0;
  let L_BP52 = 0;
  let L_BPc6 = 0;
  let L_BPca = 0;
  let L_BPce = 0;
  let L_BPd2 = 0;
  let L_BPd6 = 0;
  let L_BPda = 0;
  let L_BPde = 0;
  let L_BPe2 = 0;
  let L_BPe6 = 0;
  let L_BPea = 0;
  let L_BPee = 0;
  let L_BPf2 = 0;
  let L_BPf6 = 0;
  let L_BPfa = 0;
  let L_BPfe = 0;
  let lim0 = 0;
  let passo0 = 0;
  let lim1 = 0;
  let passo1 = 0;
  let lim2 = 0;
  let passo2 = 0;
  let lim3 = 0;
  let passo3 = 0;
  let lim4 = 0;
  let passo4 = 0;
  let lim5 = 0;
  let passo5 = 0;
  let lim6 = 0;
  let passo6 = 0;
  let lim7 = 0;
  let passo7 = 0;
  const pilha: number[] = [];
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        g.L_BP64 = g.matriz("!", []); // 8207
        g.L_BP76 = g.matriz("!", []); // 8208
        g.L_BP88 = g.matriz("!", []); // 8209
        g.L_BP9a = g.matriz("!", []); // 8210
        g.L_BPac = g.matriz("%", []); // 8211
        g.L_BPc2 = g.matriz("!", []); // 8212
        g.L_BP64 = g.matriz("!", [[0, 1]]); // 8214
        g.L_BP76 = g.matriz("!", [[0, 1]]); // 8215
        g.L_BP88 = g.matriz("!", [[0, 1]]); // 8216
        g.L_BP9a = g.matriz("!", [[0, 1]]); // 8217
        g.L_BPac = g.matriz("%", [[0, 1]]); // 8218
        g.L_BPc2 = g.matriz("!", [
          [0, 1],
          [0, 1],
        ]); // 8219
        L_BP0e = g.s(g.A_10cc.get(0, 2)); // 8220
        L_BP12 = g.s(g.A_10cc.get(0, 3)); // 8221
        L_BP16 = g.s(g.A_10cc.get(0, 4)); // 8222
        g.L_BP64 = g.matriz("!", []); // 8223
        g.L_BP76 = g.matriz("!", []); // 8224
        g.L_BP64 = g.matriz("!", [[0, qbCint(g.A_160c.get(0, 0) * 2.0 + 2.0)]]); // 8225
        g.L_BP76 = g.matriz("!", [[0, qbCint(g.A_160c.get(0, 0) * 2.0 + 2.0)]]); // 8226
        g.L_BP64.set(g.s(g.A_160c.get(0, 0) * 2.0), 0); // 8227
        L_BPc6 = g.s(g.A_160c.get(0, 0)); // 8228
        g.V_0ef0 = g.s(1.0); // 8229
        lim0 = g.s(L_BPc6);
        passo0 = g.s(1);
        if (passo0 >= 0 ? g.V_0ef0 > lim0 : g.V_0ef0 < lim0) {
          pc = 134;
          continue;
        }
        pc = 133;
        continue;
      case 133:
        g.V_0f04 = g.s(2.0 * g.V_0ef0 - 1.0); // 8230
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) < 0.0)) {
          pc = 1;
          continue;
        } // 8231
        g.L_BP64.set(
          g.s(g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0))))),
          qbCint(g.V_0f04),
        ); // 8232
        g.L_BP76.set(
          g.s(g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0))))),
          qbCint(g.V_0f04),
        ); // 8233
        pc = 2;
        continue; // 8234
      case 1:
        // L_57bbd
        g.L_BP64.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 0)), qbCint(g.V_0f04)); // 8236
        g.L_BP76.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 1)), qbCint(g.V_0f04)); // 8237
        pc = 2;
        continue;
      case 2:
        // L_57c43
        g.L_BP64.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 2)), qbCint(g.V_0f04 + 1.0)); // 8239
        g.L_BP76.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 3)), qbCint(g.V_0f04 + 1.0)); // 8240
        g.V_0ef0 = g.s(g.V_0ef0 + passo0); // 8241
        if (passo0 >= 0 ? g.V_0ef0 <= lim0 : g.V_0ef0 >= lim0) {
          pc = 133;
          continue;
        }
        pc = 134;
        continue;
      case 134:
        g.L_BPac = g.matriz("%", []); // 8242
        g.L_BPac = g.matriz("%", [[0, qbCint(g.A_160c.get(0, 0))]]); // 8243
        L_BPca = g.s(g.A_15b0.get(0) - 1.0); // 8244
        g.V_0ef0 = g.s(1.0); // 8245
        lim1 = g.s(L_BPca);
        passo1 = g.s(1);
        if (passo1 >= 0 ? g.V_0ef0 > lim1 : g.V_0ef0 < lim1) {
          pc = 136;
          continue;
        }
        pc = 135;
        continue;
      case 135:
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_0ef0)) === 1)) {
          pc = 20;
          continue;
        } // 8246
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_0ef0)); // 8247
        g.V_17f0 = g.A_15de.get(qbCint(g.V_0ef0)); // 8248
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_0ef0 + 1.0)); // 8249
        g.V_17f8 = g.A_15de.get(qbCint(g.V_0ef0 + 1.0)); // 8250
        if (!(Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a)) {
          pc = 3;
          continue;
        } // 8251
        g.V_1678 = g.V_0e68_pi / 2.0; // 8252
        pc = 4;
        continue; // 8253
      case 3:
        // L_57e7f
        g.V_1678 = Math.atan((g.V_17f8 - g.V_17f0) / (g.V_17e8 - g.V_17e0)); // 8255
        pc = 4;
        continue;
      case 4:
        // L_57eae
        L_BPce = g.s(g.L_BP64.get(0)); // 8257
        g.V_0f04 = g.s(1.0); // 8258
        lim2 = g.s(L_BPce);
        passo2 = g.s(2.0);
        if (passo2 >= 0 ? g.V_0f04 > lim2 : g.V_0f04 < lim2) {
          pc = 138;
          continue;
        }
        pc = 137;
        continue;
      case 137:
        if (!(g.L_BPac.get(qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1) === 1)) {
          pc = 5;
          continue;
        } // 8259
        pc = 19;
        continue; // 8260
      case 5:
        // L_57f18
        if (
          !(
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.V_17f8) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.V_17e8) < g.V_133a &&
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.V_17e0) < g.V_133a
          )
        ) {
          pc = 6;
          continue;
        } // 8262
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8263
        pc = 19;
        continue; // 8264
      case 6:
        // L_5804f
        if (
          !(
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.V_17e0) < g.V_133a &&
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04)) - g.V_17f8) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.V_17e8) < g.V_133a
          )
        ) {
          pc = 7;
          continue;
        } // 8266
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8267
        pc = 19;
        continue; // 8268
      case 7:
        // L_58186
        if (
          !(
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.L_BP64.get(qbCint(g.V_0f04 + 1.0))) <
            g.V_133a
          )
        ) {
          pc = 8;
          continue;
        } // 8270
        g.V_1680 = g.V_0e68_pi / 2.0; // 8271
        pc = 9;
        continue; // 8272
      case 8:
        // L_581f8
        g.V_1680 = Math.atan(
          (g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP76.get(qbCint(g.V_0f04))) /
            (g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP64.get(qbCint(g.V_0f04))),
        ); // 8274
        pc = 9;
        continue;
      case 9:
        // L_58289
        if (!(Math.abs(g.V_1678 - g.V_1680) > g.V_133e)) {
          pc = 10;
          continue;
        } // 8276
        pc = 19;
        continue; // 8277
      case 10:
        // L_582b4
        L_BPd2 = g.s(g.V_17f0 / 1.0); // 8279
        L_BPd6 = g.s(g.V_17f8 / 1.0); // 8280
        L_BPda = g.s(L_BPd2 > L_BPd6 ? L_BPd2 : L_BPd6); // 8281
        L_BPde = g.s(g.V_17f0 / 1.0); // 8283
        L_BPe2 = g.s(g.V_17f8 / 1.0); // 8284
        L_BPe6 = g.s(L_BPde < L_BPe2 ? L_BPde : L_BPe2); // 8285
        if (
          !(
            g.L_BP76.get(qbCint(g.V_0f04)) <= L_BPda &&
            g.L_BP76.get(qbCint(g.V_0f04)) >= L_BPe6 &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.V_17e0) < g.V_133a &&
            Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a
          )
        ) {
          pc = 11;
          continue;
        } // 8287
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8288
        pc = 19;
        continue; // 8289
      case 11:
        // L_58427
        L_BPea = g.s(g.V_17e0 / 1.0); // 8291
        L_BPee = g.s(g.V_17e8 / 1.0); // 8292
        L_BPf2 = g.s(L_BPea > L_BPee ? L_BPea : L_BPee); // 8293
        L_BPf6 = g.s(g.V_17e0 / 1.0); // 8295
        L_BPfa = g.s(g.V_17e8 / 1.0); // 8296
        L_BPfe = g.s(L_BPf6 < L_BPfa ? L_BPf6 : L_BPfa); // 8297
        if (
          !(
            g.L_BP64.get(qbCint(g.V_0f04)) <= L_BPf2 &&
            g.L_BP64.get(qbCint(g.V_0f04)) >= L_BPfe &&
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.V_17f0 - g.V_17f8) < g.V_133a
          )
        ) {
          pc = 12;
          continue;
        } // 8299
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8300
        pc = 19;
        continue; // 8301
      case 12:
        // L_5859a
        if (
          !(Math.abs(g.V_17f0 - g.V_17f8) < g.V_133a || Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a)
        ) {
          pc = 13;
          continue;
        } // 8303
        pc = 19;
        continue; // 8304
      case 13:
        // L_585f0
        L_BP102 = g.s(g.V_17e0 / 1.0); // 8306
        L_BP106 = g.s(g.V_17e8 / 1.0); // 8307
        L_BP10a = g.s(L_BP102 > L_BP106 ? L_BP102 : L_BP106); // 8308
        L_BP10e = g.s(g.V_17e0 / 1.0); // 8310
        L_BP112 = g.s(g.V_17e8 / 1.0); // 8311
        L_BP116 = g.s(L_BP10e < L_BP112 ? L_BP10e : L_BP112); // 8312
        if (
          !(
            (g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) < g.L_BP64.get(qbCint(g.V_0f04)) &&
              g.L_BP64.get(qbCint(g.V_0f04)) === L_BP116) ||
            (g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) > g.L_BP64.get(qbCint(g.V_0f04)) &&
              g.L_BP64.get(qbCint(g.V_0f04)) === L_BP10a)
          )
        ) {
          pc = 14;
          continue;
        } // 8314
        pc = 19;
        continue; // 8315
      case 14:
        // L_5876c
        L_BP11a = g.s(g.V_17e0 / 1.0); // 8317
        L_BP11e = g.s(g.V_17e8 / 1.0); // 8318
        L_BP122 = g.s(L_BP11a > L_BP11e ? L_BP11a : L_BP11e); // 8319
        L_BP126 = g.s(g.V_17e0 / 1.0); // 8321
        L_BP12a = g.s(g.V_17e8 / 1.0); // 8322
        L_BP12e = g.s(L_BP126 < L_BP12a ? L_BP126 : L_BP12a); // 8323
        if (
          !(
            (g.L_BP64.get(qbCint(g.V_0f04)) < g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) &&
              g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) === L_BP12e) ||
            (g.L_BP64.get(qbCint(g.V_0f04)) > g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) &&
              g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) === L_BP122)
          )
        ) {
          pc = 15;
          continue;
        } // 8325
        pc = 19;
        continue; // 8326
      case 15:
        // L_588f2
        if (!(g.L_BP64.get(qbCint(g.V_0f04)) !== g.V_17e8)) {
          pc = 16;
          continue;
        } // 8328
        g.V_16a0 = Math.atan(
          (g.V_17f8 - g.L_BP76.get(qbCint(g.V_0f04))) / (g.V_17e8 - g.L_BP64.get(qbCint(g.V_0f04))),
        ); // 8329
        pc = 17;
        continue; // 8330
      case 16:
        // L_58987
        g.V_16a0 = Math.atan(
          (g.V_17f0 - g.L_BP76.get(qbCint(g.V_0f04))) / (g.V_17e0 - g.L_BP64.get(qbCint(g.V_0f04))),
        ); // 8332
        pc = 17;
        continue;
      case 17:
        // L_589e8
        if (!(Math.abs(g.V_1678 - g.V_16a0) < g.V_133e)) {
          pc = 18;
          continue;
        } // 8334
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8335
        pc = 18;
        continue;
      case 18:
        // L_58a3e
        pc = 19;
        continue;
      case 19:
        // L_58a43
        g.V_0f04 = g.s(g.V_0f04 + passo2); // 8338
        if (passo2 >= 0 ? g.V_0f04 <= lim2 : g.V_0f04 >= lim2) {
          pc = 137;
          continue;
        }
        pc = 138;
        continue;
      case 138:
        pc = 20;
        continue;
      case 20:
        // L_58a79
        g.V_0ef0 = g.s(g.V_0ef0 + passo1); // 8340
        if (passo1 >= 0 ? g.V_0ef0 <= lim1 : g.V_0ef0 >= lim1) {
          pc = 135;
          continue;
        }
        pc = 136;
        continue;
      case 136:
        g.L_BP1a = g.s(0.0); // 8341
        g.L_BP1e = g.s(0.0); // 8342
        g.L_BP22 = g.s(0.0); // 8343
        g.L_BP26 = g.s(0.0); // 8344
        g.L_BP2a = g.s(0.0); // 8345
        g.L_BP2e = g.s(0.0); // 8346
        g.L_BP32 = g.s(0.0); // 8347
        L_BP132 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 8348
        g.V_0f10 = g.s(1.0); // 8349
        lim3 = g.s(L_BP132);
        passo3 = g.s(1);
        if (passo3 >= 0 ? g.V_0f10 > lim3 : g.V_0f10 < lim3) {
          pc = 140;
          continue;
        }
        pc = 139;
        continue;
      case 139:
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_0f10)) === 1)) {
          pc = 21;
          continue;
        } // 8350
        pc = 35;
        continue; // 8351
      case 21:
        // L_58b86
        if (!(g.A_163a.get(qbCint(g.V_0f10), 0) === -100.0)) {
          pc = 22;
          continue;
        } // 8353
        pc = 35;
        continue; // 8354
      case 22:
        // L_58bc2
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_0f10)); // 8356
        g.V_17f0 = g.A_15de.get(qbCint(g.V_0f10)); // 8357
        g.V_1788 = g.s(g.V_0f10 + 1.0); // 8358
        pc = 23;
        continue;
      case 23:
        // L_58c2b
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 24;
          continue;
        } // 8360
        g.V_1788 = g.s(1.0); // 8361
        pc = 24;
        continue;
      case 24:
        // L_58c79
        if (!(g.A_163a.get(qbCint(g.V_1788), 0) === -100.0)) {
          pc = 25;
          continue;
        } // 8363
        g.V_1788 = g.s(g.V_1788 + 1.0); // 8364
        pc = 23;
        continue; // 8365
      case 25:
        // L_58ccb
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_1788)); // 8367
        g.V_17f8 = g.A_15de.get(qbCint(g.V_1788)); // 8368
        pilha.push(141);
        pc = 38;
        continue; // 8369
      case 141:
        pilha.push(142);
        pc = 89;
        continue; // 8370
      case 142:
        if (!(g.L_BPc2.get(1, 0) === 0.0 && g.L_BP88.get(1) < g.L_BP88.get(2))) {
          pc = 26;
          continue;
        } // 8371
        g.L_BP1a = g.s(g.L_BP1a + L_BP36); // 8372
        pc = 26;
        continue;
      case 26:
        // L_58db3
        if (
          !(
            g.L_BPc2.get(qbCint(g.V_0ef0 - 1.0), 0) === 0.0 &&
            g.L_BP88.get(qbCint(g.V_0ef0 - 1.0)) < g.L_BP88.get(qbCint(g.V_0ef0))
          )
        ) {
          pc = 27;
          continue;
        } // 8374
        g.L_BP1a = g.s(g.L_BP1a + L_BP3a); // 8375
        pc = 27;
        continue;
      case 27:
        // L_58e58
        g.L_BP1a = g.s(g.L_BP1a + L_BP3e); // 8377
        if (!(g.L_BP88.get(1) < g.L_BP88.get(2))) {
          pc = 28;
          continue;
        } // 8378
        g.L_BP1e = g.s((g.pot(L_BP46, 2.0) * L_BP36) / 2.0 + g.L_BP1e); // 8379
        pc = 28;
        continue;
      case 28:
        // L_58ec8
        if (!(g.L_BP88.get(qbCint(g.V_0ef0 - 1.0)) < g.L_BP88.get(qbCint(g.V_0ef0)))) {
          pc = 29;
          continue;
        } // 8381
        g.L_BP1e = g.s((g.pot(L_BP4a, 2.0) * L_BP3a) / 2.0 + g.L_BP1e); // 8382
        pc = 29;
        continue;
      case 29:
        // L_58f3e
        if (!(L_BP42 > 0.0)) {
          pc = 30;
          continue;
        } // 8384
        g.L_BP1e = g.s(L_BP42 / 2.0 + g.L_BP1e); // 8385
        pc = 30;
        continue;
      case 30:
        // L_58f70
        g.L_BP2a = g.s(g.L_BP2a + L_BP4e); // 8387
        g.L_BP2e = g.s(g.L_BP2e + L_BP52); // 8388
        if (!(g.L_BP88.get(2) > g.L_BP88.get(1))) {
          pc = 31;
          continue;
        } // 8389
        g.V_16a0 = Math.atan(
          (g.L_BP9a.get(1) - g.L_BP9a.get(2)) / (g.L_BP88.get(2) - g.L_BP88.get(1)),
        ); // 8390
        pc = 32;
        continue; // 8391
      case 31:
        // L_59037
        g.V_16a0 =
          g.V_0e68_pi / 2.0 +
          Math.atan((g.L_BP88.get(1) - g.L_BP88.get(2)) / (g.L_BP9a.get(1) - g.L_BP9a.get(2))); // 8393
        pc = 32;
        continue;
      case 32:
        // L_590aa
        if (!(g.L_BPc2.get(1, 0) === 0.0 && g.L_BP88.get(1) < g.L_BP88.get(2))) {
          pc = 33;
          continue;
        } // 8395
        g.L_BP22 = g.s(
          g.L_BP22 +
            ((g.L_BP88.get(2) - g.L_BP88.get(1)) * (1.0 - Math.sin(g.V_16a0))) /
              (Math.sin(g.V_16a0) + 1.13999998569488525390625),
        ); // 8396
        pc = 33;
        continue;
      case 33:
        // L_59178
        if (!(g.L_BP88.get(1) < g.L_BP88.get(2))) {
          pc = 34;
          continue;
        } // 8398
        g.L_BP26 = g.s(
          g.L_BP26 +
            ((g.L_BP88.get(2) - g.L_BP88.get(1)) *
              g.pot(L_BP46, 2.0) *
              (1.0 - Math.sin(g.V_16a0))) /
              (Math.sin(g.V_16a0) * 5.0 + 1.13999998569488525390625),
        ); // 8399
        pc = 34;
        continue;
      case 34:
        // L_59226
        g.L_BP32 = g.s(
          g.L_BP32 +
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(g.V_0f10)) - g.A_15b0.get(qbCint(g.V_1788)), 2.0) +
                g.pot(g.A_15de.get(qbCint(g.V_0f10)) - g.A_15de.get(qbCint(g.V_1788)), 2.0),
            ) *
              g.V_0ef4,
        ); // 8401
        pc = 35;
        continue;
      case 35:
        // L_592cc
        g.V_0f10 = g.s(g.V_0f10 + passo3); // 8403
        if (passo3 >= 0 ? g.V_0f10 <= lim3 : g.V_0f10 >= lim3) {
          pc = 139;
          continue;
        }
        pc = 140;
        continue;
      case 140:
        g.V_0ef0 = g.s(L_BP0e + L_BP12); // 8404
        g.A_10cc.set(g.s(0.0), 0, 2); // 8405
        if (!(g.L_BP2e < 0.0)) {
          pc = 36;
          continue;
        } // 8406
        g.L_BP2e = g.s(0.0); // 8407
        pc = 36;
        continue;
      case 36:
        // L_5935b
        g.A_1210.set(
          g.s(
            (g.L_BP1a + g.L_BP32 + ((1.0 + g.V_0f82) * g.L_BP2a - g.L_BP22 * 2.0)) /
              (g.L_BP1e / 3.0 + (g.L_BP2e - g.L_BP26 / 3.0)),
          ),
          0,
          1,
        ); // 8409
        if (!(g.L_BP1a === 0.0)) {
          pc = 37;
          continue;
        } // 8410
        g.A_1210.set(g.s(-g.A_1210.get(0, 1)), 0, 1); // 8411
        pc = 37;
        continue;
      case 37:
        // L_5940f
        pc = 132;
        continue; // 8413
      case 38:
        // L_5941c
        L_BP136 = g.s(g.L_BP64.get(0)); // 8416
        g.V_0f14 = g.s(1.0); // 8417
        lim4 = g.s(L_BP136);
        passo4 = g.s(2.0);
        if (passo4 >= 0 ? g.V_0f14 > lim4 : g.V_0f14 < lim4) {
          pc = 144;
          continue;
        }
        pc = 143;
        continue;
      case 143:
        if (!(-g.A_160c.get(qbCint((g.V_0f14 + 1.0) / 2.0), 0) === g.V_0f10)) {
          pc = 39;
          continue;
        } // 8418
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14 + 1.0)); // 8419
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14 + 1.0)); // 8420
        pc = 40;
        continue; // 8421
      case 39:
        // L_594ee
        g.V_0f14 = g.s(g.V_0f14 + passo4); // 8423
        if (passo4 >= 0 ? g.V_0f14 <= lim4 : g.V_0f14 >= lim4) {
          pc = 143;
          continue;
        }
        pc = 144;
        continue;
      case 144:
        pc = 40;
        continue;
      case 40:
        // L_5951a
        if (!(g.L_BP64.get(0) < g.V_0f14)) {
          pc = 44;
          continue;
        } // 8425
        L_BP13a = g.s(g.L_BP64.get(0)); // 8426
        g.V_0f14 = g.s(1.0); // 8427
        lim5 = g.s(L_BP13a);
        passo5 = g.s(2.0);
        if (passo5 >= 0 ? g.V_0f14 > lim5 : g.V_0f14 < lim5) {
          pc = 146;
          continue;
        }
        pc = 145;
        continue;
      case 145:
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14)); // 8428
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14)); // 8429
        if (
          !(Math.abs(g.V_0efc - g.V_17f0) < g.V_133a && Math.abs(g.V_0ef4 - g.V_17e0) < g.V_133a)
        ) {
          pc = 41;
          continue;
        } // 8430
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14 + 1.0)); // 8431
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14 + 1.0)); // 8432
        pc = 43;
        continue; // 8433
      case 41:
        // L_5966b
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14 + 1.0)); // 8435
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14 + 1.0)); // 8436
        if (
          !(Math.abs(g.V_0efc - g.V_17f0) < g.V_133a && Math.abs(g.V_0ef4 - g.V_17e0) < g.V_133a)
        ) {
          pc = 42;
          continue;
        } // 8437
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14)); // 8438
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14)); // 8439
        pc = 43;
        continue; // 8440
      case 42:
        // L_5976c
        g.V_0f14 = g.s(g.V_0f14 + passo5); // 8442
        if (passo5 >= 0 ? g.V_0f14 <= lim5 : g.V_0f14 >= lim5) {
          pc = 145;
          continue;
        }
        pc = 146;
        continue;
      case 146:
        pc = 43;
        continue;
      case 43:
        // L_59798
        pc = 44;
        continue;
      case 44:
        // L_5979d
        g.L_BP88 = g.matriz("!", []); // 8445
        g.L_BP9a = g.matriz("!", []); // 8446
        g.L_BP88 = g.matriz("!", [[0, 50]]); // 8447
        g.L_BP9a = g.matriz("!", [[0, 50]]); // 8448
        g.L_BPc2 = g.matriz("!", []); // 8449
        g.L_BPc2 = g.matriz("!", [
          [0, 50],
          [0, 0],
        ]); // 8450
        g.L_BP88.set(g.s(2.0), 0); // 8451
        g.L_BP88.set(g.s(g.V_17e0), 1); // 8452
        g.L_BP9a.set(g.s(g.V_17f0), 1); // 8453
        g.L_BP88.set(g.s(g.V_0ef4), 2); // 8454
        g.L_BP9a.set(g.s(g.V_0efc), 2); // 8455
        if (!(g.L_BPac.get(qbFix(qbClng(qbClng(g.V_0f14)) / qbClng(2)) + 1) === 1)) {
          pc = 45;
          continue;
        } // 8456
        g.L_BPc2.set(g.s(1.0), 1, 0); // 8457
        pc = 45;
        continue;
      case 45:
        // L_5991a
        g.V_1778 = g.s(1.0); // 8459
        pc = 46;
        continue;
      case 46:
        // L_59930
        if (!(g.L_BP88.get(qbCint(g.V_1778)) === g.L_BP88.get(qbCint(g.V_1778 + 1.0)))) {
          pc = 48;
          continue;
        } // 8461
        g.V_16a8 = g.V_0e68_pi / 2.0; // 8462
        if (!(g.L_BP9a.get(qbCint(g.V_1778)) > g.L_BP9a.get(qbCint(g.V_1778 + 1.0)))) {
          pc = 47;
          continue;
        } // 8463
        g.V_16a8 = (3.0 * g.V_0e68_pi) / 2.0; // 8464
        pc = 47;
        continue;
      case 47:
        // L_59a02
        pc = 53;
        continue; // 8466
      case 48:
        // L_59a0a
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) >= g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 49;
          continue;
        } // 8468
        g.V_16a8 = Math.atan(
          (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778))) /
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778))),
        ); // 8469
        pc = 49;
        continue;
      case 49:
        // L_59b40
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) > g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 50;
          continue;
        } // 8471
        g.V_16a8 =
          g.V_0e68_pi / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_1778)) - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) /
              (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778))),
          ); // 8472
        pc = 50;
        continue;
      case 50:
        // L_59c83
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) <= g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 51;
          continue;
        } // 8474
        g.V_16a8 =
          Math.atan(
            (g.L_BP9a.get(qbCint(g.V_1778)) - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) /
              (g.L_BP88.get(qbCint(g.V_1778)) - g.L_BP88.get(qbCint(g.V_1778 + 1.0))),
          ) + g.V_0e68_pi; // 8475
        pc = 51;
        continue;
      case 51:
        // L_59dbe
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) < g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 52;
          continue;
        } // 8477
        g.V_16a8 =
          (3.0 * g.V_0e68_pi) / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778))) /
              (g.L_BP9a.get(qbCint(g.V_1778)) - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))),
          ); // 8478
        pc = 52;
        continue;
      case 52:
        // L_59f06
        pc = 53;
        continue;
      case 53:
        // L_59f0b
        L_BP13e = g.s(-1.0); // 8481
        L_BP142 = g.s(g.L_BP64.get(0)); // 8482
        g.V_0f04 = g.s(1.0); // 8483
        lim6 = g.s(L_BP142);
        passo6 = g.s(2.0);
        if (passo6 >= 0 ? g.V_0f04 > lim6 : g.V_0f04 < lim6) {
          pc = 148;
          continue;
        }
        pc = 147;
        continue;
      case 147:
        if (!(g.V_0f04 === g.V_0f14)) {
          pc = 54;
          continue;
        } // 8484
        pc = 84;
        continue; // 8485
      case 54:
        // L_59f67
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f04)); // 8487
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f04)); // 8488
        if (
          !(
            Math.abs(g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) < g.V_133a &&
            Math.abs(g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) < g.V_133a
          )
        ) {
          pc = 55;
          continue;
        } // 8489
        pc = 57;
        continue; // 8490
      case 55:
        // L_5a04b
        if (
          !(
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) <
              g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) <
              g.V_133a
          )
        ) {
          pc = 56;
          continue;
        } // 8492
        pc = 57;
        continue; // 8493
      case 56:
        // L_5a111
        pc = 84;
        continue; // 8495
      case 57:
        // L_5a11e
        if (
          !(
            Math.abs(g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) < g.V_133a &&
            Math.abs(g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) < g.V_133a
          )
        ) {
          pc = 58;
          continue;
        } // 8497
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f04 + 1.0)); // 8498
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f04 + 1.0)); // 8499
        pc = 58;
        continue;
      case 58:
        // L_5a20e
        if (
          !(Math.abs(g.V_0efc - g.V_17f8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_17e8) < g.V_133a)
        ) {
          pc = 59;
          continue;
        } // 8501
        g.V_16d0 = g.V_17e8; // 8502
        g.V_16d8 = g.V_17f8; // 8503
        L_BP13e = g.s(g.V_0f04); // 8504
        pc = 85;
        continue; // 8505
      case 59:
        // L_5a29c
        if (!(g.L_BP88.get(qbCint(g.V_1778 + 1.0)) === g.V_0ef4)) {
          pc = 61;
          continue;
        } // 8507
        g.V_16b0 = g.V_0e68_pi / 2.0; // 8508
        if (!(g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) > g.V_0efc)) {
          pc = 60;
          continue;
        } // 8509
        g.V_16b0 = (3.0 * g.V_0e68_pi) / 2.0; // 8510
        pc = 60;
        continue;
      case 60:
        // L_5a33b
        pc = 66;
        continue; // 8512
      case 61:
        // L_5a343
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) <= g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.V_0ef4
          )
        ) {
          pc = 62;
          continue;
        } // 8514
        g.V_16b0 = Math.atan(
          (g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) /
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))),
        ); // 8515
        pc = 62;
        continue;
      case 62:
        // L_5a423
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) < g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.V_0ef4
          )
        ) {
          pc = 63;
          continue;
        } // 8517
        g.V_16b0 =
          g.V_0e68_pi / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.V_0ef4) /
              (g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))),
          ); // 8518
        pc = 63;
        continue;
      case 63:
        // L_5a50d
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) >= g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.V_0ef4
          )
        ) {
          pc = 64;
          continue;
        } // 8520
        g.V_16b0 =
          Math.atan(
            (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.V_0efc) /
              (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.V_0ef4),
          ) + g.V_0e68_pi; // 8521
        pc = 64;
        continue;
      case 64:
        // L_5a5ec
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) > g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.V_0ef4
          )
        ) {
          pc = 65;
          continue;
        } // 8523
        g.V_16b0 =
          (3.0 * g.V_0e68_pi) / 2.0 +
          Math.atan(
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) /
              (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.V_0efc),
          ); // 8524
        pc = 65;
        continue;
      case 65:
        // L_5a6db
        pc = 66;
        continue;
      case 66:
        // L_5a6e0
        if (!(g.V_0e68_pi / 2.0 > g.V_16a8 && g.V_16a8 >= 0.0)) {
          pc = 69;
          continue;
        } // 8527
        if (!(g.V_0e68_pi + g.V_16a8 > g.V_16b0 && g.V_16b0 >= 0.0)) {
          pc = 67;
          continue;
        } // 8528
        L_BP146 = g.s(g.V_0e68_pi - g.V_16a8 + g.V_16b0); // 8529
        pc = 68;
        continue; // 8530
      case 67:
        // L_5a789
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 + g.V_0e68_pi)); // 8532
        pc = 68;
        continue;
      case 68:
        // L_5a7ac
        pc = 69;
        continue;
      case 69:
        // L_5a7b1
        if (!(g.V_16a8 < g.V_0e68_pi && g.V_0e68_pi / 2.0 <= g.V_16a8)) {
          pc = 72;
          continue;
        } // 8535
        if (!(g.V_0e68_pi + g.V_16a8 > g.V_16b0 && g.V_16b0 >= 0.0)) {
          pc = 70;
          continue;
        } // 8536
        L_BP146 = g.s(g.V_0e68_pi - g.V_16a8 + g.V_16b0); // 8537
        pc = 71;
        continue; // 8538
      case 70:
        // L_5a85a
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 + g.V_0e68_pi)); // 8540
        pc = 71;
        continue;
      case 71:
        // L_5a87d
        pc = 72;
        continue;
      case 72:
        // L_5a882
        if (!((3.0 * g.V_0e68_pi) / 2.0 > g.V_16a8 && g.V_16a8 >= g.V_0e68_pi)) {
          pc = 75;
          continue;
        } // 8543
        if (!(2.0 * g.V_0e68_pi >= g.V_16b0 && g.V_16a8 - g.V_0e68_pi <= g.V_16b0)) {
          pc = 73;
          continue;
        } // 8544
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 - g.V_0e68_pi)); // 8545
        pc = 74;
        continue; // 8546
      case 73:
        // L_5a938
        L_BP146 = g.s(2.0 * g.V_0e68_pi - (g.V_16a8 - g.V_0e68_pi) + g.V_16b0); // 8548
        pc = 74;
        continue;
      case 74:
        // L_5a965
        pc = 75;
        continue;
      case 75:
        // L_5a96a
        if (!(2.0 * g.V_0e68_pi >= g.V_16a8 && (3.0 * g.V_0e68_pi) / 2.0 <= g.V_16a8)) {
          pc = 78;
          continue;
        } // 8551
        if (!(2.0 * g.V_0e68_pi >= g.V_16b0 && g.V_16a8 - g.V_0e68_pi <= g.V_16b0)) {
          pc = 76;
          continue;
        } // 8552
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 - g.V_0e68_pi)); // 8553
        pc = 77;
        continue; // 8554
      case 76:
        // L_5aa25
        L_BP146 = g.s(2.0 * g.V_0e68_pi - (g.V_16a8 - g.V_0e68_pi - g.V_16b0)); // 8556
        pc = 77;
        continue;
      case 77:
        // L_5aa52
        pc = 78;
        continue;
      case 78:
        // L_5aa57
        if (!(Math.abs(g.V_16b0 - g.V_16a8 - g.V_0e68_pi) < g.V_133e)) {
          pc = 79;
          continue;
        } // 8559
        L_BP146 = g.s(g.V_0e68_pi); // 8560
        pc = 79;
        continue;
      case 79:
        // L_5aa90
        if (!(L_BP146 >= 2.0 * g.V_0e68_pi)) {
          pc = 80;
          continue;
        } // 8562
        L_BP146 = g.s(L_BP146 - 2.0 * g.V_0e68_pi); // 8563
        pc = 80;
        continue;
      case 80:
        // L_5aace
        if (!(L_BP13e === -1.0)) {
          pc = 81;
          continue;
        } // 8565
        g.V_16d0 = g.V_0ef4; // 8566
        g.V_16d8 = g.V_0efc; // 8567
        g.V_16a0 = L_BP146; // 8568
        L_BP13e = g.s(g.V_0f04); // 8569
        pc = 83;
        continue; // 8570
      case 81:
        // L_5ab35
        if (!(L_BP146 > g.V_16a0)) {
          pc = 82;
          continue;
        } // 8572
        g.V_16d0 = g.V_0ef4; // 8573
        g.V_16d8 = g.V_0efc; // 8574
        g.V_16a0 = L_BP146; // 8575
        L_BP13e = g.s(g.V_0f04); // 8576
        pc = 82;
        continue;
      case 82:
        // L_5ab99
        pc = 83;
        continue;
      case 83:
        // L_5ab9e
        pc = 84;
        continue;
      case 84:
        // L_5aba3
        g.V_0f04 = g.s(g.V_0f04 + passo6); // 8580
        if (passo6 >= 0 ? g.V_0f04 <= lim6 : g.V_0f04 >= lim6) {
          pc = 147;
          continue;
        }
        pc = 148;
        continue;
      case 148:
        pc = 85;
        continue;
      case 85:
        // L_5abd4
        g.L_BP88.set(g.s(g.V_16d0), qbCint(g.V_1778 + 2.0)); // 8582
        g.L_BP9a.set(g.s(g.V_16d8), qbCint(g.V_1778 + 2.0)); // 8583
        if (!(g.L_BPac.get(qbFix(qbClng(qbClng(L_BP13e)) / qbClng(2)) + 1) === 1)) {
          pc = 86;
          continue;
        } // 8584
        g.L_BPc2.set(g.s(1.0), qbCint(g.V_1778 + 1.0), 0); // 8585
        pc = 86;
        continue;
      case 86:
        // L_5ac98
        g.L_BP88.set(g.s(g.L_BP88.get(0) + 1.0), 0); // 8587
        if (!(g.V_16d8 === g.V_17f8 && g.V_16d0 === g.V_17e8)) {
          pc = 87;
          continue;
        } // 8588
        g.L_BP88.set(g.s(g.L_BP88.get(1)), qbCint(g.V_1778 + 3.0)); // 8589
        g.L_BP9a.set(g.s(g.L_BP9a.get(1)), qbCint(g.V_1778 + 3.0)); // 8590
        g.L_BP88.set(g.s(g.L_BP88.get(0) + 1.0), 0); // 8591
        pc = 88;
        continue; // 8592
      case 87:
        // L_5adba
        g.V_1778 = g.s(g.V_1778 + 1.0); // 8594
        g.V_0f14 = g.s(L_BP13e); // 8595
        pc = 46;
        continue; // 8596
      case 88:
        // L_5adee
        pc = pilha.pop() ?? 0;
        continue; // 8598
      case 89:
        // L_5adfd
        g.V_0ef0 = g.s(g.L_BP88.get(0) - 1.0); // 8600
        if (
          !(
            g.L_BP9a.get(1) <= g.L_BP9a.get(qbCint(g.V_0ef0)) &&
            g.L_BP88.get(1) < g.L_BP88.get(qbCint(g.V_0ef0))
          )
        ) {
          pc = 90;
          continue;
        } // 8601
        g.V_16a0 = Math.atan(
          (g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(1)) /
            (g.L_BP88.get(qbCint(g.V_0ef0)) - g.L_BP88.get(1)),
        ); // 8602
        pc = 90;
        continue;
      case 90:
        // L_5af15
        if (
          !(
            g.L_BP9a.get(1) < g.L_BP9a.get(qbCint(g.V_0ef0)) &&
            g.L_BP88.get(1) >= g.L_BP88.get(qbCint(g.V_0ef0))
          )
        ) {
          pc = 91;
          continue;
        } // 8604
        g.V_16a0 =
          g.V_0e68_pi / 2.0 +
          Math.atan(
            (g.L_BP88.get(1) - g.L_BP88.get(qbCint(g.V_0ef0))) /
              (g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(1)),
          ); // 8605
        pc = 91;
        continue;
      case 91:
        // L_5b013
        if (
          !(
            g.L_BP9a.get(1) >= g.L_BP9a.get(qbCint(g.V_0ef0)) &&
            g.L_BP88.get(1) > g.L_BP88.get(qbCint(g.V_0ef0))
          )
        ) {
          pc = 92;
          continue;
        } // 8607
        g.V_16a0 =
          Math.atan(
            (g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_0ef0))) /
              (g.L_BP88.get(1) - g.L_BP88.get(qbCint(g.V_0ef0))),
          ) + g.V_0e68_pi; // 8608
        pc = 92;
        continue;
      case 92:
        // L_5b109
        if (
          !(
            g.L_BP9a.get(1) > g.L_BP9a.get(qbCint(g.V_0ef0)) &&
            g.L_BP88.get(1) <= g.L_BP88.get(qbCint(g.V_0ef0))
          )
        ) {
          pc = 93;
          continue;
        } // 8610
        g.V_16a0 =
          (3.0 * g.V_0e68_pi) / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_0ef0)) - g.L_BP88.get(1)) /
              (g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_0ef0))),
          ); // 8611
        pc = 93;
        continue;
      case 93:
        // L_5b209
        L_BP14a = g.s(g.L_BP88.get(0)); // 8613
        g.V_0f04 = g.s(1.0); // 8614
        lim7 = g.s(L_BP14a);
        passo7 = g.s(1);
        if (passo7 >= 0 ? g.V_0f04 > lim7 : g.V_0f04 < lim7) {
          pc = 150;
          continue;
        }
        pc = 149;
        continue;
      case 149:
        g.V_0ef4 =
          g.L_BP88.get(qbCint(g.V_0f04)) * Math.cos(-g.V_16a0) -
          g.L_BP9a.get(qbCint(g.V_0f04)) * Math.sin(-g.V_16a0); // 8615
        g.V_0efc =
          g.L_BP88.get(qbCint(g.V_0f04)) * Math.sin(-g.V_16a0) +
          g.L_BP9a.get(qbCint(g.V_0f04)) * Math.cos(-g.V_16a0); // 8616
        g.L_BP88.set(g.s(g.V_0ef4), qbCint(g.V_0f04)); // 8617
        g.L_BP9a.set(g.s(g.V_0efc), qbCint(g.V_0f04)); // 8618
        g.V_0f04 = g.s(g.V_0f04 + passo7); // 8619
        if (passo7 >= 0 ? g.V_0f04 <= lim7 : g.V_0f04 >= lim7) {
          pc = 149;
          continue;
        }
        pc = 150;
        continue;
      case 150:
        L_BP36 = g.s(g.L_BP88.get(2) - g.L_BP88.get(1)); // 8620
        L_BP46 = g.s(g.L_BP9a.get(1) - g.L_BP9a.get(2)); // 8621
        if (!(g.L_BP88.get(2) > g.L_BP88.get(qbCint(g.V_0ef0)))) {
          pc = 94;
          continue;
        } // 8622
        L_BP36 = g.s(g.L_BP88.get(qbCint(g.V_0ef0)) - g.L_BP88.get(1)); // 8623
        L_BP46 = g.s(
          ((g.L_BP9a.get(1) - g.L_BP9a.get(2)) *
            (g.L_BP88.get(1) - g.L_BP88.get(qbCint(g.V_0ef0)))) /
            (g.L_BP88.get(1) - g.L_BP88.get(2)),
        ); // 8624
        pc = 94;
        continue;
      case 94:
        // L_5b4e9
        L_BP3a = g.s(g.L_BP88.get(qbCint(g.V_0ef0)) - g.L_BP88.get(qbCint(g.V_0ef0 - 1.0))); // 8626
        L_BP4a = g.s(g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(qbCint(g.V_0ef0 - 1.0))); // 8627
        if (!(g.L_BP88.get(qbCint(g.V_0ef0 - 1.0)) < g.L_BP88.get(1))) {
          pc = 95;
          continue;
        } // 8628
        L_BP3a = g.s(g.L_BP88.get(qbCint(g.V_0ef0)) - g.L_BP88.get(1)); // 8629
        L_BP4a = g.s(
          ((g.L_BP88.get(1) - g.L_BP88.get(qbCint(g.V_0ef0))) *
            (g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(qbCint(g.V_0ef0 - 1.0)))) /
            (g.L_BP88.get(qbCint(g.V_0ef0 - 1.0)) - g.L_BP88.get(qbCint(g.V_0ef0))),
        ); // 8630
        pc = 95;
        continue;
      case 95:
        // L_5b6b1
        g.V_0f04 = g.s(2.0); // 8632
        L_BP3e = g.s(0.0); // 8633
        L_BP42 = g.s(0.0); // 8634
        L_BP4e = g.s(0.0); // 8635
        L_BP52 = g.s(0.0); // 8636
        pc = 96;
        continue;
      case 96:
        // L_5b708
        if (!(g.L_BP88.get(qbCint(g.V_0f04)) < g.L_BP88.get(1))) {
          pc = 97;
          continue;
        } // 8638
        g.V_0f04 = g.s(g.V_0f04 + 1.0); // 8639
        pc = 96;
        continue; // 8640
      case 97:
        // L_5b760
        if (!(g.V_0f04 < g.V_0ef0 && g.V_0f04 > 2.0)) {
          pc = 101;
          continue;
        } // 8642
        if (!(g.L_BP88.get(qbCint(g.V_0f04)) <= g.L_BP88.get(qbCint(g.V_0ef0)))) {
          pc = 98;
          continue;
        } // 8643
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_0f04)); // 8644
        g.V_0efc = g.L_BP9a.get(qbCint(g.V_0f04)); // 8645
        pc = 99;
        continue; // 8646
      case 98:
        // L_5b83f
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_0ef0)); // 8648
        g.V_0efc =
          ((g.L_BP9a.get(qbCint(g.V_0f04 - 1.0)) - g.L_BP9a.get(qbCint(g.V_0f04))) *
            (g.L_BP88.get(qbCint(g.V_0ef0)) - g.L_BP88.get(qbCint(g.V_0f04 - 1.0)))) /
            (g.L_BP88.get(qbCint(g.V_0f04)) - g.L_BP88.get(qbCint(g.V_0f04 - 1.0))) +
          g.L_BP9a.get(qbCint(g.V_0f04 - 1.0)); // 8649
        pc = 99;
        continue;
      case 99:
        // L_5b956
        g.V_17f0 =
          ((g.L_BP9a.get(qbCint(g.V_0f04 - 1.0)) - g.L_BP9a.get(qbCint(g.V_0f04))) *
            (g.L_BP88.get(1) - g.L_BP88.get(qbCint(g.V_0f04 - 1.0)))) /
            (g.L_BP88.get(qbCint(g.V_0f04)) - g.L_BP88.get(qbCint(g.V_0f04 - 1.0))) +
          g.L_BP9a.get(qbCint(g.V_0f04 - 1.0)); // 8651
        if (!(g.L_BPc2.get(1, 0) === 0.0)) {
          pc = 100;
          continue;
        } // 8652
        L_BP3e = g.s(L_BP3e + (g.V_0ef4 - g.L_BP88.get(1))); // 8653
        pc = 100;
        continue;
      case 100:
        // L_5ba8d
        L_BP42 = g.s(
          L_BP42 +
            (g.V_0ef4 - g.L_BP88.get(1)) *
              (g.pot(g.L_BP9a.get(1) - g.V_17f0, 2.0) +
                (g.L_BP9a.get(1) - g.V_0efc) * (g.L_BP9a.get(1) - g.V_17f0) +
                g.pot(g.L_BP9a.get(1) - g.V_0efc, 2.0)),
        ); // 8655
        pc = 101;
        continue;
      case 101:
        // L_5bb35
        if (!(g.V_0f04 > 2.0)) {
          pc = 111;
          continue;
        } // 8657
        g.V_1778 = g.s(2.0); // 8658
        pc = 102;
        continue;
      case 102:
        // L_5bb66
        if (!(g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.L_BP88.get(1))) {
          pc = 103;
          continue;
        } // 8660
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_1778 + 1.0)); // 8661
        g.V_0efc = g.L_BP9a.get(qbCint(g.V_1778 + 1.0)); // 8662
        pc = 104;
        continue; // 8663
      case 103:
        // L_5bc0c
        g.V_0ef4 = g.L_BP88.get(1); // 8665
        g.V_0efc =
          g.L_BP9a.get(qbCint(g.V_1778)) +
          ((g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778))) /
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778)))) *
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778))); // 8666
        pc = 104;
        continue;
      case 104:
        // L_5bcfe
        if (!(g.L_BP88.get(qbCint(g.V_1778)) !== g.V_0ef4)) {
          pc = 107;
          continue;
        } // 8668
        if (!(g.L_BP9a.get(qbCint(g.V_1778)) > g.V_0efc)) {
          pc = 105;
          continue;
        } // 8669
        g.V_16a0 = -Math.atan(
          (g.L_BP9a.get(qbCint(g.V_1778)) - g.V_0efc) / (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778))),
        ); // 8670
        pc = 106;
        continue; // 8671
      case 105:
        // L_5bdc8
        g.V_16a0 = Math.atan(
          (g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778))) / (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778))),
        ); // 8673
        pc = 106;
        continue;
      case 106:
        // L_5be2b
        pc = 108;
        continue; // 8675
      case 107:
        // L_5be33
        g.V_16a0 = 0.0; // 8677
        pc = 108;
        continue;
      case 108:
        // L_5be49
        g.V_16a8 = Math.atan(
          (g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_1778))) /
            (g.L_BP88.get(1) - g.L_BP88.get(qbCint(g.V_1778))),
        ); // 8679
        if (!(g.L_BPc2.get(1, 0) === 0.0 && g.V_1778 === 2.0)) {
          pc = 109;
          continue;
        } // 8680
        L_BP4e = g.s(
          L_BP4e + (g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_1778))) / Math.tan(g.V_16a8),
        ); // 8681
        pc = 109;
        continue;
      case 109:
        // L_5bf5a
        L_BP52 = g.s(
          L_BP52 +
            ((g.pot(g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_1778)), 3.0) / 6.0) *
              (1.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16a8)) *
              (2.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16a8))) /
              Math.tan(g.V_16a8),
        ); // 8683
        if (!(g.L_BP88.get(1) > g.V_0ef4)) {
          pc = 110;
          continue;
        } // 8684
        g.V_16b0 = Math.atan((g.L_BP9a.get(1) - g.V_0efc) / (g.L_BP88.get(1) - g.V_0ef4)); // 8685
        L_BP52 = g.s(
          L_BP52 -
            (g.pot(g.L_BP9a.get(1) - g.V_0efc, 3.0) *
              (1.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16b0)) *
              (2.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16b0))) /
              (Math.tan(g.V_16b0) * 6.0),
        ); // 8686
        pc = 110;
        continue;
      case 110:
        // L_5c109
        g.V_1778 = g.s(g.V_1778 + 1.0); // 8688
        if (!(g.V_1778 >= g.V_0f04)) {
          pc = 102;
          continue;
        } // 8689
        pc = 111;
        continue;
      case 111:
        // L_5c13f
        pc = 112;
        continue;
      case 112:
        // L_5c144
        if (
          !(
            g.L_BP88.get(qbCint(g.V_0f04)) < g.L_BP88.get(qbCint(g.V_0ef0)) &&
            g.V_0f04 + 1.0 <= g.V_0ef0 - 1.0
          )
        ) {
          pc = 116;
          continue;
        } // 8692
        if (!(g.L_BP88.get(qbCint(g.V_0f04 + 1.0)) < g.L_BP88.get(qbCint(g.V_0ef0)))) {
          pc = 113;
          continue;
        } // 8693
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_0f04 + 1.0)); // 8694
        g.V_0efc = g.L_BP9a.get(qbCint(g.V_0f04 + 1.0)); // 8695
        pc = 114;
        continue; // 8696
      case 113:
        // L_5c267
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_0ef0)); // 8698
        g.V_0efc =
          g.L_BP9a.get(qbCint(g.V_0f04)) +
          ((g.L_BP9a.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP9a.get(qbCint(g.V_0f04))) /
            (g.L_BP88.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP88.get(qbCint(g.V_0f04)))) *
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_0f04))); // 8699
        pc = 114;
        continue;
      case 114:
        // L_5c363
        if (!(g.L_BPc2.get(qbCint(g.V_0f04), 0) === 0.0)) {
          pc = 115;
          continue;
        } // 8701
        L_BP3e = g.s(L_BP3e + (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_0f04)))); // 8702
        pc = 115;
        continue;
      case 115:
        // L_5c3ce
        L_BP42 = g.s(
          L_BP42 +
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_0f04))) *
              (g.pot(g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_0f04)), 2.0) +
                (g.L_BP9a.get(1) - g.L_BP9a.get(qbCint(g.V_0f04))) * (g.L_BP9a.get(1) - g.V_0efc) +
                g.pot(g.L_BP9a.get(1) - g.V_0efc, 2.0)),
        ); // 8704
        g.V_0f04 = g.s(g.V_0f04 + 1.0); // 8705
        pc = 112;
        continue; // 8706
      case 116:
        // L_5c4c8
        if (!(g.L_BP88.get(qbCint(g.V_0ef0)) < g.L_BP88.get(qbCint(g.V_0ef0 - 1.0)))) {
          pc = 126;
          continue;
        } // 8708
        g.V_1778 = g.s(g.V_0ef0 - 1.0); // 8709
        pc = 117;
        continue;
      case 117:
        // L_5c532
        if (!(g.L_BP88.get(qbCint(g.V_1778 - 1.0)) >= g.L_BP88.get(qbCint(g.V_0ef0)))) {
          pc = 118;
          continue;
        } // 8711
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_1778 - 1.0)); // 8712
        g.V_0efc = g.L_BP9a.get(qbCint(g.V_1778 - 1.0)); // 8713
        pc = 119;
        continue; // 8714
      case 118:
        // L_5c5e2
        g.V_0ef4 = g.L_BP88.get(qbCint(g.V_0ef0)); // 8716
        g.V_0efc =
          g.L_BP9a.get(qbCint(g.V_1778)) +
          ((g.L_BP9a.get(qbCint(g.V_1778 - 1.0)) - g.L_BP9a.get(qbCint(g.V_1778))) /
            (g.L_BP88.get(qbCint(g.V_1778 - 1.0)) - g.L_BP88.get(qbCint(g.V_1778)))) *
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778))); // 8717
        pc = 119;
        continue;
      case 119:
        // L_5c6de
        if (!(g.L_BP88.get(qbCint(g.V_1778)) !== g.V_0ef4)) {
          pc = 122;
          continue;
        } // 8719
        if (!(g.L_BP9a.get(qbCint(g.V_1778)) > g.V_0efc)) {
          pc = 120;
          continue;
        } // 8720
        g.V_16a0 = -Math.atan(
          (g.L_BP9a.get(qbCint(g.V_1778)) - g.V_0efc) / (g.L_BP88.get(qbCint(g.V_1778)) - g.V_0ef4),
        ); // 8721
        pc = 121;
        continue; // 8722
      case 120:
        // L_5c7a5
        g.V_16a0 = Math.atan(
          (g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778))) / (g.L_BP88.get(qbCint(g.V_1778)) - g.V_0ef4),
        ); // 8724
        pc = 121;
        continue;
      case 121:
        // L_5c805
        pc = 123;
        continue; // 8726
      case 122:
        // L_5c80d
        g.V_16a0 = 0.0; // 8728
        pc = 123;
        continue;
      case 123:
        // L_5c823
        g.V_16a8 = Math.atan(
          (g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(qbCint(g.V_1778))) /
            (g.L_BP88.get(qbCint(g.V_1778)) - g.L_BP88.get(qbCint(g.V_0ef0))),
        ); // 8730
        if (!(g.L_BPc2.get(qbCint(g.V_0ef0 - 1.0), 0) === 0.0 && g.V_0ef0 - 1.0 === g.V_1778)) {
          pc = 124;
          continue;
        } // 8731
        L_BP4e = g.s(
          L_BP4e +
            (g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(qbCint(g.V_1778))) / Math.tan(g.V_16a8),
        ); // 8732
        pc = 124;
        continue;
      case 124:
        // L_5c966
        L_BP52 = g.s(
          L_BP52 +
            ((g.pot(g.L_BP9a.get(qbCint(g.V_0ef0)) - g.L_BP9a.get(qbCint(g.V_1778)), 3.0) / 6.0) *
              (1.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16a8)) *
              (2.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16a8))) /
              Math.tan(g.V_16a8),
        ); // 8734
        if (!(g.L_BP88.get(qbCint(g.V_0ef0)) < g.V_0ef4)) {
          pc = 125;
          continue;
        } // 8735
        g.V_16b0 = Math.atan(
          (g.L_BP9a.get(qbCint(g.V_0ef0)) - g.V_0efc) / (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_0ef0))),
        ); // 8736
        L_BP52 = g.s(
          L_BP52 -
            (g.pot(g.L_BP9a.get(qbCint(g.V_0ef0)) - g.V_0efc, 3.0) *
              (1.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16b0)) *
              (2.0 - Math.tan(g.V_16a0) / Math.tan(g.V_16b0))) /
              (Math.tan(g.V_16b0) * 6.0),
        ); // 8737
        pc = 125;
        continue;
      case 125:
        // L_5cb4d
        g.V_1778 = g.s(g.V_1778 - 1.0); // 8739
        if (!(g.L_BP88.get(qbCint(g.V_1778)) <= g.L_BP88.get(qbCint(g.V_0ef0)))) {
          pc = 117;
          continue;
        } // 8740
        pc = 126;
        continue;
      case 126:
        // L_5cbb1
        g.V_1778 = g.s(g.V_0f10); // 8742
        g.V_0ef4 = 0.0; // 8743
        pc = 127;
        continue;
      case 127:
        // L_5cbd8
        if (!(g.V_1778 !== g.V_1788)) {
          pc = 131;
          continue;
        } // 8745
        g.V_0f04 = g.s(g.V_1778 + 1.0); // 8746
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_0f04)) {
          pc = 128;
          continue;
        } // 8747
        g.V_0f04 = g.s(1.0); // 8748
        pc = 128;
        continue;
      case 128:
        // L_5cc4d
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1778)) > 2)) {
          pc = 129;
          continue;
        } // 8750
        g.V_0ef4 =
          ((g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1778)) - 2) *
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(g.V_1778)) - g.A_15b0.get(qbCint(g.V_0f04)), 2.0) +
                g.pot(g.A_15de.get(qbCint(g.V_1778)) - g.A_15de.get(qbCint(g.V_0f04)), 2.0),
            )) /
            (g.raiz(
              g.pot(g.A_15b0.get(qbCint(g.V_0f10)) - g.A_15b0.get(qbCint(g.V_1788)), 2.0) +
                g.pot(g.A_15de.get(qbCint(g.V_0f10)) - g.A_15de.get(qbCint(g.V_1788)), 2.0),
            ) *
              10.0) +
          g.V_0ef4; // 8751
        pc = 129;
        continue;
      case 129:
        // L_5cde0
        g.V_1778 = g.s(g.V_1778 + 1.0); // 8753
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1778)) {
          pc = 130;
          continue;
        } // 8754
        g.V_1778 = g.s(1.0); // 8755
        pc = 130;
        continue;
      case 130:
        // L_5ce3f
        pc = 127;
        continue; // 8757
      case 131:
        // L_5ce48
        pc = pilha.pop() ?? 0;
        continue; // 8759
      case 132:
        // L_5ce57
        return;
      default:
        throw new Error(`S_578ad: pc ${pc}`);
    }
  }
}

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
import { qbCint, qbClng, qbFix, qbInt } from "../base/f32";
import {
  EstadoLajecalc,
  S_2018c,
  carregaPadrao,
  pot,
  type PadraoCharneirasSistrut,
} from "./charneiras";

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
    [a.inicio.x, a.inicio.y, a.fim.x, a.fim.y, a.carga].forEach((v, j) => g.A_0fe6.set(v, k + 1, j));
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
 *  O padrão precisa vir de `padraoDeCharneiras` deste módulo (traz os segmentos no
 *  formato do original); o i de cada bordo sai dos códigos guardados nele
 *  (LAJECALC.BAS:8742-8757), igual ao `i` do contrato. */
export const coeficienteDeCarga: CoeficienteDeCarga = (padrao, _i, parametros, modo) => {
  if (!("bruto" in padrao)) {
    throw new Error("coeficienteDeCarga: use o padrão de padraoDeCharneiras (sistrut/lajes)");
  }
  const g = new EstadoLajecalc(parametros, modo);
  carregaPadrao(g, (padrao as PadraoCharneirasSistrut).bruto);
  S_578ad(g);
  return coeficienteDoEstado(g);
};

// ===== TRADUÇÃO MECÂNICA de LAJECALC.BAS (gerada por traduz.py; não editar à mão) =====

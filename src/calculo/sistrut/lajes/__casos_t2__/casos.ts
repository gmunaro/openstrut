// Fixtures da rodada 2 da T2: os casos v2par de laje do oráculo (T10).
//
// - `v2par_*.json`: valores impressos pelo original, cópia de
//   v2-paridade/oraculo-novos/ (mesmo formato de `__oraculo__/`).
// - `v2par_*.laj.json`: estado final da obra que o original gravou
//   (oraculo/runs/v2par_<caso>-*/obra/*.LAJ, ordem do LAJEGRAV.BAS:483-620),
//   extraído por t2r2/extrai.py (fora do repositório). H e M+ por laje (A_12fc(i,0..1)), com 7
//   algarismos (o SINGLE); μ e ângulo pelo POLÍGONO da laje (A_1210(V_177c,·),
//   LAJECALC.BAS:1907; o lajinfo.py da T10 os associa pelo número da laje, o que troca
//   o μ do balanço e das lajes L2/L3 do assim). Bordo = lado − 1.
//
// Entrada dos testes (a T2 não depende da T1):
// - M+ com os códigos gravados no fim: o do .LAJ;
// - M+ com outros códigos (antes da otimização, todo bordo contínuo tem 22, e os
//   passos intermediários): coeficiente de carga da conta à mão de livros_laje.md 1.7
//   para retângulo com UM bordo engastado de i qualquer (ver `coeficienteUmEngaste`),
//   conferido contra o .LAJ em v2par.test.ts;
// - q(H) = ocupação/área + H·2,5/100 + 0,10 (LAJECALC.BAS:825), com a ocupação de cada
//   caso (cargas: L1 0,15 + 0,30 de duas áreas; L2 0,15 + alvenaria 0,4·5/20).
import type { CasoOraculo } from "../../__oraculo__";
import { sng } from "../../base/f32";
import type { Continuidade, EsforcosLajes, LajeSistrut, MomentosDeLaje } from "../../base/tipos";
import assim from "./v2par_laje_assim.json";
import assimLaj from "./v2par_laje_assim.laj.json";
import balanco from "./v2par_laje_balanco.json";
import balancoLaj from "./v2par_laje_balanco.laj.json";
import cargas from "./v2par_laje_cargas.json";
import cargasLaj from "./v2par_laje_cargas.laj.json";
import livre from "./v2par_laje_livre.json";
import livreLaj from "./v2par_laje_livre.laj.json";
import otim from "./v2par_laje_otim.json";
import otimLaj from "./v2par_laje_otim.laj.json";
import r2 from "./v2par_laje_r2.json";
import r2Laj from "./v2par_laje_r2.laj.json";
import r3 from "./v2par_laje_r3.json";
import umadir from "./v2par_laje_umadir.json";
import umadirLaj from "./v2par_laje_umadir.laj.json";
import vigaFluxo from "./v2par_viga_fluxo.json";
import vigaFluxoLaj from "./v2par_viga_fluxo.laj.json";

/** Laje como o .LAJ final a grava. */
interface LajeGravada {
  nome: string;
  tipo: number;
  poligono: number;
  vertices: number[][];
  codigosFinais: number[];
  angulo: number;
  mu: number;
  area: number;
  cargaPermanente: number;
  h: number;
  mPositivoFinalTcm: number;
}
interface ObraGravada {
  caso: string;
  laj: string;
  lajes: LajeGravada[];
  continuidades: {
    lajeA: string;
    bordoA: number;
    lajeB: string | null;
    bordoB: number;
    armaduraImposta: number;
  }[];
}

/** Um caso: valores impressos, obra gravada e a ocupação/área de cada laje (t/m²). */
export interface CasoT2 {
  oraculo: CasoOraculo;
  obra: ObraGravada;
  ocupacao: Record<string, number>;
}

const padrao = (obra: ObraGravada) =>
  Object.fromEntries(obra.lajes.map((l) => [l.nome, 0.15 * l.area]));

const caso = (
  oraculo: CasoOraculo,
  obra: ObraGravada,
  ocupacao?: Record<string, number>,
): CasoT2 => ({
  oraculo,
  obra,
  ocupacao: ocupacao ?? padrao(obra),
});

/** Casos da rodada 2. `r3` usa a obra do `otim` (mesma obra, piso Mneg/Mpos 0,35). */
export const CASOS_T2 = {
  livre: caso(livre, livreLaj),
  balanco: caso(balanco, balancoLaj),
  umadir: caso(umadir, umadirLaj),
  assim: caso(assim, assimLaj),
  otim: caso(otim, otimLaj),
  r2: caso(r2, r2Laj),
  r3: caso(r3, otimLaj),
  // cargas: L1 = 0,15·20 + 0,30·20 = 9 t; L2 = 0,15·20 + 0,4 t/m · 5 m = 5 t.
  cargas: caso(cargas, cargasLaj, { L1: 9, L2: 5 }),
  vigaFluxo: caso(vigaFluxo, vigaFluxoLaj),
};

/** q(H) = ocupação/área + H·2,5/100 + permanente, t/m², sem arredondar (é a
 *  expressão do LAJECALC.BAS:825 antes do ÷ coef). */
export function cargaTotal(c: CasoT2, laje: LajeGravada, h: number) {
  return (
    sng(c.ocupacao[laje.nome]!) / sng(laje.area) +
    (1 / 100) * h * sng(2.5) +
    sng(laje.cargaPermanente)
  );
}

/** Fator de direção do bordo com ângulo 0 (LAJECALC.BAS:1907-1934): μ = 1 → 1;
 *  a = |dy|/L, b = |dx|/L; μ < 1 → μ·b + a; μ > 1 → a/μ + b. */
export function fatorDirecao(laje: LajeGravada, bordo: number) {
  if (laje.angulo !== 0) throw new Error(`${laje.nome}: fixture só trata ângulo 0`);
  const mu = sng(laje.mu);
  if (mu === 1) return 1;
  const v = laje.vertices;
  const [x1, y1] = v[bordo]!;
  const [x2, y2] = v[(bordo + 1) % v.length]!;
  const l = Math.hypot(x2! - x1!, y2! - y1!);
  const a = Math.abs(y2! - y1!) / l;
  const b = Math.abs(x2! - x1!) / l;
  return mu < 1 ? mu * b + a : a / mu + b;
}

/**
 * Coeficiente de carga, conta à mão (livros_laje.md 1.7), de um retângulo com UM bordo
 * engastado (i) e os outros apoiados, já com a afinidade (μ < 1: y·100/√μ; μ > 1:
 * x·100·√μ; INT a 0,01). A = bordo engastado, B = a outra medida, s = √(1 + i):
 * charneiras dos cantos do engaste com d_engaste = s·d_lado e a 45° nos outros; elas se
 * encontram a xc = B/(1 + s) dos lados e a s·xc do engaste (cumeeira de A − 2xc).
 *   coef = ((1 + i)A + A + 2B − 2·l_22)/(volume − l_26/3)
 *   l_22 = Σ p(1 − sen α)/(sen α + 1,14),  l_26 = Σ p·h²(1 − sen α)/(5 sen α + 1,14)
 * com (p, α, h) = (xc, atan s, s·xc), (s·xc, atan 1/s, xc) e 2 × (xc, 45°, xc).
 */
export function coeficienteUmEngaste(laje: LajeGravada, codigos: readonly number[]) {
  const engastes = codigos.flatMap((c, k) => (c > 2 ? [k] : []));
  if (engastes.length !== 1) throw new Error(`${laje.nome}: a conta à mão só trata um engaste`);
  const bordo = engastes[0]!;
  const i = (codigos[bordo]! - 2) / 10;
  const xs = laje.vertices.map((p) => p[0]!);
  const ys = laje.vertices.map((p) => p[1]!);
  const mu = sng(laje.mu);
  let largura = Math.max(...xs) - Math.min(...xs);
  let altura = Math.max(...ys) - Math.min(...ys);
  if (mu < 1) altura = Math.floor((altura * 100) / Math.sqrt(mu)) / 100;
  if (mu > 1) largura = Math.floor(largura * 100 * Math.sqrt(mu)) / 100;
  const y1 = laje.vertices[bordo]![1];
  const y2 = laje.vertices[(bordo + 1) % laje.vertices.length]![1];
  const horizontal = y1 === y2;
  const [A, B] = horizontal ? [largura, altura] : [altura, largura];
  const s = Math.sqrt(1 + i);
  const xc = B / (1 + s);
  const cumeeira = A - 2 * xc;
  if (!(cumeeira > 0)) throw new Error(`${laje.nome}: padrão fora da conta à mão`);
  const t22 = (p: number, a: number) => (p * (1 - Math.sin(a))) / (Math.sin(a) + 1.14);
  const t26 = (p: number, a: number, h: number) =>
    (p * h * h * (1 - Math.sin(a))) / (5 * Math.sin(a) + 1.14);
  const numerador = (1 + i) * A + A + 2 * B;
  const volume =
    (s * xc) ** 2 * (A / 6 + cumeeira / 3) +
    xc ** 2 * (A / 6 + cumeeira / 3) +
    (2 * xc ** 2 * B) / 6;
  const l22 = t22(xc, Math.atan(s)) + t22(s * xc, Math.atan(1 / s)) + 2 * t22(xc, Math.PI / 4);
  const l26 =
    t26(xc, Math.atan(s), s * xc) +
    t26(s * xc, Math.atan(1 / s), xc) +
    2 * t26(xc, Math.PI / 4, xc);
  return (numerador - 2 * l22) / (volume - l26 / 3);
}

/** Códigos antes da otimização: todo bordo contínuo com 22 (continuidade automática,
 *  LAJECALC.BAS:3730-3731). */
export const codigosAntes = (laje: LajeGravada) => laje.codigosFinais.map((c) => (c > 2 ? 22 : c));

const iguais = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, k) => v === b[k]);

/** Coeficiente de carga da laje com estes códigos: do .LAJ (100·q(H)/M+ gravado) se
 *  são os gravados; senão a conta à mão de um engaste. */
export function coeficiente(c: CasoT2, laje: LajeGravada, codigos: readonly number[]) {
  if (iguais(codigos, laje.codigosFinais))
    return (100 * cargaTotal(c, laje, laje.h)) / laje.mPositivoFinalTcm;
  return coeficienteUmEngaste(laje, codigos);
}

/** Momentos da laje com estes códigos e H, como o LAJECALC os forma (LAJECALC.BAS:
 *  616-661, 824-880): p = q/coef, M+ = 100·p, secundário M+·μ (μ ≤ 1) ou M+/μ. Com os
 *  códigos gravados e o H gravado, M+ = o do .LAJ. */
export function momentos(
  c: CasoT2,
  nome: string,
  codigos: readonly number[],
  h: number,
): MomentosDeLaje {
  const laje = c.obra.lajes.find((l) => l.nome === nome)!;
  const coef = sng(coeficiente(c, laje, codigos));
  const q = cargaTotal(c, laje, h);
  const gravado = iguais(codigos, laje.codigosFinais) && h === laje.h;
  const mPos = gravado ? sng(laje.mPositivoFinalTcm) : sng(100 * sng(q / coef));
  const mu = sng(laje.mu);
  const bordos = codigos.map((codigo, k) => {
    const fator = fatorDirecao(laje, k);
    return { fatorDirecao: fator, coeficiente: codigo > 2 ? sng(((codigo - 2) * fator) / 10) : 0 };
  });
  return {
    nome,
    h,
    q: sng(q),
    qSemArredondar: q,
    p: sng(q / coef),
    pesoProprio: sng((1 / 100) * h * sng(2.5)),
    coeficiente: { coeficiente: coef, l1a: 0, l32: 0, l1e: 0, l22: 0, l26: 0, l2a: 0, l2e: 0 },
    mPositivoPrincipalTcm: mPos,
    mPositivoSecundarioTcm: sng(mu <= 1 ? mPos * mu : mPos / mu),
    mNegativoMaiorTcm: 0,
    mNegativoMenorTcm: 0,
    bordos,
  };
}

/** Laje do painel com estes códigos. */
export function lajeSistrut(c: CasoT2, laje: LajeGravada, codigos: number[]): LajeSistrut {
  return {
    nome: laje.nome,
    tipo: laje.tipo === 1 ? 1 : laje.tipo === 2 ? 2 : laje.tipo === 3 ? 3 : 0,
    vertices: laje.vertices.map(([x, y]) => ({ x: x!, y: y! })),
    indicesVertices: [],
    grupo: 0,
    codigos,
    angulo: laje.angulo,
    mu: sng(laje.mu),
    cargaPermanente: sng(laje.cargaPermanente),
    pesoProprio: sng((laje.h * 2.5) / 100),
    h: laje.h,
  };
}

/** Esforços do painel antes ("antes", códigos 22) ou depois ("depois", os gravados) da
 *  otimização, com o H gravado, e o `recalcula` da otimização. */
export function esforcos(c: CasoT2, estado: "antes" | "depois") {
  const lajes = c.obra.lajes.map((l) =>
    lajeSistrut(c, l, estado === "antes" ? codigosAntes(l) : [...l.codigosFinais]),
  );
  const m = Object.fromEntries(lajes.map((l) => [l.nome, momentos(c, l.nome, l.codigos, l.h!)]));
  const continuidades: Continuidade[] = c.obra.continuidades.map((x) => ({
    lajeA: x.lajeA,
    bordoA: x.bordoA,
    lajeB: x.lajeB,
    bordoB: x.bordoB,
    ...(x.armaduraImposta !== 0 ? { armaduraImposta: x.armaduraImposta } : {}),
  }));
  const resultado: EsforcosLajes = {
    lajes,
    continuidades,
    preparadas: {},
    coeficientes: Object.fromEntries(lajes.map((l) => [l.nome, m[l.nome]!.coeficiente])),
    bordos: Object.fromEntries(lajes.map((l) => [l.nome, m[l.nome]!.bordos])),
    momentos: m,
    avisos: [],
    memoria: [],
  };
  const recalcula = (l: LajeSistrut) => momentos(c, l.nome, l.codigos, l.h!);
  return { esforcos: resultado, recalcula };
}

/** Momentos com H qualquer e os códigos de antes da otimização (espessura mínima). */
export const momentosComH = (c: CasoT2, nome: string) => (h: number) => {
  const laje = c.obra.lajes.find((l) => l.nome === nome)!;
  return momentos(c, nome, codigosAntes(laje), h);
};

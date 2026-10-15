// Direção e μ, fator de direção, momentos e imposição de H, contra contas à mão
// (livros_laje.md 1.4, 1.8, 1.12, 2.2) e o oráculo (caso_a_laje).
import { describe, expect, it } from "vitest";
import { CASOS_ORACULO, type CasoOraculo, bateComImpresso, valorOraculo } from "../__oraculo__";
import { ErroQB } from "../base/f32";
import { PARAMETROS_LAJE, emSingle } from "../base/parametros";
import type { LajeSistrut, Ponto } from "../base/tipos";
import { preparaLaje } from "./coeficiente";
import {
  coeficientesDosBordos,
  direcaoMu,
  fatorDeDirecao,
  impoeEspessura,
  momentosComCoeficiente,
  momentosLaje,
} from "./momentos";

const P = emSingle(PARAMETROS_LAJE);
const f = Math.fround;
const CASO_A = CASOS_ORACULO.caso_a_laje as CasoOraculo;
const retangulo = (lx: number, ly: number, y0 = 0): Ponto[] => [
  { x: 0, y: y0 },
  { x: 0, y: y0 + ly },
  { x: lx, y: y0 + ly },
  { x: lx, y: y0 },
];
// E2E L1: bordos x = 0, y = 10, x = 4 (contínuo), y = 5 (contínuo)
const l1 = (extra: Partial<LajeSistrut> = {}): LajeSistrut => ({
  nome: "L1",
  tipo: 0,
  vertices: retangulo(4, 5, 5),
  indicesVertices: [4, 7, 8, 5],
  grupo: 0,
  codigos: [0, 0, 22, 22],
  angulo: 0,
  mu: f(0.8),
  cargaPermanente: f(0.1),
  pesoProprio: f(0.25),
  h: 10,
  ...extra,
});
const ocupacaoE2E = { vertices: retangulo(8, 10), total: f(0.15), acidental: f(0.15) };
const painelDe = (l: LajeSistrut, cargas = [ocupacaoE2E]) => ({
  lajes: [l],
  cargasPorArea: cargas,
  alvenarias: [],
  continuidades: [],
});

describe("direcaoMu (LAJECALC.BAS:4801-4971)", () => {
  it("E2E 4 × 5 a 0°: cordas 4 e 5, razão 0,80; última relação < 0,80 é 0,67 → μ 0,80", () => {
    const r = direcaoMu(retangulo(4, 5), 0, P, "original");
    expect(r.razao).toBe(f(0.8));
    expect(r.mu).toBe(f(0.8));
  });

  it("4 × 5 a 90°: razão 5/4 = 1,25; 1,20 < 1,25 e 1,50 não → μ 1,1 (calc2 L1)", () => {
    const r = direcaoMu(retangulo(4, 5, 5), 90, P, "original");
    expect(r.razao).toBe(1.25);
    expect(r.mu).toBe(f(1.1));
  });

  it("quadrado: razão 1,00 não é < 1,00, fica o μ de 0,83 → 0,9 (sem interpolar)", () => {
    expect(direcaoMu(retangulo(4, 4), 0, P, "original").mu).toBe(f(0.9));
  });

  it("2 × 8: razão 0,25, nenhuma relação abaixo → μ da primeira linha, 0,40", () => {
    expect(direcaoMu(retangulo(2, 8), 0, P, "original").mu).toBe(f(0.4));
  });
});

describe("fatorDeDirecao (LAJECALC.BAS:1906-1934)", () => {
  it("ângulo 0, μ 0,8: bordo vertical 1, horizontal μ", () => {
    const l = l1();
    expect([0, 1, 2, 3].map((k) => fatorDeDirecao(l, k, "original"))).toEqual([
      1,
      f(0.8),
      1,
      f(0.8),
    ]);
  });

  it("ângulo 90°, μ 1,1: vertical vira horizontal (1); horizontal vale 1/μ", () => {
    const l = l1({ angulo: 90, mu: f(1.1) });
    expect(fatorDeDirecao(l, 0, "original")).toBeCloseTo(1, 12);
    expect(fatorDeDirecao(l, 1, "original")).toBeCloseTo(1 / f(1.1), 12);
  });

  it("μ = 1: fator 1 em qualquer bordo", () => {
    expect(fatorDeDirecao(l1({ mu: 1 }), 1, "original")).toBe(1);
  });
});

describe("momentosLaje (LAJECALC.BAS:875-880, 616-661)", () => {
  const laje = l1();
  const preparada = preparaLaje(laje, painelDe(laje), P, "original");
  const m = momentosLaje({ laje, preparada, h: 10, parametros: P }, "original");

  it("E2E H 10: q 0,15 + 0,25 + 0,10 = 0,50; coef 2,0180 (livros_laje.md 2.2)", () => {
    expect(m.q).toBe(f(0.5));
    expect(m.pesoProprio).toBe(f(0.25));
    expect(m.coeficiente.coeficiente).toBeCloseTo(2.018, 4);
  });

  it("E2E H 10: M+ 0,2478, M+ sec 0,1982, M− 0,4955 e 0,3964 t·m/m (livros_laje.md 2.2)", () => {
    expect(m.mPositivoPrincipalTcm / 100).toBeCloseTo(0.5 / 2.018, 3);
    expect(m.mPositivoSecundarioTcm / 100).toBeCloseTo((0.8 * 0.5) / 2.018, 3);
    expect(m.mNegativoMaiorTcm / 100).toBeCloseTo((2 * 0.5) / 2.018, 3);
    expect(m.mNegativoMenorTcm / 100).toBeCloseTo((2 * 0.8 * 0.5) / 2.018, 3);
    for (const [id, v] of [
      ["L1.M+princ.preOtim", m.mPositivoPrincipalTcm],
      ["L1.M+sec.preOtim", m.mPositivoSecundarioTcm],
      ["L1.M-maior.preOtim", m.mNegativoMaiorTcm],
      ["L1.M-menor.preOtim", m.mNegativoMenorTcm],
    ] as const) {
      expect(bateComImpresso(valorOraculo(CASO_A, id), v / 100), id).toBe(true);
    }
  });

  it("expõe p = q/coef calculado com q sem arredondar (V_1400!)", () => {
    const e = momentosComCoeficiente(
      laje,
      preparada.alvenaria,
      preparada.cargaArea,
      preparada.area,
      10,
      m.coeficiente,
      P,
      "original",
    );
    expect(e.p).toBe(f(e.qSemArredondar / m.coeficiente.coeficiente));
    expect(e.mPositivoPrincipalTcm).toBe(f(100 * e.p));
    expect(e.mPositivoPrincipalTcm).toBe(m.mPositivoPrincipalTcm);
  });

  it("bordos: fator e (código − 2)/10·fator; c_max 2,0 e c_min 1,6", () => {
    expect(m.bordos.map((b) => b.coeficiente)).toEqual([0, 0, 2, f(1.6)]);
    const { maior, menor } = coeficientesDosBordos(laje, "original");
    expect([maior, menor]).toEqual([2, f(1.6)]);
  });

  it("balanço 2 × 4 engastado em x = 0, sem ocupação, H 10: M− = q·a²/2 e M+ negativo", () => {
    // q = 0,25 + 0,10 = 0,35; c = −1 (l_1a = 0) → M+ = −0,35; M− = |M+|·2 = 0,35·2²/2
    const b = l1({ vertices: retangulo(2, 4), codigos: [22, 1, 1, 1], mu: 1 });
    const pb = preparaLaje(b, painelDe(b, []), P, "original");
    const mb = momentosLaje({ laje: b, preparada: pb, h: 10, parametros: P }, "original");
    expect(mb.mPositivoPrincipalTcm / 100).toBeCloseTo(-0.35, 6);
    expect(mb.mPositivoSecundarioTcm).toBe(0);
    expect(mb.mNegativoMaiorTcm / 100).toBeCloseTo((0.35 * 2 ** 2) / 2, 6);
  });

  it("coeficiente nulo (balanço sem engaste): erro de divisão do original", () => {
    const c = { coeficiente: 0, l1a: 0, l32: 0, l1e: 24, l22: 0, l26: 0, l2a: 0, l2e: 0 };
    expect(() => momentosComCoeficiente(laje, 0, 0, 8, 10, c, P, "original")).toThrow(ErroQB);
  });

  it("modo corrigido aceita código fracionário (otimização R3): 15,3 → c 1,33·fator", () => {
    const lc = l1({ codigos: [0, 0, 15.3, 22], mu: 0.8, cargaPermanente: 0.1 });
    const pc = preparaLaje(
      lc,
      painelDe(lc, [{ ...ocupacaoE2E, total: 0.15 }]),
      PARAMETROS_LAJE,
      "corrigido",
    );
    const mc = momentosLaje(
      { laje: lc, preparada: pc, h: 10, parametros: PARAMETROS_LAJE },
      "corrigido",
    );
    expect(mc.bordos[2]?.coeficiente).toBeCloseTo(1.33, 12);
    // c_max = max(1,33·1; 2·0,8) = 1,6; c_min = 1,33
    expect(mc.mNegativoMaiorTcm / mc.mPositivoPrincipalTcm).toBeCloseTo(1.6, 12);
    expect(mc.mNegativoMenorTcm / mc.mPositivoPrincipalTcm).toBeCloseTo(1.33, 12);
  });
});

describe("impoeEspessura (LAJECALC.BAS:1171-1248)", () => {
  it("H 10: grava H e o peso próprio 10·2,5/100 = 0,25 (caso_a, impressora.prn:27)", () => {
    const { laje, avisos } = impoeEspessura(l1({ pesoProprio: 0.3 }), 10, P, "original");
    expect(avisos).toEqual([]);
    expect(laje.h).toBe(10);
    expect(bateComImpresso(valorOraculo(CASO_A, "L1.pp"), laje.pesoProprio)).toBe(true);
    expect(laje.pesoProprio).toBe(f(0.25));
  });

  it.each([7.5, 5, 41])("H %f recusado (inteiro entre 6 e 40)", (h) => {
    const l = l1();
    const r = impoeEspessura(l, h, P, "original");
    expect(r.laje).toBe(l);
    expect(r.avisos).toHaveLength(1);
  });

  it("só tipos 0 e 3: pré-moldada fica como veio", () => {
    const l = l1({ tipo: 1 });
    expect(impoeEspessura(l, 10, P, "original").laje).toBe(l);
    expect(impoeEspessura(l1({ tipo: 3 }), 10, P, "original").laje.h).toBe(10);
  });
});

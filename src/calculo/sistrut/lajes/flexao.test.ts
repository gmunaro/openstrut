// Referências: contas à mão de livros_laje.md 2.3-2.4 (E2E, aço B) e o caso
// retrad_laje_param do oráculo (fck 0,2, aço A, γf 1,5, eficiência 90 %).
import { describe, expect, it } from "vitest";
import { CASOS_ORACULO, bateComImpresso, valorOraculo } from "../__oraculo__";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type { MateriaisSistrut } from "../base/tipos";
import { alturaUtilLaje, flexaoLaje, xiLimiteLaje } from "./flexao";

const PARAM = emSingle(PARAMETROS_LAJE);
const E2E: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};
const PARAM_ALTERADO = { ...PARAM, eficienciaNegativa: sng(0.9) };
const MAT_ALTERADO: MateriaisSistrut = { ...E2E, fck: sng(0.2), classeAco: "A", gamaF: sng(1.5) };

describe("ξlim e d", () => {
  it("aço B: 1/((5/(1,15·2100) + 0,002)/0,0035 + 1) = 0,4623 (livros_laje.md 2.3)", () => {
    expect(xiLimiteLaje(E2E, PARAM, "original")).toBeCloseTo(0.4623, 4);
  });
  it("aço A: 1/((5/(1,15·2100))/0,0035 + 1) = 0,6283 (conta à mão)", () => {
    expect(xiLimiteLaje(MAT_ALTERADO, PARAM, "original")).toBeCloseTo(0.6283, 4);
  });
  it("d = H − 1,5 − 0,5", () => {
    expect(alturaUtilLaje(10, PARAM, "original")).toBe(8);
  });
});

describe("flexão da laje, E2E H 10 (livros_laje.md 2.3)", () => {
  // M em t·cm/m; valores esperados (x, x/d, As) da tabela 2.3, 4 casas.
  const casos = [
    { nome: "negativa maior", m: 49.55, negativa: true, x: 1.2711, xd: 0.1589, as: 2.1299 },
    { nome: "negativa menor", m: 39.64, negativa: true, x: 1.0025, xd: 0.1253, as: 1.6799 },
    {
      nome: "positiva principal (mínimo 0,15·H)",
      m: 24.78,
      negativa: false,
      x: 0.614,
      xd: 0.0768,
      as: 1.5,
    },
    {
      nome: "positiva secundária (mínimo)",
      m: 19.82,
      negativa: false,
      x: 0.488,
      xd: 0.061,
      as: 1.5,
    },
  ];
  for (const c of casos) {
    it(c.nome, () => {
      const f = flexaoLaje({ mTcm: c.m, h: 10, negativa: c.negativa }, E2E, PARAM, "original");
      expect(f.passa).toBe(true);
      expect(f.x).toBeCloseTo(c.x, 3);
      expect(f.xd).toBeCloseTo(c.xd, 3);
      expect(f.as).toBeCloseTo(c.as, 3);
    });
  }
  it("M = 0 na positiva: x residual do x87 e o mínimo 0,15·H (v2par_laje_balanco)", () => {
    // original: X^2 pelo B$POW não é X·X; X − SQR(X^2) sobra 5,95e-19 com H 10 e a seção
    // passa com o mínimo (o oráculo imprime As 1,50). Com H 15 o resíduo sai negativo
    // (−2,38e-18) e a seção também passa. corrigido: em float64 √(X²) = X e x = 0.
    const o = flexaoLaje({ mTcm: 0, h: 10, negativa: false }, E2E, PARAM, "original");
    expect(o).toMatchObject({ passa: true, x: 5.952482160811085e-19, as: sng(1.5) });
    const o15 = flexaoLaje({ mTcm: 0, h: 15, negativa: false }, E2E, PARAM, "original");
    expect(o15).toMatchObject({ passa: true, x: -2.380992864324434e-18, as: sng(2.25) });
    const c = flexaoLaje({ mTcm: 0, h: 10, negativa: false }, E2E, PARAM, "corrigido");
    expect(c.passa).toBe(true);
    expect(c.x).toBe(0);
    expect(c.as).toBeCloseTo(1.5, 6);
  });
});

describe("seção que não passa (x = −1)", () => {
  it("H 6, M− 39,64: x/d 0,64 > 0,4623 (livros_laje.md 2.4)", () => {
    const f = flexaoLaje({ mTcm: 39.64, h: 6, negativa: true }, E2E, PARAM, "original");
    expect(f).toEqual({ passa: false, x: -1, xd: -1, as: -1 });
  });
  it("X² < Y: H 10, M 300 t·cm/m (X² = 3397 < Y = 4896)", () => {
    const f = flexaoLaje({ mTcm: 300, h: 10, negativa: true }, E2E, PARAM, "corrigido");
    expect(f.passa).toBe(false);
  });
});

describe("eficiência da negativa e aço A (retrad_laje_param)", () => {
  const caso = CASOS_ORACULO.retrad_laje_param!;
  // M− do E2E com H 10 (livros_laje.md 2.2): 0,4955 e 0,3964 tm/m.
  it("As− maior e menor: ÷ 0,9", () => {
    const maior = flexaoLaje(
      { mTcm: 49.554, h: 10, negativa: true },
      MAT_ALTERADO,
      PARAM_ALTERADO,
      "original",
    );
    const menor = flexaoLaje(
      { mTcm: 39.643, h: 10, negativa: true },
      MAT_ALTERADO,
      PARAM_ALTERADO,
      "original",
    );
    expect(bateComImpresso(valorOraculo(caso, "L1.As-maior"), maior.as)).toBe(true);
    expect(bateComImpresso(valorOraculo(caso, "L1.As-menor"), menor.as)).toBe(true);
  });
  it("eficiência ≥ 1 não divide", () => {
    const f = flexaoLaje(
      { mTcm: 49.554, h: 10, negativa: true },
      E2E,
      { ...PARAM, eficienciaNegativa: 1.2 },
      "original",
    );
    expect(f.as).toBeCloseTo(2.1299, 3);
  });
});

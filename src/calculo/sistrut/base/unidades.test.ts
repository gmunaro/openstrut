// Valores de referência: definição de 1 tf = 9,80665 kN e a medição de
// C:/tmp/v2-paridade/PLANO.md seção 2 ("fck 0,15 t/cm² exatos (14,71 MPa) e concreto
// 2,5 t/m³ (24,517 kN/m³)"; "5 t/cm² = 490,3 MPa").
import { describe, expect, it } from "vitest";
import {
  DENSIDADE_CONCRETO_TM3,
  FYK_ORIGINAL_TCM2,
  knParaT,
  mpaParaTcm2,
  tcm2ParaMpa,
  tcmParaKnm,
  tmParaKnm,
  tParaKn,
  tPorM3ParaKnPorM3,
} from "./unidades";

describe("unidades do original", () => {
  it("t/cm² → MPa: 1 → 98,0665; fck 0,15 → 14,71; CA-50 5 → 490,3 (PLANO.md 2)", () => {
    expect(tcm2ParaMpa(1)).toBeCloseTo(98.0665, 10);
    expect(tcm2ParaMpa(0.15)).toBeCloseTo(14.71, 2);
    expect(tcm2ParaMpa(FYK_ORIGINAL_TCM2["CA-50"])).toBeCloseTo(490.33, 2);
    expect(mpaParaTcm2(98.0665)).toBeCloseTo(1, 12);
  });

  it("densidade 2,5 t/m³ → 24,517 kN/m³ (PLANO.md 2)", () => {
    expect(tPorM3ParaKnPorM3(DENSIDADE_CONCRETO_TM3)).toBeCloseTo(24.517, 3);
  });

  it("forças e momentos: 1 t = 9,80665 kN; 100 t·cm = 1 t·m", () => {
    expect(tParaKn(1)).toBe(9.80665);
    expect(knParaT(9.80665)).toBe(1);
    expect(tmParaKnm(2)).toBeCloseTo(19.6133, 10);
    expect(tcmParaKnm(100)).toBeCloseTo(9.80665, 12);
  });
});

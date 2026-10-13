import { describe, expect, it } from "vitest";
import { kgfCm2ParaMpa, knParaTf, mpaParaKgfCm2, tfParaKn } from "./unidades";

describe("unidades", () => {
  it("1 tf = 9,80665 kN", () => {
    expect(tfParaKn(1)).toBeCloseTo(9.80665, 10);
    expect(knParaTf(9.80665)).toBeCloseTo(1, 10);
  });
  it("fck 15 MPa ≈ 153 kgf/cm² (NB-1/78 usava 150)", () => {
    expect(mpaParaKgfCm2(15)).toBeCloseTo(152.96, 2);
    expect(kgfCm2ParaMpa(mpaParaKgfCm2(25))).toBeCloseTo(25, 10);
  });
});

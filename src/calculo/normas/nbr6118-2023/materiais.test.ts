import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import { etaC, fctm, materiais6118, moduloSecante } from "./materiais";

describe("materiais NBR 6118:2023", () => {
  it("C25, CA-50: fcd = 25/1,4; fyd = 500/1,15; σcd = 0,85 fcd", () => {
    const m = materiais6118(obraNova("x", "nbr6118-2023").materiais);
    expect(m.fcd).toBeCloseTo(17.857, 3);
    expect(m.fyd).toBeCloseTo(434.783, 3);
    expect(m.sigmaCd).toBeCloseTo(0.85 * 17.857, 2);
  });
  it("fct,m = 0,3 fck^(2/3): C25 → 2,565 MPa (conta à mão)", () => {
    expect(fctm(25)).toBeCloseTo(2.565, 3);
  });
  it("Ecs C25 granito: αi = 0,8625; Eci = 28 000; Ecs = 24 150 MPa", () => {
    expect(moduloSecante(25)).toBeCloseTo(24_150, 0);
  });
  it("ηc: 1 até C40; C50 → 0,928; C90 → 0,763 (tabela da fonte secundária)", () => {
    expect(etaC(40)).toBe(1);
    expect(etaC(50)).toBeCloseTo(0.928, 3);
    expect(etaC(90)).toBeCloseTo(0.763, 3);
  });
  it("estribo CA-60: fywd limitado a 435 MPa", () => {
    const mat = { ...obraNova("x", "nbr6118-2023").materiais, acoEstribo: "CA-60" as const };
    expect(materiais6118(mat).fywd).toBe(435);
  });
});

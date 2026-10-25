import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import { avisosMateriais6118, etaC, fctm, materiais6118, moduloSecante } from "./materiais";

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

// Tabela 7.1 (concreto armado): C20, C25, C30 e C40 nas classes de agressividade I a IV
describe("classe mínima do concreto armado", () => {
  const com = (fck: number, caa: 1 | 2 | 3 | 4) => ({
    ...obraNova("x", "nbr6118-2023").materiais,
    fck,
    caa,
  });
  it("C15 na classe I (obra importada do SISTRUT): aviso com o mínimo C20", () => {
    expect(avisosMateriais6118(com(15, 1))).toEqual([
      "fck = 15 MPa abaixo do mínimo da NBR 6118 para concreto armado na classe de agressividade I: C20 (Tabela 7.1). O cálculo segue com o fck da obra; para a norma, aumente o fck em Materiais.",
    ]);
  });
  it("no limite não avisa; acima da classe, avisa com o mínimo dela", () => {
    expect(avisosMateriais6118(com(20, 1))).toEqual([]);
    expect(avisosMateriais6118(com(25, 2))).toEqual([]);
    expect(avisosMateriais6118(com(25, 3))[0]).toMatch(/classe de agressividade III: C30/);
    expect(avisosMateriais6118(com(35, 4))[0]).toMatch(/classe de agressividade IV: C40/);
  });
});

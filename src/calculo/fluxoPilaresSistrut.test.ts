// Projeção em SI das verificações (PILAR opção 6) e do predimensionamento (PILAREDI
// 3.1), e o aviso do fluxo da V2 para os campos de pilar que só o SISTRUT calcula.
import { describe, expect, it } from "vitest";
import type { Obra } from "../dominio/obra";
import { calcularObra } from "./fluxo";
import { nb178, nbr6118 } from "./normas";
import { obraE2E } from "./sistrut/__e2e__/obraE2E";
import { KN_POR_TF, MPA_POR_TCM2 } from "./sistrut/base/unidades";

/** E2E com o P5 verificado (4 φ12,5) e predimensionamento com a seção da obra. */
function obra(): Obra {
  const o = obraE2E("original");
  return {
    ...o,
    parametrosPilar: { predimensionamento: "tensoes" },
    pavimentos: o.pavimentos.map((pav) => ({
      ...pav,
      pilares: pav.pilares.map((p) =>
        p.id !== "P5"
          ? p
          : {
              ...p,
              verificacoes: [
                {
                  barras: [
                    { x: 3, y: 17, bitola: 12.5 },
                    { x: 17, y: 17, bitola: 12.5 },
                    { x: 3, y: 3, bitola: 12.5 },
                    { x: 17, y: 3, bitola: 12.5 },
                  ],
                  esforcos: { nk: 17.37 * KN_POR_TF, mxk: 0, myk: 0, lex: 3, ley: 3 },
                },
              ],
            },
      ),
    })),
  };
}

describe("projeção em SI dos pilares pela NB-1/78", () => {
  const r = calcularObra(obra(), nb178);
  const p5 = r.pilares.find((p) => p.pilar.id === "P5")!;

  it("verificação do caso c: λ 52, Mx 0,35 tm e MR 0,51 tm em kN·m, ok", () => {
    // caso_c_pilar: c1.Mx 0.35, c1.MRx 0.51 (impressora.prn do run do oráculo)
    const v = p5.verificacoes![0]!;
    expect(v.esforcosDoLance).toBe(false);
    expect(v.nk).toBeCloseTo(17.37 * KN_POR_TF, 3);
    expect(v.lambdaX).toBe(52);
    expect(v.casos[0]!.mx).toBeCloseTo(0.35 * KN_POR_TF, 1);
    expect(v.casos[0]!.mrX).toBeCloseTo(0.51 * KN_POR_TF, 1);
    expect(v.casos.map((c) => c.veredito)).toEqual(["ok", "ok"]);
  });

  it("predimensionamento do caso c: admissíveis 0,090 e 0,113 t/cm² em MPa; carga 17,67 t", () => {
    const p = p5.predimensionamento!;
    expect(p.modo).toBe("tensoes");
    expect(p.lado).toBeUndefined();
    expect(p.tensaoNormalAdmissivel).toBeCloseTo(0.09 * MPA_POR_TCM2, 2);
    expect(p.tensaoFlexaoAdmissivel).toBeCloseTo(0.1125 * MPA_POR_TCM2, 2);
    expect(p.carga).toBeCloseTo(17.67 * KN_POR_TF, 2);
  });

  it("os outros pilares sem verificação; predimensionamento só no lance de baixo", () => {
    expect(r.pilares.filter((p) => p.verificacoes).map((p) => p.pilar.id)).toEqual(["P5"]);
    expect(r.pilares.every((p) => p.predimensionamento)).toBe(true);
  });
});

describe("fluxo da V2 (NBR 6118): campos só do SISTRUT viram aviso", () => {
  it("seção circular e verificação: aviso no pilar; parâmetros: aviso na obra", () => {
    const o = obra();
    o.pavimentos[0]!.pilares = o.pavimentos[0]!.pilares.map((p) =>
      p.id === "P5" ? { ...p, secao: { tipo: "circular", d: 25, dInterno: 0 }, b: 25, h: 25 } : p,
    );
    const r = calcularObra({ ...o, norma: "nbr6118-2023" }, nbr6118);
    const p5 = r.pilares.find((p) => p.pilar.id === "P5")!;
    expect(
      p5.resultado.avisos.some((a) => a.includes("seção circular") && a.includes("25 × 25")),
    ).toBe(true);
    expect(p5.resultado.avisos.some((a) => a.includes("verificações de seção dada"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("parâmetros de pilar"))).toBe(true);
    expect(p5.verificacoes).toBeUndefined();
  });
});

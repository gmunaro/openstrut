// PILAR opção 6 contra o original: caso c (P5 da E2E) e os casos retrad_pil_verif2 e
// retrad_pil_trava. Valores esperados = texto impresso pelo original (oráculo),
// com tolerância de meia unidade da última casa impressa.
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_PILAR } from "../base/parametros";
import type { BarraPilar, SecaoPilar } from "../base/tipos";
import { bateComImpresso, CASOS_ORACULO, type CasoOraculo, valorOraculo } from "../__oraculo__";
import { CASOS_PILAR } from "./__casos__";
import { cobre } from "./elu";
import { verificaPilarSistrut } from "./verificacao";

const par = emSingle(PARAMETROS_PILAR);
const materiais = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B" as const,
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};

/** Seção retangular com as barras do PILDADOS (PILAR.BAS:3521-3542): bordas superior e
 *  inferior em x = (k−1)(b−2c)/MAX(1, n−1) + c; laterais em x = c e b − c, y = h − Di. */
function retangular(
  b: number,
  h: number,
  c: number,
  nSup: number,
  nInf: number,
  bitola: number,
  lateralY?: number,
): SecaoPilar {
  const barras: BarraPilar[] = [];
  const borda = (n: number, y: number) => {
    for (let k = 1; k <= n; k++)
      barras.push({ x: sng(((k - 1) * (b - 2 * c)) / Math.max(1, n - 1) + c), y, bitola });
  };
  borda(nSup, h - c);
  borda(nInf, c);
  if (lateralY !== undefined)
    barras.push({ x: c, y: lateralY, bitola }, { x: b - c, y: lateralY, bitola });
  return { tipo: "retangular", b, h, barras };
}

/** Confere um valor do oráculo; "-0.00" exige também o sinal negativo. */
function confere(caso: CasoOraculo, id: string, calculado: number) {
  const v = valorOraculo(caso, id);
  expect(
    bateComImpresso(v, calculado),
    `${caso.caso} ${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
  if (v.impresso.trim().startsWith("-")) expect(calculado, id).toBeLessThan(0);
}

const textoVeredito = (v: string) => (v === "INSTABILIDADE" ? "SITUACAO DE INSTABILIDADE" : v);

describe("caso_c_pilar: PILAR opção 6, 20×20, 4 φ12,5, Nk 17,37, le 3", () => {
  const caso = CASOS_ORACULO.caso_c_pilar!;
  const r = verificaPilarSistrut(
    {
      secao: retangular(20, 20, 3, 2, 2, 12.5),
      nk: sng(17.37),
      mxk: 0,
      myk: 0,
      lxe: 3,
      lye: 3,
      materiais,
      parametros: par,
    },
    "original",
  );

  it("Jx, Jy, λ e situação", () => {
    confere(caso, "P.Jx", r.jx);
    confere(caso, "P.Jy", r.jy);
    confere(caso, "P.lambdaX", r.lambdaX);
    confere(caso, "P.lambdaY", r.lambdaY);
    expect(r.situacao).toBe(valorOraculo(caso, "c1.situacao").impresso);
    expect(r.casos.map((c) => c.rotulo)).toEqual(["1/2", "2/2"]);
  });

  it.each([
    ["c1", 0],
    ["c2", 1],
  ] as const)("%s: atuante, MR de 1ª e 2ª ordem, estado e veredito", (p, i) => {
    const c = r.casos[i]!;
    confere(caso, `${p}.Mx`, c.mx);
    confere(caso, `${p}.My`, c.my);
    confere(caso, `${p}.Mxa`, c.mxa);
    confere(caso, `${p}.Mya`, c.mya);
    confere(caso, `${p}.Mtotal`, c.mTotal);
    confere(caso, `${p}.incl`, c.anguloAtuante);
    confere(caso, `${p}.MRx1a`, c.mrx);
    confere(caso, `${p}.MRx`, c.mrxReduzido);
    confere(caso, `${p}.MRy1a`, c.mry);
    confere(caso, `${p}.MRy`, c.mryReduzido);
    confere(caso, `${p}.MRtotal`, c.mrTotal);
    confere(caso, `${p}.ln`, c.anguloLN);
    confere(caso, `${p}.Xln`, c.xLN);
    confere(caso, `${p}.1/r`, c.curvatura * 1000);
    confere(caso, `${p}.defCon`, c.deformacaoConcreto);
    confere(caso, `${p}.defAco`, c.deformacaoAco);
    expect(c.veredito).toBe(valorOraculo(caso, `${p}.veredito`).impresso);
  });

  it("2ª ordem de 0,09 tm pela curvatura (livros_viga_pilar.md 3.2 passo 9)", () => {
    confere(caso, "c1.MRx2a", r.casos[0]!.m2x);
    confere(caso, "c2.MRy2a", r.casos[1]!.m2y);
  });

  it("corrigido: mesmo veredito (só o ≥ do D-7 e a tolerância do D-3 mudam)", () => {
    const rc = verificaPilarSistrut(
      {
        secao: retangular(20, 20, 3, 2, 2, 12.5),
        nk: 17.37,
        mxk: 0,
        myk: 0,
        lxe: 3,
        lye: 3,
        materiais: { ...materiais, fck: 0.15, gamaF: 1.4, gamaC: 1.4, gamaS: 1.15 },
        parametros: PARAMETROS_PILAR,
      },
      "corrigido",
    );
    expect(rc.casos.map((c) => c.veredito)).toEqual(["ok", "ok"]);
    expect(rc.casos[0]!.mrxReduzido).toBeCloseTo(0.51, 2);
  });
});

describe("retrad_pil_verif2: 20×40, 3 + 3 φ16 e laterais, dois carregamentos", () => {
  const caso = CASOS_PILAR.retrad_pil_verif2!;
  const secao = retangular(20, 40, 3, 3, 3, 16, 20);
  const verifica = (nk: number, mxk: number, myk: number, lxe: number, lye: number) =>
    verificaPilarSistrut(
      { secao, nk: sng(nk), mxk: sng(mxk), myk: sng(myk), lxe, lye, materiais, parametros: par },
      "original",
    );

  it("carregamento 1 (Nk 40, Mxk 2): instabilidade nos dois casos", () => {
    const r = verifica(40, 2, 0, 4, 6);
    confere(caso, "P.Jx", r.jx);
    confere(caso, "P.Jy", r.jy);
    confere(caso, "P.lambdaX", r.lambdaX);
    confere(caso, "P.lambdaY", r.lambdaY);
    expect(r.situacao).toBe("Flexo Compressao");
    for (const [p, c] of [
      ["c1", r.casos[0]!],
      ["c2", r.casos[1]!],
    ] as const) {
      confere(caso, `${p}.Mx`, c.mx);
      confere(caso, `${p}.My`, c.my);
      confere(caso, `${p}.Mtotal`, c.mTotal);
      confere(caso, `${p}.incl`, c.anguloAtuante);
      expect(textoVeredito(c.veredito)).toBe(valorOraculo(caso, `${p}.veredito`).impresso);
      confere(caso, `${p}.M1a`, c.instabilidade!.m1);
      confere(caso, `${p}.M2a`, c.instabilidade!.m2);
      confere(caso, `${p}.Matuante`, c.instabilidade!.atuante);
    }
    confere(caso, "c1.Mxa", r.casos[0]!.mxa);
    confere(caso, "c2.Mya", r.casos[1]!.mya);
  });

  it("carregamento 2 (Nk 25, le 8): λ 139, instabilidade no 1/2 e ok no 2/2", () => {
    const r = verifica(25, 0, 0, 8, 8);
    confere(caso, "L2.P.lambdaX", r.lambdaX);
    confere(caso, "L2.P.lambdaY", r.lambdaY);
    expect(r.situacao).toBe("Compressao Centrada");
    const [c1, c2] = r.casos;
    confere(caso, "L2.c1.Mx", c1!.mx);
    confere(caso, "L2.c1.Mtotal", c1!.mTotal);
    expect(textoVeredito(c1!.veredito)).toBe(valorOraculo(caso, "L2.c1.veredito").impresso);
    confere(caso, "L2.c1.M1a", c1!.instabilidade!.m1);
    confere(caso, "L2.c1.M2a", c1!.instabilidade!.m2);
    confere(caso, "L2.c1.Matuante", c1!.instabilidade!.atuante);
    confere(caso, "L2.c2.My", c2!.my);
    confere(caso, "L2.c2.incl", c2!.anguloAtuante);
    confere(caso, "L2.c2.MRx1a", c2!.mrx);
    confere(caso, "L2.c2.MRx2a", c2!.m2x);
    confere(caso, "L2.c2.MRx", c2!.mrxReduzido);
    confere(caso, "L2.c2.MRy1a", c2!.mry);
    confere(caso, "L2.c2.MRy2a", c2!.m2y);
    confere(caso, "L2.c2.MRy", c2!.mryReduzido);
    confere(caso, "L2.c2.MRtotal", c2!.mrTotal);
    confere(caso, "L2.c2.ln", c2!.anguloLN);
    confere(caso, "L2.c2.Xln", c2!.xLN);
    confere(caso, "L2.c2.1/r", c2!.curvatura * 1000);
    confere(caso, "L2.c2.defCon", c2!.deformacaoConcreto);
    confere(caso, "L2.c2.defAco", c2!.deformacaoAco);
    expect(c2!.veredito).toBe("ok");
  });
});

describe("retrad_pil_trava: flexão oblíqua com laço sem fim no caso 2/2 (D-2)", () => {
  const caso = CASOS_PILAR.retrad_pil_trava!;
  const entrada = {
    secao: retangular(20, 40, 3, 3, 3, 16, 20),
    nk: sng(40),
    mxk: sng(2),
    myk: sng(1),
    lxe: 4,
    lye: 6,
    materiais,
    parametros: par,
  };

  it("original: 1/2 em instabilidade como impresso; 2/2 sai com erro explícito em vez de travar", () => {
    const r = verificaPilarSistrut(entrada, "original");
    expect(r.situacao).toBe("Flexao Obliqua");
    const [c1, c2] = r.casos;
    confere(caso, "c1.Mx", c1!.mx);
    confere(caso, "c1.My", c1!.my);
    confere(caso, "c1.Mtotal", c1!.mTotal);
    confere(caso, "c1.incl", c1!.anguloAtuante);
    confere(caso, "c1.M1a", c1!.instabilidade!.m1);
    confere(caso, "c1.M2a", c1!.instabilidade!.m2);
    confere(caso, "c1.Matuante", c1!.instabilidade!.atuante);
    confere(caso, "c2.Mx", c2!.mx);
    confere(caso, "c2.My", c2!.my);
    confere(caso, "c2.Mya", c2!.mya);
    confere(caso, "c2.Mtotal", c2!.mTotal);
    confere(caso, "c2.incl", c2!.anguloAtuante);
    expect(c2!.erro).toBe("nao-converge");
    expect(r.avisos.some((a) => a.includes("2/2") && a.includes("D-2"))).toBe(true);
  });

  it("corrigido também termina", () => {
    const r = verificaPilarSistrut({ ...entrada, parametros: PARAMETROS_PILAR }, "corrigido");
    expect(r.casos).toHaveLength(2);
  });
});

describe("defeitos do original no PILAR (livros_viga_pilar.md 5.2)", () => {
  const base = {
    secao: retangular(20, 20, 3, 2, 2, 12.5),
    mxk: 0,
    myk: 0,
    lxe: 3,
    lye: 3,
    materiais,
    parametros: par,
  };

  it("D-7: componente resistente igual ao atuante (0 = 0) é NAO no original e ok no corrigido", () => {
    expect(cobre("original")(0, 0)).toBe(false);
    expect(cobre("corrigido")(0, 0)).toBe(true);
    expect(cobre("original")(0.51, 0.35)).toBe(true);
  });

  it("D-3: Nk = 0 no original devolve erro em vez de dividir por zero", () => {
    const r = verificaPilarSistrut({ ...base, nk: 0 }, "original");
    expect(r.casos.every((c) => c.erro === "nk-nulo")).toBe(true);
  });

  it("D-3: no corrigido, Nk = 0 (flexão pura) é verificado com tolerância absoluta", () => {
    const r = verificaPilarSistrut(
      { ...base, nk: 0, mxk: 0.2, parametros: PARAMETROS_PILAR },
      "corrigido",
    );
    expect(r.casos.every((c) => c.erro === undefined)).toBe(true);
  });
});

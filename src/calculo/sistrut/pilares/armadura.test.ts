// PILAREDI contra o original: P5 da E2E (caso_c_pilaredi, retrad_pil_dim) com a
// carga lida do .REP, e as seções circular, poligonal horária e poligonal
// anti-horária dos casos retrad_pil_secoes e retrad_pil_poliinv. Esperados = texto
// impresso pelo original, tolerância de meia unidade da última casa.
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_PILAR, PARAMETROS_PIP } from "../base/parametros";
import type { ColunaEdificio, LeituraRep, SecaoPilar } from "../base/tipos";
import { bateComImpresso, CASOS_ORACULO, type CasoOraculo, valorOraculo } from "../__oraculo__";
import { CASOS_PILAR } from "./__casos__";
import {
  arranjoCircular,
  type DimensionamentoPilarSistrut,
  dimensionaPilarSistrut,
  posicaoNoVertice,
} from "./armadura";
import { cargasPilaresSistrut, predimensionaColuna } from "./carga";
import type { CasoPilarSistrut } from "./elu";
import { constantes, criaContexto } from "./secao";

const par = emSingle(PARAMETROS_PILAR);
const pip = emSingle(PARAMETROS_PIP);
const materiais = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B" as const,
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};

/** O P5 do E2E.REP (caso b): total 17,37, sem momentos, lido no nível PAV1. */
const repP5: LeituraRep = {
  linhas: [{ pilar: "P5", total: sng(17.37), parcelas: [], momentos: [] }],
  nivelInicial: 1,
  nivelFinal: 1,
  modo: "substitui",
};

/** Coluna "P   5" do nível FUND (cota 0) ao PAV1 (cota 3), travada (continuidade). */
function colunaP5(secao: SecaoPilar): ColunaEdificio {
  const nivel = (cota: number) => ({
    cota,
    secao,
    vinculoX: 2 as const,
    vinculoY: 2 as const,
    normalVento: 0,
    mkx: 0,
    mky: 0,
  });
  return { nome: "P   5", pilarRep: "P   5", niveis: [nivel(0), nivel(3)] };
}

function dimensiona(secao: SecaoPilar, modo: "original" | "corrigido" = "original") {
  const coluna = colunaP5(secao);
  const p = modo === "original" ? pip : PARAMETROS_PIP;
  const [carga] = cargasPilaresSistrut([repP5], [coluna], p, modo);
  return {
    carga: carga!,
    r: dimensionaPilarSistrut(
      carga!,
      coluna,
      materiais,
      modo === "original" ? par : PARAMETROS_PILAR,
      p,
      modo,
    ),
  };
}

function confere(caso: CasoOraculo, id: string, calculado: number) {
  const v = valorOraculo(caso, id);
  expect(
    bateComImpresso(v, calculado),
    `${caso.caso} ${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
  if (v.impresso.trim().startsWith("-")) expect(calculado, id).toBeLessThan(0);
}

/** Uma linha da tabela "Atuante / Resistente / Situação" do relatório do PILAREDI. */
function confereLinha(caso: CasoOraculo, pref: string, c: CasoPilarSistrut) {
  const campos: [string, number][] = [
    ["Mkx", c.mx],
    ["Mky", c.my],
    ["Mktot", c.mTotal],
    ["MRx1a", c.mrx],
    ["MRx2a", c.m2x],
    ["MRy1a", c.mry],
    ["MRy2a", c.m2y],
    ["MRtot", c.mrTotal],
    ["incLN", c.anguloLN],
    ["1/r", c.curvatura * 1000],
    ["x/d", c.xd],
    ["defCon", c.deformacaoConcreto],
    ["defAco", c.deformacaoAco],
  ];
  for (const [nome, valor] of campos) confere(caso, `${pref}.${c.rotulo}.${nome}`, valor);
}

function confereArmadura(caso: CasoOraculo, pref: string, r: DimensionamentoPilarSistrut) {
  confere(caso, `${pref}.As`, r.as);
  confere(caso, `${pref}.taxa`, r.taxa);
  expect(r.barras).toHaveLength(1);
  confere(caso, `${pref}.barras.n`, r.barras[0]!.quantidade);
  confere(caso, `${pref}.barras.phi`, r.barras[0]!.bitola);
  confere(caso, `${pref}.estribo.phi`, r.estribo.bitola);
  confere(caso, `${pref}.estribo.s`, r.estribo.espacamento);
}

const ret20: SecaoPilar = { tipo: "retangular", b: 20, h: 20, barras: [] };

describe.each(["caso_c_pilaredi", "retrad_pil_dim"])("%s: P5 20×20, Nk 17,37 + 0,30", (nome) => {
  const caso = CASOS_ORACULO[nome]!;
  const { carga, r } = dimensiona(ret20);

  it("Nk 17,67 = 17,37 do .REP + 0,20·0,20·3,0·2,5 de peso próprio; λ 52", () => {
    confere(caso, "P5.Nk", carga.nk);
    confere(caso, "P5.Mkxi", carga.mkx);
    confere(caso, "P5.Mkyi", carga.mky);
    confere(caso, "P5.lambdaX", r.lambdaX);
    confere(caso, "P5.lambdaY", r.lambdaY);
    confere(caso, "P5.cobrimento", pip.cobrimento);
  });

  it("casos 1e, 1f, 2e, 2f: Mk 0,35, MR 1,02 − 0,25 = 0,77, LN 270, 1/r 0,1579, x/d 0,82", () => {
    expect(r.casos.map((c) => c.rotulo)).toEqual(["1e", "2e", "1f", "2f"]);
    for (const c of r.casos) confereLinha(caso, "P5", c);
  });

  it("As 3,20 (0,80 %), 4 # 10, # 6.3 c/12", () => {
    confereArmadura(caso, "P5", r);
    // cobrimento 2,0 + φ/2 = 2,5 cm dos lados (a trigonometria em SINGLE deixa ruído de 2e-6)
    const esperado = [
      [2.5, 2.5],
      [2.5, 17.5],
      [17.5, 17.5],
      [17.5, 2.5],
    ];
    r.secao.barras.forEach((b, i) => {
      expect(b.x).toBeCloseTo(esperado[i]![0]!, 4);
      expect(b.y).toBeCloseTo(esperado[i]![1]!, 4);
    });
  });
});

describe("retrad_pil_secoes", () => {
  const caso = CASOS_PILAR.retrad_pil_secoes!;

  it("circular D 25: Nk 17,74, λ 48, casos e armadura 5 # 10 (0,81 %)", () => {
    const { carga, r } = dimensiona({ tipo: "circular", d: 25, dInterno: 0, barras: [] });
    confere(caso, "C.Nk", carga.nk);
    confere(caso, "C.lambdaX", r.lambdaX);
    confere(caso, "C.lambdaY", r.lambdaY);
    for (const c of r.casos) confereLinha(caso, "C", c);
    confereArmadura(caso, "C", r);
  });

  it("poligonal horária 20×20: 4 casos e 8 linhas, inclusive o 3f do ruído de SINGLE", () => {
    const { carga, r } = dimensiona({
      tipo: "poligonal",
      vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 20, y: 20 },
        { x: 20, y: 0 },
      ],
      barras: [],
    });
    confere(caso, "Q.Nk", carga.nk);
    confere(caso, "Q.lambdaX", r.lambdaX);
    expect(r.casos.map((c) => c.rotulo)).toEqual(["1e", "2e", "3e", "4e", "1f", "2f", "3f", "4f"]);
    for (const c of r.casos) confereLinha(caso, "Q", c);
    confereArmadura(caso, "Q", r);
  });
});

describe("retrad_pil_poliinv: poligonal anti-horária (D-6)", () => {
  const caso = CASOS_PILAR.retrad_pil_poliinv!;
  const anti: SecaoPilar = {
    tipo: "poligonal",
    vertices: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    barras: [],
  };

  it("circular D 25 igual à do secoes", () => {
    const { r } = dimensiona({ tipo: "circular", d: 25, dInterno: 0, barras: [] });
    for (const c of r.casos) confereLinha(caso, "C", c);
    confereArmadura(caso, "C", r);
  });

  it("original: área negativa, carga 17,37 − 0,30 = 17,07 e recusa NAO SUPORTA", () => {
    const { carga, r } = dimensiona(anti);
    confere(caso, "A.pre.carga", carga.nk);
    expect(r.recusa).toBe("NAOSUPORTA");
    expect(valorOraculo(caso, "A.naoSuporta").impresso).toContain("NAO SUPORTA");
  });

  it("corrigido: o sentido é invertido e a seção dá a mesma armadura da horária", () => {
    const { carga, r } = dimensiona(anti, "corrigido");
    expect(carga.nk).toBeCloseTo(17.67, 2);
    expect(r.recusa).toBeUndefined();
    expect(r.barras).toEqual([{ quantidade: 4, bitola: 10 }]);
  });
});

describe("posição da barra no vértice (S_24f4a)", () => {
  it("canto (0,0) de um retângulo horário, a 2,5 cm dos dois lados: (2,5; 2,5)", () => {
    const ctx = {
      ...criaContexto("corrigido", {
        fck: 0,
        fyk: 0,
        aco: "B",
        csf: 1,
        csc: 1,
        csa: 1,
        coefTensao: 1,
      }),
      k: constantes("corrigido"),
    };
    const p = posicaoNoVertice(ctx, { x: 20, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 20 }, 2.5);
    expect(p.x).toBeCloseTo(2.5, 12);
    expect(p.y).toBeCloseTo(2.5, 12);
  });
});

describe("circular numa variação de armadura que não é a primeira (PILAREDI.BAS:6848-6859)", () => {
  // D 25, As 3,52, φ10 (0,8 cm²): n1 = INT(3,52/0,8) + 1 = INT(4,4) + 1 = 5. Se a
  // variação anterior tem 4 barras, passa direto à bitola seguinte (sem o "misto").
  const ctx = criaContexto("corrigido", {
    fck: 0.15,
    fyk: 5,
    aco: "B",
    csf: 1.4,
    csc: 1.4,
    csa: 1.15,
    coefTensao: 1,
  });
  const g = { tipo: 2 as const, d: 25, dInterno: 0 };

  it("5 barras > 4 anteriores → próxima bitola", () => {
    expect(arranjoCircular(ctx, g, 3.52, 5, 5, PARAMETROS_PIP.bitolas, 2, 4).tipo).toBe("bitola");
  });

  it("5 barras ≤ 5 anteriores, ou sem anterior → arranjo", () => {
    const r = arranjoCircular(ctx, g, 3.52, 5, 5, PARAMETROS_PIP.bitolas, 2, 5);
    expect(r.tipo === "ok" && r.n1).toBe(5);
    expect(arranjoCircular(ctx, g, 3.52, 5, 5, PARAMETROS_PIP.bitolas, 2).tipo).toBe("ok");
  });
});

describe("v2par_pilar_niveis: P5 25×40 de FUND a COB, carga do .REP nos níveis 2, 3 e 4", () => {
  const caso = CASOS_PILAR.v2par_pilar_niveis!;
  const secao: SecaoPilar = { tipo: "retangular", b: 25, h: 40, barras: [] };
  const nivel = (cota: number) => ({
    cota,
    secao,
    vinculoX: 2 as const,
    vinculoY: 2 as const,
    normalVento: 0,
    mkx: 0,
    mky: 0,
  });
  const coluna: ColunaEdificio = {
    nome: "P   5",
    pilarRep: "P   5",
    niveis: [0, 3, 6, 9].map(nivel),
  };
  const reps = [1, 2, 3].map((n) => ({ ...repP5, nivelInicial: n, nivelFinal: n }));
  const cargas = cargasPilaresSistrut(reps, [coluna], pip, "original");

  it.each([
    ["FUND", 0],
    ["PAV1", 1],
    ["PAV2", 2],
  ] as const)("lance %s: Nk acumulada + peso próprio, casos e armadura 8 # 10", (nome, i) => {
    const carga = cargas[i]!;
    const r = dimensionaPilarSistrut(carga, coluna, materiais, par, pip, "original");
    const pref = `P5.${nome}`;
    confere(caso, `${pref}.Nk`, carga.nk);
    confere(caso, `${pref}.Mkxi`, carga.mkx);
    confere(caso, `${pref}.Mkyi`, carga.mky);
    confere(caso, `${pref}.lambdaX`, r.lambdaX);
    confere(caso, `${pref}.lambdaY`, r.lambdaY);
    expect(r.casos.map((c) => c.rotulo)).toEqual(["1e", "2e", "1f", "2f"]);
    for (const c of r.casos) confereLinha(caso, pref, c);
    confereArmadura(caso, pref, r);
  });

  it("predimensionamento com a seção imposta desde FUND: carga 54,36, σ 0,001 e 0,027", () => {
    const p = predimensionaColuna(reps, coluna, 0, materiais, pip, "original", { secao });
    confere(caso, "P5.predim.sigmaAdmComp", p.tensaoNormalAdmissivel);
    confere(caso, "P5.predim.sigmaComp", p.tensaoNormal);
    confere(caso, "P5.predim.sigmaAdmCompM", p.tensaoFlexaoAdmissivel);
    confere(caso, "P5.predim.sigmaCompM", p.tensaoFlexao);
    confere(caso, "P5.predim.carga", cargas[0]!.nk);
    confere(caso, "P5.predim.cargaNivel", cargas[0]!.cargaAcumulada);
  });
});

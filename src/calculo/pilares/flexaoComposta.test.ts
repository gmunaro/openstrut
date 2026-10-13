// Casos de V1 tests/T_PILCALC.BAS (núcleo atual: parábola-retângulo 0,85 fcd, pivôs
// A/B/C, concreto descontado sob as barras comprimidas, aço classe A ou B). As
// referências são as contas à mão e as integrações independentes anotadas no teste
// da V1, nunca a saída da função. Conversão: a V1 usa tf, cm, tf/cm² com 0,15 tf/cm²
// = 15 MPa, isto é, 1 tf = 10 kN, 1 tf/cm² = 100 MPa, tf·cm × 0,1 = kN·m.
// Tolerâncias relativas como o AssertNear da V1.
import { describe, expect, it } from "vitest";
import { esforcosResistentes } from "./secaoParabolaRetangulo";
import {
  armaduraObliqua,
  armaduraSimetrica,
  indiceObliquo,
  momentoResistente,
  normalMaximaAxial,
  tensaoAco,
  type TensoesCalculo,
} from "./flexaoComposta";

const fcd = 15 / 1.4;
const fyd = 500 / 1.15;
const t: TensoesCalculo = { sigmaCd: 0.85 * fcd, fyd, es: 210_000 };
const tB: TensoesCalculo = { ...t, classe: "B" };
const secao = { b: 20, h: 50, dl: 4 };

/** |obtido/esperado − 1| ≤ tol (AssertNear da V1). */
const perto = (obtido: number | null, esperado: number, tol: number) =>
  expect(Math.abs((obtido ?? NaN) / esperado - 1)).toBeLessThanOrEqual(tol);

describe("tensão no aço classe A (T_PILCALC.BAS:30-33)", () => {
  it("linear até fyd: ε = 2‰ → 420 MPa (V1: 4,2 tf/cm²)", () => {
    expect(tensaoAco(0.002, t)).toBeCloseTo(420, 6);
  });
  it("ε = ±10‰ limitado a ±fyd", () => {
    expect(tensaoAco(0.01, t)).toBeCloseTo(fyd, 9);
    expect(tensaoAco(-0.01, t)).toBeCloseTo(-fyd, 9);
  });
});

describe("capacidade axial com o concreto descontado (T_PILCALC.BAS:35-37)", () => {
  it("Ac = 400, As = 10: 0,85·fcd·390 + 10·420 = 775,18 kN (V1: 77,518 tf; antes 78,429)", () => {
    perto(normalMaximaAxial(400, 10, t), 775.1785714, 1e-6);
  });
});

describe("flexão simples 20×50, As1 = 5 cm² em d = 46 (T_PILCALC.BAS:52-63)", () => {
  // Domínio 3: resultante (17/21)·0,85 fcd·b·x a 0,415966x da borda; aço escoa;
  // x = 14,74349; M = 21,73913·39,86737 = 866,68 tf·cm (antes, retângulo 0,8x: 870,27)
  it("MR(N = 0) = 86,668 kN·m", () => {
    perto(momentoResistente(0, secao, 5, 0, t), 86.668, 2e-4);
  });
});

describe("domínio 5, pivô C, As1 = As2 = 5 (T_PILCALC.BAS:66-84)", () => {
  // x = 60: ε(y) = 0,002·(60 − y)/38,5714 → topo 3,11111‰, base 0,51852‰.
  // Conta à mão: N = 110,1887 tf, M = 462,53 tf·cm (integração independente:
  // 110,18865 e 462,5425; antes, domínio 5 por reta sem desconto: 488,80)
  const camadas = [
    { as: 5, y: 4 },
    { as: 5, y: 46 },
  ];
  it("esforços na deformação de x = 60: N = 1101,8865 kN, M = 46,25425 kN·m", () => {
    const r = esforcosResistentes(
      { topo: (0.002 * 60) / (60 - 150 / 7), base: (0.002 * 10) / (60 - 150 / 7) },
      secao,
      camadas,
      t,
    );
    perto(r.n, 1101.8865, 1e-4);
    perto(r.m, 46.25425, 2e-4);
  });
  it("MR(1101,8865 kN) = 46,254 kN·m", () => {
    perto(momentoResistente(1101.8865, secao, 5, 5, t), 46.25425, 1e-3);
  });
  it("Nd acima da capacidade axial (1400 kN) → null", () => {
    expect(momentoResistente(1400, secao, 5, 5, t)).toBeNull();
  });
});

describe("ν alto, 20×50, d' = 4, C30, CA-50 A (T_PILCALC.BAS:89-105)", () => {
  // fck = 30 MPa = 0,305915 tf/cm², fyk = 500 MPa = 5,098581 tf/cm² (conversão exata
  // da V1, levada a MPa com 1 tf/cm² = 100 MPa). Referência: integração por fibras do
  // revisor (antes: 3,47 / 17,79 / 9,67 / 14,62 / 27,34, até 23% a menos).
  const fcd30 = (30 / 98.0665 / 1.4) * 100;
  const t30: TensoesCalculo = {
    sigmaCd: 0.85 * fcd30,
    fyd: (500 / 98.0665 / 1.15) * 100,
    es: 210_000,
  };
  const casos = [
    [0.65, 0.1, 4.52],
    [0.65, 0.2, 19.04],
    [0.8, 0.1, 11],
    [0.9, 0.1, 15.86],
    [0.9, 0.2, 29.33],
  ] as const;
  for (const [nu, mu, asTotal] of casos)
    it(`ν = ${nu}, μ = ${mu}: As total = ${asTotal} cm²`, () => {
      const nd = nu * 20 * 50 * fcd30 * 0.1;
      const md = (mu * 20 * 50 * 50 * fcd30 * 0.1) / 100;
      perto(2 * (armaduraSimetrica(nd, md, secao, t30) ?? NaN), asTotal, 0.02);
    });
});

describe("armaduraSimetrica (T_PILCALC.BAS:107-111)", () => {
  const nd = 200;
  const md = 50;
  const as = armaduraSimetrica(nd, md, secao, t);
  it("a área achada atinge MR ≥ Md e 98% dela não", () => {
    expect(momentoResistente(nd, secao, as ?? 0, as ?? 0, t) ?? 0).toBeGreaterThanOrEqual(49.99);
    const menor = (as ?? 0) * 0.98;
    expect(momentoResistente(nd, secao, menor, menor, t) ?? 0).toBeLessThan(md);
  });
  it("Md inatingível → null", () => {
    expect(armaduraSimetrica(nd, 100_000, secao, t)).toBeNull();
  });
});

describe("flexo-tração, As1 = As2 = 5 (T_PILCALC.BAS:113-120)", () => {
  // Domínio 1: barra inferior a 10‰ → 21,73913 tf; superior 40 − 21,73913 = 18,26087 tf.
  // M = (21,73913 − 18,26087)·21 = 73,043 tf·cm (antes: MR com N = 0, 923,1)
  it("MR(Nd = −400 kN) = 7,3043 kN·m", () => {
    perto(momentoResistente(-400, secao, 5, 5, t), 7.304348, 1e-3);
  });
  it("além de −As·fyd (−440 kN) → null", () => {
    expect(momentoResistente(-440, secao, 5, 5, t)).toBeNull();
  });
  it("MR(−200) < MR(0)", () => {
    expect(momentoResistente(-200, secao, 5, 5, t)!).toBeLessThan(
      momentoResistente(0, secao, 5, 5, t)!,
    );
  });
});

describe("flexão oblíqua (T_PILCALC.BAS:144-151)", () => {
  const mr = momentoResistente(0, secao, 5, 5, t) ?? NaN;
  it("mxd = MRx/2, myd = 0 → índice 0,5^1,2", () => {
    expect(indiceObliquo(0, mr / 2, 0, secao, 5, t)).toBeCloseTo(0.5 ** 1.2, 4);
  });
  it("sem momento → 0; nd acima da capacidade → Infinity (V1: 99)", () => {
    expect(indiceObliquo(0, 0, 0, secao, 5, t)).toBe(0);
    expect(indiceObliquo(1400, 1, 0, secao, 5, t)).toBe(Infinity);
  });
  it("armaduraObliqua atende o índice; momento inatingível → null", () => {
    const as = armaduraObliqua(0, mr * 0.5, 0, secao, t);
    expect(indiceObliquo(0, mr * 0.5, 0, secao, as ?? 0, t)).toBeLessThanOrEqual(1.001);
    expect(armaduraObliqua(0, 100_000, 0, secao, t)).toBeNull();
  });
});

describe("aço classe B da NB-1/78 (T_PILCALC.BAS:153-172, T_CALCCA.BAS:65-72)", () => {
  it("elástico abaixo de 0,7 fyd: ε = 1‰ → 210 MPa", () => {
    expect(tensaoAco(0.001, tB)).toBeCloseTo(210, 6);
  });
  it("σ = 0,9 fyd ↔ ε = 0,9 fyd/Es + 0,823·0,2⁵ = 2,12671‰ (e simétrico na tração)", () => {
    perto(tensaoAco(0.00212671, tB), 391.3043, 1e-5);
    perto(tensaoAco(-0.00212671, tB), -391.3043, 1e-5);
  });
  it("σ = 0,85 fyd ↔ ε = 0,85 fyd/Es + 0,823·0,15⁵", () => {
    perto(tensaoAco((0.85 * fyd) / 210_000 + 0.823 * 0.15 ** 5, tB), 0.85 * fyd, 1e-6);
  });
  it("fyd só a partir de fyd/Es + 2‰ = 4,0704‰; em 3‰ ainda abaixo (a classe A já escoou)", () => {
    expect(tensaoAco(0.0041, tB)).toBeCloseTo(fyd, 9);
    expect(tensaoAco(fyd / 210_000 + 0.002, tB)).toBeCloseTo(fyd, 9);
    expect(tensaoAco(0.003, tB)).toBeLessThan(0.999 * fyd);
    expect(tensaoAco(fyd / 210_000, tB)).toBeLessThan(0.99 * fyd);
    expect(tensaoAco(1.0001 * (fyd / 210_000), t)).toBeCloseTo(fyd, 9);
  });
  it("Nmax 400 cm², As = 10: σ(2‰) = 384,103 → 0,85·fcd·390 + 384,103 = 739,28 kN", () => {
    perto(normalMaximaAxial(400, 10, tB), 739.2817, 1e-4);
  });
  it("ν = 0,7, μ = 0,15, C15: As total B 6,9666 > A 6,7541 cm² (integração independente)", () => {
    const nd = 0.7 * 20 * 50 * fcd * 0.1;
    const md = (0.15 * 20 * 50 * 50 * fcd * 0.1) / 100;
    perto(2 * (armaduraSimetrica(nd, md, secao, tB) ?? NaN), 6.9666, 0.005);
    perto(2 * (armaduraSimetrica(nd, md, secao, t) ?? NaN), 6.7541, 0.005);
  });
});

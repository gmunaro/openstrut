// Casos de V1 tests/T_PILCALC.BAS (esbeltez, ea, e2) e T_PILEDCAL.BAS (PeDimensiona).
// Conversão: 1 tf = 10 kN (a V1 trata 0,15 tf/cm² como 15 MPa); tf·m × 10 = kN·m.
// Coluna da V1 bx = 20, by = 40 → b = 20, h = 40.
import { describe, expect, it } from "vitest";
import type { PilarEntrada } from "../../tipos";
import {
  armaduraObliqua,
  armaduraSimetrica,
  indiceObliquo,
  momentoResistente,
} from "../../pilares/flexaoComposta";
import { type Camada, momentoResistentePR } from "../../pilares/secaoParabolaRetangulo";
import { materiaisNb178 } from "./materiais";
import {
  arranjoBarras,
  camadasFace,
  esbeltez,
  excentricidadeAcidental,
  excentricidadeSegundaOrdem,
  fatorFluencia,
  ladoQuadradoEquivalente,
  pilarNb178,
} from "./pilares";

const mat = materiaisNb178({
  fck: 15,
  aco: "CA-50",
  classeAco: "A",
  acoEstribo: "CA-50",
  caa: 1,
  cobrimentoLaje: 1.5,
  cobrimentoViga: 2,
  cobrimentoPilar: 4,
});
const t = { sigmaCd: mat.sigmaCd, fyd: mat.fyd, es: mat.es };
const dl = 4;

const pilar = (p: Partial<PilarEntrada>): PilarEntrada => ({
  nome: "P1",
  b: 20,
  h: 40,
  lex: 3,
  ley: 3,
  nk: 600,
  mxTopo: 0,
  mxBase: 0,
  myTopo: 0,
  myBase: 0,
  ...p,
});

describe("esbeltez e excentricidades (T_PILCALC)", () => {
  it("λ = 3,464·300/20 = 51,96", () => {
    expect(esbeltez(3, 20)).toBeCloseTo(51.96, 4);
  });
  it("ea = 2 cm para h = 20; h/30 = 3 cm para h = 90", () => {
    expect(excentricidadeAcidental(20)).toBe(2);
    expect(excentricidadeAcidental(90)).toBeCloseTo(3, 9);
  });
  it("e2 nula para λ ≤ 40", () => {
    expect(excentricidadeSegundaOrdem(1, 20, 100, 400, mat)).toBe(0);
  });
  it("e2 com ν + 0,5 limitado a 1: 300²/10·(0,0035 + 434,78/210000)/20 = 2,50668 cm", () => {
    expect(excentricidadeSegundaOrdem(3, 20, 100, 400, mat)).toBeCloseTo(2.50668, 4);
  });
  it("fluência (T_PILEDCAL.BAS:84-89): 1 até λ 80; max(1,1; rampa): 1,1 em 90, 1,125 em 110, 1,25 em 140", () => {
    expect(fatorFluencia(80)).toBe(1);
    expect(fatorFluencia(90)).toBeCloseTo(1.1, 9);
    expect(fatorFluencia(110)).toBeCloseTo(1.125, 9);
    expect(fatorFluencia(140)).toBeCloseTo(1.25, 9);
  });
  it("circular D = 30 → quadrado de mesma área, lado 26,587 cm", () => {
    const l = ladoQuadradoEquivalente(30);
    expect(l * l).toBeCloseTo((Math.PI * 30 * 30) / 4, 9);
  });
});

describe("pilarNb178 (T_PILEDCAL)", () => {
  it("1: curto e pouco carregado → mínima 0,5% de 800 = 4 cm²; 6 φ 10; estribo φ 5 c/ 12", () => {
    const r = pilarNb178(pilar({ nk: 200, lex: 1.5, ley: 1.5 }), mat, dl);
    expect(r.avisos).toEqual([]);
    expect(r.asNecessaria).toBeCloseTo(4, 6);
    // ⌈4/0,7854⌉ = 6 barras de 10 mm (par, ≥ 4)
    expect(r.barras).toMatchObject({ n: 6, phi: 10 });
    expect(r.barras.area).toBeCloseTo(6 * (Math.PI / 4), 9);
    // φt ≥ max(10/4; 5) = 5; s = min(30; 20; 12·1,0 = 12)
    expect(r.estribo).toEqual({ phi: 5, espacamento: 12 });
    expect(r.taxa).toBeCloseTo(((6 * Math.PI) / 4 / 800) * 100, 9);
  });

  it("2: esbelto (λx = 52) → Md à mão e MR(Nd) ≥ Md nas duas direções", () => {
    const r = pilarNb178(pilar({ nk: 600 }), mat, dl);
    const nd = 840;
    // ν = 840/(800·1,0714) = 0,98; e2 = 300²/10·(0,0035 + fyd/Es)/(1,48·20)
    const e2 = (9000 * (0.0035 + 500 / 1.15 / 210_000)) / (1.48 * 20);
    expect(r.nd).toBeCloseTo(nd, 9);
    expect(r.mdX).toBeCloseTo((nd * (2 + e2)) / 100, 6);
    expect(r.mdY).toBeCloseTo((nd * 2) / 100, 6); // λy = 26 ≤ 40: só ea
    const asf = r.asNecessaria / 2;
    expect(momentoResistente(nd, { b: 40, h: 20, dl }, asf, asf, t) ?? 0).toBeGreaterThanOrEqual(
      r.mdX * 0.999,
    );
    expect(momentoResistente(nd, { b: 20, h: 40, dl }, asf, asf, t) ?? 0).toBeGreaterThanOrEqual(
      r.mdY * 0.999,
    );
    expect(r.asNecessaria).toBeGreaterThanOrEqual(0.008 * 800 - 1e-6);
    expect(r.barras.area).toBeGreaterThanOrEqual(r.asNecessaria);
    expect(r.barras.n % 2).toBe(0);
    expect(r.estribo.phi).toBeGreaterThanOrEqual(5);
    expect(r.estribo.phi).toBeGreaterThanOrEqual(r.barras.phi / 4);
    expect(r.estribo.espacamento).toBeLessThanOrEqual((12 * r.barras.phi) / 10);
    expect(r.estribo.espacamento).toBeLessThanOrEqual(20);
  });

  it("3: oblíqua exige ≥ que a normal, e atende o índice", () => {
    const normal = pilarNb178(pilar({ mxTopo: 20 }), mat, dl);
    const obliqua = pilarNb178(pilar({ mxTopo: 20, myTopo: 20 }), mat, dl);
    expect(obliqua.asNecessaria).toBeGreaterThanOrEqual(normal.asNecessaria - 1e-6);
    // Md com γf·|M|: 1,4·20 + 840·(2 + e2)/100
    expect(normal.mdX - pilarNb178(pilar({}), mat, dl).mdX).toBeCloseTo(28, 9);
    const asf = obliqua.asNecessaria / 2;
    expect(
      indiceObliquo(840, obliqua.mdX, obliqua.mdY, { b: 40, h: 20, dl }, asf, t),
    ).toBeLessThanOrEqual(1.001);
  });

  it("momento de 1ª ordem: vale o maior |M| entre topo e base", () => {
    const a = pilarNb178(pilar({ mxTopo: -20, mxBase: 10 }), mat, dl);
    const b = pilarNb178(pilar({ mxTopo: 20 }), mat, dl);
    expect(a.mdX).toBeCloseTo(b.mdX, 9);
  });

  it("4: esbeltez > 140 avisada, sem armadura", () => {
    const r = pilarNb178(pilar({ lex: 9 }), mat, dl);
    expect(r.avisos.join()).toContain("esbeltez máxima excedida");
    expect(r.asNecessaria).toBeNaN();
  });

  it("4: seção insuficiente avisada", () => {
    const r = pilarNb178(pilar({ nk: 4000 }), mat, dl);
    expect(r.avisos.join()).toContain("aumente a seção");
    expect(r.asNecessaria).toBeNaN();
  });

  it("5: circular D = 30 como quadrado equivalente", () => {
    const l = ladoQuadradoEquivalente(30);
    const r = pilarNb178(pilar({ b: l, h: l, nk: 300, lex: 2, ley: 2 }), mat, dl);
    expect(r.avisos).toEqual([]);
    expect(r.asNecessaria).toBeGreaterThan(0);
  });

  it("memória registra Nd, esbeltez e Md", () => {
    const r = pilarNb178(pilar({}), mat, dl);
    const nomes = r.memoria.map((m) => m.descricao);
    expect(nomes).toContain("Força normal de cálculo");
    expect(nomes).toContain("Momento de cálculo (x)");
    expect(r.memoria.every((m) => m.ref)).toBe(true);
  });
});

describe("seção pequena (aviso [VERIFICAR], resultado inalterado)", () => {
  it("menor dimensão 15 cm < 20 cm: aviso; 20 × 40 não avisa", () => {
    const r = pilarNb178(pilar({ b: 15, h: 40, nk: 200, lex: 1.5, ley: 1.5 }), mat, dl);
    expect(r.avisos.some((a) => a.includes("15 cm < 20 cm"))).toBe(true);
    // Nd = 1,4 · 200 = 280 kN, sem majoração extra pela seção pequena
    expect(r.nd).toBeCloseTo(280, 9);
    const r20 = pilarNb178(pilar({ nk: 200, lex: 1.5, ley: 1.5 }), mat, dl);
    expect(r20.avisos.some((a) => a.includes("< 20 cm"))).toBe(false);
  });
});

describe("correções de engenharia da V1 (T_PILCALC, T_PILEDCAL)", () => {
  const ab10 = Math.PI / 4;
  /** Índice oblíquo com as barras nas posições escritas aqui (V1 Indice# de
   *  T_PILEDCAL.BAS:100-120): nfx barras em cada face ⟂ x, nfy em cada face ⟂ y. */
  const indiceReal = (
    nd: number,
    mdx: number,
    mdy: number,
    bx: number,
    by: number,
    nfx: number,
    nfy: number,
    ab: number,
  ) => {
    const lado = (alt: number, nFace: number, nOutra: number): Camada[] => [
      { as: nFace * ab, y: 4 },
      { as: nFace * ab, y: alt - 4 },
      ...Array.from({ length: nOutra - 2 }, (_, i) => ({
        as: 2 * ab,
        y: 4 + ((i + 1) * (alt - 8)) / (nOutra - 1),
      })),
    ];
    const mrx = momentoResistentePR(nd, { b: by, h: bx, dl: 4 }, lado(bx, nfx, nfy), t);
    const mry = momentoResistentePR(nd, { b: bx, h: by, dl: 4 }, lado(by, nfy, nfx), t);
    if (mrx === null || mry === null || mrx <= 0 || mry <= 0) return Infinity;
    return (mdx / mrx) ** 1.2 + (mdy / mry) ** 1.2;
  };

  it("e2 com aço classe B: 300²/10·(0,0035 + fyd/Es + 0,002)/20 = 3,40668 cm (T_PILCALC.BAS:165-166)", () => {
    expect(excentricidadeSegundaOrdem(3, 20, 100, 400, mat, "B")).toBeCloseTo(3.40668, 4);
  });

  it("pilarNb178 com aço classe B: e2 com εyd + 2‰ entra no Md (caso 2 de T_PILEDCAL)", () => {
    // ν = 0,98; e2 = 300²/10·(0,0035 + fyd/Es + 0,002)/(1,48·20)
    const e2B = (9000 * (0.0035 + 500 / 1.15 / 210_000 + 0.002)) / (1.48 * 20);
    const rB = pilarNb178(pilar({ nk: 600 }), mat, dl, "B");
    expect(rB.mdX).toBeCloseTo((840 * (2 + e2B)) / 100, 6);
    expect(rB.asNecessaria).toBeGreaterThanOrEqual(
      pilarNb178(pilar({ nk: 600 }), mat, dl).asNecessaria,
    );
  });

  it("barras laterais na posição real: 20 × 60, 4 cm² em y = 4; 21,333; 38,667; 56 → MR(0) = 155,751 kN·m (T_PILCALC.BAS:122-138)", () => {
    // Conta à mão da V1: x = 17,0504, M = 1557,51 tf·cm (antes, laterais nas faces: 1810,32)
    const camadas = camadasFace(60, 4, 2, 4, 2);
    expect(camadas.map((c) => c.y)).toEqual([4, 56, 4 + 52 / 3, 4 + 104 / 3]);
    expect(camadas.every((c) => c.as === 4)).toBe(true);
    const mr = momentoResistentePR(0, { b: 20, h: 60, dl: 4 }, camadas, t) ?? NaN;
    expect(Math.abs(mr / 155.751 - 1)).toBeLessThanOrEqual(2e-4);
    expect(mr).toBeLessThan(0.9 * (momentoResistente(0, { b: 20, h: 60, dl: 4 }, 8, 8, t) ?? 0));
  });

  it("arranjo (V1 PeArranjo, T_PILEDCAL.BAS:68-72): 8 barras sem preferência → 3 e 3; só asx → 4 e 2", () => {
    expect(arranjoBarras(8, 1, 1, 30, 40)).toEqual({ nfx: 3, nfy: 3 });
    expect(arranjoBarras(8, 1, 0, 30, 40)).toEqual({ nfx: 4, nfy: 2 });
  });

  it("oblíqua com o arranjo real: 30 × 40, Nk = 400 kN, Mx = My = 20 kN·m (T_PILEDCAL.BAS:51-67)", () => {
    // λ 17 e 13, sem e2; ea = 2 cm: Mdx = Mdy = 1,4·20 + 560·0,02 = 39,2 kN·m.
    // Antes: asf (duas faces) com 8 φ 10, 3 por face: 3·0,785 < asf e índice real > 1.
    const nd = 560;
    const md = 39.2;
    const asf = armaduraObliqua(nd, md, md, { b: 40, h: 30, dl: 4 }, t) ?? NaN;
    expect(3 * ab10).toBeLessThan(asf);
    expect(indiceReal(nd, md, md, 30, 40, 3, 3, ab10)).toBeGreaterThan(1);
    const r = pilarNb178(
      pilar({ b: 30, h: 40, nk: 400, mxTopo: 20, myTopo: 20, lex: 1.5, ley: 1.5 }),
      mat,
      dl,
    );
    expect(r.avisos).toEqual([]);
    expect(r.mdX).toBeCloseTo(md, 9);
    expect(r.mdY).toBeCloseTo(md, 9);
    const asx = armaduraSimetrica(nd, md, { b: 40, h: 30, dl: 4 }, t) ?? 0;
    const asy = armaduraSimetrica(nd, md, { b: 30, h: 40, dl: 4 }, t) ?? 0;
    const { nfx, nfy } = arranjoBarras(r.barras.n, asx, asy, 30, 40);
    expect(r.barras.n).toBe(2 * nfx + 2 * nfy - 4);
    const abR = (Math.PI * (r.barras.phi / 10) ** 2) / 4;
    expect(indiceReal(nd, md, md, 30, 40, nfx, nfy, abR)).toBeLessThanOrEqual(1);
    expect(r.barras.area).toBeGreaterThan(8 * ab10);
  });

  it("flexo-tração: Nk = −100 kN, Mx = 20 kN·m → Md = 28 kN·m sem ea/e2 (T_PILEDCAL.BAS:74-82)", () => {
    // antes: 28 + (−140)·0,02 = 25,2, reduzido pela tração
    const r = pilarNb178(pilar({ nk: -100, mxTopo: 20 }), mat, dl);
    expect(r.nd).toBeCloseTo(-140, 9);
    expect(r.mdX).toBeCloseTo(28, 9);
    const asf = r.asNecessaria / 2;
    expect(momentoResistente(-140, { b: 40, h: 20, dl }, asf, asf, t) ?? 0).toBeGreaterThanOrEqual(
      28 * 0.999,
    );
    const asSo = armaduraSimetrica(-140, 28, { b: 40, h: 20, dl }, t) ?? NaN;
    expect(r.asNecessaria).toBeGreaterThanOrEqual(2 * asSo - 1e-6);
  });
});

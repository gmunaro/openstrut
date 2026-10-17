// Geometria das barras com conta à mão (cobrimento + estribo + φ/2 das faces).
import { describe, expect, it } from "vitest";
import { armaduraPilar, armaduraViga, type BarraViga, perfilPilar } from "./armaduraGeometria";

const barra = (b: Partial<BarraViga>): BarraViga => ({
  nome: "N1",
  tipo: "positiva",
  phi: 10,
  quantidade: 3,
  comprimento: 400,
  inicio: 0,
  fim: 4,
  ganchoInicio: 0,
  ganchoFim: 0,
  ...b,
});

describe("armaduraViga", () => {
  // viga 20 × 50 cm, cobrimento 2,5 cm, estribo φ5 (0,5 cm)
  const pos = armaduraViga(
    [
      barra({}),
      barra({ nome: "N2", tipo: "negativa", phi: 12.5, quantidade: 2, inicio: 3, fim: 5 }),
      barra({ nome: "N3", tipo: "estribo", phi: 5, quantidade: 3, estribos: [0.1, 0.3, 0.5] }),
    ],
    () => ({ bw: 0.2, h: 0.5 }),
    2.5,
    "CA-50",
    "CA-60",
  );
  const [pos1, neg, est] = pos;

  it("positivas embaixo, distribuídas na largura útil", () => {
    // z = −h + c + φe + φ/2 = −0,50 + 0,025 + 0,005 + 0,005 = −0,465
    expect(pos1!.forma.map((p) => [p.x, p.z])).toEqual([
      [0, expect.closeTo(-0.465, 9)],
      [4, expect.closeTo(-0.465, 9)],
    ]);
    // largura útil = bw − 2(c + φe) − φ = 0,20 − 0,06 − 0,01 = 0,13: y = −0,065, 0, 0,065
    expect(pos1!.copias.map((c) => c.y)).toEqual([
      expect.closeTo(-0.065, 9),
      0,
      expect.closeTo(0.065, 9),
    ]);
  });

  it("negativas em cima: z = −(c + φe + φ/2) = −0,03625", () => {
    expect(neg!.forma[0]!.z).toBeCloseTo(-0.03625, 9);
    expect(neg!.copias).toHaveLength(2);
  });

  it("estribo: contorno a c + φ/2 das faces, um por abscissa, aberto 2φ", () => {
    // meia largura 0,10 − 0,025 − 0,0025 = 0,0725; topo −0,0275; fundo −0,50 + 0,0275
    const [a, b, c, d, fecho] = est!.forma;
    expect([a!.y, a!.z]).toEqual([expect.closeTo(-0.0725, 9), expect.closeTo(-0.0275, 9)]);
    expect([b!.y, c!.z, d!.y]).toEqual([
      expect.closeTo(0.0725, 9),
      expect.closeTo(-0.4725, 9),
      expect.closeTo(-0.0725, 9),
    ]);
    // o último ponto fica 2φ = 1 cm antes do primeiro, no lado vertical esquerdo
    expect(fecho!.z - a!.z).toBeCloseTo(-0.01, 9);
    expect(est!.copias.map((p) => p.x)).toEqual([0.1, 0.3, 0.5]);
  });
});

describe("armaduraPilar", () => {
  it("retangular 20 × 40: barras por face com os cantos, a c + φt + φ/2 das faces", () => {
    const [long, est] = armaduraPilar({
      barras: { n: 6, phi: 12.5, porFaceX: 3, porFaceY: 2 },
      estribo: { phi: 5, espacamento: 15 },
      perfil: perfilPilar({ b: 20, h: 40 }),
      altura: 3,
      cobrimento: 2.5,
      aco: "CA-50",
      acoEstribo: "CA-60",
      longitudinal: { z0: 0, z1: 3.4 },
      estribos: { z0: 0.05, z1: 2.95, quantidade: 3 },
    });
    // ax = 0,10 − 0,025 − 0,005 − 0,00625 = 0,06375; ay = 0,20 − 0,03625 = 0,16375
    const pontos = long!.copias.map((c) => [c.x, c.y].map((v) => Math.round(v * 1e5) / 1e5));
    expect(pontos).toEqual([
      [-0.06375, -0.16375],
      [0.06375, -0.16375],
      [-0.06375, 0],
      [0.06375, 0],
      [-0.06375, 0.16375],
      [0.06375, 0.16375],
    ]);
    // longitudinais até 3,40 (traspasse acima do lance de 3 m)
    expect(long!.forma.map((p) => p.z)).toEqual([0, 3.4]);
    // 3 estribos de 0,05 a 2,95: 0,05, 1,50, 2,95
    expect(est!.copias.map((c) => c.z)).toEqual([0.05, expect.closeTo(1.5, 9), 2.95]);
  });

  it("circular D = 40: n barras no raio 0,20 − c − φt − φ/2", () => {
    const [long] = armaduraPilar({
      barras: { n: 8, phi: 10, porFaceX: 0, porFaceY: 0 },
      estribo: { phi: 5, espacamento: 15 },
      perfil: perfilPilar({ b: 40, h: 40, secao: { tipo: "circular", d: 40, dInterno: 0 } }),
      altura: 3,
      cobrimento: 3,
      aco: "CA-50",
      acoEstribo: "CA-60",
    });
    // r = 0,20 − 0,03 − 0,005 − 0,005 = 0,16
    expect(long!.copias).toHaveLength(8);
    for (const c of long!.copias) expect(Math.hypot(c.x, c.y)).toBeCloseTo(0.16, 9);
  });

  it("seção poligonal: sem armadura", () => {
    expect(
      armaduraPilar({
        barras: { n: 4, phi: 10, porFaceX: 2, porFaceY: 2 },
        estribo: { phi: 5, espacamento: 15 },
        perfil: { tipo: "poligono", pontos: [] },
        altura: 3,
        cobrimento: 3,
        aco: "CA-50",
        acoEstribo: "CA-60",
      }),
    ).toEqual([]);
  });
});

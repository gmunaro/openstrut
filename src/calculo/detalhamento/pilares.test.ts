// Detalhamento de pilares. Esperados por conta à mão (comentários) com as
// regras de docs/DETALHAMENTO.md, seção "Lajes e pilares", e o exemplo do
// pilar P8 de Bastos, Pilares (jun/2024), item 15.1, Figura 156, p. 154.
// Constantes C25/CA-50: fbd (boa) = 2,885584 MPa; fyd = 434,7826 MPa;
// lb φ12,5 = 0,3125 · 434,78/2,8856 = 47,0856 cm.
// NB-1/78: τbu = 0,42 (25/1,4)^(2/3) = 2,869397 MPa; lb φ12,5 = 47,351 cm.
import { describe, expect, it } from "vitest";
import { materiaisNb178 } from "../normas/nb1-78/materiais";
import { pilarNb178 } from "../normas/nb1-78/pilares";
import { materiais6118 } from "../normas/nbr6118-2023/materiais";
import { pilar6118 } from "../normas/nbr6118-2023/pilares";
import type { MateriaisCalc } from "../tipos";
import {
  barrasDesprotegidas,
  detalharPilar,
  REGRAS_PILAR_6118,
  REGRAS_PILAR_NB178,
  traspasse6118,
  type LancePilarDetalhamento,
  type PilarDetalhamentoEntrada,
} from "./pilares";
import { tabelaAco } from "./tabelaAco";

const c25: MateriaisCalc = {
  fck: 25,
  fcd: 25 / 1.4,
  sigmaCd: (0.85 * 25) / 1.4,
  fyk: 500,
  fyd: 500 / 1.15,
  fywd: 500 / 1.15,
  ecs: 0,
  es: 210_000,
  aco: "CA-50",
  acoEstribo: "CA-60",
};

// porFaceX = barras em cada face de comprimento h; porFaceY, nas de comprimento b
const barras = (n: number, phi: number, porFaceX: number, porFaceY: number) => ({
  n,
  phi,
  area: (n * Math.PI * (phi / 10) ** 2) / 4,
  porFaceX,
  porFaceY,
});

// Pilar 20 × 40 cm, c = 2,5 cm, 3 lances de 300 cm. Lance 1: 8 φ16 (4 por face
// de 40 cm), estribo φ5 c/19; lances 2 e 3: 6 φ12,5 (3 por face de 40), φ5 c/15.
// Estribo mínimo (18.4.3): φ5 ≥ máx(5; φ/4); s ≤ ⌊mín(20; 20; 12 φ)⌋ = 19 (φ16) e 15 (φ12,5).
const lance1: LancePilarDetalhamento = {
  peDireito: 300,
  b: 20,
  h: 40,
  resultado: { barras: barras(8, 16, 4, 2), estribo: { phi: 5, espacamento: 19 } },
};
const lanceSup: LancePilarDetalhamento = {
  peDireito: 300,
  b: 20,
  h: 40,
  resultado: { barras: barras(6, 12.5, 3, 2), estribo: { phi: 5, espacamento: 15 } },
};
const p1: PilarDetalhamentoEntrada = {
  nome: "P1",
  cobrimento: 2.5,
  lances: [lance1, lanceSup, lanceSup],
  mat: c25,
};

describe("traspasse 6118 (9.5.2.2.1)", () => {
  // α0t = 2,0 (todas na mesma seção); lb,nec = lb = 47,0856 (sem gancho, razão 1);
  // l0t = 94,171 ≥ máx(0,3 · 2 · 47,09 = 28,25; 15 φ = 18,75; 20) → 94,171 cm.
  it("φ12,5: l0t = 2 · 47,0856 = 94,171 cm", () => {
    expect(traspasse6118(12.5, c25).l0).toBeCloseTo(94.171, 2);
  });
  // φ5: lb = 0,125 · 150,674 = 18,834; 2 lb = 37,67 ≥ máx(11,3; 7,5; 20).
  it("φ5: l0t = 37,67 cm", () => {
    expect(traspasse6118(5, c25).l0).toBeCloseTo(37.668, 2);
  });
});

describe("estribo suplementar (18.2.4)", () => {
  // Bastos P8: 15 × 50 cm, c = 3,5 cm, 20 φ12,5 com 10 em cada face de 50 cm,
  // φt = 5 mm: 20 φt = 10 cm; eixo a eixo (50 − 2 · 4,625)/9 = 4,53 cm (Bastos: 4,5).
  // Barras intermediárias a 4,53, 9,06, 13,6… do canto: 2 protegidas por canto,
  // 4 por face precisam de grampo.
  it("pilar P8 de Bastos: 4 barras por face sem proteção", () => {
    expect(barrasDesprotegidas(10, 50, 3.5 + 0.5 + 0.625, 5)).toBe(4);
  });
  it("faces só com os cantos não pedem grampo", () => {
    expect(barrasDesprotegidas(2, 50, 4.6, 5)).toBe(0);
  });
  // 4 barras em 40 cm, d' = 3,8: eixo a eixo 10,8 cm. φt 5 → alcance 10 cm: as 2
  // intermediárias ficam fora; φt 6,3 → 12,6 cm: protegidas.
  it("alcance de 20 φt decide", () => {
    expect(barrasDesprotegidas(4, 40, 3.8, 5)).toBe(2);
    expect(barrasDesprotegidas(4, 40, 3.8, 6.3)).toBe(0);
  });
});

describe("pilar de 3 lances com emenda (NBR 6118)", () => {
  const det = detalharPilar(p1);
  const pos = det.posicoes;

  it("ordem por lance: longitudinal, estribo, grampo; sem avisos", () => {
    expect(pos.map((p) => [p.tramo, p.tipo])).toEqual([
      [0, "longitudinal"],
      [0, "estribo"],
      [0, "grampo"],
      [1, "longitudinal"],
      [1, "estribo"],
      [1, "grampo"],
      [2, "longitudinal"],
      [2, "estribo"],
      [2, "grampo"],
    ]);
    expect(det.avisos).toEqual([]);
  });

  // Lance 1: 300 + l0t da menor bitola emendada (φ12,5, 9.5.2.1) = 394,17 → 395.
  // Lance 2: 300 + 94,17 → 395. Lance 3: até o topo − c = 297,5 → 298.
  it("longitudinais com traspasse no lance de cima", () => {
    expect(pos[0]).toMatchObject({ phi: 16, quantidade: 8, comprimento: 395, xInicio: 0 });
    expect(pos[0]?.xFim).toBeCloseTo(394.171, 2);
    expect(pos[3]).toMatchObject({ phi: 12.5, quantidade: 6, comprimento: 395, xInicio: 300 });
    expect(pos[6]).toMatchObject({ phi: 12.5, quantidade: 6, comprimento: 298, xInicio: 600 });
    expect(pos[6]?.xFim).toBeCloseTo(897.5, 9);
  });

  // Estribo: 2 (20 − 5) + 2 (40 − 5) + 2 · máx(5 φt; 5 cm) = 30 + 70 + 10 = 110 cm.
  // Lance 1: ⌈300/19⌉ = 16, + 1 na base = 17. Lances 2 e 3: 300/15 = 20.
  it("estribos por lance", () => {
    expect(pos[1]).toMatchObject({ phi: 5, aco: "CA-60", quantidade: 17, comprimento: 110 });
    expect(pos[4]).toMatchObject({ quantidade: 20, comprimento: 110 });
    expect(pos[7]).toMatchObject({ quantidade: 20, comprimento: 110 });
  });

  // Lance 1: face de 40 com 4 φ16, d' = 2,5 + 0,5 + 0,8 = 3,8; eixo a eixo 10,8 >
  // 20 φt = 10 → 2 grampos por seção, 2 × 17 = 34. Lance 2: 3 φ12,5, d' = 3,625;
  // eixo a eixo 16,375 > 10 → 1 por seção, 20. Comprimento: atravessa b = 20:
  // 20 − 5 + 10 = 25 cm.
  it("grampos onde a barra fica além de 20 φt do canto", () => {
    expect(pos[2]).toMatchObject({ tipo: "grampo", phi: 5, quantidade: 34, comprimento: 25 });
    expect(pos[5]).toMatchObject({ quantidade: 20, comprimento: 25 });
  });

  // φ16: 8 × 3,95 = 31,6 m; φ12,5: 6 × 3,95 + 6 × 2,98 = 41,58 m;
  // φ5 CA-60: estribos 57 × 1,10 = 62,7 m + grampos 74 × 0,25 = 18,5 m = 81,2 m.
  // Massa: 31,6 · 1,578336 + 41,58 · 0,963340 + 81,2 · 0,154134 =
  // 49,875 + 40,056 + 12,516 = 102,447 kg.
  it("tabela de aço do pilar", () => {
    const t = tabelaAco(pos);
    expect(t.linhas.map((l) => [l.aco, l.phi])).toEqual([
      ["CA-50", 12.5],
      ["CA-50", 16],
      ["CA-60", 5],
    ]);
    expect(t.linhas[0]?.comprimento).toBeCloseTo(41.58, 9);
    expect(t.linhas[1]?.comprimento).toBeCloseTo(31.6, 9);
    expect(t.linhas[2]?.comprimento).toBeCloseTo(81.2, 9);
    expect(t.massa).toBeCloseTo(102.4468, 3);
  });

  it("estribo abaixo do mínimo da norma vira aviso", () => {
    const fraco = detalharPilar({
      ...p1,
      lances: [
        { ...lance1, resultado: { ...lance1.resultado, estribo: { phi: 5, espacamento: 20 } } },
      ],
    });
    expect(fraco.avisos.join(" ")).toMatch(/18\.4\.3/);
  });
});

describe("pilar de 3 lances com emenda (NB-1/78)", () => {
  // Emenda da V1 = ⌈lb⌉ = ⌈47,351⌉ = 48 cm: lance 1 = 300 + 48 = 348.
  // Ganchos do estribo 2 × 10 φt = 10 cm: 110 cm, como na 6118.
  const det = detalharPilar(p1, REGRAS_PILAR_NB178);
  it("traspasse = lb da V1", () => {
    expect(det.posicoes[0]).toMatchObject({ comprimento: 348 });
    expect(det.posicoes[3]).toMatchObject({ comprimento: 348 });
    expect(det.posicoes[1]).toMatchObject({ comprimento: 110 });
  });
});

describe("o detalhamento usa o arranjo que o cálculo verificou (regressão)", () => {
  // P 20 × 60, Nk = 900 kN, Mx,topo = 30 kN·m, lex = ley = 2,8 m, C25/CA-50,
  // cobrimento 3 cm, lance de 280 cm. Antes, PilarResultado só trazia n e φ, e o
  // detalhamento redistribuía as barras sem a demanda (arranjoBarras(n, 0, 0)).
  const materiais = {
    fck: 25,
    aco: "CA-50",
    acoEstribo: "CA-50",
    classeAco: "A",
    caa: 2,
    cobrimentoLaje: 2.5,
    cobrimentoViga: 3,
    cobrimentoPilar: 3,
  } as const;
  const entrada = {
    nome: "P",
    b: 20,
    h: 60,
    lex: 2.8,
    ley: 2.8,
    nk: 900,
    mxTopo: 30,
    mxBase: 0,
    myTopo: 0,
    myBase: 0,
  };
  const detalha = (
    resultado: LancePilarDetalhamento["resultado"],
    mat: MateriaisCalc,
    regras = REGRAS_PILAR_6118,
  ) =>
    detalharPilar(
      { nome: "P", cobrimento: 3, lances: [{ peDireito: 280, b: 20, h: 60, resultado }], mat },
      regras,
    );
  const grampos = (d: ReturnType<typeof detalharPilar>) =>
    d.posicoes.filter((p) => p.tipo === "grampo").reduce((s, p) => s + p.quantidade, 0);

  it("6118: 4 barras por face de 60 → 2 grampos por estribo, 50 no lance", () => {
    // Cálculo: As = 6,27 cm² → n = ⌈6,27/0,785⌉ = 8 φ10; Mx predomina, então as
    // faces de 60 levam n/2 = 4 (≥ ⌈(60 − 8)/40⌉ + 1 = 3 do espaçamento) e as de 20
    // só os cantos: 2·4 + 2·2 − 4 = 8.
    // Detalhamento: d' = 3 + 0,5 + 0,5 = 4 cm; face de 60 com 4 barras:
    // s = (60 − 8)/3 = 17,3 cm > 20 φt = 10 cm → as 2 intermediárias ficam fora da
    // proteção do canto (18.2.4). Faces de 20: só cantos. Estribo φ5 c/12
    // (12 φ10 = 12 < 20): ⌈280/12⌉ + 1 = 25 estribos → 2 · 25 = 50 grampos.
    // Com a distribuição antiga (3 e 3): s = 26 > 10 → 1 grampo na face de 60;
    // face de 20 com s = 6 ≤ 10 → 0; 25 grampos, metade do necessário.
    const r = pilar6118(entrada, materiais6118(materiais), 4);
    expect([r.barras.n, r.barras.phi, r.barras.porFaceX, r.barras.porFaceY]).toEqual([8, 10, 4, 2]);
    expect(r.estribo).toEqual({ phi: 5, espacamento: 12 });
    const d = detalha(r, materiais6118(materiais));
    expect(grampos(d)).toBe(50);
    expect(d.avisos.join(" ")).not.toMatch(/distribuição da V1/);
  });

  it("NB-1/78: 7 barras por face de 60 e 2 por face de 20 no cálculo e no detalhamento", () => {
    // Cálculo (V1 PeArranjo): 14 φ16; e = (14 − 4)/2 = 5 pares intermediários,
    // todos nas faces ⟂ x porque só Mx tem demanda (asy = 0): 7 e 2.
    // Detalhamento: d' = 3 + 0,5 + 0,8 = 4,3; face de 60 com 7 barras:
    // s = (60 − 8,6)/6 = 8,57 cm; a 1ª intermediária de cada canto fica a
    // 8,57 ≤ 10 cm (protegida), as outras 3 não → 3 grampos por estribo.
    // A distribuição antiga (arranjoBarras(14, 0, 0) = 5 e 4) poria 5 na face de 60.
    const r = pilarNb178(entrada, materiaisNb178(materiais), 4.3);
    expect([r.barras.n, r.barras.phi, r.barras.porFaceX, r.barras.porFaceY]).toEqual([
      14, 16, 7, 2,
    ]);
    const d = detalha(r, materiaisNb178(materiais), REGRAS_PILAR_NB178);
    const face60 = d.memoria.find((m) => m.descricao.includes("face de 60 cm"));
    expect(face60?.descricao).toMatch(/\(7 barras/);
    expect(face60?.valor).toBe(3);
  });

  it("arranjo que não fecha com n cai na distribuição da V1 com aviso", () => {
    // 8 barras com 4 e 4 por face somariam 2·4 + 2·4 − 4 = 12 ≠ 8
    const d = detalha(
      { barras: barras(8, 10, 4, 4), estribo: { phi: 5, espacamento: 12 } },
      materiais6118(materiais),
    );
    expect(d.avisos.join(" ")).toMatch(/pode não ser a verificada/);
  });
});

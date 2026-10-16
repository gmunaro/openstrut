// Fôrma, concreto, estribo e detalhamento de pilar circular e poligonal pela área e
// pelo perímetro reais (regra da V2; o SISTRUT não calcula quantitativos de pilar).
// Esperados por conta à mão.
import { describe, expect, it } from "vitest";
import type { Pilar } from "../dominio/obra";
import { detalharPilar, REGRAS_PILAR_NB178 } from "./detalhamento/pilares";
import { formaPilar } from "./formas";
import { nb178 } from "./normas";
import { quantPilar } from "./quantitativos";
import { geometriaPilar } from "./secaoPilar";

const circular: Pick<Pilar, "nome" | "b" | "h" | "secao"> = {
  nome: "P1",
  b: 25,
  h: 25,
  secao: { tipo: "circular", d: 25, dInterno: 0 },
};
/** L de 40 × 40 sem o quadrado 20 × 20 de cima à direita, sentido horário. */
const emL: Pick<Pilar, "nome" | "b" | "h" | "secao"> = {
  nome: "P2",
  b: 40,
  h: 40,
  secao: {
    tipo: "poligonal",
    vertices: [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
      { x: 20, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 0 },
    ],
  },
};

describe("geometriaPilar", () => {
  it("retângulo: b·h, 2(b + h) e estribo 2(b − 2c) + 2(h − 2c)", () => {
    const g = geometriaPilar({ b: 20, h: 30 });
    expect([g.area, g.perimetro, g.estribo(2)]).toEqual([600, 100, 84]);
  });

  it("circular D 25: π·25²/4 = 490,87 cm², π·25 = 78,54 cm, estribo π(25 − 4) = 65,97 cm", () => {
    const g = geometriaPilar(circular);
    expect(g.area).toBeCloseTo(490.874, 3);
    expect(g.perimetro).toBeCloseTo(78.54, 2);
    expect(g.estribo(2)).toBeCloseTo(65.973, 3);
  });

  it("circular vazada D 40, Di 20: π(40² − 20²)/4 = 942,48 cm²; fôrma por dentro e por fora", () => {
    const g = geometriaPilar({ b: 40, h: 40, secao: { tipo: "circular", d: 40, dInterno: 20 } });
    expect(g.area).toBeCloseTo(942.478, 3);
    expect(g.perimetro + g.perimetroInterno).toBeCloseTo(Math.PI * 60, 6);
  });

  it("L: área 1200, perímetro 160; estribo recuado 2 cm = 36 + 16 + 20 + 20 + 16 + 36 = 144", () => {
    // ângulos internos 5 × 90° e 1 × 270°: Σ cot(α/2) = 5·1 + cot 135° = 4 → 160 − 8·2
    const g = geometriaPilar(emL);
    expect(g.area).toBeCloseTo(1200, 9);
    expect(g.perimetro).toBeCloseTo(160, 9);
    expect(g.estribo(2)).toBeCloseTo(144, 9);
  });
});

describe("fôrma e concreto do pilar circular", () => {
  it("D 25 com 3 m: fôrma π·0,25·3 = 2,356 m²; concreto 0,049087·3 = 0,1473 m³", () => {
    expect(formaPilar(circular, 3)).toBeCloseTo(2.3562, 4);
    const q = quantPilar(circular, 3, undefined, 2);
    expect(q.concreto).toBeCloseTo(0.147262, 6);
    expect(q.forma).toBeCloseTo(2.3562, 4);
  });

  it("aço: 6 φ10 × (3 + 0,40) m e 25 estribos φ5 c/12 de π(25 − 4) = 65,97 cm", () => {
    // 6·3,40·0,617 + 25·0,6597·0,154 (kg/m de φ10 e φ5 pela área·7850)
    const q = quantPilar(
      circular,
      3,
      { barras: { n: 6, phi: 10 }, estribo: { phi: 5, espacamento: 12 } },
      2,
    );
    const kg = (phi: number) => ((Math.PI * (phi / 1000) ** 2) / 4) * 7850;
    expect(q.aco).toBeCloseTo(6 * 3.4 * kg(10) + 25 * 0.65973 * kg(5), 3);
  });
});

describe("detalhamento do pilar circular", () => {
  it("estribo pelo perímetro recuado; sem grampos (seção sem faces b e h)", () => {
    const mat = nb178.materiais({
      fck: 15,
      aco: "CA-50",
      acoEstribo: "CA-50",
      classeAco: "B",
      caa: 1,
      cobrimentoLaje: 1.5,
      cobrimentoViga: 2,
      cobrimentoPilar: 2,
    });
    const d = detalharPilar(
      {
        nome: "P1",
        cobrimento: 2,
        mat,
        lances: [
          {
            peDireito: 300,
            b: 25,
            h: 25,
            secao: circular.secao,
            resultado: {
              barras: { n: 6, phi: 10, area: 4.71, porFaceX: 0, porFaceY: 0 },
              estribo: { phi: 5, espacamento: 12 },
            },
          },
        ],
      },
      REGRAS_PILAR_NB178,
    );
    const estribo = d.posicoes.find((p) => p.tipo === "estribo")!;
    const ganchos = REGRAS_PILAR_NB178.base.ganchosEstribo(5);
    expect(estribo.reto).toBe(Math.ceil(Math.PI * 21 + ganchos - 1e-6));
    expect(d.posicoes.some((p) => p.tipo === "grampo")).toBe(false);
    expect(d.avisos.some((a) => a.includes("grampos não detalhados"))).toBe(true);
  });
});

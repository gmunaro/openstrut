// Cisalhamento do DESDIM contra contas à mão: Asw pela fórmula do livro (U03-026),
// bitola pelo espaçamento n·a·200/Asw ≥ 10 cm e espaçamento arredondado para baixo
// na lista 10/12/15/17/20/22/25/27/30 do .DSP.
import { describe, expect, it } from "vitest";
import { ErroQB } from "../base/f32";
import { PARAMETROS_DSP } from "../base/parametros";
import type { MateriaisSistrut } from "../base/tipos";
import {
  arredondaNaLista,
  aswCortante,
  bitolasEstriboViga,
  estriboLado,
  estribosLadoALado,
} from "./desdim-cisalhamento";

const p = PARAMETROS_DSP;
const mat: MateriaisSistrut = {
  fck: 0.15,
  fyk: 5,
  classeAco: "B",
  gamaF: 1.4,
  gamaC: 1.4,
  gamaS: 1.15,
};
const sec = { bw: 20, h: 50, bf: 0, hf: 0, d: 46 };

/** Asw do livro: (|V|·γf·γs/(bw·d) − (0,225 + 15ρ)·√(1000 fck)/1000)/fyk·bw·100·γs. */
const aswLivro = (v: number, rho: number) =>
  (((v * 1.4 * 1.15) / (20 * 46) - ((0.225 + 15 * rho) * Math.sqrt(150)) / 1000) / 5) *
  20 *
  100 *
  1.15;

describe("Asw (L_15789)", () => {
  it("V = 10 t, ρ = 0,001 (coluna 5 de A_128e vazia): 6,698 cm²/m", () => {
    expect(aswCortante(10, sec, 0, mat, p, 1, "corrigido")).toBeCloseTo(aswLivro(10, 0.001), 10);
    expect(aswLivro(10, 0.001)).toBeCloseTo(6.698, 3);
  });
  it("ρ = As/(3·bw·h) entre 0,001 e 0,015: As 15 → ρ 0,005", () => {
    expect(aswCortante(10, sec, 15, mat, p, 1, "corrigido")).toBeCloseTo(aswLivro(10, 0.005), 10);
    expect(aswCortante(10, sec, 1000, mat, p, 1, "corrigido")).toBeCloseTo(aswLivro(10, 0.015), 10);
  });
  it("mínimo min(bw, d)·0,14: V = 0,61 → 2,80", () => {
    expect(aswCortante(0.61, sec, 0, mat, p, 1, "corrigido")).toBeCloseTo(2.8, 12);
  });
});

describe("estribos lado a lado e lista de espaçamentos", () => {
  it.each([
    [39, 1],
    [40, 2],
    [59, 2],
    [60, 3],
  ])("bw %i → %i", (bw, n) => expect(estribosLadoALado(bw, p)).toBe(n));

  it("arredonda para baixo: 14,29 → 12; 29,9 → 27; 10 → 10", () => {
    expect(arredondaNaLista(14.29, p)).toBe(12);
    expect(arredondaNaLista(29.9, p)).toBe(27);
    expect(arredondaNaLista(10, p)).toBe(10);
  });
  it("abaixo de 10 o original para com o erro 5 do MID$", () => {
    expect(() => arredondaNaLista(9, p)).toThrow(ErroQB);
  });
});

describe("bitolas da viga (L_1661c)", () => {
  it("Asw 2,80 e bw 20: 0,2·200/2,8 = 14,3 ≥ 10 → φ5; φ4 tem área 0 → máxima 5, mínima 5", () => {
    expect(
      bitolasEstriboViga([{ bw: 20, aswEsquerda: 2.8, aswDireita: 2.8 }], p, "original"),
    ).toEqual({
      maxima: 5,
      minima: 5,
    });
  });
  it("Asw 6,698: φ6.3 dá 9,4 < 10, φ8 dá 14,9 → máxima 8; linha 8/6,3 do .DSP → mínima 6,3", () => {
    expect(
      bitolasEstriboViga([{ bw: 20, aswEsquerda: 6.698, aswDireita: 2.8 }], p, "original"),
    ).toEqual({
      maxima: 8,
      minima: 6.3,
    });
  });
  it("φ4 fica desativado nos dois modos (área 0): com bw 15 e Asw 2,1 o estribo é φ5", () => {
    // a R9 corrige só o φ32; com a área de 0,125 o φ4 daria 11,9 cm e estribo de 4 mm,
    // abaixo do mínimo de 5 mm (ESTRIBO_PHI_MIN, calculo/barras.ts)
    const t = [{ bw: 15, aswEsquerda: 2.1, aswDireita: 2.1 }];
    expect(bitolasEstriboViga(t, p, "original")).toEqual({ maxima: 5, minima: 5 });
    expect(bitolasEstriboViga(t, p, "corrigido")).toEqual({ maxima: 5, minima: 5 });
  });
});

describe("estribo de um lado (L_16b55)", () => {
  it("V1 do det: Asw 2,80, φ5 → 14,29 → #5/12", () => {
    expect(estriboLado(2.8, sec, { maxima: 5, minima: 5 }, p, "original")).toEqual({
      texto: "#5/12",
      bitola: 5,
      espacamento: 12,
      lado: 1,
    });
  });
  it("Asw 6,698: a mínima (6,3) não dá 10 cm; a máxima φ8 dá 14,9 → 12; teto do Asw mínimo 23 → 22", () => {
    expect(estriboLado(6.698, sec, { maxima: 8, minima: 6.3 }, p, "original")).toMatchObject({
      texto: "#8/12",
      bitola: 8,
      espacamento: 12,
    });
  });
  it("bw 45 (2 lado a lado), h 60: Asw mín 6,3; 2·0,2·200/6,3 = 12,7 → 12 → '2#5/12'", () => {
    const largo = { bw: 45, h: 60, bf: 0, hf: 0, d: 56 };
    expect(estriboLado(6.3, largo, { maxima: 5, minima: 5 }, p, "original")).toEqual({
      texto: "2#5/12",
      bitola: 5,
      espacamento: 12,
      lado: 2,
    });
  });
  it("o espaçamento do Asw mínimo limita o do lado: Asw 2,9 com φ5 dá 13,8 → 12; teto 14,29 → 12", () => {
    expect(estriboLado(2.9, sec, { maxima: 5, minima: 5 }, p, "original").espacamento).toBe(12);
  });
});

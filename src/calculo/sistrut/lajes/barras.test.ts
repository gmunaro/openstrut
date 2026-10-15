// Referências: contas à mão de livros_laje.md 2.3-2.5 (tabelas do .LAP "SISTRUT") e o
// caso retrad_laje_param do oráculo.
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import {
  barraDoCodigo,
  barraImpostaNaContinuidade,
  escolheBarraLaje,
  textoBarraLaje,
} from "./barras";

const PARAM = emSingle(PARAMETROS_LAJE);

describe("escolha de bitola e espaçamento", () => {
  it("As 2,1299, H 10 → # 6.3 c/12.5, área 2,52 (livros_laje.md 2.3)", () => {
    const b = escolheBarraLaje(2.1299, 10, PARAM, "original");
    expect(b).toMatchObject({ ok: true, bitola: sng(6.3), espacamento: 12.5, codigo: 2003 });
    if (b.ok) expect(b.area).toBeCloseTo(2.52, 5);
    expect(textoBarraLaje(b)).toBe("# 6.3 c/12.5");
  });
  it("As 3,2021, H 7 → # 6.3 c/ 7.5: 3,15 < 3,2021 por pouco (livros_laje.md 2.4)", () => {
    const b = escolheBarraLaje(3.2021, 7, PARAM, "original");
    expect(b).toMatchObject({ ok: true, bitola: sng(6.3), espacamento: 7.5, codigo: 2001 });
    expect(textoBarraLaje(b)).toBe("# 6.3 c/ 7.5");
  });
  it("As 1,50, H 10 → c/20 (1,575); As 1,68 → c/17.5 (1,80) (livros_laje.md 2.5)", () => {
    expect(escolheBarraLaje(1.5, 10, PARAM, "original")).toMatchObject({
      bitola: sng(6.3),
      espacamento: 20,
    });
    expect(escolheBarraLaje(1.68, 10, PARAM, "original")).toMatchObject({
      bitola: sng(6.3),
      espacamento: 17.5,
    });
  });
  it("s ≤ 2H: As 1,50 com H 7 pula 20, 17,5 e 15 → c/12.5", () => {
    expect(escolheBarraLaje(1.5, 7, PARAM, "original")).toMatchObject({
      bitola: sng(6.3),
      espacamento: 12.5,
    });
  });
  it("sem a chave 2H, As 1,50 com H 7 → c/20", () => {
    const sem2H = { ...PARAM, limitaEspacamento2H: false };
    expect(escolheBarraLaje(1.5, 7, sem2H, "original")).toMatchObject({ espacamento: 20 });
  });
  it("6.3 não basta até o mínimo 7,5 → passa a 8.0: As 4,6825, H 6 → # 8.0 c/10.0 (retrad_laje_param)", () => {
    // 6.3 c/7.5 = 4,20 < 4,6825; 8.0: s ≤ 12, c/12.5 fora, c/10 = 5,00 ✓.
    const b = escolheBarraLaje(4.6825, 6, PARAM, "original");
    expect(b).toMatchObject({ ok: true, bitola: 8, espacamento: 10, codigo: 3002 });
  });
  it("H 12 tem espaçamento mínimo 10: As 3,5 → 8.0 c/12.5 (6.3 c/10 = 3,15 não basta)", () => {
    expect(escolheBarraLaje(3.5, 12, PARAM, "original")).toMatchObject({
      bitola: 8,
      espacamento: 12.5,
    });
  });
  it("sem solução até a bitola 9: NAO", () => {
    const b = escolheBarraLaje(100, 10, PARAM, "original");
    expect(b).toEqual({ ok: false });
    expect(textoBarraLaje(b)).toBe("NAO");
  });
  it("H acima da última faixa de espaçamento mínimo (40): falha (o original estoura)", () => {
    expect(escolheBarraLaje(1, 41, PARAM, "original")).toEqual({ ok: false });
  });
});

describe("códigos de barra", () => {
  it("LAJEPROC: −2006 = # 6.3 c/20; 10000 (NAO) não tem barra", () => {
    expect(barraDoCodigo(-2006, PARAM, "original")).toMatchObject({
      ok: true,
      bitola: sng(6.3),
      espacamento: 20,
    });
    expect(barraDoCodigo(10000, PARAM, "original")).toEqual({ ok: false });
  });
  it("LAJECALC: 2012 = bitola 6.3, s 12 cm (CINT de 12,5), área 2,625", () => {
    const b = barraImpostaNaContinuidade(2012, PARAM, "original");
    expect(b).toMatchObject({ ok: true, bitola: sng(6.3), espacamento: 12, indiceEspacamento: 3 });
    if (b.ok) expect(b.area).toBeCloseTo(2.625, 5);
  });
});

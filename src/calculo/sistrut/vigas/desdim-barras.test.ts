// Barras do DESDIM contra a tabela do .DSP lida à mão (parametros.ts, DESENHO.BAS:
// 4790-4920) e contas à mão de teto(As/aφ).
import { describe, expect, it } from "vitest";
import { PARAMETROS_DSP } from "../base/parametros";
import {
  areaBitola,
  arranjoCompressao,
  arranjoTracao,
  intervaloDeLargura,
  leArranjo,
} from "./desdim-barras";

const p = PARAMETROS_DSP;

describe("área da bitola (S_40141) e R9", () => {
  it("original: a tabela do .DSP, com 0,00 em φ4 e φ32 (U04-005)", () => {
    expect(areaBitola(10, p, "original")).toBe(0.8);
    expect(areaBitola(4, p, "original")).toBe(0);
    expect(areaBitola(32, p, "original")).toBe(0);
  });
  it("corrigido (R9, PLANO 4.2): φ4 = 0,125 e φ32 = 8,04 cm² (π·φ²/4 arredondado)", () => {
    expect(areaBitola(4, p, "corrigido")).toBe(0.125);
    expect(areaBitola(32, p, "corrigido")).toBe(8.04);
    expect(Math.abs(areaBitola(32, p, "corrigido") - (Math.PI * 3.2 ** 2) / 4)).toBeLessThan(0.005);
    expect(areaBitola(10, p, "corrigido")).toBe(0.8);
  });
  it("bitola fora da tabela devolve a própria bitola, como o original", () => {
    expect(areaBitola(22.2, p, "original")).toBe(22.2);
  });
});

describe("intervalo de bw (limites 18 e 39, 3 grupos)", () => {
  it.each([
    [18, 0],
    [19, 1],
    [39, 1],
    [40, 2],
    [100, 2],
  ])("bw %i → intervalo %i", (bw, i) => expect(intervaloDeLargura(bw, p)).toBe(i));
});

describe("arranjo da armadura tracionada (L_15c9c)", () => {
  it("primeiro arranjo com área ≥ As: 1,50 com bw 20 → 2#10 (≤ 1,6)", () => {
    expect(arranjoTracao(1.5, 20, p, "original")).toBe("2#10");
  });
  it("intervalo 0 (bw 15): 3,2 → 2#12.5+#10 (≤ 3,3)", () => {
    expect(arranjoTracao(3.2, 15, p, "original")).toBe("2#12.5+#10");
  });
  it("'N#12.5' com bw 45: teto(8/1,25) = 7, com o espaço do STR$", () => {
    expect(arranjoTracao(8, 45, p, "original")).toBe(" 7#12.5");
  });
  it("'N#10' com o mínimo de 4 (bw > 39) e 6 (bw > 59): teto(3/0,8) = 4", () => {
    expect(arranjoTracao(3, 45, p, "original")).toBe(" 4#10");
    expect(arranjoTracao(3, 60, p, "original")).toBe(" 6#10");
  });
  it("acima da tabela: ***", () => {
    expect(arranjoTracao(200, 20, p, "original")).toBe("***");
  });
});

describe("barras da armadura comprimida (L_1600a)", () => {
  it("sem Asc: '-'", () => expect(arranjoCompressao(0, 20, p, "original")).toBe("-"));
  it("0,5 cm²: 3·0,315 > 0,5 → teto(0,5/0,315) = 2#6.3", () =>
    expect(arranjoCompressao(0.5, 20, p, "original")).toBe("2#6.3"));
  it("1,0 cm²: 3·0,315 ≤ 1, 3·0,5 > 1 → 2#8", () =>
    expect(arranjoCompressao(1, 20, p, "original")).toBe("2#8"));
  it("30 cm²: nenhuma até φ20 cobre → φ25, teto(30/5) = 6#25", () =>
    expect(arranjoCompressao(30, 20, p, "original")).toBe("6#25"));
  it("bw 45: mínimo 4 barras, 5·0,315 > 1,5 → teto(1,5/0,315) = 5#6.3", () =>
    expect(arranjoCompressao(1.5, 45, p, "original")).toBe("5#6.3"));
});

describe("leitura do arranjo (L_1521a)", () => {
  it.each([
    ["2#10", { n1: 2, bitola1: 10, n2: 0, bitola2: 0 }],
    ["2#12.5+#8", { n1: 2, bitola1: 12.5, n2: 1, bitola2: 8 }],
    ["3#20+2#16", { n1: 3, bitola1: 20, n2: 2, bitola2: 16 }],
    [" 7#12.5", { n1: 7, bitola1: 12.5, n2: 0, bitola2: 0 }],
  ])("%s", (texto, barras) => expect(leArranjo(texto)).toEqual(barras));
});

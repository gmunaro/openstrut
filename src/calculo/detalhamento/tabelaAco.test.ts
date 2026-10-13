// Referências: V1 T_DESCALC.BAS (2 φ10 × 320 cm = 6,4 m; φ10 = 0,6165 kg/m) e
// conta à mão: massa linear = π φ²/4 · 7850 kg/m³.
import { describe, expect, it } from "vitest";
import { massaLinear, tabelaAco } from "./tabelaAco";

describe("massa linear", () => {
  it("φ10 = π · 0,010²/4 · 7850 = 0,61654 kg/m (V1: 0,6165)", () => {
    expect(massaLinear(10)).toBeCloseTo(0.61654, 5);
  });
  it("φ5 = 0,15413 kg/m; φ12,5 = 0,96334 kg/m", () => {
    expect(massaLinear(5)).toBeCloseTo(0.15413, 5);
    expect(massaLinear(12.5)).toBeCloseTo(0.96334, 5);
  });
});

describe("tabelaAco", () => {
  it("2 φ10 × 320 cm = 6,4 m (V1 T_DESCALC)", () => {
    const t = tabelaAco([{ phi: 10, quantidade: 2, comprimento: 320 }]);
    expect(t.linhas).toHaveLength(1);
    expect(t.linhas[0]?.comprimento).toBeCloseTo(6.4, 9);
    expect(t.massa).toBeCloseTo(6.4 * 0.616538, 5);
  });

  // φ10 CA-50: 2 × 3,20 + 1 × 1,80 = 8,20 m → 8,20 · 0,616538 = 5,05561 kg
  // φ5 CA-60: 33 × 1,30 = 42,90 m → 42,90 · 0,154134 = 6,61236 kg
  // total 11,66797 kg; com 10 % de perda 12,83477 kg; 51,10 m
  const t = tabelaAco([
    { phi: 5, quantidade: 33, comprimento: 130, aco: "CA-60" },
    { phi: 10, quantidade: 2, comprimento: 320, aco: "CA-50" },
    { phi: 10, quantidade: 1, comprimento: 180, aco: "CA-50" },
    { phi: 8, quantidade: 0, comprimento: 500, aco: "CA-50" },
  ]);
  it("agrupa por aço e bitola, ordena e ignora quantidade nula", () => {
    expect(t.linhas.map((l) => [l.aco, l.phi])).toEqual([
      ["CA-50", 10],
      ["CA-60", 5],
    ]);
  });
  it("comprimento e massa por bitola", () => {
    expect(t.linhas[0]?.comprimento).toBeCloseTo(8.2, 9);
    expect(t.linhas[0]?.massa).toBeCloseTo(5.05561, 4);
    expect(t.linhas[1]?.comprimento).toBeCloseTo(42.9, 9);
    expect(t.linhas[1]?.massa).toBeCloseTo(6.61236, 4);
  });
  it("totais com 10 % de perda", () => {
    expect(t.comprimentoTotal).toBeCloseTo(51.1, 9);
    expect(t.massa).toBeCloseTo(11.66797, 4);
    expect(t.perda).toBe(0.1);
    expect(t.massaComPerda).toBeCloseTo(12.83477, 4);
  });
  it("perda informada pelo chamador", () => {
    const t0 = tabelaAco([{ phi: 10, quantidade: 1, comprimento: 100 }], 0);
    expect(t0.massaComPerda).toBeCloseTo(0.616538, 5);
  });
});

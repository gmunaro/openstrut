// Casos de T_CALCCA.BAS e T_VIGCALC.BAS (V1); esperados calculados à mão.
import { describe, expect, it } from "vitest";
import {
  areaBarra,
  escolheBarras,
  escolheBarrasAlma,
  escolheEstribo,
  escolheMalha,
  larguraCamada,
} from "./barras";

describe("areaBarra", () => {
  it("φ10 = π·1²/4 = 0,785398 cm² (T_CALCCA)", () => {
    expect(areaBarra(10)).toBeCloseTo(0.785398, 5);
  });
});

describe("escolheMalha", () => {
  it("2,1505 cm²/m, φ ≥ 5, 7 ≤ s ≤ 20 → φ5 c/9 (T_CALCCA)", () => {
    // φ5: 0,19635·100/2,1505 = 9,13 → 9,0 cm
    const m = escolheMalha(2.1505, 5, 7, 20);
    expect(m).toEqual({ phi: 5, espacamento: 9 });
    expect((areaBarra(5) * 100) / 9).toBeGreaterThanOrEqual(2.1505);
  });
  it("armadura nula usa sMax com a bitola mínima", () => {
    expect(escolheMalha(0, 6.3, 7, 20)).toEqual({ phi: 6.3, espacamento: 20 });
  });
  it("sem solução → null (nem φ32 dá s ≥ 7 para 200 cm²/m)", () => {
    // φ32: 8,04·100/200 = 4,0 cm < 7
    expect(escolheMalha(200, 5, 7, 20)).toBeNull();
  });
});

describe("escolheBarras", () => {
  it("7,5 cm², φ ≥ 10, 2..6 barras → 4 φ16 (φ10 daria 10, φ12,5 daria 7) (T_CALCCA)", () => {
    const b = escolheBarras(7.5, 10, 2, 6);
    expect(b?.phi).toBe(16);
    expect(b?.n).toBe(4);
    expect(b?.area).toBeGreaterThanOrEqual(7.5);
  });
  it("nMin prevalece sobre a área", () => {
    expect(escolheBarras(0.5, 10, 4, 20)).toMatchObject({ phi: 10, n: 4 });
  });
});

describe("larguraCamada", () => {
  it("2 φ16 = 3,2 + 2,28 = 5,48 cm (T_VIGCALC)", () => {
    expect(larguraCamada(2, 16)).toBeCloseTo(5.48, 6);
  });
  it("espaçamento livre = φ quando φ > 2,28 cm: 3 φ25 = 7,5 + 2·2,5 = 12,5 cm", () => {
    expect(larguraCamada(3, 25)).toBeCloseTo(12.5, 6);
  });
});

describe("escolheBarrasAlma (largura útil = bw − 2·(2 + 0,5))", () => {
  it("bw 12, As 3,96: cabe 2 φ16 (φ10 → 6 barras 17,4 cm; φ12,5 → 4 barras 11,84 cm; útil 7 cm) (T_VIGCALC)", () => {
    const b = escolheBarrasAlma(3.96, 12, 2);
    expect(b).toMatchObject({ phi: 16, n: 2, cabe: true });
    expect(b?.largura).toBeLessThanOrEqual(7);
    expect(b?.area).toBeGreaterThanOrEqual(3.96);
  });
  it("bw 12, As 25: não cabe, devolve o arranjo mais estreito (T_VIGCALC)", () => {
    // φ20: 8 barras 31,96 cm; φ25: 6 barras 27,5 cm; φ32: 4 barras 22,4 cm → φ32
    const b = escolheBarrasAlma(25, 12, 2);
    expect(b).toMatchObject({ phi: 32, n: 4, cabe: false });
    expect(b?.area).toBeGreaterThanOrEqual(25);
  });
  it("As 70 (> 8 φ32 = 64,3 cm²): sem solução (T_VIGCALC)", () => {
    expect(escolheBarrasAlma(70, 20, 2)).toBeNull();
  });
});

describe("escolheEstribo (2 ramos, φ ≥ 5, s ≥ 7, s ≤ min(0,5d; 30))", () => {
  it("asw 4,6184 cm²/m, d 45: φ5 c/8,5", () => {
    // por ramo 2,3092; φ5: 19,635/2,3092 = 8,503 → 8,5 ≤ 22,5
    expect(escolheEstribo(4.6184, 45)).toEqual({ phi: 5, espacamento: 8.5 });
  });
  it("asw mínimo 2,8 cm²/m, d 46: φ5 c/14", () => {
    // por ramo 1,4; 19,635/1,4 = 14,03 → 14,0
    expect(escolheEstribo(2.8, 46)).toEqual({ phi: 5, espacamento: 14 });
  });
  it("asw 12 cm²/m: φ5 e φ6,3 dão s < 7, fica φ8 c/8", () => {
    // por ramo 6; φ5 → 3,0; φ6,3 → 5,0; φ8: 50,265/6 = 8,38 → 8,0
    expect(escolheEstribo(12, 46)).toEqual({ phi: 8, espacamento: 8 });
  });
  it("s limitado a 30 cm em viga alta", () => {
    expect(escolheEstribo(1, 80)).toEqual({ phi: 5, espacamento: 30 });
  });
});

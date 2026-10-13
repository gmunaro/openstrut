// Pilar-padrão acoplado a diagramas M, N, 1/r e fluência (NBR 6118:2023, 15.8.3.3.4 e
// 15.8.4). Valores esperados de contas à mão escritas aqui e de Bastos, "Flexão
// composta e pilares de concreto armado" (UNESP, jun/2024), exemplo 13.1.1 (p. 79-86).
import { describe, expect, it } from "vitest";
import { camadasSimetricas } from "./secaoParabolaRetangulo";
import {
  excentricidadeAcidental,
  excentricidadeFluencia,
  forcaNe,
  momentoCurvatura,
  momentoTotalMN,
} from "./pilarPadraoMN";

// C25 e CA-50: σcd = 0,85·25/1,4 = 15,179 MPa; fyd = 434,78 MPa.
const t = { sigmaCd: (0.85 * 25) / 1.4, fyd: 500 / 1.15, es: 210_000 };
// 20 (largura) × 40 (altura na flexão), d' = 4 cm, 5 cm² em cada face.
const s = { b: 20, h: 40, dl: 4 };
const camadas = camadasSimetricas(s, 5);

// Estado de deformação escolhido: topo 2‰, base 0 → 1/r = 0,002/40 = 5·10⁻⁵ /cm.
// Concreto do diagrama M, N, 1/r: pico 15,179/1,1 = 13,7987 MPa. Parábola de 0 (base)
// a εc2 (topo) na altura toda: resultante 2/3·σ·b·h = 2/3·13,7987·800·0,1 = 735,931 kN,
// a 3h/8 do topo, braço h/8 = 5 cm → 3.679,65 kN·cm.
// Barra de cima (y = 4): ε = 1,8‰, σs = 378 MPa, σc descontado = 13,7987·0,99 = 13,661;
// F = 5·(378 − 13,661)/10 = 182,170 kN, braço +16 cm → 2.914,71 kN·cm.
// Barra de baixo (y = 36): ε = 0,2‰, σs = 42 MPa, σc = 13,7987·0,19 = 2,6218;
// F = 5·(42 − 2,6218)/10 = 19,689 kN, braço −16 cm → −315,03 kN·cm.
// N = 937,790 kN; M = 6.279,34 kN·cm = 62,7934 kN·m.
const N0 = 937.7895;
const M0 = 62.79342;
const K0 = 5e-5;

describe("diagrama M, N, 1/r com 0,85·fcd/γf3 (15.3.1), conta à mão", () => {
  it("N = 937,79 kN e 1/r = 5·10⁻⁵ /cm → M = 62,793 kN·m, deformação admissível", () => {
    const p = momentoCurvatura(N0, K0, s, camadas, t);
    expect(p?.m).toBeCloseTo(M0, 3);
    expect(p?.admissivel).toBe(true);
  });
  it("curvatura além da última (εcu ou εsu) não é admissível", () => {
    // (εcu + εsu)/d = 0,0135/36 = 3,75·10⁻⁴ /cm é cota superior da curvatura última
    expect(momentoCurvatura(N0, 3.75e-4, s, camadas, t)?.admissivel).toBe(false);
  });
});

describe("pilar-padrão acoplado (15.8.3.3.4), conta à mão", () => {
  // Com Nd = N0 e le = 4 m: M2d = Nd·(1/r)·le²/10 = 937,79·5·10⁻⁵·400²/10/100 = 7,5023 kN·m.
  // Escolhendo M1 = 62,7934 − 7,5023 = 55,2911 kN·m, o equilíbrio M = M1 + M2d é o estado
  // acima: Md,tot = 62,793 kN·m e 1/r = 5·10⁻⁵ /cm (ramo estável: rigidez secante
  // 6.279/5·10⁻⁵ = 1,26·10⁸ kN·cm² ≫ Nd·le²/10 = 1,50·10⁷).
  it("M1 = 55,291 kN·m, le = 4 m → Md,tot = 62,793 kN·m e 1/r = 5·10⁻⁵ /cm", () => {
    const r = momentoTotalMN(N0, 55.2911, 4, s, camadas, t);
    expect(r?.mTot).toBeCloseTo(M0, 2);
    expect(r?.curvatura).toBeCloseTo(K0, 8);
    expect(r?.m2).toBeCloseTo(7.50232, 2);
  });
  it("M1 acima da capacidade do diagrama: sem equilíbrio", () => {
    // Cota superior de qualquer M da seção: concreto σcd·b·h²/8 = 15,18·20·40²/8/10 =
    // 6.071 kN·cm, aço 2·5·43,48·16 = 6.957 kN·cm; soma 130 kN·m < 200.
    expect(momentoTotalMN(N0, 200, 4, s, camadas, t)).toBeNull();
  });
  it("mais esbelto (le = 12 m) com o mesmo M1: sem equilíbrio estável", () => {
    // Nd·le²/10 = 937,79·1200²/10 = 1,35·10⁸ kN·cm² > rigidez secante 1,26·10⁸ em 1/r = 5·10⁻⁵.
    expect(momentoTotalMN(N0, 55.2911, 12, s, camadas, t)).toBeNull();
  });
});

describe("fluência (15.8.4) e excentricidade acidental (11.3.3.4.2)", () => {
  it("ea = θ1·le/2 com H = 2,8 m: θ1 = 0,00598, ea = 0,84 cm (Bastos p. 79-86, ex. 13.1.1)", () => {
    expect(excentricidadeAcidental(2.8) * 100).toBeCloseTo(0.84, 2);
  });
  it("θ1 mínimo 1/300: H = 16 m → θ1 = 1/400 vira 1/300, ea = 16/600 = 2,667 cm", () => {
    expect(excentricidadeAcidental(16) * 100).toBeCloseTo(2.6667, 3);
  });
  it("Ne = 10·28.000·0,1·26.666,7/550² = 2.468,32 kN (C25, 40 × 20, le = 5,5 m)", () => {
    // Eci = 5600·√25 = 28.000 MPa; Ic = 40·20³/12 = 26.666,7 cm⁴
    expect(forcaNe(28_000, (40 * 20 ** 3) / 12, 5.5)).toBeCloseTo(2468.32, 1);
  });
  it("ecc = (5/600 + 0,011726)·(2,718^(2·600/1.868,32) − 1) = 1,8067 cm", () => {
    // expoente 0,64229; 2,718^0,64229 = 1,90073; (0,008333 + 0,011726)·0,90073 = 0,018067 m
    const ecc = excentricidadeFluencia(5, 600, 0.011726, 2, 2468.32) ?? NaN;
    expect(ecc * 100).toBeCloseTo(1.8067, 3);
  });
  it("Nsg ≥ Ne: instabilidade (null)", () => {
    expect(excentricidadeFluencia(5, 2500, 0.01, 2, 2468.32)).toBeNull();
  });
});

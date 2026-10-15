// Esforços atuantes e leis dos materiais, por conta à mão (livros_viga_pilar.md 2.3-2.7
// e 3.2). Valores esperados calculados a partir das fórmulas do livro, não da função.
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { casosExcentricidade, esbeltez, momentoDirecao, situacaoPilar } from "./esforcos";
import {
  criaContexto,
  integraConcreto,
  leiAco,
  novoEstado,
  posiciona,
  secaoCalculo,
} from "./secao";

const mat = { fck: 0.15, fyk: 5, aco: "B" as const, csf: 1.4, csc: 1.4, csa: 1.15, coefTensao: 1 };
const ret20 = secaoCalculo({ tipo: "retangular", b: 20, h: 20, barras: [] }, [], "corrigido");

describe("λ inteiro (PILAR.BAS:5631-5632)", () => {
  it("caso c: 3/√(13333,33/400)·100 = 51,96 → 52", () => {
    expect(esbeltez(3, 13333.33, 400)).toBe(52);
  });
  it("arredonda ao par: 52,5 → 52", () => {
    // L/i·100 = 52,5 com i = 2 cm (J/A = 4) e L = 1,05 m
    expect(esbeltez(1.05, 4, 1)).toBe(52);
  });
  it("área negativa (poligonal anti-horária) → −32768, como o FISTP de NaN (D-6)", () => {
    expect(esbeltez(3, 13333, -400)).toBe(-32768);
  });
});

describe("casos de excentricidade acidental (livros_viga_pilar.md 2.4)", () => {
  it("isoladas sem momento: 2 casos na seção simétrica, 4 na poligonal", () => {
    expect(casosExcentricidade(0, 0, true, "isoladas")).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(casosExcentricidade(0, 0, false, "isoladas")).toHaveLength(4);
  });
  it("só My: (1,2) = +1, (2,1) = +1, (3,1) = −1", () => {
    expect(casosExcentricidade(0, 1, false, "isoladas")).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
    ]);
  });
  it("simultâneas com os dois momentos: 1 caso (+,+)", () => {
    expect(casosExcentricidade(1, 1, false, "simultaneas")).toEqual([{ x: 1, y: 1 }]);
  });
  it("situação pelos momentos iniciais", () => {
    expect(situacaoPilar(17.37, 0, 0)).toBe("Compressao Centrada");
    expect(situacaoPilar(40, 2, 0)).toBe("Flexo Compressao");
    expect(situacaoPilar(40, 2, 1)).toBe("Flexao Obliqua");
    expect(situacaoPilar(-1, 0, 0)).toBe("Flexo Tracao");
  });
});

describe("Ma = CLNG(100·ea·Nk)/100 e fluência (D-1)", () => {
  // 20×20, Nk 20 t, le 5 m, φ = 2, λ = 87 > 80. ea = max(2 cm; 20/30) = 0,02 m;
  // Ma = CLNG(100·0,02·20)/100 = 0,40. Ec = √(150 + 35)·0,9·21 = 257,07;
  // Ne = π²/500²·257,07·13333,33 = 135,32 t; Ng = 0,95·1,1·20 = 20,9;
  // X = 2·20,9/(135,32 − 20,9) = 0,3653.
  // Original: Mc = 0,40·e^(X − 1) = 0,40·0,5301 = 0,212 → 0,21.
  // Corrigido (NB-1/78): Mc = 0,40·(e^X − 1) = 0,40·0,4409 = 0,176 → 0,18.
  const par = {
    excentricidadeMinima: 2,
    verificaH30: true,
    coeficienteFluencia: 2,
    lambdaFluencia: 80,
    fatorNkFluencia: 0.95,
    fatorCargaFluencia: 1.1,
    ec: Math.sqrt(185) * 0.9 * 21,
  };
  const dir = { mk: 0, sinal: 1, lambda: 87, le: 5, j: 20 ** 4 / 12 };

  it("Ma = 0,40 tm", () => {
    const ctx = criaContexto("corrigido", mat);
    expect(momentoDirecao(ctx, novoEstado(ret20), 270, 20, dir, par).ma).toBeCloseTo(0.4, 10);
  });
  it("original: e^(X − 1) → Mc 0,21", () => {
    const ctx = criaContexto("original", mat);
    expect(momentoDirecao(ctx, novoEstado(ret20), 270, sng(20), dir, par).mc).toBeCloseTo(0.21, 6);
  });
  it("corrigido: e^X − 1 → Mc 0,18", () => {
    const ctx = criaContexto("corrigido", mat);
    expect(momentoDirecao(ctx, novoEstado(ret20), 270, 20, dir, par).mc).toBeCloseTo(0.18, 10);
  });
});

describe("leis dos materiais (livros_viga_pilar.md 2.7 e 3.2 passo 6)", () => {
  it("aço B a 2 ‰: σ/2100 + (σ/4,3478 − 0,7)²/45 = 0,002 → σ = 3,555 t/cm²", () => {
    const ctx = criaContexto("corrigido", mat);
    const est = novoEstado(ret20);
    est.xi = 12;
    est.d = 17;
    est.epsC = 0.002;
    expect(leiAco(ctx, est, 3).sigma).toBeCloseTo(3.555, 3);
  });
  it("aço B acima de fyd/Es + 2 ‰ escoa: σ = fyd = 4,3478", () => {
    const ctx = criaContexto("corrigido", mat);
    const est = novoEstado(ret20);
    est.xi = 0.5;
    est.d = 17;
    est.epsC = 0.0035;
    // barra a 17 cm do topo, LN a 8,5 cm: ε = (17/8,5 − 1)·3,5 ‰ = 3,5 ‰ < 4,07 ‰; a 25 cm: 6,8 ‰
    expect(leiAco(ctx, est, 25).sigma).toBeCloseTo(-5 / 1.15, 10);
  });
  it("Nmax do caso c: concreto todo comprimido a 2 ‰, Nc = 400·0,85·0,10714/1,4 = 26,02 t", () => {
    const ctx = criaContexto("corrigido", mat);
    const est = novoEstado(ret20);
    posiciona(ctx, est, 270);
    est.d = 17;
    est.xi = 12;
    est.kappa = 0;
    integraConcreto(ctx, est);
    expect(est.nc).toBeCloseTo(26.02, 2);
  });
});

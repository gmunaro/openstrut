// Vigas pela NBR 6118:2023. Flexão: exemplos E04 a E08 de docs/norma/exemplos.md
// (Bastos, Flexão Simples, out/2023). Cortante: E09 e E10 (Bastos, Cortante,
// mar/2025) e casos com conta à mão. As tolerâncias seguem o arredondamento
// impresso; onde o autor usa as tabelas Kc/Ks, a diferença está comentada.
import { describe, expect, it } from "vitest";
import type { Aco } from "../../../dominio/obra";
import { obraNova } from "../../../dominio/criar";
import type { ComMemoria } from "../../tipos";
import { materiais6118 } from "./materiais";
import { lambda6118, rhoMin6118, vigaCortante6118, vigaFlexao6118, xdLimite6118 } from "./vigas";

const mat = (fck: number, acoEstribo: Aco = "CA-50") =>
  materiais6118({ ...obraNova("x", "nbr6118-2023").materiais, fck, aco: "CA-50", acoEstribo });

/** Valor de uma etapa da memória pelo início da descrição. */
const etapa = (r: ComMemoria, inicio: string) =>
  r.memoria.find((e) => e.descricao.startsWith(inicio))?.valor;

describe("parâmetros da flexão", () => {
  it("λ e x/d limite: 0,8 e 0,45 até C50; C70 → λ = 0,75, x/d ≤ 0,35 (F1 Eq. 15 e 26)", () => {
    expect(lambda6118(50)).toBe(0.8);
    expect(lambda6118(70)).toBeCloseTo(0.75, 9);
    expect(xdLimite6118(50)).toBe(0.45);
    expect(xdLimite6118(60)).toBe(0.35);
  });
  it("ρmín da Tabela 17.3; fck fora da tabela usa a coluna seguinte (F1 Tabela 2)", () => {
    expect(rhoMin6118(25)).toBeCloseTo(0.0015, 9);
    expect(rhoMin6118(32)).toBeCloseTo(0.00164, 9);
    expect(rhoMin6118(50)).toBeCloseTo(0.00208, 9);
  });
});

describe("vigaFlexao6118: armadura simples", () => {
  it("E04 (ex. 7.3 nº 1, pp. 18-23): C20, 20x50, d = 47, Md = 14 000 kN·cm → x = 18,1; As = 8,10", () => {
    const r = vigaFlexao6118(140, 20, 50, 47, mat(20));
    expect(r.xd * 47).toBeCloseTo(18.1, 1);
    expect(r.as).toBeCloseTo(8.1, 2);
    expect(r.asComprimida).toBe(0);
    expect(etapa(r, "Armadura mínima de tração")).toBeCloseTo(1.5, 2);
    expect(r.avisos).toEqual([]);
  });

  it("E05a (ex. 7.3 nº 2, p. 23): C25, bw = 20, d = 55,5, Md = 17 598 → As = 8,24 (Ks = 0,026 tabelado)", () => {
    const r = vigaFlexao6118(175.98, 20, 60, 55.5, mat(25));
    // a apostila usa Ks = 0,026 da tabela; a equação dá 8,15 cm² (x/d = 0,263)
    expect(Math.abs(r.as - 8.24)).toBeLessThan(0.1);
    expect(r.xd).toBeCloseTo(0.26, 2);
    // h = 60 não passa de 60 cm: sem armadura de pele
    expect(r.avisos).toEqual([]);
  });

  it("E06 (ex. 7.3 nº 3, pp. 28-30): C25, 22x60, d = 55, Md = −21 000 → x = 16,2; As = 9,95; As,mín = 1,98", () => {
    const r = vigaFlexao6118(-210, 22, 60, 55, mat(25));
    expect(r.xd * 55).toBeCloseTo(16.2, 1);
    expect(r.as).toBeCloseTo(9.95, 2);
    expect(etapa(r, "Armadura mínima de tração")).toBeCloseTo(1.98, 2);
  });

  it("momento pequeno: prevalece As,mín = 0,15 % bw h (conta: 0,0015 · 20 · 50 = 1,50)", () => {
    const r = vigaFlexao6118(10, 20, 50, 46, mat(25));
    expect(r.as).toBeCloseTo(1.5, 9);
  });

  it("momento nulo: sem armadura", () => {
    const r = vigaFlexao6118(0, 20, 50, 46, mat(25));
    expect(r.as).toBe(0);
    expect(r.asComprimida).toBe(0);
  });
});

describe("vigaFlexao6118: armadura dupla", () => {
  it("E05b (ex. 7.3 nº 2, p. 25): C25, bw = 20, d = 44, Md = 17 598 → As = 11,20 com x = 0,45 d", () => {
    const r = vigaFlexao6118(175.98, 20, 50, 44, mat(25));
    // d = 44 vem de Kc = 2,2 tabelado; pela equação x/d = 0,458 e sobra um A's pequeno
    expect(r.xd).toBe(0.45);
    expect(r.as).toBeCloseTo(11.2, 1);
    expect(r.asComprimida).toBeLessThan(0.2);
  });

  it("E07 (ex. 8.3 nº 1, pp. 37-40): C25, 20x50, d = 45, d' = 3, Md = −21 980 → x = 26,2; M1d = 18 147; A's = 2,10; As = 13,41", () => {
    const r = vigaFlexao6118(-219.8, 20, 50, 45, mat(25), 3);
    expect(etapa(r, "Linha neutra sem armadura")).toBeCloseTo(26.2, 1);
    expect(r.xd).toBe(0.45);
    expect(etapa(r, "Momento resistido")).toBeCloseTo(181.47, 1);
    expect(etapa(r, "Tensão na armadura comprimida")).toBeCloseTo(434.8, 1);
    expect(r.asComprimida).toBeCloseTo(2.1, 2);
    expect(r.as).toBeCloseTo(13.41, 2);
    expect(r.avisos.some((a) => a.includes("armadura dupla"))).toBe(true);
  });

  it("E08 (ex. 8.3 nº 2, pp. 41-43): C30, 14x60, d = 54, d' = 4 (padrão), Md = −25 900 → x/d = 0,56; As = 13,17", () => {
    const r = vigaFlexao6118(-259, 14, 60, 54, mat(30));
    expect(etapa(r, "Linha neutra sem armadura")! / 54).toBeCloseTo(0.56, 2);
    // a apostila tira M1d de Kc,lim = 1,9 (21 486 kN·cm); a equação dá 21 950.
    // Por isso As fica 13,22 (impresso 13,17) e A's 1,82 (impresso 2,03).
    expect(Math.abs(r.as - 13.17)).toBeLessThan(0.06);
    expect(Math.abs(r.asComprimida - 2.03)).toBeLessThan(0.25);
    expect(etapa(r, "Armadura mínima de tração")).toBeCloseTo(1.26, 2);
  });

  it("E08 por conta à mão sem tabela: M1d = 0,8 · 24,3 · 14 · σcd (54 − 9,72); A's = M2d / (fyd · 50)", () => {
    const scd = (0.85 * 3) / 1.4; // kN/cm²
    const fyd = 50 / 1.15;
    const m1 = 0.8 * 24.3 * 14 * scd * (54 - 0.4 * 24.3);
    const m2 = 25_900 - m1;
    const r = vigaFlexao6118(-259, 14, 60, 54, mat(30));
    expect(r.asComprimida).toBeCloseTo(m2 / (fyd * 50), 6);
    expect(r.as).toBeCloseTo(m1 / (fyd * (54 - 0.4 * 24.3)) + m2 / (fyd * 50), 6);
  });

  it("E08 recálculo com d = 52,9 (l.2598): As = 13,39 (Kc tabelado; equação 13,44)", () => {
    const r = vigaFlexao6118(-259, 14, 60, 52.9, mat(30));
    expect(Math.abs(r.as - 13.39)).toBeLessThan(0.06);
  });

  it("A's sem escoar: C25, 15x25, d = 20, d' = 4 → ε's = 3,5‰ · 5/9; σ's = Es ε's (conta à mão)", () => {
    const x = 0.45 * 20;
    const sl = (210_000 * 0.0035 * (x - 4)) / x / 10; // kN/cm²
    const m1 = 0.8 * x * 15 * ((0.85 * 2.5) / 1.4) * (20 - 0.4 * x);
    const r = vigaFlexao6118(40, 15, 25, 20, mat(25));
    expect(r.asComprimida).toBeCloseTo((4000 - m1) / (sl * 16), 6);
  });

  it("d ≤ d' com armadura dupla: NaN e aviso", () => {
    const r = vigaFlexao6118(50, 15, 8, 4, mat(25));
    expect(r.as).toBeNaN();
    expect(r.avisos.length).toBeGreaterThan(0);
  });
});

describe("vigaFlexao6118: avisos", () => {
  it("As + A's > 4 % Ac (conta: 12x30, d = 26, Md = 100 kN·m → ≈ 17,2 cm² > 14,4)", () => {
    const r = vigaFlexao6118(100, 12, 30, 26, mat(25));
    expect(r.as + r.asComprimida).toBeGreaterThan(14.4);
    expect(r.avisos.some((a) => a.includes("4 % Ac"))).toBe(true);
  });
  it("h = 70 > 60: armadura de pele 0,10 % · 20 · 70 = 1,40 cm² por face", () => {
    const r = vigaFlexao6118(100, 20, 70, 65, mat(25));
    expect(etapa(r, "Armadura de pele")).toBeCloseTo(1.4, 9);
    expect(r.avisos.some((a) => a.includes("1.40 cm²"))).toBe(true);
  });
  it("fck > 50: aviso de fora do escopo", () => {
    const r = vigaFlexao6118(100, 20, 50, 45, mat(55));
    expect(r.avisos.some((a) => a.includes("Grupo II"))).toBe(true);
  });
});

describe("vigaCortante6118 (Modelo I)", () => {
  it("E09 (ex. 5.15, pp. 41-43): C25, 14x46, VSd = 1,4 · 109,3 → VRd2 = 279,5; Vc0 = 49,6; Asw = 5,73; mín 1,44", () => {
    const r = vigaCortante6118(1.4 * 109.3, 14, 46, 0, mat(25));
    expect(r.bielaOk).toBe(true);
    expect(etapa(r, "Resistência da biela")).toBeCloseTo(279.5, 1);
    expect(etapa(r, "Parcela do concreto")).toBeCloseTo(49.6, 1);
    // impresso usa 0,9 · 43,5 ≈ 39,2 e Vc0 = 49,6; a conta exata dá 5,75
    expect(Math.abs(r.asw - 5.73)).toBeLessThan(0.03);
    expect(etapa(r, "Estribos mínimos")).toBeCloseTo(1.44, 2);
    expect(r.avisos).toEqual([]);
  });

  it("E09 com estribo CA-60: fywd = 435 e mínima com fywk = 50 kN/cm² (F3 nota 33)", () => {
    const r = vigaCortante6118(1.4 * 109.3, 14, 46, 0, mat(25, "CA-60"));
    expect(Math.abs(r.asw - 5.73)).toBeLessThan(0.03);
    expect(etapa(r, "Estribos mínimos")).toBeCloseTo(1.44, 2);
  });

  it("E10 apoio A (ex. 5.16, pp. 49-51): C25, 25x80, VSd = 232,1 → calculada 2,49 < mínima 2,56", () => {
    const r = vigaCortante6118(-1.4 * 165.8, 25, 80, 0, mat(25));
    expect(etapa(r, "Resistência da biela")).toBeCloseTo(867.9, 0);
    expect(etapa(r, "Parcela do concreto")).toBeCloseTo(153.9, 1);
    expect(etapa(r, "Estribos calculados")).toBeCloseTo(2.49, 1);
    expect(r.asw).toBeCloseTo(2.56, 1);
  });

  it("E10 apoio B: VSd = 262,1 → Asw = 3,45 cm²/m", () => {
    const r = vigaCortante6118(1.4 * 187.2, 25, 80, 0, mat(25));
    expect(r.asw).toBeCloseTo(3.45, 1);
  });

  it("conta à mão: C25, 20x45, Vd = 200 → VRd2 = 390,5; Vc = 69,25; Asw = 130,75 / (0,9 · 45 · 43,478) = 7,43", () => {
    const r = vigaCortante6118(200, 20, 45, 5, mat(25));
    expect(etapa(r, "Resistência da biela")).toBeCloseTo(390.5, 1);
    expect(etapa(r, "Parcela do concreto")).toBeCloseTo(69.25, 2);
    expect(r.asw).toBeCloseTo(7.425, 2);
    expect(etapa(r, "Estribos mínimos")).toBeCloseTo(2.052, 3);
  });

  it("conta à mão: biela esmagada, C30, 14x54, Vd = 500 > VRd2 = 0,27 · 0,88 · 2,143 · 756 = 384,9", () => {
    const r = vigaCortante6118(500, 14, 54, 0, mat(30));
    expect(etapa(r, "Resistência da biela")).toBeCloseTo(384.9, 1);
    expect(r.bielaOk).toBe(false);
    expect(r.avisos.some((a) => a.includes("Biela"))).toBe(true);
    // Asw calculado continua no resultado: (500 − 65,69) / (0,9 · 54 · 43,478)
    expect(r.asw).toBeCloseTo(20.55, 2);
  });

  it("smáx 18.3.3.2: E09 VSd = 153,0 ≤ 0,67 · 279,5 = 187,3 → 0,6 · 46 = 27,6 cm", () => {
    expect(vigaCortante6118(1.4 * 109.3, 14, 46, 0, mat(25)).sMax).toBeCloseTo(27.6, 9);
  });
  it("smáx: E10 d = 80, cortante baixo → 0,6 · 80 = 48 > 30 → 30 cm", () => {
    expect(vigaCortante6118(1.4 * 187.2, 25, 80, 0, mat(25)).sMax).toBe(30);
  });
  it("smáx: Vd = 500 > 0,67 · 384,9 = 257,9 → 0,3 · 54 = 16,2 cm (≤ 20)", () => {
    expect(vigaCortante6118(500, 14, 54, 0, mat(30)).sMax).toBeCloseTo(16.2, 9);
  });
  it("smáx: C25, 20x80, Vd = 600 > 0,67 · 0,27 · 0,9 · 1,786 · 1600 = 465,1 → 0,3 · 80 = 24 → 20 cm", () => {
    expect(vigaCortante6118(600, 20, 80, 0, mat(25)).sMax).toBe(20);
  });
});

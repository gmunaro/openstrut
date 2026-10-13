// Valores de referência: conta à mão (no comentário), Tabela A-1 de Bastos,
// "Ancoragem e emenda de armaduras" (UNESP, mar/2024, p. 25, valores
// arredondados ao cm) e os testes da V1 (tests/T_DESCALC.BAS).
import { describe, expect, it } from "vitest";
import type { MateriaisCalc } from "../tipos";
import {
  aderencia6118,
  aderenciaNb178,
  alturaGancho6118,
  ancoragemBasica6118,
  ancoragemBasicaNb178,
  ancoragemNecessaria6118,
  ancoragemNecessariaNb178,
  gancho6118,
  ganchoNb178,
  ganchosEstribo6118,
  ganchosEstriboNb178,
} from "./ancoragem";

/** C25, CA-50, γc = 1,4, γs = 1,15. */
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
  acoEstribo: "CA-50",
};

// fctd = 0,7 · 0,3 · 25^(2/3) / 1,4 = 0,21 · 8,54988 / 1,4 = 1,282482 MPa
// fbd (boa) = 2,25 · 1,282482 = 2,885584 MPa; fbd (má) = 0,7 · 2,885584 = 2,019909 MPa
// fyd = 500 / 1,15 = 434,7826 MPa
describe("lb pela NBR 6118:2023 (C25, CA-50)", () => {
  it("φ10 boa: lb = 1,0/4 · 434,7826/2,885584 = 37,67 cm (Tabela A-1: 38)", () => {
    const a = ancoragemBasica6118(10, "boa", c25);
    expect(a.fbd).toBeCloseTo(2.885584, 5);
    expect(a.lb).toBeCloseTo(37.6685, 3);
    expect(Math.round(a.lb)).toBe(38);
  });
  it("φ10 má: lb = 37,6685 / 0,7 = 53,81 cm (Tabela A-1: 54)", () => {
    const a = ancoragemBasica6118(10, "ma", c25);
    expect(a.fbd).toBeCloseTo(2.019909, 5);
    expect(a.lb).toBeCloseTo(53.8122, 3);
    expect(Math.round(a.lb)).toBe(54);
  });
  it("φ16 boa: lb = 1,6/4 · 434,7826/2,885584 = 60,27 cm (Tabela A-1: 60)", () => {
    const a = ancoragemBasica6118(16, "boa", c25);
    expect(a.lb).toBeCloseTo(60.2696, 3);
    expect(Math.round(a.lb)).toBe(60);
  });
  it("φ16 má: lb = 60,2696 / 0,7 = 86,10 cm (Tabela A-1: 86)", () => {
    const a = ancoragemBasica6118(16, "ma", c25);
    expect(a.lb).toBeCloseTo(86.0994, 3);
    expect(Math.round(a.lb)).toBe(86);
  });
  it("mínimo de 25 φ: C50 φ10 boa dá 23,73 cm < 25 cm (a Tabela A-1 traz 24, sem o mínimo)", () => {
    // fctd = 0,21 · 50^(2/3) / 1,4 = 0,21 · 13,5721 / 1,4 = 2,035815; fbd = 4,580584
    // lb = 0,25 · 434,7826 / 4,580584 = 23,73 → 25 φ = 25 cm
    const a = ancoragemBasica6118(10, "boa", { ...c25, fck: 50, fcd: 50 / 1.4 });
    expect(a.lb).toBe(25);
  });
  it("η1 = 1,0 para CA-60: lb 2,25 vezes o do CA-50 com o mesmo fyd", () => {
    const a50 = ancoragemBasica6118(10, "boa", c25);
    const a60 = ancoragemBasica6118(10, "boa", { ...c25, aco: "CA-60" });
    expect(a60.lb).toBeCloseTo(a50.lb * 2.25, 9);
  });
});

describe("lb,nec pela NBR 6118:2023 (9.4.2.5)", () => {
  const lb16 = ancoragemBasica6118(16, "boa", c25); // 60,2696 cm
  it("sem gancho: lb · As,calc/As,ef = 60,2696 · 3,5/4,02 = 52,47 cm", () => {
    const r = ancoragemNecessaria6118(lb16, 3.5, 4.02, false);
    expect(r.lbNec).toBeCloseTo((60.2696 * 3.5) / 4.02, 3);
  });
  it("com gancho: 0,7 · 52,474 = 36,73 cm", () => {
    const r = ancoragemNecessaria6118(lb16, 3.5, 4.02, true);
    expect(r.lbNec).toBeCloseTo((0.7 * 60.2696 * 3.5) / 4.02, 3);
  });
  it("lb,mín = máx(0,3 · 60,27 = 18,08; 10 φ = 16; 10 cm) governa com As,calc pequena", () => {
    const r = ancoragemNecessaria6118(lb16, 0.5, 4.02, true);
    expect(r.lbMin).toBeCloseTo(0.3 * 60.2696, 3);
    expect(r.lbNec).toBeCloseTo(0.3 * 60.2696, 3);
  });
  it("As,calc maior que As,ef não aumenta o lb (razão limitada a 1)", () => {
    expect(ancoragemNecessaria6118(lb16, 5, 4.02, false).lbNec).toBeCloseTo(60.2696, 3);
  });
});

describe("zona de aderência pela NBR 6118:2023 (9.3.1)", () => {
  it("barra inferior: boa", () => {
    expect(aderencia6118("inferior", 50, 4)).toBe("boa");
    expect(aderencia6118("inferior", 80, 4)).toBe("boa");
  });
  it("h = 50 < 60: barra superior a 50 − 4 = 46 cm do fundo (> 30) → má", () => {
    expect(aderencia6118("superior", 50, 4)).toBe("ma");
  });
  it("h = 30: barra superior a 30 − 4 = 26 cm do fundo (≤ 30) → boa", () => {
    expect(aderencia6118("superior", 30, 4)).toBe("boa");
  });
  it("h = 34: 34 − 4 = 30 cm do fundo, no limite → boa; h = 35 → má", () => {
    expect(aderencia6118("superior", 34, 4)).toBe("boa");
    expect(aderencia6118("superior", 35, 4)).toBe("ma");
  });
  it("h = 70 ≥ 60: barra superior a 4 cm do topo (< 30) → má", () => {
    expect(aderencia6118("superior", 70, 4)).toBe("ma");
  });
});

// V1 T_DESCALC.BAS: DcAncoragem#(10, 0,15 tf/cm², 1,4, 5 tf/cm², 1,15) = 52,90 cm;
// fcd = 0,15/1,4 · 98,0665 = 10,507 MPa; τbu = 0,42 · 10,507^(2/3) = 2,0149 MPa;
// fyd = 5/1,15 · 98,0665 = 426,38 MPa; lb = 1,0/4 · 426,38/2,0149 = 52,90 cm.
describe("lb pela NB-1/78 (regra da V1)", () => {
  const MPA_POR_TFCM2 = 98.0665;
  const fck = 0.15 * MPA_POR_TFCM2;
  const v1: MateriaisCalc = {
    ...c25,
    fck,
    fcd: fck / 1.4,
    fyk: 5 * MPA_POR_TFCM2,
    fyd: (5 / 1.15) * MPA_POR_TFCM2,
  };
  it("φ10 boa aderência = 52,90 cm (V1)", () => {
    expect(ancoragemBasicaNb178(10, "boa", v1).lb).toBeCloseTo(52.9, 2);
  });
  it("proporcional a φ: φ20 / φ10 = 2 (V1)", () => {
    const r = ancoragemBasicaNb178(20, "boa", v1).lb / ancoragemBasicaNb178(10, "boa", v1).lb;
    expect(r).toBeCloseTo(2, 9);
  });
  it("φ10 superior, h = 50: má aderência, 1,5 · 52,90 = 79,357 cm (V1)", () => {
    const ad = aderenciaNb178("superior", 50);
    expect(ad).toBe("ma");
    expect(ancoragemBasicaNb178(10, ad, v1).lb).toBeCloseTo(79.357, 3);
  });
  it("φ10 superior, h = 25: boa aderência, 52,90 cm; h = 30 já é má (V1)", () => {
    expect(aderenciaNb178("superior", 25)).toBe("boa");
    expect(aderenciaNb178("superior", 30)).toBe("ma");
    expect(aderenciaNb178("inferior", 80)).toBe("boa");
  });
  it("φ16 má aderência = 1,5 · 84,647 = 126,971 cm (V1, negativo da viga de 2 tramos)", () => {
    expect(ancoragemBasicaNb178(16, "ma", v1).lb).toBeCloseTo(126.9713, 3);
  });
  it("lb,nec = lb, sem reduções (V1)", () => {
    const a = ancoragemBasicaNb178(10, "boa", v1);
    expect(ancoragemNecessariaNb178(a).lbNec).toBe(a.lb);
  });
});

describe("ganchos", () => {
  it("6118, barra φ12,5 CA-50: 8 φ + D/2 + φ = 10 + 3,125 + 1,25 = 14,375 cm (D = 5 φ, Tabela 9.1)", () => {
    expect(gancho6118(12.5, "CA-50")).toBeCloseTo(14.375, 9);
  });
  it("6118, barra φ20 CA-50: D = 8 φ → (8 + 4 + 1) · 2 = 26 cm", () => {
    expect(gancho6118(20, "CA-50")).toBeCloseTo(26, 9);
  });
  it("6118, estribo φ5: 2 · máx(5 φt = 2,5; 5 cm) = 10 cm; φ12,5: 2 · 6,25 = 12,5 cm", () => {
    expect(ganchosEstribo6118(5)).toBe(10);
    expect(ganchosEstribo6118(12.5)).toBeCloseTo(12.5, 9);
  });
  it("NB-1/78 (V1): barra 10 φ; estribo 2 · 10 φt (φ5 → 10 cm, T_DESCALC)", () => {
    expect(ganchoNb178(12.5)).toBeCloseTo(12.5, 9);
    expect(ganchosEstriboNb178(5)).toBeCloseTo(10, 9);
  });
});

// Barra lisa: C15, CA-25, φ10. fcd = 15/1,4 = 10,7143 MPa; fyd = 250/1,15 = 217,3913 MPa.
describe("barra lisa CA-25 (C15, φ10)", () => {
  const ca25: MateriaisCalc = {
    ...c25,
    fck: 15,
    fcd: 15 / 1.4,
    fyk: 250,
    fyd: 250 / 1.15,
    aco: "CA-25",
  };
  // Fiorin (1998, EESC-USP), item 5.1, p. 137 do PDF, citando a NBR 6118:1978:
  // ηb ≤ 1 (CA-25): τbu = 0,28 fcd^(1/2) = 0,28 · 3,27327 = 0,916515 MPa;
  // lb = 1,0/4 · 217,3913/0,916515 = 59,30 cm. Com a fórmula da barra nervurada
  // (0,42 · 10,7143^(2/3) = 0,42 · 4,86007 = 2,04123 MPa) daria 26,62 cm.
  it("NB-1/78: τbu = 0,28 √fcd = 0,9165 MPa → lb = 59,30 cm (não 26,62)", () => {
    const a = ancoragemBasicaNb178(10, "boa", ca25);
    expect(a.fbd).toBeCloseTo(0.916515, 5);
    expect(a.lb).toBeCloseTo(59.2983, 3);
  });
  it("NB-1/78, má aderência: 1,5 · 59,2983 = 88,95 cm", () => {
    expect(ancoragemBasicaNb178(10, "ma", ca25).lb).toBeCloseTo(88.9475, 3);
  });
  // 6118 (η1 = 1,0 para CA-25): fctd = 0,7 · 0,3 · 15^(2/3)/1,4 = 0,21 · 6,08220/1,4
  // = 0,912330 MPa; lb = 1,0/4 · 217,3913/0,912330 = 59,57 cm ≥ 25 φ = 25 cm
  it("6118: fbd = 0,9123 MPa → lb = 59,57 cm", () => {
    const a = ancoragemBasica6118(10, "boa", ca25);
    expect(a.fbd).toBeCloseTo(0.91233, 5);
    expect(a.lb).toBeCloseTo(59.5703, 3);
  });
  // 9.4.2.3: gancho semicircular, ponta reta 2 φ; D = 4 φ (Tabela 9.1, CA-25 φ < 20).
  // Pelo eixo: π (4 + 1)/2 · 1,0 + 2 · 1,0 = 7,854 + 2 = 9,854 cm; altura por fora
  // D + 2 φ = 6 cm.
  it("6118, gancho semicircular φ10 CA-25: π · 5/2 + 2 = 9,854 cm, altura 6 cm", () => {
    expect(gancho6118(10, "CA-25")).toBeCloseTo(9.85398, 4);
    expect(alturaGancho6118(10, "CA-25")).toBeCloseTo(6, 9);
    expect(alturaGancho6118(12.5, "CA-50")).toBeCloseTo(14.375, 9);
  });
});

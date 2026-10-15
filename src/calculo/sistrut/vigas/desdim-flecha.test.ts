// Flecha e fissuração do DESDIM contra fórmulas fechadas da resistência dos materiais
// (linha elástica de viga biapoiada e biengastada) e o estádio II montado à mão.
import { describe, expect, it } from "vitest";
import { qbInt } from "../base/f32";
import { PARAMETROS_DSP } from "../base/parametros";
import type { MateriaisSistrut } from "../base/tipos";
import { fissuracao, flechaEJ, flechaTramo, inerciaBruta, moduloEc } from "./desdim-flecha";

const p = PARAMETROS_DSP;
const mat: MateriaisSistrut = {
  fck: 0.15,
  fyk: 5,
  classeAco: "B",
  gamaF: 1.4,
  gamaC: 1.4,
  gamaS: 1.15,
};
const div = (p: number, d: number, f = 0) => ({ p, d, f, pAcidental: 0, fAcidental: 0 });

describe("EJ·f no ponto do M+ (S_113f7)", () => {
  const q = 1;
  const L = 5;
  it("biapoiada, carga uniforme, x = L/2: 5qL⁴/384", () => {
    const t = { vao: L, x: L / 2, ve: (q * L) / 2, mEsquerdo: 0, divisoes: [div(q, L)] };
    expect(flechaEJ(t, "corrigido")).toBeCloseTo((5 * q * L ** 4) / 384, 10);
  });
  it("a mesma carga em divisões (desconto da parte antes do início de cada uma)", () => {
    const esperado = (5 * q * L ** 4) / 384;
    const base = { vao: L, x: L / 2, ve: (q * L) / 2, mEsquerdo: 0 };
    expect(flechaEJ({ ...base, divisoes: [div(q, 2), div(q, L)] }, "corrigido")).toBeCloseTo(
      esperado,
      10,
    );
    expect(
      flechaEJ({ ...base, divisoes: [div(q, 1), div(q, 3), div(q, L)] }, "corrigido"),
    ).toBeCloseTo(esperado, 10);
  });
  it("biapoiada, concentrada P no meio: PL³/48", () => {
    const P = 2;
    const t = {
      vao: L,
      x: L / 2,
      ve: P / 2,
      mEsquerdo: 0,
      divisoes: [div(0, L / 2, P), div(0, L)],
    };
    expect(flechaEJ(t, "corrigido")).toBeCloseTo((P * L ** 3) / 48, 10);
  });
  it("biengastada, carga uniforme (Me = Md = −qL²/12): qL⁴/384", () => {
    const t = {
      vao: L,
      x: L / 2,
      ve: (q * L) / 2,
      mEsquerdo: (-q * L ** 2) / 12,
      divisoes: [div(q, L)],
    };
    expect(flechaEJ(t, "corrigido")).toBeCloseTo((q * L ** 4) / 384, 10);
  });
  it("flecha para cima vira 0", () => {
    const t = { vao: L, x: L / 2, ve: -1, mEsquerdo: 0, divisoes: [div(0, L / 2, -2), div(0, L)] };
    expect(flechaEJ(t, "corrigido")).toBe(0);
  });
});

describe("rigidez e flecha impressa", () => {
  it("Ec = 21·√(1000·0,15 + 35)·0,9 = 257,07 t/cm²; com k < 0, Ec = −k", () => {
    expect(moduloEc(mat, p, "corrigido")).toBeCloseTo(21 * Math.sqrt(185) * 0.9, 10);
    expect(moduloEc(mat, { ...p, multiplicadorEc: -300 }, "corrigido")).toBe(300);
  });
  it("inércia bruta: 20×50 → bh³/12; T 80×10 + 20×40 → 363 333 cm⁴ (yc = 17,5 do topo)", () => {
    expect(inerciaBruta({ bw: 20, h: 50, bf: 0, hf: 0, d: 46 }, "corrigido")).toBeCloseTo(
      (20 * 50 ** 3) / 12,
      8,
    );
    const t = (80 * 10 ** 3) / 12 + 800 * 12.5 ** 2 + (20 * 40 ** 3) / 12 + 800 * 12.5 ** 2;
    expect(inerciaBruta({ bw: 20, h: 50, bf: 80, hf: 10, d: 46 }, "corrigido")).toBeCloseTo(t, 6);
  });
  it("estádio I: INT(EJf·1e6/(Ec·I)·100)/100 = .01 cm na V1", () => {
    const ec = 21 * Math.sqrt(185) * 0.9;
    const f = flechaTramo(
      0.6645,
      { bw: 20, h: 50, bf: 0, hf: 0, d: 46 },
      ec,
      1.6,
      false,
      1,
      1,
      "original",
    );
    expect(f.valor).toBeCloseTo(0.01, 6);
    expect(f.texto).toBe(" .01");
  });
  it("estádio II: EI = Ec·b·x³/3 + Es·As·(d − x)², x de b·x²/2 = n·As·(d − x)", () => {
    const ec = 21 * Math.sqrt(185) * 0.9;
    const n = 2100 / ec;
    const as = 1.6;
    const x = (-n * as + Math.sqrt((n * as) ** 2 + 2 * 20 * n * as * 46)) / 20;
    const ei = (ec * 20 * x ** 3) / 3 + 2100 * as * (46 - x) ** 2;
    const f = flechaTramo(
      0.6645,
      { bw: 20, h: 50, bf: 0, hf: 0, d: 46 },
      ec,
      as,
      true,
      1,
      1,
      "corrigido",
    );
    expect(f.valor).toBe(qbInt((0.6645 * 1e8) / ei) / 100);
    expect(f.valor).toBe(0.11);
  });
});

describe("fissuração (L_21faa), estádio II à mão", () => {
  it("20×50, d 46, 2#10 (1,6 cm²), Mk 54,67 t·cm, φ10: w1, w2 e classe 3", () => {
    const ec = 21 * Math.sqrt(185) * 0.9;
    const n = 2100 / ec;
    const as = 1.6;
    const m = 54.67;
    const x = (-n * as + Math.sqrt((n * as) ** 2 + 2 * 20 * n * as * 46)) / 20;
    const ii = (20 * x ** 3) / 3 + n * as * (46 - x) ** 2;
    const sigma = (n * m * (46 - x)) / ii;
    const w1 = (((20 * 50) / as + 45) / (2.25 * 2100)) * 10 * sigma;
    const w2 = (10 / (2.25 * 2100 * 0.015)) * 3 * sigma ** 2;
    const r = fissuracao(m, { bw: 20, h: 50, bf: 0, hf: 0, d: 46 }, as, 10, mat, p, "corrigido");
    expect(r.w1).toBeCloseTo(w1, 10);
    expect(r.w2).toBeCloseTo(w2, 10);
    expect(r.limite).toBe(3);
    expect(r.ok).toBe(true);
  });
  it("ftk acima de fck 0,18: 0,06·fck + 0,007; falha só quando w1 e w2 passam da classe", () => {
    const r = fissuracao(
      5000,
      { bw: 20, h: 50, bf: 0, hf: 0, d: 46 },
      1.6,
      10,
      { ...mat, fck: 0.25 },
      p,
      "corrigido",
    );
    expect(r.w1).toBeGreaterThan(3);
    expect(r.w2).toBeGreaterThan(3);
    expect(r.ok).toBe(false);
  });
});

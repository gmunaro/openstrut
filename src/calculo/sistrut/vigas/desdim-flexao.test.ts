// Flexão do DESDIM contra contas à mão (equilíbrio da seção com o bloco 0,8x·0,85fcd e
// o diagrama do aço), não contra a própria função. Os casos T, mesa e dupla não
// aparecem no oráculo (CHECKLIST da família DESENHO: "seção T, armadura dupla não").
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import type { MateriaisSistrut } from "../base/tipos";
import { flexaoSecao, taxaArmaduraMinima, tensaoAco, xiLimite } from "./desdim-flexao";

const B: MateriaisSistrut = {
  fck: 0.15,
  fyk: 5,
  classeAco: "B",
  gamaF: 1.4,
  gamaC: 1.4,
  gamaS: 1.15,
};
const A: MateriaisSistrut = { ...B, classeAco: "A" };
const fcd = 0.15 / 1.4;
const fyd = 5 / 1.15;

/** Raiz de f em [a, b] por bisseção. */
function bissecao(f: (x: number) => number, a: number, b: number) {
  let lo = a;
  let hi = b;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (Math.sign(f(m)) === Math.sign(f(lo))) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** σ do aço B pela curva ε = σ/Es + (σ/fyd − 0,7)²/45, resolvida por bisseção. */
const sigmaCurvaB = (eps: number) =>
  bissecao((s) => s / 2100 + (s / fyd - 0.7) ** 2 / 45 - eps, 0.7 * fyd, fyd);

describe("ξlim truncado em 3 casas (DESDIM.BAS:3678; U04-006: 0,6283663 A e 0,4623514 B)", () => {
  it("CA-50 B: 3,5/(3,5 + 2,0704 + 2) = 0,46235 → 0,462", () => {
    expect(xiLimite(B, 1, "corrigido")).toBe(0.462);
    expect(xiLimite({ ...B, gamaS: sng(1.15) }, 1, "original")).toBe(sng(0.462));
  });
  it("CA-50 A: 3,5/(3,5 + 2,0704) = 0,62834 → 0,628", () => {
    expect(xiLimite(A, 1, "corrigido")).toBe(0.628);
  });
});

describe("tensão no aço (L_18c00) e R8", () => {
  it("aço A: original ε·2100/γs no trecho elástico; corrigido Es·ε; acima de εyd, fyd", () => {
    expect(tensaoAco(0.001, A, 1, "corrigido")).toBeCloseTo(2.1, 12);
    expect(tensaoAco(0.001, A, 1, "original")).toBeCloseTo(2.1 / 1.15, 6);
    expect(tensaoAco(0.003, A, 1, "corrigido")).toBeCloseTo(fyd, 12);
    expect(tensaoAco(0.003, A, 1, "original")).toBeCloseTo(fyd, 6);
  });
  it("aço B: elástico até 0,7·fyd/Es (com a mesma diferença do R8), curva, fyd além de εyd + 2‰", () => {
    expect(tensaoAco(0.001, B, 1, "corrigido")).toBeCloseTo(2.1, 12);
    expect(tensaoAco(0.001, B, 1, "original")).toBeCloseTo(2.1 / 1.15, 6);
    expect(tensaoAco(0.003, B, 1, "corrigido")).toBeCloseTo(sigmaCurvaB(0.003), 9);
    expect(tensaoAco(0.003, B, 1, "original")).toBeCloseTo(sigmaCurvaB(0.003), 5);
    expect(tensaoAco(0.005, B, 1, "corrigido")).toBeCloseTo(fyd, 12);
  });
  it("R8: no corrigido a curva B começa em 0,7·fyd, sem o salto do original", () => {
    const eps = (0.7 * fyd) / 2100;
    expect(tensaoAco(eps * 0.999999, B, 1, "corrigido")).toBeCloseTo(0.7 * fyd, 5);
    expect(tensaoAco(eps * 1.000001, B, 1, "corrigido")).toBeCloseTo(0.7 * fyd, 4);
    expect(tensaoAco(eps * 0.999999, B, 1, "original")).toBeCloseTo((0.7 * fyd) / 1.15, 4);
  });
});

describe("flexão de seção (L_183ad), modo corrigido (float64) contra o equilíbrio", () => {
  const ret = { bw: 20, h: 50, bf: 0, hf: 0, d: 46 };

  it("retangular, M = 97,2 t·cm (apoio da V1): γf·M = 0,68·b·d²·fcd·ξ(1 − 0,4ξ)", () => {
    const m = 97.2;
    const xi = bissecao((x) => 0.68 * 20 * 46 ** 2 * fcd * x * (1 - 0.4 * x) - 1.4 * m, 0, 0.5);
    const r = flexaoSecao(m, ret, B, 1, "corrigido");
    expect(r.ramo).toBe("alma");
    expect(r.xd).toBeCloseTo(xi, 9);
    expect(r.as).toBeCloseTo((0.68 * 20 * xi * 46 * fcd) / fyd, 9);
    expect(r.asc).toBe(0);
  });

  it("modo original no mesmo caso: SINGLE, até 1e-5 da conta exata", () => {
    const r = flexaoSecao(
      sng(97.2),
      ret,
      { ...B, fck: sng(0.15), gamaF: sng(1.4), gamaC: sng(1.4), gamaS: sng(1.15) },
      1,
      "original",
    );
    const xi = bissecao((x) => 0.68 * 20 * 46 ** 2 * fcd * x * (1 - 0.4 * x) - 1.4 * 97.2, 0, 0.5);
    expect(Math.abs(r.xd - xi)).toBeLessThan(1e-5);
  });

  it("seção T com a linha neutra na mesa: retangular de largura bf", () => {
    const t = { bw: 20, h: 50, bf: 80, hf: 10, d: 46 };
    const m = 1000;
    const xi = bissecao((x) => 0.68 * 80 * 46 ** 2 * fcd * x * (1 - 0.4 * x) - 1.4 * m, 0, 0.5);
    expect(0.8 * xi * 46).toBeLessThan(10);
    const r = flexaoSecao(m, t, B, 1, "corrigido");
    expect(r.ramo).toBe("mesa");
    expect(r.xd).toBeCloseTo(xi, 9);
    expect(r.as).toBeCloseTo((0.68 * 80 * xi * 46 * fcd) / fyd, 9);
  });

  it("seção T com a linha neutra na alma: abas 0,85·fcd·(bf − bw)·hf mais a alma", () => {
    const t = { bw: 20, h: 50, bf: 80, hf: 10, d: 46 };
    const m = 2300;
    const abas = 0.85 * fcd * 60 * 10;
    const xi = bissecao(
      (x) => abas * (46 - 5) + 0.68 * 20 * 46 ** 2 * fcd * x * (1 - 0.4 * x) - 1.4 * m,
      0,
      0.462,
    );
    const r = flexaoSecao(m, t, B, 1, "corrigido");
    expect(r.ramo).toBe("alma");
    expect(r.xd).toBeCloseTo(xi, 9);
    expect(r.as).toBeCloseTo((abas + 0.68 * 20 * xi * 46 * fcd) / fyd, 9);
  });

  it("armadura dupla, retangular, M = 2000 t·cm: x = ξlim·d, d' = h − d, aviso de 1,4·Mlim", () => {
    const xi = 0.462;
    const mLim = (0.68 * 20 * 46 ** 2 * fcd * xi * (1 - 0.4 * xi)) / 1.4;
    const asLim = (0.68 * 20 * xi * 46 * fcd) / fyd;
    const dm = 2000 - mLim;
    const epsS = 0.0035 / xi - 0.0035; // 4,076‰ > εyd + 2‰ = 4,070‰ → fyd
    const epsC = ((xi * 46 - 4) / (xi * 46)) * 0.0035; // na curva do aço B
    const r = flexaoSecao(2000, ret, B, 1, "corrigido");
    expect(r.ramo).toBe("dupla");
    expect(r.xd).toBe(xi);
    expect(r.acimaDoLimite).toBe(true);
    expect(epsS).toBeGreaterThan(fyd / 2100 + 0.002);
    expect(r.as).toBeCloseTo(asLim + (1.4 * dm) / (42 * fyd), 9);
    expect(r.asc).toBeCloseTo((1.4 * dm) / (42 * sigmaCurvaB(epsC)), 8);
  });

  it("armadura dupla em T acima do limite da seção T", () => {
    const t = { bw: 20, h: 50, bf: 80, hf: 10, d: 46 };
    const xi = 0.462;
    const abas = 0.85 * fcd * 60 * 10;
    const mLimT = (abas * 41 + 0.68 * 20 * 46 ** 2 * fcd * xi * (1 - 0.4 * xi)) / 1.4;
    const r = flexaoSecao(3000, t, B, 1, "corrigido");
    expect(r.ramo).toBe("dupla");
    expect(r.acimaDoLimite).toBe(false); // 3000 < 1,4·Mlim,T = 3401
    expect(r.as).toBeCloseTo(
      (abas + 0.68 * 20 * xi * 46 * fcd) / fyd + (1.4 * (3000 - mLimT)) / (42 * fyd),
      8,
    );
  });

  it("M = 0: x/d 0 e As 0 (o mínimo entra depois)", () => {
    const r = flexaoSecao(0, ret, B, 1, "corrigido");
    expect(r.xd).toBe(0);
    expect(r.as).toBe(0);
  });
});

describe("taxa de armadura mínima (item H)", () => {
  it("original: a do .DSP para qualquer aço; corrigido: 0,25 % com CA-25", () => {
    expect(taxaArmaduraMinima(0.0015, { ...A, fyk: 2.5 }, "original")).toBe(0.0015);
    expect(taxaArmaduraMinima(0.0015, { ...A, fyk: 2.549 }, "corrigido")).toBe(0.0025);
    expect(taxaArmaduraMinima(0.0015, B, "corrigido")).toBe(0.0015);
  });
});

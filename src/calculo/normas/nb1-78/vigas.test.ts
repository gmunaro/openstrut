// Casos de T_CALCCA.BAS, T_ARMADURA.BAS e T_VIGCALC.BAS (V1). Os materiais
// são os da V1 convertidos exatamente (1 tf/cm² = 98,0665 MPa): fck = 0,15
// tf/cm², fyk = 5 tf/cm², Es = 2100 tf/cm², γc = 1,4, γs = 1,15. Assim as
// áreas (cm²) esperadas são as dos testes da V1, sem mudança.
import { describe, expect, it } from "vitest";
import type { MateriaisCalc } from "../../tipos";
import {
  D_LINHA,
  momentoLimiteNb178,
  vigaCortanteNb178,
  vigaFlexaoNb178,
  xdLimiteNb178,
} from "./vigas";

const MPA_POR_TFCM2 = 98.0665;
const fck = 0.15 * MPA_POR_TFCM2;
const fyd = (5 / 1.15) * MPA_POR_TFCM2;
const es = 2100 * MPA_POR_TFCM2;
const mat: MateriaisCalc = {
  fck,
  fcd: fck / 1.4,
  sigmaCd: (0.85 * fck) / 1.4,
  fyk: 5 * MPA_POR_TFCM2,
  fyd,
  fywd: fyd,
  ecs: 0,
  es,
  aco: "CA-50",
  acoEstribo: "CA-50",
};
// mesmas grandezas em tf e cm, para as contas de referência
const fcdT = 0.15 / 1.4;
const fydT = 5 / 1.15;
/** tf·cm → kN·m */
const knm = (tfcm: number) => (tfcm * 9.80665) / 100;
/** tf → kN */
const kn = (tf: number) => tf * 9.80665;

describe("x/d e Md limite", () => {
  it("x/d limite CA-50 = 0,0035 / (0,0035 + fyd/Es) (T_CALCCA)", () => {
    expect(xdLimiteNb178(mat)).toBeCloseTo(0.0035 / (0.0035 + fydT / 2100), 9);
  });
  it("Md limite recalculado (T_ARMADURA)", () => {
    const xl = (0.0035 * 45) / (0.0035 + fydT / 2100);
    const mdLim = 0.85 * fcdT * 20 * 0.8 * xl * (45 - 0.4 * xl);
    expect(momentoLimiteNb178(20, 45, mat)).toBeCloseTo(knm(mdLim), 9);
  });
});

describe("vigaFlexaoNb178: armadura simples", () => {
  // b = 100, d = 8, h = 10 (As,min = 1,5 cm² não governa), Md = 70 tf·cm
  const r = vigaFlexaoNb178(knm(70), 100, 10, 8, mat);
  const x = r.xd * 8;
  it("valor de referência As = 2,1505 cm² (T_CALCCA)", () => {
    expect(r.as).toBeCloseTo(2.1505, 3);
    expect(r.asComprimida).toBe(0);
    expect(r.avisos).toEqual([]);
  });
  it("equilíbrio de forças e de momentos (T_CALCCA)", () => {
    expect(0.85 * fcdT * 100 * 0.8 * x).toBeCloseTo(r.as * fydT, 9);
    expect(r.as * fydT * (8 - 0.4 * x)).toBeCloseTo(70, 9);
  });
  it("momento nulo → As 0 (T_CALCCA, T_ARMADURA)", () => {
    const z = vigaFlexaoNb178(0, 100, 10, 8, mat);
    expect(z.as).toBe(0);
    expect(z.asComprimida).toBe(0);
  });
  it("logo abaixo do limite (0,999 Md,lim) resolve sem armadura dupla (T_CALCCA)", () => {
    const s = vigaFlexaoNb178(0.999 * momentoLimiteNb178(100, 8, mat), 100, 10, 8, mat);
    expect(s.as).toBeGreaterThan(0);
    expect(s.asComprimida).toBe(0);
    expect(s.xd).toBeLessThanOrEqual(xdLimiteNb178(mat));
  });
  it("sinal do momento é ignorado (negativo de apoio)", () => {
    expect(vigaFlexaoNb178(-knm(70), 100, 10, 8, mat).as).toBeCloseTo(2.1505, 3);
  });
  it("As,min = 0,15 % bw·h prevalece em momento pequeno", () => {
    // 20 x 50: As,min = 1,5 cm²
    const s = vigaFlexaoNb178(1, 20, 50, 46, mat);
    expect(s.as).toBeCloseTo(1.5, 9);
  });
  it("CA-25: As,min = 0,25 % bw·h = 0,0025 · 20 · 50 = 2,5 cm² (pendencias.md item 7)", () => {
    const s = vigaFlexaoNb178(1, 20, 50, 46, { ...mat, aco: "CA-25" });
    expect(s.as).toBeCloseTo(2.5, 9);
  });
  it("biapoiada da V1 (q = 2 tf/m, L = 5 m, 20 x 50, d = 46): As = flexão de 1,4 M (T_VIGCALC)", () => {
    // Md = 1,4 · 6,25 tf·m = 875 tf·cm; referência por conta à mão:
    // r = 875 / (0,425·20·46²·fcd); x = 1,25·46·(1 − √(1 − r)); As = 875 / (fyd (46 − 0,4 x))
    const rr = 875 / (0.425 * 20 * 46 * 46 * fcdT);
    const xx = 1.25 * 46 * (1 - Math.sqrt(1 - rr));
    const asRef = 875 / (fydT * (46 - 0.4 * xx));
    expect(asRef).toBeCloseTo(5.032, 3); // r = 0,4541; x = 15,01 cm
    expect(vigaFlexaoNb178(knm(875), 20, 50, 46, mat).as).toBeCloseTo(asRef, 9);
  });
});

describe("vigaFlexaoNb178: armadura dupla (d' = 3,5 cm)", () => {
  // bw = 20, d = 45, h = 50; referências por equilíbrio (T_ARMADURA, com d' = 3,5 da V1)
  const bw = 20;
  const d = 45;
  const dl = D_LINHA;
  const xl = (0.0035 * d) / (0.0035 + fydT / 2100);
  const mdLim = 0.85 * fcdT * bw * 0.8 * xl * (d - 0.4 * xl);
  const as1 = mdLim / (fydT * (d - 0.4 * xl));

  it("d' é 3,5 cm como ARM_DL e DIM_DL da V1", () => {
    expect(D_LINHA).toBe(3.5);
  });
  it("Md = 1,5 Md,lim: As' = 0,5 Md,lim / (fyd (d − d')) e As = As1 + As' (T_ARMADURA)", () => {
    const md = 1.5 * mdLim;
    const r = vigaFlexaoNb178(knm(md), bw, 50, d, mat);
    const asLin = (0.5 * mdLim) / (fydT * (d - dl));
    expect(r.asComprimida).toBeCloseTo(asLin, 9);
    expect(r.as).toBeCloseTo(as1 + asLin, 9);
    expect(r.xd).toBeCloseTo(xl / d, 9);
    // forças: (As − As') fyd = 0,85 fcd b 0,8 x; momentos: Cc (d − 0,4x) + As' fyd (d − d') = Md
    expect((r.as - r.asComprimida) * fydT).toBeCloseTo(0.85 * fcdT * bw * 0.8 * xl, 9);
    expect(
      0.85 * fcdT * bw * 0.8 * xl * (d - 0.4 * xl) + r.asComprimida * fydT * (d - dl),
    ).toBeCloseTo(md, 6);
    expect(r.avisos.join(" ")).toMatch(/armadura dupla/);
  });
  it("Md = 0,6 Md,lim: armadura simples, As' = 0, Cc (d − 0,4x) = Md (T_ARMADURA)", () => {
    const md = 0.6 * mdLim;
    const r = vigaFlexaoNb178(knm(md), bw, 50, d, mat);
    expect(r.asComprimida).toBe(0);
    const x = (r.as * fydT) / (0.85 * fcdT * bw * 0.8);
    expect(r.as * fydT * (d - 0.4 * x)).toBeCloseTo(md, 6);
  });
  it("1,01 Md,lim (a V1 CcaAsFlexao recusava): passa a armadura dupla (T_CALCCA)", () => {
    const r = vigaFlexaoNb178(1.01 * momentoLimiteNb178(100, 8, mat), 100, 10, 8, mat);
    expect(r.asComprimida).toBeGreaterThan(0);
  });
  it("CA-60, 20x20, d = 15, Md = 30 kN·m: ε's = 2,10‰ < εyd = 2,48‰ → σ's = 441,8 MPa (conta à mão, V1 ArmAsLinha)", () => {
    // fcd = 20/1,4; fyd = 600/1,15 = 521,7 MPa; x/d lim = 3,5/(3,5 + 2,4845) = 0,5848; x = 8,773 cm
    // ε's = 3,5‰ · (8,773 − 3,5)/8,773 = 2,1036‰; σ's = 210 000 · 0,0021036 = 441,76 MPa
    // Md,lim = 0,85 · 1,4286 · 20 · 0,8 · 8,773 · (15 − 3,509) = 1958,5 kN·cm
    // As' = (3000 − 1958,5) / (44,176 · 11,5) = 2,050 cm² (com fyd daria 1,736)
    // As = 1958,5 / (52,174 · 11,491) + 1041,5 / (52,174 · 11,5) = 3,2667 + 1,7358 = 5,0026 cm²
    const ca60: MateriaisCalc = {
      fck: 20,
      fcd: 20 / 1.4,
      sigmaCd: (0.85 * 20) / 1.4,
      fyk: 600,
      fyd: 600 / 1.15,
      fywd: 600 / 1.15,
      ecs: 0,
      es: 210000,
      aco: "CA-60",
      acoEstribo: "CA-60",
    };
    const r = vigaFlexaoNb178(30, 20, 20, 15, ca60);
    expect(r.xd).toBeCloseTo(0.58485, 5);
    expect(
      r.memoria.find((e) => e.descricao === "Tensão na armadura comprimida")?.valor,
    ).toBeCloseTo(441.76, 2);
    expect(r.asComprimida).toBeCloseTo(2.05, 3);
    expect(r.as).toBeCloseTo(5.0026, 3);
  });
  it("d ≤ d' com armadura dupla: sem solução, NaN e aviso (T_ARMADURA)", () => {
    const r = vigaFlexaoNb178(knm(70), bw, 5, 3, mat);
    expect(r.as).toBeNaN();
    expect(r.avisos.join(" ")).toMatch(/sem solução/);
  });
});

describe("vigaCortanteNb178", () => {
  // bw = 20, d = 45, Vd = 10 tf; Asw,min = 0,0014·20·100 = 2,8 cm²/m
  it("ψ1 = 0,07 sem armadura longitudinal: Asw = 4,6184 cm²/m (T_CALCCA)", () => {
    const r = vigaCortanteNb178(kn(10), 20, 45, 0, mat);
    expect(r.asw).toBeCloseTo(4.6184, 3);
    expect(r.bielaOk).toBe(true);
    expect(r.avisos).toEqual([]);
  });
  it("ρ1 = 0,5 % (As = 4,5 cm²) → ψ1 = 0,095: Asw = 4,1686 cm²/m (T_CALCCA)", () => {
    expect(vigaCortanteNb178(kn(10), 20, 45, 4.5, mat).asw).toBeCloseTo(4.1686, 3);
  });
  it("ρ1 = 2 % → ψ1 limitado a 0,14: Asw = 3,3591 cm²/m (T_CALCCA)", () => {
    expect(vigaCortanteNb178(kn(10), 20, 45, 18, mat).asw).toBeCloseTo(3.3591, 3);
  });
  it("biela esmagada (Vd = 100 tf) → bielaOk = false com aviso (T_CALCCA)", () => {
    // τwd = 100/900 = 0,111 tf/cm² > τwu = 0,25·0,10714 = 0,0268 tf/cm²
    const r = vigaCortanteNb178(kn(100), 20, 45, 0, mat);
    expect(r.bielaOk).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/Biela/);
  });
  it("cortante baixo (Vd = 1 tf): τd = 0, vale o mínimo 2,8 cm²/m (T_CALCCA)", () => {
    const r = vigaCortanteNb178(kn(1), 20, 45, 0, mat);
    expect(r.asw).toBeCloseTo(2.8, 9);
    expect(r.memoria.find((e) => e.descricao === "Estribos calculados")?.valor).toBe(0);
  });
  it("τwu limitado a 4,5 MPa com fck alto", () => {
    // fck 50 MPa: 0,25 fcd = 8,9 MPa → 4,5 MPa; bw 20, d 45: Vd = 4,6 MPa·900 cm² = 414 kN
    const alto = { ...mat, fck: 50, fcd: 50 / 1.4 };
    expect(vigaCortanteNb178(414, 20, 45, 0, alto).bielaOk).toBe(false);
    expect(vigaCortanteNb178(400, 20, 45, 0, alto).bielaOk).toBe(true);
  });
  it("smáx = min(0,5 d; 30 cm) (V1 VcDimensiona, DIM_EST_S_MAX): d = 45 → 22,5; d = 75 → 30", () => {
    expect(vigaCortanteNb178(kn(10), 20, 45, 0, mat).sMax).toBe(22.5);
    expect(vigaCortanteNb178(kn(10), 20, 75, 0, mat).sMax).toBe(30);
  });
});

describe("aço classe B (T_CALCCA.BAS:52-64, T_ARMADURA.BAS:45-58)", () => {
  // εyd: A = fyd/Es = 2,0704‰ → x/d lim = 3,5/5,5704 = 0,62832;
  //      B = fyd/Es + 2‰ = 4,0704‰ → x/d lim = 3,5/7,5704 = 0,46233
  it("x/d limite CA-50: A 0,62832 (padrão), B 0,46233", () => {
    expect(xdLimiteNb178(mat)).toBeCloseTo(0.62832, 4);
    expect(xdLimiteNb178(mat, "A")).toBeCloseTo(0.62832, 4);
    expect(xdLimiteNb178(mat, "B")).toBeCloseTo(0.46233, 4);
  });
  // 20 × 45 com x/d = 0,55: Md = 0,0728571·20·24,75·35,1 = 1265,856 tf·cm
  it("classe A, x/d = 0,55: armadura simples As = 1265,856/(fyd·35,1) = 8,2948 cm²", () => {
    const r = vigaFlexaoNb178(knm(1265.856), 20, 50, 45, mat);
    expect(r.asComprimida).toBe(0);
    expect(Math.abs(r.as / 8.2948 - 1)).toBeLessThanOrEqual(1e-4);
  });
  // classe B: xl = 0,46233·45 = 20,8047; Md,lim = 1111,914 tf·cm; ε's = 3,5‰·(xl − 3,5)/xl
  // = 2,9112‰ < εyd(B) → σ's = 4,16241 tf/cm² (bissecção própria da V1);
  // As = Md,lim/(fyd (d − 0,4 xl)) + (Md − Md,lim)/(fyd (d − d')) = 7,82573 cm²;
  // As' = (Md − Md,lim)/(σ's (d − d')) = 0,89118 cm² (classe A daria 0,85316)
  it("classe B, mesma seção: armadura dupla As = 7,82573 e As' = 0,89118 cm²", () => {
    const r = vigaFlexaoNb178(knm(1265.856), 20, 50, 45, mat, "B");
    expect(r.xd).toBeCloseTo(0.46233, 4);
    expect(Math.abs(r.as / 7.82573 - 1)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(r.asComprimida / 0.89118 - 1)).toBeLessThanOrEqual(2e-4);
    // equilíbrio: As fyd = 0,85 fcd b 0,8 xl + As' σ's
    expect(r.as * fydT).toBeCloseTo(
      0.85 * fcdT * 20 * 0.8 * 20.80473 + r.asComprimida * 4.162411,
      3,
    );
  });
});

describe("armadura dupla em VcDimensiona e limite de 4 % Ac (T_VIGCALC.BAS:173-191)", () => {
  // 20 × 50, d = 46, classe A: xl = 28,9028; Md,lim = 1450,41 tf·cm. Mk = 12 tf·m →
  // Md = 1680 tf·cm; σ's = fyd; As = 9,6866 + 1,2425 = 10,9290; As' = 1,2425 cm²
  it("Md = 1680 tf·cm: As = 10,92905 cm², As' = 1,2425 cm²", () => {
    const r = vigaFlexaoNb178(knm(1680), 20, 50, 46, mat);
    expect(Math.abs(r.as / 10.92905 - 1)).toBeLessThanOrEqual(1e-4);
    expect(r.asComprimida).toBeCloseTo(1.2425, 3);
    expect(r.avisos.join(" ")).not.toMatch(/insuficiente/);
  });
  // Mk = 60 tf·m → Md = 8400 tf·cm: As = 47,30 e As' = 37,61; soma 84,9 > 4 %·1000 = 40 cm²
  it("Md = 8400 tf·cm: As + As' = 84,9 > 40 cm² → seção insuficiente (NaN)", () => {
    const r = vigaFlexaoNb178(knm(8400), 20, 50, 46, mat);
    expect(r.as).toBeNaN();
    expect(r.asComprimida).toBeNaN();
    expect(r.avisos.join(" ")).toMatch(/seção insuficiente/);
  });
});

describe("estribo mínimo pelo aço (T_VIGCALC.BAS:192-198, T_CALCCA.BAS:47-50)", () => {
  it("CA-25: ρw,min = 0,25 % → 0,0025·20·100 = 5 cm²/m; CA-50: 0,14 % → 2,8 cm²/m", () => {
    const ca25 = { ...mat, acoEstribo: "CA-25" as const, fywd: (2.5 / 1.15) * MPA_POR_TFCM2 };
    expect(vigaCortanteNb178(kn(0.5), 20, 46, 0, ca25).asw).toBeCloseTo(5, 9);
    expect(vigaCortanteNb178(kn(0.5), 20, 46, 0, mat).asw).toBeCloseTo(2.8, 9);
  });
  it("CA-60: 0,14 %", () => {
    expect(vigaCortanteNb178(kn(0.5), 20, 46, 0, { ...mat, acoEstribo: "CA-60" }).asw).toBeCloseTo(
      2.8,
      9,
    );
  });
});

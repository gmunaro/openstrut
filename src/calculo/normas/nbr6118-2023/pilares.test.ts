// Pilares pela NBR 6118:2023. Valores esperados de duas origens:
// - exemplos resolvidos de Bastos, "Flexão composta e pilares de concreto armado"
//   (UNESP, jun/2024), página impressa no cabeçalho: "Bastos p. X";
// - contas à mão, escritas no próprio teste.
// Convenção da entrada: b = lado na direção x (hx da apostila), h = lado em y (hy).
// A apostila trabalha em kN·cm; aqui kN·m (÷ 100).
import { describe, expect, it } from "vitest";
import type { Materiais } from "../../../dominio/obra";
import type { PilarEntrada, PilarResultado } from "../../tipos";
import { armaduraSimetricaPR } from "../../pilares/secaoParabolaRetangulo";
import { materiais6118 } from "./materiais";
import { areaBarra } from "../../barras";
import { excentricidadeAcidental, excentricidadeFluencia } from "../../pilares/pilarPadraoMN";
import {
  alfaB,
  armaduraObliqua6118,
  arranjoPilar6118,
  espacamentoMaximoLongitudinal,
  curvaturaAproximada,
  esbeltez,
  esbeltezLimite,
  estriboPilar,
  gamaN,
  momentoMinimo,
  momentoSegundaOrdem,
  pilar6118,
} from "./pilares";

const mat = (fck: number, aco: Materiais["aco"] = "CA-50") =>
  materiais6118({
    fck,
    aco,
    acoEstribo: "CA-50",
    classeAco: "A",
    caa: 2,
    cobrimentoLaje: 2.5,
    cobrimentoViga: 3,
    cobrimentoPilar: 3,
  });

const pilar = (p: Partial<PilarEntrada>): PilarEntrada => ({
  nome: "P1",
  b: 20,
  h: 40,
  lex: 3,
  ley: 3,
  nk: 600,
  mxTopo: 0,
  mxBase: 0,
  myTopo: 0,
  myBase: 0,
  ...p,
});

const etapa = (r: PilarResultado, descricao: string) =>
  r.memoria.find((m) => m.descricao === descricao)?.valor;

describe("funções da norma (contas à mão)", () => {
  it("γn = 1,95 − 0,05·b: 1,25 em 14 cm, 1,20 em 15 cm, 1 a partir de 19 cm (Tabela 13.1)", () => {
    expect(gamaN(14)).toBeCloseTo(1.25, 9);
    expect(gamaN(15)).toBeCloseTo(1.2, 9);
    expect(gamaN(19)).toBe(1);
    expect(gamaN(40)).toBe(1);
  });
  it("λ = 3,46·280/20 = 48,44", () => {
    expect(esbeltez(2.8, 20)).toBeCloseTo(48.44, 9);
  });
  it("M1d,min = 1400·(0,015 + 0,03·0,20) = 29,4 kN·m (Bastos p. 80: 2.940 kN·cm)", () => {
    expect(momentoMinimo(1400, 20)).toBeCloseTo(29.4, 9);
  });
  it("αb = 0,6 + 0,4·2000/3500 = 0,8286 (Bastos p. 112: 0,83)", () => {
    expect(alfaB(35, 20)).toBeCloseTo(0.828571, 5);
  });
  it("αb limitado a 0,4 em curvatura dupla (MB = −MA → 0,2) e 1 sem momento", () => {
    expect(alfaB(10, -10)).toBe(0.4);
    expect(alfaB(-10, 10)).toBe(0.4);
    expect(alfaB(0, 0)).toBe(1);
  });
  it("λ1 = (25 + 12,5·4,17/15)/0,83 = 34,3 → 35 (Bastos p. 112)", () => {
    expect(esbeltezLimite(35 / 8.4, 15, alfaB(35, 20))).toBe(35);
  });
  it("λ1 = (25 + 12,5·2,5/30)/0,4 = 65,104 e teto de 90", () => {
    expect(esbeltezLimite(2.5, 30, 0.4)).toBeCloseTo(65.1042, 3);
    expect(esbeltezLimite(30, 20, 0.4)).toBe(90);
  });
  it("1/r = 0,005/(20·1,15) = 2,1739e-4 /cm; com ν < 0,5 vale o teto 0,005/h", () => {
    expect(curvaturaAproximada(0.65, 20)).toBeCloseTo(2.1739e-4, 8);
    expect(curvaturaAproximada(0.2, 20)).toBeCloseTo(2.5e-4, 12);
  });
  it("M2d = 1400·280²/10·2,1739e-4 = 23,80 kN·m (Bastos p. 81: e2 = 1,70 cm, 2.380 kN·cm)", () => {
    expect(momentoSegundaOrdem(1400, 2.8, 2.1739e-4)).toBeCloseTo(23.861, 2);
  });
  it("estribo: φ 16 → φt 5, s = min(20; 15; 19,2) = 15; CA-25 usa 24φ", () => {
    expect(estriboPilar(16, 15, "CA-50")).toEqual({ phi: 5, espacamento: 15 });
    expect(estriboPilar(10, 30, "CA-50")).toEqual({ phi: 5, espacamento: 12 });
    expect(estriboPilar(10, 30, "CA-25")).toEqual({ phi: 5, espacamento: 20 });
    // φ 25: φ/4 = 6,25 → 6,3 mm
    expect(estriboPilar(25, 30, "CA-50")).toEqual({ phi: 6.3, espacamento: 20 });
  });
});

// Bastos p. 79-82: pilar intermediário 20 × 50, C30, Nk = 1000 kN, le = 280 cm, d' = 4 cm.
describe("Bastos p. 79-82: pilar intermediário 20 × 50", () => {
  const r = pilar6118(pilar({ b: 50, h: 20, lex: 2.8, ley: 2.8, nk: 1000 }), mat(30), 4);
  it("Nd = 1,0·1,4·1000 = 1400 kN; λx = 19,4, λy = 48,4", () => {
    expect(r.nd).toBeCloseTo(1400, 9);
    expect(r.lambdaX).toBeCloseTo(19.4, 1);
    expect(r.lambdaY).toBeCloseTo(48.4, 1);
    expect(r.avisos).toEqual([]);
  });
  it("Md,tot,x = M1d,min,x = 4.200 kN·cm (sem 2ª ordem: λx < λ1 = 35)", () => {
    expect(r.mdX).toBeCloseTo(42, 2);
  });
  it("Md,tot,y = 2.940 + 2.380 = 5.320 kN·cm (ν = 0,65 arredondado na apostila)", () => {
    expect(r.mdY).toBeCloseTo(53.2, 1);
  });
  it("As do ábaco A-4 de Venturini = 10,84 cm² (ω = 0,22), tolerância 5%", () => {
    // Com ν = 0,65 a linha neutra fica em x ≈ 16 cm (h = 20) e o braço do concreto é
    // sensível ao diagrama: o bloco retangular da V1 (flexaoComposta.ts) dava 9,42 (−13%).
    // Com a parábola-retângulo e o concreto sob as barras comprimidas descontado, a conta
    // independente (integração por faixas fora do app, Md = 53,19 kN·m do app) dá
    // 10,83 cm² (ω = 0,220); sem o desconto daria 10,38.
    expect(Math.abs(r.asNecessaria / 10.84 - 1)).toBeLessThan(0.05);
    expect(Math.abs(r.asNecessaria / 10.83 - 1)).toBeLessThan(0.01);
  });
});

// Bastos p. 95-97: pilar intermediário 14 × 30 (sobrado), C25, Nk = 220 kN, le = 280 cm, d' = 3 cm.
describe("Bastos p. 95-97: pilar 14 × 30 com γn = 1,25", () => {
  const r = pilar6118(pilar({ b: 30, h: 14, lex: 2.8, ley: 2.8, nk: 220 }), mat(25), 3);
  it("Nd = 1,25·1,4·220 = 385 kN e aviso de dimensão < 19 cm", () => {
    expect(r.nd).toBeCloseTo(385, 9);
    expect(r.avisos.some((a) => a.includes("< 19 cm"))).toBe(true);
  });
  it("λx = 32,3, λy = 69,2", () => {
    expect(r.lambdaX).toBeCloseTo(32.3, 1);
    expect(r.lambdaY).toBeCloseTo(69.2, 1);
  });
  it("Md,tot,x = M1d,min,x = 924 kN·cm; Md,tot,y = 739 + 1.064 = 1.803 kN·cm", () => {
    expect(r.mdX).toBeCloseTo(9.24, 2);
    expect(r.mdY).toBeCloseTo(18.03, 1);
  });
  it("As do ábaco A-4 (d'/h = 0,20) = 5,52 cm²: com d' = 2,8 cm, tolerância 5%", () => {
    // Conta independente (parábola-retângulo com desconto do concreto sob as barras,
    // fora do app): 5,528 cm² com d' = 2,8 cm.
    const r20 = pilar6118(pilar({ b: 30, h: 14, lex: 2.8, ley: 2.8, nk: 220 }), mat(25), 2.8);
    expect(Math.abs(r20.asNecessaria / 5.52 - 1)).toBeLessThan(0.05);
    expect(Math.abs(r20.asNecessaria / 5.528 - 1)).toBeLessThan(0.01);
  });
  it("com o d'/h real = 0,21 a armadura passa do ábaco (a favor da segurança)", () => {
    // Conta independente com d' = 3 cm: 5,831 cm².
    expect(r.asNecessaria).toBeGreaterThan(5.52);
    expect(Math.abs(r.asNecessaria / 5.831 - 1)).toBeLessThan(0.01);
  });
  it("barras par ≥ 4, φ ≥ 10 mm, área ≥ As", () => {
    expect(r.barras.phi).toBeGreaterThanOrEqual(10);
    expect(r.barras.n % 2).toBe(0);
    expect(r.barras.area).toBeGreaterThanOrEqual(r.asNecessaria);
  });
});

// Bastos p. 111-115: pilar de extremidade 15 × 40, C30, Nk = 500 kN, le = 280 cm, d' = 4 cm,
// M1d,A,x = 3.500 kN·cm e M1d,B,x = 2.000 kN·cm tracionando a mesma face. Os momentos
// da apostila já estão majorados por γn·γf = 1,2·1,4 = 1,68; a entrada é característica.
describe("Bastos p. 111-115: pilar de extremidade 15 × 40", () => {
  const r = pilar6118(
    pilar({ b: 15, h: 40, lex: 2.8, ley: 2.8, nk: 500, mxTopo: 35 / 1.68, mxBase: 20 / 1.68 }),
    mat(30),
    4,
  );
  it("Nd = 1,2·1,4·500 = 840 kN; λx = 64,6, λy = 24,2", () => {
    expect(r.nd).toBeCloseTo(840, 9);
    expect(r.lambdaX).toBeCloseTo(64.6, 1);
    expect(r.lambdaY).toBeCloseTo(24.2, 1);
  });
  it("αb,x = 0,83 e λ1,x = 35", () => {
    expect(etapa(r, "Coeficiente αb (x)")).toBeCloseTo(0.83, 2);
    expect(etapa(r, "Esbeltez-limite (x)")).toBe(35);
  });
  it("Md,tot,x = 2.900 + 1.907 = 4.807 kN·cm (seção C; Eq. 97 com valores arredondados: 4.814)", () => {
    // Conta exata: ν = 0,6533, 1/r = 2,8902e-4, M2d = 1.903 kN·cm; 2.900 + 1.903 = 4.803.
    expect(r.mdX).toBeGreaterThan(48.0);
    expect(r.mdX).toBeLessThan(48.15);
  });
  it("Md,tot,y = M1d,min,y = 2.268 kN·cm", () => {
    expect(r.mdY).toBeCloseTo(22.68, 2);
  });
  it("As do ábaco A-5 (d'/h = 0,25) = 24,83 cm²: com d' = 3,75 cm, tolerância 5%", () => {
    const r25 = pilar6118(
      pilar({ b: 15, h: 40, lex: 2.8, ley: 2.8, nk: 500, mxTopo: 35 / 1.68, mxBase: 20 / 1.68 }),
      mat(30),
      3.75,
    );
    expect(Math.abs(r25.asNecessaria / 24.83 - 1)).toBeLessThan(0.05);
  });
  it("com o d'/h real = 0,27 a armadura passa do ábaco A-5 (a favor da segurança)", () => {
    // A apostila usou o ábaco de d'/h = 0,25 para d'/h real = 0,27 (Bastos p. 115), o que
    // reduz a armadura. Conta independente com parábola-retângulo, desconto do concreto
    // sob as barras comprimidas e d'/h = 0,27 dá 28,78 cm² (com d' = 3,75: 25,47).
    expect(r.asNecessaria).toBeGreaterThan(24.83);
    expect(Math.abs(r.asNecessaria / 28.78 - 1)).toBeLessThan(0.01);
  });
  it("taxa > 4% gera aviso de emenda", () => {
    expect(r.avisos.some((a) => a.includes("> 4%"))).toBe(true);
  });
});

describe("casos com conta à mão", () => {
  it("pilar curto com momento acima do mínimo, curvatura dupla: sem 2ª ordem", () => {
    // 30 × 30, C25, le = 2,5 m, Nk = 800 → Nd = 1120 kN. Mx topo 20, base −10 kN·m →
    // M1d,A = 28, M1d,B = −14 kN·m. M1d,min = 1120·(0,015 + 0,009) = 26,88 kN·m < 28.
    // αb = 0,6 − 0,4·0,5 = 0,4; e1 = 2,5 cm; λ1 = (25 + 12,5·2,5/30)/0,4 = 65,10.
    // λ = 3,46·250/30 = 28,83 < λ1 → Md,x = 28; y sem momento: Md,y = 26,88.
    const r = pilar6118(
      pilar({ b: 30, h: 30, lex: 2.5, ley: 2.5, nk: 800, mxTopo: 20, mxBase: -10 }),
      mat(25),
      4,
    );
    expect(r.nd).toBeCloseTo(1120, 9);
    expect(r.lambdaX).toBeCloseTo(28.833, 3);
    expect(etapa(r, "Coeficiente αb (x)")).toBeCloseTo(0.4, 9);
    expect(etapa(r, "Esbeltez-limite (x)")).toBeCloseTo(65.104, 3);
    expect(etapa(r, "Momento de 2ª ordem (x)")).toBeUndefined();
    expect(r.mdX).toBeCloseTo(28, 9);
    expect(r.mdY).toBeCloseTo(26.88, 9);
    // As,min = 0,15·1120/43,478 = 3,864 cm² (> 0,4%·900 = 3,6)
    expect(r.asNecessaria).toBeGreaterThanOrEqual(3.864 - 1e-3);
  });

  it("M1d < M1d,min com λ1 < λ ≤ 90: αb = 1 e Md,tot = M1d,min + M2d", () => {
    // 20 × 40, C25, le = 3 m, Nk = 600 → Nd = 840 kN. Mx = 5 kN·m nas duas pontas →
    // M1d = 7 < M1d,min,x = 840·(0,015 + 0,006) = 17,64. αb = 1; e1 = 0,833 cm;
    // λ1 = 25 + 12,5·0,833/20 = 25,5 → 35 < λx = 51,9.
    // ν = 840/(800·1,7857) = 0,588; 1/r = 0,005/(20·1,088) = 2,29779e-4 /cm;
    // M2d = 840·300²/10·2,29779e-4 = 1737,1 kN·cm. Md,x = 17,64 + 17,371 = 35,011.
    // y: λy = 25,95 < 35, Md,y = 840·(0,015 + 0,012) = 22,68.
    const r = pilar6118(pilar({ mxTopo: 5, mxBase: 5 }), mat(25), 4);
    expect(etapa(r, "Coeficiente αb (x)")).toBe(1);
    expect(etapa(r, "Esbeltez-limite (x)")).toBe(35);
    expect(etapa(r, "Momento de 2ª ordem (x)")).toBeCloseTo(17.3713, 3);
    expect(r.mdX).toBeCloseTo(35.0113, 3);
    expect(r.mdY).toBeCloseTo(22.68, 9);
  });

  it("armadura mínima governa: 25 × 25, Nk = 300", () => {
    // Nd = 420 kN, M1d,min = 420·0,0225 = 9,45 kN·m; λ = 34,6 < 35.
    // Sem aço: 0,8x·25·15,18 = 420 kN → x = 13,83 cm; MR = 420·(12,5 − 0,4·13,83) = 29,3 kN·m
    // ≥ 9,45, logo As,face = 0. As,min = max(0,15·420/43,478 = 1,449; 0,004·625 = 2,5) = 2,5.
    // Barras: 4 φ 10 (3,14 cm²); estribo φ 5 c/ min(20; 25; 12) = 12 cm.
    const r = pilar6118(pilar({ b: 25, h: 25, lex: 2.5, ley: 2.5, nk: 300 }), mat(25), 4);
    expect(r.mdX).toBeCloseTo(9.45, 9);
    expect(r.asNecessaria).toBeCloseTo(2.5, 9);
    expect(r.barras.n).toBe(4);
    expect(r.barras.phi).toBe(10);
    expect(r.estribo).toEqual({ phi: 5, espacamento: 12 });
    expect(r.taxa).toBeCloseTo(((4 * Math.PI * 0.25) / 625) * 100, 6);
  });

  it("flexão oblíqua: cobre as duas flexões normais, e α = 1 pede mais aço que α = 1,2", () => {
    // Momento de 1ª ordem nas duas direções → oblíqua por situações (topo, base, C).
    // Aqui Md,tot,x vem da seção C (com M2d) e Md,tot,y do topo; cada um aparece numa
    // situação, logo a armadura não fica abaixo da flexão normal de nenhuma direção.
    // Com termos ≤ 1, a^1 + b^1 ≥ a^1,2 + b^1,2: α = 1 é a favor da segurança.
    const mt = mat(25);
    const r = pilar6118(pilar({ mxTopo: 20, mxBase: 10, myTopo: 30, myBase: -15 }), mt, 4);
    const t = { sigmaCd: mt.sigmaCd, fyd: mt.fyd, es: mt.es };
    const secaoX = { b: 40, h: 20, dl: 4 };
    const asMax = 0.04 * 800;
    const asx = armaduraSimetricaPR(r.nd, r.mdX, secaoX, t, asMax) ?? NaN;
    const asy = armaduraSimetricaPR(r.nd, r.mdY, { b: 20, h: 40, dl: 4 }, t, asMax) ?? NaN;
    expect(r.memoria.some((m) => m.descricao.includes("flexão oblíqua"))).toBe(true);
    expect(r.asNecessaria).toBeGreaterThanOrEqual(2 * Math.max(asx, asy) - 1e-6);
    const a10 = armaduraObliqua6118(r.nd, 30, 30, secaoX, t, asMax) ?? NaN;
    const a12 = armaduraObliqua6118(r.nd, 30, 30, secaoX, t, asMax, 1.2) ?? NaN;
    expect(a10).toBeGreaterThan(a12);
  });
});

describe("limites e avisos", () => {
  it("λ = 150 > 140: aviso e sem dimensionamento (15.8.1)", () => {
    // 20 × 40, lex = 30/3,46 m → λx = 3,46·(3000/3,46)/20 = 150
    const r = pilar6118(pilar({ lex: 30 / 3.46 }), mat(25), 4);
    expect(r.lambdaX).toBeCloseTo(150, 9);
    expect(r.asNecessaria).toBeNaN();
    expect(r.avisos.some((a) => a.includes("> 140"))).toBe(true);
  });
  it("λ = 92,3 com ν alto: sem equilíbrio no pilar-padrão acoplado, NaN e aviso", () => {
    // 15 × 40, lex = 4 m → λx = 3,46·400/15 = 92,3; Nd = 1,2·1,4·600 = 1008 kN,
    // ν = 1008/(600·1,786) = 0,94: nem 8% de Ac dá equilíbrio com fluência
    const r = pilar6118(pilar({ b: 15, lex: 4 }), mat(25), 4);
    expect(r.lambdaX).toBeCloseTo(92.27, 2);
    expect(r.asNecessaria).toBeNaN();
    expect(r.avisos.some((a) => a.includes("> 90"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("sem equilíbrio"))).toBe(true);
  });
  it("menor dimensão < 14 cm e área < 360 cm²: avisos", () => {
    const r = pilar6118(pilar({ b: 12, h: 25, lex: 1, ley: 1, nk: 100 }), mat(25), 3);
    expect(r.avisos.some((a) => a.includes("< 14 cm"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("360"))).toBe(true);
  });
  it("fck > 50: aviso de fora do escopo", () => {
    const r = pilar6118(pilar({}), mat(55), 4);
    expect(r.avisos.some((a) => a.includes("Grupo II"))).toBe(true);
  });
  it("Nk ≤ 0: sem dimensionamento", () => {
    const r = pilar6118(pilar({ nk: 0 }), mat(25), 4);
    expect(r.asNecessaria).toBeNaN();
    expect(r.avisos.length).toBeGreaterThan(0);
  });
  it("seção insuficiente: NaN e aviso de armadura máxima", () => {
    // 20 × 20, Nk = 2000 → Nd = 2800 kN > capacidade axial com 8%:
    // 15,18·(400 − 32)/10 + 32·420/10 = 1903 kN
    const r = pilar6118(pilar({ b: 20, h: 20, lex: 1, ley: 1, nk: 2000 }), mat(25), 4);
    expect(r.asNecessaria).toBeNaN();
    expect(r.avisos.some((a) => a.includes("8%"))).toBe(true);
  });
});

// Exemplos E11 a E13 de docs/norma/exemplos.md (Bastos, Pilares.pdf, 13.1.1, 13.2.1 e 13.3.1).
// "l.N" = linha do texto extraído Pilares.u8.txt, como em exemplos.md.
// Os valores impressos vêm arredondados (ν, λ, Nd e e2 cortados antes da conta), daí a
// tolerância relativa de 0,5% nos esforços. As: ±1% contra integração independente fora
// do app; contra o ábaco, faixa documentada em cada teste.
// Sinal da entrada: Bastos escreve M1d,A = −M1d,B para momentos que tracionam faces
// opostas (curvatura dupla); aqui isso é topo e base com sinais opostos.
const perto = (valor: number | undefined, esperado: number, tol = 0.005) =>
  expect(Math.abs((valor ?? NaN) / esperado - 1)).toBeLessThan(tol);

describe("exemplos publicados E11–E13", () => {
  // E11 (Bastos p. 79-86): Nd, λ, Md,tot e As já estão no describe "Bastos p. 79-82"
  // acima; aqui só o que faltava (αb, λ1, M1d,min).
  // Divergência impressa: "8,37 cm²" (l.4754) contra 3,94 cm² (l.4731) para a mesma
  // ea = 0,84 cm. Os dois saem do caminho com excentricidade acidental, que o app não
  // usa: pela 11.3.3.4.3 o M1d,min substitui ea, e o As desse caminho é 10,84 cm².
  describe("E11: intermediário 20 × 50, complemento (Bastos p. 79-86)", () => {
    const r = pilar6118(pilar({ b: 50, h: 20, lex: 2.8, ley: 2.8, nk: 1000 }), mat(30), 4);
    it("M1d,min,x = 4.200 e M1d,min,y = 2.940 kN·cm (l.4440 e 4444)", () => {
      perto(etapa(r, "Momento mínimo de 1ª ordem (x)"), 42);
      perto(etapa(r, "Momento mínimo de 1ª ordem (y)"), 29.4);
    });
    it("e1 = 0: αb = 1 e λ1 = 25 → 35 nas duas direções (l.4453 a 4456)", () => {
      expect(etapa(r, "Coeficiente αb (x)")).toBe(1);
      expect(etapa(r, "Coeficiente αb (y)")).toBe(1);
      expect(etapa(r, "Esbeltez-limite (x)")).toBe(35);
      expect(etapa(r, "Esbeltez-limite (y)")).toBe(35);
    });
  });

  // E12 (Bastos p. 97-104): extremidade 20 × 70, C25, Nk = 1.110 kN, le = 280 cm, d' = 4 cm,
  // M1d,A,x = −M1d,B,x = 2.170 kN·cm (entrada característica: ÷ γf = 1,4; γn = 1).
  // Divergência impressa: o "48%" do resumo (l.5849 a 5855) compara 5,75 cm² (rigidez e
  // ea) com 10,92; nenhum dos dois caminhos é o do app, então não entra no teste.
  describe("E12: extremidade 20 × 70 (Bastos p. 97-104)", () => {
    const r = pilar6118(
      pilar({
        b: 20,
        h: 70,
        lex: 2.8,
        ley: 2.8,
        nk: 1110,
        mxTopo: 21.7 / 1.4,
        mxBase: -21.7 / 1.4,
      }),
      mat(25),
      4,
    );
    it("Nd = 1,0·1,4·1.110 = 1.554 kN; λx = 48,4, λy = 13,8 (l.5478, 5523, 5528)", () => {
      expect(r.nd).toBeCloseTo(1554, 9);
      perto(r.lambdaX, 48.4);
      perto(r.lambdaY, 13.8);
      expect(r.avisos).toEqual([]);
    });
    it("M1d,min,x = 3.263 e M1d,min,y = 5.594 kN·cm (l.5535, 5538)", () => {
      perto(etapa(r, "Momento mínimo de 1ª ordem (x)"), 32.63);
      perto(etapa(r, "Momento mínimo de 1ª ordem (y)"), 55.94);
    });
    it("αb = 1 nas duas direções (x: M1d,A = 2.170 < M1d,min; y: e1 = 0) e λ1 = 35 (l.5547 a 5560)", () => {
      expect(etapa(r, "Coeficiente αb (x)")).toBe(1);
      expect(etapa(r, "Coeficiente αb (y)")).toBe(1);
      expect(etapa(r, "Esbeltez-limite (x)")).toBe(35);
      expect(etapa(r, "Esbeltez-limite (y)")).toBe(35);
    });
    it("Md,tot,x = 3.263 + 2.720 = 5.983 kN·cm; Md,tot,y = M1d,min,y = 5.594 (l.5634, 5639, 5743)", () => {
      // Com ν exato (0,6216, não 0,62) M2d = 2.716 e Md,tot,x = 5.979 kN·cm (−0,07%).
      perto(r.mdX, 59.83);
      perto(r.mdY, 55.94);
    });
    it("As = 9,98 cm² pela integração independente da parábola-retângulo (±1%)", () => {
      // Conta fora do app: integração por faixas, linha neutra como parâmetro, 2 camadas
      // simétricas, d' = 4 cm, concreto sob as barras comprimidas descontado, Nd = 1.554 kN,
      // Md = 5.979 kN·cm (valor do app com ν exato): As = 9,982 cm² (ω = 0,174).
      perto(r.asNecessaria, 9.982, 0.01);
    });
    it("ábaco A-4 de Venturini (d'/h = 0,20, μ = 0,12, ω = 0,19) = 10,92 cm² (l.5770 a 5784): As ≥ 0,85·ábaco", () => {
      // Faixa documentada, não ±5%: a leitura impressa (ω = 0,19) fica 0,016 acima do ω da
      // integração (0,174); para ω = 0,19 a conta pede μ = 0,123 em vez de 0,12. No E11, com
      // o mesmo ábaco, a leitura (ω = 0,22) bate com a integração. A Figura do ábaco não
      // pôde ser conferida, então a diferença fica atribuída à leitura.
      expect(r.asNecessaria).toBeGreaterThanOrEqual(0.85 * 10.92);
      expect(r.asNecessaria).toBeLessThan(10.92);
    });
  });

  // E13 (Bastos p. 122-131): canto 18 × 50, C25, Nk = 850 kN, le = 350 cm, d' = 5 cm,
  // M1k,A,x = −M1k,B,x = 2.041 e M1k,A,y = −M1k,B,y = 1.360,5 kN·cm; γn = 1,05.
  // Divergências impressas: (1) o ábaco 5A/5B de Pinheiro foi lido com d'x/hx = 0,25,
  // mas 5,0/18 = 0,28 (a nota 87 da própria apostila diz que d'/h menor é contra a
  // segurança); (2) ey = 0,64 cm sem ea no caminho com excentricidade acidental, que o
  // app não usa (M1d,min no lugar de ea). Aqui vale d' = 5 cm, e o ábaco é comparado
  // com d' = 4,5 cm (0,25 · 18), que reproduz a leitura impressa.
  describe("E13: canto 18 × 50 (Bastos p. 122-131)", () => {
    const entrada = pilar({
      b: 18,
      h: 50,
      lex: 3.5,
      ley: 3.5,
      nk: 850,
      mxTopo: 20.41,
      mxBase: -20.41,
      myTopo: 13.605,
      myBase: -13.605,
    });
    const r = pilar6118(entrada, mat(25), 5);
    it("Nd = 1,05·1,4·850 = 1.249,5 kN (impresso 1.250); λx = 67,3, λy = 24,2 (l.6904, 6923, 6928)", () => {
      perto(r.nd, 1250);
      perto(r.lambdaX, 67.3);
      perto(r.lambdaY, 24.2);
      expect(r.avisos.some((a) => a.includes("< 19 cm"))).toBe(true);
    });
    it("M1d,A,x = 3.000 e M1d,A,y = 2.000 kN·cm (l.6910 a 6911)", () => {
      perto(etapa(r, "Momento de 1ª ordem de cálculo (x), maior extremidade"), 30);
      perto(etapa(r, "Momento de 1ª ordem de cálculo (y), maior extremidade"), 20);
    });
    it("M1d,min,x = 2.550 e M1d,min,y = 3.750 kN·cm (l.6938, 6941)", () => {
      perto(etapa(r, "Momento mínimo de 1ª ordem (x)"), 25.5);
      perto(etapa(r, "Momento mínimo de 1ª ordem (y)"), 37.5);
    });
    it("αb,x = 0,2 → 0,4 (curvatura dupla) e λ1,x = 66,7; αb,y = 1 (M1d,A < mín) e λ1,y = 35 (l.6950 a 6973)", () => {
      expect(etapa(r, "Coeficiente αb (x)")).toBeCloseTo(0.4, 9);
      perto(etapa(r, "Esbeltez-limite (x)"), 66.67);
      expect(etapa(r, "Coeficiente αb (y)")).toBe(1);
      expect(etapa(r, "Esbeltez-limite (y)")).toBe(35);
    });
    it("Md,tot,x = 2.550 + 3.325 = 5.875 kN·cm (Eq. 97: 5.873); Md,tot,y = 3.750 (l.7037, 7047, 7164)", () => {
      // Conta exata: ν = 0,7775, 1/r = 2,1744e-4 /cm, M2d = 3.328 → 2.549 + 3.328 = 5.877.
      perto(r.mdX, 58.75);
      perto(r.mdY, 37.5);
    });
    // Conta independente (parábola-retângulo fora do app, concreto sob as barras
    // comprimidas descontado, α = 1, As/4 por face, seção C: Mxd = 5.877, Myd = 3.749
    // kN·cm, Nd = 1.249,5 kN): 37,24 cm² com d' = 5 cm e 32,79 cm² com d' = 4,5 cm.
    it("As do ábaco 5A/5B de Pinheiro (d'x/hx = 0,25, ω = 0,826) = 30,52 cm², com d' = 4,5 cm: entre 1,0 e 1,10·ábaco (l.7186 a 7245)", () => {
      // Faixa, não ±5%: o app fica acima do ábaco por duas escolhas a favor da segurança,
      // α = 1 na interação oblíqua (sem desconto já dava 31,70, +3,9%) e o desconto do
      // concreto sob as barras comprimidas (mais 3,5%). Total 32,80 (+7,5%).
      const r25 = pilar6118(entrada, mat(25), 4.5);
      expect(r25.asNecessaria).toBeGreaterThan(30.52);
      expect(r25.asNecessaria).toBeLessThan(1.1 * 30.52);
      perto(r25.asNecessaria, 32.79, 0.01);
    });
    it("com o d'x/hx real = 0,28 a armadura passa do ábaco (a favor da segurança)", () => {
      expect(r.asNecessaria).toBeGreaterThan(30.52);
      perto(r.asNecessaria, 37.24, 0.01);
    });
  });
});

describe("arranjo das barras longitudinais (18.4.2.2: s ≤ 2·bmin e ≤ 40 cm)", () => {
  it("smáx = min(2·bmin; 40): bmin 15 → 30 cm; bmin 20 → 40 cm", () => {
    expect(espacamentoMaximoLongitudinal(15)).toBe(30);
    expect(espacamentoMaximoLongitudinal(20)).toBe(40);
    expect(espacamentoMaximoLongitudinal(30)).toBe(40);
  });
  it("20 × 80, d' = 4, 4 φ 16 nos cantos: face de 80 com (80 − 8)/1 = 72 > 40 → 3 por face, n = 6", () => {
    // faces de 80: ⌈72/40⌉ + 1 = 3 barras, s = 72/2 = 36 cm; faces de 20: 2 barras, s = 12 cm
    const a = arranjoPilar6118(20, 80, 4, 16, 4, 0, 0, "x");
    expect(a).toEqual({
      n: 6,
      porFaceX: 3,
      porFaceY: 2,
      sFaceX: 36,
      sFaceY: 12,
      sMax: 40,
      extrasEspacamento: 2,
    });
  });
  it("30 × 30, 8 barras, predominante x: 4 por face de 30 (s = 22/3) e só cantos nas outras", () => {
    const a = arranjoPilar6118(30, 30, 4, 12.5, 8, 0, 0, "x");
    expect([a.n, a.porFaceX, a.porFaceY, a.extrasEspacamento]).toEqual([8, 4, 2, 0]);
    expect(a.sFaceX).toBeCloseTo(22 / 3, 9);
  });
  it("direção secundária pedindo 3 barras por face (reqY = 2,5 Aφ) recebe 1 intermediária por face: n = 10", () => {
    const a = arranjoPilar6118(30, 30, 4, 12.5, 8, 0, 2.5 * areaBarra(12.5), "x");
    expect([a.n, a.porFaceX, a.porFaceY, a.extrasEspacamento]).toEqual([10, 4, 3, 0]);
  });
  it("pilar6118 20 × 80 fletido em y: barras nas faces de 20, faces de 80 ganham 1 intermediária e aviso", () => {
    // My = 150 kN·m nas duas pontas → a armadura de y governa (predominante y); as
    // faces de 80 cm ficariam só com os cantos, 72 cm > 40 → ⌈72/40⌉ + 1 = 3 por face.
    const r = pilar6118(pilar({ b: 20, h: 80, nk: 600, myTopo: 150, myBase: 150 }), mat(25), 4);
    const arranjo = r.memoria.find((m) => m.descricao.startsWith("Arranjo"));
    expect(arranjo?.descricao).toMatch(/^Arranjo: 3 barras em cada face de 80 cm/);
    expect(arranjo?.descricao).toMatch(/predominante y/);
    expect(r.avisos.some((a) => /intermediária.*18\.4\.2\.2/.test(a))).toBe(true);
    expect(r.barras.area).toBeGreaterThanOrEqual(r.asNecessaria);
  });
  it("pilar6118 20 × 80 só com momento mínimo: 10 φ 10, 5 por face de 80 (s = 18 cm), sem aviso", () => {
    // As,min = 0,4 % · 1600 = 6,4 cm² → ⌈6,4/0,785⌉ = 9 → 10 φ 10; Md/altura maior em x
    // (Nd·0,021/20 > Nd·0,039/80) → 5 por face de 80, s = 72/4 = 18 cm ≤ 40.
    const r = pilar6118(pilar({ b: 20, h: 80, nk: 600 }), mat(25), 4);
    expect(r.barras.n).toBe(10);
    expect(r.barras.phi).toBe(10);
    expect(r.memoria.find((m) => m.descricao.startsWith("Arranjo"))?.descricao).toMatch(
      /^Arranjo: 5 barras em cada face de 80 cm .* 2 em cada face de 20 cm/,
    );
    expect(r.avisos.some((a) => a.includes("18.4.2.2"))).toBe(false);
  });
});

// 90 < λ ≤ 140: pilar-padrão acoplado a diagramas M, N, 1/r (15.8.3.3.4) com fluência
// (15.8.4). Não há exemplo publicado na fonte (Bastos não resolve pilar com λ > 90);
// a referência é a conta à mão da fluência e um modelo de fibras escrito aqui, sem
// usar o núcleo do app: 400 faixas de concreto (ponto médio), parábola-retângulo com
// pico 0,85·fcd/1,1 (15.3.1), aço elastoplástico, concreto descontado sob a barra
// comprimida (hipótese do núcleo), domínios de 17.2.2 como limite da curvatura.
describe("90 < λ ≤ 140: pilar-padrão acoplado com fluência", () => {
  const sigMN = (0.85 * 25) / 1.4 / 1.1;
  const fyd = 500 / 1.15;
  /** M (kN·m) da seção alt × larg (cm) com Nd e curvatura k (1/cm), e se é admissível. */
  const fibras = (nd: number, k: number, alt: number, larg: number, dl: number, asf: number) => {
    const sc = (e: number) =>
      e <= 0 ? 0 : e >= 0.002 ? sigMN : sigMN * (1 - (1 - e / 0.002) ** 2);
    const ss = (e: number) => Math.max(-fyd, Math.min(fyd, 210_000 * e));
    const eps = (e0: number, y: number) => e0 + k * (alt / 2 - y);
    const esf = (e0: number) => {
      let n = 0;
      let m = 0;
      const dy = alt / 400;
      for (let i = 0; i < 400; i++) {
        const y = (i + 0.5) * dy;
        const f = sc(eps(e0, y)) * larg * dy * 0.1;
        n += f;
        m += f * (alt / 2 - y);
      }
      for (const y of [dl, alt - dl]) {
        const e = eps(e0, y);
        const f = asf * (ss(e) - sc(e)) * 0.1;
        n += f;
        m += f * (alt / 2 - y);
      }
      return { n, m: m / 100 };
    };
    let lo = -0.05;
    let hi = 0.05;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (esf(mid).n < nd) lo = mid;
      else hi = mid;
    }
    const e0 = (lo + hi) / 2;
    const ok =
      eps(e0, 0) <= 0.0035 + 1e-9 &&
      eps(e0, (3 / 7) * alt) <= 0.002 + 1e-9 &&
      eps(e0, alt - dl) >= -0.01 - 1e-9;
    return { m: esf(e0).m, ok };
  };
  /** Máximo de M(1/r) − Nd·(1/r)·le²/10 nas curvaturas admissíveis (grade de 1500) e
   *  o momento total nesse ponto. */
  const maxEquilibrio = (
    nd: number,
    le: number,
    alt: number,
    larg: number,
    dl: number,
    asf: number,
  ) => {
    const c = (nd * (le * 100) ** 2) / 10 / 100;
    const ku = 0.0135 / (alt - dl);
    let max = -Infinity;
    let kMax = 0;
    for (let i = 0; i <= 1500; i++) {
      const k = (ku * i) / 1500;
      const p = fibras(nd, k, alt, larg, dl, asf);
      if (!p.ok) break;
      if (p.m - c * k > max) {
        max = p.m - c * k;
        kMax = k;
      }
    }
    return { max, mTot: max + c * kMax };
  };
  const asFaceX = (r: PilarResultado) =>
    etapa(r, "Armadura por face, flexo-compressão normal em x") ?? NaN;

  // 20 × 40 (b × h), C25, CA-50, d' = 4 cm, Nk = 400 kN, Mx,k = 5 kN·m no topo e na base.
  describe("λx = 95,2: lex = 5,5 m", () => {
    const r = pilar6118(
      pilar({ b: 20, h: 40, lex: 5.5, ley: 3, nk: 400, mxTopo: 5, mxBase: 5 }),
      mat(25),
      4,
    );
    it("Nd = 560 kN; λx = 3,46·550/20 = 95,15; aviso de λ > 90 com [VERIFICAR]", () => {
      expect(r.nd).toBeCloseTo(560, 9);
      expect(r.lambdaX).toBeCloseTo(95.15, 9);
      expect(r.avisos.some((a) => a.includes("> 90") && a.includes("[VERIFICAR]"))).toBe(true);
    });
    it("fluência: Ne = 2.468,32 kN, ea = 1,1726 cm, ecc = 1,1439 cm (conta à mão)", () => {
      // Eci = 5600·√25 = 28.000 MPa; Ic = 40·20³/12 = 26.666,7 cm⁴;
      // Ne = 10·2.800·26.666,7/550² = 2.468,32 kN.
      // θ1 = 1/(100·√5,5) = 0,004264 > 1/300; ea = 0,004264·550/2 = 1,1726 cm.
      // ecc = (5/400 + 0,011726)·(2,718^(2·400/2.068,32) − 1) = 0,024226·0,47218 = 1,1439 cm.
      expect(etapa(r, "Força de flambagem (x)")).toBeCloseTo(2468.32, 1);
      expect(etapa(r, "Excentricidade acidental (x), H = le [VERIFICAR]")).toBeCloseTo(1.1726, 3);
      expect(etapa(r, "Excentricidade de fluência (x)")).toBeCloseTo(1.1439, 3);
    });
    it("M1d,C = max(αb·7; M1d,min = 560·0,021 = 11,76) + 560·0,011439 = 18,166 kN·m", () => {
      expect(etapa(r, "Momento de 1ª ordem na seção intermediária com fluência (x)")).toBeCloseTo(
        18.166,
        2,
      );
    });
    it("As é a menor com equilíbrio: o modelo de fibras acha equilíbrio com As e não com 0,97·As", () => {
      const asf = asFaceX(r);
      const m1 = 18.1659;
      expect(maxEquilibrio(560, 5.5, 20, 40, 4, asf).max).toBeGreaterThan(m1 * 0.997);
      expect(maxEquilibrio(560, 5.5, 20, 40, 4, 0.97 * asf).max).toBeLessThan(m1);
      expect(r.asNecessaria).toBeCloseTo(2 * asf, 9);
    });
    it("Md,tot,x ≈ momento no limite de estabilidade do modelo de fibras (±3%)", () => {
      perto(r.mdX, maxEquilibrio(560, 5.5, 20, 40, 4, asFaceX(r)).mTot, 0.03);
    });
    it("barras cobrem As; direção y (λy = 25,9) sem 2ª ordem: Md,y = 560·0,027 = 15,12", () => {
      expect(r.barras.area).toBeGreaterThanOrEqual(r.asNecessaria);
      expect(r.mdY).toBeCloseTo(15.12, 9);
    });
  });

  describe("λx = 112,5: lex = 6,5 m, Nk = 300 kN", () => {
    const r = pilar6118(
      pilar({ b: 20, h: 40, lex: 6.5, ley: 3, nk: 300, mxTopo: 5, mxBase: 5 }),
      mat(25),
      4,
    );
    it("Ne = 1.767,23 kN, ea = 1,2748 cm, ecc = 1,4858 cm (conta à mão)", () => {
      // Ne = 10·2.800·26.666,7/650² = 1.767,23 kN; θ1 = 1/(100·√6,5) = 0,0039223;
      // ea = 0,0039223·650/2 = 1,2748 cm; expoente 2·300/1.467,23 = 0,408935;
      // 2,718^0,408935 = 1,50513; (0,016667 + 0,012748)·0,50513 = 1,4858 cm.
      expect(etapa(r, "Força de flambagem (x)")).toBeCloseTo(1767.23, 1);
      expect(etapa(r, "Excentricidade acidental (x), H = le [VERIFICAR]")).toBeCloseTo(1.2748, 3);
      expect(etapa(r, "Excentricidade de fluência (x)")).toBeCloseTo(1.4858, 3);
    });
    it("As é a menor com equilíbrio (modelo de fibras)", () => {
      const asf = asFaceX(r);
      // M1d,C = max(7; 420·0,021 = 8,82) + 420·0,014858
      const m1 = 8.82 + 420 * 0.014858;
      expect(maxEquilibrio(420, 6.5, 20, 40, 4, asf).max).toBeGreaterThan(m1 * 0.997);
      expect(maxEquilibrio(420, 6.5, 20, 40, 4, 0.97 * asf).max).toBeLessThan(m1);
    });
  });

  it("flexão oblíqua com λx > 90 pede pelo menos a armadura da flexão normal em x", () => {
    const base = { b: 20, h: 40, lex: 5.5, ley: 3, nk: 400, mxTopo: 5, mxBase: 5 };
    const normal = pilar6118(pilar(base), mat(25), 4);
    const obliqua = pilar6118(pilar({ ...base, myTopo: 10, myBase: 10 }), mat(25), 4);
    expect(obliqua.asNecessaria).toBeGreaterThanOrEqual(normal.asNecessaria);
  });
});

// Exemplo publicado: Alves, Gama e Souza, Engineering and Science (UFMT) 2017, 6:2,
// p. 69-71, DOI 10.18607/ES20175622. Pilar 20 × 40, le = 6 m, λ = 103,92 (h = 20), C20,
// CA-50, d' = 4 cm; NSd = 840 kN, Nsg = 600 kN, Msg = 0, φ = 2,0, M1d,A = 17,64 kN·m,
// αb = 1. Impressos: ea = 0,01224 m, Ne = 1.556,28 kN, ecc = 0,03 m (0,0307 pela Eq. 32),
// Mcc = 25,2 kN·m, 1/r = 0,0012 m⁻¹, Md,tot = 21,27 kN·m, Mtot = Md,tot + Mcc = 46,47 kN·m,
// As = 18,40 cm² (otimização em Matlab, validada com o TQS). Diagrama e γf3 não informados.
// Conferem exatamente: ea, ecc pela Eq. 32 com o Ne impresso, Mcc, M1d,min e Md,tot com a
// 1/r impressa. As só como faixa: o app dá mais armadura, pelas razões do último teste.
describe("Alves, Gama e Souza (2017), p. 69-71: λ = 103,9 com fluência", () => {
  const r = pilar6118(pilar({ b: 20, h: 40, lex: 6, ley: 6, nk: 600 }), mat(20), 4);
  it("Nd = 840 kN; M1d,A = M1d,min = 840·(0,015 + 0,03·0,20) = 17,64 kN·m (exato)", () => {
    expect(r.nd).toBeCloseTo(840, 9);
    expect(momentoMinimo(840, 20)).toBeCloseTo(17.64, 9);
    expect(etapa(r, "Momento mínimo de 1ª ordem (x)")).toBeCloseTo(17.64, 9);
  });
  it("ea = θ1·le/2 = 0,0040825·6/2 = 0,01224 m (exato)", () => {
    // 0,012247 impresso truncado em 0,01224
    expect(excentricidadeAcidental(6)).toBeCloseTo(0.01224, 4);
    expect(etapa(r, "Excentricidade acidental (x), H = le [VERIFICAR]")).toBeCloseTo(1.224, 2);
  });
  it("ecc pela Eq. 32 com o Ne impresso = 0,0307 m; Mcc = 840·0,03 = 25,2 kN·m (exato)", () => {
    const ecc = excentricidadeFluencia(0, 600, 0.01224, 2, 1556.28) ?? NaN;
    expect(ecc).toBeCloseTo(0.0307, 4);
    // o artigo arredonda ecc para 0,03 m antes de Mcc
    expect((840 * Math.round(ecc * 100)) / 100).toBeCloseTo(25.2, 9);
  });
  it("Md,tot = 17,64 + 840·0,0012·6²/10 = 21,27 kN·m com a 1/r impressa (exato)", () => {
    // 1/r = 0,0012 m⁻¹ = 1,2·10⁻⁵ /cm
    expect(17.64 + momentoSegundaOrdem(840, 6, 1.2e-5)).toBeCloseTo(21.27, 2);
  });
  it("Ne diverge: o app usa Eci = 5600·√20 (15.8.4) → 1.855,1 kN; o artigo, E ≈ 21.010 MPa", () => {
    // 10·2.504,40·26.666,7/600² = 1.855,11 kN; o impresso 1.556,28 implica
    // E = 1.556,28·600²/(10·26.666,7) = 2.101 kN/cm² (≈ Ecs = 0,85·Eci = 21.287, −1,3%).
    expect(etapa(r, "Força de flambagem (x)")).toBeCloseTo(1855.11, 1);
  });
  it("As: faixa — app ≥ 18,40 cm² do artigo; a 1/r impressa é incompatível com a seção", () => {
    // A 1/r impressa pede rigidez M/(1/r) = 2.127/1,2·10⁻⁵ = 1,77·10⁸ kN·cm². Cota superior
    // da rigidez da seção 40 × 20 com 18,40 cm², mesmo com pico 1,1·fcd: concreto na
    // tangente inicial 2·15,71/0,002 = 15.714 MPa → 1.571·26.666,7 = 4,19·10⁷; aço
    // 21.000·18,4·6² = 1,39·10⁷; soma 5,58·10⁷, um terço do que o artigo usa. Além disso o
    // artigo soma Mcc depois da 2ª ordem; o app soma Nd·ecc à 1ª ordem antes do equilíbrio,
    // como pede 15.8.4 ("soma-se à excentricidade e1"). Com isso o app pede 47,1 cm².
    const eiArtigo = 2127 / 1.2e-5;
    const eiMax =
      ((2 * ((1.1 * 20) / 1.4)) / 0.002 / 10) * ((40 * 20 ** 3) / 12) + 21_000 * 18.4 * 36;
    expect(eiArtigo).toBeGreaterThan(3 * eiMax);
    expect(r.asNecessaria).toBeGreaterThanOrEqual(18.4);
    expect(r.asNecessaria).toBeLessThan(0.08 * 800);
  });
});

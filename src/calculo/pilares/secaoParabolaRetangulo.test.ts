// Seção retangular pela parábola-retângulo (NBR 6118:2023). Valores esperados de:
// - contas fechadas escritas no próprio teste;
// - Bastos, "Flexão composta e pilares de concreto armado" (UNESP, jun/2024),
//   página impressa no cabeçalho: "Bastos p. X";
// - ábacos de Venturini (1987) lidos na mesma apostila.
import { describe, expect, it } from "vitest";
import {
  armaduraSimetricaPR,
  camadasSimetricas,
  deformacaoUltima,
  EPS_C2,
  esforcosResistentes,
  momentoResistentePR,
  tensaoConcreto,
  Y_PIVO_C,
} from "./secaoParabolaRetangulo";

/** σcd = 0,85·fck/1,4 (ηc = 1 até C40), CA-50, Es = 210 GPa. */
const tensoes = (fck: number) => ({ sigmaCd: (0.85 * fck) / 1.4, fyd: 500 / 1.15, es: 210_000 });
const C25 = tensoes(25);
const C30 = tensoes(30);

describe("diagrama e domínios", () => {
  it("σc: 0 na tração, 0,75 σcd em 1‰, σcd a partir de 2‰", () => {
    expect(tensaoConcreto(-0.001, 10)).toBe(0);
    expect(tensaoConcreto(0.001, 10)).toBeCloseTo(7.5, 12);
    expect(tensaoConcreto(0.002, 10)).toBe(10);
    expect(tensaoConcreto(0.0035, 10)).toBe(10);
  });

  it("pivô C a 3h/7; p = 3 é a reta b (2‰ uniforme); p = 2 é x = h com 3,5‰ no topo", () => {
    const s = { b: 20, h: 40, dl: 4 };
    expect(Y_PIVO_C).toBeCloseTo(3 / 7, 12);
    const d5 = deformacaoUltima(2.4, s);
    expect(d5.topo + ((d5.base - d5.topo) * 3) / 7).toBeCloseTo(EPS_C2, 12);
    expect(deformacaoUltima(3, s)).toEqual({ topo: 0.002, base: 0.002 });
    const x = deformacaoUltima(2, s);
    expect(x.topo).toBeCloseTo(0.0035, 12);
    expect(x.base).toBeCloseTo(0, 12);
  });

  it("pivô A: εs = −10‰ em d = 36 cm nos domínios 1 e 2", () => {
    const s = { b: 20, h: 40, dl: 4 };
    for (const p of [0, 0.3, 1]) {
      const def = deformacaoUltima(p, s);
      expect(def.topo + ((def.base - def.topo) * 36) / 40).toBeCloseTo(-0.01, 12);
    }
  });
});

describe("casos limite fechados (20 × 40, C25)", () => {
  const s = { b: 20, h: 40, dl: 4 };

  it("compressão centrada: N = σcd·(Ac − As) + As·σs(2‰) = 15,179·790/10 + 10·420/10 = 1619,11 kN", () => {
    // As barras comprimidas descontam o concreto que ocupam: As·(σs − σc).
    const r = esforcosResistentes({ topo: 0.002, base: 0.002 }, s, camadasSimetricas(s, 5), C25);
    expect(r.n).toBeCloseTo((0.85 * 25 * 790) / 14 + 420, 6);
    expect(r.m).toBeCloseTo(0, 9);
    expect(momentoResistentePR(r.n + 0.01, s, camadasSimetricas(s, 5), C25)).toBeNull();
    expect(momentoResistentePR(r.n - 1e-6, s, camadasSimetricas(s, 5), C25)).toBeCloseTo(0, 3);
  });

  it("tração pura (reta a): N = −As·fyd = −10·43,478 = −434,78 kN (sem desconto na tração)", () => {
    const r = esforcosResistentes(deformacaoUltima(0, s), s, camadasSimetricas(s, 5), C25);
    expect(r.n).toBeCloseTo(-10 * 43.47826, 3);
  });

  it("concreto com x = h (3,5‰ no topo, 0 na base): resultante 17/21·σcd·b·h a 99/238·h do topo", () => {
    // Integral da parábola-retângulo com εcu = 3,5‰ e εc2 = 2‰: área 17/21 = 0,8095,
    // centroide a 99/238 = 0,416 x da borda comprimida.
    // N = 0,80952·15,1786·800/10 = 982,99 kN; M = N·(20 − 16,639) cm = 33,04 kN·m.
    const r = esforcosResistentes({ topo: 0.0035, base: 0 }, s, [], C25);
    const n = (17 / 21) * ((0.85 * 25) / 1.4) * 800 * 0.1;
    expect(r.n).toBeCloseTo(n, 6);
    expect(r.m).toBeCloseTo((n * (20 - (99 / 238) * 40)) / 100, 6);
  });

  it("deformação uniforme de 1‰: N = 0,75·σcd·Ac", () => {
    const r = esforcosResistentes({ topo: 0.001, base: 0.001 }, s, [], C25);
    expect(r.n).toBeCloseTo(0.75 * ((0.85 * 25) / 1.4) * 80, 6);
  });

  it("barras laterais: 2 camadas em y = 4 + 32/3 e 4 + 64/3, área repartida", () => {
    const c = camadasSimetricas(s, 3, 2, 2);
    expect(c.map((k) => k.as)).toEqual([3, 3, 1, 1]);
    expect(c[2]?.y).toBeCloseTo(4 + 32 / 3, 12);
    expect(c[3]?.y).toBeCloseTo(4 + 64 / 3, 12);
    // Na compressão centrada as laterais entram com σs(2‰) − σcd como as de face:
    // N = 15,179·(800 − 8)/10 + 8·420/10.
    const r = esforcosResistentes({ topo: 0.002, base: 0.002 }, s, c, C25);
    expect(r.n).toBeCloseTo((0.85 * 25 * 792) / 14 + 8 * 42, 6);
  });

  it("flexão com barra comprimida em 1‰ e tracionada em −1‰: desconto só na comprimida", () => {
    // topo = 1,25‰ e base = −1,25‰ (h = 40) dão ε = 1‰ em y = 4 e ε = −1‰ em y = 36.
    // Barras de 5 cm²: comprimida 5·(210 − 0,75·15,179)/10 = 99,31 kN; tracionada
    // −5·210/10 = −105 kN. Força das barras = −5,69 kN, momento = (99,31 + 105)·0,16 =
    // 32,69 kN·m. O concreto (sem barras) entra pela mesma deformação.
    const def = { topo: 0.00125, base: -0.00125 };
    const concreto = esforcosResistentes(def, s, [], C25);
    const r = esforcosResistentes(def, s, camadasSimetricas(s, 5), C25);
    const sigmaCd = (0.85 * 25) / 1.4;
    const fComp = (5 * (210 - 0.75 * sigmaCd)) / 10;
    expect(r.n - concreto.n).toBeCloseTo(fComp - 105, 6);
    expect(r.m - concreto.m).toBeCloseTo(((fComp + 105) * 16) / 100, 6);
  });
});

describe("flexão simples (N = 0, só armadura tracionada) contra o bloco retangular", () => {
  // Viga 20 × 50, d = 46 cm, C25, CA-50. Bloco retangular (Bastos, Flexão Simples, Eq. 23):
  // μ = Md/(b·d²·σcd), x/d = (1 − √(1 − 2μ))/0,8, As = Md/(fyd·(d − 0,4x)).
  const s = { b: 20, h: 50, dl: 4 };
  const soTracionada = (a: number) => [{ as: a, y: 46 }];
  it("Md = 100 kN·m (domínio 2): x/d = 0,2127, As = 5,465 cm² (bloco) ± 2%", () => {
    const as = armaduraSimetricaPR(0, 100, s, C25, 40, soTracionada) ?? NaN;
    expect(Math.abs(as / 5.465 - 1)).toBeLessThan(0.02);
  });
  it("Md = 200 kN·m (domínio 3): x/d = 0,4822, As = 12,390 cm² (bloco) ± 2%", () => {
    const as = armaduraSimetricaPR(0, 200, s, C25, 40, soTracionada) ?? NaN;
    expect(Math.abs(as / 12.39 - 1)).toBeLessThan(0.02);
  });
});

describe("flexo-compressão com armadura assimétrica: Fusco (1981) citado por Bastos p. 16-18", () => {
  it("25 × 70, d' = 5, C25, Nd = 700 kN, Md = 560 kN·m: As = 18,90 e A's = 6,82 resistem a Md (± 1%)", () => {
    // Fusco calculou pela parábola-retângulo (Bastos p. 18, Exemplo 2). Com o desconto do
    // concreto sob A's a conta independente dá MR = 558,1 kN·m (−0,3%); sem ele, 561,0.
    const s = { b: 25, h: 70, dl: 5 };
    const camadas = [
      { as: 6.82, y: 5 },
      { as: 18.9, y: 65 },
    ];
    const mr = momentoResistentePR(700, s, camadas, C25) ?? NaN;
    expect(Math.abs(mr / 560 - 1)).toBeLessThan(0.01);
  });
});

describe("pilares de Bastos com os ábacos de Venturini (armadura nas duas faces)", () => {
  const asTotal = (nd: number, md: number, s: { b: number; h: number; dl: number }, t = C30) =>
    2 * (armaduraSimetricaPR(nd, md, s, t, 0.04 * s.b * s.h) ?? NaN);

  // "Conta independente": integração por faixas da parábola-retângulo fora do app, com
  // linha neutra como parâmetro e o mesmo desconto do concreto sob as barras comprimidas.
  const perto = (valor: number, esperado: number, tol = 0.01) =>
    expect(Math.abs(valor / esperado - 1)).toBeLessThan(tol);

  it("20 × 50, C30, Nd = 1400, Md,y = 53,20 kN·m (Bastos p. 82, ábaco A-4): 10,84 cm² ± 5%", () => {
    // Conta independente: 10,83 cm² (10,38 sem descontar o concreto sob as barras).
    const as = asTotal(1400, 53.2, { b: 50, h: 20, dl: 4 });
    expect(Math.abs(as / 10.84 - 1)).toBeLessThan(0.05);
    perto(as, 10.834);
  });

  it("14 × 30, C25, Nd = 385, Md,y = 18,03 kN·m (Bastos p. 97, ábaco A-4, d'/h = 0,20): 5,52 cm² ± 5%", () => {
    // Com o d'/h do ábaco (d' = 0,20·14 = 2,8 cm). Conta independente: 5,528 cm².
    const as20 = asTotal(385, 18.03, { b: 30, h: 14, dl: 2.8 }, C25);
    expect(Math.abs(as20 / 5.52 - 1)).toBeLessThan(0.05);
    perto(as20, 5.528);
    // Com o d' real = 3 cm (d'/h = 0,21) a armadura cresce. Conta independente: 5,831 cm².
    perto(asTotal(385, 18.03, { b: 30, h: 14, dl: 3 }, C25), 5.831);
  });

  it("15 × 40, C30, Nd = 840, Md,x = 48,05 kN·m (Bastos p. 115, ábaco A-5, d'/h = 0,25): 24,83 cm² ± 5%", () => {
    // Conta independente: 25,48 cm².
    const as25 = asTotal(840, 48.05, { b: 40, h: 15, dl: 3.75 });
    expect(Math.abs(as25 / 24.83 - 1)).toBeLessThan(0.05);
    perto(as25, 25.482);
    // Com o d'/h real = 4/15 = 0,27 o braço das barras diminui e a armadura cresce
    // (conta independente: 28,80 cm²).
    const as27 = asTotal(840, 48.05, { b: 40, h: 15, dl: 4 });
    expect(as27).toBeGreaterThan(as25);
    perto(as27, 28.799);
  });
});

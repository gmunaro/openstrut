// Padrão de charneiras e regiões da LAJEMONT (charneiras.ts, regioes.ts) contra contas
// à mão. Os casos do oráculo com reações impressas só exercitam o retângulo com i 2 e
// 0 (reacoes.test.ts); aqui entram i ≠ 2, bordo livre, balanço, pré-moldada, laje em
// L e código fracionário do modo corrigido.
//
// Regra das contas (livros_laje.md 1.6 e 2.6): no canto reto, a charneira divide o
// ângulo com distâncias aos bordos na razão √((1+i1)/(1+i2)) (o bordo de i maior
// afasta a charneira de si); bordo livre: as charneiras dos dois vértices vão ao meio
// do bordo (LAJEMONT.BAS:5539-5547); pré-moldada: faixas paralelas às nervuras, a
// carga vai aos bordos que as nervuras cruzam (S_15790).
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { lajeMontagem, PadraoMontagem } from "./charneiras";
import { regiaoDoBordo } from "./regioes";

const original = { s: sng, tol: sng(0.005), eps: sng(0.002) };
const corrigido = { s: (x: number) => x, tol: 0.005, eps: 0.002 };

/** Áreas das regiões por bordo (null no bordo livre). */
function areas(pts: [number, number][], codigos: number[], t = original, tipo = 0, angulo = 0) {
  const lm = lajeMontagem(
    pts.map(([x, y]) => ({ x: t.s(x), y: t.s(y) })),
    codigos,
    tipo,
    angulo,
  );
  const p = new PadraoMontagem(lm, t);
  p.executa();
  const a: (number | null)[] = [];
  for (let k = 1; k <= lm.n; k++)
    a.push(codigos[k - 1] === 1 ? null : regiaoDoBordo(lm, p, k, t).area);
  return { areas: a, padrao: p };
}

/** Retângulo 4 (x) × 5 (y) em sentido horário, como o LAJEGEOM grava:
 *  bordos 1 esquerdo (5 m), 2 topo (4 m), 3 direito (5 m), 4 base (4 m). */
const R: [number, number][] = [
  [0, 0],
  [0, 5],
  [4, 5],
  [4, 0],
];

const confere = (calc: (number | null)[], esperado: (number | null)[], tol = 1e-4) => {
  expect(calc).toHaveLength(esperado.length);
  calc.forEach((c, i) => {
    const e = esperado[i];
    if (e === null || e === undefined) expect(c).toBeNull();
    else expect(Math.abs((c ?? Number.NaN) - e), `bordo ${i + 1}: ${c} × ${e}`).toBeLessThan(tol);
  });
};

describe.each([
  ["original", original],
  ["corrigido", corrigido],
] as const)("retângulo 4×5, modo %s", (_, t) => {
  it("apoiado nos 4 bordos: charneiras a 45°, 6 / 4 / 6 / 4 m²", () => {
    // triângulo 4·2/2 = 4 nos bordos de 4 m; trapézio (5 + 1)/2·2 = 6 nos de 5 m
    confere(areas(R, [0, 0, 0, 0], t).areas, [6, 4, 6, 4]);
  });

  it("engastado nos 4 com o mesmo i: igual ao apoiado", () => {
    confere(areas(R, [22, 22, 22, 22], t).areas, [6, 4, 6, 4]);
  });

  it("base engastada com i = 1 (código 12): cantos de baixo em y = √2·x", () => {
    // base: triângulo até (2, 2√2) = 4·2√2/2; topo: triângulo a 45° até (2, 3) = 4;
    // laterais: (20 − base − topo)/2
    const base = 4 * Math.SQRT2;
    const lado = (20 - base - 4) / 2;
    confere(areas(R, [0, 0, 0, 12], t).areas, [lado, 4, lado, base]);
  });

  it("direito engastado com i = 2: k = 4/(1+√3) como no livro 2.6", () => {
    const k = 4 / (1 + Math.sqrt(3));
    const lados = (5 + (5 - 2 * k)) / 2;
    confere(areas(R, [0, 0, 22, 0], t).areas, [lados * k, 2 * k, lados * (4 - k), 2 * k]);
  });

  it("topo livre: as charneiras dos cantos de cima vão ao meio do bordo livre", () => {
    // base: triângulo 45° até (2, 2) = 4; laterais: (0,0)-(2,2)-(2,5)-(0,5) = (5+3)/2·2
    confere(areas(R, [0, 1, 0, 0], t).areas, [8, null, 8, 4]);
  });
});

describe("outros casos (modo original)", () => {
  it("balanço 4 × 1,5 com três bordos livres: tudo no bordo engastado", () => {
    const b: [number, number][] = [
      [0, 5],
      [0, 6.5],
      [4, 6.5],
      [4, 5],
    ];
    confere(areas(b, [1, 1, 1, 22]).areas, [null, null, null, 6]);
  });

  it("pré-moldada: nervuras em x levam aos bordos x = 0 e x = 4; em y, aos de y", () => {
    confere(areas(R, [0, 0, 0, 0], original, 1, 0).areas, [10, 0, 10, 0]);
    confere(areas(R, [0, 0, 0, 0], original, 1, 90).areas, [0, 10, 0, 10]);
  });

  it("laje em L apoiada (6×6 sem o canto 3×3): regiões somam a área 27 m²", () => {
    const L: [number, number][] = [
      [0, 0],
      [0, 6],
      [3, 6],
      [3, 3],
      [6, 3],
      [6, 0],
    ];
    const a = areas(L, [0, 0, 0, 0, 0, 0]).areas;
    // bordos de 3 m nas pontas do L: triângulos 3·1,5/2 = 2,25
    confere([a[1] ?? 0, a[4] ?? 0], [2.25, 2.25]);
    expect(Math.abs(a.reduce<number>((s, x) => s + (x ?? 0), 0) - 27)).toBeLessThan(1e-4);
  });

  it("i do bordo pelos trechos colineares: Σ(código − 2)·L/10 ÷ comprimento", () => {
    // base dividida em (0,0)-(1,0) com código 22 e (1,0)-(4,0) apoiado: i = 2·1/4 = 0,5
    const lm = lajeMontagem(
      [
        { x: 0, y: 0 },
        { x: 0, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 0 },
        { x: 1, y: 0 },
      ],
      [0, 0, 0, 0, 22],
      0,
    );
    const p = new PadraoMontagem(lm, original);
    p.executa();
    expect(p.iDoBordo(5)).toBe(sng(0.5));
    expect(p.iDoBordo(4)).toBe(sng(0.5));
  });
});

describe("modo corrigido: código fracionário da otimização (T2, R3)", () => {
  it("código 15,3 → i = 1,33 sem truncar e a laje inteira distribuída", () => {
    const r = areas(R, [0, 0, 0, 15.3], corrigido);
    expect(r.padrao.iDoBordo(4)).toBeCloseTo(1.33, 12);
    // cantos de baixo em y = √2,33·x encontram os de cima (45°) em x = 5/(1+√2,33)
    const x = 5 / (1 + Math.sqrt(2.33));
    const y = 5 - x;
    const topo = ((4 + (4 - 2 * x)) / 2) * (5 - y);
    confere([r.areas[1] ?? 0], [topo]);
    expect(Math.abs(r.areas.reduce<number>((s, a) => s + (a ?? 0), 0) - 20)).toBeLessThan(1e-9);
  });
});

// Padrão de charneiras e i dos bordos, contra o oráculo (áreas do LAJEMONT no
// caso_a_laje) e contas à mão de livros_laje.md 1.6 e 2.1/2.6.
import { describe, expect, it } from "vitest";
import { CASOS_ORACULO, type CasoOraculo, bateComImpresso, valorOraculo } from "../__oraculo__";
import { PARAMETROS_LAJE, emSingle } from "../base/parametros";
import type { Ponto } from "../base/tipos";
import { iDoBordo, padraoDeCharneiras, padraoPorCodigos } from "./charneiras";

const P = emSingle(PARAMETROS_LAJE);
const CASO_A = CASOS_ORACULO.caso_a_laje as CasoOraculo;
/** Retângulo lx × ly no sentido horário a partir da origem: bordos x = 0, y = ly,
 *  x = lx, y = 0 (índices 0..3). */
const retangulo = (lx: number, ly: number): Ponto[] => [
  { x: 0, y: 0 },
  { x: 0, y: ly },
  { x: lx, y: ly },
  { x: lx, y: 0 },
];
const k = 4 / (1 + Math.sqrt(3)); // 1,4641 (livros_laje.md 2.1)

describe("E2E L1 em coordenadas reais (a montagem usa assim)", () => {
  // L1: (0,5) → (0,10) → (4,10) → (4,5); bordos x = 0 (V4), y = 10 (V1), x = 4 (V5),
  // y = 5 (V2); contínuos x = 4 e y = 5 (i = 2).
  const l1 = [
    { x: 0, y: 5 },
    { x: 0, y: 10 },
    { x: 4, y: 10 },
    { x: 4, y: 5 },
  ];
  const padrao = padraoDeCharneiras(l1, [0, 0, 2, 2], [false, false, false, false], P, "original");
  const area = (bordo: number) => padrao.regioes.find((r) => r.bordo === bordo)?.area ?? NaN;

  it.each([
    [0, "L1>V4.area", ((5 + 1) / 2) * k],
    [1, "L1>V1.area", (4 * k) / 2],
    [2, "L1>V5.area", ((5 + 1) / 2) * (4 - k)],
    [3, "L1>V2.area", (4 * (4 - k)) / 2],
  ] as const)(
    "bordo %i: área impressa (%s) e conta à mão de livros_laje.md 2.6",
    (bordo, id, mao) => {
      expect(bateComImpresso(valorOraculo(CASO_A, id), area(bordo))).toBe(true);
      expect(area(bordo)).toBeCloseTo(mao, 4);
    },
  );

  it("as regiões cobrem a laje", () => {
    expect(padrao.regioes.reduce((s, r) => s + r.area, 0)).toBeCloseTo(20, 4);
  });
});

describe("E2E L1 girada e afim (4 × 5,59; livros_laje.md 2.1)", () => {
  const poligono = [
    { x: 0, y: 5 },
    { x: 0, y: 10.59 },
    { x: 4, y: 10.59 },
    { x: 4, y: 5 },
  ];
  const { segmentos } = padraoPorCodigos(poligono, [0, 0, 22, 22], P, "original");

  it("cumeeira vertical em x = 1,4641 com 1,590 de comprimento", () => {
    const cumeeira = segmentos.find((s) => Math.abs(s.inicio.x - s.fim.x) < 1e-6 && s.inicio.x > 0);
    expect(cumeeira?.inicio.x).toBeCloseTo(k, 4);
    expect(Math.abs((cumeeira?.fim.y ?? 0) - (cumeeira?.inicio.y ?? 0))).toBeCloseTo(
      5.59 - k - Math.sqrt(3) * k,
      3,
    );
  });

  it("canto entre bordos apoiados a 45°; canto apoiado × engastado com razão √3", () => {
    // canto (0, 10,59): x = 0 e y = 10,59 apoiados → nó a k dos dois bordos
    const c45 = segmentos.find((s) => s.inicio.x === 0 && Math.abs(s.inicio.y - 10.59) < 1e-5);
    expect(c45?.fim.x).toBeCloseTo(k, 4);
    expect(10.59 - (c45?.fim.y ?? 0)).toBeCloseTo(k, 4);
    // canto (0, 5): x = 0 apoiado e y = 5 engastado → afasta do engaste: dy = √3·dx
    const c60 = segmentos.find((s) => s.inicio.x === 0 && s.inicio.y === 5);
    expect((c60?.fim.y ?? 0) - 5).toBeCloseTo(Math.sqrt(3) * k, 4);
  });
});

describe("bordos livres (LAJECALC.BAS:6898-6941; livros_laje.md 1.6)", () => {
  it("4 × 5 com o bordo y = 5 livre: vizinhos paralelos, divide o livre em √1 : √1", () => {
    // o livre vai de (0,5) a (4,5); os vizinhos x = 0 e x = 4 são apoiados e paralelos,
    // então a charneira sai do meio do livre e desce até o nó dos cantos de baixo (45°)
    const p = padraoPorCodigos(retangulo(4, 5), [0, 1, 0, 0], P, "original");
    const cumeeira = p.segmentos.find((s) => s.inicio.x === 2 && s.fim.x === 2);
    expect([cumeeira?.inicio.y, cumeeira?.fim.y].sort()).toEqual([2, 5]);
    const areas = Object.fromEntries(p.regioes.map((r) => [r.bordo, r.area]));
    // x = 0: triângulo (0,0)-(2,2)-(0,2) + retângulo 2 × 3 = 8; x = 4 idem; y = 0: 4·2/2
    expect(areas).toEqual({ 0: 8, 2: 8, 3: 4 });
  });

  it("dois livres opostos (x = 0 e x = 4): laje armada numa direção, regiões 4 × 2,5", () => {
    const p = padraoPorCodigos(retangulo(4, 5), [1, 0, 1, 0], P, "original");
    expect(p.regioes.map((r) => [r.bordo, r.area])).toEqual([
      [1, 10],
      [3, 10],
    ]);
  });

  it("balanço (engaste em x = 0, três livres): uma região, a laje inteira", () => {
    const p = padraoPorCodigos(retangulo(2, 4), [22, 1, 1, 1], P, "original");
    expect(p.regioes).toHaveLength(1);
    expect(p.regioes[0]?.area).toBe(8);
  });
});

describe("polígono qualquer", () => {
  it("L de 6 vértices com canto reentrante: as regiões cobrem a laje (6·6 − 3·3)", () => {
    const l: Ponto[] = [
      { x: 0, y: 0 },
      { x: 0, y: 6 },
      { x: 3, y: 6 },
      { x: 3, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 0 },
    ];
    const p = padraoPorCodigos(l, [0, 0, 0, 0, 0, 0], P, "original");
    expect(p.regioes.reduce((s, r) => s + r.area, 0)).toBeCloseTo(27, 4);
  });

  it("sentido anti-horário é recusado (o LAJEGEOM não cria essa laje)", () => {
    expect(() =>
      padraoPorCodigos([...retangulo(4, 5)].reverse(), [0, 0, 0, 0], P, "original"),
    ).toThrow(/anti-horário/);
  });
});

describe("iDoBordo (LAJECALC.BAS:6999-7043)", () => {
  it("E2E L1: 0, 0, 2, 2", () => {
    expect(iDoBordo(retangulo(4, 5), [0, 0, 22, 22], P, "original")).toEqual([0, 0, 2, 2]);
  });

  it("bordos colineares somam: x = 0 em dois trechos de 2,5 com códigos 22 e 2 → i = (20·2,5/10)/5 = 1", () => {
    const v: Ponto[] = [
      { x: 0, y: 0 },
      { x: 0, y: 2.5 },
      { x: 0, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 0 },
    ];
    expect(iDoBordo(v, [22, 2, 0, 0, 0], P, "original")).toEqual([1, 1, 0, 0, 0]);
  });

  it("aceita código fracionário (otimização do modo corrigido, R3): 15,3 → 1,33", () => {
    const i = iDoBordo(retangulo(4, 5), [0, 0, 15.3, 22], PARAMETROS_LAJE, "corrigido");
    expect(i[2]).toBeCloseTo(1.33, 12);
    expect(i[3]).toBe(2);
  });
});

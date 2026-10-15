// Preparação e coeficiente de carga, contra contas à mão (livros_laje.md 1.5, 1.7,
// 2.1) e o caso retrad_laje_calc2 (L1 a 90°).
import { describe, expect, it } from "vitest";
import { PARAMETROS_LAJE, emSingle } from "../base/parametros";
import type { Alvenaria, LajeSistrut, PainelLajes, Ponto } from "../base/tipos";
import { padraoPorCodigos } from "./charneiras";
import { coeficienteDeCarga, preparaLaje } from "./coeficiente";

const P = emSingle(PARAMETROS_LAJE);
const f = Math.fround;
const retangulo = (lx: number, ly: number, y0 = 0): Ponto[] => [
  { x: 0, y: y0 },
  { x: 0, y: y0 + ly },
  { x: lx, y: y0 + ly },
  { x: lx, y: y0 },
];
const laje = (extra: Partial<LajeSistrut> = {}): LajeSistrut => ({
  nome: "L",
  tipo: 0,
  vertices: retangulo(4, 5),
  indicesVertices: [1, 2, 3, 4],
  grupo: 0,
  codigos: [0, 0, 0, 0],
  angulo: 0,
  mu: 1,
  cargaPermanente: f(0.1),
  pesoProprio: f(0.25),
  ...extra,
});
const painel = (l: LajeSistrut, extra: Partial<PainelLajes> = {}): PainelLajes => ({
  lajes: [l],
  cargasPorArea: [],
  alvenarias: [],
  continuidades: [],
  ...extra,
});

describe("preparaLaje (LAJECALC.BAS:7128-8171)", () => {
  it("E2E L1 (μ 0,8): afinidade INT(500/√0,8)/100 = 5,59; ocupação 0,15·20; área 20", () => {
    const l1 = laje({ vertices: retangulo(4, 5, 5), codigos: [0, 0, 22, 22], mu: f(0.8) });
    const ocupacao = { vertices: retangulo(8, 10), total: f(0.15), acidental: f(0.15) };
    const p = preparaLaje(l1, painel(l1, { cargasPorArea: [ocupacao] }), P, "original");
    expect(p.poligono).toEqual([
      { x: 0, y: 5 },
      { x: 0, y: f(10.59) },
      { x: 4, y: f(10.59) },
      { x: 4, y: 5 },
    ]);
    expect(p.area).toBe(20);
    expect(p.cargaArea).toBe(3);
    expect(p.cargaAreaAcidental).toBe(3);
    expect(p.alvenaria).toBe(0);
  });

  it("retrad_laje_calc2 L1 (90°, μ 1,1): gira, trunca, translada e estica x por √1,1", () => {
    // (x, y) → (−y, x): (0,5) (0,10) (4,10) (4,5) → (−5,0) (−10,0) (−10,4) (−5,4);
    // translada para o mínimo (−10, 0) e x' = INT(x·100·√1,1)/100: 5·104,88 → 5,24
    const l1 = laje({ vertices: retangulo(4, 5, 5), angulo: 90, mu: f(1.1) });
    expect(preparaLaje(l1, painel(l1), P, "original").poligono).toEqual([
      { x: f(5.24), y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: f(5.24), y: 4 },
    ]);
  });

  it.each<[string, Alvenaria, number]>([
    // 4 m × 0,5 t/m; fator 1 sobre bordo livre, 0 sobre apoiado ou engastado
    ["sobre o bordo livre y = 5", { inicio: { x: 0, y: 5 }, fim: { x: 4, y: 5 }, carga: 0.5 }, 2],
    ["sobre o bordo apoiado y = 0", { inicio: { x: 0, y: 0 }, fim: { x: 4, y: 0 }, carga: 0.5 }, 0],
    ["interna, 2 m", { inicio: { x: 1, y: 1 }, fim: { x: 3, y: 1 }, carga: 0.5 }, 1],
    [
      "cortando o contorno, 2 m dentro",
      { inicio: { x: -2, y: 1 }, fim: { x: 2, y: 1 }, carga: 0.5 },
      1,
    ],
    ["fora da laje", { inicio: { x: 5, y: 1 }, fim: { x: 6, y: 1 }, carga: 0.5 }, 0],
  ])("alvenaria %s: %f t", (_, a, esperado) => {
    const l = laje({ codigos: [0, 1, 0, 0] });
    expect(preparaLaje(l, painel(l, { alvenarias: [a] }), P, "original").alvenaria).toBe(esperado);
  });

  it("carga por área sobre meia laje: 10 m² × 0,15 e × 0,05 de acidental", () => {
    const l = laje();
    const carga = { vertices: retangulo(2, 5), total: f(0.15), acidental: f(0.05) };
    const p = preparaLaje(l, painel(l, { cargasPorArea: [carga] }), P, "original");
    expect(p.cargaArea).toBeCloseTo(1.5, 6);
    expect(p.cargaAreaAcidental).toBeCloseTo(0.5, 6);
  });

  it("carga por área em faixa que atravessa a laje: 4 × 2 m² × 0,2", () => {
    const l = laje();
    const faixa = [
      { x: -1, y: 1 },
      { x: -1, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 1 },
    ];
    const p = preparaLaje(
      l,
      painel(l, { cargasPorArea: [{ vertices: faixa, total: f(0.2), acidental: 0 }] }),
      P,
      "original",
    );
    expect(p.cargaArea).toBeCloseTo(1.6, 6);
  });
});

describe("coeficienteDeCarga (LAJECALC.BAS:8172-8411)", () => {
  const coef = (v: Ponto[], codigos: number[]) =>
    coeficienteDeCarga(padraoPorCodigos(v, codigos, P, "original"), [], P, "original");

  it("E2E L1 (4 × 5,59, contínuos à direita e embaixo): termos de livros_laje.md 2.1", () => {
    const c = coef(
      retangulo(4, 5.59, 5).map((p) => ({ x: p.x, y: f(p.y) })),
      [0, 0, 22, 22],
    );
    expect(c.l1a + c.l32).toBeCloseTo(38.36, 4);
    expect(c.l1e / 3).toBeCloseTo(18.2491, 3);
    expect(c.l22).toBeCloseTo(1.5052, 4);
    expect(c.l26).toBeCloseTo(2.1955, 4);
    expect(c.l2a).toBe(0);
    expect(c.l2e).toBe(0);
    expect(c.coeficiente).toBeCloseTo(2.018, 4);
  });

  it("4 × 5 com o bordo y = 5 livre: (14 − 2·l22)/(52/3 − l26/3) = 0,74894", () => {
    // regiões x = 0 e x = 4 (volume 22/3 cada) e y = 0 (triângulo 4·2²/6); cantos de
    // baixo a 45° com projeção 2: l22 = 2·2·(1 − sen45)/(sen45 + 1,14), l26 com h² = 4
    const s = Math.SQRT1_2;
    const l22 = 2 * ((2 * (1 - s)) / (s + 1.14));
    const l26 = 2 * ((2 * 4 * (1 - s)) / (5 * s + 1.14));
    const c = coef(retangulo(4, 5), [0, 1, 0, 0]);
    expect(c.l1a).toBe(14);
    expect(c.l1e).toBeCloseTo(52, 5);
    expect(c.l22).toBeCloseTo(l22, 5);
    expect(c.l26).toBeCloseTo(l26, 5);
    expect(c.coeficiente).toBeCloseTo((14 - 2 * l22) / (52 / 3 - l26 / 3), 5);
  });

  it("dois bordos livres opostos: armada numa direção, c = 8/L² (M = qL²/8)", () => {
    expect(coef(retangulo(4, 5), [1, 0, 1, 0]).coeficiente).toBeCloseTo(8 / 25, 6);
  });

  it("balanço engastado (l_1a = 0): c = −L·i/(L·a²/2) = −1 para a = 2, i = 2", () => {
    const c = coef(retangulo(2, 4), [22, 1, 1, 1]);
    expect(c.l1a).toBe(0);
    expect(c.l32).toBe(8);
    expect(c.l1e / 3).toBeCloseTo(8, 5);
    expect(c.coeficiente).toBe(-1);
  });

  it("balanço sem engaste: mecanismo sem trabalho interno, c = 0", () => {
    // 0/8 com o sinal trocado (l_1a = 0): −0
    expect(coef(retangulo(2, 4), [0, 1, 1, 1]).coeficiente).toBe(-0);
  });

  it("modo corrigido: mesmo coeficiente do E2E", () => {
    const v = retangulo(4, 5.59, 5);
    const c = coeficienteDeCarga(
      padraoPorCodigos(v, [0, 0, 22, 22], PARAMETROS_LAJE, "corrigido"),
      [],
      PARAMETROS_LAJE,
      "corrigido",
    );
    expect(c.coeficiente).toBeCloseTo(2.018, 4);
  });
});

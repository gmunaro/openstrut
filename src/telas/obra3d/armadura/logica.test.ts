// Camada "Armadura": seleção → peças, tubo das barras e agrupamento por material. Os
// valores esperados são contas à mão, escritas nos comentários.
import { describe, expect, it } from "vitest";
import type { Coluna, Elemento3D } from "../api";
import {
  agruparPorMaterial,
  alvoDaSelecao,
  linhasDoPainel,
  malhaTubosVazia,
  motivoSemBarras,
  type PosicaoDesenhada,
  raioDaBarra,
  tiposPresentes,
  tuboDaPolilinha,
} from "./logica";

const el = (
  chave: string,
  tipo: Elemento3D["tipo"],
  nome: string,
  coluna?: string,
): Elemento3D => ({
  chave,
  tipo,
  id: chave,
  nome,
  pavimentoId: "pav",
  nivel: 0,
  repeticao: 1,
  solidos: [],
  secao: "20×40",
  notas: [],
  ...(coluna ? { coluna } : {}),
});

const modelo = {
  elementos: [
    el("viga|0|v1", "viga", "V1"),
    el("escada|0|ve1", "escada", "VE1"),
    el("laje|0|l1", "laje", "L1"),
    el("pilar|0|p1", "pilar", "P1", "c1"),
    el("pilar|1|p1", "pilar", "P1", "c1"),
    el("fundacao|0|p1", "fundacao", "P1", "c1"),
  ],
  colunas: [
    { id: "c1", nome: "P1", chaves: ["pilar|0|p1", "pilar|1|p1"], nasceEmTransicao: false },
  ] satisfies Coluna[],
};

/** Ponto i da malha. */
const ponto = (m: { posicoes: number[] }, i: number) =>
  [m.posicoes[3 * i]!, m.posicoes[3 * i + 1]!, m.posicoes[3 * i + 2]!].map(
    (v) => Math.round(v * 1e9) / 1e9 + 0,
  );

describe("alvoDaSelecao", () => {
  it("viga e viga da escada: só ela", () => {
    expect(alvoDaSelecao(modelo, "viga|0|v1")).toEqual({
      tipo: "viga",
      chaves: ["viga|0|v1"],
      nome: "Viga V1",
    });
    expect(alvoDaSelecao(modelo, "escada|0|ve1")).toMatchObject({
      tipo: "viga",
      nome: "Escada VE1",
    });
  });

  it("um lance de pilar ou a fundação: a coluna inteira, da base ao topo", () => {
    const coluna = { tipo: "coluna", chaves: ["pilar|0|p1", "pilar|1|p1"], nome: "Coluna P1" };
    expect(alvoDaSelecao(modelo, "pilar|1|p1")).toEqual(coluna);
    expect(alvoDaSelecao(modelo, "fundacao|0|p1")).toEqual(coluna);
  });

  it("laje, nada selecionado ou chave que saiu do modelo: nenhum, com o motivo", () => {
    expect(alvoDaSelecao(modelo, "laje|0|l1")).toMatchObject({
      tipo: "nenhum",
      motivo: expect.stringContaining("lajes"),
    });
    expect(alvoDaSelecao(modelo, null).tipo).toBe("nenhum");
    expect(alvoDaSelecao(modelo, "viga|9|sumiu").tipo).toBe("nenhum");
  });
});

describe("tuboDaPolilinha", () => {
  it("trecho reto de (0,0,0) a (0,0,1), raio 1, 4 lados: dois anéis e 8 triângulos", () => {
    const m = malhaTubosVazia();
    tuboDaPolilinha(
      m,
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
      1,
      4,
    );
    // d = +z; N = (0,1,0) × d = (1,0,0); B = d × N = (0,1,0): anel N, B, −N, −B
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => ponto(m, i))).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0, -1, 0],
      [1, 0, 1],
      [0, 1, 1],
      [-1, 0, 1],
      [0, -1, 1],
    ]);
    expect(m.indices).toHaveLength(4 * 6);
    expect(m.indices.slice(0, 6)).toEqual([0, 1, 4, 1, 5, 4]);
    // o primeiro triângulo (1,0,0), (0,1,0), (1,0,1): (−1,1,0) × (0,0,1) = (1,1,0), para fora
    expect(ponto({ posicoes: m.normais }, 0)).toEqual([1, 0, 0]);
  });

  it("canto em L com raio 0,1: meia-esquadria no canto e círculo de novo no fim", () => {
    const m = malhaTubosVazia();
    tuboDaPolilinha(
      m,
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
      ],
      0.1,
      4,
    );
    // d0 = +x: N = (0,1,0) × (1,0,0) = (0,0,−1), B = d0 × N = (0,1,0)
    // canto: plano da bissetriz (1,1,0)/√2; o ponto de dentro (y = +0,1) chega a x = 0,9 e o
    // de fora (y = −0,1) a x = 1,1; os de cima e de baixo, a x = 1
    expect([4, 5, 6, 7].map((i) => ponto(m, i))).toEqual([
      [1, 0, -0.1],
      [0.9, 0.1, 0],
      [1, 0, 0.1],
      [1.1, -0.1, 0],
    ]);
    // fim, perpendicular a +y: os mesmos pontos levados a y = 1, raio 0,1 em volta de (1,1,0)
    expect([8, 9, 10, 11].map((i) => ponto(m, i))).toEqual([
      [1, 1, -0.1],
      [0.9, 1, 0],
      [1, 1, 0.1],
      [1.1, 1, 0],
    ]);
    expect(m.indices).toHaveLength(2 * 4 * 6);
  });

  it("pontos repetidos são ignorados; um ponto só não desenha nada", () => {
    const m = malhaTubosVazia();
    tuboDaPolilinha(m, [{ x: 0, y: 0, z: 0 }], 0.1, 6);
    tuboDaPolilinha(
      m,
      [
        { x: 2, y: 2, z: 2 },
        { x: 2, y: 2, z: 2 },
      ],
      0.1,
      6,
    );
    expect(m.posicoes).toHaveLength(0);
    tuboDaPolilinha(
      m,
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      0.1,
      6,
    );
    expect(m.posicoes).toHaveLength(2 * 6 * 3);
  });

  it("dois tubos na mesma malha: os índices do segundo começam depois do primeiro", () => {
    const m = malhaTubosVazia();
    tuboDaPolilinha(
      m,
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      0.1,
      3,
    );
    tuboDaPolilinha(
      m,
      [
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
      ],
      0.1,
      3,
    );
    // 2 anéis × 3 vértices por tubo: o segundo começa no vértice 6
    expect(Math.min(...m.indices.slice(18))).toBe(6);
    expect(Math.max(...m.indices)).toBe(11);
  });
});

describe("agruparPorMaterial", () => {
  const reta = (y: number, z: number) => [
    { x: 0, y, z },
    { x: 1, y, z },
  ];
  const itens: PosicaoDesenhada[] = [
    {
      chave: "pilar|1|p1",
      nivel: 1,
      posicao: {
        nome: "N2",
        tipo: "estribo",
        phi: 5,
        aco: "CA-60",
        comprimento: 120,
        barras: [reta(3, 0), reta(3.2, 0), reta(3.4, 0)],
      },
    },
    {
      chave: "pilar|1|p1",
      nivel: 1,
      posicao: {
        nome: "N1",
        tipo: "longitudinal",
        phi: 12.5,
        aco: "CA-50",
        comprimento: 340,
        barras: [reta(3, 0.1)],
      },
    },
    {
      chave: "pilar|0|p1",
      nivel: 0,
      posicao: {
        nome: "N3",
        tipo: "estribo",
        phi: 5,
        aco: "CA-60",
        comprimento: 120,
        barras: [reta(0, 0)],
      },
    },
  ];

  it("um grupo por nível e tipo, na ordem nível → legenda, com as barras contadas", () => {
    const g = agruparPorMaterial(itens, (n) => (n === 1 ? 2 : 0));
    expect(g.map((x) => [x.nivel, x.tipo, x.barras])).toEqual([
      [0, "estribo", 1],
      [1, "longitudinal", 1],
      [1, "estribo", 3],
    ]);
    // estribo com 5 lados, 2 anéis por barra: 3 barras × 10 vértices
    expect(g[2]!.malha.posicoes.length / 3).toBe(30);
  });

  it("tira o deslocamento do explodido do nível: y = 3 com deslocamento 2 fica em 1 ± raio", () => {
    const g = agruparPorMaterial(itens, (n) => (n === 1 ? 2 : 0));
    const long = g.find((x) => x.tipo === "longitudinal")!;
    const ys = long.malha.posicoes.filter((_, i) => i % 3 === 1);
    // φ 12,5 mm → raio 6,25 mm
    expect(Math.min(...ys)).toBeCloseTo(1 - 0.00625, 9);
    expect(Math.max(...ys)).toBeCloseTo(1 + 0.00625, 9);
  });
});

describe("Painel", () => {
  it("raio: φ/2000 m, no mínimo 2 mm", () => {
    expect(raioDaBarra(10)).toBe(0.005);
    expect(raioDaBarra(3.4)).toBe(0.002);
  });

  it("linhas com bitola, quantidade desenhada e comprimento; tipos na ordem da legenda", () => {
    const itens: PosicaoDesenhada[] = [
      {
        chave: "a",
        nivel: 0,
        posicao: {
          nome: "N4",
          tipo: "estribo",
          phi: 5,
          aco: "CA-60",
          comprimento: 98,
          barras: [[], [], []],
        },
      },
      {
        chave: "a",
        nivel: 0,
        posicao: {
          nome: "N1",
          tipo: "positiva",
          phi: 10,
          aco: "CA-50",
          comprimento: 455,
          barras: [[], []],
        },
      },
    ];
    expect(linhasDoPainel(itens, () => "")).toEqual([
      {
        chave: "a",
        lance: "",
        nome: "N4",
        tipo: "estribo",
        phi: 5,
        quantidade: 3,
        comprimento: 98,
      },
      {
        chave: "a",
        lance: "",
        nome: "N1",
        tipo: "positiva",
        phi: 10,
        quantidade: 2,
        comprimento: 455,
      },
    ]);
    expect(tiposPresentes(itens.map((i) => i.posicao))).toEqual(["positiva", "estribo"]);
  });

  it("motivo: sem detalhamento, poligonal ou sem longitudinais; nenhum com barras", () => {
    expect(motivoSemBarras(undefined, undefined)).toMatch(/sem detalhamento/);
    expect(motivoSemBarras([], "poligonal")).toMatch(/poligonal/);
    expect(motivoSemBarras([], undefined)).toMatch(/sem barras longitudinais/);
    expect(motivoSemBarras([{}], undefined)).toBeNull();
  });
});

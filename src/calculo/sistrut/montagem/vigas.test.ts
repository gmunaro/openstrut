// Vigas da montagem (vigas.ts) numa obra como a VBX do caso v2par_viga_fluxo (ainda
// sem run no oráculo): eixos y = 0 (0..8), x = 8 (0..5), y = 5 (8..0, sentido
// decrescente), x = 0 e x = 4, pilares só em (0,0), (4,0), (4,5), (0,5). As vigas
// y = 0 e y = 5 têm balanço de 4 m e a viga x = 8 se apoia nas pontas desses
// balanços (carga indexada *n.aa). Esperados: regras do S_2a7a8 (LAJEMONT.BAS:
// 4069-4231) e contas à mão das áreas (livros_laje.md 2.6: k = 4/(1+√3)).
import { describe, expect, it } from "vitest";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type { EixoViga, EsforcosLajes, LajeSistrut, PainelLajes } from "../base/tipos";
import { montaPavimento } from "./reacoes";
import { montaPontos, numeroDoPilar, pesoKgPorM } from "./vigas";

const laje = (nome: string, pts: [number, number][], codigos: number[]): LajeSistrut => ({
  nome,
  tipo: 0,
  vertices: pts.map(([x, y]) => ({ x, y })),
  indicesVertices: [],
  grupo: 0,
  codigos,
  angulo: 0,
  mu: 1,
  cargaPermanente: Math.fround(0.1),
  pesoProprio: Math.fround(0.25),
});
// L1 (0..4) e L2 (4..8), contínuas em x = 4 (código 22)
const lajes = [
  laje(
    "L1",
    [
      [0, 0],
      [0, 5],
      [4, 5],
      [4, 0],
    ],
    [0, 0, 22, 0],
  ),
  laje(
    "L2",
    [
      [8, 0],
      [4, 0],
      [4, 5],
      [8, 5],
    ],
    [0, 22, 0, 0],
  ),
];
const painel: PainelLajes = {
  lajes,
  cargasPorArea: [
    {
      vertices: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 5 },
        { x: 0, y: 5 },
      ],
      total: Math.fround(0.15),
      acidental: Math.fround(0.15),
    },
  ],
  alvenarias: [{ inicio: { x: 0, y: 0 }, fim: { x: 4, y: 0 }, carga: Math.fround(0.6) }],
  continuidades: [],
};
const esforcos: EsforcosLajes = {
  lajes,
  continuidades: [],
  preparadas: {},
  coeficientes: {},
  bordos: {},
  momentos: {},
  avisos: [],
  memoria: [],
};
const eixos: EixoViga[] = [
  {
    nome: "V1",
    pontos: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ],
    apoios: [{ pilar: "P1" }, { pilar: "P2" }, null],
    balancoInicio: false,
    balancoFim: true,
  },
  {
    nome: "V2",
    pontos: [
      { x: 8, y: 0 },
      { x: 8, y: 5 },
    ],
    apoios: [{ viga: "V1" }, { viga: "V3" }],
    balancoInicio: false,
    balancoFim: false,
  },
  {
    nome: "V3",
    pontos: [
      { x: 8, y: 5 },
      { x: 4, y: 5 },
      { x: 0, y: 5 },
    ],
    apoios: [null, { pilar: "P3" }, { pilar: "P4" }],
    balancoInicio: true,
    balancoFim: false,
  },
  {
    nome: "V4",
    pontos: [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
    ],
    apoios: [{ pilar: "P1" }, { pilar: "P4" }],
    balancoInicio: false,
    balancoFim: false,
  },
  {
    nome: "V5",
    pontos: [
      { x: 4, y: 0 },
      { x: 4, y: 5 },
    ],
    apoios: [{ pilar: "P2" }, { pilar: "P3" }],
    balancoInicio: false,
    balancoFim: false,
  },
];

const r = montaPavimento(
  esforcos,
  painel,
  eixos,
  () => null,
  { predominanteKgPorM: pesoKgPorM(0.15), excecoes: {} },
  emSingle(PARAMETROS_LAJE),
  "original",
);
const viga = (n: string) => {
  const v = r.vigas.find((x) => x.nome === n);
  if (!v) throw new Error(`viga ${n} ausente`);
  return v;
};
const k = 4 / (1 + Math.sqrt(3));
/** Áreas da laje 4×5 com o bordo de 5 m oposto ao engaste apoiado (livros 2.6). */
const areaBase = 2 * k; // bordos de 4 m
const areaApoiado = ((5 + (5 - 2 * k)) / 2) * k; // bordo de 5 m apoiado

describe("viga sobre viga, balanço e carga indexada (obra VBX)", () => {
  it("peso próprio em kg/m inteiro: CINT(0,15·1000) = 150", () => {
    expect(pesoKgPorM(0.15)).toBe(150);
    expect(pesoKgPorM(0.1234)).toBe(123);
    expect(numeroDoPilar("P7")).toBe(7);
    expect(numeroDoPilar("12")).toBe(12);
    expect(numeroDoPilar("PA")).toBe(0);
  });

  it("V1: tramo 0..4 e balanço direito de 4 m com a reação indexada de V2 na ponta", () => {
    const v = viga("V1");
    expect(v.tramos.map((t) => t.vao)).toEqual([4]);
    expect(v.balancoDireito?.vao).toBe(4);
    expect(v.balancoEsquerdo).toBeUndefined();
    expect(v.pilares).toEqual(["P1", "P2"]);
    // J: apoio 0 = P1, tramo 1 termina em P2, balanço direito 1,0 (LAJEMONT.BAS:4207)
    expect(v.inerciasBrutas).toEqual([Math.fround(1.00001), Math.fround(1.00002), 1]);
    const ponta = v.balancoDireito?.divisoes[0];
    expect(ponta?.indexada).toEqual({ viga: "V2", apoio: 0 });
    expect(ponta?.d).toBe(4);
  });

  it("V1: carga uniforme q·A/L, com a alvenaria de 0,6 t/m sobre o tramo", () => {
    const v = viga("V1");
    const t1 = v.tramos[0]?.divisoes[0];
    const bal = v.balancoDireito?.divisoes[0];
    // tramo: 0,15 + 0,6 + 0,5·A/4; balanço: 0,15 + 0,5·A/4 (L2, base apoiada)
    expect(Math.abs((t1?.p ?? 0) - (0.15 + 0.6 + (0.5 * areaBase) / 4))).toBeLessThan(2e-6);
    expect(Math.abs((bal?.p ?? 0) - (0.15 + (0.5 * areaBase) / 4))).toBeLessThan(2e-6);
    expect(Math.abs((bal?.pAcidental ?? 0) - (0.15 * areaBase) / 4)).toBeLessThan(2e-6);
  });

  it("V3 (eixo de 8 para 0): balanço esquerdo com a reação indexada de V2 na ponta", () => {
    const v = viga("V3");
    expect(v.balancoEsquerdo?.vao).toBe(4);
    expect(v.tramos.map((t) => t.vao)).toEqual([4]);
    expect(v.pilares).toEqual(["P3", "P4"]);
    expect(v.balancoEsquerdo?.divisoes[0]?.indexada).toEqual({ viga: "V2", apoio: 1 });
    // J(0) = P3 no fim do balanço, J(1) = P4
    expect(v.inerciasBrutas).toEqual([Math.fround(1.00003), Math.fround(1.00004)]);
  });

  it("V2 apoiada nas duas vigas: J 1,00471 (apoio sem pilar) e carga do bordo direito de L2", () => {
    const v = viga("V2");
    expect(v.tramos.map((t) => t.vao)).toEqual([5]);
    expect(v.pilares).toEqual([null, null]);
    expect(v.inerciasBrutas).toEqual([Math.fround(1.00471), Math.fround(1.00471)]);
    const p = v.tramos[0]?.divisoes[0]?.p ?? 0;
    expect(Math.abs(p - (0.15 + (0.5 * areaApoiado) / 5))).toBeLessThan(2e-6);
  });

  it("totais: peso próprio das vigas pelos vãos (balanços incluídos) e painel", () => {
    // V1 8 m, V2 5, V3 8, V4 5, V5 5 = 31 m × 0,15
    expect(Math.abs(r.totais.pesoProprioVigas - 31 * 0.15)).toBeLessThan(1e-5);
    expect(Math.abs(r.totais.alvenarias - 2.4)).toBeLessThan(1e-5);
    expect(Math.abs(r.totais.alvenariasNominal - 2.4)).toBeLessThan(1e-5);
    // painel = alvenaria + 0,15·40 + pp vigas + 0,25·40 + 0,10·40
    expect(Math.abs(r.totais.painel - (2.4 + 6 + 4.65 + 10 + 4))).toBeLessThan(1e-4);
    expect(Math.abs(r.totais.vigas - r.totais.painel)).toBeLessThan(1e-4);
    expect(r.totais.pilares).toBe(0);
    // V3 foi dada de 8 para 0: o original supõe eixo crescente (o LAJEGEOM grava assim)
    expect(r.avisos).toEqual([expect.stringContaining("Viga V3: eixo em ordem decrescente")]);
  });
});

describe("pontos do eixo e pilar-parede (S_3014b)", () => {
  const t = {
    modo: "original" as const,
    s: Math.fround,
    tol: Math.fround(0.005),
    eps: Math.fround(0.002),
  };
  const pesoNulo = { predominanteKgPorM: 0, excecoes: {} };
  const eixo = (pontos: [number, number][], apoios: EixoViga["apoios"]): EixoViga => ({
    nome: "V1",
    pontos: pontos.map(([x, y]) => ({ x, y })),
    apoios,
    balancoInicio: false,
    balancoFim: false,
  });

  it("eixo decrescente: o original insere antes do primeiro x maior (LAJEMONT.BAS:4806-4814)", () => {
    const e = [
      eixo(
        [
          [8, 0],
          [0, 0],
        ],
        [{ pilar: "P1" }, { pilar: "P2" }],
      ),
    ];
    const avisos: string[] = [];
    const [o] = montaPontos(e, [{ x: 4, y: 0 }], ["", "P1", "P2"], pesoNulo, t, avisos, "original");
    expect(o?.x.slice(1)).toEqual([4, 8, 0]);
    expect(avisos).toHaveLength(1);
    const [c] = montaPontos(e, [{ x: 4, y: 0 }], ["", "P1", "P2"], pesoNulo, t, [], "corrigido");
    expect(c?.x.slice(1)).toEqual([8, 4, 0]);
  });

  it("pilar-parede igual ao trecho da viga: engaste (Ee) e o tramo começa na ponta da parede", () => {
    const r2 = montaPavimento(
      { ...esforcos, lajes: [] },
      { ...painel, lajes: [], cargasPorArea: [], alvenarias: [] },
      [
        eixo(
          [
            [0, 0],
            [1, 0],
            [6, 0],
          ],
          [null, null, null],
        ),
      ],
      () => null,
      pesoNulo,
      emSingle(PARAMETROS_LAJE),
      "original",
      [
        { nome: "P1", inicio: { x: 0, y: 0 }, fim: { x: 1, y: 0 } },
        { nome: "P2", inicio: { x: 6, y: 0 }, fim: { x: 6, y: 0 } },
      ],
    );
    const v = r2.vigas[0];
    expect(v?.engasteEsquerdo).toBe(true);
    expect(v?.tramos.map((x) => x.vao)).toEqual([5]);
    expect(v?.pilares).toEqual(["P1", "P2"]);
  });

  it("dois pilares de mesmo nome em pontos seguidos sem coincidir com o trecho: dois apoios", () => {
    const geo = [
      { nome: "P1", inicio: { x: 0, y: -0.5 }, fim: { x: 0, y: 0.5 } },
      { nome: "P1", inicio: { x: 1, y: -0.5 }, fim: { x: 1, y: 0.5 } },
      { nome: "P2", inicio: { x: 6, y: 0 }, fim: { x: 6, y: 0 } },
    ];
    const esfVazio: EsforcosLajes = { ...esforcos, lajes: [] };
    const painelVazio: PainelLajes = { ...painel, lajes: [], cargasPorArea: [], alvenarias: [] };
    const pontos: [number, number][] = [
      [0, 0],
      [1, 0],
      [6, 0],
    ];
    const com = montaPavimento(
      esfVazio,
      painelVazio,
      [eixo(pontos, [null, null, null])],
      () => null,
      pesoNulo,
      emSingle(PARAMETROS_LAJE),
      "original",
      geo,
    ).vigas[0];
    expect(com?.engasteEsquerdo).toBe(false);
    expect(com?.tramos.map((x) => x.vao)).toEqual([1, 5]);
    expect(com?.pilares).toEqual(["P1", "P1", "P2"]);
    // sem a geometria, o mesmo nome em pontos seguidos é tratado como pilar-parede
    const sem = montaPavimento(
      esfVazio,
      painelVazio,
      [eixo(pontos, [{ pilar: "P1" }, { pilar: "P1" }, { pilar: "P2" }])],
      () => null,
      pesoNulo,
      emSingle(PARAMETROS_LAJE),
      "original",
    ).vigas[0];
    expect(sem?.engasteEsquerdo).toBe(true);
    expect(sem?.tramos.map((x) => x.vao)).toEqual([5]);
  });

  it("bordo de laje sobre pilar-parede: a carga vai ao pilar (L_29708) e ao total dos pilares", () => {
    const l = laje(
      "L1",
      [
        [0, 0],
        [0, 5],
        [4, 5],
        [4, 0],
      ],
      [0, 0, 0, 0],
    );
    const r3 = montaPavimento(
      { ...esforcos, lajes: [l] },
      { ...painel, lajes: [l], cargasPorArea: [], alvenarias: [] },
      [
        eixo(
          [
            [0, 5],
            [4, 5],
          ],
          [{ pilar: "P1" }, { pilar: "P2" }],
        ),
      ],
      () => null,
      pesoNulo,
      emSingle(PARAMETROS_LAJE),
      "original",
      [
        { nome: "PP", inicio: { x: 0, y: 0 }, fim: { x: 0, y: 5 } },
        { nome: "P1", inicio: { x: 0, y: 5 }, fim: { x: 0, y: 5 } },
        { nome: "P2", inicio: { x: 4, y: 5 }, fim: { x: 4, y: 5 } },
      ],
    );
    const noPilar = r3.reacoes.find((x) => x.apoio.tipo === "pilar");
    expect(noPilar?.apoio).toEqual({ tipo: "pilar", pilar: "PP" });
    // bordo esquerdo de 5 m, laje apoiada: trapézio de 6 m² × (0,10 + 0,25)
    expect(Math.abs((noPilar?.area ?? 0) - 6)).toBeLessThan(1e-4);
    // bordo de cima na viga (4 m² × 0,35); os outros dois sem viga também vão ao
    // total dos pilares, com aviso, como o original faz com apoio em branco
    expect(Math.abs(r3.totais.pilares - (20 - 4) * 0.35)).toBeLessThan(1e-4);
    expect(r3.avisos).toHaveLength(2);
  });
});

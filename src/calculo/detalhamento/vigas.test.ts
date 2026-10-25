// Detalhamento de vigas. As envoltórias de entrada são escritas à mão (fórmula
// fechada da viga, amostrada a cada 1 cm), não saem de analisaVigaContinua; os
// comprimentos esperados são contas à mão com as regras de docs/DETALHAMENTO.md.
// Constantes de C25/CA-50 (ver ancoragem.test.ts): fctd = 1,282482 MPa,
// fyd = 434,7826 MPa, lb φ12,5 boa = 47,0856 cm, lb φ10 má = 53,8122 cm.
import { describe, expect, it } from "vitest";
import { areaBarra } from "../barras";
import type { MateriaisCalc } from "../tipos";
import type { TramoResultado } from "../vigas/continua";
import {
  decalagem6118,
  decalagemNb178,
  detalharViga,
  REGRAS_NB178,
  type PosicaoArmadura,
  type SecaoDetalhada,
  type TramoDimensionado,
  type VigaDetalhamentoEntrada,
} from "./vigas";

const c25: MateriaisCalc = {
  fck: 25,
  fcd: 25 / 1.4,
  sigmaCd: (0.85 * 25) / 1.4,
  fyk: 500,
  fyd: 500 / 1.15,
  fywd: 500 / 1.15,
  ecs: 0,
  es: 210_000,
  aco: "CA-50",
  acoEstribo: "CA-60",
};

/** Tramo com envoltória dada por funções de x (m), amostrada a cada 1 cm. */
function tramo(
  comprimento: number,
  mMax: (x: number) => number,
  mMin: (x: number) => number,
  vEsq: number,
  vDir: number,
  balanco = false,
): TramoResultado {
  const n = Math.round(comprimento * 100);
  const pontos = Array.from({ length: n + 1 }, (_, i) => {
    const x = (comprimento * i) / n;
    return { x, mMax: mMax(x), mMin: mMin(x) };
  });
  return {
    comprimento,
    balanco,
    mPos: Math.max(0, ...pontos.map((p) => p.mMax)),
    mNegEsq: Math.min(0, pontos[0]?.mMin ?? 0),
    mNegDir: Math.min(0, pontos.at(-1)?.mMin ?? 0),
    vEsq,
    vDir,
    pontos,
  };
}

const secao = (as: number, n: number, phi: number): SecaoDetalhada => ({
  flexao: { as, asComprimida: 0 },
  barras: { n, phi, area: n * areaBarra(phi) },
});
const vazia: SecaoDetalhada = { flexao: null, barras: null };

const resumo = (p: PosicaoArmadura) => ({
  nome: p.nome,
  tipo: p.tipo,
  tramo: p.tramo,
  phi: p.phi,
  quantidade: p.quantidade,
  comprimento: p.comprimento,
  reto: p.reto,
  ganchoInicio: p.ganchoInicio,
  ganchoFim: p.ganchoFim,
});

describe("decalagem", () => {
  // bw = 20, d = 45: Vc = 0,6 · 0,1282482 · 20 · 45 = 69,254 kN
  it("6118: Vsd = 200 kN → al = 45 · 200 / (2 (200 − 69,254)) = 34,42 cm", () => {
    expect(decalagem6118(200, 20, 45, c25).al).toBeCloseTo(34.4179, 3);
  });
  it("6118: Vsd = 1000 kN → 45 · 1000 / (2 · 930,746) = 24,17 cm (≥ 0,5 d = 22,5)", () => {
    expect(decalagem6118(1000, 20, 45, c25).al).toBeCloseTo(24.1742, 3);
  });
  it("6118: Vsd ≤ Vc → al = d; Vsd pouco acima de Vc → limitado a d", () => {
    expect(decalagem6118(50, 20, 45, c25).al).toBe(45);
    expect(decalagem6118(100, 20, 45, c25).al).toBe(45);
  });
  it("NB-1/78: al = 0,75 d = 33,75 cm (SISTRUT.DSP)", () => {
    expect(decalagemNb178(45).al).toBeCloseTo(33.75, 9);
  });
});

// Viga biapoiada de 5 m, 20 × 50, d = 46, c = 2,5, pilares de 20 cm.
// g = 15 kN/m, q = 5 kN/m: mMax = 10 x (5 − x); mMin = 7,5 x (5 − x) (sem negativo);
// V = 20 · 5 / 2 = 50 kN. Positivo 4 φ12,5 (As = 4,7; As,ef = 4,909), estribo φ5 c/15.
const biapoiada = (larguraApoios: number[]): VigaDetalhamentoEntrada => ({
  nome: "V1",
  bw: 20,
  h: 50,
  d: 46,
  cobrimento: 2.5,
  larguraApoios,
  tramos: [
    tramo(
      5,
      (x) => 10 * x * (5 - x),
      (x) => 7.5 * x * (5 - x),
      50,
      50,
    ),
  ],
  dimensionamento: [
    {
      positivo: secao(4.7, 4, 12.5),
      negativoEsq: vazia,
      negativoDir: vazia,
      estribo: { phi: 5, espacamento: 15 },
    },
  ],
  gamaF: 1.4,
  mat: c25,
});

describe("viga biapoiada (6118)", () => {
  const r = detalharViga(biapoiada([20, 20]));
  it("três posições: positivo, porta-estribos, estribos", () => {
    expect(r.posicoes.map(resumo)).toEqual([
      // de −(10 − 2,5) a 500 + 7,5: reto 515; gancho 8 φ + 2,5 φ + φ = 14,375 → 15
      {
        nome: "N1",
        tipo: "positiva",
        tramo: 0,
        phi: 12.5,
        quantidade: 4,
        comprimento: 545,
        reto: 515,
        ganchoInicio: 15,
        ganchoFim: 15,
      },
      // sem negativo: de face externa a face externa menos o cobrimento, 2 φ6,3 (h ≤ 70)
      {
        nome: "N2",
        tipo: "porta-estribos",
        tramo: 0,
        phi: 6.3,
        quantidade: 2,
        comprimento: 515,
        reto: 515,
        ganchoInicio: 0,
        ganchoFim: 0,
      },
      // l = 500 − 10 − 10 = 480; n = ⌈480/15⌉ + 1 = 33;
      // 2 (20 − 5) + 2 (50 − 5) + 2 · máx(5 · 0,5; 5) = 30 + 90 + 10 = 130
      {
        nome: "N3",
        tipo: "estribo",
        tramo: 0,
        phi: 5,
        quantidade: 33,
        comprimento: 130,
        reto: 130,
        ganchoInicio: 0,
        ganchoFim: 0,
      },
    ]);
    expect(r.posicoes[2]?.aco).toBe("CA-60");
    expect(r.posicoes[2]?.espacamento).toBe(15);
    expect(r.posicoes[0]?.xInicio).toBeCloseTo(-7.5, 9);
    expect(r.posicoes[0]?.xFim).toBeCloseTo(507.5, 9);
  });
  // Apoio extremo (18.3.2.4): Vsd = 1,4 · 50 = 70 ≤ Vc = 0,6 · 0,1282482 · 20 · 46 = 70,79
  // → al = d; As,anc = (al/d) Vsd/fyd = 70 / 43,478 = 1,610 cm²;
  // lb,nec = máx(0,7 · 47,0856 · 1,610/4,909 = 10,81; lb,mín = máx(14,13; 12,5; 10);
  //   r + 5,5 φ = 3,125 + 6,875 = 10; 6) = 14,13 cm; lb,ef = 20 − 2,5 = 17,5 → ok
  it("ancoragem no apoio extremo de 20 cm basta: sem avisos", () => {
    expect(r.avisos).toEqual([]);
  });
  it("apoio de 15 cm: lb,ef = 12,5 < 14,13 → aviso", () => {
    const r15 = detalharViga(biapoiada([15, 20]));
    expect(r15.avisos).toHaveLength(1);
    expect(r15.avisos[0]).toContain("apoio 1 insuficiente");
  });
});

describe("viga biapoiada (NB-1/78, ganchos da V1)", () => {
  const r = detalharViga(
    { ...biapoiada([20, 20]), mat: { ...c25, acoEstribo: "CA-50" } },
    REGRAS_NB178,
  );
  it("positivo com ganchos de 10 φ = 12,5 → 13 cm: 515 + 26 = 541", () => {
    expect(r.posicoes[0]?.comprimento).toBe(541);
  });
  it("estribo 20 × 50, c = 2,5, φ5: 2 · 15 + 2 · 45 + 10 = 130 (V1 DcComprEstribo#)", () => {
    expect(r.posicoes[2]?.comprimento).toBe(130);
  });
  // lb NB-1/78 φ12,5: τbu = 0,42 · (25/1,4)^(2/3) = 0,42 · 6,8322 = 2,8695 MPa;
  // lb = 1,25/4 · 434,78/2,8695 = 47,35 cm. No apoio extremo, a conta da 6118 com esse
  // lb e al = 0,75 d: As,anc = 0,75 · 1,4 · 50/43,478 = 1,2075 cm²;
  // lb,nec = 0,7 · 47,35 · 1,2075/4,909 = 8,15 < lb,mín = 0,3 · 47,35 = 14,2;
  // r + 5,5 φ = 2,5 · 1,25 + 6,875 = 10,0. Exigido 14,2 cm.
  it("ancoragem no apoio extremo pela conta da 6118 com o lb da NB-1/78: 17,5 ≥ 14,2, sem aviso", () => {
    expect(r.avisos).toEqual([]);
  });
  it("apoio de 12 cm: lb,ef = 9,5 < 14,2, aviso nos dois apoios", () => {
    const estreito = detalharViga(
      { ...biapoiada([12, 12]), mat: { ...c25, acoEstribo: "CA-50" } },
      REGRAS_NB178,
    );
    expect(estreito.avisos).toEqual([
      "V1 N1: ancoragem no apoio 1 insuficiente (lb,ef = 9,5 cm < 14,2 cm); use grampos ou aumente o apoio.",
      "V1 N1: ancoragem no apoio 2 insuficiente (lb,ef = 9,5 cm < 14,2 cm); use grampos ou aumente o apoio.",
    ]);
  });
});

// Viga de 2 tramos: vão P1–P2 de 5 m e balanço de 1,5 m à direita de P2.
// 20 × 40, d = 36, c = 2,5, pilares de 20 cm. g = 10 kN/m, q = 5 kN/m.
// Vão (x de P1, m): Mg = 22,75 x − 5 x² (R1 = (10 · 25/2 − 11,25)/5 = 22,75);
//   q no vão: 2,5 x (5 − x); q no balanço: −1,125 x.
//   mMax = Mg + q vão = 35,25 x − 7,5 x² (zero em 4,70 m, pico em 2,35 m);
//   mMin = Mg + q balanço = 21,625 x − 5 x² (zero em 4,325 m; −16,875 em P2).
//   V em P1: 22,75 + 12,5 = 35,25 kN; em P2: 27,25 + 12,5 + 1,125 = 40,875 kN.
// Balanço (x de P2): mMax = −5 (1,5 − x)²; mMin = −7,5 (1,5 − x)²; V em P2 = 22,5 kN.
/** Entrada da viga V2; `negP2` = seção do negativo em P2. */
function entradaV2(negP2 = secao(1.2, 2, 10)): VigaDetalhamentoEntrada {
  const dim: TramoDimensionado[] = [
    {
      positivo: secao(3.0, 3, 12.5),
      negativoEsq: vazia,
      negativoDir: negP2,
      estribo: { phi: 5, espacamento: 20 },
    },
    {
      positivo: vazia,
      negativoEsq: negP2,
      negativoDir: vazia,
      estribo: { phi: 5, espacamento: 20 },
    },
  ];
  return {
    nome: "V2",
    bw: 20,
    h: 40,
    d: 36,
    cobrimento: 2.5,
    larguraApoios: [20, 20, 0],
    tramos: [
      tramo(
        5,
        (x) => 35.25 * x - 7.5 * x * x,
        (x) => 21.625 * x - 5 * x * x,
        35.25,
        40.875,
      ),
      tramo(
        1.5,
        (x) => -5 * (1.5 - x) ** 2,
        (x) => -7.5 * (1.5 - x) ** 2,
        22.5,
        0,
        true,
      ),
    ],
    dimensionamento: dim,
    gamaF: 1.4,
    mat: c25,
  };
}

describe("viga de 2 tramos com balanço (6118)", () => {
  const r = detalharViga(entradaV2());
  // al: Vc = 0,6 · 0,1282482 · 20 · 36 = 55,40 kN. Vão: Vsd = 1,4 · 40,875 = 57,23 > Vc
  //   → 36 · 57,23 / (2 · 1,82) > d → al = d = 36. Balanço: Vsd = 31,5 ≤ Vc → al = 36.
  it("seis posições na ordem da V1", () => {
    expect(r.posicoes.map(resumo)).toEqual([
      // N1 positivo 3 φ12,5 (boa; lb,nec = 47,0856 · 3,0/3,682 = 38,37):
      //   início no apoio extremo: −7,5 com gancho 15;
      //   fim em P2 = máx(500 − 10 + 12,5 = 502,5; zero 470 + al 36 + 10 φ 12,5 = 518,5;
      //   pico 235 + 36 + 38,37 = 309,4) = 518,5 → reto 526
      {
        nome: "N1",
        tipo: "positiva",
        tramo: 0,
        phi: 12.5,
        quantidade: 3,
        comprimento: 541,
        reto: 526,
        ganchoInicio: 15,
        ganchoFim: 0,
      },
      // N2 negativo de P2, 2 φ10, má aderência (h = 40 < 60, barra a 36 cm do fundo):
      //   lb = 53,81; lb,nec = máx(53,81 · 1,2/1,571 = 41,11; 16,14) = 41,11.
      //   No vão: máx(0,25 · 500 + 53,81 = 178,81; diagrama máx(36 + 41,11;
      //   (500 − 432,5) + 36 + 10 = 113,5)) = 178,81.
      //   No balanço: até a ponta, 150 − 2,5 = 147,5, gancho 8 + 2,5 + 1 = 11,5 → 12.
      //   reto = 178,81 + 147,5 = 326,31 → 327
      {
        nome: "N2",
        tipo: "negativa",
        tramo: 0,
        phi: 10,
        quantidade: 2,
        comprimento: 339,
        reto: 327,
        ganchoInicio: 0,
        ganchoFim: 12,
      },
      // N3 porta-estribos: de −7,5 (P1 sem negativo) a 500 − 178,81 + 15 = 336,19 → 343,69 → 344
      {
        nome: "N3",
        tipo: "porta-estribos",
        tramo: 0,
        phi: 6.3,
        quantidade: 2,
        comprimento: 344,
        reto: 344,
        ganchoInicio: 0,
        ganchoFim: 0,
      },
      // N4 estribos do vão: l = 480, n = 480/20 + 1 = 25; 2 · 15 + 2 · 35 + 10 = 110
      {
        nome: "N4",
        tipo: "estribo",
        tramo: 0,
        phi: 5,
        quantidade: 25,
        comprimento: 110,
        reto: 110,
        ganchoInicio: 0,
        ganchoFim: 0,
      },
      // N5 inferiores construtivas do balanço: de 500 − 10 − 15 = 475 a 650 − 2,5 → 172,5 → 173
      {
        nome: "N5",
        tipo: "construtiva",
        tramo: 1,
        phi: 6.3,
        quantidade: 2,
        comprimento: 173,
        reto: 173,
        ganchoInicio: 0,
        ganchoFim: 0,
      },
      // N6 estribos do balanço: l = 150 − 10 − 2,5 = 137,5; n = ⌈6,875⌉ + 1 = 8
      {
        nome: "N6",
        tipo: "estribo",
        tramo: 1,
        phi: 5,
        quantidade: 8,
        comprimento: 110,
        reto: 110,
        ganchoInicio: 0,
        ganchoFim: 0,
      },
    ]);
  });
  it("abscissas do negativo: de 500 − 178,81 a 647,5", () => {
    expect(r.posicoes[1]?.xInicio).toBeCloseTo(500 - 178.8122, 3);
    expect(r.posicoes[1]?.xFim).toBeCloseTo(647.5, 9);
  });
  // P1: Vsd = 1,4 · 35,25 = 49,35; As,anc = 49,35/43,478 = 1,135; lb,nec com gancho
  //   = máx(0,7 · 47,09 · 1,135/3,682 = 10,16; 14,13; 10; 6) = 14,13 ≤ 17,5
  it("sem avisos", () => {
    expect(r.avisos).toEqual([]);
  });
});

// Negativo que cobre os dois vãos: 4 m + 1 m, mMin < 0 em todo o comprimento
// (zero só nos apoios extremos). Pelo diagrama a barra passaria do vão
// (zero a 400 cm do nó + al + 10 φ), então entra nos apoios extremos com gancho:
// 400 + 10 − 2,5 = 407,5 à esquerda e 100 + 10 − 2,5 = 107,5 à direita;
// reto = 515; ganchos φ10 = 11,5 → 12 cada.
describe("negativo que cobre vãos inteiros (6118)", () => {
  const neg = secao(1.2, 2, 10);
  const r = detalharViga({
    nome: "V3",
    bw: 20,
    h: 40,
    d: 36,
    cobrimento: 2.5,
    larguraApoios: [20, 20, 20],
    tramos: [
      tramo(
        4,
        (x) => 5 * x * (4 - x),
        (x) => -2.5 * x,
        10,
        10,
      ),
      tramo(
        1,
        (x) => -5 * (1 - x),
        (x) => -10 * (1 - x),
        10,
        10,
      ),
    ],
    dimensionamento: [
      { positivo: secao(2, 2, 12.5), negativoEsq: vazia, negativoDir: neg, estribo: null },
      { positivo: vazia, negativoEsq: neg, negativoDir: vazia, estribo: null },
    ],
    gamaF: 1.4,
    mat: c25,
  });
  it("vai de apoio extremo a apoio extremo com ganchos", () => {
    const n = r.posicoes.find((p) => p.tipo === "negativa");
    expect(n && resumo(n)).toMatchObject({ reto: 515, ganchoInicio: 12, ganchoFim: 12 });
    expect(n?.xInicio).toBeCloseTo(-7.5, 9);
    expect(n?.xFim).toBeCloseTo(507.5, 9);
  });
  it("sem porta-estribos nos dois vãos", () => {
    expect(r.posicoes.filter((p) => p.tipo === "porta-estribos")).toEqual([]);
  });
});

// Barra lisa: a V2 com CA-25 (fyk 250). Toda ponta de barra tracionada leva gancho
// (6118 9.4.2.1 a), inclusive as que param dentro do vão ou além do apoio interno.
// 6118, semicircular (9.4.2.3), D = 4 φ: π (D + φ)/2 + 2 φ = (7,854 + 2) φ = 9,854 φ:
//   φ12,5 → 12,317 → 13 cm; φ10 → 9,854 → 10 cm. NB-1/78 (V1): 10 φ → 13 e 10 cm.
describe("barra lisa CA-25: ganchos nas pontas tracionadas", () => {
  const ca25: MateriaisCalc = { ...c25, fyk: 250, fyd: 250 / 1.15, aco: "CA-25" };
  it.each([
    ["6118", undefined],
    ["NB-1/78", REGRAS_NB178],
  ] as const)(
    "%s: positivo com gancho no apoio interno P2, negativo nas duas pontas",
    (_, regras) => {
      const r = detalharViga({ ...entradaV2(), mat: ca25 }, regras);
      const pos = r.posicoes.find((p) => p.tipo === "positiva");
      const neg = r.posicoes.find((p) => p.tipo === "negativa");
      expect(pos && [pos.ganchoInicio, pos.ganchoFim]).toEqual([13, 13]);
      expect(neg && [neg.ganchoInicio, neg.ganchoFim]).toEqual([10, 10]);
    },
  );
});

describe("armadura dupla no negativo do apoio interno", () => {
  it("A's no negativo de P2 → aviso de A's não detalhada", () => {
    const negDupla: SecaoDetalhada = {
      flexao: { as: 1.2, asComprimida: 0.5 },
      barras: { n: 2, phi: 10, area: 2 * areaBarra(10) },
    };
    const r = detalharViga(entradaV2(negDupla));
    const avisos = r.avisos.filter((a) => a.includes("armadura comprimida"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("apoio 2");
    expect(avisos[0]).toContain("A's = 0,50");
  });
});

// Vãos 4 + 1 + 4 m; o do meio todo em momento negativo. 20 × 40, d = 36, c = 2,5,
// pilares de 20 cm. Envoltória (x em m do nó esquerdo de cada tramo):
//   tramo 1: mMax = 5 x (4 − x); mMin = 2,5 x (3 − x) (zero a 3 m; −10 em P2);
//   tramo 2: mMax = mMin = −10; tramo 3: simétrico ao 1.
// V = 10 kN → Vsd = 14 ≤ Vc = 55,40 → al = d = 36.
// Negativo de P2, 2 φ10 (As = 1,2; As,ef = 1,5708), má aderência: lb = 53,81;
//   lb,nec = 53,81 · 1,2/1,5708 = 41,11. Regra da V1: 0,25 · 400 + 53,81 = 153,81.
//   No tramo 1: diagrama máx(36 + 41,11; 100 + 36 + 10 = 146) → 153,81 < 400.
//   No tramo 2: zero no fim (100) → máx(77,11; 146) → 153,81 ≥ 100 e P3 é interno:
//   a barra passa o eixo de P3 por máx(153,81 − 100; lb,nec = 41,11) = 53,81 cm
//   (18.3.2.3), em vez de parar no eixo de P3, onde ainda está tracionada.
//   xInicio = 400 − 153,81 = 246,19; xFim = 500 + 53,81 = 553,81; reto 307,62 → 308.
describe("negativo que cobre um vão curto entre apoios internos (6118)", () => {
  const neg = secao(1.2, 2, 10);
  const r = detalharViga({
    nome: "V4",
    bw: 20,
    h: 40,
    d: 36,
    cobrimento: 2.5,
    larguraApoios: [20, 20, 20, 20],
    tramos: [
      tramo(
        4,
        (x) => 5 * x * (4 - x),
        (x) => 2.5 * x * (3 - x),
        10,
        10,
      ),
      tramo(
        1,
        () => -10,
        () => -10,
        10,
        10,
      ),
      tramo(
        4,
        (x) => 5 * x * (4 - x),
        (x) => 2.5 * (4 - x) * (x - 1),
        10,
        10,
      ),
    ],
    dimensionamento: [
      { positivo: secao(2, 2, 12.5), negativoEsq: vazia, negativoDir: neg, estribo: null },
      { positivo: vazia, negativoEsq: neg, negativoDir: neg, estribo: null },
      { positivo: secao(2, 2, 12.5), negativoEsq: neg, negativoDir: vazia, estribo: null },
    ],
    gamaF: 1.4,
    mat: c25,
  });
  const negs = r.posicoes.filter((p) => p.tipo === "negativa");
  it("negativo de P2 passa 53,81 cm além do eixo de P3", () => {
    expect(negs[0]?.xInicio).toBeCloseTo(400 - 153.8122, 3);
    expect(negs[0]?.xFim).toBeCloseTo(500 + 53.8122, 3);
    expect(negs[0]?.reto).toBe(308);
  });
  it("negativo de P3, simétrico: de 400 − 53,81 a 500 + 153,81", () => {
    expect(negs[1]?.xInicio).toBeCloseTo(400 - 53.8122, 3);
    expect(negs[1]?.xFim).toBeCloseTo(500 + 153.8122, 3);
  });
  it("sem aviso de ancoragem além do apoio", () => {
    expect(r.avisos.filter((a) => a.includes("além do apoio"))).toEqual([]);
  });
});

describe("entrada inconsistente", () => {
  it("larguras de apoio em número errado: aviso e nenhuma posição", () => {
    const r = detalharViga(biapoiada([20]));
    expect(r.posicoes).toEqual([]);
    expect(r.avisos).toHaveLength(1);
  });
});

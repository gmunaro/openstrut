/// <reference types="node" />
// Montagem lajes → vigas (T6) contra o original: obra E2E do oráculo (caso a), com a
// entrada lida do E2E.LAJ que o próprio original gravou e os esperados (1) impressos no
// relatório de reações (caso_a_laje.json), (2) ecoados pelo VIGA (caso_b_viga.json) e
// (3) gravados no E2E.VIG binário do run (registros de 855 bytes).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type { EixoViga, EsforcosLajes, LajeSistrut, PainelLajes } from "../base/tipos";
import { bateComImpresso, CASOS_ORACULO, valorOraculo } from "../__oraculo__/index";
import { montaPavimentoSistrut } from "./reacoes";

const casoA = CASOS_ORACULO.caso_a_laje;
const casoB = CASOS_ORACULO.caso_b_viga;
if (!casoA || !casoB) throw new Error("casos do oráculo ausentes");

/** E2E.VIG do run do caso a (igual ao de C:/tmp/oraculo/casos/caso_b_viga.dados). */
const VIG_E2E = "C:/tmp/oraculo/runs/caso_a_laje-20261015-041425/obra/E2E.VIG";

const P = emSingle(PARAMETROS_LAJE);

// Lajes do E2E.LAJ (linhas 80-181): vértices 1 (0,0) 2 (8,0) 3 (4,0) 4 (8,5) 5 (0,5)
// 6 (4,5) 7 (0,10) 8 (8,10) 9 (4,10); L1 = polígono 4 (5,7,9,6), L2 = 3 (4,6,9,8),
// L3 = 1 (1,5,6,3), L4 = 2 (2,3,6,4); códigos depois da otimização (22 = i 2,0).
const laje = (
  nome: string,
  pts: [number, number][],
  codigos: number[],
  indices: number[],
): LajeSistrut => ({
  nome,
  tipo: 0,
  vertices: pts.map(([x, y]) => ({ x, y })),
  indicesVertices: indices,
  grupo: 0,
  codigos,
  angulo: 0,
  mu: 0.8,
  cargaPermanente: Math.fround(0.1),
  pesoProprio: Math.fround(0.25),
  h: 10,
});
const lajesE2E = [
  laje(
    "L1",
    [
      [0, 5],
      [0, 10],
      [4, 10],
      [4, 5],
    ],
    [0, 0, 22, 22],
    [5, 7, 9, 6],
  ),
  laje(
    "L2",
    [
      [8, 5],
      [4, 5],
      [4, 10],
      [8, 10],
    ],
    [22, 22, 0, 0],
    [4, 6, 9, 8],
  ),
  laje(
    "L3",
    [
      [0, 0],
      [0, 5],
      [4, 5],
      [4, 0],
    ],
    [0, 22, 22, 0],
    [1, 5, 6, 3],
  ),
  laje(
    "L4",
    [
      [8, 0],
      [4, 0],
      [4, 5],
      [8, 5],
    ],
    [0, 22, 22, 0],
    [2, 3, 6, 4],
  ),
];
const painelE2E: PainelLajes = {
  lajes: lajesE2E,
  cargasPorArea: [
    {
      vertices: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 10 },
        { x: 0, y: 10 },
      ],
      total: Math.fround(0.15),
      acidental: Math.fround(0.15),
    },
  ],
  alvenarias: [],
  continuidades: [],
};
const esforcosE2E: EsforcosLajes = {
  lajes: lajesE2E,
  continuidades: [],
  preparadas: {},
  coeficientes: {},
  bordos: {},
  momentos: {},
  avisos: [],
  memoria: [],
};
const eixo = (nome: string, pts: [number, number][], pilares: string[]): EixoViga => ({
  nome,
  pontos: pts.map(([x, y]) => ({ x, y })),
  apoios: pilares.map((p) => ({ pilar: p })),
  balancoInicio: false,
  balancoFim: false,
});
// Vigas do E2E.LAJ (linhas 232-264) e pilares do E2E.RLP (P1..P9 na grade 3×3)
const eixosE2E = [
  eixo(
    "V1",
    [
      [0, 10],
      [4, 10],
      [8, 10],
    ],
    ["P7", "P8", "P9"],
  ),
  eixo(
    "V2",
    [
      [0, 5],
      [4, 5],
      [8, 5],
    ],
    ["P6", "P5", "P4"],
  ),
  eixo(
    "V3",
    [
      [0, 0],
      [4, 0],
      [8, 0],
    ],
    ["P1", "P2", "P3"],
  ),
  eixo(
    "V4",
    [
      [0, 0],
      [0, 5],
      [0, 10],
    ],
    ["P1", "P6", "P7"],
  ),
  eixo(
    "V5",
    [
      [4, 0],
      [4, 5],
      [4, 10],
    ],
    ["P2", "P5", "P8"],
  ),
  eixo(
    "V6",
    [
      [8, 0],
      [8, 5],
      [8, 10],
    ],
    ["P3", "P4", "P9"],
  ),
];
// peso próprio: predominante 0,15 t/m, V1-V3 0,12 t/m (roteiro do caso a)
const pesos = { predominanteKgPorM: 150, excecoes: { V1: 120, V2: 120, V3: 120 } };

const monta = (modo: "original" | "corrigido") =>
  montaPavimentoSistrut(
    esforcosE2E,
    painelE2E,
    eixosE2E,
    () => null,
    pesos,
    modo === "original" ? P : PARAMETROS_LAJE,
    modo,
  );

describe.each(["original", "corrigido"] as const)("E2E, modo %s", (modo) => {
  const r = monta(modo);

  it("reações por bordo: área, Área, Estru e Peso como no relatório (caso a)", () => {
    expect(r.avisos).toEqual([]);
    expect(r.reacoes).toHaveLength(16);
    for (const reac of r.reacoes) {
      if (reac.apoio.tipo !== "viga") throw new Error("apoio deveria ser viga");
      const id = `${reac.laje}>${reac.apoio.viga}`;
      const conf = [
        ["area", reac.area],
        ["qArea", reac.cargaArea],
        ["qEstru", reac.estrutura],
        ["qPeso", reac.peso],
      ] as const;
      for (const [g, calc] of conf) {
        const v = valorOraculo(casoA, `${id}.${g}`);
        expect(bateComImpresso(v, calc), `${id}.${g}: ${calc} × ${v.impresso}`).toBe(true);
      }
    }
  });

  it("ordem das sub-áreas de L1 como impressa: V4, V1, V5, V2", () => {
    const l1 = r.reacoes.filter((x) => x.laje === "L1");
    expect(l1.map((x) => (x.apoio.tipo === "viga" ? x.apoio.viga : ""))).toEqual([
      "V4",
      "V1",
      "V5",
      "V2",
    ]);
    expect(l1.map((x) => x.bordo)).toEqual([0, 1, 2, 3]);
  });

  it("totais do relatório: 12,00 / 7,38 / 20,00 / 8,00 / 47,38", () => {
    const tt = r.totais;
    const pares = [
      ["total.cargasArea", tt.cargasPorAreaNominal],
      ["total.cargasAreaConsiderado", tt.cargasPorArea],
      ["total.ppVigas", tt.pesoProprioVigas],
      ["total.ppLajes", tt.pesoProprioLajes],
      ["total.estrutura", tt.estrutura],
      ["total.painel", tt.painel],
      ["total.vigas", tt.vigas],
      ["total.pilares", tt.pilares],
      ["total.vigasPilares", tt.vigas + tt.pilares],
    ] as const;
    for (const [id, calc] of pares) {
      const v = valorOraculo(casoA, id);
      expect(bateComImpresso(v, calc), `${id}: ${calc} × ${v.impresso}`).toBe(true);
    }
  });

  it("dados de tramo ecoados pelo VIGA (caso b): L, J, D, F e P", () => {
    for (const v of r.vigas) {
      v.tramos.forEach((t, i) => {
        const div = t.divisoes[0];
        if (!div) throw new Error(`${v.nome} sem divisão`);
        expect(t.divisoes).toHaveLength(1);
        const pares = [
          ["L", t.vao],
          ["J", t.inercia],
          ["D", div.d],
          ["F", div.f],
          ["P", div.p],
        ] as const;
        for (const [g, calc] of pares) {
          const o = valorOraculo(casoB, `${v.nome}.t${i + 1}.${g}`);
          expect(
            bateComImpresso(o, calc),
            `${v.nome}.t${i + 1}.${g}: ${calc} × ${o.impresso}`,
          ).toBe(true);
        }
      });
    }
  });

  it(".VIG do PLANO/livros 2.6: V6 0,5892 e 0,1318; V5 1,672; V1 0,486", () => {
    const viga = (n: string) => r.vigas.find((v) => v.nome === n);
    const d1 = (n: string) => viga(n)?.tramos[0]?.divisoes[0];
    expect(Math.abs((d1("V6")?.p ?? 0) - 0.5892)).toBeLessThanOrEqual(0.00005);
    expect(Math.abs((d1("V6")?.pAcidental ?? 0) - 0.1318)).toBeLessThanOrEqual(0.00005);
    expect(Math.abs((d1("V5")?.p ?? 0) - 1.672)).toBeLessThanOrEqual(0.0005);
    expect(Math.abs((d1("V1")?.p ?? 0) - 0.486)).toBeLessThanOrEqual(0.0005);
  });
});

/** Decodifica o .VIG do original (S_33d84/RT_REG_168A_LE, LAJEMONT.BAS:702-924): por
 *  registro de 855 bytes, nome (1-20), tramos (26), Be/Bd/Ee/Ed (28-34), por tramo t
 *  (36+12t) nº de divisões, acumulado, L e J, por divisão k (216+20k) P, D, F, Pac, Fac. */
function lerVig(caminho: string) {
  const b = readFileSync(caminho);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const regs = [];
  for (let r = 1; r < b.byteLength / 855; r++) {
    const o = r * 855 - 1;
    const i16 = (p: number) => dv.getInt16(o + p, true);
    const f32 = (p: number) => dv.getFloat32(o + p, true);
    const tramos = [];
    for (let t = 0; t < 14; t++) {
      const base = 36 + 12 * t;
      tramos.push({
        divisoes: i16(base),
        acumulado: i16(base + 2),
        l: f32(base + 4),
        j: f32(base + 8),
      });
    }
    const divisoes = [];
    for (let k = 0; k <= 30; k++) {
      const base = 216 + 20 * k;
      divisoes.push({
        p: f32(base),
        d: f32(base + 4),
        f: f32(base + 8),
        pac: f32(base + 12),
        fac: f32(base + 16),
      });
    }
    regs.push({
      nome: b.toString("latin1", o + 1, o + 21).trim(),
      n: i16(26),
      be: i16(28),
      bd: i16(30),
      ee: i16(32),
      ed: i16(34),
      tramos,
      divisoes,
    });
  }
  return regs;
}

describe.skipIf(!existsSync(VIG_E2E))(`.VIG gravado pelo original (${VIG_E2E})`, () => {
  const r = monta("original");
  const regs = lerVig(VIG_E2E);

  it("mesmas vigas, tramos, balanços e engastes", () => {
    expect(regs.map((x) => x.nome)).toEqual(r.vigas.map((v) => v.nome));
    for (const [i, v] of r.vigas.entries()) {
      const g = regs[i];
      expect(g?.n).toBe(v.tramos.length);
      expect(g?.be).toBe(v.balancoEsquerdo ? 1 : 0);
      expect(g?.bd).toBe(v.balancoDireito ? 1 : 0);
      expect(g?.ee).toBe(v.engasteEsquerdo ? 1 : 0);
      expect(g?.ed).toBe(v.engasteDireito ? 1 : 0);
    }
  });

  it("J bruto de cada apoio (1 + nº do pilar/100000) igual bit a bit; L e D exatos", () => {
    for (const [i, v] of r.vigas.entries()) {
      const g = regs[i];
      if (!g) throw new Error("registro ausente");
      v.inerciasBrutas.forEach((j, t) => expect(j, `${v.nome} J(${t})`).toBe(g.tramos[t]?.j));
      v.tramos.forEach((t, k) => {
        expect(t.vao).toBe(g.tramos[k + 1]?.l);
        expect(t.divisoes[0]?.d).toBe(g.divisoes[k + 1]?.d);
      });
    }
  });

  it("P e Pac de cada divisão iguais bit a bit (SINGLE)", () => {
    for (const [i, v] of r.vigas.entries()) {
      const g = regs[i];
      v.tramos.forEach((t, k) => {
        const div = t.divisoes[0];
        const gd = g?.divisoes[k + 1];
        expect(div?.p, `${v.nome} P${k + 1}`).toBe(gd?.p);
        expect(div?.pAcidental, `${v.nome} Pac${k + 1}`).toBe(gd?.pac);
      });
    }
  });
});

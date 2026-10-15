/// <reference types="node" />
// Dimensionamento da V1 da obra E2E (20×50, 2 tramos de 4 m, q = 0,486 t/m) contra o
// que o original imprime: retrad_des_det (impressora.prn:42-51) e a sonda p6 (tela
// g14 e impressão da 2ª passada). A análise de entrada é a conta à mão da viga
// contínua de dois vãos iguais com carga uniforme (M = −qL²/8, Ve = 3qL/8, Vd = 5qL/8,
// x = 3L/8, M+ = 9qL²/128), conferida contra os esforços que o original imprime.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CasoOraculo,
  CASOS_ORACULO,
  bateComImpresso,
  numeroOraculo,
  valorOraculo,
} from "../__oraculo__";
import { sng } from "../base/f32";
import { PARAMETROS_DSP, emSingle } from "../base/parametros";
import type {
  AnaliseViga,
  DadosViga,
  EntradaDesdim,
  MateriaisSistrut,
  ModoSistrut,
  SecaoViga,
} from "../base/tipos";
import { CASOS_DESDIM } from "./__desdim__";
import { dimensionaViga, dimensionaVigaDesdim, esforcosDesdim } from "./desdim";

const det = CASOS_ORACULO.retrad_des_det!;
const p6 = CASOS_DESDIM.retrad_des_p6!;

/** Entrada da V1 do caso det, nas unidades do original. */
function entradaV1(modo: ModoSistrut): EntradaDesdim {
  const s = modo === "original" ? sng : (x: number) => x;
  const q = s(0.486);
  const L = 4;
  const tramo = {
    vao: L,
    inercia: 1,
    divisoes: [{ p: q, d: L, f: 0, pAcidental: 0, fAcidental: 0 }],
  };
  const viga: DadosViga = {
    nome: "V1",
    tramos: [tramo, tramo],
    engasteEsquerdo: false,
    engasteDireito: false,
    momentosExternos: [0, 0],
    pilares: ["P1", "P2", "P3"],
  };
  const m1 = s((-q * L * L) / 8);
  const ve = s((3 * q * L) / 8);
  const vd = s((5 * q * L) / 8);
  const mp = s((9 * q * L * L) / 128);
  const apoio = (m: number, r: number) => ({ m, r, rMax: r, rMin: r, mMax: m });
  const analise: AnaliseViga = {
    nome: "V1",
    apoios: [apoio(0, ve), apoio(m1, 2 * vd), apoio(0, ve)],
    tramos: [
      { ve, vd, x: s((3 * L) / 8), mPositivo: mp, fEJ: 0 },
      { ve: vd, vd: ve, x: s((5 * L) / 8), mPositivo: mp, fEJ: 0 },
    ],
    somaReacoes: s(2 * q * L),
    mepEsquerdo: 0,
    mepDireito: 0,
    momentosPilar: [0, 0],
    engastamentoPerfeito: [],
    avisos: [],
    memoria: [],
  };
  const secao: SecaoViga = { bw: 20, hw: 50, bf: 0, hf: 0 };
  const forma = { larguraApoio: 20, vaoLivre: 380, pe: 0, hle: 0, pd: 0, hld: 0 };
  const materiais: MateriaisSistrut = {
    fck: s(0.15),
    fyk: 5,
    classeAco: "B",
    gamaF: s(1.4),
    gamaC: s(1.4),
    gamaS: s(1.15),
  };
  return {
    viga,
    analise,
    secoes: { tramos: [secao, secao], apoios: [secao, secao, secao] },
    forma: { tramos: [forma, forma] },
    materiais,
    parametros: modo === "original" ? emSingle(PARAMETROS_DSP) : PARAMETROS_DSP,
  };
}

/** Confere o número com o impresso no caso (meia unidade da última casa). */
function bate(caso: CasoOraculo, id: string, calculado: number) {
  const v = valorOraculo(caso, id);
  expect(
    bateComImpresso(v, calculado),
    `${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
}

describe("entrada da V1: a análise à mão bate com os esforços impressos (retrad_des_det)", () => {
  const { analise } = entradaV1("original");
  it.each([
    ["V1.a1.M-", analise.apoios[1]!.m],
    ["V1.t1.Ve", analise.tramos[0]!.ve],
    ["V1.t1.x", analise.tramos[0]!.x],
    ["V1.t1.M+", analise.tramos[0]!.mPositivo],
    ["V1.t1.Vd", analise.tramos[0]!.vd],
    ["V1.t2.x", analise.tramos[1]!.x],
    ["V1.t2.Vd", analise.tramos[1]!.vd],
  ])("%s", (id, valor) => bate(det, id, valor));
});

describe("adaptador análise → DESDIM: alívio do cortante (DESDIM.BAS:6509)", () => {
  it("q até h/2 = 0,25 m de cada apoio: 0,729 − 0,1215 e 1,215 − 0,1215", () => {
    const e = esforcosDesdim(entradaV1("original"), "original");
    const [t1, t2] = e.tramos;
    // conta à mão: V − q·h/2
    expect(t1!.vkEsquerda).toBeCloseTo(0.729 - 0.486 * 0.25, 5);
    expect(t1!.vkDireita).toBeCloseTo(1.215 - 0.486 * 0.25, 5);
    bate(det, "V1.t1.Vke", t1!.vkEsquerda);
    bate(det, "V1.t1.Vkd", t1!.vkDireita);
    bate(det, "V1.t2.Vke", t2!.vkEsquerda);
    bate(det, "V1.t2.Vkd", t2!.vkDireita);
  });

  it("sem alívio no .DSP os cortantes ficam os da análise", () => {
    const entrada = entradaV1("original");
    const e = esforcosDesdim(
      { ...entrada, parametros: { ...entrada.parametros, alivioCortante: false } },
      "original",
    );
    expect(e.tramos[0]!.vkEsquerda).toBe(entrada.analise.tramos[0]!.ve);
  });
});

/** Viga de um tramo de 4 m, 20×50, com as divisões dadas e a análise isostática à mão;
 *  balanço direito opcional (vão, carga q uniforme). */
function entradaUmTramo(
  divisoes: { p: number; d: number; f: number }[],
  ve: number,
  vd: number,
  balanco?: { vao: number; q: number },
): EntradaDesdim {
  const base = entradaV1("corrigido");
  const div = divisoes.map((d) => ({ ...d, pAcidental: 0, fAcidental: 0 }));
  const secao = base.secoes.tramos[0]!;
  const mBal = balanco ? (-balanco.q * balanco.vao ** 2) / 2 : 0;
  return {
    ...base,
    viga: {
      ...base.viga,
      tramos: [{ vao: 4, inercia: 1, divisoes: div }],
      ...(balanco
        ? {
            balancoDireito: {
              vao: balanco.vao,
              inercia: 1,
              divisoes: [{ p: balanco.q, d: balanco.vao, f: 0, pAcidental: 0, fAcidental: 0 }],
            },
          }
        : {}),
      pilares: ["P1", "P2"],
    },
    analise: {
      ...base.analise,
      apoios: [
        { m: 0, r: ve, rMax: ve, rMin: ve, mMax: 0 },
        { m: mBal, r: vd, rMax: vd, rMin: vd, mMax: mBal },
      ],
      tramos: [{ ve, vd, x: 2, mPositivo: 1, fEJ: 0 }],
      ...(balanco ? { balancoDireito: { mApoio: mBal, carga: balanco.q * balanco.vao } } : {}),
    },
    secoes: { tramos: [secao], apoios: [secao, secao] },
    forma: { tramos: [base.forma.tramos[0]!] },
  };
}

describe("adaptador: alívio com divisões e concentradas (L_5602e)", () => {
  it("q em duas divisões (0,1 e 4 m): tira q·h/2 = 0,25 dos dois lados", () => {
    const e = esforcosDesdim(
      entradaUmTramo(
        [
          { p: 1, d: 0.1, f: 0 },
          { p: 1, d: 4, f: 0 },
        ],
        2,
        2,
      ),
      "corrigido",
    );
    expect(e.tramos[0]!.vkEsquerda).toBeCloseTo(2 - 0.25, 12);
    expect(e.tramos[0]!.vkDireita).toBeCloseTo(2 - 0.25, 12);
  });
  it("P = 2 t a 0,6 m (< 2h = 1 m) do apoio esquerdo: Ve 1,7 − P·(L − a)/L·(1 − a/2h) = 1,02", () => {
    const e = esforcosDesdim(
      entradaUmTramo(
        [
          { p: 0, d: 0.6, f: 2 },
          { p: 0, d: 4, f: 0 },
        ],
        1.7,
        0.3,
      ),
      "corrigido",
    );
    expect(e.tramos[0]!.vkEsquerda).toBeCloseTo(1.7 - ((2 * 3.4) / 4) * (1 - 0.6 / 1), 12);
    expect(e.tramos[0]!.vkDireita).toBeCloseTo(0.3, 12);
  });
  it("P = 2 t a 0,6 m do apoio direito: Vd 1,7 − P·a'/L·(1 − 0,6/1)", () => {
    const e = esforcosDesdim(
      entradaUmTramo(
        [
          { p: 0, d: 3.4, f: 2 },
          { p: 0, d: 4, f: 0 },
        ],
        0.3,
        1.7,
      ),
      "corrigido",
    );
    expect(e.tramos[0]!.vkDireita).toBeCloseTo(1.7 - ((2 * 3.4) / 4) * (1 - 0.6 / 1), 12);
  });
});

describe("balanço direito (1,5 m, q = 1 t/m): apoio 1 dimensionado e só o cortante do lado do apoio", () => {
  const e = entradaUmTramo([{ p: 1, d: 4, f: 0 }], 2, 2, { vao: 1.5, q: 1 });
  const r = dimensionaVigaDesdim(e, "corrigido");
  it("apoios dimensionados: só o 1 (o do balanço)", () => {
    expect(r.apoios.map((a) => a.dimensionado)).toEqual([false, true]);
    expect(r.apoios[1]!.mk).toBeCloseTo(1.125, 12);
  });
  it("cortante do balanço: carga 1,5 − q·h/2 = 1,25; lado livre em branco; sem flexão nem flecha", () => {
    const b = r.balancoDireito!;
    expect(b.indice).toBe(2);
    expect(b.cisalhamento.vkEsquerda).toBeCloseTo(1.25, 12);
    expect(b.cisalhamento.vkDireita).toBe(0);
    expect(b.cisalhamento.estriboDireita.texto).toBe("");
    expect(b.cisalhamento.estriboEsquerda.texto).toBe("#5/12");
    expect(b.flecha).toBe(0);
    expect(b.flexao.as).toBe(0);
  });
  it("balanço sem seção própria herda a do apoio vizinho (DESDIM.BAS:2919)", () => {
    expect(r.balancoDireito!.cisalhamento.aswEsquerda).toBeCloseTo(2.8, 12);
  });
});

describe("dimensionamento da V1, modo original, contra retrad_des_det (impressora.prn:42-51)", () => {
  const r = dimensionaVigaDesdim(entradaV1("original"), "original");
  const a1 = r.apoios[1]!;
  const [t1, t2] = r.tramos;

  it("só o apoio 1 é dimensionado (extremos sem balanço, engaste ou Mext)", () => {
    expect(r.apoios.map((a) => a.dimensionado)).toEqual([false, true, false]);
  });

  it("apoio 1: x/d, Mk, Ast (As,mín 0,0015·20·50), Asc, barras", () => {
    bate(det, "V1.a1.x/d", a1.xd);
    bate(det, "V1.a1.Mk-", a1.mk);
    bate(det, "V1.a1.As-", a1.as);
    bate(det, "V1.a1.Asc", a1.asCompressao);
    expect(a1.arranjo).toBe(valorOraculo(det, "V1.a1.barras-").impresso);
    expect(a1.arranjoCompressao).toBe("-");
  });

  it.each([
    [1, t1],
    [2, t2],
  ] as const)("tramo %i: x/d, Mk, As, Asc, Vk, Asw, flecha, barras, estribos", (n, t) => {
    const id = (sufixo: string) => `V1.t${n}.${sufixo}`;
    bate(det, id("x/d"), t!.flexao.xd);
    bate(det, id("Mk+"), t!.flexao.mk);
    bate(det, id("As+"), t!.flexao.as);
    bate(det, id("Asc"), t!.flexao.asCompressao);
    bate(det, id("Vke"), t!.cisalhamento.vkEsquerda);
    bate(det, id("Asw.e"), t!.cisalhamento.aswEsquerda);
    bate(det, id("Vkd"), t!.cisalhamento.vkDireita);
    bate(det, id("Asw.d"), t!.cisalhamento.aswDireita);
    bate(det, id("flecha"), t!.flecha);
    expect(t!.flechaTexto).toBe(` ${valorOraculo(det, id("flecha")).impresso}`);
    expect(t!.flexao.arranjo).toBe(valorOraculo(det, id("barras+")).impresso);
    expect(t!.cisalhamento.estriboEsquerda.texto).toBe(valorOraculo(det, id("estribo.e")).impresso);
    expect(t!.cisalhamento.estriboDireita.texto).toBe(valorOraculo(det, id("estribo.d")).impresso);
    expect(t!.cisalhamento.estribo).toEqual({
      bitola: 5,
      ramos: 2,
      espacamentoEsquerda: 12,
      espacamentoDireita: 12,
    });
  });

  it("flecha: EJ·f do tramo extremo = q·x(L³ − 3Lx² + 2x³)/48 em x = 1,5 (conta à mão)", () => {
    const q = 0.486;
    const esperado = (q * 1.5 * (64 - 3 * 4 * 1.5 ** 2 + 2 * 1.5 ** 3)) / 48;
    expect(t1!.ejf).toBeCloseTo(esperado, 5);
    expect(t2!.ejf).toBeCloseTo(esperado, 5);
  });

  it("sem avisos e com memória", () => {
    expect(r.avisos).toEqual([]);
    expect(r.memoria.length).toBeGreaterThan(0);
  });
});

describe("sonda p6 (tela g14, janela das bitolas de estribo e 2ª passada impressa)", () => {
  const r = dimensionaVigaDesdim(entradaV1("original"), "original");
  const a1 = r.apoios[1]!;
  const [t1, t2] = r.tramos;
  it("bitolas de estribo da viga: máxima 5, mínima 5", () => {
    expect(r.bitolasEstribo.maxima).toBe(numeroOraculo(p6, "V1.estribo.bitolaMaxima"));
    expect(r.bitolasEstribo.minima).toBe(numeroOraculo(p6, "V1.estribo.bitolaMinima"));
  });
  it("tela e impressão", () => {
    bate(p6, "V1.a1.x/d", a1.xd);
    bate(p6, "imp.V1.a1.x/d", a1.xd);
    bate(p6, "V1.a1.Mk-", a1.mk);
    bate(p6, "V1.a1.As-", a1.as);
    bate(p6, "V1.a1.Asc", a1.asCompressao);
    expect(a1.arranjo).toBe(valorOraculo(p6, "V1.a1.barras-").impresso);
    expect(a1.arranjo).toBe(valorOraculo(p6, "imp.V1.a1.barras-").impresso);
    bate(p6, "V1.t1.x/d", t1!.flexao.xd);
    bate(p6, "V1.t1.Mk+", t1!.flexao.mk);
    bate(p6, "V1.t1.As+", t1!.flexao.as);
    bate(p6, "V1.t1.Vke", t1!.cisalhamento.vkEsquerda);
    bate(p6, "imp.V1.t1.Vke", t1!.cisalhamento.vkEsquerda);
    bate(p6, "V1.t1.Asw.e", t1!.cisalhamento.aswEsquerda);
    bate(p6, "V1.t1.Vkd", t1!.cisalhamento.vkDireita);
    bate(p6, "V1.t1.Asw.d", t1!.cisalhamento.aswDireita);
    bate(p6, "V1.t1.flecha", t1!.flecha);
    expect(t1!.flexao.arranjo).toBe(valorOraculo(p6, "V1.t1.barras+").impresso);
    expect(t1!.cisalhamento.estriboEsquerda.texto).toBe(
      valorOraculo(p6, "V1.t1.estribo.e").impresso,
    );
    bate(p6, "V1.t2.x/d", t2!.flexao.xd);
    bate(p6, "V1.t2.Vke", t2!.cisalhamento.vkEsquerda);
    bate(p6, "imp.V1.t2.Vke", t2!.cisalhamento.vkEsquerda);
    bate(p6, "V1.t2.Vkd", t2!.cisalhamento.vkDireita);
    bate(p6, "V1.t2.flecha", t2!.flecha);
    expect(t2!.cisalhamento.estriboDireita.texto).toBe(
      valorOraculo(p6, "V1.t2.estribo.d").impresso,
    );
    expect(t2!.cisalhamento.estriboEsquerda.texto).toBe(
      valorOraculo(p6, "imp.V1.t2.estribo.e").impresso,
    );
  });
});

describe("entrada das sondas p3 e p5 = a do teste", () => {
  it("seção 20,50,0,0 e vãos livres 380", () => {
    const e = entradaV1("original");
    const s = e.secoes.tramos[0]!;
    expect(`${s.bw},${s.hw},${s.bf},${s.hf}`).toBe(
      valorOraculo(CASOS_DESDIM.retrad_des_p3!, "V1.secao").impresso,
    );
    expect(e.forma.tramos[0]!.vaoLivre).toBe(
      numeroOraculo(CASOS_DESDIM.retrad_des_p5!, "V1.t1.vaoLivre"),
    );
    expect(e.forma.tramos[1]!.vaoLivre).toBe(
      numeroOraculo(CASOS_DESDIM.retrad_des_p5!, "V1.t2.vaoLivre"),
    );
  });
});

describe("modo corrigido", () => {
  it("na V1 nenhum defeito R8/R9/H atua: os números impressos são os mesmos", () => {
    const r = dimensionaViga(entradaV1("corrigido"), "corrigido");
    bate(det, "V1.a1.x/d", r.apoios[1]!.xd);
    bate(det, "V1.a1.As-", r.apoios[1]!.as);
    bate(det, "V1.t1.x/d", r.tramos[0]!.flexao.xd);
    bate(det, "V1.t1.Asw.e", r.tramos[0]!.cisalhamento.aswEsquerda);
    bate(det, "V1.t1.flecha", r.tramos[0]!.flecha);
    expect(r.tramos[0]!.flexao.arranjo).toBe("2#10");
  });

  it("H: com CA-25 (2,549 t/cm²) a As,mín é 0,25 %·20·50 = 2,50 cm²; no original, 1,50", () => {
    const e = entradaV1("corrigido");
    const ca25 = { ...e, materiais: { ...e.materiais, fyk: 2.549, classeAco: "A" as const } };
    expect(dimensionaViga(ca25, "corrigido").tramos[0]!.flexao.as).toBeCloseTo(2.5, 10);
    const o = entradaV1("original");
    const ca25o = { ...o, materiais: { ...o.materiais, fyk: 2.5, classeAco: "A" as const } };
    expect(dimensionaViga(ca25o, "original").tramos[0]!.flexao.as).toBeCloseTo(1.5, 6);
  });
});

describe("fontes dos JSONs de __desdim__", () => {
  for (const caso of Object.values(CASOS_DESDIM)) {
    const temRun = existsSync(caso.run);
    it.skipIf(!temRun)(`${caso.caso}: cada fonte contém o impresso`, () => {
      for (const v of caso.valores) {
        const sep = v.fonte.lastIndexOf(":");
        const linhas = readFileSync(join(caso.run, v.fonte.slice(0, sep)), "latin1").split("\n");
        expect(linhas[Number(v.fonte.slice(sep + 1)) - 1], `${v.id} em ${v.fonte}`).toContain(
          v.impresso,
        );
      }
    });
  }
});

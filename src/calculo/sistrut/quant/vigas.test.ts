/// <reference types="node" />
// Quantitativos de viga do original (quadro do .TAB e resumo geral do DESENHO) contra o
// oráculo: retrad_des_det (quadro de aço do DXF), retrad_des_menu (resumo impresso),
// retrad_des_p5/p6 (.TAB gravado) e retrad_des_p10 (resumo na tela, vigas/__desinit__/),
// e contra as contas à mão de livros_arm_forma_des.md 2.2.
import { readFileSync } from "node:fs";
import { arquivoOraculo } from "../__oraculo__/arquivosOraculo";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bateComImpresso,
  CASOS_ORACULO,
  type CasoOraculo,
  numeroOraculo,
  valorOraculo,
} from "../__oraculo__/index";
import { emSingle, PARAMETROS_DSP } from "../base/parametros";
import type { FormaViga, QuadroViga, SecoesViga } from "../base/tipos";
import { DIMENSIONAMENTO_V1, ENTRADA_V1 } from "../vigas/__desinit__/casoV1";
import p10 from "../vigas/__desinit__/retrad_des_p10.json";
import { detalhaViga } from "../vigas/desinit";
import { pesoNoDesenho, quadroDaViga, resumoGeralVigas, volumeEForma } from "./vigas";

const det = CASOS_ORACULO.retrad_des_det!;
const menu = CASOS_ORACULO.retrad_des_menu!;
const casoP10 = p10 as CasoOraculo;
const dsp = emSingle(PARAMETROS_DSP);
/** Índice da bitola no .DSP (0..9) e o rótulo do id do oráculo. */
const BITOLAS = [
  [1, "5"],
  [2, "6.3"],
  [4, "10"],
] as const;

const quadroV1 = (modo: "original" | "corrigido") =>
  quadroDaViga(
    detalhaViga(ENTRADA_V1, DIMENSIONAMENTO_V1, modo),
    ENTRADA_V1.secoes,
    ENTRADA_V1.forma,
    0,
    dsp,
    modo,
  );

/** Registro do .TAB (70 bytes: nome, A_1CEC(0..14) em SINGLE; DESINIT.BAS:933). */
function leTab(run: string) {
  const b = readFileSync(arquivoOraculo(join(run, "obra/E2E.TAB")));
  const v = Array.from({ length: 15 }, (_, i) => b.readFloatLE(10 + 4 * i));
  return {
    nome: b.toString("latin1", 0, 10).trim(),
    rept: v[0],
    vol: v[1],
    forma: v[2],
    comp: v.slice(5),
  };
}

describe("quadro da V1 (.TAB de retrad_des_det)", () => {
  const q = quadroV1("original");

  it("volume 76 e fôrma 912 (centésimos): 20·50·760/10⁴ e (2·50 + 20)·760/100 (livros 2.2)", () => {
    expect(q.volumeCentesimos).toBe(76);
    expect(q.formaCentesimos).toBe(912);
  });

  it("comprimento por bitola = quadro de aço do DXF (φ5 8448, φ6.3 1153, φ10 2612 cm)", () => {
    for (const [i, rotulo] of BITOLAS) {
      expect(q.comprimentoPorBitola[i]).toBe(
        numeroOraculo(det, `V1.quadro.phi${rotulo}.comprimento`),
      );
    }
    expect(q.comprimentoPorBitola.filter((c) => c !== 0)).toHaveLength(3);
  });

  it("peso do .TAB CINT(c·kg/100) = 14/3/16; o do desenho (DESIMP) arredonda para cima: 14/3/17", () => {
    expect([q.pesoPorBitola[1], q.pesoPorBitola[2], q.pesoPorBitola[4]]).toEqual([14, 3, 16]);
    for (const [i, rotulo] of BITOLAS) {
      expect(pesoNoDesenho(q.comprimentoPorBitola[i]!, dsp.bitolas[i]!.kgPorM)).toBe(
        numeroOraculo(det, `V1.quadro.phi${rotulo}.peso`),
      );
    }
  });

  it("taxa INT(100/76·33) = 43 kg/m³ (DESINIT.BAS:852)", () => {
    expect(q.taxa).toBe(43);
  });

  it("corrigido dá o mesmo quadro (o caso não tem defeito do DESINIT)", () => {
    const c = quadroV1("corrigido");
    expect([c.volumeCentesimos, c.formaCentesimos, c.comprimentoPorBitola]).toEqual([
      q.volumeCentesimos,
      q.formaCentesimos,
      q.comprimentoPorBitola,
    ]);
  });

  for (const run of [
    det.run,
    ...["p5-20261015-082948", "p6-20261015-082952"].map((r) => `oraculo/runs/retrad_des_${r}`),
  ]) {
    it(`igual ao .TAB gravado pelo original em ${run}`, () => {
      const tab = leTab(run);
      expect(tab.nome).toBe("~V1");
      expect(tab.rept).toBe(q.repeticoes);
      expect([tab.vol, tab.forma]).toEqual([q.volumeCentesimos, q.formaCentesimos]);
      expect(tab.comp).toEqual(q.comprimentoPorBitola);
    });
  }
});

describe("resumo geral do DESENHO (item 4)", () => {
  const r = resumoGeralVigas([quadroV1("original")], dsp, "original");

  it.each([
    ["retrad_des_menu (impressora)", menu],
    ["retrad_des_p10 (tela)", casoP10],
  ])("%s: por viga, totais e pesos", (_n, caso) => {
    const bate = (id: string, x: number) =>
      expect(bateComImpresso(valorOraculo(caso, id), x), id).toBe(true);
    bate("V1.resumo.volume", r.porViga[0]!.volume);
    bate("V1.resumo.forma", r.porViga[0]!.forma);
    bate("resumo.volume", r.volume);
    bate("resumo.forma", r.forma);
    for (const [i, rotulo] of BITOLAS) {
      bate(`resumo.phi${rotulo}.comprimento`, r.comprimentoPorBitola[i]!);
      bate(`resumo.phi${rotulo}.peso`, r.pesoPorBitola[i]!);
    }
  });

  it("todas as 10 bitolas do resumo impresso (zeros inclusive)", () => {
    const rotulos = dsp.bitolas.map((b) =>
      String(b.bitola === 6.300000190734863 ? "6.3" : b.bitola),
    );
    for (const [i, rotulo] of rotulos.entries()) {
      expect(r.comprimentoPorBitola[i]).toBe(
        numeroOraculo(menu, `resumo.phi${rotulo}.comprimento`),
      );
      expect(r.pesoPorBitola[i]).toBe(numeroOraculo(menu, `resumo.phi${rotulo}.peso`));
    }
  });

  it("repetições: MAX(1, rept) multiplica os totais, não a linha da viga", () => {
    const q: QuadroViga = { ...quadroV1("original"), repeticoes: 3 };
    const r3 = resumoGeralVigas([q], dsp, "original");
    expect(r3.porViga[0]!.volume).toBeCloseTo(0.8, 4);
    expect(r3.volume).toBeCloseTo(2.3, 4); // CINT(228/10)/10
    expect(r3.comprimentoPorBitola[1]).toBe(253); // CINT(3·8448/100)
  });
});

describe("fôrma e volume das 6 vigas 12×40 do .FOR da E2E (conta à mão, livros 2.2)", () => {
  // retrad_frm_montagem: vão livre 380 (V1-V3) ou 480 (V4-V6), apoios de 20, (Hle, Hld)
  // por tramo: V1 e V4 (0, 10); V2 e V5 (10, 10); V3 e V6 (10, 0).
  const viga = (vao: number, hle: number, hld: number) => {
    const sec = { bw: 12, hw: 40, bf: 0, hf: 0 };
    const secoes: SecoesViga = { tramos: [sec, sec], apoios: [sec, sec, sec] };
    const ft = { larguraApoio: 20, vaoLivre: vao, pe: 0, hle, pd: 0, hld };
    const forma: FormaViga = { tramos: [ft, ft] };
    return volumeEForma(secoes, forma, "original");
  };
  const vigas = [
    viga(380, 0, 10),
    viga(380, 10, 10),
    viga(380, 10, 0),
    viga(480, 0, 10),
    viga(480, 10, 10),
    viga(480, 10, 0),
  ];

  it("por viga: fôrma 623/547/623/787/691/787 e volume 36/36/36/46/46/46 centésimos", () => {
    expect(vigas.map((v) => v.formaCentesimos)).toEqual([623, 547, 623, 787, 691, 787]);
    expect(vigas.map((v) => v.volumeCentesimos)).toEqual([36, 36, 36, 46, 46, 46]);
  });

  it("resumo: 2,5 m³ e 40,6 m²", () => {
    const quadros = vigas.map((v, i) => ({
      nome: `V${i + 1}`,
      repeticoes: 0,
      ...v,
      comprimentoPorBitola: dsp.bitolas.map(() => 0),
      pesoPorBitola: dsp.bitolas.map(() => 0),
      taxa: 0,
    }));
    const r = resumoGeralVigas(quadros, dsp, "original");
    expect(r.volume).toBeCloseTo(2.5, 4);
    expect(r.forma).toBeCloseTo(40.6, 4);
  });
});

describe("dados de teste vigas/__desinit__/retrad_des_p10.json", () => {
  it(`cada fonte existe e contém o impresso`, () => {
    for (const v of casoP10.valores) {
      const [arquivo, linha] = v.fonte.split(":");
      const texto = readFileSync(arquivoOraculo(join(casoP10.run, arquivo!)), "latin1").split("\n")[
        Number(linha) - 1
      ];
      expect(texto, v.id).toContain(v.impresso);
    }
  });
});

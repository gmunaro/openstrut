// O .VIG editado pela obra (edicaoVig.ts): cada campo da viga contra a conta à mão das
// divisões do registro (VIGA.BAS:1087-1356: P de D(k−1) a D(k), F em D(k); no balanço
// esquerdo, da ponta para o apoio, D a partir do apoio) e o equilíbrio do VICALC (Σ R =
// carga total), que não depende do código editado.
import { describe, expect, it } from "vitest";
import type { Viga } from "../../dominio/obra";
import { sng } from "./base/f32";
import { emSingle, PARAMETROS_VIGA } from "./base/parametros";
import type { DadosViga, DivisaoCarga } from "./base/tipos";
import { KN_POR_TF } from "./base/unidades";
import { editaVig, secoesEFormaDaObra } from "./edicaoVig";
import { analisaViga } from "./vigas/vicalc";

const div = (p: number, d: number, f = 0, pac = 0, fac = 0): DivisaoCarga => ({
  p,
  d,
  f,
  pAcidental: pac,
  fAcidental: fac,
});

/** Viga de 2 tramos de 4 m com 1 t/m (o registro que a montagem gravaria). */
const base = (): DadosViga => ({
  nome: "V1",
  tramos: [
    { vao: 4, inercia: 1, divisoes: [div(1, 4)] },
    { vao: 4, inercia: 1, divisoes: [div(1, 4)] },
  ],
  engasteEsquerdo: false,
  engasteDireito: false,
  momentosExternos: [0, 0],
  pilares: ["P1", "P2", "P3"],
});
/** Viga com balanço esquerdo de 2 m e um tramo de 4 m. */
const comBalanco = (): DadosViga => ({
  nome: "V1",
  balancoEsquerdo: { vao: 2, inercia: 1, divisoes: [div(1, 2)] },
  tramos: [{ vao: 4, inercia: 1, divisoes: [div(1, 4)] }],
  engasteEsquerdo: false,
  engasteDireito: false,
  momentosExternos: [0, 0],
  pilares: ["P1", "P2"],
});
const viga = (extra: Partial<Viga>): Viga => ({
  id: "V1",
  nome: "V1",
  x1: 0,
  y1: 0,
  x2: 8,
  y2: 0,
  bw: 20,
  h: 50,
  cargaLinear: 0,
  ...extra,
});
const g = KN_POR_TF;
const par = PARAMETROS_VIGA;

describe("editaVig: cargas na viga", () => {
  it("sem nenhum campo, devolve o mesmo registro", () => {
    const d = base();
    expect(editaVig(d, viga({}), par, "corrigido", [])).toBe(d);
  });

  it("concentrada de 10 kN a 1,5 m no tramo 1: a divisão se parte em 1,5 e a F fica no fim da primeira", () => {
    const avisos: string[] = [];
    const r = editaVig(
      base(),
      viga({ cargas: [{ tipo: "concentrada", trecho: 0, posicao: 1.5, total: 10 }] }),
      par,
      "corrigido",
      avisos,
    );
    expect(avisos).toEqual([]);
    expect(r.tramos[0]!.divisoes).toEqual([div(1, 1.5, 10 / g), div(1, 4)]);
    expect(r.tramos[1]!.divisoes).toEqual([div(1, 4)]);
  });

  it("distribuída de 5 kN/m de 1 a 3 m no tramo 2: três divisões, a do meio com 1 + 5/9,80665 t/m", () => {
    const r = editaVig(
      base(),
      viga({ cargas: [{ tipo: "distribuida", trecho: 1, inicio: 1, fim: 3, total: 5 }] }),
      par,
      "corrigido",
      [],
    );
    expect(r.tramos[1]!.divisoes).toEqual([div(1, 1), div(1 + 5 / g, 3), div(1, 4)]);
  });

  it("modo original: os valores em SINGLE (F = sng(10/9,80665))", () => {
    const r = editaVig(
      base(),
      viga({ cargas: [{ tipo: "concentrada", trecho: 0, posicao: 0.4, total: 10, acidental: 2 }] }),
      par,
      "original",
      [],
    );
    expect(r.tramos[0]!.divisoes[0]).toEqual(div(1, sng(0.4), sng(10 / g), 0, sng(2 / g)));
  });

  it("balanço esquerdo: posição a partir da ponta; o registro vem da ponta para o apoio, D a partir do apoio", () => {
    // 4 kN/m nos 0,5 m da ponta e 3 kN na ponta: em D (a partir do apoio) de 1,5 a 2,0
    const r = editaVig(
      comBalanco(),
      viga({
        cargas: [
          { tipo: "distribuida", trecho: 0, inicio: 0, fim: 0.5, total: 4 },
          { tipo: "concentrada", trecho: 0, posicao: 0, total: 3 },
        ],
      }),
      par,
      "corrigido",
      [],
    );
    expect(r.balancoEsquerdo!.divisoes).toEqual([div(1 + 4 / g, 2, 3 / g), div(1, 1.5)]);
    // momento no apoio: 1·2²/2 + (4/g)·0,5·(1,5 + 0,25) + (3/g)·2
    const a = analisaViga(r, par, "corrigido");
    const m = 2 + (4 / g) * 0.5 * 1.75 + (3 / g) * 2;
    expect(a.balancoEsquerdo!.mApoio).toBeCloseTo(-m, 10);
    expect(a.balancoEsquerdo!.carga).toBeCloseTo(2 + (4 / g) * 0.5 + 3 / g, 10);
  });

  it("equilíbrio: Σ R do VICALC = carga total do registro editado", () => {
    const r = editaVig(
      base(),
      viga({
        cargas: [
          { tipo: "concentrada", trecho: 0, posicao: 1.5, total: 10 },
          { tipo: "distribuida", trecho: 1, inicio: 0.5, fim: 2.5, total: 7 },
        ],
      }),
      par,
      "corrigido",
      [],
    );
    const a = analisaViga(r, par, "corrigido");
    expect(a.somaReacoes).toBeCloseTo(8 + 10 / g + (7 / g) * 2, 10);
  });

  it("somenteCargasProprias: as cargas da montagem saem, ficam só as da viga", () => {
    const r = editaVig(
      base(),
      viga({
        somenteCargasProprias: true,
        cargas: [{ tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: 9.80665 }],
      }),
      par,
      "corrigido",
      [],
    );
    expect(r.tramos[0]!.divisoes).toEqual([div(1, 4)]);
    expect(r.tramos[1]!.divisoes).toEqual([div(0, 4)]);
  });

  it("somenteCargasProprias mantém a divisão da reação de uma viga apoiada (indexada)", () => {
    const d = base();
    d.tramos[0]!.divisoes = [{ ...div(1, 2), indexada: { viga: "V9", apoio: 0 } }, div(1, 4)];
    const r = editaVig(d, viga({ somenteCargasProprias: true }), par, "corrigido", []);
    expect(r.tramos[0]!.divisoes).toEqual([
      { ...div(0, 2), indexada: { viga: "V9", apoio: 0 } },
      div(0, 4),
    ]);
  });

  it("acidental gerada (VIGA.INI 'G' a 30 %): Pac = 0,3·P quando a carga não diz a acidental", () => {
    const gerada = { ...par, acidentalGerada: true, porcentagemAcidentalGerada: 30 };
    const r = editaVig(
      base(),
      viga({
        somenteCargasProprias: true,
        cargas: [
          { tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: 2 * g },
          { tipo: "distribuida", trecho: 1, inicio: 0, fim: 4, total: 2 * g, acidental: 0 },
        ],
      }),
      gerada,
      "corrigido",
      [],
    );
    expect(r.tramos[0]!.divisoes[0]!.pAcidental).toBeCloseTo(0.6, 12);
    expect(r.tramos[1]!.divisoes[0]!.pAcidental).toBe(0);
  });

  it("carga fora do trecho: ignorada com aviso", () => {
    const avisos: string[] = [];
    editaVig(
      base(),
      viga({ cargas: [{ tipo: "concentrada", trecho: 0, posicao: 4.5, total: 1 }] }),
      par,
      "corrigido",
      avisos,
    );
    expect(avisos).toEqual(["Viga V1: carga concentrada fora do trecho 0 (4.5 m): ignorada."]);
  });
});

describe("editaVig: vãos, J, engaste, momentos externos e apoios", () => {
  it("vão digitado a menos de 5 mm da planta substitui o vão e o fim da última divisão", () => {
    const r = editaVig(base(), viga({ vaos: [4.003, 4] }), par, "corrigido", []);
    expect(r.tramos[0]).toMatchObject({ vao: 4.003, divisoes: [div(1, 4.003)] });
  });

  it("vão a mais de 5 mm da planta: vale o da planta, com aviso", () => {
    const avisos: string[] = [];
    const r = editaVig(base(), viga({ vaos: [4.2, 4] }), par, "corrigido", avisos);
    expect(r.tramos[0]!.vao).toBe(4);
    expect(avisos[0]).toContain("não bate com a planta");
  });

  it("J por trecho; lista com outro número de trechos é ignorada com aviso", () => {
    expect(
      editaVig(base(), viga({ inercias: [1.95, 1] }), par, "corrigido", []).tramos.map(
        (t) => t.inercia,
      ),
    ).toEqual([1.95, 1]);
    const avisos: string[] = [];
    editaVig(base(), viga({ inercias: [2] }), par, "corrigido", avisos);
    expect(avisos[0]).toContain("inercias tem 1 valores e a viga tem 2 trechos");
  });

  it("engaste, momentos externos (kN·m → t·m) e apoio desconsiderado (pilar null)", () => {
    const r = editaVig(
      base(),
      viga({
        engaste: { esquerdo: true, direito: false },
        momentosExternos: { esquerdo: -g, direito: 2 * g },
        apoiosDesconsiderados: [2],
      }),
      emSingle(par),
      "original",
      [],
    );
    expect([r.engasteEsquerdo, r.engasteDireito]).toEqual([true, false]);
    expect(r.momentosExternos).toEqual([-1, 2]);
    expect(r.pilares).toEqual(["P1", "P2", null]);
  });
});

describe("secoesEFormaDaObra: lajes no corte (DESENHO.BAS:6768-6779)", () => {
  const planta = {
    secoes: {
      tramos: [1, 2].map(() => ({ bw: 20, hw: 50, bf: 0, hf: 0 })),
      apoios: [1, 2, 3].map(() => ({ bw: 20, hw: 50, bf: 0, hf: 0 })),
    },
    forma: {
      tramos: [1, 2].map(() => ({
        larguraApoio: 20,
        vaoLivre: 380,
        pe: 0,
        hle: 10,
        pd: 0,
        hld: 12,
      })),
    },
    apoios: [],
  };
  const mesa = { trechos: [1, 2].map(() => ({ bw: 20, h: 50, bf: 80, hf: 9.6 })) };
  const forma = (v: Partial<Viga>) =>
    secoesEFormaDaObra(viga(v), base(), planta, "original").forma.tramos.map((t) => [
      t.pe,
      t.hle,
      t.pd,
      t.hld,
    ]);

  it("sem resposta: a laje da planta", () => {
    expect(forma({})).toEqual([
      [0, 10, 0, 12],
      [0, 10, 0, 12],
    ]);
  });
  it('"nao": pe, Hle, pd e Hld 0', () => {
    expect(forma({ forma: { lajesNoCorte: "nao" } })).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });
  it('"mesa": Hle = Hld = CINT(hf) da seção do trecho; o valor do trecho vale por cima', () => {
    expect(
      forma({ secoes: mesa, forma: { lajesNoCorte: "mesa", trechos: [{}, { hld: 7 }] } }),
    ).toEqual([
      [0, 10, 0, 10],
      [0, 10, 0, 7],
    ]);
  });
});

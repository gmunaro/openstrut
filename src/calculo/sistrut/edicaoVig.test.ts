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
import { analisaViga, analisaVigas } from "./vigas/vicalc";

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

  it("acidentais S com acidental G (VIGA.BAS:1294-1298): Pac = pct·P/100 da divisão inteira, por cima da Pac da montagem e da informada", () => {
    const gerada = {
      ...par,
      acidentais: true,
      acidentalGerada: true,
      porcentagemAcidentalGerada: 30,
    };
    const d = base();
    d.tramos[0]!.divisoes = [div(1, 4, 0, 0.1)];
    const r = editaVig(
      d,
      viga({
        cargas: [
          { tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: 2 * g },
          { tipo: "distribuida", trecho: 1, inicio: 0, fim: 4, total: 2 * g, acidental: 0 },
          { tipo: "concentrada", trecho: 1, posicao: 2, total: 5 * g, acidental: 1 * g },
        ],
      }),
      emSingle(gerada),
      "original",
      [],
    );
    // um produto só em SINGLE: sng(30·P/100)
    expect(r.tramos[0]!.divisoes[0]!.pAcidental).toBe(sng((30 * 3) / 100));
    expect(r.tramos[1]!.divisoes.map((x) => [x.pAcidental, x.fAcidental])).toEqual([
      [sng((30 * 3) / 100), sng((30 * 5) / 100)],
      [sng((30 * 3) / 100), 0],
    ]);
  });

  it("acidentais N: a Pac é a da montagem mais a informada (o VIGA não pede nem gera)", () => {
    const d = base();
    d.tramos[0]!.divisoes = [div(1, 4, 0, 0.1)];
    const r = editaVig(
      d,
      viga({
        cargas: [{ tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: 2 * g, acidental: g }],
      }),
      { ...par, acidentalGerada: true },
      "corrigido",
      [],
    );
    expect(r.tramos[0]!.divisoes[0]!.pAcidental).toBeCloseTo(1.1, 12);
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

describe("editaVig: regras da entrada do VIGA (revisão do 1d12659)", () => {
  const V2: DadosViga = {
    nome: "V2",
    tramos: [{ vao: 4, inercia: 1, divisoes: [div(1, 4)] }],
    engasteEsquerdo: false,
    engasteDireito: false,
    momentosExternos: [0, 0],
    pilares: ["P1", "P2"],
  };
  /** V1 de 6 m com 1 t/m e a V2 apoiada em D = 3 (carga indexada). */
  const comIndexada = (): DadosViga => ({
    nome: "V1",
    tramos: [
      {
        vao: 6,
        inercia: 1,
        divisoes: [{ ...div(1, 3), indexada: { viga: "V2", apoio: 0 } }, div(1, 6)],
      },
    ],
    engasteEsquerdo: false,
    engasteDireito: false,
    momentosExternos: [0, 0],
    pilares: ["P3", "P4"],
  });
  const somaR = (d: DadosViga) => {
    const r = analisaVigas([V2, d], par, "corrigido");
    return r.analises.find((a) => a.nome === d.nome)!.somaReacoes;
  };

  it("concentrada no ponto da viga apoiada: o VIGA tem uma F por divisão (a da indexada); recusada com aviso", () => {
    const avisos: string[] = [];
    const e = editaVig(
      comIndexada(),
      viga({ cargas: [{ tipo: "concentrada", trecho: 0, posicao: 3, total: 10 * g }] }),
      par,
      "corrigido",
      avisos,
    );
    expect(avisos[0]).toContain("no ponto da viga V2 apoiada");
    expect(e.tramos[0]!.divisoes[0]).toEqual({ ...div(1, 3), indexada: { viga: "V2", apoio: 0 } });
    // 6 t da V1 + 2 t da V2 (a reação, que o VIGA põe na F da divisão)
    expect(somaR(e)).toBeCloseTo(8, 10);
  });

  it("concentrada perto da viga apoiada (outra divisão): entra; Σ R = 6 + 2 + 10", () => {
    const e = editaVig(
      comIndexada(),
      viga({ cargas: [{ tipo: "concentrada", trecho: 0, posicao: 3.5, total: 10 * g }] }),
      par,
      "corrigido",
      [],
    );
    expect(somaR(e)).toBeCloseTo(18, 10);
  });

  it("vão encurtado com F perto do fim: a F passa para a última divisão e daí para o começo do tramo seguinte, com aviso", () => {
    const d = base();
    d.tramos[0]!.divisoes = [div(1, 3.998, 5), div(1, 4)];
    const avisos: string[] = [];
    const e = editaVig(d, viga({ vaos: [3.997, 4] }), par, "corrigido", avisos);
    expect(avisos.some((a) => a.includes("encurtou"))).toBe(true);
    expect(e.tramos[0]!.divisoes).toEqual([div(1, 3.997)]);
    expect(e.tramos[1]!.divisoes).toEqual([div(1, 0, 5), div(1, 4)]);
    expect(analisaViga(e, par, "corrigido").somaReacoes).toBeCloseTo(3.997 + 4 + 5, 10);
  });

  it("F no fim de um tramo interno (VIGA.BAS:1279): vai para D = 0 do tramo seguinte; no último apoio é recusada", () => {
    const avisos: string[] = [];
    const e = editaVig(
      base(),
      viga({
        cargas: [
          { tipo: "concentrada", trecho: 0, posicao: 4, total: 10 },
          { tipo: "concentrada", trecho: 1, posicao: 4, total: 3 },
        ],
      }),
      par,
      "corrigido",
      avisos,
    );
    expect(e.tramos[0]!.divisoes).toEqual([div(1, 4)]);
    expect(e.tramos[1]!.divisoes).toEqual([div(1, 0, 10 / g), div(1, 4)]);
    expect(avisos).toHaveLength(2);
    expect(avisos[1]).toContain("em cima do último apoio");
  });

  it("tramo sem divisões: ganha a divisão até o vão (o *1* do VIGA) e recebe a carga", () => {
    const d = base();
    d.tramos[0]!.divisoes = [];
    const e = editaVig(
      d,
      viga({
        cargas: [
          { tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: g },
          { tipo: "concentrada", trecho: 0, posicao: 2, total: g },
        ],
      }),
      par,
      "corrigido",
      [],
    );
    expect(e.tramos[0]!.divisoes).toEqual([div(1, 2, 1), div(1, 4)]);
  });

  it("mais de 30 divisões na viga: aviso (o VIGA recusa, VIGA.BAS:1265-1270)", () => {
    const avisos: string[] = [];
    const cargas = Array.from({ length: 40 }, (_, i) => ({
      tipo: "concentrada" as const,
      trecho: 0,
      posicao: 0.05 + i * 0.09,
      total: 1,
    }));
    editaVig(base(), viga({ cargas }), par, "corrigido", avisos);
    expect(avisos.some((a) => a.includes("no máximo 30"))).toBe(true);
  });

  it("ponto a 2 ulps do SINGLE de uma divisão da montagem cai nela (sem divisão de comprimento quase zero)", () => {
    const d = base();
    // a montagem mede 2,1 m em SINGLE pelas coordenadas: sng(9,6) − 7,5
    const dMont = sng(sng(9.6) - 7.5);
    d.tramos[0]!.divisoes = [div(1, dMont), div(1, 4)];
    const e = editaVig(
      d,
      viga({ cargas: [{ tipo: "concentrada", trecho: 0, posicao: 2.1, total: g }] }),
      emSingle(par),
      "original",
      [],
    );
    expect(e.tramos[0]!.divisoes).toEqual([div(1, dMont, 1), div(1, 4)]);
  });

  it("carga em trecho que a viga não tem e apoio desconsiderado inexistente: aviso", () => {
    const avisos: string[] = [];
    editaVig(
      base(),
      viga({
        cargas: [{ tipo: "concentrada", trecho: 5, posicao: 1, total: 1 }],
        apoiosDesconsiderados: [9],
      }),
      par,
      "corrigido",
      avisos,
    );
    expect(avisos).toEqual([
      "Viga V1: carga no trecho 5, e a viga tem 2 trechos: ignorada.",
      "Viga V1: apoio desconsiderado 9, e a viga tem 3 apoios: ignorado.",
    ]);
  });
});

describe("secoesEFormaDaObra: tamanhos e seção 0 de balanço", () => {
  const plantaBal = {
    secoes: {
      tramos: [{ bw: 20, hw: 50, bf: 0, hf: 0 }],
      apoios: [1, 2].map(() => ({ bw: 20, hw: 50, bf: 0, hf: 0 })),
      balancoEsquerdo: { bw: 20, hw: 50, bf: 0, hf: 0 },
    },
    forma: {
      tramos: [{ larguraApoio: 20, vaoLivre: 380, pe: 0, hle: 0, pd: 0, hld: 0 }],
      balancoEsquerdo: { larguraApoio: 0, vaoLivre: 190, pe: 0, hle: 0, pd: 0, hld: 0 },
    },
    apoios: [],
  };
  it("balanço com seção 0 herda bw e hw do apoio vizinho (DESDIM.BAS:2919-2929)", () => {
    const r = secoesEFormaDaObra(
      viga({
        secoes: {
          trechos: [
            { bw: 0, h: 0, bf: 0, hf: 0 },
            { bw: 15, h: 45, bf: 0, hf: 0 },
          ],
          apoios: [
            { bw: 18, h: 44 },
            { bw: 15, h: 45 },
          ],
        },
      }),
      comBalanco(),
      plantaBal,
      "corrigido",
    );
    expect(r.secoes.balancoEsquerdo).toEqual({ bw: 18, hw: 44, bf: 0, hf: 0 });
  });
  it("lista de seções ou de forma com outro tamanho: aviso", () => {
    const avisos: string[] = [];
    secoesEFormaDaObra(
      viga({
        secoes: { trechos: [{ bw: 20, h: 50, bf: 0, hf: 0 }] },
        forma: { apoios: [{}, {}, {}] },
      }),
      comBalanco(),
      plantaBal,
      "corrigido",
      avisos,
    );
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain("secoes.trechos tem 1 itens e a viga tem 2");
  });
});

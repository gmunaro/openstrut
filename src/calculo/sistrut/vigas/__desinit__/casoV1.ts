// Entrada do caso retrad_des_det (obra E2E, viga V1 20×50, 2 tramos de 4,00 m com
// p = 0,486 t/m; __oraculo__/retrad_des_det.json, campo `entrada`) para os testes do
// detalhamento e dos quantitativos.
//
// A entrada é só a viga do .VIG: o detalhamento refaz a análise (DESCALC). Os esforços
// de `ESFORCOS_V1` são a conta à mão da viga contínua de dois vãos iguais com carga
// uniforme (M1 = −qL²/8; Ve = qL/2 − |M1|/L; M+ = Ve²/2q, x = Ve/q), em SINGLE, e o
// teste confere que arredondam para o que o original imprime (M− −0.97, Ve 0.73, Vd
// 1.22, x 1.50, M+ 0.55; C:/tmp/oraculo/runs/retrad_des_det-20261015-082506,
// impressora.prn:16-26). O dimensionamento é o que o original
// imprime (2#10 nos tramos e no apoio 1, As 1,50, estribo #5/12, Aee 2,80, Vk com alívio
// 0,61/1,09 = Ve − q·h/2).
import { sng } from "../../base/f32";
import { emSingle, PARAMETROS_DSP } from "../../base/parametros";
import type {
  DimensionamentoViga,
  EntradaDesdim,
  FlexaoViga,
  TramoDimensionado,
} from "../../base/tipos";

const q = sng(0.486);
const L = 4;
const m1 = sng(-(0.486 * L * L) / 8);
const ve = sng((0.486 * L) / 2 - (0.486 * L) / 8);
const vd = sng((0.486 * L) / 2 + (0.486 * L) / 8);
const mPos = sng((0.729 * 0.729) / (2 * 0.486));
const xPos = sng(0.729 / 0.486);

/** Esforços à mão (ver o cabeçalho). */
export const ESFORCOS_V1 = { q, m1, ve, vd, mPos, xPos };

const flexao = (mk: number): FlexaoViga => ({
  xd: sng(0.025),
  mk,
  as: sng(1.5),
  asCompressao: 0,
  arranjo: "2#10",
});

/** Alívio do cortante junto ao apoio: Vk = V − q·h/200 (q até h/2; DESDIM.BAS:6509). */
const vkE1 = sng(0.729 - 0.486 * 0.25);
const vkD1 = sng(1.215 - 0.486 * 0.25);

const tramoDim = (vkEsquerda: number, vkDireita: number): TramoDimensionado => ({
  flexao: flexao(mPos),
  cisalhamento: {
    vkEsquerda,
    vkDireita,
    aswEsquerda: sng(2.8),
    aswDireita: sng(2.8),
    estribo: { bitola: 5, ramos: 2, espacamentoEsquerda: 12, espacamentoDireita: 12 },
  },
  flecha: sng(0.01),
});

export const DIMENSIONAMENTO_V1: DimensionamentoViga = {
  nome: "V1",
  tramos: [tramoDim(vkE1, vkD1), tramoDim(vkD1, vkE1)],
  apoios: [flexao(0), flexao(sng(-m1)), flexao(0)],
  avisos: [],
  memoria: [],
};

const secao = { bw: 20, hw: 50, bf: 0, hf: 0 };
const formaTramo = { larguraApoio: 20, vaoLivre: 380, pe: 0, hle: 0, pd: 0, hld: 0 };

export const ENTRADA_V1: EntradaDesdim = {
  viga: {
    nome: "V1",
    tramos: [0, 1].map(() => ({
      vao: L,
      inercia: 1,
      divisoes: [{ p: q, d: L, f: 0, pAcidental: 0, fAcidental: 0 }],
    })),
    engasteEsquerdo: false,
    engasteDireito: false,
    momentosExternos: [0, 0],
    pilares: ["P1", "P2", "P3"],
  },
  secoes: { tramos: [secao, secao], apoios: [secao, secao, secao] },
  forma: { tramos: [formaTramo, formaTramo] },
  materiais: {
    fck: sng(0.15),
    fyk: 5,
    classeAco: "B",
    gamaF: sng(1.4),
    gamaC: sng(1.4),
    gamaS: sng(1.15),
  },
  parametros: emSingle(PARAMETROS_DSP),
};

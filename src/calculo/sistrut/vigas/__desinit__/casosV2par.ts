// Entradas dos casos v2par_des_3tramos, v2par_des_2tramos e v2par_des_especial
// (C:/wt/v1-v2par/tests/retraducao/V2PAR.md) para os testes do detalhamento.
//
// - Viga, seção e forma: `v2par_des_entradas.json`, decodificado dos registros binários
//   que o original leu e gravou (.VIG da obra de entrada; .SEC e .FOR do run), sem
//   arredondar (SINGLE como estão no arquivo).
// - Dimensionamento: o que o DESDIM imprime em cada caso (`v2par_des_*.json` e
//   impressora.txt do run: barras, Ast, Asc, Aee/Aed, estribos e a armadura comprimida).
// - Parâmetros: SISTRUT embutido; no especial, o V2P.DSP lido do disco
//   (C:/tmp/oraculo/casos/v2par_des_especial.dados/V2P.DSP): aço A, acidentais S e a
//   tabela de bitola das barras de extremidade com 120 cm (DESENHO.BAS:5398-5410; o
//   embutido tem 100).
import { sng } from "../../base/f32";
import { emSingle, PARAMETROS_DSP } from "../../base/parametros";
import type {
  DadosViga,
  DimensionamentoParaDetalhe,
  EntradaDesdim,
  ExtrasDesinit,
  FormaTramo,
  SecaoViga,
  TramoViga,
} from "../../base/tipos";
import entradas from "./v2par_des_entradas.json";

export type NomeCaso = "v2par_des_3tramos" | "v2par_des_2tramos" | "v2par_des_especial";

interface Flex {
  arranjo: string;
  as: number;
  asc?: number;
}
interface Cis {
  aswE: number;
  aswD: number;
  bitola: number;
  sE: number;
  sD: number;
}

/** Impresso pelo DESDIM (impressora.txt de cada run). */
const DIMENSIONAMENTOS: Record<
  NomeCaso,
  {
    apoios: (Flex | null)[];
    comprimidaApoios?: string[];
    tramos: { flex?: Flex; cis: Cis }[];
  }
> = {
  // impressora.prn:50-63
  v2par_des_3tramos: {
    apoios: [null, { arranjo: "2#10", as: 1.5 }, { arranjo: "2#10", as: 1.5 }, null],
    tramos: [1, 2, 3].map(() => ({
      flex: { arranjo: "2#10", as: 1.5 },
      cis: { aswE: 2.8, aswD: 2.8, bitola: 5, sE: 12, sD: 12 },
    })),
  },
  // impressora.txt:22-32
  v2par_des_2tramos: {
    apoios: [null, { arranjo: "2#12.5+#8", as: 2.97 }, null],
    tramos: [
      {
        flex: { arranjo: "2#10", as: 1.01 },
        cis: { aswE: 2.1, aswD: 2.1, bitola: 5, sE: 17, sD: 17 },
      },
      {
        flex: { arranjo: "2#12.5+#10", as: 3.25 },
        cis: { aswE: 2.98, aswD: 2.1, bitola: 5, sE: 12, sD: 17 },
      },
    ],
  },
  // impressora.prn:60-79; balanços: só o lado do apoio
  v2par_des_especial: {
    apoios: [
      { arranjo: "3#12.5", as: 3.4 },
      { arranjo: "2#20+2#16", as: 10.18, asc: 2.61 },
      { arranjo: "4#16", as: 6.59 },
    ],
    comprimidaApoios: ["-", "3#12.5", "-"],
    tramos: [
      { cis: { aswE: 2.8, aswD: 2.8, bitola: 6.3, sE: 17, sD: 17 } },
      {
        flex: { arranjo: "3#20", as: 8.34 },
        cis: { aswE: 7.88, aswD: 8.54, bitola: 8, sE: 12, sD: 10 },
      },
      {
        flex: { arranjo: "2#12.5", as: 1.82 },
        cis: { aswE: 5.11, aswD: 3.8, bitola: 6.3, sE: 12, sD: 15 },
      },
      { cis: { aswE: 4.82, aswD: 4.82, bitola: 6.3, sE: 12, sD: 12 } },
    ],
  },
};

const flexao = (f: Flex | undefined | null): DimensionamentoParaDetalhe["apoios"][number] => ({
  xd: 0,
  mk: 0,
  as: sng(f?.as ?? 0),
  asCompressao: sng(f?.asc ?? 0),
  arranjo: f?.arranjo ?? "",
});

const tramoDim = (t: { flex?: Flex; cis: Cis }): DimensionamentoParaDetalhe["tramos"][number] => ({
  flexao: flexao(t.flex),
  cisalhamento: {
    vkEsquerda: 0,
    vkDireita: 0,
    aswEsquerda: sng(t.cis.aswE),
    aswDireita: sng(t.cis.aswD),
    estribo: {
      bitola: sng(t.cis.bitola),
      ramos: 2,
      espacamentoEsquerda: t.cis.sE,
      espacamentoDireita: t.cis.sD,
    },
  },
  flecha: 0,
});

/** Entrada, dimensionamento e extras do caso. */
export function casoV2par(nome: NomeCaso) {
  const e = entradas[nome];
  const v = e.vig;
  const n = v.tramos;
  const balE = v.balancoEsquerdo === 1;
  const balD = v.balancoDireito === 1;
  const tramo = (t: number): TramoViga => {
    const x = v.porTramo[t]!;
    return { vao: x.vao, inercia: x.inercia, divisoes: x.divisoes.map((d) => ({ ...d })) };
  };
  const viga: DadosViga = {
    nome: v.nome,
    tramos: Array.from({ length: n }, (_, i) => tramo(i + 1)),
    ...(balE ? { balancoEsquerdo: tramo(0) } : {}),
    ...(balD ? { balancoDireito: tramo(n + 1) } : {}),
    engasteEsquerdo: v.engasteEsquerdo === 1,
    engasteDireito: v.engasteDireito === 1,
    momentosExternos: [v.momentosExternos[0]!, v.momentosExternos[1]!],
    pilares: Array.from({ length: n + 1 }, (_, k) => `P${k + 1}`),
  };
  const secao = (s: number[]): SecaoViga => ({ bw: s[0]!, hw: s[1]!, bf: s[2]!, hf: s[3]! });
  const f = e.for;
  const forma = (t: number): FormaTramo => ({
    larguraApoio: t === 0 ? 0 : f[t - 1]!.largura,
    vaoLivre: f[t]!.vaoLivre,
    pe: f[t]!.pe,
    hle: f[t]!.hle,
    pd: f[t]!.pd,
    hld: f[t]!.hld,
  });
  const especial = nome === "v2par_des_especial";
  const dsp = emSingle(
    especial
      ? {
          ...PARAMETROS_DSP,
          acidentaisEnvoltoria: true,
          tabelaBitola1: [15, 30, 70, 85, 120],
        }
      : PARAMETROS_DSP,
  );
  const entrada: EntradaDesdim = {
    viga,
    secoes: {
      tramos: Array.from({ length: n }, (_, i) => secao(e.sec.tramos[i + 1]!)),
      apoios: Array.from({ length: n + 1 }, (_, k) => {
        const a = e.sec.apoios[k]!;
        return { bw: a[0]!, hw: a[1]!, bf: 0, hf: 0 };
      }),
      ...(balE ? { balancoEsquerdo: secao(e.sec.tramos[0]!) } : {}),
      ...(balD ? { balancoDireito: secao(e.sec.tramos[n + 1]!) } : {}),
    },
    forma: {
      tramos: Array.from({ length: n }, (_, i) => forma(i + 1)),
      ...(balE ? { balancoEsquerdo: forma(0) } : {}),
      ...(balD ? { balancoDireito: forma(n + 1) } : {}),
    },
    materiais: {
      fck: sng(0.15),
      fyk: 5,
      classeAco: especial ? "A" : "B",
      gamaF: sng(1.4),
      gamaC: sng(1.4),
      gamaS: sng(1.15),
    },
    parametros: dsp,
  };
  const d = DIMENSIONAMENTOS[nome];
  const tramosDim = d.tramos.map(tramoDim);
  const dim: DimensionamentoParaDetalhe = {
    nome: v.nome,
    tramos: balE ? tramosDim.slice(1, n + 1) : tramosDim.slice(0, n),
    apoios: d.apoios.slice(0, n + 1).map(flexao),
    ...(balE ? { balancoEsquerdo: tramosDim[0]! } : {}),
    ...(balD ? { balancoDireito: tramosDim[n + 1]! } : {}),
  };
  const extras: ExtrasDesinit = {
    apoios: Array.from({ length: n + 1 }, (_, k) => {
      const r = f[k]!;
      return {
        largura: r.largura,
        tipo: (r.titulo.slice(0, 1) || "P") as "P" | "V" | "O" | "A",
        titulo: r.titulo.slice(1),
        codigo: r.codigo,
        lps: r.lps,
        dis: r.dis,
      };
    }),
    eixos: f.map((r) => ({ eixo: r.eixo, alinhamento: r.alinhamento })),
    ...(d.comprimidaApoios ? { comprimidaApoios: d.comprimidaApoios } : {}),
  };
  return { entrada, dim, extras };
}

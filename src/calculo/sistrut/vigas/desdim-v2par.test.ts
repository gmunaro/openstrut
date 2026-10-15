// Casos da rodada 2 do oráculo para o DESDIM (C:/tmp/oraculo/runs/v2par_des_*):
// - v2par_des_especial: viga D1 (balanços 1,5 e 1,2 m, tramos 6 e 4 m, T 20/40/80/10,
//   concentrada a 0,4 m do apoio) com o V2P.DSP (aço A, envoltória de acidentais,
//   flecha com inércia fissurada e deformação lenta, fissuração com limite 1);
// - v2par_des_3tramos: V1 da obra ASS (3, 5, 4 m; 20×50);
// - v2par_des_2tramos: V5 da obra ASS (4, 5 m; 15×45).
// A entrada é só a viga (.VIG), as seções e o .DSP: o DESDIM refaz a análise (DESCALC)
// como o original. Esperados: o que o DESDIM imprime em cada run
// (C:/tmp/oraculo/runs/v2par_des_especial-20261015-171646,
// C:/tmp/oraculo/runs/v2par_des_3tramos-20261015-165027,
// C:/tmp/oraculo/runs/v2par_des_2tramos-20261015-165207; impressora.prn/.txt).
// As cargas da obra ASS são os SINGLE do ASS.VIG (registros 1 e 5,
// C:/tmp/oraculo/casos/v2par_des_3tramos.dados/ASS.VIG: P em +235, J em +55, ...).
import { describe, expect, it } from "vitest";
import { bateComImpresso, type CasoOraculo, numeroOraculo, valorOraculo } from "../__oraculo__";
import { sng } from "../base/f32";
import { PARAMETROS_DSP, emSingle } from "../base/parametros";
import type {
  DadosViga,
  DivisaoCarga,
  EntradaDesdim,
  MateriaisSistrut,
  SecaoViga,
} from "../base/tipos";
import { CASOS_DESDIM } from "./__desdim__";
import {
  type DimensionamentoDesdim,
  type TramoDesdim,
  dimensionaVigaDesdim,
  esforcosDesdim,
} from "./desdim";

const div = (p: number, d: number, f = 0, pAc = 0, fAc = 0): DivisaoCarga => ({
  p: sng(p),
  d: sng(d),
  f: sng(f),
  pAcidental: sng(pAc),
  fAcidental: sng(fAc),
});
const ret = (bw: number, hw: number): SecaoViga => ({ bw, hw, bf: 0, hf: 0 });
const materiaisB: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: 5,
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};

function entrada(
  viga: DadosViga,
  secoes: EntradaDesdim["secoes"],
  parametros: EntradaDesdim["parametros"],
  materiais = materiaisB,
): EntradaDesdim {
  return {
    viga,
    secoes,
    forma: { tramos: [] },
    materiais,
    parametros,
  };
}

// ---- v2par_des_especial
const vigaD1: DadosViga = {
  nome: "D1",
  balancoEsquerdo: { vao: 1.5, inercia: 1, divisoes: [div(3, 1.5, 0, 0.5)] },
  tramos: [
    { vao: 6, inercia: 1, divisoes: [div(3, 0.4, 3, 0.5), div(3, 6, 0, 0.5)] },
    { vao: 4, inercia: 1, divisoes: [div(3, 4, 0, 0.5)] },
  ],
  balancoDireito: { vao: 1.2, inercia: 1, divisoes: [div(3, 1.2, 3, 0.5)] },
  engasteEsquerdo: false,
  engasteDireito: false,
  momentosExternos: [0, 0],
  pilares: ["P1", "P2", "P3"],
};
/** V2P.DSP: o SISTRUT.DSP de fábrica lido do disco com aço A, envoltória,
 *  inércia fissurada, deformação lenta e fissuração limite 1. Do disco vêm também o
 *  último arranjo do 3º intervalo (70, não 170) e a 5ª linha da tabela 1 (120). */
const dspV2P = emSingle({
  ...PARAMETROS_DSP,
  classeAco: "A" as const,
  acidentaisEnvoltoria: true,
  flechaInerciaFissurada: true,
  flechaDeformacaoLenta: true,
  verificaFissuracao: true,
  classeFissuracao: 1,
  arranjosPorIntervalo: [
    PARAMETROS_DSP.arranjosPorIntervalo[0]!,
    PARAMETROS_DSP.arranjosPorIntervalo[1]!,
    PARAMETROS_DSP.arranjosPorIntervalo[2]!.map((a) => (a.area === 170 ? { ...a, area: 70 } : a)),
  ],
  tabelaBitola1: [15, 30, 70, 85, 120],
});
const tD1: SecaoViga = { bw: 20, hw: 40, bf: 80, hf: 10 };
const entradaD1 = entrada(
  vigaD1,
  {
    tramos: [tD1, tD1],
    apoios: [ret(20, 40), ret(20, 40), ret(20, 40)],
    balancoEsquerdo: ret(20, 40),
    balancoDireito: ret(20, 40),
  },
  dspV2P,
  { ...materiaisB, classeAco: "A" },
);

// ---- obra ASS (registros 1 e 5 do ASS.VIG, SINGLE gravados pelo LAJEMONT)
const tramoAss = (vao: number, inercia: number, p: number) => ({
  vao,
  inercia,
  divisoes: [{ p, d: vao, f: 0, pAcidental: 0, fAcidental: 0 }],
});
const vigaV1: DadosViga = {
  nome: "V1",
  tramos: [
    tramoAss(3, 1.0000300407409668, 0.4245190918445587),
    tramoAss(5, 1.000040054321289, 0.5108439326286316),
    tramoAss(4, 1.0000499486923218, 0.5422810316085815),
  ],
  engasteEsquerdo: false,
  engasteDireito: false,
  momentosExternos: [0, 0],
  pilares: ["P1", "P2", "P3", "P4"],
};
const vigaV5: DadosViga = {
  nome: "V5",
  tramos: [
    tramoAss(4, 1.0000799894332886, 0.5473654866218567),
    tramoAss(5, 1.0000300407409668, 1.6491941213607788),
  ],
  engasteEsquerdo: false,
  engasteDireito: false,
  momentosExternos: [0, 0],
  pilares: ["P1", "P2", "P3"],
};
const dsp = emSingle(PARAMETROS_DSP);
const entradaV1 = entrada(
  vigaV1,
  { tramos: [ret(20, 50), ret(20, 50), ret(20, 50)], apoios: [1, 2, 3, 4].map(() => ret(20, 50)) },
  dsp,
);
const entradaV5 = entrada(
  vigaV5,
  { tramos: [ret(15, 45), ret(15, 45)], apoios: [1, 2, 3].map(() => ret(15, 45)) },
  dsp,
);

// ---- comparação
type Valor = number | string;

/** Valores do dimensionamento pelos ids do oráculo (<viga>.a<k>.*, <viga>.t<k>.*). */
function valoresDimensionados(viga: string, r: DimensionamentoDesdim) {
  const v = new Map<string, Valor>();
  for (const a of r.apoios) {
    if (!a.dimensionado) continue;
    const p = `${viga}.a${a.apoio}`;
    v.set(`${p}.x/d`, a.xd);
    v.set(`${p}.Mk`, a.mk);
    v.set(`${p}.Ast`, a.as);
    v.set(`${p}.Asc`, a.asCompressao);
    v.set(`${p}.barras`, a.arranjo);
    if (a.fissuracao) v.set(`${p}.fissura`, Math.min(a.fissuracao.w1, a.fissuracao.w2) * 10);
  }
  const tramos: TramoDesdim[] = [
    ...(r.balancoEsquerdo ? [r.balancoEsquerdo] : []),
    ...r.tramos,
    ...(r.balancoDireito ? [r.balancoDireito] : []),
  ];
  for (const t of tramos) {
    const p = `${viga}.t${t.indice}`;
    const c = t.cisalhamento;
    v.set(`${p}.x/d`, t.flexao.xd);
    v.set(`${p}.Mk`, t.flexao.mk);
    v.set(`${p}.Ast`, t.flexao.as);
    v.set(`${p}.Asc`, t.flexao.asCompressao);
    v.set(`${p}.barras`, t.flexao.arranjo);
    v.set(`${p}.flecha`, t.flecha);
    v.set(`${p}.Vke`, c.vkEsquerda);
    v.set(`${p}.Aee`, c.aswEsquerda);
    v.set(`${p}.Vkd`, c.vkDireita);
    v.set(`${p}.Aed`, c.aswDireita);
    v.set(`${p}.estriboE`, c.estriboEsquerda.texto);
    v.set(`${p}.estriboD`, c.estriboDireita.texto);
    if (t.fissuracao) v.set(`${p}.fissura`, Math.min(t.fissuracao.w1, t.fissuracao.w2) * 10);
  }
  return v;
}

/** Esforços do DESDIM (DESCALC) pelos ids da análise impressa: M− dos apoios e x dos
 *  tramos (os da linha "max" com envoltória); M+ do tramo, o da envoltória ou o de
 *  engastamento perfeito, o maior impresso; sem envoltória, Ve e Vd sem alívio. */
function valoresEsforcos(caso: CasoOraculo, viga: string, e: EntradaDesdim) {
  const v = new Map<string, Valor>();
  const r = esforcosDesdim(e, "original");
  const envoltoria = e.parametros.acidentaisEnvoltoria;
  const max = envoltoria ? ".max" : "";
  const n = e.viga.tramos.length;
  const ids = new Set(caso.valores.map((x) => x.id));
  r.momentosApoio.forEach((m, k) => v.set(`${viga}.a${k}${max}.M-`, m));
  for (const t of r.tramos) {
    if (t.indice < 1 || t.indice > n) continue;
    const p = `${viga}.t${t.indice}`;
    v.set(`${p}${max}.x`, t.x);
    const mais = [`${p}${max}.M+`, `${p}.EEP.M+`].filter((id) => ids.has(id));
    const maior = mais.reduce((a, b) => (numeroOraculo(caso, b) > numeroOraculo(caso, a) ? b : a));
    v.set(maior, t.mPositivo);
    if (!envoltoria) {
      v.set(`${p}.Ve`, t.ve);
      v.set(`${p}.Vd`, t.vd);
    }
  }
  return v;
}

/** Confere cada id do caso que tenha valor calculado. A fissuração da tela é
 *  MID$(STR$(w), 1, 6): truncada na 3ª casa. */
function confere(caso: CasoOraculo, calculados: Map<string, Valor>) {
  const ids = caso.valores.map((x) => x.id).filter((id) => calculados.has(id));
  it.each(ids)("%s", (id) => {
    const v = valorOraculo(caso, id);
    const c = calculados.get(id)!;
    if (typeof c === "string") expect(c).toBe(v.impresso);
    else if (id.endsWith(".fissura")) expect(Math.trunc(c * 1000) / 1000).toBe(Number(v.impresso));
    else expect(bateComImpresso(v, c), `impresso ${v.impresso}, calculado ${c}`).toBe(true);
  });
  return ids;
}

const casos = [
  ["v2par_des_especial", "D1", entradaD1],
  ["v2par_des_3tramos", "V1", entradaV1],
  ["v2par_des_2tramos", "V5", entradaV5],
] as const;

describe.each(casos)("%s: esforços do DESCALC contra a análise impressa", (nome, viga, e) => {
  const caso = CASOS_DESDIM[nome]!;
  const ids = confere(caso, valoresEsforcos(caso, viga, e));
  it("conferiu os esforços", () => expect(ids.length).toBeGreaterThanOrEqual(7));
});

describe.each(casos)("%s: dimensionamento, modo original", (nome, viga, e) => {
  const ids = confere(
    CASOS_DESDIM[nome]!,
    valoresDimensionados(viga, dimensionaVigaDesdim(e, "original")),
  );
  it("conferiu os números do dimensionamento", () => expect(ids.length).toBeGreaterThan(20));
});

describe("v2par_des_especial: avisos que o original mostrou (roteiro do caso)", () => {
  const r = dimensionaVigaDesdim(entradaD1, "original");
  it("momento acima de 40% do limite da armadura simples no apoio 1 (DESDIM.BAS:3712, 3070)", () => {
    expect(r.avisos.some((a) => a.includes("apoio 1") && a.includes("40%"))).toBe(true);
  });
  it("fissuração acima do limite 1 nos 3 apoios e nos 2 tramos (janelas Fissura(1))", () => {
    expect(r.apoios.map((a) => a.fissuracao?.ok)).toEqual([false, false, false]);
    expect(r.tramos.map((t) => t.fissuracao?.ok)).toEqual([false, false]);
  });
});

// Casos de teste da T3 (VIGA/VICALC e .REP), transcritos dos runs do oráculo:
// - caso_b.json: entrada do caso b (E2E.VIG decodificado) e as linhas do E2E.REP; os
//   valores impressos estão em `__oraculo__/caso_b_viga.json`;
// - p3.json, c1.json, x1.json, a1.json: casos `dist/tests/retraducao/viga/` (CHECKLIST.md) com
//   a entrada do roteiro (C:/tmp/oraculo/casos/retrad_viga_*.txt) ou do .VIG gravado
//   no run, e os valores impressos com `fonte` = arquivo:linha dentro de `run`;
// - v2par_*.json (rodada 2, casos T10): entrada do .VIG do run ou da partida (pilares
//   pela marca no J) ou do roteiro, e os valores de viga/.REP copiados de
//   C:/tmp/v2-paridade/oraculo-novos/<caso>.json (índice: V2PAR.md da V1). Nos casos
//   do DESENHO, só a análise (DESCALC com os parâmetros do .DSP).
// Os números da entrada são os que o original leu (VAL do texto digitado ou o SINGLE
// do .VIG); `dadosViga` aplica `sng` no modo original.
import { sng } from "../../base/f32";
import { emSingle, PARAMETROS_VIGA } from "../../base/parametros";
import type { DadosViga, ModoSistrut, ParametrosVicalc, TramoViga } from "../../base/tipos";
import type { ValorOraculo } from "../../__oraculo__/index";
import a1 from "./a1.json";
import caso_b from "./caso_b.json";
import c1 from "./c1.json";
import p3 from "./p3.json";
import v2par_des_2tramos from "./v2par_des_2tramos.json";
import v2par_des_3tramos from "./v2par_des_3tramos.json";
import v2par_des_especial from "./v2par_des_especial.json";
import v2par_laje_cargas from "./v2par_laje_cargas.json";
import v2par_viga_fluxo from "./v2par_viga_fluxo.json";
import v2par_viga_r6 from "./v2par_viga_r6.json";
import x1 from "./x1.json";

interface DivisaoJson {
  p: number;
  d: number;
  f: number;
  pAcidental: number;
  fAcidental: number;
  indexada?: { viga: string; apoio: number };
}
interface TramoJson {
  vao: number;
  inercia: number;
  divisoes: DivisaoJson[];
}
export interface VigaJson {
  nome: string;
  tramos: TramoJson[];
  balancoEsquerdo?: TramoJson;
  balancoDireito?: TramoJson;
  engasteEsquerdo: boolean;
  engasteDireito: boolean;
  momentosExternos: number[];
  pilares: (string | null)[];
}
interface ParametrosJson {
  reducaoNegativos: number;
  acidentais: boolean;
  acidentalGerada: boolean;
  porcentagemAcidentalGerada: number;
  momentosExternos: boolean;
  reacaoNoPilar: string;
  coeficienteMedida: number;
  coeficienteForca: number;
  multiplicadorMomentosPilar: number;
}
export interface LinhaArquivoJson {
  texto: string;
  fonte: string;
}
export interface CasoVicalc {
  caso: string;
  run: string;
  entradaDe: string;
  descricao: string;
  parametros: ParametrosJson;
  vigas: VigaJson[];
  vigasRep?: VigaJson[];
  valores?: ValorOraculo[];
  /** x1: F da carga indexada como o quadro da V21 imprime. */
  indexada?: { impresso: string; fonte: string };
  /** p3: J por seções como a tela mostra ("<J>= 1.95"). */
  secaoJ?: { b1: number; h1: number; b2: number; h2: number; impresso: string; fonte: string };
  rep?: {
    cabecalho: { obra: string; registros: string; data: string; hora: string };
    linhas: LinhaArquivoJson[];
  };
}

const casos: Record<string, CasoVicalc> = {
  caso_b,
  p3,
  c1,
  x1,
  a1,
  v2par_viga_fluxo,
  v2par_viga_r6,
  v2par_laje_cargas,
  v2par_des_especial,
  v2par_des_3tramos,
  v2par_des_2tramos,
};
export const CASOS_VICALC = casos;
export const casoVicalc = (nome: string) => {
  const c = casos[nome];
  if (!c) throw new Error(`Caso ${nome} não existe em vigas/__casos__`);
  return c;
};

/** DadosViga do caso, com `sng` nos números no modo original. */
export function dadosViga(v: VigaJson, modo: ModoSistrut): DadosViga {
  const s = modo === "original" ? sng : (x: number) => x;
  const tramo = (t: TramoJson): TramoViga => ({
    vao: s(t.vao),
    inercia: s(t.inercia),
    divisoes: t.divisoes.map((d) => ({
      p: s(d.p),
      d: s(d.d),
      f: s(d.f),
      pAcidental: s(d.pAcidental),
      fAcidental: s(d.fAcidental),
      ...(d.indexada ? { indexada: d.indexada } : {}),
    })),
  });
  const viga: DadosViga = {
    nome: v.nome,
    tramos: v.tramos.map(tramo),
    engasteEsquerdo: v.engasteEsquerdo,
    engasteDireito: v.engasteDireito,
    momentosExternos: [s(v.momentosExternos[0] ?? 0), s(v.momentosExternos[1] ?? 0)],
    pilares: v.pilares,
  };
  if (v.balancoEsquerdo) viga.balancoEsquerdo = tramo(v.balancoEsquerdo);
  if (v.balancoDireito) viga.balancoDireito = tramo(v.balancoDireito);
  return viga;
}

/** Parâmetros do VIGA.INI do caso; `emSingle` no modo original. */
export function parametrosDoCaso(p: ParametrosJson, modo: ModoSistrut): ParametrosVicalc {
  const tabela = {
    ...PARAMETROS_VIGA,
    ...p,
    reacaoNoPilar: p.reacaoNoPilar === "maxima" ? ("maxima" as const) : ("estatica" as const),
  };
  return modo === "original" ? emSingle(tabela) : tabela;
}

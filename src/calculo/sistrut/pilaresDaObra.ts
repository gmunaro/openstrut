// Campos de pilar da obra da V2 → entrada do PILGEEDI/PILAREDI/PILAR (NB-1/78 pelo
// SISTRUT). `obra.ts` monta as colunas e chama estas funções; tudo nas unidades do
// original (t, tm, m, cm, t/cm²). Ver docs/MODO-CALCULO.md, "Pilares".
//
// - Seção: retângulo b × h, ou `Pilar.secao` (circular com vazado ou poligonal).
// - Nível k da coluna = base do lance k (o pilar do k-ésimo pavimento de baixo para
//   cima): seção, vínculos, excentricidade e vento do pilar desse lance. Topo da
//   coluna: a seção do último lance e `vinculosTopo`.
// - `cargaTopo` vira um registro "soma" no nível do topo do lance, como uma segunda
//   leitura de .REP (ou a "Normal + Momento") no PILGEEDI (PILGEEDI.BAS:595, 644-670).
// - PILAR.INI e .PIP: os de fábrica com os campos de `obra.parametrosPilar` por cima,
//   nos dois modos (SINGLE no original).
import {
  VINCULOS_PILAR,
  type ParametrosPilarObra,
  type Pilar,
  type VinculosPilar,
} from "../../dominio/obra";
import { atribuicao, sng } from "./base/f32";
import { emSingle } from "./base/parametros";
import type {
  BarraPilar,
  CargaPilarNivel,
  ColunaEdificio,
  EntradaVerificacaoPilar,
  LeituraRep,
  LinhaRep,
  MateriaisSistrut,
  ModoSistrut,
  NivelColuna,
  ParametrosPilar,
  ParametrosPip,
  ParametrosPredimensionamento,
  PredimensionamentoPilar,
  SecaoPilar,
  VerificacaoPilar,
  VinculoPilar,
} from "./base/tipos";
import { KN_POR_TF, mpaParaTcm2 } from "./base/unidades";
import { predimensionaPilar } from "./pilares/carga";
import { verificaPilar } from "./pilares/verificacao";

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------- parâmetros

/** PILAR.INI e .PIP com os campos editados na obra. A densidade da obra vem em
 *  kN/m³; os materiais do PILAR.INI (fck, fyk, classe, γ) vão para
 *  `materiaisPilar`, não para a tabela. */
export function parametrosPilarDaObra(
  base: { pilar: ParametrosPilar; pip: ParametrosPip },
  obra: ParametrosPilarObra | undefined,
  modo: ModoSistrut,
): { pilar: ParametrosPilar; pip: ParametrosPip } {
  const conv = <T>(t: T) => (modo === "original" ? emSingle(t) : t);
  const pip = obra?.pip
    ? conv({
        ...obra.pip,
        ...(obra.pip.densidade === undefined ? {} : { densidade: obra.pip.densidade / KN_POR_TF }),
      })
    : {};
  const ini = obra?.ini ? conv(obra.ini) : {};
  return { pilar: { ...base.pilar, ...ini }, pip: { ...base.pip, ...pip } };
}

/** Materiais dos pilares: os da obra, com fck, fyk, classe e γ do PILAR.INI por cima
 *  (no original o PILAREDI tem os seus, item 1 do menu; fck e fyk em MPa/100). */
export function materiaisPilar(
  mat: MateriaisSistrut,
  obra: ParametrosPilarObra | undefined,
  modo: ModoSistrut,
): MateriaisSistrut {
  const ini = obra?.ini;
  if (!ini) return mat;
  const s = atribuicao(modo);
  const tcm2 = (mpa: number) => (modo === "original" ? sng(mpa / 100) : mpaParaTcm2(mpa));
  return {
    fck: ini.fck === undefined ? mat.fck : tcm2(ini.fck),
    fyk: ini.fyk === undefined ? mat.fyk : tcm2(ini.fyk),
    classeAco: ini.classeAco ?? mat.classeAco,
    gamaF: ini.gamaF === undefined ? mat.gamaF : s(ini.gamaF),
    gamaC: ini.gamaC === undefined ? mat.gamaC : s(ini.gamaC),
    gamaS: ini.gamaS === undefined ? mat.gamaS : s(ini.gamaS),
  };
}

/** Parâmetros do PILAR.INI que o predimensionamento usa (PILAR.BAS:566-567, 576-577). */
export const parametrosPredimensionamento = (
  par: ParametrosPilar,
): ParametrosPredimensionamento => ({
  excentricidadeMinima: par.excentricidadeMinima,
  verificaH30: par.verificaH30,
  coeficienteMedida: par.coeficienteMedida,
  coeficienteForca: par.coeficienteForca,
});

// ---------------------------------------------------------------- seção e níveis

/** Seção do pilar no contrato do porte, cm, com as barras dadas. */
export function secaoDoPilar(p: Pilar, modo: ModoSistrut, barras: BarraPilar[] = []): SecaoPilar {
  const s = atribuicao(modo);
  const sec = p.secao;
  if (!sec) return { tipo: "retangular", b: s(p.b), h: s(p.h), barras };
  if (sec.tipo === "circular")
    return { tipo: "circular", d: s(sec.d), dInterno: s(sec.dInterno), barras };
  return {
    tipo: "poligonal",
    vertices: sec.vertices.map((v) => ({ x: s(v.x), y: s(v.y) })),
    barras,
  };
}

const indiceVinculo = (v: VinculosPilar | undefined, dir: "x" | "y"): VinculoPilar => {
  const i = VINCULOS_PILAR.indexOf(v?.[dir] ?? "continuidade");
  return i === 0 ? 0 : i === 1 ? 1 : i === 3 ? 3 : 2;
};

/** Nível da coluna na base do lance do pilar (cota em m). `topo`: o nível de cima do
 *  último lance, com a seção dele e `vinculosTopo`, sem vento nem excentricidade. */
export function nivelDoPilar(p: Pilar, cota: number, modo: ModoSistrut, topo = false): NivelColuna {
  const s = atribuicao(modo);
  const vinculos = topo ? p.vinculosTopo : p.vinculos;
  const nivel: NivelColuna = {
    cota: s(cota),
    secao: secaoDoPilar(p, modo),
    vinculoX: indiceVinculo(vinculos, "x"),
    vinculoY: indiceVinculo(vinculos, "y"),
    normalVento: 0,
    mkx: 0,
    mky: 0,
  };
  if (topo) return nivel;
  if (p.excentricidade)
    nivel.excentricidade = { x: s(p.excentricidade.x), y: s(p.excentricidade.y) };
  if (p.vento) {
    nivel.normalVento = s(p.vento.normal / KN_POR_TF);
    nivel.ventos = p.vento.momentos.map((m) => ({ m: s(m.m / KN_POR_TF), angulo: s(m.angulo) }));
  }
  return nivel;
}

/** Linha de .REP com a `cargaTopo` do pilar, para a coluna `coluna` (o PILGEEDI casa
 *  pelo número no nome). Momento: texto = o valor em tm, como o .REP grava. */
export function linhaCargaTopo(p: Pilar, coluna: string, modo: ModoSistrut): LinhaRep | undefined {
  const c = p.cargaTopo;
  if (!c) return undefined;
  const s = atribuicao(modo);
  return {
    pilar: coluna,
    total: s(c.normal / KN_POR_TF),
    parcelas: [],
    momentos: c.momentos.map((m) => {
      const valor = s(m.m / KN_POR_TF);
      return {
        viga: "",
        valor,
        texto: String(valor),
        apoio: 0,
        vao: s(m.vao),
        inclinacao: s(m.inclinacao),
        rigidez: s(m.rigidez),
      };
    }),
  };
}

/** Registro "soma" das cargas no topo de um nível, depois do .REP do pavimento. */
export const leituraCargasTopo = (linhas: LinhaRep[], nivel: number): LeituraRep => ({
  linhas,
  nivelInicial: nivel,
  nivelFinal: nivel,
  modo: "soma",
});

// ---------------------------------------------------------------- predimensionamento

/** Predimensionamento de uma coluna pelo PILAREDI 3.1 desde a fundação (nível 0).
 *  "tensoes": com a seção do nível 0 imposta (B e H digitados); "secao": o quadrado
 *  escolhido, que `obra.ts` põe em todos os níveis da coluna. */
export interface PredimensionamentoSistrut {
  coluna: string;
  pilarId: string;
  modo: "tensoes" | "secao";
  resultado?: PredimensionamentoPilar;
  avisos: string[];
}

export function predimensionaColuna(
  reps: readonly LeituraRep[],
  coluna: ColunaEdificio,
  pilarId: string,
  mat: MateriaisSistrut,
  par: { pilar: ParametrosPilar; pip: ParametrosPip },
  modo: ModoSistrut,
  opcao: "tensoes" | "secao",
): PredimensionamentoSistrut {
  const r: PredimensionamentoSistrut = { coluna: coluna.nome, pilarId, modo: opcao, avisos: [] };
  try {
    r.resultado = predimensionaPilar(reps, coluna, 0, mat, par.pip, modo, {
      ...(opcao === "tensoes" ? { secao: coluna.niveis[0]!.secao } : {}),
      parametros: parametrosPredimensionamento(par.pilar),
    });
  } catch (e) {
    r.avisos.push(`${coluna.nome}: predimensionamento não concluído: ${mensagem(e)}`);
  }
  return r;
}

// ---------------------------------------------------------------- verificação (PILAR 6)

/** Uma verificação de seção dada (PILAR opção 6) de um pilar da obra. `repeticao` e
 *  `nivel` só quando os esforços vêm do lance calculado. */
export interface VerificacaoPilarSistrut {
  pavimentoId: string;
  pilarId: string;
  /** Índice em `Pilar.verificacoes`. */
  indice: number;
  repeticao?: number;
  nivel?: number;
  entrada: EntradaVerificacaoPilar;
  resultado?: VerificacaoPilar;
  avisos: string[];
}

/** Verifica as `verificacoes` de um pilar: com os esforços digitados, uma vez; sem
 *  eles, uma por lance do pilar, com Nk, Mk do caso "e" e le do PILAREDI. */
export function verificacoesDoPilar(
  p: Pilar,
  pavimentoId: string,
  lances: readonly { repeticao: number; nivel: number; carga: CargaPilarNivel }[],
  mat: MateriaisSistrut,
  par: ParametrosPilar,
  modo: ModoSistrut,
): VerificacaoPilarSistrut[] {
  const s = atribuicao(modo);
  const saida: VerificacaoPilarSistrut[] = [];
  (p.verificacoes ?? []).forEach((v, indice) => {
    const barras = v.barras.map((b) => ({ x: s(b.x), y: s(b.y), bitola: b.bitola }));
    const secao = secaoDoPilar(p, modo, barras);
    const casos = v.esforcos
      ? [
          {
            entrada: {
              nk: s(v.esforcos.nk / KN_POR_TF),
              mxk: s(v.esforcos.mxk / KN_POR_TF),
              myk: s(v.esforcos.myk / KN_POR_TF),
              lxe: s(v.esforcos.lex),
              lye: s(v.esforcos.ley),
            },
          },
        ]
      : lances.map((l) => ({
          repeticao: l.repeticao,
          nivel: l.nivel,
          entrada: {
            nk: l.carga.nk,
            mxk: l.carga.mkx,
            myk: l.carga.mky,
            lxe: l.carga.lex,
            lye: l.carga.ley,
          },
        }));
    for (const caso of casos) {
      const entrada: EntradaVerificacaoPilar = {
        secao,
        ...caso.entrada,
        materiais: mat,
        parametros: par,
      };
      const r: VerificacaoPilarSistrut = {
        pavimentoId,
        pilarId: p.id,
        indice,
        ...("repeticao" in caso ? { repeticao: caso.repeticao, nivel: caso.nivel } : {}),
        entrada,
        avisos: [],
      };
      try {
        r.resultado = verificaPilar(entrada, modo);
        r.avisos.push(...r.resultado.avisos.map((a) => `${p.nome}: ${a}`));
      } catch (e) {
        r.avisos.push(`${p.nome}: verificação não concluída: ${mensagem(e)}`);
      }
      saida.push(r);
    }
  });
  return saida;
}

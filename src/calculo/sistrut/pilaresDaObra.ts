// Campos de pilar da obra da V2 → entrada do PILGEEDI/PILAREDI/PILAR (NB-1/78 pelo
// SISTRUT). `obra.ts` monta as colunas e chama estas funções; tudo nas unidades do
// original (t, tm, m, cm, t/cm²). Ver docs/MODO-CALCULO.md, "Pilares".
//
// - Seção: retângulo b × h, ou `Pilar.secao` (circular com vazado ou poligonal).
// - Nível k da coluna = base do lance k (o pilar do k-ésimo pavimento de baixo para
//   cima): seção, vínculos, excentricidade e vento do pilar desse lance. Topo da
//   coluna: a seção do último lance e `vinculosTopo`.
// - `cargaTopo` vai ao slot A_1280 do nível do topo do lance (`cargaAdicional`), com
//   o sinal do momento, como a "Normal + Momento" do PILGEEDI (PILGEEDI.BAS:2407).
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
  EixoViga,
  EntradaVerificacaoPilar,
  LeituraRep,
  MateriaisSistrut,
  ModoSistrut,
  NivelColuna,
  ParametrosPilar,
  ParametrosPip,
  ParametrosPredimensionamento,
  Ponto,
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
 *  kN/m³; fck e fyk do PILAR.INI, em MPa, vão à tabela em t/cm², como em
 *  `materiaisPilar` (quem os usa no cálculo são os materiais, não a tabela). */
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
  const ini = obra?.ini
    ? conv({
        ...obra.ini,
        ...(obra.ini.fck === undefined ? {} : { fck: tcm2(obra.ini.fck, modo) }),
        ...(obra.ini.fyk === undefined ? {} : { fyk: tcm2(obra.ini.fyk, modo) }),
      })
    : {};
  return { pilar: { ...base.pilar, ...ini }, pip: { ...base.pip, ...pip } };
}

/** MPa → t/cm²: MPa/100 no original (a convenção de `materiais.fck`), exato no
 *  corrigido. */
const tcm2 = (mpa: number, modo: ModoSistrut) =>
  modo === "original" ? sng(mpa / 100) : mpaParaTcm2(mpa);

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
  return {
    fck: ini.fck === undefined ? mat.fck : tcm2(ini.fck, modo),
    fyk: ini.fyk === undefined ? mat.fyk : tcm2(ini.fyk, modo),
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
  coeficienteTensao: par.coeficienteTensao,
});

// ---------------------------------------------------------------- seção e níveis

/** Seção do pilar no contrato do porte, cm, com as barras dadas. */
export function secaoDoPilar(p: Pilar, modo: ModoSistrut, barras: BarraPilar[] = []): SecaoPilar {
  const s = atribuicao(modo);
  const sec = p.secao;
  if (!sec)
    return {
      tipo: "retangular",
      b: s(p.b),
      h: s(p.h),
      barras,
      ...(p.rotacao ? { rotacao: s(p.rotacao) } : {}),
    };
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

/** `cargaTopo` do pilar como o slot A_1280 do nível do topo do lance
 *  (`NivelColuna.cargaAdicional`, t e tm): normal e momentos com o sinal, sem passar
 *  pelo ABS da leitura do .REP. */
export function cargaDoNivel(
  p: Pilar,
  modo: ModoSistrut,
  qual: "cargaTopo" | "cargaBase" = "cargaTopo",
): NivelColuna["cargaAdicional"] {
  const c = p[qual];
  if (!c) return undefined;
  const s = atribuicao(modo);
  return {
    normal: s(c.normal / KN_POR_TF),
    momentos: c.momentos.map((m) => ({
      m: s(m.m / KN_POR_TF),
      inclinacao: s(m.inclinacao),
      vao: s(m.vao),
      rigidez: s(m.rigidez),
    })),
    ...(qual === "cargaTopo" && "modo" in c && c.modo ? { modo: c.modo } : {}),
  };
}

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

/** Verifica as `verificacoes` de um pilar: com os esforços digitados, uma vez, na
 *  seção do pilar; sem eles, uma por lance do pilar, com Nk, Mk do caso "e" e le do
 *  PILAREDI, na seção que o lance usou (`secao`; a do predimensionamento com "secao"). */
export function verificacoesDoPilar(
  p: Pilar,
  pavimentoId: string,
  lances: readonly {
    repeticao: number;
    nivel: number;
    carga: CargaPilarNivel;
    secao: SecaoPilar;
  }[],
  mat: MateriaisSistrut,
  par: ParametrosPilar,
  modo: ModoSistrut,
): VerificacaoPilarSistrut[] {
  const s = atribuicao(modo);
  const saida: VerificacaoPilarSistrut[] = [];
  (p.verificacoes ?? []).forEach((v, indice) => {
    const barras = v.barras.map((b) => ({ x: s(b.x), y: s(b.y), bitola: b.bitola }));
    const secaoDigitada = secaoDoPilar(p, modo, barras);
    const casos = v.esforcos
      ? [
          {
            secao: secaoDigitada,
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
          secao: { ...l.secao, barras },
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
        secao: caso.secao,
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

// ---------------------------------------------------------------- variações de armadura (PILAREDI 3.2)

/** Uma variação de armadura de uma coluna: os lances `inicio` ≤ k < `fim` (índices da
 *  coluna) têm a armadura dimensionada (ou dada) no lance `inicio`, o "Nivel
 *  Dimensionado" do relatório. */
export interface VariacaoArmadura {
  inicio: number;
  fim: number;
}

/** Variações de armadura de uma coluna (PILAREDI.BAS:5985-6012): cada trecho de seção
 *  constante (A_1338) começa uma variação; com `n` ≥ 1 ("varia de n em n níveis"), a
 *  seguinte começa n níveis acima, pulando os níveis livres nas duas direções, enquanto
 *  couber no trecho e no limite V_0ff8% + V_0e3c% − V_0e3e% > V_0fec! (V_0e3c% =
 *  máximo de variações − 1, V_0e3e% = 3, PILAREDI.BAS:70, 5999); com `n` = 0 ("N"),
 *  uma por trecho. `manuais`: lances que começam uma variação definida pelo usuário
 *  (a <V> de PILAREDI.BAS:6368-6420, ou a gravada no .COL). */
export function planoDeVariacoes(
  coluna: ColunaEdificio,
  manuais: readonly number[],
  n: number,
  maximoVariacoes: number,
  avisos: string[],
): VariacaoArmadura[] {
  const nv = coluna.niveis;
  const topo = nv.length - 1;
  const chave = (j: number) => JSON.stringify({ ...nv[j]!.secao, barras: [] });
  const secoes = [0];
  for (let j = 1; j < topo; j++) if (chave(j) !== chave(j - 1)) secoes.push(j);
  if (secoes.length > 4)
    avisos.push(
      `${coluna.nome}: ${secoes.length} seções; o PILAREDI aceita no máximo 4 por coluna (V_0e3e% = 3, PILAREDI.BAS:70, 4307).`,
    );
  const livre = (j: number) => nv[j]?.vinculoX === 3 && nv[j]?.vinculoY === 3;
  const inicios: number[] = [];
  secoes.forEach((a, s) => {
    const b = secoes[s + 1] ?? topo;
    inicios.push(a);
    if (n <= 0) return;
    let j = a;
    for (;;) {
      j += n - 1;
      do j += 1;
      while (j < topo && livre(j));
      if (!(j < b)) break;
      if (s + (maximoVariacoes - 1) - 3 > inicios.length - 1) {
        inicios.push(j);
        continue;
      }
      avisos.push(
        `${coluna.nome}: o limite de variações (V_0ff8% + V_0e3c% − V_0e3e% > V_0fec!, PILAREDI.BAS:5999; máximo ${maximoVariacoes}) corta o "de ${n} em ${n}" no nível ${j}: os lances seguintes do trecho ficam com a armadura da variação de baixo.`,
      );
      break;
    }
  });
  const todos = [...new Set([...inicios, ...manuais.filter((k) => k >= 0 && k < topo)])].sort(
    (a, b) => a - b,
  );
  if (todos.length > maximoVariacoes)
    avisos.push(
      `${coluna.nome}: ${todos.length} variações de armadura; o PILAREDI guarda no máximo ${maximoVariacoes} (PILAR.INI, PILAR.BAS:632).`,
    );
  return todos.map((inicio, i) => ({ inicio, fim: todos[i + 1] ?? topo }));
}

// ---------------------------------------------------------------- .RLP

/** Ângulo da viga a partir do pilar, graus inteiros (L_2e40f, LAJEMONT.BAS:6185-6225):
 *  de `de` para `para`; vertical = 90 ou 270, senão pelo ATN por quadrante; INT(θ·180/π)
 *  com θ em SINGLE no original. */
export function anguloRlp(de: Ponto, para: Ponto, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const x1 = de.x;
  const x2 = para.x;
  const y1 = de.y;
  // V_133a = 0,005 m (LAJE.BAS:121; LAJEMONT.BAS:4581)
  const y2 = Math.abs(de.y - para.y) < 0.005 ? de.y : para.y;
  let t = 0;
  if (x1 === x2) t = y1 > y2 ? (3 * Math.PI) / 2 : Math.PI / 2;
  else if (y1 <= y2 && x1 < x2) t = Math.atan((y2 - y1) / (x2 - x1));
  else if (y1 < y2 && x1 > x2) t = Math.PI - Math.atan((y2 - y1) / (x1 - x2));
  else if (y1 >= y2 && x1 > x2) t = Math.atan((y1 - y2) / (x1 - x2)) + Math.PI;
  else if (y1 > y2 && x1 < x2) t = 2 * Math.PI - Math.atan((y1 - y2) / (x2 - x1));
  const graus = (s(t) * 180) / Math.PI;
  return Math.floor(modo === "original" ? graus : graus + 1e-9);
}

/** Linha de inclinações do .RLP de cada pilar do pavimento, como o LAJEMONT grava
 *  (LAJEMONT.BAS:4239-4310, 614-625): as vigas que começam ou terminam no pilar, na
 *  ordem dos eixos (a do começo antes da do fim), até 4 (a 5ª fica no lugar da 4ª),
 *  "V1[0] >V4[270] >". Ângulo da ponta no pilar para a outra ponta da viga. */
export function inclinacoesRlp(eixos: readonly EixoViga[], modo: ModoSistrut) {
  const porPilar = new Map<string, { viga: string; angulo: number }[]>();
  const poe = (pilar: string, viga: string, angulo: number) => {
    const lista = porPilar.get(pilar) ?? [];
    if (lista.length < 4) lista.push({ viga, angulo });
    else lista[3] = { viga, angulo };
    porPilar.set(pilar, lista);
  };
  for (const e of eixos) {
    const a = e.pontos[0];
    const b = e.pontos.at(-1);
    if (!a || !b) continue;
    const ini = e.apoios[0];
    const fim = e.apoios.at(-1);
    if (ini && "pilar" in ini) poe(ini.pilar, e.nome, anguloRlp(a, b, modo));
    if (fim && "pilar" in fim) poe(fim.pilar, e.nome, anguloRlp(b, a, modo));
  }
  return new Map(
    [...porPilar].map(([p, l]) => [p, l.map((x) => `${x.viga}[${x.angulo}] >`).join("")]),
  );
}

/** Inclinação de um momento do .REP no PILGEEDI: a do .RLP, se o rótulo da viga está
 *  na linha do pilar (PILGEEDI.BAS:1021-1023); senão a gravada (0 sem edição, como o
 *  PILGEEDI deixa) no original e a direção da viga (0 ou 90) no corrigido (P-a). */
export function inclinacaoDoMomento(
  doRlp: number | undefined,
  gravada: number | undefined,
  horizontal: boolean,
  modo: ModoSistrut,
) {
  if (doRlp !== undefined) return doRlp;
  if (modo === "original") return gravada ?? 0;
  return horizontal ? 0 : 90;
}

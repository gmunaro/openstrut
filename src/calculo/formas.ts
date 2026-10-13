// Área de fôrma (m²) por elemento, por pavimento e da obra. Função pura.
//
// Regra "certa" (modo corrigido; geometria pelos eixos, como em quantitativos.ts):
// - Laje: fundo lx·ly.
// - Viga: fundo L·bw + 2 laterais L·(h − hlaje), com hlaje = a maior espessura
//   das lajes com bordo sobre a viga (0 se nenhuma): a lateral acima do fundo da
//   laje é a fôrma da própria laje.
// - Pilar: cada face vai do piso ao fundo da laje (pé-direito − hlaje, hlaje = a
//   maior laje que cobre o pilar) e, nas faces em que chega viga, desconta só a
//   faixa bw × (hviga − hlaje) que a fôrma da viga cobre (encontroNoPilar).
//   Antes a V2 descontava a viga mais alta no perímetro inteiro e dava 2,3 % a
//   menos na obra de revisão (L1 4×5 + balanço 1,5×5): 52,46 m² em vez de 53,72.
// - Pavimento: soma dos elementos × repetições do pavimento-tipo.
//
// Regras do SISTRUT de 1991 (modo original; docs/MODO-CALCULO.md, item G):
// - "editor" (FORMEDCA, a tela; V1 FcAreaForma#): viga com L·(bw + 2(h − hl)),
//   hl = a primeira laje do pavimento com h > 0, em TODAS as vigas; pilar com o
//   perímetro × pé-direito inteiro.
// - "impressao" (FORMIMP, o relatório): viga com L·(bw + 2h), sem descontar a
//   laje; pilar com o perímetro × pé-direito.
import {
  colineares,
  eixoDaViga,
  eixoDoBordo,
  posicaoNoEixo,
  sobreposicao,
  TOL,
} from "../dominio/gerar";
import {
  BORDOS,
  type Laje,
  type Obra,
  type Pavimento,
  type Pilar,
  type Viga,
} from "../dominio/obra";

/** Regra de volume e fôrma: "certa" no modo corrigido; no original, "editor"
 *  (FORMEDCA, o que a tela mostra) e "impressao" (FORMIMP, o relatório). */
export type RegraQuantitativo = "certa" | "editor" | "impressao";

export interface FormaElemento {
  tipo: "laje" | "viga" | "pilar";
  id: string;
  nome: string;
  /** Uma ocorrência, m². */
  area: number;
  /** Conta com os valores, para a memória. */
  formula: string;
}

export interface FormaPavimento {
  pavimentoId: string;
  nome: string;
  repeticoes: number;
  elementos: FormaElemento[];
  /** Somas de uma ocorrência do pavimento, m². */
  lajes: number;
  vigas: number;
  pilares: number;
  porPavimento: number;
  /** porPavimento × repetições, m². */
  total: number;
}

export interface FormasObra {
  pavimentos: FormaPavimento[];
  /** Soma dos totais dos pavimentos, m². */
  total: number;
}

const f = (x: number, casas = 2) => x.toFixed(casas);

/** Laje: fundo lx·ly, m². */
export const formaLaje = (l: Pick<Laje, "lx" | "ly">) => l.lx * l.ly;

/** Viga: fundo + 2 laterais abaixo da laje, m². `hLaje` em cm. */
export function formaViga(v: Pick<Viga, "x1" | "y1" | "x2" | "y2" | "bw" | "h">, hLaje: number) {
  const L = Math.hypot(v.x2 - v.x1, v.y2 - v.y1);
  return L * (v.bw / 100 + (2 * Math.max(0, v.h - hLaje)) / 100);
}

/** Viga que chega ao pilar: seção (cm), direção do eixo e quantas faces do pilar
 *  ela ocupa (2 se passa pelo pilar, 1 se termina nele). */
export interface VigaNoPilar {
  bw: number;
  h: number;
  horizontal: boolean;
  faces: 1 | 2;
}

/** O que a regra certa desconta da fôrma do pilar: a laje sobre ele (cm) e as vigas. */
export interface EncontroPilar {
  hLaje: number;
  vigas: readonly VigaNoPilar[];
}

/** Pilar sem desconto (regras do SISTRUT): perímetro × pé-direito. */
export const SEM_ENCONTRO: EncontroPilar = { hLaje: 0, vigas: [] };

/** Pilar, m²: perímetro × (pé-direito − hlaje) menos, em cada face onde chega
 *  viga, bw × (hviga − hlaje). Viga horizontal (eixo em x) chega nas faces de
 *  largura h; vertical, nas de largura b (bw maior que a face desconta a face).
 *  Pé-direito em m; seções e hlaje em cm. Com SEM_ENCONTRO dá perímetro × pé-direito. */
export function formaPilar(
  p: Pick<Pilar, "b" | "h">,
  peDireito: number,
  encontro: EncontroPilar = SEM_ENCONTRO,
) {
  const altura = Math.max(0, peDireito - encontro.hLaje / 100);
  let area = ((2 * (p.b + p.h)) / 100) * altura;
  for (const v of encontro.vigas) {
    const face = v.horizontal ? p.h : p.b;
    const faixa = Math.min(altura, Math.max(0, v.h - encontro.hLaje) / 100);
    area -= v.faces * (Math.min(v.bw, face) / 100) * faixa;
  }
  return Math.max(0, area);
}

/** Vigas cujo eixo passa pelo pilar e a maior espessura (cm) das lajes que cobrem
 *  o ponto dele: a entrada de formaPilar na regra certa. */
export function encontroNoPilar(
  pilar: Pick<Pilar, "x" | "y">,
  pav: Pick<Pavimento, "lajes" | "vigas">,
): EncontroPilar {
  let hLaje = 0;
  for (const l of pav.lajes)
    if (
      pilar.x >= l.x - TOL &&
      pilar.x <= l.x + l.lx + TOL &&
      pilar.y >= l.y - TOL &&
      pilar.y <= l.y + l.ly + TOL
    )
      hLaje = Math.max(hLaje, l.h);
  const vigas: VigaNoPilar[] = [];
  for (const v of pav.vigas) {
    const e = eixoDaViga(v);
    const s = e && posicaoNoEixo(e, pilar.x, pilar.y);
    if (!e || s === undefined) continue;
    const passa = s > e.s1 + TOL && s < e.s2 - TOL;
    vigas.push({ bw: v.bw, h: v.h, horizontal: e.horizontal, faces: passa ? 2 : 1 });
  }
  return { hLaje, vigas };
}

/** Espessura de referência do pavimento no SISTRUT (V1 FcHLaje#): a da primeira
 *  laje com h > 0, cm (0 sem laje). O editor de formas a desconta de toda viga. */
export function espessuraReferencia(lajes: readonly Pick<Laje, "h">[]) {
  return lajes.find((l) => l.h > 0)?.h ?? 0;
}

/** hlaje (cm) descontado da viga pela regra: a maior laje sobre ela (certa), a
 *  de referência do pavimento (editor) ou nenhuma (impressao). */
export function hLajeDaViga(regra: RegraQuantitativo, viga: Viga, lajes: readonly Laje[]) {
  if (regra === "certa") return espessuraLajeNaViga(viga, lajes);
  return regra === "editor" ? espessuraReferencia(lajes) : 0;
}

/** Espessura descontada da viga: a maior das lajes com bordo sobre o eixo dela, cm. */
export function espessuraLajeNaViga(viga: Viga, lajes: readonly Laje[]) {
  const eixo = eixoDaViga(viga);
  if (!eixo) return 0;
  let h = 0;
  for (const l of lajes)
    for (const b of BORDOS) {
      const e = eixoDoBordo(l, b);
      if (colineares(e, eixo) && sobreposicao(e.s1, e.s2, eixo.s1, eixo.s2) > TOL)
        h = Math.max(h, l.h);
    }
  return h;
}

/** Conta da fôrma do pilar para a memória. */
export function formulaFormaPilar(p: Pick<Pilar, "b" | "h">, peDireito: number, e: EncontroPilar) {
  const perimetro = f((2 * (p.b + p.h)) / 100);
  if (e.hLaje === 0 && e.vigas.length === 0)
    return `2(b + h)·pé-direito = ${perimetro}·${f(peDireito)}`;
  const vigas = e.vigas
    .map((v) => `${v.faces}·${f(v.bw / 100, 3)}·${f(Math.max(0, v.h - e.hLaje) / 100, 3)}`)
    .join(" − ");
  return `2(b + h)·(pé-direito − hlaje) − Σ faces·bw·(hviga − hlaje) = ${perimetro}·(${f(peDireito)} − ${f(e.hLaje / 100, 3)})${vigas ? ` − ${vigas}` : ""}`;
}

/** Fôrma de um pavimento: elementos, somas de uma ocorrência e total com as
 *  repetições, pela regra (padrão: a certa). */
export function formasPavimento(p: Pavimento, regra: RegraQuantitativo = "certa"): FormaPavimento {
  const elementos: FormaElemento[] = [
    ...p.lajes.map((l): FormaElemento => ({
      tipo: "laje",
      id: l.id,
      nome: l.nome,
      area: formaLaje(l),
      formula: `lx·ly = ${f(l.lx)}·${f(l.ly)}`,
    })),
    ...p.vigas.map((v): FormaElemento => {
      const hLaje = hLajeDaViga(regra, v, p.lajes);
      const L = Math.hypot(v.x2 - v.x1, v.y2 - v.y1);
      return {
        tipo: "viga",
        id: v.id,
        nome: v.nome,
        area: formaViga(v, hLaje),
        formula: `L·(bw + 2(h − hlaje)) = ${f(L)}·(${f(v.bw / 100, 3)} + 2·${f(Math.max(0, v.h - hLaje) / 100, 3)})`,
      };
    }),
    ...p.pilares.map((q): FormaElemento => {
      const e = regra === "certa" ? encontroNoPilar(q, p) : SEM_ENCONTRO;
      return {
        tipo: "pilar",
        id: q.id,
        nome: q.nome,
        area: formaPilar(q, p.peDireito, e),
        formula: formulaFormaPilar(q, p.peDireito, e),
      };
    }),
  ];
  const somaTipo = (t: FormaElemento["tipo"]) =>
    elementos.filter((e) => e.tipo === t).reduce((s, e) => s + e.area, 0);
  const lajes = somaTipo("laje");
  const vigas = somaTipo("viga");
  const pilares = somaTipo("pilar");
  const porPavimento = lajes + vigas + pilares;
  return {
    pavimentoId: p.id,
    nome: p.nome,
    repeticoes: p.repeticoes,
    elementos,
    lajes,
    vigas,
    pilares,
    porPavimento,
    total: porPavimento * p.repeticoes,
  };
}

/** Fôrma da obra inteira, pavimento a pavimento (na ordem da obra), pela regra. */
export function formasObra(obra: Obra, regra: RegraQuantitativo = "certa"): FormasObra {
  const pavimentos = obra.pavimentos.map((p) => formasPavimento(p, regra));
  return { pavimentos, total: pavimentos.reduce((s, p) => s + p.total, 0) };
}

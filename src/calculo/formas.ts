// Área de fôrma (m²) por elemento, por pavimento e da obra. Função pura.
//
// Convenções (geometria pelos eixos, como em quantitativos.ts; os encontros
// entram nos dois elementos):
// - Laje: fundo lx·ly.
// - Viga: fundo L·bw + 2 laterais L·(h − hlaje), com hlaje = a maior espessura
//   das lajes com bordo sobre a viga (0 se nenhuma): a lateral acima do fundo da
//   laje é a fôrma da própria laje.
// - Pilar: perímetro 2(b + h)·(pé-direito − hviga), com hviga = a maior altura
//   das vigas que passam pelo pilar (0 se nenhuma): a fôrma do pilar vai do piso
//   ao fundo da viga mais alta.
// - Pavimento: soma dos elementos × repetições do pavimento-tipo.
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

/** Pilar: perímetro × (pé-direito − hviga), m². `hViga` em cm, pé-direito em m. */
export const formaPilar = (p: Pick<Pilar, "b" | "h">, peDireito: number, hViga: number) =>
  (2 * (p.b + p.h) * Math.max(0, peDireito - hViga / 100)) / 100;

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

/** Maior altura (cm) das vigas cujo eixo passa pelo pilar; 0 se nenhuma. */
export function alturaVigaNoPilar(pilar: Pilar, vigas: readonly Viga[]) {
  let h = 0;
  for (const v of vigas) {
    const e = eixoDaViga(v);
    if (e && posicaoNoEixo(e, pilar.x, pilar.y) !== undefined) h = Math.max(h, v.h);
  }
  return h;
}

/** Fôrma de um pavimento: elementos, somas de uma ocorrência e total com as repetições. */
export function formasPavimento(p: Pavimento): FormaPavimento {
  const elementos: FormaElemento[] = [
    ...p.lajes.map((l): FormaElemento => ({
      tipo: "laje",
      id: l.id,
      nome: l.nome,
      area: formaLaje(l),
      formula: `lx·ly = ${f(l.lx)}·${f(l.ly)}`,
    })),
    ...p.vigas.map((v): FormaElemento => {
      const hLaje = espessuraLajeNaViga(v, p.lajes);
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
      const hViga = alturaVigaNoPilar(q, p.vigas);
      return {
        tipo: "pilar",
        id: q.id,
        nome: q.nome,
        area: formaPilar(q, p.peDireito, hViga),
        formula: `2(b + h)·(pé-direito − hviga) = ${f((2 * (q.b + q.h)) / 100)}·(${f(p.peDireito)} − ${f(hViga / 100)})`,
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

/** Fôrma da obra inteira, pavimento a pavimento (na ordem da obra). */
export function formasObra(obra: Obra): FormasObra {
  const pavimentos = obra.pavimentos.map(formasPavimento);
  return { pavimentos, total: pavimentos.reduce((s, p) => s + p.total, 0) };
}

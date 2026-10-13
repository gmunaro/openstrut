// Geração automática de vigas e pilares a partir das lajes de um pavimento,
// portada da V1: LAJEGEOT.BM (LgDetectaContinuidade: vigas nos bordos, união
// das colineares que se tocam, numeração) e LAJMONT.BM (LmMonta: pilares nas
// extremidades e cruzamentos, seção inicial bw = 12 e h = vão/10).
import { novoId } from "./criar";
import {
  BORDOS,
  type Bordo,
  type Laje,
  type Pavimento,
  type Pilar,
  type Ponto,
  type Viga,
} from "./obra";

/** Tolerância geométrica, m (V1: LG_TOL e TOL de LmMonta). */
export const TOL = 0.001;

/** Seção inicial das vigas geradas (V1 LmMonta). */
export const BW_INICIAL = 12;
export const H_MINIMO = 30;
/** Seção inicial dos pilares gerados, cm. A V1 não dá seção na montagem; 20 cm é o mínimo da NB-1/78. */
export const PILAR_INICIAL = 20;

/** Mesmo ponto da planta, a menos de TOL. */
export const mesmoPonto = (a: Ponto, b: Ponto) =>
  Math.abs(a.x - b.x) <= TOL && Math.abs(a.y - b.y) <= TOL;

/** Trecho de eixo horizontal (y = c, de s1 a s2 em x) ou vertical (x = c, de s1 a s2 em y). */
export interface Eixo {
  horizontal: boolean;
  c: number;
  s1: number;
  s2: number;
}

/** Eixo do bordo de uma laje (V1 LgGeom / LmBordo). */
export function eixoDoBordo(l: Laje, b: Bordo): Eixo {
  switch (b) {
    case "esquerdo":
      return { horizontal: false, c: l.x, s1: l.y, s2: l.y + l.ly };
    case "inferior":
      return { horizontal: true, c: l.y, s1: l.x, s2: l.x + l.lx };
    case "direito":
      return { horizontal: false, c: l.x + l.lx, s1: l.y, s2: l.y + l.ly };
    case "superior":
      return { horizontal: true, c: l.y + l.ly, s1: l.x, s2: l.x + l.lx };
  }
}

/** Eixo de uma viga; undefined se ela não for horizontal nem vertical. */
export function eixoDaViga(v: Viga): Eixo | undefined {
  if (Math.abs(v.y1 - v.y2) <= TOL)
    return { horizontal: true, c: v.y1, s1: Math.min(v.x1, v.x2), s2: Math.max(v.x1, v.x2) };
  if (Math.abs(v.x1 - v.x2) <= TOL)
    return { horizontal: false, c: v.x1, s1: Math.min(v.y1, v.y2), s2: Math.max(v.y1, v.y2) };
  return undefined;
}

/** Posição de (x, y) ao longo do eixo, ou undefined se o ponto não está sobre ele. */
export function posicaoNoEixo(e: Eixo, x: number, y: number): number | undefined {
  const [c, s] = e.horizontal ? [y, x] : [x, y];
  if (Math.abs(c - e.c) > TOL || s < e.s1 - TOL || s > e.s2 + TOL) return undefined;
  return s;
}

/** Ponto (x, y) da posição s ao longo do eixo. */
export const pontoDoEixo = (e: Eixo, s: number) =>
  e.horizontal ? { x: s, y: e.c } : { x: e.c, y: s };

/** Mesma reta (orientação e coordenada). */
export const colineares = (a: Eixo, b: Eixo) =>
  a.horizontal === b.horizontal && Math.abs(a.c - b.c) <= TOL;

/** Comprimento da sobreposição de [a1, a2] e [b1, b2] (V1 LmSobrepoe#). */
export function sobreposicao(a1: number, a2: number, b1: number, b2: number) {
  const d = Math.min(a2, b2) - Math.max(a1, b1);
  return d > 0 ? d : 0;
}

/** Cruzamento de um eixo horizontal com um vertical, extremidades incluídas (V1 LmMonta passo 3). */
export function cruzamento(h: Eixo, v: Eixo) {
  const dentro = v.c >= h.s1 - TOL && v.c <= h.s2 + TOL && h.c >= v.s1 - TOL && h.c <= v.s2 + TOL;
  return dentro ? { x: v.c, y: h.c } : undefined;
}

/** h inicial da viga: vão máximo / 10, arredondado para cima a 5 cm, mínimo 30 cm (V1 LmMonta).
 *  O -1e-9 só evita que um vão como 5,000000000000001 m (soma de coordenadas) suba para 55 cm. */
export function alturaInicial(vaoMaximo: number) {
  const h = Math.ceil((vaoMaximo * 100) / 10 / 5 - 1e-9) * 5;
  return Math.max(h, H_MINIMO);
}

/** Ordem de numeração das vigas (V1 LgAntes%): horizontais primeiro, de cima para
 *  baixo e, na mesma linha, da esquerda para a direita; depois as verticais, da
 *  esquerda para a direita e, na mesma linha, de cima para baixo. */
function ordemVigas(a: Eixo, b: Eixo) {
  if (a.horizontal !== b.horizontal) return a.horizontal ? -1 : 1;
  if (a.horizontal) return Math.abs(a.c - b.c) > TOL ? b.c - a.c : a.s1 - b.s1;
  return Math.abs(a.c - b.c) > TOL ? a.c - b.c : b.s2 - a.s2;
}

/** Ordem dos pilares (V1 LmMonta): y decrescente, depois x crescente. */
function ordemPilares(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.y - b.y) > TOL ? b.y - a.y : a.x - b.x;
}

const NOME_AUTO_VIGA = /^V\d+$/;
const NOME_AUTO_PILAR = /^P\d+$/;

/** Eixos das vigas do pavimento: um por grupo de bordos não livres colineares que
 *  se tocam ou se sobrepõem (V1 LgDetectaContinuidade passos 3 e 3b; o 3b engloba o 3).
 *  Já na ordem de numeração da V1. */
export function eixosDasVigas(lajes: readonly Laje[]): Eixo[] {
  const bordos = lajes.flatMap((l) =>
    BORDOS.filter((b) => l.vinculos[b] !== "livre").map((b) => eixoDoBordo(l, b)),
  );
  // união por busca em largura sobre "colinear e se toca"
  const grupo = Array.from(bordos, () => -1);
  const eixos: Eixo[] = [];
  bordos.forEach((inicial, i) => {
    if (grupo[i] !== -1) return;
    const g = eixos.length;
    const uniao = { ...inicial };
    grupo[i] = g;
    const fila = [i];
    for (let k = 0; k < fila.length; k++) {
      const a = bordos[fila[k] ?? 0];
      if (!a) continue;
      bordos.forEach((b, j) => {
        if (grupo[j] !== -1 || !colineares(a, b)) return;
        if (a.s2 >= b.s1 - TOL && b.s2 >= a.s1 - TOL) {
          grupo[j] = g;
          fila.push(j);
          uniao.s1 = Math.min(uniao.s1, b.s1);
          uniao.s2 = Math.max(uniao.s2, b.s2);
        }
      });
    }
    eixos.push(uniao);
  });
  return eixos.sort(ordemVigas);
}

/** Pontos de pilar: extremidades das vigas e cruzamentos horizontal x vertical (V1 LmMonta passo 3). */
export function pontosDePilar(eixos: readonly Eixo[]) {
  const pontos: { x: number; y: number }[] = [];
  const acrescenta = (p: { x: number; y: number }) => {
    if (!pontos.some((q) => Math.abs(q.x - p.x) <= TOL && Math.abs(q.y - p.y) <= TOL))
      pontos.push(p);
  };
  for (const e of eixos) {
    acrescenta(pontoDoEixo(e, e.s1));
    acrescenta(pontoDoEixo(e, e.s2));
    if (!e.horizontal) continue;
    for (const v of eixos) {
      if (v.horizontal) continue;
      const p = cruzamento(e, v);
      if (p) acrescenta(p);
    }
  }
  return pontos;
}

/** Gera as vigas nos bordos não livres das lajes e os pilares nas extremidades e
 *  cruzamentos, como a V1, e devolve um novo pavimento (as lajes não mudam).
 *
 *  Elementos que já existiam são preservados:
 *  - pilar na mesma posição (±1 mm) mantém id, nome e seção; pilar existente fora
 *    das posições geradas fica se estiver sobre o eixo de alguma viga (pilar
 *    intermediário acrescentado pelo usuário) e sai se não estiver;
 *  - viga gerada que se sobrepõe a uma viga existente na mesma linha herda id,
 *    nome, seção e carga linear dela (a de maior sobreposição);
 *  - nomes automáticos (V<n>, P<n>) são renumerados na ordem da V1; nomes editados ficam.
 *
 *  Posições em pavimento.pilaresRemovidos não ganham pilar: a viga passa contínua
 *  sobre o ponto (na montagem ele vira cruzamento viga-viga ou ponta em balanço).
 *  Saem da lista as posições que deixaram de ser extremidade ou cruzamento (para não
 *  sumir com o pilar de uma planta futura) e as que já têm pilar. */
export function gerarEstrutura(pavimento: Pavimento): Pavimento {
  const eixos = eixosDasVigas(pavimento.lajes);

  // pilares
  const gerados = pontosDePilar(eixos);
  const pilaresRemovidos = pavimento.pilaresRemovidos.filter(
    (r) =>
      gerados.some((p) => mesmoPonto(p, r)) && !pavimento.pilares.some((q) => mesmoPonto(q, r)),
  );
  const pontos = gerados.filter((p) => !pilaresRemovidos.some((r) => mesmoPonto(r, p)));
  const usados = new Set<string>();
  const pilares: Pilar[] = pontos.map((p) => {
    const existente = pavimento.pilares.find((q) => !usados.has(q.id) && mesmoPonto(q, p));
    if (existente) {
      usados.add(existente.id);
      return { ...existente };
    }
    return { id: novoId(), nome: "", x: p.x, y: p.y, b: PILAR_INICIAL, h: PILAR_INICIAL };
  });
  for (const q of pavimento.pilares) {
    if (!usados.has(q.id) && eixos.some((e) => posicaoNoEixo(e, q.x, q.y) !== undefined))
      pilares.push({ ...q });
  }
  pilares.sort(ordemPilares);
  pilares.forEach((p, i) => {
    if (p.nome === "" || NOME_AUTO_PILAR.test(p.nome)) p.nome = `P${i + 1}`;
  });

  // vigas: casa cada eixo gerado com a viga existente de maior sobreposição
  const pares = eixos.flatMap((e, i) =>
    pavimento.vigas.flatMap((v) => {
      const ev = eixoDaViga(v);
      const ov = ev && colineares(e, ev) ? sobreposicao(e.s1, e.s2, ev.s1, ev.s2) : 0;
      return ov > TOL ? [{ i, v, ov }] : [];
    }),
  );
  pares.sort((a, b) => b.ov - a.ov);
  const herdada = new Map<number, Viga>();
  const vigasUsadas = new Set<string>();
  for (const { i, v } of pares) {
    if (herdada.has(i) || vigasUsadas.has(v.id)) continue;
    herdada.set(i, v);
    vigasUsadas.add(v.id);
  }

  const vigas = eixos.map((e, i): Viga => {
    const a = pontoDoEixo(e, e.s1);
    const b = pontoDoEixo(e, e.s2);
    const geometria = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    const nomeAuto = `V${i + 1}`;
    const antiga = herdada.get(i);
    if (antiga) {
      const nome = NOME_AUTO_VIGA.test(antiga.nome) ? nomeAuto : antiga.nome;
      return { ...antiga, ...geometria, nome };
    }
    return {
      id: novoId(),
      nome: nomeAuto,
      ...geometria,
      bw: BW_INICIAL,
      h: alturaInicial(vaoMaximo(e, pilares)),
      cargaLinear: 0,
    };
  });

  return { ...pavimento, vigas, pilares, pilaresRemovidos };
}

/** Maior distância entre pilares consecutivos sobre o eixo (V1 LmMonta passo 4). */
function vaoMaximo(e: Eixo, pilares: readonly Pilar[]) {
  const s = pilares
    .map((p) => posicaoNoEixo(e, p.x, p.y))
    .filter((v) => v !== undefined)
    .sort((a, b) => a - b);
  if (s.length < 2) return e.s2 - e.s1;
  let max = 0;
  for (let k = 1; k < s.length; k++) max = Math.max(max, (s[k] ?? 0) - (s[k - 1] ?? 0));
  return max;
}

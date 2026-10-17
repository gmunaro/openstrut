// Onde fica a escada (vigas avulsas) importada do SISTRUT. O importador põe as vigas de
// um .VIG sem .LAJ num pavimento à parte, fora da planta, sem cota (telas/InicioSistrut.ts,
// pavimentoDeVigasAvulsas). A posição se deduz pelas cargas: o usuário do original lança a
// reação de cada apoio da escada como carga concentrada nas vigas que a recebem. A reação
// que casa (2 %) com a carga de uma viga do prédio, ou a carga "reacao" que cita a viga,
// dá o ponto da planta e o nível daquele apoio.
//
// É a mesma regra da vista 3D (telas/obra3d/escada.ts, na branch da vista 3D: TOL_REACAO,
// reacoesBiapoiada, apoiosCasados e melhorPar). Função pura, sem IFC: ao juntar as duas
// branches, uma deve passar a importar a outra.
import { geometriaDasVigas, type GeometriaViga } from "../../calculo/montagem";
import type { CargaViga, Pavimento, Ponto, Viga } from "../../dominio/obra";

/** Tolerância relativa entre a reação da viga avulsa e a carga lançada na viga do prédio. */
export const TOL_REACAO = 0.02;

/** Pavimento de vigas avulsas que o importador do SISTRUT cria: sem lajes, todos os
 *  apoios desconsiderados e todos os pilares marcados como transição. */
export function pavimentoDeVigasAvulsas(p: Pavimento): boolean {
  return (
    p.lajes.length === 0 &&
    p.vigas.length > 0 &&
    p.pilares.every((q) => q.transicao === true) &&
    p.vigas.every((v) => (v.apoiosDesconsiderados?.length ?? 0) >= (v.vaos?.length ?? 1) + 1)
  );
}

/** Nível do prédio onde um apoio pode cair: o pavimento e a cota do topo da laje, m. */
export interface NivelPredio {
  pavimento: Pavimento;
  cota: number;
}

/** Um apoio da escada deduzido: ponto da planta, nível e a viga que recebe a reação. */
export interface ApoioEscada {
  ponto: Ponto;
  nivel: NivelPredio;
  viga: string;
}

const comprimento = (v: Viga) => Math.hypot(v.x2 - v.x1, v.y2 - v.y1);

/** Reações nos dois apoios de uma viga biapoiada de um tramo, kN, pela estática das
 *  cargas distribuídas e concentradas da própria viga. Undefined com mais de um tramo. */
export function reacoesBiapoiada(v: Viga): [number, number] | undefined {
  if ((v.vaos?.length ?? 1) !== 1) return undefined;
  const l = v.vaos?.[0] ?? comprimento(v);
  if (!(l > 0)) return undefined;
  let total = 0;
  let momento = 0; // em torno do apoio esquerdo
  for (const c of v.cargas ?? []) {
    if (c.tipo === "distribuida") {
      const f = c.total * (c.fim - c.inicio);
      total += f;
      momento += (f * (c.inicio + c.fim)) / 2;
    } else if (c.tipo === "concentrada") {
      total += c.total;
      momento += c.total * c.posicao;
    }
  }
  if (!(total > 0)) return undefined;
  const direita = momento / l;
  return [total - direita, direita];
}

/** Ponto da planta de uma carga num trecho da viga (nós de geometriaDasVigas). */
function pontoDaCarga(g: GeometriaViga, c: Extract<CargaViga, { posicao: number }>) {
  const s0 = g.nos[c.trecho];
  if (s0 === undefined) return undefined;
  const s = s0 + c.posicao;
  return g.eixo.horizontal ? { x: s, y: g.eixo.c } : { x: g.eixo.c, y: s };
}

/** Onde a reação `r` do apoio `indice` foi lançada: vigas do prédio (de nome em `nomes`,
 *  se houver) com carga concentrada igual a menos de TOL_REACAO, ou carga "reacao" que
 *  cita a viga. O pavimento-tipo repete a carga em cada nível; vale o mais baixo. */
function apoiosCasados(
  viga: Viga,
  indice: number,
  r: number,
  nomes: readonly string[],
  niveis: readonly NivelPredio[],
  geometria: (p: Pavimento) => Map<string, GeometriaViga>,
): ApoioEscada[] {
  const achados: ApoioEscada[] = [];
  for (const nivel of niveis) {
    const pav = nivel.pavimento;
    const g = geometria(pav);
    for (const w of pav.vigas) {
      if (nomes.length > 0 && !nomes.includes(w.nome)) continue;
      const gw = g.get(w.id);
      if (!gw) continue;
      for (const c of w.cargas ?? []) {
        if (c.tipo === "distribuida") continue;
        const casa =
          c.tipo === "reacao"
            ? c.viga === viga.id && c.apoio === indice
            : Math.abs(c.total - r) <= TOL_REACAO * r;
        const ponto = casa ? pontoDaCarga(gw, c) : undefined;
        if (ponto) achados.push({ ponto, nivel, viga: w.nome });
      }
    }
  }
  return achados;
}

/** Os dois apoios em níveis diferentes, o de baixo primeiro; os mais próximos em altura. */
function melhorPar(a: ApoioEscada[], b: ApoioEscada[]): [ApoioEscada, ApoioEscada] | undefined {
  let melhor: [ApoioEscada, ApoioEscada] | undefined;
  for (const x of a)
    for (const y of b) {
      if (x.nivel.pavimento.id === y.nivel.pavimento.id) continue;
      const d = Math.abs(x.nivel.cota - y.nivel.cota);
      if (!melhor || d < Math.abs(melhor[0].nivel.cota - melhor[1].nivel.cota))
        melhor = x.nivel.cota < y.nivel.cota ? [x, y] : [y, x];
    }
  return melhor;
}

/** Apoio de baixo e de cima de cada viga de `avulso`, deduzidos pelas reações lançadas
 *  nas vigas do prédio. `niveis`: um por pavimento do prédio, na cota mais baixa dele.
 *  A viga sem os dois apoios casados em níveis diferentes fica sem entrada no mapa. */
export function deduzirApoiosEscada(
  avulso: Pavimento,
  niveis: readonly NivelPredio[],
): Map<string, [ApoioEscada, ApoioEscada]> {
  const cache = new Map<string, Map<string, GeometriaViga>>();
  const geometria = (p: Pavimento) => {
    let g = cache.get(p.id);
    if (!g) {
      g = new Map(geometriaDasVigas(p).vigas.map((x) => [x.viga.id, x]));
      cache.set(p.id, g);
    }
    return g;
  };
  const deduzidos = new Map<string, [ApoioEscada, ApoioEscada]>();
  for (const v of avulso.vigas) {
    const r = reacoesBiapoiada(v);
    if (!r) continue;
    const nomes = (v.forma?.apoios ?? []).flatMap((a) =>
      a.tipo === "V" && a.titulo ? [a.titulo] : [],
    );
    const par = melhorPar(
      apoiosCasados(v, 0, r[0], nomes, niveis, geometria),
      apoiosCasados(v, 1, r[1], nomes, niveis, geometria),
    );
    if (par) deduzidos.set(v.id, par);
  }
  return deduzidos;
}

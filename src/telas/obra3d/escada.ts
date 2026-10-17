// Escada (e outras vigas avulsas) importada do SISTRUT na vista 3D. O importador põe as
// vigas de um .VIG sem .LAJ num pavimento à parte, deslocado para fora da planta, com
// todos os apoios desconsiderados e pilares de transição só de cálculo
// (InicioSistrut.ts, pavimentoDeVigasAvulsas). Esse pavimento não tem cota nem posição.
// Aqui a posição é deduzida pelas cargas: o usuário do original lança a reação de cada
// apoio da escada como carga concentrada nas vigas que a recebem. A reação que casa
// (2 %) com a carga de uma viga do prédio dá o ponto da planta e o nível daquele apoio.
// Sem os dois apoios casados em níveis diferentes, a viga fica ao lado do prédio, com
// aviso. Ver docs/VISTA-3D.md, "Escada".
import type { GeometriaViga } from "../../calculo/montagem";
import type { CargaViga, Pavimento, Ponto, Viga } from "../../dominio/obra";
import type { Elemento3D, Nivel, Ponto3, Solido } from "./modelo";

/** Tolerância relativa entre a reação da viga avulsa e a carga lançada na viga do prédio. */
export const TOL_REACAO = 0.02;

/** Pavimento de vigas avulsas que o importador do SISTRUT cria: sem lajes, todos os
 *  apoios desconsiderados e todos os pilares marcados como transição. */
export function pavimentoAvulso(p: Pavimento): boolean {
  return (
    p.lajes.length === 0 &&
    p.vigas.length > 0 &&
    p.pilares.every((q) => q.transicao === true) &&
    p.vigas.every((v) => (v.apoiosDesconsiderados?.length ?? 0) >= (v.vaos?.length ?? 1) + 1)
  );
}

const comprimento = (v: Viga) => Math.hypot(v.x2 - v.x1, v.y2 - v.y1);

/** Reações nos dois apoios de uma viga biapoiada de um tramo, kN, pela estática: só as
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

interface Apoio {
  ponto: Ponto;
  nivel: Nivel;
  viga: string;
}

/** Onde a reação `r` foi lançada: vigas do prédio (de nome em `nomes`, se houver) com
 *  carga concentrada igual a menos de TOL_REACAO, ou carga "reacao" que cita a viga. */
function apoiosCasados(
  viga: Viga,
  indiceApoio: number,
  r: number,
  nomes: readonly string[],
  predio: readonly Pavimento[],
  niveis: readonly Nivel[],
  geometriaDe: (p: Pavimento) => Map<string, GeometriaViga>,
): Apoio[] {
  const achados: Apoio[] = [];
  for (const pav of predio) {
    const g = geometriaDe(pav);
    for (const w of pav.vigas) {
      if (nomes.length > 0 && !nomes.includes(w.nome)) continue;
      const gw = g.get(w.id);
      if (!gw) continue;
      for (const c of w.cargas ?? []) {
        const casa =
          c.tipo === "reacao"
            ? c.viga === viga.id && c.apoio === indiceApoio
            : c.tipo === "concentrada" && Math.abs(c.total - r) <= TOL_REACAO * r;
        if (!casa || c.tipo === "distribuida") continue;
        const ponto = pontoDaCarga(gw, c);
        if (!ponto) continue;
        // o pavimento-tipo repete a carga em cada nível; vale o primeiro (o mais baixo)
        const nivel = niveis.find((n) => n.pavimentoId === pav.id);
        if (nivel) achados.push({ ponto, nivel, viga: w.nome });
      }
    }
  }
  return achados;
}

/** Os dois apoios em níveis diferentes, o de baixo primeiro; os mais próximos em altura. */
function melhorPar(a: Apoio[], b: Apoio[]): [Apoio, Apoio] | undefined {
  let melhor: [Apoio, Apoio] | undefined;
  for (const x of a)
    for (const y of b) {
      if (x.nivel.indice === y.nivel.indice) continue;
      const d = Math.abs(x.nivel.cota - y.nivel.cota);
      if (!melhor || d < Math.abs(melhor[0].nivel.cota - melhor[1].nivel.cota))
        melhor = x.nivel.cota < y.nivel.cota ? [x, y] : [y, x];
    }
  return melhor;
}

const cm = (v: number) => v / 100;

/** Elementos 3D das vigas avulsas de `avulso`: no lugar deduzido pelas reações ou, sem
 *  dedução, ao lado do prédio (à direita da `caixa`), com aviso. */
export function posicionarEscadas(
  avulso: Pavimento,
  predio: readonly Pavimento[],
  niveis: readonly Nivel[],
  caixa: { min: Ponto3; max: Ponto3 },
  geometriaDe: (p: Pavimento) => Map<string, GeometriaViga>,
): { elementos: Elemento3D[]; avisos: string[] } {
  const elementos: Elemento3D[] = [];
  const avisos: string[] = [];
  const soltas: Viga[] = [];
  const lances: {
    de: Ponto3;
    ate: Ponto3;
    nivel: Nivel;
    largura: number;
    altura: number;
    viga: Viga;
  }[] = [];

  for (const v of avulso.vigas) {
    const r = reacoesBiapoiada(v);
    const nomes = (v.forma?.apoios ?? []).flatMap((a) =>
      a.tipo === "V" && a.titulo ? [a.titulo] : [],
    );
    const par =
      r &&
      melhorPar(
        apoiosCasados(v, 0, r[0], nomes, predio, niveis, geometriaDe),
        apoiosCasados(v, 1, r[1], nomes, predio, niveis, geometriaDe),
      );
    if (!par) {
      soltas.push(v);
      continue;
    }
    const s = v.secoes?.trechos?.[0];
    const [baixo, alto] = par;
    lances.push({
      de: { ...baixo.ponto, z: baixo.nivel.cota },
      ate: { ...alto.ponto, z: alto.nivel.cota },
      nivel: baixo.nivel,
      largura: cm(s?.bw ?? v.bw),
      altura: cm(s?.h ?? v.h),
      viga: v,
    });
    avisos.push(
      `${avulso.nome}: ${v.nome} posicionada pelas reações lançadas em ${baixo.viga} (${baixo.nivel.nome}) e ${alto.viga} (${alto.nivel.nome}).`,
    );
  }

  for (const l of lances)
    elementos.push({
      chave: `escada:${avulso.id}:${l.viga.id}`,
      tipo: "escada",
      id: l.viga.id,
      nome: l.viga.nome,
      pavimentoId: avulso.id,
      nivel: l.nivel.indice,
      repeticao: 1,
      secao: `${Math.round(l.largura * 100)} × ${Math.round(l.altura * 100)} cm`,
      solidos: [{ tipo: "barra", a: l.de, b: l.ate, largura: l.largura, altura: l.altura }],
      notas: [
        `Escada (${avulso.nome}), posição deduzida pelas reações lançadas nas vigas que a recebem.`,
      ],
    });

  // Lance visual entre duas vigas da escada paralelas que vencem os mesmos níveis.
  for (let i = 0; i + 1 < lances.length; i += 2) {
    const [a, b] = [lances[i]!, lances[i + 1]!];
    if (Math.abs(a.de.z - b.de.z) > 1e-6 || Math.abs(a.ate.z - b.ate.z) > 1e-6) continue;
    const base: Solido = {
      tipo: "barra",
      a: { x: (a.de.x + b.de.x) / 2, y: (a.de.y + b.de.y) / 2, z: a.de.z },
      b: { x: (a.ate.x + b.ate.x) / 2, y: (a.ate.y + b.ate.y) / 2, z: a.ate.z },
      largura: Math.hypot(a.de.x - b.de.x, a.de.y - b.de.y),
      altura: 0.1,
    };
    elementos.push({
      chave: `escada:${avulso.id}:lance${i / 2}`,
      tipo: "escada",
      id: `${a.viga.id}+${b.viga.id}`,
      nome: `Lance ${a.viga.nome}–${b.viga.nome}`,
      pavimentoId: avulso.id,
      nivel: a.nivel.indice,
      repeticao: 1,
      secao: "placa de 10 cm, só visual",
      solidos: [base],
      notas: ["Só visual: a laje da escada não vem do SISTRUT (só as vigas)."],
    });
  }

  // Sem posição: ao lado do prédio, no primeiro nível, uma atrás da outra.
  const x0 = caixa.max.x + 2;
  const y0 = caixa.min.y;
  const cota = niveis[0]?.cota ?? 0;
  soltas.forEach((v, k) => {
    const l = comprimento(v);
    const s = v.secoes?.trechos?.[0];
    const y = y0 + k * 1.5;
    elementos.push({
      chave: `escada:${avulso.id}:${v.id}`,
      tipo: "escada",
      id: v.id,
      nome: v.nome,
      pavimentoId: avulso.id,
      nivel: 0,
      repeticao: 1,
      secao: `${s?.bw ?? v.bw} × ${s?.h ?? v.h} cm`,
      solidos: [
        {
          tipo: "barra",
          a: { x: x0, y, z: cota },
          b: { x: x0 + l, y, z: cota },
          largura: cm(s?.bw ?? v.bw),
          altura: cm(s?.h ?? v.h),
        },
      ],
      notas: [`Posição desconhecida: mostrada ao lado do prédio (${avulso.nome}).`],
    });
  });
  if (soltas.length > 0)
    avisos.push(
      `${avulso.nome}: ${soltas.map((v) => v.nome).join(", ")} sem posição deduzível (nenhuma carga das vigas do prédio casa com as reações dos dois apoios). Mostradas ao lado do prédio, fora da estrutura.`,
    );
  return { elementos, avisos };
}

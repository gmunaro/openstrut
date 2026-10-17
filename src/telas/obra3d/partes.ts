// Partes do prédio na vista 3D: o foco (todo, um nível, um elemento com os vizinhos ou
// um eixo/pórtico) e quem aparece em cada um. Puro, sobre o modelo (modelo.ts).
import type { Ponto } from "../../dominio/obra";
import type { Eixo3D, Elemento3D, Modelo3D } from "./modelo";

export type Foco =
  | { tipo: "todo" }
  | { tipo: "nivel"; nivel: number }
  | { tipo: "elemento"; chave: string }
  | { tipo: "eixo"; chave: string };

/** Meia largura da faixa do corte vertical de um eixo, m. */
export const MEIA_FAIXA_EIXO = 0.3;
/** Folga para dizer que um pilar ou laje encosta numa viga, m. */
const FOLGA = 0.3;

/** Pontos da planta do elemento (vértices dos prismas e cantos das barras). */
function pontos(e: Elemento3D): Ponto[] {
  return e.solidos.flatMap((s) => (s.tipo === "prisma" ? s.base : [s.a, s.b]));
}

function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Eixo (de, até) de uma viga: do primeiro ao último ponto das barras. */
function eixoViga(e: Elemento3D): [Ponto, Ponto] | undefined {
  const barras = e.solidos.filter((s) => s.tipo === "barra");
  const a = barras[0];
  const b = barras.at(-1);
  return a && b && a.tipo === "barra" && b.tipo === "barra" ? [a.a, b.b] : undefined;
}

const centro = (e: Elemento3D): Ponto => {
  const ps = pontos(e);
  return {
    x: ps.reduce((t, p) => t + p.x, 0) / ps.length,
    y: ps.reduce((t, p) => t + p.y, 0) / ps.length,
  };
};

/** Lados do polígono de uma laje encostados no eixo da viga (os dois pontos do lado a
 *  menos de FOLGA do segmento). */
function lajeEncostada(laje: Elemento3D, eixo: [Ponto, Ponto]) {
  const s = laje.solidos[0];
  if (!s || s.tipo !== "prisma") return false;
  return s.base.some((p, i) => {
    const q = s.base[(i + 1) % s.base.length]!;
    return (
      distanciaAoSegmento(p, ...eixo) <= FOLGA &&
      distanciaAoSegmento(q, ...eixo) <= FOLGA &&
      Math.hypot(q.x - p.x, q.y - p.y) > 0.05
    );
  });
}

/** O elemento e os vizinhos que explicam ele:
 *  - viga: os pilares do nível sobre o eixo, as lajes com lado nele e as vigas que se
 *    cruzam ou terminam nele;
 *  - pilar ou fundação: a coluna inteira, da fundação ao topo, e as vigas que passam
 *    sobre cada lance;
 *  - laje: as vigas dos lados e os pilares nos cantos;
 *  - escada: as peças da mesma escada. */
export function vizinhos(modelo: Modelo3D, chave: string): Set<string> {
  const el = modelo.elementos.find((e) => e.chave === chave);
  const saida = new Set<string>([chave]);
  if (!el) return saida;
  const doNivel = modelo.elementos.filter((e) => e.nivel === el.nivel && e.tipo !== "escada");

  if (el.tipo === "viga") {
    const eixo = eixoViga(el);
    if (!eixo) return saida;
    for (const e of doNivel) {
      if (e.tipo === "pilar" && distanciaAoSegmento(centro(e), ...eixo) <= FOLGA)
        saida.add(e.chave);
      if (e.tipo === "laje" && lajeEncostada(e, eixo)) saida.add(e.chave);
      if (e.tipo === "viga" && e !== el) {
        const outro = eixoViga(e);
        if (
          outro &&
          (distanciaAoSegmento(outro[0], ...eixo) <= FOLGA ||
            distanciaAoSegmento(outro[1], ...eixo) <= FOLGA ||
            distanciaAoSegmento(eixo[0], ...outro) <= FOLGA ||
            distanciaAoSegmento(eixo[1], ...outro) <= FOLGA)
        )
          saida.add(e.chave);
      }
    }
  } else if (el.tipo === "pilar" || el.tipo === "fundacao") {
    const coluna = modelo.colunas.find((c) => c.id === el.coluna);
    for (const k of coluna?.chaves ?? []) saida.add(k);
    for (const e of modelo.elementos) {
      if (e.coluna === el.coluna) saida.add(e.chave);
      if (e.tipo !== "viga" || !coluna) continue;
      const eixo = eixoViga(e);
      const lance = modelo.elementos.find(
        (p) => coluna.chaves.includes(p.chave) && p.nivel === e.nivel,
      );
      if (eixo && lance && distanciaAoSegmento(centro(lance), ...eixo) <= FOLGA) saida.add(e.chave);
    }
  } else if (el.tipo === "laje") {
    const s = el.solidos[0];
    const base = s?.tipo === "prisma" ? s.base : [];
    for (const e of doNivel) {
      if (e.tipo === "viga") {
        const eixo = eixoViga(e);
        if (eixo && lajeEncostada(el, eixo)) saida.add(e.chave);
      }
      if (e.tipo === "pilar") {
        const c = centro(e);
        if (base.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= FOLGA * 1.5)) saida.add(e.chave);
      }
    }
  } else if (el.tipo === "escada") {
    for (const e of modelo.elementos)
      if (e.tipo === "escada" && e.pavimentoId === el.pavimentoId) saida.add(e.chave);
  }
  return saida;
}

/** Elementos que cortam a faixa de ± MEIA_FAIXA_EIXO em torno do eixo. */
export function elementosNoEixo(modelo: Modelo3D, eixo: Eixo3D): Set<string> {
  const saida = new Set<string>();
  for (const e of modelo.elementos) {
    const cs = pontos(e).map((p) => (eixo.direcao === "x" ? p.x : p.y));
    // a barra tem largura: conta a meia largura no lugar dos cantos
    const meia = Math.max(0, ...e.solidos.map((s) => (s.tipo === "barra" ? s.largura / 2 : 0)));
    if (
      Math.min(...cs) - meia <= eixo.c + MEIA_FAIXA_EIXO &&
      Math.max(...cs) + meia >= eixo.c - MEIA_FAIXA_EIXO
    )
      saida.add(e.chave);
  }
  return saida;
}

/** Rótulo do eixo, ex.: "x = 1,10 m (V6, V7)". */
export const rotuloEixo = (e: Eixo3D) =>
  `${e.direcao} = ${e.c.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m (${e.vigas.join(", ")})`;

/** Trilha de navegação do foco: "Prédio › SUP › V3". Cada passo leva a um foco. */
export function trilha(modelo: Modelo3D, foco: Foco): { rotulo: string; foco: Foco }[] {
  const todo = { rotulo: "Prédio", foco: { tipo: "todo" } as Foco };
  if (foco.tipo === "todo") return [todo];
  if (foco.tipo === "nivel") {
    const n = modelo.niveis[foco.nivel];
    return [todo, { rotulo: n?.nome ?? "?", foco }];
  }
  if (foco.tipo === "eixo") {
    const e = modelo.eixos.find((x) => x.chave === foco.chave);
    return [todo, { rotulo: `Eixo ${e ? rotuloEixo(e) : foco.chave}`, foco }];
  }
  const el = modelo.elementos.find((e) => e.chave === foco.chave);
  if (!el) return [todo];
  const n = modelo.niveis[el.nivel];
  const coluna = el.tipo === "pilar" || el.tipo === "fundacao";
  return [
    todo,
    ...(n && !coluna ? [{ rotulo: n.nome, foco: { tipo: "nivel", nivel: el.nivel } as Foco }] : []),
    { rotulo: coluna ? `Coluna ${el.nome.replace(/^Fundação de /, "")}` : el.nome, foco },
  ];
}

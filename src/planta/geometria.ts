// Geometria do editor de planta: transformação mundo (m, y para cima) ↔ tela
// (px, y para baixo), zoom, enquadramento, snap, retângulo arrastado,
// sobreposição de lajes e seleção por clique. Puro, sem React nem DOM.
import type { Retangulo } from "../dominio/criar";
import { TOL } from "../dominio/gerar";
import type { Laje, Pavimento, Ponto } from "../dominio/obra";

export type { Ponto };

/** Vista da planta: `escala` em px/m e (ox, oy) = posição na tela da origem do mundo. */
export interface Vista {
  escala: number;
  ox: number;
  oy: number;
}

export interface Caixa {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/** Limites do zoom, px/m. */
export const ESCALA_MIN = 2;
export const ESCALA_MAX = 2000;

/** Ponto do mundo (m) na tela (px). O y da tela cresce para baixo. */
export const mundoParaTela = (v: Vista, p: Ponto): Ponto => ({
  x: v.ox + p.x * v.escala,
  y: v.oy - p.y * v.escala,
});

/** Ponto da tela (px) no mundo (m). Inversa de mundoParaTela. */
export const telaParaMundo = (v: Vista, t: Ponto): Ponto => ({
  x: (t.x - v.ox) / v.escala,
  y: (v.oy - t.y) / v.escala,
});

/** Zoom por `fator` mantendo parado o ponto do mundo que está sob `t` (cursor). */
export function zoomNoPonto(v: Vista, t: Ponto, fator: number): Vista {
  const m = telaParaMundo(v, t);
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v.escala * fator));
  return { escala, ox: t.x - m.x * escala, oy: t.y + m.y * escala };
}

/** Vista que mostra a caixa inteira, centrada, numa tela largura × altura com margem em px. */
export function enquadrar(c: Caixa, largura: number, altura: number, margem = 48): Vista {
  const dx = Math.max(c.xmax - c.xmin, 1);
  const dy = Math.max(c.ymax - c.ymin, 1);
  const escala = Math.min(
    ESCALA_MAX,
    Math.max(ESCALA_MIN, Math.min((largura - 2 * margem) / dx, (altura - 2 * margem) / dy)),
  );
  const cx = (c.xmin + c.xmax) / 2;
  const cy = (c.ymin + c.ymax) / 2;
  return { escala, ox: largura / 2 - cx * escala, oy: altura / 2 + cy * escala };
}

/** Caixa que contém lajes, vigas e pilares do pavimento; undefined se vazio. */
export function caixaDoPavimento(p: Pavimento): Caixa | undefined {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const l of p.lajes) {
    xs.push(l.x, l.x + l.lx);
    ys.push(l.y, l.y + l.ly);
  }
  for (const v of p.vigas) {
    xs.push(v.x1, v.x2);
    ys.push(v.y1, v.y2);
  }
  for (const q of p.pilares) {
    xs.push(q.x);
    ys.push(q.y);
  }
  if (xs.length === 0) return undefined;
  return {
    xmin: Math.min(...xs),
    ymin: Math.min(...ys),
    xmax: Math.max(...xs),
    ymax: Math.max(...ys),
  };
}

/** Caixa padrão de um pavimento vazio, m. */
export const CAIXA_VAZIA: Caixa = { xmin: 0, ymin: 0, xmax: 10, ymax: 8 };

/** Retângulo de tela (px) de uma caixa do mundo (m), já com largura e altura positivas. */
export function retanguloTela(v: Vista, c: Caixa) {
  const a = mundoParaTela(v, { x: c.xmin, y: c.ymax });
  return {
    x: a.x,
    y: a.y,
    width: (c.xmax - c.xmin) * v.escala,
    height: (c.ymax - c.ymin) * v.escala,
  };
}

/** Retângulo (canto inferior esquerdo, lx, ly) entre dois pontos arrastados em qualquer direção. */
export function normalizarRetangulo(a: Ponto, b: Ponto): Retangulo {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    lx: Math.abs(b.x - a.x),
    ly: Math.abs(b.y - a.y),
  };
}

/** Os dois retângulos têm área em comum (encostar bordo com bordo não conta). */
export function sobrepoe(a: Retangulo, b: Retangulo) {
  const dx = Math.min(a.x + a.lx, b.x + b.lx) - Math.max(a.x, b.x);
  const dy = Math.min(a.y + a.ly, b.y + b.ly) - Math.max(a.y, b.y);
  return dx > TOL && dy > TOL;
}

/** Primeira laje que se sobrepõe ao retângulo, ignorando a de id `ignorar` (a própria, ao editar). */
export const lajeSobreposta = (lajes: readonly Laje[], r: Retangulo, ignorar?: string) =>
  lajes.find((l) => l.id !== ignorar && sobrepoe(l, r));

/** Linhas de snap das lajes: as coordenadas x e y dos bordos (cantos incluídos). */
export function linhasDeSnap(lajes: readonly Laje[]) {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const l of lajes) {
    xs.add(l.x).add(l.x + l.lx);
    ys.add(l.y).add(l.y + l.ly);
  }
  return { xs: [...xs], ys: [...ys] };
}

/** Arredonda à grade evitando ruído de ponto flutuante (0,1 + 0,2). */
export const arredondaGrade = (v: number, grade: number) =>
  Number((Math.round(v / grade) * grade).toFixed(6));

/** Snap de uma coordenada: à linha de laje mais próxima dentro da tolerância; senão, à grade.
 *  `linha` diz se o valor veio de uma linha de laje (para a tela desenhar a guia). */
function snapEixo(v: number, grade: number, linhas: readonly number[], tol: number) {
  let melhor: number | undefined;
  for (const c of linhas) {
    const d = Math.abs(c - v);
    if (d <= tol && (melhor === undefined || d < Math.abs(melhor - v))) melhor = c;
  }
  return melhor === undefined
    ? { valor: arredondaGrade(v, grade), linha: false }
    : { valor: melhor, linha: true };
}

/** Linhas de laje em que o ponto do snap caiu: x de um bordo vertical, y de um horizontal
 *  (null quando o eixo foi para a grade). */
export interface Guias {
  x: number | null;
  y: number | null;
}

/** Snap de um ponto e as guias: bordos e cantos de lajes existentes (dentro de `tol`, m)
 *  têm prioridade sobre a grade, eixo por eixo. */
export function snapComGuias(
  p: Ponto,
  grade: number,
  linhas: { xs: readonly number[]; ys: readonly number[] },
  tol: number,
): { ponto: Ponto; guias: Guias } {
  const x = snapEixo(p.x, grade, linhas.xs, tol);
  const y = snapEixo(p.y, grade, linhas.ys, tol);
  return {
    ponto: { x: x.valor, y: y.valor },
    guias: { x: x.linha ? x.valor : null, y: y.linha ? y.valor : null },
  };
}

/** Snap de um ponto, eixo por eixo: bordos e cantos de lajes existentes (dentro de `tol`, m)
 *  têm prioridade sobre a grade. Assim o ponto cai no canto, ou no bordo e na grade. */
export const snap = (
  p: Ponto,
  grade: number,
  linhas: { xs: readonly number[]; ys: readonly number[] },
  tol: number,
): Ponto => snapComGuias(p, grade, linhas, tol).ponto;

/** Distância entre dois pontos da planta, m, e as componentes (sempre positivas). */
export function medir(a: Ponto, b: Ponto) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return { d: Math.hypot(dx, dy), dx, dy };
}

export type Alvo = { tipo: "laje" | "viga" | "pilar"; id: string };

/** Distância do ponto ao segmento (x1, y1)-(x2, y2). */
function distanciaAoSegmento(p: Ponto, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / l2));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

/** Elemento sob o ponto (m), na ordem pilar → viga → laje (o menor ganha).
 *  `tol` (m) é a folga do clique, para pegar pilares e vigas finos na tela. */
export function elementoEm(pav: Pavimento, p: Ponto, tol: number): Alvo | undefined {
  const pilar = pav.pilares.find(
    (q) =>
      Math.abs(p.x - q.x) <= Math.max(q.b / 200, tol) &&
      Math.abs(p.y - q.y) <= Math.max(q.h / 200, tol),
  );
  if (pilar) return { tipo: "pilar", id: pilar.id };
  let viga: { id: string; d: number } | undefined;
  for (const v of pav.vigas) {
    const d = distanciaAoSegmento(p, v.x1, v.y1, v.x2, v.y2);
    if (d <= Math.max(v.bw / 200, tol) && (!viga || d < viga.d)) viga = { id: v.id, d };
  }
  if (viga) return { tipo: "viga", id: viga.id };
  const laje = pav.lajes.find(
    (l) => p.x > l.x && p.x < l.x + l.lx && p.y > l.y && p.y < l.y + l.ly,
  );
  return laje ? { tipo: "laje", id: laje.id } : undefined;
}

/** Próximo elemento (`delta` +1) ou anterior (−1) na ordem laje → viga → pilar, com volta.
 *  Sem seleção, +1 pega o primeiro e −1 o último. Usado pelas setas com a planta em foco. */
export function proximoAlvo(pav: Pavimento, atual: Alvo | null, delta: 1 | -1): Alvo | undefined {
  const lista: Alvo[] = [
    ...pav.lajes.map((l) => ({ tipo: "laje" as const, id: l.id })),
    ...pav.vigas.map((v) => ({ tipo: "viga" as const, id: v.id })),
    ...pav.pilares.map((p) => ({ tipo: "pilar" as const, id: p.id })),
  ];
  if (lista.length === 0) return undefined;
  const i = lista.findIndex((a) => atual !== null && a.tipo === atual.tipo && a.id === atual.id);
  if (i < 0) return delta > 0 ? lista[0] : lista[lista.length - 1];
  return lista[(i + delta + lista.length) % lista.length];
}

/** Espaçamento das linhas de grade desenhadas: o da grade, dobrado até ficar ≥ `minPx` na tela. */
export function passoVisivel(grade: number, escala: number, minPx = 8) {
  let passo = grade;
  while (passo * escala < minPx) passo *= 2;
  return passo;
}

/** Caixa do mundo (m) de uma laje ou pilar do pavimento; undefined se o id não existe nele. */
export function caixaDoAlvo(p: Pavimento, alvo: Alvo): Caixa | undefined {
  if (alvo.tipo === "laje") {
    const l = p.lajes.find((x) => x.id === alvo.id);
    return l && { xmin: l.x, ymin: l.y, xmax: l.x + l.lx, ymax: l.y + l.ly };
  }
  if (alvo.tipo === "pilar") {
    const q = p.pilares.find((x) => x.id === alvo.id);
    return q && { xmin: q.x, ymin: q.y, xmax: q.x, ymax: q.y };
  }
  return undefined;
}

/** Se a caixa do mundo inteira cabe dentro da área de `largura` × `altura` px da tela. */
export function cabeNaTela(v: Vista, c: Caixa, largura: number, altura: number): boolean {
  const r = retanguloTela(v, c);
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= largura && r.y + r.height <= altura;
}

/** Ponto (m) para o nome da viga: o meio dela ou, se um pilar está a menos de `folga` m
 *  dele (o nome cairia sobre o do pilar), a 1/4 ou 3/4 do comprimento; sem posição
 *  livre, o meio. */
export function posicaoRotuloViga(
  v: { x1: number; y1: number; x2: number; y2: number },
  pilares: readonly Ponto[],
  folga: number,
): Ponto {
  const em = (t: number) => ({ x: v.x1 + (v.x2 - v.x1) * t, y: v.y1 + (v.y2 - v.y1) * t });
  const livre = (p: Ponto) => pilares.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= folga);
  return [0.5, 0.25, 0.75].map(em).find(livre) ?? em(0.5);
}

// Triangulação dos sólidos do modelo (modelo.ts) em listas planas de vértices, normais e
// arestas, já nos eixos do three.js: X = x da planta, Y = z (para cima), Z = −y. É uma
// rotação (preserva o sentido das faces). Faces planas (normal por face) e arestas só nos
// cantos vivos, para o contorno das peças.
import { ShapeUtils, Vector2 } from "three";
import type { Ponto } from "../../dominio/obra";
import type { Ponto3, Solido } from "./modelo";

export interface Malha {
  /** x, y, z por vértice; 3 vértices por triângulo (sem índice). */
  posicoes: number[];
  normais: number[];
  /** Pares de pontos (x, y, z) das arestas. */
  arestas: number[];
}

export const malhaVazia = (): Malha => ({ posicoes: [], normais: [], arestas: [] });

/** Planta (x, y, z para cima) → three (X, Y para cima, Z). */
export const paraCena = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

type V3 = [number, number, number];

function triangulo(m: Malha, a: V3, b: V3, c: V3, n: V3) {
  m.posicoes.push(...a, ...b, ...c);
  m.normais.push(...n, ...n, ...n);
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalizar = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Quadrilátero plano a-b-c-d (em ordem) com a normal virada para fora de `centro`. */
function quad(m: Malha, a: V3, b: V3, c: V3, d: V3, centro: V3) {
  let n = normalizar(cruz(sub(b, a), sub(c, a)));
  const meio: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const fora = sub(meio, centro);
  if (n[0] * fora[0] + n[1] * fora[1] + n[2] * fora[2] < 0) {
    [b, d] = [d, b];
    n = [-n[0], -n[1], -n[2]];
  }
  triangulo(m, a, b, c, n);
  triangulo(m, a, c, d, n);
}

const aresta = (m: Malha, a: V3, b: V3) => m.arestas.push(...a, ...b);

/** Prisma vertical: base anti-horária triangulada (ear clipping do three), topo, fundo e
 *  faces laterais. Polígono com muitos lados (pilar circular) não leva aresta vertical. */
function prisma(m: Malha, base: readonly Ponto[], z0: number, z1: number) {
  const n = base.length;
  if (n < 3 || !(z1 > z0)) return;
  const tris = ShapeUtils.triangulateShape(
    base.map((p) => new Vector2(p.x, p.y)),
    [],
  );
  const em = (p: Ponto, z: number) => paraCena(p.x, p.y, z);
  for (const [i, j, k] of tris) {
    const [a, b, c] = [base[i!]!, base[j!]!, base[k!]!];
    triangulo(m, em(a, z1), em(b, z1), em(c, z1), [0, 1, 0]);
    triangulo(m, em(a, z0), em(c, z0), em(b, z0), [0, -1, 0]);
  }
  const verticais = n <= 8;
  for (let i = 0; i < n; i++) {
    const a = base[i]!;
    const b = base[(i + 1) % n]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // normal externa do polígono anti-horário: (dy, −dx) na planta
    const nn = normalizar(paraCena(dy, -dx, 0));
    const [a0, b0, b1, a1] = [em(a, z0), em(b, z0), em(b, z1), em(a, z1)];
    triangulo(m, a0, b0, b1, nn);
    triangulo(m, a0, b1, a1, nn);
    aresta(m, a0, b0);
    aresta(m, a1, b1);
    if (verticais) aresta(m, a0, a1);
  }
}

/** Cantos da barra: topo em a e b, largura na horizontal perpendicular ao eixo, altura
 *  para baixo. Ordem: a esq/dir em cima, b dir/esq em cima, depois os mesmos embaixo. */
export function cantosBarra(a: Ponto3, b: Ponto3, largura: number, altura: number): Ponto3[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const px = (-dy / l) * (largura / 2);
  const py = (dx / l) * (largura / 2);
  const topo = [
    { x: a.x + px, y: a.y + py, z: a.z },
    { x: a.x - px, y: a.y - py, z: a.z },
    { x: b.x - px, y: b.y - py, z: b.z },
    { x: b.x + px, y: b.y + py, z: b.z },
  ];
  return [...topo, ...topo.map((p) => ({ ...p, z: p.z - altura }))];
}

function barra(m: Malha, s: Extract<Solido, { tipo: "barra" }>) {
  const c = cantosBarra(s.a, s.b, s.largura, s.altura).map((p) => paraCena(p.x, p.y, p.z));
  const centro: V3 = [0, 1, 2].map((k) => c.reduce((t, p) => t + p[k]!, 0) / 8) as V3;
  const [t0, t1, t2, t3, f0, f1, f2, f3] = c as [V3, V3, V3, V3, V3, V3, V3, V3];
  quad(m, t0, t1, t2, t3, centro);
  quad(m, f0, f3, f2, f1, centro);
  quad(m, t0, t3, f3, f0, centro);
  quad(m, t1, f1, f2, t2, centro);
  quad(m, t0, f0, f1, t1, centro);
  quad(m, t3, t2, f2, f3, centro);
  for (const [p, q] of [
    [t0, t1],
    [t1, t2],
    [t2, t3],
    [t3, t0],
    [f0, f1],
    [f1, f2],
    [f2, f3],
    [f3, f0],
    [t0, f0],
    [t1, f1],
    [t2, f2],
    [t3, f3],
  ] as const)
    aresta(m, p, q);
}

/** Acrescenta à malha os triângulos e as arestas do sólido. */
export function triangular(m: Malha, s: Solido): Malha {
  if (s.tipo === "prisma") prisma(m, s.base, s.z0, s.z1);
  else barra(m, s);
  return m;
}

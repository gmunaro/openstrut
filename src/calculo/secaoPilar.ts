// Geometria da seção de pilar para fôrma, concreto, estribo e detalhamento (regras da
// V2, que o SISTRUT não tem: ver docs/MODO-CALCULO.md, "O que não existe no SISTRUT").
// Retângulo b × h, ou a seção circular (com vazado) ou poligonal de `Pilar.secao`. Em cm.
import type { Pilar, PontoSecao } from "../dominio/obra";

export interface GeometriaPilar {
  /** Área de concreto, cm². */
  area: number;
  /** Perímetro externo e o do vazado (circular), cm: os dois levam fôrma. */
  perimetro: number;
  perimetroInterno: number;
  /** Comprimento do estribo a `cobrimento` cm da face, sem ganchos, cm. */
  estribo(cobrimento: number): number;
  /** Seção retangular (o detalhamento e os grampos usam faces b e h). */
  retangular: boolean;
}

/** Ângulo interno (rad, 0..2π) em cada vértice de um polígono simples. */
function angulosInternos(v: readonly PontoSecao[]) {
  const n = v.length;
  let dobro = 0;
  for (let i = 0; i < n; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % n]!;
    dobro += a.x * b.y - b.x * a.y;
  }
  const antiHorario = dobro > 0;
  return v.map((p, i) => {
    const ant = v[(i + n - 1) % n]!;
    const prox = v[(i + 1) % n]!;
    const a1 = Math.atan2(ant.y - p.y, ant.x - p.x);
    const a2 = Math.atan2(prox.y - p.y, prox.x - p.x);
    let ang = antiHorario ? a1 - a2 : a2 - a1;
    while (ang <= 0) ang += 2 * Math.PI;
    while (ang > 2 * Math.PI) ang -= 2 * Math.PI;
    return ang;
  });
}

/** Geometria do pilar: retângulo b × h sem `secao`; circular π(D² − Di²)/4 e πD, com
 *  o estribo π(D − 2c); poligonal pela fórmula dos trapézios, com o estribo do
 *  polígono recuado c para dentro, P − 2c·Σ cot(αi/2) (αi o ângulo interno; na
 *  retângulo dá 2(b − 2c) + 2(h − 2c)). */
export function geometriaPilar(p: {
  b: number;
  h: number;
  secao?: Pilar["secao"] | undefined;
}): GeometriaPilar {
  const sec = p.secao;
  if (!sec)
    return {
      area: p.b * p.h,
      perimetro: 2 * (p.b + p.h),
      perimetroInterno: 0,
      estribo: (c) => 2 * (p.b - 2 * c) + 2 * (p.h - 2 * c),
      retangular: true,
    };
  if (sec.tipo === "circular")
    return {
      area: (Math.PI * (sec.d ** 2 - sec.dInterno ** 2)) / 4,
      perimetro: Math.PI * sec.d,
      perimetroInterno: Math.PI * sec.dInterno,
      estribo: (c) => Math.PI * (sec.d - 2 * c),
      retangular: false,
    };
  const v = sec.vertices;
  let dobro = 0;
  let perimetro = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    dobro += a.x * b.y - b.x * a.y;
    perimetro += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const cotMeios = angulosInternos(v).reduce((t, a) => t + 1 / Math.tan(a / 2), 0);
  return {
    area: Math.abs(dobro) / 2,
    perimetro,
    perimetroInterno: 0,
    estribo: (c) => perimetro - 2 * c * cotMeios,
    retangular: false,
  };
}

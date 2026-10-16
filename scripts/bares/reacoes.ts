// Reações de apoio de laje retangular pelo processo das áreas (NBR 6118:2023,
// 14.7.6.1): a carga de cada região limitada pelas retas que saem dos cantos vai
// para o bordo da região. Ângulos das retas: 45° entre dois bordos do mesmo
// tipo; 60° a partir do engastado quando o outro é apoiado. A divisão é a
// mesma de atribuir cada ponto ao bordo de menor k·d (d = distância ao bordo),
// com k = 1 no engastado e k = √3 = tg 60° no apoiado: entre bordos de tipos
// diferentes a fronteira faz 60° com o engastado e, entre iguais, 45°.
//
// Sem bordo livre (as tabelas só têm apoiado e engastado).

import type { BordoPlaca } from "./placas";

type Ponto = readonly [number, number];

/** Recorta o polígono convexo pelo semiplano c0 + cx·x + cy·y ≤ 0 (Sutherland–Hodgman). */
function recorta(poli: Ponto[], cx: number, cy: number, c0: number): Ponto[] {
  const val = ([x, y]: Ponto) => c0 + cx * x + cy * y;
  const saida: Ponto[] = [];
  for (let i = 0; i < poli.length; i++) {
    const p = poli[i]!;
    const q = poli[(i + 1) % poli.length]!;
    const vp = val(p);
    const vq = val(q);
    if (vp <= 0) saida.push(p);
    if (vp < 0 !== vq < 0 && vp !== 0 && vq !== 0) {
      const t = vp / (vp - vq);
      saida.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return saida;
}

const area = (poli: Ponto[]) =>
  Math.abs(
    poli.reduce((s, p, i) => {
      const q = poli[(i + 1) % poli.length]!;
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;

/**
 * Área de influência de cada bordo da laje a × b (bordos E: x = 0, D: x = a,
 * I: y = 0, S: y = b), em unidades de a·b.
 */
export function areasInfluencia(a: number, b: number, engastados: readonly BordoPlaca[]) {
  const k = (e: BordoPlaca) => (engastados.includes(e) ? 1 : Math.sqrt(3));
  // k·d = c0 + cx·x + cy·y para cada bordo
  const dist: Record<BordoPlaca, [number, number, number]> = {
    E: [0, 1, 0],
    D: [a, -1, 0],
    I: [0, 0, 1],
    S: [b, 0, -1],
  };
  const bordos = ["E", "D", "I", "S"] as const;
  const res = { E: 0, D: 0, I: 0, S: 0 };
  for (const i of bordos) {
    let poli: Ponto[] = [
      [0, 0],
      [a, 0],
      [a, b],
      [0, b],
    ];
    const [i0, ix, iy] = dist[i];
    for (const j of bordos) {
      if (j === i) continue;
      const [j0, jx, jy] = dist[j];
      // k_i d_i − k_j d_j ≤ 0
      poli = recorta(poli, k(i) * ix - k(j) * jx, k(i) * iy - k(j) * jy, k(i) * i0 - k(j) * j0);
      if (poli.length < 3) break;
    }
    res[i] = poli.length < 3 ? 0 : area(poli);
  }
  return res;
}

/**
 * Coeficientes ν das reações (V = ν p lx / 10) da laje lx = 1, ly = λ.
 * Nos pares de bordos opostos com um engastado e outro apoiado, o apoiado
 * recebe de volta metade do alívio: o alívio do processo das áreas é metade da
 * diferença entre os dois bordos (como na viga apoiada-engastada, R = pl/2 ∓ X/l),
 * e só metade dele é descontada, prevendo engaste parcial. Assim
 * ν_apoiado = ν_área + (ν'_área − ν_área)/4.
 */
export function coeficientesReacao(lambda: number, engastados: readonly BordoPlaca[]) {
  const ar = areasInfluencia(1, lambda, engastados);
  const nu: Record<BordoPlaca, number> = {
    E: (10 * ar.E) / lambda,
    D: (10 * ar.D) / lambda,
    I: 10 * ar.I,
    S: 10 * ar.S,
  };
  for (const [p, q] of [
    ["E", "D"],
    ["I", "S"],
  ] as const) {
    const ep = engastados.includes(p);
    const eq = engastados.includes(q);
    if (ep === eq) continue;
    const [ap, en] = ep ? [q, p] : [p, q];
    nu[ap] += (nu[en] - nu[ap]) / 4;
  }
  return nu;
}

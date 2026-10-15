// Primitivas geométricas da LAJEMONT (SISTRUT 4.0), portadas rotina a rotina da V1
// nova (`dist/src-original/laje/LAJEMONT.BAS`). As tolerâncias são as do LAJE:
// comprimento V_133a = 0,005 m e ângulo/inclinação V_133e = 0,002 (LAJE.BAS:121-122,
// `PARAMETROS_LAJE.toleranciaComprimento` e `.toleranciaAngulo`).
//
// Precisão: as variáveis `#` do original (DOUBLE) ficam em float64; as `!` (SINGLE)
// passam por `s` (= `atribuicao(modo)` de base/f32.ts). Os argumentos das rotinas
// MIXT_0877_Menor/MIXT_082a_Maior são SINGLE: o original grava `V# / 1.0#` numa
// local `!` antes de comparar, por isso `menor`/`maior` arredondam os dois lados.

/** Arredondamento de atribuição do modo (`sng` no original, identidade no corrigido). */
export type Arred = (x: number) => number;

/** Contexto numérico de uma montagem: arredondamento e tolerâncias do .LAP. */
export interface Tolerancias {
  s: Arred;
  /** V_133a: tolerância de comprimento, m. */
  tol: number;
  /** V_133e: tolerância de ângulo (rad) e de inclinação. */
  eps: number;
}

export const PI = Math.PI;

/** MIXT_0877_Menor: o menor dos dois, comparados em SINGLE (MIXT.BM:193). */
export function menor(s: Arred, a: number, b: number) {
  const x = s(a);
  const y = s(b);
  return x < y ? x : y;
}

/** MIXT_082a_Maior: o maior dos dois, comparados em SINGLE (MIXT.BM:183). */
export function maior(s: Arred, a: number, b: number) {
  const x = s(a);
  const y = s(b);
  return x > y ? x : y;
}

/** Quadrado da distância, calculado como o original (RT_POT##(dx, 2) + RT_POT##(dy, 2)). */
export const dist2 = (x1: number, y1: number, x2: number, y2: number) =>
  (x1 - x2) ** 2 + (y1 - y2) ** 2;

/** Distância (RT_SQR## da soma dos quadrados). */
export const distancia = (x1: number, y1: number, x2: number, y2: number) =>
  Math.sqrt(dist2(x1, y1, x2, y2));

/** Os dois pontos coincidem dentro da tolerância de comprimento, coordenada a
 *  coordenada (o teste `ABS(y1 - y2) < V_133a AND ABS(x1 - x2) < V_133a` do original). */
export const perto = (x1: number, y1: number, x2: number, y2: number, tol: number) =>
  Math.abs(y1 - y2) < tol && Math.abs(x1 - x2) < tol;

/** Direção, em rad (0 a 2π), do vetor (fx, fy) → (tx, ty), com o teste de vertical
 *  EXATO e as quatro fórmulas por quadrante do original. Usada no S_13a73
 *  (LAJEMONT.BAS:2030-2112, as duas metades) e no L_4ef1b (LAJEMONT.BAS:7529-7549). */
export function direcao(fx: number, fy: number, tx: number, ty: number) {
  if (tx === fx) return ty < fy ? (3 * PI) / 2 : PI / 2;
  let r = 0;
  if (ty <= fy && tx < fx) r = Math.atan((fy - ty) / (fx - tx)) + PI;
  if (ty >= fy && tx > fx) r = Math.atan((ty - fy) / (tx - fx));
  if (ty < fy && tx > fx) r = 2 * PI - Math.atan((fy - ty) / (tx - fx));
  if (ty > fy && tx < fx) r = PI - Math.atan((ty - fy) / (fx - tx));
  return r;
}

/** Resultado do S_11c49: o ponto calculado (1E10 enquanto não houver) e se ele é
 *  interseção dos dois segmentos (`V_0f1c$ = ""`) ou não (`"NAO"`). Os chamadores
 *  usam o ponto mesmo quando `ok` é falso (S_17b61), então ele volta sempre. */
export interface Intersecao {
  x: number;
  y: number;
  ok: boolean;
}

/** Interseção dos segmentos A = (ax1, ay1)-(ax2, ay2) e B = (bx1, by1)-(bx2, by2)
 *  (S_11c49, LAJEMONT.BAS:1504-1906): caixas, segmentos horizontais ou paralelos
 *  sobrepostos (o ponto é a ponta comum), interseção das retas com as pontas
 *  "coladas" a menos de V_133a e conferência de faixa com folga V_133a. */
export function intersecaoSegmentos(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
  t: Tolerancias,
): Intersecao {
  const { s, tol, eps } = t;
  const mn = (a: number, b: number) => menor(s, a, b);
  const mx = (a: number, b: number) => maior(s, a, b);
  let x = 1e10;
  let y = 1e10;
  const nao = () => ({ x, y, ok: false });
  if (mn(ax1, ax2) > mx(bx1, bx2) || mx(ax1, ax2) < mn(bx1, bx2)) return nao();
  if (mn(ay1, ay2) > mx(by1, by2) || mx(ay1, ay2) < mn(by1, by2)) return nao();
  if (by1 === by2 && ay1 === ay2) {
    if (mx(bx1, bx2) < mn(ax1, ax2) || mx(ax1, ax2) < mn(bx1, bx2)) return nao();
  }
  if (ay1 === ay2) {
    y = ay1;
  } else if (by1 === by2) {
    y = by1;
  } else if (Math.abs((ax2 - ax1) / (ay2 - ay1) - (bx2 - bx1) / (by2 - by1)) < eps) {
    // paralelos (nem A nem B horizontais): só a sobreposição na mesma reta
    if (mx(by1, by2) < mn(ay1, ay2) || mx(ay1, ay2) < mn(by1, by2)) return nao();
    const ma = (ax2 - ax1) / (ay2 - ay1);
    const mb = (bx2 - bx1) / (by2 - by1);
    if (Math.abs(bx1 - mb * by1 - (ax1 - ma * ay1)) > tol) return nao();
    if (mn(ay1, ay2) < mx(by1, by2) && mx(ay1, ay2) >= mx(by1, by2)) {
      y = mx(by1, by2);
      if (mx(ay1, ay2) === y) y = mx(mn(by1, by2), mn(ay1, ay2));
    }
    if (mn(by1, by2) < mx(ay1, ay2) && mx(by1, by2) >= mx(ay1, ay2)) {
      y = mx(ay1, ay2);
      if (mx(by1, by2) === y) y = mx(mn(ay1, ay2), mn(by1, by2));
    }
  } else {
    const ma = (ax2 - ax1) / (ay2 - ay1);
    const mb = (bx2 - bx1) / (by2 - by1);
    y = (ax2 - bx2 + (mb * by2 - ma * ay2)) / (mb - ma);
    if (Math.abs(ay1 - y) < tol) y = ay1;
    if (Math.abs(ay2 - y) < tol) y = ay2;
    if (Math.abs(by1 - y) < tol) y = by1;
    if (Math.abs(by2 - y) < tol) y = by2;
  }
  // L_12816: y dentro das duas faixas
  if (
    (by1 !== by2 && (tol + y < mn(by1, by2) || y - tol > mx(by1, by2))) ||
    (ay1 !== ay2 && (tol + y < mn(ay1, ay2) || y - tol > mx(ay1, ay2)))
  )
    return nao();
  if (ax1 === ax2) {
    x = ax1;
  } else if (by1 === by2 && ay1 === ay2) {
    if (mx(ax1, ax2) <= mx(bx1, bx2) && mx(ax1, ax2) >= mn(bx1, bx2)) {
      x = mx(ax1, ax2);
      if (mx(bx1, bx2) === x) x = mx(mn(ax1, ax2), mn(bx1, bx2));
    }
    if (mx(bx1, bx2) <= mx(ax1, ax2) && mx(bx1, bx2) >= mn(ax1, ax2)) {
      x = mx(bx1, bx2);
      if (mx(ax1, ax2) === x) x = mx(mn(bx1, bx2), mn(ax1, ax2));
    }
  } else {
    if (ay1 !== ay2) x = ax2 - ((ay2 - y) * (ax2 - ax1)) / (ay2 - ay1);
    else x = bx2 - ((by2 - y) * (bx2 - bx1)) / (by2 - by1);
    if (Math.abs(ax1 - x) < tol) x = ax1;
    if (Math.abs(ax2 - x) < tol) x = ax2;
    if (Math.abs(bx1 - x) < tol) x = bx1;
    if (Math.abs(bx2 - x) < tol) x = bx2;
  }
  // L_1303d: x dentro das duas faixas
  if (
    (bx1 !== bx2 && (tol + x < mn(bx1, bx2) || x - tol > mx(bx1, bx2))) ||
    (ax1 !== ax2 && (tol + x < mn(ax1, ax2) || x - tol > mx(ax1, ax2)))
  )
    return nao();
  return { x, y, ok: true };
}

/** Interseção de duas retas dadas por ponto e ângulo (S_15189, LAJEMONT.BAS:2227-2274):
 *  `paralelas` quando os ângulos diferem de 0 ou π (V_133e); ângulos verticais e
 *  horizontais exatos têm fórmula própria. O teste "dentro da laje" (S_13320) fica
 *  com o chamador. */
export function intersecaoRetas(
  xa: number,
  ya: number,
  a: number,
  xb: number,
  yb: number,
  b: number,
  eps: number,
) {
  if (
    Math.abs(a - b + PI) < eps ||
    Math.abs(PI - b + a) < eps ||
    Math.abs(a - b - PI) < eps ||
    Math.abs(a - PI - b) < eps ||
    Math.abs(a - b) < eps
  )
    return { x: 1e10, y: 1e10, paralelas: true };
  const corte = (xp: number, yp: number, ang: number) => yp - (Math.sin(ang) / Math.cos(ang)) * xp;
  let x: number;
  let y: number;
  if ((3 * PI) / 2 === a || PI / 2 === a) {
    x = xa;
    y = Math.tan(b) * x + corte(xb, yb, b);
    if (Math.abs(Math.sin(b)) < eps / 100) y = yb;
  } else if ((3 * PI) / 2 === b || PI / 2 === b) {
    x = xb;
    y = Math.tan(a) * x + corte(xa, ya, a);
    if (Math.abs(Math.sin(a)) < eps / 100) y = ya;
  } else if (a === PI || a === 0) {
    y = ya;
    x = (y - corte(xb, yb, b)) / Math.tan(b);
    if (Math.abs(Math.cos(b)) < eps / 100) x = xb;
  } else if (b === PI || b === 0) {
    y = yb;
    x = (y - corte(xa, ya, a)) / Math.tan(a);
    if (Math.abs(Math.cos(a)) < eps / 100) x = xa;
  } else {
    y =
      (Math.tan(b) * corte(xa, ya, a) - Math.tan(a) * corte(xb, yb, b)) /
      (Math.tan(b) - Math.tan(a));
    x = (corte(xb, yb, b) - corte(xa, ya, a)) / (Math.tan(a) - Math.tan(b));
  }
  return { x, y, paralelas: false };
}

/** Ponta de um raio de 1000 m na direção `ang`, com a componente zerada quando o
 *  seno ou o cosseno é menor que V_133e (o `-(ABS(COS(a)) > V_133e) * 1000` do
 *  original; LAJEMONT.BAS:6136-6137, 7110-7111). */
export const raio = (ang: number, eps: number) => ({
  dx: Math.abs(Math.cos(ang)) > eps ? Math.cos(ang) * 1000 : 0,
  dy: Math.abs(Math.sin(ang)) > eps ? Math.sin(ang) * 1000 : 0,
});

/** Polígono fechado como os vetores L_BP1c/L_BP2e do original: índices 1..n e o
 *  ponto n+1 igual ao 1 (`n` = número de lados). */
export interface PoligonoFechado {
  x: number[];
  y: number[];
  /** Número de pontos com o de fechamento (L_BP1c(0) do original). */
  n: number;
}

/** Contagem de cruzamentos de um raio horizontal à esquerda do ponto (x, y) com o
 *  polígono (L_23fcc, LAJEMONT.BAS:3169-3236). Ponto sobre o contorno devolve
 *  `naBorda` (L_BP1b0): 1 conta como dentro (ímpar), 0 como fora (par). */
export function cruzamentos(
  p: PoligonoFechado,
  x: number,
  y: number,
  naBorda: number,
  t: Tolerancias,
) {
  const { s, tol } = t;
  let c = 0;
  for (let k = 1; k <= p.n - 1; k++) {
    const a2 = p.x[k] ?? 0;
    const a6 = p.y[k] ?? 0;
    const j = k + 1 === p.n ? 1 : k + 1;
    const aa = p.x[j] ?? 0;
    const ae = p.y[j] ?? 0;
    if (perto(x, y, aa, ae, tol) || perto(x, y, a2, a6, tol)) return naBorda;
    if (menor(s, a2, aa) > tol + x) continue;
    if (Math.abs(y - a6) < tol && Math.abs(a6 - ae) < tol) {
      if (x - tol <= maior(s, a2, aa) && tol + x >= menor(s, a2, aa)) return naBorda;
    }
    if ((a6 !== y && a6 === ae) || maior(s, a6, ae) <= y || menor(s, a6, ae) > y) continue;
    if (maior(s, a2, aa) <= x && menor(s, a6, ae) <= y && maior(s, a6, ae) >= y) {
      c += 1;
      if (Math.abs(x - maior(s, a2, aa)) < tol && Math.abs(a2 - aa) < tol) return naBorda;
      continue;
    }
    if (a6 === ae) continue;
    const xi = a2 + ((y - a6) * (aa - a2)) / (ae - a6);
    if (tol + x >= xi) {
      c += 1;
      if (Math.abs(x - xi) < tol) return naBorda;
    }
  }
  return c;
}

/** Contagem par = ponto fora (o `c / 2 = CLNG(c) \ 2` do original). */
export const par = (c: number) => c % 2 === 0;

/** O trecho (x1, y1)-(x2, y2) está sobre a reta do lado (lx1, ly1)-(lx2, ly2) e
 *  se sobrepõe a ele além de um ponto (L_249e8, LAJEMONT.BAS:3280-3384). */
export function sobreLado(
  lx1: number,
  ly1: number,
  lx2: number,
  ly2: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: Tolerancias,
) {
  const { s, tol } = t;
  const mn = (a: number, b: number) => menor(s, a, b);
  const mx = (a: number, b: number) => maior(s, a, b);
  if (mn(lx1, lx2) > mx(x1, x2) || mx(lx1, lx2) < mn(x1, x2)) return false;
  if (mn(ly1, ly2) > mx(y1, y2) || mx(ly1, ly2) < mn(y1, y2)) return false;
  if (lx1 === lx2) {
    if (x1 !== x2) return false;
    if (mn(ly1, ly2) === mx(y1, y2) || mx(ly1, ly2) === mn(y1, y2)) return false;
    return true;
  }
  if (x1 === x2) return false;
  if (mn(lx1, lx2) === mx(x1, x2) || mx(lx1, lx2) === mn(x1, x2)) return false;
  if (Math.abs((y2 - y1) / (x2 - x1) - (ly2 - ly1) / (lx2 - lx1)) > tol) return false;
  if (lx1 !== x2 && lx1 !== x1) {
    if (Math.abs((y2 - ly1) / (x2 - lx1) - (ly1 - y1) / (lx1 - x1)) > tol) return false;
  } else if (ly1 !== y2 && ly1 !== y1) {
    return false;
  }
  return true;
}

/** Área pela fórmula dos trapézios na ordem do original: Σ −(x_k + x_k+1)(y_k − y_k+1)/2,
 *  acumulada em SINGLE (LAJEMONT.BAS:2988-2990). Positiva no sentido anti-horário. */
export function areaTrapezios(p: PoligonoFechado, s: Arred) {
  let a = 0;
  for (let k = 1; k <= p.n - 1; k++) {
    a = s(a - (((p.x[k] ?? 0) + (p.x[k + 1] ?? 0)) * ((p.y[k] ?? 0) - (p.y[k + 1] ?? 0))) / 2);
  }
  return a;
}

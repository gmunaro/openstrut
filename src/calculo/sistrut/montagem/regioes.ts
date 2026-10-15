// Região de influência de um bordo (L_20c6b, LAJEMONT.BAS:2770-2992; livros_laje.md
// 1.15; U42-003): parte do vértice inicial do bordo, segue o segmento do padrão de
// charneiras que sai dele e, em cada nó, vira para o segmento de MAIOR giro (o mais
// à direita), até chegar ao vértice final do bordo; fecha pelo próprio bordo. Pontos
// alinhados são retirados e a área sai pelos trapézios (positiva quando o polígono
// da laje é horário, como o LAJEGEOM grava).
import { type PadraoMontagem, inicioSegmento, type LajeMontagem } from "./charneiras";
import type { ModoSistrut } from "../base/tipos";
import { areaTrapezios, PI, perto, type PoligonoFechado, type Tolerancias } from "./geometria";

/** Direção (fx, fy) → (tx, ty) com o teste de vertical por tolerância e as fórmulas
 *  π/2 + ATN / 3π/2 + ATN do traçado da região (LAJEMONT.BAS:2834-2847, 2876-2889). */
function direcaoRegiao(fx: number, fy: number, tx: number, ty: number, tol: number) {
  if (Math.abs(fx - tx) < tol) return fy > ty ? (3 * PI) / 2 : PI / 2;
  let r = 0;
  if (fy <= ty && fx < tx) r = Math.atan((ty - fy) / (tx - fx));
  if (fy < ty && fx > tx) r = PI / 2 + Math.atan((fx - tx) / (ty - fy));
  if (fy >= ty && fx > tx) r = Math.atan((fy - ty) / (fx - tx)) + PI;
  if (fy > ty && fx < tx) r = (3 * PI) / 2 + Math.atan((tx - fx) / (fy - ty));
  return r;
}

/** Giro de quem chega na direção `ee` e sai na direção `f6` (L_21fd4..L_223c2). */
function giro(ee: number, f6: number, eps: number) {
  let fe = 0;
  if (PI / 2 > ee && ee >= 0) fe = ee + PI > f6 && f6 >= 0 ? PI - ee + f6 : f6 - (ee + PI);
  if (ee < PI && PI / 2 <= ee) fe = ee + PI > f6 && f6 >= 0 ? PI - ee + f6 : f6 - (ee + PI);
  if ((3 * PI) / 2 > ee && ee >= PI)
    fe = 2 * PI >= f6 && ee - PI <= f6 ? f6 - (ee - PI) : 2 * PI - (ee - PI) + f6;
  if (2 * PI >= ee && (3 * PI) / 2 <= ee)
    fe = 2 * PI >= f6 && ee - PI <= f6 ? f6 - (ee - PI) : 2 * PI - (ee - PI - f6);
  if (Math.abs(f6 - ee - PI) < eps) fe = PI;
  if (2 * PI <= fe) fe = fe - 2 * PI;
  return fe;
}

/** Região do bordo `k` (do vértice k ao k+1): polígono fechado (ponto 1 = início do
 *  bordo, penúltimo = fim do bordo, último = ponto 1) e área. Nó sem saída: o traçado
 *  grava de novo o último ponto e volta pelo segmento por onde veio; no modo original
 *  o passo seguinte devolve área 0 (L_224c8, V_0f14 = −1), no corrigido o traçado
 *  segue. Se o nó sem saída é o primeiro, o original grava um V_153a velho de outra
 *  rotina; aqui, o próprio nó (só muda o corrigido). */
export function regiaoDoBordo(
  laje: LajeMontagem,
  padrao: PadraoMontagem,
  k: number,
  t: Tolerancias,
  modo: ModoSistrut = "original",
): { poligono: PoligonoFechado; area: number } {
  const { s, tol, eps } = t;
  const sg = padrao.seg;
  const fimIdx = k + 1 === laje.n + 1 ? 1 : k + 1;
  const xi = s(laje.x[k] ?? 0);
  const yi = s(laje.y[k] ?? 0);
  const xf = s(laje.x[fimIdx] ?? 0);
  const yf = s(laje.y[fimIdx] ?? 0);
  const vazio = { poligono: { x: [0], y: [0], n: 0 }, area: 0 };

  // primeiro segmento: o que sai do vértice k, ou o que toca o ponto inicial
  let atual = 1;
  let x2 = 0;
  let y2 = 0;
  for (; atual <= sg.n; atual++) {
    if (-sg.get(atual, 0) === k) {
      x2 = sg.get(atual, 2);
      y2 = sg.get(atual, 3);
      break;
    }
  }
  if (sg.n < atual) {
    for (atual = 1; atual <= sg.n; atual++) {
      const p = inicioSegmento(laje, sg, atual);
      x2 = p.x;
      y2 = p.y;
      if (perto(x2, y2, xi, yi, tol)) {
        x2 = sg.get(atual, 2);
        y2 = sg.get(atual, 3);
        break;
      }
      if (perto(sg.get(atual, 2), sg.get(atual, 3), xi, yi, tol)) break;
    }
  }
  const px = [0, xi, s(x2)];
  const py = [0, yi, s(y2)];
  let n = 2;
  let p140 = 1;
  // V_153a/V_1542: último ponto escolhido; fica velho quando o nó não tem saída
  let x153 = px[2] ?? 0;
  let y153 = py[2] ?? 0;
  for (let passos = 0; ; passos++) {
    if (passos > 4 * sg.n + 10) return vazio;
    const xa = px[p140] ?? 0;
    const ya = py[p140] ?? 0;
    const xb = px[p140 + 1] ?? 0;
    const yb = py[p140 + 1] ?? 0;
    const ee = direcaoRegiao(xa, ya, xb, yb, tol);
    let escolhido = -1;
    let melhor = 0;
    let xs = 0;
    let ys = 0;
    let fecha = false;
    for (let f04 = 1; f04 <= sg.n; f04++) {
      if (f04 === atual) continue;
      const ini = inicioSegmento(laje, sg, f04);
      let ox: number;
      let oy: number;
      if (perto(ini.x, ini.y, xb, yb, tol)) {
        ox = sg.get(f04, 2);
        oy = sg.get(f04, 3);
      } else if (perto(sg.get(f04, 2), sg.get(f04, 3), xb, yb, tol)) {
        ox = ini.x;
        oy = ini.y;
      } else {
        continue;
      }
      if (perto(ox, oy, xf, yf, tol) || sg.get(f04, 0) === -fimIdx) {
        xs = xf;
        ys = yf;
        fecha = true;
        break;
      }
      const g = giro(ee, direcaoRegiao(xb, yb, ox, oy, tol), eps);
      if (escolhido === -1 || melhor < g) {
        xs = ox;
        ys = oy;
        melhor = g;
        escolhido = f04;
      }
    }
    // L_224c8 (LAJEMONT.BAS:2970-2973): no passo seguinte a um nó sem saída
    // (V_0f14 = −1) a região vale 0 no original, feche ou não; no corrigido o recuo
    // continua o traçado (defeito do original: a carga da região some)
    if (atual === -1 && (modo === "original" || (!fecha && escolhido === -1))) return vazio;
    if (fecha || escolhido !== -1) {
      x153 = xs;
      y153 = ys;
    } else {
      // nó sem saída: grava de novo o último ponto e volta pelo mesmo segmento
      xs = x153;
      ys = y153;
    }
    n += 1;
    px[p140 + 2] = s(xs);
    py[p140 + 2] = s(ys);
    if (perto(xs, ys, xf, yf, tol)) {
      px[p140 + 3] = xi;
      py[p140 + 3] = yi;
      n += 1;
      break;
    }
    p140 += 1;
    atual = escolhido;
  }
  // L_226bf: tira pontos alinhados
  let f04 = 1;
  const tira = (j: number) => {
    for (let m = j; m <= n - 1; m++) {
      px[m] = px[m + 1] ?? 0;
      py[m] = py[m + 1] ?? 0;
    }
    n -= 1;
  };
  while (f04 + 2 <= n - 1) {
    const a = px[f04] ?? 0;
    const b = px[f04 + 1] ?? 0;
    const c = px[f04 + 2] ?? 0;
    if (a === b) {
      if (a === c) tira(f04 + 1);
      else f04 += 1;
    } else if (b !== c && a !== c) {
      const m1 = ((py[f04 + 2] ?? 0) - (py[f04 + 1] ?? 0)) / (c - b);
      const m0 = ((py[f04 + 1] ?? 0) - (py[f04] ?? 0)) / (b - a);
      if (Math.abs(m1 - m0) < eps) tira(f04 + 1);
      else f04 += 1;
    } else {
      f04 += 1;
    }
  }
  const poligono = { x: px, y: py, n };
  return { poligono, area: areaTrapezios(poligono, s) };
}

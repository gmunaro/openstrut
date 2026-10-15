// Cargas que a região de um bordo leva (S_20146 da LAJEMONT; livros_laje.md 1.15):
// alvenaria dentro da região (L_22d01, LAJEMONT.BAS:2994-3168) e carga por área
// recortada pela região (L_25041 e L_2551f, LAJEMONT.BAS:3385-3866).
import type { LajeMontagem } from "./charneiras";
import {
  cruzamentos,
  intersecaoSegmentos,
  maior,
  menor,
  par,
  perto,
  sobreLado,
  type PoligonoFechado,
  type Tolerancias,
} from "./geometria";

/** Caixa da região (L_BPb2/L_BPb6 mínimos, L_BPba/L_BPbe máximos) pelos pontos 1 a n−1,
 *  como o L_22d01 calcula (LAJEMONT.BAS:2999-3023); o L_2551f a reaproveita. */
export function caixaRegiao(r: PoligonoFechado, t: Tolerancias) {
  const { s } = t;
  let xmin = s(r.x[1] ?? 0);
  let ymin = s(r.y[1] ?? 0);
  let xmax = xmin;
  let ymax = ymin;
  for (let k = 2; k <= r.n - 1; k++) {
    xmin = menor(s, xmin, r.x[k] ?? 0);
    ymin = menor(s, ymin, r.y[k] ?? 0);
    xmax = maior(s, xmax, r.x[k] ?? 0);
    ymax = maior(s, ymax, r.y[k] ?? 0);
  }
  return { xmin, ymin, xmax, ymax };
}

/** Lado do polígono fechado k → k+1 (o último fecha no primeiro). */
function lado(p: PoligonoFechado, k: number) {
  const j = k + 1 === p.n ? 1 : k + 1;
  return [p.x[k] ?? 0, p.y[k] ?? 0, p.x[j] ?? 0, p.y[j] ?? 0] as const;
}

/** Fator do trecho de alvenaria (L_245f5, LAJEMONT.BAS:3237-3279): sobre um bordo da
 *  laje vale 0 (bordo apoiado/engastado ou laje pré-moldada) ou 1 (bordo livre);
 *  sobre um lado da região (charneira), 0,5; fora deles, 1. */
function fatorAlvenaria(
  laje: LajeMontagem,
  regiao: PoligonoFechado,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: Tolerancias,
) {
  for (let k = 1; k <= laje.n; k++) {
    const lx1 = laje.x[k] ?? 0;
    const ly1 = laje.y[k] ?? 0;
    const lx2 = laje.x[k + 1] ?? 0;
    const ly2 = laje.y[k + 1] ?? 0;
    if (sobreLado(lx1, ly1, lx2, ly2, x1, y1, x2, y2, t)) {
      if (laje.tipo === 1) return 0;
      return (laje.codigos[k] ?? 0) === 1 ? 1 : 0;
    }
  }
  for (let k = 1; k <= regiao.n - 1; k++) {
    const [lx1, ly1, lx2, ly2] = lado(regiao, k);
    if (sobreLado(lx1, ly1, lx2, ly2, x1, y1, x2, y2, t)) return 0.5;
  }
  return 1;
}

/** Trecho de alvenaria (x1, y1)-(x2, y2) com carga t/m. */
export interface TrechoAlvenaria {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  carga: number;
}

/** Carga de alvenaria dentro da região, t (L_22d01): pontas internas e cortes com o
 *  contorno da região, ordenados por x (ou por y no trecho vertical); cada pedaço
 *  vale comprimento × carga × fator. */
export function alvenariaNaRegiao(
  laje: LajeMontagem,
  regiao: PoligonoFechado,
  alvenarias: readonly TrechoAlvenaria[],
  t: Tolerancias,
) {
  const { s, tol } = t;
  const cx = caixaRegiao(regiao, t);
  let total = 0;
  for (const a of alvenarias) {
    if (cx.xmin > maior(s, a.x1, a.x2) || cx.xmax < menor(s, a.x1, a.x2)) continue;
    if (cx.ymin > maior(s, a.y1, a.y2) || cx.ymax < menor(s, a.y1, a.y2)) continue;
    const px: number[] = [];
    const py: number[] = [];
    let p102 = 1;
    let p106 = 1;
    if (par(cruzamentos(regiao, a.x1, a.y1, 0, t))) p102 = 0;
    else {
      px.push(s(a.x1));
      py.push(s(a.y1));
    }
    if (par(cruzamentos(regiao, a.x2, a.y2, 0, t))) p106 = 0;
    else {
      px.push(s(a.x2));
      py.push(s(a.y2));
    }
    for (let k = 1; k <= regiao.n - 1; k++) {
      const [ax1, ay1, ax2, ay2] = lado(regiao, k);
      const r = intersecaoSegmentos(ax1, ay1, ax2, ay2, a.x1, a.y1, a.x2, a.y2, t);
      if (r.ok) {
        px.push(s(r.x));
        py.push(s(r.y));
      }
    }
    if (px.length < 2) continue;
    if (px.length > p102 + p106) {
      for (let i = 0; i < px.length; i++) {
        for (let j = i + 1; j < px.length;) {
          if (perto(px[i] ?? 0, py[i] ?? 0, px[j] ?? 0, py[j] ?? 0, tol)) {
            px.splice(j, 1);
            py.splice(j, 1);
          } else {
            j += 1;
          }
        }
      }
    }
    if (px.length < 2) continue;
    const chave = px[0] === px[1] ? py : px;
    for (let i = 0; i < px.length - 1; i++) {
      for (let j = i + 1; j < px.length; j++) {
        if ((chave[i] ?? 0) > (chave[j] ?? 0)) {
          [px[i], px[j]] = [px[j] ?? 0, px[i] ?? 0];
          [py[i], py[j]] = [py[j] ?? 0, py[i] ?? 0];
        }
      }
    }
    for (let i = 0; i + 1 < px.length; i++) {
      const x1 = px[i] ?? 0;
      const y1 = py[i] ?? 0;
      const x2 = px[i + 1] ?? 0;
      const y2 = py[i + 1] ?? 0;
      const f = fatorAlvenaria(laje, regiao, x1, y1, x2, y2, t);
      total = s(Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2) * a.carga * f + total);
    }
  }
  return total;
}

/** Polígono de carga por área (A_1014): vértices sem repetir o primeiro. */
export interface PoligonoCarga {
  x: number[];
  y: number[];
  total: number;
  acidental: number;
}

/** Fecha o polígono de carga no formato L_BP40/L_BP52 e calcula a área (L_BPda). */
function fechaCarga(c: PoligonoCarga, t: Tolerancias) {
  const { s } = t;
  const x = [0, ...c.x.map(s), s(c.x[0] ?? 0)];
  const y = [0, ...c.y.map(s), s(c.y[0] ?? 0)];
  const p: PoligonoFechado = { x, y, n: c.x.length + 1 };
  let a = 0;
  for (let k = 1; k <= p.n - 1; k++) {
    a = s((((x[k] ?? 0) + (x[k + 1] ?? 0)) * ((y[k] ?? 0) - (y[k + 1] ?? 0))) / 2 + a);
  }
  return { p, area: Math.abs(a) };
}

type Seg = [number, number, number, number];

/** Área de interseção da região (área `areaRegiao`) com o polígono de carga (L_2551f):
 *  sem cortes, a menor contida inteira na maior; com cortes, recorta os lados nos
 *  pontos de corte, tira os pedaços fora do outro polígono, as duplicatas e as pontas
 *  soltas, encadeia e soma as áreas dos laços. */
export function areaCargaNaRegiao(
  regiao: PoligonoFechado,
  areaRegiao: number,
  carga: PoligonoCarga,
  t: Tolerancias,
) {
  const { s, tol } = t;
  const fechada = fechaCarga(carga, t);
  const B = fechada.p;
  const cx = caixaRegiao(regiao, t);
  // caixa do polígono de carga, com a folga crescente do original (LAJEMONT.BAS:3422-3447)
  let c2 = s((B.x[1] ?? 0) + tol);
  let c6 = s((B.y[1] ?? 0) + tol);
  let ca = s((B.x[1] ?? 0) - tol);
  let ce = s((B.y[1] ?? 0) - tol);
  for (let k = 2; k <= B.n - 1; k++) {
    c2 = menor(s, c2 + tol, B.x[k] ?? 0);
    c6 = menor(s, c6 + tol, B.y[k] ?? 0);
    ca = maior(s, ca - tol, B.x[k] ?? 0);
    ce = maior(s, ce - tol, B.y[k] ?? 0);
  }
  if (ca <= cx.xmin || c2 >= cx.xmax || ce <= cx.ymin || c6 >= cx.ymax) return 0;

  const dentroDe = (P: PoligonoFechado, Q: PoligonoFechado) => {
    const f: boolean[] = [];
    for (let k = 1; k <= Q.n - 1; k++) f[k] = !par(cruzamentos(P, Q.x[k] ?? 0, Q.y[k] ?? 0, 1, t));
    return f;
  };
  const A = regiao;
  const bDentro = dentroDe(A, B);
  let cortes = 0;
  for (let i = 1; i <= A.n - 1; i++) {
    const [x3, y3, x4, y4] = [A.x[i] ?? 0, A.y[i] ?? 0, A.x[i + 1] ?? 0, A.y[i + 1] ?? 0];
    for (let j = 1; j <= B.n - 1; j++) {
      const [x5, y5, x6, y6] = [B.x[j] ?? 0, B.y[j] ?? 0, B.x[j + 1] ?? 0, B.y[j + 1] ?? 0];
      const r = intersecaoSegmentos(x5, y5, x6, y6, x3, y3, x4, y4, t);
      let ok = r.ok;
      if (perto(r.x, r.y, x4, y4, tol) || perto(r.x, r.y, x3, y3, tol)) ok = false;
      if (perto(r.x, r.y, x6, y6, tol) || perto(r.x, r.y, x5, y5, tol)) ok = false;
      if (ok && !sobreLado(x5, y5, x6, y6, x3, y3, x4, y4, t)) cortes += 1;
    }
  }
  const nDentro = bDentro.filter(Boolean).length;
  if (cortes === 0 && nDentro === B.n - 1) return fechada.area;
  if (cortes === 0) {
    const aDentro = dentroDe(B, A).filter(Boolean).length;
    return aDentro === A.n - 1 ? areaRegiao : 0;
  }

  // caso geral (L_2639b): lados das duas figuras numa lista só
  const seg: Seg[] = [];
  for (let i = 1; i <= A.n - 1; i++)
    seg.push([A.x[i] ?? 0, A.y[i] ?? 0, A.x[i + 1] ?? 0, A.y[i + 1] ?? 0]);
  for (let j = 1; j <= B.n - 1; j++)
    seg.push([B.x[j] ?? 0, B.y[j] ?? 0, B.x[j + 1] ?? 0, B.y[j + 1] ?? 0]);
  const S = (k: number): Seg => seg[k] ?? [0, 0, 0, 0];
  const afasta = (x: number, y: number, px: number, py: number) =>
    Math.abs(y - py) > tol || Math.abs(x - px) > tol;
  for (let i = 0; i < seg.length - 1; i++) {
    for (let j = i + 1; j < seg.length; j++) {
      const s1 = S(i);
      const s2 = S(j);
      const r = intersecaoSegmentos(s2[0], s2[1], s2[2], s2[3], s1[0], s1[1], s1[2], s1[3], t);
      let ok = r.ok;
      if (perto(r.x, r.y, s1[2], s1[3], tol) || perto(r.x, r.y, s1[0], s1[1], tol)) {
        if (perto(r.x, r.y, s2[2], s2[3], tol) || perto(r.x, r.y, s2[0], s2[1], tol)) ok = false;
      }
      if (!ok || sobreLado(s2[0], s2[1], s2[2], s2[3], s1[0], s1[1], s1[2], s1[3], t)) continue;
      const x = s(r.x);
      const y = s(r.y);
      if (afasta(r.x, r.y, s1[2], s1[3]) && afasta(r.x, r.y, s1[0], s1[1])) {
        seg.push([x, y, s1[2], s1[3]]);
        s1[2] = x;
        s1[3] = y;
      }
      if (afasta(r.x, r.y, s2[2], s2[3]) && afasta(r.x, r.y, s2[0], s2[1])) {
        seg.push([x, y, s2[2], s2[3]]);
        s2[2] = x;
        s2[3] = y;
      }
    }
  }
  const tiraOsQueTocam = (P: PoligonoFechado, fora: boolean[]) => {
    for (let k = 1; k <= P.n - 1; k++) {
      if (!fora[k]) continue;
      const px = P.x[k] ?? 0;
      const py = P.y[k] ?? 0;
      for (let j = 0; j < seg.length;) {
        const g = S(j);
        if (perto(px, py, g[2], g[3], tol) || perto(px, py, g[0], g[1], tol)) seg.splice(j, 1);
        else j += 1;
      }
    }
  };
  tiraOsQueTocam(
    B,
    bDentro.map((d) => !d),
  );
  tiraOsQueTocam(
    A,
    dentroDe(B, A).map((d) => !d),
  );
  // duplicatas (o original pula o seguinte depois de cada remoção)
  for (let i = 0; i < seg.length - 1; i++) {
    for (let j = i + 1; j < seg.length; j++) {
      const a = S(i);
      const b = S(j);
      const igual = perto(a[2], a[3], b[2], b[3], tol) && perto(a[0], a[1], b[0], b[1], tol);
      const inverso = perto(a[2], a[3], b[0], b[1], tol) && perto(a[0], a[1], b[2], b[3], tol);
      if (igual || inverso) seg.splice(j, 1);
    }
  }
  tiraPontasSoltas(seg, t);
  // encadeia (L_28cba)
  let i = 0;
  for (let g = 0; g < 10000; g++) {
    let achou = false;
    const limite = seg.length;
    for (let j = i + 1; j < limite; j++) {
      const a = S(i);
      const b = S(j);
      if (perto(b[0], b[1], a[2], a[3], tol)) {
        // segue
      } else if (perto(b[2], b[3], a[2], a[3], tol)) {
        seg[j] = [b[2], b[3], b[0], b[1]];
      } else {
        continue;
      }
      if (i + 1 < j) [seg[j], seg[i + 1]] = [S(i + 1), S(j)];
      achou = true;
      i += 1;
    }
    if (!(seg.length - 1 > i)) break;
    if (!achou) i += 1;
  }
  // área dos laços (L_2911a)
  let area = 0;
  let acc = 0;
  let inicio = 0;
  for (let j = 0; j < seg.length; j++) {
    const a = S(j);
    const prox = j + 1 < seg.length ? S(j + 1) : S(0);
    let x3 = prox[0];
    let y3 = prox[1];
    if (a[3] !== prox[1] || a[2] !== prox[0]) {
      x3 = a[2];
      y3 = a[3];
    }
    acc = s(acc + ((a[0] + x3) * (a[1] - y3)) / 2);
    const ini = S(inicio);
    if (a[3] === ini[1] && a[2] === ini[0]) {
      area = s(Math.abs(acc) + area);
      acc = 0;
      inicio = j + 1;
    }
  }
  return area;
}

/** L_27d4a..L_28c7a: tira pedaços com ponta solta (uma ponta tocando só a si mesmo),
 *  pedaços cruzados por outro na ponta e triângulos degenerados de cortes duplos. */
function tiraPontasSoltas(seg: Seg[], t: Tolerancias) {
  const { tol } = t;
  const S = (k: number): Seg => seg[k] ?? [0, 0, 0, 0];
  let i = 0;
  for (let g = 0; g < 100000 && i < seg.length; g++) {
    const a = S(i);
    let c102 = 0;
    let c106 = 0;
    for (let j = 0; j < seg.length; j++) {
      const b = S(j);
      if (perto(a[0], a[1], b[2], b[3], tol) || perto(a[0], a[1], b[0], b[1], tol)) c102 += 1;
      if (perto(a[2], a[3], b[2], b[3], tol) || perto(a[2], a[3], b[0], b[1], tol)) c106 += 1;
      if (c106 > 2 && c102 > 2) break;
    }
    if (!(c106 === 1 || c102 === 1 || (c106 > 2 && c102 > 2))) {
      i += 1;
      continue;
    }
    const naoNulo = Math.abs(a[1] - a[3]) >= tol || Math.abs(a[0] - a[2]) >= tol;
    if (!(naoNulo && c106 > 2 && c102 > 2)) {
      seg.splice(i, 1);
      continue;
    }
    let cruza = false;
    for (let k = 0; k < seg.length; k++) {
      if (k === i) continue;
      const b = S(k);
      if (!(perto(a[0], a[1], b[2], b[3], tol) || perto(a[0], a[1], b[0], b[1], tol))) continue;
      const r = intersecaoSegmentos(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], t);
      if (Math.abs(r.y - a[1]) >= tol || Math.abs(r.x - a[0]) >= tol) {
        cruza = true;
        break;
      }
    }
    if (cruza) {
      seg.splice(i, 1);
      continue;
    }
    let triangulo = false;
    for (let k = 0; k < seg.length && !triangulo; k++) {
      const b = S(k);
      if (!(perto(a[0], a[1], b[2], b[3], tol) || (perto(a[0], a[1], b[0], b[1], tol) && k !== i)))
        continue;
      let x3 = b[0];
      let y3 = b[1];
      if (perto(a[0], a[1], x3, y3, tol)) {
        x3 = b[2];
        y3 = b[3];
      }
      for (let m = 0; m < seg.length; m++) {
        const c = S(m);
        if (
          !(
            perto(a[2], a[3], c[2], c[3], tol) ||
            (perto(a[2], a[3], c[0], c[1], tol) && m !== i && m !== k)
          )
        )
          continue;
        let x4 = c[0];
        let y4 = c[1];
        if (perto(a[2], a[3], x4, y4, tol)) {
          x4 = c[2];
          y4 = c[3];
        }
        if (perto(x3, y3, x4, y4, tol)) {
          seg.splice(k, 1);
          seg.splice(m > k ? m - 1 : m, 1);
          triangulo = true;
          break;
        }
      }
    }
    i = triangulo ? 0 : i + 1;
  }
}

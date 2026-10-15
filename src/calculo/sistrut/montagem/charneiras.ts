// Padrão de charneiras da LAJEMONT (S_401b9, LAJEMONT.BAS:5395-7594; livros_laje.md
// 1.6 e 1.15; U42-003): o mesmo algoritmo do LAMONTLB do LAJECALC (S_4019b), mas em
// coordenadas REAIS (sem giro nem afinidade), com o i de cada bordo calculado na hora
// pelos códigos (L_14b11) e com o tratamento próprio de bordo livre (L_4dbbe, ponto
// médio do bordo livre). A saída é a tabela A_19fe do original: segmentos que começam
// num vértice da laje (a0 = −índice) ou num ponto (a0, a1) e terminam em (a2, a3).
//
// Porte rótulo a rótulo: os nomes dos campos são os endereços das variáveis do
// original (v15ea = V_15ea!, ...) e os `case` são os rótulos L_xxxxx, para conferir
// linha a linha com o .BAS. A tabela de segmentos guarda lixo nas colunas não
// escritas, como o original (um segmento novo num índice reaproveitado mantém o a1
// antigo), porque a limpeza (L_497ca) lê essas colunas.
//
// Código de bordo: 1 livre, 0..2 apoiado, > 2 engastado com i = (código − 2)/10. No
// modo corrigido a otimização (T2, R3) grava código fracionário (2 + 10·coef); ele
// entra nas mesmas contas, sem truncar.
import {
  dist2,
  direcao,
  intersecaoRetas,
  intersecaoSegmentos,
  maior,
  menor,
  perto,
  PI,
  raio,
  type Arred,
  type Tolerancias,
} from "./geometria";

/** Tabela de segmentos A_19fe (índices 1..n; colunas 0..3). */
export class TabelaSegmentos {
  private d: Float64Array;
  n = 0;
  constructor(private readonly s: Arred) {
    this.d = new Float64Array(4 * 128);
  }
  get(i: number, c: number) {
    return this.d[4 * i + c] ?? 0;
  }
  set(i: number, c: number, v: number) {
    if (4 * i + c >= this.d.length) {
      const novo = new Float64Array(this.d.length * 2);
      novo.set(this.d);
      this.d = novo;
    }
    this.d[4 * i + c] = this.s(v);
  }
  /** Copia a linha j para a linha i (as 4 colunas). */
  copia(i: number, j: number) {
    for (let c = 0; c < 4; c++) this.set(i, c, this.get(j, c));
  }
  troca(i: number, j: number) {
    for (let c = 0; c < 4; c++) {
      const v = this.get(i, c);
      this.set(i, c, this.get(j, c));
      this.set(j, c, v);
    }
  }
  /** Remove a linha i deslocando as seguintes (a última fica com o lixo dela). */
  remove(i: number) {
    for (let k = i; k <= this.n - 1; k++) this.copia(k, k + 1);
    this.n -= 1;
  }
}

/** Laje como a LAJEMONT a vê: polígono (vértices 1..n, n+1 = 1), código de cada
 *  bordo e tipo. */
export interface LajeMontagem {
  x: number[];
  y: number[];
  codigos: number[];
  /** Número de bordos. */
  n: number;
  tipo: number;
  /** Ângulo das nervuras da pré-moldada (tipo 1), graus (A_10cc(·,5) no original). */
  anguloNervuras: number;
}

/** Monta a `LajeMontagem` a partir dos vértices (sem repetir o primeiro). */
export function lajeMontagem(
  vertices: readonly { x: number; y: number }[],
  codigos: readonly number[],
  tipo: number,
  anguloNervuras = 0,
): LajeMontagem {
  const n = vertices.length;
  const x = [0];
  const y = [0];
  const cod = [0];
  for (let k = 0; k < n; k++) {
    x.push(vertices[k]?.x ?? 0);
    y.push(vertices[k]?.y ?? 0);
    cod.push(codigos[k] ?? 0);
  }
  x.push(vertices[0]?.x ?? 0);
  y.push(vertices[0]?.y ?? 0);
  cod.push(codigos[0] ?? 0);
  return { x, y, codigos: cod, n, tipo, anguloNervuras };
}

/** Ponto inicial de um segmento da tabela (vértice da laje ou ponto gravado). */
export function inicioSegmento(laje: LajeMontagem, seg: TabelaSegmentos, k: number) {
  const a0 = seg.get(k, 0);
  if (a0 < 0) {
    const v = Math.round(-a0);
    return { x: laje.x[v] ?? 0, y: laje.y[v] ?? 0 };
  }
  return { x: a0, y: seg.get(k, 1) };
}

type Rotulo =
  | "L432b5"
  | "L437e0"
  | "L438c4"
  | "L43d38"
  | "L441b6"
  | "L441f1"
  | "L442d5"
  | "L44748"
  | "L44bca"
  | "L45a9c"
  | "L46893"
  | "L473a3"
  | "L47f32"
  | "L48a96"
  | "FIM";

/** Porte do S_401b9 para uma laje. Uso: `new PadraoMontagem(laje, t).executa()`. */
export class PadraoMontagem {
  readonly seg: TabelaSegmentos;
  private readonly s: Arred;
  private readonly tol: number;
  private readonly eps: number;
  private readonly N0: number;
  // A_14a4 (x, y, ângulo da charneira seguinte) e as marcas A_1342
  private readonly ax: number[];
  private readonly ay: number[];
  private readonly aa: number[];
  private m100: number[];
  private m1342: number[];
  // L_BP40: raios livres (x, y, ângulo)
  private raios: { x: number; y: number; a: number }[] = [];
  // índices de vértice (SINGLE no original)
  private v15ea = 0;
  private v15ee = 0;
  private v15f2 = 0;
  private v15fa = 0;
  private v15fe = 0;
  private v1602 = 0;
  private v1606 = 0;
  private v1612 = 0;
  private v1616 = 0;
  private v1522 = 0;
  private v1526 = 0;
  private v152a = 0;
  private v152e = 0;
  private v1536 = 0;
  private v15e2 = 0;
  // ângulos e pontos DOUBLE
  private v1512 = 0;
  private v151a = 0;
  private v150a = 0;
  private v14da = 0;
  // pontos SINGLE da vértice corrente (15ca/15ce), lado anterior (15ba/15be) e seguinte (15c2/15c6)
  private v15ca = 0;
  private v15ce = 0;
  private v15ba = 0;
  private v15be = 0;
  private v15c2 = 0;
  private v15c6 = 0;
  private v14f2 = 0;
  private v14fa = 0;
  private v1502 = 0;
  private bp20e = 0;

  constructor(
    private readonly laje: LajeMontagem,
    t: Tolerancias,
  ) {
    this.s = t.s;
    this.tol = t.tol;
    this.eps = t.eps;
    this.N0 = laje.n + 1;
    this.seg = new TabelaSegmentos(t.s);
    const z = () => Array.from({ length: laje.n + 3 }, () => 0);
    this.ax = z();
    this.ay = z();
    this.aa = z();
    this.m100 = z();
    this.m1342 = z();
  }

  private get t(): Tolerancias {
    return { s: this.s, tol: this.tol, eps: this.eps };
  }
  private px(k: number) {
    return this.laje.x[k] ?? 0;
  }
  private py(k: number) {
    return this.laje.y[k] ?? 0;
  }
  private cod(k: number) {
    return this.laje.codigos[k] ?? 0;
  }
  private ant(k: number) {
    return k - 1 === 0 ? this.laje.n : k - 1;
  }
  private prox(k: number) {
    return k + 1 === this.N0 ? 1 : k + 1;
  }
  private a14(k: number, c: 0 | 1 | 2) {
    const v = c === 0 ? this.ax[k] : c === 1 ? this.ay[k] : this.aa[k];
    return v ?? 0;
  }
  private poeA14(k: number, x: number, y: number, a: number) {
    this.ax[k] = this.s(x);
    this.ay[k] = this.s(y);
    this.aa[k] = this.s(a);
  }
  /** Mesmo ponto de A_14a4 (x e y exatos). */
  private mesmoPonto(i: number, j: number) {
    return this.a14(i, 1) === this.a14(j, 1) && this.a14(i, 0) === this.a14(j, 0);
  }
  /** Mesmo ponto e ângulo de A_14a4. */
  private mesmoA14(i: number, j: number) {
    return this.mesmoPonto(i, j) && this.a14(i, 2) === this.a14(j, 2);
  }
  private poeSeg(a0: number, a2: number, a3: number, a1?: number) {
    const sg = this.seg;
    sg.n += 1;
    sg.set(sg.n, 0, a0);
    if (a1 !== undefined) sg.set(sg.n, 1, a1);
    sg.set(sg.n, 2, a2);
    sg.set(sg.n, 3, a3);
  }

  /** i do bordo k: Σ(código − 2)·L_k/10 dos bordos colineares agrupados (vértices
   *  marcados −100), ÷ comprimento do grupo, sem arredondar (L_14b11,
   *  LAJEMONT.BAS:2177-2222; igual a L_4e8b3, 7463-7507). */
  iDoBordo(k: number) {
    const s = this.s;
    const comp = (a: number, b: number) =>
      Math.sqrt((this.px(a) - this.px(b)) ** 2 + (this.py(a) - this.py(b)) ** 2);
    let soma = 0;
    let b12 = k;
    let b1a = k;
    for (let guarda = 0; guarda <= this.laje.n; guarda++) {
      const b16 = this.prox(b12);
      if (this.cod(b12) > 2) soma = s(((this.cod(b12) - 2) * comp(b12, b16)) / 10 + soma);
      b1a = b12;
      if (this.a14(b12, 0) !== -100) break;
      b12 = this.ant(b12);
    }
    b12 = k;
    let b1e = k;
    for (let guarda = 0; guarda <= this.laje.n; guarda++) {
      b12 = this.prox(b12);
      b1e = b12;
      if (this.a14(b12, 0) !== -100) break;
      const b16 = this.prox(b12);
      if (this.cod(b12) > 2) soma = s(((this.cod(b12) - 2) * comp(b12, b16)) / 10 + soma);
    }
    return s(soma / comp(b1a, b1e));
  }

  /** S_13a73 (LAJEMONT.BAS:2030-2225): ângulo do lado fa→fe visto de fe (v1512),
   *  do lado 02→06 (v151a) e da bissetriz ponderada pelos i (v150a):
   *  φ = ATN(SIN(b−a)/(SQR((i2+1)/(i1+1)) + COS(b−a))). */
  private bissetriz() {
    const { eps } = this;
    const fa = this.v15fa;
    const fe = this.v15fe;
    const f02 = this.v1602;
    const f06 = this.v1606;
    const a = direcao(this.px(fe), this.py(fe), this.px(fa), this.py(fa));
    const b = direcao(this.px(f02), this.py(f02), this.px(f06), this.py(f06));
    this.v1512 = a;
    this.v151a = b;
    const naoColinear =
      Math.abs(b - PI - a) >= eps && Math.abs(a - PI - b) >= eps && Math.abs(a - b) >= eps;
    let r: number;
    if (a <= b) {
      r = (a + b) / 2;
      if (naoColinear) {
        const ia = this.iDoBordo(fa);
        const ib = this.iDoBordo(f02);
        if (ia > ib && this.cod(f02) !== 1 && (ib > 0 || ia > 0)) {
          const q = Math.sqrt((ib + 1) / (ia + 1)) + Math.cos(b - a);
          r = Math.abs(q) < eps ? PI / 2 : Math.atan(Math.sin(b - a) / q);
          if (Math.abs(q) >= eps && r < 0) r = PI + r;
          r = a + r;
        }
        if (ib > ia && (ib > 0 || ia > 0) && this.cod(fa) !== 1) {
          const q = Math.sqrt((ia + 1) / (ib + 1)) + Math.cos(b - a);
          r = Math.abs(q) < eps ? PI / 2 : Math.atan(Math.sin(b - a) / q);
          if (Math.abs(q) >= eps && r < 0) r = PI + r;
          r = b - r;
        }
        if (r < 0) r = 2 * PI + r;
        if (2 * PI <= r) r = r - 2 * PI;
      }
    } else {
      r = (a + b) / 2 + PI;
      if (naoColinear) {
        const ia = this.iDoBordo(fa);
        const ib = this.iDoBordo(f02);
        const d = 2 * PI - a + b;
        if (ia > ib && this.cod(f02) !== 1 && (ib > 0 || ia > 0)) {
          const q = Math.sqrt((ib + 1) / (ia + 1)) + Math.cos(d);
          r = Math.abs(q) < eps ? PI / 2 : Math.atan(Math.sin(d) / q);
          if (Math.abs(q) >= eps && r < 0) r = PI + r;
          r = a + r;
        }
        if (ib > ia && (ib > 0 || ia > 0) && this.cod(fa) !== 1) {
          const q = Math.sqrt((ia + 1) / (ib + 1)) + Math.cos(d);
          r = Math.abs(q) < eps ? PI / 2 : Math.atan(Math.sin(d) / q);
          if (Math.abs(q) >= eps && r < 0) r = PI + r;
          r = b - r;
        }
        if (r < 0) r = 2 * PI + r;
      }
      if (2 * PI <= r) r = r - 2 * PI;
    }
    if (Math.abs(a - b) < eps) {
      if (
        Math.abs(this.py(f06) - this.py(fa) + (this.px(f06) - this.px(fa)) * a) > eps &&
        fe !== f02
      )
        r = a;
    }
    this.v150a = r;
  }

  /** Bissetriz com os quatro índices dados. */
  private bissetrizEm(fa: number, fe: number, f02: number, f06: number) {
    this.v15fa = fa;
    this.v15fe = fe;
    this.v1602 = f02;
    this.v1606 = f06;
    this.bissetriz();
  }

  /** Os dois lados de `bissetriz()` estão alinhados (o vértice tem ângulo π):
   *  |MAX(a, b) − MIN(a, b) − π| < V_133e, com a e b em SINGLE. */
  private colinear() {
    const mx = maior(this.s, this.v1512, this.v151a);
    const mn = menor(this.s, this.v1512, this.v151a);
    return Math.abs(mx - mn - PI) < this.eps;
  }

  /** O vértice k fica num lado reto (L_40629 e repetições): bissetriz(k−1, k, k, k+1)
   *  com lados alinhados. */
  private verticeReto(k: number) {
    this.bissetrizEm(this.ant(k), k, k, this.prox(k));
    return this.colinear();
  }

  /** S_13320 (LAJEMONT.BAS:1929-2028): o ponto está dentro da laje (contagem de
   *  cruzamentos sobre os vértices não colineares; sobre o contorno conta dentro). */
  private dentro(x: number, y: number) {
    const { s, tol } = this;
    let c = 0;
    for (let k = 1; k <= this.laje.n; k++) {
      if (this.a14(k, 0) === -100) continue;
      const x0 = this.px(k);
      const y0 = this.py(k);
      let j = this.prox(k);
      for (let g = 0; g <= this.laje.n && this.a14(j, 0) === -100; g++) j = this.prox(j);
      const x1 = this.px(j);
      const y1 = this.py(j);
      if (perto(x, y, x1, y1, tol) || perto(x, y, x0, y0, tol)) {
        c = 1;
        break;
      }
      if (menor(s, x0, x1) > tol + x) continue;
      if (maior(s, y0, y1) < y || menor(s, y0, y1) > y) continue;
      if ((x - tol > maior(s, x0, x1) || y0 !== y) && y0 === y1) continue;
      if (maior(s, x0, x1) <= x && menor(s, y0, y1) <= y && maior(s, y0, y1) > y) {
        c += 1;
        if (Math.abs(x - x0) < tol && Math.abs(x0 - x1) < tol) {
          c = 1;
          break;
        }
        continue;
      }
      if (y0 === y1) {
        c = 1;
        break;
      }
      if (maior(s, y0, y1) === y) continue;
      const xi = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
      if (tol + x >= xi) {
        c += 1;
        if (Math.abs(x - xi) < tol) {
          c = 1;
          break;
        }
      }
    }
    return c % 2 !== 0;
  }

  /** S_15189 + S_13320: interseção das retas (ponto, ângulo) dentro da laje.
   *  `nao` = paralelas ou fora (V_0f18$ = "NAO"). */
  private retas(xa: number, ya: number, a: number, xb: number, yb: number, b: number) {
    const r = intersecaoRetas(xa, ya, a, xb, yb, b, this.eps);
    if (r.paralelas) return { x: r.x, y: r.y, nao: true };
    return { x: r.x, y: r.y, nao: !this.dentro(r.x, r.y) };
  }

  /** S_17b61 (LAJEMONT.BAS:2592-2654): primeiro corte do segmento (x1, y1)-(x2, y2)
   *  com os segmentos da tabela a partir de v1522+1 e, se nenhum e v1536 ≠ −1, com
   *  os bordos não livres. `ok` = cortou; v15e2 fica no índice do corte. */
  private corta(x1: number, y1: number, x2: number, y2: number) {
    const sg = this.seg;
    let r = { x: 1e10, y: 1e10, ok: false };
    this.v15e2 = this.v1522 + 1;
    while (sg.n >= this.v15e2) {
      const p = inicioSegmento(this.laje, sg, this.v15e2);
      r = intersecaoSegmentos(
        x1,
        y1,
        x2,
        y2,
        p.x,
        p.y,
        sg.get(this.v15e2, 2),
        sg.get(this.v15e2, 3),
        this.t,
      );
      if (r.y === y1 && r.x === x1) r.ok = false;
      if (r.y === y2 && r.x === x2) r.ok = true;
      if (r.ok) break;
      this.v15e2 += 1;
    }
    if (r.ok || this.v1536 === -1) return r;
    this.v15e2 = 1;
    while (this.laje.n >= this.v15e2) {
      const k = this.v15e2;
      if (this.cod(k) !== 1) {
        r = intersecaoSegmentos(
          x1,
          y1,
          x2,
          y2,
          this.px(k),
          this.py(k),
          this.px(k + 1),
          this.py(k + 1),
          this.t,
        );
        if (r.y === y1 && r.x === x1) r.ok = false;
        if (r.y === y2 && r.x === x2) r.ok = false;
        if (r.ok) break;
      }
      this.v15e2 += 1;
    }
    return r;
  }

  /** L_4dbbe (LAJEMONT.BAS:7362-7452): canto com bordo livre. Pula os bordos livres
   *  (fa para trás, 02 para frente), traça a bissetriz pelo encontro das retas dos
   *  bordos vizinhos (ou, se paralelos, pelo ponto que divide o vão na proporção dos
   *  i) e devolve o ponto onde ela corta o contorno a partir de fe. v14da = ângulo. */
  private cantoLivre() {
    const { s, eps } = this;
    for (let g = 0; g <= this.laje.n && this.cod(this.v15fa) === 1; g++) {
      this.v15fe = this.v15fa;
      this.v15fa = this.ant(this.v15fa);
    }
    for (let g = 0; g <= this.laje.n && this.cod(this.v1602) === 1; g++) {
      this.v1602 = this.prox(this.v1602);
      this.v1606 = this.prox(this.v1602);
    }
    this.bissetriz();
    this.v14da = this.v150a;
    const xa = this.px(this.v15fe);
    const ya = this.py(this.v15fe);
    const xb = this.px(this.v1602);
    const yb = this.py(this.v1602);
    const r = this.retas(xa, ya, this.v1512, xb, yb, this.v151a);
    this.ultimoNao = r.nao;
    let x = r.x;
    let y = r.y;
    if (y === 1e10 && x === 1e10 && r.nao) {
      x = (xa + xb) / 2;
      y = (ya + yb) / 2;
      const i22 = this.iDoBordo(this.v15fa);
      const i26 = this.iDoBordo(this.v1602);
      if (i22 !== i26) {
        const e2 = Math.sin(PI / 2) / (Math.sqrt(1 / (i22 + 1)) + Math.cos(PI / 2));
        const ea = Math.sin(PI / 2) / (Math.sqrt(1 / (i26 + 1)) + Math.cos(PI / 2));
        const f = s(i22 > i26 ? 1 / (ea / e2 + 1) : 1 - 1 / (e2 / ea + 1));
        x = xa;
        if (xa > xb) x = xa - f * (xa - xb);
        if (xa < xb) x = f * (xb - xa) + xa;
        y = ya;
        if (ya > yb) y = ya - f * (ya - yb);
        if (ya < yb) y = f * (yb - ya) + ya;
      }
    }
    const kx = Math.abs(Math.cos(this.v14da)) > eps ? 1000 : 0;
    const ky = Math.abs(Math.sin(this.v14da)) > eps ? 1000 : 0;
    const x1 = x - Math.cos(this.v150a) * kx;
    const y1 = y - Math.sin(this.v150a) * ky;
    const x2 = Math.cos(this.v150a) * kx + x;
    const y2 = Math.sin(this.v150a) * ky + y;
    let k = this.v15fe;
    let p = { x, y, ok: false };
    for (let g = 0; g <= this.laje.n; g++) {
      const k1 = this.prox(k);
      p = intersecaoSegmentos(
        x1,
        y1,
        x2,
        y2,
        this.px(k),
        this.py(k),
        this.px(k1),
        this.py(k1),
        this.t,
      );
      if (p.ok) break;
      k = this.prox(k);
    }
    return { x: p.x, y: p.y };
  }

  /** L_4e563: troca os dois últimos segmentos com os dois anteriores. */
  private trocaUltimos() {
    const n = this.seg.n;
    this.seg.troca(n, n - 2);
    this.seg.troca(n - 1, n - 3);
  }

  /** Executa o padrão e devolve a tabela de segmentos. */
  executa() {
    const tipo = this.laje.tipo;
    if (tipo === 2) return this.seg;
    if (tipo === 1) {
      this.preMoldada();
      this.posProcessa("L4b11c");
      return this.seg;
    }
    this.fase1();
    this.fase2();
    this.fase3();
    this.fase4();
    this.fase5();
    for (let f10 = 1; f10 <= this.laje.n; f10++) this.vertice(f10);
    this.v1536 = -1;
    this.posProcessa("L49190");
    return this.seg;
  }

  /** L_40629: marca −100 nos vértices de lado reto. */
  private fase1() {
    this.v1536 = 1;
    for (let k = 1; k <= this.laje.n; k++) {
      this.v15ea = k;
      this.v1526 = 1;
      if (this.verticeReto(k)) this.ax[k] = -100;
    }
  }

  /** L_40856..L_415fc: segmentos dos bordos livres até o meio do bordo e, por
   *  vértice, o primeiro encontro da bissetriz com a do vértice seguinte (A_14a4). */
  private fase2() {
    const s = this.s;
    this.m100 = this.m100.map(() => 0);
    this.v1536 = 1;
    for (let f10 = 1; f10 <= this.laje.n; f10++) {
      const ea = f10;
      const ee = this.ant(f10);
      let f2 = this.prox(f10);
      this.v15ea = ea;
      this.v15ee = ee;
      this.v15ca = s(this.px(ea));
      this.v15ce = s(this.py(ea));
      this.v15ba = s(this.px(ee));
      this.v15be = s(this.py(ee));
      this.v15c2 = s(this.px(f2));
      this.v15c6 = s(this.py(f2));
      if (this.cod(ea) === 1) {
        const mx = s((this.v15ca + this.v15c2) / 2);
        const my = s((this.v15ce + this.v15c6) / 2);
        this.poeSeg(-ea, mx, my);
        this.poeSeg(-f2, mx, my);
      }
      this.v1526 = 1;
      this.bissetrizEm(ee, ea, ea, f2);
      let nao = this.colinear();
      this.v14f2 = this.v150a;
      if (this.cod(this.v1602) === 1 || this.cod(this.v15fa) === 1) nao = true;
      for (let g = 0; g <= this.laje.n + 1; g++) {
        this.v152e = 1;
        this.bissetrizEm(this.ant(f2), f2, f2, this.prox(f2));
        if (!this.colinear()) break;
        f2 = this.prox(f2);
        if (!nao && f2 !== ea) {
          this.v15c2 = s(this.px(f2));
          this.v15c6 = s(this.py(f2));
          continue;
        }
        nao = true;
        break;
      }
      this.v14fa = this.v150a;
      if (this.cod(this.v1602) === 1 || this.cod(this.v15fa) === 1) nao = true;
      const r = this.retas(this.v15ca, this.v15ce, this.v14f2, this.v15c2, this.v15c6, this.v14fa);
      if (!nao && !r.nao) {
        this.ax[ea] = s(r.x);
        this.ay[ea] = s(r.y);
        this.bissetrizEm(ee, ea, f2, this.prox(f2));
        let ang = this.v150a;
        if (this.cod(this.v1602) !== 1 && this.cod(this.v15fa) === 1) ang = this.v1512;
        if (this.cod(this.v15fa) !== 1 && this.cod(this.v1602) === 1) ang = this.v151a;
        this.aa[ea] = s(ang);
      } else {
        this.aa[ea] = 100;
      }
    }
  }

  /** L_41672..L_41fec: entre vizinhos, fica o encontro mais próximo (o outro vira 100). */
  private fase3() {
    const s = this.s;
    for (let f10 = 1; f10 <= this.laje.n; f10++) {
      const ea = f10;
      let ee = this.ant(f10);
      let f2 = this.prox(f10);
      const xa = s(this.px(ea));
      const ya = s(this.py(ea));
      let x2 = 0;
      let y2 = 0;
      for (let g = 0; g <= this.laje.n + 1; g++) {
        x2 = s(this.px(f2));
        y2 = s(this.py(f2));
        if (this.a14(f2, 2) !== 100) break;
        if (!this.verticeReto(f2)) break;
        f2 = this.v1606;
      }
      for (let g = 0; g <= this.laje.n + 1; g++) {
        if (this.a14(ee, 2) !== 100) break;
        this.v152a = 1;
        if (!this.verticeReto(ee)) break;
        ee = this.v15fa;
      }
      if (this.a14(ea, 2) !== 100) {
        if (this.a14(ee, 2) !== 100) {
          if (
            dist2(this.a14(ea, 0), this.a14(ea, 1), xa, ya) >=
            dist2(this.a14(ee, 0), this.a14(ee, 1), xa, ya)
          )
            this.m100[ea] = 100;
        }
        if (this.a14(f2, 2) !== 100) {
          if (
            dist2(this.a14(ea, 0), this.a14(ea, 1), x2, y2) >=
            dist2(this.a14(f2, 0), this.a14(f2, 1), x2, y2)
          )
            this.m100[ea] = 100;
        }
      }
    }
    for (let k = 1; k <= this.laje.n; k++) if (this.m100[k] === 100) this.aa[k] = 100;
  }

  /** L_4202c: o encontro do vértice passa também ao vértice seguinte não reto. */
  private fase4() {
    let f10 = 1;
    do {
      const ea = f10;
      let pulos = 0;
      if (this.a14(ea, 2) !== 100) {
        let f2 = f10 + 1;
        for (let g = 0; g <= this.laje.n + 1; g++) {
          pulos += 1;
          if (f2 === this.N0) f2 = 1;
          if (!this.verticeReto(f2)) break;
          f2 += 1;
        }
        this.poeA14(f2, this.a14(ea, 0), this.a14(ea, 1), this.a14(ea, 2));
        f10 += pulos;
      }
      f10 += 1;
    } while (!(this.laje.n < f10));
  }

  /** L_424d2..L_4307a: vértices reentrantes (ângulo > π) anulam o encontro que fica
   *  além do encontro com as charneiras vizinhas. */
  private fase5() {
    this.m1342 = this.m1342.map(() => 0);
    for (let f10 = 1; f10 <= this.laje.n; f10++) {
      this.bissetrizEm(this.ant(f10), f10, f10, this.prox(f10));
      let reentrante: boolean;
      if (this.v1512 < this.v151a) reentrante = this.v1512 + PI < this.v151a;
      else reentrante = this.v151a + PI > this.v1512;
      if (!(this.a14(f10, 2) !== 100 && reentrante)) continue;
      const fa = f10;
      let fe = fa;
      for (let g = 0; g <= this.laje.n + 1; g++) {
        fe = this.prox(fe);
        if (this.mesmoA14(fe, fa)) break;
      }
      const xa = this.a14(fa, 0);
      const ya = this.a14(fa, 1);
      const anga = this.a14(fa, 2);
      const dRef = dist2(xa, ya, this.px(fa), this.py(fa));
      let f02 = fa;
      for (let g = 0; g <= this.laje.n + 1; g++) {
        f02 = this.prox(f02);
        if (!this.mesmoA14(f02, fa)) break;
      }
      if (this.a14(f02, 2) !== 100) {
        const r = this.retas(xa, ya, anga, this.a14(f02, 0), this.a14(f02, 1), this.a14(f02, 2));
        if (dist2(r.x, r.y, this.px(fa), this.py(fa)) < dRef && !r.nao) {
          this.aa[fa] = 100;
          this.aa[fe] = 100;
          continue;
        }
      }
      f02 = fa;
      for (let g = 0; g <= this.laje.n + 1; g++) {
        f02 = this.ant(f02);
        if (!this.mesmoA14(f02, fa)) break;
      }
      if (this.a14(f02, 2) !== 100) {
        const r = this.retas(xa, ya, anga, this.a14(f02, 0), this.a14(f02, 1), this.a14(f02, 2));
        if (dist2(r.x, r.y, this.px(fa), this.py(fa)) < dRef && !r.nao) {
          this.aa[fa] = 100;
          this.aa[fe] = 100;
        }
      }
    }
  }

  /** Laço principal por vértice (L_43169..L_49138): parte do vértice, encontra a
   *  charneira do lado anterior e do seguinte, avança pela mais próxima e grava os
   *  segmentos até fechar. */
  private vertice(f10: number) {
    const s = this.s;
    const { tol, eps } = this;
    const sg = this.seg;
    let ea = f10;
    let ee = this.ant(f10);
    let f2 = this.prox(f10);
    this.v15ea = ea;
    this.v1526 = 1;
    this.v15ca = s(this.px(ea));
    this.v15ce = s(this.py(ea));
    this.v1522 = sg.n;
    this.v15fa = ee;
    this.v15fe = ea;
    this.v1602 = ea;
    this.v1606 = f2;
    let bp96 = false; // L_BP96$ = "NAO"
    let bp110 = false; // L_BP110$ = "NAO"
    let x157 = 0;
    let y158 = 0; // V_1582#
    let x158 = 0; // V_158a#
    let y159 = 0; // V_1592#
    let x153 = 0;
    let y154 = 0;
    let x164 = 0;
    let y165 = 0;
    let a14e2 = 0;
    let x165 = 0; // V_1652#
    let y166 = 0; // V_1662#
    let a14ea = 0;
    let fe = 0;
    let fa = 0;
    let pc: Rotulo = "L432b5";
    for (let passos = 0; passos < 100000; passos++) {
      switch (pc) {
        case "L432b5": {
          this.bissetriz();
          if (this.colinear() && this.v15fe === this.v1602) {
            pc = "FIM";
            break;
          }
          this.v14f2 = this.v150a;
          const c02 = this.cod(this.v1602);
          const cfa = this.cod(this.v15fa);
          if (c02 === 1 && cfa === 1 && this.v1526 === 1) {
            pc = "FIM";
            break;
          }
          if ((c02 === 1 || cfa === 1) && this.v1526 === 1) {
            const q = this.cantoLivre();
            // V_0f18$ = "NAO" vem do S_15189 feito dentro do L_4dbbe
            if (this.ultimoNao) {
              if (
                dist2(this.px(this.v15fa), this.py(this.v15fa), q.x, q.y) <
                dist2(this.px(this.v15fe), this.py(this.v15fe), q.x, q.y)
              ) {
                pc = "FIM";
                break;
              }
              if (
                dist2(this.px(this.v1606), this.py(this.v1606), q.x, q.y) <
                dist2(this.px(this.v1602), this.py(this.v1602), q.x, q.y)
              ) {
                pc = "FIM";
                break;
              }
            }
            this.v1526 = 2;
            this.v15ca = s(q.x);
            this.v15ce = s(q.y);
            this.v14f2 = this.v14da;
          }
          this.v152a = 0;
          this.v152e = 0;
          bp110 = false;
          pc = "L437e0";
          break;
        }
        case "L437e0": {
          if (this.mesmoPonto(ea, ee) || this.a14(ee, 2) === 100) pc = "L438c4";
          else pc = "L43d38";
          break;
        }
        case "L438c4": {
          this.v152a = 1;
          this.bissetrizEm(this.ant(ee), ee, ee, this.prox(ee));
          if ((this.cod(this.v15fa) !== 1 && this.colinear()) || this.cod(this.v1602) === 1) {
            ee = this.ant(ee);
            pc = "L437e0";
            break;
          }
          this.v15ba = s(this.px(ee));
          this.v15be = s(this.py(ee));
          this.v1502 = this.v150a;
          if (this.cod(this.v15fa) === 1 && this.cod(this.v1602) === 1) bp110 = true;
          if (this.cod(this.v1602) === 1 || this.cod(this.v15fa) === 1) {
            const q = this.cantoLivre();
            this.v152a = 3;
            this.v15ba = s(q.x);
            this.v15be = s(q.y);
            this.v1502 = this.v14da;
            this.v1612 = ee - this.v15fe;
            ee = this.v15fe;
          }
          pc = "L441b6";
          break;
        }
        case "L43d38": {
          this.poeSeg(-ee, this.a14(ee, 0), this.a14(ee, 1));
          this.v1612 = ee;
          let achou = false;
          for (let g = 0; g <= this.laje.n + 1; g++) {
            ee = this.ant(ee);
            if (ee === ea) break;
            if (sg.get(sg.n, 3) === this.a14(ee, 1) && sg.get(sg.n, 2) === this.a14(ee, 0)) {
              achou = true;
              break;
            }
          }
          if (!achou) {
            ee = this.v1612;
            sg.n -= 1;
            pc = "L438c4";
            break;
          }
          this.v1612 = this.v1612 - ee;
          this.poeSeg(-ee, this.a14(ee, 0), this.a14(ee, 1));
          this.v15ba = this.a14(ee, 0);
          this.v15be = this.a14(ee, 1);
          this.v1502 = this.a14(ee, 2);
          this.v152a = 2;
          pc = "L441b6";
          break;
        }
        case "L441b6": {
          if (this.v152e !== 0) {
            pc = "L44bca";
            break;
          }
          bp96 = false;
          pc = "L441f1";
          break;
        }
        case "L441f1": {
          if (this.mesmoPonto(ea, f2) || this.a14(f2, 2) === 100) pc = "L442d5";
          else pc = "L44748";
          break;
        }
        case "L442d5": {
          this.v152e = 1;
          this.bissetrizEm(this.ant(f2), f2, f2, this.prox(f2));
          if ((this.cod(this.v1602) !== 1 && this.colinear()) || this.cod(this.v15fa) === 1) {
            f2 = this.prox(f2);
            pc = "L441f1";
            break;
          }
          this.v15c2 = s(this.px(f2));
          this.v15c6 = s(this.py(f2));
          this.v14fa = this.v150a;
          if (this.cod(this.v15fa) === 1 && this.cod(this.v1602) === 1) bp96 = true;
          if (this.cod(this.v1602) === 1 || this.cod(this.v15fa) === 1) {
            const q = this.cantoLivre();
            this.v152e = 3;
            this.v15c2 = s(q.x);
            this.v15c6 = s(q.y);
            this.v14fa = this.v14da;
            this.v1616 = this.v1602 - f2;
            f2 = this.v1602;
          }
          pc = "L44bca";
          break;
        }
        case "L44748": {
          this.poeSeg(-f2, this.a14(f2, 0), this.a14(f2, 1));
          this.v1616 = f2;
          let achou = false;
          for (let g = 0; g <= this.laje.n + 1; g++) {
            f2 = this.prox(f2);
            if (f2 === ea) break;
            if (sg.get(sg.n, 3) === this.a14(f2, 1) && sg.get(sg.n, 2) === this.a14(f2, 0)) {
              achou = true;
              break;
            }
          }
          if (!achou) {
            f2 = this.v1616;
            sg.n -= 1;
            pc = "L442d5";
            break;
          }
          this.v1616 = f2 - this.v1616;
          this.poeSeg(-f2, this.a14(f2, 0), this.a14(f2, 1));
          this.v15c2 = this.a14(f2, 0);
          this.v15c6 = this.a14(f2, 1);
          this.v14fa = this.a14(f2, 2);
          this.v152e = 2;
          pc = "L44bca";
          break;
        }
        case "L44bca": {
          if (
            (ee >= f2 && ea >= f2 && ea <= ee) ||
            (ee <= f2 && ea >= f2 && ea >= ee) ||
            (ee <= f2 && ea <= f2 && ea <= ee)
          ) {
            pc = "L48a96";
            break;
          }
          if (bp96) {
            pc = "L45a9c";
            break;
          }
          // charneira do lado seguinte
          x164 = this.v15ca;
          y165 = this.v15ce;
          a14e2 = this.v14f2;
          x165 = this.v15c2;
          y166 = this.v15c6;
          a14ea = this.v14fa;
          {
            const r = this.retas(x164, y165, a14e2, x165, y166, a14ea);
            bp96 = r.nao;
            x157 = r.x;
            y158 = r.y;
          }
          if (bp96) {
            pc = "L45a9c";
            break;
          }
          if (this.v152e === 2 && this.a14(f2, 2) !== 100) {
            const kv = Math.round(f2 - this.v1616);
            let r = intersecaoSegmentos(
              this.v15ca,
              this.v15ce,
              x157,
              y158,
              this.v15c2,
              this.v15c6,
              this.px(kv),
              this.py(kv),
              this.t,
            );
            let volta =
              (Math.abs(this.v15ce - y158) < tol && Math.abs(this.v15ca - x157) < tol) || r.ok;
            if (!volta) {
              r = intersecaoSegmentos(
                this.v15ca,
                this.v15ce,
                x157,
                y158,
                this.v15c2,
                this.v15c6,
                this.px(f2),
                this.py(f2),
                this.t,
              );
              volta = r.ok;
            }
            if (volta) {
              f2 = f2 - this.v1616;
              sg.n -= 2;
              pc = "L442d5";
              break;
            }
          }
          // L_45084: a charneira que vem depois de f2
          fe = f2 + 1;
          for (let g = 0; g <= this.laje.n + 1; g++) {
            if (fe === this.N0) fe = 1;
            if (this.a14(fe, 0) !== -100 || this.a14(fe, 2) !== 100) break;
            fe += 1;
          }
          if (this.a14(fe, 2) === 100) {
            if (this.cod(fe) === 1) {
              pc = "L45a9c";
              break;
            }
            this.v15fe = fe;
            this.v15fa = this.ant(fe);
            this.v1602 = fe;
            this.v1606 = this.prox(fe);
            this.bissetriz();
            x164 = this.px(fe);
            y165 = this.py(fe);
            a14e2 = this.v150a;
          } else {
            x164 = this.a14(fe, 0);
            y165 = this.a14(fe, 1);
            a14e2 = this.a14(fe, 2);
          }
          {
            const r = this.retas(x164, y165, a14e2, x165, y166, a14ea);
            if (
              dist2(r.x, r.y, this.v15c2, this.v15c6) + tol <
                dist2(x157, y158, this.v15c2, this.v15c6) &&
              dist2(r.x, r.y, x157, y158) < dist2(this.v15c2, this.v15c6, x157, y158)
            ) {
              x153 = r.x;
              y154 = r.y;
              if (this.a14(fe, 2) === 100) {
                fe += 1;
              } else {
                fa = fe;
                for (let g = 0; g <= this.laje.n + 1; g++) {
                  fa = this.prox(fa);
                  if (this.mesmoPonto(fa, fe)) {
                    fe = fa + 1;
                    break;
                  }
                }
              }
              if (fe === this.N0) fe = 1;
              if (this.a14(fe, 2) === 100) {
                if (this.cod(fe) === 1) {
                  bp96 = true;
                  pc = "L45a9c";
                  break;
                }
                this.v15fe = fe;
                this.v15fa = this.ant(fe);
                this.v1602 = fe;
                this.v1606 = this.prox(fe);
                this.bissetriz();
                x165 = this.px(fe);
                y166 = this.py(fe);
                a14ea = this.v150a;
              } else {
                x165 = this.a14(fe, 0);
                y166 = this.a14(fe, 1);
                a14ea = this.a14(fe, 2);
              }
              const r2 = this.retas(x164, y165, a14e2, x165, y166, a14ea);
              if (dist2(r2.x, r2.y, x164, y165) + tol >= dist2(x153, y154, x164, y165)) bp96 = true;
              else if (dist2(r2.x, r2.y, x153, y154) > dist2(x164, y165, x153, y154)) bp96 = true;
            }
          }
          pc = "L45a9c";
          break;
        }
        case "L45a9c": {
          if (bp110) {
            pc = "L46893";
            break;
          }
          x164 = this.v15ba;
          y165 = this.v15be;
          a14e2 = this.v1502;
          x165 = this.v15ca;
          y166 = this.v15ce;
          a14ea = this.v14f2;
          {
            const r = this.retas(x164, y165, a14e2, x165, y166, a14ea);
            bp110 = r.nao;
            x158 = r.x;
            y159 = r.y;
          }
          if (bp110) {
            pc = "L46893";
            break;
          }
          if (this.v152a === 2 && this.a14(ee, 2) !== 100) {
            const kv = Math.round(ee + this.v1612);
            let r = intersecaoSegmentos(
              this.v15ca,
              this.v15ce,
              x158,
              y159,
              this.v15ba,
              this.v15be,
              this.px(kv),
              this.py(kv),
              this.t,
            );
            let volta =
              (Math.abs(this.v15ce - y159) < tol && Math.abs(this.v15ca - x158) < tol) || r.ok;
            if (!volta) {
              r = intersecaoSegmentos(
                this.v15ca,
                this.v15ce,
                x158,
                y159,
                this.v15ba,
                this.v15be,
                this.px(ee),
                this.py(ee),
                this.t,
              );
              volta = r.ok;
            }
            if (volta) {
              ee = ee + this.v1612;
              if (this.v152e === 2) this.trocaUltimos();
              sg.n -= 2;
              pc = "L438c4";
              break;
            }
          }
          // L_45e7b: a charneira que vem antes de ee
          fe = ee - 1;
          for (let g = 0; g <= this.laje.n + 1; g++) {
            if (fe === 0) fe = this.laje.n;
            if (this.a14(fe, 0) !== -100 || this.a14(fe, 2) !== 100) break;
            fe -= 1;
          }
          if (this.a14(fe, 2) === 100) {
            const fa1 = this.ant(fe);
            if (this.cod(fa1) === 1) {
              pc = "L46893";
              break;
            }
            this.v15fe = fe;
            this.v15fa = fa1;
            this.v1602 = fe;
            this.v1606 = this.prox(fe);
            this.bissetriz();
            x165 = this.px(fe);
            y166 = this.py(fe);
            a14ea = this.v150a;
          } else {
            x165 = this.a14(fe, 0);
            y166 = this.a14(fe, 1);
            a14ea = this.a14(fe, 2);
          }
          {
            const r = this.retas(x164, y165, a14e2, x165, y166, a14ea);
            if (
              dist2(r.x, r.y, this.v15ba, this.v15be) + tol <
                dist2(x158, y159, this.v15ba, this.v15be) &&
              dist2(r.x, r.y, x158, y159) < dist2(this.v15ba, this.v15be, x158, y159)
            ) {
              x153 = r.x;
              y154 = r.y;
              if (this.a14(fe, 2) === 100) {
                fe -= 1;
              } else {
                fa = fe;
                for (let g = 0; g <= this.laje.n + 1; g++) {
                  fa = this.ant(fa);
                  if (this.mesmoPonto(fa, fe)) {
                    fe = fa - 1;
                    break;
                  }
                }
              }
              if (fe === 0) fe = this.laje.n;
              if (this.a14(fe, 2) === 100) {
                const fa1 = this.ant(fe);
                if (this.cod(fa1) === 1) {
                  bp110 = true;
                  pc = "L46893";
                  break;
                }
                this.v15fe = fe;
                this.v15fa = fa1;
                this.v1602 = fe;
                this.v1606 = this.prox(fe);
                this.bissetriz();
                x164 = this.px(fe);
                y165 = this.py(fe);
                a14e2 = this.v150a;
              } else {
                x164 = this.a14(fe, 0);
                y165 = this.a14(fe, 1);
                a14e2 = this.a14(fe, 2);
              }
              const r2 = this.retas(x164, y165, a14e2, x165, y166, a14ea);
              if (dist2(r2.x, r2.y, x165, y166) + tol >= dist2(x153, y154, x165, y166))
                bp110 = true;
              else if (dist2(r2.x, r2.y, x153, y154) > dist2(x165, y166, x153, y154)) bp110 = true;
            }
          }
          pc = "L46893";
          break;
        }
        case "L46893": {
          if (bp96 && bp110) {
            pc = "L48a96";
            break;
          }
          if (this.m1342[ea] === 1 && this.v1526 === 1) {
            let e2 = 1;
            let sai = false;
            for (; e2 <= sg.n; e2++) {
              if (sg.get(e2, 0) !== -ea) continue;
              const d = dist2(sg.get(e2, 2), sg.get(e2, 3), this.v15ca, this.v15ce);
              const c144 = dist2(x157, y158, this.v15ca, this.v15ce) + tol >= d;
              if (bp96 || c144) {
                const c146 = dist2(x158, y159, this.v15ca, this.v15ce) + tol >= d;
                if (bp110 || c146) {
                  sai = true;
                  break;
                }
              }
            }
            if (sai) {
              pc = "FIM";
              break;
            }
          }
          const iguais = Math.abs(y158 - y159) < tol && Math.abs(x157 - x158) < tol;
          if (!bp96 && !bp110 && iguais) {
            // as duas charneiras se encontram no mesmo ponto
            if (this.corta(this.v15c2, this.v15c6, x157, y158).ok) {
              pc = "FIM";
              break;
            }
            if (this.corta(this.v15ba, this.v15be, x157, y158).ok) {
              pc = "FIM";
              break;
            }
            this.gravaLado(this.v152e, f2, this.v15c2, this.v15c6, x157, y158);
            this.gravaLado(this.v152a, ee, this.v15ba, this.v15be, x157, y158);
            this.gravaVertice(ea, x157, y158);
            this.v15ca = s(x157);
            this.v15ce = s(y158);
            this.v15fe = ee;
            ee = this.ant(ee);
            this.v15fa = ee;
            if (f2 === ee) {
              pc = "FIM";
              break;
            }
            this.v1602 = f2;
            f2 = this.prox(f2);
            this.v1606 = f2;
            pc = f2 === ee ? "FIM" : "L432b5";
            break;
          }
          pc = "L473a3";
          break;
        }
        case "L473a3": {
          const c14e =
            dist2(x157, y158, this.v15ca, this.v15ce) <= dist2(x158, y159, this.v15ca, this.v15ce);
          if (!((bp110 || c14e) && !bp96)) {
            pc = "L47f32";
            break;
          }
          // avança pela charneira do lado seguinte
          if (!(Math.abs(this.v15ce - y158) < tol && Math.abs(this.v15ca - x157) < tol)) {
            let r = this.corta(this.v15ca, this.v15ce, x157, y158);
            if (!bp110 && r.ok) {
              bp96 = true;
              pc = "L47f32";
              break;
            }
            if (r.ok) {
              pc = "FIM";
              break;
            }
            r = this.corta(this.v15c2, this.v15c6, x157, y158);
            if (!bp110 && r.ok) {
              bp96 = true;
              pc = "L47f32";
              break;
            }
            if (r.ok) {
              pc = "FIM";
              break;
            }
          }
          if (this.a14(ee, 2) !== 100 && this.v152a !== 1) {
            if (this.v152e === 2) this.trocaUltimos();
            sg.n -= 2;
          }
          this.anulaEncontro(ea, ee, f2, x157, y158);
          this.gravaLado(this.v152e, f2, this.v15c2, this.v15c6, x157, y158);
          this.gravaVertice(ea, x157, y158);
          if (this.v15ce === y158 && this.v15ca === x157) sg.n -= 1;
          this.v15ca = s(x157);
          this.v15ce = s(y158);
          if (this.v152a !== 1) ee = ee + this.v1612;
          this.v15fa = ee;
          this.v15fe = this.prox(ee);
          this.v1602 = f2;
          f2 = this.prox(f2);
          this.v1606 = f2;
          pc = f2 === ee ? "FIM" : "L432b5";
          break;
        }
        case "L47f32": {
          const c156 =
            dist2(x157, y158, this.v15ca, this.v15ce) > dist2(x158, y159, this.v15ca, this.v15ce);
          if (!((bp96 || c156) && !bp110)) {
            pc = "L48a96";
            break;
          }
          // avança pela charneira do lado anterior
          if (!(Math.abs(this.v15ce - y159) < tol && Math.abs(this.v15ca - x158) < tol)) {
            let r = this.corta(this.v15ca, this.v15ce, x158, y159);
            if (!bp96 && r.ok) {
              bp110 = true;
              pc = "L473a3";
              break;
            }
            if (r.ok) {
              pc = "FIM";
              break;
            }
            r = this.corta(this.v15ba, this.v15be, x158, y159);
            if (!bp96 && r.ok) {
              bp110 = true;
              pc = "L473a3";
              break;
            }
            if (r.ok) {
              pc = "FIM";
              break;
            }
          }
          if (this.a14(f2, 2) !== 100 && this.v152e !== 1) sg.n -= 2;
          this.anulaEncontro(ea, ee, f2, x158, y159);
          this.gravaLado(this.v152a, ee, this.v15ba, this.v15be, x158, y159);
          this.gravaVertice(ea, x158, y159);
          if (this.v15ce === y159 && this.v15ca === x158) sg.n -= 1;
          this.v15ca = s(x158);
          this.v15ce = s(y159);
          if (this.v152e !== 1) f2 = f2 - this.v1616;
          this.v15fe = ee;
          ee = this.ant(ee);
          this.v15fa = ee;
          this.v1602 = this.ant(f2);
          this.v1606 = f2;
          pc = f2 === ee ? "FIM" : "L432b5";
          break;
        }
        case "L48a96": {
          if (this.v152a !== 1) ee = ee + this.v1612;
          if (this.v152e !== 1) f2 = f2 - this.v1616;
          if (this.v152a === 2) sg.n -= 2;
          if (this.v152e === 2) sg.n -= 2;
          if (
            ea === f2 ||
            ea === ee ||
            (ee >= f2 && ea > f2 && ea < ee) ||
            (ee <= f2 && ea > f2 && ea > ee) ||
            (ee <= f2 && ea < f2 && ea < ee)
          ) {
            pc = "FIM";
            break;
          }
          // todos os bordos de f2 até ee livres: raio de 1000 m pela bissetriz
          let todosLivres = true;
          let k = f2;
          for (let g = 0; g <= this.laje.n + 1; g++) {
            if (this.cod(k) !== 1) {
              todosLivres = false;
              break;
            }
            k = this.prox(k);
            if (k === ee) break;
          }
          if (todosLivres) {
            const d = raio(this.v14f2, eps);
            const xf = this.v15ca + d.dx;
            const yf = this.v15ce + d.dy;
            if (this.v1526 === 1) {
              this.poeSeg(-ea, xf, yf);
              this.m1342[ea] = 1;
              this.v1526 = 2;
            } else {
              this.poeSeg(this.v15ca, xf, yf, this.v15ce);
            }
          } else if (this.v1526 > 1) {
            this.raios.push({ x: this.v15ca, y: this.v15ce, a: s(this.v14f2) });
          }
          pc = "FIM";
          break;
        }
      }
      if (pc === "FIM") return;
      // mantém fa/fe usados (sem efeito: só para o leitor do porte)
      void fa;
    }
    throw new Error(`Padrão de charneiras da LAJEMONT não converge no vértice ${f10}`);
  }

  /** V_0f18$ = "NAO" do último S_15189 feito pelo L_4dbbe. */
  private ultimoNao = false;

  /** Grava o segmento de um lado (v152a/v152e): do vértice (código 1, marca A_1342)
   *  ou do ponto corrente desse lado até o encontro. */
  private gravaLado(marca: number, vert: number, x: number, y: number, xf: number, yf: number) {
    if (marca === 1) {
      this.poeSeg(-vert, xf, yf);
      this.m1342[vert] = 1;
    } else {
      this.poeSeg(x, xf, yf, y);
    }
  }

  /** Grava o segmento do vértice de partida (v1526 = 1) ou do ponto corrente. */
  private gravaVertice(ea: number, xf: number, yf: number) {
    if (this.v1526 === 1) {
      this.poeSeg(-ea, xf, yf);
      this.m1342[ea] = 1;
      this.v1526 = 2;
    } else {
      this.poeSeg(this.v15ca, xf, yf, this.v15ce);
    }
  }

  /** O encontro (x, y) fica antes do encontro guardado do vértice: anula-o (100) e
   *  os vizinhos que o compartilham (L_47707, L_48269). */
  private anulaEncontro(ea: number, ee: number, f2: number, x: number, y: number) {
    if (!(this.a14(ea, 2) !== 100 && this.v1526 === 1)) return;
    if (
      dist2(x, y, this.v15ca, this.v15ce) + this.tol <
      dist2(this.a14(ea, 0), this.a14(ea, 1), this.v15ca, this.v15ce)
    ) {
      this.aa[ea] = 100;
      if (this.mesmoPonto(ee, ea)) this.aa[ee] = 100;
      if (this.mesmoPonto(f2, ea)) this.aa[f2] = 100;
    }
  }

  /** Limpeza depois do laço (L_49190 em diante): um segmento por vértice (o mais
   *  curto), pontas coladas, colineares fundidos, cortes nas interseções, pontas
   *  soltas viram raios, raios estendidos até outro raio e charneiras que faltam. */
  private posProcessa(inicio: "L49190" | "L4b11c") {
    const sg = this.seg;
    const { s, tol, eps } = this;
    let pc: "L49190" | "L49df3" | "L4b11c" | "L4ba34" | "L4bf37" | "L4c276" | "FIM" = inicio;
    for (let passos = 0; passos < 1000; passos++) {
      switch (pc) {
        case "L49190": {
          // um segmento por vértice não livre: fica o mais curto
          let i = 1;
          while (!(sg.n <= i)) {
            const a0 = sg.get(i, 0);
            if (a0 < 0) {
              const vfa = Math.round(-a0);
              const vfe = this.ant(vfa);
              if (!(this.cod(vfe) === 1 || this.cod(vfa) === 1)) {
                for (let g = 0; g < 10000; g++) {
                  if (sg.n <= i) break;
                  let j = i + 1;
                  let removeu = false;
                  for (; j <= sg.n; j++) {
                    if (sg.get(j, 0) !== sg.get(i, 0)) continue;
                    const vx = this.px(vfa);
                    const vy = this.py(vfa);
                    if (
                      dist2(vx, vy, sg.get(i, 2), sg.get(i, 3)) >
                      dist2(vx, vy, sg.get(j, 2), sg.get(j, 3))
                    )
                      sg.troca(i, j);
                    sg.remove(j);
                    removeu = true;
                    break;
                  }
                  if (!removeu) break;
                }
              }
            }
            i += 1;
          }
          // L_497ca: pontas a menos de V_133a ficam iguais
          i = 1;
          do {
            let x5 = sg.get(i, 0);
            let y5 = sg.get(i, 1);
            let x6 = sg.get(i, 2);
            let y6 = sg.get(i, 3);
            if (Math.abs(x5 - x6) < tol) {
              sg.set(i, 2, sg.get(i, 0));
              x6 = x5;
            }
            if (Math.abs(y5 - y6) < tol) {
              sg.set(i, 3, sg.get(i, 1));
              y6 = y5;
            }
            for (let j = i + 1; sg.n >= j; j++) {
              const x3 = sg.get(j, 0);
              const y3 = sg.get(j, 1);
              const x4 = sg.get(j, 2);
              const y4 = sg.get(j, 3);
              if (Math.abs(x5 - x3) < tol) sg.set(j, 0, sg.get(i, 0));
              if (Math.abs(x5 - x4) < tol) sg.set(j, 2, sg.get(i, 0));
              if (Math.abs(x6 - x3) < tol) sg.set(j, 0, sg.get(i, 2));
              if (Math.abs(x6 - x4) < tol) sg.set(j, 2, sg.get(i, 2));
              if (Math.abs(y5 - y3) < tol) sg.set(j, 1, sg.get(i, 1));
              if (Math.abs(y5 - y4) < tol) sg.set(j, 3, sg.get(i, 1));
              if (Math.abs(y6 - y3) < tol) sg.set(j, 1, sg.get(i, 3));
              if (Math.abs(y6 - y4) < tol) sg.set(j, 3, sg.get(i, 3));
            }
            x5 = 0;
            y5 = 0;
            i += 1;
          } while (!(sg.n < i));
          pc = "L49df3";
          break;
        }
        case "L49df3": {
          this.fundeColineares();
          this.bp20e = 0;
          pc = "L4b11c";
          break;
        }
        case "L4b11c": {
          this.cortaNasIntersecoes();
          pc = this.laje.tipo === 1 ? "FIM" : "L4ba34";
          break;
        }
        case "L4ba34": {
          // pontas soltas (que não tocam vértice nem outro segmento) viram raios
          let i = 1;
          let zerou = false;
          while (sg.n >= i) {
            if (sg.get(i, 0) >= 0) {
              if (!this.tocaVertice(sg.get(i, 0), sg.get(i, 1))) {
                if (this.soltaPonta(i, 2, sg.get(i, 0), sg.get(i, 1))) {
                  zerou = true;
                  break;
                }
              }
              if (!this.tocaVertice(sg.get(i, 2), sg.get(i, 3))) {
                if (this.soltaPonta(i, 0, sg.get(i, 2), sg.get(i, 3))) {
                  zerou = true;
                  break;
                }
              }
            }
            i += 1;
          }
          pc = zerou && sg.n > this.N0 ? "L49df3" : "L4bf37";
          break;
        }
        case "L4bf37": {
          // segmentos de comprimento nulo
          for (let i = 1; sg.n >= i;) {
            if (
              Math.abs(sg.get(i, 1) - sg.get(i, 3)) < tol &&
              Math.abs(sg.get(i, 0) - sg.get(i, 2)) < tol
            ) {
              sg.n -= 1;
              if (sg.n < i) break;
              for (let j = i; ;) {
                sg.copia(j, j + 1);
                j += 1;
                if (sg.n < j) break;
              }
              i = 1;
              continue;
            }
            i += 1;
          }
          if (this.bp20e === 1 || this.bp20e === 2) {
            pc = "FIM";
            break;
          }
          pc = "L4c276";
          break;
        }
        case "L4c276": {
          this.estendeRaios();
          if (this.charneirasQueFaltam()) {
            pc = "L4b11c";
            break;
          }
          pc = "FIM";
          break;
        }
      }
      if (pc === "FIM") return;
    }
    void s;
    void eps;
    throw new Error("Limpeza do padrão de charneiras da LAJEMONT não converge");
  }

  private tocaVertice(x: number, y: number) {
    for (let k = 1; k <= this.laje.n; k++) {
      if (perto(this.px(k), this.py(k), x, y, this.tol)) return true;
    }
    return false;
  }

  /** L_4ef1b (LAJEMONT.BAS:7509-7557): a ponta (x, y) do segmento i não toca nenhum
   *  outro segmento: o segmento sai da tabela e vira raio a partir da outra ponta
   *  (coluna `c`), na direção da ponta solta. Devolve true se removeu. */
  private soltaPonta(i: number, c: 0 | 2, x: number, y: number) {
    const sg = this.seg;
    const { tol } = this;
    let toques = 1;
    let j = 1;
    if (j === i) j += 1;
    while (sg.n >= j) {
      const p = inicioSegmento(this.laje, sg, j);
      if (perto(x, y, p.x, p.y, tol)) toques += 1;
      if (perto(x, y, sg.get(j, 2), sg.get(j, 3), tol)) toques += 1;
      j += 1;
      if (j === i) j += 1;
      if (toques >= 2) break;
    }
    if (toques >= 2) return false;
    let x5 = sg.get(i, 0);
    let y5 = sg.get(i, 1);
    let x6 = sg.get(i, 2);
    let y6 = sg.get(i, 3);
    if (c === 2) {
      [x5, x6] = [x6, x5];
      [y5, y6] = [y6, y5];
    }
    this.raios.push({ x: sg.get(i, c), y: sg.get(i, c + 1), a: this.s(direcao(x5, y5, x6, y6)) });
    sg.remove(i);
    return true;
  }

  /** L_49df3..L_4b0c6: funde segmentos colineares que se sobrepõem. */
  private fundeColineares() {
    const sg = this.seg;
    const { s, tol } = this;
    const mn = (a: number, b: number) => menor(s, a, b);
    const mx = (a: number, b: number) => maior(s, a, b);
    let i = 1;
    while (!(sg.n <= i)) {
      const p = inicioSegmento(this.laje, sg, i);
      const x5 = p.x;
      const y5 = p.y;
      const x6 = sg.get(i, 2);
      const y6 = sg.get(i, 3);
      let fundiu = false;
      for (let j = i + 1; sg.n >= j; j++) {
        if (sg.get(j, 0) < 0 && sg.get(i, 0) < 0 && sg.get(i, 0) !== sg.get(j, 0)) continue;
        const q = inicioSegmento(this.laje, sg, j);
        const x3 = q.x;
        const y3 = q.y;
        const x4 = sg.get(j, 2);
        const y4 = sg.get(j, 3);
        if (mn(x5, x6) > mx(x3, x4) || mx(x5, x6) < mn(x3, x4)) continue;
        if (mn(y5, y6) > mx(y3, y4) || mx(y5, y6) < mn(y3, y4)) continue;
        if ((x5 !== x6 && x3 === x4) || (x3 !== x4 && x5 === x6)) continue;
        if (x5 !== x4 && x3 === x4 && x5 === x6) continue;
        let xa: number;
        let ya: number;
        let xb: number;
        let yb: number;
        if (x5 === x6) {
          xa = x5;
          xb = x6;
          ya = mn(mn(y5, y6), mn(y3, y4));
          yb = mx(mx(y5, y6), mx(y3, y4));
        } else {
          if (Math.abs((y6 - y5) / (x6 - x5) - (y4 - y3) / (x4 - x3)) > tol) continue;
          const pontaComum =
            (y6 === y4 && x6 === x4) ||
            (y6 === y3 && x6 === x3) ||
            (y5 === y4 && x5 === x4) ||
            (y5 === y3 && x5 === x3);
          if (!pontaComum) {
            if (x4 === x5) continue;
            if (Math.abs((y6 - y5) / (x6 - x5) - (y4 - y5) / (x4 - x5)) > tol) continue;
          }
          xa = x5;
          ya = y5;
          if (x6 < xa) [xa, ya] = [x6, y6];
          if (x3 < xa) [xa, ya] = [x3, y3];
          if (x4 < xa) [xa, ya] = [x4, y4];
          xb = x5;
          yb = y5;
          if (x6 > xb) [xb, yb] = [x6, y6];
          if (x3 > xb) [xb, yb] = [x3, y3];
          if (x4 > xb) [xb, yb] = [x4, y4];
        }
        const va = this.verticeEm(xa, ya);
        if (va !== 0) {
          sg.set(i, 0, -va);
          sg.set(i, 1, 0);
          sg.set(i, 2, xb);
          sg.set(i, 3, yb);
        } else {
          const vb = this.verticeEm(xb, yb);
          if (vb !== 0) {
            sg.set(i, 0, -vb);
            sg.set(i, 1, 0);
            sg.set(i, 2, xa);
            sg.set(i, 3, ya);
          } else {
            if (xa < 0) {
              [xa, xb] = [xb, xa];
              [ya, yb] = [yb, ya];
            }
            sg.set(i, 0, xa);
            sg.set(i, 1, ya);
            sg.set(i, 2, xb);
            sg.set(i, 3, yb);
          }
        }
        sg.remove(j);
        fundiu = true;
        break;
      }
      i = fundiu ? 1 : i + 1;
    }
  }

  /** Índice do vértice com essas coordenadas exatas (0 se nenhum). */
  private verticeEm(x: number, y: number) {
    for (let k = 1; k <= this.N0; k++) if (this.py(k) === y && this.px(k) === x) return k;
    return 0;
  }

  /** L_4b11c..L_4b972: corta os segmentos uns nos outros nas interseções internas. */
  private cortaNasIntersecoes() {
    const sg = this.seg;
    const { tol } = this;
    let i = 1;
    do {
      const p = inicioSegmento(this.laje, sg, i);
      const x5 = p.x;
      const y5 = p.y;
      let x6 = sg.get(i, 2);
      let y6 = sg.get(i, 3);
      let j = i + 1;
      do {
        const q = inicioSegmento(this.laje, sg, j);
        const x4 = sg.get(j, 2);
        const y4 = sg.get(j, 3);
        const r = intersecaoSegmentos(x5, y5, x6, y6, q.x, q.y, x4, y4, this.t);
        if (r.ok) {
          if (!(perto(r.x, r.y, x6, y6, tol) || perto(r.x, r.y, x5, y5, tol))) {
            this.poeSeg(r.x, sg.get(i, 2), sg.get(i, 3), r.y);
            sg.set(i, 2, r.x);
            sg.set(i, 3, r.y);
            x6 = r.x;
            y6 = r.y;
          }
          if (!(perto(r.x, r.y, x4, y4, tol) || perto(r.x, r.y, q.x, q.y, tol))) {
            this.poeSeg(r.x, sg.get(j, 2), sg.get(j, 3), r.y);
            sg.set(j, 2, r.x);
            sg.set(j, 3, r.y);
          }
        }
        j += 1;
      } while (!(sg.n < j));
      i += 1;
    } while (!(sg.n <= i));
  }

  /** L_4c276..L_4cf70: raios cuja origem toca um segmento, sem repetição, cortados
   *  no encontro mais próximo com outro raio (só entram se encontram outro). */
  private estendeRaios() {
    const sg = this.seg;
    const { tol, eps } = this;
    const r = this.raios;
    for (let i = 0; i < r.length;) {
      const ri = r[i];
      if (!ri) break;
      let toca = false;
      for (let k = 1; k <= sg.n; k++) {
        if (sg.get(k, 0) > 0 && perto(sg.get(k, 0), sg.get(k, 1), ri.x, ri.y, tol)) toca = true;
        if (perto(sg.get(k, 2), sg.get(k, 3), ri.x, ri.y, tol)) toca = true;
        if (toca) break;
      }
      if (toca) {
        i += 1;
      } else {
        const ultimo = r[r.length - 1];
        if (ultimo && i < r.length - 1) r[i] = ultimo;
        r.pop();
      }
    }
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length;) {
        const a = r[i];
        const b = r[j];
        if (a && b && perto(a.x, a.y, b.x, b.y, tol)) {
          const ultimo = r[r.length - 1];
          if (ultimo && j < r.length - 1) r[j] = ultimo;
          r.pop();
        } else {
          j += 1;
        }
      }
    }
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      if (!a) continue;
      const da = raio(a.a, eps);
      let x6 = da.dx + a.x;
      let y6 = da.dy + a.y;
      let achou = false;
      for (let j = 0; j < r.length; j++) {
        const b = r[j];
        if (j === i || !b) continue;
        const db = raio(b.a, eps);
        const q = intersecaoSegmentos(a.x, a.y, x6, y6, b.x, b.y, db.dx + b.x, db.dy + b.y, this.t);
        if (q.ok && dist2(x6, y6, a.x, a.y) > dist2(q.x, q.y, a.x, a.y)) {
          x6 = q.x;
          y6 = q.y;
          achou = true;
        }
      }
      if (achou) this.poeSeg(a.x, x6, y6, a.y);
    }
    this.raios = [];
  }

  /** L_4cf8e..L_4d81d: vértice não reto e sem segmento ganha a charneira pela
   *  bissetriz até o primeiro segmento que ela corta. Devolve true se gravou alguma
   *  (o original volta então ao corte nas interseções, L_4b11c). */
  private charneirasQueFaltam() {
    const sg = this.seg;
    const { tol, eps } = this;
    for (const passada of [1, 2]) {
      for (let f10 = 1; f10 <= this.laje.n; f10++) {
        if (passada === 1 && this.a14(f10, 0) === -100) continue;
        let tem = false;
        for (let k = 1; k <= sg.n; k++) {
          if (sg.get(k, 0) < 0) {
            if (sg.get(k, 0) === -f10) {
              tem = true;
              break;
            }
          } else if (perto(sg.get(k, 0), sg.get(k, 1), this.px(f10), this.py(f10), tol)) {
            tem = true;
            break;
          }
          if (perto(sg.get(k, 2), sg.get(k, 3), this.px(f10), this.py(f10), tol)) {
            tem = true;
            break;
          }
        }
        if (tem) continue;
        this.bissetrizEm(this.ant(f10), f10, f10, this.prox(f10));
        if (this.cod(this.v1602) === 1 || this.cod(this.v15fa) === 1) continue;
        sg.n += 1;
        sg.set(sg.n, 0, -f10);
        const x5 = this.px(f10);
        const y5 = this.py(f10);
        const d = raio(this.v150a, eps);
        let x6 = x5 + d.dx;
        let y6 = y5 + d.dy;
        this.v1522 = 0;
        this.bp20e = 1;
        for (let g = 0; g < 1000; g++) {
          const r = this.corta(x5, y5, x6, y6);
          if (!r.ok) break;
          sg.set(sg.n, 2, r.x);
          sg.set(sg.n, 3, r.y);
          x6 = r.x;
          y6 = r.y;
          this.v1522 = this.v15e2;
        }
      }
    }
    return this.bp20e === 1;
  }

  /** S_15790 (LAJEMONT.BAS:2276-2590): laje pré-moldada (tipo 1). Cada vértice manda
   *  um raio na direção das nervuras (e, se não corta nada, no sentido oposto) até o
   *  contorno; os raios ficam aos pares e as faixas resultantes caem nos bordos
   *  extremos. */
  private preMoldada() {
    const sg = this.seg;
    const { s, tol, eps } = this;
    for (let f10 = 1; f10 <= this.laje.n; f10++) {
      if (this.verticeReto(f10)) this.ax[f10] = -100;
    }
    this.v1536 = 1;
    const ang = (this.laje.anguloNervuras * PI) / 180;
    const d = raio(ang, eps);
    for (let f10 = 1; f10 <= this.laje.n; f10++) {
      sg.n += 1;
      sg.set(sg.n, 0, -f10);
      const x5 = this.px(f10);
      const y5 = this.py(f10);
      let x6 = x5 + d.dx;
      let y6 = y5 + d.dy;
      let bp2c = 0; // L_BP2c%: 2 = o raio cortou algo
      let volta = 0; // V_0f14!: 1 = já no sentido oposto
      this.v1522 = sg.n;
      for (let g = 0; g < 1000; g++) {
        // L_15ce6: estende o raio enquanto corta
        for (let h = 0; h < 1000; h++) {
          const r = this.corta(x5, y5, x6, y6);
          if (!((this.py(f10) !== r.y || this.px(f10) !== r.x) && r.ok)) break;
          sg.set(sg.n, 2, r.x);
          sg.set(sg.n, 3, r.y);
          bp2c = 2;
          x6 = r.x;
          y6 = r.y;
          this.v1522 = sg.n;
        }
        if (bp2c === 2) {
          const xm = (x5 + x6) / 2;
          const ym = (y5 + y6) / 2;
          if (!this.dentro(xm, ym)) {
            bp2c = volta;
          } else {
            x6 = xm;
            y6 = ym;
            sg.set(sg.n, 2, x6);
            sg.set(sg.n, 3, y6);
            sg.n += 1;
            sg.set(sg.n, 0, -f10);
          }
        }
        if (volta === 0 || bp2c === 0) {
          x6 = x5 - d.dx;
          y6 = y5 - d.dy;
          bp2c = 1;
          volta = 1;
          continue;
        }
        break;
      }
      sg.n -= 1;
    }
    // L_16221..L_17b4c: segmentos com ponta comum viram os pontos médios das faixas
    const nRaios = sg.n;
    for (let f10 = 1; f10 <= nRaios; f10++) {
      const p = inicioSegmento(this.laje, sg, f10);
      let x5 = p.x;
      let y5 = p.y;
      let x6 = sg.get(f10, 2);
      let y6 = sg.get(f10, 3);
      let mx = x6;
      let my = y6;
      let d2 = f10;
      let da = f10;
      for (let g = 0; g < 1000; g++) {
        let achou = false;
        for (let e2 = 1; e2 <= nRaios; e2++) {
          if (e2 === da || e2 === f10 || e2 === d2) continue;
          const q = inicioSegmento(this.laje, sg, e2);
          const x4 = sg.get(e2, 2);
          const y4 = sg.get(e2, 3);
          let caso = 0;
          if (perto(x5, y5, q.x, q.y, tol)) caso = 1;
          else if (perto(x5, y5, x4, y4, tol)) caso = 2;
          else if (perto(x6, y6, q.x, q.y, tol)) caso = 3;
          else if (perto(x6, y6, x4, y4, tol)) caso = 4;
          if (caso === 0) continue;
          if (caso === 1) {
            mx = (x6 + x4) / 2;
            my = (y6 + y4) / 2;
            x5 = x4;
            y5 = y4;
            d2 = e2;
          } else if (caso === 2) {
            mx = (x6 + q.x) / 2;
            my = (y6 + q.y) / 2;
            x5 = q.x;
            y5 = q.y;
            d2 = e2;
          } else if (caso === 3) {
            mx = (x5 + x4) / 2;
            my = (y5 + y4) / 2;
            x6 = x4;
            y6 = y4;
            da = e2;
          } else {
            mx = (x5 + q.x) / 2;
            my = (y5 + q.y) / 2;
            x6 = q.x;
            y6 = q.y;
            da = e2;
          }
          achou = true;
          break;
        }
        if (!achou) break;
      }
      sg.n += 1;
      sg.set(sg.n, 0, mx);
      sg.set(sg.n, 1, my);
      sg.set(sg.n, 2, 0);
      sg.set(sg.n, 3, 0);
    }
    for (let f10 = 1; f10 <= this.laje.n; f10++) {
      const x = this.px(f10);
      const y = this.py(f10);
      let e2 = 1;
      for (; e2 <= nRaios; e2++) {
        if ((sg.get(e2, 1) === y && sg.get(e2, 0) === x) || -sg.get(e2, 0) === f10) break;
      }
      if (e2 > nRaios) {
        sg.n += 1;
        sg.set(sg.n, 0, x);
        sg.set(sg.n, 1, y);
      }
    }
    // pontos repetidos
    for (let i = nRaios + 1; sg.n > i; i++) {
      for (let j = i + 1; sg.n >= j;) {
        if (perto(sg.get(i, 0), sg.get(i, 1), sg.get(j, 0), sg.get(j, 1), tol)) {
          for (let k = j + 1; k <= sg.n; k++) {
            sg.set(k - 1, 0, sg.get(k, 0));
            sg.set(k - 1, 1, sg.get(k, 1));
          }
          sg.n -= 1;
        } else {
          j += 1;
        }
      }
    }
    // ordena os pontos médios pela projeção perpendicular às nervuras e os liga
    let b30 = this.laje.anguloNervuras - 90;
    if (b30 < 0) b30 += 360;
    b30 = (b30 * PI) / 180;
    const proj = (k: number) =>
      Math.sin(b30) * sg.get(k, 1) +
      ((1 - Math.sin(b30) ** 2) * sg.get(k, 0)) / (Math.cos(b30) - Math.cos(b30) === 0 ? -1 : 0);
    let menorProj = 100000;
    let primeiro = -1;
    for (let k = nRaios + 1; k <= sg.n; k++) {
      if (sg.get(k, 0) < 0) {
        const v = Math.round(-sg.get(k, 0));
        sg.set(k, 1, this.py(v));
        sg.set(k, 0, this.px(v));
      }
      sg.set(k, 2, proj(k));
      if (sg.get(k, 2) < menorProj) {
        menorProj = sg.get(k, 2);
        primeiro = k;
      }
    }
    if (primeiro > 0) sg.set(primeiro, 3, 1001);
    for (let ordem = 2; ordem + nRaios <= sg.n; ordem++) {
      let melhor = -1;
      let valor = 1000;
      for (let k = nRaios + 1; k <= sg.n; k++) {
        if (sg.get(k, 2) < valor && sg.get(k, 2) > menorProj) {
          valor = sg.get(k, 2);
          melhor = k;
        }
      }
      if (melhor !== -1) {
        sg.set(melhor, 3, ordem + 1000);
        menorProj = valor;
      }
    }
    let atual = nRaios + 1;
    for (let k = nRaios + 1; k <= sg.n; k++) {
      if (sg.get(k, 3) === 1001) {
        atual = k;
        break;
      }
    }
    for (let ordem = 2; sg.n - nRaios - 1 >= ordem - 1; ordem++) {
      for (let k = nRaios + 1; k <= sg.n; k++) {
        if (sg.get(k, 3) === ordem + 1000) {
          sg.set(atual, 2, sg.get(k, 0));
          sg.set(atual, 3, sg.get(k, 1));
          atual = k;
          break;
        }
      }
    }
    for (let k = nRaios + 1; k <= sg.n; k++) {
      if (sg.get(k, 3) === sg.n - nRaios + 1000) {
        sg.remove(k);
        break;
      }
    }
    void s;
  }
}

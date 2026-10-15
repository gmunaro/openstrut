// Padrão de charneiras do SISTRUT 4.0 (LAMONTLB, S_4019b) e a máquina que roda as
// rotinas traduzidas do LAJECALC.
//
// Por que tradução mecânica: o padrão de charneiras do original é um algoritmo
// heurístico de ~2000 linhas (interseções sucessivas, limpeza com tolerância
// 0,005, bordos livres por raio de 1000 m) sem especificação além do próprio
// código (livros_laje.md 1.6: "a V2 precisa portar o LAMONTLB e o SUB 2
// inteiros"). Reescrevê-lo "limpo" mudaria a geometria em polígonos e bordos
// livres sem oráculo para conferir. Por isso as rotinas abaixo do marcador são
// traduzidas comando a comando da V1 nova (`dist/src-original/laje/LAJECALC.BAS`,
// conferida byte a byte contra o oráculo) por um tradutor (`scripts/sistrut/t1-tradutor/traduz.py` +
// `gera.sh`/`monta.sh`): cada GOTO vira um salto da máquina de estados, cada variável `!`
// é arredondada para SINGLE na atribuição (`g.s`), `%` por CINT, e o comentário
// `// nnnn` no fim de cada comando é a linha do LAJECALC.BAS. Os nomes V_xxxx e
// A_xxxx são os endereços DS:xxxx do original; o significado dos que importam
// está em `EstadoLajecalc`.
//
// Uso: `padraoDeCharneiras` (contrato T1/T6) para um polígono; `iDoBordo` para o
// i de cada bordo. O coeficiente de carga (coeficiente.ts) e a preparação da laje
// rodam na mesma máquina.
import type {
  CodigoBordo,
  IDoBordo,
  ModoSistrut,
  PadraoCharneiras,
  PadraoDeCharneiras,
  ParametrosLaje,
  Ponto,
  RegiaoCharneira,
} from "../base/tipos";
import { ErroQB, atribuicao, qbCint, qbClng, qbFix, qbInt } from "../base/f32";

// ------------------------------------------------------------------ máquina

type TipoQB = "!" | "#" | "%" | "&";

/** Matriz do QB com os limites do DIM/REDIM; índice por CINT, fora da faixa dá
 *  o erro 9 do original ("Subscript out of range"). Grava arredondando pelo tipo. */
export class Matriz {
  private readonly dados: Float64Array;
  private readonly lo: number[];
  private readonly tam: number[];
  constructor(
    private readonly arred: (x: number) => number,
    limites: readonly (readonly [number, number])[],
  ) {
    this.lo = limites.map(([lo]) => qbCint(lo));
    this.tam = limites.map(([lo, hi]) => qbCint(hi) - qbCint(lo) + 1);
    this.dados = new Float64Array(limites.length === 0 ? 0 : this.tam.reduce((a, b) => a * b, 1));
  }
  private pos(i: number, j?: number) {
    const a = qbCint(i) - (this.lo[0] ?? 0);
    if (this.tam.length === 0 || a < 0 || a >= (this.tam[0] ?? 0)) {
      throw new ErroQB(9, `Índice ${i} fora da matriz`);
    }
    if (this.tam.length === 1) return a;
    const b = qbCint(j ?? 0) - (this.lo[1] ?? 0);
    if (b < 0 || b >= (this.tam[1] ?? 0)) throw new ErroQB(9, `Índice ${j} fora da matriz`);
    return a * (this.tam[1] ?? 0) + b;
  }
  get(i: number, j?: number) {
    return this.dados[this.pos(i, j)] ?? 0;
  }
  set(v: number, i: number, j?: number) {
    this.dados[this.pos(i, j)] = this.arred(v);
  }
}

/** Estado global do LAJECALC para UMA laje (o original guarda tudo no DS).
 *  Índice 1 = a laje e o polígono correntes (V_0f0c = V_177c = 1).
 *  - A_1070(k, 0..1): vértices em coordenadas da planta; A_109e(1, 0) = n + 1 e
 *    A_109e(1, k) = k (polígono fechado, o último repete o primeiro).
 *  - A_10fa(1, k): código do bordo k (1 livre, ≤ 2 apoiado, > 2 engastado).
 *  - A_10cc(1, ·): (0) polígono = 1, (1) tipo da laje, (2) área, (4) permanente.
 *    A_10cc(0, 2..4): alvenaria, carga por área e parcela acidental da laje.
 *  - A_1210(1, 0..1): ângulo e μ; A_1210(0, 1): coeficiente de carga.
 *  - A_15b0/A_15de: polígono de trabalho (girado e afim), (0) = n + 1.
 *  - A_160c(s, 0..3): segmentos do padrão (início negativo = −vértice); (0, 0) = nº.
 *  - A_163a(v, 0..2): nó da charneira do vértice v; (v, 0) = −100 marca vértice
 *    entre bordos colineares; (v, 2) = 100 marca nó sem charneira.
 *  - V_133a, V_133e: tolerâncias de comprimento e de ângulo; V_0e68_pi = π. */
export class EstadoLajecalc {
  readonly s: (x: number) => number;
  /** O LAJECALC trunca o i do bordo em 2 casas na bissetriz (LAJECALC.BAS:3425);
   *  o LAJEMONT, que calcula as reações, não (LAJEMONT.BAS:1505c). */
  truncaIDaBissetriz = true;
  V_0e50 = 1;
  V_0e68_pi = 4 * Math.atan(1);
  V_0ee8 = 0;
  V_0ef0 = 0;
  V_0ef4 = 0;
  V_0efc = 0;
  V_0f04 = 0;
  V_0f0c = 1;
  V_0f10 = 0;
  V_0f14 = 0;
  V_0f18 = "";
  V_0f1c = "";
  V_0f20 = "";
  V_0f82 = 0;
  V_133a = 0;
  V_133e = 0;
  V_1670 = 0;
  V_1678 = 0;
  V_1680 = 0;
  V_1688 = 0;
  V_1690 = 0;
  V_1698 = 0;
  V_16a0 = 0;
  V_16a8 = 0;
  V_16b0 = 0;
  V_16b8 = 0;
  V_16bc = 0;
  V_16c0 = 0;
  V_16c4 = 0;
  V_16cc = 0;
  V_16d0 = 0;
  V_16d8 = 0;
  V_16e0 = 0;
  V_16e8 = 0;
  V_16f0 = 0;
  V_16f8 = 0;
  V_1700 = 0;
  V_1708 = 0;
  V_1710 = 0;
  V_1718 = 0;
  V_1720 = 0;
  V_1728 = 0;
  V_1730 = 0;
  V_1738 = 0;
  V_1740 = 0;
  V_1748 = 0;
  V_1750 = 0;
  V_1754 = 0;
  V_1758 = 0;
  V_175c = 0;
  V_1760 = 0;
  V_1764 = 0;
  V_1768 = 0;
  V_1770 = 0;
  V_1778 = 0;
  V_177c = 1;
  V_1780 = 0;
  V_1784 = 0;
  V_1788 = 0;
  V_178c = 0;
  V_1790 = 0;
  V_1794 = 0;
  V_1798 = 0;
  V_179c = 0;
  V_17a0 = 0;
  V_17a4 = 0;
  V_17a8 = 0;
  V_17ac = 0;
  V_17e0 = 0;
  V_17e8 = 0;
  V_17f0 = 0;
  V_17f8 = 0;
  // Acumuladores do coeficiente de carga (locais do S_578ad expostos): l_1a, l_1e,
  // l_22, l_26, l_2a, l_2e, l_32 (livros_laje.md 1.7).
  L_BP1a = 0;
  L_BP1e = 0;
  L_BP22 = 0;
  L_BP26 = 0;
  L_BP2a = 0;
  L_BP2e = 0;
  L_BP32 = 0;
  // Matrizes do S_578ad expostas para traçar as regiões (L_5941c): segmentos em
  // pares de pontos (L_BP64/L_BP76), segmento sobre bordo livre (L_BPac) e a região
  // corrente (L_BP88/L_BP9a, (0) = nº de pontos; L_BPc2(k, 0) = 1 se o lado k é
  // trecho sobre bordo livre).
  A_0fe6: Matriz;
  A_1014: Matriz;
  A_1070: Matriz;
  A_109e: Matriz;
  A_10cc: Matriz;
  A_10fa: Matriz;
  A_1210: Matriz;
  A_123e: Matriz;
  A_1342: Matriz;
  A_15b0: Matriz;
  A_15de: Matriz;
  A_160c: Matriz;
  A_163a: Matriz;
  L_BP64: Matriz;
  L_BP76: Matriz;
  L_BP88: Matriz;
  L_BP9a: Matriz;
  L_BPac: Matriz;
  L_BPc2: Matriz;

  constructor(parametros: ParametrosLaje, modo: ModoSistrut) {
    this.s = atribuicao(modo);
    this.V_133a = this.s(parametros.toleranciaComprimento);
    this.V_133e = this.s(parametros.toleranciaAngulo);
    this.V_0f82 = this.s(parametros.relacaoCantosReentrantes);
    const vazia = () => this.matriz("!", []);
    this.A_0fe6 = this.matriz("!", [
      [0, 0],
      [0, 4],
    ]);
    this.A_1014 = this.matriz("!", [
      [0, 0],
      [0, 1],
    ]);
    this.A_1070 = vazia();
    this.A_109e = vazia();
    this.A_10cc = this.matriz("!", [
      [0, 1],
      [0, 7],
    ]);
    this.A_10cc.set(1, 1, 0);
    this.A_10fa = vazia();
    this.A_1210 = this.matriz("!", [
      [0, 1],
      [0, 1],
    ]);
    this.A_123e = vazia();
    this.A_1342 = vazia();
    this.A_15b0 = vazia();
    this.A_15de = vazia();
    this.A_160c = vazia();
    this.A_163a = vazia();
    this.L_BP64 = vazia();
    this.L_BP76 = vazia();
    this.L_BP88 = vazia();
    this.L_BP9a = vazia();
    this.L_BPac = vazia();
    this.L_BPc2 = vazia();
  }

  /** REDIM: matriz nova, zerada, com o arredondamento do tipo. */
  matriz(tipo: TipoQB, limites: readonly (readonly [number, number])[]) {
    const arred =
      tipo === "!" ? this.s : tipo === "%" ? qbCint : tipo === "&" ? qbClng : (x: number) => x;
    return new Matriz(arred, limites);
  }

  /** Carrega o polígono de trabalho (A_15b0/A_15de) e os códigos dos bordos. Os
   *  códigos ficam numa matriz DOUBLE: o padrão pode ser pedido por i (contrato),
   *  e então o código 2 + 10·i não precisa ser inteiro. */
  carregaPoligono(vertices: readonly Ponto[], codigos: readonly number[], tipo: number) {
    const n = vertices.length;
    this.A_15b0 = this.matriz("!", [[0, 50]]);
    this.A_15de = this.matriz("!", [[0, 50]]);
    this.A_15b0.set(n + 1, 0);
    this.A_109e = this.matriz("%", [
      [0, 1],
      [0, n + 1],
    ]);
    this.A_109e.set(n + 1, 1, 0);
    this.A_10fa = this.matriz("#", [
      [0, 1],
      [0, n + 1],
    ]);
    for (let k = 1; k <= n + 1; k++) {
      const v = vertices[(k - 1) % n];
      if (!v) throw new Error("Polígono vazio");
      this.A_15b0.set(v.x, k);
      this.A_15de.set(v.y, k);
      this.A_109e.set(k <= n ? k : 1, 1, k);
      this.A_10fa.set(codigos[(k - 1) % n] ?? 0, 1, k);
    }
    this.A_10cc.set(tipo, 1, 1);
  }

  /** Polígono de trabalho atual, sem repetir o primeiro vértice. */
  poligono(): Ponto[] {
    const n = this.A_15b0.get(0) - 1;
    const p: Ponto[] = [];
    for (let k = 1; k <= n; k++) p.push({ x: this.A_15b0.get(k), y: this.A_15de.get(k) });
    return p;
  }
}

/** `a ^ b` do QB (RT_POT##); o quadrado sai exato como no x87. */
export function pot(a: number, b: number) {
  return b === 2 ? a * a : a ** b;
}

// ------------------------------------------------------------------ contratos

/** Código do original a partir do i do contrato: livre 1, i > 0 → 2 + 10·i
 *  (engastado), senão 0 (apoiado). Para i de um trecho único é o código de volta. */
function codigosDeI(i: readonly number[], livres: readonly boolean[]) {
  return i.map((v, k) => (livres[k] ? 1 : v > 0 ? 2 + 10 * v : 0));
}

/** Marca com −100 em A_163a(v, 0) os vértices entre bordos colineares, como o
 *  primeiro laço do S_4019b (LAJECALC.BAS:5061-5091). */
function marcaColineares(g: EstadoLajecalc) {
  const n = g.A_15b0.get(0) - 1;
  g.A_163a = g.matriz("!", [
    [0, 30],
    [0, 2],
  ]);
  for (let v = 1; v <= n; v++) {
    g.V_16bc = 1;
    g.V_1790 = v === 1 ? n : v - 1;
    g.V_1794 = v;
    g.V_1798 = v;
    g.V_179c = v === n ? 1 : v + 1;
    S_21e5d(g);
    const a = g.s(g.V_16a8);
    const b = g.s(g.V_16b0);
    if (Math.abs(Math.max(a, b) - Math.min(a, b) - g.V_0e68_pi) < g.V_133e) g.A_163a.set(-100, v, 0);
  }
}

/** i de cada bordo (LAJECALC.BAS:6999-7043, sub-rotina L_4d8ae): soma
 *  (código − 2)·L_k/10 sobre o grupo de bordos colineares do bordo, só códigos
 *  > 2, dividida pelo comprimento do grupo, sem arredondar; acumula em SINGLE. */
export const iDoBordo: IDoBordo = (vertices, codigos, parametros, modo) => {
  const g = new EstadoLajecalc(parametros, modo);
  g.carregaPoligono(vertices, codigos, 0);
  marcaColineares(g);
  const n = vertices.length;
  const prox = (k: number) => (k === n ? 1 : k + 1);
  const ant = (k: number) => (k === 1 ? n : k - 1);
  const comp = (a: number, b: number) =>
    Math.sqrt(
      pot(g.A_15b0.get(a) - g.A_15b0.get(b), 2) + pot(g.A_15de.get(a) - g.A_15de.get(b), 2),
    );
  const parcela = (k: number) => {
    const c = g.A_10fa.get(1, k);
    return c > 2 ? ((c - 2) * comp(k, prox(k))) / 10 : 0;
  };
  return vertices.map((_, idx) => {
    const k = idx + 1;
    // para trás enquanto o vértice inicial é colinear (7003-7022)
    let soma = 0;
    let inicio = k;
    let e = k;
    for (;;) {
      soma = g.s(parcela(e) + soma);
      inicio = e;
      if (g.A_163a.get(e, 0) !== -100) break;
      e = ant(e);
    }
    // para a frente enquanto o vértice seguinte é colinear (7023-7042)
    let fim = prox(k);
    while (g.A_163a.get(fim, 0) === -100) {
      soma = g.s(parcela(fim) + soma);
      fim = prox(fim);
    }
    return g.s(soma / comp(inicio, fim));
  });
};

/** Dados do padrão no formato do original, para o coeficiente de carga
 *  (coeficiente.ts) rodar sobre eles. */
export interface PadraoBruto {
  /** Polígono de trabalho, sem repetir o primeiro vértice. */
  poligono: Ponto[];
  /** Código de cada bordo (DOUBLE; ver `EstadoLajecalc.carregaPoligono`). */
  codigos: number[];
  tipo: number;
  /** Linhas 1..n de A_160c e de A_163a. */
  segmentos: [number, number, number, number][];
  nos: [number, number, number][];
}

/** `PadraoCharneiras` com os dados do original (mudança de contrato pedida no
 *  relatório: o coeficiente de carga precisa saber de que vértice sai cada
 *  charneira e quais vértices são colineares). */
export interface PadraoCharneirasSistrut extends PadraoCharneiras {
  bruto: PadraoBruto;
}

/** Guarda A_160c e A_163a do estado. */
function brutoDoEstado(g: EstadoLajecalc, codigos: readonly number[], tipo: number): PadraoBruto {
  const nseg = g.A_160c.get(0, 0);
  const segmentos: [number, number, number, number][] = [];
  for (let k = 1; k <= nseg; k++) {
    segmentos.push([g.A_160c.get(k, 0), g.A_160c.get(k, 1), g.A_160c.get(k, 2), g.A_160c.get(k, 3)]);
  }
  const poligono = g.poligono();
  const nos: [number, number, number][] = [];
  for (let v = 1; v <= poligono.length; v++) {
    nos.push([g.A_163a.get(v, 0), g.A_163a.get(v, 1), g.A_163a.get(v, 2)]);
  }
  return { poligono, codigos: [...codigos], tipo, segmentos, nos };
}

/** Recarrega na máquina um padrão guardado (para o coeficiente de carga). */
export function carregaPadrao(g: EstadoLajecalc, bruto: PadraoBruto) {
  g.carregaPoligono(bruto.poligono, bruto.codigos, bruto.tipo);
  g.A_160c = g.matriz("!", [
    [0, 100],
    [0, 3],
  ]);
  g.A_160c.set(bruto.segmentos.length, 0, 0);
  bruto.segmentos.forEach((s, k) => s.forEach((v, j) => g.A_160c.set(v, k + 1, j)));
  g.A_163a = g.matriz("!", [
    [0, 30],
    [0, 2],
  ]);
  bruto.nos.forEach((s, k) => s.forEach((v, j) => g.A_163a.set(v, k + 1, j)));
}

/** Monta L_BP64/L_BP76/L_BPac como o S_578ad (LAJECALC.BAS:8220-8340) faz antes de
 *  traçar as regiões: pontos dos segmentos em pares e a marca de segmento sobre
 *  bordo livre. É o trecho inicial do S_578ad, rodado só até 8340. */
export function preparaRegioes(g: EstadoLajecalc) {
  S_578adSegmentos(g);
}

/** Região de cada bordo não livre, como o S_578ad a traça (GOSUB L_5941c,
 *  LAJECALC.BAS:8415-8598): parte do vértice do bordo pela charneira que sai
 *  dele e segue os segmentos, sempre virando o máximo, até o fim do bordo. */
export function regioesDoPadrao(g: EstadoLajecalc): RegiaoCharneira[] {
  preparaRegioes(g);
  const n = g.A_15b0.get(0) - 1;
  const regioes: RegiaoCharneira[] = [];
  for (let f = 1; f <= n; f++) {
    if (g.A_10fa.get(1, f) === 1 || g.A_163a.get(f, 0) === -100) continue;
    g.V_0f10 = g.s(f);
    g.V_17e0 = g.A_15b0.get(f);
    g.V_17f0 = g.A_15de.get(f);
    let fim = f === n ? 1 : f + 1;
    while (g.A_163a.get(fim, 0) === -100) fim = fim === n ? 1 : fim + 1;
    g.V_1788 = g.s(fim);
    g.V_17e8 = g.A_15b0.get(fim);
    g.V_17f8 = g.A_15de.get(fim);
    L_5941c(g);
    const npts = g.L_BP88.get(0);
    const poligono: Ponto[] = [];
    for (let k = 1; k < npts; k++) poligono.push({ x: g.L_BP88.get(k), y: g.L_BP9a.get(k) });
    let area = 0;
    for (let k = 0; k < poligono.length; k++) {
      const a = poligono[k];
      const b = poligono[(k + 1) % poligono.length];
      if (a && b) area += a.x * b.y - b.x * a.y;
    }
    regioes.push({ bordo: f - 1, poligono, area: Math.abs(area) / 2 });
  }
  return regioes;
}

/** Padrão de charneiras a partir dos códigos dos bordos (o que o original usa).
 *  `tipo` 1 (pré-moldada) pula o tratamento de bordos livres (LAJECALC.BAS:6657). */
export function padraoPorCodigos(
  vertices: readonly Ponto[],
  codigos: readonly CodigoBordo[],
  parametros: ParametrosLaje,
  modo: ModoSistrut,
  tipo = 0,
  comoLajemont = false,
): PadraoCharneirasSistrut {
  if (areaLajegeom(vertices) <= 0) {
    // o LAJEGEOM não cria laje com área ≤ 0 (LAJEGEOM.BAS:3113); no sentido
    // anti-horário os termos de canto do coeficiente saem errados
    throw new Error("Polígono de laje no sentido anti-horário: o original só aceita o horário");
  }
  const g = new EstadoLajecalc(parametros, modo);
  g.truncaIDaBissetriz = !comoLajemont;
  g.carregaPoligono(vertices, codigos, tipo);
  S_4019b(g);
  return padraoDoEstado(g, codigos, tipo);
}

/** Área pela fórmula do LAJEGEOM (LAJEGEOM.BAS:3110): Σ (x_k + x_k+1)(y_k − y_k+1)/2,
 *  positiva no sentido horário. */
export function areaLajegeom(vertices: readonly Ponto[]) {
  let area = 0;
  vertices.forEach((a, k) => {
    const b = vertices[(k + 1) % vertices.length] ?? a;
    area += ((a.x + b.x) * (a.y - b.y)) / 2;
  });
  return area;
}

/** Lê o padrão calculado na máquina. */
export function padraoDoEstado(
  g: EstadoLajecalc,
  codigos: readonly number[],
  tipo: number,
): PadraoCharneirasSistrut {
  const bruto = brutoDoEstado(g, codigos, tipo);
  const segmentos = bruto.segmentos.map(([x0, y0, x1, y1]) => {
    const v = x0 < 0 ? bruto.poligono[Math.abs(qbCint(x0)) - 1] : undefined;
    return { inicio: v ? { ...v } : { x: x0, y: y0 }, fim: { x: x1, y: y1 } };
  });
  return { segmentos, regioes: regioesDoPadrao(g), bruto };
}

/** Padrão de charneiras do polígono (contrato T1/T6; LAJECALC.BAS:4980-7128,
 *  livros_laje.md 1.6). `i` por bordo (de `iDoBordo`) e `livres` viram os códigos
 *  do original (2 + 10·i, 1 no livre). Polígono no sentido do LAJEGEOM (horário:
 *  área Σ(x_k + x_k+1)(y_k − y_k+1)/2 > 0, LAJEGEOM.BAS:3110-3115). */
export const padraoDeCharneiras: PadraoDeCharneiras = (vertices, i, livres, parametros, modo) =>
  padraoPorCodigos(vertices, codigosDeI(i, livres), parametros, modo);

/** O mesmo padrão como o LAJEMONT o traça para as reações (coordenadas reais, i do
 *  bordo sem o truncamento em 2 casas da bissetriz do LAJECALC; LAJEMONT.BAS:14b11-
 *  1505c). Difere do `padraoDeCharneiras` só quando i não tem 2 casas exatas em
 *  SINGLE: v2par_laje_otim L1 com código 5 (i 0,3 → 0,29 no LAJECALC) dá a região do
 *  lado 3 com 10,22 m² (impresso) contra 10,18. É o que a montagem (T6) deve usar. */
export const padraoDeCharneirasLajemont: PadraoDeCharneiras = (
  vertices,
  i,
  livres,
  parametros,
  modo,
) => padraoPorCodigos(vertices, codigosDeI(i, livres), parametros, modo, 0, true);

// ===== TRADUÇÃO MECÂNICA de LAJECALC.BAS (gerada por traduz.py; não editar à mão) =====

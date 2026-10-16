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
// conferida byte a byte contra o oráculo) por um tradutor
// (`scripts/sistrut/t1-tradutor/`: `traduz.py`, `gera.sh`, `monta.sh`): cada GOTO vira um salto da máquina de estados, cada variável `!`
// é arredondada para SINGLE na atribuição (`g.s`), `%` por CINT, e o comentário
// `// nnnn` no fim de cada comando é a linha do LAJECALC.BAS. Os nomes V_xxxx e
// A_xxxx são os endereços DS:xxxx do original; o significado dos que importam
// está em `EstadoLajecalc`.
//
// Uso: `padraoDeCharneiras` (contrato `PadraoDeCharneiras`) para um polígono;
// `iDoBordo` para o i de cada bordo. O coeficiente de carga (coeficiente.ts) e a
// preparação da laje rodam na mesma máquina. É o padrão do LAJECALC (i truncado em 2
// casas na bissetriz, LAJECALC.BAS:3425); o do LAJEMONT, que dá as reações, é o porte
// próprio de montagem/charneiras.ts (ver o cabeçalho de lá).
import type {
  IDoBordo,
  ModoSistrut,
  PadraoBruto,
  PadraoCharneiras,
  PadraoDeCharneiras,
  ParametrosLaje,
  Ponto,
  RegiaoCharneira,
} from "../base/tipos";
import { ErroQB, atribuicao, qbCint, qbClng, qbFix, qbInt } from "../base/f32";
import { potencia, raiz } from "../base/x87";

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
  /** `^` e `SQR` do modo (base/x87.ts): no original, o B$POW e o FSQRT do x87, com o
   *  resultado em DOUBLE para seguir a expressão; `potS`/`raizS` quando a potência ou
   *  a raiz é a expressão inteira gravada numa variável `!` (FSTP direto a SINGLE). */
  readonly pot: (a: number, b: number) => number;
  readonly potS: (a: number, b: number) => number;
  readonly raiz: (x: number) => number;
  readonly raizS: (x: number) => number;
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
    this.pot = potencia(modo);
    this.potS = potencia(modo, "single");
    this.raiz = raiz(modo);
    this.raizS = raiz(modo, "single");
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

// ------------------------------------------------------------------ contratos

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
    if (Math.abs(Math.max(a, b) - Math.min(a, b) - g.V_0e68_pi) < g.V_133e)
      g.A_163a.set(-100, v, 0);
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
    g.raiz(
      g.pot(g.A_15b0.get(a) - g.A_15b0.get(b), 2) + g.pot(g.A_15de.get(a) - g.A_15de.get(b), 2),
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

/** Guarda A_160c e A_163a do estado. */
function brutoDoEstado(g: EstadoLajecalc, codigos: readonly number[], tipo: number): PadraoBruto {
  const nseg = g.A_160c.get(0, 0);
  const segmentos: [number, number, number, number][] = [];
  for (let k = 1; k <= nseg; k++) {
    segmentos.push([
      g.A_160c.get(k, 0),
      g.A_160c.get(k, 1),
      g.A_160c.get(k, 2),
      g.A_160c.get(k, 3),
    ]);
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

/** Padrão de charneiras do polígono a partir dos códigos dos bordos (contrato
 *  `PadraoDeCharneiras`; LAJECALC.BAS:4980-7128, livros_laje.md 1.6). `tipo` 1
 *  (pré-moldada) pula o tratamento de bordos livres (LAJECALC.BAS:6657). Polígono no
 *  sentido do LAJEGEOM (horário: área Σ(x_k + x_k+1)(y_k − y_k+1)/2 > 0,
 *  LAJEGEOM.BAS:3110-3115). */
export const padraoDeCharneiras: PadraoDeCharneiras = (
  vertices,
  codigos,
  parametros,
  modo,
  tipo = 0,
) => {
  if (areaLajegeom(vertices) <= 0) {
    // o LAJEGEOM não cria laje com área ≤ 0 (LAJEGEOM.BAS:3113); no sentido
    // anti-horário os termos de canto do coeficiente saem errados
    throw new Error("Polígono de laje no sentido anti-horário: o original só aceita o horário");
  }
  const g = new EstadoLajecalc(parametros, modo);
  g.carregaPoligono(vertices, codigos, tipo);
  S_4019b(g);
  return padraoDoEstado(g, codigos, tipo);
};

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
): PadraoCharneiras {
  const bruto = brutoDoEstado(g, codigos, tipo);
  const segmentos = bruto.segmentos.map(([x0, y0, x1, y1]) => {
    const v = x0 < 0 ? bruto.poligono[Math.abs(qbCint(x0)) - 1] : undefined;
    return { inicio: v ? { ...v } : { x: x0, y: y0 }, fim: { x: x1, y: y1 } };
  });
  return { segmentos, regioes: regioesDoPadrao(g), bruto };
}

// ===== TRADUÇÃO MECÂNICA de LAJECALC.BAS (gerada por traduz.py; não editar à mão) =====

/** Traducao mecanica de LAJECALC.BAS:4981-7127. */
export function S_4019b(g: EstadoLajecalc): void {
  let L_BP0e = 0;
  let L_BP100 = 0;
  let L_BP104 = 0;
  let L_BP108 = 0;
  let L_BP10c = 0;
  let L_BP110 = "";
  let L_BP114 = 0;
  let L_BP118 = 0;
  let L_BP11c = 0;
  let L_BP12 = 0;
  let L_BP120 = 0;
  let L_BP124 = 0;
  let L_BP128 = 0;
  let L_BP12c = 0;
  let L_BP130 = 0;
  let L_BP134 = 0;
  let L_BP138 = 0;
  let L_BP13c = 0;
  let L_BP140 = 0;
  let L_BP142 = 0;
  let L_BP144 = 0;
  let L_BP146 = 0;
  let L_BP148 = 0;
  let L_BP14a = 0;
  let L_BP14c = 0;
  let L_BP14e = 0;
  let L_BP150 = 0;
  let L_BP152 = 0;
  let L_BP154 = 0;
  let L_BP156 = 0;
  let L_BP158 = 0;
  let L_BP15a = 0;
  let L_BP16 = 0;
  let L_BP162 = 0;
  let L_BP166 = 0;
  let L_BP16a = 0;
  let L_BP16e = 0;
  let L_BP172 = 0;
  let L_BP176 = 0;
  let L_BP17a = 0;
  let L_BP17e = 0;
  let L_BP182 = 0;
  let L_BP186 = 0;
  let L_BP18a = 0;
  let L_BP18e = 0;
  let L_BP192 = 0;
  let L_BP196 = 0;
  let L_BP19a = 0;
  let L_BP19e = 0;
  let L_BP1a = 0;
  let L_BP1a2 = 0;
  let L_BP1a6 = 0;
  let L_BP1aa = 0;
  let L_BP1ae = 0;
  let L_BP1b2 = 0;
  let L_BP1b6 = 0;
  let L_BP1ba = 0;
  let L_BP1be = 0;
  let L_BP1c2 = 0;
  let L_BP1c6 = 0;
  let L_BP1ca = 0;
  let L_BP1ce = 0;
  let L_BP1d2 = 0;
  let L_BP1d6 = 0;
  let L_BP1da = 0;
  let L_BP1de = 0;
  let L_BP1e = 0;
  let L_BP1e2 = 0;
  let L_BP1e6 = 0;
  let L_BP1ea = 0;
  let L_BP1ee = 0;
  let L_BP1f2 = 0;
  let L_BP1f6 = 0;
  let L_BP1fa = 0;
  let L_BP1fe = 0;
  let L_BP202 = 0;
  let L_BP20a = 0;
  let L_BP20e = 0;
  let L_BP212 = 0;
  let L_BP216 = 0;
  let L_BP21a = 0;
  let L_BP21e = 0;
  let L_BP22 = 0;
  let L_BP226 = 0;
  let L_BP26 = 0;
  let L_BP2a = 0;
  let L_BP44 = 0;
  let L_BP48 = 0;
  let L_BP4c = 0;
  let L_BP50 = 0;
  let L_BP54 = 0;
  let L_BP58 = 0;
  let L_BP5c = 0;
  let L_BP60 = 0;
  let L_BP64 = 0;
  let L_BP68 = 0;
  let L_BP6c = 0;
  let L_BP70 = 0;
  let L_BP74 = 0;
  let L_BP78 = 0;
  let L_BP7c = 0;
  let L_BP80 = 0;
  let L_BP84 = 0;
  let L_BP88 = 0;
  let L_BP8c = 0;
  let L_BP90 = 0;
  let L_BP92 = 0;
  let L_BP96 = "";
  let L_BP98 = 0;
  let L_BP9c = 0;
  let L_BPa0 = 0;
  let L_BPa4 = 0;
  let L_BPa8 = 0;
  let L_BPac = 0;
  let L_BPb0 = 0;
  let L_BPb4 = 0;
  let L_BPb8 = 0;
  let L_BPbc = 0;
  let L_BPc0 = 0;
  let L_BPc4 = 0;
  let L_BPc8 = 0;
  let L_BPcc = 0;
  let L_BPd0 = 0;
  let L_BPd4 = 0;
  let L_BPd8 = 0;
  let L_BPdc = 0;
  let L_BPe0 = 0;
  let L_BPe4 = 0;
  let L_BPe8 = 0;
  let L_BPec = 0;
  let L_BPee = 0;
  let L_BPf0 = 0;
  let L_BPf4 = 0;
  let L_BPf8 = 0;
  let L_BPfc = 0;
  let L_BP40 = g.matriz("!", []);
  let lim0 = 0;
  let passo0 = 0;
  let lim1 = 0;
  let passo1 = 0;
  let lim2 = 0;
  let passo2 = 0;
  let lim3 = 0;
  let passo3 = 0;
  let lim4 = 0;
  let passo4 = 0;
  let lim5 = 0;
  let passo5 = 0;
  let lim6 = 0;
  let passo6 = 0;
  let lim7 = 0;
  let passo7 = 0;
  let lim8 = 0;
  let passo8 = 0;
  let lim9 = 0;
  let passo9 = 0;
  let lim10 = 0;
  let passo10 = 0;
  let lim11 = 0;
  let passo11 = 0;
  let lim12 = 0;
  let passo12 = 0;
  let lim13 = 0;
  let passo13 = 0;
  let lim14 = 0;
  let passo14 = 0;
  let lim15 = 0;
  let passo15 = 0;
  let lim16 = 0;
  let passo16 = 0;
  let lim17 = 0;
  let passo17 = 0;
  let lim18 = 0;
  let passo18 = 0;
  const pilha: number[] = [];
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        L_BP40 = g.matriz("!", []); // 5039
        L_BP40 = g.matriz("!", [
          [0, 20],
          [0, 2],
        ]); // 5041
        g.V_177c = g.s(0); // 5042
        g.V_177c = g.s(0.0); // 5043
        g.V_0f10 = g.s(1.0); // 5044
        pc = 1;
        continue;
      case 1:
        // L_4020e
        if (!(g.A_10cc.get(qbCint(g.V_0f10), 1) !== 2.0)) {
          pc = 2;
          continue;
        } // 5046
        g.V_177c = g.s(g.V_177c + 1.0); // 5047
        pc = 2;
        continue;
      case 2:
        // L_40259
        g.V_0f10 = g.s(g.V_0f10 + 1.0); // 5049
        if (g.V_0f10 <= g.V_0f0c) {
          pc = 1;
          continue;
        } // 5050
        g.A_1342 = g.matriz("%", []); // 5051
        g.A_160c = g.matriz("!", []); // 5052
        g.A_163a = g.matriz("!", []); // 5053
        g.A_1342 = g.matriz("%", [
          [0, g.V_0e50],
          [0, 30],
        ]); // 5054
        g.A_160c = g.matriz("!", [
          [0, 100],
          [0, 3],
        ]); // 5055
        g.A_163a = g.matriz("!", [
          [0, 30],
          [0, 2],
        ]); // 5056
        g.V_177c = g.s(g.A_10cc.get(qbCint(g.V_0f0c), 0)); // 5057
        if (!(g.A_10cc.get(qbCint(g.V_0f0c), 1) === 2.0)) {
          pc = 3;
          continue;
        } // 5058
        pc = 459;
        continue; // 5059
      case 3:
        // L_40378
        g.V_16cc = g.s(1.0); // 5061
        L_BP44 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5062
        g.V_0f10 = g.s(1.0); // 5063
        lim0 = g.s(L_BP44);
        passo0 = g.s(1);
        if (passo0 >= 0 ? g.V_0f10 > lim0 : g.V_0f10 < lim0) {
          pc = 461;
          continue;
        }
        pc = 460;
        continue;
      case 460:
        g.V_1780 = g.s(g.V_0f10); // 5064
        g.V_1784 = g.s(g.V_0f10 - 1.0); // 5065
        g.V_1788 = g.s(g.V_0f10 + 1.0); // 5066
        if (!(g.V_1784 === 0.0)) {
          pc = 4;
          continue;
        } // 5067
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5068
        pc = 4;
        continue;
      case 4:
        // L_40447
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 5;
          continue;
        } // 5070
        g.V_1788 = g.s(1.0); // 5071
        pc = 5;
        continue;
      case 5:
        // L_40490
        g.V_16bc = g.s(1.0); // 5073
        g.V_1790 = g.s(g.V_1784); // 5074
        g.V_1794 = g.s(g.V_1780); // 5075
        g.V_1798 = g.s(g.V_1780); // 5076
        g.V_179c = g.s(g.V_1788); // 5077
        S_21e5d(g); // 5078
        L_BP48 = g.s(g.V_16a8 / 1.0); // 5080
        L_BP4c = g.s(g.V_16b0 / 1.0); // 5081
        L_BP50 = g.s(L_BP48 > L_BP4c ? L_BP48 : L_BP4c); // 5082
        L_BP54 = g.s(g.V_16a8 / 1.0); // 5084
        L_BP58 = g.s(g.V_16b0 / 1.0); // 5085
        L_BP5c = g.s(L_BP54 < L_BP58 ? L_BP54 : L_BP58); // 5086
        if (!(Math.abs(L_BP50 - L_BP5c - g.V_0e68_pi) < g.V_133e)) {
          pc = 6;
          continue;
        } // 5088
        g.A_163a.set(g.s(-100.0), qbCint(g.V_1780), 0); // 5089
        pc = 6;
        continue;
      case 6:
        // L_405a6
        g.V_0f10 = g.s(g.V_0f10 + passo0); // 5091
        if (passo0 >= 0 ? g.V_0f10 <= lim0 : g.V_0f10 >= lim0) {
          pc = 460;
          continue;
        }
        pc = 461;
        continue;
      case 461:
        g.A_1342 = g.matriz("%", []); // 5092
        g.A_1342 = g.matriz("%", [
          [0, g.A_109e.get(qbCint(g.V_177c), 0)],
          [0, 0],
        ]); // 5093
        g.V_16cc = g.s(1.0); // 5094
        L_BP60 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5095
        g.V_0f10 = g.s(1.0); // 5096
        lim1 = g.s(L_BP60);
        passo1 = g.s(1);
        if (passo1 >= 0 ? g.V_0f10 > lim1 : g.V_0f10 < lim1) {
          pc = 463;
          continue;
        }
        pc = 462;
        continue;
      case 462:
        g.V_1780 = g.s(g.V_0f10); // 5097
        g.V_1784 = g.s(g.V_0f10 - 1.0); // 5098
        g.V_1788 = g.s(g.V_0f10 + 1.0); // 5099
        if (!(g.V_1784 === 0.0)) {
          pc = 7;
          continue;
        } // 5100
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5101
        pc = 7;
        continue;
      case 7:
        // L_406e7
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 8;
          continue;
        } // 5103
        g.V_1788 = g.s(1.0); // 5104
        pc = 8;
        continue;
      case 8:
        // L_40730
        g.V_1760 = g.s(g.A_15b0.get(qbCint(g.V_1780))); // 5106
        g.V_1764 = g.s(g.A_15de.get(qbCint(g.V_1780))); // 5107
        g.V_1750 = g.s(g.A_15b0.get(qbCint(g.V_1784))); // 5108
        g.V_1754 = g.s(g.A_15de.get(qbCint(g.V_1784))); // 5109
        g.V_1758 = g.s(g.A_15b0.get(qbCint(g.V_1788))); // 5110
        g.V_175c = g.s(g.A_15de.get(qbCint(g.V_1788))); // 5111
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1780)) === 1)) {
          pc = 9;
          continue;
        } // 5112
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5113
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.A_160c.get(0, 0)), 0); // 5114
        g.A_160c.set(g.s((g.V_1760 + g.V_1758) / 2.0), qbCint(g.A_160c.get(0, 0)), 2); // 5115
        g.A_160c.set(g.s((g.V_1764 + g.V_175c) / 2.0), qbCint(g.A_160c.get(0, 0)), 3); // 5116
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5117
        g.A_160c.set(g.s(-g.V_1788), qbCint(g.A_160c.get(0, 0)), 0); // 5118
        g.A_160c.set(g.s((g.V_1760 + g.V_1758) / 2.0), qbCint(g.A_160c.get(0, 0)), 2); // 5119
        g.A_160c.set(g.s((g.V_1764 + g.V_175c) / 2.0), qbCint(g.A_160c.get(0, 0)), 3); // 5120
        pc = 9;
        continue;
      case 9:
        // L_40a3b
        g.V_16bc = g.s(1.0); // 5122
        g.V_1790 = g.s(g.V_1784); // 5123
        g.V_1794 = g.s(g.V_1780); // 5124
        g.V_1798 = g.s(g.V_1780); // 5125
        g.V_179c = g.s(g.V_1788); // 5126
        S_21e5d(g); // 5127
        g.V_0f1c = ""; // 5129
        L_BP64 = g.s(g.V_16a8 / 1.0); // 5130
        L_BP68 = g.s(g.V_16b0 / 1.0); // 5131
        L_BP6c = g.s(L_BP64 > L_BP68 ? L_BP64 : L_BP68); // 5132
        L_BP70 = g.s(g.V_16a8 / 1.0); // 5134
        L_BP74 = g.s(g.V_16b0 / 1.0); // 5135
        L_BP78 = g.s(L_BP70 < L_BP74 ? L_BP70 : L_BP74); // 5136
        if (!(Math.abs(L_BP6c - L_BP78 - g.V_0e68_pi) < g.V_133e)) {
          pc = 10;
          continue;
        } // 5138
        g.V_0f1c = "NAO"; // 5139
        pc = 10;
        continue;
      case 10:
        // L_40b4b
        g.V_1688 = g.V_16a0; // 5141
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 11;
          continue;
        } // 5142
        g.V_0f1c = "NAO"; // 5143
        pc = 11;
        continue;
      case 11:
        // L_40bd8
        pc = 12;
        continue;
      case 12:
        // L_40bdd
        g.V_16c4 = g.s(1.0); // 5146
        g.V_1790 = g.s(g.V_1788 - 1.0); // 5147
        if (!(g.V_1790 === 0.0)) {
          pc = 13;
          continue;
        } // 5148
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5149
        pc = 13;
        continue;
      case 13:
        // L_40c53
        g.V_1794 = g.s(g.V_1788); // 5151
        g.V_1798 = g.s(g.V_1788); // 5152
        g.V_179c = g.s(g.V_1788 + 1.0); // 5153
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 14;
          continue;
        } // 5154
        g.V_179c = g.s(1.0); // 5155
        pc = 14;
        continue;
      case 14:
        // L_40cd4
        S_21e5d(g); // 5157
        L_BP7c = g.s(g.V_16a8 / 1.0); // 5159
        L_BP80 = g.s(g.V_16b0 / 1.0); // 5160
        L_BP84 = g.s(L_BP7c > L_BP80 ? L_BP7c : L_BP80); // 5161
        L_BP88 = g.s(g.V_16a8 / 1.0); // 5163
        L_BP8c = g.s(g.V_16b0 / 1.0); // 5164
        L_BP90 = g.s(L_BP88 < L_BP8c ? L_BP88 : L_BP8c); // 5165
        if (!(Math.abs(L_BP84 - L_BP90 - g.V_0e68_pi) < g.V_133e)) {
          pc = 17;
          continue;
        } // 5167
        g.V_1788 = g.s(g.V_1788 + 1.0); // 5168
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 15;
          continue;
        } // 5169
        g.V_1788 = g.s(1.0); // 5170
        pc = 15;
        continue;
      case 15:
        // L_40dcd
        L_BP92 = qbCint(g.V_1788 !== g.V_1780 ? -1 : 0); // 5172
        if (!((qbCint(g.V_0f1c !== "NAO" ? -1 : 0) & qbCint(L_BP92)) !== 0)) {
          pc = 16;
          continue;
        } // 5173
        g.V_1758 = g.s(g.A_15b0.get(qbCint(g.V_1788))); // 5174
        g.V_175c = g.s(g.A_15de.get(qbCint(g.V_1788))); // 5175
        pc = 12;
        continue; // 5176
      case 16:
        // L_40e68
        g.V_0f1c = "NAO"; // 5178
        pc = 17;
        continue;
      case 17:
        // L_40e7f
        g.V_1690 = g.V_16a0; // 5180
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 18;
          continue;
        } // 5181
        g.V_0f1c = "NAO"; // 5182
        pc = 18;
        continue;
      case 18:
        // L_40f0c
        g.V_17e0 = g.V_1760; // 5184
        g.V_17f0 = g.V_1764; // 5185
        g.V_1678 = g.V_1688; // 5186
        g.V_17e8 = g.V_1758; // 5187
        g.V_17f8 = g.V_175c; // 5188
        g.V_1680 = g.V_1690; // 5189
        S_23341(g); // 5190
        L_BP96 = g.V_0f18; // 5192
        g.V_1710 = g.V_0ef4; // 5193
        g.V_1718 = g.V_0efc; // 5194
        L_BP98 = qbCint(L_BP96 !== "NAO" ? -1 : 0); // 5195
        if (!((qbCint(g.V_0f1c !== "NAO" ? -1 : 0) & qbCint(L_BP98)) !== 0)) {
          pc = 22;
          continue;
        } // 5196
        g.A_163a.set(g.s(g.V_1710), qbCint(g.V_1780), 0); // 5197
        g.A_163a.set(g.s(g.V_1718), qbCint(g.V_1780), 1); // 5198
        g.V_1790 = g.s(g.V_1784); // 5199
        g.V_1794 = g.s(g.V_1780); // 5200
        g.V_1798 = g.s(g.V_1788); // 5201
        g.V_179c = g.s(g.V_1788 + 1.0); // 5202
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 19;
          continue;
        } // 5203
        g.V_179c = g.s(1.0); // 5204
        pc = 19;
        continue;
      case 19:
        // L_410d5
        S_21e5d(g); // 5206
        g.A_163a.set(g.s(g.V_16a0), qbCint(g.V_1780), 2); // 5208
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) !== 1 &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 20;
          continue;
        } // 5209
        g.A_163a.set(g.s(g.V_16a8), qbCint(g.V_1780), 2); // 5210
        pc = 20;
        continue;
      case 20:
        // L_41199
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) !== 1 &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1
          )
        ) {
          pc = 21;
          continue;
        } // 5212
        g.A_163a.set(g.s(g.V_16b0), qbCint(g.V_1780), 2); // 5213
        pc = 21;
        continue;
      case 21:
        // L_4122b
        pc = 23;
        continue; // 5215
      case 22:
        // L_41233
        g.A_163a.set(g.s(100.0), qbCint(g.V_1780), 2); // 5217
        pc = 23;
        continue;
      case 23:
        // L_41260
        g.V_0f10 = g.s(g.V_0f10 + passo1); // 5219
        if (passo1 >= 0 ? g.V_0f10 <= lim1 : g.V_0f10 >= lim1) {
          pc = 462;
          continue;
        }
        pc = 463;
        continue;
      case 463:
        L_BP9c = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5220
        g.V_0f10 = g.s(1.0); // 5221
        lim2 = g.s(L_BP9c);
        passo2 = g.s(1);
        if (passo2 >= 0 ? g.V_0f10 > lim2 : g.V_0f10 < lim2) {
          pc = 465;
          continue;
        }
        pc = 464;
        continue;
      case 464:
        g.V_1780 = g.s(g.V_0f10); // 5222
        g.V_1784 = g.s(g.V_0f10 - 1.0); // 5223
        g.V_1788 = g.s(g.V_0f10 + 1.0); // 5224
        if (!(g.V_1784 === 0.0)) {
          pc = 24;
          continue;
        } // 5225
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5226
        pc = 24;
        continue;
      case 24:
        // L_41349
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 25;
          continue;
        } // 5228
        g.V_1788 = g.s(1.0); // 5229
        pc = 25;
        continue;
      case 25:
        // L_41392
        g.V_1760 = g.s(g.A_15b0.get(qbCint(g.V_1780))); // 5231
        g.V_1764 = g.s(g.A_15de.get(qbCint(g.V_1780))); // 5232
        pc = 26;
        continue;
      case 26:
        // L_413e5
        g.V_1758 = g.s(g.A_15b0.get(qbCint(g.V_1788))); // 5234
        g.V_175c = g.s(g.A_15de.get(qbCint(g.V_1788))); // 5235
        if (!(g.A_163a.get(qbCint(g.V_1788), 2) === 100.0)) {
          pc = 30;
          continue;
        } // 5236
        g.V_1790 = g.s(g.V_1788 - 1.0); // 5237
        if (!(g.V_1790 === 0.0)) {
          pc = 27;
          continue;
        } // 5238
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5239
        pc = 27;
        continue;
      case 27:
        // L_414ca
        g.V_1794 = g.s(g.V_1788); // 5241
        g.V_1798 = g.s(g.V_1788); // 5242
        g.V_179c = g.s(g.V_1788 + 1.0); // 5243
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 28;
          continue;
        } // 5244
        g.V_179c = g.s(1.0); // 5245
        pc = 28;
        continue;
      case 28:
        // L_4154b
        S_21e5d(g); // 5247
        L_BPa0 = g.s(g.V_16a8 / 1.0); // 5249
        L_BPa4 = g.s(g.V_16b0 / 1.0); // 5250
        L_BPa8 = g.s(L_BPa0 > L_BPa4 ? L_BPa0 : L_BPa4); // 5251
        L_BPac = g.s(g.V_16a8 / 1.0); // 5253
        L_BPb0 = g.s(g.V_16b0 / 1.0); // 5254
        L_BPb4 = g.s(L_BPac < L_BPb0 ? L_BPac : L_BPb0); // 5255
        if (!(Math.abs(L_BPa8 - L_BPb4 - g.V_0e68_pi) < g.V_133e)) {
          pc = 29;
          continue;
        } // 5257
        g.V_1788 = g.s(g.V_179c); // 5258
        pc = 26;
        continue; // 5259
      case 29:
        // L_41607
        pc = 30;
        continue;
      case 30:
        // L_4160c
        pc = 31;
        continue;
      case 31:
        // L_41611
        g.V_1750 = g.s(g.A_15b0.get(qbCint(g.V_1784))); // 5263
        g.V_1754 = g.s(g.A_15de.get(qbCint(g.V_1784))); // 5264
        if (!(g.A_163a.get(qbCint(g.V_1784), 2) === 100.0)) {
          pc = 35;
          continue;
        } // 5265
        g.V_16c0 = g.s(1.0); // 5266
        g.V_1790 = g.s(g.V_1784 - 1.0); // 5267
        if (!(g.V_1790 === 0.0)) {
          pc = 32;
          continue;
        } // 5268
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5269
        pc = 32;
        continue;
      case 32:
        // L_41707
        g.V_1794 = g.s(g.V_1784); // 5271
        g.V_1798 = g.s(g.V_1784); // 5272
        g.V_179c = g.s(g.V_1784 + 1.0); // 5273
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 33;
          continue;
        } // 5274
        g.V_179c = g.s(1.0); // 5275
        pc = 33;
        continue;
      case 33:
        // L_41788
        S_21e5d(g); // 5277
        L_BPb8 = g.s(g.V_16a8 / 1.0); // 5279
        L_BPbc = g.s(g.V_16b0 / 1.0); // 5280
        L_BPc0 = g.s(L_BPb8 > L_BPbc ? L_BPb8 : L_BPbc); // 5281
        L_BPc4 = g.s(g.V_16a8 / 1.0); // 5283
        L_BPc8 = g.s(g.V_16b0 / 1.0); // 5284
        L_BPcc = g.s(L_BPc4 < L_BPc8 ? L_BPc4 : L_BPc8); // 5285
        if (!(Math.abs(L_BPc0 - L_BPcc - g.V_0e68_pi) < g.V_133e)) {
          pc = 34;
          continue;
        } // 5287
        g.V_1784 = g.s(g.V_1790); // 5288
        pc = 31;
        continue; // 5289
      case 34:
        // L_41844
        pc = 35;
        continue;
      case 35:
        // L_41849
        if (!(g.A_163a.get(qbCint(g.V_1780), 2) !== 100.0)) {
          pc = 40;
          continue;
        } // 5292
        if (!(g.A_163a.get(qbCint(g.V_1784), 2) !== 100.0)) {
          pc = 37;
          continue;
        } // 5293
        if (
          !(
            g.pot(g.A_163a.get(qbCint(g.V_1780), 0) - g.V_1760, 2.0) +
              g.pot(g.A_163a.get(qbCint(g.V_1780), 1) - g.V_1764, 2.0) >=
            g.pot(g.A_163a.get(qbCint(g.V_1784), 0) - g.V_1760, 2.0) +
              g.pot(g.A_163a.get(qbCint(g.V_1784), 1) - g.V_1764, 2.0)
          )
        ) {
          pc = 36;
          continue;
        } // 5294
        g.A_1342.set(qbCint(100), qbCint(g.V_1780), 0); // 5295
        pc = 36;
        continue;
      case 36:
        // L_419ab
        pc = 37;
        continue;
      case 37:
        // L_419b0
        if (!(g.A_163a.get(qbCint(g.V_1788), 2) !== 100.0)) {
          pc = 39;
          continue;
        } // 5298
        if (
          !(
            g.pot(g.A_163a.get(qbCint(g.V_1780), 0) - g.V_1758, 2.0) +
              g.pot(g.A_163a.get(qbCint(g.V_1780), 1) - g.V_175c, 2.0) >=
            g.pot(g.A_163a.get(qbCint(g.V_1788), 0) - g.V_1758, 2.0) +
              g.pot(g.A_163a.get(qbCint(g.V_1788), 1) - g.V_175c, 2.0)
          )
        ) {
          pc = 38;
          continue;
        } // 5299
        g.A_1342.set(qbCint(100), qbCint(g.V_1780), 0); // 5300
        pc = 38;
        continue;
      case 38:
        // L_41ae0
        pc = 39;
        continue;
      case 39:
        // L_41ae5
        pc = 40;
        continue;
      case 40:
        // L_41aea
        g.V_0f10 = g.s(g.V_0f10 + passo2); // 5304
        if (passo2 >= 0 ? g.V_0f10 <= lim2 : g.V_0f10 >= lim2) {
          pc = 464;
          continue;
        }
        pc = 465;
        continue;
      case 465:
        L_BPd0 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5305
        g.V_0f10 = g.s(1.0); // 5306
        lim3 = g.s(L_BPd0);
        passo3 = g.s(1);
        if (passo3 >= 0 ? g.V_0f10 > lim3 : g.V_0f10 < lim3) {
          pc = 467;
          continue;
        }
        pc = 466;
        continue;
      case 466:
        if (!(g.A_1342.get(qbCint(g.V_0f10), 0) === 100)) {
          pc = 41;
          continue;
        } // 5307
        g.A_163a.set(g.s(100.0), qbCint(g.V_0f10), 2); // 5308
        pc = 41;
        continue;
      case 41:
        // L_41ba0
        g.V_0f10 = g.s(g.V_0f10 + passo3); // 5310
        if (passo3 >= 0 ? g.V_0f10 <= lim3 : g.V_0f10 >= lim3) {
          pc = 466;
          continue;
        }
        pc = 467;
        continue;
      case 467:
        g.V_0f10 = g.s(1.0); // 5311
        pc = 42;
        continue;
      case 42:
        // L_41be0
        g.V_1780 = g.s(g.V_0f10); // 5313
        g.V_0ef4 = 0.0; // 5314
        if (!(g.A_163a.get(qbCint(g.V_1780), 2) !== 100.0)) {
          pc = 48;
          continue;
        } // 5315
        g.V_1788 = g.s(g.V_0f10 + 1.0); // 5316
        pc = 43;
        continue;
      case 43:
        // L_41c4f
        g.V_0ef4 = g.V_0ef4 + 1.0; // 5318
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 44;
          continue;
        } // 5319
        g.V_1788 = g.s(1.0); // 5320
        pc = 44;
        continue;
      case 44:
        // L_41cb3
        g.V_1790 = g.s(g.V_1788 - 1.0); // 5322
        if (!(g.V_1790 === 0.0)) {
          pc = 45;
          continue;
        } // 5323
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5324
        pc = 45;
        continue;
      case 45:
        // L_41d13
        g.V_1794 = g.s(g.V_1788); // 5326
        g.V_1798 = g.s(g.V_1788); // 5327
        g.V_179c = g.s(g.V_1788 + 1.0); // 5328
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 46;
          continue;
        } // 5329
        g.V_179c = g.s(1.0); // 5330
        pc = 46;
        continue;
      case 46:
        // L_41d94
        S_21e5d(g); // 5332
        L_BPd4 = g.s(g.V_16a8 / 1.0); // 5334
        L_BPd8 = g.s(g.V_16b0 / 1.0); // 5335
        L_BPdc = g.s(L_BPd4 > L_BPd8 ? L_BPd4 : L_BPd8); // 5336
        L_BPe0 = g.s(g.V_16a8 / 1.0); // 5338
        L_BPe4 = g.s(g.V_16b0 / 1.0); // 5339
        L_BPe8 = g.s(L_BPe0 < L_BPe4 ? L_BPe0 : L_BPe4); // 5340
        if (!(Math.abs(L_BPdc - L_BPe8 - g.V_0e68_pi) < g.V_133e)) {
          pc = 47;
          continue;
        } // 5342
        g.V_1788 = g.s(g.V_1788 + 1.0); // 5343
        pc = 43;
        continue; // 5344
      case 47:
        // L_41e55
        g.A_163a.set(g.s(g.A_163a.get(qbCint(g.V_1780), 0)), qbCint(g.V_1788), 0); // 5346
        g.A_163a.set(g.s(g.A_163a.get(qbCint(g.V_1780), 1)), qbCint(g.V_1788), 1); // 5347
        g.A_163a.set(g.s(g.A_163a.get(qbCint(g.V_1780), 2)), qbCint(g.V_1788), 2); // 5348
        g.V_0f10 = g.s(g.V_0f10 + g.V_0ef4); // 5349
        pc = 48;
        continue;
      case 48:
        // L_41f37
        g.V_0f10 = g.s(g.V_0f10 + 1.0); // 5351
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) - 1 < g.V_0f10)) {
          pc = 42;
          continue;
        } // 5352
        g.A_1342 = g.matriz("%", []); // 5353
        g.A_1342 = g.matriz("%", [
          [0, g.V_0e50],
          [0, 30],
        ]); // 5354
        L_BPec = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5355
        g.V_0f10 = g.s(1.0); // 5356
        lim4 = g.s(L_BPec);
        passo4 = g.s(1);
        if (passo4 >= 0 ? g.V_0f10 > lim4 : g.V_0f10 < lim4) {
          pc = 469;
          continue;
        }
        pc = 468;
        continue;
      case 468:
        g.V_1794 = g.s(g.V_0f10); // 5357
        g.V_1798 = g.s(g.V_0f10); // 5358
        g.V_1790 = g.s(g.V_0f10 - 1.0); // 5359
        g.V_179c = g.s(g.V_0f10 + 1.0); // 5360
        if (!(g.V_1790 === 0.0)) {
          pc = 49;
          continue;
        } // 5361
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5362
        pc = 49;
        continue;
      case 49:
        // L_42086
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 50;
          continue;
        } // 5364
        g.V_179c = g.s(1.0); // 5365
        pc = 50;
        continue;
      case 50:
        // L_420cf
        S_21e5d(g); // 5367
        g.V_0f1c = ""; // 5369
        if (!(g.V_16a8 < g.V_16b0)) {
          pc = 52;
          continue;
        } // 5370
        if (!(g.V_16a8 + g.V_0e68_pi < g.V_16b0)) {
          pc = 51;
          continue;
        } // 5371
        g.V_0f1c = "NAO"; // 5372
        pc = 51;
        continue;
      case 51:
        // L_42138
        pc = 54;
        continue; // 5374
      case 52:
        // L_42140
        if (!(g.V_16b0 + g.V_0e68_pi > g.V_16a8)) {
          pc = 53;
          continue;
        } // 5376
        g.V_0f1c = "NAO"; // 5377
        pc = 53;
        continue;
      case 53:
        // L_42172
        pc = 54;
        continue;
      case 54:
        // L_42177
        if (!(g.A_163a.get(qbCint(g.V_0f10), 2) !== 100.0 && g.V_0f1c === "NAO")) {
          pc = 71;
          continue;
        } // 5380
        g.V_1790 = g.s(g.V_0f10); // 5381
        g.V_17e0 = g.A_163a.get(qbCint(g.V_1790), 0); // 5382
        g.V_17f0 = g.A_163a.get(qbCint(g.V_1790), 1); // 5383
        g.V_1678 = g.A_163a.get(qbCint(g.V_1790), 2); // 5384
        g.V_1794 = g.s(g.V_1790); // 5385
        pc = 55;
        continue;
      case 55:
        // L_4226e
        g.V_1794 = g.s(g.V_1794 + 1.0); // 5387
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1794)) {
          pc = 56;
          continue;
        } // 5388
        g.V_1794 = g.s(1.0); // 5389
        pc = 56;
        continue;
      case 56:
        // L_422cd
        if (
          !(
            g.A_163a.get(qbCint(g.V_1794), 2) === g.A_163a.get(qbCint(g.V_1790), 2) &&
            g.A_163a.get(qbCint(g.V_1794), 1) === g.A_163a.get(qbCint(g.V_1790), 1) &&
            g.A_163a.get(qbCint(g.V_1794), 0) === g.A_163a.get(qbCint(g.V_1790), 0)
          )
        ) {
          pc = 57;
          continue;
        } // 5391
        pc = 58;
        continue; // 5392
      case 57:
        // L_423c6
        pc = 55;
        continue; // 5394
      case 58:
        // L_423ce
        g.V_1798 = g.s(g.V_1790); // 5396
        pc = 59;
        continue;
      case 59:
        // L_423e4
        g.V_1798 = g.s(g.V_1798 + 1.0); // 5398
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1798)) {
          pc = 60;
          continue;
        } // 5399
        g.V_1798 = g.s(1.0); // 5400
        pc = 60;
        continue;
      case 60:
        // L_42443
        if (
          !(
            g.A_163a.get(qbCint(g.V_1798), 2) !== g.A_163a.get(qbCint(g.V_1790), 2) ||
            g.A_163a.get(qbCint(g.V_1798), 1) !== g.A_163a.get(qbCint(g.V_1790), 1) ||
            g.A_163a.get(qbCint(g.V_1798), 0) !== g.A_163a.get(qbCint(g.V_1790), 0)
          )
        ) {
          pc = 61;
          continue;
        } // 5402
        pc = 62;
        continue; // 5403
      case 61:
        // L_4253c
        pc = 59;
        continue; // 5405
      case 62:
        // L_42544
        if (!(g.A_163a.get(qbCint(g.V_1798), 2) !== 100.0)) {
          pc = 64;
          continue;
        } // 5407
        g.V_17e8 = g.A_163a.get(qbCint(g.V_1798), 0); // 5408
        g.V_17f8 = g.A_163a.get(qbCint(g.V_1798), 1); // 5409
        g.V_1680 = g.A_163a.get(qbCint(g.V_1798), 2); // 5410
        S_23341(g); // 5411
        L_BPee = qbCint(g.V_0f18 === "" ? -1 : 0); // 5413
        if (
          !(
            (qbCint(
              g.pot(g.V_0ef4 - g.A_15b0.get(qbCint(g.V_1790)), 2.0) +
                g.pot(g.V_0efc - g.A_15de.get(qbCint(g.V_1790)), 2.0) <
                g.pot(g.A_163a.get(qbCint(g.V_1790), 0) - g.A_15b0.get(qbCint(g.V_1790)), 2.0) +
                  g.pot(g.A_163a.get(qbCint(g.V_1790), 1) - g.A_15de.get(qbCint(g.V_1790)), 2.0)
                ? -1
                : 0,
            ) &
              qbCint(L_BPee)) !==
            0
          )
        ) {
          pc = 63;
          continue;
        } // 5414
        g.A_163a.set(g.s(100.0), qbCint(g.V_1790), 2); // 5415
        g.A_163a.set(g.s(100.0), qbCint(g.V_1794), 2); // 5416
        pc = 72;
        continue; // 5417
      case 63:
        // L_42781
        pc = 64;
        continue;
      case 64:
        // L_42786
        g.V_1798 = g.s(g.V_1790); // 5420
        pc = 65;
        continue;
      case 65:
        // L_4279c
        g.V_1798 = g.s(g.V_1798 - 1.0); // 5422
        if (!(g.V_1798 === 0.0)) {
          pc = 66;
          continue;
        } // 5423
        g.V_1798 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5424
        pc = 66;
        continue;
      case 66:
        // L_427fc
        if (
          !(
            g.A_163a.get(qbCint(g.V_1798), 2) !== g.A_163a.get(qbCint(g.V_1790), 2) ||
            g.A_163a.get(qbCint(g.V_1798), 1) !== g.A_163a.get(qbCint(g.V_1790), 1) ||
            g.A_163a.get(qbCint(g.V_1798), 0) !== g.A_163a.get(qbCint(g.V_1790), 0)
          )
        ) {
          pc = 67;
          continue;
        } // 5426
        pc = 68;
        continue; // 5427
      case 67:
        // L_428f5
        pc = 65;
        continue; // 5429
      case 68:
        // L_428fe
        if (!(g.A_163a.get(qbCint(g.V_1798), 2) !== 100.0)) {
          pc = 70;
          continue;
        } // 5431
        g.V_17e8 = g.A_163a.get(qbCint(g.V_1798), 0); // 5432
        g.V_17f8 = g.A_163a.get(qbCint(g.V_1798), 1); // 5433
        g.V_1680 = g.A_163a.get(qbCint(g.V_1798), 2); // 5434
        S_23341(g); // 5435
        L_BPf0 = qbCint(g.V_0f18 === "" ? -1 : 0); // 5437
        if (
          !(
            (qbCint(
              g.pot(g.V_0ef4 - g.A_15b0.get(qbCint(g.V_1790)), 2.0) +
                g.pot(g.V_0efc - g.A_15de.get(qbCint(g.V_1790)), 2.0) <
                g.pot(g.A_163a.get(qbCint(g.V_1790), 0) - g.A_15b0.get(qbCint(g.V_1790)), 2.0) +
                  g.pot(g.A_163a.get(qbCint(g.V_1790), 1) - g.A_15de.get(qbCint(g.V_1790)), 2.0)
                ? -1
                : 0,
            ) &
              qbCint(L_BPf0)) !==
            0
          )
        ) {
          pc = 69;
          continue;
        } // 5438
        g.A_163a.set(g.s(100.0), qbCint(g.V_1790), 2); // 5439
        g.A_163a.set(g.s(100.0), qbCint(g.V_1794), 2); // 5440
        pc = 69;
        continue;
      case 69:
        // L_42b33
        pc = 70;
        continue;
      case 70:
        // L_42b38
        pc = 71;
        continue;
      case 71:
        // L_42b3d
        pc = 72;
        continue;
      case 72:
        // L_42b42
        g.V_0f10 = g.s(g.V_0f10 + passo4); // 5445
        if (passo4 >= 0 ? g.V_0f10 <= lim4 : g.V_0f10 >= lim4) {
          pc = 468;
          continue;
        }
        pc = 469;
        continue;
      case 469:
        L_BPf4 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5446
        g.V_0f10 = g.s(1.0); // 5447
        lim5 = g.s(L_BPf4);
        passo5 = g.s(1);
        if (passo5 >= 0 ? g.V_0f10 > lim5 : g.V_0f10 < lim5) {
          pc = 471;
          continue;
        }
        pc = 470;
        continue;
      case 470:
        g.V_1780 = g.s(g.V_0f10); // 5448
        g.V_1784 = g.s(g.V_0f10 - 1.0); // 5449
        g.V_1788 = g.s(g.V_0f10 + 1.0); // 5450
        if (!(g.V_1784 === 0.0)) {
          pc = 73;
          continue;
        } // 5451
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5452
        pc = 73;
        continue;
      case 73:
        // L_42c31
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 74;
          continue;
        } // 5454
        g.V_1788 = g.s(1.0); // 5455
        pc = 74;
        continue;
      case 74:
        // L_42c7a
        g.V_16bc = g.s(1.0); // 5457
        g.V_1760 = g.s(g.A_15b0.get(qbCint(g.V_1780))); // 5458
        g.V_1764 = g.s(g.A_15de.get(qbCint(g.V_1780))); // 5459
        g.V_16b8 = g.s(g.A_160c.get(0, 0)); // 5460
        g.V_1790 = g.s(g.V_1784); // 5461
        g.V_1794 = g.s(g.V_1780); // 5462
        g.V_1798 = g.s(g.V_1780); // 5463
        g.V_179c = g.s(g.V_1788); // 5464
        pc = 75;
        continue;
      case 75:
        // L_42d42
        S_21e5d(g); // 5466
        L_BPf8 = g.s(g.V_16a8 / 1.0); // 5468
        L_BPfc = g.s(g.V_16b0 / 1.0); // 5469
        L_BP100 = g.s(L_BPf8 > L_BPfc ? L_BPf8 : L_BPfc); // 5470
        L_BP104 = g.s(g.V_16a8 / 1.0); // 5472
        L_BP108 = g.s(g.V_16b0 / 1.0); // 5473
        L_BP10c = g.s(L_BP104 < L_BP108 ? L_BP104 : L_BP108); // 5474
        if (!(Math.abs(L_BP100 - L_BP10c - g.V_0e68_pi) < g.V_133e && g.V_1794 === g.V_1798)) {
          pc = 76;
          continue;
        } // 5476
        pc = 262;
        continue; // 5477
      case 76:
        // L_42e10
        g.V_1688 = g.V_16a0; // 5479
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1 &&
            g.V_16bc === 1.0
          )
        ) {
          pc = 77;
          continue;
        } // 5480
        pc = 262;
        continue; // 5481
      case 77:
        // L_42eb0
        if (
          !(
            (g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 ||
              g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1) &&
            g.V_16bc === 1.0
          )
        ) {
          pc = 81;
          continue;
        } // 5483
        pilha.push(472);
        pc = 404;
        continue; // 5484
      case 472:
        if (!(g.V_0f18 === "NAO")) {
          pc = 80;
          continue;
        } // 5485
        if (
          !(
            g.pot(g.A_15b0.get(qbCint(g.V_1790)) - g.V_0ef4, 2.0) +
              g.pot(g.A_15de.get(qbCint(g.V_1790)) - g.V_0efc, 2.0) <
            g.pot(g.A_15b0.get(qbCint(g.V_1794)) - g.V_0ef4, 2.0) +
              g.pot(g.A_15de.get(qbCint(g.V_1794)) - g.V_0efc, 2.0)
          )
        ) {
          pc = 78;
          continue;
        } // 5486
        pc = 262;
        continue; // 5487
      case 78:
        // L_4302a
        if (
          !(
            g.pot(g.A_15b0.get(qbCint(g.V_179c)) - g.V_0ef4, 2.0) +
              g.pot(g.A_15de.get(qbCint(g.V_179c)) - g.V_0efc, 2.0) <
            g.pot(g.A_15b0.get(qbCint(g.V_1798)) - g.V_0ef4, 2.0) +
              g.pot(g.A_15de.get(qbCint(g.V_1798)) - g.V_0efc, 2.0)
          )
        ) {
          pc = 79;
          continue;
        } // 5489
        pc = 262;
        continue; // 5490
      case 79:
        // L_430f9
        pc = 80;
        continue;
      case 80:
        // L_430fe
        g.V_16bc = g.s(2.0); // 5493
        g.V_1760 = g.s(g.V_0ef4); // 5494
        g.V_1764 = g.s(g.V_0efc); // 5495
        g.V_1688 = g.V_1670; // 5496
        pc = 81;
        continue;
      case 81:
        // L_43147
        g.V_16c0 = g.s(0.0); // 5498
        g.V_16c4 = g.s(0.0); // 5499
        L_BP110 = ""; // 5500
        pc = 82;
        continue;
      case 82:
        // L_43181
        if (
          !(
            (g.A_163a.get(qbCint(g.V_1780), 1) === g.A_163a.get(qbCint(g.V_1784), 1) &&
              g.A_163a.get(qbCint(g.V_1780), 0) === g.A_163a.get(qbCint(g.V_1784), 0)) ||
            g.A_163a.get(qbCint(g.V_1784), 2) === 100.0
          )
        ) {
          pc = 90;
          continue;
        } // 5502
        pc = 83;
        continue;
      case 83:
        // L_43265
        g.V_16c0 = g.s(1.0); // 5504
        g.V_1790 = g.s(g.V_1784 - 1.0); // 5505
        if (!(g.V_1790 === 0.0)) {
          pc = 84;
          continue;
        } // 5506
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5507
        pc = 84;
        continue;
      case 84:
        // L_432db
        g.V_1794 = g.s(g.V_1784); // 5509
        g.V_1798 = g.s(g.V_1784); // 5510
        g.V_179c = g.s(g.V_1784 + 1.0); // 5511
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 85;
          continue;
        } // 5512
        g.V_179c = g.s(1.0); // 5513
        pc = 85;
        continue;
      case 85:
        // L_4335c
        S_21e5d(g); // 5515
        L_BP114 = g.s(g.V_16a8 / 1.0); // 5517
        L_BP118 = g.s(g.V_16b0 / 1.0); // 5518
        L_BP11c = g.s(L_BP114 > L_BP118 ? L_BP114 : L_BP118); // 5519
        L_BP120 = g.s(g.V_16a8 / 1.0); // 5521
        L_BP124 = g.s(g.V_16b0 / 1.0); // 5522
        L_BP128 = g.s(L_BP120 < L_BP124 ? L_BP120 : L_BP124); // 5523
        if (
          !(
            (g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) !== 1 &&
              Math.abs(L_BP11c - L_BP128 - g.V_0e68_pi) < g.V_133e) ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1
          )
        ) {
          pc = 87;
          continue;
        } // 5525
        g.V_1784 = g.s(g.V_1784 - 1.0); // 5526
        if (!(g.V_1784 === 0.0)) {
          pc = 86;
          continue;
        } // 5527
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5528
        pc = 86;
        continue;
      case 86:
        // L_434c6
        pc = 82;
        continue; // 5530
      case 87:
        // L_434d3
        g.V_1750 = g.s(g.A_15b0.get(qbCint(g.V_1784))); // 5532
        g.V_1754 = g.s(g.A_15de.get(qbCint(g.V_1784))); // 5533
        g.V_1698 = g.V_16a0; // 5534
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1 &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1
          )
        ) {
          pc = 88;
          continue;
        } // 5535
        L_BP110 = "NAO"; // 5536
        pc = 88;
        continue;
      case 88:
        // L_435af
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 89;
          continue;
        } // 5538
        pilha.push(473);
        pc = 404;
        continue; // 5539
      case 473:
        g.V_16c0 = g.s(3.0); // 5540
        g.V_1750 = g.s(g.V_0ef4); // 5541
        g.V_1754 = g.s(g.V_0efc); // 5542
        g.V_1698 = g.V_1670; // 5543
        g.V_17a8 = g.s(g.V_1784 - g.V_1794); // 5544
        g.V_1784 = g.s(g.V_1794); // 5545
        pc = 89;
        continue;
      case 89:
        // L_43696
        pc = 95;
        continue; // 5547
      case 90:
        // L_4369e
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5549
        g.A_160c.set(g.s(-g.V_1784), qbCint(g.A_160c.get(0, 0)), 0); // 5550
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1784), 0)), qbCint(g.A_160c.get(0, 0)), 2); // 5551
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1784), 1)), qbCint(g.A_160c.get(0, 0)), 3); // 5552
        g.V_17a8 = g.s(g.V_1784); // 5553
        pc = 91;
        continue;
      case 91:
        // L_437c8
        g.V_1784 = g.s(g.V_1784 - 1.0); // 5555
        if (!(g.V_1784 === 0.0)) {
          pc = 92;
          continue;
        } // 5556
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5557
        pc = 92;
        continue;
      case 92:
        // L_4382d
        if (!(g.V_1784 === g.V_1780)) {
          pc = 93;
          continue;
        } // 5559
        g.V_1784 = g.s(g.V_17a8); // 5560
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 5561
        pc = 83;
        continue; // 5562
      case 93:
        // L_43895
        if (
          !(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 3) !== g.A_163a.get(qbCint(g.V_1784), 1) ||
            g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 2) !== g.A_163a.get(qbCint(g.V_1784), 0)
          )
        ) {
          pc = 94;
          continue;
        } // 5564
        pc = 91;
        continue; // 5565
      case 94:
        // L_4395f
        g.V_17a8 = g.s(g.V_17a8 - g.V_1784); // 5567
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5568
        g.A_160c.set(g.s(-g.V_1784), qbCint(g.A_160c.get(0, 0)), 0); // 5569
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1784), 0)), qbCint(g.A_160c.get(0, 0)), 2); // 5570
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1784), 1)), qbCint(g.A_160c.get(0, 0)), 3); // 5571
        g.V_1750 = g.s(g.A_163a.get(qbCint(g.V_1784), 0)); // 5572
        g.V_1754 = g.s(g.A_163a.get(qbCint(g.V_1784), 1)); // 5573
        g.V_1698 = g.A_163a.get(qbCint(g.V_1784), 2); // 5574
        g.V_16c0 = g.s(2.0); // 5575
        pc = 95;
        continue;
      case 95:
        // L_43b1c
        if (!(g.V_16c4 !== 0.0)) {
          pc = 96;
          continue;
        } // 5577
        pc = 111;
        continue; // 5578
      case 96:
        // L_43b3f
        L_BP96 = ""; // 5580
        pc = 97;
        continue;
      case 97:
        // L_43b57
        if (
          !(
            (g.A_163a.get(qbCint(g.V_1780), 1) === g.A_163a.get(qbCint(g.V_1788), 1) &&
              g.A_163a.get(qbCint(g.V_1780), 0) === g.A_163a.get(qbCint(g.V_1788), 0)) ||
            g.A_163a.get(qbCint(g.V_1788), 2) === 100.0
          )
        ) {
          pc = 105;
          continue;
        } // 5582
        pc = 98;
        continue;
      case 98:
        // L_43c3b
        g.V_16c4 = g.s(1.0); // 5584
        g.V_1790 = g.s(g.V_1788 - 1.0); // 5585
        if (!(g.V_1790 === 0.0)) {
          pc = 99;
          continue;
        } // 5586
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5587
        pc = 99;
        continue;
      case 99:
        // L_43cb1
        g.V_1794 = g.s(g.V_1788); // 5589
        g.V_1798 = g.s(g.V_1788); // 5590
        g.V_179c = g.s(g.V_1788 + 1.0); // 5591
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 100;
          continue;
        } // 5592
        g.V_179c = g.s(1.0); // 5593
        pc = 100;
        continue;
      case 100:
        // L_43d32
        S_21e5d(g); // 5595
        L_BP12c = g.s(g.V_16a8 / 1.0); // 5597
        L_BP130 = g.s(g.V_16b0 / 1.0); // 5598
        L_BP134 = g.s(L_BP12c > L_BP130 ? L_BP12c : L_BP130); // 5599
        L_BP138 = g.s(g.V_16a8 / 1.0); // 5601
        L_BP13c = g.s(g.V_16b0 / 1.0); // 5602
        L_BP140 = g.s(L_BP138 < L_BP13c ? L_BP138 : L_BP13c); // 5603
        if (
          !(
            (g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) !== 1 &&
              Math.abs(L_BP134 - L_BP140 - g.V_0e68_pi) < g.V_133e) ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 102;
          continue;
        } // 5605
        g.V_1788 = g.s(g.V_1788 + 1.0); // 5606
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 101;
          continue;
        } // 5607
        g.V_1788 = g.s(1.0); // 5608
        pc = 101;
        continue;
      case 101:
        // L_43e9b
        pc = 97;
        continue; // 5610
      case 102:
        // L_43ea8
        g.V_1758 = g.s(g.A_15b0.get(qbCint(g.V_1788))); // 5612
        g.V_175c = g.s(g.A_15de.get(qbCint(g.V_1788))); // 5613
        g.V_1690 = g.V_16a0; // 5614
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1 &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1
          )
        ) {
          pc = 103;
          continue;
        } // 5615
        L_BP96 = "NAO"; // 5616
        pc = 103;
        continue;
      case 103:
        // L_43f84
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 104;
          continue;
        } // 5618
        pilha.push(474);
        pc = 404;
        continue; // 5619
      case 474:
        g.V_16c4 = g.s(3.0); // 5620
        g.V_1758 = g.s(g.V_0ef4); // 5621
        g.V_175c = g.s(g.V_0efc); // 5622
        g.V_1690 = g.V_1670; // 5623
        g.V_17ac = g.s(g.V_1798 - g.V_1788); // 5624
        g.V_1788 = g.s(g.V_1798); // 5625
        pc = 104;
        continue;
      case 104:
        // L_4406b
        pc = 110;
        continue; // 5627
      case 105:
        // L_44073
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5629
        g.A_160c.set(g.s(-g.V_1788), qbCint(g.A_160c.get(0, 0)), 0); // 5630
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1788), 0)), qbCint(g.A_160c.get(0, 0)), 2); // 5631
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1788), 1)), qbCint(g.A_160c.get(0, 0)), 3); // 5632
        g.V_17ac = g.s(g.V_1788); // 5633
        pc = 106;
        continue;
      case 106:
        // L_4419d
        g.V_1788 = g.s(g.V_1788 + 1.0); // 5635
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 107;
          continue;
        } // 5636
        g.V_1788 = g.s(1.0); // 5637
        pc = 107;
        continue;
      case 107:
        // L_44201
        if (!(g.V_1788 === g.V_1780)) {
          pc = 108;
          continue;
        } // 5639
        g.V_1788 = g.s(g.V_17ac); // 5640
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 5641
        pc = 98;
        continue; // 5642
      case 108:
        // L_44269
        if (
          !(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 3) !== g.A_163a.get(qbCint(g.V_1788), 1) ||
            g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 2) !== g.A_163a.get(qbCint(g.V_1788), 0)
          )
        ) {
          pc = 109;
          continue;
        } // 5644
        pc = 106;
        continue; // 5645
      case 109:
        // L_44333
        g.V_17ac = g.s(g.V_1788 - g.V_17ac); // 5647
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5648
        g.A_160c.set(g.s(-g.V_1788), qbCint(g.A_160c.get(0, 0)), 0); // 5649
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1788), 0)), qbCint(g.A_160c.get(0, 0)), 2); // 5650
        g.A_160c.set(g.s(g.A_163a.get(qbCint(g.V_1788), 1)), qbCint(g.A_160c.get(0, 0)), 3); // 5651
        g.V_1758 = g.s(g.A_163a.get(qbCint(g.V_1788), 0)); // 5652
        g.V_175c = g.s(g.A_163a.get(qbCint(g.V_1788), 1)); // 5653
        g.V_1690 = g.A_163a.get(qbCint(g.V_1788), 2); // 5654
        g.V_16c4 = g.s(2.0); // 5655
        pc = 110;
        continue;
      case 110:
        // L_444f0
        pc = 111;
        continue;
      case 111:
        // L_444f5
        if (
          !(
            (g.V_1784 >= g.V_1788 && g.V_1780 >= g.V_1788 && g.V_1780 <= g.V_1784) ||
            (g.V_1784 <= g.V_1788 && g.V_1780 >= g.V_1788 && g.V_1780 >= g.V_1784) ||
            (g.V_1784 <= g.V_1788 && g.V_1780 <= g.V_1788 && g.V_1780 <= g.V_1784)
          )
        ) {
          pc = 112;
          continue;
        } // 5658
        pc = 246;
        continue; // 5659
      case 112:
        // L_445fd
        if (!(L_BP96 === "NAO")) {
          pc = 113;
          continue;
        } // 5661
        pc = 145;
        continue; // 5662
      case 113:
        // L_4461d
        g.V_17e0 = g.V_1760; // 5664
        g.V_17f0 = g.V_1764; // 5665
        g.V_1678 = g.V_1688; // 5666
        g.V_17e8 = g.V_1758; // 5667
        g.V_17f8 = g.V_175c; // 5668
        g.V_1680 = g.V_1690; // 5669
        S_23341(g); // 5670
        L_BP96 = g.V_0f18; // 5672
        g.V_1710 = g.V_0ef4; // 5673
        g.V_1718 = g.V_0efc; // 5674
        if (!(L_BP96 !== "NAO")) {
          pc = 144;
          continue;
        } // 5675
        if (!(g.V_16c4 === 2.0 && g.A_163a.get(qbCint(g.V_1788), 2) !== 100.0)) {
          pc = 117;
          continue;
        } // 5676
        g.V_16f0 = g.V_1760; // 5677
        g.V_16f8 = g.V_1764; // 5678
        g.V_1700 = g.V_1710; // 5679
        g.V_1708 = g.V_1718; // 5680
        g.V_16d0 = g.V_1758; // 5681
        g.V_16d8 = g.V_175c; // 5682
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_1788 - g.V_17ac)); // 5683
        g.V_16e8 = g.A_15de.get(qbCint(g.V_1788 - g.V_17ac)); // 5684
        S_2018c(g); // 5685
        if (
          !(
            (Math.abs(g.V_16f8 - g.V_1708) < g.V_133a &&
              Math.abs(g.V_16f0 - g.V_1700) < g.V_133a) ||
            g.V_0f1c === ""
          )
        ) {
          pc = 115;
          continue;
        } // 5687
        pc = 114;
        continue;
      case 114:
        // L_44861
        g.V_1788 = g.s(g.V_1788 - g.V_17ac); // 5689
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 2.0), 0, 0); // 5690
        pc = 98;
        continue; // 5691
      case 115:
        // L_448bd
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_1788)); // 5693
        g.V_16e8 = g.A_15de.get(qbCint(g.V_1788)); // 5694
        S_2018c(g); // 5695
        if (!(g.V_0f1c === "")) {
          pc = 116;
          continue;
        } // 5697
        pc = 114;
        continue; // 5698
      case 116:
        // L_44934
        pc = 117;
        continue;
      case 117:
        // L_44939
        g.V_1794 = g.s(g.V_1788 + 1.0); // 5701
        pc = 118;
        continue;
      case 118:
        // L_44954
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1794)) {
          pc = 119;
          continue;
        } // 5703
        g.V_1794 = g.s(1.0); // 5704
        pc = 119;
        continue;
      case 119:
        // L_4499d
        if (
          !(
            g.A_163a.get(qbCint(g.V_1794), 0) !== -100.0 ||
            g.A_163a.get(qbCint(g.V_1794), 2) !== 100.0
          )
        ) {
          pc = 120;
          continue;
        } // 5706
        pc = 121;
        continue; // 5707
      case 120:
        // L_44a15
        g.V_1794 = g.s(g.V_1794 + 1.0); // 5709
        pc = 118;
        continue; // 5710
      case 121:
        // L_44a34
        if (!(g.A_163a.get(qbCint(g.V_1794), 2) === 100.0)) {
          pc = 125;
          continue;
        } // 5712
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1794)) === 1)) {
          pc = 122;
          continue;
        } // 5713
        pc = 145;
        continue; // 5714
      case 122:
        // L_44aa0
        g.V_1790 = g.s(g.V_1794 - 1.0); // 5716
        if (!(g.V_1790 === 0.0)) {
          pc = 123;
          continue;
        } // 5717
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5718
        pc = 123;
        continue;
      case 123:
        // L_44b00
        g.V_1798 = g.s(g.V_1794); // 5720
        g.V_179c = g.s(g.V_1794 + 1.0); // 5721
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 124;
          continue;
        } // 5722
        g.V_179c = g.s(1.0); // 5723
        pc = 124;
        continue;
      case 124:
        // L_44b70
        S_21e5d(g); // 5725
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_1794)); // 5727
        g.V_17f0 = g.A_15de.get(qbCint(g.V_1794)); // 5728
        g.V_1678 = g.V_16a0; // 5729
        pc = 126;
        continue; // 5730
      case 125:
        // L_44be1
        g.V_17e0 = g.A_163a.get(qbCint(g.V_1794), 0); // 5732
        g.V_17f0 = g.A_163a.get(qbCint(g.V_1794), 1); // 5733
        g.V_1678 = g.A_163a.get(qbCint(g.V_1794), 2); // 5734
        pc = 126;
        continue;
      case 126:
        // L_44c63
        S_23341(g); // 5736
        if (
          !(
            g.pot(g.V_0ef4 - g.V_1758, 2.0) + g.pot(g.V_0efc - g.V_175c, 2.0) + g.V_133a <
            g.pot(g.V_1710 - g.V_1758, 2.0) + g.pot(g.V_1718 - g.V_175c, 2.0)
          )
        ) {
          pc = 143;
          continue;
        } // 5738
        if (
          !(
            g.pot(g.V_0ef4 - g.V_1710, 2.0) + g.pot(g.V_0efc - g.V_1718, 2.0) <
            g.pot(g.V_1758 - g.V_1710, 2.0) + g.pot(g.V_175c - g.V_1718, 2.0)
          )
        ) {
          pc = 142;
          continue;
        } // 5739
        g.V_16d0 = g.V_0ef4; // 5740
        g.V_16d8 = g.V_0efc; // 5741
        if (!(g.A_163a.get(qbCint(g.V_1794), 2) === 100.0)) {
          pc = 127;
          continue;
        } // 5742
        g.V_1794 = g.s(g.V_1794 + 1.0); // 5743
        pc = 132;
        continue; // 5744
      case 127:
        // L_44dd1
        g.V_1790 = g.s(g.V_1794); // 5746
        pc = 128;
        continue;
      case 128:
        // L_44de8
        g.V_1790 = g.s(g.V_1790 + 1.0); // 5748
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1790)) {
          pc = 129;
          continue;
        } // 5749
        g.V_1790 = g.s(1.0); // 5750
        pc = 129;
        continue;
      case 129:
        // L_44e47
        if (
          !(
            g.A_163a.get(qbCint(g.V_1790), 1) === g.A_163a.get(qbCint(g.V_1794), 1) &&
            g.A_163a.get(qbCint(g.V_1790), 0) === g.A_163a.get(qbCint(g.V_1794), 0)
          )
        ) {
          pc = 130;
          continue;
        } // 5752
        g.V_1794 = g.s(g.V_1790 + 1.0); // 5753
        pc = 131;
        continue; // 5754
      case 130:
        // L_44f0b
        pc = 128;
        continue; // 5756
      case 131:
        // L_44f14
        pc = 132;
        continue;
      case 132:
        // L_44f19
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1794)) {
          pc = 133;
          continue;
        } // 5759
        g.V_1794 = g.s(1.0); // 5760
        pc = 133;
        continue;
      case 133:
        // L_44f62
        if (!(g.A_163a.get(qbCint(g.V_1794), 2) === 100.0)) {
          pc = 137;
          continue;
        } // 5762
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1794)) === 1)) {
          pc = 134;
          continue;
        } // 5763
        L_BP96 = "NAO"; // 5764
        pc = 145;
        continue; // 5765
      case 134:
        // L_44fe1
        g.V_1790 = g.s(g.V_1794 - 1.0); // 5767
        if (!(g.V_1790 === 0.0)) {
          pc = 135;
          continue;
        } // 5768
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5769
        pc = 135;
        continue;
      case 135:
        // L_45041
        g.V_1798 = g.s(g.V_1794); // 5771
        g.V_179c = g.s(g.V_1794 + 1.0); // 5772
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 136;
          continue;
        } // 5773
        g.V_179c = g.s(1.0); // 5774
        pc = 136;
        continue;
      case 136:
        // L_450b1
        S_21e5d(g); // 5776
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_1794)); // 5778
        g.V_17f8 = g.A_15de.get(qbCint(g.V_1794)); // 5779
        g.V_1680 = g.V_16a0; // 5780
        pc = 138;
        continue; // 5781
      case 137:
        // L_45122
        g.V_17e8 = g.A_163a.get(qbCint(g.V_1794), 0); // 5783
        g.V_17f8 = g.A_163a.get(qbCint(g.V_1794), 1); // 5784
        g.V_1680 = g.A_163a.get(qbCint(g.V_1794), 2); // 5785
        pc = 138;
        continue;
      case 138:
        // L_451a4
        S_23341(g); // 5787
        if (
          !(
            g.pot(g.V_0ef4 - g.V_17e0, 2.0) + g.pot(g.V_0efc - g.V_17f0, 2.0) + g.V_133a >=
            g.pot(g.V_16d0 - g.V_17e0, 2.0) + g.pot(g.V_16d8 - g.V_17f0, 2.0)
          )
        ) {
          pc = 139;
          continue;
        } // 5789
        L_BP96 = "NAO"; // 5790
        pc = 141;
        continue; // 5791
      case 139:
        // L_45240
        if (
          !(
            g.pot(g.V_0ef4 - g.V_16d0, 2.0) + g.pot(g.V_0efc - g.V_16d8, 2.0) >
            g.pot(g.V_17e0 - g.V_16d0, 2.0) + g.pot(g.V_17f0 - g.V_16d8, 2.0)
          )
        ) {
          pc = 140;
          continue;
        } // 5793
        L_BP96 = "NAO"; // 5794
        pc = 140;
        continue;
      case 140:
        // L_452c2
        pc = 141;
        continue;
      case 141:
        // L_452c7
        pc = 142;
        continue;
      case 142:
        // L_452cc
        pc = 143;
        continue;
      case 143:
        // L_452d1
        pc = 144;
        continue;
      case 144:
        // L_452d6
        pc = 145;
        continue;
      case 145:
        // L_452db
        if (!(L_BP110 === "NAO")) {
          pc = 146;
          continue;
        } // 5801
        pc = 179;
        continue; // 5802
      case 146:
        // L_45300
        g.V_17e0 = g.V_1750; // 5804
        g.V_17f0 = g.V_1754; // 5805
        g.V_1678 = g.V_1698; // 5806
        g.V_17e8 = g.V_1760; // 5807
        g.V_17f8 = g.V_1764; // 5808
        g.V_1680 = g.V_1688; // 5809
        S_23341(g); // 5810
        L_BP110 = g.V_0f18; // 5812
        g.V_1720 = g.V_0ef4; // 5813
        g.V_1728 = g.V_0efc; // 5814
        if (!(L_BP110 !== "NAO")) {
          pc = 178;
          continue;
        } // 5815
        if (!(g.V_16c0 === 2.0 && g.A_163a.get(qbCint(g.V_1784), 2) !== 100.0)) {
          pc = 151;
          continue;
        } // 5816
        g.V_16f0 = g.V_1760; // 5817
        g.V_16f8 = g.V_1764; // 5818
        g.V_1700 = g.V_1720; // 5819
        g.V_1708 = g.V_1728; // 5820
        g.V_16d0 = g.V_1750; // 5821
        g.V_16d8 = g.V_1754; // 5822
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_1784 + g.V_17a8)); // 5823
        g.V_16e8 = g.A_15de.get(qbCint(g.V_1784 + g.V_17a8)); // 5824
        S_2018c(g); // 5825
        if (
          !(
            (Math.abs(g.V_16f8 - g.V_1708) < g.V_133a &&
              Math.abs(g.V_16f0 - g.V_1700) < g.V_133a) ||
            g.V_0f1c === ""
          )
        ) {
          pc = 149;
          continue;
        } // 5827
        pc = 147;
        continue;
      case 147:
        // L_45544
        g.V_1784 = g.s(g.V_1784 + g.V_17a8); // 5829
        if (!(g.V_16c4 === 2.0)) {
          pc = 148;
          continue;
        } // 5830
        pilha.push(475);
        pc = 424;
        continue; // 5831
      case 475:
        pc = 148;
        continue;
      case 148:
        // L_45587
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 2.0), 0, 0); // 5833
        pc = 83;
        continue; // 5834
      case 149:
        // L_455c8
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_1784)); // 5836
        g.V_16e8 = g.A_15de.get(qbCint(g.V_1784)); // 5837
        S_2018c(g); // 5838
        if (!(g.V_0f1c === "")) {
          pc = 150;
          continue;
        } // 5840
        pc = 147;
        continue; // 5841
      case 150:
        // L_4563f
        pc = 151;
        continue;
      case 151:
        // L_45644
        g.V_1794 = g.s(g.V_1784 - 1.0); // 5844
        pc = 152;
        continue;
      case 152:
        // L_45660
        if (!(g.V_1794 === 0.0)) {
          pc = 153;
          continue;
        } // 5846
        g.V_1794 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5847
        pc = 153;
        continue;
      case 153:
        // L_456aa
        if (
          !(
            g.A_163a.get(qbCint(g.V_1794), 0) !== -100.0 ||
            g.A_163a.get(qbCint(g.V_1794), 2) !== 100.0
          )
        ) {
          pc = 154;
          continue;
        } // 5849
        pc = 155;
        continue; // 5850
      case 154:
        // L_45722
        g.V_1794 = g.s(g.V_1794 - 1.0); // 5852
        pc = 152;
        continue; // 5853
      case 155:
        // L_45740
        if (!(g.A_163a.get(qbCint(g.V_1794), 2) === 100.0)) {
          pc = 159;
          continue;
        } // 5855
        g.V_1790 = g.s(g.V_1794 - 1.0); // 5856
        if (!(g.V_1790 === 0.0)) {
          pc = 156;
          continue;
        } // 5857
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5858
        pc = 156;
        continue;
      case 156:
        // L_457d2
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1)) {
          pc = 157;
          continue;
        } // 5860
        pc = 179;
        continue; // 5861
      case 157:
        // L_4580c
        g.V_1798 = g.s(g.V_1794); // 5863
        g.V_179c = g.s(g.V_1794 + 1.0); // 5864
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 158;
          continue;
        } // 5865
        g.V_179c = g.s(1.0); // 5866
        pc = 158;
        continue;
      case 158:
        // L_4587c
        S_21e5d(g); // 5868
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_1794)); // 5870
        g.V_17f8 = g.A_15de.get(qbCint(g.V_1794)); // 5871
        g.V_1680 = g.V_16a0; // 5872
        pc = 160;
        continue; // 5873
      case 159:
        // L_458ed
        g.V_17e8 = g.A_163a.get(qbCint(g.V_1794), 0); // 5875
        g.V_17f8 = g.A_163a.get(qbCint(g.V_1794), 1); // 5876
        g.V_1680 = g.A_163a.get(qbCint(g.V_1794), 2); // 5877
        pc = 160;
        continue;
      case 160:
        // L_4596f
        S_23341(g); // 5879
        if (
          !(
            g.pot(g.V_0ef4 - g.V_1750, 2.0) + g.pot(g.V_0efc - g.V_1754, 2.0) + g.V_133a <
            g.pot(g.V_1720 - g.V_1750, 2.0) + g.pot(g.V_1728 - g.V_1754, 2.0)
          )
        ) {
          pc = 177;
          continue;
        } // 5881
        if (
          !(
            g.pot(g.V_0ef4 - g.V_1720, 2.0) + g.pot(g.V_0efc - g.V_1728, 2.0) <
            g.pot(g.V_1750 - g.V_1720, 2.0) + g.pot(g.V_1754 - g.V_1728, 2.0)
          )
        ) {
          pc = 176;
          continue;
        } // 5882
        g.V_16d0 = g.V_0ef4; // 5883
        g.V_16d8 = g.V_0efc; // 5884
        if (!(g.A_163a.get(qbCint(g.V_1794), 2) === 100.0)) {
          pc = 161;
          continue;
        } // 5885
        g.V_1794 = g.s(g.V_1794 - 1.0); // 5886
        pc = 166;
        continue; // 5887
      case 161:
        // L_45add
        g.V_1790 = g.s(g.V_1794); // 5889
        pc = 162;
        continue;
      case 162:
        // L_45af4
        g.V_1790 = g.s(g.V_1790 - 1.0); // 5891
        if (!(g.V_1790 === 0.0)) {
          pc = 163;
          continue;
        } // 5892
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5893
        pc = 163;
        continue;
      case 163:
        // L_45b54
        if (
          !(
            g.A_163a.get(qbCint(g.V_1790), 1) === g.A_163a.get(qbCint(g.V_1794), 1) &&
            g.A_163a.get(qbCint(g.V_1790), 0) === g.A_163a.get(qbCint(g.V_1794), 0)
          )
        ) {
          pc = 164;
          continue;
        } // 5895
        g.V_1794 = g.s(g.V_1790 - 1.0); // 5896
        pc = 165;
        continue; // 5897
      case 164:
        // L_45c18
        pc = 162;
        continue; // 5899
      case 165:
        // L_45c20
        pc = 166;
        continue;
      case 166:
        // L_45c25
        if (!(g.V_1794 === 0.0)) {
          pc = 167;
          continue;
        } // 5902
        g.V_1794 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5903
        pc = 167;
        continue;
      case 167:
        // L_45c6f
        if (!(g.A_163a.get(qbCint(g.V_1794), 2) === 100.0)) {
          pc = 171;
          continue;
        } // 5905
        g.V_1790 = g.s(g.V_1794 - 1.0); // 5906
        if (!(g.V_1790 === 0.0)) {
          pc = 168;
          continue;
        } // 5907
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 5908
        pc = 168;
        continue;
      case 168:
        // L_45d01
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1)) {
          pc = 169;
          continue;
        } // 5910
        L_BP110 = "NAO"; // 5911
        pc = 179;
        continue; // 5912
      case 169:
        // L_45d4e
        g.V_1798 = g.s(g.V_1794); // 5914
        g.V_179c = g.s(g.V_1794 + 1.0); // 5915
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 170;
          continue;
        } // 5916
        g.V_179c = g.s(1.0); // 5917
        pc = 170;
        continue;
      case 170:
        // L_45dbe
        S_21e5d(g); // 5919
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_1794)); // 5921
        g.V_17f0 = g.A_15de.get(qbCint(g.V_1794)); // 5922
        g.V_1678 = g.V_16a0; // 5923
        pc = 172;
        continue; // 5924
      case 171:
        // L_45e2f
        g.V_17e0 = g.A_163a.get(qbCint(g.V_1794), 0); // 5926
        g.V_17f0 = g.A_163a.get(qbCint(g.V_1794), 1); // 5927
        g.V_1678 = g.A_163a.get(qbCint(g.V_1794), 2); // 5928
        pc = 172;
        continue;
      case 172:
        // L_45eb1
        S_23341(g); // 5930
        if (
          !(
            g.pot(g.V_0ef4 - g.V_17e8, 2.0) + g.pot(g.V_0efc - g.V_17f8, 2.0) + g.V_133a >=
            g.pot(g.V_16d0 - g.V_17e8, 2.0) + g.pot(g.V_16d8 - g.V_17f8, 2.0)
          )
        ) {
          pc = 173;
          continue;
        } // 5932
        L_BP110 = "NAO"; // 5933
        pc = 175;
        continue; // 5934
      case 173:
        // L_45f4d
        if (
          !(
            g.pot(g.V_0ef4 - g.V_16d0, 2.0) + g.pot(g.V_0efc - g.V_16d8, 2.0) >
            g.pot(g.V_17e8 - g.V_16d0, 2.0) + g.pot(g.V_17f8 - g.V_16d8, 2.0)
          )
        ) {
          pc = 174;
          continue;
        } // 5936
        L_BP110 = "NAO"; // 5937
        pc = 174;
        continue;
      case 174:
        // L_45fcf
        pc = 175;
        continue;
      case 175:
        // L_45fd4
        pc = 176;
        continue;
      case 176:
        // L_45fd9
        pc = 177;
        continue;
      case 177:
        // L_45fde
        pc = 178;
        continue;
      case 178:
        // L_45fe3
        pc = 179;
        continue;
      case 179:
        // L_45fe8
        L_BP142 = qbCint(L_BP110 === "NAO" ? -1 : 0); // 5944
        if (!((qbCint(L_BP96 === "NAO" ? -1 : 0) & qbCint(L_BP142)) !== 0)) {
          pc = 180;
          continue;
        } // 5945
        pc = 246;
        continue; // 5946
      case 180:
        // L_46033
        if (!(g.A_1342.get(qbCint(g.V_177c), qbCint(g.V_1780)) === 1 && g.V_16bc === 1.0)) {
          pc = 187;
          continue;
        } // 5948
        g.V_1778 = g.s(1.0); // 5949
        pc = 181;
        continue;
      case 181:
        // L_460a0
        if (!(g.A_160c.get(qbCint(g.V_1778), 0) === -g.V_1780)) {
          pc = 184;
          continue;
        } // 5951
        L_BP144 = qbCint(
          g.pot(g.V_1710 - g.V_1760, 2.0) + g.pot(g.V_1718 - g.V_1764, 2.0) + g.V_133a >=
            g.pot(g.A_160c.get(qbCint(g.V_1778), 2) - g.V_1760, 2.0) +
              g.pot(g.A_160c.get(qbCint(g.V_1778), 3) - g.V_1764, 2.0)
            ? -1
            : 0,
        ); // 5952
        if (!((qbCint(L_BP96 === "NAO" ? -1 : 0) | qbCint(L_BP144)) !== 0)) {
          pc = 183;
          continue;
        } // 5953
        L_BP146 = qbCint(
          g.pot(g.V_1720 - g.V_1760, 2.0) + g.pot(g.V_1728 - g.V_1764, 2.0) + g.V_133a >=
            g.pot(g.A_160c.get(qbCint(g.V_1778), 2) - g.V_1760, 2.0) +
              g.pot(g.A_160c.get(qbCint(g.V_1778), 3) - g.V_1764, 2.0)
            ? -1
            : 0,
        ); // 5954
        if (!((qbCint(L_BP110 === "NAO" ? -1 : 0) | qbCint(L_BP146)) !== 0)) {
          pc = 182;
          continue;
        } // 5955
        pc = 185;
        continue; // 5956
      case 182:
        // L_4628c
        pc = 183;
        continue;
      case 183:
        // L_46291
        pc = 184;
        continue;
      case 184:
        // L_46296
        g.V_1778 = g.s(g.V_1778 + 1.0); // 5960
        if (!(g.A_160c.get(0, 0) < g.V_1778)) {
          pc = 181;
          continue;
        } // 5961
        pc = 185;
        continue;
      case 185:
        // L_462d6
        if (!(g.A_160c.get(0, 0) >= g.V_1778)) {
          pc = 186;
          continue;
        } // 5963
        pc = 262;
        continue; // 5964
      case 186:
        // L_46308
        pc = 187;
        continue;
      case 187:
        // L_4630d
        L_BP148 = qbCint(
          Math.abs(g.V_1718 - g.V_1728) < g.V_133a && Math.abs(g.V_1710 - g.V_1720) < g.V_133a
            ? -1
            : 0,
        ); // 5967
        L_BP14a = qbCint(qbCint(L_BP110 !== "NAO" ? -1 : 0) & qbCint(L_BP148)); // 5968
        if (!((qbCint(L_BP96 !== "NAO" ? -1 : 0) & qbCint(L_BP14a)) !== 0)) {
          pc = 200;
          continue;
        } // 5969
        g.V_16f0 = g.V_1758; // 5970
        g.V_16f8 = g.V_175c; // 5971
        g.V_1700 = g.V_1710; // 5972
        g.V_1708 = g.V_1718; // 5973
        S_23948(g); // 5974
        if (!(g.V_0f1c === "")) {
          pc = 188;
          continue;
        } // 5976
        pc = 262;
        continue; // 5977
      case 188:
        // L_46404
        g.V_16f0 = g.V_1750; // 5979
        g.V_16f8 = g.V_1754; // 5980
        g.V_1700 = g.V_1710; // 5981
        g.V_1708 = g.V_1718; // 5982
        S_23948(g); // 5983
        if (!(g.V_0f1c === "")) {
          pc = 189;
          continue;
        } // 5985
        pc = 262;
        continue; // 5986
      case 189:
        // L_46471
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5988
        if (!(g.V_16c4 === 1.0)) {
          pc = 190;
          continue;
        } // 5989
        g.A_160c.set(g.s(-g.V_1788), qbCint(g.A_160c.get(0, 0)), 0); // 5990
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1788)); // 5991
        pc = 191;
        continue; // 5992
      case 190:
        // L_46530
        g.A_160c.set(g.s(g.V_1758), qbCint(g.A_160c.get(0, 0)), 0); // 5994
        g.A_160c.set(g.s(g.V_175c), qbCint(g.A_160c.get(0, 0)), 1); // 5995
        pc = 191;
        continue;
      case 191:
        // L_465a8
        g.A_160c.set(g.s(g.V_1710), qbCint(g.A_160c.get(0, 0)), 2); // 5997
        g.A_160c.set(g.s(g.V_1718), qbCint(g.A_160c.get(0, 0)), 3); // 5998
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 5999
        if (!(g.V_16c0 === 1.0)) {
          pc = 192;
          continue;
        } // 6000
        g.A_160c.set(g.s(-g.V_1784), qbCint(g.A_160c.get(0, 0)), 0); // 6001
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1784)); // 6002
        pc = 193;
        continue; // 6003
      case 192:
        // L_466d8
        g.A_160c.set(g.s(g.V_1750), qbCint(g.A_160c.get(0, 0)), 0); // 6005
        g.A_160c.set(g.s(g.V_1754), qbCint(g.A_160c.get(0, 0)), 1); // 6006
        pc = 193;
        continue;
      case 193:
        // L_46750
        g.A_160c.set(g.s(g.V_1710), qbCint(g.A_160c.get(0, 0)), 2); // 6008
        g.A_160c.set(g.s(g.V_1718), qbCint(g.A_160c.get(0, 0)), 3); // 6009
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6010
        if (!(g.V_16bc === 1.0)) {
          pc = 194;
          continue;
        } // 6011
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.A_160c.get(0, 0)), 0); // 6012
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1780)); // 6013
        g.V_16bc = g.s(2.0); // 6014
        pc = 195;
        continue; // 6015
      case 194:
        // L_46891
        g.A_160c.set(g.s(g.V_1760), qbCint(g.A_160c.get(0, 0)), 0); // 6017
        g.A_160c.set(g.s(g.V_1764), qbCint(g.A_160c.get(0, 0)), 1); // 6018
        pc = 195;
        continue;
      case 195:
        // L_46909
        g.A_160c.set(g.s(g.V_1710), qbCint(g.A_160c.get(0, 0)), 2); // 6020
        g.A_160c.set(g.s(g.V_1718), qbCint(g.A_160c.get(0, 0)), 3); // 6021
        g.V_1760 = g.s(g.V_1710); // 6022
        g.V_1764 = g.s(g.V_1718); // 6023
        g.V_1794 = g.s(g.V_1784); // 6024
        g.V_1784 = g.s(g.V_1784 - 1.0); // 6025
        if (!(g.V_1784 === 0.0)) {
          pc = 196;
          continue;
        } // 6026
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6027
        pc = 196;
        continue;
      case 196:
        // L_46a0d
        g.V_1790 = g.s(g.V_1784); // 6029
        if (!(g.V_1788 === g.V_1784)) {
          pc = 197;
          continue;
        } // 6030
        pc = 262;
        continue; // 6031
      case 197:
        // L_46a41
        g.V_1798 = g.s(g.V_1788); // 6033
        g.V_1788 = g.s(g.V_1788 + 1.0); // 6034
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 198;
          continue;
        } // 6035
        g.V_1788 = g.s(1.0); // 6036
        pc = 198;
        continue;
      case 198:
        // L_46ab1
        g.V_179c = g.s(g.V_1788); // 6038
        if (!(g.V_1788 === g.V_1784)) {
          pc = 199;
          continue;
        } // 6039
        pc = 262;
        continue; // 6040
      case 199:
        // L_46ae5
        pc = 75;
        continue; // 6042
      case 200:
        // L_46af2
        pc = 201;
        continue;
      case 201:
        // L_46af7
        L_BP14c = qbCint(L_BP96 !== "NAO" ? -1 : 0); // 6045
        L_BP14e = qbCint(
          g.pot(g.V_1710 - g.V_1760, 2.0) + g.pot(g.V_1718 - g.V_1764, 2.0) <=
            g.pot(g.V_1720 - g.V_1760, 2.0) + g.pot(g.V_1728 - g.V_1764, 2.0)
            ? -1
            : 0,
        ); // 6046
        if (
          !((qbCint(qbCint(L_BP110 === "NAO" ? -1 : 0) | qbCint(L_BP14e)) & qbCint(L_BP14c)) !== 0)
        ) {
          pc = 223;
          continue;
        } // 6047
        if (
          !(Math.abs(g.V_1764 - g.V_1718) < g.V_133a && Math.abs(g.V_1760 - g.V_1710) < g.V_133a)
        ) {
          pc = 202;
          continue;
        } // 6048
        pc = 207;
        continue; // 6049
      case 202:
        // L_46c0f
        g.V_16f0 = g.V_1760; // 6051
        g.V_16f8 = g.V_1764; // 6052
        g.V_1700 = g.V_1710; // 6053
        g.V_1708 = g.V_1718; // 6054
        S_23948(g); // 6055
        L_BP150 = qbCint(g.V_0f1c === "" ? -1 : 0); // 6057
        if (!((qbCint(L_BP110 !== "NAO" ? -1 : 0) & qbCint(L_BP150)) !== 0)) {
          pc = 203;
          continue;
        } // 6058
        L_BP96 = "NAO"; // 6059
        pc = 224;
        continue; // 6060
      case 203:
        // L_46cb5
        if (!(g.V_0f1c === "")) {
          pc = 204;
          continue;
        } // 6062
        pc = 262;
        continue; // 6063
      case 204:
        // L_46cd4
        g.V_16f0 = g.V_1758; // 6065
        g.V_16f8 = g.V_175c; // 6066
        g.V_1700 = g.V_1710; // 6067
        g.V_1708 = g.V_1718; // 6068
        S_23948(g); // 6069
        L_BP152 = qbCint(g.V_0f1c === "" ? -1 : 0); // 6071
        if (!((qbCint(L_BP110 !== "NAO" ? -1 : 0) & qbCint(L_BP152)) !== 0)) {
          pc = 205;
          continue;
        } // 6072
        L_BP96 = "NAO"; // 6073
        pc = 224;
        continue; // 6074
      case 205:
        // L_46d7a
        if (!(g.V_0f1c === "")) {
          pc = 206;
          continue;
        } // 6076
        pc = 262;
        continue; // 6077
      case 206:
        // L_46d99
        pc = 207;
        continue;
      case 207:
        // L_46d9e
        if (!(g.A_163a.get(qbCint(g.V_1784), 2) !== 100.0 && g.V_16c0 !== 1.0)) {
          pc = 209;
          continue;
        } // 6080
        if (!(g.V_16c4 === 2.0)) {
          pc = 208;
          continue;
        } // 6081
        pilha.push(476);
        pc = 424;
        continue; // 6082
      case 476:
        pc = 208;
        continue;
      case 208:
        // L_46e22
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 2.0), 0, 0); // 6084
        pc = 209;
        continue;
      case 209:
        // L_46e5b
        if (!(g.A_163a.get(qbCint(g.V_1780), 2) !== 100.0 && g.V_16bc === 1.0)) {
          pc = 213;
          continue;
        } // 6086
        if (
          !(
            g.pot(g.V_1710 - g.V_1760, 2.0) + g.pot(g.V_1718 - g.V_1764, 2.0) + g.V_133a <
            g.pot(g.A_163a.get(qbCint(g.V_1780), 0) - g.V_1760, 2.0) +
              g.pot(g.A_163a.get(qbCint(g.V_1780), 1) - g.V_1764, 2.0)
          )
        ) {
          pc = 212;
          continue;
        } // 6087
        g.A_163a.set(g.s(100.0), qbCint(g.V_1780), 2); // 6088
        if (
          !(
            g.A_163a.get(qbCint(g.V_1784), 1) === g.A_163a.get(qbCint(g.V_1780), 1) &&
            g.A_163a.get(qbCint(g.V_1784), 0) === g.A_163a.get(qbCint(g.V_1780), 0)
          )
        ) {
          pc = 210;
          continue;
        } // 6089
        g.A_163a.set(g.s(100.0), qbCint(g.V_1784), 2); // 6090
        pc = 210;
        continue;
      case 210:
        // L_47058
        if (
          !(
            g.A_163a.get(qbCint(g.V_1788), 1) === g.A_163a.get(qbCint(g.V_1780), 1) &&
            g.A_163a.get(qbCint(g.V_1788), 0) === g.A_163a.get(qbCint(g.V_1780), 0)
          )
        ) {
          pc = 211;
          continue;
        } // 6092
        g.A_163a.set(g.s(100.0), qbCint(g.V_1788), 2); // 6093
        pc = 211;
        continue;
      case 211:
        // L_47126
        pc = 212;
        continue;
      case 212:
        // L_4712b
        pc = 213;
        continue;
      case 213:
        // L_47130
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6097
        if (!(g.V_16c4 === 1.0)) {
          pc = 214;
          continue;
        } // 6098
        g.A_160c.set(g.s(-g.V_1788), qbCint(g.A_160c.get(0, 0)), 0); // 6099
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1788)); // 6100
        pc = 215;
        continue; // 6101
      case 214:
        // L_471ef
        g.A_160c.set(g.s(g.V_1758), qbCint(g.A_160c.get(0, 0)), 0); // 6103
        g.A_160c.set(g.s(g.V_175c), qbCint(g.A_160c.get(0, 0)), 1); // 6104
        pc = 215;
        continue;
      case 215:
        // L_47267
        g.A_160c.set(g.s(g.V_1710), qbCint(g.A_160c.get(0, 0)), 2); // 6106
        g.A_160c.set(g.s(g.V_1718), qbCint(g.A_160c.get(0, 0)), 3); // 6107
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6108
        if (!(g.V_16bc === 1.0)) {
          pc = 216;
          continue;
        } // 6109
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.A_160c.get(0, 0)), 0); // 6110
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1780)); // 6111
        g.V_16bc = g.s(2.0); // 6112
        pc = 217;
        continue; // 6113
      case 216:
        // L_473a8
        g.A_160c.set(g.s(g.V_1760), qbCint(g.A_160c.get(0, 0)), 0); // 6115
        g.A_160c.set(g.s(g.V_1764), qbCint(g.A_160c.get(0, 0)), 1); // 6116
        pc = 217;
        continue;
      case 217:
        // L_47420
        g.A_160c.set(g.s(g.V_1710), qbCint(g.A_160c.get(0, 0)), 2); // 6118
        g.A_160c.set(g.s(g.V_1718), qbCint(g.A_160c.get(0, 0)), 3); // 6119
        if (!(g.V_1764 === g.V_1718 && g.V_1760 === g.V_1710)) {
          pc = 218;
          continue;
        } // 6120
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 6121
        pc = 218;
        continue;
      case 218:
        // L_47503
        g.V_1760 = g.s(g.V_1710); // 6123
        g.V_1764 = g.s(g.V_1718); // 6124
        if (!(g.V_16c0 !== 1.0)) {
          pc = 219;
          continue;
        } // 6125
        g.V_1784 = g.s(g.V_1784 + g.V_17a8); // 6126
        pc = 219;
        continue;
      case 219:
        // L_47556
        g.V_1790 = g.s(g.V_1784); // 6128
        g.V_1794 = g.s(g.V_1784 + 1.0); // 6129
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1794)) {
          pc = 220;
          continue;
        } // 6130
        g.V_1794 = g.s(1.0); // 6131
        pc = 220;
        continue;
      case 220:
        // L_475d0
        g.V_1798 = g.s(g.V_1788); // 6133
        g.V_1788 = g.s(g.V_1788 + 1.0); // 6134
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1788)) {
          pc = 221;
          continue;
        } // 6135
        g.V_1788 = g.s(1.0); // 6136
        pc = 221;
        continue;
      case 221:
        // L_47640
        g.V_179c = g.s(g.V_1788); // 6138
        if (!(g.V_1788 === g.V_1784)) {
          pc = 222;
          continue;
        } // 6139
        pc = 262;
        continue; // 6140
      case 222:
        // L_47674
        pc = 75;
        continue; // 6142
      case 223:
        // L_47681
        pc = 224;
        continue;
      case 224:
        // L_47686
        L_BP154 = qbCint(L_BP110 !== "NAO" ? -1 : 0); // 6145
        L_BP156 = qbCint(
          g.pot(g.V_1710 - g.V_1760, 2.0) + g.pot(g.V_1718 - g.V_1764, 2.0) >
            g.pot(g.V_1720 - g.V_1760, 2.0) + g.pot(g.V_1728 - g.V_1764, 2.0)
            ? -1
            : 0,
        ); // 6146
        if (
          !((qbCint(qbCint(L_BP96 === "NAO" ? -1 : 0) | qbCint(L_BP156)) & qbCint(L_BP154)) !== 0)
        ) {
          pc = 245;
          continue;
        } // 6147
        if (
          !(Math.abs(g.V_1764 - g.V_1728) < g.V_133a && Math.abs(g.V_1760 - g.V_1720) < g.V_133a)
        ) {
          pc = 225;
          continue;
        } // 6148
        pc = 230;
        continue; // 6149
      case 225:
        // L_4779e
        g.V_16f0 = g.V_1760; // 6151
        g.V_16f8 = g.V_1764; // 6152
        g.V_1700 = g.V_1720; // 6153
        g.V_1708 = g.V_1728; // 6154
        S_23948(g); // 6155
        L_BP158 = qbCint(g.V_0f1c === "" ? -1 : 0); // 6157
        if (!((qbCint(L_BP96 !== "NAO" ? -1 : 0) & qbCint(L_BP158)) !== 0)) {
          pc = 226;
          continue;
        } // 6158
        L_BP110 = "NAO"; // 6159
        pc = 201;
        continue; // 6160
      case 226:
        // L_47844
        if (!(g.V_0f1c === "")) {
          pc = 227;
          continue;
        } // 6162
        pc = 262;
        continue; // 6163
      case 227:
        // L_47863
        g.V_16f0 = g.V_1750; // 6165
        g.V_16f8 = g.V_1754; // 6166
        g.V_1700 = g.V_1720; // 6167
        g.V_1708 = g.V_1728; // 6168
        S_23948(g); // 6169
        L_BP15a = qbCint(g.V_0f1c === "" ? -1 : 0); // 6171
        if (!((qbCint(L_BP96 !== "NAO" ? -1 : 0) & qbCint(L_BP15a)) !== 0)) {
          pc = 228;
          continue;
        } // 6172
        L_BP110 = "NAO"; // 6173
        pc = 201;
        continue; // 6174
      case 228:
        // L_47909
        if (!(g.V_0f1c === "")) {
          pc = 229;
          continue;
        } // 6176
        pc = 262;
        continue; // 6177
      case 229:
        // L_47928
        pc = 230;
        continue;
      case 230:
        // L_4792d
        if (!(g.A_163a.get(qbCint(g.V_1788), 2) !== 100.0 && g.V_16c4 !== 1.0)) {
          pc = 231;
          continue;
        } // 6180
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 2.0), 0, 0); // 6181
        pc = 231;
        continue;
      case 231:
        // L_479bd
        if (!(g.A_163a.get(qbCint(g.V_1780), 2) !== 100.0 && g.V_16bc === 1.0)) {
          pc = 235;
          continue;
        } // 6183
        if (
          !(
            g.pot(g.V_1720 - g.V_1760, 2.0) + g.pot(g.V_1728 - g.V_1764, 2.0) + g.V_133a <
            g.pot(g.A_163a.get(qbCint(g.V_1780), 0) - g.V_1760, 2.0) +
              g.pot(g.A_163a.get(qbCint(g.V_1780), 1) - g.V_1764, 2.0)
          )
        ) {
          pc = 234;
          continue;
        } // 6184
        g.A_163a.set(g.s(100.0), qbCint(g.V_1780), 2); // 6185
        if (
          !(
            g.A_163a.get(qbCint(g.V_1784), 1) === g.A_163a.get(qbCint(g.V_1780), 1) &&
            g.A_163a.get(qbCint(g.V_1784), 0) === g.A_163a.get(qbCint(g.V_1780), 0)
          )
        ) {
          pc = 232;
          continue;
        } // 6186
        g.A_163a.set(g.s(100.0), qbCint(g.V_1784), 2); // 6187
        pc = 232;
        continue;
      case 232:
        // L_47bba
        if (
          !(
            g.A_163a.get(qbCint(g.V_1788), 1) === g.A_163a.get(qbCint(g.V_1780), 1) &&
            g.A_163a.get(qbCint(g.V_1788), 0) === g.A_163a.get(qbCint(g.V_1780), 0)
          )
        ) {
          pc = 233;
          continue;
        } // 6189
        g.A_163a.set(g.s(100.0), qbCint(g.V_1788), 2); // 6190
        pc = 233;
        continue;
      case 233:
        // L_47c88
        pc = 234;
        continue;
      case 234:
        // L_47c8d
        pc = 235;
        continue;
      case 235:
        // L_47c92
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6194
        if (!(g.V_16c0 === 1.0)) {
          pc = 236;
          continue;
        } // 6195
        g.A_160c.set(g.s(-g.V_1784), qbCint(g.A_160c.get(0, 0)), 0); // 6196
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1784)); // 6197
        pc = 237;
        continue; // 6198
      case 236:
        // L_47d51
        g.A_160c.set(g.s(g.V_1750), qbCint(g.A_160c.get(0, 0)), 0); // 6200
        g.A_160c.set(g.s(g.V_1754), qbCint(g.A_160c.get(0, 0)), 1); // 6201
        pc = 237;
        continue;
      case 237:
        // L_47dc9
        g.A_160c.set(g.s(g.V_1720), qbCint(g.A_160c.get(0, 0)), 2); // 6203
        g.A_160c.set(g.s(g.V_1728), qbCint(g.A_160c.get(0, 0)), 3); // 6204
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6205
        if (!(g.V_16bc === 1.0)) {
          pc = 238;
          continue;
        } // 6206
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.A_160c.get(0, 0)), 0); // 6207
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1780)); // 6208
        g.V_16bc = g.s(2.0); // 6209
        pc = 239;
        continue; // 6210
      case 238:
        // L_47f0a
        g.A_160c.set(g.s(g.V_1760), qbCint(g.A_160c.get(0, 0)), 0); // 6212
        g.A_160c.set(g.s(g.V_1764), qbCint(g.A_160c.get(0, 0)), 1); // 6213
        pc = 239;
        continue;
      case 239:
        // L_47f82
        g.A_160c.set(g.s(g.V_1720), qbCint(g.A_160c.get(0, 0)), 2); // 6215
        g.A_160c.set(g.s(g.V_1728), qbCint(g.A_160c.get(0, 0)), 3); // 6216
        if (!(g.V_1764 === g.V_1728 && g.V_1760 === g.V_1720)) {
          pc = 240;
          continue;
        } // 6217
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 6218
        pc = 240;
        continue;
      case 240:
        // L_48065
        g.V_1760 = g.s(g.V_1720); // 6220
        g.V_1764 = g.s(g.V_1728); // 6221
        if (!(g.V_16c4 !== 1.0)) {
          pc = 241;
          continue;
        } // 6222
        g.V_1788 = g.s(g.V_1788 - g.V_17ac); // 6223
        pc = 241;
        continue;
      case 241:
        // L_480b8
        g.V_1794 = g.s(g.V_1784); // 6225
        g.V_1784 = g.s(g.V_1784 - 1.0); // 6226
        if (!(g.V_1784 === 0.0)) {
          pc = 242;
          continue;
        } // 6227
        g.V_1784 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6228
        pc = 242;
        continue;
      case 242:
        // L_48133
        g.V_1790 = g.s(g.V_1784); // 6230
        g.V_1798 = g.s(g.V_1788 - 1.0); // 6231
        if (!(g.V_1798 === 0.0)) {
          pc = 243;
          continue;
        } // 6232
        g.V_1798 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6233
        pc = 243;
        continue;
      case 243:
        // L_481a4
        g.V_179c = g.s(g.V_1788); // 6235
        if (!(g.V_1788 === g.V_1784)) {
          pc = 244;
          continue;
        } // 6236
        pc = 262;
        continue; // 6237
      case 244:
        // L_481d8
        pc = 75;
        continue; // 6239
      case 245:
        // L_481e5
        pc = 246;
        continue;
      case 246:
        // L_481ea
        if (!(g.V_16c0 !== 1.0)) {
          pc = 247;
          continue;
        } // 6242
        g.V_1784 = g.s(g.V_1784 + g.V_17a8); // 6243
        pc = 247;
        continue;
      case 247:
        // L_48220
        if (!(g.V_16c4 !== 1.0)) {
          pc = 248;
          continue;
        } // 6245
        g.V_1788 = g.s(g.V_1788 - g.V_17ac); // 6246
        pc = 248;
        continue;
      case 248:
        // L_48251
        if (!(g.V_16c0 === 2.0)) {
          pc = 249;
          continue;
        } // 6248
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 2.0), 0, 0); // 6249
        pc = 249;
        continue;
      case 249:
        // L_482a0
        if (!(g.V_16c4 === 2.0)) {
          pc = 250;
          continue;
        } // 6251
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 2.0), 0, 0); // 6252
        pc = 250;
        continue;
      case 250:
        // L_482ef
        if (
          !(
            g.V_1780 === g.V_1788 ||
            g.V_1780 === g.V_1784 ||
            (g.V_1784 >= g.V_1788 && g.V_1780 > g.V_1788 && g.V_1780 < g.V_1784) ||
            (g.V_1784 <= g.V_1788 && g.V_1780 > g.V_1788 && g.V_1780 > g.V_1784) ||
            (g.V_1784 <= g.V_1788 && g.V_1780 < g.V_1788 && g.V_1780 < g.V_1784)
          )
        ) {
          pc = 251;
          continue;
        } // 6254
        pc = 262;
        continue; // 6255
      case 251:
        // L_48428
        g.V_0f18 = ""; // 6257
        g.V_1790 = g.s(g.V_1788); // 6258
        pc = 252;
        continue;
      case 252:
        // L_48450
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) !== 1)) {
          pc = 253;
          continue;
        } // 6260
        g.V_0f18 = "*"; // 6261
        pc = 253;
        continue;
      case 253:
        // L_48494
        if (!(g.V_0f18 === "*")) {
          pc = 254;
          continue;
        } // 6263
        pc = 256;
        continue; // 6264
      case 254:
        // L_484b3
        g.V_1790 = g.s(g.V_1790 + 1.0); // 6266
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1790)) {
          pc = 255;
          continue;
        } // 6267
        g.V_1790 = g.s(1.0); // 6268
        pc = 255;
        continue;
      case 255:
        // L_48512
        if (!(g.V_1790 === g.V_1784)) {
          pc = 252;
          continue;
        } // 6270
        pc = 256;
        continue;
      case 256:
        // L_4852e
        if (!(g.V_0f18 === "")) {
          pc = 259;
          continue;
        } // 6272
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6273
        if (!(g.V_16bc === 1.0)) {
          pc = 257;
          continue;
        } // 6274
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.A_160c.get(0, 0)), 0); // 6275
        g.A_1342.set(qbCint(1), qbCint(g.V_177c), qbCint(g.V_1780)); // 6276
        g.V_16bc = g.s(2.0); // 6277
        pc = 258;
        continue; // 6278
      case 257:
        // L_48615
        g.A_160c.set(g.s(g.V_1760), qbCint(g.A_160c.get(0, 0)), 0); // 6280
        g.A_160c.set(g.s(g.V_1764), qbCint(g.A_160c.get(0, 0)), 1); // 6281
        pc = 258;
        continue;
      case 258:
        // L_4868d
        g.A_160c.set(
          g.s(
            g.V_1760 +
              Math.cos(g.V_1688) * -(Math.abs(Math.cos(g.V_1688)) > g.V_133e ? -1 : 0) * 1000.0,
          ),
          qbCint(g.A_160c.get(0, 0)),
          2,
        ); // 6283
        g.A_160c.set(
          g.s(
            g.V_1764 +
              Math.sin(g.V_1688) * -(Math.abs(Math.sin(g.V_1688)) > g.V_133e ? -1 : 0) * 1000.0,
          ),
          qbCint(g.A_160c.get(0, 0)),
          3,
        ); // 6284
        pc = 261;
        continue; // 6285
      case 259:
        // L_48784
        if (!(g.V_16bc > 1.0)) {
          pc = 260;
          continue;
        } // 6287
        L_BP40.set(g.s(L_BP40.get(0, 0) + 1.0), 0, 0); // 6288
        L_BP40.set(g.s(g.V_1760), qbCint(L_BP40.get(0, 0)), 0); // 6289
        L_BP40.set(g.s(g.V_1764), qbCint(L_BP40.get(0, 0)), 1); // 6290
        L_BP40.set(g.s(g.V_1688), qbCint(L_BP40.get(0, 0)), 2); // 6291
        pc = 260;
        continue;
      case 260:
        // L_48882
        pc = 261;
        continue;
      case 261:
        // L_48887
        pc = 262;
        continue;
      case 262:
        // L_4888c
        g.V_0f10 = g.s(g.V_0f10 + passo5); // 6295
        if (passo5 >= 0 ? g.V_0f10 <= lim5 : g.V_0f10 >= lim5) {
          pc = 470;
          continue;
        }
        pc = 471;
        continue;
      case 471:
        g.V_16cc = g.s(-1.0); // 6296
        g.V_0ef0 = g.s(1.0); // 6297
        pc = 263;
        continue;
      case 263:
        // L_488e4
        g.V_1790 = g.s(g.V_0ef0 - 1.0); // 6299
        if (!(g.V_1790 === 0.0)) {
          pc = 264;
          continue;
        } // 6300
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6301
        pc = 264;
        continue;
      case 264:
        // L_48944
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) < 0.0)) {
          pc = 274;
          continue;
        } // 6303
        g.V_1790 = g.s(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0))); // 6304
        g.V_1794 = g.s(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)) - 1.0); // 6305
        if (!(g.V_1794 === 0.0)) {
          pc = 265;
          continue;
        } // 6306
        g.V_1794 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6307
        pc = 265;
        continue;
      case 265:
        // L_48a21
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1794)) === 1 ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 266;
          continue;
        } // 6309
        pc = 275;
        continue; // 6310
      case 266:
        // L_48a93
        pc = 267;
        continue;
      case 267:
        // L_48a98
        if (!(g.A_160c.get(0, 0) <= g.V_0ef0)) {
          pc = 268;
          continue;
        } // 6313
        pc = 276;
        continue; // 6314
      case 268:
        // L_48acf
        g.V_0f14 = g.s(g.V_0ef0 + 1.0); // 6316
        pc = 269;
        continue;
      case 269:
        // L_48aea
        if (!(g.A_160c.get(qbCint(g.V_0f14), 0) === g.A_160c.get(qbCint(g.V_0ef0), 0))) {
          pc = 271;
          continue;
        } // 6318
        g.V_0ef4 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)))); // 6319
        g.V_0efc = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)))); // 6320
        g.V_17e0 =
          g.pot(g.V_0ef4 - g.A_160c.get(qbCint(g.V_0ef0), 2), 2.0) +
          g.pot(g.V_0efc - g.A_160c.get(qbCint(g.V_0ef0), 3), 2.0); // 6321
        g.V_17f0 =
          g.pot(g.V_0ef4 - g.A_160c.get(qbCint(g.V_0f14), 2), 2.0) +
          g.pot(g.V_0efc - g.A_160c.get(qbCint(g.V_0f14), 3), 2.0); // 6322
        if (!(g.V_17e0 > g.V_17f0)) {
          pc = 270;
          continue;
        } // 6323
        g.V_1778 = g.s(0.0); // 6324
        lim6 = g.s(3.0);
        passo6 = g.s(1);
        if (passo6 >= 0 ? g.V_1778 > lim6 : g.V_1778 < lim6) {
          pc = 478;
          continue;
        }
        pc = 477;
        continue;
      case 477:
        {
          const t = g.A_160c.get(qbCint(g.V_0ef0), qbCint(g.V_1778));
          g.A_160c.set(
            g.A_160c.get(qbCint(g.V_0f14), qbCint(g.V_1778)),
            qbCint(g.V_0ef0),
            qbCint(g.V_1778),
          );
          g.A_160c.set(t, qbCint(g.V_0f14), qbCint(g.V_1778));
        } // 6325
        g.V_1778 = g.s(g.V_1778 + passo6); // 6326
        if (passo6 >= 0 ? g.V_1778 <= lim6 : g.V_1778 >= lim6) {
          pc = 477;
          continue;
        }
        pc = 478;
        continue;
      case 478:
        pc = 270;
        continue;
      case 270:
        // L_48d4a
        L_BP162 = g.A_160c.get(0, 0) - 1.0; // 6328
        g.V_0ef4 = g.V_0f14; // 6329
        lim7 = L_BP162;
        passo7 = 1;
        if (passo7 >= 0 ? g.V_0ef4 > lim7 : g.V_0ef4 < lim7) {
          pc = 480;
          continue;
        }
        pc = 479;
        continue;
      case 479:
        g.V_0efc = 0.0; // 6330
        lim8 = 3.0;
        passo8 = 1;
        if (passo8 >= 0 ? g.V_0efc > lim8 : g.V_0efc < lim8) {
          pc = 482;
          continue;
        }
        pc = 481;
        continue;
      case 481:
        g.A_160c.set(
          g.s(g.A_160c.get(qbCint(g.V_0ef4 + 1.0), qbCint(g.V_0efc))),
          qbCint(g.V_0ef4),
          qbCint(g.V_0efc),
        ); // 6331
        g.V_0efc = g.V_0efc + passo8; // 6332
        if (passo8 >= 0 ? g.V_0efc <= lim8 : g.V_0efc >= lim8) {
          pc = 481;
          continue;
        }
        pc = 482;
        continue;
      case 482:
        g.V_0ef4 = g.V_0ef4 + passo7; // 6333
        if (passo7 >= 0 ? g.V_0ef4 <= lim7 : g.V_0ef4 >= lim7) {
          pc = 479;
          continue;
        }
        pc = 480;
        continue;
      case 480:
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 6334
        g.V_0f14 = g.s(0.0); // 6335
        pc = 272;
        continue; // 6336
      case 271:
        // L_48e92
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6338
        if (!(g.A_160c.get(0, 0) < g.V_0f14)) {
          pc = 269;
          continue;
        } // 6339
        pc = 272;
        continue;
      case 272:
        // L_48ed2
        if (!(g.V_0f14 === 0.0)) {
          pc = 273;
          continue;
        } // 6341
        pc = 267;
        continue; // 6342
      case 273:
        // L_48ef5
        pc = 274;
        continue;
      case 274:
        // L_48efa
        pc = 275;
        continue;
      case 275:
        // L_48eff
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6346
        if (!(g.A_160c.get(0, 0) <= g.V_0ef0)) {
          pc = 263;
          continue;
        } // 6347
        pc = 276;
        continue;
      case 276:
        // L_48f44
        g.V_0ef0 = g.s(1.0); // 6349
        pc = 277;
        continue;
      case 277:
        // L_48f5a
        g.V_16f0 = g.A_160c.get(qbCint(g.V_0ef0), 0); // 6351
        g.V_16f8 = g.A_160c.get(qbCint(g.V_0ef0), 1); // 6352
        g.V_1700 = g.A_160c.get(qbCint(g.V_0ef0), 2); // 6353
        g.V_1708 = g.A_160c.get(qbCint(g.V_0ef0), 3); // 6354
        if (!(Math.abs(g.V_16f0 - g.V_1700) < g.V_133a)) {
          pc = 278;
          continue;
        } // 6355
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 0)), qbCint(g.V_0ef0), 2); // 6356
        g.V_1700 = g.V_16f0; // 6357
        pc = 278;
        continue;
      case 278:
        // L_49077
        if (!(Math.abs(g.V_16f8 - g.V_1708) < g.V_133a)) {
          pc = 279;
          continue;
        } // 6359
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 1)), qbCint(g.V_0ef0), 3); // 6360
        g.V_1708 = g.V_16f8; // 6361
        pc = 279;
        continue;
      case 279:
        // L_490f0
        g.V_0f14 = g.s(g.V_0ef0 + 1.0); // 6363
        pc = 280;
        continue;
      case 280:
        // L_4910c
        if (!(g.A_160c.get(0, 0) >= g.V_0f14)) {
          pc = 289;
          continue;
        } // 6365
        g.V_16d0 = g.A_160c.get(qbCint(g.V_0f14), 0); // 6366
        g.V_16d8 = g.A_160c.get(qbCint(g.V_0f14), 1); // 6367
        g.V_16e0 = g.A_160c.get(qbCint(g.V_0f14), 2); // 6368
        g.V_16e8 = g.A_160c.get(qbCint(g.V_0f14), 3); // 6369
        if (!(Math.abs(g.V_16f0 - g.V_16d0) < g.V_133a)) {
          pc = 281;
          continue;
        } // 6370
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 0)), qbCint(g.V_0f14), 0); // 6371
        pc = 281;
        continue;
      case 281:
        // L_4923f
        if (!(Math.abs(g.V_16f0 - g.V_16e0) < g.V_133a)) {
          pc = 282;
          continue;
        } // 6373
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 0)), qbCint(g.V_0f14), 2); // 6374
        pc = 282;
        continue;
      case 282:
        // L_492a3
        if (!(Math.abs(g.V_1700 - g.V_16d0) < g.V_133a)) {
          pc = 283;
          continue;
        } // 6376
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 2)), qbCint(g.V_0f14), 0); // 6377
        pc = 283;
        continue;
      case 283:
        // L_49307
        if (!(Math.abs(g.V_1700 - g.V_16e0) < g.V_133a)) {
          pc = 284;
          continue;
        } // 6379
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 2)), qbCint(g.V_0f14), 2); // 6380
        pc = 284;
        continue;
      case 284:
        // L_49369
        if (!(Math.abs(g.V_16f8 - g.V_16d8) < g.V_133a)) {
          pc = 285;
          continue;
        } // 6382
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 1)), qbCint(g.V_0f14), 1); // 6383
        pc = 285;
        continue;
      case 285:
        // L_493d1
        if (!(Math.abs(g.V_16f8 - g.V_16e8) < g.V_133a)) {
          pc = 286;
          continue;
        } // 6385
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 1)), qbCint(g.V_0f14), 3); // 6386
        pc = 286;
        continue;
      case 286:
        // L_49439
        if (!(Math.abs(g.V_1708 - g.V_16d8) < g.V_133a)) {
          pc = 287;
          continue;
        } // 6388
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 3)), qbCint(g.V_0f14), 1); // 6389
        pc = 287;
        continue;
      case 287:
        // L_494a1
        if (!(Math.abs(g.V_1708 - g.V_16e8) < g.V_133a)) {
          pc = 288;
          continue;
        } // 6391
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 3)), qbCint(g.V_0f14), 3); // 6392
        pc = 288;
        continue;
      case 288:
        // L_49509
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6394
        pc = 280;
        continue; // 6395
      case 289:
        // L_49528
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6397
        if (!(g.A_160c.get(0, 0) < g.V_0ef0)) {
          pc = 277;
          continue;
        } // 6398
        pc = 290;
        continue;
      case 290:
        // L_4956d
        g.V_0ef0 = g.s(1.0); // 6400
        pc = 291;
        continue;
      case 291:
        // L_49588
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) >= 0.0)) {
          pc = 292;
          continue;
        } // 6402
        g.V_16f0 = g.A_160c.get(qbCint(g.V_0ef0), 0); // 6403
        g.V_16f8 = g.A_160c.get(qbCint(g.V_0ef0), 1); // 6404
        pc = 293;
        continue; // 6405
      case 292:
        // L_49619
        g.V_16f0 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)))); // 6407
        g.V_16f8 = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)))); // 6408
        pc = 293;
        continue;
      case 293:
        // L_496a4
        g.V_1700 = g.A_160c.get(qbCint(g.V_0ef0), 2); // 6410
        g.V_1708 = g.A_160c.get(qbCint(g.V_0ef0), 3); // 6411
        g.V_0f14 = g.s(g.V_0ef0 + 1.0); // 6412
        pc = 294;
        continue;
      case 294:
        // L_49712
        if (!(g.A_160c.get(qbCint(g.V_0f14), 0) >= 0.0)) {
          pc = 295;
          continue;
        } // 6414
        g.V_16d0 = g.A_160c.get(qbCint(g.V_0f14), 0); // 6415
        g.V_16d8 = g.A_160c.get(qbCint(g.V_0f14), 1); // 6416
        pc = 298;
        continue; // 6417
      case 295:
        // L_497a3
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) < 0.0)) {
          pc = 297;
          continue;
        } // 6419
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) !== g.A_160c.get(qbCint(g.V_0f14), 0))) {
          pc = 296;
          continue;
        } // 6420
        pc = 324;
        continue; // 6421
      case 296:
        // L_4982c
        pc = 297;
        continue;
      case 297:
        // L_49831
        g.V_16d0 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0f14), 0)))); // 6424
        g.V_16d8 = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0f14), 0)))); // 6425
        pc = 298;
        continue;
      case 298:
        // L_498bc
        g.V_16e0 = g.A_160c.get(qbCint(g.V_0f14), 2); // 6427
        g.V_16e8 = g.A_160c.get(qbCint(g.V_0f14), 3); // 6428
        L_BP166 = g.s(g.V_16f0 / 1.0); // 6429
        L_BP16a = g.s(g.V_1700 / 1.0); // 6430
        L_BP16e = g.s(L_BP166 > L_BP16a ? L_BP166 : L_BP16a); // 6431
        L_BP172 = g.s(g.V_16d0 / 1.0); // 6433
        L_BP176 = g.s(g.V_16e0 / 1.0); // 6434
        L_BP17a = g.s(L_BP172 < L_BP176 ? L_BP172 : L_BP176); // 6435
        L_BP17e = g.s(g.V_16f0 / 1.0); // 6437
        L_BP182 = g.s(g.V_1700 / 1.0); // 6438
        L_BP186 = g.s(L_BP17e < L_BP182 ? L_BP17e : L_BP182); // 6439
        L_BP18a = g.s(g.V_16d0 / 1.0); // 6441
        L_BP18e = g.s(g.V_16e0 / 1.0); // 6442
        L_BP192 = g.s(L_BP18a > L_BP18e ? L_BP18a : L_BP18e); // 6443
        if (!(L_BP186 > L_BP192 || L_BP16e < L_BP17a)) {
          pc = 299;
          continue;
        } // 6445
        pc = 324;
        continue; // 6446
      case 299:
        // L_49a2d
        L_BP196 = g.s(g.V_16f8 / 1.0); // 6448
        L_BP19a = g.s(g.V_1708 / 1.0); // 6449
        L_BP19e = g.s(L_BP196 > L_BP19a ? L_BP196 : L_BP19a); // 6450
        L_BP1a2 = g.s(g.V_16d8 / 1.0); // 6452
        L_BP1a6 = g.s(g.V_16e8 / 1.0); // 6453
        L_BP1aa = g.s(L_BP1a2 < L_BP1a6 ? L_BP1a2 : L_BP1a6); // 6454
        L_BP1ae = g.s(g.V_16f8 / 1.0); // 6456
        L_BP1b2 = g.s(g.V_1708 / 1.0); // 6457
        L_BP1b6 = g.s(L_BP1ae < L_BP1b2 ? L_BP1ae : L_BP1b2); // 6458
        L_BP1ba = g.s(g.V_16d8 / 1.0); // 6460
        L_BP1be = g.s(g.V_16e8 / 1.0); // 6461
        L_BP1c2 = g.s(L_BP1ba > L_BP1be ? L_BP1ba : L_BP1be); // 6462
        if (!(L_BP1b6 > L_BP1c2 || L_BP19e < L_BP1aa)) {
          pc = 300;
          continue;
        } // 6464
        pc = 324;
        continue; // 6465
      case 300:
        // L_49b4b
        if (
          !(
            (g.V_16f0 !== g.V_1700 && g.V_16d0 === g.V_16e0) ||
            (g.V_16d0 !== g.V_16e0 && g.V_16f0 === g.V_1700)
          )
        ) {
          pc = 301;
          continue;
        } // 6467
        pc = 324;
        continue; // 6468
      case 301:
        // L_49bc7
        if (!(g.V_16f0 !== g.V_16e0 && g.V_16d0 === g.V_16e0 && g.V_16f0 === g.V_1700)) {
          pc = 302;
          continue;
        } // 6470
        pc = 324;
        continue; // 6471
      case 302:
        // L_49c28
        if (!(g.V_16f0 === g.V_1700)) {
          pc = 303;
          continue;
        } // 6473
        g.V_17e0 = g.V_16f0; // 6474
        g.V_17e8 = g.V_1700; // 6475
        L_BP1c6 = g.s(g.V_16f8 / 1.0); // 6476
        L_BP1ca = g.s(g.V_1708 / 1.0); // 6477
        L_BP1ce = g.s(L_BP1c6 < L_BP1ca ? L_BP1c6 : L_BP1ca); // 6478
        L_BP1d2 = g.s(g.V_16d8 / 1.0); // 6480
        L_BP1d6 = g.s(g.V_16e8 / 1.0); // 6481
        L_BP1da = g.s(L_BP1d2 < L_BP1d6 ? L_BP1d2 : L_BP1d6); // 6482
        L_BP1de = g.s(L_BP1ce < L_BP1da ? L_BP1ce : L_BP1da); // 6484
        g.V_17f0 = L_BP1de; // 6486
        L_BP1e2 = g.s(g.V_16f8 / 1.0); // 6487
        L_BP1e6 = g.s(g.V_1708 / 1.0); // 6488
        L_BP1ea = g.s(L_BP1e2 > L_BP1e6 ? L_BP1e2 : L_BP1e6); // 6489
        L_BP1ee = g.s(g.V_16d8 / 1.0); // 6491
        L_BP1f2 = g.s(g.V_16e8 / 1.0); // 6492
        L_BP1f6 = g.s(L_BP1ee > L_BP1f2 ? L_BP1ee : L_BP1f2); // 6493
        L_BP1fa = g.s(L_BP1ea > L_BP1f6 ? L_BP1ea : L_BP1f6); // 6495
        g.V_17f8 = L_BP1fa; // 6497
        pc = 315;
        continue; // 6498
      case 303:
        // L_49d94
        if (
          !(
            Math.abs(
              (g.V_1708 - g.V_16f8) / (g.V_1700 - g.V_16f0) -
                (g.V_16e8 - g.V_16d8) / (g.V_16e0 - g.V_16d0),
            ) > g.V_133a
          )
        ) {
          pc = 304;
          continue;
        } // 6500
        pc = 324;
        continue; // 6501
      case 304:
        // L_49de6
        if (
          !(
            (g.V_1708 === g.V_16e8 && g.V_1700 === g.V_16e0) ||
            (g.V_1708 === g.V_16d8 && g.V_1700 === g.V_16d0) ||
            (g.V_16f8 === g.V_16e8 && g.V_16f0 === g.V_16e0) ||
            (g.V_16f8 === g.V_16d8 && g.V_16f0 === g.V_16d0)
          )
        ) {
          pc = 305;
          continue;
        } // 6503
        pc = 308;
        continue; // 6504
      case 305:
        // L_49ece
        if (!(g.V_16e0 === g.V_16f0)) {
          pc = 306;
          continue;
        } // 6506
        pc = 324;
        continue; // 6507
      case 306:
        // L_49ef1
        if (
          !(
            Math.abs(
              (g.V_1708 - g.V_16f8) / (g.V_1700 - g.V_16f0) -
                (g.V_16e8 - g.V_16f8) / (g.V_16e0 - g.V_16f0),
            ) > g.V_133a
          )
        ) {
          pc = 307;
          continue;
        } // 6509
        pc = 324;
        continue; // 6510
      case 307:
        // L_49f43
        pc = 308;
        continue;
      case 308:
        // L_49f48
        g.V_17e0 = g.V_16f0; // 6513
        g.V_17f0 = g.V_16f8; // 6514
        if (!(g.V_1700 < g.V_17e0)) {
          pc = 309;
          continue;
        } // 6515
        g.V_17e0 = g.V_1700; // 6516
        g.V_17f0 = g.V_1708; // 6517
        pc = 309;
        continue;
      case 309:
        // L_49fac
        if (!(g.V_16d0 < g.V_17e0)) {
          pc = 310;
          continue;
        } // 6519
        g.V_17e0 = g.V_16d0; // 6520
        g.V_17f0 = g.V_16d8; // 6521
        pc = 310;
        continue;
      case 310:
        // L_49fe9
        if (!(g.V_16e0 < g.V_17e0)) {
          pc = 311;
          continue;
        } // 6523
        g.V_17e0 = g.V_16e0; // 6524
        g.V_17f0 = g.V_16e8; // 6525
        pc = 311;
        continue;
      case 311:
        // L_4a026
        g.V_17e8 = g.V_16f0; // 6527
        g.V_17f8 = g.V_16f8; // 6528
        if (!(g.V_1700 > g.V_17e8)) {
          pc = 312;
          continue;
        } // 6529
        g.V_17e8 = g.V_1700; // 6530
        g.V_17f8 = g.V_1708; // 6531
        pc = 312;
        continue;
      case 312:
        // L_4a085
        if (!(g.V_16d0 > g.V_17e8)) {
          pc = 313;
          continue;
        } // 6533
        g.V_17e8 = g.V_16d0; // 6534
        g.V_17f8 = g.V_16d8; // 6535
        pc = 313;
        continue;
      case 313:
        // L_4a0c2
        if (!(g.V_16e0 > g.V_17e8)) {
          pc = 314;
          continue;
        } // 6537
        g.V_17e8 = g.V_16e0; // 6538
        g.V_17f8 = g.V_16e8; // 6539
        pc = 314;
        continue;
      case 314:
        // L_4a0ff
        pc = 315;
        continue;
      case 315:
        // L_4a104
        g.V_1780 = g.s(0.0); // 6542
        L_BP1fe = g.s(g.A_109e.get(qbCint(g.V_177c), 0)); // 6543
        g.V_1778 = g.s(1.0); // 6544
        lim9 = g.s(L_BP1fe);
        passo9 = g.s(1);
        if (passo9 >= 0 ? g.V_1778 > lim9 : g.V_1778 < lim9) {
          pc = 484;
          continue;
        }
        pc = 483;
        continue;
      case 483:
        if (
          !(
            g.A_15de.get(qbCint(g.V_1778)) === g.V_17f0 &&
            g.A_15b0.get(qbCint(g.V_1778)) === g.V_17e0
          )
        ) {
          pc = 316;
          continue;
        } // 6545
        g.V_1780 = g.s(g.V_1778); // 6546
        pc = 317;
        continue; // 6547
      case 316:
        // L_4a1da
        g.V_1778 = g.s(g.V_1778 + passo9); // 6549
        if (passo9 >= 0 ? g.V_1778 <= lim9 : g.V_1778 >= lim9) {
          pc = 483;
          continue;
        }
        pc = 484;
        continue;
      case 484:
        pc = 317;
        continue;
      case 317:
        // L_4a206
        if (!(g.V_1780 !== 0.0)) {
          pc = 318;
          continue;
        } // 6551
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.V_0ef0), 0); // 6552
        g.A_160c.set(g.s(0.0), qbCint(g.V_0ef0), 1); // 6553
        g.A_160c.set(g.s(g.V_17e8), qbCint(g.V_0ef0), 2); // 6554
        g.A_160c.set(g.s(g.V_17f8), qbCint(g.V_0ef0), 3); // 6555
        pc = 323;
        continue; // 6556
      case 318:
        // L_4a2d9
        g.V_1780 = g.s(0.0); // 6558
        L_BP202 = g.s(g.A_109e.get(qbCint(g.V_177c), 0)); // 6559
        g.V_1778 = g.s(1.0); // 6560
        lim10 = g.s(L_BP202);
        passo10 = g.s(1);
        if (passo10 >= 0 ? g.V_1778 > lim10 : g.V_1778 < lim10) {
          pc = 486;
          continue;
        }
        pc = 485;
        continue;
      case 485:
        if (
          !(
            g.A_15de.get(qbCint(g.V_1778)) === g.V_17f8 &&
            g.A_15b0.get(qbCint(g.V_1778)) === g.V_17e8
          )
        ) {
          pc = 319;
          continue;
        } // 6561
        g.V_1780 = g.s(g.V_1778); // 6562
        pc = 320;
        continue; // 6563
      case 319:
        // L_4a3aa
        g.V_1778 = g.s(g.V_1778 + passo10); // 6565
        if (passo10 >= 0 ? g.V_1778 <= lim10 : g.V_1778 >= lim10) {
          pc = 485;
          continue;
        }
        pc = 486;
        continue;
      case 486:
        pc = 320;
        continue;
      case 320:
        // L_4a3d6
        if (!(g.V_1780 !== 0.0)) {
          pc = 321;
          continue;
        } // 6567
        g.A_160c.set(g.s(-g.V_1780), qbCint(g.V_0ef0), 0); // 6568
        g.A_160c.set(g.s(0.0), qbCint(g.V_0ef0), 1); // 6569
        g.A_160c.set(g.s(g.V_17e0), qbCint(g.V_0ef0), 2); // 6570
        g.A_160c.set(g.s(g.V_17f0), qbCint(g.V_0ef0), 3); // 6571
        pc = 323;
        continue; // 6572
      case 321:
        // L_4a4a9
        if (!(g.V_17e0 < 0.0)) {
          pc = 322;
          continue;
        } // 6574
        {
          const t = g.V_17e0;
          g.V_17e0 = g.V_17e8;
          g.V_17e8 = t;
        } // 6575
        {
          const t = g.V_17f0;
          g.V_17f0 = g.V_17f8;
          g.V_17f8 = t;
        } // 6576
        pc = 322;
        continue;
      case 322:
        // L_4a51c
        g.A_160c.set(g.s(g.V_17e0), qbCint(g.V_0ef0), 0); // 6578
        g.A_160c.set(g.s(g.V_17f0), qbCint(g.V_0ef0), 1); // 6579
        g.A_160c.set(g.s(g.V_17e8), qbCint(g.V_0ef0), 2); // 6580
        g.A_160c.set(g.s(g.V_17f8), qbCint(g.V_0ef0), 3); // 6581
        pc = 323;
        continue;
      case 323:
        // L_4a5c9
        L_BP20a = g.A_160c.get(0, 0) - 1.0; // 6583
        g.V_0ef4 = g.V_0f14; // 6584
        lim11 = L_BP20a;
        passo11 = 1;
        if (passo11 >= 0 ? g.V_0ef4 > lim11 : g.V_0ef4 < lim11) {
          pc = 488;
          continue;
        }
        pc = 487;
        continue;
      case 487:
        g.V_0efc = 0.0; // 6585
        lim12 = 3.0;
        passo12 = 1;
        if (passo12 >= 0 ? g.V_0efc > lim12 : g.V_0efc < lim12) {
          pc = 490;
          continue;
        }
        pc = 489;
        continue;
      case 489:
        g.A_160c.set(
          g.s(g.A_160c.get(qbCint(g.V_0ef4 + 1.0), qbCint(g.V_0efc))),
          qbCint(g.V_0ef4),
          qbCint(g.V_0efc),
        ); // 6586
        g.V_0efc = g.V_0efc + passo12; // 6587
        if (passo12 >= 0 ? g.V_0efc <= lim12 : g.V_0efc >= lim12) {
          pc = 489;
          continue;
        }
        pc = 490;
        continue;
      case 490:
        g.V_0ef4 = g.V_0ef4 + passo11; // 6588
        if (passo11 >= 0 ? g.V_0ef4 <= lim11 : g.V_0ef4 >= lim11) {
          pc = 487;
          continue;
        }
        pc = 488;
        continue;
      case 488:
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 6589
        g.V_0ef0 = g.s(0.0); // 6590
        pc = 325;
        continue; // 6591
      case 324:
        // L_4a70c
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6593
        if (!(g.A_160c.get(0, 0) < g.V_0f14)) {
          pc = 294;
          continue;
        } // 6594
        pc = 325;
        continue;
      case 325:
        // L_4a752
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6596
        if (!(g.A_160c.get(0, 0) <= g.V_0ef0)) {
          pc = 291;
          continue;
        } // 6597
        L_BP20e = g.s(0.0); // 6598
        pc = 326;
        continue;
      case 326:
        // L_4a7a8
        g.V_0ef0 = g.s(1.0); // 6600
        pc = 327;
        continue;
      case 327:
        // L_4a7c4
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) >= 0.0)) {
          pc = 328;
          continue;
        } // 6602
        g.V_16f0 = g.A_160c.get(qbCint(g.V_0ef0), 0); // 6603
        g.V_16f8 = g.A_160c.get(qbCint(g.V_0ef0), 1); // 6604
        pc = 329;
        continue; // 6605
      case 328:
        // L_4a855
        g.V_16f0 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)))); // 6607
        g.V_16f8 = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0)))); // 6608
        pc = 329;
        continue;
      case 329:
        // L_4a8e0
        g.V_1700 = g.A_160c.get(qbCint(g.V_0ef0), 2); // 6610
        g.V_1708 = g.A_160c.get(qbCint(g.V_0ef0), 3); // 6611
        g.V_0f14 = g.s(g.V_0ef0 + 1.0); // 6612
        pc = 330;
        continue;
      case 330:
        // L_4a94e
        if (!(g.A_160c.get(qbCint(g.V_0f14), 0) >= 0.0)) {
          pc = 331;
          continue;
        } // 6614
        g.V_16d0 = g.A_160c.get(qbCint(g.V_0f14), 0); // 6615
        g.V_16d8 = g.A_160c.get(qbCint(g.V_0f14), 1); // 6616
        pc = 332;
        continue; // 6617
      case 331:
        // L_4a9df
        g.V_16d0 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0f14), 0)))); // 6619
        g.V_16d8 = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0f14), 0)))); // 6620
        pc = 332;
        continue;
      case 332:
        // L_4aa6a
        g.V_16e0 = g.A_160c.get(qbCint(g.V_0f14), 2); // 6622
        g.V_16e8 = g.A_160c.get(qbCint(g.V_0f14), 3); // 6623
        S_2018c(g); // 6624
        if (!(g.V_0f1c === "NAO")) {
          pc = 333;
          continue;
        } // 6626
        pc = 337;
        continue; // 6627
      case 333:
        // L_4aae6
        if (
          !(
            (Math.abs(g.V_0efc - g.V_1708) < g.V_133a &&
              Math.abs(g.V_0ef4 - g.V_1700) < g.V_133a) ||
            (Math.abs(g.V_0efc - g.V_16f8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_16f0) < g.V_133a)
          )
        ) {
          pc = 334;
          continue;
        } // 6629
        pc = 335;
        continue; // 6630
      case 334:
        // L_4ab82
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6632
        g.A_160c.set(g.s(g.V_0ef4), qbCint(g.A_160c.get(0, 0)), 0); // 6633
        g.A_160c.set(g.s(g.V_0efc), qbCint(g.A_160c.get(0, 0)), 1); // 6634
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 2)), qbCint(g.A_160c.get(0, 0)), 2); // 6635
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 3)), qbCint(g.A_160c.get(0, 0)), 3); // 6636
        g.A_160c.set(g.s(g.V_0ef4), qbCint(g.V_0ef0), 2); // 6637
        g.A_160c.set(g.s(g.V_0efc), qbCint(g.V_0ef0), 3); // 6638
        g.V_1700 = g.V_0ef4; // 6639
        g.V_1708 = g.V_0efc; // 6640
        pc = 335;
        continue;
      case 335:
        // L_4ad45
        if (
          !(
            (Math.abs(g.V_0efc - g.V_16e8) < g.V_133a &&
              Math.abs(g.V_0ef4 - g.V_16e0) < g.V_133a) ||
            (Math.abs(g.V_0efc - g.V_16d8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_16d0) < g.V_133a)
          )
        ) {
          pc = 336;
          continue;
        } // 6642
        pc = 337;
        continue; // 6643
      case 336:
        // L_4ade6
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6645
        g.A_160c.set(g.s(g.V_0ef4), qbCint(g.A_160c.get(0, 0)), 0); // 6646
        g.A_160c.set(g.s(g.V_0efc), qbCint(g.A_160c.get(0, 0)), 1); // 6647
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0f14), 2)), qbCint(g.A_160c.get(0, 0)), 2); // 6648
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0f14), 3)), qbCint(g.A_160c.get(0, 0)), 3); // 6649
        g.A_160c.set(g.s(g.V_0ef4), qbCint(g.V_0f14), 2); // 6650
        g.A_160c.set(g.s(g.V_0efc), qbCint(g.V_0f14), 3); // 6651
        pc = 337;
        continue;
      case 337:
        // L_4af87
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6653
        if (!(g.A_160c.get(0, 0) < g.V_0f14)) {
          pc = 330;
          continue;
        } // 6654
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6655
        if (!(g.A_160c.get(0, 0) <= g.V_0ef0)) {
          pc = 327;
          continue;
        } // 6656
        if (!(g.A_10cc.get(qbCint(g.V_0f0c), 1) === 1.0)) {
          pc = 338;
          continue;
        } // 6657
        pc = 403;
        continue; // 6658
      case 338:
        // L_4b049
        g.V_0ef0 = g.s(1.0); // 6660
        pc = 339;
        continue;
      case 339:
        // L_4b060
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) >= 0.0)) {
          pc = 348;
          continue;
        } // 6662
        g.V_1778 = g.s(2.0); // 6663
        g.V_17e0 = g.A_160c.get(qbCint(g.V_0ef0), 0); // 6664
        g.V_17f0 = g.A_160c.get(qbCint(g.V_0ef0), 1); // 6665
        L_BP212 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6666
        g.V_0f14 = g.s(1.0); // 6667
        lim13 = g.s(L_BP212);
        passo13 = g.s(1);
        if (passo13 >= 0 ? g.V_0f14 > lim13 : g.V_0f14 < lim13) {
          pc = 492;
          continue;
        }
        pc = 491;
        continue;
      case 491:
        if (
          !(
            Math.abs(g.A_15de.get(qbCint(g.V_0f14)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.A_15b0.get(qbCint(g.V_0f14)) - g.V_17e0) < g.V_133a
          )
        ) {
          pc = 340;
          continue;
        } // 6668
        pc = 341;
        continue; // 6669
      case 340:
        // L_4b1b6
        g.V_0f14 = g.s(g.V_0f14 + passo13); // 6671
        if (passo13 >= 0 ? g.V_0f14 <= lim13 : g.V_0f14 >= lim13) {
          pc = 491;
          continue;
        }
        pc = 492;
        continue;
      case 492:
        pc = 341;
        continue;
      case 341:
        // L_4b1e2
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) > g.V_0f14)) {
          pc = 342;
          continue;
        } // 6673
        pc = 349;
        continue; // 6674
      case 342:
        // L_4b222
        pilha.push(493);
        pc = 440;
        continue; // 6676
      case 493:
        if (!(g.V_0ef0 === 0.0)) {
          pc = 343;
          continue;
        } // 6677
        pc = 350;
        continue; // 6678
      case 343:
        // L_4b252
        g.V_1778 = g.s(0.0); // 6680
        g.V_17e0 = g.A_160c.get(qbCint(g.V_0ef0), 2); // 6681
        g.V_17f0 = g.A_160c.get(qbCint(g.V_0ef0), 3); // 6682
        L_BP216 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6683
        g.V_0f14 = g.s(1.0); // 6684
        lim14 = g.s(L_BP216);
        passo14 = g.s(1);
        if (passo14 >= 0 ? g.V_0f14 > lim14 : g.V_0f14 < lim14) {
          pc = 495;
          continue;
        }
        pc = 494;
        continue;
      case 494:
        if (
          !(
            Math.abs(g.A_15de.get(qbCint(g.V_0f14)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.A_15b0.get(qbCint(g.V_0f14)) - g.V_17e0) < g.V_133a
          )
        ) {
          pc = 344;
          continue;
        } // 6685
        pc = 345;
        continue; // 6686
      case 344:
        // L_4b372
        g.V_0f14 = g.s(g.V_0f14 + passo14); // 6688
        if (passo14 >= 0 ? g.V_0f14 <= lim14 : g.V_0f14 >= lim14) {
          pc = 494;
          continue;
        }
        pc = 495;
        continue;
      case 495:
        pc = 345;
        continue;
      case 345:
        // L_4b39e
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) > g.V_0f14)) {
          pc = 346;
          continue;
        } // 6690
        pc = 349;
        continue; // 6691
      case 346:
        // L_4b3de
        pilha.push(496);
        pc = 440;
        continue; // 6693
      case 496:
        if (!(g.V_0ef0 === 0.0)) {
          pc = 347;
          continue;
        } // 6694
        pc = 350;
        continue; // 6695
      case 347:
        // L_4b40e
        pc = 348;
        continue;
      case 348:
        // L_4b413
        pc = 349;
        continue;
      case 349:
        // L_4b418
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6699
        if (!(g.A_160c.get(0, 0) < g.V_0ef0)) {
          pc = 339;
          continue;
        } // 6700
        pc = 350;
        continue;
      case 350:
        // L_4b45e
        if (!(g.A_160c.get(0, 0) > g.A_109e.get(qbCint(g.V_177c), 0) && g.V_0ef0 === 0.0)) {
          pc = 351;
          continue;
        } // 6702
        pc = 290;
        continue; // 6703
      case 351:
        // L_4b4d4
        pc = 352;
        continue;
      case 352:
        // L_4b4d9
        g.V_0ef0 = g.s(1.0); // 6706
        pc = 353;
        continue;
      case 353:
        // L_4b4f4
        if (
          !(
            Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 1) - g.A_160c.get(qbCint(g.V_0ef0), 3)) <
              g.V_133a &&
            Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0) - g.A_160c.get(qbCint(g.V_0ef0), 2)) <
              g.V_133a
          )
        ) {
          pc = 356;
          continue;
        } // 6708
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 6709
        if (!(g.A_160c.get(0, 0) < g.V_0ef0)) {
          pc = 354;
          continue;
        } // 6710
        pc = 357;
        continue; // 6711
      case 354:
        // L_4b60e
        g.V_0f14 = g.s(g.V_0ef0); // 6713
        pc = 355;
        continue;
      case 355:
        // L_4b624
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0f14 + 1.0), 0)), qbCint(g.V_0f14), 0); // 6715
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0f14 + 1.0), 1)), qbCint(g.V_0f14), 1); // 6716
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0f14 + 1.0), 2)), qbCint(g.V_0f14), 2); // 6717
        g.A_160c.set(g.s(g.A_160c.get(qbCint(g.V_0f14 + 1.0), 3)), qbCint(g.V_0f14), 3); // 6718
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6719
        if (!(g.A_160c.get(0, 0) < g.V_0f14)) {
          pc = 355;
          continue;
        } // 6720
        pc = 352;
        continue; // 6721
      case 356:
        // L_4b791
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6723
        if (!(g.A_160c.get(0, 0) < g.V_0ef0)) {
          pc = 353;
          continue;
        } // 6724
        pc = 357;
        continue;
      case 357:
        // L_4b7d2
        if (!(L_BP20e === 1.0)) {
          pc = 358;
          continue;
        } // 6726
        pc = 402;
        continue; // 6727
      case 358:
        // L_4b7f5
        if (!(L_BP20e === 2.0)) {
          pc = 359;
          continue;
        } // 6729
        pc = 403;
        continue; // 6730
      case 359:
        // L_4b818
        g.V_0ef0 = g.s(1.0); // 6732
        pc = 360;
        continue;
      case 360:
        // L_4b82e
        if (!(L_BP40.get(0, 0) >= g.V_0ef0)) {
          pc = 369;
          continue;
        } // 6734
        g.V_1778 = g.s(0.0); // 6735
        L_BP21a = g.s(g.A_160c.get(0, 0)); // 6736
        g.V_0f10 = g.s(1.0); // 6737
        lim15 = g.s(L_BP21a);
        passo15 = g.s(1);
        if (passo15 >= 0 ? g.V_0f10 > lim15 : g.V_0f10 < lim15) {
          pc = 498;
          continue;
        }
        pc = 497;
        continue;
      case 497:
        if (!(g.A_160c.get(qbCint(g.V_0f10), 0) > 0.0)) {
          pc = 362;
          continue;
        } // 6738
        if (
          !(
            Math.abs(g.A_160c.get(qbCint(g.V_0f10), 1) - L_BP40.get(qbCint(g.V_0ef0), 1)) <
              g.V_133a &&
            Math.abs(g.A_160c.get(qbCint(g.V_0f10), 0) - L_BP40.get(qbCint(g.V_0ef0), 0)) < g.V_133a
          )
        ) {
          pc = 361;
          continue;
        } // 6739
        g.V_1778 = g.s(1.0); // 6740
        pc = 361;
        continue;
      case 361:
        // L_4b987
        pc = 362;
        continue;
      case 362:
        // L_4b98c
        if (
          !(
            Math.abs(g.A_160c.get(qbCint(g.V_0f10), 3) - L_BP40.get(qbCint(g.V_0ef0), 1)) <
              g.V_133a &&
            Math.abs(g.A_160c.get(qbCint(g.V_0f10), 2) - L_BP40.get(qbCint(g.V_0ef0), 0)) < g.V_133a
          )
        ) {
          pc = 363;
          continue;
        } // 6743
        g.V_1778 = g.s(1.0); // 6744
        pc = 363;
        continue;
      case 363:
        // L_4ba51
        if (!(g.V_1778 === 1.0)) {
          pc = 364;
          continue;
        } // 6746
        pc = 365;
        continue; // 6747
      case 364:
        // L_4ba74
        g.V_0f10 = g.s(g.V_0f10 + passo15); // 6749
        if (passo15 >= 0 ? g.V_0f10 <= lim15 : g.V_0f10 >= lim15) {
          pc = 497;
          continue;
        }
        pc = 498;
        continue;
      case 498:
        pc = 365;
        continue;
      case 365:
        // L_4baa0
        if (!(g.V_1778 === 1.0)) {
          pc = 366;
          continue;
        } // 6751
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6752
        pc = 368;
        continue; // 6753
      case 366:
        // L_4bad9
        if (!(L_BP40.get(0, 0) > g.V_0ef0)) {
          pc = 367;
          continue;
        } // 6755
        {
          const t = L_BP40.get(qbCint(g.V_0ef0), 0);
          L_BP40.set(L_BP40.get(qbCint(L_BP40.get(0, 0)), 0), qbCint(g.V_0ef0), 0);
          L_BP40.set(t, qbCint(L_BP40.get(0, 0)), 0);
        } // 6756
        {
          const t = L_BP40.get(qbCint(g.V_0ef0), 1);
          L_BP40.set(L_BP40.get(qbCint(L_BP40.get(0, 0)), 1), qbCint(g.V_0ef0), 1);
          L_BP40.set(t, qbCint(L_BP40.get(0, 0)), 1);
        } // 6757
        {
          const t = L_BP40.get(qbCint(g.V_0ef0), 2);
          L_BP40.set(L_BP40.get(qbCint(L_BP40.get(0, 0)), 2), qbCint(g.V_0ef0), 2);
          L_BP40.set(t, qbCint(L_BP40.get(0, 0)), 2);
        } // 6758
        pc = 367;
        continue;
      case 367:
        // L_4bbf9
        L_BP40.set(g.s(L_BP40.get(0, 0) - 1.0), 0, 0); // 6760
        pc = 368;
        continue;
      case 368:
        // L_4bc32
        pc = 360;
        continue; // 6762
      case 369:
        // L_4bc3a
        g.V_0ef0 = g.s(1.0); // 6764
        pc = 370;
        continue;
      case 370:
        // L_4bc50
        if (!(L_BP40.get(0, 0) >= g.V_0ef0)) {
          pc = 376;
          continue;
        } // 6766
        g.V_1778 = g.s(g.V_0ef0 + 1.0); // 6767
        pc = 371;
        continue;
      case 371:
        // L_4bc90
        if (!(L_BP40.get(0, 0) >= g.V_1778)) {
          pc = 375;
          continue;
        } // 6769
        if (
          !(
            Math.abs(L_BP40.get(qbCint(g.V_0ef0), 1) - L_BP40.get(qbCint(g.V_1778), 1)) <
              g.V_133a &&
            Math.abs(L_BP40.get(qbCint(g.V_0ef0), 0) - L_BP40.get(qbCint(g.V_1778), 0)) < g.V_133a
          )
        ) {
          pc = 373;
          continue;
        } // 6770
        if (!(L_BP40.get(0, 0) > g.V_1778)) {
          pc = 372;
          continue;
        } // 6771
        {
          const t = L_BP40.get(qbCint(g.V_1778), 0);
          L_BP40.set(L_BP40.get(qbCint(L_BP40.get(0, 0)), 0), qbCint(g.V_1778), 0);
          L_BP40.set(t, qbCint(L_BP40.get(0, 0)), 0);
        } // 6772
        {
          const t = L_BP40.get(qbCint(g.V_1778), 1);
          L_BP40.set(L_BP40.get(qbCint(L_BP40.get(0, 0)), 1), qbCint(g.V_1778), 1);
          L_BP40.set(t, qbCint(L_BP40.get(0, 0)), 1);
        } // 6773
        {
          const t = L_BP40.get(qbCint(g.V_1778), 2);
          L_BP40.set(L_BP40.get(qbCint(L_BP40.get(0, 0)), 2), qbCint(g.V_1778), 2);
          L_BP40.set(t, qbCint(L_BP40.get(0, 0)), 2);
        } // 6774
        pc = 372;
        continue;
      case 372:
        // L_4be8b
        L_BP40.set(g.s(L_BP40.get(0, 0) - 1.0), 0, 0); // 6776
        pc = 374;
        continue; // 6777
      case 373:
        // L_4bec7
        g.V_1778 = g.s(g.V_1778 + 1.0); // 6779
        pc = 374;
        continue;
      case 374:
        // L_4bee2
        pc = 371;
        continue; // 6781
      case 375:
        // L_4beea
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6783
        pc = 370;
        continue; // 6784
      case 376:
        // L_4bf08
        g.V_0ef0 = g.s(1.0); // 6786
        pc = 377;
        continue;
      case 377:
        // L_4bf1e
        if (!(L_BP40.get(0, 0) >= g.V_0ef0)) {
          pc = 385;
          continue;
        } // 6788
        g.V_16f0 = L_BP40.get(qbCint(g.V_0ef0), 0); // 6789
        g.V_16f8 = L_BP40.get(qbCint(g.V_0ef0), 1); // 6790
        g.V_1700 =
          Math.cos(L_BP40.get(qbCint(g.V_0ef0), 2)) *
            -(Math.abs(Math.cos(L_BP40.get(qbCint(g.V_0ef0), 2))) > g.V_133e ? -1 : 0) *
            1000.0 +
          L_BP40.get(qbCint(g.V_0ef0), 0); // 6791
        g.V_1708 =
          Math.sin(L_BP40.get(qbCint(g.V_0ef0), 2)) *
            -(Math.abs(Math.sin(L_BP40.get(qbCint(g.V_0ef0), 2))) > g.V_133e ? -1 : 0) *
            1000.0 +
          L_BP40.get(qbCint(g.V_0ef0), 1); // 6792
        g.V_1778 = g.s(0.0); // 6793
        g.V_0f14 = g.s(1.0); // 6794
        if (!(g.V_0f14 === g.V_0ef0)) {
          pc = 378;
          continue;
        } // 6795
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6796
        pc = 378;
        continue;
      case 378:
        // L_4c114
        pc = 379;
        continue;
      case 379:
        // L_4c11a
        if (!(L_BP40.get(0, 0) >= g.V_0f14)) {
          pc = 383;
          continue;
        } // 6799
        g.V_16d0 = L_BP40.get(qbCint(g.V_0f14), 0); // 6800
        g.V_16d8 = L_BP40.get(qbCint(g.V_0f14), 1); // 6801
        g.V_16e0 =
          Math.cos(L_BP40.get(qbCint(g.V_0f14), 2)) *
            -(Math.abs(Math.cos(L_BP40.get(qbCint(g.V_0f14), 2))) > g.V_133e ? -1 : 0) *
            1000.0 +
          L_BP40.get(qbCint(g.V_0f14), 0); // 6802
        g.V_16e8 =
          Math.sin(L_BP40.get(qbCint(g.V_0f14), 2)) *
            -(Math.abs(Math.sin(L_BP40.get(qbCint(g.V_0f14), 2))) > g.V_133e ? -1 : 0) *
            1000.0 +
          L_BP40.get(qbCint(g.V_0f14), 1); // 6803
        S_2018c(g); // 6804
        if (!(g.V_0f1c === "")) {
          pc = 381;
          continue;
        } // 6806
        if (
          !(
            g.pot(g.V_1700 - g.V_16f0, 2.0) + g.pot(g.V_1708 - g.V_16f8, 2.0) >
            g.pot(g.V_0ef4 - g.V_16f0, 2.0) + g.pot(g.V_0efc - g.V_16f8, 2.0)
          )
        ) {
          pc = 380;
          continue;
        } // 6807
        g.V_1700 = g.V_0ef4; // 6808
        g.V_1708 = g.V_0efc; // 6809
        g.V_1778 = g.s(1.0); // 6810
        pc = 380;
        continue;
      case 380:
        // L_4c385
        pc = 381;
        continue;
      case 381:
        // L_4c38a
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6813
        if (!(g.V_0f14 === g.V_0ef0)) {
          pc = 382;
          continue;
        } // 6814
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 6815
        pc = 382;
        continue;
      case 382:
        // L_4c3d1
        pc = 379;
        continue; // 6817
      case 383:
        // L_4c3da
        if (!(g.V_1778 === 1.0)) {
          pc = 384;
          continue;
        } // 6819
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6820
        g.A_160c.set(g.s(g.V_16f0), qbCint(g.A_160c.get(0, 0)), 0); // 6821
        g.A_160c.set(g.s(g.V_16f8), qbCint(g.A_160c.get(0, 0)), 1); // 6822
        g.A_160c.set(g.s(g.V_1700), qbCint(g.A_160c.get(0, 0)), 2); // 6823
        g.A_160c.set(g.s(g.V_1708), qbCint(g.A_160c.get(0, 0)), 3); // 6824
        pc = 384;
        continue;
      case 384:
        // L_4c512
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6826
        pc = 377;
        continue; // 6827
      case 385:
        // L_4c530
        L_BP40.set(g.s(0.0), 0, 0); // 6829
        L_BP21e = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6830
        g.V_0f10 = g.s(1.0); // 6831
        lim16 = g.s(L_BP21e);
        passo16 = g.s(1);
        if (passo16 >= 0 ? g.V_0f10 > lim16 : g.V_0f10 < lim16) {
          pc = 500;
          continue;
        }
        pc = 499;
        continue;
      case 499:
        if (!(g.A_163a.get(qbCint(g.V_0f10), 0) === -100.0)) {
          pc = 386;
          continue;
        } // 6832
        pc = 400;
        continue; // 6833
      case 386:
        // L_4c5c4
        g.V_0ef0 = g.s(1.0); // 6835
        pc = 387;
        continue;
      case 387:
        // L_4c5da
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) < 0.0)) {
          pc = 389;
          continue;
        } // 6837
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) === -g.V_0f10)) {
          pc = 388;
          continue;
        } // 6838
        pc = 393;
        continue; // 6839
      case 388:
        // L_4c64d
        pc = 391;
        continue; // 6841
      case 389:
        // L_4c655
        if (
          !(
            Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 1) - g.A_15de.get(qbCint(g.V_0f10))) <
              g.V_133a &&
            Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0) - g.A_15b0.get(qbCint(g.V_0f10))) < g.V_133a
          )
        ) {
          pc = 390;
          continue;
        } // 6843
        pc = 393;
        continue; // 6844
      case 390:
        // L_4c70c
        pc = 391;
        continue;
      case 391:
        // L_4c711
        if (
          !(
            Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 3) - g.A_15de.get(qbCint(g.V_0f10))) <
              g.V_133a &&
            Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 2) - g.A_15b0.get(qbCint(g.V_0f10))) < g.V_133a
          )
        ) {
          pc = 392;
          continue;
        } // 6847
        pc = 393;
        continue; // 6848
      case 392:
        // L_4c7c6
        g.V_0ef0 = g.s(g.V_0ef0 + 1.0); // 6850
        if (!(g.A_160c.get(0, 0) < g.V_0ef0)) {
          pc = 387;
          continue;
        } // 6851
        pc = 393;
        continue;
      case 393:
        // L_4c806
        if (!(g.A_160c.get(0, 0) < g.V_0ef0)) {
          pc = 399;
          continue;
        } // 6853
        g.V_1780 = g.s(0.0); // 6854
        g.V_1790 = g.s(g.V_0f10 - 1.0); // 6855
        if (!(g.V_1790 === 0.0)) {
          pc = 394;
          continue;
        } // 6856
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6857
        pc = 394;
        continue;
      case 394:
        // L_4c8a1
        g.V_1794 = g.s(g.V_0f10); // 6859
        g.V_1798 = g.s(g.V_0f10); // 6860
        g.V_179c = g.s(g.V_0f10 + 1.0); // 6861
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 395;
          continue;
        } // 6862
        g.V_179c = g.s(1.0); // 6863
        pc = 395;
        continue;
      case 395:
        // L_4c922
        if (
          !(
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1 ||
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1
          )
        ) {
          pc = 396;
          continue;
        } // 6865
        pc = 400;
        continue; // 6866
      case 396:
        // L_4c994
        S_21e5d(g); // 6868
        g.A_160c.set(g.s(g.A_160c.get(0, 0) + 1.0), 0, 0); // 6870
        g.A_160c.set(g.s(-g.V_0f10), qbCint(g.A_160c.get(0, 0)), 0); // 6871
        g.V_16f0 = g.A_15b0.get(qbCint(g.V_0f10)); // 6872
        g.V_16f8 = g.A_15de.get(qbCint(g.V_0f10)); // 6873
        g.V_1700 =
          g.A_15b0.get(qbCint(g.V_0f10)) +
          Math.cos(g.V_16a0) * -(Math.abs(Math.cos(g.V_16a0)) > g.V_133e ? -1 : 0) * 1000.0; // 6874
        g.V_1708 =
          g.A_15de.get(qbCint(g.V_0f10)) +
          Math.sin(g.V_16a0) * -(Math.abs(Math.sin(g.V_16a0)) > g.V_133e ? -1 : 0) * 1000.0; // 6875
        g.V_16b8 = g.s(0.0); // 6876
        L_BP20e = g.s(1.0); // 6877
        pc = 397;
        continue;
      case 397:
        // L_4cb4f
        S_23948(g); // 6879
        if (!(g.V_0f1c === "")) {
          pc = 398;
          continue;
        } // 6881
        g.A_160c.set(g.s(g.V_0ef4), qbCint(g.A_160c.get(0, 0)), 2); // 6882
        g.A_160c.set(g.s(g.V_0efc), qbCint(g.A_160c.get(0, 0)), 3); // 6883
        g.V_1700 = g.V_0ef4; // 6884
        g.V_1708 = g.V_0efc; // 6885
        g.V_16b8 = g.s(g.V_1778); // 6886
        pc = 397;
        continue; // 6887
      case 398:
        // L_4cc26
        pc = 399;
        continue;
      case 399:
        // L_4cc2b
        pc = 400;
        continue;
      case 400:
        // L_4cc30
        g.V_0f10 = g.s(g.V_0f10 + passo16); // 6891
        if (passo16 >= 0 ? g.V_0f10 <= lim16 : g.V_0f10 >= lim16) {
          pc = 499;
          continue;
        }
        pc = 500;
        continue;
      case 500:
        if (!(L_BP20e === 1.0)) {
          pc = 401;
          continue;
        } // 6892
        pc = 326;
        continue; // 6893
      case 401:
        // L_4cc84
        pc = 402;
        continue;
      case 402:
        // L_4cc89
        pc = 403;
        continue;
      case 403:
        // L_4cc93
        pc = 459;
        continue; // 6897
      case 404:
        // L_4cca5
        pc = 405;
        continue;
      case 405:
        // L_4ccaf
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) === 1)) {
          pc = 407;
          continue;
        } // 6901
        g.V_1794 = g.s(g.V_1790); // 6902
        g.V_1790 = g.s(g.V_1790 - 1.0); // 6903
        if (!(g.V_1790 === 0.0)) {
          pc = 406;
          continue;
        } // 6904
        g.V_1790 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 6905
        pc = 406;
        continue;
      case 406:
        // L_4cd57
        pc = 405;
        continue; // 6907
      case 407:
        // L_4cd64
        pc = 408;
        continue;
      case 408:
        // L_4cd69
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) === 1)) {
          pc = 411;
          continue;
        } // 6910
        g.V_1798 = g.s(g.V_1798 + 1.0); // 6911
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_1798)) {
          pc = 409;
          continue;
        } // 6912
        g.V_1798 = g.s(1.0); // 6913
        pc = 409;
        continue;
      case 409:
        // L_4cdff
        g.V_179c = g.s(g.V_1798 + 1.0); // 6915
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_179c)) {
          pc = 410;
          continue;
        } // 6916
        g.V_179c = g.s(1.0); // 6917
        pc = 410;
        continue;
      case 410:
        // L_4ce5e
        pc = 408;
        continue; // 6919
      case 411:
        // L_4ce6b
        S_21e5d(g); // 6921
        g.V_1670 = g.V_16a0; // 6923
        g.V_1678 = g.V_16a8; // 6924
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_1794)); // 6925
        g.V_17f0 = g.A_15de.get(qbCint(g.V_1794)); // 6926
        g.V_1680 = g.V_16b0; // 6927
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_1798)); // 6928
        g.V_17f8 = g.A_15de.get(qbCint(g.V_1798)); // 6929
        S_23341(g); // 6930
        if (!(g.V_0efc === 10000000000.0 && g.V_0ef4 === 10000000000.0 && g.V_0f18 === "NAO")) {
          pc = 419;
          continue;
        } // 6932
        g.V_0ef4 = (g.V_17e0 + g.V_17e8) / 2.0; // 6933
        g.V_0efc = (g.V_17f0 + g.V_17f8) / 2.0; // 6934
        L_BP1e = g.s(g.V_1790); // 6935
        pilha.push(501);
        pc = 425;
        continue; // 6936
      case 501:
        L_BP26 = g.s(L_BP22); // 6937
        L_BP1e = g.s(g.V_1798); // 6938
        pilha.push(502);
        pc = 425;
        continue; // 6939
      case 502:
        L_BP2a = g.s(L_BP22); // 6940
        if (!(L_BP26 !== L_BP2a)) {
          pc = 418;
          continue;
        } // 6941
        g.V_1678 =
          Math.sin(g.V_0e68_pi / 2.0) /
          (g.raiz(1.0 / (L_BP26 + 1.0)) + Math.cos(g.V_0e68_pi / 2.0)); // 6942
        g.V_1680 =
          Math.sin(g.V_0e68_pi / 2.0) /
          (g.raiz(1.0 / (L_BP2a + 1.0)) + Math.cos(g.V_0e68_pi / 2.0)); // 6943
        if (!(L_BP26 > L_BP2a)) {
          pc = 412;
          continue;
        } // 6944
        L_BP1e = g.s(1.0 / (g.V_1680 / g.V_1678 + 1.0)); // 6945
        pc = 413;
        continue; // 6946
      case 412:
        // L_4d11d
        L_BP1e = g.s(1.0 - 1.0 / (g.V_1678 / g.V_1680 + 1.0)); // 6948
        pc = 413;
        continue;
      case 413:
        // L_4d14c
        g.V_0ef4 = g.V_17e0; // 6950
        if (!(g.V_17e0 > g.V_17e8)) {
          pc = 414;
          continue;
        } // 6951
        g.V_0ef4 = g.V_17e0 - L_BP1e * (g.V_17e0 - g.V_17e8); // 6952
        pc = 414;
        continue;
      case 414:
        // L_4d19d
        if (!(g.V_17e0 < g.V_17e8)) {
          pc = 415;
          continue;
        } // 6954
        g.V_0ef4 = L_BP1e * (g.V_17e8 - g.V_17e0) + g.V_17e0; // 6955
        pc = 415;
        continue;
      case 415:
        // L_4d1da
        g.V_0efc = g.V_17f0; // 6957
        if (!(g.V_17f0 > g.V_17f8)) {
          pc = 416;
          continue;
        } // 6958
        g.V_0efc = g.V_17f0 - L_BP1e * (g.V_17f0 - g.V_17f8); // 6959
        pc = 416;
        continue;
      case 416:
        // L_4d22b
        if (!(g.V_17f0 < g.V_17f8)) {
          pc = 417;
          continue;
        } // 6961
        g.V_0efc = L_BP1e * (g.V_17f8 - g.V_17f0) + g.V_17f0; // 6962
        pc = 417;
        continue;
      case 417:
        // L_4d268
        pc = 418;
        continue;
      case 418:
        // L_4d26d
        pc = 419;
        continue;
      case 419:
        // L_4d272
        g.V_16f0 =
          g.V_0ef4 -
          Math.cos(g.V_16a0) * -(Math.abs(Math.cos(g.V_1670)) > g.V_133e ? -1 : 0) * 1000.0; // 6966
        g.V_16f8 =
          g.V_0efc -
          Math.sin(g.V_16a0) * -(Math.abs(Math.sin(g.V_1670)) > g.V_133e ? -1 : 0) * 1000.0; // 6967
        g.V_1700 =
          Math.cos(g.V_16a0) * -(Math.abs(Math.cos(g.V_1670)) > g.V_133e ? -1 : 0) * 1000.0 +
          g.V_0ef4; // 6968
        g.V_1708 =
          Math.sin(g.V_16a0) * -(Math.abs(Math.sin(g.V_1670)) > g.V_133e ? -1 : 0) * 1000.0 +
          g.V_0efc; // 6969
        g.V_17a0 = g.s(g.V_1794); // 6970
        pc = 420;
        continue;
      case 420:
        // L_4d3c2
        g.V_16d0 = g.A_15b0.get(qbCint(g.V_17a0)); // 6972
        g.V_16d8 = g.A_15de.get(qbCint(g.V_17a0)); // 6973
        g.V_17a4 = g.s(g.V_17a0 + 1.0); // 6974
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_17a4)) {
          pc = 421;
          continue;
        } // 6975
        g.V_17a4 = g.s(1.0); // 6976
        pc = 421;
        continue;
      case 421:
        // L_4d474
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_17a4)); // 6978
        g.V_16e8 = g.A_15de.get(qbCint(g.V_17a4)); // 6979
        S_2018c(g); // 6980
        if (!(g.V_0f1c === "NAO")) {
          pc = 423;
          continue;
        } // 6982
        g.V_17a0 = g.s(g.V_17a0 + 1.0); // 6983
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === g.V_17a0)) {
          pc = 422;
          continue;
        } // 6984
        g.V_17a0 = g.s(1.0); // 6985
        pc = 422;
        continue;
      case 422:
        // L_4d542
        pc = 420;
        continue; // 6987
      case 423:
        // L_4d54f
        pc = pilha.pop() ?? 0;
        continue; // 6989
      case 424:
        // L_4d55e
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 0);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 2.0), 0),
            qbCint(g.A_160c.get(0, 0)),
            0,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 2.0), 0);
        } // 6991
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 1);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 2.0), 1),
            qbCint(g.A_160c.get(0, 0)),
            1,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 2.0), 1);
        } // 6992
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 2);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 2.0), 2),
            qbCint(g.A_160c.get(0, 0)),
            2,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 2.0), 2);
        } // 6993
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0)), 3);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 2.0), 3),
            qbCint(g.A_160c.get(0, 0)),
            3,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 2.0), 3);
        } // 6994
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 1.0), 0);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 3.0), 0),
            qbCint(g.A_160c.get(0, 0) - 1.0),
            0,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 3.0), 0);
        } // 6995
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 1.0), 1);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 3.0), 1),
            qbCint(g.A_160c.get(0, 0) - 1.0),
            1,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 3.0), 1);
        } // 6996
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 1.0), 2);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 3.0), 2),
            qbCint(g.A_160c.get(0, 0) - 1.0),
            2,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 3.0), 2);
        } // 6997
        {
          const t = g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 1.0), 3);
          g.A_160c.set(
            g.A_160c.get(qbCint(g.A_160c.get(0, 0) - 3.0), 3),
            qbCint(g.A_160c.get(0, 0) - 1.0),
            3,
          );
          g.A_160c.set(t, qbCint(g.A_160c.get(0, 0) - 3.0), 3);
        } // 6998
        pc = pilha.pop() ?? 0;
        continue; // 6999
      case 425:
        // L_4d8ae
        L_BP0e = g.s(L_BP1e); // 7001
        L_BP22 = g.s(0.0); // 7002
        pc = 426;
        continue;
      case 426:
        // L_4d8d8
        L_BP12 = g.s(L_BP0e + 1.0); // 7004
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP12)) {
          pc = 427;
          continue;
        } // 7005
        L_BP12 = g.s(1.0); // 7006
        pc = 427;
        continue;
      case 427:
        // L_4d933
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) > 2)) {
          pc = 428;
          continue;
        } // 7008
        L_BP22 = g.s(
          ((g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) - 2) *
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(L_BP0e)) - g.A_15b0.get(qbCint(L_BP12)), 2.0) +
                g.pot(g.A_15de.get(qbCint(L_BP0e)) - g.A_15de.get(qbCint(L_BP12)), 2.0),
            )) /
            10.0 +
            L_BP22,
        ); // 7009
        pc = 428;
        continue;
      case 428:
        // L_4da2c
        L_BP1a = g.s(L_BP0e); // 7011
        if (!(g.A_163a.get(qbCint(L_BP0e), 0) === -100.0)) {
          pc = 430;
          continue;
        } // 7012
        L_BP0e = g.s(L_BP0e - 1.0); // 7013
        if (!(L_BP0e === 0.0)) {
          pc = 429;
          continue;
        } // 7014
        L_BP0e = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 7015
        pc = 429;
        continue;
      case 429:
        // L_4daca
        pc = 431;
        continue; // 7017
      case 430:
        // L_4dad2
        pc = 432;
        continue; // 7019
      case 431:
        // L_4dadf
        pc = 426;
        continue; // 7021
      case 432:
        // L_4dae8
        L_BP0e = g.s(L_BP1e); // 7023
        pc = 433;
        continue;
      case 433:
        // L_4dafc
        L_BP0e = g.s(L_BP0e + 1.0); // 7025
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP0e)) {
          pc = 434;
          continue;
        } // 7026
        L_BP0e = g.s(1.0); // 7027
        pc = 434;
        continue;
      case 434:
        // L_4db57
        L_BP16 = g.s(L_BP0e); // 7029
        if (!(g.A_163a.get(qbCint(L_BP0e), 0) === -100.0)) {
          pc = 436;
          continue;
        } // 7030
        L_BP12 = g.s(L_BP0e + 1.0); // 7031
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP12)) {
          pc = 435;
          continue;
        } // 7032
        L_BP12 = g.s(1.0); // 7033
        pc = 435;
        continue;
      case 435:
        // L_4dbf4
        pc = 437;
        continue; // 7035
      case 436:
        // L_4dbfc
        pc = 439;
        continue; // 7037
      case 437:
        // L_4dc09
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) > 2)) {
          pc = 438;
          continue;
        } // 7039
        L_BP22 = g.s(
          ((g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) - 2) *
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(L_BP0e)) - g.A_15b0.get(qbCint(L_BP12)), 2.0) +
                g.pot(g.A_15de.get(qbCint(L_BP0e)) - g.A_15de.get(qbCint(L_BP12)), 2.0),
            )) /
            10.0 +
            L_BP22,
        ); // 7040
        pc = 438;
        continue;
      case 438:
        // L_4dd02
        pc = 433;
        continue; // 7042
      case 439:
        // L_4dd0a
        L_BP22 = g.s(
          L_BP22 /
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(L_BP1a)) - g.A_15b0.get(qbCint(L_BP16)), 2.0) +
                g.pot(g.A_15de.get(qbCint(L_BP1a)) - g.A_15de.get(qbCint(L_BP16)), 2.0),
            ),
        ); // 7044
        pc = pilha.pop() ?? 0;
        continue; // 7045
      case 440:
        // L_4ddb1
        g.V_1780 = g.s(1.0); // 7047
        g.V_0f14 = g.s(1.0); // 7048
        if (!(g.V_0f14 === g.V_0ef0)) {
          pc = 441;
          continue;
        } // 7049
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 7050
        pc = 441;
        continue;
      case 441:
        // L_4de09
        pc = 442;
        continue;
      case 442:
        // L_4de0e
        if (!(g.A_160c.get(0, 0) >= g.V_0f14)) {
          pc = 449;
          continue;
        } // 7053
        if (!(g.A_160c.get(qbCint(g.V_0f14), 0) >= 0.0)) {
          pc = 443;
          continue;
        } // 7054
        g.V_17e8 = g.A_160c.get(qbCint(g.V_0f14), 0); // 7055
        g.V_17f8 = g.A_160c.get(qbCint(g.V_0f14), 1); // 7056
        pc = 444;
        continue; // 7057
      case 443:
        // L_4dec4
        g.V_17e8 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0f14), 0)))); // 7059
        g.V_17f8 = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0f14), 0)))); // 7060
        pc = 444;
        continue;
      case 444:
        // L_4df4f
        if (
          !(Math.abs(g.V_17f0 - g.V_17f8) < g.V_133a && Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a)
        ) {
          pc = 445;
          continue;
        } // 7062
        g.V_1780 = g.s(g.V_1780 + 1.0); // 7063
        pc = 445;
        continue;
      case 445:
        // L_4dfb3
        g.V_17e8 = g.A_160c.get(qbCint(g.V_0f14), 2); // 7065
        g.V_17f8 = g.A_160c.get(qbCint(g.V_0f14), 3); // 7066
        if (
          !(Math.abs(g.V_17f0 - g.V_17f8) < g.V_133a && Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a)
        ) {
          pc = 446;
          continue;
        } // 7067
        g.V_1780 = g.s(g.V_1780 + 1.0); // 7068
        pc = 446;
        continue;
      case 446:
        // L_4e06a
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 7070
        if (!(g.V_0f14 === g.V_0ef0)) {
          pc = 447;
          continue;
        } // 7071
        g.V_0f14 = g.s(g.V_0f14 + 1.0); // 7072
        pc = 447;
        continue;
      case 447:
        // L_4e0b1
        if (!(g.V_1780 >= 2.0)) {
          pc = 448;
          continue;
        } // 7074
        pc = 449;
        continue; // 7075
      case 448:
        // L_4e0d4
        pc = 442;
        continue; // 7077
      case 449:
        // L_4e0dc
        if (!(g.V_1780 < 2.0)) {
          pc = 458;
          continue;
        } // 7079
        L_BP40.set(g.s(L_BP40.get(0, 0) + 1.0), 0, 0); // 7080
        L_BP40.set(
          g.s(g.A_160c.get(qbCint(g.V_0ef0), qbCint(g.V_1778))),
          qbCint(L_BP40.get(0, 0)),
          0,
        ); // 7081
        L_BP40.set(
          g.s(g.A_160c.get(qbCint(g.V_0ef0), qbCint(g.V_1778 + 1.0))),
          qbCint(L_BP40.get(0, 0)),
          1,
        ); // 7082
        g.V_16f0 = g.A_160c.get(qbCint(g.V_0ef0), 0); // 7083
        g.V_16f8 = g.A_160c.get(qbCint(g.V_0ef0), 1); // 7084
        g.V_1700 = g.A_160c.get(qbCint(g.V_0ef0), 2); // 7085
        g.V_1708 = g.A_160c.get(qbCint(g.V_0ef0), 3); // 7086
        if (!(g.V_1778 === 2.0)) {
          pc = 450;
          continue;
        } // 7087
        {
          const t = g.V_16f0;
          g.V_16f0 = g.V_1700;
          g.V_1700 = t;
        } // 7088
        {
          const t = g.V_16f8;
          g.V_16f8 = g.V_1708;
          g.V_1708 = t;
        } // 7089
        pc = 450;
        continue;
      case 450:
        // L_4e305
        if (!(g.V_1700 === g.V_16f0)) {
          pc = 452;
          continue;
        } // 7091
        g.V_1688 = g.V_0e68_pi / 2.0; // 7092
        if (!(g.V_1708 < g.V_16f8)) {
          pc = 451;
          continue;
        } // 7093
        g.V_1688 = (3.0 * g.V_0e68_pi) / 2.0; // 7094
        pc = 451;
        continue;
      case 451:
        // L_4e36c
        pc = 457;
        continue; // 7096
      case 452:
        // L_4e374
        if (!(g.V_1708 <= g.V_16f8 && g.V_1700 < g.V_16f0)) {
          pc = 453;
          continue;
        } // 7098
        g.V_1688 = Math.atan((g.V_16f8 - g.V_1708) / (g.V_16f0 - g.V_1700)) + g.V_0e68_pi; // 7099
        pc = 453;
        continue;
      case 453:
        // L_4e3e1
        if (!(g.V_1708 >= g.V_16f8 && g.V_1700 > g.V_16f0)) {
          pc = 454;
          continue;
        } // 7101
        g.V_1688 = Math.atan((g.V_1708 - g.V_16f8) / (g.V_1700 - g.V_16f0)); // 7102
        pc = 454;
        continue;
      case 454:
        // L_4e449
        if (!(g.V_1708 < g.V_16f8 && g.V_1700 > g.V_16f0)) {
          pc = 455;
          continue;
        } // 7104
        g.V_1688 = 2.0 * g.V_0e68_pi - Math.atan((g.V_16f8 - g.V_1708) / (g.V_1700 - g.V_16f0)); // 7105
        pc = 455;
        continue;
      case 455:
        // L_4e4be
        if (!(g.V_1708 > g.V_16f8 && g.V_1700 < g.V_16f0)) {
          pc = 456;
          continue;
        } // 7107
        g.V_1688 = g.V_0e68_pi - Math.atan((g.V_1708 - g.V_16f8) / (g.V_16f0 - g.V_1700)); // 7108
        pc = 456;
        continue;
      case 456:
        // L_4e52e
        pc = 457;
        continue;
      case 457:
        // L_4e533
        L_BP40.set(g.s(g.V_1688), qbCint(L_BP40.get(0, 0)), 2); // 7111
        L_BP226 = g.A_160c.get(0, 0) - 1.0; // 7112
        g.V_0ef4 = g.V_0ef0; // 7113
        lim17 = L_BP226;
        passo17 = 1;
        if (passo17 >= 0 ? g.V_0ef4 > lim17 : g.V_0ef4 < lim17) {
          pc = 504;
          continue;
        }
        pc = 503;
        continue;
      case 503:
        g.V_0efc = 0.0; // 7114
        lim18 = 3.0;
        passo18 = 1;
        if (passo18 >= 0 ? g.V_0efc > lim18 : g.V_0efc < lim18) {
          pc = 506;
          continue;
        }
        pc = 505;
        continue;
      case 505:
        g.A_160c.set(
          g.s(g.A_160c.get(qbCint(g.V_0ef4 + 1.0), qbCint(g.V_0efc))),
          qbCint(g.V_0ef4),
          qbCint(g.V_0efc),
        ); // 7115
        g.V_0efc = g.V_0efc + passo18; // 7116
        if (passo18 >= 0 ? g.V_0efc <= lim18 : g.V_0efc >= lim18) {
          pc = 505;
          continue;
        }
        pc = 506;
        continue;
      case 506:
        g.V_0ef4 = g.V_0ef4 + passo17; // 7117
        if (passo17 >= 0 ? g.V_0ef4 <= lim17 : g.V_0ef4 >= lim17) {
          pc = 503;
          continue;
        }
        pc = 504;
        continue;
      case 504:
        g.A_160c.set(g.s(g.A_160c.get(0, 0) - 1.0), 0, 0); // 7118
        g.V_0ef0 = g.s(0.0); // 7119
        pc = 458;
        continue;
      case 458:
        // L_4e6a0
        pc = pilha.pop() ?? 0;
        continue; // 7121
      case 459:
        // L_4e6af
        L_BP40 = g.matriz("!", []); // 7125
        return;
      default:
        throw new Error(`S_4019b: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:8173-8340. */
export function S_578adSegmentos(g: EstadoLajecalc): void {
  // oxlint-disable-next-line no-unused-vars -- gravada e nunca lida no original
  let L_BP0e = 0;
  let L_BP102 = 0;
  let L_BP106 = 0;
  let L_BP10a = 0;
  let L_BP10e = 0;
  let L_BP112 = 0;
  let L_BP116 = 0;
  let L_BP11a = 0;
  let L_BP11e = 0;
  // oxlint-disable-next-line no-unused-vars -- gravada e nunca lida no original
  let L_BP12 = 0;
  let L_BP122 = 0;
  let L_BP126 = 0;
  let L_BP12a = 0;
  let L_BP12e = 0;
  // oxlint-disable-next-line no-unused-vars -- gravada e nunca lida no original
  let L_BP16 = 0;
  let L_BPc6 = 0;
  let L_BPca = 0;
  let L_BPce = 0;
  let L_BPd2 = 0;
  let L_BPd6 = 0;
  let L_BPda = 0;
  let L_BPde = 0;
  let L_BPe2 = 0;
  let L_BPe6 = 0;
  let L_BPea = 0;
  let L_BPee = 0;
  let L_BPf2 = 0;
  let L_BPf6 = 0;
  let L_BPfa = 0;
  let L_BPfe = 0;
  let lim0 = 0;
  let passo0 = 0;
  let lim1 = 0;
  let passo1 = 0;
  let lim2 = 0;
  let passo2 = 0;
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        g.L_BP64 = g.matriz("!", []); // 8207
        g.L_BP76 = g.matriz("!", []); // 8208
        g.L_BP88 = g.matriz("!", []); // 8209
        g.L_BP9a = g.matriz("!", []); // 8210
        g.L_BPac = g.matriz("%", []); // 8211
        g.L_BPc2 = g.matriz("!", []); // 8212
        g.L_BP64 = g.matriz("!", [[0, 1]]); // 8214
        g.L_BP76 = g.matriz("!", [[0, 1]]); // 8215
        g.L_BP88 = g.matriz("!", [[0, 1]]); // 8216
        g.L_BP9a = g.matriz("!", [[0, 1]]); // 8217
        g.L_BPac = g.matriz("%", [[0, 1]]); // 8218
        g.L_BPc2 = g.matriz("!", [
          [0, 1],
          [0, 1],
        ]); // 8219
        L_BP0e = g.s(g.A_10cc.get(0, 2)); // 8220
        L_BP12 = g.s(g.A_10cc.get(0, 3)); // 8221
        L_BP16 = g.s(g.A_10cc.get(0, 4)); // 8222
        g.L_BP64 = g.matriz("!", []); // 8223
        g.L_BP76 = g.matriz("!", []); // 8224
        g.L_BP64 = g.matriz("!", [[0, qbCint(g.A_160c.get(0, 0) * 2.0 + 2.0)]]); // 8225
        g.L_BP76 = g.matriz("!", [[0, qbCint(g.A_160c.get(0, 0) * 2.0 + 2.0)]]); // 8226
        g.L_BP64.set(g.s(g.A_160c.get(0, 0) * 2.0), 0); // 8227
        L_BPc6 = g.s(g.A_160c.get(0, 0)); // 8228
        g.V_0ef0 = g.s(1.0); // 8229
        lim0 = g.s(L_BPc6);
        passo0 = g.s(1);
        if (passo0 >= 0 ? g.V_0ef0 > lim0 : g.V_0ef0 < lim0) {
          pc = 22;
          continue;
        }
        pc = 21;
        continue;
      case 21:
        g.V_0f04 = g.s(2.0 * g.V_0ef0 - 1.0); // 8230
        if (!(g.A_160c.get(qbCint(g.V_0ef0), 0) < 0.0)) {
          pc = 1;
          continue;
        } // 8231
        g.L_BP64.set(
          g.s(g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0))))),
          qbCint(g.V_0f04),
        ); // 8232
        g.L_BP76.set(
          g.s(g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_0ef0), 0))))),
          qbCint(g.V_0f04),
        ); // 8233
        pc = 2;
        continue; // 8234
      case 1:
        // L_57bbd
        g.L_BP64.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 0)), qbCint(g.V_0f04)); // 8236
        g.L_BP76.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 1)), qbCint(g.V_0f04)); // 8237
        pc = 2;
        continue;
      case 2:
        // L_57c43
        g.L_BP64.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 2)), qbCint(g.V_0f04 + 1.0)); // 8239
        g.L_BP76.set(g.s(g.A_160c.get(qbCint(g.V_0ef0), 3)), qbCint(g.V_0f04 + 1.0)); // 8240
        g.V_0ef0 = g.s(g.V_0ef0 + passo0); // 8241
        if (passo0 >= 0 ? g.V_0ef0 <= lim0 : g.V_0ef0 >= lim0) {
          pc = 21;
          continue;
        }
        pc = 22;
        continue;
      case 22:
        g.L_BPac = g.matriz("%", []); // 8242
        g.L_BPac = g.matriz("%", [[0, qbCint(g.A_160c.get(0, 0))]]); // 8243
        L_BPca = g.s(g.A_15b0.get(0) - 1.0); // 8244
        g.V_0ef0 = g.s(1.0); // 8245
        lim1 = g.s(L_BPca);
        passo1 = g.s(1);
        if (passo1 >= 0 ? g.V_0ef0 > lim1 : g.V_0ef0 < lim1) {
          pc = 24;
          continue;
        }
        pc = 23;
        continue;
      case 23:
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_0ef0)) === 1)) {
          pc = 20;
          continue;
        } // 8246
        g.V_17e0 = g.A_15b0.get(qbCint(g.V_0ef0)); // 8247
        g.V_17f0 = g.A_15de.get(qbCint(g.V_0ef0)); // 8248
        g.V_17e8 = g.A_15b0.get(qbCint(g.V_0ef0 + 1.0)); // 8249
        g.V_17f8 = g.A_15de.get(qbCint(g.V_0ef0 + 1.0)); // 8250
        if (!(Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a)) {
          pc = 3;
          continue;
        } // 8251
        g.V_1678 = g.V_0e68_pi / 2.0; // 8252
        pc = 4;
        continue; // 8253
      case 3:
        // L_57e7f
        g.V_1678 = Math.atan((g.V_17f8 - g.V_17f0) / (g.V_17e8 - g.V_17e0)); // 8255
        pc = 4;
        continue;
      case 4:
        // L_57eae
        L_BPce = g.s(g.L_BP64.get(0)); // 8257
        g.V_0f04 = g.s(1.0); // 8258
        lim2 = g.s(L_BPce);
        passo2 = g.s(2.0);
        if (passo2 >= 0 ? g.V_0f04 > lim2 : g.V_0f04 < lim2) {
          pc = 26;
          continue;
        }
        pc = 25;
        continue;
      case 25:
        if (!(g.L_BPac.get(qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1) === 1)) {
          pc = 5;
          continue;
        } // 8259
        pc = 19;
        continue; // 8260
      case 5:
        // L_57f18
        if (
          !(
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.V_17f8) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.V_17e8) < g.V_133a &&
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.V_17e0) < g.V_133a
          )
        ) {
          pc = 6;
          continue;
        } // 8262
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8263
        pc = 19;
        continue; // 8264
      case 6:
        // L_5804f
        if (
          !(
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.V_17e0) < g.V_133a &&
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04)) - g.V_17f8) < g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.V_17e8) < g.V_133a
          )
        ) {
          pc = 7;
          continue;
        } // 8266
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8267
        pc = 19;
        continue; // 8268
      case 7:
        // L_58186
        if (
          !(
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.L_BP64.get(qbCint(g.V_0f04 + 1.0))) <
            g.V_133a
          )
        ) {
          pc = 8;
          continue;
        } // 8270
        g.V_1680 = g.V_0e68_pi / 2.0; // 8271
        pc = 9;
        continue; // 8272
      case 8:
        // L_581f8
        g.V_1680 = Math.atan(
          (g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP76.get(qbCint(g.V_0f04))) /
            (g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP64.get(qbCint(g.V_0f04))),
        ); // 8274
        pc = 9;
        continue;
      case 9:
        // L_58289
        if (!(Math.abs(g.V_1678 - g.V_1680) > g.V_133e)) {
          pc = 10;
          continue;
        } // 8276
        pc = 19;
        continue; // 8277
      case 10:
        // L_582b4
        L_BPd2 = g.s(g.V_17f0 / 1.0); // 8279
        L_BPd6 = g.s(g.V_17f8 / 1.0); // 8280
        L_BPda = g.s(L_BPd2 > L_BPd6 ? L_BPd2 : L_BPd6); // 8281
        L_BPde = g.s(g.V_17f0 / 1.0); // 8283
        L_BPe2 = g.s(g.V_17f8 / 1.0); // 8284
        L_BPe6 = g.s(L_BPde < L_BPe2 ? L_BPde : L_BPe2); // 8285
        if (
          !(
            g.L_BP76.get(qbCint(g.V_0f04)) <= L_BPda &&
            g.L_BP76.get(qbCint(g.V_0f04)) >= L_BPe6 &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04)) - g.V_17e0) < g.V_133a &&
            Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a
          )
        ) {
          pc = 11;
          continue;
        } // 8287
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8288
        pc = 19;
        continue; // 8289
      case 11:
        // L_58427
        L_BPea = g.s(g.V_17e0 / 1.0); // 8291
        L_BPee = g.s(g.V_17e8 / 1.0); // 8292
        L_BPf2 = g.s(L_BPea > L_BPee ? L_BPea : L_BPee); // 8293
        L_BPf6 = g.s(g.V_17e0 / 1.0); // 8295
        L_BPfa = g.s(g.V_17e8 / 1.0); // 8296
        L_BPfe = g.s(L_BPf6 < L_BPfa ? L_BPf6 : L_BPfa); // 8297
        if (
          !(
            g.L_BP64.get(qbCint(g.V_0f04)) <= L_BPf2 &&
            g.L_BP64.get(qbCint(g.V_0f04)) >= L_BPfe &&
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04)) - g.V_17f0) < g.V_133a &&
            Math.abs(g.V_17f0 - g.V_17f8) < g.V_133a
          )
        ) {
          pc = 12;
          continue;
        } // 8299
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8300
        pc = 19;
        continue; // 8301
      case 12:
        // L_5859a
        if (
          !(Math.abs(g.V_17f0 - g.V_17f8) < g.V_133a || Math.abs(g.V_17e0 - g.V_17e8) < g.V_133a)
        ) {
          pc = 13;
          continue;
        } // 8303
        pc = 19;
        continue; // 8304
      case 13:
        // L_585f0
        L_BP102 = g.s(g.V_17e0 / 1.0); // 8306
        L_BP106 = g.s(g.V_17e8 / 1.0); // 8307
        L_BP10a = g.s(L_BP102 > L_BP106 ? L_BP102 : L_BP106); // 8308
        L_BP10e = g.s(g.V_17e0 / 1.0); // 8310
        L_BP112 = g.s(g.V_17e8 / 1.0); // 8311
        L_BP116 = g.s(L_BP10e < L_BP112 ? L_BP10e : L_BP112); // 8312
        if (
          !(
            (g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) < g.L_BP64.get(qbCint(g.V_0f04)) &&
              g.L_BP64.get(qbCint(g.V_0f04)) === L_BP116) ||
            (g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) > g.L_BP64.get(qbCint(g.V_0f04)) &&
              g.L_BP64.get(qbCint(g.V_0f04)) === L_BP10a)
          )
        ) {
          pc = 14;
          continue;
        } // 8314
        pc = 19;
        continue; // 8315
      case 14:
        // L_5876c
        L_BP11a = g.s(g.V_17e0 / 1.0); // 8317
        L_BP11e = g.s(g.V_17e8 / 1.0); // 8318
        L_BP122 = g.s(L_BP11a > L_BP11e ? L_BP11a : L_BP11e); // 8319
        L_BP126 = g.s(g.V_17e0 / 1.0); // 8321
        L_BP12a = g.s(g.V_17e8 / 1.0); // 8322
        L_BP12e = g.s(L_BP126 < L_BP12a ? L_BP126 : L_BP12a); // 8323
        if (
          !(
            (g.L_BP64.get(qbCint(g.V_0f04)) < g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) &&
              g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) === L_BP12e) ||
            (g.L_BP64.get(qbCint(g.V_0f04)) > g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) &&
              g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) === L_BP122)
          )
        ) {
          pc = 15;
          continue;
        } // 8325
        pc = 19;
        continue; // 8326
      case 15:
        // L_588f2
        if (!(g.L_BP64.get(qbCint(g.V_0f04)) !== g.V_17e8)) {
          pc = 16;
          continue;
        } // 8328
        g.V_16a0 = Math.atan(
          (g.V_17f8 - g.L_BP76.get(qbCint(g.V_0f04))) / (g.V_17e8 - g.L_BP64.get(qbCint(g.V_0f04))),
        ); // 8329
        pc = 17;
        continue; // 8330
      case 16:
        // L_58987
        g.V_16a0 = Math.atan(
          (g.V_17f0 - g.L_BP76.get(qbCint(g.V_0f04))) / (g.V_17e0 - g.L_BP64.get(qbCint(g.V_0f04))),
        ); // 8332
        pc = 17;
        continue;
      case 17:
        // L_589e8
        if (!(Math.abs(g.V_1678 - g.V_16a0) < g.V_133e)) {
          pc = 18;
          continue;
        } // 8334
        g.L_BPac.set(qbCint(1), qbFix(qbClng(qbClng(g.V_0f04)) / qbClng(2)) + 1); // 8335
        pc = 18;
        continue;
      case 18:
        // L_58a3e
        pc = 19;
        continue;
      case 19:
        // L_58a43
        g.V_0f04 = g.s(g.V_0f04 + passo2); // 8338
        if (passo2 >= 0 ? g.V_0f04 <= lim2 : g.V_0f04 >= lim2) {
          pc = 25;
          continue;
        }
        pc = 26;
        continue;
      case 26:
        pc = 20;
        continue;
      case 20:
        // L_58a79
        g.V_0ef0 = g.s(g.V_0ef0 + passo1); // 8340
        if (passo1 >= 0 ? g.V_0ef0 <= lim1 : g.V_0ef0 >= lim1) {
          pc = 23;
          continue;
        }
        pc = 24;
        continue;
      case 24:
        return;
      default:
        throw new Error(`S_578adSegmentos: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:8414-8598 (sub-rotina L_5941c). */
export function L_5941c(g: EstadoLajecalc): void {
  let L_BP136 = 0;
  let L_BP13a = 0;
  let L_BP13e = 0;
  let L_BP142 = 0;
  let L_BP146 = 0;
  let lim0 = 0;
  let passo0 = 0;
  let lim1 = 0;
  let passo1 = 0;
  let lim2 = 0;
  let passo2 = 0;
  const pilha: number[] = [];
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        pc = 1;
        continue;
      case 1:
        // L_5941c
        L_BP136 = g.s(g.L_BP64.get(0)); // 8416
        g.V_0f14 = g.s(1.0); // 8417
        lim0 = g.s(L_BP136);
        passo0 = g.s(2.0);
        if (passo0 >= 0 ? g.V_0f14 > lim0 : g.V_0f14 < lim0) {
          pc = 53;
          continue;
        }
        pc = 52;
        continue;
      case 52:
        if (!(-g.A_160c.get(qbCint((g.V_0f14 + 1.0) / 2.0), 0) === g.V_0f10)) {
          pc = 2;
          continue;
        } // 8418
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14 + 1.0)); // 8419
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14 + 1.0)); // 8420
        pc = 3;
        continue; // 8421
      case 2:
        // L_594ee
        g.V_0f14 = g.s(g.V_0f14 + passo0); // 8423
        if (passo0 >= 0 ? g.V_0f14 <= lim0 : g.V_0f14 >= lim0) {
          pc = 52;
          continue;
        }
        pc = 53;
        continue;
      case 53:
        pc = 3;
        continue;
      case 3:
        // L_5951a
        if (!(g.L_BP64.get(0) < g.V_0f14)) {
          pc = 7;
          continue;
        } // 8425
        L_BP13a = g.s(g.L_BP64.get(0)); // 8426
        g.V_0f14 = g.s(1.0); // 8427
        lim1 = g.s(L_BP13a);
        passo1 = g.s(2.0);
        if (passo1 >= 0 ? g.V_0f14 > lim1 : g.V_0f14 < lim1) {
          pc = 55;
          continue;
        }
        pc = 54;
        continue;
      case 54:
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14)); // 8428
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14)); // 8429
        if (
          !(Math.abs(g.V_0efc - g.V_17f0) < g.V_133a && Math.abs(g.V_0ef4 - g.V_17e0) < g.V_133a)
        ) {
          pc = 4;
          continue;
        } // 8430
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14 + 1.0)); // 8431
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14 + 1.0)); // 8432
        pc = 6;
        continue; // 8433
      case 4:
        // L_5966b
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14 + 1.0)); // 8435
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14 + 1.0)); // 8436
        if (
          !(Math.abs(g.V_0efc - g.V_17f0) < g.V_133a && Math.abs(g.V_0ef4 - g.V_17e0) < g.V_133a)
        ) {
          pc = 5;
          continue;
        } // 8437
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f14)); // 8438
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f14)); // 8439
        pc = 6;
        continue; // 8440
      case 5:
        // L_5976c
        g.V_0f14 = g.s(g.V_0f14 + passo1); // 8442
        if (passo1 >= 0 ? g.V_0f14 <= lim1 : g.V_0f14 >= lim1) {
          pc = 54;
          continue;
        }
        pc = 55;
        continue;
      case 55:
        pc = 6;
        continue;
      case 6:
        // L_59798
        pc = 7;
        continue;
      case 7:
        // L_5979d
        g.L_BP88 = g.matriz("!", []); // 8445
        g.L_BP9a = g.matriz("!", []); // 8446
        g.L_BP88 = g.matriz("!", [[0, 50]]); // 8447
        g.L_BP9a = g.matriz("!", [[0, 50]]); // 8448
        g.L_BPc2 = g.matriz("!", []); // 8449
        g.L_BPc2 = g.matriz("!", [
          [0, 50],
          [0, 0],
        ]); // 8450
        g.L_BP88.set(g.s(2.0), 0); // 8451
        g.L_BP88.set(g.s(g.V_17e0), 1); // 8452
        g.L_BP9a.set(g.s(g.V_17f0), 1); // 8453
        g.L_BP88.set(g.s(g.V_0ef4), 2); // 8454
        g.L_BP9a.set(g.s(g.V_0efc), 2); // 8455
        if (!(g.L_BPac.get(qbFix(qbClng(qbClng(g.V_0f14)) / qbClng(2)) + 1) === 1)) {
          pc = 8;
          continue;
        } // 8456
        g.L_BPc2.set(g.s(1.0), 1, 0); // 8457
        pc = 8;
        continue;
      case 8:
        // L_5991a
        g.V_1778 = g.s(1.0); // 8459
        pc = 9;
        continue;
      case 9:
        // L_59930
        if (!(g.L_BP88.get(qbCint(g.V_1778)) === g.L_BP88.get(qbCint(g.V_1778 + 1.0)))) {
          pc = 11;
          continue;
        } // 8461
        g.V_16a8 = g.V_0e68_pi / 2.0; // 8462
        if (!(g.L_BP9a.get(qbCint(g.V_1778)) > g.L_BP9a.get(qbCint(g.V_1778 + 1.0)))) {
          pc = 10;
          continue;
        } // 8463
        g.V_16a8 = (3.0 * g.V_0e68_pi) / 2.0; // 8464
        pc = 10;
        continue;
      case 10:
        // L_59a02
        pc = 16;
        continue; // 8466
      case 11:
        // L_59a0a
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) >= g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 12;
          continue;
        } // 8468
        g.V_16a8 = Math.atan(
          (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778))) /
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778))),
        ); // 8469
        pc = 12;
        continue;
      case 12:
        // L_59b40
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) > g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 13;
          continue;
        } // 8471
        g.V_16a8 =
          g.V_0e68_pi / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_1778)) - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) /
              (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778))),
          ); // 8472
        pc = 13;
        continue;
      case 13:
        // L_59c83
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) <= g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 14;
          continue;
        } // 8474
        g.V_16a8 =
          Math.atan(
            (g.L_BP9a.get(qbCint(g.V_1778)) - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) /
              (g.L_BP88.get(qbCint(g.V_1778)) - g.L_BP88.get(qbCint(g.V_1778 + 1.0))),
          ) + g.V_0e68_pi; // 8475
        pc = 14;
        continue;
      case 14:
        // L_59dbe
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) < g.L_BP9a.get(qbCint(g.V_1778)) &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.L_BP88.get(qbCint(g.V_1778))
          )
        ) {
          pc = 15;
          continue;
        } // 8477
        g.V_16a8 =
          (3.0 * g.V_0e68_pi) / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778))) /
              (g.L_BP9a.get(qbCint(g.V_1778)) - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))),
          ); // 8478
        pc = 15;
        continue;
      case 15:
        // L_59f06
        pc = 16;
        continue;
      case 16:
        // L_59f0b
        L_BP13e = g.s(-1.0); // 8481
        L_BP142 = g.s(g.L_BP64.get(0)); // 8482
        g.V_0f04 = g.s(1.0); // 8483
        lim2 = g.s(L_BP142);
        passo2 = g.s(2.0);
        if (passo2 >= 0 ? g.V_0f04 > lim2 : g.V_0f04 < lim2) {
          pc = 57;
          continue;
        }
        pc = 56;
        continue;
      case 56:
        if (!(g.V_0f04 === g.V_0f14)) {
          pc = 17;
          continue;
        } // 8484
        pc = 47;
        continue; // 8485
      case 17:
        // L_59f67
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f04)); // 8487
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f04)); // 8488
        if (
          !(
            Math.abs(g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) < g.V_133a &&
            Math.abs(g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) < g.V_133a
          )
        ) {
          pc = 18;
          continue;
        } // 8489
        pc = 20;
        continue; // 8490
      case 18:
        // L_5a04b
        if (
          !(
            Math.abs(g.L_BP76.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) <
              g.V_133a &&
            Math.abs(g.L_BP64.get(qbCint(g.V_0f04 + 1.0)) - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) <
              g.V_133a
          )
        ) {
          pc = 19;
          continue;
        } // 8492
        pc = 20;
        continue; // 8493
      case 19:
        // L_5a111
        pc = 47;
        continue; // 8495
      case 20:
        // L_5a11e
        if (
          !(
            Math.abs(g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) < g.V_133a &&
            Math.abs(g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) < g.V_133a
          )
        ) {
          pc = 21;
          continue;
        } // 8497
        g.V_0ef4 = g.L_BP64.get(qbCint(g.V_0f04 + 1.0)); // 8498
        g.V_0efc = g.L_BP76.get(qbCint(g.V_0f04 + 1.0)); // 8499
        pc = 21;
        continue;
      case 21:
        // L_5a20e
        if (
          !(Math.abs(g.V_0efc - g.V_17f8) < g.V_133a && Math.abs(g.V_0ef4 - g.V_17e8) < g.V_133a)
        ) {
          pc = 22;
          continue;
        } // 8501
        g.V_16d0 = g.V_17e8; // 8502
        g.V_16d8 = g.V_17f8; // 8503
        L_BP13e = g.s(g.V_0f04); // 8504
        pc = 48;
        continue; // 8505
      case 22:
        // L_5a29c
        if (!(g.L_BP88.get(qbCint(g.V_1778 + 1.0)) === g.V_0ef4)) {
          pc = 24;
          continue;
        } // 8507
        g.V_16b0 = g.V_0e68_pi / 2.0; // 8508
        if (!(g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) > g.V_0efc)) {
          pc = 23;
          continue;
        } // 8509
        g.V_16b0 = (3.0 * g.V_0e68_pi) / 2.0; // 8510
        pc = 23;
        continue;
      case 23:
        // L_5a33b
        pc = 29;
        continue; // 8512
      case 24:
        // L_5a343
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) <= g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.V_0ef4
          )
        ) {
          pc = 25;
          continue;
        } // 8514
        g.V_16b0 = Math.atan(
          (g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))) /
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))),
        ); // 8515
        pc = 25;
        continue;
      case 25:
        // L_5a423
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) < g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.V_0ef4
          )
        ) {
          pc = 26;
          continue;
        } // 8517
        g.V_16b0 =
          g.V_0e68_pi / 2.0 +
          Math.atan(
            (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.V_0ef4) /
              (g.V_0efc - g.L_BP9a.get(qbCint(g.V_1778 + 1.0))),
          ); // 8518
        pc = 26;
        continue;
      case 26:
        // L_5a50d
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) >= g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) > g.V_0ef4
          )
        ) {
          pc = 27;
          continue;
        } // 8520
        g.V_16b0 =
          Math.atan(
            (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.V_0efc) /
              (g.L_BP88.get(qbCint(g.V_1778 + 1.0)) - g.V_0ef4),
          ) + g.V_0e68_pi; // 8521
        pc = 27;
        continue;
      case 27:
        // L_5a5ec
        if (
          !(
            g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) > g.V_0efc &&
            g.L_BP88.get(qbCint(g.V_1778 + 1.0)) < g.V_0ef4
          )
        ) {
          pc = 28;
          continue;
        } // 8523
        g.V_16b0 =
          (3.0 * g.V_0e68_pi) / 2.0 +
          Math.atan(
            (g.V_0ef4 - g.L_BP88.get(qbCint(g.V_1778 + 1.0))) /
              (g.L_BP9a.get(qbCint(g.V_1778 + 1.0)) - g.V_0efc),
          ); // 8524
        pc = 28;
        continue;
      case 28:
        // L_5a6db
        pc = 29;
        continue;
      case 29:
        // L_5a6e0
        if (!(g.V_0e68_pi / 2.0 > g.V_16a8 && g.V_16a8 >= 0.0)) {
          pc = 32;
          continue;
        } // 8527
        if (!(g.V_0e68_pi + g.V_16a8 > g.V_16b0 && g.V_16b0 >= 0.0)) {
          pc = 30;
          continue;
        } // 8528
        L_BP146 = g.s(g.V_0e68_pi - g.V_16a8 + g.V_16b0); // 8529
        pc = 31;
        continue; // 8530
      case 30:
        // L_5a789
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 + g.V_0e68_pi)); // 8532
        pc = 31;
        continue;
      case 31:
        // L_5a7ac
        pc = 32;
        continue;
      case 32:
        // L_5a7b1
        if (!(g.V_16a8 < g.V_0e68_pi && g.V_0e68_pi / 2.0 <= g.V_16a8)) {
          pc = 35;
          continue;
        } // 8535
        if (!(g.V_0e68_pi + g.V_16a8 > g.V_16b0 && g.V_16b0 >= 0.0)) {
          pc = 33;
          continue;
        } // 8536
        L_BP146 = g.s(g.V_0e68_pi - g.V_16a8 + g.V_16b0); // 8537
        pc = 34;
        continue; // 8538
      case 33:
        // L_5a85a
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 + g.V_0e68_pi)); // 8540
        pc = 34;
        continue;
      case 34:
        // L_5a87d
        pc = 35;
        continue;
      case 35:
        // L_5a882
        if (!((3.0 * g.V_0e68_pi) / 2.0 > g.V_16a8 && g.V_16a8 >= g.V_0e68_pi)) {
          pc = 38;
          continue;
        } // 8543
        if (!(2.0 * g.V_0e68_pi >= g.V_16b0 && g.V_16a8 - g.V_0e68_pi <= g.V_16b0)) {
          pc = 36;
          continue;
        } // 8544
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 - g.V_0e68_pi)); // 8545
        pc = 37;
        continue; // 8546
      case 36:
        // L_5a938
        L_BP146 = g.s(2.0 * g.V_0e68_pi - (g.V_16a8 - g.V_0e68_pi) + g.V_16b0); // 8548
        pc = 37;
        continue;
      case 37:
        // L_5a965
        pc = 38;
        continue;
      case 38:
        // L_5a96a
        if (!(2.0 * g.V_0e68_pi >= g.V_16a8 && (3.0 * g.V_0e68_pi) / 2.0 <= g.V_16a8)) {
          pc = 41;
          continue;
        } // 8551
        if (!(2.0 * g.V_0e68_pi >= g.V_16b0 && g.V_16a8 - g.V_0e68_pi <= g.V_16b0)) {
          pc = 39;
          continue;
        } // 8552
        L_BP146 = g.s(g.V_16b0 - (g.V_16a8 - g.V_0e68_pi)); // 8553
        pc = 40;
        continue; // 8554
      case 39:
        // L_5aa25
        L_BP146 = g.s(2.0 * g.V_0e68_pi - (g.V_16a8 - g.V_0e68_pi - g.V_16b0)); // 8556
        pc = 40;
        continue;
      case 40:
        // L_5aa52
        pc = 41;
        continue;
      case 41:
        // L_5aa57
        if (!(Math.abs(g.V_16b0 - g.V_16a8 - g.V_0e68_pi) < g.V_133e)) {
          pc = 42;
          continue;
        } // 8559
        L_BP146 = g.s(g.V_0e68_pi); // 8560
        pc = 42;
        continue;
      case 42:
        // L_5aa90
        if (!(L_BP146 >= 2.0 * g.V_0e68_pi)) {
          pc = 43;
          continue;
        } // 8562
        L_BP146 = g.s(L_BP146 - 2.0 * g.V_0e68_pi); // 8563
        pc = 43;
        continue;
      case 43:
        // L_5aace
        if (!(L_BP13e === -1.0)) {
          pc = 44;
          continue;
        } // 8565
        g.V_16d0 = g.V_0ef4; // 8566
        g.V_16d8 = g.V_0efc; // 8567
        g.V_16a0 = L_BP146; // 8568
        L_BP13e = g.s(g.V_0f04); // 8569
        pc = 46;
        continue; // 8570
      case 44:
        // L_5ab35
        if (!(L_BP146 > g.V_16a0)) {
          pc = 45;
          continue;
        } // 8572
        g.V_16d0 = g.V_0ef4; // 8573
        g.V_16d8 = g.V_0efc; // 8574
        g.V_16a0 = L_BP146; // 8575
        L_BP13e = g.s(g.V_0f04); // 8576
        pc = 45;
        continue;
      case 45:
        // L_5ab99
        pc = 46;
        continue;
      case 46:
        // L_5ab9e
        pc = 47;
        continue;
      case 47:
        // L_5aba3
        g.V_0f04 = g.s(g.V_0f04 + passo2); // 8580
        if (passo2 >= 0 ? g.V_0f04 <= lim2 : g.V_0f04 >= lim2) {
          pc = 56;
          continue;
        }
        pc = 57;
        continue;
      case 57:
        pc = 48;
        continue;
      case 48:
        // L_5abd4
        g.L_BP88.set(g.s(g.V_16d0), qbCint(g.V_1778 + 2.0)); // 8582
        g.L_BP9a.set(g.s(g.V_16d8), qbCint(g.V_1778 + 2.0)); // 8583
        if (!(g.L_BPac.get(qbFix(qbClng(qbClng(L_BP13e)) / qbClng(2)) + 1) === 1)) {
          pc = 49;
          continue;
        } // 8584
        g.L_BPc2.set(g.s(1.0), qbCint(g.V_1778 + 1.0), 0); // 8585
        pc = 49;
        continue;
      case 49:
        // L_5ac98
        g.L_BP88.set(g.s(g.L_BP88.get(0) + 1.0), 0); // 8587
        if (!(g.V_16d8 === g.V_17f8 && g.V_16d0 === g.V_17e8)) {
          pc = 50;
          continue;
        } // 8588
        g.L_BP88.set(g.s(g.L_BP88.get(1)), qbCint(g.V_1778 + 3.0)); // 8589
        g.L_BP9a.set(g.s(g.L_BP9a.get(1)), qbCint(g.V_1778 + 3.0)); // 8590
        g.L_BP88.set(g.s(g.L_BP88.get(0) + 1.0), 0); // 8591
        pc = 51;
        continue; // 8592
      case 50:
        // L_5adba
        g.V_1778 = g.s(g.V_1778 + 1.0); // 8594
        g.V_0f14 = g.s(L_BP13e); // 8595
        pc = 9;
        continue; // 8596
      case 51:
        // L_5adee
        if (pilha.length === 0) return;
        pc = pilha.pop() ?? 0;
        continue; // 8598
      default:
        throw new Error(`L_5941c: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:3233-3429. */
export function S_21e5d(g: EstadoLajecalc): void {
  let L_BP0e = 0;
  let L_BP12 = 0;
  let L_BP16 = 0;
  let L_BP1a = 0;
  let L_BP1e = 0;
  let L_BP22 = 0;
  let L_BP26 = 0;
  let L_BP2a = 0;
  const pilha: number[] = [];
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        g.V_1730 = g.A_15b0.get(qbCint(g.V_1790)); // 3243
        g.V_1738 = g.A_15de.get(qbCint(g.V_1790)); // 3244
        g.V_1768 = g.A_15b0.get(qbCint(g.V_1794)); // 3245
        g.V_1770 = g.A_15de.get(qbCint(g.V_1794)); // 3246
        if (!(g.V_1730 === g.V_1768)) {
          pc = 2;
          continue;
        } // 3247
        g.V_16a8 = g.V_0e68_pi / 2.0; // 3248
        if (!(g.V_1738 < g.V_1770)) {
          pc = 1;
          continue;
        } // 3249
        g.V_16a8 = (3.0 * g.V_0e68_pi) / 2.0; // 3250
        pc = 1;
        continue;
      case 1:
        // L_21f6d
        pc = 7;
        continue; // 3252
      case 2:
        // L_21f75
        if (!(g.V_1738 <= g.V_1770 && g.V_1730 < g.V_1768)) {
          pc = 3;
          continue;
        } // 3254
        g.V_16a8 = Math.atan((g.V_1770 - g.V_1738) / (g.V_1768 - g.V_1730)) + g.V_0e68_pi; // 3255
        pc = 3;
        continue;
      case 3:
        // L_21fe2
        if (!(g.V_1738 >= g.V_1770 && g.V_1730 > g.V_1768)) {
          pc = 4;
          continue;
        } // 3257
        g.V_16a8 = Math.atan((g.V_1738 - g.V_1770) / (g.V_1730 - g.V_1768)); // 3258
        pc = 4;
        continue;
      case 4:
        // L_2204a
        if (!(g.V_1738 < g.V_1770 && g.V_1730 > g.V_1768)) {
          pc = 5;
          continue;
        } // 3260
        g.V_16a8 = 2.0 * g.V_0e68_pi - Math.atan((g.V_1770 - g.V_1738) / (g.V_1730 - g.V_1768)); // 3261
        pc = 5;
        continue;
      case 5:
        // L_220bf
        if (!(g.V_1738 > g.V_1770 && g.V_1730 < g.V_1768)) {
          pc = 6;
          continue;
        } // 3263
        g.V_16a8 = g.V_0e68_pi - Math.atan((g.V_1738 - g.V_1770) / (g.V_1768 - g.V_1730)); // 3264
        pc = 6;
        continue;
      case 6:
        // L_2212f
        pc = 7;
        continue;
      case 7:
        // L_22134
        g.V_1768 = g.A_15b0.get(qbCint(g.V_1798)); // 3267
        g.V_1770 = g.A_15de.get(qbCint(g.V_1798)); // 3268
        g.V_1740 = g.A_15b0.get(qbCint(g.V_179c)); // 3269
        g.V_1748 = g.A_15de.get(qbCint(g.V_179c)); // 3270
        if (!(g.V_1740 === g.V_1768)) {
          pc = 9;
          continue;
        } // 3271
        g.V_16b0 = g.V_0e68_pi / 2.0; // 3272
        if (!(g.V_1748 < g.V_1770)) {
          pc = 8;
          continue;
        } // 3273
        g.V_16b0 = (3.0 * g.V_0e68_pi) / 2.0; // 3274
        pc = 8;
        continue;
      case 8:
        // L_22237
        pc = 14;
        continue; // 3276
      case 9:
        // L_2223f
        if (!(g.V_1748 <= g.V_1770 && g.V_1740 < g.V_1768)) {
          pc = 10;
          continue;
        } // 3278
        g.V_16b0 = Math.atan((g.V_1770 - g.V_1748) / (g.V_1768 - g.V_1740)) + g.V_0e68_pi; // 3279
        pc = 10;
        continue;
      case 10:
        // L_222ac
        if (!(g.V_1748 >= g.V_1770 && g.V_1740 > g.V_1768)) {
          pc = 11;
          continue;
        } // 3281
        g.V_16b0 = Math.atan((g.V_1748 - g.V_1770) / (g.V_1740 - g.V_1768)); // 3282
        pc = 11;
        continue;
      case 11:
        // L_22314
        if (!(g.V_1748 < g.V_1770 && g.V_1740 > g.V_1768)) {
          pc = 12;
          continue;
        } // 3284
        g.V_16b0 = 2.0 * g.V_0e68_pi - Math.atan((g.V_1770 - g.V_1748) / (g.V_1740 - g.V_1768)); // 3285
        pc = 12;
        continue;
      case 12:
        // L_22389
        if (!(g.V_1748 > g.V_1770 && g.V_1740 < g.V_1768)) {
          pc = 13;
          continue;
        } // 3287
        g.V_16b0 = g.V_0e68_pi - Math.atan((g.V_1748 - g.V_1770) / (g.V_1768 - g.V_1740)); // 3288
        pc = 13;
        continue;
      case 13:
        // L_223f9
        pc = 14;
        continue;
      case 14:
        // L_223fe
        if (!(g.V_16a8 <= g.V_16b0)) {
          pc = 26;
          continue;
        } // 3291
        g.V_16a0 = (g.V_16a8 + g.V_16b0) / 2.0; // 3292
        if (
          !(
            Math.abs(g.V_16b0 - g.V_0e68_pi - g.V_16a8) >= g.V_133e &&
            Math.abs(g.V_16a8 - g.V_0e68_pi - g.V_16b0) >= g.V_133e &&
            Math.abs(g.V_16a8 - g.V_16b0) >= g.V_133e
          )
        ) {
          pc = 25;
          continue;
        } // 3293
        L_BP1e = g.s(g.V_1790); // 3294
        pilha.push(57);
        pc = 41;
        continue; // 3295
      case 57:
        L_BP26 = g.s(L_BP22); // 3296
        L_BP1e = g.s(g.V_1798); // 3297
        pilha.push(58);
        pc = 41;
        continue; // 3298
      case 58:
        L_BP2a = g.s(L_BP22); // 3299
        if (
          !(
            L_BP26 > L_BP2a &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) !== 1 &&
            (L_BP2a > 0.0 || L_BP26 > 0.0)
          )
        ) {
          pc = 18;
          continue;
        } // 3300
        if (
          !(
            Math.abs(g.raiz((L_BP2a + 1.0) / (L_BP26 + 1.0)) + Math.cos(g.V_16b0 - g.V_16a8)) <
            g.V_133e
          )
        ) {
          pc = 15;
          continue;
        } // 3301
        g.V_16a0 = g.V_0e68_pi / 2.0; // 3302
        pc = 17;
        continue; // 3303
      case 15:
        // L_225f3
        g.V_16a0 = Math.atan(
          Math.sin(g.V_16b0 - g.V_16a8) /
            (g.raiz((L_BP2a + 1.0) / (L_BP26 + 1.0)) + Math.cos(g.V_16b0 - g.V_16a8)),
        ); // 3305
        if (!(g.V_16a0 < 0.0)) {
          pc = 16;
          continue;
        } // 3306
        g.V_16a0 = g.V_0e68_pi + g.V_16a0; // 3307
        pc = 16;
        continue;
      case 16:
        // L_22677
        pc = 17;
        continue;
      case 17:
        // L_2267c
        g.V_16a0 = g.V_16a8 + g.V_16a0; // 3310
        pc = 18;
        continue;
      case 18:
        // L_22697
        if (
          !(
            L_BP2a > L_BP26 &&
            (L_BP2a > 0.0 || L_BP26 > 0.0) &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) !== 1
          )
        ) {
          pc = 22;
          continue;
        } // 3312
        if (
          !(
            Math.abs(g.raiz((L_BP26 + 1.0) / (L_BP2a + 1.0)) + Math.cos(g.V_16b0 - g.V_16a8)) <
            g.V_133e
          )
        ) {
          pc = 19;
          continue;
        } // 3313
        g.V_16a0 = g.V_0e68_pi / 2.0; // 3314
        pc = 21;
        continue; // 3315
      case 19:
        // L_22781
        g.V_16a0 = Math.atan(
          Math.sin(g.V_16b0 - g.V_16a8) /
            (g.raiz((L_BP26 + 1.0) / (L_BP2a + 1.0)) + Math.cos(g.V_16b0 - g.V_16a8)),
        ); // 3317
        if (!(g.V_16a0 < 0.0)) {
          pc = 20;
          continue;
        } // 3318
        g.V_16a0 = g.V_0e68_pi + g.V_16a0; // 3319
        pc = 20;
        continue;
      case 20:
        // L_22805
        pc = 21;
        continue;
      case 21:
        // L_2280a
        g.V_16a0 = g.V_16b0 - g.V_16a0; // 3322
        pc = 22;
        continue;
      case 22:
        // L_22825
        if (!(g.V_16a0 < 0.0)) {
          pc = 23;
          continue;
        } // 3324
        g.V_16a0 = 2.0 * g.V_0e68_pi + g.V_16a0; // 3325
        pc = 23;
        continue;
      case 23:
        // L_2285b
        if (!(2.0 * g.V_0e68_pi <= g.V_16a0)) {
          pc = 24;
          continue;
        } // 3327
        g.V_16a0 = g.V_16a0 - 2.0 * g.V_0e68_pi; // 3328
        pc = 24;
        continue;
      case 24:
        // L_22899
        pc = 25;
        continue;
      case 25:
        // L_2289e
        pc = 38;
        continue; // 3331
      case 26:
        // L_228a6
        g.V_16a0 = (g.V_16a8 + g.V_16b0) / 2.0 + g.V_0e68_pi; // 3333
        if (
          !(
            Math.abs(g.V_16b0 - g.V_0e68_pi - g.V_16a8) >= g.V_133e &&
            Math.abs(g.V_16a8 - g.V_0e68_pi - g.V_16b0) >= g.V_133e &&
            Math.abs(g.V_16a8 - g.V_16b0) >= g.V_133e
          )
        ) {
          pc = 36;
          continue;
        } // 3334
        L_BP1e = g.s(g.V_1790); // 3335
        pilha.push(59);
        pc = 41;
        continue; // 3336
      case 59:
        L_BP26 = g.s(L_BP22); // 3337
        L_BP1e = g.s(g.V_1798); // 3338
        pilha.push(60);
        pc = 41;
        continue; // 3339
      case 60:
        L_BP2a = g.s(L_BP22); // 3340
        if (
          !(
            L_BP26 > L_BP2a &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1798)) !== 1 &&
            (L_BP2a > 0.0 || L_BP26 > 0.0)
          )
        ) {
          pc = 30;
          continue;
        } // 3341
        if (
          !(
            Math.abs(
              g.raiz((L_BP2a + 1.0) / (L_BP26 + 1.0)) +
                Math.cos(2.0 * g.V_0e68_pi - g.V_16a8 + g.V_16b0),
            ) < g.V_133e
          )
        ) {
          pc = 27;
          continue;
        } // 3342
        g.V_16a0 = g.V_0e68_pi / 2.0; // 3343
        pc = 29;
        continue; // 3344
      case 27:
        // L_22a8f
        g.V_16a0 = Math.atan(
          Math.sin(2.0 * g.V_0e68_pi - g.V_16a8 + g.V_16b0) /
            (g.raiz((L_BP2a + 1.0) / (L_BP26 + 1.0)) +
              Math.cos(2.0 * g.V_0e68_pi - g.V_16a8 + g.V_16b0)),
        ); // 3346
        if (!(g.V_16a0 < 0.0)) {
          pc = 28;
          continue;
        } // 3347
        g.V_16a0 = g.V_0e68_pi + g.V_16a0; // 3348
        pc = 28;
        continue;
      case 28:
        // L_22b27
        pc = 29;
        continue;
      case 29:
        // L_22b2c
        g.V_16a0 = g.V_16a8 + g.V_16a0; // 3351
        pc = 30;
        continue;
      case 30:
        // L_22b47
        if (
          !(
            L_BP2a > L_BP26 &&
            (L_BP2a > 0.0 || L_BP26 > 0.0) &&
            g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1790)) !== 1
          )
        ) {
          pc = 34;
          continue;
        } // 3353
        if (
          !(
            Math.abs(
              g.raiz((L_BP26 + 1.0) / (L_BP2a + 1.0)) +
                Math.cos(2.0 * g.V_0e68_pi - g.V_16a8 + g.V_16b0),
            ) < g.V_133e
          )
        ) {
          pc = 31;
          continue;
        } // 3354
        g.V_16a0 = g.V_0e68_pi / 2.0; // 3355
        pc = 33;
        continue; // 3356
      case 31:
        // L_22c3b
        g.V_16a0 = Math.atan(
          Math.sin(2.0 * g.V_0e68_pi - g.V_16a8 + g.V_16b0) /
            (g.raiz((L_BP26 + 1.0) / (L_BP2a + 1.0)) +
              Math.cos(2.0 * g.V_0e68_pi - g.V_16a8 + g.V_16b0)),
        ); // 3358
        if (!(g.V_16a0 < 0.0)) {
          pc = 32;
          continue;
        } // 3359
        g.V_16a0 = g.V_0e68_pi + g.V_16a0; // 3360
        pc = 32;
        continue;
      case 32:
        // L_22cd3
        pc = 33;
        continue;
      case 33:
        // L_22cd8
        g.V_16a0 = g.V_16b0 - g.V_16a0; // 3363
        pc = 34;
        continue;
      case 34:
        // L_22cf3
        if (!(g.V_16a0 < 0.0)) {
          pc = 35;
          continue;
        } // 3365
        g.V_16a0 = 2.0 * g.V_0e68_pi + g.V_16a0; // 3366
        pc = 35;
        continue;
      case 35:
        // L_22d29
        pc = 36;
        continue;
      case 36:
        // L_22d2e
        if (!(2.0 * g.V_0e68_pi <= g.V_16a0)) {
          pc = 37;
          continue;
        } // 3369
        g.V_16a0 = g.V_16a0 - 2.0 * g.V_0e68_pi; // 3370
        pc = 37;
        continue;
      case 37:
        // L_22d6c
        pc = 38;
        continue;
      case 38:
        // L_22d71
        if (!(Math.abs(g.V_16a8 - g.V_16b0) < g.V_133e)) {
          pc = 40;
          continue;
        } // 3373
        if (
          !(
            Math.abs(g.V_1748 - g.V_1738 + (g.V_1740 - g.V_1730) * g.V_16a8) > g.V_133e &&
            g.V_1794 !== g.V_1798
          )
        ) {
          pc = 39;
          continue;
        } // 3374
        g.V_16a0 = g.V_16a8; // 3375
        pc = 39;
        continue;
      case 39:
        // L_22dfd
        pc = 40;
        continue;
      case 40:
        // L_22e02
        pc = 56;
        continue; // 3378
      case 41:
        // L_22e0f
        L_BP0e = g.s(L_BP1e); // 3381
        L_BP22 = g.s(0.0); // 3382
        pc = 42;
        continue;
      case 42:
        // L_22e38
        L_BP12 = g.s(L_BP0e + 1.0); // 3384
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP12)) {
          pc = 43;
          continue;
        } // 3385
        L_BP12 = g.s(1.0); // 3386
        pc = 43;
        continue;
      case 43:
        // L_22e93
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) > 2)) {
          pc = 44;
          continue;
        } // 3388
        L_BP22 = g.s(
          ((g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) - 2) *
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(L_BP0e)) - g.A_15b0.get(qbCint(L_BP12)), 2.0) +
                g.pot(g.A_15de.get(qbCint(L_BP0e)) - g.A_15de.get(qbCint(L_BP12)), 2.0),
            )) /
            10.0 +
            L_BP22,
        ); // 3389
        pc = 44;
        continue;
      case 44:
        // L_22f8c
        L_BP16 = g.s(L_BP0e); // 3391
        if (!(g.A_163a.get(qbCint(L_BP0e), 0) === -100.0)) {
          pc = 46;
          continue;
        } // 3392
        L_BP0e = g.s(L_BP0e - 1.0); // 3393
        if (!(L_BP0e === 0.0)) {
          pc = 45;
          continue;
        } // 3394
        L_BP0e = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 3395
        pc = 45;
        continue;
      case 45:
        // L_2302a
        pc = 47;
        continue; // 3397
      case 46:
        // L_23032
        pc = 48;
        continue; // 3399
      case 47:
        // L_2303f
        pc = 42;
        continue; // 3401
      case 48:
        // L_23048
        L_BP0e = g.s(L_BP1e); // 3403
        pc = 49;
        continue;
      case 49:
        // L_2305c
        L_BP0e = g.s(L_BP0e + 1.0); // 3405
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP0e)) {
          pc = 50;
          continue;
        } // 3406
        L_BP0e = g.s(1.0); // 3407
        pc = 50;
        continue;
      case 50:
        // L_230b7
        L_BP1a = g.s(L_BP0e); // 3409
        if (!(g.A_163a.get(qbCint(L_BP0e), 0) === -100.0)) {
          pc = 52;
          continue;
        } // 3410
        L_BP12 = g.s(L_BP0e + 1.0); // 3411
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP12)) {
          pc = 51;
          continue;
        } // 3412
        L_BP12 = g.s(1.0); // 3413
        pc = 51;
        continue;
      case 51:
        // L_23154
        pc = 53;
        continue; // 3415
      case 52:
        // L_2315c
        pc = 55;
        continue; // 3417
      case 53:
        // L_23169
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) > 2)) {
          pc = 54;
          continue;
        } // 3419
        L_BP22 = g.s(
          ((g.A_10fa.get(qbCint(g.V_177c), qbCint(L_BP0e)) - 2) *
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(L_BP0e)) - g.A_15b0.get(qbCint(L_BP12)), 2.0) +
                g.pot(g.A_15de.get(qbCint(L_BP0e)) - g.A_15de.get(qbCint(L_BP12)), 2.0),
            )) /
            10.0 +
            L_BP22,
        ); // 3420
        pc = 54;
        continue;
      case 54:
        // L_23262
        pc = 49;
        continue; // 3422
      case 55:
        // L_2326a
        L_BP22 = g.s(
          L_BP22 /
            g.raiz(
              g.pot(g.A_15b0.get(qbCint(L_BP16)) - g.A_15b0.get(qbCint(L_BP1a)), 2.0) +
                g.pot(g.A_15de.get(qbCint(L_BP16)) - g.A_15de.get(qbCint(L_BP1a)), 2.0),
            ),
        ); // 3424
        L_BP22 = g.s(qbInt(L_BP22 * 100.0) / 100.0); // 3425
        pc = pilha.pop() ?? 0;
        continue; // 3426
      case 56:
        // L_23331
        return;
      default:
        throw new Error(`S_21e5d: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:3130-3231. */
export function S_2175d(g: EstadoLajecalc): void {
  let L_BP0c = 0;
  let L_BP10 = 0;
  let L_BP14 = 0;
  let L_BP18 = 0;
  let L_BP1c = 0;
  let L_BP20 = 0;
  let L_BP24 = 0;
  let L_BP28 = 0;
  let L_BP2c = 0;
  let L_BP30 = 0;
  let L_BP34 = 0;
  let L_BP38 = 0;
  let L_BP3c = 0;
  let L_BP40 = 0;
  let lim0 = 0;
  let passo0 = 0;
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        L_BP0c = qbCint(g.V_0f18 === "NAO" ? -1 : 0); // 3146
        if (!((qbCint(g.V_0f20 === "NAO" ? -1 : 0) | qbCint(L_BP0c)) !== 0)) {
          pc = 1;
          continue;
        } // 3147
        pc = 20;
        continue; // 3148
      case 1:
        // L_217a7
        g.V_178c = g.s(0.0); // 3150
        L_BP20 = g.s(g.A_109e.get(qbCint(g.V_177c), 0) - 1); // 3151
        g.V_1778 = g.s(1.0); // 3152
        lim0 = g.s(L_BP20);
        passo0 = g.s(1);
        if (passo0 >= 0 ? g.V_1778 > lim0 : g.V_1778 < lim0) {
          pc = 22;
          continue;
        }
        pc = 21;
        continue;
      case 21:
        if (!(g.A_163a.get(qbCint(g.V_1778), 0) === -100.0)) {
          pc = 2;
          continue;
        } // 3153
        pc = 17;
        continue; // 3154
      case 2:
        // L_21830
        L_BP10 = g.s(g.A_15b0.get(qbCint(g.V_1778))); // 3156
        L_BP14 = g.s(g.A_15de.get(qbCint(g.V_1778))); // 3157
        L_BP1c = g.s(g.V_1778 + 1.0); // 3158
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP1c)) {
          pc = 3;
          continue;
        } // 3159
        L_BP1c = g.s(1.0); // 3160
        pc = 3;
        continue;
      case 3:
        // L_218d8
        pc = 4;
        continue;
      case 4:
        // L_218dd
        if (!(g.A_163a.get(qbCint(L_BP1c), 0) === -100.0)) {
          pc = 6;
          continue;
        } // 3163
        L_BP1c = g.s(L_BP1c + 1.0); // 3164
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) === L_BP1c)) {
          pc = 5;
          continue;
        } // 3165
        L_BP1c = g.s(1.0); // 3166
        pc = 5;
        continue;
      case 5:
        // L_21970
        pc = 4;
        continue; // 3168
      case 6:
        // L_2197d
        L_BP18 = g.s(g.A_15b0.get(qbCint(L_BP1c))); // 3170
        L_BP1c = g.s(g.A_15de.get(qbCint(L_BP1c))); // 3171
        if (
          !(
            (Math.abs(g.V_0efc - L_BP1c) < g.V_133a && Math.abs(g.V_0ef4 - L_BP18) < g.V_133a) ||
            (Math.abs(g.V_0efc - L_BP14) < g.V_133a && Math.abs(g.V_0ef4 - L_BP10) < g.V_133a)
          )
        ) {
          pc = 7;
          continue;
        } // 3172
        g.V_178c = g.s(1.0); // 3173
        pc = 18;
        continue; // 3174
      case 7:
        // L_21a7c
        L_BP24 = g.s(L_BP10 < L_BP18 ? L_BP10 : L_BP18); // 3176
        if (!(L_BP24 > g.V_133a + g.V_0ef4)) {
          pc = 8;
          continue;
        } // 3178
        pc = 17;
        continue; // 3179
      case 8:
        // L_21ab4
        L_BP28 = g.s(L_BP14 < L_BP1c ? L_BP14 : L_BP1c); // 3181
        L_BP2c = g.s(L_BP14 > L_BP1c ? L_BP14 : L_BP1c); // 3183
        if (!(L_BP2c < g.V_0efc || L_BP28 > g.V_0efc)) {
          pc = 9;
          continue;
        } // 3185
        pc = 17;
        continue; // 3186
      case 9:
        // L_21b1a
        L_BP30 = g.s(L_BP10 > L_BP18 ? L_BP10 : L_BP18); // 3188
        if (!((g.V_0ef4 - g.V_133a > L_BP30 || L_BP14 !== g.V_0efc) && L_BP14 === L_BP1c)) {
          pc = 10;
          continue;
        } // 3190
        pc = 17;
        continue; // 3191
      case 10:
        // L_21b90
        L_BP34 = g.s(L_BP14 > L_BP1c ? L_BP14 : L_BP1c); // 3193
        L_BP38 = g.s(L_BP14 < L_BP1c ? L_BP14 : L_BP1c); // 3195
        L_BP3c = g.s(L_BP10 > L_BP18 ? L_BP10 : L_BP18); // 3197
        if (!(L_BP3c <= g.V_0ef4 && L_BP38 <= g.V_0efc && L_BP34 > g.V_0efc)) {
          pc = 12;
          continue;
        } // 3199
        g.V_178c = g.s(g.V_178c + 1.0); // 3200
        if (!(Math.abs(g.V_0ef4 - L_BP10) < g.V_133a && Math.abs(L_BP10 - L_BP18) < g.V_133a)) {
          pc = 11;
          continue;
        } // 3201
        g.V_178c = g.s(1.0); // 3202
        pc = 18;
        continue; // 3203
      case 11:
        // L_21c96
        pc = 17;
        continue; // 3205
      case 12:
        // L_21ca3
        if (!(L_BP14 === L_BP1c)) {
          pc = 13;
          continue;
        } // 3207
        g.V_178c = g.s(1.0); // 3208
        pc = 18;
        continue; // 3209
      case 13:
        // L_21cd5
        L_BP40 = g.s(L_BP14 > L_BP1c ? L_BP14 : L_BP1c); // 3211
        if (!(L_BP40 === g.V_0efc)) {
          pc = 14;
          continue;
        } // 3213
        pc = 17;
        continue; // 3214
      case 14:
        // L_21d08
        if (
          !(
            g.V_133a + g.V_0ef4 >=
            L_BP10 + ((g.V_0efc - L_BP14) * (L_BP18 - L_BP10)) / (L_BP1c - L_BP14)
          )
        ) {
          pc = 16;
          continue;
        } // 3216
        g.V_178c = g.s(g.V_178c + 1.0); // 3217
        if (
          !(
            Math.abs(
              g.V_0ef4 - (L_BP10 + ((g.V_0efc - L_BP14) * (L_BP18 - L_BP10)) / (L_BP1c - L_BP14)),
            ) < g.V_133a
          )
        ) {
          pc = 15;
          continue;
        } // 3218
        g.V_178c = g.s(1.0); // 3219
        pc = 18;
        continue; // 3220
      case 15:
        // L_21dc5
        pc = 16;
        continue;
      case 16:
        // L_21dca
        pc = 17;
        continue;
      case 17:
        // L_21dcf
        g.V_1778 = g.s(g.V_1778 + passo0); // 3224
        if (passo0 >= 0 ? g.V_1778 <= lim0 : g.V_1778 >= lim0) {
          pc = 21;
          continue;
        }
        pc = 22;
        continue;
      case 22:
        pc = 18;
        continue;
      case 18:
        // L_21dff
        if (!(g.V_178c / 2.0 === qbFix(qbClng(qbClng(g.V_178c)) / qbClng(2)))) {
          pc = 19;
          continue;
        } // 3226
        g.V_0f18 = "NAO"; // 3227
        pc = 19;
        continue;
      case 19:
        // L_21e48
        pc = 20;
        continue;
      case 20:
        // L_21e4d
        return;
      default:
        throw new Error(`S_2175d: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:3431-3478. */
export function S_23341(g: EstadoLajecalc): void {
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        g.V_0f18 = ""; // 3433
        if (
          !(
            Math.abs(g.V_1678 - g.V_1680 + g.V_0e68_pi) < g.V_133e ||
            Math.abs(g.V_0e68_pi - g.V_1680 + g.V_1678) < g.V_133e ||
            Math.abs(g.V_1678 - g.V_1680 - g.V_0e68_pi) < g.V_133e ||
            Math.abs(g.V_1678 - g.V_0e68_pi - g.V_1680) < g.V_133e ||
            Math.abs(g.V_1678 - g.V_1680) < g.V_133e
          )
        ) {
          pc = 1;
          continue;
        } // 3434
        g.V_0ef4 = 10000000000.0; // 3435
        g.V_0efc = 10000000000.0; // 3436
        g.V_0f18 = "NAO"; // 3437
        pc = 10;
        continue; // 3438
      case 1:
        // L_23467
        if (!((3.0 * g.V_0e68_pi) / 2.0 === g.V_1678 || g.V_0e68_pi / 2.0 === g.V_1678)) {
          pc = 3;
          continue;
        } // 3440
        g.V_0ef4 = g.V_17e0; // 3441
        g.V_0efc =
          Math.tan(g.V_1680) * g.V_0ef4 +
          (g.V_17f8 - (Math.sin(g.V_1680) / Math.cos(g.V_1680)) * g.V_17e8); // 3442
        if (!(Math.abs(Math.sin(g.V_1680)) < g.V_133e / 100.0)) {
          pc = 2;
          continue;
        } // 3443
        g.V_0efc = g.V_17f8; // 3444
        pc = 2;
        continue;
      case 2:
        // L_23548
        pc = 10;
        continue; // 3446
      case 3:
        // L_23555
        if (!((3.0 * g.V_0e68_pi) / 2.0 === g.V_1680 || g.V_0e68_pi / 2.0 === g.V_1680)) {
          pc = 5;
          continue;
        } // 3448
        g.V_0ef4 = g.V_17e8; // 3449
        g.V_0efc =
          Math.tan(g.V_1678) * g.V_0ef4 +
          (g.V_17f0 - (Math.sin(g.V_1678) / Math.cos(g.V_1678)) * g.V_17e0); // 3450
        if (!(Math.abs(Math.sin(g.V_1678)) < g.V_133e / 100.0)) {
          pc = 4;
          continue;
        } // 3451
        g.V_0efc = g.V_17f0; // 3452
        pc = 4;
        continue;
      case 4:
        // L_23636
        pc = 10;
        continue; // 3454
      case 5:
        // L_23643
        if (!(g.V_1678 === g.V_0e68_pi || g.V_1678 === 0.0)) {
          pc = 7;
          continue;
        } // 3456
        g.V_0efc = g.V_17f0; // 3457
        g.V_0ef4 =
          (g.V_0efc - (g.V_17f8 - (Math.sin(g.V_1680) / Math.cos(g.V_1680)) * g.V_17e8)) /
          Math.tan(g.V_1680); // 3458
        if (!(Math.abs(Math.cos(g.V_1680)) < g.V_133e / 100.0)) {
          pc = 6;
          continue;
        } // 3459
        g.V_0ef4 = g.V_17e8; // 3460
        pc = 6;
        continue;
      case 6:
        // L_23718
        pc = 10;
        continue; // 3462
      case 7:
        // L_23725
        if (!(g.V_1680 === g.V_0e68_pi || g.V_1680 === 0.0)) {
          pc = 9;
          continue;
        } // 3464
        g.V_0efc = g.V_17f8; // 3465
        g.V_0ef4 =
          (g.V_0efc - (g.V_17f0 - (Math.sin(g.V_1678) / Math.cos(g.V_1678)) * g.V_17e0)) /
          Math.tan(g.V_1678); // 3466
        if (!(Math.abs(Math.cos(g.V_1678)) < g.V_133e / 100.0)) {
          pc = 8;
          continue;
        } // 3467
        g.V_0ef4 = g.V_17e0; // 3468
        pc = 8;
        continue;
      case 8:
        // L_237fa
        pc = 10;
        continue; // 3470
      case 9:
        // L_23807
        g.V_0efc =
          (Math.tan(g.V_1680) * (g.V_17f0 - (Math.sin(g.V_1678) / Math.cos(g.V_1678)) * g.V_17e0) -
            Math.tan(g.V_1678) *
              (g.V_17f8 - (Math.sin(g.V_1680) / Math.cos(g.V_1680)) * g.V_17e8)) /
          (Math.tan(g.V_1680) - Math.tan(g.V_1678)); // 3472
        g.V_0ef4 =
          (g.V_17f8 -
            (Math.sin(g.V_1680) / Math.cos(g.V_1680)) * g.V_17e8 -
            (g.V_17f0 - (Math.sin(g.V_1678) / Math.cos(g.V_1678)) * g.V_17e0)) /
          (Math.tan(g.V_1678) - Math.tan(g.V_1680)); // 3473
        pc = 10;
        continue;
      case 10:
        // L_23924
        S_2175d(g); // 3475
        return;
      default:
        throw new Error(`S_23341: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:3480-3542. */
export function S_23948(g: EstadoLajecalc): void {
  let L_BP0c = 0;
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        g.V_1778 = g.s(g.V_16b8 + 1.0); // 3483
        g.V_0f1c = "NAO"; // 3484
        pc = 1;
        continue;
      case 1:
        // L_2397e
        if (!(g.A_160c.get(0, 0) >= g.V_1778)) {
          pc = 7;
          continue;
        } // 3486
        if (!(g.A_160c.get(qbCint(g.V_1778), 0) >= 0.0)) {
          pc = 2;
          continue;
        } // 3487
        g.V_16d0 = g.A_160c.get(qbCint(g.V_1778), 0); // 3488
        g.V_16d8 = g.A_160c.get(qbCint(g.V_1778), 1); // 3489
        pc = 3;
        continue; // 3490
      case 2:
        // L_23a34
        g.V_16d0 = g.A_15b0.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_1778), 0)))); // 3492
        g.V_16d8 = g.A_15de.get(qbCint(Math.abs(g.A_160c.get(qbCint(g.V_1778), 0)))); // 3493
        pc = 3;
        continue;
      case 3:
        // L_23abf
        g.V_16e0 = g.A_160c.get(qbCint(g.V_1778), 2); // 3495
        g.V_16e8 = g.A_160c.get(qbCint(g.V_1778), 3); // 3496
        S_2018c(g); // 3497
        if (!(g.V_0efc === g.V_16f8 && g.V_0ef4 === g.V_16f0)) {
          pc = 4;
          continue;
        } // 3499
        g.V_0f1c = "NAO"; // 3500
        pc = 4;
        continue;
      case 4:
        // L_23b6c
        if (!(g.V_0efc === g.V_1708 && g.V_0ef4 === g.V_1700)) {
          pc = 5;
          continue;
        } // 3502
        g.V_0f1c = ""; // 3503
        pc = 5;
        continue;
      case 5:
        // L_23bbc
        if (!(g.V_0f1c === "")) {
          pc = 6;
          continue;
        } // 3505
        pc = 7;
        continue; // 3506
      case 6:
        // L_23bdb
        g.V_1778 = g.s(g.V_1778 + 1.0); // 3508
        pc = 1;
        continue; // 3509
      case 7:
        // L_23bfa
        L_BP0c = qbCint(g.V_16cc === -1.0 ? -1 : 0); // 3511
        if (!((qbCint(g.V_0f1c === "" ? -1 : 0) | qbCint(L_BP0c)) !== 0)) {
          pc = 8;
          continue;
        } // 3512
        pc = 16;
        continue; // 3513
      case 8:
        // L_23c40
        g.V_1778 = g.s(1.0); // 3515
        pc = 9;
        continue;
      case 9:
        // L_23c56
        if (!(g.A_109e.get(qbCint(g.V_177c), 0) - 1 >= g.V_1778)) {
          pc = 15;
          continue;
        } // 3517
        g.V_16d0 = g.A_15b0.get(qbCint(g.V_1778)); // 3518
        g.V_16d8 = g.A_15de.get(qbCint(g.V_1778)); // 3519
        g.V_16e0 = g.A_15b0.get(qbCint(g.V_1778 + 1.0)); // 3520
        g.V_16e8 = g.A_15de.get(qbCint(g.V_1778 + 1.0)); // 3521
        if (!(g.A_10fa.get(qbCint(g.V_177c), qbCint(g.V_1778)) === 1)) {
          pc = 10;
          continue;
        } // 3522
        pc = 14;
        continue; // 3523
      case 10:
        // L_23d6a
        S_2018c(g); // 3525
        if (!(g.V_0efc === g.V_16f8 && g.V_0ef4 === g.V_16f0)) {
          pc = 11;
          continue;
        } // 3527
        g.V_0f1c = "NAO"; // 3528
        pc = 11;
        continue;
      case 11:
        // L_23dc4
        if (!(g.V_0efc === g.V_1708 && g.V_0ef4 === g.V_1700)) {
          pc = 12;
          continue;
        } // 3530
        g.V_0f1c = "NAO"; // 3531
        pc = 12;
        continue;
      case 12:
        // L_23e14
        if (!(g.V_0f1c === "")) {
          pc = 13;
          continue;
        } // 3533
        pc = 15;
        continue; // 3534
      case 13:
        // L_23e33
        pc = 14;
        continue;
      case 14:
        // L_23e38
        g.V_1778 = g.s(g.V_1778 + 1.0); // 3537
        pc = 9;
        continue; // 3538
      case 15:
        // L_23e5c
        pc = 16;
        continue;
      case 16:
        // L_23e61
        return;
      default:
        throw new Error(`S_23948: pc ${pc}`);
    }
  }
}

/** Traducao mecanica de LAJECALC.BAS:2726-3128. */
export function S_2018c(g: EstadoLajecalc): void {
  let L_BP0e = 0;
  let L_BP102 = 0;
  let L_BP106 = 0;
  let L_BP10a = 0;
  let L_BP10e = 0;
  let L_BP112 = 0;
  let L_BP116 = 0;
  let L_BP11a = 0;
  let L_BP11e = 0;
  let L_BP12 = 0;
  let L_BP122 = 0;
  let L_BP126 = 0;
  let L_BP12a = 0;
  let L_BP12e = 0;
  let L_BP132 = 0;
  let L_BP136 = 0;
  let L_BP13a = 0;
  let L_BP13e = 0;
  let L_BP142 = 0;
  let L_BP146 = 0;
  let L_BP14a = 0;
  let L_BP14e = 0;
  let L_BP152 = 0;
  let L_BP156 = 0;
  let L_BP15a = 0;
  let L_BP15e = 0;
  let L_BP16 = 0;
  let L_BP162 = 0;
  let L_BP166 = 0;
  let L_BP16a = 0;
  let L_BP16e = 0;
  let L_BP172 = 0;
  let L_BP176 = 0;
  let L_BP17a = 0;
  let L_BP17e = 0;
  let L_BP182 = 0;
  let L_BP186 = 0;
  let L_BP18a = 0;
  let L_BP18e = 0;
  let L_BP192 = 0;
  let L_BP196 = 0;
  let L_BP19a = 0;
  let L_BP19e = 0;
  let L_BP1a = 0;
  let L_BP1a2 = 0;
  let L_BP1a6 = 0;
  let L_BP1aa = 0;
  let L_BP1ae = 0;
  let L_BP1b2 = 0;
  let L_BP1b6 = 0;
  let L_BP1ba = 0;
  let L_BP1be = 0;
  let L_BP1c2 = 0;
  let L_BP1c6 = 0;
  let L_BP1ca = 0;
  let L_BP1ce = 0;
  let L_BP1d2 = 0;
  let L_BP1d6 = 0;
  let L_BP1da = 0;
  let L_BP1de = 0;
  let L_BP1e = 0;
  let L_BP1e2 = 0;
  let L_BP1e6 = 0;
  let L_BP1ea = 0;
  let L_BP1ee = 0;
  let L_BP1f2 = 0;
  let L_BP1f6 = 0;
  let L_BP1fa = 0;
  let L_BP1fe = 0;
  let L_BP202 = 0;
  let L_BP206 = 0;
  let L_BP20a = 0;
  let L_BP20e = 0;
  let L_BP212 = 0;
  let L_BP216 = 0;
  let L_BP21a = 0;
  let L_BP21e = 0;
  let L_BP22 = 0;
  let L_BP222 = 0;
  let L_BP226 = 0;
  let L_BP22a = 0;
  let L_BP22e = 0;
  let L_BP232 = 0;
  let L_BP236 = 0;
  let L_BP23a = 0;
  let L_BP23e = 0;
  let L_BP242 = 0;
  let L_BP246 = 0;
  let L_BP24a = 0;
  let L_BP24e = 0;
  let L_BP252 = 0;
  let L_BP256 = 0;
  let L_BP25a = 0;
  let L_BP25e = 0;
  let L_BP26 = 0;
  let L_BP262 = 0;
  let L_BP266 = 0;
  let L_BP26a = 0;
  let L_BP26e = 0;
  let L_BP272 = 0;
  let L_BP276 = 0;
  let L_BP27a = 0;
  let L_BP27e = 0;
  let L_BP282 = 0;
  let L_BP286 = 0;
  let L_BP28a = 0;
  let L_BP28e = 0;
  let L_BP292 = 0;
  let L_BP296 = 0;
  let L_BP29a = 0;
  let L_BP29e = 0;
  let L_BP2a = 0;
  let L_BP2a2 = 0;
  let L_BP2a6 = 0;
  let L_BP2aa = 0;
  let L_BP2ae = 0;
  let L_BP2b2 = 0;
  let L_BP2b6 = 0;
  let L_BP2ba = 0;
  let L_BP2e = 0;
  let L_BP32 = 0;
  let L_BP36 = 0;
  let L_BP3a = 0;
  let L_BP3e = 0;
  let L_BP42 = 0;
  let L_BP46 = 0;
  let L_BP4a = 0;
  let L_BP4e = 0;
  let L_BP52 = 0;
  let L_BP56 = 0;
  let L_BP5a = 0;
  let L_BP5e = 0;
  let L_BP62 = 0;
  let L_BP66 = 0;
  let L_BP6a = 0;
  let L_BP6e = 0;
  let L_BP72 = 0;
  let L_BP76 = 0;
  let L_BP7a = 0;
  let L_BP7e = 0;
  let L_BP82 = 0;
  let L_BP86 = 0;
  let L_BP8a = 0;
  let L_BP8e = 0;
  let L_BP92 = 0;
  let L_BP96 = 0;
  let L_BP9a = 0;
  let L_BP9e = 0;
  let L_BPa2 = 0;
  let L_BPa6 = 0;
  let L_BPaa = 0;
  let L_BPae = 0;
  let L_BPb2 = 0;
  let L_BPb6 = 0;
  let L_BPba = 0;
  let L_BPbe = 0;
  let L_BPc2 = 0;
  let L_BPc6 = 0;
  let L_BPca = 0;
  let L_BPce = 0;
  let L_BPd2 = 0;
  let L_BPd6 = 0;
  let L_BPda = 0;
  let L_BPde = 0;
  let L_BPe2 = 0;
  let L_BPe6 = 0;
  let L_BPea = 0;
  let L_BPee = 0;
  let L_BPf2 = 0;
  let L_BPf6 = 0;
  let L_BPfa = 0;
  let L_BPfe = 0;
  let pc = 0;
  for (;;) {
    switch (pc) {
      case 0:
        g.V_0f1c = ""; // 2789
        g.V_0ef4 = 10000000000.0; // 2790
        g.V_0efc = 10000000000.0; // 2791
        L_BP0e = g.s(g.V_16f0 / 1.0); // 2792
        L_BP12 = g.s(g.V_1700 / 1.0); // 2793
        L_BP16 = g.s(L_BP0e > L_BP12 ? L_BP0e : L_BP12); // 2794
        L_BP1a = g.s(g.V_16d0 / 1.0); // 2796
        L_BP1e = g.s(g.V_16e0 / 1.0); // 2797
        L_BP22 = g.s(L_BP1a < L_BP1e ? L_BP1a : L_BP1e); // 2798
        L_BP26 = g.s(g.V_16f0 / 1.0); // 2800
        L_BP2a = g.s(g.V_1700 / 1.0); // 2801
        L_BP2e = g.s(L_BP26 < L_BP2a ? L_BP26 : L_BP2a); // 2802
        L_BP32 = g.s(g.V_16d0 / 1.0); // 2804
        L_BP36 = g.s(g.V_16e0 / 1.0); // 2805
        L_BP3a = g.s(L_BP32 > L_BP36 ? L_BP32 : L_BP36); // 2806
        if (!(L_BP2e > L_BP3a || L_BP16 < L_BP22)) {
          pc = 1;
          continue;
        } // 2808
        pc = 35;
        continue; // 2809
      case 1:
        // L_202ce
        L_BP3e = g.s(g.V_16f8 / 1.0); // 2811
        L_BP42 = g.s(g.V_1708 / 1.0); // 2812
        L_BP46 = g.s(L_BP3e > L_BP42 ? L_BP3e : L_BP42); // 2813
        L_BP4a = g.s(g.V_16d8 / 1.0); // 2815
        L_BP4e = g.s(g.V_16e8 / 1.0); // 2816
        L_BP52 = g.s(L_BP4a < L_BP4e ? L_BP4a : L_BP4e); // 2817
        L_BP56 = g.s(g.V_16f8 / 1.0); // 2819
        L_BP5a = g.s(g.V_1708 / 1.0); // 2820
        L_BP5e = g.s(L_BP56 < L_BP5a ? L_BP56 : L_BP5a); // 2821
        L_BP62 = g.s(g.V_16d8 / 1.0); // 2823
        L_BP66 = g.s(g.V_16e8 / 1.0); // 2824
        L_BP6a = g.s(L_BP62 > L_BP66 ? L_BP62 : L_BP66); // 2825
        if (!(L_BP5e > L_BP6a || L_BP46 < L_BP52)) {
          pc = 2;
          continue;
        } // 2827
        pc = 35;
        continue; // 2828
      case 2:
        // L_203d4
        if (!(g.V_16d8 === g.V_16e8 && g.V_16f8 === g.V_1708)) {
          pc = 4;
          continue;
        } // 2830
        L_BP6e = g.s(g.V_16f0 / 1.0); // 2831
        L_BP72 = g.s(g.V_1700 / 1.0); // 2832
        L_BP76 = g.s(L_BP6e > L_BP72 ? L_BP6e : L_BP72); // 2833
        L_BP7a = g.s(g.V_16d0 / 1.0); // 2835
        L_BP7e = g.s(g.V_16e0 / 1.0); // 2836
        L_BP82 = g.s(L_BP7a < L_BP7e ? L_BP7a : L_BP7e); // 2837
        L_BP86 = g.s(g.V_16d0 / 1.0); // 2839
        L_BP8a = g.s(g.V_16e0 / 1.0); // 2840
        L_BP8e = g.s(L_BP86 > L_BP8a ? L_BP86 : L_BP8a); // 2841
        L_BP92 = g.s(g.V_16f0 / 1.0); // 2843
        L_BP96 = g.s(g.V_1700 / 1.0); // 2844
        L_BP9a = g.s(L_BP92 < L_BP96 ? L_BP92 : L_BP96); // 2845
        if (!(L_BP8e < L_BP9a || L_BP76 < L_BP82)) {
          pc = 3;
          continue;
        } // 2847
        pc = 35;
        continue; // 2848
      case 3:
        // L_20526
        pc = 4;
        continue;
      case 4:
        // L_2052b
        if (!(g.V_16f8 === g.V_1708)) {
          pc = 5;
          continue;
        } // 2851
        g.V_0efc = g.V_16f8; // 2852
        pc = 18;
        continue; // 2853
      case 5:
        // L_2055f
        if (!(g.V_16d8 === g.V_16e8)) {
          pc = 6;
          continue;
        } // 2855
        g.V_0efc = g.V_16d8; // 2856
        pc = 18;
        continue; // 2857
      case 6:
        // L_20593
        if (
          !(
            Math.abs(
              (g.V_1700 - g.V_16f0) / (g.V_1708 - g.V_16f8) -
                (g.V_16e0 - g.V_16d0) / (g.V_16e8 - g.V_16d8),
            ) < g.V_133a
          )
        ) {
          pc = 13;
          continue;
        } // 2859
        L_BP9e = g.s(g.V_16f8 / 1.0); // 2860
        L_BPa2 = g.s(g.V_1708 / 1.0); // 2861
        L_BPa6 = g.s(L_BP9e > L_BPa2 ? L_BP9e : L_BPa2); // 2862
        L_BPaa = g.s(g.V_16d8 / 1.0); // 2864
        L_BPae = g.s(g.V_16e8 / 1.0); // 2865
        L_BPb2 = g.s(L_BPaa < L_BPae ? L_BPaa : L_BPae); // 2866
        L_BPb6 = g.s(g.V_16d8 / 1.0); // 2868
        L_BPba = g.s(g.V_16e8 / 1.0); // 2869
        L_BPbe = g.s(L_BPb6 > L_BPba ? L_BPb6 : L_BPba); // 2870
        L_BPc2 = g.s(g.V_16f8 / 1.0); // 2872
        L_BPc6 = g.s(g.V_1708 / 1.0); // 2873
        L_BPca = g.s(L_BPc2 < L_BPc6 ? L_BPc2 : L_BPc6); // 2874
        if (!(L_BPbe < L_BPca || L_BPa6 < L_BPb2)) {
          pc = 7;
          continue;
        } // 2876
        pc = 35;
        continue; // 2877
      case 7:
        // L_206fb
        if (
          !(
            Math.abs(
              g.V_16d0 -
                ((g.V_16e0 - g.V_16d0) / (g.V_16e8 - g.V_16d8)) * g.V_16d8 -
                (g.V_16f0 - ((g.V_1700 - g.V_16f0) / (g.V_1708 - g.V_16f8)) * g.V_16f8),
            ) > g.V_133a
          )
        ) {
          pc = 8;
          continue;
        } // 2879
        pc = 35;
        continue; // 2880
      case 8:
        // L_20767
        L_BPce = g.s(g.V_16f8 / 1.0); // 2882
        L_BPd2 = g.s(g.V_1708 / 1.0); // 2883
        L_BPd6 = g.s(L_BPce > L_BPd2 ? L_BPce : L_BPd2); // 2884
        L_BPda = g.s(g.V_16d8 / 1.0); // 2886
        L_BPde = g.s(g.V_16e8 / 1.0); // 2887
        L_BPe2 = g.s(L_BPda > L_BPde ? L_BPda : L_BPde); // 2888
        L_BPe6 = g.s(g.V_16f8 / 1.0); // 2890
        L_BPea = g.s(g.V_1708 / 1.0); // 2891
        L_BPee = g.s(L_BPe6 < L_BPea ? L_BPe6 : L_BPea); // 2892
        L_BPf2 = g.s(g.V_16d8 / 1.0); // 2894
        L_BPf6 = g.s(g.V_16e8 / 1.0); // 2895
        L_BPfa = g.s(L_BPf2 > L_BPf6 ? L_BPf2 : L_BPf6); // 2896
        if (!(L_BPee < L_BPfa && L_BPd6 >= L_BPe2)) {
          pc = 10;
          continue;
        } // 2898
        L_BPfe = g.s(g.V_16d8 / 1.0); // 2899
        L_BP102 = g.s(g.V_16e8 / 1.0); // 2900
        L_BP106 = g.s(L_BPfe > L_BP102 ? L_BPfe : L_BP102); // 2901
        g.V_0efc = L_BP106; // 2903
        L_BP10a = g.s(g.V_16f8 / 1.0); // 2904
        L_BP10e = g.s(g.V_1708 / 1.0); // 2905
        L_BP112 = g.s(L_BP10a > L_BP10e ? L_BP10a : L_BP10e); // 2906
        if (!(L_BP112 === g.V_0efc)) {
          pc = 9;
          continue;
        } // 2908
        L_BP116 = g.s(g.V_16d8 / 1.0); // 2909
        L_BP11a = g.s(g.V_16e8 / 1.0); // 2910
        L_BP11e = g.s(L_BP116 < L_BP11a ? L_BP116 : L_BP11a); // 2911
        L_BP122 = g.s(g.V_16f8 / 1.0); // 2913
        L_BP126 = g.s(g.V_1708 / 1.0); // 2914
        L_BP12a = g.s(L_BP122 < L_BP126 ? L_BP122 : L_BP126); // 2915
        L_BP12e = g.s(L_BP11e > L_BP12a ? L_BP11e : L_BP12a); // 2917
        g.V_0efc = L_BP12e; // 2919
        pc = 9;
        continue;
      case 9:
        // L_209a6
        pc = 10;
        continue;
      case 10:
        // L_209ab
        L_BP132 = g.s(g.V_16d8 / 1.0); // 2922
        L_BP136 = g.s(g.V_16e8 / 1.0); // 2923
        L_BP13a = g.s(L_BP132 > L_BP136 ? L_BP132 : L_BP136); // 2924
        L_BP13e = g.s(g.V_16f8 / 1.0); // 2926
        L_BP142 = g.s(g.V_1708 / 1.0); // 2927
        L_BP146 = g.s(L_BP13e > L_BP142 ? L_BP13e : L_BP142); // 2928
        L_BP14a = g.s(g.V_16d8 / 1.0); // 2930
        L_BP14e = g.s(g.V_16e8 / 1.0); // 2931
        L_BP152 = g.s(L_BP14a < L_BP14e ? L_BP14a : L_BP14e); // 2932
        L_BP156 = g.s(g.V_16f8 / 1.0); // 2934
        L_BP15a = g.s(g.V_1708 / 1.0); // 2935
        L_BP15e = g.s(L_BP156 > L_BP15a ? L_BP156 : L_BP15a); // 2936
        if (!(L_BP152 < L_BP15e && L_BP13a >= L_BP146)) {
          pc = 12;
          continue;
        } // 2938
        L_BP162 = g.s(g.V_16f8 / 1.0); // 2939
        L_BP166 = g.s(g.V_1708 / 1.0); // 2940
        L_BP16a = g.s(L_BP162 > L_BP166 ? L_BP162 : L_BP166); // 2941
        g.V_0efc = L_BP16a; // 2943
        L_BP16e = g.s(g.V_16d8 / 1.0); // 2944
        L_BP172 = g.s(g.V_16e8 / 1.0); // 2945
        L_BP176 = g.s(L_BP16e > L_BP172 ? L_BP16e : L_BP172); // 2946
        if (!(L_BP176 === g.V_0efc)) {
          pc = 11;
          continue;
        } // 2948
        L_BP17a = g.s(g.V_16f8 / 1.0); // 2949
        L_BP17e = g.s(g.V_1708 / 1.0); // 2950
        L_BP182 = g.s(L_BP17a < L_BP17e ? L_BP17a : L_BP17e); // 2951
        L_BP186 = g.s(g.V_16d8 / 1.0); // 2953
        L_BP18a = g.s(g.V_16e8 / 1.0); // 2954
        L_BP18e = g.s(L_BP186 < L_BP18a ? L_BP186 : L_BP18a); // 2955
        L_BP192 = g.s(L_BP182 > L_BP18e ? L_BP182 : L_BP18e); // 2957
        g.V_0efc = L_BP192; // 2959
        pc = 11;
        continue;
      case 11:
        // L_20bea
        pc = 12;
        continue;
      case 12:
        // L_20bef
        pc = 18;
        continue; // 2962
      case 13:
        // L_20bfc
        g.V_0efc =
          (g.V_1700 -
            g.V_16e0 +
            (((g.V_16e0 - g.V_16d0) / (g.V_16e8 - g.V_16d8)) * g.V_16e8 -
              ((g.V_1700 - g.V_16f0) / (g.V_1708 - g.V_16f8)) * g.V_1708)) /
          ((g.V_16e0 - g.V_16d0) / (g.V_16e8 - g.V_16d8) -
            (g.V_1700 - g.V_16f0) / (g.V_1708 - g.V_16f8)); // 2964
        if (!(Math.abs(g.V_16f8 - g.V_0efc) < g.V_133a)) {
          pc = 14;
          continue;
        } // 2965
        g.V_0efc = g.V_16f8; // 2966
        pc = 14;
        continue;
      case 14:
        // L_20cb8
        if (!(Math.abs(g.V_1708 - g.V_0efc) < g.V_133a)) {
          pc = 15;
          continue;
        } // 2968
        g.V_0efc = g.V_1708; // 2969
        pc = 15;
        continue;
      case 15:
        // L_20cec
        if (!(Math.abs(g.V_16d8 - g.V_0efc) < g.V_133a)) {
          pc = 16;
          continue;
        } // 2971
        g.V_0efc = g.V_16d8; // 2972
        pc = 16;
        continue;
      case 16:
        // L_20d20
        if (!(Math.abs(g.V_16e8 - g.V_0efc) < g.V_133a)) {
          pc = 17;
          continue;
        } // 2974
        g.V_0efc = g.V_16e8; // 2975
        pc = 17;
        continue;
      case 17:
        // L_20d54
        pc = 18;
        continue;
      case 18:
        // L_20d59
        L_BP196 = g.s(g.V_16f8 / 1.0); // 2978
        L_BP19a = g.s(g.V_1708 / 1.0); // 2979
        L_BP19e = g.s(L_BP196 > L_BP19a ? L_BP196 : L_BP19a); // 2980
        L_BP1a2 = g.s(g.V_16f8 / 1.0); // 2982
        L_BP1a6 = g.s(g.V_1708 / 1.0); // 2983
        L_BP1aa = g.s(L_BP1a2 < L_BP1a6 ? L_BP1a2 : L_BP1a6); // 2984
        L_BP1ae = g.s(g.V_16d8 / 1.0); // 2986
        L_BP1b2 = g.s(g.V_16e8 / 1.0); // 2987
        L_BP1b6 = g.s(L_BP1ae > L_BP1b2 ? L_BP1ae : L_BP1b2); // 2988
        L_BP1ba = g.s(g.V_16d8 / 1.0); // 2990
        L_BP1be = g.s(g.V_16e8 / 1.0); // 2991
        L_BP1c2 = g.s(L_BP1ba < L_BP1be ? L_BP1ba : L_BP1be); // 2992
        if (
          !(
            (g.V_16d8 !== g.V_16e8 &&
              (g.V_133a + g.V_0efc < L_BP1c2 || g.V_0efc - g.V_133a > L_BP1b6)) ||
            (g.V_16f8 !== g.V_1708 &&
              (g.V_133a + g.V_0efc < L_BP1aa || g.V_0efc - g.V_133a > L_BP19e))
          )
        ) {
          pc = 19;
          continue;
        } // 2994
        pc = 35;
        continue; // 2995
      case 19:
        // L_20f02
        if (!(g.V_16f0 === g.V_1700)) {
          pc = 20;
          continue;
        } // 2997
        g.V_0ef4 = g.V_16f0; // 2998
        pc = 33;
        continue; // 2999
      case 20:
        // L_20f36
        if (!(g.V_16d8 === g.V_16e8 && g.V_16f8 === g.V_1708)) {
          pc = 25;
          continue;
        } // 3001
        L_BP1c6 = g.s(g.V_16f0 / 1.0); // 3002
        L_BP1ca = g.s(g.V_1700 / 1.0); // 3003
        L_BP1ce = g.s(L_BP1c6 > L_BP1ca ? L_BP1c6 : L_BP1ca); // 3004
        L_BP1d2 = g.s(g.V_16d0 / 1.0); // 3006
        L_BP1d6 = g.s(g.V_16e0 / 1.0); // 3007
        L_BP1da = g.s(L_BP1d2 < L_BP1d6 ? L_BP1d2 : L_BP1d6); // 3008
        L_BP1de = g.s(g.V_16f0 / 1.0); // 3010
        L_BP1e2 = g.s(g.V_1700 / 1.0); // 3011
        L_BP1e6 = g.s(L_BP1de > L_BP1e2 ? L_BP1de : L_BP1e2); // 3012
        L_BP1ea = g.s(g.V_16d0 / 1.0); // 3014
        L_BP1ee = g.s(g.V_16e0 / 1.0); // 3015
        L_BP1f2 = g.s(L_BP1ea > L_BP1ee ? L_BP1ea : L_BP1ee); // 3016
        if (!(L_BP1e6 <= L_BP1f2 && L_BP1ce >= L_BP1da)) {
          pc = 22;
          continue;
        } // 3018
        L_BP1f6 = g.s(g.V_16f0 / 1.0); // 3019
        L_BP1fa = g.s(g.V_1700 / 1.0); // 3020
        L_BP1fe = g.s(L_BP1f6 > L_BP1fa ? L_BP1f6 : L_BP1fa); // 3021
        g.V_0ef4 = L_BP1fe; // 3023
        L_BP202 = g.s(g.V_16d0 / 1.0); // 3024
        L_BP206 = g.s(g.V_16e0 / 1.0); // 3025
        L_BP20a = g.s(L_BP202 > L_BP206 ? L_BP202 : L_BP206); // 3026
        if (!(L_BP20a === g.V_0ef4)) {
          pc = 21;
          continue;
        } // 3028
        L_BP20e = g.s(g.V_16f0 / 1.0); // 3029
        L_BP212 = g.s(g.V_1700 / 1.0); // 3030
        L_BP216 = g.s(L_BP20e < L_BP212 ? L_BP20e : L_BP212); // 3031
        L_BP21a = g.s(g.V_16d0 / 1.0); // 3033
        L_BP21e = g.s(g.V_16e0 / 1.0); // 3034
        L_BP222 = g.s(L_BP21a < L_BP21e ? L_BP21a : L_BP21e); // 3035
        L_BP226 = g.s(L_BP216 > L_BP222 ? L_BP216 : L_BP222); // 3037
        g.V_0ef4 = L_BP226; // 3039
        pc = 21;
        continue;
      case 21:
        // L_211b3
        pc = 22;
        continue;
      case 22:
        // L_211b8
        L_BP22a = g.s(g.V_16d0 / 1.0); // 3042
        L_BP22e = g.s(g.V_16e0 / 1.0); // 3043
        L_BP232 = g.s(L_BP22a > L_BP22e ? L_BP22a : L_BP22e); // 3044
        L_BP236 = g.s(g.V_16f0 / 1.0); // 3046
        L_BP23a = g.s(g.V_1700 / 1.0); // 3047
        L_BP23e = g.s(L_BP236 < L_BP23a ? L_BP236 : L_BP23a); // 3048
        L_BP242 = g.s(g.V_16d0 / 1.0); // 3050
        L_BP246 = g.s(g.V_16e0 / 1.0); // 3051
        L_BP24a = g.s(L_BP242 > L_BP246 ? L_BP242 : L_BP246); // 3052
        L_BP24e = g.s(g.V_16f0 / 1.0); // 3054
        L_BP252 = g.s(g.V_1700 / 1.0); // 3055
        L_BP256 = g.s(L_BP24e > L_BP252 ? L_BP24e : L_BP252); // 3056
        if (!(L_BP24a <= L_BP256 && L_BP232 >= L_BP23e)) {
          pc = 24;
          continue;
        } // 3058
        L_BP25a = g.s(g.V_16d0 / 1.0); // 3059
        L_BP25e = g.s(g.V_16e0 / 1.0); // 3060
        L_BP262 = g.s(L_BP25a > L_BP25e ? L_BP25a : L_BP25e); // 3061
        g.V_0ef4 = L_BP262; // 3063
        L_BP266 = g.s(g.V_16f0 / 1.0); // 3064
        L_BP26a = g.s(g.V_1700 / 1.0); // 3065
        L_BP26e = g.s(L_BP266 > L_BP26a ? L_BP266 : L_BP26a); // 3066
        if (!(L_BP26e === g.V_0ef4)) {
          pc = 23;
          continue;
        } // 3068
        L_BP272 = g.s(g.V_16d0 / 1.0); // 3069
        L_BP276 = g.s(g.V_16e0 / 1.0); // 3070
        L_BP27a = g.s(L_BP272 < L_BP276 ? L_BP272 : L_BP276); // 3071
        L_BP27e = g.s(g.V_16f0 / 1.0); // 3073
        L_BP282 = g.s(g.V_1700 / 1.0); // 3074
        L_BP286 = g.s(L_BP27e < L_BP282 ? L_BP27e : L_BP282); // 3075
        L_BP28a = g.s(L_BP27a > L_BP286 ? L_BP27a : L_BP286); // 3077
        g.V_0ef4 = L_BP28a; // 3079
        pc = 23;
        continue;
      case 23:
        // L_213f7
        pc = 24;
        continue;
      case 24:
        // L_213fc
        pc = 32;
        continue; // 3082
      case 25:
        // L_21409
        if (!(g.V_16f8 !== g.V_1708)) {
          pc = 26;
          continue;
        } // 3084
        g.V_0ef4 =
          g.V_1700 - ((g.V_1708 - g.V_0efc) * (g.V_1700 - g.V_16f0)) / (g.V_1708 - g.V_16f8); // 3085
        pc = 27;
        continue; // 3086
      case 26:
        // L_21464
        g.V_0ef4 =
          g.V_16e0 - ((g.V_16e8 - g.V_0efc) * (g.V_16e0 - g.V_16d0)) / (g.V_16e8 - g.V_16d8); // 3088
        pc = 27;
        continue;
      case 27:
        // L_214a1
        if (!(Math.abs(g.V_16f0 - g.V_0ef4) < g.V_133a)) {
          pc = 28;
          continue;
        } // 3090
        g.V_0ef4 = g.V_16f0; // 3091
        pc = 28;
        continue;
      case 28:
        // L_214d5
        if (!(Math.abs(g.V_1700 - g.V_0ef4) < g.V_133a)) {
          pc = 29;
          continue;
        } // 3093
        g.V_0ef4 = g.V_1700; // 3094
        pc = 29;
        continue;
      case 29:
        // L_21509
        if (!(Math.abs(g.V_16d0 - g.V_0ef4) < g.V_133a)) {
          pc = 30;
          continue;
        } // 3096
        g.V_0ef4 = g.V_16d0; // 3097
        pc = 30;
        continue;
      case 30:
        // L_2153d
        if (!(Math.abs(g.V_16e0 - g.V_0ef4) < g.V_133a)) {
          pc = 31;
          continue;
        } // 3099
        g.V_0ef4 = g.V_16e0; // 3100
        pc = 31;
        continue;
      case 31:
        // L_21571
        pc = 32;
        continue;
      case 32:
        // L_21576
        pc = 33;
        continue;
      case 33:
        // L_21580
        L_BP28e = g.s(g.V_16f0 / 1.0); // 3104
        L_BP292 = g.s(g.V_1700 / 1.0); // 3105
        L_BP296 = g.s(L_BP28e > L_BP292 ? L_BP28e : L_BP292); // 3106
        L_BP29a = g.s(g.V_16f0 / 1.0); // 3108
        L_BP29e = g.s(g.V_1700 / 1.0); // 3109
        L_BP2a2 = g.s(L_BP29a < L_BP29e ? L_BP29a : L_BP29e); // 3110
        L_BP2a6 = g.s(g.V_16d0 / 1.0); // 3112
        L_BP2aa = g.s(g.V_16e0 / 1.0); // 3113
        L_BP2ae = g.s(L_BP2a6 > L_BP2aa ? L_BP2a6 : L_BP2aa); // 3114
        L_BP2b2 = g.s(g.V_16d0 / 1.0); // 3116
        L_BP2b6 = g.s(g.V_16e0 / 1.0); // 3117
        L_BP2ba = g.s(L_BP2b2 < L_BP2b6 ? L_BP2b2 : L_BP2b6); // 3118
        if (
          !(
            (g.V_16d0 !== g.V_16e0 &&
              (g.V_133a + g.V_0ef4 < L_BP2ba || g.V_0ef4 - g.V_133a > L_BP2ae)) ||
            (g.V_16f0 !== g.V_1700 &&
              (g.V_133a + g.V_0ef4 < L_BP2a2 || g.V_0ef4 - g.V_133a > L_BP296))
          )
        ) {
          pc = 34;
          continue;
        } // 3120
        pc = 35;
        continue; // 3121
      case 34:
        // L_21724
        pc = 36;
        continue; // 3123
      case 35:
        // L_21731
        g.V_0f1c = "NAO"; // 3125
        pc = 36;
        continue;
      case 36:
        // L_2174d
        return;
      default:
        throw new Error(`S_2018c: pc ${pc}`);
    }
  }
}

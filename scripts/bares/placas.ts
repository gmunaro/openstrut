// Placa retangular isótropa, delgada (Kirchhoff), carga uniforme, bordos
// apoiados ou engastados. Método da superposição (Timoshenko & Woinowsky-Krieger,
// *Theory of Plates and Shells*, 2ª ed., cap. 6): a placa toda apoiada sob a
// carga mais, em cada bordo engastado, a mesma placa apoiada sob um momento
// distribuído M(s) = Σ Ek sen(kπs/L). As soluções de Lévy dessas parcelas são
// exatas; os Ek saem de impor rotação nula em cada bordo engastado, projetada
// na mesma base de senos (sistema linear de K equações por bordo engastado).
// A única aproximação é truncar as séries de momento de bordo em K termos.
//
// Coordenadas: 0 ≤ x ≤ a, 0 ≤ y ≤ b; D = 1 e q = 1, então com a = 1 o
// deslocamento sai em q a⁴/D e os momentos em q a². Sinais: w no sentido da
// carga; Mx = −(w,xx + ν w,yy), positivo quando traciona a face oposta à carga.
// Bordos: E (x = 0), D (x = a), I (y = 0), S (y = b).
//
// Usado por gerar.ts, que escreve src/calculo/normas/nbr6118-2023/tabelasBares.ts.

export type BordoPlaca = "E" | "D" | "I" | "S";

export interface EntradaPlaca {
  a: number;
  b: number;
  nu: number;
  engastados: readonly BordoPlaca[];
  /** Termos de cada série de momento de bordo (K). */
  termos: number;
}

export interface Placa {
  /** Deslocamento e momentos fletores num ponto interno (x, y). */
  campo(x: number, y: number): { w: number; mx: number; my: number };
  /** Momento fletor normal ao bordo, na abscissa s ao longo dele (s = 0 em x = 0 ou y = 0). */
  momentoBordo(bordo: BordoPlaca, s: number): number;
}

/** Último termo da série da carga (1 = Σ qm sen(αm x), qm = 4/(mπ), m ímpar). */
const TERMOS_CARGA = 4001;
/** Termo hiperbólico desprezado quando e^(−k·distância à borda) fica abaixo disto. */
const EXP_MIN = 1e-17;

interface Levy {
  /** f, f' e f'' em t. */
  avalia(t: number): { f: number; d1: number; d2: number };
}

/**
 * Parcela de Lévy f(t), 0 ≤ t ≤ L, solução de f'''' − 2k² f'' + k⁴ f = 0 com
 * f(0) = u0, f(L) = u1, f''(0) = v0, f''(L) = v1. Com φ = f'' − k² f, vale
 * φ'' = k² φ, e f = φ1 t ch(t)/(2k) + φ0 (L−t) ch(L−t)/(2k) + c0 sh(L−t) + c1 sh(t),
 * onde sh(t) = senh(kt)/senh(kL) e ch(t) = cosh(kt)/senh(kL), calculadas com
 * exponenciais negativas para não estourar.
 */
function levy(k: number, L: number, u0: number, u1: number, v0: number, v1: number): Levy {
  const e2 = Math.exp(-2 * k * L);
  const den = 1 - e2;
  const coth = (1 + e2) / den;
  const p0 = v0 - k * k * u0;
  const p1 = v1 - k * k * u1;
  const c0 = u0 - (p0 * L * coth) / (2 * k);
  const c1 = u1 - (p1 * L * coth) / (2 * k);
  return {
    avalia(t) {
      const r = L - t;
      const a1 = Math.exp(k * (t - L));
      const a2 = Math.exp(-k * (t + L));
      const b1 = Math.exp(-k * t);
      const b2 = Math.exp(-k * (2 * L - t));
      const sht = (a1 - a2) / den;
      const cht = (a1 + a2) / den;
      const shr = (b1 - b2) / den;
      const chr = (b1 + b2) / den;
      const f = (p1 * t * cht) / (2 * k) + (p0 * r * chr) / (2 * k) + c0 * shr + c1 * sht;
      const d1 =
        (p1 * (cht + k * t * sht)) / (2 * k) -
        (p0 * (chr + k * r * shr)) / (2 * k) -
        c0 * k * chr +
        c1 * k * cht;
      const d2 = p0 * shr + p1 * sht + k * k * f;
      return { f, d1, d2 };
    },
  };
}

/** Eliminação de Gauss com pivotamento parcial (sistema denso pequeno). */
function resolveLinear(A: Float64Array[], rhs: Float64Array): Float64Array {
  const n = rhs.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    [rhs[c], rhs[piv]] = [rhs[piv]!, rhs[c]!];
    const lc = A[c]!;
    for (let r = c + 1; r < n; r++) {
      const lr = A[r]!;
      const fat = lr[c]! / lc[c]!;
      if (fat === 0) continue;
      for (let j = c; j < n; j++) lr[j]! -= fat * lc[j]!;
      rhs[r]! -= fat * rhs[c]!;
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = rhs[r]!;
    for (let j = r + 1; j < n; j++) s -= A[r]![j]! * x[j]!;
    x[r] = s / A[r]![r]!;
  }
  return x;
}

/**
 * Resolve a placa.
 *
 * w = faixa(x) + Σm sen(αm x) fm(y) + Σn sen(βn y) gn(x), αm = mπ/a, βn = nπ/b, onde
 * faixa(x) = x (a³ − 2a x² + x³)/24 é a faixa apoiada sob q = 1 (= Σ qm sen(αm x)/αm⁴).
 * fm corrige a faixa para w = 0 e leva os momentos dos bordos I e S
 * (fm(0) = fm(b) = −qm/αm⁴, fm''(0) = −MI,m, fm''(b) = −MS,m); gn leva os momentos
 * dos bordos E e D (gn''(0) = −ME,n, gn''(a) = −MD,n). Rotação nula em cada bordo
 * engastado, projetada em sen(kπs/L), dá uma equação por k. A projeção da série
 * transversal é fechada (integração por partes contra o operador de Lévy):
 * ∫0^b Fm sen(βk y) dy = [qm(1 − (−1)^k)/βk + βk(Fm''(b)(−1)^k − Fm''(0))] / (βk² + αm²)²,
 * com Fm = qm/αm⁴ + fm a componente completa (nula nas pontas).
 */
export function resolvePlaca({ a, b, nu, engastados, termos: K }: EntradaPlaca): Placa {
  const eng = new Set(engastados);
  const alfa = (m: number) => (m * Math.PI) / a;
  const beta = (n: number) => (n * Math.PI) / b;
  const qm = (m: number) => (m % 2 === 1 ? 4 / (m * Math.PI) : 0);

  const ordem = (["E", "D", "I", "S"] as const).filter((e) => eng.has(e));
  const inicio = new Map(ordem.map((e, i) => [e, i * K] as const));
  const n = ordem.length * K;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const rhs = new Float64Array(n);
  /** Soma v ao coeficiente da incógnita k (1..K) do bordo, se ele for engastado. */
  const soma = (row: Float64Array, bordo: BordoPlaca, k: number, v: number) => {
    const i = inicio.get(bordo);
    if (i !== undefined) row[i + k - 1]! += v;
  };

  for (const borda of ordem) {
    const emX = borda === "E" || borda === "D"; // borda x = const, base sen(βk y)
    const naOrigem = borda === "E" || borda === "I";
    for (let k = 1; k <= K; k++) {
      const r = inicio.get(borda)! + k - 1;
      const row = A[r]!;
      // Própria série: rotação na borda de uma placa apoiada com momento unitário
      // sen(kπs/L) num bordo (perto: na borda carregada; longe: na oposta). O bordo
      // oposto é o espelho, com a derivada trocando de sinal.
      const kk = emX ? beta(k) : alfa(k);
      const L = emX ? a : b;
      const unit = levy(kk, L, 0, 0, -1, 0);
      const perto = unit.avalia(0).d1;
      const longe = unit.avalia(L).d1;
      const [origem, fim] = emX ? (["E", "D"] as const) : (["I", "S"] as const);
      soma(row, origem, k, naOrigem ? perto : longe);
      soma(row, fim, k, naOrigem ? -longe : -perto);
      // Série transversal: Σm cm (±1)^m (2/L') ∫ Fm sen(kπs/L') ds
      const Lt = emX ? b : a;
      const [tOrigem, tFim] = emX ? (["I", "S"] as const) : (["E", "D"] as const);
      for (let m = 1; m <= K; m++) {
        const cm = emX ? alfa(m) : beta(m);
        const sinal = naOrigem ? 1 : (-1) ** m;
        const fat = (cm * sinal * (2 / Lt) * kk) / (kk * kk + cm * cm) ** 2;
        soma(row, tOrigem, m, fat);
        soma(row, tFim, m, -fat * (-1) ** k);
      }
      // Carga: rotação da placa apoiada, projetada.
      if (k % 2 === 1) {
        let s = 0;
        if (emX) {
          for (let m = 1; m <= TERMOS_CARGA; m += 2) {
            const am = alfa(m);
            s += (am * (2 / b) * qm(m) * 2) / kk / (kk * kk + am * am) ** 2;
          }
          rhs[r] = naOrigem ? -s : s;
        } else {
          const p = qm(k) / kk ** 4;
          const d1 = levy(kk, b, -p, -p, 0, 0).avalia(naOrigem ? 0 : b).d1;
          rhs[r] = -d1;
        }
      }
    }
  }

  const sol = n > 0 ? resolveLinear(A, rhs) : new Float64Array(0);
  const coef = (bordo: BordoPlaca, k: number) => {
    const i = inicio.get(bordo);
    return i === undefined ? 0 : sol[i + k - 1]!;
  };

  // Termos da série em x (fm) e em y (gn). A série em x vai até TERMOS_CARGA por
  // causa da carga; acima de K só a carga contribui.
  const fSerie: { k: number; l: Levy }[] = [];
  for (let m = 1; m <= Math.max(K, TERMOS_CARGA); m++) {
    const p = qm(m) / alfa(m) ** 4;
    const mi = m <= K ? coef("I", m) : 0;
    const ms = m <= K ? coef("S", m) : 0;
    if (p === 0 && mi === 0 && ms === 0) continue;
    fSerie.push({ k: alfa(m), l: levy(alfa(m), b, -p, -p, -mi, -ms) });
  }
  const gSerie: { k: number; l: Levy }[] = [];
  for (let m = 1; m <= K; m++) {
    const me = coef("E", m);
    const md = coef("D", m);
    if (me === 0 && md === 0) continue;
    gSerie.push({ k: beta(m), l: levy(beta(m), a, 0, 0, -me, -md) });
  }

  function campo(x: number, y: number) {
    let w = (x * (a ** 3 - 2 * a * x * x + x ** 3)) / 24;
    let wxx = -(x * (a - x)) / 2;
    let wyy = 0;
    const dy = Math.min(y, b - y);
    for (const { k, l } of fSerie) {
      if (Math.exp(-k * dy) < EXP_MIN) break;
      const s = Math.sin(k * x);
      const v = l.avalia(y);
      w += s * v.f;
      wxx -= k * k * s * v.f;
      wyy += s * v.d2;
    }
    const dx = Math.min(x, a - x);
    for (const { k, l } of gSerie) {
      if (Math.exp(-k * dx) < EXP_MIN) break;
      const s = Math.sin(k * y);
      const v = l.avalia(x);
      w += s * v.f;
      wyy -= k * k * s * v.f;
      wxx += s * v.d2;
    }
    return { w, mx: -(wxx + nu * wyy), my: -(wyy + nu * wxx) };
  }

  function momentoBordo(bordo: BordoPlaca, s: number) {
    const L = bordo === "E" || bordo === "D" ? b : a;
    let m = 0;
    for (let k = 1; k <= K; k++) m += coef(bordo, k) * Math.sin((k * Math.PI * s) / L);
    return m;
  }

  return { campo, momentoBordo };
}

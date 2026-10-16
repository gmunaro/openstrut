// Potência `^` e `SQR` do QuickBASIC 4.5 (runtime BRUN45) para o modo "Como o
// SISTRUT original": emula o x87 em precisão estendida (64 bits de mantissa,
// arredondamento ao par) e as instruções que o BRUN45 usa.
//
// Por que existe: no original, `X^2` não é `X*X`. O B$POW4/B$POW8 calcula por
// logaritmo no x87 e só arredonda na atribuição a SINGLE/DOUBLE. Em expressões com
// cancelamento, como `X − SQR(X^2 − Y)` (laje em balanço com M = 0, LAJECALC
// 0x14317), o último bit do estendido decide o resultado visível (As mínima 1,50
// em vez de "seção não passa").
//
// ---------------------------------------------------------------- decisão: modelo fixo
// O modelo é FIXO, em software, determinístico e independente da CPU; NÃO é o
// hardware. A V1 (QB64, em C) e a V2 usam o mesmo modelo, conferido pelos vetores
// em C:/tmp/v2-paridade/x87-vetores/ (decisão do dono, 2026-10-16):
//   - FYL2X: o do AMD Zen 2 (Ryzen 5 3600, a máquina do oráculo), reproduzido;
//   - F2XM1: o valor exato de 2^x − 1 arredondado ao par em 64 bits;
//   - FSQRT, FRNDINT, FSCALE, somas, produtos e divisões: IEEE ao par, exatos.
// Medição contra o oráculo desta máquina (que roda FYL2X/F2XM1 no Zen 2): a sonda
// T20 bate em 1.558 de 1.560 campos (os dois restantes vêm do F2XM1, ver
// x87.test.ts); a potência estendida bate em ~99,5 % das entradas aleatórias; nos
// casos de obra comparados até agora, não há diferença. Num Intel ou em outra
// geração AMD, o oráculo daria outros últimos bits; o modelo não muda.
//
// ---------------------------------------------------------------- algoritmo
// B$POW4/B$POW8 (docs/RETRADUCAO.md da V1, "Ponto flutuante", regra 9):
//   - NaN ou infinito em qualquer lado: erro 5; expoente 0: 1 (inclusive 0^0);
//     base 0: +0 se o expoente é positivo, erro 5 se é negativo;
//   - base negativa: o expoente tem de ser inteiro com 1 ≤ |b| < 2^64 (senão erro
//     5); a conta segue com |a| e o sinal troca no fim se o expoente é ímpar;
//   - t = FYL2X(b, |a|); |t| ≥ 32767,5: t < 0 dá +0, t > 0 dá erro 6;
//   - n = FRNDINT(t) (ao par); f = t − n (exato);
//   - p = F2XM1(|f|) + 1 (FLD1/FADDP, arredonda); f < 0: p = 1/p; n ≠ 0: FSCALE.
//   O resultado fica em estendido; o arredondamento a SINGLE/DOUBLE é o FSTP de
//   quem atribui (`paraNumero`).
// SQR (regra 10): FSQRT em linha sobre o valor estendido da pilha; raiz de
// negativo dá NaN sem erro (sonda T13: SQR(-4) = -1.#IND).
// Expressão `X − SQR(X^2 − Y)`: cada subtração e a raiz arredondam a 64 bits, e
// só o FSTP final vai para o tipo do destino (`xMenosRaizQB`).
//
// ---------------------------------------------------------------- FYL2X do Zen 2
// FYL2X(y, x) = arredonda64(y · L(x)), um único arredondamento do produto exato de
// y por um log2 interno L(x) de 68 bits. Prova (por sondagem das instruções reais,
// laboratório fora do repo): fixando x e variando y, os intervalos de y·L se
// intersectam num único ponto da grade de 68 bits; L não depende do RC. L(x),
// com cada operação arredondada ao par em 68 bits (r68):
//   x = 2^k · m, m ∈ [1, 2); se m > √2 (mantissa > 0xb504f333f9de6484): m = m/2, k + 1
//   s = r68((m − 1)/(m + 1))               divisão de verdade, corretamente arredondada
//   z = r68(s·s)
//   q = a10; q = r68(r68(q·z) + a_i), i = 9..1      (Horner, 10 coeficientes)
//   R = r68(z · r68(s·q))
//   L = r68(r68(k + r68(s·C)) + R),   C = r68(2/ln2)
// Ou seja, log2 m = (2/ln2)·atanh(s), série ímpar de grau 21 em s, sem tabela.
// C é exatamente r68(2/ln2); os a_i (`COEF`) são os do minimax do microcódigo,
// ajustados por programação linear sobre ~120 mil valores de L(x) lidos do
// hardware e por busca local nos bits finais. Contra o Zen 2: FYL2X igual em
// 199.999 de 200.000 entradas aleatórias e 99.988 de 100.000 perto de 1.
//
// F2XM1 do Zen 2 (não reproduzido; por isso o exato): respeita o RC e ignora o
// PC; o valor antes do arredondamento final nunca é exato em 64 bits; o ruído é
// ~1 arredondamento de 67-68 bits relativo ao resultado, sem tabela em [0, 0,5];
// a primeira operação é x·a, com a de mantissa ≈ 1,8431874 (a taxa de erro muda
// de degrau exatamente na mantissa 0x8ae3cc7c6d352aa0 de x, em qualquer
// expoente). Nenhum modelo de um arredondamento depois desse passo bate.
// O exato difere do Zen 2 em ~2,5 % das entradas.
//
// ---------------------------------------------------------------- implementação
// Mantissas em 3 limbs de 24 bits (`Lx`, 72 bits) com inteiros exatos em Number:
// produto, soma e arredondamento ao par sem BigInt. Divisão, raiz e F2XM1 em
// double-double (~104 bits) com teste de ambiguidade: se o valor fica a menos de
// 2^-28 da unidade do meio ulp, refaz em BigInt exato (`*Exato`). Desempenho
// (Bun 1.4, Ryzen 5 3600 com ~40 % de carga): potenciaQB ~3,5 µs (~280 mil
// chamadas/s; a versão só em BigInt levava ~27 µs), xMenosRaizQB ~3,9 µs; o log2
// interno custa ~1,5 µs e o F2XM1 ~0,7 µs.

import { ErroQB } from "./f32";
import type { ModoSistrut } from "./tipos";

/** Número finito: valor = (-1)^s · m · 2^e; m = 0n é zero (com sinal). */
export type Num = { readonly s: 0 | 1; readonly m: bigint; readonly e: number };

/** Valor da pilha do x87 em precisão estendida (finitos com mantissa de 64 bits). */
export type Estendido =
  | ({ readonly tipo: "finito" } & Num)
  | { readonly tipo: "infinito"; readonly s: 0 | 1 }
  | { readonly tipo: "nan" };

export type Destino = "single" | "double";

// ================================================================ limbs

/** Valor = (-1)^s · (a2·2^48 + a1·2^24 + a0) · 2^e; finito normalizado tem
 *  a2 ∈ [2^23, 2^24); zero tem a2 = a1 = a0 = 0. k: 0 finito, 1 infinito, 2 NaN. */
type Lx = { s: 0 | 1; e: number; a2: number; a1: number; a0: number; k: 0 | 1 | 2 };

const B = 16777216; // 2^24
const MEIO = 8388608; // 2^23
const P2 = (n: number) => 2 ** n;

const zeroL = (s: 0 | 1): Lx => ({ s, e: 0, a2: 0, a1: 0, a0: 0, k: 0 });
const infL = (s: 0 | 1): Lx => ({ s, e: 0, a2: 0, a1: 0, a0: 0, k: 1 });
const NAN_L: Lx = { s: 1, e: 0, a2: 0, a1: 0, a0: 0, k: 2 };
const negL = (x: Lx): Lx => ({ ...x, s: (x.s ^ 1) as 0 | 1 });

/** Arredonda ao par para P bits (P ≤ 72) a mantissa normalizada t2 t1 t0, com o
 *  limb de guarda g abaixo de t0 e `st` (algum bit não nulo abaixo de g). */
function fecha(
  s: 0 | 1,
  t2: number,
  t1: number,
  t0: number,
  g: number,
  st: boolean,
  e: number,
  P: number,
): Lx {
  const sh = 72 - P;
  const R = 1 << sh;
  const resto = t0 & (R - 1);
  t0 -= resto;
  const X = resto * B + g;
  const H = R * MEIO;
  if (X > H || (X === H && (st || ((t0 >>> sh) & 1) === 1))) {
    t0 += R;
    if (t0 >= B) {
      t0 -= B;
      t1++;
      if (t1 >= B) {
        t1 = 0;
        t2++;
        if (t2 >= B) {
          t2 = MEIO;
          e++;
        }
      }
    }
  }
  return { s, e, a2: t2, a1: t1, a0: t0, k: 0 };
}

const arredondaL = (x: Lx, P: number) =>
  x.k !== 0 || x.a2 === 0 ? x : fecha(x.s, x.a2, x.a1, x.a0, 0, false, x.e, P);

/** Produto exato arredondado a P bits. */
function mulL(a: Lx, b: Lx, P: number): Lx {
  const s = (a.s ^ b.s) as 0 | 1;
  if (a.a2 === 0 || b.a2 === 0) return zeroL(s);
  const c0 = a.a0 * b.a0;
  const c1 = a.a0 * b.a1 + a.a1 * b.a0;
  const c2 = a.a0 * b.a2 + a.a1 * b.a1 + a.a2 * b.a0;
  const c3 = a.a1 * b.a2 + a.a2 * b.a1;
  const c4 = a.a2 * b.a2;
  let k = Math.floor(c0 / B);
  const p0 = c0 - k * B;
  let v = c1 + k;
  k = Math.floor(v / B);
  const p1 = v - k * B;
  v = c2 + k;
  k = Math.floor(v / B);
  const p2 = v - k * B;
  v = c3 + k;
  k = Math.floor(v / B);
  const p3 = v - k * B;
  v = c4 + k;
  k = Math.floor(v / B);
  const p4 = v - k * B;
  const p5 = k;
  const e = a.e + b.e;
  if (p5 >= MEIO) return fecha(s, p5, p4, p3, p2, p1 !== 0 || p0 !== 0, e + 72, P);
  return fecha(
    s,
    (p5 << 1) | (p4 >>> 23),
    ((p4 & 0x7fffff) << 1) | (p3 >>> 23),
    ((p3 & 0x7fffff) << 1) | (p2 >>> 23),
    ((p2 & 0x7fffff) << 1) | (p1 >>> 23),
    (p1 & 0x7fffff) !== 0 || p0 !== 0,
    e + 71,
    P,
  );
}

// saída de `desloca`: limbs nos pesos de a2..a0 de quem chama, guarda e sticky
let D0 = 0,
  D1 = 0,
  D2 = 0,
  DG = 0,
  DS = false;
/** Desloca a mantissa de x d bits à direita para D0 D1 D2 (pesos de a2 a1 a0), DG
 *  (o limb abaixo) e DS (algum bit não nulo abaixo de DG). */
function desloca(x: Lx, d: number) {
  const a2 = x.a2,
    a1 = x.a1,
    a0 = x.a0;
  if (d >= 96) {
    D0 = D1 = D2 = DG = 0;
    DS = a2 !== 0 || a1 !== 0 || a0 !== 0;
    return;
  }
  const q = (d / 24) | 0;
  const r = d - q * 24;
  // limbs depois do deslocamento por limbs
  let z0 = 0,
    z1 = 0,
    z2 = 0,
    z3 = 0,
    z4 = 0,
    z5 = 0;
  switch (q) {
    case 0:
      z0 = a2;
      z1 = a1;
      z2 = a0;
      break;
    case 1:
      z1 = a2;
      z2 = a1;
      z3 = a0;
      break;
    case 2:
      z2 = a2;
      z3 = a1;
      z4 = a0;
      break;
    default:
      z3 = a2;
      z4 = a1;
      z5 = a0;
  }
  if (r === 0) {
    D0 = z0;
    D1 = z1;
    D2 = z2;
    DG = z3;
    DS = z4 !== 0 || z5 !== 0;
    return;
  }
  const m = (1 << r) - 1,
    k = 24 - r;
  D0 = z0 >>> r;
  D1 = (z1 >>> r) | ((z0 & m) << k);
  D2 = (z2 >>> r) | ((z1 & m) << k);
  DG = (z3 >>> r) | ((z2 & m) << k);
  DS = (z3 & m) !== 0 || z4 !== 0 || z5 !== 0;
}

/** |a| ≥ |b| (finitos normalizados). */
function maiorOuIgual(a: Lx, b: Lx) {
  if (b.a2 === 0) return true;
  if (a.a2 === 0) return false;
  if (a.e !== b.e) return a.e > b.e;
  if (a.a2 !== b.a2) return a.a2 > b.a2;
  if (a.a1 !== b.a1) return a.a1 > b.a1;
  return a.a0 >= b.a0;
}

/** Soma exata arredondada a P bits; +0 quando a soma exata é zero (RN). */
function somaL(a: Lx, b: Lx, P: number): Lx {
  if (a.a2 === 0 && b.a2 === 0) return zeroL((a.s & b.s) as 0 | 1);
  if (b.a2 === 0) return arredondaL(a, P);
  if (a.a2 === 0) return arredondaL(b, P);
  const ab = maiorOuIgual(a, b);
  const g = ab ? a : b,
    p = ab ? b : a;
  desloca(p, g.e - p.e);
  let s0 = D0,
    s1 = D1,
    s2 = D2,
    sg = DG;
  const st = DS;
  if (g.s === p.s) {
    let t0 = g.a0 + s2,
      t1 = g.a1 + s1,
      t2 = g.a2 + s0;
    if (t0 >= B) {
      t0 -= B;
      t1++;
    }
    if (t1 >= B) {
      t1 -= B;
      t2++;
    }
    if (t2 >= B) {
      // carry: desloca 1 bit à direita
      const stx = st || (sg & 1) === 1;
      sg = (sg >>> 1) | ((t0 & 1) << 23);
      t0 = (t0 >>> 1) | ((t1 & 1) << 23);
      t1 = (t1 >>> 1) | ((t2 & 1) << 23);
      t2 >>>= 1;
      return fecha(g.s, t2, t1, t0, sg, stx, g.e + 1, P);
    }
    return fecha(g.s, t2, t1, t0, sg, st, g.e, P);
  }
  // subtração: g − p (− ε se sticky)
  let r3 = -sg - (st ? 1 : 0),
    r2 = g.a0 - s2,
    r1 = g.a1 - s1,
    r0 = g.a2 - s0;
  if (r3 < 0) {
    r3 += B;
    r2--;
  }
  if (r2 < 0) {
    r2 += B;
    r1--;
  }
  if (r1 < 0) {
    r1 += B;
    r0--;
  }
  if (r0 === 0 && r1 === 0 && r2 === 0 && r3 === 0) return zeroL(0);
  // normaliza à esquerda
  let e = g.e;
  while (r0 === 0) {
    r0 = r1;
    r1 = r2;
    r2 = r3;
    r3 = 0;
    e -= 24;
  }
  const z = Math.clz32(r0) - 8;
  if (z > 0) {
    const k = 24 - z;
    r0 = ((r0 << z) & 0xffffff) | (r1 >>> k);
    r1 = ((r1 << z) & 0xffffff) | (r2 >>> k);
    r2 = ((r2 << z) & 0xffffff) | (r3 >>> k);
    r3 = (r3 << z) & 0xffffff;
    e -= z;
  }
  s0 = r0;
  s1 = r1;
  s2 = r2;
  return fecha(g.s, s0, s1, s2, r3, st, e, P);
}

/** Inteiro (|n| < 2^53) em Lx. */
function deInteiro(n: number): Lx {
  if (n === 0) return zeroL(0);
  return deNumero(n);
}

const dvBuf = new DataView(new ArrayBuffer(8));

/** double (finito ou não) em Lx, exato (FLD). */
function deNumero(v: number): Lx {
  if (Number.isNaN(v)) return NAN_L;
  if (!Number.isFinite(v)) return infL(v < 0 ? 1 : 0);
  if (v === 0) return zeroL(Object.is(v, -0) ? 1 : 0);
  dvBuf.setFloat64(0, v);
  const hi = dvBuf.getUint32(0),
    lo = dvBuf.getUint32(4);
  const s = (hi >>> 31) as 0 | 1;
  const ex = (hi >>> 20) & 0x7ff;
  const M = (ex ? 4503599627370496 : 0) + (hi & 0xfffff) * 4294967296 + lo;
  const e0 = ex ? ex - 1075 : -1074;
  const topo = Math.floor(Math.log2(M));
  let k = 71 - topo;
  let M72 = M * P2(k);
  if (M72 >= P2(72)) {
    M72 /= 2;
    k--;
  } else if (M72 < P2(71)) {
    M72 *= 2;
    k++;
  }
  const a2 = Math.floor(M72 / 281474976710656);
  const r = M72 - a2 * 281474976710656;
  const a1 = Math.floor(r / B);
  return { s, e: e0 - k, a2, a1, a0: r - a1 * B, k: 0 };
}

/** FSTP para SINGLE/DOUBLE: ao par direto do estendido, com subnormais e infinito. */
function paraNumeroL(x: Lx, destino: Destino): number {
  if (x.k === 2) return Number.NaN;
  if (x.k === 1) return x.s ? -Infinity : Infinity;
  if (x.a2 === 0) return x.s ? -0 : 0;
  const [p, emin, emax] = destino === "double" ? [53, -1022, 1023] : [24, -126, 127];
  const topo = x.e + 71;
  const quantum = Math.max(topo - p + 1, emin - p + 1);
  const k = quantum - x.e; // bits descartados, ≥ 72 − p
  const A = x.a2 * B + x.a1;
  let N: number;
  if (k < 24) {
    const R = P2(k);
    const resto = x.a0 % R;
    const base = x.a0 - resto;
    const meio = R / 2;
    const sobe = resto > meio || (resto === meio && (base / R) % 2 === 1);
    N = A * P2(24 - k) + base / R + (sobe ? 1 : 0);
  } else if (k > 73) {
    N = 0;
  } else if (k >= 72) {
    // M < 2^72: só a metade inferior de 2^k; k = 72 empata em M = 2^71
    N = k === 72 && (A > MEIO * B || (A === MEIO * B && x.a0 > 0)) ? 1 : 0;
  } else {
    const U = P2(k - 24);
    const resto = A % U;
    const base = A - resto;
    let sobe: boolean;
    if (U === 1) sobe = x.a0 > MEIO || (x.a0 === MEIO && A % 2 === 1);
    else {
      const meio = U / 2;
      sobe = resto > meio || (resto === meio && (x.a0 > 0 || (base / U) % 2 === 1));
    }
    N = base / U + (sobe ? 1 : 0);
  }
  if (N === 0) return x.s ? -0 : 0;
  if (N >= P2(emax + 1 - quantum)) return x.s ? -Infinity : Infinity;
  const v = N * P2(quantum);
  return x.s ? -v : v;
}

/** Estendido: estouro vira infinito; abaixo do menor normal (2^-16382), zero (o x87
 *  daria um denormal; para SINGLE/DOUBLE e somas com normais o efeito é o mesmo). */
function estendeL(x: Lx): Lx {
  if (x.k !== 0 || x.a2 === 0) return x;
  const r = arredondaL(x, 64);
  const topo = r.e + 71;
  if (topo > 16383) return infL(r.s);
  if (topo < -16382) return zeroL(r.s);
  return r;
}

// ---- Lx ↔ Num (BigInt), só nas bordas e nos recursos exatos

function paraNum(x: Lx): Num {
  const m = (BigInt(x.a2) << 48n) | (BigInt(x.a1) << 24n) | BigInt(x.a0);
  return { s: x.s, m, e: x.e };
}

function deNum(n: Num): Lx {
  if (n.m === 0n) return zeroL(n.s);
  const b = bits(n.m);
  const m = b <= 72 ? n.m << BigInt(72 - b) : n.m >> BigInt(b - 72); // só valores de até 72 bits
  const e = n.e + (b - 72);
  return {
    s: n.s,
    e,
    a2: Number(m >> 48n),
    a1: Number((m >> 24n) & 0xffffffn),
    a0: Number(m & 0xffffffn),
    k: 0,
  };
}

function deEstendido(x: Estendido): Lx {
  if (x.tipo === "nan") return NAN_L;
  if (x.tipo === "infinito") return infL(x.s);
  return deNum(x);
}

function paraEstendido(x: Lx): Estendido {
  if (x.k === 2) return { tipo: "nan" };
  if (x.k === 1) return { tipo: "infinito", s: x.s };
  if (x.a2 === 0) return { tipo: "finito", s: x.s, m: 0n, e: 0 };
  const n = paraNum(x); // 64 bits: os 8 de baixo são zero
  return { tipo: "finito", s: n.s, m: n.m >> 8n, e: n.e + 8 };
}

// ================================================================ double-double

let H = 0,
  L = 0; // resultado das operações dd
const SPLIT = 134217729;
function twoSum(a: number, b: number) {
  const s = a + b;
  const bb = s - a;
  H = s;
  L = a - (s - bb) + (b - bb);
}
function twoProd(a: number, b: number) {
  const p = a * b;
  const t = SPLIT * a;
  const ah = t - (t - a),
    al = a - ah;
  const u = SPLIT * b;
  const bh = u - (u - b),
    bl = b - bh;
  H = p;
  L = ah * bh - p + ah * bl + al * bh + al * bl;
}
function ddMul(ah: number, al: number, bh: number, bl: number) {
  twoProd(ah, bh);
  const p = H;
  const e = L + ah * bl + al * bh;
  twoSum(p, e);
}
function ddAdd(ah: number, al: number, bh: number, bl: number) {
  twoSum(ah, bh);
  const s = H,
    e = L;
  twoSum(al, bl);
  const t = H,
    f = L;
  twoSum(s, e + t);
  twoSum(H, L + f);
}
/** a / b em dd (três passos de correção). */
function ddDiv(ah: number, al: number, bh: number, bl: number) {
  const q1 = ah / bh;
  ddMul(bh, bl, q1, 0);
  ddAdd(ah, al, -H, -L);
  const rh = H,
    rl = L;
  const q2 = rh / bh;
  ddMul(bh, bl, q2, 0);
  ddAdd(rh, rl, -H, -L);
  const q3 = H / bh;
  twoSum(q1, q2);
  ddAdd(H, L, q3, 0);
}

/** Lx finito em dd (mantissa escalada para [1, 2)); devolve o expoente. */
function paraDD(x: Lx) {
  const hi = (x.a2 * B + x.a1) * P2(-47); // a2·2^24+a1 < 2^48 → [1, 2)
  twoSum(hi, x.a0 * P2(-71));
  return x.e + 71;
}

/** Arredonda o dd positivo (H, L)·2^ex a P bits e devolve Lx, ou null se ambíguo. */
function ddParaL(s: 0 | 1, hi: number, lo: number, ex: number, P: number): Lx | null {
  // expoente do valor
  let E = Math.floor(Math.log2(hi));
  if (P2(E) > hi) E--;
  else if (P2(E + 1) <= hi) E++;
  if (hi === P2(E) && lo < 0) E--;
  const u = P2(E - P + 1);
  const kq = lo / u;
  const n = Math.floor(kq);
  const f = kq - n;
  if (Math.abs(f - 0.5) < 2 ** -28) return null;
  twoSum(hi, (n + (f > 0.5 ? 1 : 0)) * u); // exato, na grade de P bits
  let rh = H,
    rl = L;
  let E2 = Math.floor(Math.log2(rh));
  if (P2(E2) > rh) E2--;
  else if (P2(E2 + 1) <= rh) E2++;
  if (rh === P2(E2) && rl < 0) E2--;
  rh *= P2(71 - E2);
  rl *= P2(71 - E2);
  // rh: inteiro < 2^72 (≤ 53 bits significativos); rl: inteiro pequeno com sinal
  let a2 = Math.floor(rh / 281474976710656);
  const r = rh - a2 * 281474976710656;
  let a1 = Math.floor(r / B);
  let a0 = r - a1 * B + rl;
  while (a0 < 0) {
    a0 += B;
    a1--;
  }
  while (a0 >= B) {
    a0 -= B;
    a1++;
  }
  while (a1 < 0) {
    a1 += B;
    a2--;
  }
  while (a1 >= B) {
    a1 -= B;
    a2++;
  }
  return { s, e: E2 - 71 + ex, a2, a1, a0, k: 0 };
}

// ---- divisão e raiz: dd com recurso exato

function divL(a: Lx, b: Lx, P: number): Lx {
  const s = (a.s ^ b.s) as 0 | 1;
  if (a.a2 === 0) return zeroL(s);
  const ea = paraDD(a);
  const ah = H,
    al = L;
  const eb = paraDD(b);
  ddDiv(ah, al, H, L);
  const r = ddParaL(s, H, L, ea - eb, P);
  return r ?? deNum(divExato(paraNum(a), paraNum(b), P));
}

function raizL(x: Lx): Lx {
  if (x.k === 2) return NAN_L;
  if (x.k === 1) return x.s ? NAN_L : x;
  if (x.a2 === 0) return x;
  if (x.s) return NAN_L;
  let ex = paraDD(x); // x = (H + L)·2^ex, H ∈ [1, 2)
  let hi = H,
    lo = L;
  if (ex % 2 !== 0) {
    hi *= 2;
    lo *= 2;
    ex--;
  }
  const r0 = Math.sqrt(hi);
  twoProd(r0, r0);
  const d = hi - H - L + lo; // x − r0² (o erro de arredondamento fica em ~2^-104)
  const r1 = d / (2 * r0);
  twoSum(r0, r1);
  const r = ddParaL(0, H, L, ex / 2, 64);
  return r ?? deNum(raizExata(paraNum(x), 64));
}

// ================================================================ BigInt exato (recursos)

/** Quantidade de bits de n (n ≥ 0). */
function bits(n: bigint) {
  if (n === 0n) return 0;
  const h = n.toString(16);
  return (h.length - 1) * 4 + (32 - Math.clz32(Number.parseInt(h[0]!, 16)));
}

/** Arredonda ao par o valor exato n·2^e (n ≥ 0) para `prec` bits de mantissa.
 *  `sticky`: o valor exato fica acima de n por menos que o último bit de n
 *  (resto da divisão ou da raiz); só desempata. Com n de até `prec` bits o
 *  resultado é n. */
function arredonda(s: 0 | 1, n: bigint, e: number, prec: number, sticky = false): Num {
  if (n === 0n) return { s, m: 0n, e: 0 };
  const b = bits(n);
  if (b <= prec) return { s, m: n << BigInt(prec - b), e: e - (prec - b) };
  const sh = BigInt(b - prec);
  let m = n >> sh;
  const resto = n & ((1n << sh) - 1n);
  const meio = 1n << (sh - 1n);
  if (resto > meio || (resto === meio && (sticky || (m & 1n) === 1n))) m++;
  let ex = e + Number(sh);
  if (m >> BigInt(prec) !== 0n) {
    m >>= 1n;
    ex++;
  }
  return { s, m, e: ex };
}

function divExato(a: Num, b: Num, prec: number) {
  const g = BigInt(prec + 2 + Math.max(0, bits(b.m) - bits(a.m)));
  const n = a.m << g;
  return arredonda((a.s ^ b.s) as 0 | 1, n / b.m, a.e - Number(g) - b.e, prec, n % b.m !== 0n);
}

function raizExata(a: Num, prec: number) {
  let m = a.m;
  let e = a.e;
  const folga = 2 * prec + 4 - bits(m);
  const f = folga + ((e - folga) & 1);
  m <<= BigInt(f);
  e -= f;
  let r = BigInt(Math.floor(Math.sqrt(Number(m))));
  for (;;) {
    const n = (r + m / r) >> 1n;
    if (n >= r && n - r <= 1n) break;
    r = n;
  }
  while (r * r > m) r--;
  while ((r + 1n) * (r + 1n) <= m) r++;
  return arredonda(0, r, e / 2, prec, r * r !== m);
}

/** ln 2 com 1024 bits (série atanh(1/3)). */
const LN2_BITS = 1024;
const LN2: bigint = (() => {
  const p = BigInt(LN2_BITS + 16);
  let t = (1n << p) / 3n;
  let soma = t;
  for (let k = 3n; t !== 0n; k += 2n) {
    t /= 9n;
    soma += t / k;
  }
  return (2n * soma) >> 16n;
})();

/** 2^x − 1 exato arredondado ao par em 64 bits (|x| ≤ 1), por série em BigInt. */
function f2xm1Exato(x: Num): Num {
  if (x.m === 0n) return x;
  for (let w = 140; w <= LN2_BITS - 64; w *= 2) {
    const S = w + Math.max(0, -(x.e + 64));
    const X = x.m << BigInt(S + x.e);
    let W = (X * LN2) >> BigInt(LN2_BITS);
    if (x.s) W = -W;
    let t = W;
    let v = W;
    let termos = 1;
    for (let k = 2n; t !== 0n; k++) {
      t = ((t * W) >> BigInt(S)) / k;
      v += t;
      termos++;
    }
    const s = v < 0n ? 1 : 0;
    const a = s ? -v : v;
    const sh = BigInt(bits(a) - 64);
    const resto = a & ((1n << sh) - 1n);
    const meio = 1n << (sh - 1n);
    const d = resto > meio ? resto - meio : meio - resto;
    if (d > BigInt(2 * termos + 4)) return arredonda(s, a, -S, 64);
  }
  // inalcançável na prática: 2^x − 1 é irracional para x ≠ 0 diádico, então não há
  // empate exato; ficar a menos de 2^-890 do meio ulp em 560 bits não é um erro QB
  throw new Error("F2XM1: valor a menos de 2^-890 do meio ulp (inalcançável)");
}

// ================================================================ instruções do modelo

/** Constante BigInt de 68 bits em Lx. */
const k68 = (m: bigint, e: number) => deNum({ s: 0, m, e });

/** C = r68(2/ln2): coeficiente linear da série atanh do log2 interno do Zen 2. */
const C68 = k68(0xb8aa3b295c17f0bbcn, -66);

/** Coeficientes a1..a10 do polinômio q(z) do log2 interno do Zen 2 (68 bits);
 *  a_i ≈ (2/ln2)/(2i + 1), com os desvios do minimax do microcódigo. */
const COEF: readonly Lx[] = [
  k68(0xf6384ee1d01feb564n, -68),
  k68(0x93bb62877ce08b8ean, -68),
  k68(0xd30bb153d63406bbfn, -69),
  k68(0xa42589ec186c86d13n, -69),
  k68(0x864d42456b2ab3a5dn, -69),
  k68(0xe347ab5994498e0b8n, -70),
  k68(0xc4fa08aa62a7ec09bn, -70),
  k68(0xadc9d22ad49452b54n, -70),
  k68(0x9b354f1dc588dd58dn, -70),
  k68(0x9a234407e917b3a77n, -70),
];

const UM = deNumero(1);
const MENOS_UM = deNumero(-1);
const LIMITE_T = deNumero(32767.5);
/** Mantissa de √2 em 64 bits (0xb504f333f9de6484) nos limbs de 72 bits. */
const RAIZ2 = k68(0xb504f333f9de6484n, -63);

/** log2 interno de 68 bits do FYL2X do Zen 2, para x > 0 (ver o topo do arquivo). */
function log2Interno(x: Lx): Lx {
  let k = x.e + 71;
  let m: Lx = { ...x, s: 0, e: -71 };
  if (
    x.a2 > RAIZ2.a2 ||
    (x.a2 === RAIZ2.a2 && (x.a1 > RAIZ2.a1 || (x.a1 === RAIZ2.a1 && x.a0 > RAIZ2.a0)))
  ) {
    m = { ...m, e: -72 };
    k++;
  }
  const K = deInteiro(k);
  const s = divL(somaL(m, MENOS_UM, 72), somaL(m, UM, 72), 68);
  if (s.a2 === 0) return K;
  const z = mulL(s, s, 68);
  let q = COEF[COEF.length - 1]!;
  for (let i = COEF.length - 2; i >= 0; i--) q = somaL(mulL(q, z, 68), COEF[i]!, 68);
  const R = mulL(z, mulL(s, q, 68), 68);
  return somaL(somaL(K, mulL(s, C68, 68), 68), R, 68);
}

const fyl2xL = (y: Lx, x: Lx) => mulL(y, log2Interno(x), 64);

// 1/k! em dd, k = 0..29, para a série de expm1
const FAT: number[] = [];
{
  let h = 1,
    l = 0;
  for (let k = 0; k < 30; k++) {
    if (k > 0) {
      ddDiv(h, l, k, 0);
      h = H;
      l = L;
    }
    FAT.push(h, l);
  }
}
// ln 2 em dd
const LN2H = 0.6931471805599453;
const LN2L = 2.3190468138462996e-17;

/** F2XM1 do modelo: 2^x − 1 exato arredondado ao par em 64 bits (|x| ≤ 1). */
function f2xm1L(x: Lx): Lx {
  if (x.a2 === 0) return x;
  const ex = paraDD(x); // x = (H + L)·2^ex, H ∈ [1, 2)
  ddMul(H, L, LN2H, LN2L); // wS = |x|·ln2 escalado
  const wh = H,
    wl = L;
  // w = wS·2^ex (|w| ≤ ln 2); F = expm1(w)/w = Σ w^(k-1)/k!, k = 1..n
  const sg = x.s ? -1 : 1;
  const w2h = sg * wh * P2(ex),
    w2l = sg * wl * P2(ex);
  // termos até w^(n-1)/n!: o primeiro desprezado fica abaixo de 2^-110
  const aw = Math.abs(w2h);
  const n = aw < 2 ** -30 ? 4 : aw < 2 ** -10 ? 12 : aw <= 0.35 ? 24 : 28;
  let fh = FAT[2 * n]!,
    fl = FAT[2 * n + 1]!;
  for (let k = n - 1; k >= 1; k--) {
    ddMul(fh, fl, w2h, w2l);
    ddAdd(H, L, FAT[2 * k]!, FAT[2 * k + 1]!);
    fh = H;
    fl = L;
  }
  ddMul(wh, wl, fh, fl); // |resultado| = wS·F·2^ex (F > 0)
  const r = ddParaL(x.s, H, L, ex, 64);
  return r ?? deNum(f2xm1Exato(paraNum(x)));
}

/** FYL2X do modelo (Zen 2), modo ao par: y · log2(x), x > 0 finito. Para os testes. */
export function fyl2x(y: Num, x: Num): Num {
  const r = fyl2xL(deNum(y), deNum(x));
  return r.a2 === 0 ? { s: r.s, m: 0n, e: 0 } : paraEstendidoNum(r);
}

/** F2XM1 do modelo: valor exato arredondado ao par (|x| ≤ 1). Para os testes. */
export function f2xm1(x: Num): Num {
  const r = f2xm1L(deNum(x));
  return r.a2 === 0 ? { s: r.s, m: 0n, e: 0 } : paraEstendidoNum(r);
}

function paraEstendidoNum(x: Lx): Num {
  const n = paraNum(x);
  return { s: n.s, m: n.m >> 8n, e: n.e + 8 };
}

// ================================================================ potência

const erroFuncao = (msg: string) => new ErroQB(5, `Illegal function call: ${msg}`);

/** FRNDINT ao par de t (|t| < 2^15): o inteiro como Number. */
function frndintL(t: Lx): number {
  if (t.a2 === 0) return 0;
  desloca(t, -t.e);
  const n = D2; // parte inteira (≤ 15 bits)
  const sobe = DG > MEIO || (DG === MEIO && (DS || n % 2 === 1));
  const r = n + (sobe ? 1 : 0);
  return t.s ? -r : r;
}

function potenciaL(a: Lx, b: Lx): Lx {
  if (a.k !== 0 || b.k !== 0) throw erroFuncao("NaN ou infinito na potência");
  if (b.a2 === 0) return UM;
  if (a.a2 === 0) {
    if (b.s) throw erroFuncao("0 elevado a expoente negativo");
    return zeroL(0);
  }
  let impar = false;
  if (a.s) {
    // a rotina confere os bits da mantissa do expoente (DS:0B2A)
    const topo = b.e + 71;
    if (topo < 0 || topo >= 64) throw erroFuncao("base negativa: expoente fora de 1 ≤ |b| < 2^64");
    desloca(b, -b.e); // b.e < 0 sempre aqui (topo < 64 ≤ 71)
    if (DG !== 0 || DS) throw erroFuncao("base negativa com expoente não inteiro");
    impar = D2 % 2 === 1;
  }
  const t = fyl2xL(b, { ...a, s: 0 });
  // |t| ≥ 32767,5 (DS:0B16): t < 0 dá +0, t > 0 dá erro 6
  if (maiorOuIgual(t, LIMITE_T)) {
    if (t.s) return zeroL(0);
    throw new ErroQB(6, "Overflow na potência");
  }
  const n = frndintL(t);
  const f = somaL(t, deInteiro(-n), 64); // exato
  let p = somaL(f2xm1L({ ...f, s: 0 }), UM, 64);
  if (f.s && f.a2 !== 0) p = divL(UM, p, 64);
  return estendeL({ ...p, s: impar ? 1 : 0, e: p.e + n });
}

// ================================================================ API

/** Valor JavaScript (SINGLE ou DOUBLE do original) no estendido, sem perda (FLD). */
export function estendido(v: number): Estendido {
  return paraEstendido(deNumero(v));
}

/** FSTP para SINGLE ou DOUBLE: arredonda ao par direto do estendido (sem passar
 *  por double no caso SINGLE), com subnormais; estouro vira infinito, sem erro
 *  (sonda T13: 10^400 em DOUBLE = 1.#INF). */
export function paraNumero(x: Estendido, destino: Destino): number {
  return paraNumeroL(deEstendido(x), destino);
}

function somaEsp(a: Lx, b: Lx): Lx {
  if (a.k === 2 || b.k === 2) return NAN_L;
  if (a.k === 1 || b.k === 1) {
    if (a.k === 1 && b.k === 1) return a.s === b.s ? a : NAN_L;
    return a.k === 1 ? a : b;
  }
  return estendeL(somaL(a, b, 64));
}

/** a + b no x87 (FADD, 64 bits, ao par). */
export function somaX(a: Estendido, b: Estendido): Estendido {
  return paraEstendido(somaEsp(deEstendido(a), deEstendido(b)));
}

/** a − b no x87 (FSUB). */
export function subX(a: Estendido, b: Estendido): Estendido {
  const B_ = deEstendido(b);
  return paraEstendido(somaEsp(deEstendido(a), B_.k === 2 ? B_ : negL(B_)));
}

/** SQR(x) do original: FSQRT sobre o valor estendido, corretamente arredondado.
 *  Negativo dá NaN sem erro (sonda T13: SQR(-4) = -1.#IND); SQR(-0) = -0. */
export function raizQB(x: Estendido): Estendido {
  return paraEstendido(raizL(deEstendido(x)));
}

/** `a ^ b` como o B$POW4/B$POW8 do BRUN45, com o resultado em estendido (antes do
 *  FSTP). Lança ErroQB 5 (domínio) ou 6 (estouro). */
export function potenciaX(a: Estendido, b: Estendido): Estendido {
  return paraEstendido(potenciaL(deEstendido(a), deEstendido(b)));
}

/** `a ^ b` atribuído a uma variável SINGLE ou DOUBLE do original. */
export function potenciaQB(a: number, b: number, destino: Destino): number {
  return paraNumeroL(potenciaL(deNumero(a), deNumero(b)), destino);
}

const DOIS = deNumero(2);

/** `x − SQR(x ^ 2 − y)` com a sequência de arredondamentos do original: potência e
 *  subtrações em estendido, FSQRT no estendido e um só FSTP no destino. Com y = 0
 *  é o teste da laje em balanço (LAJECALC 0x14317). */
export function xMenosRaizQB(x: number, y: number, destino: Destino): number {
  const X = deNumero(x);
  const Y = deNumero(y);
  const r = raizL(somaEsp(potenciaL(X, DOIS), Y.k === 2 ? Y : negL(Y)));
  return paraNumeroL(somaEsp(X, r.k === 2 ? r : negL(r)), destino);
}

/** a · b no x87 (FMUL, 64 bits, ao par). */
export function mulX(a: Estendido, b: Estendido): Estendido {
  const A = deEstendido(a),
    B_ = deEstendido(b);
  if (A.k === 2 || B_.k === 2) return { tipo: "nan" };
  const s = (A.s ^ B_.s) as 0 | 1;
  if (A.k === 1 || B_.k === 1) return A.a2 === 0 && A.k === 0 ? { tipo: "nan" } : B_.a2 === 0 && B_.k === 0 ? { tipo: "nan" } : { tipo: "infinito", s };
  return paraEstendido(estendeL(mulL(A, B_, 64)));
}

/** a / b no x87 (FDIV, 64 bits, ao par). Divisão por zero dá infinito (ZM mascarada;
 *  sonda T17: 1/0 = 1.#INF) e 0/0 dá NaN. */
export function divX(a: Estendido, b: Estendido): Estendido {
  const A = deEstendido(a),
    B_ = deEstendido(b);
  if (A.k === 2 || B_.k === 2) return { tipo: "nan" };
  const s = (A.s ^ B_.s) as 0 | 1;
  if (A.k === 1) return B_.k === 1 ? { tipo: "nan" } : { tipo: "infinito", s };
  if (B_.k === 1) return paraEstendido(zeroL(s));
  if (B_.a2 === 0) return A.a2 === 0 ? { tipo: "nan" } : { tipo: "infinito", s };
  return paraEstendido(estendeL(divL(A, B_, 64)));
}

/** Compara a e b no estendido, como o FCOMP: −1, 0 ou 1; NaN dá NaN. */
export function comparaX(a: Estendido, b: Estendido): number {
  if (a.tipo === "nan" || b.tipo === "nan") return Number.NaN;
  const d = subX(a, b);
  if (d.tipo === "infinito") return d.s ? -1 : 1;
  if (d.tipo === "nan") return 0; // ∞ − ∞ do mesmo sinal
  return d.m === 0n ? 0 : d.s ? -1 : 1;
}

/** `a ^ b` do modo, para os portes: no original, o B$POW do QB4.5 (o estendido
 *  arredondado a DOUBLE para seguir a expressão em float64, ou a SINGLE quando a
 *  potência é a expressão inteira gravada numa variável `!`); no corrigido, `**`.
 *  Uso: `const pot = potencia(modo)` e `pot(a, b)`. */
export function potencia(modo: ModoSistrut, destino: Destino = "double") {
  if (modo === "corrigido") return (a: number, b: number) => a ** b;
  return (a: number, b: number) => paraNumeroL(potenciaL(deNumero(a), deNumero(b)), destino);
}

/** `SQR(x)` do modo, para os portes: no original, o FSQRT do x87 (negativo dá NaN,
 *  sem erro), arredondado a DOUBLE ou, se é a expressão inteira gravada em `!`, a
 *  SINGLE; no corrigido, `Math.sqrt`. */
export function raiz(modo: ModoSistrut, destino: Destino = "double") {
  if (modo === "corrigido") return Math.sqrt;
  return (x: number) => paraNumeroL(raizL(deNumero(x)), destino);
}

// Potência `^` e `SQR` do QuickBASIC 4.5 (runtime BRUN45) bit a bit, para o modo
// "Como o SISTRUT original". Emula em BigInt o x87 em precisão estendida (64 bits
// de mantissa, arredondamento ao par) e as instruções que o BRUN45 usa.
//
// Por que existe: no original, `X^2` não é `X*X`. O B$POW4/B$POW8 calcula por
// logaritmo no x87 e só arredonda na atribuição a SINGLE/DOUBLE. Em expressões com
// cancelamento, como `X − SQR(X^2 − Y)` (laje em balanço com M = 0, LAJECALC
// 0x14317), o último bit do estendido decide o resultado visível (As mínima 1,50
// em vez de "seção não passa").
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
//   quem atribui (`paraNumero`). Cada operação arredonda a 64 bits (palavra de
//   controle 1332h/13xxh).
// SQR (regra 10): FSQRT em linha sobre o valor estendido da pilha; raiz de
// negativo dá NaN sem erro (sonda T13: SQR(-4) = -1.#IND).
// Expressão `X − SQR(X^2 − Y)`: cada subtração e a raiz arredondam a 64 bits, e
// só o FSTP final vai para o tipo do destino (`xMenosRaizQB`).
//
// ---------------------------------------------------------------- o x87 do oráculo
// O oráculo (DOSBox-X com núcleo de FPU x86) executa FYL2X e F2XM1 no processador
// da máquina, um AMD Ryzen 5 3600 (Zen 2). As duas instruções NÃO são
// corretamente arredondadas: medidas contra o valor exato arredondado ao par,
// FYL2X erra 1 ulp em 2,2 % dos casos (3,3 % perto de x = 1) e F2XM1 em 2,5 %.
// FSQRT, FRNDINT e FSCALE são exatos. O que segue vale SÓ para o Zen 2 (Intel e
// outras gerações AMD dão outros últimos bits). Descoberto por sondagem das
// instruções reais desta máquina (laboratório fora do repo, harness em C com asm).
//
// FYL2X(y, x) no Zen 2 = arredonda64(y · L(x)), um único arredondamento (no modo
// RC corrente) do produto exato de y por um log2 interno L(x) de 68 bits. Prova:
// fixando x e variando y, os intervalos de y·L se intersectam num único ponto da
// grade de 68 bits; L não depende do RC. L(x) é calculado assim, com cada
// operação arredondada ao par em 68 bits (r68):
//   x = 2^k · m, m ∈ [1, 2); se m > √2 (mantissa > 0xb504f333f9de6484): m = m/2, k + 1
//   s = r68((m − 1)/(m + 1))               divisão de verdade, corretamente arredondada
//   z = r68(s·s)
//   q = a10; q = r68(r68(q·z) + a_i), i = 9..1      (Horner, 10 coeficientes)
//   R = r68(z · r68(s·q))
//   L = r68(r68(k + r68(s·C)) + R),   C = r68(2/ln2)
// Ou seja, log2 m = (2/ln2)·atanh(s), série ímpar de grau 21 em s, sem tabela.
// C e os a_i estão em `C68` e `COEF`. C é exatamente r68(2/ln2); os a_i são
// ajustes do minimax do microcódigo, obtidos por programação linear sobre
// ~120 mil valores de L(x) lidos do hardware e por busca local nos bits finais.
// Precisão do modelo: L(x) igual ao hardware em 99,75 % dos x em [√2/2, √2]
// (os demais diferem em 1 ulp de 68 bits, efeito de ~1/16 no FYL2X); FYL2X igual
// em 199.999 de 200.000 entradas aleatórias e 99.988 de 100.000 perto de 1.
//
// F2XM1 no Zen 2: NÃO reproduzido. O que se sabe: respeita o RC e ignora o PC; o
// valor antes do arredondamento final nunca é exato em 64 bits (o último passo vê
// um "sticky"); o ruído é relativo ao resultado, ~1 arredondamento de 67-68 bits,
// sem estrutura de tabela em [0, 0,5]; para x ≤ 2^-70 vale F(2x) = 2F(x), mas
// nenhum modelo "x·c arredondado" (c real, 64 a 72 bits, ao par/truncado/com
// sticky, constante dividida, x dividido) bate. A taxa de erro em x minúsculo
// muda de degrau em mantissa 1,085078 e 1/ln2: há um intermediário ∝ x com
// mantissa 1,843185 arredondado a ~67 bits, multiplicado por uma constante
// ≈ ln2/1,843185. Sem a constante exata, `f2xm1` usa o valor exato arredondado
// ao par: igual ao Zen 2 em ~97,5 % das entradas; com isso a potência estendida
// sai igual ao oráculo em ~99,5 % dos casos (medido com x^2, x^3, x^1,5, x^-2 e
// x^0,37) e a sonda T20 bate em 1.558 de 1.560 campos (x87.test.ts lista os dois).
//
// Desempenho (Bun 1.4, Ryzen 5 3600): potenciaQB ~29 µs (~34 mil chamadas/s),
// xMenosRaizQB ~33 µs; o log2 interno (~25 operações BigInt de 68 bits) custa
// ~20 µs e o F2XM1 exato ~7 µs.

import { ErroQB } from "./f32";

/** Número finito: valor = (-1)^s · m · 2^e; m = 0n é zero (com sinal). */
export type Num = { readonly s: 0 | 1; readonly m: bigint; readonly e: number };

/** Valor da pilha do x87 em precisão estendida (finitos com mantissa de 64 bits). */
export type Estendido =
  | ({ readonly tipo: "finito" } & Num)
  | { readonly tipo: "infinito"; readonly s: 0 | 1 }
  | { readonly tipo: "nan" };

export type Destino = "single" | "double";

const NAN: Estendido = { tipo: "nan" };

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

const mul = (a: Num, b: Num, prec: number) =>
  arredonda((a.s ^ b.s) as 0 | 1, a.m * b.m, a.e + b.e, prec);

function div(a: Num, b: Num, prec: number) {
  const g = BigInt(prec + 2 + Math.max(0, bits(b.m) - bits(a.m)));
  const n = a.m << g;
  return arredonda((a.s ^ b.s) as 0 | 1, n / b.m, a.e - Number(g) - b.e, prec, n % b.m !== 0n);
}

/** Soma exata arredondada a `prec` bits; +0 quando a soma exata é zero (RN). */
function soma(a: Num, b: Num, prec: number): Num {
  if (b.m === 0n)
    return a.m === 0n ? { s: (a.s & b.s) as 0 | 1, m: 0n, e: 0 } : arredonda(a.s, a.m, a.e, prec);
  if (a.m === 0n) return arredonda(b.s, b.m, b.e, prec);
  const [g, p0] = a.e + bits(a.m) >= b.e + bits(b.m) ? [a, b] : [b, a];
  // parcela muito menor só desempata: troca por uma ainda menor de mesmo sinal
  const limite = g.e - prec - 8;
  const p = p0.e + bits(p0.m) < limite ? { s: p0.s, m: 1n, e: limite - 2 } : p0;
  const k = Math.min(g.e, p.e);
  const v =
    (g.s ? -1n : 1n) * (g.m << BigInt(g.e - k)) + (p.s ? -1n : 1n) * (p.m << BigInt(p.e - k));
  if (v === 0n) return { s: 0, m: 0n, e: 0 };
  return v < 0n ? arredonda(1, -v, k, prec) : arredonda(0, v, k, prec);
}

const neg = (a: Num): Num => ({ s: (a.s ^ 1) as 0 | 1, m: a.m, e: a.e });

function raiz(a: Num, prec: number) {
  // isqrt de m·2^(e) com e par e folga de bits
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

// ---------------------------------------------------------------- conversões

const finito = (n: Num): Estendido => ({ tipo: "finito", s: n.s, m: n.m, e: n.e });

/** Normaliza para o estendido: estouro vira infinito (OM mascarada); abaixo do
 *  menor normal (2^-16382) vira zero. O x87 daria um denormal; para SINGLE/DOUBLE
 *  e para as somas com valores normais o efeito é o mesmo. */
function estende(n: Num): Estendido {
  const r = arredonda(n.s, n.m, n.e, 64);
  if (r.m === 0n) return finito(r);
  const topo = r.e + 63;
  if (topo > 16383) return { tipo: "infinito", s: r.s };
  if (topo < -16382) return finito({ s: r.s, m: 0n, e: 0 });
  return finito(r);
}

/** Valor JavaScript (SINGLE ou DOUBLE do original) no estendido, sem perda (FLD). */
export function estendido(v: number): Estendido {
  if (Number.isNaN(v)) return NAN;
  if (!Number.isFinite(v)) return { tipo: "infinito", s: v < 0 ? 1 : 0 };
  if (v === 0) return finito({ s: Object.is(v, -0) ? 1 : 0, m: 0n, e: 0 });
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  const b = dv.getBigUint64(0);
  const ex = Number((b >> 52n) & 0x7ffn);
  const frac = b & ((1n << 52n) - 1n);
  const s = Number(b >> 63n) as 0 | 1;
  return ex === 0
    ? finito(arredonda(s, frac, -1074, 64))
    : finito(arredonda(s, frac | (1n << 52n), ex - 1075, 64));
}

/** FSTP para SINGLE ou DOUBLE: arredonda ao par direto do estendido (sem passar
 *  por double no caso SINGLE), com subnormais; estouro vira infinito, sem erro
 *  (sonda T13: 10^400 em DOUBLE = 1.#INF). */
export function paraNumero(x: Estendido, destino: Destino): number {
  if (x.tipo === "nan") return Number.NaN;
  if (x.tipo === "infinito") return x.s ? -Infinity : Infinity;
  if (x.m === 0n) return x.s ? -0 : 0;
  const [prec, emin, emax] = destino === "double" ? [53, -1022, 1023] : [24, -126, 127];
  const topo = x.e + 63;
  const quantum = Math.max(topo - prec + 1, emin - prec + 1);
  const sh = quantum - x.e; // > 0: a mantissa de 64 bits sempre tem mais bits que o destino
  let m = x.m >> BigInt(sh);
  const resto = x.m & ((1n << BigInt(sh)) - 1n);
  const meio = 1n << BigInt(sh - 1);
  if (resto > meio || (resto === meio && (m & 1n) === 1n)) m++;
  if (m === 0n) return x.s ? -0 : 0;
  if (bits(m) + quantum - 1 > emax) return x.s ? -Infinity : Infinity;
  const v = Number(m) * 2 ** quantum;
  return x.s ? -v : v;
}

// ---------------------------------------------------------------- aritmética do programa

/** a + b no x87 (FADD, 64 bits, ao par). */
export function somaX(a: Estendido, b: Estendido): Estendido {
  if (a.tipo === "nan" || b.tipo === "nan") return NAN;
  if (a.tipo === "infinito" || b.tipo === "infinito") {
    if (a.tipo === "infinito" && b.tipo === "infinito") return a.s === b.s ? a : NAN;
    return a.tipo === "infinito" ? a : b;
  }
  return estende(soma(a, b, 64));
}

/** a − b no x87 (FSUB). */
export function subX(a: Estendido, b: Estendido): Estendido {
  if (b.tipo === "nan") return NAN;
  return somaX(
    a,
    b.tipo === "finito" ? finito(neg(b)) : { tipo: "infinito", s: (b.s ^ 1) as 0 | 1 },
  );
}

/** SQR(x) do original: FSQRT sobre o valor estendido, corretamente arredondado.
 *  Negativo dá NaN sem erro (sonda T13: SQR(-4) = -1.#IND); SQR(-0) = -0. */
export function raizQB(x: Estendido): Estendido {
  if (x.tipo === "nan") return NAN;
  if (x.tipo === "infinito") return x.s ? NAN : x;
  if (x.m === 0n) return x;
  if (x.s) return NAN;
  return finito(raiz(x, 64));
}

// ---------------------------------------------------------------- instruções do x87 (Zen 2)

const UM: Num = { s: 0, m: 1n, e: 0 };

/** C = r68(2/ln2): coeficiente linear da série atanh do log2 interno do Zen 2. */
const C68: Num = { s: 0, m: 0xb8aa3b295c17f0bbcn, e: -66 };

/** Coeficientes a1..a10 do polinômio q(z) do log2 interno do Zen 2 (68 bits);
 *  a_i ≈ (2/ln2)/(2i + 1), com os desvios do minimax do microcódigo. */
const COEF: readonly Num[] = [
  { s: 0, m: 0xf6384ee1d01feb564n, e: -68 },
  { s: 0, m: 0x93bb62877ce08b8ean, e: -68 },
  { s: 0, m: 0xd30bb153d63406bbfn, e: -69 },
  { s: 0, m: 0xa42589ec186c86d13n, e: -69 },
  { s: 0, m: 0x864d42456b2ab3a5dn, e: -69 },
  { s: 0, m: 0xe347ab5994498e0b8n, e: -70 },
  { s: 0, m: 0xc4fa08aa62a7ec09bn, e: -70 },
  { s: 0, m: 0xadc9d22ad49452b54n, e: -70 },
  { s: 0, m: 0x9b354f1dc588dd58dn, e: -70 },
  { s: 0, m: 0x9a234407e917b3a77n, e: -70 },
];

/** Mantissa de √2 em 64 bits: acima dela a mantissa é dividida por 2. */
const RAIZ2 = 0xb504f333f9de6484n;

/** log2 interno de 68 bits do FYL2X do Zen 2, para x > 0 (ver o topo do arquivo). */
function log2Interno(x: Num): Num {
  let k = x.e + 63;
  let m: Num = { s: 0, m: x.m, e: -63 };
  if (x.m > RAIZ2) {
    m = { s: 0, m: x.m, e: -64 };
    k++;
  }
  const K: Num = { s: k < 0 ? 1 : 0, m: BigInt(Math.abs(k)), e: 0 };
  const s = div(soma(m, neg(UM), 68), soma(m, UM, 68), 68);
  if (s.m === 0n) return arredonda(K.s, K.m, 0, 68);
  const z = mul(s, s, 68);
  let q = COEF[COEF.length - 1]!;
  for (let i = COEF.length - 2; i >= 0; i--) q = soma(mul(q, z, 68), COEF[i]!, 68);
  const R = mul(z, mul(s, q, 68), 68);
  return soma(soma(K, mul(s, C68, 68), 68), R, 68);
}

/** FYL2X do Zen 2 no modo ao par: y · log2(x), x > 0 finito. Exportado para os testes. */
export function fyl2x(y: Num, x: Num): Num {
  const L = log2Interno(x);
  return arredonda((L.s ^ y.s) as 0 | 1, L.m * y.m, L.e + y.e, 64);
}

/** ln 2 com 1024 bits (série atanh(1/3)), para o F2XM1 exato. */
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

/** F2XM1 (2^x − 1, |x| ≤ 1) com o valor exato arredondado ao par em 64 bits. O
 *  Zen 2 difere em ~2,5 % das entradas (ver o topo). Exportado para os testes. */
export function f2xm1(x: Num): Num {
  if (x.m === 0n) return x;
  for (let w = 140; w <= LN2_BITS - 64; w *= 2) {
    // ponto fixo com S bits de fração, folga relativa de w bits mesmo para x minúsculo
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
    // erro de truncamento ≤ termos + 1 unidades: confere se não fica perto do meio
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

/** FRNDINT ao par: devolve o inteiro como bigint. */
function frndint(t: Num): bigint {
  if (t.m === 0n || t.e >= 0) return (t.s ? -1n : 1n) * (t.m << BigInt(Math.max(t.e, 0)));
  if (t.e < -65) return 0n;
  const sh = BigInt(-t.e);
  let n = t.m >> sh;
  const resto = t.m & ((1n << sh) - 1n);
  const meio = 1n << (sh - 1n);
  if (resto > meio || (resto === meio && (n & 1n) === 1n)) n++;
  return t.s ? -n : n;
}

// ---------------------------------------------------------------- potência

const erroFuncao = (msg: string) => new ErroQB(5, `Illegal function call: ${msg}`);

/** `a ^ b` como o B$POW4/B$POW8 do BRUN45, com o resultado em estendido (antes do
 *  FSTP). Lança ErroQB 5 (domínio) ou 6 (estouro). */
export function potenciaX(a: Estendido, b: Estendido): Estendido {
  if (a.tipo !== "finito" || b.tipo !== "finito") throw erroFuncao("NaN ou infinito na potência");
  if (b.m === 0n) return finito(arredonda(0, 1n, 0, 64));
  if (a.m === 0n) {
    if (b.s) throw erroFuncao("0 elevado a expoente negativo");
    return finito({ s: 0, m: 0n, e: 0 });
  }
  let impar = false;
  if (a.s) {
    // a rotina confere os bits da mantissa do expoente (DS:0B2A)
    const topo = b.e + 63;
    if (topo < 0 || topo >= 64) throw erroFuncao("base negativa: expoente fora de 1 ≤ |b| < 2^64");
    if (b.e < 0 && (b.m & ((1n << BigInt(-b.e)) - 1n)) !== 0n)
      throw erroFuncao("base negativa com expoente não inteiro");
    impar = b.e <= 0 && ((b.m >> BigInt(-b.e)) & 1n) === 1n;
  }
  const t = fyl2x(b, { s: 0, m: a.m, e: a.e });
  // |t| ≥ 32767,5 (DS:0B16): t < 0 dá +0, t > 0 dá erro 6
  if (t.m !== 0n && soma({ s: 0, m: t.m, e: t.e }, { s: 1, m: 65535n, e: -1 }, 80).s === 0) {
    if (t.s) return finito({ s: 0, m: 0n, e: 0 });
    throw new ErroQB(6, "Overflow na potência");
  }
  const n = frndint(t);
  const N: Num = { s: n < 0n ? 1 : 0, m: n < 0n ? -n : n, e: 0 };
  const f = soma(t, neg(N), 64); // exato
  let p = soma(f2xm1({ s: 0, m: f.m, e: f.e }), UM, 64);
  if (f.s && f.m !== 0n) p = div(UM, p, 64);
  return estende({ s: impar ? 1 : 0, m: p.m, e: p.e + Number(n) });
}

/** `a ^ b` atribuído a uma variável SINGLE ou DOUBLE do original. */
export function potenciaQB(a: number, b: number, destino: Destino): number {
  return paraNumero(potenciaX(estendido(a), estendido(b)), destino);
}

/** `x − SQR(x ^ 2 − y)` com a sequência de arredondamentos do original: potência e
 *  subtrações em estendido, FSQRT no estendido e um só FSTP no destino. Com y = 0
 *  é o teste da laje em balanço (LAJECALC 0x14317). */
export function xMenosRaizQB(x: number, y: number, destino: Destino): number {
  const X = estendido(x);
  return paraNumero(subX(X, raizQB(subX(potenciaX(X, estendido(2)), estendido(y)))), destino);
}

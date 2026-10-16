// Referências dos testes (fixtures em __x87__/):
// - QB45_T20.BAS / .saida.bin: sonda rodada no SISTRUT original (QB4.5 + BRUN45)
//   no oráculo DOSBox-X (C:/wt/v1-difs/tests/retraducao, oráculo
//   runs/retrad_t20-20261015-191529): 130 valores SINGLE × 12 campos, crus;
// - QB45_T13 / QB45_T17: casos especiais (erros 5 e 6, NaN, infinito) no oráculo;
// - *_zen2.bin: as instruções FYL2X, F2XM1 e FSQRT executadas no processador do
//   oráculo (AMD Ryzen 5 3600, Zen 2), registros de 10 bytes (estendido x87).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ErroQB } from "./f32";
import {
  estendido,
  f2xm1,
  fyl2x,
  type Num,
  paraNumero,
  potenciaQB,
  potenciaX,
  raizQB,
  subX,
  xMenosRaizQB,
} from "./x87";

const fixture = (nome: string) =>
  new Uint8Array(readFileSync(new URL(`./__x87__/${nome}`, import.meta.url)));

/** Estendido de 80 bits (little endian) no formato m·2^e; só valores normais e zero. */
function le80(b: Uint8Array, o: number): Num {
  const dv = new DataView(b.buffer, b.byteOffset + o, 10);
  const m = dv.getBigUint64(0, true);
  const se = dv.getUint16(8, true);
  const s = (se >> 15) as 0 | 1;
  return m === 0n ? { s, m: 0n, e: 0 } : { s, m, e: (se & 0x7fff) - 16383 - 63 };
}
const igual = (a: Num, b: Num) => a.s === b.s && a.m === b.m && (a.m === 0n || a.e === b.e);

describe("sonda T20 no oráculo: ^ e SQR bit a bit", () => {
  // por valor: x!, x^2 (h#, resto l#), x - SQR(x^2 - 0!), x^3, x^1.5, x^-2, CDBL(x)^.37#
  // (cada resto `x^y - CDBL(x^y)` guarda os bits do estendido além do DOUBLE)
  const bin = fixture("QB45_T20.saida.bin");
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const campos = ["x", "h", "l", "s", "h3", "l3", "hm", "lm", "hn", "ln", "hd", "ld"];
  const tipos = "sddsdddddddd";

  function calcula(x: number) {
    const X = estendido(x);
    const par = (b: number) => {
      const p = potenciaX(X, estendido(b));
      const h = paraNumero(p, "double");
      return [h, paraNumero(subX(p, estendido(h)), "double")];
    };
    return [
      x,
      ...par(2),
      xMenosRaizQB(x, 0, "single"),
      ...par(3),
      ...par(1.5),
      ...par(-2),
      ...par(0.37),
    ];
  }

  it("1.558 de 1.560 campos iguais; os dois que diferem vêm do F2XM1 (ver x87.ts)", () => {
    let o = 60; // cabeçalho da sonda (PRINT USING e produtos de comparação)
    const diferentes: string[] = [];
    for (let i = 1; i <= 130; i++) {
      const esperado: number[] = [];
      for (const t of tipos) {
        esperado.push(t === "s" ? dv.getFloat32(o, true) : dv.getFloat64(o, true));
        o += t === "s" ? 4 : 8;
      }
      const obtido = calcula(esperado[0]!);
      campos.forEach((c, k) => {
        if (!Object.is(obtido[k], esperado[k])) diferentes.push(`${i}:${c}`);
      });
    }
    expect(o).toBe(bin.byteLength);
    // x = 43,3577 e 51,4153: resto de x^1,5; com o F2XM1 real do Zen 2 o modelo dá 1.560/1.560
    expect(diferentes).toEqual(["11:lm", "13:lm"]);
  });

  it("x − SQR(x^2) não dá 0 (laje em balanço com M = 0)", () => {
    // valores 1 e 7 da sonda, campo s!: o modelo exato do FYL2X dava o sinal trocado
    expect(xMenosRaizQB(Math.fround(4.7137), 0, "single")).toBe(4.336808689942018e-19);
    expect(xMenosRaizQB(Math.fround(27.5713), 0, "single")).toBe(3.469446951953614e-18);
  });
});

describe("casos especiais (sondas T13 e T17 no oráculo)", () => {
  const erro = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return e instanceof ErroQB ? e.codigo : -1;
    }
    return 0;
  };

  it("base negativa: só expoente inteiro", () => {
    expect(potenciaQB(-2, 2, "double")).toBe(4); // (-2)^2 e= 0 x#= 4
    expect(potenciaQB(-2, 3, "double")).toBe(-8); // (-2)^3 e= 0 x#=-8
    expect(erro(() => potenciaQB(-8, 1 / 3, "double"))).toBe(5); // (-8)^(1/3) e= 5
    expect(erro(() => potenciaQB(-2, 0.5, "double"))).toBe(5); // (-2)^.5 e= 5
  });

  it("zero e estouro no FSTP", () => {
    expect(erro(() => potenciaQB(0, -1, "double"))).toBe(5); // 0^-1 e= 5
    expect(potenciaQB(0, 0, "double")).toBe(1); // 0^0 e= 0 x#= 1
    expect(potenciaQB(10, 400, "double")).toBe(Infinity); // 10^400 e= 0 x#= 1.#INF
  });

  // os casos abaixo não estão nas sondas: seguem a regra 9 de docs/RETRADUCAO.md da V1
  it("regra: |t| ≥ 32767,5 dá erro 6 (t > 0) ou +0 (t < 0); abaixo disso, infinito no FSTP", () => {
    // 2^b: t = b·log2 2 = b exatamente
    expect(erro(() => potenciaQB(2, 32767.5, "double"))).toBe(6);
    expect(potenciaQB(2, 32767.4, "double")).toBe(Infinity);
    expect(Object.is(potenciaQB(2, -32767.5, "double"), 0)).toBe(true);
    expect(erro(() => potenciaQB(10, 10000, "double"))).toBe(6);
    expect(potenciaQB(10, -10000, "double")).toBe(0);
  });

  it("regra: NaN ou infinito em qualquer lado dá erro 5; expoente 0 dá 1; base 0 dá +0", () => {
    expect(erro(() => potenciaQB(Number.NaN, 2, "double"))).toBe(5);
    expect(erro(() => potenciaQB(Infinity, 2, "double"))).toBe(5);
    expect(erro(() => potenciaQB(2, -Infinity, "double"))).toBe(5);
    expect(potenciaQB(1.5, 0, "single")).toBe(1);
    expect(Object.is(potenciaQB(-0, 3, "single"), 0)).toBe(true);
  });

  it("regra: base negativa exige expoente inteiro com 1 ≤ |b| < 2^64", () => {
    expect(potenciaQB(-2, -3, "double")).toBe(-0.125);
    expect(potenciaQB(-1, 2 ** 63, "double")).toBe(1); // par, ainda abaixo de 2^64
    expect(erro(() => potenciaQB(-1, 2 ** 64, "double"))).toBe(5);
    expect(erro(() => potenciaQB(-2, 0.5, "double"))).toBe(5);
  });

  it("SQR de negativo dá NaN sem erro (SQR(-4) e SQR!(-4) = -1.#IND)", () => {
    expect(Number.isNaN(paraNumero(raizQB(estendido(-4)), "double"))).toBe(true);
    expect(Number.isNaN(paraNumero(raizQB(estendido(-4)), "single"))).toBe(true);
    expect(Object.is(paraNumero(raizQB(estendido(-0)), "double"), -0)).toBe(true);
    expect(paraNumero(raizQB(estendido(Infinity)), "double")).toBe(Infinity);
    expect(Number.isNaN(paraNumero(raizQB(estendido(-Infinity)), "double"))).toBe(true);
  });
});

describe("instruções contra o processador do oráculo (Zen 2)", () => {
  it("FYL2X: modelo do log2 interno de 68 bits igual ao hardware em 3.000 entradas", () => {
    // 2.000 com x em [2^-40, 2^40] e y aleatório (1/4 inteiros pequenos), 1.000 com x perto de 1
    const b = fixture("fyl2x_zen2.bin");
    let diferentes = 0;
    for (let o = 0; o < b.length; o += 30)
      if (!igual(fyl2x(le80(b, o + 10), le80(b, o)), le80(b, o + 20))) diferentes++;
    expect(b.length / 30).toBe(3000);
    expect(diferentes).toBe(0);
  });

  it("FSQRT é corretamente arredondado (500 entradas)", () => {
    const b = fixture("fsqrt_zen2.bin");
    for (let o = 0; o < b.length; o += 20) {
      const r = raizQB({ tipo: "finito", ...le80(b, o) });
      expect(r.tipo === "finito" && igual(r, le80(b, o + 10))).toBe(true);
    }
  });

  it("FSQRT perto do empate: 200 entradas com a raiz a menos de 1e-6 ulp do meio", () => {
    const b = fixture("fsqrt_empate_zen2.bin");
    let diferentes = 0;
    for (let o = 0; o < b.length; o += 20) {
      const r = raizQB({ tipo: "finito", ...le80(b, o) });
      if (!(r.tipo === "finito" && igual(r, le80(b, o + 10)))) diferentes++;
    }
    expect(b.length / 20).toBe(200);
    expect(diferentes).toBe(0);
  });

  it("F2XM1: o valor exato arredondado difere do Zen 2 em 59 de 2.000 entradas (registro)", () => {
    // limitação conhecida (topo de x87.ts); se o modelo melhorar, este número cai
    const b = fixture("f2xm1_zen2.bin");
    let diferentes = 0;
    for (let o = 0; o < b.length; o += 20)
      if (!igual(f2xm1(le80(b, o)), le80(b, o + 10))) diferentes++;
    expect(diferentes).toBe(59);
  });
});

describe("conversões", () => {
  it("FSTP para SINGLE arredonda direto do estendido, sem passar por DOUBLE", () => {
    // 1 + 2^-24 + 2^-60: direto dá 1 + 2^-23; via double daria 1 (empate ao par)
    const v = {
      tipo: "finito" as const,
      s: 0 as const,
      m: (1n << 63n) + (1n << 39n) + (1n << 3n),
      e: -63,
    };
    expect(paraNumero(v, "single")).toBe(1 + 2 ** -23);
    expect(paraNumero(v, "double")).toBe(1 + 2 ** -24);
  });

  it("FSTP para SINGLE com subnormais do destino", () => {
    expect(paraNumero(estendido(2 ** -140), "single")).toBe(2 ** -140);
    expect(paraNumero(estendido(2 ** -149), "single")).toBe(2 ** -149);
    expect(paraNumero(estendido(1.5 * 2 ** -149), "single")).toBe(2 ** -148); // empate, ao par
    expect(paraNumero(estendido(1.25 * 2 ** -149), "single")).toBe(2 ** -149);
    expect(paraNumero(estendido(3 * 2 ** -151), "single")).toBe(2 ** -149);
  });

  it("x − x = +0 no modo ao par", () => {
    const r = subX(estendido(1.5), estendido(1.5));
    expect(Object.is(paraNumero(r, "double"), 0)).toBe(true);
    expect(Object.is(paraNumero(subX(estendido(-0), estendido(0)), "double"), -0)).toBe(true);
  });

  it("estendido ↔ número é exato e preserva -0, subnormais e infinito", () => {
    for (const x of [
      1.4,
      -0.15,
      2 ** -1074,
      -(2 ** -1022),
      1.7976931348623157e308,
      Math.fround(0.85),
    ])
      expect(paraNumero(estendido(x), "double")).toBe(x);
    expect(Object.is(paraNumero(estendido(-0), "single"), -0)).toBe(true);
    expect(paraNumero(estendido(1e300), "single")).toBe(Infinity); // CSNG(1E300) = 1.#INF
    expect(paraNumero(estendido(2 ** -150), "single")).toBe(0); // empate abaixo do menor subnormal
  });
});

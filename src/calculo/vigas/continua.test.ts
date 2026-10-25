// Casos de T_VIGCALC.BAS (V1) e soluções fechadas da viga contínua de EI
// constante. A mecânica é linear: os valores da V1 (tf, tf/m) valem igual em
// kN, kN/m, porque nenhum coeficiente depende da unidade.
import { describe, expect, it } from "vitest";
import {
  analisaVigaContinua,
  NPT,
  type TramoEntrada,
  type VigaContinuaEntrada,
  type VigaContinuaResultado,
} from "./continua";

const iguais = (n: number, comprimento: number, g: number, q = 0): TramoEntrada[] =>
  Array.from({ length: n }, () => ({ comprimento, g, q }));

function analisa(e: VigaContinuaEntrada) {
  const r: VigaContinuaResultado = analisaVigaContinua(e);
  if (!r.ok) throw new Error(r.avisos.join(" "));
  const tramo = (t: number) => {
    const tr = r.tramos[t];
    if (!tr) throw new Error(`sem tramo ${t}`);
    return tr;
  };
  const apoio = (k: number) => {
    const a = r.apoios[k];
    if (!a) throw new Error(`sem apoio ${k}`);
    return a;
  };
  return { r, tramo, apoio };
}

describe("biapoiada", () => {
  it("q = 2, L = 5: M = qL²/8 = 6,25; R = V = qL/2 = 5 (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({ tramos: iguais(1, 5, 2) });
    expect(tramo(0).mPos).toBeCloseTo(6.25, 4);
    expect(apoio(0).reacaoMax).toBeCloseTo(5, 6);
    expect(apoio(1).reacaoMax).toBeCloseTo(5, 6);
    expect(tramo(0).vEsq).toBeCloseTo(5, 6);
    expect(tramo(0).vDir).toBeCloseTo(5, 6);
    expect(tramo(0).mNegEsq).toBe(0);
    expect(tramo(0).mNegDir).toBe(0);
  });

  it("diagrama: NPT + 1 pontos, zero nos apoios e qL²/8 no meio", () => {
    const { tramo } = analisa({ tramos: iguais(1, 5, 2) });
    const p = tramo(0).pontos;
    expect(p).toHaveLength(NPT + 1);
    expect(p[0]?.mMax).toBeCloseTo(0, 9);
    expect(p[NPT]?.mMax).toBeCloseTo(0, 9);
    expect(p[NPT / 2]?.x).toBeCloseTo(2.5, 9);
    expect(p[NPT / 2]?.mMax).toBeCloseTo(6.25, 9);
    // x = 1: M = qLx/2 − qx²/2 = 5 − 1 = 4
    expect(p[10]?.mMax).toBeCloseTo(4, 9);
  });

  it("P = 4 no meio de L = 6: M = PL/4 = 6; R = P/2 = 2 (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({
      tramos: [{ comprimento: 6, g: 0, q: 0, concentradas: [{ a: 3, g: 4 }] }],
    });
    expect(tramo(0).mPos).toBeCloseTo(6, 4);
    expect(apoio(1).reacaoMax).toBeCloseTo(2, 6);
  });

  it("P = 6 a 2 m de L = 6: R = 4 e 2; M+ lido na grade de 50 divisões, como na V1", () => {
    const { tramo, apoio } = analisa({
      tramos: [{ comprimento: 6, g: 0, q: 0, concentradas: [{ a: 2, g: 6 }] }],
    });
    // Exato: Pab/L = 8 em x = 2, que não cai na grade (k = 16,67).
    // M(x) = 4x para x ≤ 2 e 4x − 6(x − 2) depois: k = 16 (x = 1,92) → 7,68; k = 17 (x = 2,04) → 7,92
    expect(tramo(0).mPos).toBeCloseTo(7.92, 6);
    expect(apoio(0).reacaoG).toBeCloseTo(4, 6);
    expect(apoio(1).reacaoG).toBeCloseTo(2, 6);
  });
});

describe("dois vãos iguais", () => {
  it("q = 1, L = 4: M apoio = −qL²/8 = −2; M+ = 9qL²/128; R = 3qL/8 e 10qL/8 (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({ tramos: iguais(2, 4, 1) });
    expect(tramo(0).mNegDir).toBeCloseTo(-2, 6);
    expect(tramo(1).mNegEsq).toBeCloseTo(-2, 6);
    // máximo em x = 3L/8 = 1,5, fora da grade de 50 divisões (passo 0,08)
    expect(tramo(0).mPos).toBeCloseTo((9 * 16) / 128, 2);
    expect(Math.abs(tramo(0).mPos - (9 * 16) / 128)).toBeLessThan(0.002);
    expect(apoio(0).reacaoMax).toBeCloseTo(1.5, 6);
    expect(apoio(1).reacaoMax).toBeCloseTo(5, 6);
    expect(apoio(2).reacaoMax).toBeCloseTo(1.5, 6);
    // cortante no apoio central = 5qL/8 = 2,5
    expect(tramo(0).vDir).toBeCloseTo(2.5, 6);
    expect(tramo(1).vEsq).toBeCloseTo(2.5, 6);
  });

  it("q só no 1º vão (g = 0): M apoio = −qL²/16 = −1 (T_VIGCALC)", () => {
    const { tramo } = analisa({
      tramos: [
        { comprimento: 4, g: 0, q: 1 },
        { comprimento: 4, g: 0, q: 0 },
      ],
    });
    expect(tramo(0).mNegDir).toBeCloseTo(-1, 6);
  });

  it("envoltória com sobrecarga alternada: g = q = 1, L = 4 (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({ tramos: iguais(2, 4, 1, 1) });
    // pior positivo no vão 1: g + q no vão 1 e g no vão 2.
    // M_B = −(2 + 1)·16/16 = −3; V_A = (−3 + 2·16/2)/4 = 3,25; Mmax = 3,25²/(2·2) = 2,6406
    // na grade (passo 0,08) o maior é x = 1,60: 3,25·1,6 − 1,6² = 2,64
    expect(tramo(0).mPos).toBeGreaterThan((9 * 2 * 16) / 128 + 0.01);
    expect(tramo(0).mPos).toBeCloseTo(2.64, 9);
    // negativo: todos os vãos carregados, −(g + q)L²/8 = −4
    expect(tramo(0).mNegDir).toBeCloseTo(-4, 6);
    // apoio extremo: g → 1,5; q no vão 1 → 1,75; q no vão 2 → −0,25 (descartado)
    expect(apoio(0).reacaoG).toBeCloseTo(1.5, 6);
    expect(apoio(0).reacaoMax).toBeCloseTo(3.25, 6);
    expect(apoio(0).reacaoTotal).toBeCloseTo((3 / 8) * 2 * 4, 6);
    expect(tramo(0).vEsq).toBeCloseTo(3.25, 6);
    // apoio central: 10qL/8 com q total 2
    expect(apoio(1).reacaoMax).toBeCloseTo(10, 6);
    expect(apoio(1).reacaoTotal).toBeCloseTo(10, 6);
  });
});

describe("três vãos iguais", () => {
  it("q = 1, L = 5: M apoios internos = −0,1qL² = −2,5; R = 0,4qL e 1,1qL (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({ tramos: iguais(3, 5, 1) });
    expect(tramo(0).mNegDir).toBeCloseTo(-2.5, 6);
    expect(tramo(1).mNegEsq).toBeCloseTo(-2.5, 6);
    expect(tramo(2).mNegEsq).toBeCloseTo(-2.5, 6);
    expect(apoio(0).reacaoG).toBeCloseTo(2, 6);
    expect(apoio(1).reacaoG).toBeCloseTo(5.5, 6);
    expect(apoio(2).reacaoG).toBeCloseTo(5.5, 6);
    expect(apoio(3).reacaoG).toBeCloseTo(2, 6);
    // vão central: M+ = qL²/8 − 0,1qL² = 0,025qL² = 0,625 (em x = L/2, na grade)
    expect(tramo(1).mPos).toBeCloseTo(0.625, 6);
  });

  it("só q = 10, L = 5: reação interna máxima 1,2qL = 60 contra 1,1qL = 55 com tudo carregado", () => {
    // Três momentos com q só no vão 3: M_C = −qL²/15, M_B = +qL²/60;
    // R_B = −qL/60 (vão AB) + (M_C − M_B)/L (vão BC) = −0,1qL, desfavorável e descartado.
    // Logo R_B,max = 1,1qL + 0,1qL = 1,2qL = 60 kN; R_B com tudo carregado = 1,1qL = 55 kN.
    const { apoio } = analisa({ tramos: iguais(3, 5, 0, 10) });
    expect(apoio(1).reacaoTotal).toBeCloseTo(55, 6);
    expect(apoio(1).reacaoMax).toBeCloseTo(60, 6);
    expect(apoio(2).reacaoMax).toBeCloseTo(60, 6);
  });
});

describe("concentrada com parcela variável", () => {
  // Dois vãos de 5 m; g = 10 kN/m só no vão 1; P = 100 kN variável no meio do vão 2.
  // Só g: M_B = −gL²/16 = −15,625; R_A = gL/2 + M_B/L = 21,875; M+ = R_A²/(2g) = 23,93
  //   (na grade de 0,1 m, x = 2,2: 21,875·2,2 − 5·2,2² = 23,925).
  // P no vão 2: M_B = −3PL/32 = −46,875 (desfavorável ao positivo do vão 1, descartado).
  // Com P como permanente (V1), R_A = 25 − 62,5/5 = 12,5 e M+ = 12,5²/20 = 7,81 (grade: 7,80).
  const tramos = (q: number, gConc: number): TramoEntrada[] => [
    { comprimento: 5, g: 10, q: 0 },
    { comprimento: 5, g: 0, q: 0, concentradas: [{ a: 2.5, g: gConc, q }] },
  ];

  it("como q: o positivo do vão 1 não é aliviado (23,93) e o negativo soma (−62,5)", () => {
    const { tramo, apoio } = analisa({ tramos: tramos(100, 0) });
    expect(tramo(0).mPos).toBeCloseTo(23.925, 6);
    expect(tramo(0).mNegDir).toBeCloseTo(-62.5, 6);
    // R_C: só g, M_B,g/L = −15,625/5 = −3,125; só P, P/2 + M_B,P/L = 50 − 9,375 = 40,625
    expect(apoio(2).reacaoG).toBeCloseTo(-3.125, 6);
    expect(apoio(2).reacaoMax).toBeCloseTo(-3.125 + 40.625, 6);
  });

  it("como g (V1): o positivo do vão 1 cai para 7,80", () => {
    const { tramo } = analisa({ tramos: tramos(0, 100) });
    expect(tramo(0).mPos).toBeCloseTo(7.8, 6);
  });
});

describe("balanços", () => {
  it("balanço direito L = 2, q = 3: M apoio = −qL²/2 = −6; equilíbrio; ponta sem reação (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({
      tramos: [
        { comprimento: 4, g: 3, q: 0 },
        { comprimento: 2, g: 3, q: 0 },
      ],
      balancoDireito: true,
    });
    expect(tramo(1).balanco).toBe(true);
    expect(tramo(1).mNegEsq).toBeCloseTo(-6, 6);
    expect(tramo(1).mNegDir).toBe(0);
    expect(tramo(0).mNegDir).toBeCloseTo(-6, 6);
    expect(apoio(0).reacaoMax + apoio(1).reacaoMax + apoio(2).reacaoMax).toBeCloseTo(18, 6);
    expect(apoio(2).livre).toBe(true);
    expect(apoio(2).reacaoMax).toBeCloseTo(0, 9);
    // R_A = qL/2 − 6/4 = 4,5; R_B = 18 − 4,5 = 13,5; cortante na raiz do balanço = qL = 6
    expect(apoio(0).reacaoG).toBeCloseTo(4.5, 6);
    expect(apoio(1).reacaoG).toBeCloseTo(13.5, 6);
    expect(tramo(1).vEsq).toBeCloseTo(6, 6);
  });

  it("balanço esquerdo L = 1,5 com P = 2 na ponta: M = −PL = −3 (T_VIGCALC)", () => {
    const { tramo, apoio } = analisa({
      tramos: [
        { comprimento: 1.5, g: 0, q: 0, concentradas: [{ a: 0, g: 2 }] },
        { comprimento: 4, g: 0, q: 0 },
        { comprimento: 4, g: 0, q: 0 },
      ],
      balancoEsquerdo: true,
    });
    expect(tramo(0).mNegDir).toBeCloseTo(-3, 6);
    expect(tramo(1).mNegEsq).toBeCloseTo(-3, 6);
    expect(apoio(0).livre).toBe(true);
    const soma = [0, 1, 2, 3].reduce((s, k) => s + apoio(k).reacaoG, 0);
    expect(soma).toBeCloseTo(2, 9);
  });

  it("balanço com q: a reação máxima descarta o alívio e o g + q pleno soma tudo", () => {
    // vão 4 m + balanço 2 m, g = 0, q = 3 nos dois.
    // q no vão: R_A = 6, R_B = 6. q no balanço: M_B = −6, R_A = −1,5, R_B = 7,5.
    const { tramo, apoio } = analisa({
      tramos: [
        { comprimento: 4, g: 0, q: 3 },
        { comprimento: 2, g: 0, q: 3 },
      ],
      balancoDireito: true,
    });
    expect(apoio(0).reacaoMax).toBeCloseTo(6, 6);
    expect(apoio(0).reacaoTotal).toBeCloseTo(4.5, 6);
    expect(apoio(1).reacaoMax).toBeCloseTo(13.5, 6);
    expect(apoio(1).reacaoTotal).toBeCloseTo(13.5, 6);
    // positivo do vão só com q no vão: qL²/8 = 6
    expect(tramo(0).mPos).toBeCloseTo(6, 6);
    expect(tramo(0).mNegDir).toBeCloseTo(-6, 6);
  });
});

describe("equilíbrio", () => {
  it("3 vãos 4/6/4 m, g = 1,45 kN/m (1,2 + pp 0,2·0,5·2,5) e concentradas 3 e 1,5 (T_VIGCALC)", () => {
    const g = 1.2 + 0.2 * 0.5 * 2.5;
    const { apoio } = analisa({
      tramos: [
        { comprimento: 4, g, q: 0 },
        { comprimento: 6, g, q: 0, concentradas: [{ a: 2, g: 3 }] },
        { comprimento: 4, g, q: 0, concentradas: [{ a: 1, g: 1.5 }] },
      ],
    });
    const soma = [0, 1, 2, 3].reduce((s, k) => s + apoio(k).reacaoMax, 0);
    expect(soma).toBeCloseTo(g * 14 + 4.5, 6);
  });
});

describe("viga instável ou inválida", () => {
  it.each([
    [
      "1 tramo com dois balanços",
      { tramos: iguais(1, 3, 1), balancoEsquerdo: true, balancoDireito: true },
    ],
    ["um apoio só (balanço + apoio)", { tramos: iguais(1, 3, 1), balancoEsquerdo: true }],
    [
      "dois balanços sobre um apoio",
      { tramos: iguais(2, 3, 1), balancoEsquerdo: true, balancoDireito: true },
    ],
  ])("%s é recusada com aviso (T_VIGCALC)", (_, e) => {
    const r = analisaVigaContinua(e);
    expect(r.ok).toBe(false);
    expect(r.avisos.join(" ")).toMatch(/instável/);
  });

  it("comprimento nulo e concentrada fora do tramo são recusados", () => {
    expect(analisaVigaContinua({ tramos: iguais(1, 0, 1) }).ok).toBe(false);
    expect(
      analisaVigaContinua({
        tramos: [{ comprimento: 4, g: 1, q: 0, concentradas: [{ a: 5, g: 1 }] }],
      }).ok,
    ).toBe(false);
    expect(analisaVigaContinua({ tramos: [] }).ok).toBe(false);
  });
});

// Carga distribuída em trechos (as divisões do .VIG do SISTRUT na NBR 6118).
describe("cargas em trechos do tramo", () => {
  const ok = (e: VigaContinuaEntrada) => {
    const r = analisaVigaContinua(e);
    if (!r.ok) throw new Error(r.avisos.join(" "));
    return r;
  };

  // biapoiada L = 4, w = 10 em [0, 2]: R_A = 10·2·3/4 = 15, R_B = 5; V = 0 em x = 1,5;
  // M máx = 15·1,5 − 10·1,5²/2 = 11,25
  it("biapoiada com meio vão carregado: reações 15 e 5 kN, M = 11,25 kN·m", () => {
    const r = ok({ tramos: [{ comprimento: 4, g: 0, q: 0, parciais: [{ a: 0, b: 2, g: 10 }] }] });
    expect(r.apoios[0]!.reacaoG).toBeCloseTo(15, 9);
    expect(r.apoios[1]!.reacaoG).toBeCloseTo(5, 9);
    expect(r.tramos[0]!.vEsq).toBeCloseTo(15, 9);
    expect(r.tramos[0]!.vDir).toBeCloseTo(5, 9);
    expect(r.tramos[0]!.mPos).toBeCloseTo(11.25, 2);
  });

  // dois vãos iguais de 4 m, w = 10 só no 1º: M_B = −wL²/16 = −10
  it("dois vãos com o 1º carregado: −10 kN·m no apoio central, igual à uniforme", () => {
    const uniforme = ok({
      tramos: [
        { comprimento: 4, g: 10, q: 0 },
        { comprimento: 4, g: 0, q: 0 },
      ],
    });
    const trechos = ok({
      tramos: [
        {
          comprimento: 4,
          g: 0,
          q: 0,
          parciais: [
            { a: 0, b: 1.5, g: 10 },
            { a: 1.5, b: 4, g: 10 },
          ],
        },
        { comprimento: 4, g: 0, q: 0 },
      ],
    });
    for (const r of [uniforme, trechos]) expect(r.tramos[0]!.mNegDir).toBeCloseTo(-10, 9);
    expect(trechos.apoios.map((a) => a.reacaoG)).toEqual(
      uniforme.apoios.map((a) => expect.closeTo(a.reacaoG, 9)),
    );
  });

  // balanço de 1,5 m com w = 10 em [0,5; 1,5] (a partir do apoio): resultante 10 kN a
  // 1,0 m do apoio, M = −10 kN·m
  it("balanço com trecho carregado: −10 kN·m no apoio", () => {
    const r = ok({
      tramos: [
        { comprimento: 4, g: 0, q: 0 },
        { comprimento: 1.5, g: 0, q: 0, parciais: [{ a: 0.5, b: 1.5, g: 10 }] },
      ],
      balancoDireito: true,
    });
    expect(r.tramos[1]!.mNegEsq).toBeCloseTo(-10, 9);
    expect(r.tramos[0]!.mNegDir).toBeCloseTo(-10, 9);
  });

  // três tramos com balanço, trechos g e q: igual à mesma carga em 2000 concentradas
  // por trecho (o caminho das concentradas tem os casos da V1 acima)
  it("trechos g e q equivalem à carga discretizada em concentradas", () => {
    const parciais = [
      [
        { a: 0, b: 0.88, g: 5.4, q: 1.2 },
        { a: 0.88, b: 3.8, g: 1.2, q: 0.3 },
      ],
      [{ a: 1.02, b: 1.72, g: 7.5, q: 2 }],
      [{ a: 0.2, b: 1.1, g: 3, q: 1 }],
    ];
    const comprimentos = [3.8, 1.72, 1.25];
    const N = 2000;
    const comTrechos = ok({
      tramos: comprimentos.map((comprimento, t) => ({
        comprimento,
        g: 1,
        q: 0.5,
        parciais: parciais[t] ?? [],
      })),
      balancoDireito: true,
    });
    const discretizada = ok({
      tramos: comprimentos.map((comprimento, t) => ({
        comprimento,
        g: 1,
        q: 0.5,
        concentradas: parciais[t]!.flatMap(({ a, b, g, q }) =>
          Array.from({ length: N }, (_, k) => ({
            a: a + ((k + 0.5) * (b - a)) / N,
            g: (g * (b - a)) / N,
            q: (q * (b - a)) / N,
          })),
        ),
      })),
      balancoDireito: true,
    });
    comTrechos.tramos.forEach((t, i) => {
      const d = discretizada.tramos[i]!;
      for (const k of ["mPos", "mNegEsq", "mNegDir", "vEsq", "vDir"] as const)
        expect(t[k]).toBeCloseTo(d[k], 3);
    });
    comTrechos.apoios.forEach((a, k) =>
      expect(a.reacaoMax).toBeCloseTo(discretizada.apoios[k]!.reacaoMax, 6),
    );
  });

  it("trecho fora do tramo é recusado", () => {
    const r = analisaVigaContinua({
      tramos: [{ comprimento: 4, g: 0, q: 0, parciais: [{ a: 3, b: 5, g: 1 }] }],
    });
    expect(r.ok).toBe(false);
  });
});

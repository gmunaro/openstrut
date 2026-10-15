// Referências: valores impressos pelo original (caso_a_laje, retrad_laje_calc2,
// retrad_laje_param). O M de entrada vem da conta à mão do coeficiente de carga
// (livros_laje.md 1.7 e 2.1), sem depender da T1:
// - E2E (4 × 5, dois bordos i 2,0, μ 0,8): (38,36 − 2·1,5052)/(18,2491 − 2,1955/3)
//   = 2,0179828 (o .LAJ gravado pelo original traz 2,017982);
// - calc2 L1 (90°, μ 1,1 → 5,24 × 4, um bordo longo i 2,0): (28,96 − 2·1,3352)/
//   (16,9538 − 1,3705/3) = 1,5935955;
// - calc2 L2 (μ 1,5 → 4,89 × 5, apoiada): (19,78 − 2·1,5508)/(20,1459 − 3,6625/3) = 0,8812836;
// - calc2 L3/L4 (4 × 5,59, apoiada): (19,18 − 2·1,2685)/(17,0267 − 2,0046/3) = 1,0173877.
// Cantos: l_22 = Σ p·(1 − sen α)/(sen α + 1,14), l_26 = Σ p·h²·(1 − sen α)/(5 sen α + 1,14).
import { describe, expect, it } from "vitest";
import { type CasoOraculo, CASOS_ORACULO, bateComImpresso, valorOraculo } from "../__oraculo__";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type { MateriaisSistrut, MomentosDeLaje } from "../base/tipos";
import { armadurasLaje, relacoesNegativas, secaoDeMaiorX } from "./armaduras";

const PARAM = emSingle(PARAMETROS_LAJE);
const E2E: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};

/** Momentos como o LAJECALC os forma (livros_laje.md 1.8), com SINGLE em cada
 *  atribuição: q = 3/20 + H·2,5/100 + 0,10 (ocupação 3 t em 20 m², permanente 0,10),
 *  p = q/coef, M+ = 100·p; secundário M+·μ (μ ≤ 1) ou M+/μ; bordos [código, fator]. */
function momentosDeTeste(
  nome: string,
  h: number,
  coef: number,
  mu: number,
  bordos: [number, number][],
) {
  const qExt = 3 / 20 + (1 / 100) * h * sng(2.5) + sng(0.1);
  const p = sng(qExt / sng(coef));
  const mPos = sng(100 * p);
  const coefs = bordos.map(([codigo, fator]) =>
    codigo > 2 ? sng(((codigo - 2) * fator) / 10) : 0,
  );
  const momentos: MomentosDeLaje = {
    nome,
    h,
    q: sng(qExt),
    pesoProprio: sng((1 / 100) * h * sng(2.5)),
    coeficiente: { coeficiente: sng(coef), l1a: 0, l32: 0, l1e: 0, l22: 0, l26: 0, l2a: 0, l2e: 0 },
    mPositivoPrincipalTcm: mPos,
    mPositivoSecundarioTcm: sng(mu <= 1 ? mPos * sng(mu) : mPos / sng(mu)),
    mNegativoMaiorTcm: sng(mPos * Math.max(0, ...coefs)),
    mNegativoMenorTcm: 0,
    bordos: bordos.map(([, fator], i) => ({ fatorDirecao: sng(fator), coeficiente: coefs[i]! })),
  };
  return momentos;
}

const COEF = {
  e2e: 2.017982780617627,
  c2L1: 1.5935955177529804,
  c2L2: 0.8812836071035194,
  c2L3: 1.0173876675448086,
};
/** Bordos do E2E [código, fator]: base, direita, topo, esquerda; fator μ = 0,8 no
 *  bordo horizontal e 1 no vertical (LAJECALC.BAS:1907-1934). */
const BORDOS_E2E: Record<string, [number, number][]> = {
  L1: [
    [22, 0.8],
    [22, 1],
    [0, 0.8],
    [0, 1],
  ],
  L2: [
    [22, 0.8],
    [0, 1],
    [0, 0.8],
    [22, 1],
  ],
  L3: [
    [0, 0.8],
    [22, 1],
    [22, 0.8],
    [0, 1],
  ],
  L4: [
    [0, 0.8],
    [0, 1],
    [22, 0.8],
    [22, 1],
  ],
};

function confere(caso: CasoOraculo, id: string, calculado: number) {
  const v = valorOraculo(caso, id);
  expect(
    bateComImpresso(v, calculado),
    `${caso.caso} ${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
}

describe("relações M−/M+", () => {
  it("E2E L1: maior 2,0 (bordo vertical), menor 1,6 (horizontal, fator μ)", () => {
    const { maior, menor } = relacoesNegativas(
      momentosDeTeste("L1", 10, COEF.e2e, 0.8, BORDOS_E2E.L1!).bordos,
      "original",
    );
    expect(maior).toBeCloseTo(2, 6);
    expect(menor).toBeCloseTo(1.6, 6);
  });
  it("sem engaste: 0 e 0", () => {
    expect(relacoesNegativas([{ fatorDirecao: 1, coeficiente: 0 }], "original")).toEqual({
      maior: 0,
      menor: 0,
    });
  });
});

describe("caso_a_laje: armaduras com H 10, antes e depois da otimização", () => {
  const caso = CASOS_ORACULO.caso_a_laje!;
  for (const nome of ["L1", "L2", "L3", "L4"]) {
    it(nome, () => {
      const a = armadurasLaje(
        momentosDeTeste(nome, 10, COEF.e2e, 0.8, BORDOS_E2E[nome]!),
        E2E,
        PARAM,
        "original",
      );
      for (const sufixo of ["", ".preOtim"]) {
        confere(caso, `${nome}.As+princ${sufixo}`, a.asPositivaPrincipal);
        confere(caso, `${nome}.As+sec${sufixo}`, a.asPositivaSecundaria);
        confere(caso, `${nome}.As-maior${sufixo}`, a.asNegativaMaior);
        confere(caso, `${nome}.As-menor${sufixo}`, a.asNegativaMenor);
      }
      // Relatório da imposição de H 10: seção de maior x (a negativa maior).
      confere(caso, `${nome}.x/d`, a.xd);
      expect(a.barra.ok).toBe(true);
      if (a.barra.ok) {
        confere(caso, `${nome}.As.phi`, a.barra.bitola);
        confere(caso, `${nome}.As.s`, a.barra.espacamento);
      }
    });
  }
});

describe("retrad_laje_param: fck 0,2, aço A, γf 1,5, eficiência 90 %", () => {
  const caso = CASOS_ORACULO.retrad_laje_param!;
  const materiais: MateriaisSistrut = { ...E2E, fck: sng(0.2), classeAco: "A", gamaF: sng(1.5) };
  const parametros = { ...PARAM, eficienciaNegativa: sng(0.9) };
  for (const nome of ["L1", "L2", "L3", "L4"]) {
    it(nome, () => {
      const a = armadurasLaje(
        momentosDeTeste(nome, 10, COEF.e2e, 0.8, BORDOS_E2E[nome]!),
        materiais,
        parametros,
        "original",
      );
      confere(caso, `${nome}.As+princ`, a.asPositivaPrincipal);
      confere(caso, `${nome}.As+sec`, a.asPositivaSecundaria);
      confere(caso, `${nome}.As-maior`, a.asNegativaMaior);
      confere(caso, `${nome}.As-menor`, a.asNegativaMenor);
    });
  }
});

describe("retrad_laje_calc2: sem continuidade, L1 a 90° com um engaste, L2 com μ 1,5", () => {
  const caso = CASOS_ORACULO.retrad_laje_calc2!;
  const lajes: Record<string, MomentosDeLaje> = {
    // L1: só um bordo engastado, i 2,0; fator 1 (bordo de 5 m, perpendicular à
    // direção principal a 90°); μ 1,1 (razão das cordas 1,25).
    L1: momentosDeTeste("L1", 10, COEF.c2L1, 1.1, [
      [0, 1],
      [22, 1],
      [0, 1],
      [0, 1],
    ]),
    L2: momentosDeTeste("L2", 10, COEF.c2L2, 1.5, [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]),
    L3: momentosDeTeste("L3", 10, COEF.c2L3, 0.8, [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]),
    L4: momentosDeTeste("L4", 10, COEF.c2L3, 0.8, [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]),
  };
  for (const [nome, m] of Object.entries(lajes)) {
    it(nome, () => {
      // Confere a entrada: o M+ da conta à mão bate com o impresso.
      confere(caso, `${nome}.M+princ`, m.mPositivoPrincipalTcm / 100);
      confere(caso, `${nome}.M+sec`, m.mPositivoSecundarioTcm / 100);
      const a = armadurasLaje(m, E2E, PARAM, "original");
      confere(caso, `${nome}.As+princ`, a.asPositivaPrincipal);
      confere(caso, `${nome}.As+sec`, a.asPositivaSecundaria);
      confere(caso, `${nome}.As-maior`, a.asNegativaMaior);
      confere(caso, `${nome}.As-menor`, a.asNegativaMenor);
    });
  }
});

describe("regras −1 e 0 das colunas (LAJECALC.BAS:663-731)", () => {
  it("M+ ≤ 0: principal com o mínimo, secundária −1, negativas 0", () => {
    const m = {
      ...momentosDeTeste("L", 10, COEF.e2e, 0.8, BORDOS_E2E.L1!),
      mPositivoPrincipalTcm: 0,
    };
    const a = armadurasLaje(m, E2E, PARAM, "original");
    expect(a.asPositivaPrincipal).toBeCloseTo(1.5, 6);
    expect(a.asPositivaSecundaria).toBe(-1);
    expect(a.asNegativaMaior).toBe(0);
    expect(a.asNegativaMenor).toBe(0);
  });
  it("negativa que não passa: −1, e a imposição fica sem barra", () => {
    // H 6 com o M do E2E: x/d 0,64 > ξlim (livros_laje.md 2.4).
    const m = momentosDeTeste("L1", 6, COEF.e2e, 0.8, BORDOS_E2E.L1!);
    const a = armadurasLaje(m, E2E, PARAM, "original");
    expect(a.asNegativaMaior).toBe(-1);
    expect(secaoDeMaiorX(m, E2E, PARAM, "original")).toMatchObject({ x: -1, barra: { ok: false } });
  });
});

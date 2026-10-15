// Referências: espessuras mínimas impressas pelo original (caso_a_laje,
// retrad_laje_calc2, retrad_laje_param) e as contas à mão de livros_laje.md 2.4. O
// callback de momentos usa o coeficiente de carga da conta à mão (ver
// armaduras.test.ts): E2E 2,0179828; calc2 L1 1,5935955, L2 0,8812836, L3/L4 1,0173877.
// R1 (corrigido): flecha à mão com Ec = 0,9·6600·√(14,71 + 3,5) MPa = 258,48 t/cm².
import { describe, expect, it } from "vitest";
import { type CasoOraculo, CASOS_ORACULO, bateComImpresso, valorOraculo } from "../__oraculo__";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type { DadosFlechaLaje, MateriaisSistrut, MomentosDeLaje } from "../base/tipos";
import { espessuraMinimaLaje } from "./espessura";

const PARAM = emSingle(PARAMETROS_LAJE);
const E2E: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};

/** Momentos com H dado (livros_laje.md 1.8): q = 3/20 + H·2,5/100 + 0,10, p = q/coef,
 *  M+ = 100·p; bordos [código, fator]. */
const momentosComH =
  (coef: number, mu: number, bordos: [number, number][]) =>
  (h: number): MomentosDeLaje => {
    const qExt = 3 / 20 + (1 / 100) * h * sng(2.5) + sng(0.1);
    const p = sng(qExt / sng(coef));
    const mPos = sng(100 * p);
    return {
      nome: "L",
      h,
      q: sng(qExt),
      qSemArredondar: qExt,
      p,
      pesoProprio: sng((1 / 100) * h * sng(2.5)),
      coeficiente: {
        coeficiente: sng(coef),
        l1a: 0,
        l32: 0,
        l1e: 0,
        l22: 0,
        l26: 0,
        l2a: 0,
        l2e: 0,
      },
      mPositivoPrincipalTcm: mPos,
      mPositivoSecundarioTcm: sng(mu <= 1 ? mPos * mu : mPos / mu),
      mNegativoMaiorTcm: 0,
      mNegativoMenorTcm: 0,
      bordos: bordos.map(([codigo, fator]) => ({
        fatorDirecao: sng(fator),
        coeficiente: codigo > 2 ? sng(((codigo - 2) * fator) / 10) : 0,
      })),
    };
  };

const E2E_L1 = momentosComH(2.017982780617627, 0.8, [
  [22, 0.8],
  [22, 1],
  [0, 0.8],
  [0, 1],
]);

function confere(caso: CasoOraculo, id: string, calculado: number) {
  const v = valorOraculo(caso, id);
  expect(
    bateComImpresso(v, calculado),
    `${caso.caso} ${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
}

/** Confere H, x/d, barra, pp, p e L/f (0: o original não calcula flecha). */
function confereEspessura(
  caso: CasoOraculo,
  nome: string,
  r: ReturnType<typeof espessuraMinimaLaje>,
) {
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  confere(caso, `${nome}.Hmin`, r.h);
  confere(caso, `${nome}.Hmin.x/d`, r.xd);
  expect(r.barra.ok).toBe(true);
  if (r.barra.ok) {
    confere(caso, `${nome}.Hmin.As.phi`, r.barra.bitola);
    confere(caso, `${nome}.Hmin.As.s`, r.barra.espacamento);
  }
  confere(caso, `${nome}.Hmin.pp`, r.pesoProprio);
  confere(caso, `${nome}.Hmin.p`, r.q);
  confere(caso, `${nome}.Hmin.L/f`, r.flecha?.flecha ?? 0);
}

describe("caso_a_laje: H mínimo 7,0, x/d 0,382, # 6.3 c/ 7.5", () => {
  const caso = CASOS_ORACULO.caso_a_laje!;
  const bordos: Record<string, [number, number][]> = {
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
  for (const [nome, b] of Object.entries(bordos)) {
    it(nome, () => {
      const r = espessuraMinimaLaje(
        momentosComH(2.017982780617627, 0.8, b),
        E2E,
        PARAM,
        "original",
      );
      confereEspessura(caso, nome, r);
    });
  }
});

describe("retrad_laje_calc2", () => {
  const caso = CASOS_ORACULO.retrad_laje_calc2!;
  const lajes = {
    L1: momentosComH(1.5935955177529804, 1.1, [
      [0, 1],
      [22, 1],
      [0, 1],
      [0, 1],
    ]),
    L2: momentosComH(0.8812836071035194, 1.5, [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]),
    L3: momentosComH(1.0173876675448086, 0.8, [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]),
    L4: momentosComH(1.0173876675448086, 0.8, [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ]),
  };
  for (const [nome, m] of Object.entries(lajes)) {
    it(nome, () => confereEspessura(caso, nome, espessuraMinimaLaje(m, E2E, PARAM, "original")));
  }
});

describe("retrad_laje_param: H mínimo 6,0, x/d 0,472, # 8.0 c/10.0", () => {
  const caso = CASOS_ORACULO.retrad_laje_param!;
  const materiais: MateriaisSistrut = { ...E2E, fck: sng(0.2), classeAco: "A", gamaF: sng(1.5) };
  const parametros = { ...PARAM, eficienciaNegativa: sng(0.9) };
  for (const nome of ["L1", "L2", "L3", "L4"]) {
    it(nome, () =>
      confereEspessura(caso, nome, espessuraMinimaLaje(E2E_L1, materiais, parametros, "original")),
    );
  }
});

describe("sem H até Hmax", () => {
  it("coeficiente 0,05 (M ≈ 40 vezes o E2E): H necessário > H máximo", () => {
    const r = espessuraMinimaLaje(momentosComH(0.05, 0.8, [[22, 1]]), E2E, PARAM, "original");
    expect(r).toEqual({ ok: false });
  });
});

describe("corrigido (R1): flecha na procura de H", () => {
  const vinculosE2E: DadosFlechaLaje["vinculos"] = {
    esquerdo: "apoiado",
    direito: "engastado",
    inferior: "engastado",
    superior: "apoiado",
  };
  it("E2E L1, H 7: flecha 1,248 cm ≤ 400/300 = 1,333 (Marcus, cx = cy = 2, kx 0,709); H continua 7", () => {
    const flecha: DadosFlechaLaje = { lx: 4, ly: 5, vinculos: vinculosE2E, acidental: 0.15 };
    const r = espessuraMinimaLaje(E2E_L1, E2E, PARAM, "corrigido", flecha);
    expect(r).toMatchObject({ ok: true, h: 7 });
    if (!r.ok) return;
    expect(r.flecha?.flecha).toBeCloseTo(1.2483, 3);
    expect(r.flecha?.limite).toBeCloseTo(1.3333, 4);
  });
  it("6 × 6 apoiada: a flexão passa com H 6, a flecha pede H 15 (14: 2,141 > 2; 15: 1,828)", () => {
    const flecha: DadosFlechaLaje = {
      lx: 6,
      ly: 6,
      vinculos: {
        esquerdo: "apoiado",
        direito: "apoiado",
        inferior: "apoiado",
        superior: "apoiado",
      },
      acidental: 0.15,
    };
    const m = momentosComH(2.017982780617627, 1, [[0, 1]]);
    expect(espessuraMinimaLaje(m, E2E, PARAM, "corrigido")).toMatchObject({ ok: true, h: 6 });
    const r = espessuraMinimaLaje(m, E2E, PARAM, "corrigido", flecha);
    expect(r).toMatchObject({ ok: true, h: 15 });
    if (r.ok) expect(r.flecha?.flecha).toBeCloseTo(1.828, 3);
  });
  it("modo original ignora os dados de flecha (defeito R1 reproduzido)", () => {
    const flecha: DadosFlechaLaje = { lx: 4, ly: 5, vinculos: vinculosE2E, acidental: 0.15 };
    const r = espessuraMinimaLaje(E2E_L1, E2E, PARAM, "original", flecha);
    expect(r).toMatchObject({ ok: true, h: 7 });
    if (r.ok) expect(r.flecha).toBeUndefined();
  });
});

// Referências: retrad_lajeproc (tela de modificação da L1 depois da escolha
// automática; livros_laje.md 2.5) e contas à mão para R2, posições impostas e
// armadura imposta na continuidade. O M+ de entrada vem do coeficiente de carga da
// conta à mão do E2E, 2,0179828 (ver armaduras.test.ts).
import { describe, expect, it } from "vitest";
import { type CasoOraculo, CASOS_ORACULO, bateComImpresso, valorOraculo } from "../__oraculo__";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type {
  Continuidade,
  EsforcosLajes,
  LajeSistrut,
  MateriaisSistrut,
  MomentosDeLaje,
  PosicaoLajeproc,
} from "../base/tipos";
import { lajeproc } from "./proc";

const PARAM = emSingle(PARAMETROS_LAJE);
const E2E: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};
/** M+ do E2E com H 10: 100·(0,5/2,0179828) = 24,777 t·cm/m (livros_laje.md 2.2). */
const M_E2E = sng(100 * sng(0.5 / sng(2.017982780617627)));

function momentos(
  nome: string,
  mPos: number,
  codigos: number[],
  fatores: number[],
): MomentosDeLaje {
  return {
    nome,
    h: 10,
    q: sng(0.5),
    qSemArredondar: 0.5,
    // M+ dado: p = M+/100
    p: mPos / 100,
    pesoProprio: sng(0.25),
    coeficiente: {
      coeficiente: sng(2.017982780617627),
      l1a: 0,
      l32: 0,
      l1e: 0,
      l22: 0,
      l26: 0,
      l2a: 0,
      l2e: 0,
    },
    mPositivoPrincipalTcm: mPos,
    mPositivoSecundarioTcm: sng(mPos * sng(0.8)),
    mNegativoMaiorTcm: 0,
    mNegativoMenorTcm: 0,
    bordos: codigos.map((codigo, i) => ({
      fatorDirecao: sng(fatores[i]!),
      coeficiente: codigo > 2 ? sng(((codigo - 2) * fatores[i]!) / 10) : 0,
    })),
  };
}

const laje = (nome: string, codigos: number[], extra: Partial<LajeSistrut> = {}): LajeSistrut => ({
  nome,
  tipo: 0,
  vertices: [],
  indicesVertices: [],
  grupo: 0,
  codigos,
  angulo: 0,
  mu: sng(0.8),
  cargaPermanente: sng(0.1),
  pesoProprio: sng(0.25),
  h: 10,
  ...extra,
});

function esforcosDe(
  lajes: LajeSistrut[],
  continuidades: Continuidade[],
  mPositivo: Record<string, number>,
  fatores: Record<string, number[]>,
): EsforcosLajes {
  const m = Object.fromEntries(
    lajes.map((l) => [l.nome, momentos(l.nome, mPositivo[l.nome]!, l.codigos, fatores[l.nome]!)]),
  );
  return {
    lajes,
    continuidades,
    preparadas: {},
    coeficientes: {},
    bordos: Object.fromEntries(lajes.map((l) => [l.nome, m[l.nome]!.bordos])),
    momentos: m,
    avisos: [],
    memoria: [],
  };
}

/** Painel E2E: bordos base, direita, topo, esquerda; fator 0,8 no horizontal. */
const FATORES = [0.8, 1, 0.8, 1];
const CONTINUIDADES_E2E: Continuidade[] = [
  { lajeA: "L1", bordoA: 1, lajeB: "L2", bordoB: 3 },
  { lajeA: "L1", bordoA: 0, lajeB: "L3", bordoB: 2 },
  { lajeA: "L2", bordoA: 0, lajeB: "L4", bordoB: 2 },
  { lajeA: "L3", bordoA: 1, lajeB: "L4", bordoB: 3 },
];
const esforcosE2E = (
  lajes = [
    laje("L1", [22, 22, 0, 0]),
    laje("L2", [22, 0, 0, 22]),
    laje("L3", [0, 22, 22, 0]),
    laje("L4", [0, 0, 22, 22]),
  ],
) =>
  esforcosDe(
    lajes,
    CONTINUIDADES_E2E,
    { L1: M_E2E, L2: M_E2E, L3: M_E2E, L4: M_E2E },
    { L1: FATORES, L2: FATORES, L3: FATORES, L4: FATORES },
  );

function conferePosicao(caso: CasoOraculo, prefixo: string, p: PosicaoLajeproc, comM = true) {
  const confere = (id: string, calculado: number) => {
    const v = valorOraculo(caso, id);
    expect(
      bateComImpresso(v, calculado),
      `${id}: impresso ${v.impresso}, calculado ${calculado}`,
    ).toBe(true);
  };
  if (comM) confere(prefixo.replace("As", "M"), p.mTcm / 100);
  confere(prefixo, p.as);
  expect(p.barra.ok).toBe(true);
  if (!p.barra.ok) return;
  confere(`${prefixo}.phi`, p.barra.bitola);
  confere(`${prefixo}.s`, p.barra.espacamento);
}

describe("retrad_lajeproc: L1 do E2E", () => {
  const caso = CASOS_ORACULO.retrad_lajeproc!;
  for (const modo of ["original", "corrigido"] as const) {
    it(`${modo}: # 6.3 c/ 20, c/ 20, c/12.5 (com L2), c/17.5 (com L3)`, () => {
      const r = lajeproc(esforcosE2E(), E2E, PARAM, modo);
      conferePosicao(caso, "L1.As+princ", r.positivas.L1!.principal);
      conferePosicao(caso, "L1.As+sec", r.positivas.L1!.secundaria);
      conferePosicao(caso, "L1.As-maior", r.negativas[0]!);
      conferePosicao(caso, "L1.As-menor", r.negativas[1]!);
      // Uma negativa por continuidade, gravada com código negativo −(1000·bitola + s).
      expect(r.negativas.map((n) => n.continuidade.armaduraImposta)).toEqual([
        -2003, -2005, -2005, -2003,
      ]);
      expect(r.avisos).toEqual([]);
    });
  }
});

describe("R2: vizinho com o mesmo número de lado (LAJEPROC.BAS:836)", () => {
  // L1 lado 2 (índice 1) contínuo com o lado 2 de L2. L2 com M+ 30 → M− 60 → As 2,620
  // (# 6.3 c/10); L1 com M− 49,55 → As 2,130 (c/12.5). L2 é processada antes; a L1, por
  // último, regrava a continuidade.
  const esforcos = esforcosDe(
    [laje("L2", [0, 22, 0, 0]), laje("L1", [0, 22, 0, 0])],
    [{ lajeA: "L1", bordoA: 1, lajeB: "L2", bordoB: 1 }],
    { L1: M_E2E, L2: 30 },
    { L1: FATORES, L2: FATORES },
  );
  it("original: a L1 não recalcula o vizinho e fica com 2,13 # 6.3 c/12.5, com aviso", () => {
    const r = lajeproc(esforcos, E2E, PARAM, "original");
    expect(r.negativas[0]!.as).toBeCloseTo(2.1299, 3);
    expect(r.negativas[0]!.barra).toMatchObject({ ok: true, espacamento: 12.5 });
    expect(r.avisos.join(" ")).toContain("não foi recalculado, como no SISTRUT original");
    expect(r.memoria.some((m) => m.ref === "LAJEPROC.BAS:836, 855")).toBe(true);
  });
  it("corrigido: usa o maior As dos dois lados, 2,620 # 6.3 c/10", () => {
    const r = lajeproc(esforcos, E2E, PARAM, "corrigido");
    expect(r.negativas[0]!.as).toBeCloseTo(2.6198, 3);
    expect(r.negativas[0]!.mTcm).toBeCloseTo(60, 4);
    expect(r.negativas[0]!.barra).toMatchObject({ ok: true, espacamento: 10 });
  });
});

describe("posições impostas", () => {
  it("positiva imposta fica se basta (8.0 c/20 = 2,50 ≥ 1,50) e é trocada se não (5.0 c/20 = 1,00 < 1,50)", () => {
    const lajes = [
      laje("L1", [22, 22, 0, 0], { armaduraImposta: { principal: -3006, secundaria: -1006 } }),
      laje("L2", [22, 0, 0, 22]),
      laje("L3", [0, 22, 22, 0]),
      laje("L4", [0, 0, 22, 22]),
    ];
    const r = lajeproc(esforcosE2E(lajes), E2E, PARAM, "original");
    expect(r.positivas.L1!.principal.barra).toMatchObject({ ok: true, bitola: 8, espacamento: 20 });
    expect(r.positivas.L1!.secundaria.barra).toMatchObject({
      ok: true,
      bitola: sng(6.3),
      espacamento: 20,
    });
  });
  it("negativa imposta pelo LAJECALC só é conferida: 2012 (6.3 s 12, 2,625) basta; 2020 (1,575) não, com aviso", () => {
    const base = esforcosE2E();
    const com = (codigo: number) => ({
      ...base,
      continuidades: base.continuidades.map((c, i) =>
        i === 0 ? { ...c, armaduraImposta: codigo } : c,
      ),
    });
    const basta = lajeproc(com(2012), E2E, PARAM, "original");
    expect(basta.negativas[0]!.continuidade.armaduraImposta).toBe(2012);
    expect(basta.negativas[0]!.barra).toMatchObject({ ok: true, espacamento: 12 });
    expect(basta.avisos).toEqual([]);
    const falta = lajeproc(com(2020), E2E, PARAM, "original");
    expect(falta.negativas[0]!.continuidade.armaduraImposta).toBe(2020);
    expect(falta.avisos).toHaveLength(2); // uma vez por laje da continuidade
  });
});

describe("tipos pulados", () => {
  it("pré-moldada (1) e comum não calculada (3) não entram", () => {
    const lajes = [
      laje("L1", [22, 22, 0, 0], { tipo: 1 }),
      laje("L2", [22, 0, 0, 22], { tipo: 3 }),
      laje("L3", [0, 22, 22, 0]),
      laje("L4", [0, 0, 22, 22]),
    ];
    const r = lajeproc(esforcosE2E(lajes), E2E, PARAM, "original");
    expect(Object.keys(r.positivas)).toEqual(["L3", "L4"]);
  });
});

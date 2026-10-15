// Esforços do painel contra o que o SISTRUT original imprimiu (oráculo).
import { describe, expect, it } from "vitest";
import {
  CASOS_ORACULO,
  type CasoOraculo,
  bateComImpresso,
  numeroOraculo,
  valorOraculo,
} from "../__oraculo__";
import { PARAMETROS_LAJE, emSingle } from "../base/parametros";
import type { LajeSistrut, ModoSistrut, PainelLajes, Ponto } from "../base/tipos";
import { esforcosDoPainel, esforcosDoPainelCom } from "./esforcos";
import { momentosComCoeficiente } from "./momentos";

const f = Math.fround;
const CASO_A = CASOS_ORACULO.caso_a_laje as CasoOraculo;
const CALC2 = CASOS_ORACULO.retrad_laje_calc2 as CasoOraculo;
const PARAM = CASOS_ORACULO.retrad_laje_param as CasoOraculo;
const PROC = CASOS_ORACULO.retrad_lajeproc as CasoOraculo;

// Obra E2E (caso_a_laje, entrada): 4 lajes maciças 4 × 5 m, H 10, permanente 0,10,
// ocupação 0,15 em todo o contorno. Vértices no sentido horário, na ordem dos bordos
// que o LAJEMONT imprime (impressora.prn:131-146: L1 → V4, V1, V5, V2).
// Índices globais dos nós: (0,0) 1, (4,0) 2, (8,0) 3, (0,5) 4, (4,5) 5, (8,5) 6,
// (0,10) 7, (4,10) 8, (8,10) 9.
const no: Record<number, Ponto> = {
  1: { x: 0, y: 0 },
  2: { x: 4, y: 0 },
  3: { x: 8, y: 0 },
  4: { x: 0, y: 5 },
  5: { x: 4, y: 5 },
  6: { x: 8, y: 5 },
  7: { x: 0, y: 10 },
  8: { x: 4, y: 10 },
  9: { x: 8, y: 10 },
};
/** Entrada como o original a leu (SINGLE) ou decimal (corrigido). */
let num = f;
function laje(nome: string, indices: number[], extra: Partial<LajeSistrut> = {}): LajeSistrut {
  return {
    nome,
    tipo: 0,
    vertices: indices.map((i) => no[i] ?? { x: NaN, y: NaN }),
    indicesVertices: indices,
    grupo: 0,
    codigos: indices.map(() => 0),
    angulo: 0,
    mu: 0,
    cargaPermanente: num(0.1),
    pesoProprio: num(0.25),
    h: 10,
    ...extra,
  };
}
const lajesE2E = () => [
  laje("L1", [4, 7, 8, 5]),
  laje("L2", [6, 5, 8, 9]),
  laje("L3", [1, 4, 5, 2]),
  laje("L4", [3, 2, 5, 6]),
];
const painelE2E = (lajes = lajesE2E(), continuidades: PainelLajes["continuidades"] = []) => ({
  lajes,
  cargasPorArea: [
    {
      vertices: [no[1], no[7], no[9], no[3]].map((p) => p ?? { x: NaN, y: NaN }),
      total: num(0.15),
      acidental: num(0.15),
    },
  ],
  alvenarias: [],
  continuidades,
});
const parametros = (modo: ModoSistrut) => {
  num = modo === "original" ? f : (x: number) => x;
  return modo === "original" ? emSingle(PARAMETROS_LAJE) : PARAMETROS_LAJE;
};

/** Confere os quatro momentos impressos da laje (t·m/m; o cálculo guarda t·cm/m). */
function confereMomentos(
  caso: CasoOraculo,
  nome: string,
  m: {
    mPositivoPrincipalTcm: number;
    mPositivoSecundarioTcm: number;
    mNegativoMaiorTcm: number;
    mNegativoMenorTcm: number;
  },
  sufixo = "",
) {
  const pares: [string, number][] = [
    [`${nome}.M+princ${sufixo}`, Math.max(m.mPositivoPrincipalTcm, 0) / 100],
    [`${nome}.M+sec${sufixo}`, m.mPositivoSecundarioTcm / 100],
    [`${nome}.M-maior${sufixo}`, m.mNegativoMaiorTcm / 100],
    [`${nome}.M-menor${sufixo}`, m.mNegativoMenorTcm / 100],
  ];
  for (const [id, calculado] of pares) {
    const v = valorOraculo(caso, id);
    expect(
      bateComImpresso(v, calculado),
      `${id}: impresso ${v.impresso}, calculado ${calculado}`,
    ).toBe(true);
  }
}

describe.each<ModoSistrut>(["original", "corrigido"])("E2E (caso_a_laje), modo %s", (modo) => {
  const p = parametros(modo);
  const e = esforcosDoPainel(painelE2E(), p, modo);

  it("continuidade automática: 4 trechos com código 22", () => {
    expect(e.continuidades).toHaveLength(4);
    expect(e.lajes.find((l) => l.nome === "L1")?.codigos).toEqual([0, 0, 22, 22]);
  });

  it.each(["L1", "L2", "L3", "L4"])(
    "%s: M+ e M− antes da otimização (impressora.prn:44-47)",
    (nome) => {
      const m = e.momentos[nome];
      expect(m).toBeDefined();
      if (m) confereMomentos(CASO_A, nome, m, ".preOtim");
    },
  );

  it.each(["L1", "L2", "L3", "L4"])(
    "%s: M+ e M− depois da otimização (impressora.prn:78-81)",
    (nome) => {
      // Na otimização (livros_laje.md 1.14; LAJECALC.BAS:2107) nada muda quando os
      // negativos dos dois lados diferem menos de 10 %: é o caso de toda continuidade
      // do E2E (diferem só no último bit), logo os momentos finais são os mesmos.
      for (const c of e.continuidades) {
        const ma = e.momentos[c.lajeA];
        const mb = c.lajeB ? e.momentos[c.lajeB] : undefined;
        const ca = e.bordos[c.lajeA]?.[c.bordoA]?.coeficiente;
        const cb = c.lajeB ? e.bordos[c.lajeB]?.[c.bordoB]?.coeficiente : undefined;
        if (!ma || !mb || ca === undefined || cb === undefined)
          throw new Error("continuidade sem laje");
        const m1 = ma.mPositivoPrincipalTcm * ca;
        const m2 = mb.mPositivoPrincipalTcm * cb;
        expect(Math.abs(m1 - m2) / Math.max(m1, m2)).toBeLessThan(0.1);
      }
      const m = e.momentos[nome];
      if (m) confereMomentos(CASO_A, nome, m);
    },
  );

  it("coeficiente de carga 2,0180 na memória (livros_laje.md 2.1)", () => {
    const etapa = e.memoria.find((x) => x.descricao.startsWith("L1: coeficiente de carga"));
    expect(etapa?.valor).toBeCloseTo(2.018, 4);
  });

  it.each(["L1", "L2", "L3", "L4"])(
    "%s: peso próprio e carga total com H 10 (impressora.prn:27-30)",
    (nome) => {
      const m = e.momentos[nome];
      expect(bateComImpresso(valorOraculo(CASO_A, `${nome}.pp`), m?.pesoProprio ?? NaN)).toBe(true);
      expect(bateComImpresso(valorOraculo(CASO_A, `${nome}.p`), m?.q ?? NaN)).toBe(true);
      expect(m?.h).toBe(numeroOraculo(CASO_A, `${nome}.H.mom`));
    },
  );

  it.each(["L1", "L2", "L3", "L4"])("%s: coluna 'Acid.' = ocupação total / área (D3)", (nome) => {
    const p = e.preparadas[nome];
    if (!p) throw new Error("sem preparação");
    expect(
      bateComImpresso(valorOraculo(CASO_A, `${nome}.acid`), (p.alvenaria + p.cargaArea) / p.area),
    ).toBe(true);
  });

  it.each(["L1", "L2", "L3", "L4"])(
    "%s: peso próprio e carga com o H mínimo impresso (impressora.prn:10-13)",
    (nome) => {
      const c = e.coeficientes[nome];
      const pr = e.preparadas[nome];
      const l = e.lajes.find((x) => x.nome === nome);
      if (!c || !pr || !l) throw new Error("laje não calculada");
      const h = numeroOraculo(CASO_A, `${nome}.Hmin`);
      const m = momentosComCoeficiente(l, pr.alvenaria, pr.cargaArea, pr.area, h, c, p, modo);
      expect(bateComImpresso(valorOraculo(CASO_A, `${nome}.Hmin.pp`), m.pesoProprio)).toBe(true);
      expect(bateComImpresso(valorOraculo(CASO_A, `${nome}.Hmin.p`), m.q)).toBe(true);
    },
  );
});

describe.each<ModoSistrut>(["original", "corrigido"])("retrad_laje_calc2, modo %s", (modo) => {
  const p = parametros(modo);
  // Continuidade eliminada; só o primeiro trecho da L1 engastado (bordo x = 0, sem
  // vizinha); L1 com direção 90°; L2 com relação 1,5; L3 e L4 pelas cordas.
  const lajes = lajesE2E().map((l) =>
    l.nome === "L1"
      ? { ...l, codigos: [22, 0, 0, 0], angulo: 90 }
      : l.nome === "L2"
        ? { ...l, mu: num(1.5) }
        : l,
  );
  const e = esforcosDoPainel(
    painelE2E(lajes, [{ lajeA: "L1", bordoA: 0, lajeB: null, bordoB: 0 }]),
    p,
    modo,
  );

  it.each(["L1", "L2", "L3", "L4"])("%s: momentos (impressora.prn:52-55)", (nome) => {
    const m = e.momentos[nome];
    expect(m).toBeDefined();
    if (m) confereMomentos(CALC2, nome, m);
  });

  it("L2: relação vigente lida da obra = μ pelas cordas a 0° (telas/015_k14.txt:25)", () => {
    const sem = esforcosDoPainel(painelE2E(), p, modo);
    const mu = sem.lajes.find((l) => l.nome === "L2")?.mu ?? NaN;
    expect(bateComImpresso(valorOraculo(CALC2, "L2.relacao.vigente"), mu)).toBe(true);
  });

  it.each(["L1", "L2", "L3", "L4"])(
    "%s: peso próprio e carga com o H mínimo impresso (impressora.prn:10-13)",
    (nome) => {
      const c = e.coeficientes[nome];
      const pr = e.preparadas[nome];
      const l = e.lajes.find((x) => x.nome === nome);
      if (!c || !pr || !l) throw new Error("laje não calculada");
      const h = numeroOraculo(CALC2, `${nome}.Hmin`);
      const m = momentosComCoeficiente(l, pr.alvenaria, pr.cargaArea, pr.area, h, c, p, modo);
      expect(bateComImpresso(valorOraculo(CALC2, `${nome}.Hmin.pp`), m.pesoProprio)).toBe(true);
      expect(bateComImpresso(valorOraculo(CALC2, `${nome}.Hmin.p`), m.q)).toBe(true);
    },
  );
});

describe("retrad_laje_param: γf 1,5, fck 0,2, aço A e eficiência 90 % não mudam os momentos", () => {
  const p = emSingle({ ...PARAMETROS_LAJE, gamaF: 1.5, fck: 0.2, eficienciaNegativa: 0.9 });
  const e = esforcosDoPainel(painelE2E(), p, "original");
  it.each(["L1", "L2", "L3", "L4"])("%s: momentos (impressora.prn:27-30)", (nome) => {
    const m = e.momentos[nome];
    if (m) confereMomentos(PARAM, nome, m);
    expect(m).toBeDefined();
  });
  it.each(["L1", "L2", "L3", "L4"])(
    "%s: peso próprio e carga com H 6 (impressora.prn:10-13)",
    (nome) => {
      const c = e.coeficientes[nome];
      const pr = e.preparadas[nome];
      const l = e.lajes.find((x) => x.nome === nome);
      if (!c || !pr || !l) throw new Error("laje não calculada");
      const m = momentosComCoeficiente(
        l,
        pr.alvenaria,
        pr.cargaArea,
        pr.area,
        numeroOraculo(PARAM, `${nome}.Hmin`),
        c,
        p,
        "original",
      );
      expect(bateComImpresso(valorOraculo(PARAM, `${nome}.Hmin.pp`), m.pesoProprio)).toBe(true);
      expect(bateComImpresso(valorOraculo(PARAM, `${nome}.Hmin.p`), m.q)).toBe(true);
    },
  );
});

describe("retrad_lajeproc: positivos da L1 na tela do LAJEPROC", () => {
  const e = esforcosDoPainel(painelE2E(), emSingle(PARAMETROS_LAJE), "original");
  it("M+ principal e secundário (telas/011_m01.txt:12, 15)", () => {
    const m = e.momentos.L1;
    expect(
      bateComImpresso(valorOraculo(PROC, "L1.M+princ"), (m?.mPositivoPrincipalTcm ?? NaN) / 100),
    ).toBe(true);
    expect(
      bateComImpresso(valorOraculo(PROC, "L1.M+sec"), (m?.mPositivoSecundarioTcm ?? NaN) / 100),
    ).toBe(true);
  });
});

describe("otimização injetada (T2)", () => {
  it("recebe os esforços e um recálculo que refaz a laje com os códigos dados", () => {
    const p = emSingle(PARAMETROS_LAJE);
    let chamada = 0;
    const e = esforcosDoPainelCom((esforcos, recalcula) => {
      chamada += 1;
      const l1 = esforcos.lajes.find((l) => l.nome === "L1");
      if (!l1) throw new Error("sem L1");
      // mesmos códigos: o recálculo reproduz os momentos
      expect(recalcula(l1)).toEqual(esforcos.momentos.L1);
      // apoiando a L1 (códigos 0), o negativo some e o M+ cresce
      const apoiada = recalcula({ ...l1, codigos: [0, 0, 0, 0] });
      expect(apoiada.mNegativoMaiorTcm).toBe(0);
      expect(apoiada.mPositivoPrincipalTcm).toBeGreaterThan(
        esforcos.momentos.L1?.mPositivoPrincipalTcm ?? Infinity,
      );
      return { ...esforcos, avisos: [...esforcos.avisos, "otimizado"] };
    })(painelE2E(), p, "original");
    expect(chamada).toBe(1);
    expect(e.avisos).toContain("otimizado");
  });
});

describe("avisos do painel", () => {
  it("laje sem H: preparação e coeficiente existem, momentos não", () => {
    const lajes = lajesE2E();
    const { h: _h, ...semH } = lajes[3] ?? laje("L4", [3, 2, 5, 6]);
    const e = esforcosDoPainel(
      painelE2E([...lajes.slice(0, 3), semH]),
      emSingle(PARAMETROS_LAJE),
      "original",
    );
    expect(e.coeficientes.L4).toBeDefined();
    expect(e.momentos.L4).toBeUndefined();
    expect(e.avisos.some((a) => a.startsWith("L4: sem H"))).toBe(true);
  });

  it("laje anti-horária vira aviso, sem derrubar o painel", () => {
    const lajes = lajesE2E().map((l) =>
      l.nome === "L1"
        ? {
            ...l,
            vertices: [...l.vertices].reverse(),
            indicesVertices: [...l.indicesVertices].reverse(),
          }
        : l,
    );
    const e = esforcosDoPainel(painelE2E(lajes), emSingle(PARAMETROS_LAJE), "original");
    expect(e.momentos.L1).toBeUndefined();
    expect(e.momentos.L2).toBeDefined();
    expect(e.avisos.some((a) => a.startsWith("L1: não calculada"))).toBe(true);
  });
});

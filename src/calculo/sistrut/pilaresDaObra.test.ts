// Pilares de ponta a ponta: cada caso de pilar do oráculo vira uma obra da V2, passa
// por `calcularObraSistrut` no modo original e TODO valor impresso do caso é
// conferido (meia unidade da última casa impressa; `trunca` onde o original trunca).
// Um id sem cálculo ou diferente falha o teste.
//
// - PILAR opção 6 (`Pilar.verificacoes` com esforços digitados): caso_c_pilar,
//   retrad_pil_verif2, retrad_pil_trava, v2par_pilar_mk, v2par_pilar_lambda,
//   v2par_pilar_trava. Seção e barras do PILDADOS (PILAR.BAS:3521-3542).
// - PILAREDI sobre a obra E2E (o .REP sai das vigas da obra: P5 = 17,37 t):
//   caso_c_pilaredi e retrad_pil_secoes/poliinv com o P5 circular ou poligonal
//   (`Pilar.secao`), v2par_pilar_niveis com o pavimento repetido 3 vezes e o P5 25 × 40;
//   predimensionamento com `parametrosPilar.predimensionamento = "tensoes"`.
// Runs: C:/tmp/oraculo/runs/ (o `run` de cada JSON). Os números estão nos JSONs; o
// teste não precisa dos runs.
/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BarraPilarObra, Obra, Pilar } from "../../dominio/obra";
import { obraE2E } from "./__e2e__/obraE2E";
import { bateComImpresso, CASOS_ORACULO, type CasoOraculo } from "./__oraculo__";
import { KN_POR_TF } from "./base/unidades";
import type { CasoPilar, VerificacaoPilar } from "./base/tipos";
import { calcularObraSistrut, type LancePilarSistrut, type ResultadoSistrut } from "./obra";
import { CASOS_PILAR } from "./pilares/__casos__";
import { importarPilaresSistrut } from "../../armazenamento/sistrut/pilar";

type Valor = number | string | undefined;

/** Confere todos os valores do caso com `calcula`; devolve os ids sem cálculo e os
 *  diferentes. `calcula` devolve `true` para um id conferido por outra regra. */
function confere(caso: CasoOraculo, calcula: (id: string) => Valor | boolean) {
  const faltando: string[] = [];
  const difere: string[] = [];
  for (const v of caso.valores) {
    const c = calcula(v.id);
    if (c === undefined) faltando.push(v.id);
    else if (c === false) difere.push(`${v.id}: impresso ${v.impresso}`);
    else if (c === true) continue;
    else if (typeof c === "string") {
      if (c.trim() !== v.impresso.trim())
        difere.push(`${v.id}: impresso ${v.impresso}, calculado ${c}`);
    } else {
      const sinal = v.impresso.trim().startsWith("-") ? c < 0 : true;
      if (!bateComImpresso(v, c) || !sinal)
        difere.push(`${v.id}: impresso ${v.impresso}, calculado ${c}`);
    }
  }
  return { faltando, difere };
}

const textoVeredito = (v: string) => (v === "INSTABILIDADE" ? "SITUACAO DE INSTABILIDADE" : v);

const materiais: Obra["materiais"] = {
  fck: 15,
  aco: "CA-50",
  acoEstribo: "CA-50",
  classeAco: "B",
  caa: 1,
  cobrimentoLaje: 1.5,
  cobrimentoViga: 2,
  cobrimentoPilar: 2,
};

// ---------------------------------------------------------------- PILAR opção 6

/** Barras da retangular como o PILDADOS (PILAR.BAS:3521-3542): bordas superior e
 *  inferior em x = (k−1)(b−2c)/MAX(1, n−1) + c, y = h − c e c; uma barra lateral de
 *  cada lado em x = c e b − c, y = h − Di. */
function barrasPildados(
  b: number,
  h: number,
  c: number,
  n: number,
  bitola: number,
  lateralY?: number,
): BarraPilarObra[] {
  const barras: BarraPilarObra[] = [];
  for (const y of [h - c, c])
    for (let k = 1; k <= n; k++)
      barras.push({ x: ((k - 1) * (b - 2 * c)) / Math.max(1, n - 1) + c, y, bitola });
  if (lateralY !== undefined)
    barras.push({ x: c, y: lateralY, bitola }, { x: b - c, y: lateralY, bitola });
  return barras;
}

type Conjunto = { nk: number; mxk: number; myk: number; lex: number; ley: number };

/** Obra de um pilar avulso com uma verificação por conjunto de esforços (t, tm, m do
 *  original convertidos para kN, kN·m, m). */
function obraVerificacao(
  b: number,
  h: number,
  barras: BarraPilarObra[],
  conjuntos: Conjunto[],
): Obra {
  const pilar: Pilar = {
    id: "P",
    nome: "P",
    x: 0,
    y: 0,
    b,
    h,
    verificacoes: conjuntos.map((c) => ({
      barras,
      esforcos: {
        nk: c.nk * KN_POR_TF,
        mxk: c.mxk * KN_POR_TF,
        myk: c.myk * KN_POR_TF,
        lex: c.lex,
        ley: c.ley,
      },
    })),
  };
  return {
    versao: 3,
    nome: "PILAR",
    norma: "nb1-78",
    modoCalculo: "original",
    materiais,
    pavimentos: [
      {
        id: "N1",
        nome: "N1",
        peDireito: 3,
        repeticoes: 1,
        lajes: [],
        vigas: [],
        pilares: [pilar],
        pilaresRemovidos: [],
      },
    ],
  };
}

/** Um campo do relatório do PILAR opção 6 (P.<campo> ou c<k>.<campo>). */
function campoVerificacao(r: VerificacaoPilar, resto: string): Valor | boolean {
  const geral = /^P\.(.+)$/.exec(resto);
  if (geral) return { Jx: r.jx, Jy: r.jy, lambdaX: r.lambdaX, lambdaY: r.lambdaY }[geral[1]!];
  const m = /^c(\d+)\.(.+?)(\.tela)?$/.exec(resto);
  const c = m && r.casos[Number(m[1]) - 1];
  if (!m || !c) return undefined;
  const campos: Record<string, (c: CasoPilar) => Valor | boolean> = {
    caso: (x) => x.rotulo,
    situacao: () => r.situacao,
    Mx: (x) => x.mx,
    My: (x) => x.my,
    Mxa: (x) => x.mxa,
    Mya: (x) => x.mya,
    Mtotal: (x) => x.mTotal,
    incl: (x) => x.anguloAtuante,
    veredito: (x) => (x.erro ? undefined : textoVeredito(x.veredito)),
    M1a: (x) => x.instabilidade?.m1,
    M2a: (x) => x.instabilidade?.m2,
    MR1a: (x) => x.instabilidade?.m1,
    MR2a: (x) => x.instabilidade?.m2,
    Matuante: (x) => x.instabilidade?.atuante,
    MRx1a: (x) => x.mrx,
    MRx2a: (x) => x.m2x,
    MRx: (x) => x.mrxReduzido,
    MRy1a: (x) => x.mry,
    MRy2a: (x) => x.m2y,
    MRy: (x) => x.mryReduzido,
    MRtotal: (x) => x.mrTotal,
    ln: (x) => x.anguloLN,
    Xln: (x) => x.xLN,
    "1/r": (x) => x.curvatura * 1000,
    defCon: (x) => x.deformacaoConcreto,
    defAco: (x) => x.deformacaoAco,
    // o original fica em laço sem fim; o motor para com o erro explícito (D-2)
    travou: (x) => x.erro === "nao-converge",
  };
  return campos[m[2]!]?.(c);
}

/** Prefixo do conjunto no id ("e2." → 1, "L2." → 1, sem prefixo → 0) e o resto. */
function conjuntoDoId(id: string) {
  const m = /^(?:e(\d+)|L(\d+))\.(.+)$/.exec(id);
  if (!m) return { k: 0, resto: id };
  return { k: Number(m[1] ?? m[2]) - 1, resto: m[3]! };
}

const conjuntosV2par = (caso: CasoOraculo) =>
  (
    caso.entrada as {
      conjuntos: { Nk_t: number; Mxk_tm: number; Myk_tm: number; Lxe_m: number; Lye_m: number }[];
    }
  ).conjuntos.map((c) => ({
    nk: c.Nk_t,
    mxk: c.Mxk_tm,
    myk: c.Myk_tm,
    lex: c.Lxe_m,
    ley: c.Lye_m,
  }));

const CASOS_PILAR6: [string, CasoOraculo, () => Obra][] = [
  [
    "caso_c_pilar (20×20, 4 φ12,5, Nk 17,37, le 3)",
    CASOS_ORACULO.caso_c_pilar!,
    () =>
      obraVerificacao(20, 20, barrasPildados(20, 20, 3, 2, 12.5), [
        { nk: 17.37, mxk: 0, myk: 0, lex: 3, ley: 3 },
      ]),
  ],
  [
    "retrad_pil_verif2 (20×40, 3 + 3 φ16 e laterais, dois carregamentos)",
    CASOS_PILAR.retrad_pil_verif2!,
    () =>
      obraVerificacao(20, 40, barrasPildados(20, 40, 3, 3, 16, 20), [
        { nk: 40, mxk: 2, myk: 0, lex: 4, ley: 6 },
        { nk: 25, mxk: 0, myk: 0, lex: 8, ley: 8 },
      ]),
  ],
  [
    "retrad_pil_trava (Nk 40, Mxk 2, Myk 1: o 2/2 trava no original)",
    CASOS_PILAR.retrad_pil_trava!,
    () =>
      obraVerificacao(20, 40, barrasPildados(20, 40, 3, 3, 16, 20), [
        { nk: 40, mxk: 2, myk: 1, lex: 4, ley: 6 },
      ]),
  ],
  [
    "v2par_pilar_mk (20×30, 2 + 2 φ16, Mk ≠ 0)",
    CASOS_PILAR.v2par_pilar_mk!,
    () =>
      obraVerificacao(
        20,
        30,
        barrasPildados(20, 30, 3, 2, 16),
        conjuntosV2par(CASOS_PILAR.v2par_pilar_mk!),
      ),
  ],
  [
    "v2par_pilar_lambda (caso c com λ 87, 104 e 83)",
    CASOS_PILAR.v2par_pilar_lambda!,
    () =>
      obraVerificacao(
        20,
        20,
        barrasPildados(20, 20, 3, 2, 12.5),
        conjuntosV2par(CASOS_PILAR.v2par_pilar_lambda!),
      ),
  ],
  [
    "v2par_pilar_trava (Nk 20, Mxk 0,8: o 2/2 trava no original)",
    CASOS_PILAR.v2par_pilar_trava!,
    () =>
      obraVerificacao(
        20,
        30,
        barrasPildados(20, 30, 3, 2, 16),
        conjuntosV2par(CASOS_PILAR.v2par_pilar_trava!),
      ),
  ],
];

describe.each(CASOS_PILAR6)("PILAR opção 6 pelo motor: %s", (_nome, caso, monta) => {
  const r = calcularObraSistrut(monta(), { modo: "original" });

  it("todos os valores impressos", () => {
    expect(r.verificacoes.every((v) => v.resultado)).toBe(true);
    const { faltando, difere } = confere(caso, (id) => {
      const { k, resto } = conjuntoDoId(id);
      const v = r.verificacoes[k]?.resultado;
      return v && campoVerificacao(v, resto);
    });
    expect(faltando, "ids sem cálculo").toEqual([]);
    expect(difere).toEqual([]);
  });
});

describe("PILAR opção 6 pelo motor: laço sem fim do original vira erro explícito (D-2)", () => {
  it.each([
    ["retrad_pil_trava", 2],
    ["v2par_pilar_trava", 5],
  ] as const)("%s: caso 2/2 com erro e aviso", (nome, i) => {
    const r = calcularObraSistrut(CASOS_PILAR6[i]![2](), { modo: "original" });
    const v = r.verificacoes[0]!;
    expect(CASOS_PILAR6[i]![1].caso).toBe(nome);
    expect(v.resultado!.casos[1]!.erro).toBe("nao-converge");
    expect(v.avisos.some((a) => a.includes("2/2") && a.includes("D-2"))).toBe(true);
  });
});

// ---------------------------------------------------------------- PILAREDI

/** Obra E2E com o P5 alterado; `predimensionamento` = "tensoes" (B e H digitados). */
function obraE2EComP5(p5: Partial<Pilar>, repeticoes = 1): Obra {
  const o = obraE2E("original");
  return {
    ...o,
    parametrosPilar: { predimensionamento: "tensoes" },
    pavimentos: o.pavimentos.map((pav) => ({
      ...pav,
      repeticoes,
      pilares: pav.pilares.map((p) => (p.id === "P5" ? { ...p, ...p5 } : p)),
    })),
  };
}

/** Um campo do relatório do PILAREDI de um lance do P5. */
function campoLance(
  r: ResultadoSistrut,
  l: LancePilarSistrut | undefined,
  resto: string,
): Valor | boolean {
  const d = l?.dimensionamento;
  if (!l || !d) return undefined;
  const caso = /^(\d[ef])\.(.+)$/.exec(resto);
  if (caso) {
    const c = d.casos.find((x) => x.rotulo === caso[1]);
    if (!c) return undefined;
    const mapa: Record<string, number> = {
      Mkx: c.mx,
      Mky: c.my,
      Mktot: c.mTotal,
      MRx1a: c.mrx,
      MRx2a: c.m2x,
      MRy1a: c.mry,
      MRy2a: c.m2y,
      MRtot: c.mrTotal,
      incLN: c.anguloLN,
      "1/r": c.curvatura * 1000,
      "x/d": c.xd,
      defCon: c.deformacaoConcreto,
      defAco: c.deformacaoAco,
    };
    return mapa[caso[2]!];
  }
  const um = d.barras.length === 1 ? d.barras[0] : undefined;
  const mapa: Record<string, Valor> = {
    lambdaX: d.lambdaX,
    lambdaY: d.lambdaY,
    Nk: l.carga.nk,
    Mkxi: l.carga.mkx,
    Mkyi: l.carga.mky,
    cobrimento: r.parametros.pip.cobrimento,
    As: d.as,
    taxa: d.taxa,
    "barras.n": um?.quantidade,
    "barras.phi": um?.bitola,
    "estribo.phi": d.estribo.bitola,
    "estribo.s": d.estribo.espacamento,
    Bw: d.secao.tipo === "retangular" ? d.secao.b : undefined,
    Hw: d.secao.tipo === "retangular" ? d.secao.h : undefined,
    cargaREP: r.pavimentos[0]!.rep.find((x) => x.pilar === "P5")?.total,
  };
  return mapa[resto];
}

/** Predimensionamento do P5 (ids `pre.*` e `predim.*`): tensões e a "CARGA" da tela;
 *  `predim.cargaNivel` é a carga acumulada do .REP no nível base (sem peso próprio). */
function campoPredim(r: ResultadoSistrut, resto: string): Valor {
  const p = r.predimensionamentos.find((x) => x.pilarId === "P5")?.resultado;
  const l = r.lances.find((x) => x.pilarId === "P5" && x.nivel === 0);
  if (!p || !l) return undefined;
  const mapa: Record<string, Valor> = {
    tensaoAdmN: p.tensaoNormalAdmissivel,
    tensaoMaxN: p.tensaoNormal,
    tensaoAdmNM: p.tensaoFlexaoAdmissivel,
    tensaoMaxNM: p.tensaoFlexao,
    sigmaAdmComp: p.tensaoNormalAdmissivel,
    sigmaComp: p.tensaoNormal,
    sigmaAdmCompM: p.tensaoFlexaoAdmissivel,
    sigmaCompM: p.tensaoFlexao,
    "pre.carga": p.carga,
    "predim.carga": p.carga,
    "predim.cargaNivel": l.carga.cargaAcumulada,
  };
  return mapa[resto];
}

const lanceP5 = (r: ResultadoSistrut, nivel = 0) =>
  r.lances.find((l) => l.pilarId === "P5" && l.nivel === nivel);

/** Id do PILAREDI de um P5: "pre.*"/"predim.*" pelo predimensionamento, o resto pelo
 *  lance do nível dado. */
function campoP5(r: ResultadoSistrut, resto: string, nivel = 0): Valor | boolean {
  const pre = /^(pre|predim)\.(.+)$/.exec(resto);
  if (pre) return campoPredim(r, pre[2] === "carga" || pre[2] === "cargaNivel" ? resto : pre[2]!);
  return campoLance(r, lanceP5(r, nivel), resto);
}

const D25 = { secao: { tipo: "circular" as const, d: 25, dInterno: 0 }, b: 25, h: 25 };
const quadrado = (horario: boolean) => ({
  secao: {
    tipo: "poligonal" as const,
    vertices: horario
      ? [
          { x: 0, y: 0 },
          { x: 0, y: 20 },
          { x: 20, y: 20 },
          { x: 20, y: 0 },
        ]
      : [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
  },
});

describe("PILAREDI pelo motor: caso_c_pilaredi, P5 20×20 com predimensionamento", () => {
  const r = calcularObraSistrut(obraE2EComP5({}), { modo: "original" });
  it("todos os valores impressos, inclusive o predimensionamento", () => {
    const { faltando, difere } = confere(CASOS_ORACULO.caso_c_pilaredi!, (id) =>
      campoP5(r, id.replace(/^P5\./, "")),
    );
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });
});

describe("PILAREDI pelo motor: retrad_pil_secoes (circular D 25 e poligonal horária)", () => {
  const circular = calcularObraSistrut(obraE2EComP5(D25), { modo: "original" });
  const poligonal = calcularObraSistrut(obraE2EComP5(quadrado(true)), { modo: "original" });
  it("todos os valores impressos", () => {
    const { faltando, difere } = confere(CASOS_PILAR.retrad_pil_secoes!, (id) => {
      const m = /^([CQ])\.(.+)$/.exec(id);
      return m ? campoP5(m[1] === "C" ? circular : poligonal, m[2]!) : undefined;
    });
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });
});

describe("PILAREDI pelo motor: retrad_pil_poliinv (poligonal anti-horária, D-6)", () => {
  const circular = calcularObraSistrut(obraE2EComP5(D25), { modo: "original" });
  const anti = calcularObraSistrut(obraE2EComP5(quadrado(false)), { modo: "original" });
  it("todos os valores impressos: área negativa, 17,07 e NAO SUPORTA", () => {
    const { faltando, difere } = confere(CASOS_PILAR.retrad_pil_poliinv!, (id) => {
      const m = /^([CA])\.(.+)$/.exec(id);
      if (!m) return undefined;
      if (m[1] === "C") return campoP5(circular, m[2]!);
      if (m[2] === "naoSuporta") return lanceP5(anti)?.dimensionamento?.recusa === "NAOSUPORTA";
      return campoP5(anti, m[2]!);
    });
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });

  it("corrigido: o sentido é invertido e a seção arma como a horária (4 # 10)", () => {
    const o = obraE2EComP5(quadrado(false));
    const r = calcularObraSistrut({ ...o, modoCalculo: "corrigido" }, { modo: "corrigido" });
    const d = lanceP5(r)?.dimensionamento;
    expect(d?.recusa).toBeUndefined();
    expect(d?.barras).toEqual([{ quantidade: 4, bitola: 10 }]);
  });
});

describe("PILAREDI pelo motor: v2par_pilar_niveis (P5 25×40, pavimento repetido 3 vezes)", () => {
  const r = calcularObraSistrut(obraE2EComP5({ b: 25, h: 40 }, 3), { modo: "original" });
  const nivelDe: Record<string, number> = { FUND: 0, PAV1: 1, PAV2: 2 };
  it("três lances, um por repetição, e todos os valores impressos", () => {
    expect(r.lances.filter((l) => l.pilarId === "P5").map((l) => l.nivel)).toEqual([0, 1, 2]);
    const { faltando, difere } = confere(CASOS_PILAR.v2par_pilar_niveis!, (id) => {
      const m = /^P5\.(FUND|PAV1|PAV2|predim)\.(.+)$/.exec(id);
      if (!m) return undefined;
      if (m[1] === "predim") return campoP5(r, `predim.${m[2]}`);
      return campoP5(r, m[2]!, nivelDe[m[1]!]);
    });
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });
});

// ---------------------------------------------------------------- ligações, conta à mão

/** Obra só de pilares (sem lajes e vigas): um pilar por pavimento na mesma posição,
 *  do topo para a base; a carga vem de `cargaTopo`. */
function obraDePilares(lances: Partial<Pilar>[], extra: Partial<Obra> = {}): Obra {
  return {
    versao: 3,
    nome: "PILARES",
    norma: "nb1-78",
    modoCalculo: "corrigido",
    materiais,
    pavimentos: lances.map((p, i) => ({
      id: `N${lances.length - i}`,
      nome: `N${lances.length - i}`,
      peDireito: 3,
      repeticoes: 1,
      lajes: [],
      vigas: [],
      pilares: [{ id: "P5", nome: "P5", x: 0, y: 0, b: 20, h: 20, ...p }],
      pilaresRemovidos: [],
    })),
    ...extra,
  };
}
const t = (x: number) => x * KN_POR_TF;
const cargaTopo = (n: number) => ({ cargaTopo: { normal: t(n), momentos: [] } });

describe("Pilar.cargaTopo: a obra só de pilares reproduz o caso_c_pilaredi", () => {
  // 17,37 t no topo do lance FUND-PAV1, sem vigas: a mesma leitura que o PILGEEDI faz
  // do E2E.REP. cargaREP (o .REP lido) = a carga acumulada do lance.
  const r = calcularObraSistrut(
    { ...obraDePilares([cargaTopo(17.37)]), parametrosPilar: { predimensionamento: "tensoes" } },
    { modo: "original" },
  );
  it("todos os valores impressos", () => {
    const { faltando, difere } = confere(CASOS_ORACULO.caso_c_pilaredi!, (id) => {
      const resto = id.replace(/^P5\./, "");
      if (resto === "cargaREP") return lanceP5(r)?.carga.cargaAcumulada;
      return campoP5(r, resto);
    });
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });
});

describe("Pilar.vinculos e vinculosTopo: matriz de flambagem do .PIP (PILAREDI.BAS:4721-4771)", () => {
  // engaste na base e livre no topo em x: le = 2,0·3 = 6 m; y travado: 1,0·3 = 3 m.
  // λx = CINT(600/(20/√12)) = CINT(103,92) = 104.
  const o = obraE2EComP5({
    vinculos: { x: "engaste", y: "continuidade" },
    vinculosTopo: { x: "livre", y: "continuidade" },
  });
  const l = lanceP5(calcularObraSistrut(o, { modo: "original" }))!;
  it("lex 6, ley 3, λx 104, λy 52", () => {
    expect(l.carga.lex).toBeCloseTo(6, 5);
    expect(l.carga.ley).toBeCloseTo(3, 5);
    expect(l.dimensionamento?.lambdaX).toBe(104);
    expect(l.dimensionamento?.lambdaY).toBe(52);
  });
});

describe("Pilar.vento: normal e dois momentos com ângulo (PILAREDI.BAS:7614-7626)", () => {
  // Mx = 2·cos 30° + 1·cos 180° = 0,7321 tm; My = 2·sin 30° + 1·sin 180° = 1 tm;
  // Nk = 10 + 0,5 (sem peso próprio, .PIP com "N").
  const o = obraDePilares(
    [
      {
        ...cargaTopo(10),
        vento: {
          normal: t(0.5),
          momentos: [
            { m: t(2), angulo: 30 },
            { m: t(1), angulo: 180 },
          ],
        },
      },
    ],
    { parametrosPilar: { pip: { pesoProprio: false } } },
  );
  const l = lanceP5(calcularObraSistrut(o, { modo: "corrigido" }))!;
  it("Mk e Nk do lance", () => {
    expect(l.carga.mkx).toBeCloseTo(2 * Math.cos(Math.PI / 6) - 1, 5);
    expect(l.carga.mky).toBeCloseTo(1, 5);
    expect(l.carga.nk).toBeCloseTo(10.5, 5);
  });
});

describe("Pilar.excentricidade e seções diferentes por lance (PILAREDI.BAS:7431-7433)", () => {
  // 0-3-6 m: 20 × 40 no lance de baixo, 20 × 20 em cima com e = 5 cm em x; 10 t no
  // topo e 4 t no nível 1. Na troca de seção: −(14 − 0 − 4)·CINT(100·5)/10 000 =
  // −0,50 tm no topo do lance de baixo (caso e −0,50; base +0,25); nada em cima.
  const o = obraDePilares([
    { ...cargaTopo(10), excentricidade: { x: 5, y: 0 } },
    { ...cargaTopo(4), h: 40 },
  ]);
  const r = calcularObraSistrut(o, { modo: "corrigido" });
  it("Mk dos dois lances", () => {
    expect(lanceP5(r, 0)!.carga.mkx).toBeCloseTo(-0.5, 5);
    expect(lanceP5(r, 0)!.carga.momentosBase.mkx).toBeCloseTo(0.25, 5);
    expect(lanceP5(r, 1)!.carga.mkx).toBe(0);
    const alturas = r.colunas[0]!.niveis.map((n) =>
      n.secao.tipo === "retangular" ? n.secao.h : 0,
    );
    expect(alturas).toEqual([40, 20, 20]);
  });
});

describe("obra.parametrosPilar: PILAR.INI e .PIP da obra por cima dos de fábrica", () => {
  it("ausente: os de fábrica, inclusive o máximo de 200 barras", () => {
    const r = calcularObraSistrut(obraE2E("original"), { modo: "original" });
    expect(r.parametros.pilar.maximoBarras).toBe(200);
    expect(r.parametros.pip.densidade).toBe(2.5);
    expect(r.materiaisPilar).toEqual(r.materiais);
  });

  it(".PIP: densidade 2 t/m³ dá peso próprio 0,20·0,20·3·2 = 0,24 e Nk 17,61; cobrimento 3", () => {
    const o = obraE2EComP5({});
    o.parametrosPilar = { pip: { densidade: t(2), cobrimento: 3 } };
    const r = calcularObraSistrut(o, { modo: "original" });
    expect(r.parametros.pip.densidade).toBe(2);
    expect(r.parametros.pip.cobrimento).toBe(3);
    expect(lanceP5(r)!.carga.pesoProprio).toBeCloseTo(0.24, 6);
    expect(lanceP5(r)!.carga.nk).toBeCloseTo(17.61, 5);
  });

  it("PILAR.INI: máximo de barras e materiais dos pilares (fck 20 MPa → 0,20 t/cm²)", () => {
    const o = obraE2EComP5({});
    o.parametrosPilar = { ini: { maximoBarras: 60, fck: 20, classeAco: "A" } };
    const r = calcularObraSistrut(o, { modo: "original" });
    expect(r.parametros.pilar.maximoBarras).toBe(60);
    expect(r.materiaisPilar.fck).toBe(Math.fround(0.2));
    expect(r.parametros.pilar.fck).toBe(Math.fround(0.2));
    expect(r.materiaisPilar.classeAco).toBe("A");
    expect(r.materiais.fck).toBe(Math.fround(0.15));
  });
});

describe("predimensionamento com seção: o quadrado do PILAREDI vira a seção da coluna", () => {
  // P5 (17,37 t): área ideal 122 cm² → 14 cm, reprovado (σ2 = 0,1127 > 0,1125) → 20 cm
  // (conta em pilares/carga.test.ts); o dimensionamento usa 20 × 20.
  const o = obraE2EComP5({ b: 30, h: 30 });
  o.parametrosPilar = { predimensionamento: "secao" };
  const r = calcularObraSistrut(o, { modo: "original" });
  it("P5 com 20 × 20 no lugar de 30 × 30", () => {
    const p = r.predimensionamentos.find((x) => x.pilarId === "P5")!;
    expect([p.resultado?.b, p.resultado?.h]).toEqual([20, 20]);
    expect(lanceP5(r)!.dimensionamento?.secao).toMatchObject({ tipo: "retangular", b: 20, h: 20 });
    expect(p.avisos.some((a) => a.includes("20 × 20"))).toBe(true);
  });
});

describe("verificação com os esforços do lance (sem esforços digitados)", () => {
  // O P5 da E2E com 4 φ12,5 verificado com o Nk e o le do PILAREDI (17,67 t, 3 m); o
  // caso c do PILAR usa 17,37 t na mesma seção.
  const o = obraE2EComP5({ verificacoes: [{ barras: barrasPildados(20, 20, 3, 2, 12.5) }] });
  const r = calcularObraSistrut(o, { modo: "original" });
  it("uma verificação por lance, com o Nk e o le do lance", () => {
    expect(r.verificacoes).toHaveLength(1);
    const v = r.verificacoes[0]!;
    expect(v.repeticao).toBe(1);
    expect(v.entrada.nk).toBe(lanceP5(r)!.carga.nk);
    expect(v.entrada.lxe).toBe(lanceP5(r)!.carga.lex);
    expect(v.resultado?.lambdaX).toBe(52);
    expect(v.resultado?.casos.map((c) => c.veredito)).toEqual(["ok", "ok"]);
  });
});

describe("modo corrigido com os campos novos", () => {
  it("roda sem avisos de pilar na E2E com P5 circular, vínculos, vento e verificação", () => {
    const o = obraE2EComP5({
      ...D25,
      vinculos: { x: "engaste", y: "engaste" },
      vento: { normal: 0, momentos: [{ m: t(0.2), angulo: 0 }] },
      verificacoes: [{ barras: [] }],
    });
    const r = calcularObraSistrut({ ...o, modoCalculo: "corrigido" }, { modo: "corrigido" });
    expect(r.lances.flatMap((l) => l.avisos)).toEqual([]);
    expect(lanceP5(r)!.dimensionamento?.recusa).toBeUndefined();
    expect(r.predimensionamentos.find((p) => p.pilarId === "P5")?.resultado).toBeDefined();
  });
});

// ---------------------------------------------------------------- resumo na fundação

/** Id `fund.*` do resumo na fundação do P5 (PILAREDI.BAS:960-1000). `secao` e
 *  `armadura` são o tipo e as barras do lance de baixo como a linha os imprime
 *  ("R", "4#10"; PILAREDI.BAS:993-995). */
function campoFundacao(r: ResultadoSistrut, resto: string): Valor {
  const f = r.fundacoes.find((x) => x.pilarId === "P5");
  const d = lanceP5(r)?.dimensionamento;
  if (!f || !d) return undefined;
  const [g1, g2] = d.barras;
  const armadura =
    g1 &&
    (g2
      ? `${g1.quantidade}#${g1.bitola}+${g2.quantidade}#${g2.bitola}`
      : `${g1.quantidade}#${g1.bitola}`);
  const mapa: Record<string, Valor> = {
    cargaAcum: f.cargaAcumulada,
    pesoProprio: f.pesoProprio,
    carga: f.fundacao,
    Mx: f.mx,
    My: f.my,
    secao: d.secao.tipo === "retangular" ? "R" : undefined,
    armadura,
  };
  return mapa[resto];
}

describe("PILAREDI pelo motor: retrad_pil_dim (caso c com o resumo na fundação)", () => {
  const r = calcularObraSistrut(obraE2EComP5({}), { modo: "original" });
  it("todos os valores impressos", () => {
    const { faltando, difere } = confere(CASOS_ORACULO.retrad_pil_dim!, (id) => {
      const resto = id.replace(/^P5\./, "");
      const fund = /^fund\.(.+)$/.exec(resto);
      return fund ? campoFundacao(r, fund[1]!) : campoP5(r, resto);
    });
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
  });
});

// ---------------------------------------------------------------- obra importada do original

const ORACULO = "C:/tmp/oraculo";
const COL_NOVE = `${ORACULO}/runs/retrad_frm_sonda_pil-20261014-202358/obra/E2E.COL`;
const COL_SONDA = `${ORACULO}/runs/sonda-20261013-221414/obra/E2E.COL`;
const REP_E2E = `${ORACULO}/casos/caso_c_pilaredi.dados/E2E.REP`;
const le = (p: string) => readFileSync(p, "latin1");

/** Obra gerada pelo importador, com o P5 do pavimento de cima renomeado para "P5" (o
 *  id do importador é "P5@pav2") e o predimensionamento com a seção do .COL. */
function importada(arquivos: Parameters<typeof importarPilaresSistrut>[0]): Obra {
  const r = importarPilaresSistrut(arquivos);
  if ("erros" in r) throw new Error(r.erros.join("\n"));
  return {
    ...r.obra,
    parametrosPilar: { ...r.obra.parametrosPilar, predimensionamento: "tensoes" },
    pavimentos: r.obra.pavimentos.map((pav) => ({
      ...pav,
      pilares: pav.pilares.map((p) => (p.nome === "P5" ? { ...p, id: "P5" } : p)),
    })),
  };
}

/** caso_c_pilaredi sobre uma obra só de pilares: cargaREP (o .REP lido) = a carga
 *  acumulada do lance. */
function confereCasoC(r: ResultadoSistrut) {
  return confere(CASOS_ORACULO.caso_c_pilaredi!, (id) => {
    const resto = id.replace(/^P5\./, "");
    if (resto === "cargaREP") return lanceP5(r)?.carga.cargaAcumulada;
    return campoP5(r, resto);
  });
}

describe("obra importada dos arquivos do original reproduz o caso_c_pilaredi", () => {
  it.skipIf(!existsSync(COL_NOVE))(
    "E2E.COL de 9 colunas (retrad_frm_sonda_pil): P5 com 17,37 t e 20 × 20 do .COL",
    () => {
      const r = calcularObraSistrut(importada({ col: le(COL_NOVE) }), { modo: "original" });
      const { faltando, difere } = confereCasoC(r);
      expect(faltando).toEqual([]);
      expect(difere).toEqual([]);
    },
  );

  it.skipIf(!existsSync(COL_SONDA) || !existsSync(REP_E2E))(
    "E2E.COL da sonda (17,52 t) com o E2E.REP lido no nível 2: o .REP substitui, 17,37 t",
    () => {
      const obra = importada({
        col: le(COL_SONDA),
        reps: [{ texto: le(REP_E2E), nivelInicial: 2, nivelFinal: 2 }],
      });
      const r = calcularObraSistrut(obra, { modo: "original" });
      const { faltando, difere } = confereCasoC(r);
      expect(faltando).toEqual([]);
      expect(difere).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------- decisões do original

describe("momento digitado com sinal (PILGEEDI.BAS:2407; PILAREDI.BAS:7505-7506)", () => {
  // Coluna 0-3-6 m, seção constante, 1 tm no nível do meio repartido meio a meio pelas
  // rigidezes J/L iguais (conta em pilares/carga.test.ts): com M = +1 (o |M| que o
  // PILGEEDI grava do .REP) o lance de baixo leva −0,5 no topo e +0,25 na base; com
  // M = −1 digitado, o PILAREDI usa o sinal: +0,5 e −0,25, e −0,5 na base do de cima.
  const coluna = (m: number) =>
    calcularObraSistrut(
      obraDePilares([
        cargaTopo(0),
        {
          cargaTopo: { normal: t(10), momentos: [{ m: t(m), inclinacao: 0, vao: 0, rigidez: 0 }] },
        },
      ]),
      { modo: "corrigido" },
    );
  it("M = +1: lance de baixo −0,50 no topo e +0,25 na base", () => {
    const r = coluna(1);
    expect(lanceP5(r, 0)!.carga.mkx).toBeCloseTo(-0.5, 5);
    expect(lanceP5(r, 0)!.carga.momentosBase.mkx).toBeCloseTo(0.25, 5);
    expect(lanceP5(r, 1)!.carga.mkx).toBeCloseTo(0.5, 5);
  });
  it("M = −1: os mesmos com o sinal trocado", () => {
    const r = coluna(-1);
    expect(lanceP5(r, 0)!.carga.mkx).toBeCloseTo(0.5, 5);
    expect(lanceP5(r, 0)!.carga.momentosBase.mkx).toBeCloseTo(-0.25, 5);
    expect(lanceP5(r, 1)!.carga.mkx).toBeCloseTo(-0.5, 5);
  });
});

describe("Pilar.rotacao: o retângulo gira em torno do canto (PILAREDI.BAS:1630-1631)", () => {
  // 20 × 40 girado 90°: (0,0) (0,40) (20,40) (20,0) → (0,0) (−40,0) (−40,20) (0,20), um
  // retângulo 40 em x por 20 em y. Sem giro, λx = CINT(300/(20/√12)) = 52 e
  // λy = CINT(300/(40/√12)) = CINT(25,98) = 26; girado, trocam.
  const lance = (p: Partial<Pilar>) =>
    lanceP5(
      calcularObraSistrut(obraDePilares([{ ...cargaTopo(30), ...p }]), { modo: "corrigido" }),
    )!;
  it("λ trocados e a mesma armadura do 40 × 20", () => {
    const reto = lance({ b: 20, h: 40 });
    const girado = lance({ b: 20, h: 40, rotacao: 90 });
    const deitado = lance({ b: 40, h: 20 });
    expect([reto.dimensionamento?.lambdaX, reto.dimensionamento?.lambdaY]).toEqual([52, 26]);
    expect([girado.dimensionamento?.lambdaX, girado.dimensionamento?.lambdaY]).toEqual([26, 52]);
    expect(girado.dimensionamento?.as).toBeCloseTo(deitado.dimensionamento!.as, 6);
    expect(girado.dimensionamento?.barras).toEqual(deitado.dimensionamento?.barras);
  });
});

describe("PILAR.INI coeficienteTensao (o [12] do .COL) no predimensionamento", () => {
  // fck 0,015 e fyk 0,5 "na unidade" × 10 = 0,15 e 5 t/cm²: o mesmo pilar do caso c. O
  // PILAREDI multiplica as admissíveis por V_0dec e a tela divide por ele
  // (PILAREDI.BAS:3671-3677, 4196-4214): 0,090/10 = 0,0090 e 0,027/10 = 0,0027.
  const o = obraE2EComP5({});
  o.parametrosPilar = {
    predimensionamento: "tensoes",
    ini: { coeficienteTensao: 10, fck: 1.5, fyk: 50 },
  };
  const r = calcularObraSistrut(o, { modo: "original" });
  it("tensões da tela ÷ 10 e o dimensionamento do caso c", () => {
    const p = r.predimensionamentos.find((x) => x.pilarId === "P5")!.resultado!;
    expect(p.tensaoNormalAdmissivel).toBeCloseTo(0.009, 5);
    expect(p.tensaoFlexaoAdmissivel).toBeCloseTo(0.01125, 5);
    expect(p.tensaoFlexao).toBeCloseTo(0.0027, 4);
    const d = lanceP5(r)!.dimensionamento!;
    expect(d.as).toBeCloseTo(3.2, 2);
    expect(d.barras).toEqual([{ quantidade: 4, bitola: 10 }]);
  });
});

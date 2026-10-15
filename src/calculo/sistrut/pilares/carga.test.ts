// Cargas do PILAREDI: resumo na fundação e predimensionamento contra o oráculo
// (retrad_pil_dim, caso_c_pilaredi, retrad_pil_secoes) e contas à mão para a
// leitura do .REP, a distribuição de momentos, a troca de seção, o vento, a
// redução de sobrecarga e o predimensionamento por coluna.
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_PIP } from "../base/parametros";
import type { ColunaEdificio, LeituraRep, SecaoPilar, VinculoPilar } from "../base/tipos";
import { bateComImpresso, CASOS_ORACULO, valorOraculo } from "../__oraculo__";
import { CASOS_PILAR } from "./__casos__";
import {
  cargasPilares,
  casaNome,
  comprimentosFlambagem,
  indiceDoCodigoOriginal,
  leCargasRep,
  predimensionaPilar,
  qbVal,
  resumoFundacao,
} from "./carga";

const pip = emSingle(PARAMETROS_PIP);
const materiais = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B" as const,
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};
const ret = (b: number, h: number): SecaoPilar => ({ tipo: "retangular", b, h, barras: [] });
const ret20 = ret(20, 20);

function coluna(
  cotas: number[],
  secao: SecaoPilar = ret20,
  vinculo: VinculoPilar = 2,
  nome = "P   5",
): ColunaEdificio {
  return {
    nome,
    pilarRep: nome,
    niveis: cotas.map((cota) => ({
      cota,
      secao,
      vinculoX: vinculo,
      vinculoY: vinculo,
      normalVento: 0,
      mkx: 0,
      mky: 0,
    })),
  };
}
type Momento = LeituraRep["linhas"][number]["momentos"][number];
const momento = (texto: string): Momento => ({
  viga: "V1",
  valor: Number(texto),
  texto,
  apoio: 1,
  vao: 4,
});
const linha = (pilar: string, total: number, momentos: Momento[] = []) => ({
  pilar,
  total: sng(total),
  parcelas: [],
  momentos,
});
const rep = (
  total: number,
  nivel: number,
  momentos: Momento[] = [],
  modo: LeituraRep["modo"] = "substitui",
): LeituraRep => ({
  linhas: [linha("P5", total, momentos)],
  nivelInicial: nivel,
  nivelFinal: nivel,
  modo,
});

describe("retrad_pil_dim: resumo de cargas na fundação", () => {
  const caso = CASOS_ORACULO.retrad_pil_dim!;
  const r = resumoFundacao([rep(17.37, 1)], coluna([0, 3]), pip, "original");

  it("17,37 acumulada + 0,30 de peso próprio = 17,67, sem momentos", () => {
    for (const [id, v] of [
      ["P5.fund.cargaAcum", r.cargaAcumulada],
      ["P5.fund.pesoProprio", r.pesoProprio],
      ["P5.fund.carga", r.fundacao],
      ["P5.fund.Mx", r.mx],
      ["P5.fund.My", r.my],
    ] as const)
      expect(bateComImpresso(valorOraculo(caso, id), v), id).toBe(true);
  });
});

describe("fundação: redução, acumulada e momentos da base (PILAREDI.BAS:960-1000, 5553-5554)", () => {
  // 6 níveis, 10 t em cada um dos níveis 1-5: ΣN = 50; peso próprio 5 lances de 3 m
  // 20×20 = 5·0,3 = 1,5; 5 níveis acima do de baixo → k = 0,4; %acid 10.
  // Redução (V_0e9e$ = "S"): (50 + 1,5)·10·0,4/100 = 2,06. "Acumulada" impressa
  // (999) = vento − redução + ΣN = 50 − 2,06 = 47,94; fundação = 50 + 1,5 − 2,06 = 49,44.
  const col = coluna([0, 3, 6, 9, 12, 15]);
  const reps = [1, 2, 3, 4, 5].map((n) => rep(10, n));

  it("usa a opção de redução da FUNDAÇÃO", () => {
    const r = resumoFundacao(
      reps,
      col,
      { ...PARAMETROS_PIP, reduzAcidentalFundacao: true },
      "original",
    );
    expect(r.reducao).toBeCloseTo(2.06, 4);
    expect(r.cargaAcumulada).toBeCloseTo(47.94, 4);
    expect(r.fundacao).toBeCloseTo(49.44, 4);
  });

  it("a redução do dimensionamento não afeta a fundação", () => {
    const r = resumoFundacao(
      reps,
      col,
      { ...PARAMETROS_PIP, reduzAcidentalDimensionamento: true },
      "original",
    );
    expect(r.reducao).toBe(0);
    expect(r.cargaAcumulada).toBeCloseTo(50, 4);
  });

  it("momentos da base do primeiro lance (V_1632), não o maior extremo", () => {
    // M = 1 tm no nível do meio de 0-3-6: base do lance 0-3 = −(−0,5)/2 = +0,25;
    // o maior extremo (topo) seria −0,5.
    const r = resumoFundacao(
      [rep(10, 1, [momento("-1")])],
      coluna([0, 3, 6]),
      PARAMETROS_PIP,
      "corrigido",
    );
    expect(r.mx).toBeCloseTo(0.25, 6);
  });
});

describe("carga do lance e comprimento de flambagem", () => {
  it("P5 travado (continuidade × continuidade = 1,0): le = 3 m nas duas direções", () => {
    const [c] = cargasPilares([rep(17.37, 1)], [coluna([0, 3])], pip, "original");
    expect(c!.lex).toBe(3);
    expect(c!.ley).toBe(3);
    expect(c!.cargaAcumulada).toBe(sng(17.37));
  });

  it("matriz de vínculos: engaste embaixo e livre em cima = 2,0·Δcota", () => {
    const col = coluna([0, 3]);
    col.niveis[0]!.vinculoX = 0;
    col.niveis[1]!.vinculoX = 3;
    expect(comprimentosFlambagem(col, 0, PARAMETROS_PIP, (x) => x).lex).toBe(6);
  });

  it("código do original → índice da matriz (PILAREDI.BAS:4733-4760): 1→2, 2→3, 3 e 4→0, ≥5→1", () => {
    expect([1, 2, 3, 4, 5, 9].map(indiceDoCodigoOriginal)).toEqual([2, 3, 0, 0, 1, 1]);
  });
});

describe("leitura do .REP (PILGEEDI.BAS:530-720)", () => {
  const col = coluna([0, 3]);

  it("VAL do QB ignora espaços: 'P   7         1.82' dá pilar 7", () => {
    expect(qbVal("   7      ")).toBe(7);
    expect(qbVal("-.64@1")).toBe(-0.64);
  });

  it("soma acumula; máxima só substitui se maior", () => {
    expect(leCargasRep([rep(10, 1), rep(5, 1, [], "soma")], [col], "corrigido")[0]!.normal[1]).toBe(
      15,
    );
    expect(
      leCargasRep([rep(10, 1), rep(5, 1, [], "maxima")], [col], "corrigido")[0]!.normal[1],
    ).toBe(10);
  });

  it("slot com |M| ≤ 0,01 é sobrescrito: '0.00' e '1.50' dão [1,50] (606-625)", () => {
    const [l] = leCargasRep([rep(10, 1, [momento("0.00"), momento("-1.50")])], [col], "corrigido");
    expect(l!.slots[1]!.map((x) => x.m)).toEqual([1.5, 0, 0, 0]);
  });

  it("5 momentos: só os 4 primeiros com |M| > 0,01 (L_14dd9)", () => {
    const cinco = ["1", "2", "3", "4", "5"].map(momento);
    const [l] = leCargasRep([rep(10, 1, cinco)], [col], "corrigido");
    expect(l!.slots[1]!.map((x) => x.m)).toEqual([1, 2, 3, 4]);
  });

  it("soma põe os momentos a partir do primeiro slot livre (663-670)", () => {
    const [l] = leCargasRep(
      [rep(10, 1, [momento("1"), momento("2")]), rep(5, 1, [momento("3")], "soma")],
      [col],
      "corrigido",
    );
    expect(l!.slots[1]!.map((x) => x.m)).toEqual([1, 2, 3, 0]);
  });

  it("soma com os 4 slots cheios abandona o resto do .REP (L_135e2)", () => {
    const p6 = coluna([0, 3], ret20, 2, "P   6");
    const cheio = rep(10, 1, ["1", "2", "3", "4"].map(momento));
    const soma: LeituraRep = {
      linhas: [linha("P5", 5, [momento("9")]), linha("P6", 7)],
      nivelInicial: 1,
      nivelFinal: 1,
      modo: "soma",
    };
    const [l5, l6] = leCargasRep([cheio, soma], [col, p6], "corrigido");
    expect(l5!.normal[1]).toBe(15);
    expect(l6!.normal[1]).toBe(0);
  });

  it("vai só para a PRIMEIRA coluna cujo nome contém o número isolado (L_122f4)", () => {
    expect(casaNome("P  15", 5)).toBe(false);
    expect(casaNome("P   5", 5)).toBe(true);
    const cols = [coluna([0, 3], ret20, 2, "P  15"), coluna([0, 3]), coluna([0, 3])];
    const l = leCargasRep([rep(10, 1)], cols, "corrigido");
    expect(l.map((x) => x.normal[1])).toEqual([0, 10, 0]);
  });
});

describe("momento de viga lido do .REP (PILAREDI.BAS:7304-7746), conta à mão", () => {
  // Coluna 0-3-6 m, seção constante: o momento de 1 tm no nível do meio se divide
  // meio a meio pelas rigidezes J/L iguais: +0,5 na base do lance de cima e −0,5 no
  // topo do lance de baixo. No lance 0-3: topo −0,5; base −(−0,5)/2 = +0,25
  // (transporte de −1/2 com a ponta de cima não livre). Caso "e" = maior extremo
  // −0,5; caso "f" = 0,6·(−0,5) + 0,4·0,25 = −0,20, que não fica abaixo de 0,4·0,5.
  const cargas = cargasPilares(
    [rep(10, 1, [momento("-1")])],
    [coluna([0, 3, 6])],
    PARAMETROS_PIP,
    "corrigido",
  );

  it("caso e: Mx = −0,50 tm no lance de baixo; base +0,25", () => {
    expect(cargas[0]!.mkx).toBeCloseTo(-0.5, 6);
    expect(cargas[0]!.mky).toBe(0);
    expect(cargas[0]!.momentosBase.mkx).toBeCloseTo(0.25, 6);
  });

  it("caso f: Mx = 0,6·M1 + 0,4·M2 = −0,20 tm", () => {
    expect(cargas[0]!.momentosFlambagem.mkx).toBeCloseTo(-0.2, 6);
  });

  it("lance de cima recebe +0,5 na base", () => {
    expect(cargas[1]!.mkx).toBeCloseTo(0.5, 6);
  });
});

describe("troca de seção num nível com momento (PILAREDI.BAS:7487-7498 e 7521)", () => {
  // 0-3-6 m; lance 0-3 com 20×40 (A), lances de cima 20×20 (B). Nível 1 é o primeiro
  // de B, com dois momentos de 1 tm a 0°. J no giro de 270° = h·b³/12: B 13 333,
  // A 26 667. 1º slot: kCima = J_B/3, kBaixo = J_A/3 (recarrega A) → +1/3 em cima,
  // −2/3 embaixo. 2º slot: A continua carregada, kCima = J_A/3 = kBaixo → +1/2 e −1/2.
  // Lance 0-3, caso e: topo −(2/3 + 1/2) = −7/6 (com J_B nos dois slots seria −4/3).
  // Peso próprio do nível 1 com a área de A: 3·800·2,5/10⁴ = 0,60 (com B seria 0,30).
  const col = coluna([0, 3, 6], ret(20, 20));
  col.niveis[0]!.secao = ret(20, 40);
  const cargas = cargasPilares(
    [rep(10, 1, [momento("-1"), momento("-1")])],
    [col],
    PARAMETROS_PIP,
    "corrigido",
  );

  it("momento no topo do lance de baixo = −7/6 tm", () => {
    expect(cargas[0]!.mkx).toBeCloseTo(-7 / 6, 6);
  });

  it("peso próprio do nível 1 com a seção de baixo: 0,60 t; no lance 0-3, 0,60 + 0,60", () => {
    expect(cargas[1]!.pesoProprio).toBeCloseTo(0.6, 6);
    expect(cargas[0]!.pesoProprio).toBeCloseTo(1.2, 6);
  });
});

describe("excentricidade entre seções sucessivas (PILAREDI.BAS:7431-7433)", () => {
  // 0-3-6 m, A no lance 0-3 e B acima com e = 5 cm em x; N = 10 t no nível 2 e 4 t
  // no nível 1. Ao descer para o nível 0 a seção muda: slot do nível 1 recebe
  // −(ΣN − N0 − N1)·CINT(100·5)/10 000 = −(14 − 0 − 4)·0,05 = −0,50 tm, que é o
  // topo do lance 0-3 (caso e = −0,50; base +0,25).
  const col = coluna([0, 3, 6], ret(20, 20));
  col.niveis[0]!.secao = ret(20, 40);
  col.niveis[1]!.excentricidade = { x: 5, y: 0 };
  const cargas = cargasPilares([rep(10, 2), rep(4, 1)], [col], PARAMETROS_PIP, "corrigido");

  it("Mx = −0,50 tm no lance de baixo, nada no de cima", () => {
    expect(cargas[0]!.mkx).toBeCloseTo(-0.5, 6);
    expect(cargas[0]!.momentosBase.mkx).toBeCloseTo(0.25, 6);
    expect(cargas[1]!.mkx).toBe(0);
  });
});

describe("vento com dois momentos e ângulos (PILAREDI.BAS:7614-7626)", () => {
  // Mx = 2·cos 30° + 1·cos 180° = 0,7321; My = 2·sin 30° + 1·sin 180° = 1,0000;
  // normal de vento 0,5 t só no próprio nível.
  const col = coluna([0, 3]);
  col.niveis[0]!.ventos = [
    { m: 2, angulo: 30 },
    { m: 1, angulo: 180 },
  ];
  col.niveis[0]!.normalVento = 0.5;
  const [c] = cargasPilares(
    [rep(10, 1)],
    [col],
    { ...PARAMETROS_PIP, pesoProprio: false },
    "corrigido",
  );

  it("componentes e normal", () => {
    expect(c!.mkx).toBeCloseTo(2 * Math.cos(Math.PI / 6) - 1, 6);
    expect(c!.mky).toBeCloseTo(1, 6);
    expect(c!.nk).toBeCloseTo(10.5, 6);
  });
});

describe("redução de sobrecarga no dimensionamento (opção S): D-8 no corrigido", () => {
  // Mesma coluna de 6 níveis: original (50 + 1,5)·10·0,4/100 = 2,06; corrigido 2,00.
  const col = coluna([0, 3, 6, 9, 12, 15]);
  const reps = [1, 2, 3, 4, 5].map((n) => rep(10, n));
  const comReducao = { ...PARAMETROS_PIP, reduzAcidentalDimensionamento: true };

  it("original inclui o peso próprio na base da redução", () => {
    const [c] = cargasPilares(reps, [col], comReducao, "original");
    expect(c!.reducao).toBeCloseTo(2.06, 4);
    expect(c!.nk).toBeCloseTo(50 + 1.5 - 2.06, 4);
  });

  it("corrigido reduz só a parcela das cargas", () => {
    const [c] = cargasPilares(reps, [col], comReducao, "corrigido");
    expect(c!.reducao).toBeCloseTo(2, 6);
  });
});

describe("predimensionamento por coluna (PILAREDI.BAS:3713-3740, 3976-4187)", () => {
  it("caso_c_pilaredi 20×20 imposta: admissíveis 0,090 e 0,113; tensões 0,000 e 0,027", () => {
    const caso = CASOS_ORACULO.caso_c_pilaredi!;
    const t = predimensionaPilar([rep(17.37, 1)], coluna([0, 3]), 0, materiais, pip, "original", {
      secao: ret20,
    });
    for (const [id, v] of [
      ["P5.pre.tensaoAdmN", t.tensaoNormalAdmissivel],
      ["P5.pre.tensaoMaxN", t.tensaoNormal],
      ["P5.pre.tensaoAdmNM", t.tensaoFlexaoAdmissivel],
      ["P5.pre.tensaoMaxNM", t.tensaoFlexao],
    ] as const)
      expect(bateComImpresso(valorOraculo(caso, id), v), id).toBe(true);
  });

  it("retrad_pil_secoes circular D 25 imposta: tensões 0,000 e 0,023", () => {
    const caso = CASOS_PILAR.retrad_pil_secoes!;
    const d25: SecaoPilar = { tipo: "circular", d: 25, dInterno: 0, barras: [] };
    const t = predimensionaPilar(
      [rep(17.37, 1)],
      coluna([0, 3], d25),
      0,
      materiais,
      pip,
      "original",
      { secao: d25 },
    );
    expect(bateComImpresso(valorOraculo(caso, "C.pre.tensaoMaxN"), t.tensaoNormal)).toBe(true);
    expect(bateComImpresso(valorOraculo(caso, "C.pre.tensaoMaxNM"), t.tensaoFlexao)).toBe(true);
    // a tela mostra 17,73 para Nk = 17,37 + 0,368 = 17,738 (INFERIDO: trunca)
    const [carga] = cargasPilares([rep(17.37, 1)], [coluna([0, 3], d25)], pip, "original");
    expect(Math.trunc(carga!.nk * 100) / 100).toBe(
      Number(valorOraculo(caso, "C.pre.carga").impresso),
    );
  });

  it("seção automática: área 17,37/((3,555 − 0,09)·1,5 % + 0,09) = 122 cm² → 14 cm; com o pp de 14×14 σ2 = 0,1127 > 0,1125 → 20 cm", () => {
    // N = 17,37 + 3·196·2,5/10⁴ = 17,517; σ1 = (17,517 − 1,5·196·3,555/100)/196 = 0,0360;
    // M = 17,517·0,02 = 0,3503; σ2 = 0,0360 + 35,03·7/3201,3 = 0,1127.
    const p = predimensionaPilar([rep(17.37, 1)], coluna([0, 3]), 0, materiais, pip, "original");
    expect(p.areaIdeal).toBeCloseTo(122.3, 0);
    const t14 = p.tentativas.find((t) => t.lado === 14 && t.nivel === 0)!;
    expect(t14.tensaoFlexao).toBeCloseTo(0.1127, 4);
    expect([p.b, p.h]).toEqual([20, 20]);
  });

  it("reprova o lado se QUALQUER nível da faixa falhar", () => {
    // 0-3-6 m; 5 t no nível 2 e vento de 1 tm no nível 1: o lance 1-2 com 14×14 dá
    // σ2 = (1 + 5,1·0,02)·100·7/3201 = 0,24 > 0,1125, mesmo com o lance 0-1 folgado.
    const col = coluna([0, 3, 6]);
    col.niveis[1]!.ventos = [{ m: 1, angulo: 0 }];
    const p = predimensionaPilar([rep(5, 2)], col, 0, materiais, pip, "original");
    expect(
      p.tentativas.some((t) => t.lado === 14 && t.nivel === 1 && t.tensaoFlexao > 0.1125),
    ).toBe(true);
    expect(p.b).toBeGreaterThan(14);
  });
});

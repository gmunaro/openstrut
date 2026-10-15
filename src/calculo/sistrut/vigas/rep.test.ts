// Testes da soma de reações por pilar e do .REP (VIGA opção 7) contra o original:
// caso b (`__oraculo__/caso_b_viga.json`, ids REP.* do quadro impresso e REParq.* do
// E2E.REP) e as linhas exatas do .REP gravado nos runs b, c1 e x1 (`vigas/__casos__/`).
import { describe, expect, it } from "vitest";
import { qbStr, qbUsing } from "../base/f32";
import type { ModoSistrut } from "../base/tipos";
import {
  bateComImpresso,
  CASOS_ORACULO,
  casasImpressas,
  type ValorOraculo,
} from "../__oraculo__/index";
import { casoVicalc, dadosViga, parametrosDoCaso, type VigaJson } from "./__casos__/index";
import {
  corteDuasCasas,
  type LinhaRepSistrut,
  linhasArquivoRep,
  somaReacoesPilares,
  tituloRep,
} from "./rep";
import { analisaViga } from "./vicalc";

/** O valor bate com o impresso truncado? Trunca para zero o STR$ do SINGLE (7
 *  algarismos) na última casa impressa, como o corte textual do .REP: 2,0799999 é
 *  STR$ "2.08" → 2,08; −0,6481 → "-.6481" → −0,64. O `trunca` de `bateComImpresso`
 *  trabalha sobre o float e levaria 2,0799999 a 2,07. O corte é no texto, sem
 *  multiplicar (4,85·100 = 484,99999999999994 em float64). */
function bateTruncadoStr(v: ValorOraculo, x: number) {
  const texto = qbStr(x).trim();
  const ponto = texto.indexOf(".");
  const cortado = ponto < 0 ? texto : texto.slice(0, ponto + 1 + casasImpressas(v));
  return Number(cortado) === Number(v.impresso);
}

/** Confere os ids REP.* do caso (totais, parcelas e momentos) contra as linhas por pilar. */
function confereRep(valores: readonly ValorOraculo[], linhas: readonly LinhaRepSistrut[]) {
  const falhas: string[] = [];
  let conferidos = 0;
  for (const v of valores.filter((x) => x.id.startsWith("REP"))) {
    const [, pilar = "", tipo, viga] = v.id.split(".");
    const linha = linhas.find((l) => l.pilar === pilar);
    if (!linha) {
      falhas.push(`${v.id}: pilar ausente`);
      continue;
    }
    conferidos += 1;
    if (!tipo) {
      const texto = qbUsing("####.##", linha.total).trim();
      if (texto !== v.impresso || !bateComImpresso(v, linha.total))
        falhas.push(`${v.id}: esperado ${v.impresso}, obtido ${texto}`);
      continue;
    }
    const lista = tipo === "carga" ? linha.parcelas : linha.momentos;
    const item = lista.find((p) => p.viga === viga);
    const bate =
      item &&
      item.texto === v.impresso &&
      (v.trunca ? bateTruncadoStr(v, item.valor) : bateComImpresso(v, item.valor));
    if (!bate)
      falhas.push(`${v.id}: esperado ${v.impresso}, obtido ${item?.texto} (${item?.valor})`);
  }
  return { falhas, conferidos };
}

/** Analisa as vigas do caso na ordem dada e soma por pilar. */
function repDoCaso(nome: string, vigasJson: readonly VigaJson[], modo: ModoSistrut) {
  const caso = casoVicalc(nome);
  const parametros = parametrosDoCaso(caso.parametros, modo);
  const vigas = vigasJson.map((v) => dadosViga(v, modo));
  const analises = vigas.map((v) => analisaViga(v, parametros, modo));
  return { caso, parametros, linhas: somaReacoesPilares(analises, vigas, parametros, modo) };
}

describe("corte textual de 2 casas (VIGA.BAS:2415-2419)", () => {
  it.each([
    [-0.6481, "-.64"],
    [-1.2276, "-1.22"],
    [1.1, "1.1"],
    [2, "2"],
    [6.93, "6.93"],
  ])("%d → %s", (x, texto) => expect(corteDuasCasas(Math.fround(x))).toBe(texto));
});

describe("caso b: quadro de reações e E2E.REP", () => {
  const oraculo = CASOS_ORACULO.caso_b_viga!;
  const caso = casoVicalc("caso_b");
  const { linhas, parametros } = repDoCaso("caso_b", caso.vigas, "original");

  it("totais, parcelas truncadas e momentos dos extremos (ids REP.* e REParq.*)", () => {
    const { falhas, conferidos } = confereRep(oraculo.valores, linhas);
    expect(falhas).toEqual([]);
    expect(conferidos).toBe(oraculo.valores.filter((x) => x.id.startsWith("REP")).length);
  });

  it("P5 = 6,93 (V2) + 10,44 (V5) = 17,37, não 17,38 (livros_viga_pilar.md 3.1)", () => {
    const p5 = linhas.find((l) => l.pilar === "P5")!;
    expect(p5.parcelas.map((p) => p.texto)).toEqual(["6.93", "10.44"]);
    expect(qbUsing("####.##", p5.total)).toBe("  17.37");
    expect(p5.momentos).toEqual([]);
  });

  it('P7: momentos "-.64@1 [4]" (V1) e "-1.22@2 [5]" (V4)', () => {
    const p7 = linhas.find((l) => l.pilar === "P7")!;
    expect(p7.momentos.map((m) => [m.texto, m.apoio, m.vao])).toEqual([
      ["-.64", 1, 4],
      ["-1.22", 2, 5],
    ]);
  });

  it("E2E.REP igual linha a linha (obra/E2E.REP do run)", () => {
    const rep = caso.rep!;
    expect(linhasArquivoRep(linhas, rep.cabecalho, parametros)).toEqual(
      rep.linhas.map((l) => l.texto),
    );
  });

  it("corrigido (R5): soma sem truncar e arredonda o total: P5 = 6,939745 + 10,447119 → 17,39", () => {
    const corr = repDoCaso("caso_b", caso.vigas, "corrigido").linhas;
    const p5 = corr.find((l) => l.pilar === "P5")!;
    expect(p5.parcelas[0]!.valor).toBeCloseTo(6.939745, 5);
    expect(p5.parcelas[1]!.valor).toBeCloseTo(10.447119, 5);
    expect(p5.total).toBe(17.39);
    expect(corr.find((l) => l.pilar === "P7")!.total).toBe(1.83);
  });
});

describe("c1: reações máximas, multiplicador 50 %, apoio desconsiderado", () => {
  const caso = casoVicalc("c1");
  const { linhas, parametros } = repDoCaso("c1", caso.vigasRep!, "original");

  it("título com acidentais, momentos externos e reações máximas", () => {
    expect(tituloRep(parametros)).toBe(
      " Cargas Totais e Acidentais  Momentos Externos  Reacoes Maximas",
    );
  });

  it("E2E.REP igual linha a linha (P4 2,26 = INT(Rmax·100)/100; -.92@2 [4] = 50 % do MEP)", () => {
    const rep = caso.rep!;
    expect(linhasArquivoRep(linhas, rep.cabecalho, parametros)).toEqual(
      rep.linhas.map((l) => l.texto),
    );
  });
});

describe("x1: IDX.REP com apoio desconsiderado e viga de 1 tramo", () => {
  const caso = casoVicalc("x1");
  const { linhas, parametros } = repDoCaso("x1", caso.vigasRep!, "original");

  it('IDX.REP igual linha a linha ("*2 (V20) + " e "-1.33@1 [4]" nos dois extremos)', () => {
    const rep = caso.rep!;
    expect(linhasArquivoRep(linhas, rep.cabecalho, parametros)).toEqual(
      rep.linhas.map((l) => l.texto),
    );
  });
});

describe.each(["v2par_viga_fluxo", "v2par_laje_cargas"])(
  "%s: quadro de reações e .REP (R5)",
  (nome) => {
    const caso = casoVicalc(nome);
    const { linhas, parametros } = repDoCaso(nome, caso.vigas, "original");

    it("totais, parcelas truncadas (trunca: STR$ do SINGLE) e momentos", () => {
      const { falhas, conferidos } = confereRep(caso.valores ?? [], linhas);
      expect(falhas).toEqual([]);
      expect(conferidos).toBe((caso.valores ?? []).filter((x) => x.id.startsWith("REP")).length);
    });

    it(".REP igual linha a linha", () => {
      const rep = caso.rep!;
      expect(linhasArquivoRep(linhas, rep.cabecalho, parametros)).toEqual(
        rep.linhas.map((l) => l.texto),
      );
    });
  },
);

describe("v2par_viga_fluxo: R5 com reação negativa", () => {
  const caso = casoVicalc("v2par_viga_fluxo");
  it("original: P4 = INT(−1,669·100)/100 + INT(1,669·100)/100 = −1,67 + 1,66 = −0,01; corrigido: 0,00", () => {
    const orig = repDoCaso("v2par_viga_fluxo", caso.vigas, "original").linhas.find(
      (l) => l.pilar === "P4",
    )!;
    expect(orig.parcelas.map((p) => p.texto)).toEqual(["-1.67", "1.66"]);
    expect(qbUsing("####.##", orig.total)).toBe("  -0.01");
    const corr = repDoCaso("v2par_viga_fluxo", caso.vigas, "corrigido").linhas.find(
      (l) => l.pilar === "P4",
    )!;
    expect(Math.abs(corr.total)).toBe(0);
  });
});

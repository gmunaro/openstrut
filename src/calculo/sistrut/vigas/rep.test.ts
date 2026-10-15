// Testes da soma de reações por pilar e do .REP (VIGA opção 7) contra o original:
// caso b (`__oraculo__/caso_b_viga.json`, ids REP.* do quadro impresso e REParq.* do
// E2E.REP) e as linhas exatas do .REP gravado nos runs b, c1 e x1 (`vigas/__casos__/`).
import { describe, expect, it } from "vitest";
import { qbUsing } from "../base/f32";
import type { ModoSistrut } from "../base/tipos";
import { bateComImpresso, CASOS_ORACULO } from "../__oraculo__/index";
import { casoVicalc, dadosViga, parametrosDoCaso, type VigaJson } from "./__casos__/index";
import { corteDuasCasas, linhasArquivoRep, somaReacoesPilares, tituloRep } from "./rep";
import { analisaViga } from "./vicalc";

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
    const falhas: string[] = [];
    let conferidos = 0;
    for (const v of oraculo.valores.filter((x) => x.id.startsWith("REP"))) {
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
      } else {
        // O texto tem de ser igual. A parcela já vem truncada no próprio SINGLE (2,08 =
        // 2,0799999, que o `trunca` de bateComImpresso levaria a 2,07): valor = impresso
        // a menos do SINGLE. O momento tem 4 casas (−0,6481) e o texto corta em 2.
        const lista = tipo === "carga" ? linha.parcelas : linha.momentos;
        const item = lista.find((p) => p.viga === viga);
        const tolerancia = tipo === "carga" ? 1e-4 : 0.01;
        if (
          !item ||
          item.texto !== v.impresso ||
          Math.abs(item.valor - Number(v.impresso)) >= tolerancia
        )
          falhas.push(`${v.id}: esperado ${v.impresso}, obtido ${item?.texto} (${item?.valor})`);
      }
    }
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

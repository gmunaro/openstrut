import { describe, expect, it } from "vitest";
import { precoComposicao, type Papel } from "../../dominio/orcamento";
import { composicaoSinapi, TABELA_SINAPI } from "./sinapi";

const porCodigo = new Map(TABELA_SINAPI.itens.map((i) => [i.codigo, i]));
const preco = (codigo: string) => porCodigo.get(codigo)!.preco!;
const custo = (p: Papel) => precoComposicao(composicaoSinapi(p), porCodigo)!;

// Referência independente: o custo publicado de cada composição na aba CSD (SP,
// 09/2026). A composição do app é a da SINAPI sem o material que o orçamento já
// cobra à parte; somando o material de volta (com o coeficiente do Analítico), o
// custo tem de bater com o publicado, a menos do arredondamento da SINAPI.
describe("composições padrão da SINAPI", () => {
  it("fôrma de laje: 92514 (57,18) = montagem + 0,341 · 92267", () => {
    expect(custo("mo-forma:laje") + 0.341 * preco("92267")).toBeCloseTo(57.18, 1);
  });
  it("fôrma de viga: 92456 (177,28) = montagem + 0,414 · 92265", () => {
    expect(custo("mo-forma:viga") + 0.414 * preco("92265")).toBeCloseTo(177.28, 0);
  });
  it("fôrma de pilar: 92419 (101,51) = montagem + 0,263 · 92263", () => {
    expect(custo("mo-forma:pilar") + 0.263 * preco("92263")).toBeCloseTo(101.51, 0);
  });
  it("armação CA-50 10 mm: 92762 (10,10) = mão de obra + 1,11 · aço 34", () => {
    expect(custo("mo-armacao") + 1.11 * preco("34")).toBeCloseTo(10.1, 1);
  });
  it("concreto e aço pelo fck e pela bitola; fora da SINAPI fica sem composição", () => {
    expect(composicaoSinapi("concreto:25")).toEqual([{ codigo: "1527", coef: 1 }]);
    expect(composicaoSinapi("concreto:15")).toBeUndefined();
    expect(composicaoSinapi("aco:CA-50:12.5")).toEqual([{ codigo: "43055", coef: 1 }]);
    expect(composicaoSinapi("aco:CA-60:5")).toEqual([{ codigo: "43059", coef: 1 }]);
    expect(composicaoSinapi("aco:CA-25:10")).toBeUndefined();
    expect(composicaoSinapi("fundacao")).toBeUndefined();
  });
  it("todo código das composições padrão está na tabela, com preço", () => {
    const papeis: Papel[] = [
      "concreto:20",
      "concreto:40",
      "aco:CA-50:6.3",
      "aco:CA-50:32",
      "forma:laje",
      "forma:viga",
      "forma:pilar",
      "mo-forma:laje",
      "mo-forma:viga",
      "mo-forma:pilar",
      "mo-armacao",
      "mo-concretagem",
    ];
    for (const p of papeis)
      for (const c of composicaoSinapi(p) ?? [])
        expect(porCodigo.get(c.codigo)?.preco).toBeGreaterThan(0);
  });
});

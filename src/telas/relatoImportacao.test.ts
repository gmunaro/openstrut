import { beforeEach, describe, expect, it, vi } from "vitest";
import { obraNova } from "../dominio/criar";
import type { ResultadoImportacaoSistrut } from "./InicioSistrut";
import { importarSemExcecao, problemaDaImportacao } from "./relatoImportacao";

const { calcular, importarObraSistrut } = vi.hoisted(() => ({
  calcular: vi.fn(),
  importarObraSistrut: vi.fn(),
}));
vi.mock("./calculo", () => ({ calcular }));
vi.mock("./InicioSistrut", () => ({ importarObraSistrut }));

const arquivos = [{ nome: "COB.LAJ", dados: new Uint8Array([1, 2]) }];
const resumo = { pavimentos: [], lidos: ["COB.LAJ"], ignorados: [] };
const obra = obraNova("Obra", "nb1-78");
const importada: ResultadoImportacaoSistrut = { ok: true, obra, avisos: [], resumo };

beforeEach(() => {
  calcular.mockReset();
  importarObraSistrut.mockReset();
});

describe("importarSemExcecao", () => {
  it("exceção do importador vira erro na tela, com os arquivos no resumo", () => {
    importarObraSistrut.mockImplementation(() => {
      throw new RangeError("Offset is outside the bounds of the DataView");
    });
    expect(importarSemExcecao(arquivos)).toEqual({
      ok: false,
      erros: [
        "Erro inesperado na importação: RangeError: Offset is outside the bounds of the DataView",
      ],
      resumo,
    });
  });
});

describe("problemaDaImportacao", () => {
  it("importação com erro: etapa importação, com as mensagens", () => {
    const r: ResultadoImportacaoSistrut = { ok: false, erros: ["Nenhum .LAJ."], resumo };
    expect(problemaDaImportacao(r, arquivos)).toEqual({
      etapa: "importação",
      mensagens: ["Nenhum .LAJ."],
      arquivos,
    });
    expect(calcular).not.toHaveBeenCalled();
  });

  it("cálculo com exceção ou com pavimento em falha: etapa cálculo, com a obra", () => {
    calcular.mockReturnValueOnce({ tipo: "erro", mensagem: "Divisão por zero" });
    expect(problemaDaImportacao(importada, arquivos)).toEqual({
      etapa: "cálculo",
      mensagens: ["Divisão por zero"],
      arquivos,
      obra,
    });
    calcular.mockReturnValueOnce({
      tipo: "ok",
      resultado: { pavimentos: [{ pavimento: { nome: "TER" }, falhas: ["Pilar P3 termina."] }] },
    });
    expect(problemaDaImportacao(importada, arquivos)?.mensagens).toEqual([
      "TER: Pilar P3 termina.",
    ]);
  });

  it("obra que calcula sem falha: nada a relatar", () => {
    calcular.mockReturnValue({
      tipo: "ok",
      resultado: { pavimentos: [{ pavimento: { nome: "TER" }, falhas: [] }] },
    });
    expect(problemaDaImportacao(importada, arquivos)).toBeNull();
  });
});

describe("importarSemExcecao: a pilha vai ao diagnóstico", () => {
  it("a exceção inteira fica no coletor de erros", async () => {
    const { limparErros, ultimosErros } = await import("../components/relato/coletorErros");
    limparErros();
    importarObraSistrut.mockImplementation(() => {
      throw new TypeError("x is undefined");
    });
    importarSemExcecao(arquivos);
    expect(ultimosErros()[0]?.texto).toMatch(/^TypeError: x is undefined\n\s+at /);
  });
});

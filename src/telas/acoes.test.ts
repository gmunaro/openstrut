import { describe, expect, it } from "vitest";
import { descreverFalha } from "./acoes";

describe("descreverFalha", () => {
  it("JSON inválido vira frase em pt-BR, sem detalhe técnico", () => {
    const r = descreverFalha(new SyntaxError("Unexpected token < in JSON"), "ler");
    expect(r).toEqual({
      motivo: "o arquivo não é uma obra da OpenStrut ou está corrompido.",
      detalhe: null,
    });
  });

  it("erro de permissão ou leitura do navegador usa o verbo da ação", () => {
    for (const nome of ["NotReadableError", "NotAllowedError", "SecurityError"]) {
      const e = new DOMException("negado", nome);
      expect(descreverFalha(e, "ler")).toEqual({
        motivo: "o navegador não conseguiu ler o arquivo.",
        detalhe: null,
      });
    }
    expect(descreverFalha(new DOMException("x", "NotAllowedError"), "gravar")).toEqual({
      motivo: "o navegador não conseguiu gravar o arquivo.",
      detalhe: null,
    });
  });

  it("erro desconhecido guarda a mensagem crua em detalhe", () => {
    expect(descreverFalha(new Error("boom interno"), "ler")).toEqual({
      motivo: "ocorreu um erro inesperado.",
      detalhe: "boom interno",
    });
  });

  it("valor que não é Error vira texto no detalhe", () => {
    expect(descreverFalha("falha crua", "gravar")).toEqual({
      motivo: "ocorreu um erro inesperado.",
      detalhe: "falha crua",
    });
  });

  it("DOMException de outro nome cai no caso desconhecido", () => {
    const r = descreverFalha(new DOMException("cancelado", "AbortError"), "ler");
    expect(r.motivo).toBe("ocorreu um erro inesperado.");
    expect(r.detalhe).toBe("cancelado");
  });
});

// Números com vírgula decimal na tela.
import { describe, expect, it } from "vitest";
import { fmt, fmtCampo, numeroDoTexto } from "./formato";

describe("formato", () => {
  it("exibe com vírgula", () => {
    expect(fmt(4)).toBe("4,00");
    expect(fmt(1234.5, 1)).toBe("1234,5");
    expect(fmtCampo(1.5)).toBe("1,5");
    expect(fmtCampo(0.12345)).toBe("0,1235");
  });
  it("lê vírgula ou ponto; vazio e lixo viram NaN", () => {
    expect(numeroDoTexto(" 2,5 ")).toBe(2.5);
    expect(numeroDoTexto("2.5")).toBe(2.5);
    expect(numeroDoTexto("")).toBeNaN();
    expect(numeroDoTexto("abc")).toBeNaN();
  });
});

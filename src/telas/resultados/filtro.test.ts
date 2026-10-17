import { describe, expect, it } from "vitest";
import { filtroDeTexto } from "./filtro";

describe("filtroDeTexto", () => {
  it("vazio mostra tudo", () => {
    expect(filtroDeTexto("  ")("V1")).toBe(true);
  });

  it("nome com número é exato e sem diferença de maiúsculas", () => {
    const f = filtroDeTexto("v1, P3");
    expect(f("V1")).toBe(true);
    expect(f("P3")).toBe(true);
    expect(f("V10")).toBe(false);
    expect(f("P30")).toBe(false);
    expect(f("L1")).toBe(false);
  });

  it("só a letra pega todos os elementos daquele tipo", () => {
    const f = filtroDeTexto("V");
    expect(f("V1")).toBe(true);
    expect(f("V12")).toBe(true);
    expect(f("P1")).toBe(false);
    expect(f("Viga")).toBe(false);
  });

  it("aceita ponto e vírgula e espaço como separador", () => {
    const f = filtroDeTexto("L2;P1 V3");
    expect(["L2", "P1", "V3", "L1"].map(f)).toEqual([true, true, true, false]);
  });

  it("caractere especial do usuário não quebra o filtro", () => {
    expect(() => filtroDeTexto("V(")("V1")).not.toThrow();
    expect(filtroDeTexto("V(")("V1")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { Aviso } from "../calculo";
import { filtroDeTexto, MOSTRA_TUDO } from "./filtro";
import { avisosDoFiltro } from "./Resultados";

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

  it("nome só de letras (renomeado) também casa exato", () => {
    expect(filtroDeTexto("px")("PX")).toBe(true);
    expect(filtroDeTexto("px")("PX2")).toBe(true);
    expect(filtroDeTexto("px")("P1")).toBe(false);
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

describe("avisosDoFiltro", () => {
  const aviso = (elemento: string): Aviso => ({
    local: "Tipo",
    elemento,
    texto: `aviso de ${elemento}`,
  });
  const todos = [
    aviso("V1"),
    aviso("V1 (detalhamento)"),
    aviso("V10"),
    aviso("P3"),
    aviso(""),
    aviso("equilíbrio"),
  ];

  it("sem filtro, todos", () => {
    expect(avisosDoFiltro(todos, MOSTRA_TUDO)).toBe(todos);
  });

  it("com filtro, só os dos elementos mostrados (o detalhamento conta como o elemento)", () => {
    expect(avisosDoFiltro(todos, filtroDeTexto("V1")).map((a) => a.elemento)).toEqual([
      "V1",
      "V1 (detalhamento)",
    ]);
    expect(avisosDoFiltro(todos, filtroDeTexto("P")).map((a) => a.elemento)).toEqual(["P3"]);
  });
});

// Erro lançado pelo motor vira estado "erro" para a tela, sem quebrar.
import { describe, expect, it, vi } from "vitest";
import { obraNova } from "../dominio/criar";

vi.mock("../calculo/fluxo", () => ({
  calcularObra: () => {
    throw new Error("vinculação ausente para a laje L9");
  },
}));

const { calcular } = await import("./calculo");

describe("calcular com erro do motor", () => {
  it("devolve a mensagem em vez de lançar", () => {
    expect(calcular(obraNova("x", "nb1-78"))).toEqual({
      tipo: "erro",
      mensagem: "vinculação ausente para a laje L9",
    });
  });
});

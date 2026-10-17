import { describe, expect, it } from "vitest";
import { AVISO_CONFERENCIA as doCalculo } from "./calculo";
import { AVISO_CONFERENCIA } from "./marca";

describe("AVISO_CONFERENCIA", () => {
  it("a cópia da moldura (marca.ts) é a mesma frase do cálculo e do relatório", () => {
    expect(AVISO_CONFERENCIA).toBe(doCalculo);
  });
});

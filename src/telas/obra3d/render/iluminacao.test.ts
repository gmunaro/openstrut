// Posição do sol e caixa da sombra para cobrir a esfera da cena, com contas à mão.
import { describe, expect, it } from "vitest";
import { ajusteDoSol } from "./iluminacao";

describe("ajusteDoSol", () => {
  it("a 2 raios do centro, na direção normalizada", () => {
    // direção (3, 4, 0) tem módulo 5: unitária (0,6; 0,8; 0); 2·10 = 20 m
    const a = ajusteDoSol({ x: 1, y: 2, z: 3 }, 10, [3, 4, 0]);
    expect(a.posicao.x).toBeCloseTo(1 + 12, 9);
    expect(a.posicao.y).toBeCloseTo(2 + 16, 9);
    expect(a.posicao.z).toBeCloseTo(3, 9);
    // a esfera vai de 1 a 3 raios de profundidade; a caixa cobre de 0,5 a 3,5
    expect(a).toMatchObject({ meia: 10, perto: 5, longe: 35 });
  });

  it("raio mínimo de 1 m (cena vazia)", () => {
    expect(ajusteDoSol({ x: 0, y: 0, z: 0 }, 0, [0, 1, 0])).toEqual({
      posicao: { x: 0, y: 2, z: 0 },
      meia: 1,
      perto: 0.5,
      longe: 3.5,
    });
  });
});

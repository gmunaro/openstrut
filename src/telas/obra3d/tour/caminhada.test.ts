// Passo da caminhada e pisos, com as contas feitas à mão (rumo 0 olha para −Z; 3 m/s;
// 90°/s de giro).
import { describe, expect, it } from "vitest";
import { ALTURA_OLHOS, passo, pisos } from "./caminhada";

const origem = { x: 0, y: ALTURA_OLHOS, z: 0, rumo: 0 };
const perto = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe("passo", () => {
  it("anda 1,5 m para −Z em 0,5 s olhando para a frente", () => {
    const c = passo(origem, { frente: 1, lado: 0, giro: 0 }, 0.5);
    perto(c.x, 0);
    perto(c.z, -1.5);
    expect(c.y).toBe(ALTURA_OLHOS);
  });

  it("de lado para a direita vai para +X", () => {
    const c = passo(origem, { frente: 0, lado: 1, giro: 0 }, 1);
    perto(c.x, 3);
    perto(c.z, 0);
  });

  it("gira 90° para a esquerda em 1 s e passa a andar para −X", () => {
    const girado = passo(origem, { frente: 0, lado: 0, giro: 1 }, 1);
    perto(girado.rumo, Math.PI / 2);
    const c = passo(girado, { frente: 1, lado: 0, giro: 0 }, 1);
    perto(c.x, -3);
    perto(c.z, 0);
    // olhando para −X, a direita é −Z
    const d = passo(girado, { frente: 0, lado: 1, giro: 0 }, 1);
    perto(d.x, 0);
    perto(d.z, -3);
  });

  it("na diagonal anda 3 m em 1 s, não 3·√2", () => {
    const c = passo(origem, { frente: 1, lado: 1, giro: 0 }, 1);
    perto(Math.hypot(c.x, c.z), 3);
    perto(c.x, 3 / Math.SQRT2);
    perto(c.z, -3 / Math.SQRT2);
  });

  it("limita o comando a 1 e anda para trás com frente negativa", () => {
    const c = passo(origem, { frente: -5, lado: 0, giro: 0 }, 1);
    perto(c.z, 3);
  });
});

describe("pisos", () => {
  it("o chão e a laje de cada nível, de baixo para cima", () => {
    const niveis = [
      { nome: "Primeiro", indice: 0, cotaPiso: 0, cota: 3 },
      { nome: "Tipo", indice: 1, cotaPiso: 3, cota: 6 },
      { nome: "Cobertura", indice: 2, cotaPiso: 6, cota: 9 },
    ];
    expect(pisos(niveis)).toEqual([
      { nome: "Chão", nivel: 0, cota: 0 },
      { nome: "Primeiro", nivel: 0, cota: 3 },
      { nome: "Tipo", nivel: 1, cota: 6 },
      { nome: "Cobertura", nivel: 2, cota: 9 },
    ]);
    expect(pisos([])).toEqual([]);
  });
});

// Continuidade automática (LAJECALC.BAS:3690-3731; livros_laje.md 1.3).
import { describe, expect, it } from "vitest";
import { PARAMETROS_LAJE, emSingle } from "../base/parametros";
import type { LajeSistrut } from "../base/tipos";
import { continuidadeAutomatica } from "./continuidade";

const P = emSingle(PARAMETROS_LAJE);
// nós do E2E: (0,0) 1, (4,0) 2, (8,0) 3, (0,5) 4, (4,5) 5, (8,5) 6, (0,10) 7, (4,10) 8, (8,10) 9
const laje = (nome: string, indices: number[], extra: Partial<LajeSistrut> = {}): LajeSistrut => ({
  nome,
  tipo: 0,
  vertices: indices.map(() => ({ x: 0, y: 0 })),
  indicesVertices: indices,
  grupo: 0,
  codigos: indices.map(() => 7),
  angulo: 0,
  mu: 1,
  cargaPermanente: 0.1,
  pesoProprio: 0.25,
  ...extra,
});

describe("continuidadeAutomatica", () => {
  it("E2E: 4 trechos, código CINT(2·10 + 2) = 22 nos dois lados, o resto volta a 0", () => {
    const { lajes, continuidades } = continuidadeAutomatica(
      [
        laje("L1", [4, 7, 8, 5]),
        laje("L2", [6, 5, 8, 9]),
        laje("L3", [1, 4, 5, 2]),
        laje("L4", [3, 2, 5, 6]),
      ],
      P,
    );
    expect(lajes.map((l) => l.codigos)).toEqual([
      [0, 0, 22, 22],
      [22, 22, 0, 0],
      [0, 22, 22, 0],
      [0, 22, 22, 0],
    ]);
    expect(continuidades).toEqual([
      { lajeA: "L1", bordoA: 2, lajeB: "L2", bordoB: 1 },
      { lajeA: "L1", bordoA: 3, lajeB: "L3", bordoB: 1 },
      { lajeA: "L2", bordoA: 0, lajeB: "L4", bordoB: 2 },
      { lajeA: "L3", bordoA: 2, lajeB: "L4", bordoB: 1 },
    ]);
  });

  it("lado que coincide só em parte (vértices diferentes) não vira continuidade (D10)", () => {
    // L1 com o lado x = 4 inteiro (5 → 8); a vizinha tem o lado (5 → 10), com nó 10 no meio
    const { continuidades } = continuidadeAutomatica(
      [laje("L1", [4, 7, 8, 5]), laje("L2", [6, 5, 10, 9])],
      P,
    );
    expect(continuidades).toEqual([]);
  });

  it("grupos diferentes, bordo livre e tipo ≠ 0 ficam de fora", () => {
    const { lajes, continuidades } = continuidadeAutomatica(
      [
        laje("L1", [4, 7, 8, 5], { codigos: [7, 7, 1, 7] }),
        laje("L2", [6, 5, 8, 9]),
        laje("L3", [1, 4, 5, 2], { grupo: 1 }),
        laje("L4", [3, 2, 5, 6], { tipo: 1 }),
      ],
      P,
    );
    expect(continuidades).toEqual([]);
    expect(lajes[0]?.codigos).toEqual([0, 0, 1, 0]);
    expect(lajes[3]?.codigos).toEqual([7, 7, 7, 7]);
  });

  it("não altera as lajes de entrada", () => {
    const entrada = [laje("L1", [4, 7, 8, 5]), laje("L2", [6, 5, 8, 9])];
    continuidadeAutomatica(entrada, P);
    expect(entrada[0]?.codigos).toEqual([7, 7, 7, 7]);
  });
});

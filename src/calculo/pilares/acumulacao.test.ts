// Casos de V1 tests/T_PILGEEDI.BAS (1 tf = 10 kN; 2,5 tf/m³ = 25 kN/m³) e um
// pavimento-tipo repetido 3 vezes, com valores calculados à mão.
import { describe, expect, it } from "vitest";
import { cargaAcumulada, type PavimentoCargas } from "./acumulacao";

const PESO = 25;
const q20 = { forma: "retangular", b: 20, h: 20 } as const;

const nk = (r: ReturnType<typeof cargaAcumulada>, nivel: number, pilar: string) =>
  r.niveis[nivel]?.pilares.find((p) => p.pilar === pilar)?.nk;

describe("T_PILGEEDI: 2 níveis, pilares 20×20, pé-direito 3 m", () => {
  // peso próprio por lance = 0,2·0,2·3·25 = 3 kN (V1: 0,3 tf)
  const pavs: PavimentoCargas[] = [
    {
      id: "TOPO",
      nome: "TOPO",
      peDireito: 3,
      repeticoes: 1,
      pilares: [{ pilar: "P1", secao: q20, carga: 100 }],
    },
    {
      id: "BASE",
      nome: "BASE",
      peDireito: 3,
      repeticoes: 1,
      pilares: [
        { pilar: "P1", secao: q20, carga: 200 },
        { pilar: "P2", secao: q20, carga: 50 },
      ],
    },
  ];
  const r = cargaAcumulada(pavs, PESO);

  it("topo: P1 = 100 + 3; P2 sem lance", () => {
    expect(nk(r, 0, "P1")).toBeCloseTo(103, 9);
    expect(nk(r, 0, "P2")).toBeUndefined();
  });
  it("base: P1 = 200 + 3 + 103 = 306; P2 = 50 + 3 = 53", () => {
    expect(nk(r, 1, "P1")).toBeCloseTo(306, 9);
    expect(nk(r, 1, "P2")).toBeCloseTo(53, 9);
    expect(r.niveis[1]?.pilares.find((p) => p.pilar === "P2")?.pesoProprio).toBeCloseTo(3, 9);
  });
  it("sem avisos e com memória por pilar e nível", () => {
    expect(r.avisos).toEqual([]);
    expect(r.memoria).toHaveLength(3);
  });
});

describe("seção circular", () => {
  it("D = 40, pé-direito 3: N = 100 + π·0,4²/4·3·25 = 109,4248 kN", () => {
    const r = cargaAcumulada(
      [
        {
          id: "T",
          nome: "T",
          peDireito: 3,
          repeticoes: 1,
          pilares: [{ pilar: "PC", secao: { forma: "circular", diametro: 40 }, carga: 100 }],
        },
      ],
      PESO,
    );
    expect(nk(r, 0, "PC")).toBeCloseTo(100 + ((Math.PI * 0.16) / 4) * 3 * 25, 9);
  });
});

describe("pavimento-tipo repetido 3 vezes", () => {
  const q30 = { forma: "retangular", b: 30, h: 30 } as const;
  const r = cargaAcumulada(
    [
      {
        id: "Cobertura",
        nome: "Cobertura",
        peDireito: 3,
        repeticoes: 1,
        pilares: [{ pilar: "P1", secao: q30, carga: 80 }],
      },
      {
        id: "Tipo",
        nome: "Tipo",
        peDireito: 2.8,
        repeticoes: 3,
        pilares: [{ pilar: "P1", secao: q30, carga: 120 }],
      },
      {
        id: "Térreo",
        nome: "Térreo",
        peDireito: 3.5,
        repeticoes: 1,
        pilares: [{ pilar: "P1", secao: q30, carga: 150 }],
      },
    ],
    PESO,
  );
  // pp: 0,09·3·25 = 6,75; 0,09·2,8·25 = 6,3; 0,09·3,5·25 = 7,875
  it("um nível por repetição, do topo para a base", () => {
    expect(r.niveis.map((n) => [n.pavimento, n.repeticao])).toEqual([
      ["Cobertura", 1],
      ["Tipo", 1],
      ["Tipo", 2],
      ["Tipo", 3],
      ["Térreo", 1],
    ]);
  });
  it("Nk: 86,75; 213,05; 339,35; 465,65; 623,525 kN", () => {
    [86.75, 213.05, 339.35, 465.65, 623.525].forEach((esperado, i) => {
      expect(nk(r, i, "P1")).toBeCloseTo(esperado, 9);
    });
  });
});

describe("pilar que termina num pavimento intermediário", () => {
  it("a carga desce sem peso próprio (V1), com uma transição e um aviso só", () => {
    const r = cargaAcumulada(
      [
        {
          id: "A",
          nome: "A",
          peDireito: 3,
          repeticoes: 1,
          pilares: [{ pilar: "k1", nome: "P1", secao: q20, carga: 100 }],
        },
        { id: "B", nome: "B", peDireito: 3, repeticoes: 1, pilares: [] },
        { id: "C", nome: "C", peDireito: 3, repeticoes: 1, pilares: [] },
      ],
      PESO,
    );
    // 100 + 0,2·0,2·3·25 = 103 kN chegam a B e não vão a viga nenhuma
    expect(nk(r, 1, "k1")).toBeCloseTo(103, 9);
    expect(nk(r, 2, "k1")).toBeCloseTo(103, 9);
    expect(r.avisos).toEqual([
      "Pilar P1 termina no pavimento B: a carga (103,00 kN) NÃO foi transferida a viga de transição — modele a transição.",
    ]);
    expect(r.transicoes).toHaveLength(1);
    expect(r.transicoes[0]).toMatchObject({ nome: "P1", pavimentoId: "B", repeticao: 1 });
    expect(r.transicoes[0]?.nk).toBeCloseTo(103, 9);
  });
});

describe("pavimentos com o mesmo nome", () => {
  it("cada nível leva o id do seu pavimento", () => {
    const r = cargaAcumulada(
      [
        {
          id: "a",
          nome: "Tipo",
          peDireito: 3,
          repeticoes: 1,
          pilares: [{ pilar: "P1", secao: q20, carga: 100 }],
        },
        {
          id: "b",
          nome: "Tipo",
          peDireito: 3,
          repeticoes: 2,
          pilares: [{ pilar: "P1", secao: q20, carga: 50 }],
        },
      ],
      PESO,
    );
    expect(r.niveis.map((n) => [n.pavimentoId, n.repeticao])).toEqual([
      ["a", 1],
      ["b", 1],
      ["b", 2],
    ]);
    // 103; 103 + 53 = 156; 156 + 53 = 209
    expect(nk(r, 2, "P1")).toBeCloseTo(209, 9);
  });
});

// A coluna mais carregada e o texto do Nk, num modelo montado à mão: duas colunas de dois
// lances, a B com mais carga no lance de baixo, e uma C sem Nk num lance.
import { describe, expect, it } from "vitest";
import type { DadosElemento, Elemento3D } from "../api";
import { caminhoDasCargas, fracaoNk, textoNk } from "./historia";

const el = (
  chave: string,
  tipo: Elemento3D["tipo"],
  nivel: number,
  coluna?: string,
): Elemento3D => ({
  chave,
  tipo,
  id: chave,
  nome: chave,
  pavimentoId: "p",
  nivel,
  repeticao: 1,
  solidos: [],
  secao: "",
  notas: [],
  ...(coluna ? { coluna } : {}),
});
const nk = (grandeza: number): DadosElemento => ({
  estado: "ok",
  mensagens: [],
  defeitos: [],
  grandeza,
});
const col = (id: string, chaves: string[]) => ({ id, nome: id, chaves, nasceEmTransicao: false });

const elementos = [
  el("A0", "pilar", 0),
  el("A1", "pilar", 1),
  el("B0", "pilar", 0),
  el("B1", "pilar", 1),
  el("C0", "pilar", 0),
  el("C1", "pilar", 1),
  el("fB", "fundacao", 0, "B"),
];
const colunas = [col("A", ["A0", "A1"]), col("B", ["B0", "B1"]), col("C", ["C0", "C1"])];
// C tem o maior Nk embaixo, mas o lance de cima não tem cálculo: fica de fora
const dados = new Map([
  ["A0", nk(300)],
  ["A1", nk(150)],
  ["B0", nk(500)],
  ["B1", nk(200)],
  ["C0", nk(900)],
]);

describe("caminhoDasCargas", () => {
  it("a coluna de maior Nk no lance de baixo, de cima para baixo, com a fundação", () => {
    expect(caminhoDasCargas({ colunas, elementos }, dados)).toEqual({
      nome: "B",
      lances: [
        { chave: "B1", nivel: 1, nk: 200 },
        { chave: "B0", nivel: 0, nk: 500 },
      ],
      fundacao: "fB",
    });
  });

  it("sem pilar calculado, nada", () => {
    expect(caminhoDasCargas({ colunas, elementos }, new Map())).toBeUndefined();
  });
});

describe("textoNk e fracaoNk", () => {
  it("o Nk do resultado principal, na unidade da tela", () => {
    const d = {
      ...nk(1877.3),
      principal: "Nk = 1.877,30 kN, Nd = 2.628,21 kN; As = 9,07 cm² (0,45 %)",
    };
    expect(textoNk(d)).toBe("Nk = 1.877,30 kN");
    expect(textoNk({ ...d, principal: "Nk = 191,43 tf, Nd = 268,00 tf; As = 9,07 cm²" })).toBe(
      "Nk = 191,43 tf",
    );
    expect(textoNk(nk(1))).toBeUndefined();
  });

  it("fração na faixa; faixa de um valor só dá 1", () => {
    expect(fracaoNk(150, { min: 100, max: 300 })).toBe(0.25);
    expect(fracaoNk(5, { min: 5, max: 5 })).toBe(1);
  });
});

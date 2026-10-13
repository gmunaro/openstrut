// Casos de V1 tests/T_LAJEGEOM.BAS (bordos de LgDetectaContinuidade; a
// numeração das vigas não é desta parte) e as regras de LAJEGEOT.BM: bordo
// livre fora da continuidade, sobreposição > 50% do menor lado, vínculo forçado.
import { describe, expect, it } from "vitest";
import type { Bordo, Laje, Vinculo } from "../../dominio/obra";
import { contatos, vinculacao } from "./vinculacao";

const laje = (
  id: string,
  x: number,
  y: number,
  lx: number,
  ly: number,
  vinculos: Laje["vinculos"] = {},
): Laje => ({
  id,
  nome: id,
  x,
  y,
  lx,
  ly,
  h: 10,
  revestimento: 0,
  sobrecarga: 0,
  vinculos,
  mu: 1,
});

const LETRA: Record<Vinculo, string> = { apoiado: "A", engastado: "E", livre: "L" };
/** Vínculos na notação da V1: esquerdo, inferior, direito, superior. */
const letras = (r: Record<Bordo, Vinculo>) =>
  [r.esquerdo, r.inferior, r.direito, r.superior].map((v) => LETRA[v]).join("");

const bordos = (lajes: Laje[]) => {
  const r = vinculacao(lajes);
  return Object.fromEntries(lajes.map((l) => [l.id, letras(r[l.id]!)]));
};

describe("vinculação pela vizinhança (V1 LgDetectaContinuidade)", () => {
  it("duas lajes lado a lado, 4×5 e 3×5", () => {
    expect(bordos([laje("L1", 0, 0, 4, 5), laje("L2", 4, 0, 3, 5)])).toEqual({
      L1: "AAEA",
      L2: "EAAA",
    });
  });
  it("laje isolada", () => {
    expect(bordos([laje("L1", 0, 0, 4, 5)])).toEqual({ L1: "AAAA" });
  });
  it("grade 2×2 de lajes 4×5", () => {
    const grade = [
      laje("L1", 0, 0, 4, 5),
      laje("L2", 4, 0, 4, 5),
      laje("L3", 0, 5, 4, 5),
      laje("L4", 4, 5, 4, 5),
    ];
    expect(bordos(grade)).toEqual({ L1: "AAEE", L2: "EAAE", L3: "AEEA", L4: "EEAA" });
  });
  it("sobreposição de 50% do menor lado não basta; acima de 50% sim", () => {
    // L2 (ly 4) encosta 2 m em L1: 2 = 0,5 · 4 → apoiado
    expect(bordos([laje("L1", 0, 0, 4, 5), laje("L2", 4, 3, 3, 4)])).toEqual({
      L1: "AAAA",
      L2: "AAAA",
    });
    // 2,5 m > 2 m → engastado
    expect(bordos([laje("L1", 0, 0, 4, 5), laje("L2", 4, 2.5, 3, 4)])).toEqual({
      L1: "AAEA",
      L2: "EAAA",
    });
  });
  it("laje larga sobre duas menores: todas engastadas no bordo comum", () => {
    // B e C também são vizinhas entre si (x = 4)
    const r = bordos([laje("A", 0, 0, 8, 4), laje("B", 0, 4, 4, 4), laje("C", 4, 4, 2, 4)]);
    expect(r).toEqual({ A: "AAAE", B: "AEEA", C: "EEAA" });
  });
  it("lajes só encostadas no canto ou afastadas não têm continuidade", () => {
    expect(bordos([laje("L1", 0, 0, 4, 5), laje("L2", 4, 5, 3, 5)])).toEqual({
      L1: "AAAA",
      L2: "AAAA",
    });
    expect(bordos([laje("L1", 0, 0, 4, 5), laje("L2", 4.01, 0, 3, 5)])).toEqual({
      L1: "AAAA",
      L2: "AAAA",
    });
  });
  it("balanço ao lado de laje interna: engaste detectado nos dois lados", () => {
    const balanco = laje("L2", 3, 0, 2, 5, {
      inferior: "livre",
      direito: "livre",
      superior: "livre",
    });
    expect(bordos([laje("L1", 0, 0, 3, 5), balanco])).toEqual({ L1: "AAEA", L2: "ELLL" });
  });
  it("bordo livre não entra em continuidade, nem do outro lado", () => {
    const l2 = laje("L2", 4, 0, 3, 5, { esquerdo: "livre" });
    expect(bordos([laje("L1", 0, 0, 4, 5), l2])).toEqual({ L1: "AAAA", L2: "LAAA" });
  });
  it("vínculo forçado vale só para o próprio bordo", () => {
    const l1 = laje("L1", 0, 0, 4, 5, { direito: "apoiado", esquerdo: "engastado" });
    expect(bordos([l1, laje("L2", 4, 0, 3, 5)])).toEqual({ L1: "EAAA", L2: "EAAA" });
  });
});

describe("contatos", () => {
  it("cada par aparece nos dois sentidos, com sobreposição e menor lado", () => {
    const c = contatos([laje("L1", 0, 0, 4, 5), laje("L2", 4, 1, 3, 2)]);
    expect(c).toEqual([
      {
        laje: "L1",
        bordo: "direito",
        vizinha: "L2",
        bordoVizinha: "esquerdo",
        sobreposicao: 2,
        menorLado: 2,
      },
      {
        laje: "L2",
        bordo: "esquerdo",
        vizinha: "L1",
        bordoVizinha: "direito",
        sobreposicao: 2,
        menorLado: 2,
      },
    ]);
  });
});

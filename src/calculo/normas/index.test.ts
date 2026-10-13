// Adaptador da NB-1/78 (normas/index.ts): CA-25 é sempre classe A e μ fora da
// faixa usual das charneiras plásticas gera aviso, sem mudar o cálculo.
import { describe, expect, it } from "vitest";
import { materiaisPadrao } from "../../dominio/criar";
import type { ClasseAco } from "../../dominio/obra";
import type { LajeEntrada } from "../tipos";
import { MU_USUAL, nb178 } from "./index";

const mat = (aco: "CA-25" | "CA-50", classeAco: ClasseAco) =>
  nb178.materiais({ ...materiaisPadrao("nb1-78"), aco, classeAco });

describe("NB-1/78: CA-25 com classe B", () => {
  // 20 × 50, d = 45, Md = 180 kN·m: acima do x/d limite, onde as classes A e B do
  // diagrama dão As diferentes (direto em vigaFlexaoNb178: 25,78 × 22,34 cm²)
  const flexao = (classe: ClasseAco) => nb178.vigaFlexao(180, 20, 50, 45, mat("CA-25", classe));

  it("é calculado como classe A, com aviso", () => {
    const a = flexao("A");
    const b = flexao("B");
    expect(a.as).toBeCloseTo(25.78, 2);
    expect(b.as).toBe(a.as);
    expect(b.asComprimida).toBe(a.asComprimida);
    expect(b.xd).toBe(a.xd);
    expect(b.memoria[0]?.descricao).toBe("Aço CA-25 classe A");
    expect(a.avisos.some((x) => x.includes("CA-25"))).toBe(false);
    expect(b.avisos.filter((x) => x.includes("CA-25 é sempre classe A"))).toHaveLength(1);
  });

  it("CA-50 com classe B continua classe B, sem aviso", () => {
    const f = nb178.vigaFlexao(180, 20, 50, 45, mat("CA-50", "B"));
    expect(f.memoria[0]?.descricao).toBe("Aço CA-50 classe B");
    expect(f.avisos.some((x) => x.includes("sempre classe A"))).toBe(false);
  });
});

describe("NB-1/78: faixa usual de μ", () => {
  const laje = (mu: number): LajeEntrada => ({
    nome: "L1",
    lx: 4,
    ly: 4,
    h: 10,
    g: 4,
    q: 1.5,
    vinculos: { esquerdo: "apoiado", inferior: "apoiado", direito: "apoiado", superior: "apoiado" },
    mu,
  });
  const avisoMu = (mu: number) =>
    nb178.lajeEsforcos(laje(mu), mat("CA-50", "A")).avisos.filter((a) => a.includes("μ ="));

  it("faixa adotada: 0,5 ≤ μ ≤ 2 [VERIFICAR]", () => {
    expect(MU_USUAL).toEqual({ min: 0.5, max: 2 });
  });

  it("dentro da faixa (limites inclusive): sem aviso", () => {
    for (const mu of [0.5, 1, 2]) expect(avisoMu(mu)).toEqual([]);
  });

  it("fora da faixa: aviso, e a laje é calculada assim mesmo (my = μ·mx)", () => {
    expect(avisoMu(0.4)).toEqual([
      "Laje L1: μ = 0,4 fora da faixa usual 0,5 ≤ μ ≤ 2 das charneiras plásticas; calculada assim mesmo, confira a ortotropia.",
    ]);
    expect(avisoMu(2.5)).toHaveLength(1);
    const e = nb178.lajeEsforcos(laje(2.5), mat("CA-50", "A"));
    expect(e.mx).toBeGreaterThan(0);
    // teorema da afinidade de Johansen: my = μ·mx
    expect(e.my).toBeCloseTo(2.5 * e.mx, 9);
  });
});

// Tabela de lajes gerada por scripts/bares (teoria de placas + processo das áreas).
// Referências independentes: Timoshenko & Woinowsky-Krieger, *Theory of Plates
// and Shells*, 2ª ed., 1959 — placa quadrada apoiada (Tabela 8: w = 0,00406 qa⁴/D,
// Mx = My = 0,0479 qa² com ν = 0,3) e engastada (Tabela 35: w = 0,00126 qa⁴/D,
// momento no meio do bordo −0,0513 qa²); viga apoiada e biengastada para a
// linha "> 2,00". O resto são propriedades (simetria, monotonia, convergência).
import { describe, expect, it } from "vitest";
import { resolvePlaca } from "../../../../scripts/bares/placas";
import { coeficientesPlaca, LAMBDAS, tabelaTipo } from "../../../../scripts/bares/tabela";
import { BARES, type TipoBares } from "./tabelasBares";

const perto = (valor: number, esperado: number, tol: number) =>
  expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

describe("solver de placas contra Timoshenko & Woinowsky-Krieger (ν = 0,3)", () => {
  it("quadrada apoiada: w 0,00406 qa⁴/D; Mx = My = 0,0479 qa² no centro", () => {
    const p = resolvePlaca({ a: 1, b: 1, nu: 0.3, engastados: [], termos: 20 });
    const c = p.campo(0.5, 0.5);
    perto(c.w, 0.00406, 0.000005);
    perto(c.mx, 0.0479, 0.00005);
    perto(c.my, 0.0479, 0.00005);
  });
  it("quadrada engastada: w 0,00126 qa⁴/D; −0,0513 qa² no meio do bordo", () => {
    const p = resolvePlaca({ a: 1, b: 1, nu: 0.3, engastados: ["E", "D", "I", "S"], termos: 60 });
    // a série dá 0,0012653: a tabela imprime 0,00126 (um pouco abaixo do convergido)
    perto(p.campo(0.5, 0.5).w, 0.00126, 0.00001);
    for (const b of ["E", "D", "I", "S"] as const) perto(p.momentoBordo(b, 0.5), -0.0513, 0.00005);
  });
  it("converge: 50 e 100 termos diferem menos de 0,001 em μ (tipo 3, λ = 1,5)", () => {
    const a = coeficientesPlaca("3", 1.5, 50);
    const b = coeficientesPlaca("3", 1.5, 100);
    for (const k of ["mx", "my", "mxNeg", "myNeg", "alfa"] as const) perto(a[k]!, b[k]!, 0.001);
  });
});

describe("tabela gerada (tabelasBares.ts)", () => {
  const tipos = Object.keys(BARES) as TipoBares[];

  it("o arquivo é a saída do gerador (amostra: tipos 3 e 5A)", () => {
    for (const t of ["3", "5A"] as const) expect(tabelaTipo(t)).toEqual(BARES[t]);
  }, 120_000);

  it("22 linhas por coluna; λ = 1 simétrico entre os pares x/y", () => {
    for (const t of tipos)
      for (const col of Object.values(BARES[t])) expect(col).toHaveLength(LAMBDAS.length + 1);
    for (const t of ["1", "3", "6"] as const) expect(BARES[t].mx[0]).toBe(BARES[t].my[0]);
    expect(BARES["3"].mxNeg![0]).toBe(BARES["3"].myNeg![0]);
    expect(BARES["6"].mxNeg![0]).toBe(BARES["6"].myNeg![0]);
    for (const [a, b] of [
      ["2A", "2B"],
      ["4A", "4B"],
      ["5A", "5B"],
    ] as const) {
      expect(BARES[a].mx[0]).toBe(BARES[b].my[0]);
      expect(BARES[a].my[0]).toBe(BARES[b].mx[0]);
      expect(BARES[a].alfa[0]).toBe(BARES[b].alfa[0]);
    }
    expect(BARES["2A"].myNeg![0]).toBe(BARES["2B"].mxNeg![0]);
    expect(BARES["4A"].myNeg![0]).toBe(BARES["4B"].mxNeg![0]);
    expect(BARES["5A"].myNeg![0]).toBe(BARES["5B"].mxNeg![0]);
  });

  it("μx e α crescem com λ (de 1,00 a 2,00)", () => {
    for (const t of tipos)
      for (const nome of ["mx", "alfa"] as const) {
        const c = BARES[t][nome].slice(0, LAMBDAS.length);
        for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
      }
  });

  it('linha "> 2,00": faixa como viga (pl²/8, 9pl²/128, pl²/24; flecha 5/384 e 1/384)', () => {
    const u = LAMBDAS.length;
    expect(BARES["1"].mx[u]).toBe(12.5);
    expect(BARES["2B"].mx[u]).toBe(7.03);
    expect(BARES["2B"].mxNeg![u]).toBe(12.5);
    expect(BARES["6"].mx[u]).toBe(4.17);
    expect(BARES["6"].mxNeg![u]).toBe(8.33);
    expect(BARES["1"].alfa[u]).toBe(15.63);
    expect(BARES["6"].alfa[u]).toBe(3.13);
  });

  it("fica a até 0,03 da tabela impressa de Bares/Pinheiro nos casos clássicos", () => {
    // Impressos: Bastos, Lajes, Anexo, A-8 (μ, tipo 1), A-10 (μ, tipo 6) e A-1 (α);
    // comparação completa em docs/norma/bares-reacoes-flechas.md 5.1.
    const impressos: [TipoBares, number, "mx" | "my" | "mxNeg" | "alfa", number][] = [
      ["1", 1, "mx", 4.23],
      ["1", 1, "alfa", 4.76],
      ["1", 1.5, "mx", 7.72],
      ["1", 1.5, "my", 3.89],
      ["1", 1.5, "alfa", 9.03],
      ["1", 2, "mx", 9.91],
      ["1", 2, "my", 3.16],
      ["1", 2, "alfa", 11.89],
      ["6", 1, "mx", 2.02],
      ["6", 1, "mxNeg", 5.15],
      ["6", 1, "alfa", 1.49],
    ];
    for (const [tipo, lambda, coluna, impresso] of impressos) {
      const i = Math.round((lambda - 1) / 0.05);
      const centesimos = Math.round((BARES[tipo][coluna]![i]! - impresso) * 100);
      expect(Math.abs(centesimos), `${tipo} λ ${lambda} ${coluna}`).toBeLessThanOrEqual(3);
    }
  });

  it("reações nos tipos simétricos fecham com a carga (λ = 1 a 2)", () => {
    for (let i = 0; i < LAMBDAS.length; i++) {
      const l = LAMBDAS[i]!;
      const r1 = BARES["1"];
      perto((2 * r1.vx![i]! * l + 2 * r1.vy![i]!) / 10, l, 0.01 * (l + 1));
      const r6 = BARES["6"];
      perto((2 * r6.vxNeg![i]! * l + 2 * r6.vyNeg![i]!) / 10, l, 0.01 * (l + 1));
    }
  });
});

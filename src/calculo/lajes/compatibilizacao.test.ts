// Casos de LcCalculaTodas em V1 tests/T_LAJCALC.BAS (duas lajes contínuas,
// balanço ao lado de laje interna, vizinhos do mesmo lado da viga), em kN.
// Os momentos próprios esperados vêm das fórmulas fechadas de Johansen e
// do balanço (pl²/2), escritas aqui à mão.
import { describe, expect, it } from "vitest";
import type { Bordo, Vinculo } from "../../dominio/obra";
import { obraNova } from "../../dominio/criar";
import { compatibilizaNegativoNb178, lajeEsforcosNb178 } from "../normas/nb1-78/lajes";
import { compatibilizaNegativo6118, lajeEsforcos6118 } from "../normas/nbr6118-2023/lajes";
import { materiais6118 } from "../normas/nbr6118-2023/materiais";
import type { LajeEsforcos, MateriaisCalc } from "../tipos";
import { compatibilizaLajes, type LajeParaCompatibilizar } from "./compatibilizacao";

const TF = 9.80665;
const TFCM2 = 98.0665;
const fck = 0.15 * TFCM2;
const mat: MateriaisCalc = {
  fck,
  fcd: fck / 1.4,
  sigmaCd: (0.85 * fck) / 1.4,
  fyk: 5 * TFCM2,
  fyd: (5 * TFCM2) / 1.15,
  fywd: (5 * TFCM2) / 1.15,
  ecs: 0.9 * 6600 * Math.sqrt(fck + 3.5),
  es: 2100 * TFCM2,
  aco: "CA-50",
  acoEstribo: "CA-50",
};

const LETRA: Record<string, Vinculo> = { A: "apoiado", E: "engastado", L: "livre" };
const v = (s: string): Record<Bordo, Vinculo> => ({
  esquerdo: LETRA[s[0]!]!,
  inferior: LETRA[s[1]!]!,
  direito: LETRA[s[2]!]!,
  superior: LETRA[s[3]!]!,
});

/** Laje da V1 (cargas em tf/m², peso próprio h · 2,5 tf/m³) já com os esforços próprios. */
function laje(
  nome: string,
  x: number,
  y: number,
  lx: number,
  ly: number,
  bordos: string,
  h: number,
  gAd: number,
  q: number,
): LajeParaCompatibilizar {
  const vinculos = v(bordos);
  const esforcos = lajeEsforcosNb178(
    { nome, lx, ly, h, g: ((h / 100) * 2.5 + gAd) * TF, q: q * TF, vinculos },
    mat,
  );
  return { laje: { id: nome, nome, x, y, lx, ly }, vinculos, esforcos };
}

/** Johansen, laje isótropa: m = p a²/24 (√(3 + (a/b)²) − a/b)², a ≤ b vãos reduzidos. */
const johansen = (p: number, a: number, b: number) =>
  ((p * a * a) / 24) * (Math.sqrt(3 + (a / b) ** 2) - a / b) ** 2;
/** Vão reduzido com um bordo engastado (i = 2) e o oposto apoiado. */
const reduzido1 = (l: number) => (2 * l) / (1 + Math.sqrt(3));

describe("compatibilização dos negativos (V1 LcCalculaTodas)", () => {
  it("duas lajes contínuas: mesmo X nos dois lados e positivo corrigido com ΔX/2", () => {
    const l1 = laje("L1", 0, 0, 4, 5, "AAEA", 10, 0.1, 0.15);
    const l2 = laje("L2", 4, 0, 3, 5, "EAAA", 10, 0.1, 0.15);
    const p = 0.5 * TF; // pp 0,25 + g 0,1 + q 0,15 tf/m²
    expect(l1.esforcos.avisos).toEqual([]);
    expect(l2.esforcos.avisos).toEqual([]);
    const m1 = johansen(p, reduzido1(4), 5);
    const m2 = johansen(p, reduzido1(3), 5);
    expect(l1.esforcos.mx).toBeCloseTo(m1, 9);
    expect(l1.esforcos.negativos.direito).toBeCloseTo(2 * m1, 9);
    expect(l2.esforcos.negativos.esquerdo).toBeCloseTo(2 * m2, 9);
    const xc = Math.max((2 * m1 + 2 * m2) / 2, 0.8 * 2 * m1);

    const [r1, r2] = compatibilizaLajes([l1, l2], compatibilizaNegativoNb178);
    expect(r1!.negativos.direito).toBeCloseTo(xc, 9);
    expect(r2!.negativos.esquerdo).toBeCloseTo(r1!.negativos.direito, 12);
    // L1 perdeu negativo: mx + (X próprio − X compatibilizado)/2; my não muda
    expect(r1!.mx).toBeCloseTo(m1 + (2 * m1 - xc) / 2, 9);
    expect(r1!.my).toBeCloseTo(m1, 9);
    // L2 ganhou negativo: positivo não muda
    expect(r2!.mx).toBeCloseTo(m2, 9);
    expect(r1!.memoria.length).toBeGreaterThan(l1.esforcos.memoria.length);
  });

  it("balanço ao lado de laje interna: X = pl²/2 sem redução e a laje interna o recebe", () => {
    const l1 = laje("L1", 0, 0, 3, 5, "AAEA", 10, 0.05, 0.25);
    const l2 = laje("L2", 3, 0, 2, 5, "ELLL", 10, 0.05, 0.25);
    const p = 0.55 * TF;
    const [r1, r2] = compatibilizaLajes([l1, l2], compatibilizaNegativoNb178);
    expect(r2!.negativos.esquerdo).toBeCloseTo((p * 4) / 2, 9);
    expect(r1!.negativos.direito).toBeCloseTo(r2!.negativos.esquerdo, 12);
    // a laje interna ganhou negativo: positivo inalterado
    expect(r1!.mx).toBeCloseTo(johansen(p, reduzido1(3), 5), 9);
  });

  it("balanço com o momento menor que o da laje interna também não é reduzido", () => {
    const l1 = laje("L1", 0, 0, 6, 5, "AAEA", 10, 0.05, 0.25);
    const l2 = laje("L2", 6, 0, 0.5, 5, "ELLL", 10, 0.05, 0.25);
    const p = 0.55 * TF;
    const m1 = johansen(p, reduzido1(6), 5);
    const xb = (p * 0.25) / 2;
    expect(2 * m1).toBeGreaterThan(xb);
    const [r1, r2] = compatibilizaLajes([l1, l2], compatibilizaNegativoNb178);
    expect(r2!.negativos.esquerdo).toBeCloseTo(xb, 9);
    expect(r1!.negativos.direito).toBeCloseTo(xb, 9);
    // a laje interna perdeu negativo: recebe ΔX/2 no positivo da direção x
    expect(r1!.mx).toBeCloseTo(m1 + (2 * m1 - xb) / 2, 9);
  });

  it("vizinhos do mesmo lado da viga não se compatibilizam entre si", () => {
    const a = laje("A", 0, 0, 8, 4, "AAAE", 12, 0.1, 0.15);
    const b = laje("B", 0, 4, 4, 4, "AEAA", 12, 0.1, 0.15);
    const c = laje("C", 4, 4, 2, 4, "AEAA", 12, 0.1, 0.15);
    const p = 0.55 * TF; // pp 0,30 + 0,1 + 0,15
    const xa = 2 * johansen(p, reduzido1(4), 8);
    const xb = 2 * johansen(p, reduzido1(4), 4);
    const xc = 2 * johansen(p, 2, reduzido1(4));
    expect(a.esforcos.negativos.superior).toBeCloseTo(xa, 9);
    expect(b.esforcos.negativos.inferior).toBeCloseTo(xb, 9);
    expect(c.esforcos.negativos.inferior).toBeCloseTo(xc, 9);
    const [ra, rb, rc] = compatibilizaLajes([a, b, c], compatibilizaNegativoNb178);
    const comp = compatibilizaNegativoNb178;
    expect(rb!.negativos.inferior).toBeGreaterThanOrEqual(comp(xb, xa) - 1e-9);
    expect(rc!.negativos.inferior).toBeGreaterThanOrEqual(comp(xc, xa) - 1e-9);
    expect(ra!.negativos.superior).toBeCloseTo(Math.max(comp(xa, xb), comp(xa, xc)), 9);
    expect(rb!.negativos.inferior).toBeCloseTo(ra!.negativos.superior, 12);
    expect(rc!.negativos.inferior).toBeCloseTo(ra!.negativos.superior, 12);
  });

  it("engaste de um lado só (vizinha apoiada) não compatibiliza", () => {
    const l1 = laje("L1", 0, 0, 4, 5, "AAEA", 10, 0.1, 0.15);
    const l2 = laje("L2", 4, 0, 3, 5, "AAAA", 10, 0.1, 0.15);
    const [r1, r2] = compatibilizaLajes([l1, l2], compatibilizaNegativoNb178);
    expect(r1).toBe(l1.esforcos);
    expect(r2).toBe(l2.esforcos);
  });

  it("laje sem cálculo (bordos não suportados) fica fora", () => {
    const l1 = laje("L1", 0, 0, 4, 5, "AAEA", 10, 0.1, 0.15);
    const l2 = laje("L2", 4, 0, 3, 5, "ELLA", 10, 0.1, 0.15);
    expect(l2.esforcos.avisos.length).toBe(1);
    const [r1, r2] = compatibilizaLajes([l1, l2], compatibilizaNegativoNb178);
    expect(r1).toBe(l1.esforcos);
    expect(r2).toBe(l2.esforcos);
  });

  it("balanço curto com recalcular (6118): laje 2A 4 × 4 vira apoiada no bordo do balanço", () => {
    // L1 4 × 4 com o superior engastado = tipo 2A, λ = 1 (tabelasBares): μx 2,91; μy 3,55; μ'y 8,39.
    // L2: balanço de 0,2 m engastado no inferior: X = p · 0,2²/2 = 0,02 p ≪ 8,39 · 0,16 p.
    // Com o bordo apoiado L1 é tipo 1, λ = 1: μx = μy = 4,24; m = μ p lx²/100.
    const mat6118 = materiais6118(obraNova("x", "nbr6118-2023").materiais);
    const entrada = (nome: string, lx: number, ly: number, vinculos: Record<Bordo, Vinculo>) => ({
      nome,
      lx,
      ly,
      h: 12,
      g: 4,
      q: 2,
      vinculos,
    });
    const v1 = v("AAAE");
    const v2 = v("LELL");
    const l1: LajeParaCompatibilizar = {
      laje: { id: "L1", nome: "L1", x: 0, y: 0, lx: 4, ly: 4 },
      vinculos: v1,
      esforcos: lajeEsforcos6118(entrada("L1", 4, 4, v1), mat6118),
    };
    const l2: LajeParaCompatibilizar = {
      laje: { id: "L2", nome: "L2", x: 0, y: 4, lx: 4, ly: 0.2 },
      vinculos: v2,
      esforcos: lajeEsforcos6118(entrada("L2", 4, 0.2, v2), mat6118),
    };
    const p = 6;
    const base = (p * 16) / 100;
    expect(l1.esforcos.mx).toBeCloseTo(2.91 * base, 9);
    expect(l1.esforcos.negativos.superior).toBeCloseTo(8.39 * base, 9);
    const xb = (p * 0.2 ** 2) / 2;
    expect(l2.esforcos.negativos.inferior).toBeCloseTo(xb, 9);

    const chamadas: Record<Bordo, Vinculo>[] = [];
    const recalcular = (l: LajeParaCompatibilizar, vinculos: Record<Bordo, Vinculo>) => {
      chamadas.push(vinculos);
      return lajeEsforcos6118(entrada(l.laje.nome, l.laje.lx, l.laje.ly, vinculos), mat6118);
    };
    const [r1, r2] = compatibilizaLajes([l1, l2], compatibilizaNegativo6118, recalcular);
    expect(chamadas).toEqual([v("AAAA")]);
    // o bordo mantém o X do balanço
    expect(r1!.negativos.superior).toBeCloseTo(xb, 9);
    expect(r2!.negativos.inferior).toBeCloseTo(xb, 9);
    // mx sobe de 2,91 para 4,24 (laje apoiada); my fica com o maior entre o corrigido
    // 3,55 · base + (8,39 · base − xb)/2 e o apoiado 4,24 · base
    expect(r1!.mx).toBeCloseTo(4.24 * base, 9);
    expect(r1!.my).toBeCloseTo(Math.max(3.55 * base + (8.39 * base - xb) / 2, 4.24 * base), 9);
    // reações: o maior de cada bordo (2A: νx 1,83, νy 2,75; tipo 1: ν = 2,50; V = ν p lx/10)
    expect(r1!.reacoes.esquerdo).toBeCloseTo((2.5 * p * 4) / 10, 9);
    expect(r1!.reacoes.inferior).toBeCloseTo((2.75 * p * 4) / 10, 9);
    expect(r1!.memoria.some((m) => m.descricao.includes("recalculada"))).toBe(true);

    // sem a função (NB-1/78, paridade com a V1) nada disso acontece
    const [s1] = compatibilizaLajes([l1, l2], compatibilizaNegativo6118);
    expect(s1!.mx).toBeCloseTo(2.91 * base, 9);
  });

  it("negativo que cai menos que 50 % não recalcula", () => {
    const l1 = laje("L1", 0, 0, 4, 5, "AAEA", 10, 0.1, 0.15);
    const l2 = laje("L2", 4, 0, 3, 5, "EAAA", 10, 0.1, 0.15);
    let chamou = false;
    compatibilizaLajes([l1, l2], compatibilizaNegativoNb178, (l) => {
      chamou = true;
      return l.esforcos;
    });
    expect(chamou).toBe(false);
  });

  it("usa a função de compatibilização recebida", () => {
    const l1 = laje("L1", 0, 0, 4, 5, "AAEA", 10, 0.1, 0.15);
    const l2 = laje("L2", 4, 0, 3, 5, "EAAA", 10, 0.1, 0.15);
    const media = (xa: number, xb: number) => (xa + xb) / 2;
    const [r1, r2]: LajeEsforcos[] = compatibilizaLajes([l1, l2], media);
    const esperado = (l1.esforcos.negativos.direito + l2.esforcos.negativos.esquerdo) / 2;
    expect(r1!.negativos.direito).toBeCloseTo(esperado, 12);
    expect(r2!.negativos.esquerdo).toBeCloseTo(esperado, 12);
  });
});

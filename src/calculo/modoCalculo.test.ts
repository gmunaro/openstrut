// Itens de docs/MODO-CALCULO.md que dependem do motor inteiro (calcularObra e
// calcularQuantitativos): B, D, H e os quantitativos de viga do DESINIT. Os valores
// esperados vêm de conta à mão (escrita em cada caso); nenhum vem da saída das próprias
// funções. Os itens E, F e G antigos (negativa contada duas vezes; volume e fôrma da
// "tela" e do "relatório") reproduziam a V1 antiga e saíram (PLANO da paridade 4.1).
// O C e a paridade da obra BALC com a V1 estão em armazenamento/importarV1.balanco.test.ts.
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Aco, Laje, ModoCalculo, Obra } from "../dominio/obra";
import { armaduraLongitudinalCortante, calcularObra } from "./fluxo";
import { nb178 } from "./normas";
import {
  calcularQuantitativos,
  NAO_EXISTE_NO_SISTRUT,
  quantLaje,
  vizinhancaLajes,
} from "./quantitativos";
import type { Barra } from "./tipos";

const perto = (valor: number, esperado: number, tol: number) =>
  expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

describe("B: armadura longitudinal no τc do cortante (V1 VcAsLong#, fluxo da V2)", () => {
  // Não é regra do SISTRUT (o DESDIM usa ψ = 0,225 + 15ρ): vale só no fluxo genérico
  // da V2 (NBR 6118:2023). A NB-1/78 passa pelo DESDIM nos dois modos.
  it("1/3 da positiva sem negativo; 1/4 com negativo; a negativa se for menor", () => {
    expect(armaduraLongitudinalCortante(6, 0)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(6, 3)).toBeCloseTo(1.5, 12);
    expect(armaduraLongitudinalCortante(6, 1)).toBeCloseTo(1, 12);
    expect(armaduraLongitudinalCortante(0, 2)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(Number.NaN, 2)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(6, Number.NaN)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(0, 0)).toBe(0);
  });
});

// Obra E2E gerada pelo editor: 4 lajes 4×5 h 10, vigas horizontais 8 m 12x40 e
// verticais 10 m 12x50 (h = vão/10), 9 pilares 20x20, pé-direito 3.
function obraE2E(modoCalculo: ModoCalculo, aco: Aco = "CA-50"): Obra {
  const obra = obraNova("E2E", "nb1-78");
  let pav = { ...obra.pavimentos[0]!, peDireito: 3 };
  const lajes: Laje[] = [];
  for (const [x, y] of [
    [0, 0],
    [4, 0],
    [0, 5],
    [4, 5],
  ] as const)
    lajes.push(lajeNova({ ...pav, lajes }, { x, y, lx: 4, ly: 5 }, { h: 10 }));
  pav = gerarEstrutura({ ...pav, lajes });
  return {
    ...obra,
    modoCalculo,
    materiais: { ...obra.materiais, aco, acoEstribo: aco, classeAco: "A" },
    pavimentos: [pav],
  };
}

describe("H: armadura mínima de flexão de viga (DESDIM, As,mín = taxa·bw·hw)", () => {
  // DESENHO.BAS:4819-4820 (.DSP 0,0015 para qualquer aço) × 0,25 % com CA-25 no
  // corrigido. Nos tramos de M pequeno a mínima governa: As = taxa·bw·hw.
  const tramos = (modo: ModoCalculo, aco: Aco) =>
    calcularObra(obraE2E(modo, aco), nb178).pavimentos[0]!.vigas.flatMap((v) =>
      v.tramos.flatMap((t) =>
        t.positivo.flexao ? [{ as: t.positivo.flexao.as, ac: v.viga.bw * v.viga.h }] : [],
      ),
    );

  it('"corrigido" com CA-25: nenhum tramo abaixo de 0,25 %·bw·h e algum exatamente nela', () => {
    const ts = tramos("corrigido", "CA-25");
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) expect(t.as).toBeGreaterThanOrEqual(0.0025 * t.ac - 1e-9);
    expect(ts.some((t) => Math.abs(t.as - 0.0025 * t.ac) < 1e-9)).toBe(true);
  });

  it('"original" com CA-25: a mínima é 0,15 % (12·40·0,0015 = 0,72): algum tramo abaixo de 0,25 %', () => {
    const ts = tramos("original", "CA-25");
    for (const t of ts) expect(t.as).toBeGreaterThanOrEqual(0.0015 * t.ac - 1e-6);
    expect(ts.some((t) => t.as < 0.0025 * t.ac - 1e-6)).toBe(true);
  });

  it('"corrigido" com CA-50: 0,15 % também (a correção é só do CA-25)', () => {
    for (const t of tramos("corrigido", "CA-50"))
      expect(t.as).toBeGreaterThanOrEqual(0.0015 * t.ac - 1e-9);
  });
});

// Laje 4 × 5 m com malhas dadas. Peso = as (cm²/m) · 1e-4 · largura · comprimento · 7850.
//   X φ8 c/15: 0,50265/0,15 = 3,35103 cm²/m · 5 · 4 → 52,611 kg
//   Y φ8 c/20: 2,51327 cm²/m · 4 · 5 → 39,458 kg
//   negativa direita φ10 c/12,5: 6,28319 cm²/m ao longo de 5 m: 24,662 kg por metro de barra
describe("negativas das lajes: cada laje conta o seu lado", () => {
  it("o lado desta laje, 0,25·4 = 1 m → (52,611 + 39,458 + 24,662) · 1,1 = 128,404 kg", () => {
    const laje = { nome: "L1", lx: 4, ly: 5, h: 10 };
    const armadura = {
      barrasX: { phi: 8, espacamento: 15 },
      barrasY: { phi: 8, espacamento: 20 },
      barrasNegativos: { direito: { phi: 10, espacamento: 12.5 } },
    };
    perto(quantLaje(laje, armadura).aco, 128.404, 0.01);
  });
});

// Obra de revisão _rev5/quant/q1.ts: L1 4×5 apoiada e L2 em balanço 1,5×5 (bordos
// inferior, direito e superior livres), h 10, NB-1/78, pilares 20x30.
function obraQ1(modoCalculo: ModoCalculo): Obra {
  const obra = obraNova("REV5", "nb1-78");
  let pav = { ...obra.pavimentos[0]!, peDireito: 3 };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, { h: 10 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(
    pav,
    { x: 4, y: 0, lx: 1.5, ly: 5 },
    { h: 10, vinculos: { inferior: "livre", direito: "livre", superior: "livre" } },
  );
  pav = gerarEstrutura({ ...pav, lajes: [l1, l2] });
  pav = { ...pav, pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 30 })) };
  return { ...obra, modoCalculo, pavimentos: [pav] };
}

/** Peso de uma malha φ c/s cobrindo largura × comprimento (m), kg (conta à mão). */
const malha = (b: Barra | undefined, largura: number, comprimento: number) =>
  b && b.phi > 0
    ? ((Math.PI * (b.phi / 10) ** 2) / 4) *
      (100 / b.espacamento) *
      1e-4 *
      largura *
      comprimento *
      7850
    : 0;

// Item D: a negativa do bordo comum é a armadura do balanço L2 e vai da borda livre até
// 0,25·x dentro de L1, x = máx(lmenor de L2 = 1,5; menor vão de L1 = 4) = 4: 1,5 + 1,0 =
// 2,5 m ao longo dos 5 m do bordo. L1 não conta esse bordo. As malhas são as do LAJEPROC
// (conferido contra o oráculo em sistrut/lajes/proc.test.ts); o peso é conta à mão.
describe.each(["corrigido", "original"] as const)("D: aço da laje em balanço (%s)", (modo) => {
  const obra = obraQ1(modo);
  const r = calcularObra(obra, nb178);
  const rp = r.pavimentos[0]!;
  const lajeR = (nome: string) => rp.lajes.find((l) => l.laje.nome === nome)!;

  it("a barra do bordo comum é do balanço: L2 com 4 m de vizinha, L1 não conta o bordo", () => {
    const viz = vizinhancaLajes(rp);
    expect(viz.get(lajeR("L2").laje.id)?.vaoMenorVizinha).toEqual({ esquerdo: 4 });
    expect(viz.get(lajeR("L1").laje.id)?.negativaNoBalanco).toEqual(["direito"]);
  });

  it("pesos: L2 = (positivas + negativa × 2,5 m) · 1,1; L1 = positivas · 1,1", () => {
    const q = calcularQuantitativos(obra, r);
    const mem = (nome: string) =>
      q.pavimentos[0]!.memoria.find((m) => m.descricao.startsWith(`${nome}: aço`))!.valor!;
    const a2 = lajeR("L2").armadura;
    const a1 = lajeR("L1").armadura;
    const neg = a2.barrasNegativos.esquerdo;
    expect(neg?.phi).toBeGreaterThan(0);
    const l2 = (malha(a2.barrasX, 5, 1.5) + malha(a2.barrasY, 1.5, 5) + malha(neg, 5, 2.5)) * 1.1;
    const l1 = (malha(a1.barrasX, 5, 4) + malha(a1.barrasY, 4, 5)) * 1.1;
    perto(mem("L2"), l2, 1e-6);
    perto(mem("L1"), l1, 1e-6);
    expect(
      q.pavimentos[0]!.memoria.find((m) => m.descricao.startsWith("L1: aço"))!.descricao,
    ).toContain(NAO_EXISTE_NO_SISTRUT);
  });
});

// Volume e fôrma da obra E2E gerada (conta à mão):
// - certa (corrigido): lajes 8,0 + vigas abaixo da laje (3·8·0,12·0,30 + 3·10·0,12·0,40 =
//   2,304) + pilares 9·0,2·0,2·3 = 1,08 → 11,384 m³; fôrma 144,752 m² (formas.test.ts);
// - original: vigas pelo quadro do DESINIT (DESINIT.BAS:763-770): vão livre 380 (12x40
//   entre pilares de 20) e 480 (12x50), INT no centésimo por viga:
//   volume 3·INT(2·12·40·380/10⁴ = 36,48) + 3·INT(2·12·50·480/10⁴ = 57,6) = 279 → 2,79 m³;
//   fôrma (2h + bw − Hle − Hld)·vl/100: borda 12x40 (80 + 12 − 10)·760 = 623,2 → 623,
//   centro 72·760 → 547; borda 12x50 102·960 → 979, centro 92·960 → 883:
//   2·623 + 547 + 2·979 + 883 = 4634 → 46,34 m². Lajes e pilares pela regra certa.
describe("quantitativos da obra E2E", () => {
  const quant = (modo: ModoCalculo) => {
    const obra = obraE2E(modo);
    return calcularQuantitativos(obra, calcularObra(obra, nb178));
  };

  it('"corrigido": 11,384 m³ e 144,752 m² pela regra certa; aço das vigas do DESINIT', () => {
    const q = quant("corrigido");
    expect(q.modoCalculo).toBe("corrigido");
    perto(q.total.concreto, 11.384, 1e-9);
    perto(q.total.forma, 144.752, 1e-9);
    expect(q.fonte.vigas).toEqual({ concreto: "v2", forma: "v2", aco: "sistrut" });
    expect(q.fonte.lajes.aco).toBe("v2");
    expect(q.vigas.aco).toBeGreaterThan(0);
  });

  it('"original": vigas 2,79 m³ e 46,34 m² do DESINIT; lajes 8,0 e pilares 1,08 pela regra certa', () => {
    const q = quant("original");
    perto(q.vigas.concreto, 2.79, 1e-9);
    perto(q.vigas.forma, 46.34, 1e-9);
    perto(q.lajes.concreto, 8, 1e-9);
    perto(q.pilares.concreto, 1.08, 1e-9);
    expect(q.fonte.vigas).toEqual({ concreto: "sistrut", forma: "sistrut", aco: "sistrut" });
    expect(q.fonte.pilares).toEqual({ concreto: "v2", forma: "v2", aco: "v2" });
  });
});

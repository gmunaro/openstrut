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
  // corrigido. Nas vigas de borda (V1 e V3 12x40, V4 e V6 12x50) o M+ é pequeno e a
  // mínima governa o tramo (conta à mão: taxa·bw·hw).
  const asTramos = (modo: ModoCalculo, aco: Aco) =>
    Object.fromEntries(
      calcularObra(obraE2E(modo, aco), nb178).pavimentos[0]!.vigas.map((v) => [
        v.viga.nome,
        v.tramos.map((t) => t.positivo.flexao!.as),
      ]),
    );

  it.each(["original", "corrigido"] as const)(
    "%s com CA-50: 0,0015·12·40 = 0,72 nas 12x40 e 0,0015·12·50 = 0,90 nas 12x50",
    (modo) => {
      const as = asTramos(modo, "CA-50");
      for (const v of ["V1", "V3"]) for (const x of as[v]!) expect(x).toBeCloseTo(0.72, 6);
      for (const v of ["V4", "V6"]) for (const x of as[v]!) expect(x).toBeCloseTo(0.9, 6);
    },
  );

  it("corrigido com CA-25: 0,0025·12·40 = 1,20 nas 12x40 de borda", () => {
    const as = asTramos("corrigido", "CA-25");
    for (const v of ["V1", "V3"]) for (const x of as[v]!) expect(x).toBeCloseTo(1.2, 6);
  });

  it("original com CA-25: a mínima é 0,72; o tramo fica com a As de flexão, abaixo de 1,20", () => {
    const as = asTramos("original", "CA-25");
    for (const v of ["V1", "V3"])
      for (const x of as[v]!) {
        expect(x).toBeGreaterThan(0.72);
        expect(x).toBeLessThan(1.2);
      }
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

// Item D (regra da V2): a negativa do bordo comum é a armadura do balanço e vai da
// borda livre até 0,25·x dentro da vizinha, x = máx(lmenor do balanço; menor vão da
// vizinha); a vizinha não conta esse bordo. Obra do caso v2par_laje_balanco do oráculo
// (C:/tmp/oraculo/runs/v2par_laje_balanco-20261015-162752): L2 interna 4 × 5 e L1 em
// balanço 4 × 1,5 sobre ela (três bordos livres), h 10, permanente 0,10 e ocupação 0,15
// t/m², fck 0,15 t/cm², CA-50 classe B, modo original. As malhas são as que o LAJEPROC
// do original imprimiu (pré-condição): positivas # 6.3 c/20, negativa # 6.3 c/10.
// Pesos à mão (φ 6,3: π·0,63²/4 = 0,311725 cm²; c/20 → 1,558623 cm²/m; c/10 → 3,117245):
//   L1 positivas 2·1,558623e-4·1,5·4·7850 = 14,6822; negativa 1,5 + 0,25·4 = 2,5 m ao
//   longo dos 4 m: 3,117245e-4·4·2,5·7850 = 24,4704 → (14,6822 + 24,4704)·1,1 = 43,0679 kg
//   L2 positivas 2·1,558623e-4·20·7850 = 48,9407 → ·1,1 = 53,8348 kg (sem a negativa)
function obraBalanco(): Obra {
  const obra = obraNova("BAL", "nb1-78");
  const kn = (t: number) => t * 9.80665;
  const pav = { ...obra.pavimentos[0]!, peDireito: 3 };
  const cargas = { h: 10, revestimento: kn(0.1), sobrecarga: kn(0.15) };
  const l2 = { ...lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, cargas), id: "L2", nome: "L2" };
  const l1 = {
    ...lajeNova(pav, { x: 0, y: 5, lx: 4, ly: 1.5 }, cargas),
    id: "L1",
    nome: "L1",
    vinculos: { esquerdo: "livre", superior: "livre", direito: "livre" } as const,
  };
  const viga = (id: string, x1: number, y1: number, x2: number, y2: number) => ({
    id,
    nome: id,
    x1,
    y1,
    x2,
    y2,
    bw: 12,
    h: 40,
    cargaLinear: 0,
  });
  return {
    ...obra,
    modoCalculo: "original",
    materiais: { ...obra.materiais, classeAco: "B" },
    pavimentos: [
      {
        ...pav,
        lajes: [l1, l2],
        vigas: [
          viga("V1", 0, 5, 4, 5),
          viga("V2", 0, 0, 4, 0),
          viga("V3", 0, 0, 0, 5),
          viga("V4", 4, 0, 4, 5),
        ],
        pilares: [
          { id: "P1", nome: "P1", x: 0, y: 0, b: 20, h: 20 },
          { id: "P2", nome: "P2", x: 4, y: 0, b: 20, h: 20 },
          { id: "P3", nome: "P3", x: 4, y: 5, b: 20, h: 20 },
          { id: "P4", nome: "P4", x: 0, y: 5, b: 20, h: 20 },
        ],
      },
    ],
  };
}

describe("D: aço da laje em balanço (obra do v2par_laje_balanco, modo original)", () => {
  const obra = obraBalanco();
  const r = calcularObra(obra, nb178);
  const rp = r.pavimentos[0]!;
  const lajeR = (nome: string) => rp.lajes.find((l) => l.laje.nome === nome)!;

  it("pré-condição: as malhas do LAJEPROC do original (# 6.3 c/20 e # 6.3 c/10)", () => {
    for (const nome of ["L1", "L2"]) {
      expect(lajeR(nome).armadura.barrasX).toEqual({ phi: 6.3, espacamento: 20 });
      expect(lajeR(nome).armadura.barrasY).toEqual({ phi: 6.3, espacamento: 20 });
    }
    expect(lajeR("L1").armadura.barrasNegativos.inferior).toEqual({ phi: 6.3, espacamento: 10 });
  });

  it("a barra do bordo comum é do balanço: L1 com 4 m de vizinha, L2 não conta o bordo", () => {
    const viz = vizinhancaLajes(rp);
    expect(viz.get("L1")?.vaoMenorVizinha).toEqual({ inferior: 4 });
    expect(viz.get("L2")?.negativaNoBalanco).toEqual(["superior"]);
  });

  it("pesos: L1 = 43,068 kg e L2 = 53,835 kg (conta à mão no cabeçalho)", () => {
    const q = calcularQuantitativos(obra, r);
    const mem = (nome: string) =>
      q.pavimentos[0]!.memoria.find((m) => m.descricao.startsWith(`${nome}: aço`))!;
    perto(mem("L1").valor!, 43.0679, 0.001);
    perto(mem("L2").valor!, 53.8348, 0.001);
    expect(mem("L1").descricao).toContain(NAO_EXISTE_NO_SISTRUT);
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

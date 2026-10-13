// Correções B, D, E, F e H (docs/MODO-CALCULO.md). Os valores esperados vêm de conta
// à mão (escrita em cada caso) ou da V1; nenhum vem da saída das próprias funções.
// O C e a paridade com a V1 da obra BALC estão em armazenamento/importarV1.balanco.test.ts.
import { describe, expect, it } from "vitest";
import { lajeNova, materiaisPadrao, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Laje, ModoCalculo, Obra } from "../dominio/obra";
import { armaduraLongitudinalCortante, calcularObra } from "./fluxo";
import { nb178 } from "./normas";
import { vigaFlexaoNb178 } from "./normas/nb1-78/vigas";
import { calcularQuantitativos, quantLaje, vizinhancaLajes } from "./quantitativos";

const perto = (valor: number, esperado: number, tol: number) =>
  expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

describe("B: armadura longitudinal no τc do cortante (V1 VcAsLong#)", () => {
  it("1/3 da positiva sem negativo; 1/4 com negativo; a negativa se for menor", () => {
    // regra da V1: a = asNeg > 0 ? asPos/4 : asPos/3; com negativo, a = asNeg se asNeg < a
    expect(armaduraLongitudinalCortante(6, 0)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(6, 3)).toBeCloseTo(1.5, 12);
    expect(armaduraLongitudinalCortante(6, 1)).toBeCloseTo(1, 12);
    // sem positiva (balanço): a negativa
    expect(armaduraLongitudinalCortante(0, 2)).toBeCloseTo(2, 12);
    // seção sem solução (NaN) conta como 0, como o −1 da V1
    expect(armaduraLongitudinalCortante(Number.NaN, 2)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(6, Number.NaN)).toBeCloseTo(2, 12);
    expect(armaduraLongitudinalCortante(0, 0)).toBe(0);
  });
});

describe("H: armadura mínima de flexão de viga na NB-1/78", () => {
  const mat = (aco: "CA-25" | "CA-50", modoCalculo: ModoCalculo) => ({
    ...nb178.materiais({ ...materiaisPadrao("nb1-78"), aco }),
    modoCalculo,
  });
  // viga 12x50, d 46, Md = 1 kN·m: As calculada ≈ 0,05 cm², a mínima prevalece
  const asMin = (aco: "CA-25" | "CA-50", modo: ModoCalculo) =>
    vigaFlexaoNb178(1, 12, 50, 46, mat(aco, modo)).as;

  it('"corrigido": 0,25 % com CA-25 (12·50·0,0025 = 1,5 cm²), 0,15 % com CA-50 (0,9)', () => {
    expect(asMin("CA-25", "corrigido")).toBeCloseTo(1.5, 9);
    expect(asMin("CA-50", "corrigido")).toBeCloseTo(0.9, 9);
  });

  it('"original": 0,15 % para qualquer aço (SISTRUT.LAP): 0,9 cm² com CA-25 e CA-50', () => {
    expect(asMin("CA-25", "original")).toBeCloseTo(0.9, 9);
    expect(asMin("CA-50", "original")).toBeCloseTo(0.9, 9);
  });
});

// Laje 4 × 5 m com malhas dadas. Peso = as (cm²/m) · 1e-4 · largura · comprimento · 7850.
//   X φ8 c/15: 0,50265/0,15 = 3,35103 cm²/m · 5 · 4 → 52,611 kg
//   Y φ8 c/20: 2,51327 cm²/m · 4 · 5 → 39,458 kg
//   negativa direita φ10 c/12,5: 6,28319 cm²/m ao longo de 5 m: 24,662 kg por metro de barra
describe("E: negativas das lajes contadas uma vez (corrigido) ou duas (original)", () => {
  const laje = { nome: "L1", lx: 4, ly: 5, h: 10 };
  const armadura = {
    barrasX: { phi: 8, espacamento: 15 },
    barrasY: { phi: 8, espacamento: 20 },
    barrasNegativos: { direito: { phi: 10, espacamento: 12.5 } },
  };

  it('"corrigido": o lado desta laje, 0,25·4 = 1 m → (52,611 + 39,458 + 24,662) · 1,1 = 128,404 kg', () => {
    perto(quantLaje(laje, armadura, undefined, "corrigido").aco, 128.404, 0.01);
  });

  it('"original": a barra inteira, 2·0,25·4 = 2 m (V1 LAJEPROC) → (52,611 + 39,458 + 49,323) · 1,1 = 155,531 kg', () => {
    perto(quantLaje(laje, armadura, undefined, "original").aco, 155.531, 0.01);
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

// Pesos à mão (φ5: 0,19635 cm²):
//   L1 positivas φ5 c/13 = 1,51038 cm²/m nas duas direções: 2 · 1,51038e-4 · 20 · 7850 = 47,426 kg
//   negativa do bordo comum φ5 c/8 = 2,45437 cm²/m ao longo de 5 m: 9,633 kg por metro de barra
//   balanço L2: barra da borda livre até 0,25·4 dentro de L1 = 1,5 + 1,0 = 2,5 m → 24,083 kg
describe("D: aço da laje em balanço e negativa do bordo do balanço", () => {
  const corrigido = obraQ1("corrigido");
  const r = calcularObra(corrigido, nb178);
  const rp = r.pavimentos[0]!;
  const arm = (nome: string) => rp.lajes.find((l) => l.laje.nome === nome)!.armadura;

  it("pré-condição: as malhas adotadas da conta à mão", () => {
    expect(arm("L1").barrasX).toEqual({ phi: 5, espacamento: 13 });
    expect(arm("L1").barrasY).toEqual({ phi: 5, espacamento: 13 });
    expect(arm("L1").barrasNegativos.direito).toEqual({ phi: 5, espacamento: 8 });
    expect(arm("L2").barrasNegativos.esquerdo).toEqual({ phi: 5, espacamento: 8 });
  });

  it("a barra do bordo comum é do balanço: L2 com 4 m de vizinha, L1 não conta o bordo", () => {
    const viz = vizinhancaLajes(rp);
    const id = (nome: string) => rp.lajes.find((l) => l.laje.nome === nome)!.laje.id;
    expect(viz.get(id("L2"))?.vaoMenorVizinha).toEqual({ esquerdo: 4 });
    expect(viz.get(id("L1"))?.negativaNoBalanco).toEqual(["direito"]);
  });

  it("corrigido: L2 = 24,083 · 1,1 = 26,491 kg (antes 3,974: 0,375 m de barra, 85 % abaixo); L1 = 47,426 · 1,1 = 52,169", () => {
    const q = calcularQuantitativos(corrigido, r);
    const mem = (nome: string) =>
      q.pavimentos[0]!.memoria.find((m) => m.descricao.startsWith(`${nome}: aço`))!.valor!;
    perto(mem("L2"), 26.491, 0.01);
    perto(mem("L1"), 52.169, 0.01);
    perto(q.lajes.aco, 78.66, 0.02);
  });

  it("original: o balanço continua certo (D vale sempre) e L1 conta a barra de novo, 2 m: (47,426 + 19,267) · 1,1 = 73,362", () => {
    const original = obraQ1("original");
    const q = calcularQuantitativos(original, calcularObra(original, nb178));
    const mem = (nome: string) =>
      q.pavimentos[0]!.memoria.find((m) => m.descricao.startsWith(`${nome}: aço`))!.valor!;
    perto(mem("L2"), 26.491, 0.01);
    perto(mem("L1"), 73.362, 0.01);
  });
});

// Obra E2E da V1 (dist/roteiros/saida/e2e_10_forma-*): 4 lajes 4×5 h 10, vigas
// horizontais 8 m 12x40 e verticais 10 m 12x50, 9 pilares 20x20, pé-direito 3.
// V1: FORMEDCA "Volume de concreto 10.304" e "Area de forma com pe-direito 146.48"
// (f08_quant_res.txt); FORMIMP "volume de concreto 12.032", "area de forma 157.280"
// (E2E_FORMIMP.LST). Certo, à mão: lajes 8,0 + vigas abaixo da laje
// (3·8·0,12·0,30 + 3·10·0,12·0,40 = 2,304) + pilares 9·0,2·0,2·3 = 1,08 → 11,384 m³.
function obraE2E(modoCalculo: ModoCalculo): Obra {
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
  return { ...obra, modoCalculo, pavimentos: [pav] };
}

describe("F: volume e fôrma da tela e do relatório (obra E2E)", () => {
  const quant = (modo: ModoCalculo) => {
    const obra = obraE2E(modo);
    return calcularQuantitativos(obra, calcularObra(obra, nb178));
  };

  it('"corrigido": tela e relatório = 11,384 m³ e 144,752 m² (formas.test.ts)', () => {
    const q = quant("corrigido");
    expect(q.modoCalculo).toBe("corrigido");
    perto(q.volumeTela, 11.384, 1e-9);
    perto(q.volumeRelatorio, 11.384, 1e-9);
    perto(q.total.concreto, 11.384, 1e-9);
    perto(q.formaTela, 144.752, 1e-9);
    perto(q.formaRelatorio, 144.752, 1e-9);
  });

  it('"original": tela 10,304 m³ / 146,48 m² (FORMEDCA) e relatório 12,032 m³ / 157,28 m² (FORMIMP), como a V1', () => {
    const q = quant("original");
    perto(q.volumeTela, 10.304, 1e-9);
    perto(q.formaTela, 146.48, 1e-9);
    perto(q.volumeRelatorio, 12.032, 1e-9);
    perto(q.formaRelatorio, 157.28, 1e-9);
    // por tipo, como o FORMIMP: lajes 8,000; vigas 2,952; pilares 1,080
    perto(q.lajes.concreto, 8, 1e-9);
    perto(q.vigas.concreto, 2.952, 1e-9);
    perto(q.pilares.concreto, 1.08, 1e-9);
    perto(q.total.concreto, q.volumeRelatorio, 1e-12);
  });
});

// Área de fôrma conferida à mão numa obra pequena: duas lajes 4 × 5 m lado a lado
// (h = 10 cm), vigas e pilares gerados como no editor, pé-direito 3 m, 2 repetições.
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Laje, Obra } from "../dominio/obra";
import { formaPilar, formasObra, formasPavimento, formaViga } from "./formas";

const laje = (id: string, x: number): Laje => ({
  id,
  nome: id,
  x,
  y: 0,
  lx: 4,
  ly: 5,
  h: 10,
  revestimento: 1,
  sobrecarga: 1.5,
  vinculos: {},
  mu: 1,
});

function obraPequena(): Obra {
  const obra = obraNova("Teste", "nb1-78");
  const base = obra.pavimentos[0];
  if (!base) throw new Error("sem pavimento");
  const pav = gerarEstrutura({
    ...base,
    peDireito: 3,
    repeticoes: 2,
    lajes: [laje("L1", 0), laje("L2", 4)],
  });
  return { ...obra, pavimentos: [pav] };
}

describe("área de fôrma", () => {
  it("obra de duas lajes, conferida à mão", () => {
    const obra = obraPequena();
    const pav = obra.pavimentos[0];
    // pré-condição: o que gerarEstrutura cria (V1 LmMonta)
    // 2 vigas horizontais (y = 0 e 5) de 8 m, 12x40 (vão 4 m → 40 cm);
    // 3 verticais (x = 0, 4, 8) de 5 m, 12x50 (vão 5 m → 50 cm); 6 pilares 20x20
    expect(pav?.vigas.map((v) => [v.nome, v.bw, v.h])).toEqual([
      ["V1", 12, 40],
      ["V2", 12, 40],
      ["V3", 12, 50],
      ["V4", 12, 50],
      ["V5", 12, 50],
    ]);
    expect(pav?.pilares.map((p) => [p.b, p.h])).toEqual(Array.from({ length: 6 }, () => [20, 20]));

    const r = formasObra(obra);
    const p = r.pavimentos[0];
    // lajes: 2 · 4·5 = 40 m²
    expect(p?.lajes).toBeCloseTo(40, 9);
    // vigas (hlaje = 10 cm em todas):
    //   horizontais 8·(0,12 + 2·0,30) = 8·0,72 = 5,76 → 2 · 5,76 = 11,52
    //   verticais   5·(0,12 + 2·0,40) = 5·0,92 = 4,60 → 3 · 4,60 = 13,80
    //   soma 25,32 m²
    expect(p?.vigas).toBeCloseTo(25.32, 9);
    // pilares: perímetro 2(0,20 + 0,20) = 0,80 m até o fundo da laje: 0,80·(3 − 0,10) = 2,32;
    //   cada viga que chega desconta bw·(hviga − hlaje) por face:
    //   horizontal 0,12·0,30 = 0,036; vertical 0,12·0,40 = 0,048
    //   cantos (0;0) (8;0) (0;5) (8;5): 2,32 − 0,036 − 0,048 = 2,236 → 4 · 2,236 = 8,944
    //   meio (4;0) (4;5): horizontal passa (2 faces) e vertical termina:
    //   2,32 − 2·0,036 − 0,048 = 2,200 → 2 · 2,2 = 4,4
    //   soma 13,344 m²
    expect(p?.pilares).toBeCloseTo(13.344, 9);
    // pavimento: 40 + 25,32 + 13,344 = 78,664 m²; × 2 repetições = 157,328 m²
    expect(p?.porPavimento).toBeCloseTo(78.664, 9);
    expect(p?.total).toBeCloseTo(157.328, 9);
    expect(r.total).toBeCloseTo(157.328, 9);
    expect(p?.elementos.filter((e) => e.nome === "V1").map((e) => e.area)[0]).toBeCloseTo(5.76, 9);
  });

  it("viga sem laje encostada e pilar sem viga não descontam nada", () => {
    // viga 12x40, 3 m, sem laje: 3·(0,12 + 2·0,40) = 2,76 m²
    expect(formaViga({ x1: 0, y1: 0, x2: 3, y2: 0, bw: 12, h: 40 }, 0)).toBeCloseTo(2.76, 9);
    // pilar 20x30, pé-direito 2,8 m, sem viga: 2(0,20 + 0,30)·2,80 = 2,80 m²
    expect(formaPilar({ b: 20, h: 30 }, 2.8)).toBeCloseTo(2.8, 9);
    // laje mais espessa que a viga: laterais zeradas, fica só o fundo 3·0,12 = 0,36 m²
    expect(formaViga({ x1: 0, y1: 0, x2: 0, y2: 3, bw: 12, h: 10 }, 12)).toBeCloseTo(0.36, 9);
  });

  it("pilar: a viga larga desconta no máximo a face", () => {
    // pilar 20x20, pé-direito 3, laje 10: 0,80·2,90 = 2,32; viga vertical bw 30 > face 20,
    // passando (2 faces): 2·0,20·(0,60 − 0,10) = 0,20 → 2,12 m²
    const area = formaPilar({ b: 20, h: 20 }, 3, {
      hLaje: 10,
      vigas: [{ bw: 30, h: 60, horizontal: false, faces: 2 }],
    });
    expect(area).toBeCloseTo(2.12, 9);
  });
});

// Item G (docs/MODO-CALCULO.md): obra de revisão _rev5/quant/q1.ts, L1 4×5 apoiada e
// L2 em balanço 1,5×5 (bordos inferior, direito e superior livres), h 10, pilares 20x30.
describe("G: desconto da fôrma nos encontros viga-pilar (obra de revisão q1)", () => {
  function obraQ1(): Obra {
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
    return { ...obra, pavimentos: [pav] };
  }

  it("pilar até o fundo da laje menos a faixa de cada viga: 53,724 m² (a regra antiga dava 52,46, 2,35 % a menos)", () => {
    const obra = obraQ1();
    const pav = obra.pavimentos[0]!;
    // pré-condição: V1 e V2 horizontais 4 m 12x40; V3 e V4 verticais 5 m 12x50; 4 pilares nos cantos de L1
    expect(pav.vigas.map((v) => [v.bw, v.h, Math.hypot(v.x2 - v.x1, v.y2 - v.y1)])).toEqual([
      [12, 40, 4],
      [12, 40, 4],
      [12, 50, 5],
      [12, 50, 5],
    ]);
    expect(pav.pilares.map((p) => [p.x, p.y])).toEqual([
      [0, 5],
      [4, 5],
      [0, 0],
      [4, 0],
    ]);
    const p = formasObra(obra).pavimentos[0]!;
    // lajes 4·5 + 1,5·5 = 27,5; vigas 2·4·(0,12 + 0,60) + 2·5·(0,12 + 0,80) = 5,76 + 9,2 = 14,96
    expect(p.lajes).toBeCloseTo(27.5, 9);
    expect(p.vigas).toBeCloseTo(14.96, 9);
    // pilar 20x30 de canto: 1,0·(3 − 0,10) − 0,12·0,30 − 0,12·0,40 = 2,816 → 4 · 2,816 = 11,264
    // (a regra antiga: 1,0·(3 − 0,50) = 2,5 → 10,0)
    expect(p.pilares).toBeCloseTo(11.264, 9);
    expect(p.total).toBeCloseTo(53.724, 9);
    expect((53.724 - 52.46) / 53.724).toBeCloseTo(0.0235, 4);
  });
});

// Itens F e G no modo original: obra E2E da V1 (dist/roteiros/saida/e2e_10_forma-*:
// E2E.FRM com 4 lajes 4×5 h 10, vigas horizontais 8 m 12x40 e verticais 10 m 12x50,
// 9 pilares 20x20, pé-direito 3). A V1 deu: FORMEDCA "Area de forma com pe-direito
// 146.48" (f08_quant_res.txt) e FORMIMP "area de forma 157.280" (E2E_FORMIMP.LST).
function obraE2E(): Obra {
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
  return { ...obra, pavimentos: [pav] };
}

describe("F/G: fôrma da obra E2E pelas três regras", () => {
  const obra = obraE2E();
  const pav = obra.pavimentos[0]!;

  it("a estrutura gerada é a do E2E.FRM", () => {
    const secoes = pav.vigas.map((v) => [v.bw, v.h, Math.hypot(v.x2 - v.x1, v.y2 - v.y1)]);
    expect(secoes.toSorted()).toEqual(
      [
        [12, 40, 8],
        [12, 40, 8],
        [12, 40, 8],
        [12, 50, 10],
        [12, 50, 10],
        [12, 50, 10],
      ].toSorted(),
    );
    expect(pav.pilares).toHaveLength(9);
    expect(pav.pilares.every((p) => p.b === 20 && p.h === 20)).toBe(true);
  });

  it("certa: 80 + 44,88 + 19,872 = 144,752 m² (conta à mão)", () => {
    // pilares: 0,80·2,90 = 2,32 menos as faixas (horizontal 0,036, vertical 0,048 por face)
    // 4 cantos: 2,236; (0;5) e (8;5): 2,32 − 2·0,048 − 0,036 = 2,188;
    // (4;0) e (4;10): 2,32 − 2·0,036 − 0,048 = 2,2; centro: 2,32 − 2·0,048 − 2·0,036 = 2,152
    // 4·2,236 + 2·2,188 + 2·2,2 + 2,152 = 19,872
    const p = formasPavimento(pav);
    expect(p.lajes).toBeCloseTo(80, 9);
    expect(p.vigas).toBeCloseTo(44.88, 9);
    expect(p.pilares).toBeCloseTo(19.872, 9);
    expect(p.total).toBeCloseTo(144.752, 9);
  });

  // As regras "editor" (FORMEDCA, 146,48 m²) e "impressao" (FORMIMP, 157,28 m²) da V1
  // antiga saíram: o FORMEDCA e o FORMIMP do SISTRUT não calculam fôrma (PLANO da
  // paridade 4.1 G; docs/MODO-CALCULO.md). A fôrma de viga do original sai do DESINIT
  // (quantitativos.ts, conferida em sistrut/quant/vigas.test.ts contra retrad_des_det).
});

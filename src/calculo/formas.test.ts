// Área de fôrma conferida à mão numa obra pequena: duas lajes 4 × 5 m lado a lado
// (h = 10 cm), vigas e pilares gerados como no editor, pé-direito 3 m, 2 repetições.
import { describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Laje, Obra } from "../dominio/obra";
import { formaPilar, formasObra, formaViga } from "./formas";

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
    // pilares: perímetro 2(0,20 + 0,20) = 0,80 m; todo pilar está numa vertical de 50 cm
    //   → altura 3,00 − 0,50 = 2,50 m; 0,80·2,50 = 2,00 → 6 · 2,00 = 12,00 m²
    expect(p?.pilares).toBeCloseTo(12, 9);
    // pavimento: 40 + 25,32 + 12 = 77,32 m²; × 2 repetições = 154,64 m²
    expect(p?.porPavimento).toBeCloseTo(77.32, 9);
    expect(p?.total).toBeCloseTo(154.64, 9);
    expect(r.total).toBeCloseTo(154.64, 9);
    expect(p?.elementos.filter((e) => e.nome === "V1").map((e) => e.area)[0]).toBeCloseTo(5.76, 9);
  });

  it("viga sem laje encostada e pilar sem viga não descontam nada", () => {
    // viga 12x40, 3 m, sem laje: 3·(0,12 + 2·0,40) = 2,76 m²
    expect(formaViga({ x1: 0, y1: 0, x2: 3, y2: 0, bw: 12, h: 40 }, 0)).toBeCloseTo(2.76, 9);
    // pilar 20x30, pé-direito 2,8 m, sem viga: 2(0,20 + 0,30)·2,80 = 2,80 m²
    expect(formaPilar({ b: 20, h: 30 }, 2.8, 0)).toBeCloseTo(2.8, 9);
    // laje mais espessa que a viga: laterais zeradas, fica só o fundo 3·0,12 = 0,36 m²
    expect(formaViga({ x1: 0, y1: 0, x2: 0, y2: 3, bw: 12, h: 10 }, 12)).toBeCloseTo(0.36, 9);
  });
});

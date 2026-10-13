// Quantitativos: contas à mão por elemento e uma obra de duas lajes em que os
// totais fecham com a soma das partes. Pesos por metro de referência: tabela de
// bitolas da NBR 7480 (φ5 0,154; φ8 0,395; φ10 0,617; φ12,5 0,963 kg/m).
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import { calcularObra } from "./fluxo";
import { nbr6118 } from "./normas";
import {
  calcularQuantitativos,
  espessuraLajeNaViga,
  pesoPorMetro,
  quantLaje,
  quantPilar,
  quantViga,
  taxaAco,
  type VigaArmada,
} from "./quantitativos";

const perto = (valor: number, esperado: number, tol: number) =>
  expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

const semMomento = { flexao: null, barras: null };

describe("peso por metro (π φ²/4 · 7850)", () => {
  it("bate com a tabela da NBR 7480", () => {
    perto(pesoPorMetro(5), 0.154, 0.001);
    perto(pesoPorMetro(8), 0.395, 0.001);
    perto(pesoPorMetro(10), 0.617, 0.001);
    perto(pesoPorMetro(12.5), 0.963, 0.001);
  });
});

describe("laje", () => {
  const laje = { nome: "L1", lx: 4, ly: 5, h: 10 };

  it("concreto 4 × 5 × 0,10 = 2 m³ e forma 20 m²", () => {
    const q = quantLaje(laje, undefined);
    perto(q.concreto, 2, 1e-12);
    perto(q.forma, 20, 1e-12);
    expect(q.aco).toBe(0);
    expect(q.avisos).toEqual(["L1: sem armadura calculada; aço não estimado."]);
  });

  it("aço das positivas + 10 %", () => {
    // X: φ8 c/15 em 5 m de largura → 33,33 barras × 4 m = 133,3 m × 0,395 = 52,67 kg
    // Y: φ8 c/20 em 4 m de largura → 20 barras × 5 m = 100 m × 0,395 = 39,50 kg
    // (52,67 + 39,50) × 1,10 = 101,4 kg
    const q = quantLaje(laje, {
      barrasX: { phi: 8, espacamento: 15 },
      barrasY: { phi: 8, espacamento: 20 },
      barrasNegativos: {},
    });
    perto(q.aco, 101.4, 0.2);
    expect(q.avisos).toEqual([]);
  });

  it("negativa do bordo direito entra 0,25·lmenor = 1 m na laje", () => {
    // φ10 c/12,5 ao longo de 5 m → 40 barras × 1,0 m = 40 m × 0,617 = 24,68 kg
    // (52,67 + 39,50 + 24,68) × 1,10 = 128,5 kg
    const q = quantLaje(laje, {
      barrasX: { phi: 8, espacamento: 15 },
      barrasY: { phi: 8, espacamento: 20 },
      barrasNegativos: { direito: { phi: 10, espacamento: 12.5 } },
    });
    perto(q.aco, 128.5, 0.2);
  });

  it("malha sem barra (φ 0) vira aviso", () => {
    const q = quantLaje(laje, {
      barrasX: { phi: 0, espacamento: 0 },
      barrasY: { phi: 8, espacamento: 20 },
      barrasNegativos: {},
    });
    perto(q.aco, 39.5 * 1.1, 0.1);
    expect(q.avisos).toHaveLength(1);
  });
});

describe("viga", () => {
  const viga = { nome: "V1", x1: 0, y1: 0, x2: 5, y2: 0, bw: 12, h: 40 };

  it("biapoiada 12 × 40, 5 m, laje de 10 cm: concreto, forma e aço", () => {
    const armada: VigaArmada = {
      viga: {
        apoios: [
          { tipo: "pilar", id: "a", nome: "P1" },
          { tipo: "pilar", id: "b", nome: "P2" },
        ],
        tramos: [{ vao: 5 }],
      },
      tramos: [
        {
          positivo: { flexao: null, barras: { n: 3, phi: 10, area: 2.36, cabe: true, largura: 7 } },
          negativoEsq: semMomento,
          negativoDir: semMomento,
          estribo: { phi: 5, espacamento: 15 },
        },
      ],
    };
    const q = quantViga(viga, 10, armada, 2.5);
    // concreto 5 · 0,12 · (0,40 − 0,10) = 0,18 m³; forma 5 · (0,12 + 2 · 0,30) = 3,6 m²
    perto(q.concreto, 0.18, 1e-12);
    perto(q.forma, 3.6, 1e-12);
    // 3 φ10 × 5 m = 15 m × 0,617 = 9,255 kg
    // estribos: ⌈500/15⌉ = 34 × [2(12 − 5) + 2(40 − 5) = 84 cm] = 28,56 m × 0,154 = 4,398 kg
    perto(q.aco, 9.255 + 4.398, 0.02);
    expect(q.avisos).toEqual([]);
  });

  it("balanço: negativa no vão inteiro; tramo interno: 0,25·vão", () => {
    const armada: VigaArmada = {
      viga: {
        apoios: [
          { tipo: "livre" },
          { tipo: "pilar", id: "a", nome: "P1" },
          { tipo: "pilar", id: "b", nome: "P2" },
        ],
        tramos: [{ vao: 1.5 }, { vao: 4 }],
      },
      tramos: [
        {
          positivo: semMomento,
          negativoEsq: semMomento,
          negativoDir: {
            flexao: null,
            barras: { n: 2, phi: 10, area: 1.57, cabe: true, largura: 4 },
          },
          estribo: { phi: 5, espacamento: 15 },
        },
        {
          positivo: { flexao: null, barras: { n: 2, phi: 10, area: 1.57, cabe: true, largura: 4 } },
          negativoEsq: {
            flexao: null,
            barras: { n: 2, phi: 10, area: 1.57, cabe: true, largura: 4 },
          },
          negativoDir: semMomento,
          estribo: { phi: 5, espacamento: 15 },
        },
      ],
    };
    const q = quantViga({ ...viga, x1: -1.5, x2: 4 }, 10, armada, 2.5);
    // longitudinal: 2 φ10 × (1,5 + 4 + 0,25 · 4 = 6,5 m) = 13 m × 0,617 = 8,021 kg
    // estribos: (⌈150/15⌉ = 10) + (⌈400/15⌉ = 27) = 37 × 0,84 m × 0,154 = 4,786 kg
    perto(q.aco, 8.021 + 4.786, 0.02);
  });

  it("sem dimensionamento: concreto conta, aço não, com aviso", () => {
    const q = quantViga(viga, 0, undefined, 2.5);
    perto(q.concreto, 5 * 0.12 * 0.4, 1e-12);
    expect(q.aco).toBe(0);
    expect(q.avisos).toEqual(["V1: sem armadura calculada; aço não estimado."]);
  });
});

describe("pilar", () => {
  it("20 × 30, pé-direito 3 m, 4 φ12,5 e estribo φ5 c/15", () => {
    const q = quantPilar(
      { nome: "P1", b: 20, h: 30 },
      3,
      {
        barras: { n: 4, phi: 12.5 },
        estribo: { phi: 5, espacamento: 15 },
      },
      2.5,
    );
    // concreto 0,20 · 0,30 · 3 = 0,18 m³; forma 2 · (0,20 + 0,30) · 3 = 3 m²
    perto(q.concreto, 0.18, 1e-12);
    perto(q.forma, 3, 1e-12);
    // barras: 4 × (3 + 40 · 0,0125 = 3,5 m) = 14 m × 0,963 = 13,48 kg
    // estribos: 300/15 = 20 × [2(20 − 5) + 2(30 − 5) = 80 cm] = 16 m × 0,154 = 2,464 kg
    perto(q.aco, 13.48 + 2.464, 0.02);
    // taxa: 15,94 / 0,18 = 88,6 kg/m³
    perto(taxaAco(q), 15.944 / 0.18, 0.2);
  });

  it("sem solução (n = 0): aviso e aço zero", () => {
    const q = quantPilar(
      { nome: "P1", b: 20, h: 30 },
      3,
      {
        barras: { n: 0, phi: 0 },
        estribo: { phi: 0, espacamento: 0 },
      },
      2.5,
    );
    expect(q.aco).toBe(0);
    expect(q.avisos).toHaveLength(1);
  });
});

describe("obra de duas lajes (4 × 5 e 3,5 × 5 m, h 10), pavimento repetido 2×", () => {
  function obraDuasLajes(): Obra {
    const obra = obraNova("DUAS", "nbr6118-2023");
    let pav = { ...obra.pavimentos[0]!, nome: "TIPO", peDireito: 3, repeticoes: 2 };
    const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, { h: 10 });
    pav = { ...pav, lajes: [l1] };
    const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 }, { h: 10 });
    pav = gerarEstrutura({ ...pav, lajes: [l1, l2] });
    pav = {
      ...pav,
      vigas: pav.vigas.map((v) => ({ ...v, bw: 12, h: 40 })),
      pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 30 })),
    };
    return { ...obra, pavimentos: [pav] };
  }
  const obra = obraDuasLajes();
  const r = calcularObra(obra, nbr6118);
  const q = calcularQuantitativos(obra, r);
  const p = q.pavimentos[0]!;
  const pav = obra.pavimentos[0]!;

  it("a estrutura gerada tem 6 pilares e 30 m de vigas", () => {
    expect(pav.pilares).toHaveLength(6);
    const l = pav.vigas.reduce((a, v) => a + Math.hypot(v.x2 - v.x1, v.y2 - v.y1), 0);
    perto(l, 30, 1e-9);
    for (const v of pav.vigas) expect(espessuraLajeNaViga(v, pav.lajes)).toBe(10);
  });

  it("concreto e forma conferem com a conta à mão (× 2 repetições)", () => {
    // lajes: (4·5 + 3,5·5)·0,10 = 3,75 m³; forma 37,5 m²
    perto(p.lajes.concreto, 2 * 3.75, 1e-9);
    perto(p.lajes.forma, 2 * 37.5, 1e-9);
    // vigas: 30 m · 0,12 · 0,30 = 1,08 m³; forma 30 · (0,12 + 0,60) = 21,6 m²
    perto(p.vigas.concreto, 2 * 1.08, 1e-9);
    perto(p.vigas.forma, 2 * 21.6, 1e-9);
    // pilares: 6 · 0,20 · 0,30 · 3 = 1,08 m³; forma até o fundo da viga (h 40):
    // 6 · 1,0 · (3 − 0,40) = 15,6 m²
    perto(p.pilares.concreto, 2 * 1.08, 1e-9);
    perto(p.pilares.forma, 2 * 15.6, 1e-9);
    perto(q.total.forma, 2 * (37.5 + 21.6 + 15.6), 1e-9);
    perto(q.total.concreto, 2 * (3.75 + 1.08 + 1.08), 1e-9);
  });

  it("todo elemento tem aço estimado, sem avisos", () => {
    expect(q.avisos).toEqual([]);
    expect(p.lajes.aco).toBeGreaterThan(0);
    expect(p.vigas.aco).toBeGreaterThan(0);
    expect(p.pilares.aco).toBeGreaterThan(0);
  });

  it("totais = soma das partes", () => {
    const rp = r.pavimentos[0]!;
    const lajes = rp.lajes.reduce((a, l) => a + quantLaje(l.laje, l.armadura).aco, 0);
    perto(p.lajes.aco, 2 * lajes, 1e-9);
    const vigas = rp.vigas.reduce(
      (a, v) =>
        a +
        quantViga(
          pav.vigas.find((x) => x.id === v.viga.id)!,
          10,
          v,
          3,
        ).aco,
      0,
    );
    perto(p.vigas.aco, 2 * vigas, 1e-9);
    // pilares: um resultado por pilar e por nível (2 níveis × 6 pilares)
    expect(r.pilares).toHaveLength(12);
    const pilares = r.pilares.reduce((a, x) => a + quantPilar(x.pilar, 3, x.resultado, 3).aco, 0);
    perto(p.pilares.aco, pilares, 1e-9);
    for (const k of ["concreto", "forma", "aco"] as const) {
      perto(p.total[k], p.lajes[k] + p.vigas[k] + p.pilares[k], 1e-9);
      perto(q.total[k], q.lajes[k] + q.vigas[k] + q.pilares[k], 1e-9);
      perto(q.total[k], p.total[k], 1e-9);
    }
    perto(taxaAco(q.total), q.total.aco / q.total.concreto, 1e-12);
  });

  it("a memória diz que o aço é estimativa", () => {
    expect(q.memoria[0]?.descricao).toMatch(/ESTIMATIVA/);
  });
});

describe("pavimentos com o mesmo nome", () => {
  it("o aço dos pilares de cada pavimento vem dos níveis dele (casados pelo id)", () => {
    const obra = obraNova("MESMO", "nbr6118-2023");
    let pav = { ...obra.pavimentos[0]!, nome: "TIPO", peDireito: 3 };
    const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
    pav = gerarEstrutura({ ...pav, lajes: [l1] });
    // o de baixo com pilares maiores: aço mínimo diferente do de cima
    const cima = { ...pav, id: "cima", pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 20 })) };
    const baixo = {
      ...pav,
      id: "baixo",
      pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 60 })),
    };
    const o = { ...obra, pavimentos: [cima, baixo] };
    const r = calcularObra(o, nbr6118);
    const q = calcularQuantitativos(o, r);
    const aco = (id: string) =>
      r.pilares
        .filter((x) => x.pavimentoId === id)
        .reduce(
          (a, x) => a + quantPilar(x.pilar, 3, x.resultado, o.materiais.cobrimentoPilar).aco,
          0,
        );
    expect(aco("cima")).not.toBeCloseTo(aco("baixo"), 3);
    perto(q.pavimentos[0]!.pilares.aco, aco("cima"), 1e-9);
    perto(q.pavimentos[1]!.pilares.aco, aco("baixo"), 1e-9);
  });
});

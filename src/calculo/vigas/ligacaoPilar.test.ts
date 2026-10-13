// Valores esperados: exemplos de Bastos, "Flexão composta e pilares de concreto
// armado" (UNESP, jun/2024), pilares P1, P5 e P6 (p. 155 a 166), em kN·cm na
// apostila e aqui em kN·m; e contas à mão nos comentários de cada caso.
import { describe, expect, it } from "vitest";
import type { ApoioMontado, TramoMontado, VigaMontada } from "../montagem";
import {
  ligacaoVigaPilar,
  momentosDoLance,
  momentosEngastamento,
  reparteLigacao,
  rigidezLance,
  rigidezViga,
  type LancesDoPilar,
} from "./ligacaoPilar";

/** Tramo só com carga distribuída permanente g, kN/m. */
const tramo = (vao: number, g: number): TramoMontado => ({
  vao,
  g,
  q: 0,
  lajes: { g: 0, q: 0 },
  pesoProprio: 0,
  cargaLinear: 0,
  concentradas: [],
});

const pilar = (id: string): ApoioMontado => ({ tipo: "pilar", id, nome: id });

function viga(
  horizontal: boolean,
  bw: number,
  h: number,
  apoios: ApoioMontado[],
  tramos: TramoMontado[],
): VigaMontada {
  const nos = [0];
  for (const t of tramos) nos.push((nos.at(-1) ?? 0) + t.vao);
  return {
    id: "V",
    nome: "V",
    bw,
    h,
    eixo: { horizontal, c: 0, s1: 0, s2: nos.at(-1) ?? 0 },
    nos,
    apoios,
    tramos,
  };
}

/** Pilar com lances iguais acima e abaixo do nível. */
const lancesIguais = (b: number, h: number, altura: number): LancesDoPilar => ({
  superior: { b, h, altura },
  inferior: { b, h, altura },
});

const viaViga: ApoioMontado = { tipo: "viga", id: "VX", nome: "VX" };

describe("Bastos, Pilares: pilares de extremidade", () => {
  it("P6, dir. x: V2 14x60, ℓef = 4,93 m, 32 kN/m; pilar 19x19, ℓ = 2,80 m (p. 160)", () => {
    // P5 ── V2 ── P6: P6 na extremidade final
    const v = viga(true, 14, 60, [viaViga, pilar("P6")], [tramo(4.93, 32)]);
    const r = ligacaoVigaPilar(v, { P6: lancesIguais(19, 19, 2.8) });
    expect(r.direcao).toBe("x");
    expect(r.extremidades).toHaveLength(1);
    const e = r.extremidades[0]!;
    expect(e.no).toBe(1);
    expect(e.rViga).toBeCloseTo(511.2, 1); // rviga = 252.000/493
    expect(e.rSuperior).toBeCloseTo(77.6, 1); // 19⁴/12/140
    expect(e.rInferior).toBeCloseTo(77.6, 1);
    expect(e.meng).toBeCloseTo(64.81, 2); // 6.481 kN·cm
    expect(Math.abs(e.mBaseSuperior)).toBeCloseTo(7.55, 2); // 755 kN·cm
    expect(Math.abs(e.mTopoInferior)).toBeCloseTo(7.55, 2);
    // Md,topo = Md,base = 1,4·(755 + 755/2) = 1.586 kN·cm (γn = 1)
    const l = momentosDoLance(e.mTopoInferior, e.mBaseSuperior);
    expect(1.4 * Math.abs(l.topo)).toBeCloseTo(15.86, 1);
    expect(1.4 * Math.abs(l.base)).toBeCloseTo(15.86, 1);
  });

  it("P5, dir. y: V6 14x60, ℓef = 5,25 m, 39 kN/m; pilar 50 (x) x 15 (y) (p. 155-156)", () => {
    // P8 ── V6 ── P5, viga vertical na planta: a dimensão ao cubo é h = 15
    const v = viga(false, 14, 60, [viaViga, pilar("P5")], [tramo(5.25, 39)]);
    const r = ligacaoVigaPilar(v, { P5: lancesIguais(50, 15, 2.8) });
    expect(r.direcao).toBe("y");
    const e = r.extremidades[0]!;
    expect(e.rViga).toBeCloseTo(480.0, 1);
    expect(e.rSuperior).toBeCloseTo(100.4, 1);
    expect(e.meng).toBeCloseTo(89.58, 2);
    expect(Math.abs(e.mBaseSuperior)).toBeCloseTo(13.21, 2); // 1.321 kN·cm
    expect(Math.abs(e.mTopoInferior)).toBeCloseTo(13.21, 2);
    // Mk,topo = Mk,base = 1.321 + 1.321/2 = 1.982 kN·cm; Md = 1,20·1,4·1.982 = 3.330
    const l = momentosDoLance(e.mTopoInferior, e.mBaseSuperior);
    expect(Math.abs(l.base)).toBeCloseTo(19.82, 1);
    expect(1.2 * 1.4 * Math.abs(l.topo)).toBeCloseTo(33.3, 1);
  });

  it("P1 (canto), dir. x: V1 19x50, ℓef = 4,97 m, 25 kN/m; pilar 25 (x) x 19 (y) (p. 164-165)", () => {
    // P1 ── V1 ── P2: P1 no início, a viga sai no sentido +x
    const v = viga(true, 19, 50, [pilar("P1"), viaViga], [tramo(4.97, 25)]);
    const r = ligacaoVigaPilar(v, { P1: lancesIguais(25, 19, 2.8) });
    const e = r.extremidades[0]!;
    expect(e.no).toBe(0);
    expect(e.rSuperior).toBeCloseTo(176.7, 1);
    expect(e.rViga).toBeCloseTo(398.2, 1);
    expect(e.meng).toBeCloseTo(51.46, 2);
    expect(e.mBaseSuperior).toBeCloseTo(12.1, 2); // 1.210 kN·cm
    expect(e.mTopoInferior).toBeCloseTo(-12.1, 2);
    // M1d,A,x = −M1d,B,x = 1,4·(1.210 + 605) = 2.541 kN·cm: sinais opostos (αb = 0,4)
    const l = momentosDoLance(e.mTopoInferior, e.mBaseSuperior);
    expect(1.4 * l.base).toBeCloseTo(25.41, 1);
    expect(1.4 * l.topo).toBeCloseTo(-25.41, 1);
  });

  it("P1 (canto), dir. y: V5 19x50, ℓef = 4,80 m, 18 kN/m; inércia 25·19³/12 (p. 165)", () => {
    // P4 ── V5 ── P1: P1 no fim
    const v = viga(false, 19, 50, [viaViga, pilar("P1")], [tramo(4.8, 18)]);
    const e = ligacaoVigaPilar(v, { P1: lancesIguais(25, 19, 2.8) }).extremidades[0]!;
    expect(e.rSuperior).toBeCloseTo(102.1, 1);
    expect(e.rViga).toBeCloseTo(412.3, 1);
    expect(e.meng).toBeCloseTo(34.56, 2);
    expect(e.mBaseSuperior).toBeCloseTo(-5.724, 2); // 572,4 kN·cm
    expect(e.mTopoInferior).toBeCloseTo(5.724, 2);
    const l = momentosDoLance(e.mTopoInferior, e.mBaseSuperior);
    expect(1.4 * Math.abs(l.topo)).toBeCloseTo(12.02, 1); // 1.202 kN·cm
  });
});

describe("conta à mão", () => {
  // Viga 20x50, L = 5 m, g + q = 12 kN/m; pilar 40 (x) x 20 (y), lances de 3 m.
  // Iviga = 20·50³/12 = 208.333 cm⁴ → rvig = 416,67 cm³
  // Ipilar,x = 20·40³/12 = 106.667 cm⁴ → r = 106.667/150 = 711,11 cm³
  // Meng = 12·5²/12 = 25 kN·m; Σr = 416,67 + 2·711,11 = 1.838,89
  // Mvig = 25·1.422,22/1.838,89 = 19,335; Msup = Minf = 25·711,11/1.838,89 = 9,668
  const t: TramoMontado = { ...tramo(5, 10), q: 2 };
  const lp = lancesIguais(40, 20, 3);

  it("biapoiada sobre dois pilares iguais acima e abaixo", () => {
    const v = viga(true, 20, 50, [pilar("A"), pilar("B")], [t]);
    const r = ligacaoVigaPilar(v, { A: lp, B: lp });
    expect(r.avisos).toEqual([]);
    const [a, b] = r.extremidades;
    expect(a?.rViga).toBeCloseTo(416.67, 2);
    expect(a?.rSuperior).toBeCloseTo(711.11, 2);
    expect(a?.mViga).toBeCloseTo(-19.335, 3);
    expect(a?.mBaseSuperior).toBeCloseTo(9.668, 3);
    expect(a?.mTopoInferior).toBeCloseTo(-9.668, 3);
    // extremidade final: espelho
    expect(b?.no).toBe(1);
    expect(b?.mViga).toBeCloseTo(-19.335, 3);
    expect(b?.mBaseSuperior).toBeCloseTo(-9.668, 3);
    expect(b?.mTopoInferior).toBeCloseTo(9.668, 3);
    expect(r.memoria.length).toBeGreaterThan(0);
  });

  it("cobertura (sem lance superior): Mvig = Minf = 25·711,11/1.127,78 = 15,764", () => {
    const v = viga(true, 20, 50, [pilar("A"), pilar("B")], [t]);
    const semSup: LancesDoPilar = { superior: null, inferior: lp.inferior };
    const e = ligacaoVigaPilar(v, { A: semSup, B: semSup }).extremidades[0]!;
    expect(e.rSuperior).toBe(0);
    expect(e.mBaseSuperior).toBe(0);
    expect(e.mViga).toBeCloseTo(-15.764, 3);
    expect(e.mTopoInferior).toBeCloseTo(-15.764, 3);
  });

  it("equilíbrio do nó: |Mvig| = |Msup| + |Minf|", () => {
    const m = reparteLigacao(30, 400, 150, 90);
    expect(m.viga).toBeCloseTo(m.superior + m.inferior, 10);
    // 30·240/640 = 11,25; 30·150/640 = 7,03125; 30·90/640 = 4,21875
    expect(m.viga).toBeCloseTo(11.25, 10);
    expect(m.superior).toBeCloseTo(7.03125, 10);
    expect(m.inferior).toBeCloseTo(4.21875, 10);
  });

  it("Meng com concentrada: L = 4, P = 10 a 1 m → P·a·b²/L² = 5,625 e P·a²·b/L² = 1,875", () => {
    const m = momentosEngastamento({
      comprimento: 4,
      g: 0,
      q: 0,
      concentradas: [{ a: 1, g: 7, q: 3 }],
    });
    expect(m.esq).toBeCloseTo(5.625, 10);
    expect(m.dir).toBeCloseTo(1.875, 10);
    // + distribuída 6 kN/m: 6·16/12 = 8
    const d = momentosEngastamento({
      comprimento: 4,
      g: 4,
      q: 2,
      concentradas: [{ a: 1, g: 7, q: 3 }],
    });
    expect(d.esq).toBeCloseTo(13.625, 10);
    expect(d.dir).toBeCloseTo(9.875, 10);
  });

  it("rigidezes: viga 20x50 em 5 m; lance 40x20 de 3 m nas duas direções", () => {
    expect(rigidezViga(20, 50, 5)).toBeCloseTo(416.667, 3);
    const lance = { b: 40, h: 20, altura: 3 };
    expect(rigidezLance(lance, "x")).toBeCloseTo(711.111, 3); // 20·40³/12/150
    expect(rigidezLance(lance, "y")).toBeCloseTo(177.778, 3); // 40·20³/12/150
    expect(rigidezLance(null, "x")).toBe(0);
  });
});

describe("extremidades que não entram", () => {
  it("balanço: o pilar vizinho ao balanço é interno à viga e fica de fora", () => {
    const v = viga(
      true,
      20,
      50,
      [{ tipo: "livre" }, pilar("A"), pilar("B")],
      [tramo(1.5, 10), tramo(5, 10)],
    );
    const r = ligacaoVigaPilar(v, { A: lancesIguais(40, 20, 3), B: lancesIguais(40, 20, 3) });
    expect(r.extremidades.map((e) => e.pilarId)).toEqual(["B"]);
  });

  it("pilar sem dados de lance: aviso e sem ligação", () => {
    const v = viga(true, 20, 50, [pilar("A"), pilar("B")], [tramo(5, 10)]);
    const r = ligacaoVigaPilar(v, { B: lancesIguais(40, 20, 3) });
    expect(r.extremidades.map((e) => e.pilarId)).toEqual(["B"]);
    expect(r.avisos).toHaveLength(1);
  });
});

// Item C (docs/MODO-CALCULO.md): obra da V1 com balanço. BALC.LAJ/.VIG/.COL são os
// que a V1 gravou (dist/_rev5/difnb, tests/T_REV5DIF.BAS): L1 5×4 e L2 2×4 com o
// bordo direito livre; as vigas horizontais V1 e V2 têm o apoio "-" em x = 7 m
// (balanço de 2 m); CA-25, fck 0,15 tf/cm². Valores de referência: BALC.SEC da
// V1 (mesma pasta). Para comparar número a número, a norma usa os materiais e o
// peso específico da V1 em kN (0,15 tf/cm² = 14,71 MPa; 2,5 tf/cm² = 245,2 MPa;
// Es 2100 tf/cm²; 2,5 tf/m³), como _rev5/difnb/comum.ts normaV1.
import { describe, expect, it } from "vitest";
import { calcularObra } from "../calculo/fluxo";
import { nb178 } from "../calculo/normas";
import { moduloConcreto } from "../calculo/normas/nb1-78/materiais";
import type { Norma } from "../calculo/tipos";
import { KN_POR_TF } from "../calculo/unidades";
import type { ModoCalculo } from "../dominio/obra";
import balcCol from "./__fixtures__/v1/BALC.COL?raw";
import balcLaj from "./__fixtures__/v1/BALC.LAJ?raw";
import balcVig from "./__fixtures__/v1/BALC.VIG?raw";
import { importarV1 } from "./importarV1";

const tfcm2 = (x: number) => x * 98.0665;
const normaV1: Norma = {
  ...nb178,
  pesoConcreto: 2.5 * KN_POR_TF,
  materiais: (m) => {
    const fck = tfcm2(0.15);
    const fyk = tfcm2(2.5);
    return {
      ...nb178.materiais(m),
      fck,
      fcd: fck / 1.4,
      sigmaCd: (0.85 * fck) / 1.4,
      fyk,
      fyd: fyk / 1.15,
      fywd: fyk / 1.15,
      ecs: moduloConcreto(fck),
      es: tfcm2(2100),
    };
  },
};

function importaBalc(modoCalculo: ModoCalculo) {
  const r = importarV1([
    { nome: "BALC.LAJ", texto: balcLaj },
    { nome: "BALC.VIG", texto: balcVig },
    { nome: "BALC.COL", texto: balcCol },
  ]);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  const obra = {
    ...r.obra,
    modoCalculo,
    materiais: { ...r.obra.materiais, aco: "CA-25" as const, acoEstribo: "CA-25" as const },
  };
  return { obra, avisos: r.avisos };
}

const tf = (kn: number) => kn / KN_POR_TF;

describe("C: viga da V1 com balanço importada com balanço", () => {
  const { obra, avisos } = importaBalc("corrigido");
  const pav = obra.pavimentos[0]!;
  const res = calcularObra(obra, normaV1).pavimentos[0]!;
  const viga = (nome: string) => res.vigas.find((v) => v.viga.nome === nome)!;

  it('sem pilar nas pontas "-" (7; 0) e (7; 4), com aviso de balanço', () => {
    expect(pav.pilares.map((p) => [p.x, p.y]).sort()).toEqual([
      [0, 0],
      [0, 4],
      [5, 0],
      [5, 4],
    ]);
    expect(avisos).toContain(
      'Viga V2: apoio "-" em (7; 0) importado como balanço (ponta livre, sem pilar).',
    );
    expect(avisos).toContain(
      'Viga V1: apoio "-" em (7; 4) importado como balanço (ponta livre, sem pilar).',
    );
  });

  it("a viga V2 tem 2 tramos (5 m e balanço de 2 m) com ponta livre", () => {
    const v = viga("V2");
    expect(v.viga.apoios.map((a) => a.tipo)).toEqual(["pilar", "pilar", "livre"]);
    expect(v.viga.tramos.map((t) => t.vao)).toEqual([5, 2]);
  });

  it("esforços da V1 (BALC.SEC): M+ 1,7046 e M−dir −0,9350 tf·m (o pilar fictício dava M+ 1,357)", () => {
    const a = viga("V2").analise;
    if (!a.ok) throw new Error("análise falhou");
    expect(tf(a.tramos[0]!.mPos)).toBeCloseTo(1.704644, 4);
    expect(tf(a.tramos[0]!.mNegDir)).toBeCloseTo(-0.935018, 4);
    expect(tf(a.tramos[0]!.vDir)).toBeCloseTo(1.820281, 4);
    expect(tf(a.tramos[1]!.mNegEsq)).toBeCloseTo(-0.935018, 4);
  });

  it("B: estribos da V4 iguais aos da V1 (BALC.SEC: Asw 5,3674 cm²/m; a V2 antiga dava 4,58)", () => {
    expect(viga("V4").tramos[0]!.cortante.asw).toBeCloseTo(5.367436, 3);
  });
});

describe("H na obra BALC (CA-25): negativo de 0,9350 tf·m na V2", () => {
  const asNeg = (modo: ModoCalculo) => {
    const { obra } = importaBalc(modo);
    const v = calcularObra(obra, normaV1).pavimentos[0]!.vigas.find((x) => x.viga.nome === "V2")!;
    return v.tramos[0]!.negativoDir.flexao!.as;
  };

  it('"original": a As calculada, 1,3483 cm², como a V1 (BALC.SEC; mínima 0,15 % = 0,9)', () => {
    expect(asNeg("original")).toBeCloseTo(1.348333, 4);
  });

  it('"corrigido": a mínima de 0,25 % com CA-25 prevalece, 12·50·0,0025 = 1,5 cm²', () => {
    expect(asNeg("corrigido")).toBeCloseTo(1.5, 9);
  });
});

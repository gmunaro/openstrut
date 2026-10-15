// Obra E2E dos casos a, b e c do oráculo como uma obra da V2 (o que o comparador e os
// testes de ponta a ponta montam). Entrada do original: `__oraculo__/caso_a_laje.json`
// ("entrada"): eixos x 0/4/8 e y 0/5/10, 4 lajes 4×5 maciças h 10, carga permanente
// 0,10 t/m², ocupação 0,15 t/m² toda acidental, vigas em todos os eixos (12×40 nas de
// 4 m, 12×50 nas de 5 m: peso próprio 0,12 e 0,15 t/m), pilares P1..P9 20×20 na grade,
// fck 0,15 t/cm², CA-50 classe B, cobrimento da laje 1,5 cm. Caso c (PILAREDI): pé-direito
// 3 m (fundação na cota 0, PAV1 na cota 3).
//
// Unidades da V2: kN/m² = t/m² × 9,80665; fck 15 MPa (o original lê 15/100 = 0,15 t/cm²).
// Os nomes de pilares e vigas e a posição de cada um seguem o original, porque o .VIG
// grava J = 1 + número do pilar/100000 e um bit muda o x impresso (V4 1,88 × V6 1,87).
import type { Laje, ModoCalculo, Obra, Pilar, Viga } from "../../../dominio/obra";
import { KN_POR_TF } from "../base/unidades";

const laje = (nome: string, x: number, y: number): Laje => ({
  id: nome,
  nome,
  x,
  y,
  lx: 4,
  ly: 5,
  h: 10,
  revestimento: 0.1 * KN_POR_TF,
  sobrecarga: 0.15 * KN_POR_TF,
  vinculos: {},
  mu: 1,
});

const viga = (nome: string, x1: number, y1: number, x2: number, y2: number, h: number): Viga => ({
  id: nome,
  nome,
  x1,
  y1,
  x2,
  y2,
  bw: 12,
  h,
  cargaLinear: 0,
});

const pilar = (nome: string, x: number, y: number): Pilar => ({
  id: nome,
  nome,
  x,
  y,
  b: 20,
  h: 20,
});

/** Obra E2E do oráculo no modo dado. */
export function obraE2E(modo: ModoCalculo): Obra {
  return {
    versao: 3,
    nome: "E2E",
    norma: "nb1-78",
    modoCalculo: modo,
    materiais: {
      fck: 15,
      aco: "CA-50",
      acoEstribo: "CA-50",
      classeAco: "B",
      caa: 1,
      cobrimentoLaje: 1.5,
      cobrimentoViga: 2,
      cobrimentoPilar: 2,
    },
    pavimentos: [
      {
        id: "PAV1",
        nome: "PAV1",
        peDireito: 3,
        repeticoes: 1,
        lajes: [laje("L1", 0, 5), laje("L2", 4, 5), laje("L3", 0, 0), laje("L4", 4, 0)],
        vigas: [
          viga("V1", 0, 10, 8, 10, 40),
          viga("V2", 0, 5, 8, 5, 40),
          viga("V3", 0, 0, 8, 0, 40),
          viga("V4", 0, 0, 0, 10, 50),
          viga("V5", 4, 0, 4, 10, 50),
          viga("V6", 8, 0, 8, 10, 50),
        ],
        pilares: [
          pilar("P1", 0, 0),
          pilar("P2", 4, 0),
          pilar("P3", 8, 0),
          pilar("P4", 8, 5),
          pilar("P5", 4, 5),
          pilar("P6", 0, 5),
          pilar("P7", 0, 10),
          pilar("P8", 4, 10),
          pilar("P9", 8, 10),
        ],
        pilaresRemovidos: [],
      },
    ],
  };
}

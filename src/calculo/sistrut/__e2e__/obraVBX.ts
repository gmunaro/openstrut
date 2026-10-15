// Obra VBX do caso v2par_viga_fluxo do oráculo como obra da V2
// (C:/tmp/oraculo/casos/v2par_viga_fluxo.txt; JSON em lajes/__casos_t2__/): eixos x
// 0/4/8 e y 0/5, lajes L1 (x 0..4) e L2 (x 4..8) 4×5 h 10, permanente 0,10 t/m² e
// ocupação 0,15 t/m² toda acidental; vigas V1 (y = 5), V2 (y = 0), V3 (x = 0), V4
// (x = 4), V5 (x = 8), peso próprio digitado 0,15 t/m em todas; pilares só em x = 0 e
// x = 4. V1 e V2 têm balanço de 4 m e a V5 se apoia nas pontas deles (no LAJEMONT, "V5
// apoia em V1" e "V5 apoia em V2"; na V2, a regra de `geometriaDasVigas`).
import type { ModoCalculo, Obra, Viga } from "../../../dominio/obra";
import { KN_POR_TF } from "../base/unidades";
import { obraE2E } from "./obraE2E";

const viga = (nome: string, x1: number, y1: number, x2: number, y2: number): Viga => ({
  id: nome,
  nome,
  x1,
  y1,
  x2,
  y2,
  bw: 12,
  h: 40,
  cargaLinear: 0,
  pesoProprio: 0.15 * KN_POR_TF,
});

/** Obra VBX no modo dado (materiais e lajes como a E2E). */
export function obraVBX(modo: ModoCalculo): Obra {
  const base = obraE2E(modo);
  const pav = base.pavimentos[0]!;
  const laje = (nome: string, x: number) => ({ ...pav.lajes[0]!, id: nome, nome, x, y: 0 });
  return {
    ...base,
    nome: "VBX",
    pavimentos: [
      {
        ...pav,
        lajes: [laje("L1", 0), laje("L2", 4)],
        vigas: [
          viga("V1", 0, 5, 8, 5),
          viga("V2", 0, 0, 8, 0),
          viga("V3", 0, 0, 0, 5),
          viga("V4", 4, 0, 4, 5),
          viga("V5", 8, 0, 8, 5),
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

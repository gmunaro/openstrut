// Obra sintética do pilar que nasce numa viga de transição (defeito P-b): no CIMA, o
// pilar PB com 10 t no topo, em x = 4,1; no BAIXO, a viga V1 de 0 a 4,1 m (20 × 50, só
// as cargas dela) sobre PA (x = 0) e PB (x = 4), com balanço de 0,1 m, e a concentrada
// `f` na ponta do balanço, sob o PB de cima. Conta à mão: a reação em PB é f·4,1/4
// (10,25 t com f = 10) e em PA, −f·0,1/4. Usada em colunas.test.ts e
// calculo/defeitosOriginal.test.ts.
import type { Obra, Pilar } from "../../../dominio/obra";
import { KN_POR_TF } from "../base/unidades";
import { obraE2E } from "./obraE2E";

/** Carga no topo do PB de cima, t. */
export const CARGA_TOPO_TRANSICAO = 10;

/** `f`: a concentrada na ponta do balanço, t (0 = sem); `nome`: o do pilar de cima;
 *  `extra`: pilares a mais no CIMA; `vigasCima`: vigas do CIMA. */
export function obraTransicao({
  f = CARGA_TOPO_TRANSICAO,
  nome = "PB",
  extra = [],
  vigasCima = [],
}: {
  f?: number;
  nome?: string;
  extra?: Pilar[];
  vigasCima?: Obra["pavimentos"][number]["vigas"];
} = {}): Obra {
  const base = obraE2E("original");
  const pilar = (id: string, x: number, mais: Partial<Pilar> = {}): Pilar => ({
    id,
    nome: id.split("/")[1]!,
    x,
    y: 0,
    b: 20,
    h: 20,
    ...mais,
  });
  const vazio = {
    repeticoes: 1,
    lajes: [],
    pilaresRemovidos: [],
    peDireito: 3,
  };
  return {
    ...base,
    pavimentos: [
      {
        ...vazio,
        id: "CIMA",
        nome: "CIMA",
        vigas: vigasCima,
        pilares: [
          pilar(`CIMA/${nome}`, 4.1, {
            cargaTopo: { normal: CARGA_TOPO_TRANSICAO * KN_POR_TF, momentos: [] },
          }),
          ...extra,
        ],
      },
      {
        ...vazio,
        id: "BAIXO",
        nome: "BAIXO",
        vigas: [
          {
            id: "BAIXO/V1",
            nome: "V1",
            x1: 0,
            y1: 0,
            x2: 4.1,
            y2: 0,
            bw: 20,
            h: 50,
            cargaLinear: 0,
            somenteCargasProprias: true,
            cargas: f
              ? [{ tipo: "concentrada", trecho: 1, posicao: 0.1, total: f * KN_POR_TF }]
              : [],
          },
        ],
        pilares: [pilar("BAIXO/PA", 0), pilar("BAIXO/PB", 4)],
      },
    ],
  };
}

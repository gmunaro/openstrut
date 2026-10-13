// Materiais pela NB-1/78 (NBR 6118:1978), como na V1 (LAJCALC.BM, CALCCA.BM).
import type { Aco, Materiais } from "../../../dominio/obra";
import type { MateriaisCalc } from "../../tipos";

export const GAMA_C = 1.4;
export const GAMA_S = 1.15;
export const GAMA_F = 1.4;
export const ES = 210_000;

export const FYK: Record<Aco, number> = { "CA-25": 250, "CA-50": 500, "CA-60": 600 };

/** Ec = 0,9 · 6600 · √(fck + 3,5) MPa (NB-1/78 item 8.2.5, módulo secante). */
export const moduloConcreto = (fck: number) => 0.9 * 6600 * Math.sqrt(fck + 3.5);

export function materiaisNb178(m: Materiais): MateriaisCalc {
  const fcd = m.fck / GAMA_C;
  const fyk = FYK[m.aco];
  return {
    fck: m.fck,
    fcd,
    sigmaCd: 0.85 * fcd,
    fyk,
    fyd: fyk / GAMA_S,
    fywd: FYK[m.acoEstribo] / GAMA_S,
    ecs: moduloConcreto(m.fck),
    es: ES,
    aco: m.aco,
    acoEstribo: m.acoEstribo,
  };
}

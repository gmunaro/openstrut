// Materiais pela NBR 6118:2023 (fontes: docs/norma/vigas-pilares.md, seção 1).
// Escopo do app: concretos do Grupo I (C20 a C50); acima disso, aviso.
import type { Aco, Materiais } from "../../../dominio/obra";
import type { MateriaisCalc } from "../../tipos";

/** Tabela 12.1, combinações normais. */
export const GAMA_C = 1.4;
export const GAMA_S = 1.15;
/** Tabela 11.1 [VERIFICAR nota "a": γg = 1,35 em casos específicos]. */
export const GAMA_G = 1.4;
export const GAMA_Q = 1.4;
/** 8.3.5 */
export const ES = 210_000;
/** 8.2.8, agregado granítico (αE = 1,0). */
export const ALFA_E = 1;
/** fywd ≤ 435 MPa na força cortante (17.4.2.2). */
export const FYWD_MAX = 435;

export const FYK: Record<Aco, number> = { "CA-25": 250, "CA-50": 500, "CA-60": 600 };

/** ηc = (40/fck)^(1/3) para fck > 40 MPa, 1 abaixo (8.2.10.1, edição 2023) [VERIFICAR no texto
 *  da norma; valores conferem com a tabela citada em fonte secundária]. */
export const etaC = (fck: number) => (fck <= 40 ? 1 : (40 / fck) ** (1 / 3));

/** fct,m = 0,3 fck^(2/3) (8.2.5, fck ≤ 50). */
export const fctm = (fck: number) => 0.3 * fck ** (2 / 3);
export const fctkInf = (fck: number) => 0.7 * fctm(fck);
export const fctkSup = (fck: number) => 1.3 * fctm(fck);

/** Eci = αE·5600·√fck e Ecs = αi·Eci, αi = 0,8 + 0,2 fck/80 ≤ 1 (8.2.8). */
export const moduloInicial = (fck: number) => ALFA_E * 5600 * Math.sqrt(fck);
export const moduloSecante = (fck: number) =>
  Math.min(0.8 + (0.2 * fck) / 80, 1) * moduloInicial(fck);

export function materiais6118(m: Materiais): MateriaisCalc {
  const fcd = m.fck / GAMA_C;
  const fyk = FYK[m.aco];
  return {
    fck: m.fck,
    fcd,
    // bloco retangular: αc = 0,85·ηc (Grupo I)
    sigmaCd: 0.85 * etaC(m.fck) * fcd,
    fyk,
    fyd: fyk / GAMA_S,
    fywd: Math.min(FYK[m.acoEstribo] / GAMA_S, FYWD_MAX),
    ecs: moduloSecante(m.fck),
    es: ES,
    aco: m.aco,
    acoEstribo: m.acoEstribo,
  };
}

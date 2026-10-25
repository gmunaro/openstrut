// Materiais pela NBR 6118:2023 (fontes: docs/norma/vigas-pilares.md, seção 1).
// Escopo do app: concretos do Grupo I (C20 a C50); acima disso, aviso.
import type { Aco, Caa, Materiais } from "../../../dominio/obra";
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

/** Classe mínima do concreto armado por classe de agressividade, MPa (Tabela 7.1;
 *  docs/norma/durabilidade-lajes.md, seção 2). [VERIFICAR] valores da edição 2014,
 *  a tabela de 2023 não foi lida. */
export const FCK_MINIMO_CA: Record<Caa, number> = { 1: 20, 2: 25, 3: 30, 4: 40 };

const CAA_ROMANO: Record<Caa, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

/** fck abaixo da classe mínima da Tabela 7.1 vira aviso; o cálculo segue com o fck dado
 *  (a obra importada do SISTRUT costuma vir com C15). */
export function avisosMateriais6118(m: Materiais): string[] {
  const minimo = FCK_MINIMO_CA[m.caa];
  return m.fck < minimo
    ? [
        `fck = ${m.fck} MPa abaixo do mínimo da NBR 6118 para concreto armado na classe de agressividade ${CAA_ROMANO[m.caa]}: C${minimo} (Tabela 7.1). O cálculo segue com o fck da obra; para a norma, aumente o fck em Materiais.`,
      ]
    : [];
}

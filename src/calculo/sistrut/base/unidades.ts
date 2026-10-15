// Unidades do módulo `src/calculo/sistrut/`.
//
// EXCEÇÃO DELIBERADA à regra "unidades internas em SI" do CLAUDE.md da V2.
// Para bater número a número com o SISTRUT 4.0, o modo "original" calcula nas
// unidades do próprio original e converte para SI só na saída (decisão do dono,
// PLANO.md 5.1, itens 2 e 3):
// - força em t, momento em t·m (tm), carga linear em t/m, carga por área em t/m²;
// - comprimentos em m (vãos, cotas) e cm (seções, H da laje, cobrimento, espaçamento);
// - tensões em t/cm² (fck 0,15 = o valor exato digitado na unidade da obra;
//   CA-25 = 2,5, CA-50 = 5, CA-60 = 6 t/cm²);
// - densidade do concreto 2,5 t/m³ (LAJE.BAS:1337; SISTRUT.PIP);
// - massa linear do aço em kg/m (tabela do .DSP, DESENHO.BAS:4810-4819).
// Os fatores de unidade do original (dec, de8, df0 do LAJE; coeficientes do VIGA.INI
// e do PILAR.INI) valem 1 no padrão "SISTRUT" e não aparecem aqui.
//
// O modo "corrigido" usa SI "redondo": fyk 250/500/600 MPa e concreto 25 kN/m³,
// em float64, como o resto da V2 (`normas/nb1-78/materiais.ts`).
//
// Gravidade: 1 tf = 9,80665 kN (gravidade padrão), a mesma de `calculo/unidades.ts`.
import type { Aco } from "../../../dominio/obra";
import { KN_POR_TF } from "../../unidades";

export { KN_POR_TF };

/** 1 t/cm² = 9,80665 kN / 10⁻⁴ m² = 98,0665 MPa. */
export const MPA_POR_TCM2 = KN_POR_TF * 10;

/** fyk do original por aço, t/cm². O 5 do CA-50 é o padrão do original (LAJE.BAS:116,
 *  PILAR.BAS:571, DESENHO.BAS:4775); 2,5 e 6 são a decisão do dono (PLANO.md 5.1, item 3). */
export const FYK_ORIGINAL_TCM2: Record<Aco, number> = { "CA-25": 2.5, "CA-50": 5, "CA-60": 6 };

/** fyk do modo corrigido por aço, MPa (o mesmo de `normas/nb1-78/materiais.ts`). */
export const FYK_CORRIGIDO_MPA: Record<Aco, number> = { "CA-25": 250, "CA-50": 500, "CA-60": 600 };

/** Densidade do concreto no original, t/m³ (LAJE.BAS:1337). */
export const DENSIDADE_CONCRETO_TM3 = 2.5;

/** Peso específico do concreto no modo corrigido, kN/m³. */
export const PESO_CONCRETO_CORRIGIDO_KNM3 = 25;

// ---------------------------------------------------------------- original → SI

/** t → kN (força, reação, normal). */
export const tParaKn = (t: number) => t * KN_POR_TF;
/** t·m → kN·m (momento de viga e pilar). */
export const tmParaKnm = (tm: number) => tm * KN_POR_TF;
/** t·m/m → kN·m/m (momento de laje por metro). */
export const tmPorMParaKnmPorM = (tmm: number) => tmm * KN_POR_TF;
/** t/m → kN/m (carga linear de viga). */
export const tPorMParaKnPorM = (tm: number) => tm * KN_POR_TF;
/** t/m² → kN/m² (carga de laje). */
export const tPorM2ParaKnPorM2 = (tm2: number) => tm2 * KN_POR_TF;
/** t/m³ → kN/m³ (densidade do concreto). */
export const tPorM3ParaKnPorM3 = (tm3: number) => tm3 * KN_POR_TF;
/** t/cm² → MPa (fck, fyk, tensões). */
export const tcm2ParaMpa = (tcm2: number) => tcm2 * MPA_POR_TCM2;
/** t·cm → kN·m (momentos internos do original em t·cm, ex.: M+ da laje × 100). */
export const tcmParaKnm = (tcm: number) => (tcm / 100) * KN_POR_TF;

// ---------------------------------------------------------------- SI → original
// Na entrada do modo original, aplique `sng` (f32.ts) ao resultado: o original
// guarda em SINGLE o valor digitado.

/** kN → t. */
export const knParaT = (kn: number) => kn / KN_POR_TF;
/** kN·m → t·m. */
export const knmParaTm = (knm: number) => knm / KN_POR_TF;
/** kN/m → t/m. */
export const knPorMParaTPorM = (knm: number) => knm / KN_POR_TF;
/** kN/m² → t/m². */
export const knPorM2ParaTPorM2 = (knm2: number) => knm2 / KN_POR_TF;
/** MPa → t/cm². */
export const mpaParaTcm2 = (mpa: number) => mpa / MPA_POR_TCM2;

// Massa linear de aço (kg/m), áreas (cm², cm²/m) e comprimentos (m, cm) já são as
// unidades da V2: não há conversão.

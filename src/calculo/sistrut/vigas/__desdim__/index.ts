// Valores do oráculo para o DESDIM que não estão em __oraculo__/ (sondas p3, p5 e p6
// de dist/tests/retraducao/desenho/CHECKLIST.md), no mesmo formato. Cada valor leva o
// arquivo e a linha do run (oraculo/runs/<run>/). p2 e p10 não mostram nenhum
// número do DESDIM (menus do DESENHO), por isso não têm JSON. Os v2par_des_* são os
// casos da rodada 2 (v2-paridade/oraculo-novos/, índice em
// tests/retraducao/V2PAR.md da V1), copiados com uma correção: a
// fonte de <viga>.cobrimento apontava uma linha abaixo da impressa (41 → 40, 46 → 45,
// 58 → 57 no impressora.prn de cada run).
import type { CasoOraculo } from "../../__oraculo__";
import retrad_des_p3 from "./retrad_des_p3.json";
import retrad_des_p5 from "./retrad_des_p5.json";
import retrad_des_p6 from "./retrad_des_p6.json";
import v2par_des_2tramos from "./v2par_des_2tramos.json";
import v2par_des_3tramos from "./v2par_des_3tramos.json";
import v2par_des_especial from "./v2par_des_especial.json";

export const CASOS_DESDIM: Record<string, CasoOraculo> = {
  retrad_des_p3,
  retrad_des_p5,
  retrad_des_p6,
  v2par_des_2tramos,
  v2par_des_3tramos,
  v2par_des_especial,
};

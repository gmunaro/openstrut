// Valores do oráculo para o DESDIM que não estão em __oraculo__/ (sondas p3, p5 e p6
// de dist/tests/retraducao/desenho/CHECKLIST.md), no mesmo formato. Cada valor leva o
// arquivo e a linha do run (C:/tmp/oraculo/runs/<run>/). p2 e p10 não mostram nenhum
// número do DESDIM (menus do DESENHO), por isso não têm JSON.
import type { CasoOraculo } from "../../__oraculo__";
import retrad_des_p3 from "./retrad_des_p3.json";
import retrad_des_p5 from "./retrad_des_p5.json";
import retrad_des_p6 from "./retrad_des_p6.json";

export const CASOS_DESDIM: Record<string, CasoOraculo> = {
  retrad_des_p3,
  retrad_des_p5,
  retrad_des_p6,
};

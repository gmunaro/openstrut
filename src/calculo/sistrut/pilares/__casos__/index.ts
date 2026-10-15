// Valores impressos pelo original nos casos `retrad_pil_*` que o `__oraculo__/`
// ainda não tem (T5): os retrad_pil_* extraídos aqui e os v2par_pilar_* da rodada 2
// (copiados de C:/tmp/v2-paridade/oraculo-novos/). Mesmo formato dos JSONs do oráculo: texto impresso e
// "arquivo:linha" do run em C:/tmp/oraculo/runs/<run>/. Gerados a partir das
// impressões conferidas linha a linha (impressora.prn e telas/*.txt).
import type { CasoOraculo } from "../../__oraculo__";
import retrad_pil_poliinv from "./retrad_pil_poliinv.json";
import retrad_pil_secoes from "./retrad_pil_secoes.json";
import retrad_pil_trava from "./retrad_pil_trava.json";
import retrad_pil_verif2 from "./retrad_pil_verif2.json";
import v2par_pilar_lambda from "./v2par_pilar_lambda.json";
import v2par_pilar_mk from "./v2par_pilar_mk.json";
import v2par_pilar_niveis from "./v2par_pilar_niveis.json";
import v2par_pilar_trava from "./v2par_pilar_trava.json";

export const CASOS_PILAR: Record<string, CasoOraculo> = {
  retrad_pil_verif2,
  retrad_pil_trava,
  retrad_pil_secoes,
  retrad_pil_poliinv,
  v2par_pilar_mk,
  v2par_pilar_lambda,
  v2par_pilar_niveis,
  v2par_pilar_trava,
};

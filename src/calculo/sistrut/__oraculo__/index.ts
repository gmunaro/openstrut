// Valores de referência do SISTRUT 4.0 original, um JSON por caso do oráculo
// (oraculo/runs/<run>/). Os testes de `src/calculo/sistrut/` comparam
// contra estes números, nunca contra a saída da própria função (CLAUDE.md).
//
// Formato (igual ao comparador T9, `paridade/lib/caso.ts` do repositório da V1):
// cada valor é o texto exatamente como impresso e a linha de onde saiu
// ("impressora.prn:42", "telas/011_x.txt:7", "obra/E2E.REP:22").
// Ids: lajes `L1.M+princ`, `L1>V4.area`; vigas `V1.t1.M+`, `V1.a0.R`, `V1.MEP0`;
// .REP `REP.P5`, `REP.P5.carga.V2`; pilar avulso `P.lambdaX`, `c1.Mx`;
// PILAREDI `P5.1f.MRx2a`, `P5.As`; parâmetros `param.<nome>`.
//
// Caso novo: grave o JSON nesta pasta, importe aqui e acrescente em CASOS_ORACULO.
import caso_a_laje from "./caso_a_laje.json";
import caso_b_viga from "./caso_b_viga.json";
import caso_c_pilar from "./caso_c_pilar.json";
import caso_c_pilaredi from "./caso_c_pilaredi.json";
import retrad_arm_param from "./retrad_arm_param.json";
import retrad_des_det from "./retrad_des_det.json";
import retrad_des_menu from "./retrad_des_menu.json";
import retrad_laje_calc2 from "./retrad_laje_calc2.json";
import retrad_laje_param from "./retrad_laje_param.json";
import retrad_lajeproc from "./retrad_lajeproc.json";
import retrad_pil_dim from "./retrad_pil_dim.json";

/** Um número (ou texto) impresso pelo original. */
export interface ValorOraculo {
  /** Estável dentro do caso; é por ele que o teste acha o valor. */
  id: string;
  grandeza: string;
  /** Unidade do original (t, tm, tm/m, t/m, cm, cm2, ...); "" sem unidade. */
  unidade: string;
  /** Texto exatamente como impresso (".35", "0.25", "52", "Compressao Centrada"). */
  impresso: string;
  /** "<arquivo relativo ao run>:<linha a partir de 1>". */
  fonte: string;
  /** Casas do valor quando o texto não mostra todas (STR$ corta zeros: "1.1" de 2 casas). */
  casas?: number;
  /** O original truncou em direção a zero na última casa em vez de arredondar
   *  (parcelas e momentos do .REP: ".72" para 0,729; "-.64" para −0,648). */
  trunca?: boolean;
  obs?: string;
}

export interface CasoOraculo {
  caso: string;
  /** Pasta do run do oráculo. */
  run: string;
  programa: string;
  descricao: string;
  /** Descrição livre e completa da entrada do caso. */
  entrada: Record<string, unknown>;
  valores: ValorOraculo[];
}

export const CASOS_ORACULO: Record<string, CasoOraculo> = {
  caso_a_laje,
  caso_b_viga,
  caso_c_pilar,
  caso_c_pilaredi,
  retrad_pil_dim,
  retrad_lajeproc,
  retrad_laje_calc2,
  retrad_laje_param,
  retrad_des_det,
  retrad_des_menu,
  retrad_arm_param,
};

/** Valor `id` do caso; erro se não existir (id digitado errado não passa calado). */
export function valorOraculo(caso: CasoOraculo, id: string) {
  const v = caso.valores.find((x) => x.id === id);
  if (!v) throw new Error(`Valor "${id}" não existe no caso ${caso.caso}`);
  return v;
}

/** Número impresso do valor `id` (".35" → 0.35, "-.64" → -0.64). */
export function numeroOraculo(caso: CasoOraculo, id: string) {
  const v = valorOraculo(caso, id);
  const n = Number(v.impresso.trim());
  if (!Number.isFinite(n)) throw new Error(`"${v.impresso}" (${id}) não é número`);
  return n;
}

/** Casas decimais do valor: `casas` ou as do texto impresso. */
export function casasImpressas(v: ValorOraculo) {
  if (v.casas !== undefined) return v.casas;
  const ponto = v.impresso.indexOf(".");
  return ponto < 0 ? 0 : v.impresso.trim().length - v.impresso.trim().indexOf(".") - 1;
}

/** O número calculado bate com o impresso? Arredondado: até meia unidade da última
 *  casa impressa (0.25 aceita 0,245..0,255). Com `trunca`: FIX(x·10^casas)/10^casas
 *  igual ao impresso. Mesma regra do comparador T9. */
export function bateComImpresso(v: ValorOraculo, calculado: number) {
  const impresso = Number(v.impresso.trim());
  const casas = casasImpressas(v);
  const escala = 10 ** casas;
  if (v.trunca)
    return Math.trunc(calculado * escala + Math.sign(calculado) * 1e-9) / escala === impresso;
  return Math.abs(calculado - impresso) <= 0.5 / escala + 1e-12;
}

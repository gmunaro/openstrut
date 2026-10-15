// Armaduras de uma laje com H (LAJECALC opção 5, colunas de As, e o relatório da
// imposição de H, opção 4). Especificação: livros_laje.md 1.12, 1.13 e 2.3;
// PLANO L7-L8 (U32-021, U32-022).
import { atribuicao } from "../base/f32";
import type {
  ArmadurasLaje,
  BarraDeLaje,
  MateriaisSistrut,
  ModoSistrut,
  MomentosDeLaje,
  ParametrosLaje,
} from "../base/tipos";
import { escolheBarraLaje } from "./barras";
import { flexaoLaje } from "./flexao";

/** Relações M−/M+ da laje: a maior e a menor entre os bordos engastados (código > 2,
 *  coeficiente (código−2)/10·fator > 0); a menor é 0 sem engaste (V_1750/V_1758,
 *  LAJECALC.BAS:623-646 e 828-840; livros_laje.md 1.8). E2E L1: 2,0 e 1,6. */
export function relacoesNegativas(
  bordos: MomentosDeLaje["bordos"],
  modo: ModoSistrut,
): { maior: number; menor: number } {
  const s = atribuicao(modo);
  const engastados = bordos.filter((b) => b.coeficiente > 0).map((b) => s(b.coeficiente));
  if (engastados.length === 0) return { maior: 0, menor: 0 };
  return { maior: Math.max(...engastados), menor: Math.min(...engastados) };
}

/** M+ por metro antes do produto por 100, t/m (V_1400 = q/coef, LAJECALC.BAS:825, 876). */
export const cargaPorCoeficiente = (momentos: MomentosDeLaje, modo: ModoSistrut) =>
  atribuicao(modo)(momentos.q / momentos.coeficiente.coeficiente);

/** Seção dimensionada com barra (a sub-rotina L_14312 fora do modo 4). */
export interface SecaoComBarra {
  x: number;
  xd: number;
  as: number;
  barra: BarraDeLaje;
}

/** Flexão e barra de uma seção; x = −1 quando não passa (LAJECALC.BAS:930-995). */
export function secaoComBarra(
  mTcm: number,
  h: number,
  negativa: boolean,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): SecaoComBarra {
  const f = flexaoLaje({ mTcm, h, negativa }, materiais, parametros, modo);
  if (!f.passa) return { x: -1, xd: -1, as: -1, barra: { ok: false } };
  return { x: f.x, xd: f.xd, as: f.as, barra: escolheBarraLaje(f.as, h, parametros, modo) };
}

/**
 * Seção de maior x de uma laje com H dado, como o relatório da imposição de H a
 * imprime (LAJECALC.BAS:872-927, modo 2): positiva com M = 100·p (0 se p ≤ 0) e
 * negativa com M = 100·|p|·c_max; vence a negativa no empate. Se a positiva com p > 0
 * ou a negativa não passa, sai sem barra ("NAO") e x = −1. E2E H 10: negativa maior,
 * x/d 0,159, # 6.3 c/12.5 (livros_laje.md 2.3).
 */
export function secaoDeMaiorX(
  momentos: MomentosDeLaje,
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): SecaoComBarra {
  const s = atribuicao(modo);
  const naoPassa: SecaoComBarra = { x: -1, xd: -1, as: -1, barra: { ok: false } };
  const p = cargaPorCoeficiente(momentos, modo);
  const h = momentos.h;
  const positiva = secaoComBarra(p > 0 ? s(100 * p) : 0, h, false, materiais, parametros, modo);
  // LAJECALC.BAS:889-893: p > 0 e x ≤ 0 grava "NAO".
  if (p > 0 && positiva.x <= 0) return naoPassa;
  const { maior } = relacoesNegativas(momentos.bordos, modo);
  if (!(maior > 0)) return positiva;
  const negativa = secaoComBarra(
    s(100 * Math.abs(p) * maior),
    h,
    true,
    materiais,
    parametros,
    modo,
  );
  // LAJECALC.BAS:917-920: negativa que não passa zera o M+ gravado e grava "NAO".
  if (negativa.x === -1) return naoPassa;
  return negativa.x < positiva.x ? positiva : negativa;
}

/**
 * As das quatro colunas do relatório "Armaduras nas lajes" (LAJECALC.BAS:663-731,
 * modo 4; livros_laje.md 1.13), a partir do M+ gravado (A_12fc(i,1)):
 * - As+ principal com max(M+, 0): As se x ≥ 0, senão −1;
 * - As− maior/menor com |M+|·c_max/c_min: só se M > 0 (senão 0); As se x > 0, senão −1;
 * - As+ secundária com o M+ secundário (0 se M+ ≤ 0): As se x > 0, senão −1. Com
 *   M = 0 o x do original é um resíduo positivo e sai o mínimo (flexao.ts;
 *   v2par_laje_balanco: 1,50 e 1,50 com M+ = −0,28).
 * Mais a seção de maior x e a barra do relatório da imposição (`secaoDeMaiorX`).
 * E2E H 10: 1,50 / 1,50 / 2,13 / 1,68 (livros_laje.md 2.3).
 */
export const armadurasLaje: ArmadurasLaje = (momentos, materiais, parametros, modo) => {
  const s = atribuicao(modo);
  const h = momentos.h;
  const mPositivo = momentos.mPositivoPrincipalTcm;
  const flexao = (mTcm: number, negativa: boolean) =>
    flexaoLaje({ mTcm, h, negativa }, materiais, parametros, modo);

  const principal = flexao(mPositivo > 0 ? mPositivo : 0, false);
  const asPositivaPrincipal = principal.x >= 0 ? principal.as : -1;

  const { maior, menor } = relacoesNegativas(momentos.bordos, modo);
  const negativa = (relacao: number) => {
    const m = s(Math.abs(mPositivo) * relacao);
    if (!(m > 0)) return 0;
    const f = flexao(m, true);
    return f.x > 0 ? f.as : -1;
  };

  const secundaria = flexao(mPositivo > 0 ? momentos.mPositivoSecundarioTcm : 0, false);
  const asPositivaSecundaria = secundaria.x > 0 ? secundaria.as : -1;

  const maiorX = secaoDeMaiorX(momentos, materiais, parametros, modo);
  return {
    nome: momentos.nome,
    h,
    xd: maiorX.xd,
    asPositivaPrincipal,
    asPositivaSecundaria,
    asNegativaMaior: negativa(maior),
    asNegativaMenor: negativa(menor),
    barra: maiorX.barra,
  };
};

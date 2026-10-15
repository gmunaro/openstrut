// Flexão simples da seção de laje do SISTRUT 4.0 (faixa b = 100 cm), como a
// sub-rotina L_14312 do LAJECALC e a L_15279 do LAJEPROC (mesmas fórmulas).
// Especificação: livros_laje.md 1.9 e 2.3; PLANO L7-L8 (U32-011, U32-016, U45-001..003).
//
// É a solução de 0,68·b·fcd·x·(d − 0,4x) = Md com b = 100 cm, em t e cm:
//   X  = 80·d·0,85·fck/γc
//   Y  = 108,8·fck·M·γf/γc                      (M em t·cm/m, característico)
//   x  = γc·(X − √(X² − Y))/(54,4·fck)          (X² < Y: não passa)
//   As = 80/(γc·fyk)·x·0,85·fck·γs              (x/d > ξlim: não passa)
// Os fatores de unidade do original (df0) valem 1 no padrão "SISTRUT" e não aparecem.
import { atribuicao } from "../base/f32";
import type {
  FlexaoDeLaje,
  FlexaoLaje,
  MateriaisSistrut,
  ModoSistrut,
  ParametrosLaje,
} from "../base/tipos";

/** ξlim = fração / ((fyk/(γs·2100) + 0,002·[aço B])/0,0035 + 1). O `−(tipo = "B")`
 *  do QB vale +1 com aço B, então soma 0,002 (LAJECALC.BAS:820, V_1394;
 *  LAJEPROC.BAS:444, V_13ee; livros_laje.md 1.9, U32-016). E2E (aço B): 0,4623. */
export function xiLimiteLaje(
  materiais: MateriaisSistrut,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const parcelaB = materiais.classeAco === "B" ? s(0.002) : 0;
  const deformacaoAco = materiais.fyk / (materiais.gamaS * 2100) + parcelaB;
  return s((parametros.fracaoLinhaNeutra / (deformacaoAco / s(0.0035) + 1)) * 1);
}

/** Altura útil d = H − cobrimento − acréscimo, cm (V_0eec, LAJECALC.BAS:824;
 *  LAJEPROC.BAS:445). Padrão: d = H − 2,0. */
export const alturaUtilLaje = (h: number, parametros: ParametrosLaje, modo: ModoSistrut) =>
  atribuicao(modo)(h - parametros.cobrimento - parametros.acrescimo);

/** Seção que não passa: o original grava x = −1 (LAJECALC.BAS:932, 937). */
const NAO_PASSA: FlexaoDeLaje = { passa: false, x: -1, xd: -1, as: -1 };

/**
 * As de uma faixa de laje de 100 cm para o momento característico `secao.mTcm`
 * (t·cm/m) e a espessura `secao.h` (cm), com o mínimo taxa·H e, na negativa, a
 * divisão pela eficiência quando ela é < 1 (LAJECALC.BAS:930-958, sub-rotina
 * L_14312; LAJEPROC.BAS:998-1022, L_15279; livros_laje.md 1.9). A igualdade
 * x/d = ξlim passa. Uso: espessura mínima, armaduras da laje, otimização e LAJEPROC.
 * E2E H 10, M− 49,55 t·cm/m: x/d 0,159, As 2,13 cm²/m (livros_laje.md 2.3).
 */
export const flexaoLaje: FlexaoLaje = (secao, materiais, parametros, modo) => {
  const s = atribuicao(modo);
  const { fck, fyk, gamaF, gamaC, gamaS } = materiais;
  const d = alturaUtilLaje(secao.h, parametros, modo);
  const xiLim = xiLimiteLaje(materiais, parametros, modo);
  const X = (80 * d * s(0.85) * fck) / gamaC;
  const Y = (s(108.8) * fck * secao.mTcm * gamaF) / gamaC;
  if (X ** 2 < Y) return NAO_PASSA;
  const x = s(((X - Math.sqrt(X ** 2 - Y)) / (fck * s(54.4))) * gamaC);
  if (x / d > xiLim) return NAO_PASSA;
  let as = s((80 / (gamaC * fyk)) * x * s(0.85) * fck * gamaS);
  if (secao.negativa) {
    // LAJECALC.BAS:948-953: ÷ eficiência só se < 1, depois o mínimo F76·H.
    if (parametros.eficienciaNegativa < 1) as = s(as / parametros.eficienciaNegativa);
    as = Math.max(as, s(parametros.taxaMinimaNegativa * secao.h));
  } else {
    // LAJECALC.BAS:942-945: mínimo F72·H, também com M = 0.
    as = Math.max(as, s(parametros.taxaMinimaPositiva * secao.h));
  }
  return { passa: true, x, xd: s(x / d), as };
};

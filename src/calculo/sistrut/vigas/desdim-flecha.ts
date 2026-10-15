// Flecha e fissuração do DESDIM. Flecha: EJ·f no ponto do M+ (S_113f7,
// DESDIM.BAS:2707-2765) dividido pela rigidez no estádio I (seção T bruta) ou II
// (fissurada) (L_19577, DESDIM.BAS:3849-3904). Fissuração: w1 e w2 da NB-1/78 no
// estádio II (S_20137, DESDIM.BAS:3909-4330). Unidades: m e t nos esforços, cm e t/cm²
// na seção. Livros: U03-008, U03-011, U03-041 (livros_arm_forma_des.md 4.3); PLANO D5.
import { atribuicao, qbInt, qbStr } from "../base/f32";
import type { DivisaoCarga, MateriaisSistrut, ModoSistrut, ParametrosDsp } from "../base/tipos";
import type { SecaoCalculo } from "./desdim-flexao";

/** Ec do DESDIM, t/cm² (DESDIM.BAS:2709-2713; U03-011): 21·√(1000·fck + 35)·k, k o
 *  multiplicador do .DSP; k < 0 dá Ec = −k. fck 0,15 e k 0,9: 257,07. */
export function moduloEc(
  materiais: MateriaisSistrut,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const k = parametros.multiplicadorEc;
  if (k < 0) return s(-k);
  return s(
    (Math.sqrt(1000 * materiais.fck * parametros.multiplicadorUnidade + 35) * k * 21000) / 1000,
  );
}

/** Dados de um tramo interno para a flecha: vão L (m), abscissa x do M+ (m), cortante
 *  à esquerda Ve (t), momento no apoio esquerdo Me (tm) e as divisões de carga. */
export interface TramoFlecha {
  vao: number;
  x: number;
  ve: number;
  mEsquerdo: number;
  divisoes: readonly DivisaoCarga[];
}

/** EJ·f (t·m³) no ponto x do M+ do tramo (S_113f7, DESDIM.BAS:2716-2765): integração
 *  fechada da linha elástica com os momentos dos dois apoios, as cargas distribuídas em
 *  degraus e as concentradas. Negativo (para cima) vira 0. Ex.: tramo extremo de duas
 *  vigas iguais, q 0,486, L 4: q·x(L³ − 3Lx² + 2x³)/48 = 0,6645 em x = 1,5. */
export function flechaEJ(tramo: TramoFlecha, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const { vao: L, x, ve, mEsquerdo: mi, divisoes } = tramo;
  let e = s((x ** 2 * mi) / 2 - (x ** 3 * mi) / (L * 6) - (mi * L * x) / 3);
  // Momento no apoio direito pelo equilíbrio do tramo.
  let md = s(ve * L + mi);
  let anterior = 0;
  for (const dv of divisoes) {
    md = s(
      md - ((dv.d - anterior) ** 2 * dv.p) / 2 - ((dv.d - anterior) * dv.p + dv.f) * (L - dv.d),
    );
    anterior = dv.d;
  }
  e = s((x ** 3 / (L * 6)) * md - (L * x * md) / 6 + e);
  anterior = 0;
  for (const dv of divisoes) {
    const { d, p: q, f } = dv;
    if (d >= x) {
      e = s(((L - d) * f * x ** 3) / (L * 6) + e);
      e = s(((d ** 2 * f) / 2 - (d ** 3 * f) / (L * 6) - (f * d * L) / 3) * x + e);
      e = s((q * d * (L - d / 2) * x ** 3) / (L * 6) + e);
      e = s(e - (x ** 4 * q) / 24);
      e = s(((-q * d ** 4) / (L * 24) - (d ** 2 * q * L) / 6 + (d ** 3 * q) / 6) * x + e);
    } else {
      e = s(e - (f * d * x ** 3) / (L * 6) + (f * d * x ** 2) / 2);
      e = s(e - ((d ** 3 * f) / (L * 6) + (f * d * L) / 3) * x + (d ** 3 * f) / 6);
      e = s(e - (d ** 2 * q * x ** 3) / (L * 12) + (d ** 2 * q * x ** 2) / 4);
      e = s(((-q * d ** 4) / (L * 24) - (d ** 2 * q * L) / 6) * x + e);
      e = s(e - (d ** 2 * q * L ** 2) / 6 + (d ** 4 * q) / 24 + (d ** 2 * q * L ** 2) / 6);
    }
    // Desconta a parte da carga distribuída antes do início da divisão.
    let desconto = 0;
    if (anterior > 0) {
      const a = anterior;
      if (x <= a) {
        desconto = s((((L - a / 2) * q * x ** 3) / (L * 6)) * a);
        desconto = s(desconto - (x ** 4 * q) / 24);
        desconto = s(
          ((-q * a ** 4) / (L * 24) - (a ** 2 * q * L) / 6 + (a ** 3 * q) / 6) * x + desconto,
        );
      } else {
        desconto = s((-q * a ** 2 * x ** 3) / (L * 12) + (a ** 2 * q * x ** 2) / 4);
        desconto = s(((-q * a ** 4) / (L * 24) - (a ** 2 * q * L) / 6) * x + desconto);
        desconto = s(
          desconto - (a ** 2 * q * L ** 2) / 6 + (a ** 4 * q) / 24 + (a ** 2 * q * L ** 2) / 6,
        );
      }
    }
    e = s(e - desconto);
    anterior = d;
  }
  const menosE = s(-e);
  return 0 > menosE ? 0 : menosE;
}

/** Inércia bruta da seção T (cm⁴) pelo centro de gravidade (DESDIM.BAS:3898-3901). */
export function inerciaBruta(secao: SecaoCalculo, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const { bw, h, bf, hf } = secao;
  let yc = s((hf ** 2 * bf) / 2 + (h - hf) * ((h - hf) / 2 + hf) * bw);
  yc = s(yc / (bf * hf + (h - hf) * bw));
  let i = s((hf ** 3 * bf) / 12 + (yc - hf / 2) ** 2 * bf * hf);
  i = s(((h - hf) ** 3 * bw) / 12 + i + (h - hf) * (yc - ((h - hf) / 2 + hf)) ** 2 * bw);
  return i;
}

/** Linha neutra x (cm) no estádio II, com n = Es/Ec (DESDIM.BAS:3866-3882 e 4280-4291):
 *  equação do 2º grau com a linha neutra na mesa ou na alma; a outra raiz quando a
 *  primeira cai fora da faixa. */
export function estadioII(
  secao: SecaoCalculo,
  as: number,
  es: number,
  ec: number,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const { bw, h, bf, hf, d } = secao;
  let x: number;
  if ((hf ** 2 * bf) / 2 >= ((d - hf) * as * es) / ec) {
    const a = s(bf / 2);
    const b = s((as * es) / ec);
    const c = s((-as * d * es) / ec);
    x = s((-b + Math.sqrt(b ** 2 - 4 * a * c)) / (a * 2));
    if (x > hf || x < 0) x = s((-b - Math.sqrt(b ** 2 - 4 * a * c)) / (a * 2));
  } else {
    const a = s(bw / 2);
    const b = s((bf - bw) * hf + (as * es) / ec);
    const c = s((-as * d * es) / ec + ((bw - bf) * hf ** 2) / 2);
    x = s((-b + Math.sqrt(b ** 2 - 4 * a * c)) / (a * 2));
    if (x > h || x < hf) x = s((-b - Math.sqrt(b ** 2 - 4 * a * c)) / (a * 2));
  }
  return x;
}

/** Rigidez EI fissurada (t·cm²) da flecha no estádio II (DESDIM.BAS:3884-3894). */
function rigidezFissurada(secao: SecaoCalculo, as: number, ec: number, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const { bw, bf, hf } = secao;
  const es = 2100;
  const x = estadioII(secao, as, es, ec, modo);
  let ei = s((secao.d - x) ** 2 * as * es);
  const hm = hf < x ? hf : x;
  const meio = hf / 2 < x / 2 ? hf / 2 : x / 2;
  ei = s((((bf - bw) * hm ** 3) / 12 + (bf - bw) * (x - meio) ** 2 * hm) * ec + ei);
  ei = s(((x ** 3 * bw) / 12 + (x / 2) ** 2 * bw * x) * ec + ei);
  return ei;
}

/** Flecha do tramo (cm) como o original imprime: INT(EJf·1e8/EI)/100, truncada no
 *  centésimo (DESDIM.BAS:3895, 3902; U03-041). Estádio I com a inércia bruta; com
 *  "inércia fissurada" do .DSP, estádio II com a armadura do arranjo (o 2º grupo só
 *  conta com mais de 1 barra, DESDIM.BAS:3860). */
export function flechaTramo(
  ejf: number,
  secao: SecaoCalculo,
  ec: number,
  asArranjo: number,
  fissurada: boolean,
  coeficienteMedida: number,
  coeficienteForca: number,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const fator = coeficienteMedida ** 3 * coeficienteForca * 100000000;
  const valor = fissurada
    ? s(qbInt((fator * ejf) / rigidezFissurada(secao, asArranjo, ec, modo)) / 100)
    : s(
        qbInt(
          ((coeficienteMedida ** 3 * ejf) / (ec * inerciaBruta(secao, modo))) *
            coeficienteForca *
            100000000,
        ) / 100,
      );
  return { valor, texto: qbStr(valor) };
}

/** Resultado da fissuração (unidade do original: décimos de mm, comparados com a classe
 *  1, 2 ou 3 do .DSP). */
export interface Fissuracao {
  w1: number;
  w2: number;
  /** Classe do .DSP (limite em décimos de mm). */
  limite: number;
  ok: boolean;
}

/** w1 e w2 no estádio II para o momento característico m (t·cm) (L_21faa, DESDIM.BAS:
 *  4280-4319; U03-008): Es = 2100, η = 1,5, ftk = fck/10 (0,06·fck + 0,007 acima de
 *  0,18); w1 = (bw·h/As + 45)/((2η − 0,75)·Es)·φ·σs; w2 = φ/((2η − 0,75)·Es·ftk)·3σs²;
 *  falha se os dois passam da classe. φ em mm. */
export function fissuracao(
  m: number,
  secao: SecaoCalculo,
  asEfetiva: number,
  bitola: number,
  materiais: MateriaisSistrut,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
): Fissuracao {
  const s = atribuicao(modo);
  const eta = s(1.5);
  const es = 2100;
  const ec = moduloEc(materiais, parametros, modo);
  const ftk =
    materiais.fck > s(0.18) ? s(s(0.06) * materiais.fck + s(0.007)) : s(materiais.fck / 10);
  const { bw, h, bf, hf, d } = secao;
  const x = estadioII(secao, asEfetiva, es, ec, modo);
  let ii = s(((d - x) ** 2 * asEfetiva * es) / ec);
  const hm = hf < x ? hf : x;
  const meio = hf / 2 < x / 2 ? hf / 2 : x / 2;
  ii = s(((bf - bw) * hm ** 3) / 12 + ii + (bf - bw) * (x - meio) ** 2 * hm);
  ii = s((x ** 3 * bw) / 12 + ii + (x / 2) ** 2 * bw * x);
  const sigma = s(((d - x) / (ec * ii)) * es * m);
  const w1 = s((((1 * bw * h) / asEfetiva + 45) / ((eta * 2 - s(0.75)) * es)) * bitola * sigma);
  const w2 = s((bitola / ((eta * 2 - s(0.75)) * es * ftk)) * sigma * sigma * 3);
  const limite = parametros.classeFissuracao;
  return { w1, w2, limite, ok: !(w1 > limite && w2 > limite) };
}

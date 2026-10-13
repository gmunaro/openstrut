// Resistência de seção retangular de concreto armado à flexo-compressão normal pela
// NBR 6118:2023, com o diagrama parábola-retângulo do concreto (8.2.10.1) e os
// domínios de deformação de 17.2.2, para concretos do Grupo I (fck ≤ 50 MPa).
// Serve também à NB-1/78 (V1 PILCALC.BM usa o mesmo modelo: parábola-retângulo
// 0,85 fcd, pivôs A/B/C e concreto descontado), que pode pedir o aço classe B
// (TensoesCalculo.classe).
// Fonte: Bastos, "Flexão composta e pilares de concreto armado" (UNESP, jun/2024),
// "Bastos, Pilares": Eq. 1 e Figura 1 (p. 1), domínios no item 2.3 e Figura 7
// (p. 5-6), domínio 5 e reta b nas Figuras 16 e 17 (p. 9).
//
// O concreto é integrado pela parábola-retângulo e o domínio 5 gira em torno do
// pivô C. As barras comprimidas descontam o concreto que ocupam (a favor da
// segurança; os ábacos não descontam). Não conhece γ: recebe as tensões de cálculo.
// flexaoComposta.ts monta sobre este núcleo a API de duas faces da V1.
// Unidades: seção em cm, armaduras em cm², tensões em MPa, forças em kN
// (compressão > 0), momentos em kN·m em torno do centro geométrico, positivos
// quando comprimem a face y = 0. Deformações adimensionais (0,0035 = 3,5‰),
// encurtamento > 0.
import type { SecaoRetangular, TensoesCalculo } from "./flexaoComposta";

/** Encurtamento último do concreto na flexão, Grupo I (8.2.10.1). */
export const EPS_CU = 0.0035;
/** Encurtamento do fim da parábola e da compressão centrada, Grupo I (8.2.10.1). */
export const EPS_C2 = 0.002;
/** Alongamento máximo da armadura mais tracionada: pivô A dos domínios 1 e 2. */
export const EPS_SU = 0.01;
/** Pivô C do domínio 5: fibra a (εcu − εc2)/εcu·h = 3h/7 da face mais comprimida. */
export const Y_PIVO_C = (EPS_CU - EPS_C2) / EPS_CU;

/** MPa · cm² = 0,1 kN. */
const KN_POR_MPA_CM2 = 0.1;

/** Camada de armadura: área (cm²) e distância à face mais comprimida y = 0 (cm). */
export interface Camada {
  as: number;
  y: number;
}

/** Deformações nas duas faces: y = 0 (mais comprimida) e y = h. Variam linearmente. */
export interface Deformacao {
  topo: number;
  base: number;
}

/** Camadas simétricas: asFace em y = dl e em y = h − dl; asLateral (total das duas
 *  laterais) repartida em nLaterais camadas igualmente espaçadas entre as faces. */
export function camadasSimetricas(
  s: SecaoRetangular,
  asFace: number,
  asLateral = 0,
  nLaterais = 0,
): Camada[] {
  const camadas = [
    { as: asFace, y: s.dl },
    { as: asFace, y: s.h - s.dl },
  ];
  const passo = (s.h - 2 * s.dl) / (nLaterais + 1);
  for (let i = 1; i <= nLaterais; i++)
    camadas.push({ as: asLateral / nLaterais, y: s.dl + i * passo });
  return camadas;
}

/** σc da parábola-retângulo (MPa): σcd·[1 − (1 − ε/εc2)²] até εc2, σcd depois;
 *  zero na tração. σcd = αc·fcd = 0,85·ηc·fcd (Bastos, Pilares, Eq. 1). */
export function tensaoConcreto(eps: number, sigmaCd: number) {
  if (eps <= 0) return 0;
  if (eps >= EPS_C2) return sigmaCd;
  return sigmaCd * (1 - (1 - eps / EPS_C2) ** 2);
}

/** Deformação de cálculo de início do escoamento: fyd/Es; no aço classe B da NB-1/78,
 *  fyd/Es + 2‰ (V1 CcaEpsYd#). */
export const epsYd = (t: Pick<TensoesCalculo, "fyd" | "es" | "classe">) =>
  t.fyd / t.es + (t.classe === "B" ? 0.002 : 0);

/** σs (MPa, com o sinal de ε) pelo diagrama do aço. Classe A (padrão; o único da
 *  NBR 6118, 8.3.6): elastoplástico, Es·ε limitada a ±fyd. Classe B (NB-1/78, aço
 *  encruado a frio; V1 CcaTensaoAco#): ε = σ/Es até 0,7 fyd; ε = σ/Es + 0,823·(σ/fyd −
 *  0,7)⁵ entre 0,7 fyd e fyd, invertido por bissecção (60 passos); fyd a partir de
 *  ε = fyd/Es + 2‰. */
export function tensaoAco(eps: number, t: TensoesCalculo) {
  const e = Math.abs(eps);
  const s = Math.sign(eps);
  if (t.classe !== "B" || t.es * e <= 0.7 * t.fyd) return s * Math.min(t.fyd, t.es * e);
  if (e >= epsYd(t)) return s * t.fyd;
  let lo = 0.7 * t.fyd;
  let hi = t.fyd;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (mid / t.es + 0.823 * (mid / t.fyd - 0.7) ** 5 < e) lo = mid;
    else hi = mid;
  }
  return (s * (lo + hi)) / 2;
}

/** Abscissas de Gauss-Legendre de 2 pontos em [0, 1] (exatas até grau 3). */
const GAUSS = [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)];

/** N (kN) e M (kN·m) resistidos para a deformação dada. O concreto é integrado em
 *  trechos onde σc é polinômio de grau ≤ 2 em y (Gauss de 2 pontos: exato) na seção
 *  bruta. Cada camada comprimida desconta o concreto que ocupa: F = As·(σs − σc(εs)).
 *  Na camada tracionada σc = 0 e F = As·σs. */
export function esforcosResistentes(
  def: Deformacao,
  s: SecaoRetangular,
  camadas: readonly Camada[],
  t: TensoesCalculo,
) {
  const eps = (y: number) => def.topo + ((def.base - def.topo) * y) / s.h;
  // Cortes onde σc muda de lei: ε = 0 e ε = εc2.
  const cortes = [0, s.h];
  if (def.base !== def.topo)
    for (const e of [0, EPS_C2]) {
      const y = ((e - def.topo) * s.h) / (def.base - def.topo);
      if (y > 0 && y < s.h) cortes.push(y);
    }
  cortes.sort((a, b) => a - b);
  let n = 0;
  let mKnCm = 0;
  let y0 = 0;
  for (const y1 of cortes.slice(1)) {
    for (const g of GAUSS) {
      const y = y0 + g * (y1 - y0);
      const f = tensaoConcreto(eps(y), t.sigmaCd) * s.b * ((y1 - y0) / 2) * KN_POR_MPA_CM2;
      n += f;
      mKnCm += f * (s.h / 2 - y);
    }
    y0 = y1;
  }
  for (const c of camadas) {
    const e = eps(c.y);
    const f = c.as * (tensaoAco(e, t) - tensaoConcreto(e, t.sigmaCd)) * KN_POR_MPA_CM2;
    n += f;
    mKnCm += f * (s.h / 2 - c.y);
  }
  return { n, m: mKnCm / 100 };
}

/** Deformação última do parâmetro p ∈ [0, 3], percorrendo os domínios em ordem de N
 *  crescente (17.2.2; Bastos, Pilares, Figura 7):
 *  - 0 ≤ p ≤ 1, pivô A (reta a, domínios 1 e 2): εs = −10‰ em d = h − dl, topo de
 *    −10‰ a +3,5‰;
 *  - 1 ≤ p ≤ 2, pivô B (domínios 3, 4 e 4a): topo = 3,5‰, base até 0 (x = h);
 *  - 2 ≤ p ≤ 3, pivô C (domínio 5 até a reta b): εc2 a 3h/7 do topo, base de 0 a
 *    2‰ (Bastos, Pilares, Figuras 16 e 17, p. 9). */
export function deformacaoUltima(p: number, s: SecaoRetangular): Deformacao {
  const d = s.h - s.dl;
  const naBase = (topo: number) => topo + ((-EPS_SU - topo) * s.h) / d;
  if (p <= 1) {
    const topo = -EPS_SU + p * (EPS_CU + EPS_SU);
    return { topo, base: naBase(topo) };
  }
  if (p <= 2) {
    const base0 = naBase(EPS_CU);
    return { topo: EPS_CU, base: base0 * (2 - p) };
  }
  const base = EPS_C2 * (p - 2);
  return { topo: EPS_C2 + ((EPS_C2 - base) * Y_PIVO_C) / (1 - Y_PIVO_C), base };
}

/** Momento resistente (kN·m) da seção sob a normal nd (kN), ou null se nd está fora
 *  do intervalo [tração pura; compressão centrada]. Acha a deformação última com
 *  N = nd por bissecção no parâmetro de deformacaoUltima (N cresce com p). */
export function momentoResistentePR(
  nd: number,
  s: SecaoRetangular,
  camadas: readonly Camada[],
  t: TensoesCalculo,
) {
  const esforcos = (p: number) => esforcosResistentes(deformacaoUltima(p, s), s, camadas, t);
  if (nd > esforcos(3).n || nd < esforcos(0).n) return null;
  let lo = 0;
  let hi = 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (esforcos(mid).n < nd) lo = mid;
    else hi = mid;
  }
  return esforcos((lo + hi) / 2).m;
}

/** Menor armadura por face (cm², bissecção em [0, asMaxFace]) com MR(nd) ≥ md (kN·m),
 *  ou null se nem asMaxFace basta. `camadas` monta o arranjo a partir da armadura
 *  por face (padrão: só as duas faces, como os ábacos A-1 a A-5 de Venturini). */
export function armaduraSimetricaPR(
  nd: number,
  md: number,
  s: SecaoRetangular,
  t: TensoesCalculo,
  asMaxFace: number,
  camadas: (asFace: number) => Camada[] = (a) => camadasSimetricas(s, a),
) {
  const atende = (as: number) => (momentoResistentePR(nd, s, camadas(as), t) ?? -Infinity) >= md;
  if (!atende(asMaxFace)) return null;
  let lo = 0;
  let hi = asMaxFace;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (atende(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

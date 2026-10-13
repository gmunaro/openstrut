// Bitolas comerciais e escolha de barras (lajes, vigas, pilares e estribos).
// Port de CcaAreaBarra, CcaBitola, CcaEscolheMalha, CcaEscolheBarras,
// CcaLarguraCamada e CcaEscolheBarrasBw (V1 CALCCA.BM) e da escolha de
// estribo de VcDimensiona (V1 VIGCALC.BM). Bitolas em mm, áreas em cm²,
// larguras e espaçamentos em cm. Independe da norma.
import type { Barra, BarrasLongitudinais } from "./tipos";

/** Bitolas comerciais, mm, em ordem crescente (V1 CcaBitola). */
export const BITOLAS = [5, 6.3, 8, 10, 12.5, 16, 20, 25, 32] as const;

/** Área de uma barra de bitola `phi` (mm), cm². */
export const areaBarra = (phi: number) => (Math.PI * (phi / 10) ** 2) / 4;

/**
 * Armadura distribuída (lajes, ramo de estribo) para `asm` cm²/m: a menor
 * bitola ≥ `phiMin` cujo espaçamento, arredondado para baixo em múltiplos de
 * 0,5 cm e limitado a `sMax`, fica ≥ `sMin`. Com `asm` ≤ 0 usa `sMax`.
 * `null` se nenhuma bitola serve.
 */
export function escolheMalha(
  asm: number,
  phiMin: number,
  sMin: number,
  sMax: number,
): Barra | null {
  for (const phi of BITOLAS) {
    if (phi < phiMin) continue;
    const s = asm <= 0 ? sMax : Math.min(Math.floor(((areaBarra(phi) * 100) / asm) * 2) / 2, sMax);
    if (s >= sMin) return { phi, espacamento: s };
  }
  return null;
}

/**
 * Barras longitudinais sem verificar a largura (pilares): o menor número de
 * barras (≥ `nMin`) da menor bitola ≥ `phiMin` que cobre `asReq` com até
 * `nMax` barras. `null` se nenhuma bitola serve.
 */
export function escolheBarras(
  asReq: number,
  phiMin: number,
  nMin: number,
  nMax: number,
): BarrasLongitudinais | null {
  for (const phi of BITOLAS) {
    if (phi < phiMin) continue;
    const n = Math.max(Math.ceil(asReq / areaBarra(phi)), nMin);
    if (n <= nMax) return { n, phi, area: n * areaBarra(phi) };
  }
  return null;
}

/** Espaçamento livre mínimo entre barras de uma camada, cm: max(φ; 2 cm; 1,2 × brita 19 mm = 2,28 cm). */
export const espacamentoLivreMinimo = (phi: number) => Math.max(phi / 10, 2.28);

/** Largura ocupada por uma camada de `n` barras de bitola `phi` (mm), cm. */
export const larguraCamada = (n: number, phi: number) =>
  (n * phi) / 10 + (n - 1) * espacamentoLivreMinimo(phi);

export interface BarrasNaAlma extends BarrasLongitudinais {
  /** A camada cabe na largura útil; se `false`, é o arranjo mais estreito encontrado. */
  cabe: boolean;
  /** Largura da camada, cm. */
  largura: number;
}

/** Máximo de barras numa camada de viga (V1 CcaEscolheBarrasBw). */
export const MAX_BARRAS_CAMADA = 8;
/** Bitola mínima da armadura longitudinal de viga, mm. */
export const PHI_MIN_VIGA = 10;
/** Bitola do estribo descontada da largura útil, cm (V1 usa 5 mm). */
const PHI_ESTRIBO_LARGURA = 0.5;

/**
 * Barras de viga numa camada que caiba na largura útil bw − 2 (cobLat + 0,5):
 * a menor bitola ≥ 10 mm com 2 a 8 barras que cabe. Se nenhuma cabe, devolve
 * o arranjo mais estreito com `cabe: false`. `null` quando nem 8 φ32 bastam.
 * A V1 (VcEscolheBarras) chama com cobLat = 2 cm.
 */
export function escolheBarrasAlma(asReq: number, bw: number, cobLat: number): BarrasNaAlma | null {
  const util = bw - 2 * (cobLat + PHI_ESTRIBO_LARGURA);
  let melhor: BarrasNaAlma | null = null;
  for (const phi of BITOLAS) {
    if (phi < PHI_MIN_VIGA) continue;
    const n = Math.max(Math.ceil(asReq / areaBarra(phi)), 2);
    if (n > MAX_BARRAS_CAMADA) continue;
    const largura = larguraCamada(n, phi);
    const arranjo = { n, phi, area: n * areaBarra(phi), largura };
    if (largura <= util) return { ...arranjo, cabe: true };
    if (melhor === null || largura < melhor.largura) melhor = { ...arranjo, cabe: false };
  }
  return melhor;
}

/** Bitola mínima, espaçamento mínimo e teto do espaçamento máximo de estribo (V1 VcDimensiona). */
export const ESTRIBO_PHI_MIN = 5;
export const ESTRIBO_S_MIN = 7;
export const ESTRIBO_S_MAX = 30;

/** Espaçamento máximo de estribo, cm: min(0,5 d; 30 cm) (V1 VcDimensiona). */
export const espacamentoMaximoEstribo = (d: number) => Math.min(0.5 * d, ESTRIBO_S_MAX);

/**
 * Estribo vertical para `asw` cm²/m com `ramos` ramos (2 na V1): bitola e
 * espaçamento pela regra de `escolheMalha` aplicada a asw/ramos, com φ ≥ 5 mm,
 * s ≥ 7 cm e s ≤ sMax da norma (CortanteResultado.sMax) ou, sem ele, min(0,5 d; 30 cm)
 * (V1). `d` em cm. `null` se não há solução.
 */
export const escolheEstribo = (asw: number, d: number, ramos = 2, sMax?: number) =>
  escolheMalha(asw / ramos, ESTRIBO_PHI_MIN, ESTRIBO_S_MIN, sMax ?? espacamentoMaximoEstribo(d));

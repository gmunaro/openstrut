// Flexão composta reta e oblíqua de seção retangular com armadura em duas faces,
// como V1 PILCALC.BM: deformações pela regra dos pivôs (domínios 1 a 5, inclusive
// flexo-tração), concreto pela parábola-retângulo σcd e concreto descontado sob as
// barras comprimidas. A integração é a de secaoParabolaRetangulo.ts; aqui ficam a
// API de duas faces da V1, o índice da flexão oblíqua e os tipos comuns aos pilares.
// Não conhece γ: recebe as tensões de cálculo, para servir à NB-1/78 e à NBR 6118.
// Unidades: seção em cm, armaduras em cm², tensões em MPa, forças em kN
// (compressão > 0, tração < 0), momentos em kN·m em torno do centro geométrico.
import { type Camada, EPS_C2, momentoResistentePR, tensaoAco } from "./secaoParabolaRetangulo";

export { epsYd, tensaoAco } from "./secaoParabolaRetangulo";

/** Expoente da interação na flexão oblíqua: (Mxd/MRx)^α + (Myd/MRy)^α ≤ 1. */
export const ALFA_OBLIQUA = 1.2;

/** Classe do aço longitudinal na NB-1/78: A (laminado a quente, diagrama
 *  elastoplástico) ou B (encruado a frio). */
export type ClasseAco = "A" | "B";

export interface TensoesCalculo {
  /** Tensão máxima do concreto no diagrama (ex.: 0,85 fcd), MPa. */
  sigmaCd: number;
  fyd: number;
  /** Módulo de elasticidade do aço, MPa. */
  es: number;
  /** Diagrama do aço; ausente = classe A. B só existe na NB-1/78. */
  classe?: ClasseAco;
}

/** b = largura (paralela ao eixo de flexão), h = altura (na direção da flexão),
 *  dl = distância do centro das barras à face, todos em cm. */
export interface SecaoRetangular {
  b: number;
  h: number;
  dl: number;
}

/** MPa · cm² = 0,1 kN. */
const KN_POR_MPA_CM2 = 0.1;

/** Capacidade à compressão centrada (kN), 2‰ uniforme: σcd·(Ac − As) + As·σs(2‰)
 *  (V1 PcNmaxAxial#). Ac e As em cm². */
export function normalMaximaAxial(ac: number, asTotal: number, t: TensoesCalculo) {
  return (t.sigmaCd * (ac - asTotal) + asTotal * tensaoAco(EPS_C2, t)) * KN_POR_MPA_CM2;
}

/** Camadas de duas faces: as2 na face mais comprimida (y = dl), as1 na oposta. */
const duasFaces = (s: SecaoRetangular, as1: number, as2: number): Camada[] => [
  { as: as2, y: s.dl },
  { as: as1, y: s.h - s.dl },
];

/** Momento resistente (kN·m) da seção sob a normal nd (kN, tração < 0), ou null se
 *  nd passa da compressão centrada ou da tração com todas as barras em fyd
 *  (V1 PcMRparaN#). as1 = face menos comprimida, as2 = face mais comprimida. */
export function momentoResistente(
  nd: number,
  s: SecaoRetangular,
  as1: number,
  as2: number,
  t: TensoesCalculo,
) {
  return momentoResistentePR(nd, s, duasFaces(s, as1, as2), t);
}

/** Bissecção (50 passos) da menor armadura em [0, asMax] que satisfaz `atende`;
 *  null se nem asMax atende. */
function menorArmadura(asMax: number, atende: (as: number) => boolean) {
  if (!atende(asMax)) return null;
  let lo = 0;
  let hi = asMax;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (atende(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Menor armadura por face (cm², simétrica) com MR(nd) ≥ md (kN·m), ou null se
 *  nem asMaxFace basta (V1 PcAsMinCentrado#). Padrão da V1: 3% de b·h por face. */
export function armaduraSimetrica(
  nd: number,
  md: number,
  s: SecaoRetangular,
  t: TensoesCalculo,
  asMaxFace = 0.03 * s.b * s.h,
) {
  return menorArmadura(asMaxFace, (as) => (momentoResistente(nd, s, as, as, t) ?? -Infinity) >= md);
}

/** Índice da flexão oblíqua (Mxd/MRx)^1,2 + (Myd/MRy)^1,2 com asf por face nas duas
 *  direções; ≤ 1 = seção suficiente. mxd flete na altura s.h; myd na largura s.b
 *  (seção girada). Infinity se nd não cabe na seção (a V1 devolve 99).
 *  É estimativa (asf concentrada nas faces): o arranjo real se verifica depois. */
export function indiceObliquo(
  nd: number,
  mxd: number,
  myd: number,
  s: SecaoRetangular,
  asf: number,
  t: TensoesCalculo,
) {
  let indice = 0;
  if (mxd > 0) {
    const mrx = momentoResistente(nd, s, asf, asf, t);
    if (mrx === null || mrx <= 0) return Infinity;
    indice += (mxd / mrx) ** ALFA_OBLIQUA;
  }
  if (myd > 0) {
    const mry = momentoResistente(nd, { b: s.h, h: s.b, dl: s.dl }, asf, asf, t);
    if (mry === null || mry <= 0) return Infinity;
    indice += (myd / mry) ** ALFA_OBLIQUA;
  }
  return indice;
}

/** Menor armadura por face (cm²) com índice oblíquo ≤ 1, ou null se nem asMaxFace
 *  basta (V1 PcAsMinObliquo#). Estimativa com a mesma área por face nas duas direções. */
export function armaduraObliqua(
  nd: number,
  mxd: number,
  myd: number,
  s: SecaoRetangular,
  t: TensoesCalculo,
  asMaxFace = 0.03 * s.b * s.h,
) {
  return menorArmadura(asMaxFace, (as) => indiceObliquo(nd, mxd, myd, s, as, t) <= 1);
}

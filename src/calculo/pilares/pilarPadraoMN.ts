// Pilar-padrão acoplado a diagramas M, N, 1/r (NBR 6118:2023, 15.8.3.3.4) e fluência
// pela excentricidade adicional ecc (15.8.4), para pilares com 90 < λ ≤ 140.
// Independente de norma na mecânica: recebe as tensões de cálculo e reaproveita a
// integração da seção de secaoParabolaRetangulo.ts (parábola-retângulo, concreto
// descontado sob as barras comprimidas).
// Unidades: seção em cm, armaduras em cm², tensões em MPa, forças em kN (compressão
// > 0), momentos em kN·m, curvatura em 1/cm, le em m, excentricidades em m.
import type { SecaoRetangular, TensoesCalculo } from "./flexaoComposta";
import {
  type Camada,
  type Deformacao,
  EPS_C2,
  EPS_CU,
  EPS_SU,
  Y_PIVO_C,
  esforcosResistentes,
} from "./secaoParabolaRetangulo";

/** γf3 da formulação de segurança da não linearidade física (15.3.1). */
export const GAMA_F3 = 1.1;

/** Base da exponencial de ecc como impressa na norma (15.8.4). */
const BASE_FLUENCIA = 2.718;

/** MPa·cm² → kN. */
const KN_POR_MPA_CM2 = 0.1;

/** Tensões do diagrama M, N, 1/r: pico do concreto 0,85·fcd/γf3 (15.3.1); aço com fyd
 *  e Es. [VERIFICAR] A 15.3.1 também admite calcular os efeitos com as cargas
 *  divididas por γf3 e majorá-los depois; dividir só o concreto, com Nd inteiro, dá
 *  seção mais flexível, portanto curvatura maior (a favor da segurança). */
export const tensoesDiagramaMN = (t: TensoesCalculo): TensoesCalculo => ({
  ...t,
  sigmaCd: t.sigmaCd / GAMA_F3,
});

/** Deformação com ε0 no centro geométrico e curvatura κ (encurtamento do topo > 0). */
const deformacao = (eps0: number, kappa: number, h: number): Deformacao => ({
  topo: eps0 + (kappa * h) / 2,
  base: eps0 - (kappa * h) / 2,
});

/** Dentro dos domínios de 17.2.2: topo ≤ εcu, fibra a 3h/7 do topo ≤ εc2 (pivô C) e
 *  armadura mais tracionada (y = h − dl) com alongamento ≤ εsu. */
function admissivel(def: Deformacao, s: SecaoRetangular) {
  const tol = 1e-9;
  const eps = (y: number) => def.topo + ((def.base - def.topo) * y) / s.h;
  return (
    def.topo <= EPS_CU + tol &&
    eps(Y_PIVO_C * s.h) <= EPS_C2 + tol &&
    eps(s.h - s.dl) >= -EPS_SU - tol
  );
}

/** ε0 (bissecção) com N interno = n para a curvatura κ; null se n está fora do
 *  alcance da seção. N cresce com ε0 (σc e σs não decrescem com ε). */
function eps0ParaN(
  n: number,
  kappa: number,
  s: SecaoRetangular,
  camadas: readonly Camada[],
  t: TensoesCalculo,
) {
  const nDe = (e0: number) => esforcosResistentes(deformacao(e0, kappa, s.h), s, camadas, t).n;
  let lo = -0.05;
  let hi = 0.05;
  if (nDe(hi) < n || nDe(lo) > n) return null;
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2;
    if (nDe(mid) < n) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Ponto do diagrama M, N, 1/r de 15.3.1 (concreto com pico 0,85·fcd/γf3): momento
 * interno (kN·m) da seção com normal n (kN) e curvatura κ (1/cm), e se a deformação
 * está dentro dos domínios. null se a seção não alcança n.
 */
export function momentoCurvatura(
  n: number,
  kappa: number,
  s: SecaoRetangular,
  camadas: readonly Camada[],
  t: TensoesCalculo,
) {
  const td = tensoesDiagramaMN(t);
  const e0 = eps0ParaN(n, kappa, s, camadas, td);
  if (e0 === null) return null;
  const def = deformacao(e0, kappa, s.h);
  return { m: esforcosResistentes(def, s, camadas, td).m, admissivel: admissivel(def, s) };
}

export interface PilarPadraoMN {
  /** Momento total na seção crítica, kN·m. */
  mTot: number;
  /** Curvatura da seção crítica no equilíbrio, 1/cm. */
  curvatura: number;
  /** M2d = Nd·(1/r)·le²/10, kN·m. */
  m2: number;
}

/** Passos das buscas por bissecção e seção áurea na curvatura. */
const PASSOS = 40;
/** Pontos da varredura inicial da curvatura em [0, (1/r)u]. */
const PONTOS = 16;

/**
 * Pilar-padrão acoplado ao diagrama M, N, 1/r (15.8.3.3.4): Md,tot = m1 + Nd·(1/r)·le²/10,
 * com 1/r tirada do diagrama para (Nd, Md,tot). m1 = momento de 1ª ordem da seção
 * crítica (αb·M1d,A ou o mínimo, já com Nd·ecc), kN·m; le em m.
 * O equilíbrio é a menor curvatura com f(1/r) = M(1/r) − Nd·(1/r)·le²/10 = m1, onde
 * M(1/r) é o momento interno do diagrama: é o limite da iteração Md → m1 + Nd·(1/r)(Md)·le²/10
 * partindo de m1 (ramo estável), achado por varredura e bissecção em vez de ponto fixo,
 * que converge devagar perto da instabilidade. Se f não alcança m1 antes da curvatura
 * última da seção (limite dos domínios), não há equilíbrio: null.
 */
export function momentoTotalMN(
  nd: number,
  m1: number,
  le: number,
  s: SecaoRetangular,
  camadas: readonly Camada[],
  t: TensoesCalculo,
): PilarPadraoMN | null {
  // M2d (kN·m) = c·(1/r), com le em cm e 1/r em 1/cm.
  const c = (nd * (le * 100) ** 2) / 10 / 100;
  const ponto = (k: number) => momentoCurvatura(nd, k, s, camadas, t);
  const inicial = ponto(0);
  if (inicial === null || !inicial.admissivel) return null;
  if (m1 <= 0) return { mTot: inicial.m, curvatura: 0, m2: 0 };
  // Curvatura última (1/r)u: a maior admissível com N = nd.
  let lo = 0;
  let hi = (EPS_CU + EPS_SU) / (s.h - s.dl);
  for (let i = 0; i < PASSOS; i++) {
    const mid = (lo + hi) / 2;
    if (ponto(mid)?.admissivel) lo = mid;
    else hi = mid;
  }
  const ku = lo;
  const f = (k: number) => (ponto(k)?.m ?? -Infinity) - c * k;
  // Primeira curvatura da varredura com f ≥ m1; sem ela, refina o máximo de f.
  let kA = 0;
  let kB = NaN;
  let melhor = 0;
  let fMelhor = f(0);
  for (let i = 1; i <= PONTOS; i++) {
    const k = (ku * i) / PONTOS;
    const fk = f(k);
    if (fk >= m1) {
      kA = (ku * (i - 1)) / PONTOS;
      kB = k;
      break;
    }
    if (fk > fMelhor) {
      melhor = i;
      fMelhor = fk;
    }
  }
  if (Number.isNaN(kB)) {
    // Seção áurea em torno do melhor ponto (f côncava na prática).
    let a = (ku * Math.max(0, melhor - 1)) / PONTOS;
    let b = (ku * Math.min(PONTOS, melhor + 1)) / PONTOS;
    const r = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < PASSOS; i++) {
      const x1 = b - r * (b - a);
      const x2 = a + r * (b - a);
      if (f(x1) < f(x2)) a = x1;
      else b = x2;
    }
    const kMax = (a + b) / 2;
    if (f(kMax) < m1) return null;
    kA = (ku * Math.max(0, melhor - 1)) / PONTOS;
    kB = kMax;
  }
  for (let i = 0; i < PASSOS; i++) {
    const mid = (kA + kB) / 2;
    if (f(mid) >= m1) kB = mid;
    else kA = mid;
  }
  return { mTot: m1 + c * kB, curvatura: kB, m2: c * kB };
}

/** Bissecção (40 passos) da menor armadura por face em [0, asMax] que satisfaz
 *  `atende` (monótona: mais aço não piora); null se nem asMax atende. */
export function menorArmaduraMN(asMax: number, atende: (as: number) => boolean) {
  if (!atende(asMax)) return null;
  let lo = 0;
  let hi = asMax;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (atende(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Excentricidade acidental ea = θ1·le/2, θ1 = 1/(100·√H) ≥ 1/300 (11.3.3.4.2), em m;
 *  le e H em m. Sem o teto θ1 ≤ 1/200 de 11.3.3.4.1, como Bastos (Pilares, exemplo
 *  13.1.1: θ1 = 0,00598 > 1/200 com H = 2,8 m, ea = 0,84 cm); maior ea, a favor da
 *  segurança. [VERIFICAR] A entrada não tem a altura H do lance; usa-se H = le. */
export const excentricidadeAcidental = (le: number) =>
  (Math.max(1 / 300, 1 / (100 * Math.sqrt(le))) * le) / 2;

/** Ne = 10·Eci·Ic/le² (15.8.4), kN; Eci em MPa, Ic em cm⁴, le em m. */
export const forcaNe = (eci: number, ic: number, le: number) =>
  (10 * eci * KN_POR_MPA_CM2 * ic) / (le * 100) ** 2;

/** ecc = (Msg/Nsg + ea)·(2,718^(φ·Nsg/(Ne − Nsg)) − 1) (15.8.4), em m; msg em kN·m,
 *  nsg e ne em kN, ea em m. null se Nsg ≥ Ne (a fluência leva à instabilidade). */
export function excentricidadeFluencia(
  msg: number,
  nsg: number,
  ea: number,
  phi: number,
  ne: number,
) {
  if (nsg >= ne) return null;
  return (msg / nsg + ea) * (BASE_FLUENCIA ** ((phi * nsg) / (ne - nsg)) - 1);
}

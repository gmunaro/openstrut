// Esforços atuantes do pilar no SISTRUT: esbeltez inteira, casos de
// excentricidade acidental, parcela acidental com CLNG, fluência e momento total.
// Ações CARACTERÍSTICAS: Nk e Mk não são majorados (P1; U49-018).
//
// Fonte: PILAR.BAS:4678-4979 (casos e L_32225) e 5601-5672 (λ, L_37269);
// PILAREDI.BAS:4854-5051 (L_477c8). Livro: livros_viga_pilar.md 2.3-2.6.
import { qbCint, qbClng } from "../base/f32";
import type { SituacaoPilar } from "../base/tipos";
import { type Contexto, type Estado, posiciona, raiz } from "./secao";

/** λ = CINT(L/√(J/A)·100), L em m e raio de giração em cm; inteiro arredondado ao
 *  par, que entra em todos os testes (PILAR.BAS:5631-5632; PILAREDI.BAS:5458-5459;
 *  P2, U49-005). Caso c: 3/√(13333,33/400)·100 = 51,96 → 52. Área negativa
 *  (poligonal anti-horária) dá NaN → −32768, como o FISTP (D-6). */
export function esbeltez(l: number, j: number, area: number) {
  return qbCint((l / raiz(j / area)) * 100);
}

/** Sinal da excentricidade acidental de um caso, por direção (S(k,1), S(k,2)). */
export interface SinaisCaso {
  x: number;
  y: number;
}

/** Casos de excentricidade acidental (PILAR.BAS:4678-4762; PILAREDI.BAS:4854-4950;
 *  livros_viga_pilar.md 2.4). Isoladas: ea numa direção por caso, 4 casos sem
 *  momento inicial (2 se a seção for retangular ou circular e simétrica), 3 (2) com
 *  um momento e 2 com os dois. Simultâneas: as combinações ±/±. */
export function casosExcentricidade(
  mxk: number,
  myk: number,
  simetrica: boolean,
  modo: "isoladas" | "simultaneas",
): SinaisCaso[] {
  const c = (x: number, y: number) => ({ x, y });
  const corta = (casos: SinaisCaso[], n: number) => casos.slice(0, simetrica ? n : casos.length);
  if (modo === "isoladas") {
    if (mxk === 0 && myk === 0) return corta([c(1, 0), c(0, 1), c(-1, 0), c(0, -1)], 2);
    if (myk !== 0 && mxk === 0) return corta([c(0, 1), c(1, 0), c(-1, 0)], 2);
    if (myk === 0 && mxk !== 0) return corta([c(1, 0), c(0, 1), c(0, -1)], 2);
    return [c(1, 0), c(0, 1)];
  }
  if (mxk === 0 && myk === 0) return corta([c(1, 1), c(1, -1), c(-1, 1), c(-1, -1)], 1);
  if (myk !== 0 && mxk === 0) return corta([c(1, 1), c(-1, 1)], 1);
  if (myk === 0 && mxk !== 0) return corta([c(1, 1), c(1, -1)], 1);
  return [c(1, 1)];
}

/** Rótulo pelos momentos INICIAIS, sem ea; não muda o cálculo (PILAR.BAS:4769-4800, P4). */
export function situacaoPilar(nk: number, mxk: number, myk: number): SituacaoPilar {
  if (nk < 0) return "Flexo Tracao";
  if (mxk === 0 && myk === 0) return "Compressao Centrada";
  if (mxk !== 0 && myk !== 0) return "Flexao Obliqua";
  return "Flexo Compressao";
}

/** Dados de uma direção para a parcela acidental e a fluência. */
export interface DirecaoAtuante {
  /** Momento inicial, tm. */
  mk: number;
  /** Sinal do caso (±1 ou 0). */
  sinal: number;
  lambda: number;
  /** Comprimento de flambagem, m, e inércia que flamba nessa direção, cm⁴. */
  le: number;
  j: number;
}

/** Parâmetros da excentricidade acidental e da fluência (PILAR.INI). */
export interface ParametrosAtuante {
  /** ea mínima, cm; h/30 ligado (V_0e52, V_0e56$). */
  excentricidadeMinima: number;
  verificaH30: boolean;
  /** φ, λ da fluência e fatores 0,95 e 1,1 (V_0e42, V_0e76, V_0e4a, V_0e4e). */
  coeficienteFluencia: number;
  lambdaFluencia: number;
  fatorNkFluencia: number;
  fatorCargaFluencia: number;
  /** Ec = √(fck·1000 + 35)·0,9·21, t/cm² (V_118e, PILAR.BAS:5633). */
  ec: number;
}

/** Momento numa direção: inicial + acidental + fluência, tm (PILAR.BAS:4803-4823 e
 *  4890-4910). Gira a seção a θ (270/90 para x, 0/180 para y) para achar a altura h;
 *  ea = max(emin/100, h/3000) m; Ma = sinal·CLNG(100·ea·Nk)/100. Fluência só com
 *  φ > 0, Ma ≠ 0 e λ > 80: Mc = (Mk + Ma)·e^(X − 1) no original (D-1, U49-004) e
 *  (Mk + Ma)·(e^X − 1) no corrigido, X = φ·Ng/(Ne − Ng), Ng = 0,95·1,1·|Nk|. */
export function momentoDirecao(
  ctx: Contexto,
  est: Estado,
  theta: number,
  nk: number,
  dir: DirecaoAtuante,
  par: ParametrosAtuante,
) {
  const { s, k } = ctx;
  posiciona(ctx, est, theta);
  const eMin = s(par.excentricidadeMinima / 100);
  const eH = s(par.verificaH30 ? est.altura / 3000 : 0);
  const ea = eMin > eH ? eMin : eH;
  let ma = s((dir.sinal * qbClng(100 * ea * nk)) / 100);
  if (dir.mk !== 0) ma = s(Math.sign(dir.mk) * ma);
  let mc = 0;
  if (par.coeficienteFluencia > 0 && ma !== 0 && dir.lambda > par.lambdaFluencia) {
    const ne = s((k.pi ** 2 / (dir.le * 100) ** 2) * par.ec * dir.j);
    const x =
      (Math.abs(nk) / (ne - Math.abs(nk) * par.fatorCargaFluencia * par.fatorNkFluencia)) *
      par.coeficienteFluencia *
      par.fatorNkFluencia *
      par.fatorCargaFluencia;
    mc =
      ctx.modo === "original" ? s((dir.mk + ma) * k.e ** (x - 1)) : (dir.mk + ma) * Math.expm1(x);
    mc = s(qbClng(mc * 100) / 100);
  }
  return { ma, mc, total: s(dir.mk + ma + mc) };
}

/** Momento total CLNG(100·√(Mx² + My²))/100 e o ângulo do vetor (graus, por
 *  quadrante; 90 com Mx = 0) (PILAR.BAS:4978-4999; PILAREDI.BAS:5024-5051). */
export function momentoTotal(ctx: Contexto, mx: number, my: number) {
  const { s, k } = ctx;
  let mtot = s(Math.sqrt(mx ** 2 + my ** 2));
  mtot = s(qbClng(100 * mtot) / 100);
  const graus = (r: number) => (r * 180) / k.pi;
  let angulo: number;
  if (mx >= 0) {
    if (my >= 0) angulo = mx === 0 ? 90 : s(graus(Math.atan(my / mx)));
    else angulo = s(graus(Math.atan(mx / -my)) + 270);
  } else if (my >= 0) angulo = s(180 - graus(Math.atan(my / -mx)));
  else angulo = s(graus(Math.atan(my / mx)) + 180);
  return { mtot, angulo };
}

// Flexão do DESDIM (F_183a8, DESDIM.BAS:3677-3758): seção retangular ou T, armadura
// simples ou dupla com d' = h − d, ξlim truncado em 3 casas e diagrama σ×ε do aço
// classe A ou B. Unidades do original: cm, t/cm², M em t·cm. Livros: U03-042..045
// (livros_arm_forma_des.md 4.3); PLANO D1, R8.
import { atribuicao, qbInt } from "../base/f32";
import type { MateriaisSistrut, ModoSistrut } from "../base/tipos";

/** Seção de cálculo: bw, h, mesa bf/hf (0 = sem mesa) e altura útil d, cm. */
export interface SecaoCalculo {
  bw: number;
  h: number;
  bf: number;
  hf: number;
  d: number;
}

export interface ResultadoFlexao {
  /** x/d (ξ). Na armadura dupla, ξlim. */
  xd: number;
  /** Armadura tracionada e comprimida, cm². */
  as: number;
  asc: number;
  /** Momento acima de 1,4 × o limite da armadura simples (aviso "M", DESDIM.BAS:3712). */
  acimaDoLimite: boolean;
  /** A curva do aço B não teve solução (σs = −1, DESDIM.BAS:3753). */
  tensaoInvalida: boolean;
  ramo: "alma" | "mesa" | "dupla";
}

/** ξlim = INT(1000 / ((fyd/Es‰ + 2 no aço B)/3,5 + 1))/1000 (DESDIM.BAS:3678; U03-044):
 *  fyk/(2,1·γs) é εyd em ‰ com Es = 2100 t/cm². CA-50 B: 0,462. */
export function xiLimite(materiais: MateriaisSistrut, multiplicador: number, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const extraB = materiais.classeAco === "B" ? 2 : 0;
  return s(
    qbInt(
      1000 / (((materiais.fyk / (s(2.1) * materiais.gamaS)) * multiplicador + extraB) / 3.5 + 1),
    ) / 1000,
  );
}

/** σs (t/cm²) para a deformação ε (L_18c00, DESDIM.BAS:3733-3758; U03-045). Aço A:
 *  elástico até εyd, depois fyd. Aço B: elástico até 0,7·fyd/Es, curva
 *  ε = σ/Es + (σ/fyd − 0,7)²/45 até εyd + 2 ‰, depois fyd; −1 se a curva não tem raiz.
 *  O original divide o trecho elástico por γs (σ = ε·2100/γs: salto em εyd). Modo
 *  corrigido: R8, σs = Es·ε. */
export function tensaoAco(
  eps: number,
  materiais: MateriaisSistrut,
  multiplicador: number,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const { fyk, gamaS } = materiais;
  const elastico = () => (modo === "original" ? s((eps * 2100) / gamaS) : s(eps * 2100));
  if (materiais.classeAco === "A") {
    let sigma = elastico();
    if ((fyk / (gamaS * 2100)) * multiplicador < eps) sigma = s((fyk * multiplicador) / gamaS);
    return sigma;
  }
  if ((s(1 / 3000) * multiplicador * fyk) / gamaS >= eps) return elastico();
  if ((fyk / (gamaS * 2100)) * multiplicador + s(0.002) < eps)
    return s((fyk * multiplicador) / gamaS);
  const fyd = (multiplicador * fyk) / gamaS;
  // 0,03111111 (≈ 1,4/45) é o literal do .BAS; 1/2100, 4/45 e 1/3000 dão os mesmos SINGLE.
  const c14 = modo === "original" ? s(0.03111111) : 1.4 / 45;
  let u = s(s(1 / 2100) - (c14 / (fyk * multiplicador)) * gamaS);
  const k = ((s(0.7) ** 2 / 45 - eps) / fyd ** 2) * s(4 / 45);
  if (k > u ** 2) return -1;
  u = s(-u + Math.sqrt(u ** 2 - k));
  return s((fyd ** 2 * u * 45) / 2);
}

/** Armadura de flexão para o momento m (t·cm, já multiplicado pelos coeficientes de
 *  unidade) na seção (L_183ad, DESDIM.BAS:3677-3732; U03-042..045). Ramos:
 *  - acima do momento limite (retangular ou T): armadura dupla com x = ξlim·d;
 *  - seção T com m ≤ momento da mesa: retangular de largura bf;
 *  - senão: linha neutra na alma (ou retangular), equação do 2º grau em ξ. */
export function flexaoSecao(
  m: number,
  secao: SecaoCalculo,
  materiais: MateriaisSistrut,
  multiplicador: number,
  modo: ModoSistrut,
): ResultadoFlexao {
  const s = atribuicao(modo);
  const { bw: b, h, bf, hf, d } = secao;
  const { fck, fyk, gamaF, gamaC, gamaS } = materiais;
  const mult = multiplicador;
  const xi = xiLimite(materiais, mult, modo);
  const asLimiteRet = s((gamaS / (mult * fyk * gamaC)) * mult * fck * b * d * xi * s(0.68));
  const mLimiteRet = s(
    ((d ** 2 * (1 - s(0.4) * xi)) / (gamaC * gamaF)) * b * s(0.85) * mult * fck * s(0.8) * xi,
  );
  const asLimiteT = s(
    ((b * s(0.8) * xi * d + (bf - b) * hf) / (gamaC * mult * fyk)) * s(0.85) * mult * fck * gamaS,
  );
  const mLimiteT = s(
    ((d ** 2 * (1 - s(0.4) * xi) * b * s(0.8) * xi + (bf - b) * (d - hf / 2) * hf) /
      (gamaC * gamaF)) *
      s(0.85) *
      mult *
      fck,
  );
  const mMesa = s(((d - hf / 2) / (gamaC * gamaF)) * s(0.85) * mult * fck * bf * hf);
  const temMesa = bf * hf !== 0;

  // Raiz menor de a·ξ² + b·ξ + c = 0 (DESDIM.BAS:3697, 3706).
  const raiz = (a: number, bq: number, c: number) =>
    s((-bq - Math.sqrt(bq ** 2 - 4 * a * c)) / (2 * a));

  if ((m > mLimiteT && temMesa) || (m > mLimiteRet && !temMesa)) {
    // Armadura dupla (L_189d6, DESDIM.BAS:3711-3732; U03-043).
    const acimaDoLimite =
      (s(1.4) * mLimiteRet < m && !temMesa) || (s(1.4) * mLimiteT < m && temMesa);
    let as = temMesa ? asLimiteT : asLimiteRet;
    const dm = s(m - (temMesa ? mLimiteT : mLimiteRet));
    const eps = s(s(0.0035) / xi - s(0.0035));
    const sigma = tensaoAco(eps, materiais, mult, modo);
    as = s((gamaF / ((2 * d - h) * sigma)) * dm + as);
    const epsC = s((((1 + xi) * d - h) / (xi * d)) * s(0.0035));
    const sigmaC = tensaoAco(epsC, materiais, mult, modo);
    const asc = s((gamaF / ((2 * d - h) * sigmaC)) * dm);
    return {
      xd: xi,
      as,
      asc,
      acimaDoLimite,
      tensaoInvalida: sigma === -1 || sigmaC === -1,
      ramo: "dupla",
    };
  }
  if (m <= mMesa && temMesa) {
    // Linha neutra na mesa: retangular de largura bf (L_18886, DESDIM.BAS:3702-3710).
    const a = s((d ** 2 * bf * s(0.68) * mult * fck * s(0.4)) / gamaC);
    const bq = s(-((d ** 2 * bf * s(0.68) * mult * fck) / gamaC));
    const c = s(gamaF * m);
    const x = raiz(a, bq, c);
    const as = s((s(0.85) / (mult * fyk * gamaC)) * mult * fck * bf * s(0.8) * x * d * gamaS);
    return { xd: x, as, asc: 0, acimaDoLimite: false, tensaoInvalida: false, ramo: "mesa" };
  }
  // Linha neutra na alma ou seção retangular (L_186eb, DESDIM.BAS:3693-3701).
  const a = s((d ** 2 * b * s(0.68) * mult * fck * s(0.4)) / gamaC);
  const bq = s(-((d ** 2 * b * s(0.68) * mult * fck) / gamaC));
  const c = s(-(((bf - b) * (d - hf / 2) * s(0.85) * mult * fck * hf) / gamaC) + gamaF * m);
  const x = raiz(a, bq, c);
  const as = s(
    (((bf - b) * hf + b * s(0.8) * x * d) / (mult * fyk * gamaC)) * s(0.85) * mult * fck * gamaS,
  );
  return { xd: x, as, asc: 0, acimaDoLimite: false, tensaoInvalida: false, ramo: "alma" };
}

/** Taxa da armadura mínima de flexão (DESDIM.BAS:2849, 2958; DESENHO.BAS:4820; U03-012,
 *  U03-013): a do .DSP (0,0015) para qualquer aço. Modo corrigido: item H, 0,25 % com
 *  CA-25 (fyk < 3 t/cm²; o CA-25 é 2,5 t/cm² no original e 2,549 no SI redondo). */
export function taxaArmaduraMinima(
  taxaDsp: number,
  materiais: MateriaisSistrut,
  modo: ModoSistrut,
) {
  if (modo === "corrigido" && materiais.fyk < 3) return Math.max(taxaDsp, 0.0025);
  return taxaDsp;
}

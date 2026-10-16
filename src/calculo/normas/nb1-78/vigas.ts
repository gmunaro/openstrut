// Dimensionamento de vigas pela NB-1/78, como na V1: flexão simples com
// diagrama retangular (0,85 fcd em 0,8 x), armadura dupla acima de x/d
// limite e estribos verticais (CALCCA.BM, ARMCALC.BM, VIGCALC.BM).
// Contas internas em kN, cm e kN/cm² (1 MPa = 0,1 kN/cm²). A V1 trabalha em
// tf/cm², mas as fórmulas são homogêneas e as constantes com unidade
// (τwu ≤ 4,5 MPa, τc = ψ1·√fck com fck em MPa) foram convertidas sem mudar valor.
import { num, numAte } from "../../texto";
import { espacamentoMaximoEstribo } from "../../barras";
import { type ClasseAco, epsYd, tensaoAco } from "../../pilares/flexaoComposta";
import type { CortanteResultado, Etapa, FlexaoResultado, MateriaisCalc } from "../../tipos";

const CALCCA = "V1 CALCCA.BM";
const ARMCALC = "V1 ARMCALC.BM";
const VIGCALC = "V1 VIGCALC.BM";

/** Encurtamento último do concreto na flexão (V1 CcaXdLim). */
const EPS_CU = 0.0035;
/** Distância da armadura comprimida à face, cm (V1 ARMADURA.BAS ARM_DL = DESDIM.BAS DIM_DL). */
export const D_LINHA = 3.5;
/** Taxas mínimas usadas pela V1 em vigas (VcDimensiona): As,min = 0,15 % bw·h e
 *  ρw,min = 0,14 % bw (por metro) para CA-50 e CA-60 (V1 CcaRhoWMin#). */
export const TAXA_AS_MIN = 0.0015;
export const TAXA_ASW_MIN = 0.0014;
/** ρw,min = 0,25 % para estribos de CA-25 (V1 CcaRhoWMin#: fyk < 450 MPa). A V1 marca
 *  como RECONSTRUCAO (texto da NB-1/78 não conferido); valor maior, a favor da segurança. */
export const TAXA_ASW_MIN_CA25 = 0.0025;
const taxaAswMin = (aco: MateriaisCalc["acoEstribo"]) =>
  aco === "CA-25" ? TAXA_ASW_MIN_CA25 : TAXA_ASW_MIN;
/** As + As' ≤ 4 % de Ac (V1 ArmAsMax#; RECONSTRUCAO: NB-1/78 6.3.1.1 não conferido). */
export const TAXA_AS_MAX = 0.04;
/** As,min = 0,25 % bw·h para CA-25 (e CA-30) no modo "corrigido". Fonte secundária:
 *  Silva e Araújo, "Estudo das taxas mínimas de armadura de tração em vigas...",
 *  Revista Essentia (Sobral) v. 16, 2015, citando a NB-1/1978 (0,25 % para CA-25 e
 *  CA-30; 0,15 % para CA-40, CA-50 e CA-60); docs/norma/pendencias.md item 7.
 *  [VERIFICAR] texto da norma não lido. */
export const TAXA_AS_MIN_CA25 = 0.0025;
/** Taxa de As,min de viga: 0,25 % com CA-25 e 0,15 % com CA-50 e CA-60
 *  (TAXA_AS_MIN_CA25). A regra do SISTRUT (0,15 % do .DSP para qualquer aço) está no
 *  DESDIM (`sistrut/vigas/desdim-flexao.ts`, item H de docs/MODO-CALCULO.md). */
export const taxaAsMinNb178 = (mat: Pick<MateriaisCalc, "aco">) =>
  mat.aco === "CA-25" ? TAXA_AS_MIN_CA25 : TAXA_AS_MIN;
/** Teto de τwu, MPa (V1 CcaAswEstriboRho). */
const TAU_WU_MAX = 4.5;

const kNcm2 = (mpa: number) => mpa / 10;

/** Tensões do aço no formato do núcleo comum (pilares/flexaoComposta). */
const tensoes = (mat: MateriaisCalc, classe: ClasseAco) => ({
  sigmaCd: mat.sigmaCd,
  fyd: mat.fyd,
  es: mat.es,
  classe,
});

/** x/d limite entre os domínios 3 e 4: εcu / (εcu + εyd), εyd = fyd/Es (classe A) ou
 *  fyd/Es + 2‰ (classe B) (V1 CcaXdLim#). CA-50: 0,628 (A) e 0,462 (B). */
export const xdLimiteNb178 = (mat: MateriaisCalc, classe: ClasseAco = "A") =>
  EPS_CU / (EPS_CU + epsYd(tensoes(mat, classe)));

/** Momento resistente de cálculo sem armadura de compressão, kN·m (V1 CcaMdLim). bw e d em cm. */
export function momentoLimiteNb178(
  bw: number,
  d: number,
  mat: MateriaisCalc,
  classe: ClasseAco = "A",
) {
  const x = xdLimiteNb178(mat, classe) * d;
  return (0.85 * kNcm2(mat.fcd) * bw * 0.8 * x * (d - 0.4 * x)) / 100;
}

/**
 * Armadura de flexão de seção retangular (Vigas: Norma.vigaFlexao). `md` em
 * kN·m (já majorado; o sinal é ignorado), bw, h e d em cm. Até o Md limite é
 * armadura simples (V1 CcaAsFlexao); acima, armadura dupla com d' = 3,5 cm
 * (V1 ArmAsDupla) e a comprimida com σ's pela compatibilidade de deformações,
 * ε's = 0,0035 (x_lim − d')/x_lim, σ's do diagrama da classe do aço (V1 ArmAsLinha).
 * `classe` = classe do aço (B: diagrama curvo e x/d limite menor, V1 CcaAcoClasse%).
 * A tracionada respeita As,min = taxaAsMinNb178 · bw·h (0,15 %; 0,25 % com CA-25 no
 * modo "corrigido"). Sem solução
 * (d ≤ d' com armadura dupla, ou As + As' > 4 % Ac) devolve NaN nas áreas e um aviso.
 */
export function vigaFlexaoNb178(
  md: number,
  bw: number,
  h: number,
  d: number,
  mat: MateriaisCalc,
  classe: ClasseAco = "A",
): FlexaoResultado {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const m = Math.abs(md) * 100; // kN·cm
  const fcd = kNcm2(mat.fcd);
  const fyd = kNcm2(mat.fyd);
  const t = tensoes(mat, classe);
  const xdLim = xdLimiteNb178(mat, classe);
  const mdLim = momentoLimiteNb178(bw, d, mat, classe) * 100;
  const taxaMin = taxaAsMinNb178(mat);
  const asMin = taxaMin * bw * h;
  memoria.push(
    { descricao: "Momento de cálculo", valor: Math.abs(md), unidade: "kN·m" },
    {
      descricao: "x/d limite (domínios 3/4)",
      formula:
        classe === "B"
          ? "0,0035 / (0,0035 + fyd/Es + 0,002), aço classe B"
          : "0,0035 / (0,0035 + fyd/Es)",
      valor: xdLim,
      ref: CALCCA,
    },
    {
      descricao: "Momento limite sem armadura de compressão",
      formula: "0,85 fcd · bw · 0,8 x_lim · (d − 0,4 x_lim)",
      valor: mdLim / 100,
      unidade: "kN·m",
      ref: CALCCA,
    },
  );
  if (m === 0) {
    memoria.push({ descricao: "Momento nulo: sem armadura", valor: 0, unidade: "cm²" });
    return { as: 0, asComprimida: 0, xd: 0, avisos, memoria };
  }

  let as: number;
  let asComprimida = 0;
  let xd: number;
  // mesma folga da V1 (ArmAsDupla) para o caso exatamente no limite
  if (m <= mdLim * (1 - 1e-9)) {
    const r = m / (0.425 * bw * d * d * fcd);
    const x = 1.25 * d * (1 - Math.sqrt(1 - r));
    xd = x / d;
    // σs do diagrama da classe com εs = 0,0035 (d − x)/x; dentro do x/d limite é fyd
    const sigmaS = kNcm2(tensaoAco((EPS_CU * (d - x)) / x, t));
    as = m / (sigmaS * (d - 0.4 * x));
    memoria.push(
      {
        descricao: "Linha neutra",
        formula: "x = 1,25 d (1 − √(1 − Md / (0,425 bw d² fcd)))",
        valor: x,
        unidade: "cm",
        ref: CALCCA,
      },
      {
        descricao: "Armadura tracionada (simples)",
        formula: "As = Md / (σs (d − 0,4 x)), σs = fyd dentro do x/d limite",
        valor: as,
        unidade: "cm²",
        ref: CALCCA,
      },
    );
  } else {
    xd = xdLim;
    if (d <= D_LINHA) {
      avisos.push(
        `Md acima do limite e d = ${numAte(d, 2)} cm ≤ d' = ${numAte(D_LINHA, 2)} cm: sem solução, aumente a seção.`,
      );
      return { as: Number.NaN, asComprimida: Number.NaN, xd, avisos, memoria };
    }
    const xl = xdLim * d;
    const as1 = mdLim / (fyd * (d - 0.4 * xl));
    const as2 = (m - mdLim) / (fyd * (d - D_LINHA));
    // tensão na comprimida pela compatibilidade com εcu na face (V1 ArmAsLinha), pelo
    // diagrama da classe: com d' grande diante de x_lim (ex.: CA-60 e d pequeno) ou
    // aço classe B, ε's < εyd e σ's < fyd
    const epsLinha = (EPS_CU * (xl - D_LINHA)) / xl;
    const sigmaLinha = kNcm2(tensaoAco(epsLinha, t));
    if (sigmaLinha <= 0) {
      avisos.push(
        `Md acima do limite e d' = ${numAte(D_LINHA, 2)} cm ≥ x_lim = ${num(xl, 2)} cm: a armadura de compressão ficaria tracionada; aumente a seção.`,
      );
      return { as: Number.NaN, asComprimida: Number.NaN, xd, avisos, memoria };
    }
    asComprimida = (m - mdLim) / (sigmaLinha * (d - D_LINHA));
    as = as1 + as2;
    const asMax = TAXA_AS_MAX * bw * h;
    if (as + asComprimida > asMax) {
      avisos.push(
        `Armadura dupla As + As' = ${num(as + asComprimida, 2)} cm² > 4 % Ac = ${num(asMax, 2)} cm²: seção insuficiente, aumente a seção.`,
      );
      return { as: Number.NaN, asComprimida: Number.NaN, xd, avisos, memoria };
    }
    avisos.push(
      `x/d passaria do limite ${num(xdLim, 3)}: armadura dupla (As' = ${num(asComprimida, 2)} cm²).`,
    );
    memoria.push(
      {
        descricao: "Deformação na armadura comprimida",
        formula: "ε's = 0,0035 (x_lim − d') / x_lim",
        valor: epsLinha * 1000,
        unidade: "‰",
        ref: ARMCALC,
      },
      {
        descricao: "Tensão na armadura comprimida",
        formula: classe === "B" ? "σ's pelo diagrama do aço classe B" : "σ's = Es ε's ≤ fyd",
        valor: sigmaLinha * 10,
        unidade: "MPa",
        ref: ARMCALC,
      },
      {
        descricao: "Armadura comprimida",
        formula: "As' = (Md − Md,lim) / (σ's (d − d'))",
        valor: asComprimida,
        unidade: "cm²",
        ref: ARMCALC,
      },
      {
        descricao: "Armadura tracionada (dupla)",
        formula: "As = Md,lim / (fyd (d − 0,4 x_lim)) + (Md − Md,lim) / (fyd (d − d'))",
        valor: as,
        unidade: "cm²",
        ref: ARMCALC,
      },
    );
  }
  if (as < asMin) {
    memoria.push({
      descricao: "Armadura mínima prevalece",
      formula: `As,min = ${taxaMin === TAXA_AS_MIN ? "0,0015" : "0,0025 (CA-25)"} · bw · h`,
      valor: asMin,
      unidade: "cm²",
      ref: "NB-1/78 segundo Silva e Araújo, Essentia 2015 (0,25 % CA-25/30; 0,15 % CA-40/50/60) [VERIFICAR]",
    });
    as = asMin;
  }
  return { as, asComprimida, xd, avisos, memoria };
}

/**
 * Estribos verticais (Vigas: Norma.vigaCortante). `vd` em kN (já majorado),
 * bw e d em cm, `asl` = armadura longitudinal tracionada na seção, cm².
 * τwd = Vd/(bw d); τwu = min(0,25 fcd; 4,5 MPa); τc = ψ1·√fck, ψ1 = 0,07 +
 * 5 ρ1 ≤ 0,14; τd = 1,15 τwd − τc; Asw = τd·bw/fywd (V1 CcaAswEstriboRho),
 * com Asw,min = ρw,min bw, ρw,min = 0,14 % (0,25 % com estribos de CA-25; V1 CcaRhoWMin#),
 * e smáx = min(0,5 d; 30 cm) (V1 VcDimensiona). Com a biela esmagada devolve
 * bielaOk = false e um aviso; o Asw calculado continua no resultado.
 */
export function vigaCortanteNb178(
  vd: number,
  bw: number,
  d: number,
  asl: number,
  mat: MateriaisCalc,
): CortanteResultado {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const twd = Math.abs(vd) / (bw * d);
  const twu = Math.min(0.25 * kNcm2(mat.fcd), kNcm2(TAU_WU_MAX));
  const bielaOk = twd <= twu;
  const rho1 = asl / (bw * d);
  const psi1 = Math.min(0.07 + 5 * rho1, 0.14);
  const tc = psi1 * kNcm2(Math.sqrt(mat.fck));
  const td = Math.max(1.15 * twd - tc, 0);
  const aswCalc = ((td * bw) / kNcm2(mat.fywd)) * 100;
  const rhoWMin = taxaAswMin(mat.acoEstribo);
  const aswMin = rhoWMin * bw * 100;
  const asw = Math.max(aswCalc, aswMin);
  const sMax = espacamentoMaximoEstribo(d);
  memoria.push(
    {
      descricao: "Tensão de cisalhamento de cálculo",
      formula: "τwd = Vd / (bw d)",
      valor: twd * 10,
      unidade: "MPa",
      ref: CALCCA,
    },
    {
      descricao: "Tensão última da biela",
      formula: "τwu = min(0,25 fcd; 4,5 MPa)",
      valor: twu * 10,
      unidade: "MPa",
      ref: CALCCA,
    },
    {
      descricao: "Coeficiente ψ1",
      formula: "ψ1 = 0,07 + 5 ρ1 ≤ 0,14; ρ1 = As / (bw d)",
      valor: psi1,
      ref: CALCCA,
    },
    {
      descricao: "Parcela do concreto",
      formula: "τc = ψ1 √fck",
      valor: tc * 10,
      unidade: "MPa",
      ref: CALCCA,
    },
    {
      descricao: "Tensão a absorver pelos estribos",
      formula: "τd = 1,15 τwd − τc ≥ 0",
      valor: td * 10,
      unidade: "MPa",
      ref: CALCCA,
    },
    {
      descricao: "Estribos calculados",
      formula: "Asw = τd bw / fywd",
      valor: aswCalc,
      unidade: "cm²/m",
      ref: CALCCA,
    },
    {
      descricao: "Estribos mínimos",
      formula: `Asw,min = ${rhoWMin === TAXA_ASW_MIN ? "0,0014" : "0,0025 (CA-25)"} · bw · 100`,
      valor: aswMin,
      unidade: "cm²/m",
      ref: VIGCALC,
    },
    {
      descricao: "Espaçamento máximo dos estribos",
      formula: "smáx = min(0,5 d; 30 cm)",
      valor: sMax,
      unidade: "cm",
      ref: VIGCALC,
    },
  );
  if (!bielaOk) {
    avisos.push(
      `Biela comprimida esmagada: τwd = ${num(twd * 10, 2)} MPa > τwu = ${num(twu * 10, 2)} MPa; aumente a seção.`,
    );
  }
  return { asw, bielaOk, sMax, avisos, memoria };
}

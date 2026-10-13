// Ancoragem de barras longitudinais e ganchos, por norma. Regras e fontes em
// docs/DETALHAMENTO.md. Unidades: φ em mm, comprimentos em cm, tensões em MPa.
// - NBR 6118:2023: 9.3.1 (zona de aderência), 9.3.2.1 (fbd), 9.4.2.4 (lb),
//   9.4.2.5 (lb,nec e lb,mín), 9.4.2.3 e Tabela 9.1 (ganchos), 9.4.6.1
//   (ganchos de estribo). Fonte: Bastos, Ancoragem e emenda de armaduras
//   (UNESP, mar/2024), "F4" em docs/norma/vigas-pilares.md.
// - NB-1/78: regra da V1 (DESCALC.BM DcAncoragem#, DcAncoragemNeg#,
//   DcComprEstribo#): τbu = 0,42 fcd^(2/3), fator 1,5 nas barras superiores
//   de peças com h ≥ 30 cm, ganchos de 10 φ. Barra lisa (CA-25):
//   τbu = 0,28 fcd^(1/2) (Fiorin, 1998, item 5.1, que cita a NBR 6118:1978).
import type { Aco } from "../../dominio/obra";
import { fctm, GAMA_C } from "../normas/nbr6118-2023/materiais";
import type { Etapa, MateriaisCalc } from "../tipos";

export type Aderencia = "boa" | "ma";
/** Face da peça junto à qual a barra horizontal está. */
export type PosicaoBarra = "inferior" | "superior";

export interface AncoragemBasica {
  /** mm */
  phi: number;
  aderencia: Aderencia;
  /** Resistência (6118) ou tensão última (NB-1/78) de aderência de cálculo, MPa. */
  fbd: number;
  /** Comprimento de ancoragem básico, cm. */
  lb: number;
  memoria: Etapa[];
}

export interface AncoragemNecessaria {
  /** Comprimento de ancoragem necessário, cm (já com o mínimo). */
  lbNec: number;
  /** Mínimo aplicado, cm (0 se a norma não tem). */
  lbMin: number;
  memoria: Etapa[];
}

const F4 = "Bastos, Ancoragem (mar/2024)";
const V1 = "V1 DESCALC.BM";
const FIORIN = "Fiorin, dissertação EESC-USP (1998), item 5.1, p. 137 do PDF";

/** Barra lisa: o CA-25. A 6118 exige gancho semicircular na barra lisa
 *  tracionada (9.4.2.1 a e 9.4.2.3; F4 p. 12-14). */
export const barraLisa = (aco: Aco) => aco === "CA-25";

/** Altura da faixa de boa aderência junto à face, cm (6118 9.3.1). */
const FAIXA_ADERENCIA = 30;
/** Altura a partir da qual a regra da faixa muda de face, cm (6118 9.3.1). */
const H_FAIXA_SUPERIOR = 60;
/** NB-1/78 (V1 DcAncoragemNeg#): barras superiores de peças com h ≥ 30 cm em má aderência. */
const H_MA_ADERENCIA_NB178 = 30;
/** NB-1/78 (V1): na má aderência τbu cai a 2/3, isto é, lb × 1,5. */
const FATOR_MA_NB178 = 1.5;

/**
 * Situação de aderência de barra horizontal (6118 9.3.1; F4 item 3, Figura 18).
 * `h` = altura da peça, `distanciaFace` = da face junto à barra ao centro da
 * barra, cm. Boa se: h < 60 e a barra está até 30 cm acima da face inferior;
 * h ≥ 60 e a barra está pelo menos 30 cm abaixo da face superior. Junta de
 * concretagem não é considerada (concretagem de uma vez).
 */
export function aderencia6118(posicao: PosicaoBarra, h: number, distanciaFace: number): Aderencia {
  const acimaDoFundo = posicao === "inferior" ? distanciaFace : h - distanciaFace;
  const boa =
    h < H_FAIXA_SUPERIOR ? acimaDoFundo <= FAIXA_ADERENCIA : h - acimaDoFundo >= FAIXA_ADERENCIA;
  return boa ? "boa" : "ma";
}

/** Situação de aderência na NB-1/78 como na V1 (DcAncoragemNeg#): barra
 *  superior de peça com h ≥ 30 cm é má aderência; o resto é boa. */
export const aderenciaNb178 = (posicao: PosicaoBarra, h: number): Aderencia =>
  posicao === "superior" && h >= H_MA_ADERENCIA_NB178 ? "ma" : "boa";

/** η1 por superfície da barra (6118 Tabela 8.2; F4 Eq. 1): CA-50 nervurada
 *  2,25; CA-25 lisa 1,0; CA-60 1,0 (valor da edição 2023 segundo F4). */
const ETA1: Record<Aco, number> = { "CA-25": 1, "CA-50": 2.25, "CA-60": 1 };

/**
 * Comprimento de ancoragem básico pela NBR 6118:2023 (9.4.2.4):
 * fbd = η1 η2 η3 fctd (9.3.2.1), fctd = 0,7 · 0,3 fck^(2/3) / γc,
 * lb = φ/4 · fyd/fbd ≥ 25 φ. η2 = 1,0 (boa) ou 0,7 (má); η3 = 1,0 para
 * φ < 32 mm e (132 − φ)/100 acima. Aço e fyd da armadura longitudinal (`mat`).
 */
export function ancoragemBasica6118(
  phi: number,
  ad: Aderencia,
  mat: MateriaisCalc,
): AncoragemBasica {
  const eta1 = ETA1[mat.aco];
  const eta2 = ad === "boa" ? 1 : 0.7;
  const eta3 = phi < 32 ? 1 : (132 - phi) / 100;
  const fctd = (0.7 * fctm(mat.fck)) / GAMA_C;
  const fbd = eta1 * eta2 * eta3 * fctd;
  const lbCalc = (phi / 10 / 4) * (mat.fyd / fbd);
  const lb = Math.max(lbCalc, (25 * phi) / 10);
  const ref = (item: string, eq: string) => `6118:2023 ${item} (${F4}, ${eq})`;
  return {
    phi,
    aderencia: ad,
    fbd,
    lb,
    memoria: [
      {
        descricao: `Resistência de aderência, φ ${phi} mm, ${ad === "boa" ? "boa" : "má"} aderência`,
        formula: `fbd = η1 η2 η3 fctd = ${eta1} · ${eta2} · ${eta3.toFixed(2)} · ${fctd.toFixed(3)}`,
        valor: fbd,
        unidade: "MPa",
        ref: ref("9.3.2.1", "Eq. 1"),
      },
      {
        descricao: `Comprimento de ancoragem básico, φ ${phi} mm`,
        formula: "lb = φ/4 · fyd/fbd ≥ 25 φ",
        valor: lb,
        unidade: "cm",
        ref: ref("9.4.2.4", "Eq. 3"),
      },
    ],
  };
}

/**
 * Comprimento de ancoragem necessário pela NBR 6118:2023 (9.4.2.5; F4 Eq. 4
 * e 5): lb,nec = α lb As,calc/As,ef ≥ lb,mín = máx(0,3 lb; 10 φ; 10 cm), com
 * α = 0,7 para barra tracionada com gancho (cobrimento normal ao gancho ≥ 3φ)
 * e 1,0 sem gancho. Barras transversais soldadas (α 0,7 / 0,5) não são usadas.
 */
export function ancoragemNecessaria6118(
  anc: AncoragemBasica,
  asCalc: number,
  asEf: number,
  gancho: boolean,
): AncoragemNecessaria {
  const alfa = gancho ? 0.7 : 1;
  const razao = asEf > 0 ? Math.min(Math.max(asCalc, 0) / asEf, 1) : 1;
  const lbMin = Math.max(0.3 * anc.lb, (10 * anc.phi) / 10, 10);
  const lbNec = Math.max(alfa * anc.lb * razao, lbMin);
  return {
    lbNec,
    lbMin,
    memoria: [
      {
        descricao: `Ancoragem necessária, φ ${anc.phi} mm${gancho ? " com gancho" : ""}`,
        formula: `lb,nec = α lb As,calc/As,ef = ${alfa} · ${anc.lb.toFixed(1)} · ${razao.toFixed(3)} ≥ lb,mín = máx(0,3 lb; 10 φ; 10 cm) = ${lbMin.toFixed(1)}`,
        valor: lbNec,
        unidade: "cm",
        ref: `6118:2023 9.4.2.5 (${F4}, Eq. 4 e 5)`,
      },
    ],
  };
}

/**
 * Comprimento de ancoragem básico pela NB-1/78 como na V1 (DcAncoragem#,
 * DcAncoragemNeg#): τbu = 0,42 fcd^(2/3) (MPa), lb = φ/4 · fyd/τbu; na má
 * aderência τbu × 2/3, isto é, lb × 1,5. Sem mínimo de 25 φ (a V1 não tem).
 * Barra lisa (CA-25, ηb ≤ 1): τbu = 0,28 fcd^(1/2) (Fiorin, 1998, item 5.1,
 * citando a NBR 6118:1978; a V1 só tem a fórmula da barra nervurada).
 * [VERIFICAR] o texto da NB-1/78 não foi lido; a fonte é secundária. A mesma
 * fonte põe o CA-60 com ηb ≤ 1 na fórmula de 0,28; aqui o CA-60 segue a V1.
 */
export function ancoragemBasicaNb178(
  phi: number,
  ad: Aderencia,
  mat: MateriaisCalc,
): AncoragemBasica {
  const lisa = barraLisa(mat.aco);
  const tbuBoa = lisa ? 0.28 * Math.sqrt(mat.fcd) : 0.42 * mat.fcd ** (2 / 3);
  const fbd = ad === "boa" ? tbuBoa : tbuBoa / FATOR_MA_NB178;
  const lb = (phi / 10 / 4) * (mat.fyd / fbd);
  const formula = lisa ? "τbu = 0,28 fcd^(1/2) (barra lisa)" : "τbu = 0,42 fcd^(2/3)";
  return {
    phi,
    aderencia: ad,
    fbd,
    lb,
    memoria: [
      {
        descricao: `Tensão última de aderência, φ ${phi} mm, ${ad === "boa" ? "boa" : "má (× 2/3)"} aderência`,
        formula: ad === "boa" ? formula : `${formula} · 2/3`,
        valor: fbd,
        unidade: "MPa",
        ref: lisa
          ? `NB-1/78 (${FIORIN}) [VERIFICAR item da NB-1/78]`
          : `NB-1/78 (${V1} DcAncoragem#) [VERIFICAR item da NB-1/78]`,
      },
      {
        descricao: `Comprimento de ancoragem básico, φ ${phi} mm`,
        formula: "lb = φ/4 · fyd/τbu",
        valor: lb,
        unidade: "cm",
        ref: `NB-1/78 (${V1} DcAncoragem#)`,
      },
    ],
  };
}

/**
 * Ancoragem necessária na NB-1/78: o próprio lb, sem redução por As,calc/As,ef
 * nem por gancho, como a V1 (DcDetalha% usa lb cheio; o SISTRUT.DSP original
 * traz "reduzir ancoragem positiva em função de Ase/Anec = N").
 * [VERIFICAR] a NB-1/78 permite reduções; sem o texto, fica o valor maior.
 */
export function ancoragemNecessariaNb178(anc: AncoragemBasica): AncoragemNecessaria {
  return {
    lbNec: anc.lb,
    lbMin: 0,
    memoria: [
      {
        descricao: `Ancoragem necessária, φ ${anc.phi} mm (sem reduções, como a V1)`,
        formula: "lb,nec = lb",
        valor: anc.lb,
        unidade: "cm",
        ref: `NB-1/78 (${V1} DcDetalha%) [VERIFICAR reduções da NB-1/78]`,
      },
    ],
  };
}

/** Diâmetro do pino de dobramento de gancho de barra longitudinal, em φ
 *  (6118 Tabela 9.1; F4 Tabela 1): φ < 20: CA-25 4, CA-50 5, CA-60 6;
 *  φ ≥ 20: CA-25 5, CA-50 8. */
export function pinoDobramento(phi: number, aco: Aco) {
  if (phi < 20) return aco === "CA-25" ? 4 : aco === "CA-50" ? 5 : 6;
  // [VERIFICAR] a Tabela 9.1 não tem CA-60 com φ ≥ 20 (bitola inexistente); usa 8 φ.
  return aco === "CA-25" ? 5 : 8;
}

/**
 * Comprimento acrescido por um gancho numa barra longitudinal, cm (6118
 * 9.4.2.3). A parte reta da barra vai até a face menos o cobrimento.
 * - Nervurada: gancho de 90° (c), medido por fora: ponta reta 8 φ + raio do
 *   pino D/2 + φ. Sem desconto da curva.
 * - Lisa (CA-25): gancho semicircular (a; "para as barras lisas, os ganchos
 *   devem ser semicirculares", F4 p. 14): meia volta pelo eixo π (D + φ)/2 +
 *   ponta reta 2 φ, sem descontar o trecho D/2 + φ já contado no reto.
 */
export function gancho6118(phi: number, aco: Aco) {
  const D = pinoDobramento(phi, aco);
  if (barraLisa(aco)) return ((Math.PI * (D + 1)) / 2 + 2) * (phi / 10);
  return ((8 + D / 2 + 1) * phi) / 10;
}

/** Altura que o gancho de `gancho6118` ocupa na seção, cm, medida por fora:
 *  90° = 8 φ + D/2 + φ; semicircular = D + 2 φ (diâmetro externo da volta). */
export function alturaGancho6118(phi: number, aco: Aco) {
  if (barraLisa(aco)) return ((pinoDobramento(phi, aco) + 2) * phi) / 10;
  return gancho6118(phi, aco);
}

/** Gancho de barra longitudinal na NB-1/78 como na V1 (DcDetalha%): 10 φ, cm. */
export const ganchoNb178 = (phi: number) => (10 * phi) / 10;

/** Soma dos dois ganchos do estribo fechado, cm (6118 9.4.6.1 a: gancho de
 *  135° com ponta reta de 5 φt, não menos que 5 cm). */
export const ganchosEstribo6118 = (phiT: number) => 2 * Math.max((5 * phiT) / 10, 5);

/** Soma dos dois ganchos do estribo fechado na NB-1/78 como na V1
 *  (DcComprEstribo#): 2 × 10 φt, cm. */
export const ganchosEstriboNb178 = (phiT: number) => (2 * 10 * phiT) / 10;

// Dimensionamento de vigas pela NBR 6118:2023: flexão simples de seção
// retangular (bloco retangular, x/d limitado pela dutilidade, armadura dupla
// acima do limite) e estribos verticais pelo Modelo I (θ = 45°).
// Fontes: docs/norma/vigas-pilares.md, seções 2 e 3 (apostilas de Bastos,
// UNESP: F1 = Flexão Normal Simples out/2023; F3 = Cortante mar/2025).
// Contas internas em kN, cm e kN/cm² (1 MPa = 0,1 kN/cm²).
import { num } from "../../texto";
import type { CortanteResultado, Etapa, FlexaoResultado, MateriaisCalc } from "../../tipos";
import { FYK, fctm, GAMA_C } from "./materiais";

const F1 = "Bastos, Flexão Simples";
const F3 = "Bastos, Cortante";

/** Encurtamento último do concreto, Grupo I (8.2.10.1). Confere com x3lim de
 *  F1 ex. 7.3 nº 1: 0,0035 / (0,0035 + 2,07‰) · 47 = 29,6 cm. */
const EPS_CU = 0.0035;
/** Distância da face comprimida ao centro da armadura comprimida, cm. A
 *  interface `Norma.vigaFlexao` não recebe d'; 4 cm é o valor de F1 ex. 8.3 nº 2
 *  (d'/d = 0,07) e cobre c = 2,5 + φt 6,3 + φ 12,5/2 = 3,8 cm. */
export const D_LINHA = 4;
/** Armadura máxima de flexão: As + A's ≤ 4 % Ac (17.3.5.2.4). */
const TAXA_AS_MAX = 0.04;
/** Armadura de pele exigida só para h > 60 cm (17.3.5.2.3; F1 l.1855). */
const H_PELE = 60;
/** [VERIFICAR] taxa da armadura de pele: 0,10 % Ac,alma em cada face (17.3.5.2.3).
 *  As fontes de docs/norma citam a exigência (F1 Eq. 11) mas não transcrevem a
 *  taxa; usado o valor da NBR 6118:2014, que é o maior entre os citados
 *  (F1 usa 0,05 % da NB-1/78 para h ≥ 50 cm). */
const TAXA_PELE = 0.001;

/** Tabela 17.3 (F1 Tabela 2, p. 10): ρmín (%) por fck. Premissas: CA-50,
 *  d/h = 0,8, γc = 1,4, γs = 1,15. */
const RHO_MIN: ReadonlyArray<readonly [fck: number, rho: number]> = [
  [20, 0.15],
  [25, 0.15],
  [30, 0.15],
  [35, 0.164],
  [40, 0.179],
  [45, 0.194],
  [50, 0.208],
  [55, 0.211],
  [60, 0.219],
  [65, 0.226],
  [70, 0.233],
  [75, 0.239],
  [80, 0.245],
  [85, 0.251],
  [90, 0.256],
];

const kNcm2 = (mpa: number) => mpa / 10;

/** ρmín (fração) da Tabela 17.3. Entre duas colunas usa a do fck seguinte
 *  (ρmín cresce com fck: escolha conservadora); acima de C90 usa a última. */
export function rhoMin6118(fck: number) {
  const [, rho] = RHO_MIN.find(([f]) => fck <= f) ?? [90, 0.256];
  return rho / 100;
}

/** λ do bloco retangular: 0,8 até C50; 0,8 − (fck − 50)/400 acima (17.2.2.3; F1 Eq. 15). */
export const lambda6118 = (fck: number) => (fck <= 50 ? 0.8 : 0.8 - (fck - 50) / 400);

/** x/d máximo por dutilidade: 0,45 até C50; 0,35 até C90 (14.6.4.3; F1 Eq. 26). */
export const xdLimite6118 = (fck: number) => (fck <= 50 ? 0.45 : 0.35);

/**
 * Armadura de flexão de seção retangular (Vigas: Norma.vigaFlexao). `md` em
 * kN·m (já majorado; o sinal é ignorado), bw, h e d em cm. Bloco retangular
 * λx com σcd = αc·fcd = 0,85 ηc fcd (`mat.sigmaCd`). Até x/d limite é armadura
 * simples; acima, armadura dupla com x = x/d lim · d e a comprimida a `dLinha`
 * da face (padrão D_LINHA = 4 cm; o parâmetro existe para os exemplos com
 * outro d'). A tracionada respeita As,mín da Tabela 17.3. Avisos: armadura
 * dupla, As + A's > 4 % Ac, armadura de pele (h > 60 cm) e fck > 50. Sem
 * solução (d ≤ d' com armadura dupla) devolve NaN nas áreas e um aviso.
 */
export function vigaFlexao6118(
  md: number,
  bw: number,
  h: number,
  d: number,
  mat: MateriaisCalc,
  dLinha = D_LINHA,
): FlexaoResultado {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const m = Math.abs(md) * 100; // kN·cm
  const sigmaCd = kNcm2(mat.sigmaCd);
  const fyd = kNcm2(mat.fyd);
  const lambda = lambda6118(mat.fck);
  const xdLim = xdLimite6118(mat.fck);
  const ac = bw * h;
  const rhoMin = rhoMin6118(mat.fck);
  const asMin = rhoMin * ac;

  if (mat.fck > 50) {
    avisos.push(
      `fck = ${mat.fck} MPa > 50 (Grupo II): fora do escopo do app; αc, εcu e ρmín não conferidos.`,
    );
  }
  memoria.push(
    { descricao: "Momento de cálculo", valor: Math.abs(md), unidade: "kN·m" },
    {
      descricao: "Tensão no bloco de compressão",
      formula: "σcd = αc fcd = 0,85 ηc fcd",
      valor: mat.sigmaCd,
      unidade: "MPa",
      ref: `6118:2023 17.2.2 e 8.2.10.1 (${F1}, Eq. 16)`,
    },
    {
      descricao: "Altura relativa do bloco retangular",
      formula: "λ = 0,8 (fck ≤ 50)",
      valor: lambda,
      ref: `6118:2023 17.2.2 (${F1}, Eq. 15, p. 13)`,
    },
    {
      descricao: "x/d limite (dutilidade)",
      formula: "x/d ≤ 0,45 (fck ≤ 50)",
      valor: xdLim,
      ref: `6118:2023 14.6.4.3 (${F1}, Eq. 26, p. 16)`,
    },
  );
  if (m === 0) {
    memoria.push({ descricao: "Momento nulo: sem armadura", valor: 0, unidade: "cm²" });
    return { as: 0, asComprimida: 0, xd: 0, avisos, memoria };
  }

  // Md = λ x bw σcd (d − λx/2)  →  x/d = (1 − √(1 − 2μ)) / λ, μ = Md / (bw d² σcd)
  const mu = m / (bw * d * d * sigmaCd);
  const xdLivre = mu <= 0.5 ? (1 - Math.sqrt(1 - 2 * mu)) / lambda : Number.POSITIVE_INFINITY;
  memoria.push({
    descricao: "Linha neutra sem armadura de compressão",
    formula: "x = d (1 − √(1 − 2 Md / (bw d² σcd))) / λ",
    valor: xdLivre * d,
    unidade: "cm",
    ref: `6118:2023 17.2.2 (${F1}, Eq. 23, p. 16)`,
  });

  let as: number;
  let asComprimida = 0;
  let xd: number;
  if (xdLivre <= xdLim) {
    xd = xdLivre;
    const x = xd * d;
    as = m / (fyd * (d - (lambda * x) / 2));
    memoria.push({
      descricao: "Armadura tracionada (simples)",
      formula: "As = Md / (fyd (d − λx/2))",
      valor: as,
      unidade: "cm²",
      ref: `6118:2023 17.2.2 (${F1}, Eq. 25, p. 16)`,
    });
  } else {
    xd = xdLim;
    if (d <= dLinha) {
      avisos.push(
        `Md acima do limite e d = ${d} cm ≤ d' = ${dLinha} cm: sem solução, aumente a seção.`,
      );
      return { as: Number.NaN, asComprimida: Number.NaN, xd, avisos, memoria };
    }
    const x = xdLim * d;
    const braco = d - (lambda * x) / 2;
    const m1 = lambda * x * bw * sigmaCd * braco;
    const m2 = m - m1;
    // tensão na armadura comprimida pela compatibilidade (εcu na face)
    const epsLinha = (EPS_CU * (x - dLinha)) / x;
    const sigmaLinha = Math.min(Math.max(epsLinha, 0) * kNcm2(mat.es), fyd);
    const as1 = m1 / (fyd * braco);
    const as2 = m2 / (fyd * (d - dLinha));
    asComprimida = m2 / (sigmaLinha * (d - dLinha));
    as = as1 + as2;
    avisos.push(
      `x/d = ${num(xdLivre, 3)} passaria do limite ${xdLim}: armadura dupla com x = ${xdLim} d (A's = ${num(asComprimida, 2)} cm²).`,
    );
    memoria.push(
      {
        descricao: "Momento resistido com x = x/d lim · d",
        formula: "M1d = λ x bw σcd (d − λx/2)",
        valor: m1 / 100,
        unidade: "kN·m",
        ref: `6118:2023 17.2.2 (${F1}, item 8)`,
      },
      {
        descricao: "Momento a resistir pelo binário das armaduras",
        formula: "M2d = Md − M1d",
        valor: m2 / 100,
        unidade: "kN·m",
        ref: `${F1}, item 8`,
      },
      {
        descricao: "Tensão na armadura comprimida",
        formula: "σ'sd = Es · εcu (x − d')/x ≤ fyd",
        valor: sigmaLinha * 10,
        unidade: "MPa",
        ref: `6118:2023 17.2.2 (${F1}, item 8)`,
      },
      {
        descricao: "Armadura comprimida",
        formula: "A's = M2d / (σ'sd (d − d'))",
        valor: asComprimida,
        unidade: "cm²",
        ref: `${F1}, item 8`,
      },
      {
        descricao: "Armadura tracionada (dupla)",
        formula: "As = M1d / (fyd (d − λx/2)) + M2d / (fyd (d − d'))",
        valor: as,
        unidade: "cm²",
        ref: `${F1}, item 8`,
      },
    );
  }

  memoria.push({
    descricao: "Armadura mínima de tração",
    formula: "As,mín = ρmín · bw · h (Tabela 17.3)",
    valor: asMin,
    unidade: "cm²",
    ref: `6118:2023 17.3.5.2.1 (${F1}, Tabela 2, p. 10)`,
  });
  if (mat.aco !== "CA-50") {
    // [VERIFICAR] a Tabela 17.3 vale para CA-50; para outro aço a norma manda
    // recalcular ρmín por Md,mín = 0,8 W0 fctk,sup. Mantida a taxa tabelada.
    avisos.push(`ρmín da Tabela 17.3 é para CA-50; com ${mat.aco} confira As,mín.`);
  }
  if (as < asMin) {
    memoria.push({ descricao: "Armadura mínima prevalece", valor: asMin, unidade: "cm²" });
    as = asMin;
  }

  const asMax = TAXA_AS_MAX * ac;
  memoria.push({
    descricao: "Armadura máxima",
    formula: "As + A's ≤ 4 % Ac",
    valor: asMax,
    unidade: "cm²",
    ref: `6118:2023 17.3.5.2.4 (${F1}, Eq. 6, p. 9)`,
  });
  if (as + asComprimida > asMax) {
    avisos.push(
      `As + A's = ${num(as + asComprimida, 2)} cm² > 4 % Ac = ${num(asMax, 2)} cm²: aumente a seção.`,
    );
  }

  if (h > H_PELE) {
    const asPele = TAXA_PELE * ac;
    memoria.push({
      descricao: "Armadura de pele por face (h > 60 cm)",
      formula: "Asp = 0,10 % bw · h por face",
      valor: asPele,
      unidade: "cm²",
      ref: `6118:2023 17.3.5.2.3 (${F1}, Eq. 11) [VERIFICAR taxa]`,
    });
    avisos.push(`h = ${h} cm > 60 cm: armadura de pele de ${num(asPele, 2)} cm² em cada face.`);
  }
  return { as, asComprimida, xd, avisos, memoria };
}

/**
 * Estribos verticais pelo Modelo I (Vigas: Norma.vigaCortante). `vd` em kN (já
 * majorado; sinal ignorado), bw e d em cm. VRd2 = 0,27 αv2 fcd bw d; em flexão
 * simples Vc = Vc0 = 0,6 fctd bw d; Asw/s = (Vsd − Vc) / (0,9 d fywd), com
 * ρsw,mín = 0,2 fct,m / fywk (fywk do aço do estribo, limitado a 500 MPa). `asl` não entra no
 * Modelo I (Vc0 não depende da armadura longitudinal); fica na assinatura por
 * causa da interface `Norma`. `sMax` = espaçamento máximo dos estribos (18.3.3.2). Com a biela esmagada devolve bielaOk = false e um
 * aviso; o Asw calculado continua no resultado.
 */
export function vigaCortante6118(
  vd: number,
  bw: number,
  d: number,
  _asl: number,
  mat: MateriaisCalc,
): CortanteResultado {
  const avisos: string[] = [];
  const vsd = Math.abs(vd);
  const fcd = kNcm2(mat.fcd);
  const fywd = kNcm2(mat.fywd);
  // [VERIFICAR] fywk na taxa mínima: limitado a 500 MPa (CA-50). F3 nota 33 usa
  // sempre CA-50 na armadura mínima, mesmo com estribo CA-60; com CA-25 vale 250.
  const fywk = Math.min(FYK[mat.acoEstribo], FYK["CA-50"]);
  const fctmMpa = fctm(mat.fck);
  const fctd = kNcm2((0.7 * fctmMpa) / GAMA_C);

  const alfaV2 = 1 - mat.fck / 250;
  const vrd2 = 0.27 * alfaV2 * fcd * bw * d;
  const bielaOk = vsd <= vrd2;
  const vc = 0.6 * fctd * bw * d;
  const vsw = Math.max(vsd - vc, 0);
  const aswCalc = (vsw / (0.9 * d * fywd)) * 100;
  const rhoSwMin = (0.2 * fctmMpa) / fywk;
  const aswMin = rhoSwMin * bw * 100;
  const asw = Math.max(aswCalc, aswMin);
  // 18.3.3.2: smáx = 0,6 d ≤ 30 cm se VSd ≤ 0,67 VRd2; senão 0,3 d ≤ 20 cm
  const cortanteAlto = vsd > 0.67 * vrd2;
  const sMax = cortanteAlto ? Math.min(0.3 * d, 20) : Math.min(0.6 * d, 30);

  const ref = (item: string, eq: string) => `6118:2023 ${item} (${F3}, ${eq})`;
  const memoria: Etapa[] = [
    { descricao: "Força cortante de cálculo", valor: vsd, unidade: "kN" },
    {
      descricao: "Coeficiente αv2",
      formula: "αv2 = 1 − fck/250",
      valor: alfaV2,
      ref: ref("17.4.2.2", "Cortante.txt:1915"),
    },
    {
      descricao: "Resistência da biela comprimida (Modelo I)",
      formula: "VRd2 = 0,27 αv2 fcd bw d",
      valor: vrd2,
      unidade: "kN",
      ref: ref("17.4.2.2", "Eq. 5.16-5.17"),
    },
    {
      descricao: "Resistência de cálculo à tração",
      formula: "fctd = 0,7 · 0,3 fck^(2/3) / γc",
      valor: fctd * 10,
      unidade: "MPa",
      ref: ref("8.2.5 e 17.4.2.2", "Eq. 5.21"),
    },
    {
      descricao: "Parcela do concreto (flexão simples)",
      formula: "Vc = Vc0 = 0,6 fctd bw d",
      valor: vc,
      unidade: "kN",
      ref: ref("17.4.2.2", "Eq. 5.20"),
    },
    {
      descricao: "Parcela dos estribos",
      formula: "Vsw = Vsd − Vc ≥ 0",
      valor: vsw,
      unidade: "kN",
      ref: ref("17.4.2.2", "Eq. 5.22"),
    },
    {
      descricao: "Estribos calculados",
      formula: "Asw/s = Vsw / (0,9 d fywd)",
      valor: aswCalc,
      unidade: "cm²/m",
      ref: ref("17.4.2.2", "Eq. 5.22"),
    },
    {
      descricao: "Estribos mínimos",
      formula: "Asw,mín/s = 0,2 (fct,m / fywk) bw; fywk ≤ 500 MPa",
      valor: aswMin,
      unidade: "cm²/m",
      ref: ref("17.4.1.1", "Eq. 5.53"),
    },
    {
      descricao: "Espaçamento máximo dos estribos",
      formula: cortanteAlto
        ? "VSd > 0,67 VRd2 → smáx = 0,3 d ≤ 20 cm"
        : "VSd ≤ 0,67 VRd2 → smáx = 0,6 d ≤ 30 cm",
      valor: sMax,
      unidade: "cm",
      ref: ref("18.3.3.2", "Eq. 5.67-5.69"),
    },
  ];
  if (!bielaOk) {
    avisos.push(
      `Biela comprimida esmagada: Vsd = ${num(vsd, 1)} kN > VRd2 = ${num(vrd2, 1)} kN; aumente a seção.`,
    );
  }
  if (mat.fck > 50) {
    // [VERIFICAR] αv2 = 1 − fck/250 não conferido para fck > 50 (pendência 6 de vigas-pilares.md).
    avisos.push(`fck = ${mat.fck} MPa > 50: αv2 e fctd fora do escopo conferido.`);
  }
  return { asw, bielaOk, sMax, avisos, memoria };
}

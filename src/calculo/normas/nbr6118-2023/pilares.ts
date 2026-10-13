// Dimensionamento de pilar retangular contraventado (nós fixos) pela NBR 6118:2023.
// Fonte: docs/norma/vigas-pilares.md, seção 5, e a apostila de onde ela saiu:
// Bastos, "Flexão composta e pilares de concreto armado" (UNESP, jun/2024), aqui
// citada como "Bastos, Pilares, p. X" (página impressa no cabeçalho).
//
// Convenções (as mesmas de nb1-78/pilares.ts): Mx flete na direção x, cuja altura
// é b (λx = 3,46·lex/b); My flete na direção y, altura h.
// Sinal dos momentos de topo e base = face tracionada: mesmo sinal no topo e na
// base é curvatura simples (MB/MA > 0 em αb); sinais opostos, curvatura dupla.
// É a convenção de PilarEntrada (tipos.ts) e da Figura 61 da fonte, e a que
// vigas/ligacaoPilar.ts usa para preencher os momentos.
//
// Escopo: pilar biapoiado sem cargas transversais (αb pela alínea a de 15.8.2),
// método do pilar-padrão com curvatura aproximada (15.8.3.3.2) para λ ≤ 90 e
// pilar-padrão acoplado a diagramas M, N, 1/r com fluência (15.8.3.3.4 e 15.8.4,
// pilares/pilarPadraoMN.ts) para 90 < λ ≤ 140, por direção. λ > 140: aviso (15.8.1).
// Pilar em balanço ou com carga transversal (αb = 1) não é modelado: a entrada
// não informa a vinculação. O método da rigidez κ aproximada não foi implementado.
// Resistência da seção: diagrama parábola-retângulo e domínios 1 a 5 da 6118
// (pilares/secaoParabolaRetangulo.ts), não o núcleo da V1 (flexaoComposta.ts).
import type {
  Barra,
  BarrasPilar,
  Etapa,
  MateriaisCalc,
  PilarEntrada,
  PilarResultado,
} from "../../tipos";
import { areaBarra, BITOLAS, escolheBarras, espacamentoLivreMinimo } from "../../barras";
import type { SecaoRetangular, TensoesCalculo } from "../../pilares/flexaoComposta";
import {
  armaduraSimetricaPR,
  camadasSimetricas,
  momentoResistentePR,
} from "../../pilares/secaoParabolaRetangulo";
import {
  excentricidadeAcidental,
  excentricidadeFluencia,
  forcaNe,
  GAMA_F3,
  menorArmaduraMN,
  momentoTotalMN,
  type PilarPadraoMN,
} from "../../pilares/pilarPadraoMN";
import { GAMA_G, GAMA_Q, moduloInicial } from "./materiais";

/** γf das ações no ELU. Nk chega somado (g + q), e γg = γq = 1,4 (Tabela 11.1). */
export const GAMA_F = Math.max(GAMA_G, GAMA_Q);

/** Expoente α da verificação (MRd,x)^α + (MRd,y)^α ≤ 1 na flexão oblíqua (17.2.5.2).
 *  [VERIFICAR] A fonte não traz o processo aproximado de 17.2.5 (Bastos, Pilares,
 *  p. 37; vigas-pilares.md, pendência 7). α = 1 é a escolha conservadora; a norma
 *  admite 1,2 para seção retangular, valor que o núcleo comum usa na NB-1/78. */
export const ALFA_OBLIQUA_6118 = 1;

const REF_GAMA_N = "6118:2023 13.2.3, Tabela 13.1 (Bastos, Pilares, p. 74)";
const REF_LAMBDA = "6118:2023 15.8.2 (Bastos, Pilares, Eq. 62, p. 43)";
const REF_LAMBDA1 = "6118:2023 15.8.2 (Bastos, Pilares, Eq. 82 e 84, p. 56)";
const REF_MMIN = "6118:2023 11.3.3.4.3 (Bastos, Pilares, Eq. 92, p. 62)";
const REF_CURV = "6118:2023 15.8.3.3.2 (Bastos, Pilares, Eq. 77 e 97, p. 63 e 69)";
const REF_SECAO_C = "6118:2023 15.8.3.3.2 (Bastos, Pilares, Eq. 96 e Figura 70, p. 66-67)";
const REF_FLUENCIA = "6118:2023 15.8.4 (Bastos, Pilares, p. 57)";
const REF_LAMBDA_MAX = "6118:2023 15.8.1 e 15.8.2 (Bastos, Pilares, Eq. 63, p. 43)";
const REF_MN = "6118:2023 15.8.3.3.4 e 15.3.1, diagrama M, N, 1/r com 0,85·fcd/γf3";
const REF_EA = "6118:2023 11.3.3.4.2 (Bastos, Pilares, Eq. 79 e 80)";
const REF_ECI = "6118:2023 8.2.8 e 15.8.4";

/** Coeficiente de fluência φ(t∞, t0) para ecc (15.8.4). [VERIFICAR] A V2 não tem φ
 *  (as lajes usam ξ da Tabela 17.1, não φ) e a fonte não transcreve a Tabela 8.2 da
 *  NBR 6118, que dá φ pela umidade, espessura fictícia e idade t0; para ambiente
 *  usual (U ≈ 75%) e t0 de poucas semanas ela costuma passar de 2, então 2,0 pode
 *  ficar contra a segurança. */
export const COEF_FLUENCIA = 2;

/** Limite de λ do pilar-padrão acoplado a diagramas M, N, 1/r (15.8.3.3.4). */
export const LAMBDA_MAX_MN = 140;
const REF_FLEXAO =
  "6118:2023 8.2.10.1 e 17.2.2, parábola-retângulo e domínios (Bastos, Pilares, Eq. 1, p. 1; Figuras 7 e 16, p. 6 e 9)";
const REF_OBLIQUA = "6118:2023 17.2.5.2 [VERIFICAR α] (Bastos, Pilares, Figuras 72 e 73, p. 68-69)";
const REF_AS_MIN = "6118:2023 17.3.5.3.1 (Bastos, Pilares, Eq. 108, p. 75)";
const REF_AS_MAX = "6118:2023 17.3.5.3.2 (Bastos, Pilares, Eq. 109, p. 75)";
const REF_PHI = "6118:2023 18.4.2.1 (Bastos, Pilares, Eq. 105, p. 74)";
const REF_ESTRIBO = "6118:2023 18.4.3 (Bastos, Pilares, Eq. 110 e 111, p. 77)";
const REF_ARRANJO = "6118:2023 18.4.2.2 (Bastos, Pilares, Eq. 107; vigas-pilares.md seção 5)";

/** Espaçamento máximo entre eixos das barras longitudinais: ≤ 2·bMin e ≤ 40 cm (18.4.2.2). */
export const espacamentoMaximoLongitudinal = (bMin: number) => Math.min(2 * bMin, 40);

/** Índice de esbeltez λ = 3,46·le/h (seção retangular); le em m, h em cm. */
export const esbeltez = (le: number, h: number) => (3.46 * le * 100) / h;

/** Coeficiente adicional γn = 1,95 − 0,05·b para a menor dimensão b < 19 cm (cm);
 *  1 a partir de 19 cm. Abaixo de 14 cm a norma não permite o pilar; a fórmula
 *  segue valendo só para não esconder o resultado (o pilar recebe aviso). */
export const gamaN = (bMin: number) => (bMin >= 19 ? 1 : 1.95 - 0.05 * bMin);

/** Momento mínimo de 1ª ordem M1d,min = Nd·(0,015 + 0,03·h[m]), kN·m; h em cm. */
export const momentoMinimo = (nd: number, h: number) => nd * (0.015 + 0.0003 * h);

/** αb = 0,60 + 0,40·MB/MA, entre 0,40 e 1,0, para pilar biapoiado sem cargas
 *  transversais. MA = momento de maior valor absoluto; o sinal de MB/MA é + se os
 *  dois tracionam a mesma face. Com MA = 0 não há gradiente: αb = 1. */
export function alfaB(ma: number, mb: number) {
  if (ma === 0) return 1;
  return Math.min(1, Math.max(0.4, 0.6 + (0.4 * mb) / ma));
}

/** Esbeltez-limite λ1 = (25 + 12,5·e1/h)/αb, limitada a 35 ≤ λ1 ≤ 90; e1 e h em cm. */
export const esbeltezLimite = (e1: number, h: number, ab: number) =>
  Math.min(90, Math.max(35, (25 + (12.5 * e1) / h) / ab));

/** Curvatura aproximada 1/r = 0,005/[h·(ν + 0,5)] ≤ 0,005/h, em 1/cm; h em cm. */
export const curvaturaAproximada = (nu: number, h: number) =>
  Math.min(0.005 / (h * (nu + 0.5)), 0.005 / h);

/** Momento de 2ª ordem M2d = Nd·le²/10·(1/r), kN·m; le em m, 1/r em 1/cm. */
export const momentoSegundaOrdem = (nd: number, le: number, curvatura: number) =>
  (nd * ((le * 100) ** 2 / 10) * curvatura) / 100;

/** Momentos de cálculo de uma direção nas seções que o pilar-padrão verifica. */
interface Direcao {
  lambda: number;
  /** Extremidades: max(|M1d|; M1d,min). */
  topo: number;
  base: number;
  /** Seção intermediária: 1ª ordem max(M1d,C; M1d,min) (+ Nd·ecc se `mn`) e o M2d
   *  somado a ela. */
  c1: number;
  m2: number;
  /** Momento total da direção: o maior das três seções. NaN se `mn` (depende da
   *  armadura; sai do pilar-padrão acoplado). */
  total: number;
  temMomento: boolean;
  /** 90 < λ ≤ 140: 2ª ordem pelo pilar-padrão acoplado a diagramas M, N, 1/r. */
  mn: boolean;
  le: number;
  /** Nsg ≥ Ne: a fluência leva à instabilidade (15.8.4). */
  instavel: boolean;
}

/** MPa·cm² → kN. */
const KN_POR_MPA_CM2 = 0.1;

/** Índice da flexão oblíqua (Mxd/MRx)^α + (Myd/MRy)^α com asf por face nas duas
 *  direções (as mesmas barras de canto servem às duas). mxd flete na altura s.h;
 *  myd na largura s.b. Infinity se nd passa da capacidade. */
export function indiceObliquo6118(
  nd: number,
  mxd: number,
  myd: number,
  s: SecaoRetangular,
  asf: number,
  t: TensoesCalculo,
  alfa = ALFA_OBLIQUA_6118,
) {
  let indice = 0;
  if (mxd > 0) {
    const mrx = momentoResistentePR(nd, s, camadasSimetricas(s, asf), t);
    if (mrx === null || mrx <= 0) return Infinity;
    indice += (mxd / mrx) ** alfa;
  }
  if (myd > 0) {
    const sy = { b: s.h, h: s.b, dl: s.dl };
    const mry = momentoResistentePR(nd, sy, camadasSimetricas(sy, asf), t);
    if (mry === null || mry <= 0) return Infinity;
    indice += (myd / mry) ** alfa;
  }
  return indice;
}

/** Menor armadura por face (cm², bissecção em [0, asMaxFace]) com índice oblíquo
 *  ≤ 1, ou null se nem asMaxFace basta. */
export function armaduraObliqua6118(
  nd: number,
  mxd: number,
  myd: number,
  s: SecaoRetangular,
  t: TensoesCalculo,
  asMaxFace: number,
  alfa = ALFA_OBLIQUA_6118,
) {
  const atende = (as: number) => indiceObliquo6118(nd, mxd, myd, s, as, t, alfa) <= 1;
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

/** Estribo de pilar: menor bitola ≥ max(5 mm; φl/4); s ≤ min(20 cm; menor
 *  dimensão; 12φl, ou 24φl para CA-25), arredondado para baixo em cm.
 *  [VERIFICAR] A fonte só lista CA-25 e CA-50; CA-60 usa 12φl (o menor). */
export function estriboPilar(phiL: number, bMin: number, aco: MateriaisCalc["aco"]): Barra {
  const phi = BITOLAS.find((p) => p >= 5 && p >= phiL / 4) ?? 32;
  const k = aco === "CA-25" ? 24 : 12;
  return { phi, espacamento: Math.floor(Math.min(20, bMin, (k * phiL) / 10)) };
}

/** Arranjo das barras longitudinais na seção b × h. `porFaceX` = barras em cada
 *  uma das duas faces de comprimento h (perpendiculares a x, armam Mx);
 *  `porFaceY` = barras em cada face de comprimento b (armam My). Os cantos
 *  contam nas duas: n = 2·porFaceX + 2·porFaceY − 4. */
export interface ArranjoPilar {
  n: number;
  porFaceX: number;
  porFaceY: number;
  /** Espaçamento entre eixos, cm, nas faces de comprimento h e b. */
  sFaceX: number;
  sFaceY: number;
  sMax: number;
  /** Barras acrescentadas só para atender o espaçamento máximo. */
  extrasEspacamento: number;
}

/**
 * Distribui `nInicial` barras φ `phi` (par ≥ 4): metade em cada face paralela ao
 * eixo de flexão predominante (`predominante` = direção do momento que governa;
 * "x" põe as barras nas faces de comprimento h) e só os cantos nas outras. Depois
 * cada par de faces recebe barras até cobrir a armadura por face que o cálculo
 * supôs na sua direção (`reqX`, `reqY`, cm²) e até o espaçamento entre eixos
 * ficar ≤ min(2·bMin; 40 cm) (18.4.2.2). `dLinha` = face → eixo da barra, cm.
 */
export function arranjoPilar6118(
  b: number,
  h: number,
  dLinha: number,
  phi: number,
  nInicial: number,
  reqX: number,
  reqY: number,
  predominante: "x" | "y",
): ArranjoPilar {
  const ab = areaBarra(phi);
  const sMax = espacamentoMaximoLongitudinal(Math.min(b, h));
  const porEspacamento = (comprimento: number) =>
    Math.ceil((comprimento - 2 * dLinha) / sMax - 1e-9) + 1;
  const porArea = (req: number) => Math.ceil(req / ab - 1e-9);
  const metade = nInicial / 2;
  const base = { x: predominante === "x" ? metade : 2, y: predominante === "y" ? metade : 2 };
  const semEsp = { x: Math.max(base.x, porArea(reqX)), y: Math.max(base.y, porArea(reqY)) };
  const porFaceX = Math.max(semEsp.x, porEspacamento(h));
  const porFaceY = Math.max(semEsp.y, porEspacamento(b));
  const s = (comprimento: number, k: number) => (comprimento - 2 * dLinha) / (k - 1);
  return {
    n: 2 * porFaceX + 2 * porFaceY - 4,
    porFaceX,
    porFaceY,
    sFaceX: s(h, porFaceX),
    sFaceY: s(b, porFaceY),
    sMax,
    extrasEspacamento: 2 * (porFaceX - semEsp.x) + 2 * (porFaceY - semEsp.y),
  };
}

/** Dimensiona o pilar: Nd = γn·γf·Nk (momentos também × γn·γf); em cada direção,
 *  momento mínimo, αb, λ1 e, se λ1 < λ ≤ 90, 2ª ordem pela curvatura aproximada.
 *  Flexão oblíqua (seções de topo, base e intermediária) se há momento de 1ª ordem
 *  nas duas direções; senão flexo-compressão normal em cada direção, vale a maior.
 *  Armadura simétrica com As,min = max(0,15 Nd/fyd; 0,4% Ac) e As,max = 8% Ac
 *  (aviso acima de 4%, fora das emendas); barras φ ≥ 10 mm, número par ≥ 4,
 *  arranjadas por `arranjoPilar6118` (espaçamento 18.4.2.2; arranjo na memória e em
 *  `barras.porFaceX/porFaceY`, que o detalhamento usa).
 *  `dLinha` = face → centro da barra longitudinal, cm.
 *  Direção com 90 < λ ≤ 140: fluência por ecc (15.8.4) somada à 1ª ordem da seção
 *  intermediária e 2ª ordem pelo pilar-padrão acoplado a diagramas M, N, 1/r
 *  (15.8.3.3.4); a armadura é a menor com equilíbrio e MRd ≥ Md,tot.
 *  Combinação quase permanente: a entrada traz Nk = g + q somado, sem separar g e q;
 *  Nsg = Nk e Msg = Mk (ψ2 = 1 na parcela variável), o que aumenta ecc.
 *  [VERIFICAR] Com g e q separados, Nsg = Ng + ψ2·Nq (ψ2 = 0,3 em edifícios, 11.8.3).
 *  Sem solução (λ > 140, Nk ≤ 0, Nsg ≥ Ne ou seção insuficiente): asNecessaria = NaN e aviso. */
export function pilar6118(e: PilarEntrada, mat: MateriaisCalc, dLinha: number): PilarResultado {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const { b, h } = e;
  const ac = b * h;
  const bMin = Math.min(b, h);
  const gn = gamaN(bMin);
  const gama = gn * GAMA_F;
  const nd = gama * e.nk;
  const lambdaX = esbeltez(e.lex, b);
  const lambdaY = esbeltez(e.ley, h);

  if (mat.fck > 50)
    avisos.push(`${e.nome}: fck = ${mat.fck} MPa > 50 (Grupo II) está fora do escopo do app`);
  if (bMin < 14)
    avisos.push(`${e.nome}: menor dimensão ${bMin} cm < 14 cm, não permitida (13.2.3)`);
  else if (bMin < 19)
    avisos.push(
      `${e.nome}: menor dimensão ${bMin} cm < 19 cm, esforços majorados por γn = ${gn.toFixed(2)}`,
    );
  if (ac < 360) avisos.push(`${e.nome}: área da seção ${ac} cm² < 360 cm², não permitida (13.2.3)`);

  memoria.push(
    {
      descricao: "Coeficiente adicional (menor dimensão < 19 cm)",
      formula: "γn = 1,95 − 0,05·b ≥ 1",
      valor: gn,
      ref: REF_GAMA_N,
    },
    {
      descricao: "Força normal de cálculo",
      formula: `Nd = γn·γf·Nk = ${gn.toFixed(2)}·${GAMA_F}·Nk`,
      valor: nd,
      unidade: "kN",
      ref: REF_GAMA_N,
    },
  );

  const semSolucao = (mdX: number, mdY: number): PilarResultado => ({
    avisos,
    memoria,
    nd,
    lambdaX,
    lambdaY,
    mdX,
    mdY,
    asNecessaria: NaN,
    barras: { n: 0, phi: 0, area: 0, porFaceX: 0, porFaceY: 0 },
    estribo: { phi: 0, espacamento: 0 },
    taxa: NaN,
  });

  if (!(e.nk > 0)) {
    avisos.push(`${e.nome}: Nk = ${e.nk} kN; só pilar comprimido é dimensionado`);
    return semSolucao(NaN, NaN);
  }
  const lambdaMax = Math.max(lambdaX, lambdaY);
  if (lambdaMax > LAMBDA_MAX_MN) {
    memoria.push({ descricao: "Esbeltez máxima", valor: lambdaMax, ref: REF_LAMBDA_MAX });
    avisos.push(
      `${e.nome}: λ = ${lambdaMax.toFixed(1)} > ${LAMBDA_MAX_MN} exige o método geral (15.8.3.2 e 15.8.1), fora do escopo; aumente a seção`,
    );
    return semSolucao(NaN, NaN);
  }
  if (lambdaMax > 90)
    avisos.push(
      `${e.nome}: λ = ${lambdaMax.toFixed(1)} > 90: pilar-padrão acoplado a diagramas M, N, 1/r com fluência (15.8.3.3.4 e 15.8.4), φ = ${COEF_FLUENCIA} e Nsg = Nk adotados [VERIFICAR]`,
    );

  const nu = nd / (ac * mat.fcd * KN_POR_MPA_CM2);
  memoria.push({
    descricao: "Força normal adimensional",
    formula: "ν = Nd/(Ac·fcd)",
    valor: nu,
    ref: REF_CURV,
  });

  /** Nd·ecc da fluência (15.8.4) numa direção com λ > 90, kN·m; null se Nsg ≥ Ne.
   *  Msg = maior momento característico de extremidade, sem αb e sem o mínimo (a
   *  imperfeição entra por ea). */
  const momentoFluencia = (
    eixo: "x" | "y",
    mTopoK: number,
    mBaseK: number,
    le: number,
    altura: number,
  ) => {
    const eci = moduloInicial(mat.fck);
    const ic = (ac * altura ** 2) / 12;
    const ne = forcaNe(eci, ic, le);
    const nsg = e.nk;
    const msg = Math.max(Math.abs(mTopoK), Math.abs(mBaseK));
    const ea = excentricidadeAcidental(le);
    const ecc = excentricidadeFluencia(msg, nsg, ea, COEF_FLUENCIA, ne);
    memoria.push(
      {
        descricao: `Módulo de elasticidade tangente inicial`,
        formula: "Eci = αE·5600·√fck",
        valor: eci,
        unidade: "MPa",
        ref: REF_ECI,
      },
      {
        descricao: `Momento de inércia da seção bruta (${eixo})`,
        formula: "Ic = b·h³/12, h na direção da flexão",
        valor: ic,
        unidade: "cm⁴",
        ref: REF_FLUENCIA,
      },
      {
        descricao: `Força de flambagem (${eixo})`,
        formula: "Ne = 10·Eci·Ic/le²",
        valor: ne,
        unidade: "kN",
        ref: REF_FLUENCIA,
      },
      {
        descricao: "Força normal quase permanente [VERIFICAR: Nk sem separar g e q, ψ2 = 1]",
        formula: "Nsg = Ngk + ψ2·Nqk ≤ Nk",
        valor: nsg,
        unidade: "kN",
        ref: "6118:2023 11.8.3 e 15.8.4",
      },
      {
        descricao: `Momento quase permanente (${eixo}) [VERIFICAR: ψ2 = 1]`,
        formula: "Msg = max(|Mk,topo|; |Mk,base|)",
        valor: msg,
        unidade: "kN·m",
        ref: "6118:2023 11.8.3 e 15.8.4",
      },
      {
        descricao: `Excentricidade acidental (${eixo}), H = le [VERIFICAR]`,
        formula: "ea = θ1·le/2, θ1 = 1/(100·√H) ≥ 1/300",
        valor: ea * 100,
        unidade: "cm",
        ref: REF_EA,
      },
      {
        descricao: "Coeficiente de fluência [VERIFICAR Tabela 8.2]",
        formula: "φ(t∞, t0)",
        valor: COEF_FLUENCIA,
        ref: "6118:2023 8.2.11, Tabela 8.2",
      },
      {
        descricao: `Excentricidade de fluência (${eixo})`,
        formula: "ecc = (Msg/Nsg + ea)·(2,718^(φ·Nsg/(Ne − Nsg)) − 1)",
        valor: ecc === null ? NaN : ecc * 100,
        unidade: "cm",
        ref: REF_FLUENCIA,
      },
    );
    return ecc === null ? null : nd * ecc;
  };

  const direcao = (
    eixo: "x" | "y",
    mTopoK: number,
    mBaseK: number,
    le: number,
    altura: number,
    lambda: number,
  ): Direcao => {
    const mTopo = gama * mTopoK;
    const mBase = gama * mBaseK;
    const [ma, mb] = Math.abs(mTopo) >= Math.abs(mBase) ? [mTopo, mBase] : [mBase, mTopo];
    const m1dA = Math.abs(ma);
    const mMin = momentoMinimo(nd, altura);
    const e1 = (m1dA / nd) * 100;
    // 15.8.2 d): momento de 1ª ordem menor que o mínimo → αb = 1.
    const ab = m1dA < mMin ? 1 : alfaB(ma, mb);
    const lambda1 = esbeltezLimite(e1, altura, ab);
    const mn = lambda > 90;
    const curv = !mn && lambda > lambda1 ? curvaturaAproximada(nu, altura) : 0;
    const m2 = curv > 0 ? momentoSegundaOrdem(nd, le, curv) : 0;
    // Seção intermediária C: M1d,C = 0,6·MA + 0,4·MB ≥ 0,4·MA (= αb·M1d,A da Eq. 97),
    // comparado ao mínimo antes de somar M2d, como na Figura 70 da fonte. Fica ≥ a
    // Eq. 97 literal (αb·M1d,A + M2d), que não compara αb·M1d,A ao mínimo.
    const m1dC = alfaB(ma, mb) * m1dA;
    const c1 = Math.max(m1dC, mMin);
    const topo = Math.max(Math.abs(mTopo), mMin);
    const base = Math.max(Math.abs(mBase), mMin);
    const total = Math.max(topo, base, c1 + m2);
    memoria.push(
      {
        descricao: `Esbeltez (${eixo})`,
        formula: `λ${eixo} = 3,46·le${eixo}/${eixo === "x" ? "b" : "h"}`,
        valor: lambda,
        ref: REF_LAMBDA,
      },
      {
        descricao: `Momento de 1ª ordem de cálculo (${eixo}), maior extremidade`,
        formula: `M1d,A = γn·γf·max(|M${eixo},topo|; |M${eixo},base|)`,
        valor: m1dA,
        unidade: "kN·m",
        ref: REF_LAMBDA1,
      },
      {
        descricao: `Momento mínimo de 1ª ordem (${eixo})`,
        formula: "M1d,min = Nd·(0,015 + 0,03·h), h em m",
        valor: mMin,
        unidade: "kN·m",
        ref: REF_MMIN,
      },
      {
        descricao: `Coeficiente αb (${eixo})`,
        formula: "αb = 0,60 + 0,40·MB/MA, 0,40 ≤ αb ≤ 1; αb = 1 se M1d,A < M1d,min",
        valor: ab,
        ref: REF_LAMBDA1,
      },
      {
        descricao: `Esbeltez-limite (${eixo})`,
        formula: "λ1 = (25 + 12,5·e1/h)/αb, 35 ≤ λ1 ≤ 90, e1 = M1d,A/Nd",
        valor: lambda1,
        ref: REF_LAMBDA1,
      },
    );
    if (mn) {
      const mcc = momentoFluencia(eixo, mTopoK, mBaseK, le, altura);
      const c1mn = c1 + (mcc ?? NaN);
      memoria.push({
        descricao: `Momento de 1ª ordem na seção intermediária com fluência (${eixo})`,
        formula: "M1d,C = max(αb·M1d,A; M1d,min) + Nd·ecc",
        valor: c1mn,
        unidade: "kN·m",
        ref: REF_FLUENCIA,
      });
      return {
        lambda,
        topo,
        base,
        c1: c1mn,
        m2: NaN,
        total: NaN,
        temMomento: m1dA > 0,
        mn,
        le,
        instavel: mcc === null,
      };
    }
    if (m2 > 0)
      memoria.push(
        {
          descricao: `Curvatura aproximada (${eixo})`,
          formula: "1/r = 0,005/[h·(ν + 0,5)] ≤ 0,005/h",
          valor: curv,
          unidade: "1/cm",
          ref: REF_CURV,
        },
        {
          descricao: `Momento de 2ª ordem (${eixo})`,
          formula: "M2d = Nd·le²/10·(1/r)",
          valor: m2,
          unidade: "kN·m",
          ref: REF_CURV,
        },
      );
    else
      memoria.push({
        descricao: `Sem 2ª ordem local (${eixo}): λ ≤ λ1`,
        valor: 0,
        unidade: "kN·m",
        ref: REF_LAMBDA1,
      });
    memoria.push({
      descricao: `Momento total de cálculo (${eixo})`,
      formula: "Md,tot = max(M1d,A; M1d,min; max(M1d,C; M1d,min) + M2d)",
      valor: total,
      unidade: "kN·m",
      ref: REF_SECAO_C,
    });
    return { lambda, topo, base, c1, m2, total, temMomento: m1dA > 0, mn, le, instavel: false };
  };

  // [VERIFICAR] O momento de topo de uma direção é combinado com o de topo da outra
  // (idem base); a entrada não diz se os máximos ocorrem na mesma extremidade.
  const dx = direcao("x", e.mxTopo, e.mxBase, e.lex, b, lambdaX);
  const dy = direcao("y", e.myTopo, e.myBase, e.ley, h, lambdaY);
  if (dx.instavel || dy.instavel) {
    avisos.push(`${e.nome}: Nsg ≥ Ne, a fluência leva à instabilidade (15.8.4); aumente a seção`);
    return semSolucao(NaN, NaN);
  }

  const t: TensoesCalculo = { sigmaCd: mat.sigmaCd, fyd: mat.fyd, es: mat.es };
  // As,max = 8% Ac no total, metade em cada face (inclui emendas, 17.3.5.3.2).
  const asMaxFace = 0.04 * ac;
  // Flexão em x: altura b, largura h.
  const secaoX: SecaoRetangular = { b: h, h: b, dl: dLinha };
  const secaoY: SecaoRetangular = { b, h, dl: dLinha };
  let asf: number | null;
  // armadura por face que o cálculo supôs em cada direção (para o arranjo)
  let reqX = 0;
  let reqY = 0;
  // Pilar-padrão acoplado da direção com λ > 90 e asf por face; null = sem equilíbrio.
  const equilibrio = (d: Direcao, s: SecaoRetangular, a: number) =>
    momentoTotalMN(nd, d.c1, d.le, s, camadasSimetricas(s, a), t);
  // Momento da seção intermediária com a 2ª ordem: acoplado (λ > 90) ou aproximado.
  const momentoC = (d: Direcao, s: SecaoRetangular, a: number) =>
    d.mn ? (equilibrio(d, s, a)?.mTot ?? null) : d.c1 + d.m2;
  if (dx.mn || dy.mn) {
    memoria.push({
      descricao: "Tensão de pico do concreto no diagrama M, N, 1/r [VERIFICAR formulação de γf3]",
      formula: `0,85·fcd/γf3, γf3 = ${GAMA_F3}`,
      valor: mat.sigmaCd / GAMA_F3,
      unidade: "MPa",
      ref: REF_MN,
    });
    if (dx.temMomento && dy.temMomento) {
      asf = menorArmaduraMN(asMaxFace, (a) => {
        const cx = momentoC(dx, secaoX, a);
        const cy = momentoC(dy, secaoY, a);
        if (cx === null || cy === null) return false;
        const situacoes: [number, number][] = [
          [dx.topo, dy.topo],
          [dx.base, dy.base],
          [cx, dy.c1],
          [dx.c1, cy],
        ];
        return situacoes.every(([mx, my]) => indiceObliquo6118(nd, mx, my, secaoX, a, t) <= 1);
      });
      reqX = asf ?? 0;
      reqY = asf ?? 0;
      memoria.push({
        descricao:
          "Armadura por face, flexão oblíqua no topo, na base e na seção intermediária (2ª ordem em x e em y), com o pilar-padrão acoplado na direção com λ > 90",
        formula: `(Mxd/MRx)^${ALFA_OBLIQUA_6118} + (Myd/MRy)^${ALFA_OBLIQUA_6118} ≤ 1 e equilíbrio M, N, 1/r`,
        valor: asf ?? NaN,
        unidade: "cm²",
        ref: `${REF_OBLIQUA}; ${REF_MN}`,
      });
    } else {
      // Menor armadura com equilíbrio no pilar-padrão acoplado e MRd(Nd) ≥ Md nas três seções.
      const porDirecao = (d: Direcao, s: SecaoRetangular) =>
        d.mn
          ? menorArmaduraMN(asMaxFace, (a) => {
              const c = momentoC(d, s, a);
              const mrd = momentoResistentePR(nd, s, camadasSimetricas(s, a), t) ?? -Infinity;
              return c !== null && mrd >= Math.max(d.topo, d.base, c);
            })
          : armaduraSimetricaPR(nd, d.total, s, t, asMaxFace);
      const asx = porDirecao(dx, secaoX);
      const asy = porDirecao(dy, secaoY);
      asf = asx === null || asy === null ? null : Math.max(asx, asy);
      reqX = asx ?? 0;
      reqY = asy ?? 0;
      const formula = (d: Direcao, eixo: "x" | "y") =>
        d.mn
          ? `menor As com equilíbrio M = M1d,C + Nd·(1/r)·le²/10 e MR(Nd) ≥ Md,tot,${eixo}`
          : `MR(Nd) ≥ Md,tot,${eixo}`;
      memoria.push(
        {
          descricao: "Armadura por face, flexo-compressão normal em x",
          formula: formula(dx, "x"),
          valor: asx ?? NaN,
          unidade: "cm²",
          ref: dx.mn ? `${REF_MN}; ${REF_FLEXAO}` : REF_FLEXAO,
        },
        {
          descricao: "Armadura por face, flexo-compressão normal em y",
          formula: formula(dy, "y"),
          valor: asy ?? NaN,
          unidade: "cm²",
          ref: dy.mn ? `${REF_MN}; ${REF_FLEXAO}` : REF_FLEXAO,
        },
      );
    }
  } else if (dx.temMomento && dy.temMomento) {
    const situacoes: [string, number, number][] = [
      ["topo", dx.topo, dy.topo],
      ["base", dx.base, dy.base],
      ["seção intermediária, 2ª ordem em x", dx.c1 + dx.m2, dy.c1],
      ["seção intermediária, 2ª ordem em y", dx.c1, dy.c1 + dy.m2],
    ];
    asf = 0;
    for (const [nome, mxd, myd] of situacoes) {
      const a = armaduraObliqua6118(nd, mxd, myd, secaoX, t, asMaxFace);
      memoria.push({
        descricao: `Armadura por face, flexão oblíqua (${nome}: Mxd = ${mxd.toFixed(2)}, Myd = ${myd.toFixed(2)} kN·m)`,
        formula: `(Mxd/MRx)^${ALFA_OBLIQUA_6118} + (Myd/MRy)^${ALFA_OBLIQUA_6118} ≤ 1`,
        valor: a ?? NaN,
        unidade: "cm²",
        ref: REF_OBLIQUA,
      });
      asf = a === null || asf === null ? null : Math.max(asf, a);
    }
    // a verificação oblíqua usa asf nas duas direções
    reqX = asf ?? 0;
    reqY = asf ?? 0;
  } else {
    const asx = armaduraSimetricaPR(nd, dx.total, secaoX, t, asMaxFace);
    const asy = armaduraSimetricaPR(nd, dy.total, { b, h, dl: dLinha }, t, asMaxFace);
    asf = asx === null || asy === null ? null : Math.max(asx, asy);
    reqX = asx ?? 0;
    reqY = asy ?? 0;
    memoria.push(
      {
        descricao: "Armadura por face, flexo-compressão normal em x",
        formula: "MR(Nd) ≥ Md,tot,x",
        valor: asx ?? NaN,
        unidade: "cm²",
        ref: REF_FLEXAO,
      },
      {
        descricao: "Armadura por face, flexo-compressão normal em y",
        formula: "MR(Nd) ≥ Md,tot,y",
        valor: asy ?? NaN,
        unidade: "cm²",
        ref: REF_FLEXAO,
      },
    );
  }
  // Momento total da direção; com λ > 90 sai do equilíbrio com a armadura achada.
  const totalFinal = (d: Direcao, eixo: "x" | "y", s: SecaoRetangular, a: number) => {
    if (!d.mn) return d.total;
    const r: PilarPadraoMN | null = asf === null ? null : equilibrio(d, s, a);
    if (r === null) return NaN;
    const total = Math.max(d.topo, d.base, r.mTot);
    memoria.push(
      {
        descricao: `Curvatura da seção intermediária no diagrama M, N, 1/r (${eixo}), As,face = ${a.toFixed(2)} cm²`,
        formula: "menor 1/r com M(Nd; 1/r) = M1d,C + Nd·(1/r)·le²/10",
        valor: r.curvatura,
        unidade: "1/cm",
        ref: REF_MN,
      },
      {
        descricao: `Momento de 2ª ordem (${eixo}) no equilíbrio do pilar-padrão acoplado`,
        formula: "M2d = Nd·(1/r)·le²/10",
        valor: r.m2,
        unidade: "kN·m",
        ref: REF_MN,
      },
      {
        descricao: `Momento total de cálculo (${eixo})`,
        formula: "Md,tot = max(M1d,A; M1d,min; M1d,C + M2d), M1d,C com Nd·ecc",
        valor: total,
        unidade: "kN·m",
        ref: `${REF_MN}; ${REF_FLUENCIA}`,
      },
    );
    return total;
  };
  const mdX = totalFinal(dx, "x", secaoX, reqX);
  const mdY = totalFinal(dy, "y", secaoY, reqY);
  if (asf === null) {
    avisos.push(
      dx.mn || dy.mn
        ? `${e.nome}: sem equilíbrio no pilar-padrão acoplado ou armadura acima do máximo (8% de Ac com emendas), aumente a seção`
        : `${e.nome}: armadura excede o máximo (8% de Ac com emendas), aumente a seção`,
    );
    return semSolucao(mdX, mdY);
  }

  const asMin = Math.max((0.15 * nd) / (mat.fyd * KN_POR_MPA_CM2), 0.004 * ac);
  const asNecessaria = Math.max(2 * asf, asMin);
  memoria.push(
    {
      descricao: "Armadura mínima",
      formula: "As,min = 0,15·Nd/fyd ≥ 0,004·Ac",
      valor: asMin,
      unidade: "cm²",
      ref: REF_AS_MIN,
    },
    {
      descricao: "Armadura total necessária",
      formula: "As = max(2·As,face; As,min)",
      valor: asNecessaria,
      unidade: "cm²",
      ref: REF_AS_MIN,
    },
    {
      descricao: "Armadura máxima fora das emendas (com traspasse dobra para 8%)",
      formula: "As,max = 0,04·Ac",
      valor: 0.04 * ac,
      unidade: "cm²",
      ref: REF_AS_MAX,
    },
  );
  if (asNecessaria > 0.04 * ac)
    avisos.push(
      `${e.nome}: armadura ${((asNecessaria / ac) * 100).toFixed(1)}% de Ac > 4%; com emendas por traspasse passa de 8% (17.3.5.3.2)`,
    );

  const escolha = escolheBarras(asNecessaria, 10, 4, 20);
  if (escolha === null) {
    avisos.push(`${e.nome}: barras não cabem (mais de 20 φ 32)`);
    return { ...semSolucao(mdX, mdY), asNecessaria };
  }
  const nPar = escolha.n % 2 === 1 ? escolha.n + 1 : escolha.n;
  // Direção predominante: a de maior armadura por face; empatadas, a de maior Md/altura.
  const predominante =
    Math.abs(reqX - reqY) > 1e-6 ? (reqX > reqY ? "x" : "y") : mdX / b >= mdY / h ? "x" : "y";
  const arranjo = arranjoPilar6118(b, h, dLinha, escolha.phi, nPar, reqX, reqY, predominante);
  const n = arranjo.n;
  const barras: BarrasPilar = {
    n,
    phi: escolha.phi,
    area: n * areaBarra(escolha.phi),
    porFaceX: arranjo.porFaceX,
    porFaceY: arranjo.porFaceY,
  };
  memoria.push(
    {
      descricao: `Arranjo: ${arranjo.porFaceX} barras em cada face de ${h} cm (armam Mx) e ${arranjo.porFaceY} em cada face de ${b} cm (armam My), cantos comuns; predominante ${predominante}`,
      formula: "n = 2·nFace,x + 2·nFace,y − 4; nFace·Aφ ≥ As,face da direção",
      valor: n,
      ref: REF_ARRANJO,
    },
    {
      descricao: `Espaçamento entre eixos: ${arranjo.sFaceX.toFixed(1)} cm (faces de ${h} cm), ${arranjo.sFaceY.toFixed(1)} cm (faces de ${b} cm)`,
      formula: "s ≤ min(2·bmin; 40 cm)",
      valor: arranjo.sMax,
      unidade: "cm",
      ref: REF_ARRANJO,
    },
  );
  if (arranjo.extrasEspacamento > 0)
    avisos.push(
      `${e.nome}: ${arranjo.extrasEspacamento} barra(s) φ ${escolha.phi} intermediária(s) acrescentada(s) para o espaçamento entre eixos ≤ ${arranjo.sMax} cm (18.4.2.2)`,
    );
  const livre = Math.min(arranjo.sFaceX, arranjo.sFaceY) - escolha.phi / 10;
  if (livre < espacamentoLivreMinimo(escolha.phi))
    avisos.push(
      `${e.nome}: espaçamento livre ${livre.toFixed(1)} cm < ${espacamentoLivreMinimo(escolha.phi).toFixed(2)} cm entre as barras (18.4.2.2); as ${n} φ ${escolha.phi} não cabem no arranjo, aumente a seção ou a bitola`,
    );
  if (barras.phi > (bMin * 10) / 8)
    avisos.push(
      `${e.nome}: φ ${barras.phi} mm > b/8 = ${((bMin * 10) / 8).toFixed(1)} mm (18.4.2.1)`,
    );
  const estribo = estriboPilar(barras.phi, bMin, mat.aco);
  memoria.push(
    {
      descricao: `Barras: ${n} φ ${barras.phi} mm`,
      formula: "10 mm ≤ φ ≤ b/8, n par ≥ 4",
      valor: barras.area,
      unidade: "cm²",
      ref: REF_PHI,
    },
    {
      descricao: `Estribo φ ${estribo.phi} mm`,
      formula: `φt ≥ max(5 mm; φ/4); s ≤ min(20 cm; b; ${mat.aco === "CA-25" ? 24 : 12}φ)`,
      valor: estribo.espacamento,
      unidade: "cm",
      ref: REF_ESTRIBO,
    },
  );

  return {
    avisos,
    memoria,
    nd,
    lambdaX,
    lambdaY,
    mdX,
    mdY,
    asNecessaria,
    barras,
    estribo,
    taxa: (barras.area / ac) * 100,
  };
}

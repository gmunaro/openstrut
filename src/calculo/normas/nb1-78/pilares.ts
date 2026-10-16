// Dimensionamento de pilar retangular pela NB-1/78, como a V1 (PILEDCAL.BM,
// PeDimensionaArranjo; fórmulas de PILCALC.BM). Convenção da V1: Mx flete na direção x,
// cuja altura é b (λx = 3,464·lex/b); My flete na direção y, altura h.
// A V1 trata 0,15 tf/cm² como 15 MPa (1 tf = 10 kN); com tensões em MPa e Es =
// 210 000 MPa a física é a mesma.
import { num, numAte } from "../../texto";
import type {
  Barra,
  BarrasPilar,
  Etapa,
  MateriaisCalc,
  PilarEntrada,
  PilarResultado,
} from "../../tipos";
import {
  ALFA_OBLIQUA,
  armaduraObliqua,
  armaduraSimetrica,
  type ClasseAco,
  epsYd,
  type SecaoRetangular,
  type TensoesCalculo,
} from "../../pilares/flexaoComposta";
import { type Camada, momentoResistentePR } from "../../pilares/secaoParabolaRetangulo";
import { GAMA_F } from "./materiais";

const REF_CALC = "V1 PILCALC.BM";
const REF_DIM = "V1 PILEDCAL.BM";

/** Menor dimensão abaixo da qual o pilar recebe aviso, cm. [VERIFICAR] valor
 *  conservador; o texto da NB-1/78 não está nas fontes. */
export const DIMENSAO_MINIMA = 20;

/** Parâmetros do PILAR.INI padrão da V1 (PeParam#): λ a partir do qual entra a
 *  fluência, λ máximo aceito e o "Mult. Fluencia". */
export const LAMBDA_FLUENCIA = 80;
export const LAMBDA_MAXIMO = 140;
export const MULT_FLUENCIA = 1.1;

/** Índice de esbeltez λ = 3,464·le/h (seção retangular); le em m, h em cm. */
export const esbeltez = (le: number, h: number) => (3.464 * le * 100) / h;

/** Excentricidade acidental ea = max(h/30; 2 cm), cm. */
export const excentricidadeAcidental = (h: number) => Math.max(h / 30, 2);

/** Excentricidade de 2ª ordem e2 (cm), nula para λ ≤ 40:
 *  e2 = le²/10 · (0,0035 + εyd) / ((ν + 0,5)·h), ν = Nd/(Ac·fcd), ν + 0,5 ≥ 1;
 *  εyd = fyd/Es, ou fyd/Es + 2‰ no aço classe B (V1 PcE2#, PcEpsYd#).
 *  le em m, h em cm, nd em kN, ac em cm², tensões em MPa. */
export function excentricidadeSegundaOrdem(
  le: number,
  h: number,
  nd: number,
  ac: number,
  mat: Pick<MateriaisCalc, "fcd" | "fyd" | "es">,
  classe: ClasseAco = "A",
) {
  if (esbeltez(le, h) <= 40) return 0;
  const nu = nd / (ac * mat.fcd * 0.1);
  const nuMais05 = Math.max(nu + 0.5, 1);
  const leCm = le * 100;
  return (
    (((leCm * leCm) / 10) * (0.0035 + epsYd({ fyd: mat.fyd, es: mat.es, classe }))) / (nuMais05 * h)
  );
}

/** Fator de fluência sobre e2 (V1 PeFluencia#): 1 até λ = 80; acima, o maior entre o
 *  Mult. Fluencia (1,1) e a rampa 1 + 0,25·(λ − 80)/60, limitado a 1,25.
 *  Reconstrução da V1 (o original mostra um "Mflu" de 1,1 a 1,25 sem lei conhecida). */
export function fatorFluencia(lambda: number) {
  if (lambda <= LAMBDA_FLUENCIA) return 1;
  const rampa = 1 + (0.25 * (lambda - LAMBDA_FLUENCIA)) / (LAMBDA_MAXIMO - LAMBDA_FLUENCIA);
  return Math.max(MULT_FLUENCIA, Math.min(rampa, 1.25));
}

/** Lado do quadrado de mesma área de um pilar circular de diâmetro D: D·√π/2 (V1). */
export const ladoQuadradoEquivalente = (diametro: number) => (diametro * Math.sqrt(Math.PI)) / 2;

// ---- barras (iguais a V1 CALCCA.BM; candidatas a src/calculo/barras.ts) ------

const BITOLAS = [5, 6.3, 8, 10, 12.5, 16, 20, 25, 32];
const areaBarra = (phi: number) => (Math.PI * (phi / 10) ** 2) / 4;

/** CcaEscolheBarras: menor bitola ≥ phiMin com ceil(As/Aφ) (≥ nMin) ≤ nMax. */
function escolheBarras(asReq: number, phiMin: number, nMin: number, nMax: number) {
  for (const phi of BITOLAS) {
    if (phi < phiMin) continue;
    const n = Math.max(nMin, Math.ceil(asReq / areaBarra(phi)));
    if (n <= nMax) return { phi, n };
  }
  return { phi: 0, n: 0 };
}

/** Estribo: menor bitola ≥ φ/4 e ≥ 5 mm; s = min(30 cm; menor lado; ⌊12φ⌋). */
function escolheEstribo(phi: number, b: number, h: number): Barra {
  const phiT = BITOLAS.find((p) => p >= phi / 4 && p >= 5) ?? 5;
  let s = Math.min(30, b, h);
  if ((12 * phi) / 10 < s) s = Math.floor((12 * phi) / 10);
  return { phi: phiT, espacamento: s };
}

// ---- arranjo real das barras (V1 PeArranjo, PeCamadasFace, PeArranjoOk%) -------

/** Distribuição de n barras (par, ≥ 4) nas 4 faces (V1 PeArranjo): uma em cada canto
 *  e os (n − 4)/2 pares restantes repartidos entre as faces perpendiculares a x
 *  (nfx barras em cada, cantos incluídos; resistem a Mx) e a y (nfy), na proporção
 *  das áreas por face asx e asy da flexão normal. Sem demanda, a metade maior vai
 *  para as faces mais longas. Reconstrução da V1 (o original não mostra a regra). */
export function arranjoBarras(n: number, asx: number, asy: number, b: number, h: number) {
  const e = Math.max(0, Math.floor((n - 4) / 2));
  const ax = Math.max(asx, 0);
  const ay = Math.max(asy, 0);
  let ex: number;
  if (ax + ay > 0) ex = Math.floor((e * ax) / (ax + ay) + 0.5);
  else ex = h >= b ? Math.floor((e + 1) / 2) : Math.floor(e / 2);
  return { nfx: 2 + ex, nfy: 2 + e - ex };
}

/** Camadas na direção de altura hh (V1 PeCamadasFace): as duas faces extremas com
 *  nfFace barras cada e, entre elas, as nfOutra − 2 barras intermediárias de cada uma
 *  das outras duas faces (2 por profundidade), igualmente espaçadas de dl a hh − dl. */
export function camadasFace(
  hh: number,
  dl: number,
  nfFace: number,
  nfOutra: number,
  ab: number,
): Camada[] {
  const camadas = [
    { as: nfFace * ab, y: dl },
    { as: nfFace * ab, y: hh - dl },
  ];
  for (let i = 1; i <= nfOutra - 2; i++)
    camadas.push({ as: 2 * ab, y: dl + (i * (hh - 2 * dl)) / (nfOutra - 1) });
  return camadas;
}

/** O arranjo (nfx, nfy barras por face, área ab cada) resiste com as barras nas
 *  posições reais? (V1 PeArranjoOk%) Flexão normal: MRx ≥ Mdx e MRy ≥ Mdy;
 *  oblíqua: (Mdx/MRx)^1,2 + (Mdy/MRy)^1,2 ≤ 1. Pilar b × h (b na direção x). */
export function arranjoResiste(
  nd: number,
  mdx: number,
  mdy: number,
  obliqua: boolean,
  b: number,
  h: number,
  dl: number,
  nfx: number,
  nfy: number,
  ab: number,
  t: TensoesCalculo,
) {
  const mrx = momentoResistentePR(nd, { b: h, h: b, dl }, camadasFace(b, dl, nfx, nfy, ab), t);
  const mry = momentoResistentePR(nd, { b, h, dl }, camadasFace(h, dl, nfy, nfx, ab), t);
  if (mrx === null || mry === null || mrx < 0 || mry < 0) return false;
  if (!obliqua) return mrx >= mdx && mry >= mdy;
  if (mrx <= 0 || mry <= 0) return false;
  return (mdx / mrx) ** ALFA_OBLIQUA + (mdy / mry) ** ALFA_OBLIQUA <= 1;
}

/** Dimensiona o pilar: Nd = γf·Nk; Md por direção = γf·|M| + Nd·(ea + e2·fluência)
 *  (com Nd ≤ 0, tração, ea e e2 não entram); flexão oblíqua se há momento de 1ª ordem
 *  nas duas direções, senão flexo-compressão (ou flexo-tração) normal em cada direção
 *  (vale a maior). Seção pela parábola-retângulo com pivôs e concreto descontado.
 *  Estimativa simétrica 2·As,face, mínima 0,8% (λ > 30) ou 0,5%, máxima 6%; barras
 *  φ ≥ 10 mm em número par ≥ 4, distribuídas nas 4 faces e verificadas nas posições
 *  reais: se o arranjo não passa, a área sobe até passar (V1 PeDimensionaArranjo).
 *  `dLinha` = distância da face ao centro da barra (d' = 4 cm na V1).
 *  `classe` = classe do aço longitudinal (B: diagrama e εyd da NB-1/78).
 *  Sem solução (λ > 140 ou seção insuficiente): asNecessaria = NaN e aviso. */
export function pilarNb178(
  e: PilarEntrada,
  mat: MateriaisCalc,
  dLinha: number,
  classe: ClasseAco = "A",
): PilarResultado {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const { b, h } = e;
  const ac = b * h;
  const nd = GAMA_F * e.nk;
  const lambdaX = esbeltez(e.lex, b);
  const lambdaY = esbeltez(e.ley, h);
  const lambda = Math.max(lambdaX, lambdaY);
  memoria.push(
    {
      descricao: "Força normal de cálculo",
      formula: `Nd = ${GAMA_F}·Nk`,
      valor: nd,
      unidade: "kN",
      ref: REF_DIM,
    },
    {
      descricao: "Esbeltez na direção x",
      formula: "λx = 3,464·lex/b",
      valor: lambdaX,
      ref: REF_CALC,
    },
    {
      descricao: "Esbeltez na direção y",
      formula: "λy = 3,464·ley/h",
      valor: lambdaY,
      ref: REF_CALC,
    },
  );
  if (classe === "B")
    memoria.push({
      descricao: "Aço classe B: diagrama curvo acima de 0,7 fyd e εyd = fyd/Es + 2‰",
      valor: epsYd({ fyd: mat.fyd, es: mat.es, classe }) * 1000,
      unidade: "‰",
      ref: REF_CALC,
    });

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

  // [VERIFICAR] Dimensão mínima e coeficiente para seção pequena: a V1 não tem e as
  // fontes de docs/norma não trazem o texto da NB-1/78. Regra conservadora: avisa
  // abaixo de 20 cm, sem majorar esforços (resultado igual ao da V1).
  if (Math.min(b, h) < DIMENSAO_MINIMA)
    avisos.push(
      `${e.nome}: menor dimensão ${numAte(Math.min(b, h), 1)} cm < ${DIMENSAO_MINIMA} cm; a NB-1/78 pede dimensão mínima e majoração para seção pequena (não aplicada, confira) [VERIFICAR]`,
    );

  if (lambda > LAMBDA_MAXIMO) {
    avisos.push(`${e.nome}: esbeltez máxima excedida (λ = ${num(lambda, 1)} > ${LAMBDA_MAXIMO})`);
    return semSolucao(NaN, NaN);
  }

  // A V1 tem um só momento por nível; aqui vale o maior entre topo e base.
  const mx = Math.max(Math.abs(e.mxTopo), Math.abs(e.mxBase));
  const my = Math.max(Math.abs(e.myTopo), Math.abs(e.myBase));
  if (nd <= 0)
    memoria.push({
      descricao: "Tração (Nd ≤ 0): ea e e2 não entram (reduziriam Md)",
      valor: nd,
      unidade: "kN",
      ref: REF_DIM,
    });
  const direcao = (eixo: "x" | "y", m: number, le: number, altura: number, lam: number) => {
    if (nd <= 0) {
      const md = GAMA_F * m;
      memoria.push({
        descricao: `Momento de cálculo (${eixo})`,
        formula: `Md = ${GAMA_F}·|M|`,
        valor: md,
        unidade: "kN·m",
        ref: REF_DIM,
      });
      return md;
    }
    const ea = excentricidadeAcidental(altura);
    const e2 = excentricidadeSegundaOrdem(le, altura, nd, ac, mat, classe);
    const flu = fatorFluencia(lam);
    const md = GAMA_F * m + (nd * (ea + e2 * flu)) / 100;
    memoria.push(
      {
        descricao: `Excentricidade acidental (${eixo})`,
        formula: "ea = max(altura/30; 2 cm)",
        valor: ea,
        unidade: "cm",
        ref: REF_CALC,
      },
      {
        descricao: `Excentricidade de 2ª ordem (${eixo})`,
        formula: "e2 = le²/10·(0,0035 + εyd)/((ν + 0,5)·altura), ν + 0,5 ≥ 1; 0 se λ ≤ 40",
        valor: e2,
        unidade: "cm",
        ref: REF_CALC,
      },
      {
        descricao: `Fator de fluência (${eixo})`,
        formula: `1 se λ ≤ ${LAMBDA_FLUENCIA}; senão max(${MULT_FLUENCIA}; 1 + 0,25·(λ − ${LAMBDA_FLUENCIA})/${LAMBDA_MAXIMO - LAMBDA_FLUENCIA}) ≤ 1,25`,
        valor: flu,
        ref: REF_DIM,
      },
      {
        descricao: `Momento de cálculo (${eixo})`,
        formula: `Md = ${GAMA_F}·|M| + Nd·(ea + e2·fluência)`,
        valor: md,
        unidade: "kN·m",
        ref: REF_DIM,
      },
    );
    return md;
  };
  const mdX = direcao("x", mx, e.lex, b, lambdaX);
  const mdY = direcao("y", my, e.ley, h, lambdaY);

  const t: TensoesCalculo = { sigmaCd: mat.sigmaCd, fyd: mat.fyd, es: mat.es, classe };
  // Flexão em x: altura b, largura h.
  const secaoX: SecaoRetangular = { b: h, h: b, dl: dLinha };
  const obliqua = mx !== 0 && my !== 0;
  const asx = armaduraSimetrica(nd, mdX, secaoX, t);
  const asy = armaduraSimetrica(nd, mdY, { b, h, dl: dLinha }, t);
  let asf: number | null;
  if (obliqua) {
    asf = armaduraObliqua(nd, mdX, mdY, secaoX, t);
    memoria.push({
      descricao: "Armadura por face, flexão oblíqua (estimativa em duas faces)",
      formula: "(Mxd/MRx)^1,2 + (Myd/MRy)^1,2 ≤ 1",
      valor: asf ?? NaN,
      unidade: "cm²",
      ref: REF_CALC,
    });
  } else {
    asf = asx === null || asy === null ? null : Math.max(asx, asy);
    memoria.push({
      descricao: "Armadura por face, flexão composta normal (maior das direções)",
      formula: "MR(Nd) ≥ Md em x e em y",
      valor: asf ?? NaN,
      unidade: "cm²",
      ref: REF_CALC,
    });
  }
  if (asf === null) {
    avisos.push(`${e.nome}: armadura excede o máximo, aumente a seção`);
    return semSolucao(mdX, mdY);
  }

  const taxaMin = lambda > 30 ? 0.008 : 0.005;
  const asMin = taxaMin * ac;
  let asNecessaria = Math.max(2 * asf, asMin);
  memoria.push(
    {
      descricao: "Armadura mínima",
      formula: `As,min = ${numAte(taxaMin * 100, 2)} %·Ac (0,8 % se λ > 30)`,
      valor: asMin,
      unidade: "cm²",
      ref: REF_DIM,
    },
    {
      descricao: "Armadura total estimada",
      formula: "As = max(2·As,face; As,min)",
      valor: asNecessaria,
      unidade: "cm²",
      ref: REF_DIM,
    },
  );

  // Arranjo real: escolhe as barras, distribui nas 4 faces e verifica; se não passa,
  // tenta a área seguinte (até 60 vezes, como a V1).
  let asTentativa = asNecessaria;
  let phi = 0;
  let n = 0;
  let faces = { nfx: 0, nfy: 0 };
  let ok = false;
  let tentativas = 0;
  while (tentativas < 60) {
    tentativas++;
    const escolha = escolheBarras(asTentativa, 10, 4, 20);
    phi = escolha.phi;
    if (phi === 0) break;
    n = escolha.n % 2 === 1 ? escolha.n + 1 : escolha.n;
    faces = arranjoBarras(n, asx ?? 0, asy ?? 0, b, h);
    if (
      arranjoResiste(nd, mdX, mdY, obliqua, b, h, dLinha, faces.nfx, faces.nfy, areaBarra(phi), t)
    ) {
      ok = true;
      break;
    }
    asTentativa = n * areaBarra(phi) + 0.01;
  }
  if (phi === 0) {
    n = 0;
    avisos.push(`${e.nome}: barras não cabem (mais de 20)`);
  } else if (!ok) {
    avisos.push(`${e.nome}: arranjo de barras não verificado`);
  } else if (tentativas > 1) {
    asNecessaria = n * areaBarra(phi);
    memoria.push({
      descricao: "Armadura total necessária: área do primeiro arranjo que passa",
      formula: "a estimativa não resistia com as barras nas posições reais",
      valor: asNecessaria,
      unidade: "cm²",
      ref: REF_DIM,
    });
  }
  if (asNecessaria > 0.06 * ac)
    avisos.push(`${e.nome}: armadura excede o máximo (6%), aumente a seção`);

  // o arranjo verificado por arranjoResiste segue no resultado para o detalhamento
  const barras: BarrasPilar = {
    n,
    phi,
    area: n * areaBarra(phi),
    porFaceX: n > 0 ? faces.nfx : 0,
    porFaceY: n > 0 ? faces.nfy : 0,
  };
  const estribo = escolheEstribo(phi, b, h);
  memoria.push(
    {
      descricao: `Barras: ${n} φ ${phi} mm; ${faces.nfx} por face ⟂ x e ${faces.nfy} por face ⟂ y (cantos incluídos)`,
      formula: obliqua
        ? "φ ≥ 10 mm, n par ≥ 4, n ≤ 20; (Mxd/MRx)^1,2 + (Myd/MRy)^1,2 ≤ 1 com as barras nas posições reais"
        : "φ ≥ 10 mm, n par ≥ 4, n ≤ 20; MR ≥ Md com as barras nas posições reais",
      valor: barras.area,
      unidade: "cm²",
      ref: REF_DIM,
    },
    {
      descricao: `Estribo φ ${estribo.phi} mm`,
      formula: "φt ≥ max(φ/4; 5 mm); s ≤ min(30 cm; menor lado; 12φ)",
      valor: estribo.espacamento,
      unidade: "cm",
      ref: REF_DIM,
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

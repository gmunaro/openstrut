// Dimensionamento de viga do SISTRUT 4.0 (DESDIM, FUN_1000_13f7): flexão por apoio e
// por tramo (seção T, armadura dupla, As,mín), cisalhamento com ψ = 0,225 + 15ρ,
// estribos, flecha e fissuração; e o adaptador que monta os esforços do DESDIM a
// partir da análise (DESCALC: cortantes com alívio junto ao apoio).
// Fonte: V1 nova, `_Arquivo/Sistrust/dist/src-original/desenho/DESDIM.BAS`;
// livros_arm_forma_des.md 1 e 4.3 (U03, U04-005, U05-007/010); PLANO D1-D6, R8, R9, H.
// Unidades do original: m e t nos esforços, cm e t/cm² nas seções, M em t·cm dentro
// do dimensionamento.
import { atribuicao } from "../base/f32";
import type {
  CisalhamentoViga,
  DimensionaViga,
  DimensionamentoViga,
  DivisaoCarga,
  EntradaDesdim,
  EnvoltoriaTramo,
  FlexaoViga,
  ModoSistrut,
  SecaoViga,
  TramoDimensionado,
} from "../base/tipos";
import type { Etapa } from "../../tipos";
import {
  type BarrasArranjo,
  areaBitola,
  arranjoCompressao,
  arranjoTracao,
  leArranjo,
} from "./desdim-barras";
import {
  type EstriboLado,
  aswCortante,
  bitolasEstriboViga,
  estribosLadoALado,
  estriboLado,
} from "./desdim-cisalhamento";
import { type SecaoCalculo, flexaoSecao, taxaArmaduraMinima, xiLimite } from "./desdim-flexao";
import { type Fissuracao, fissuracao, flechaEJ, flechaTramo, moduloEc } from "./desdim-flecha";

/** Coeficientes de medida e de força do DESENHO.INI (V_0fa2, V_0fa6; DESENHO.BAS:680-681,
 *  754-756). O INI de fábrica dá 1 e 1; o .DSP não os tem. */
const COEFICIENTE_MEDIDA = 1;
const COEFICIENTE_FORCA = 1;

// ---------------------------------------------------------------- adaptador análise → DESDIM

/** Esforços de um tramo como o DESDIM os usa. Índice do original: 0 = balanço esquerdo,
 *  1..n = tramos, n + 1 = balanço direito. */
export interface EsforcosTramoDesdim {
  indice: number;
  /** Vão, m. */
  vao: number;
  /** M+ (tm) e a sua abscissa x (m); 0 nos balanços. */
  mPositivo: number;
  x: number;
  /** Cortantes nas extremidades sem alívio (A_1796), t, em módulo. */
  ve: number;
  vd: number;
  /** Cortantes característicos com alívio (A_1540), t, em módulo. */
  vkEsquerda: number;
  vkDireita: number;
  /** Cortante à esquerda e momento no apoio esquerdo do carregamento do M+ (A_17c4(t,0)
   *  e A_17c4(t,1)), t e tm: os da flecha. Sem envoltória, os da análise estática. */
  veFlecha: number;
  mEsquerdo: number;
  divisoes: readonly DivisaoCarga[];
}

/** Envoltória com o carregamento do M+ máximo (xadrez por paridade, DESDIM.BAS:
 *  6262-6265), que o contrato `EnvoltoriaTramo` não tem. Se a análise trouxer estes
 *  campos, a flecha os usa; senão eles são reconstruídos de x e M+. */
export interface EnvoltoriaComCarregamento extends EnvoltoriaTramo {
  veCarregamento?: number;
  mEsquerdoCarregamento?: number;
}

/** Ve e M esquerdo do carregamento que dá o M+ (x, m) da envoltória, com as cargas
 *  TOTAIS do tramo (L_55a83 recalcula x e M+ com elas, DESDIM.BAS:6270-6276): Ve é a
 *  carga até x (o cortante zera em x) e Me = M+ − Ve·x + momento das cargas até x.
 *  Não há solução única quando o zero cai sob uma concentrada (x = d): devolve
 *  undefined. */
export function carregamentoDoMaximo(divisoes: readonly DivisaoCarga[], x: number, m: number) {
  let ve = 0;
  let momento = 0;
  let anterior = 0;
  for (const d of divisoes) {
    if (x < d.d) {
      ve += (x - anterior) * d.p;
      momento += ((x - anterior) ** 2 * d.p) / 2;
      return { ve, mEsquerdo: m - ve * x + momento };
    }
    if (x === d.d) return undefined;
    ve += (d.d - anterior) * d.p + d.f;
    momento += (d.d - anterior) * d.p * (x - (d.d + anterior) / 2) + d.f * (x - d.d);
    anterior = d.d;
  }
  return undefined;
}

export interface EsforcosDesdim {
  /** M de cada apoio 0..n, tm (negativo = tração em cima). */
  momentosApoio: number[];
  /** Tramos na ordem 1 − balE .. n + balD. */
  tramos: EsforcosTramoDesdim[];
  avisos: string[];
}

/** Seção de cálculo de um índice de tramo do original. Balanço sem seção própria
 *  herda bw e hw do apoio vizinho (A_1260(MAX(0, t − 1)), DESDIM.BAS:2919-2929). */
export function secaoDoTramo(entrada: EntradaDesdim, indice: number): SecaoViga {
  const n = entrada.viga.tramos.length;
  const { secoes } = entrada;
  const propria =
    indice === 0
      ? secoes.balancoEsquerdo
      : indice === n + 1
        ? secoes.balancoDireito
        : secoes.tramos[indice - 1];
  if (propria && propria.bw > 0 && propria.hw > 0) return propria;
  const balanco = indice === 0 || indice === n + 1;
  const apoio = balanco ? secoes.apoios[Math.max(0, indice - 1)] : undefined;
  if (!apoio) throw new Error(`Viga ${entrada.viga.nome}: sem seção para o tramo ${indice}`);
  return { bw: apoio.bw, hw: apoio.hw, bf: propria?.bf ?? 0, hf: propria?.hf ?? 0 };
}

/** Alívio do cortante junto aos apoios (L_5602e, DESDIM.BAS:6503-6564; U05-007): tira a
 *  carga distribuída até h/2 da face do apoio (h do tramo, em cm: h/200 em m) e reduz a
 *  concentrada a menos de 2h por (a/2h − 1). No balanço esquerdo as divisões são
 *  percorridas de trás para a frente, com d medido a partir do apoio (DESDIM.BAS:5880). */
function aliviaCortantes(t: EsforcosTramoDesdim, h: number, n: number, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const meio = h / 200;
  const duasH = h / 50;
  let { vkEsquerda: ve, vkDireita: vd } = t;
  const L = t.vao;
  let anterior = 0;
  if (t.indice === 0) {
    for (const dv of [...t.divisoes].reverse()) {
      if (dv.d <= meio) vd = s(vd - (dv.d - anterior) * dv.p);
      if (meio > anterior && dv.d > meio) vd = s(vd - (meio - anterior) * dv.p);
      if (dv.d < duasH) vd = s(((dv.d / h) * 50 - 1) * dv.f + vd);
      anterior = dv.d;
    }
    return { vkEsquerda: ve, vkDireita: vd };
  }
  for (const dv of t.divisoes) {
    const { d, p: q, f } = dv;
    if (d <= meio) ve = s(ve - (d - anterior) * q);
    if (meio > anterior && d > meio) ve = s(ve - (meio - anterior) * q);
    if (d < duasH) ve = s((((n + 1 > t.indice ? -d : 0) + L) * f * ((d / h) * 50 - 1)) / L + ve);
    if (t.indice <= n) {
      if (L - anterior <= meio) vd = s(vd - (d - anterior) * q);
      if (L - d < meio && L - anterior > meio) vd = s(vd - (meio - (L - d)) * q);
      if (L - d < duasH) vd = s((f * d * (((L - d) / h) * 50 - 1)) / L + vd);
    }
    anterior = d;
  }
  return { vkEsquerda: ve, vkDireita: vd };
}

/** Adaptador análise → DESDIM: M dos apoios, M+ e x, cortantes com e sem alívio por
 *  tramo, a partir da `AnaliseViga` (DESCALC, DESDIM.BAS:6020-6035) e das cargas do
 *  .VIG. Com a envoltória de acidentais usa o M−, o M+, o x e o maior cortante dela
 *  (DESDIM.BAS:6270-6276, 6503-6510) e, na flecha, o carregamento do M+ máximo.
 *  Engastamento perfeito: o M+ vira o maior dos dois (DESDIM.BAS:2940-2952). */
export function esforcosDesdim(entrada: EntradaDesdim, modo: ModoSistrut): EsforcosDesdim {
  const s = atribuicao(modo);
  const { viga, analise, parametros } = entrada;
  const n = viga.tramos.length;
  const momentosApoio = analise.apoios.map((a) => a.mMax);
  const tramos: EsforcosTramoDesdim[] = [];
  const avisosAdaptador: string[] = [];
  const balE = viga.balancoEsquerdo;
  if (balE) {
    const carga = Math.abs(analise.balancoEsquerdo?.carga ?? 0);
    tramos.push({
      indice: 0,
      vao: balE.vao,
      mPositivo: 0,
      x: 0,
      ve: 0,
      vd: carga,
      vkEsquerda: 0,
      vkDireita: carga,
      veFlecha: 0,
      mEsquerdo: 0,
      divisoes: balE.divisoes,
    });
  }
  viga.tramos.forEach((tramo, i) => {
    const a = analise.tramos[i];
    if (!a) throw new Error(`Viga ${viga.nome}: análise sem o tramo ${i + 1}`);
    const env = a.envoltoria;
    const ep = analise.engastamentoPerfeito.find((e) => e.tramo === i + 1);
    let mPositivo = env ? env.mPositivo : a.mPositivo;
    if (ep && ep.mPositivo > mPositivo) mPositivo = ep.mPositivo;
    const ve = s(Math.max(Math.abs(a.ve), Math.abs(env?.ve ?? 0)));
    const vd = s(Math.max(Math.abs(a.vd), Math.abs(env?.vd ?? 0)));
    let veFlecha = a.ve;
    let mEsquerdo = analise.apoios[i]?.m ?? 0;
    if (env && env.x > 0) {
      const c: EnvoltoriaComCarregamento = env;
      const carregamento =
        c.veCarregamento !== undefined && c.mEsquerdoCarregamento !== undefined
          ? { ve: c.veCarregamento, mEsquerdo: c.mEsquerdoCarregamento }
          : carregamentoDoMaximo(tramo.divisoes, env.x, env.mPositivo);
      if (carregamento) {
        veFlecha = s(carregamento.ve);
        mEsquerdo = s(carregamento.mEsquerdo);
      } else {
        avisosAdaptador.push(
          `${viga.nome} tramo ${i + 1}: o M+ da envoltória cai sob uma concentrada; a flecha usou o Ve e o M da análise estática.`,
        );
      }
    }
    tramos.push({
      indice: i + 1,
      vao: tramo.vao,
      mPositivo,
      x: env ? env.x : a.x,
      ve,
      vd,
      vkEsquerda: ve,
      vkDireita: vd,
      veFlecha,
      mEsquerdo,
      divisoes: tramo.divisoes,
    });
  });
  const balD = viga.balancoDireito;
  if (balD) {
    const carga = Math.abs(analise.balancoDireito?.carga ?? 0);
    tramos.push({
      indice: n + 1,
      vao: balD.vao,
      mPositivo: 0,
      x: 0,
      ve: carga,
      vd: 0,
      vkEsquerda: carga,
      vkDireita: 0,
      veFlecha: carga,
      mEsquerdo: analise.apoios[n]?.m ?? 0,
      divisoes: balD.divisoes,
    });
  }
  if (parametros.alivioCortante) {
    for (const t of tramos) {
      const h = secaoDoTramo(entrada, t.indice).hw;
      Object.assign(t, aliviaCortantes(t, h, n, modo));
    }
  }
  return { momentosApoio, tramos, avisos: avisosAdaptador };
}

// ---------------------------------------------------------------- dimensionamento

/** Flexão de uma seção com o detalhe que o original guarda. */
export interface FlexaoDesdim extends FlexaoViga {
  /** Barras da armadura comprimida ("-" sem Asc). */
  arranjoCompressao: string;
  /** Arranjo lido como o original o guarda em A_128e/A_12bc (colunas 0..3). */
  barras: BarrasArranjo;
  ramo: "alma" | "mesa" | "dupla" | "nenhum";
}

/** Apoio k (0..n). Só os apoios do laço do original são dimensionados (internos; os
 *  extremos com balanço, engaste ou momento externo negativo). */
export interface ApoioDesdim extends FlexaoDesdim {
  apoio: number;
  dimensionado: boolean;
  fissuracao?: FissuracaoDesdim;
}

export interface FissuracaoDesdim {
  /** mm. */
  w1: number;
  w2: number;
  limite: number;
  ok: boolean;
}

export interface CisalhamentoDesdim extends CisalhamentoViga {
  /** Estribo de cada lado: bitola mínima ou máxima da viga, espaçamento e texto. */
  estriboEsquerda: EstriboLado;
  estriboDireita: EstriboLado;
}

export interface TramoDesdim extends TramoDimensionado {
  /** Índice do original (0 = balanço esquerdo, n + 1 = balanço direito). */
  indice: number;
  flexao: FlexaoDesdim;
  cisalhamento: CisalhamentoDesdim;
  /** Flecha como impressa (STR$: ".01"); "" nos balanços. */
  flechaTexto: string;
  /** EJ·f no x do M+, t·m³. */
  ejf: number;
  fissuracao?: FissuracaoDesdim;
}

export interface DimensionamentoDesdim extends DimensionamentoViga {
  tramos: TramoDesdim[];
  apoios: ApoioDesdim[];
  balancoEsquerdo?: TramoDesdim;
  balancoDireito?: TramoDesdim;
  /** Bitolas de estribo da viga (máxima para os esforços, mínima para o Asw mínimo). */
  bitolasEstribo: { maxima: number; minima: number };
  xiLimite: number;
  esforcos: EsforcosDesdim;
}

const SEM_FLEXAO: FlexaoDesdim = {
  xd: 0,
  mk: 0,
  as: 0,
  asCompressao: 0,
  arranjo: "",
  arranjoCompressao: "",
  barras: { n1: 0, bitola1: 0, n2: 0, bitola2: 0 },
  ramo: "nenhum",
};

/** Dimensiona a viga como o DESDIM (FUN_1000_13f7, DESDIM.BAS:2696-3125): primeiro a
 *  flecha (EJ·f) e a bitola de estribo da viga; depois os apoios (M−, As,mín
 *  0,0015·bw·hw do .DSP em todo apoio do laço, barras) e os tramos (M+, As,mín,
 *  barras, Asw e estribos dos dois lados, flecha). Modo corrigido: R8 (σs elástico
 *  sem ÷ γs), R9 (áreas de φ4 e φ32) e H (As,mín 0,25 % com CA-25). */
export const dimensionaViga: DimensionaViga = (entrada, modo) =>
  dimensionaVigaDesdim(entrada, modo);

/** O mesmo que `dimensionaViga`, com o tipo detalhado do DESDIM. */
export function dimensionaVigaDesdim(
  entrada: EntradaDesdim,
  modo: ModoSistrut,
): DimensionamentoDesdim {
  const s = atribuicao(modo);
  const { viga, materiais, parametros: p } = entrada;
  const mult = p.multiplicadorUnidade;
  const n = viga.tramos.length;
  const balE = viga.balancoEsquerdo ? 1 : 0;
  const balD = viga.balancoDireito ? 1 : 0;
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const cobrimentoTotal = s(p.cobrimento + p.acrescimo);
  const secaoCalculo = (sec: SecaoViga): SecaoCalculo => ({
    bw: sec.bw,
    h: sec.hw,
    bf: sec.bf,
    hf: sec.hf,
    d: s(sec.hw - cobrimentoTotal),
  });
  const esforcos = esforcosDesdim(entrada, modo);
  avisos.push(...esforcos.avisos);
  const ec = moduloEc(materiais, p, modo);
  const xiLim = xiLimite(materiais, mult, modo);
  const taxaMin = taxaArmaduraMinima(p.taxaArmaduraMinima, materiais, modo);
  memoria.push(
    {
      descricao: "Ec do concreto",
      formula: "21·√(1000·fck + 35)·k",
      valor: ec,
      unidade: "t/cm²",
      ref: "DESDIM.BAS:2713",
    },
    {
      descricao: "ξlim (x/d limite)",
      formula: "INT(1000/((fyd/Es + 2‰ B)/3,5 + 1))/1000",
      valor: xiLim,
      ref: "DESDIM.BAS:3678",
    },
    {
      descricao: "Taxa de armadura mínima",
      formula: "As,mín = taxa·bw·hw",
      valor: taxaMin,
      ref: "DESENHO.BAS:4820",
    },
  );

  // EJ·f por tramo interno (S_113f7, DESDIM.BAS:2716-2765).
  const ejfPorTramo = new Map<number, number>();
  for (const t of esforcos.tramos) {
    if (t.indice < 1 || t.indice > n) continue;
    ejfPorTramo.set(t.indice, flechaEJ({ ...t, ve: t.veFlecha }, modo));
  }

  // Asw de cada lado (com ρ = 0,001: a coluna 5 de A_128e ainda é 0) e bitolas da viga.
  const asRho = 0;
  const aswDos = (t: EsforcosTramoDesdim) => {
    const sec = secaoCalculo(secaoDoTramo(entrada, t.indice));
    return {
      sec,
      aswEsquerda: aswCortante(t.vkEsquerda, sec, asRho, materiais, p, COEFICIENTE_FORCA, modo),
      aswDireita: aswCortante(t.vkDireita, sec, asRho, materiais, p, COEFICIENTE_FORCA, modo),
    };
  };
  const bitolas = bitolasEstriboViga(
    esforcos.tramos.map((t) => {
      const a = aswDos(t);
      return { bw: a.sec.bw, aswEsquerda: a.aswEsquerda, aswDireita: a.aswDireita };
    }),
    p,
    modo,
  );
  memoria.push(
    {
      descricao: "Bitola máxima de estribo da viga",
      valor: bitolas.maxima,
      unidade: "mm",
      ref: "DESDIM.BAS:3336",
    },
    {
      descricao: "Bitola mínima de estribo da viga",
      valor: bitolas.minima,
      unidade: "mm",
      ref: "DESDIM.BAS:3350",
    },
  );

  const asEfetiva = (b: BarrasArranjo, segundoSeMaisDeUm: boolean) =>
    s(
      b.n1 * areaBitola(b.bitola1, p, modo) +
        (b.n2 > (segundoSeMaisDeUm ? 1 : 0) ? b.n2 * areaBitola(b.bitola2, p, modo) : 0),
    );
  const avisaFlexao = (r: ReturnType<typeof flexaoSecao>, onde: string) => {
    if (r.acimaDoLimite)
      avisos.push(
        `${viga.nome} ${onde}: momento aplicado acima de 40% do momento limite da armadura simples.`,
      );
    if (r.tensaoInvalida)
      avisos.push(
        `${viga.nome} ${onde}: a curva σ×ε do aço B não teve solução (σs = −1 no original).`,
      );
  };
  const avisaArranjo = (arranjo: string, onde: string) => {
    if (arranjo === "***")
      avisos.push(
        `${viga.nome} ${onde}: armadura acima da maior da tabela de arranjos do .DSP ("***").`,
      );
  };

  // ---- apoios (DESDIM.BAS:2798-2889)
  const mExt = viga.momentosExternos;
  const externoNeg = (k: 0 | 1) => p.momentosExternos && mExt[k] < 0;
  const engE = viga.engasteEsquerdo ? 1 : 0;
  const engD = viga.engasteDireito ? 1 : 0;
  const ini = Math.max(0, Math.min(n, 1 - balE - engE + (externoNeg(0) ? -1 : 0)));
  const fim = Math.min(n, Math.max(0, n - 1 + balD + engD + (externoNeg(1) ? 1 : 0)));
  const simples = !balE && !balD && !engE && !engD && n <= 1 && !externoNeg(0) && !externoNeg(1);
  const apoios: ApoioDesdim[] = [];
  for (let k = 0; k <= n; k++) {
    if (k < ini || k > fim) {
      apoios.push({ ...SEM_FLEXAO, apoio: k, dimensionado: false });
      continue;
    }
    const secApoio = entrada.secoes.apoios[k];
    if (!secApoio) throw new Error(`Viga ${viga.nome}: sem seção no apoio ${k}`);
    const sec = secaoCalculo({ bw: secApoio.bw, hw: secApoio.hw, bf: 0, hf: 0 });
    const mApoio = esforcos.momentosApoio[k] ?? 0;
    const m = mApoio < 0 ? s(-mApoio * 100 * COEFICIENTE_MEDIDA * COEFICIENTE_FORCA) : 0;
    const r = flexaoSecao(m, sec, materiais, mult, modo);
    avisaFlexao(r, `apoio ${k}`);
    let as = r.as;
    if (taxaMin * sec.bw * sec.h > as) as = s(taxaMin * sec.bw * sec.h);
    const arranjo = arranjoTracao(as, sec.bw, p, modo);
    avisaArranjo(arranjo, `apoio ${k}`);
    const apoio: ApoioDesdim = {
      apoio: k,
      dimensionado: true,
      xd: r.xd,
      mk: s(mApoio < 0 ? -mApoio : 0),
      as,
      asCompressao: r.asc,
      arranjo: arranjo.trim(),
      arranjoCompressao: arranjoCompressao(r.asc, sec.bw, p, modo),
      barras: leArranjo(arranjo),
      ramo: r.ramo,
    };
    if (p.verificaFissuracao && !simples) {
      apoio.fissuracao = paraMm(
        fissuracao(
          m,
          sec,
          asEfetiva(apoio.barras, false),
          apoio.barras.bitola1,
          materiais,
          p,
          modo,
        ),
      );
      if (!apoio.fissuracao.ok)
        avisos.push(`${viga.nome} apoio ${k}: abertura de fissuras acima do limite.`);
    }
    memoria.push({
      descricao: `Apoio ${k}: x/d ${r.xd.toFixed(3)}, Mk ${apoio.mk.toFixed(2)} tm, ${apoio.arranjo}`,
      formula: "As = máx(As flexão; taxa·bw·hw)",
      valor: as,
      unidade: "cm²",
      ref: "DESDIM.BAS:2836-2850",
    });
    apoios.push(apoio);
  }

  // ---- tramos (DESDIM.BAS:2917-3057)
  const tramos: TramoDesdim[] = [];
  let balancoEsquerdo: TramoDesdim | undefined;
  let balancoDireito: TramoDesdim | undefined;
  for (const t of esforcos.tramos) {
    const { sec, aswEsquerda, aswDireita } = aswDos(t);
    const interno = t.indice >= 1 && t.indice <= n;
    let flexao: FlexaoDesdim = SEM_FLEXAO;
    let m = 0;
    if (interno) {
      m = s(t.mPositivo * 100);
      m = s(m * COEFICIENTE_MEDIDA * COEFICIENTE_FORCA);
      const r = flexaoSecao(m, sec, materiais, mult, modo);
      avisaFlexao(r, `tramo ${t.indice}`);
      let as = r.as;
      if (taxaMin * sec.bw * sec.h > as) as = s(taxaMin * sec.bw * sec.h);
      const arranjo = arranjoTracao(as, sec.bw, p, modo);
      avisaArranjo(arranjo, `tramo ${t.indice}`);
      flexao = {
        xd: r.xd,
        mk: s(s(m / 100) / (COEFICIENTE_MEDIDA * COEFICIENTE_FORCA)),
        as,
        asCompressao: r.asc,
        arranjo: arranjo.trim(),
        arranjoCompressao: arranjoCompressao(r.asc, sec.bw, p, modo),
        barras: leArranjo(arranjo),
        ramo: r.ramo,
      };
    }
    // Estribos (L_15122, L_16b55); o lado sem apoio do balanço não sai.
    const esq = estriboLado(aswEsquerda, sec, bitolas, p, modo);
    const dir = estriboLado(aswDireita, sec, bitolas, p, modo);
    const temEsquerda = t.indice > 0;
    const temDireita = t.indice < n + 1;
    // τwd ≥ 0,25·fcd com o cortante sem alívio (DESDIM.BAS:2984-2988).
    const tauAcima = (v: number) =>
      (v / (sec.d * sec.bw)) * COEFICIENTE_FORCA * materiais.gamaF * 1000 >=
      (250 * mult * materiais.fck) / materiais.gamaC;
    if ((temEsquerda && tauAcima(t.ve)) || (temDireita && tauAcima(t.vd)))
      avisos.push(`${viga.nome} tramo ${t.indice}: tensão de cisalhamento acima do limite.`);
    const lado = estribosLadoALado(sec.bw, p);
    const cisalhamento: CisalhamentoDesdim = {
      vkEsquerda: temEsquerda ? s(Math.abs(t.vkEsquerda)) : 0,
      vkDireita: temDireita ? s(Math.abs(t.vkDireita)) : 0,
      aswEsquerda: temEsquerda ? aswEsquerda : 0,
      aswDireita: temDireita ? aswDireita : 0,
      estribo: {
        bitola: temEsquerda ? esq.bitola : dir.bitola,
        ramos: lado === 1 ? 2 : lado === 2 ? 4 : 6,
        espacamentoEsquerda: temEsquerda ? esq.espacamento : 0,
        espacamentoDireita: temDireita ? dir.espacamento : 0,
      },
      estriboEsquerda: temEsquerda ? esq : { ...esq, texto: "" },
      estriboDireita: temDireita ? dir : { ...dir, texto: "" },
    };

    let flecha = 0;
    let flechaTexto = "";
    let ejf = 0;
    let fiss: FissuracaoDesdim | undefined;
    if (interno) {
      ejf = ejfPorTramo.get(t.indice) ?? 0;
      // Deformação lenta: EJf·(1 + 2ξ) (DESDIM.BAS:3018-3019).
      if (p.flechaDeformacaoLenta) ejf = s((2 * flexao.xd + 1) * ejf);
      const f = flechaTramo(
        ejf,
        sec,
        ec,
        asEfetiva(flexao.barras, true),
        p.flechaInerciaFissurada,
        COEFICIENTE_MEDIDA,
        COEFICIENTE_FORCA,
        modo,
      );
      flecha = f.valor;
      flechaTexto = f.texto;
      if (p.verificaFissuracao) {
        fiss = paraMm(
          fissuracao(
            m,
            sec,
            asEfetiva(flexao.barras, false),
            flexao.barras.bitola1,
            materiais,
            p,
            modo,
          ),
        );
        if (!fiss.ok)
          avisos.push(`${viga.nome} tramo ${t.indice}: abertura de fissuras acima do limite.`);
      }
      memoria.push({
        descricao: `Tramo ${t.indice}: x/d ${flexao.xd.toFixed(3)}, Mk ${flexao.mk.toFixed(2)} tm, ${flexao.arranjo}; estribos ${esq.texto} / ${dir.texto}; flecha ${flechaTexto.trim()} cm`,
        formula: "Asw = (|V|/(bw·d)·γs·γf − (0,225 + 15ρ)·√(1000 fck)/1000)/fyk·bw·100·γs",
        valor: flexao.as,
        unidade: "cm²",
        ref: "DESDIM.BAS:2917-3057, 3184",
      });
    }
    const tramo: TramoDesdim = {
      indice: t.indice,
      flexao,
      cisalhamento,
      flecha,
      flechaTexto,
      ejf,
      ...(fiss ? { fissuracao: fiss } : {}),
    };
    if (t.indice === 0) balancoEsquerdo = tramo;
    else if (t.indice === n + 1) balancoDireito = tramo;
    else tramos.push(tramo);
  }

  return {
    nome: viga.nome,
    tramos,
    apoios,
    ...(balancoEsquerdo ? { balancoEsquerdo } : {}),
    ...(balancoDireito ? { balancoDireito } : {}),
    bitolasEstribo: bitolas,
    xiLimite: xiLim,
    esforcos,
    avisos,
    memoria,
  };
}

/** w do original (décimos de mm, comparados com a classe 1/2/3) em mm. */
function paraMm(f: Fissuracao): FissuracaoDesdim {
  return { w1: f.w1 / 10, w2: f.w2 / 10, limite: f.limite / 10, ok: f.ok };
}

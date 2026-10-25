// Detalhamento das armaduras de viga contínua: posições N1, N2… com bitola,
// quantidade e comprimento, a partir da envoltória (vigas/continua.ts) e do
// dimensionamento de cada tramo. Regras e fontes em docs/DETALHAMENTO.md.
// O que muda entre as normas fica em RegrasDetalhamento (REGRAS_6118 e
// REGRAS_NB178); a geometria do detalhamento é comum.
// Unidades: comprimentos e abscissas em cm, φ em mm, cortantes em kN.
import { areaBarra } from "../barras";
import { num, numAte } from "../texto";
import type { Aco, NormaId } from "../../dominio/obra";
import { fctm, GAMA_C } from "../normas/nbr6118-2023/materiais";
import type { Barra, BarrasLongitudinais, ComMemoria, Etapa, MateriaisCalc } from "../tipos";
import type { TramoResultado } from "../vigas/continua";
import {
  aderencia6118,
  aderenciaNb178,
  ancoragemBasica6118,
  ancoragemBasicaNb178,
  ancoragemNecessaria6118,
  ancoragemNecessariaNb178,
  barraLisa,
  gancho6118,
  ganchoNb178,
  ganchosEstribo6118,
  ganchosEstriboNb178,
  pinoDobramento,
  type Aderencia,
  type AncoragemBasica,
  type AncoragemNecessaria,
  type PosicaoBarra,
} from "./ancoragem";

// ---- decalagem ------------------------------------------------------------------

export interface Decalagem {
  /** Deslocamento do diagrama de momentos, cm. */
  al: number;
  memoria: Etapa[];
}

const F6 = "Bastos, Vigas (abr/2024)";

/**
 * Decalagem pelo Modelo de Cálculo I com estribos verticais (6118 17.4.2.2 c;
 * F6 Eq. 31): al = d · VSd,máx / (2 (VSd,máx − Vc)), com 0,5 d ≤ al ≤ d e
 * al = d quando VSd,máx ≤ Vc. Vc = Vc0 = 0,6 fctd bw d (flexão simples), o
 * mesmo do cálculo dos estribos. `vsd` em kN (de cálculo), bw e d em cm.
 */
export function decalagem6118(vsd: number, bw: number, d: number, mat: MateriaisCalc): Decalagem {
  const fctd = (0.7 * fctm(mat.fck)) / GAMA_C / 10; // kN/cm²
  const vc = 0.6 * fctd * bw * d;
  const v = Math.abs(vsd);
  const al = v <= vc ? d : Math.min(Math.max((d * v) / (2 * (v - vc)), 0.5 * d), d);
  return {
    al,
    memoria: [
      {
        descricao: "Decalagem do diagrama de momentos (Modelo I, estribos verticais)",
        formula: `al = d VSd / (2 (VSd − Vc)), 0,5 d ≤ al ≤ d; VSd = ${num(v, 1)} kN, Vc = ${num(vc, 1)} kN`,
        valor: al,
        unidade: "cm",
        ref: `6118:2023 17.4.2.2 c (${F6}, Eq. 31)`,
      },
    ],
  };
}

/** Decalagem na NB-1/78: al = 0,75 d, o padrão do SISTRUT original
 *  (SISTRUT.DSP linha 84). A V1 reconstruída (DESCALC.BM) não decala. */
export const FATOR_DECALAGEM_NB178 = 0.75;

export function decalagemNb178(d: number): Decalagem {
  const al = FATOR_DECALAGEM_NB178 * d;
  return {
    al,
    memoria: [
      {
        descricao: "Decalagem do diagrama de momentos",
        formula: "al = 0,75 d",
        valor: al,
        unidade: "cm",
        // [VERIFICAR] item da NB-1/78 não lido; 0,75 d é o padrão do SISTRUT 4.0.
        ref: "NB-1/78 (SISTRUT.DSP linha 84) [VERIFICAR item da NB-1/78]",
      },
    ],
  };
}

// ---- regras por norma -------------------------------------------------------------

/** O que muda de uma norma para outra no detalhamento. */
export interface RegrasDetalhamento {
  norma: NormaId;
  /** `distanciaFace` = da face junto à barra ao centro dela, cm. */
  aderencia(posicao: PosicaoBarra, h: number, distanciaFace: number): Aderencia;
  ancoragemBasica(phi: number, ad: Aderencia, mat: MateriaisCalc): AncoragemBasica;
  ancoragemNecessaria(
    anc: AncoragemBasica,
    asCalc: number,
    asEf: number,
    gancho: boolean,
  ): AncoragemNecessaria;
  decalagem(vsd: number, bw: number, d: number, mat: MateriaisCalc): Decalagem;
  /** Comprimento acrescido por um gancho de barra longitudinal, cm. */
  gancho(phi: number, aco: Aco): number;
  /** Soma dos dois ganchos do estribo fechado, cm. */
  ganchosEstribo(phiT: number): number;
  /** Comprimento exigido dentro do apoio extremo para o positivo com gancho, cm. */
  ancoragemApoioExtremo(a: ApoioExtremoEntrada): ApoioExtremoExigido;
  /** Grampo do positivo no apoio extremo onde a ancoragem não cabe. Ausente = a norma
   *  não tem a regra aqui: fica o aviso. */
  grampoApoio?(a: GrampoEntrada): Grampo;
}

/** O que o grampo precisa: a barra que não ancora, a área a ancorar e o apoio. */
export interface GrampoEntrada {
  basica: AncoragemBasica;
  /** Armadura a ancorar e área efetiva que chega à face, cm². */
  anec: number;
  asEf: number;
  /** Largura do apoio e cobrimento, cm. */
  largura: number;
  cobrimento: number;
}

/** Grampos de um apoio: bitola (mm), quantidade e quanto o ramo passa da face, cm. */
export interface Grampo {
  phi: number;
  quantidade: number;
  alemDaFace: number;
}

/** Grampo do positivo como o SISTRUT o põe (DESINIT.BAS:2092-2225; `novoGrampo` em
 *  sistrut/vigas/desinitBarras.ts): bitola φ5 para barra até φ10, φ6,3 até φ16 e φ8
 *  acima; quantidade máx(1; ⌊((lb/(b − c + φ))·Anec − As,ef)/(2·A_grampo)⌋), com φ em
 *  mm como no original (cada grampo tem dois ramos); o ramo passa da face 7,5 × φ do
 *  grampo (mm), em cm. */
export function grampoNb178(a: GrampoEntrada): Grampo {
  const phiBarra = a.basica.phi;
  const phi = phiBarra <= 10 ? 5 : phiBarra <= 16 ? 6.3 : 8;
  const q =
    ((a.basica.lb / (a.largura - a.cobrimento + phiBarra)) * a.anec - a.asEf) /
    (2 * areaBarra(phi));
  return { phi, quantidade: Math.floor(Math.max(1, q)), alemDaFace: Math.round(7.5 * phi) };
}

/** O positivo que chega a um apoio extremo. */
export interface ApoioExtremoEntrada {
  basica: AncoragemBasica;
  /** Cortante de cálculo no apoio, kN. */
  vd: number;
  /** Decalagem e altura útil, cm. */
  al: number;
  d: number;
  /** As calculada e efetiva do positivo, cm². */
  asCalc: number;
  asEf: number;
  mat: MateriaisCalc;
}

export interface ApoioExtremoExigido {
  exigido: number;
  /** Armadura a ancorar no apoio, cm². */
  anec: number;
  memoria: Etapa[];
}

/** NBR 6118 18.3.2.4 e 18.3.2.4.1: As,anc = (al/d)·Vd/fyd; exigido = máx(lb,nec com
 *  gancho, com lb,mín; r + 5,5 φ; 6 cm). Também para o negativo de extremidade da
 *  ligação viga-pilar (As,anc = a As dele). */
export function apoioExtremo6118(
  basica: AncoragemBasica,
  asAnc: number,
  asEf: number,
  aco: Aco,
): ApoioExtremoExigido {
  const phi = basica.phi;
  const anc = ancoragemNecessaria6118(basica, asAnc, asEf, true);
  const r = (pinoDobramento(phi, aco) / 2) * (phi / 10);
  const exigido = Math.max(anc.lbNec, r + (5.5 * phi) / 10, 6);
  return {
    exigido,
    anec: asAnc,
    memoria: [
      ...anc.memoria.map((m) => ({
        ...m,
        descricao: `As,anc = ${num(asAnc, 2)} cm²: ${m.descricao}`,
      })),
      {
        descricao: "Comprimento exigido no apoio extremo",
        formula: `máx(lb,nec com gancho; r + 5,5 φ; 6 cm) = ${num(exigido, 1)}`,
        valor: exigido,
        unidade: "cm",
        ref: "6118:2023 18.3.2.4 e 18.3.2.4.1 (Bastos, Vigas, Eq. 39 a 44)",
      },
    ],
  };
}

/** NB-1/78 como o SISTRUT confere a ancoragem do positivo no apoio extremo ao decidir
 *  os grampos (DESINIT.BAS:2092-2225; `grampos` em sistrut/vigas/desinitBarras.ts):
 *  Anec = máx(Vd/(2 fyd); As/3); exigido = máx(lb·máx(0,33; Anec/As,ef) − 10 φ; 13,5 φ;
 *  6 cm), em que o −10 φ é o gancho. A parcela As,mín/3 do original não entra: a As
 *  calculada já tem o mínimo. Na obra de 1994 do André, a V1 (φ12,5 em apoio de 19 cm)
 *  passa por 1 mm no SISTRUT: 16,9 ≤ 17,0 cm. */
export function apoioExtremoNb178(a: ApoioExtremoEntrada): ApoioExtremoExigido {
  const phi = a.basica.phi;
  const anec = Math.max(a.vd / (2 * (a.mat.fyd / 10)), a.asCalc / 3);
  const razao = a.asEf > 0 ? Math.max(0.33, anec / a.asEf) : 1;
  const exigido = Math.max(a.basica.lb * razao - phi, 1.35 * phi, 6);
  return {
    exigido,
    anec,
    memoria: [
      {
        descricao: "Armadura a ancorar no apoio extremo",
        formula: `Anec = máx(Vd/(2 fyd); As/3) = máx(${num(a.vd / (2 * (a.mat.fyd / 10)), 2)}; ${num(a.asCalc / 3, 2)})`,
        valor: anec,
        unidade: "cm²",
        ref: "NB-1/78 pelo SISTRUT (DESINIT.BAS:2092-2225)",
      },
      {
        descricao: "Comprimento exigido no apoio extremo (com gancho)",
        formula: `máx(lb·máx(0,33; Anec/As,ef) − 10 φ; 13,5 φ; 6 cm) = máx(${num(a.basica.lb, 1)} · ${num(razao, 3)} − ${num(phi, 1)}; ${num(1.35 * phi, 1)}; 6) = ${num(exigido, 1)}`,
        valor: exigido,
        unidade: "cm",
        ref: "NB-1/78 pelo SISTRUT (DESINIT.BAS:2092-2225)",
      },
    ],
  };
}

export const REGRAS_6118: RegrasDetalhamento = {
  norma: "nbr6118-2023",
  aderencia: aderencia6118,
  ancoragemBasica: ancoragemBasica6118,
  ancoragemNecessaria: ancoragemNecessaria6118,
  decalagem: decalagem6118,
  gancho: gancho6118,
  ganchosEstribo: ganchosEstribo6118,
  ancoragemApoioExtremo: (a) =>
    apoioExtremo6118(a.basica, (a.al / a.d) * (a.vd / (a.mat.fyd / 10)), a.asEf, a.mat.aco),
};

export const REGRAS_NB178: RegrasDetalhamento = {
  norma: "nb1-78",
  aderencia: (posicao, h) => aderenciaNb178(posicao, h),
  ancoragemBasica: ancoragemBasicaNb178,
  ancoragemNecessaria: (anc) => ancoragemNecessariaNb178(anc),
  decalagem: (_vsd, _bw, d) => decalagemNb178(d),
  gancho: (phi) => ganchoNb178(phi),
  ganchosEstribo: ganchosEstriboNb178,
  ancoragemApoioExtremo: apoioExtremoNb178,
  grampoApoio: grampoNb178,
};

export const regrasDetalhamento = (id: NormaId) => (id === "nb1-78" ? REGRAS_NB178 : REGRAS_6118);

// ---- entrada e saída ----------------------------------------------------------------

/** Seção dimensionada (compatível com SecaoViga de fluxo.ts). */
export interface SecaoDetalhada {
  flexao: { as: number; asComprimida?: number } | null;
  barras: BarrasLongitudinais | null;
}

/** Tramo dimensionado (compatível com ResultadoTramo de fluxo.ts). */
export interface TramoDimensionado {
  positivo: SecaoDetalhada;
  negativoEsq: SecaoDetalhada;
  negativoDir: SecaoDetalhada;
  estribo: Barra | null;
}

export interface VigaDetalhamentoEntrada {
  nome: string;
  /** Seção, altura útil e cobrimento nominal, cm. */
  bw: number;
  h: number;
  d: number;
  cobrimento: number;
  /** Largura de cada apoio na direção da viga, cm: n + 1 valores, do primeiro
   *  ao último nó (extremidade livre de balanço: 0). */
  larguraApoios: number[];
  /** Envoltória característica de cada tramo (analisaVigaContinua). */
  tramos: TramoResultado[];
  dimensionamento: TramoDimensionado[];
  /** Coeficiente que leva o cortante característico ao de cálculo (o mesmo do dimensionamento). */
  gamaF: number;
  mat: MateriaisCalc;
}

export type TipoPosicao =
  | "positiva"
  | "negativa"
  | "porta-estribos"
  | "construtiva"
  | "estribo"
  | "grampo";

export interface PosicaoArmadura {
  numero: number;
  /** "N1", "N2"… */
  nome: string;
  tipo: TipoPosicao;
  /** Tramo (0 = primeiro) em que a posição é listada; o negativo de um apoio
   *  interno fica no tramo à esquerda do apoio, como na V1. */
  tramo: number;
  /** mm */
  phi: number;
  quantidade: number;
  aco: Aco;
  /** Comprimento de cada barra, cm, inteiro: reto + ganchos. */
  comprimento: number;
  /** Trecho reto e ganchos no início e no fim (0 = sem gancho), cm, inteiros
   *  (cada parcela arredondada para cima). Estribo: perímetro e ganchos somados em `reto`. */
  reto: number;
  ganchoInicio: number;
  ganchoFim: number;
  /** Abscissas do trecho reto (estribos: da região estribada) ao longo do eixo,
   *  cm, a partir do primeiro nó da viga. */
  xInicio: number;
  xFim: number;
  /** Espaçamento dos estribos, cm; null nas barras longitudinais. */
  espacamento: number | null;
  /** Grampo: U deitado no fundo da viga, dois ramos de xInicio a xFim e a travessa na
   *  largura, na ponta do apoio (`travessa`); `reto` = comprimento do U inteiro. */
  travessa?: "inicio" | "fim";
}

export interface VigaDetalhamento extends ComMemoria {
  nome: string;
  posicoes: PosicaoArmadura[];
}

// ---- constantes construtivas -----------------------------------------------------

/** Transpasse do porta-estribos com o negativo, cm (SISTRUT.DSP linha 322). */
export const TRANSPASSE_PORTA_ESTRIBOS = 15;
/** Comprimento comercial das barras, cm (F4 item 6: "em torno de 12 m"). */
export const COMPRIMENTO_BARRA_COMERCIAL = 1200;
/** Ponta da envoltória considerada nula, kN·m (como vigas/continua.ts). */
const EPS_M = 1e-6;

/** Bitola do porta-estribos pela altura da viga, mm (SISTRUT.DSP linhas
 *  292-297; piso de 6,3 mm da V1 DcDetalha%). */
export function phiPortaEstribos(h: number) {
  if (h <= 70) return 6.3;
  if (h <= 85) return 8;
  if (h <= 120) return 10;
  return 12.5;
}

/** Arredonda para cima em cm, tolerando resíduo numérico. */
const arredonda = (v: number) => Math.max(0, Math.ceil(v - 1e-6));

// ---- envoltória -------------------------------------------------------------------

interface PontoCm {
  x: number;
  m: number;
}

/**
 * Andando da posição `i0` no sentido `passo`, onde a envoltória deixa de
 * estar ativa (zero por interpolação linear), cm do início do tramo. Se fica
 * ativa até a ponta, devolve a ponta.
 */
function fimDaRegiao(p: PontoCm[], i0: number, passo: 1 | -1, ativo: (m: number) => boolean) {
  let i = i0;
  for (;;) {
    const a = p[i];
    const b = p[i + passo];
    if (!a) return 0;
    if (!b) return a.x;
    if (!ativo(b.m)) return a.x + ((b.x - a.x) * a.m) / (a.m - b.m);
    i += passo;
  }
}

// ---- detalhamento -----------------------------------------------------------------

/**
 * Detalha a viga tramo a tramo (ordem da V1 DcDetalha%: negativo da
 * extremidade esquerda, positivo, negativo do apoio direito, porta-estribos,
 * estribos). Regras comuns:
 * - positivo: todas as barras de apoio a apoio. Em apoio extremo vão até a face
 *   externa menos o cobrimento, com gancho, e a ancoragem é conferida
 *   (6118 18.3.2.4); em apoio interno param no mais longe entre 10 φ além da
 *   face, 10 φ além do zero do diagrama decalado e lb,nec além do pico decalado
 *   (18.3.2.3 e 18.3.2.4.1);
 * - negativo: para cada lado, o maior entre 0,25 do maior vão adjacente + lb
 *   (V1) e o diagrama decalado (al + lb,nec; zero + al + 10 φ), limitado ao vão;
 *   no balanço vai até a ponta com gancho; em apoio extremo, gancho no apoio;
 * - porta-estribos: 2 barras onde o negativo não cobre, com transpasse;
 *   balanço sem positivo leva 2 barras inferiores construtivas;
 * - estribos de face a face de apoio (no balanço, até a ponta), espaçamento do
 *   dimensionamento.
 */
export function detalharViga(
  e: VigaDetalhamentoEntrada,
  regras: RegrasDetalhamento = REGRAS_6118,
): VigaDetalhamento {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const posicoes: PosicaoArmadura[] = [];
  const n = e.tramos.length;
  if (n === 0 || e.dimensionamento.length !== n || e.larguraApoios.length !== n + 1) {
    avisos.push(
      `${e.nome}: detalhamento sem dados consistentes (${n} tramos, ${e.dimensionamento.length} dimensionados, ${e.larguraApoios.length} apoios).`,
    );
    return { nome: e.nome, posicoes, avisos, memoria };
  }

  const c = e.cobrimento;
  const mat = e.mat;
  const dFace = e.h - e.d;
  const L = e.tramos.map((t) => t.comprimento * 100);
  const X = [0];
  L.forEach((l, i) => X.push((X[i] ?? 0) + l));
  const xNo = (k: number) => X[k] ?? 0;
  const vao = (t: number) => L[t] ?? 0;
  const largura = (k: number) => e.larguraApoios[k] ?? 0;
  const balanco = (t: number) => e.tramos[t]?.balanco === true;
  const livre = (k: number) => (k === 0 && balanco(0)) || (k === n && balanco(n - 1));
  const extremo = (k: number) => (k === 0 || k === n) && !livre(k);
  const pontos = (t: number, campo: "mMax" | "mMin"): PontoCm[] =>
    (e.tramos[t]?.pontos ?? []).map((p) => ({ x: p.x * 100, m: p[campo] }));

  const al = e.tramos.map((t, i) => {
    const dec = regras.decalagem(e.gamaF * Math.max(t.vEsq, t.vDir), e.bw, e.d, mat);
    memoria.push(
      ...dec.memoria.map((m) => ({ ...m, descricao: `Tramo ${i + 1}: ${m.descricao}` })),
    );
    return dec.al;
  });
  const alDe = (t: number) => al[t] ?? e.d;

  // Barra lisa tracionada: gancho obrigatório (6118 9.4.2.1 a). Toda ponta de
  // positivo e de negativo leva gancho, e lb,nec usa o α do gancho.
  const lisa = barraLisa(mat.aco);
  if (lisa) {
    memoria.push({
      descricao: `Aço ${mat.aco} (barra lisa): gancho em todas as pontas das barras tracionadas`,
      formula: "ancoragem obrigatoriamente com gancho",
      ref: "6118:2023 9.4.2.1 a e 9.4.2.3 (Bastos, Ancoragem, p. 12-14)",
    });
  }

  const ancora = (
    nome: string,
    phi: number,
    pos: PosicaoBarra,
    s: SecaoDetalhada,
    gancho: boolean,
  ) => {
    const ad = regras.aderencia(pos, e.h, dFace);
    const basica = regras.ancoragemBasica(phi, ad, mat);
    const nec = regras.ancoragemNecessaria(basica, s.flexao?.as ?? 0, s.barras?.area ?? 0, gancho);
    memoria.push(
      ...[...basica.memoria, ...nec.memoria].map((m) => ({
        ...m,
        descricao: `${nome}: ${m.descricao}`,
      })),
    );
    return { lb: basica.lb, lbNec: nec.lbNec, basica };
  };

  /** Confere a ancoragem de barra com gancho em apoio extremo de largura b:
   *  lb,ef = b − c ≥ o exigido pela norma (`RegrasDetalhamento.ancoragemApoioExtremo`:
   *  6118 18.3.2.4.1; NB-1/78 como o SISTRUT confere ao decidir os grampos). */
  const confereApoioExtremo = (
    nome: string,
    k: number,
    { exigido, memoria: m }: ApoioExtremoExigido,
  ) => {
    const disponivel = largura(k) - c;
    memoria.push(
      ...m.map((x) => ({ ...x, descricao: `${nome}: apoio ${k + 1} (extremo): ${x.descricao}` })),
    );
    memoria.push({
      descricao: `${nome}: ancoragem no apoio ${k + 1} (extremo)`,
      formula: `lb,ef = b − c = ${num(disponivel, 1)} ≥ exigido = ${num(exigido, 1)}`,
      valor: exigido,
      unidade: "cm",
      ref:
        regras.norma === "nb1-78"
          ? "NB-1/78 pelo SISTRUT (DESINIT.BAS:2092-2225)"
          : "6118:2023 18.3.2.4.1",
    });
    return disponivel >= exigido;
  };

  /** Aviso da ancoragem que não cabe no apoio extremo k. */
  const avisoAncoragem = (nome: string, k: number, exigido: number) =>
    avisos.push(
      `${e.nome} ${nome}: ancoragem no apoio ${k + 1} insuficiente (lb,ef = ${num(largura(k) - c, 1)} cm < ${num(exigido, 1)} cm); use grampos ou aumente o apoio.`,
    );

  /** Grampo do positivo `barra` no apoio extremo k do tramo t, onde a ancoragem não
   *  cabe (`RegrasDetalhamento.grampoApoio`): U deitado no fundo, de dentro do apoio
   *  (cobrimento) até `alemDaFace` além da face, limitado à face do outro apoio; a
   *  travessa fecha a largura por dentro dos estribos (bw − 2c − 2φt, como o SISTRUT).
   *  Sem a regra na norma, fica o aviso. */
  const grampoNoApoio = (
    t: number,
    k: number,
    barra: string,
    basica: AncoragemBasica,
    exig: ApoioExtremoExigido,
    asEf: number,
  ) => {
    const g = regras.grampoApoio?.({
      basica,
      anec: exig.anec,
      asEf,
      largura: largura(k),
      cobrimento: c,
    });
    if (!g) {
      avisoAncoragem(barra, k, exig.exigido);
      return;
    }
    const esquerdo = k === t;
    const face = esquerdo ? xNo(k) + largura(k) / 2 : xNo(k) - largura(k) / 2;
    const outraFace = esquerdo
      ? xNo(k + 1) - largura(k + 1) / 2 - c
      : xNo(k - 1) + largura(k - 1) / 2 + c;
    const [ini, fim] = esquerdo
      ? [xNo(k) - largura(k) / 2 + c, Math.min(face + g.alemDaFace, outraFace)]
      : [Math.max(face - g.alemDaFace, outraFace), xNo(k) + largura(k) / 2 - c];
    const phiT = e.dimensionamento[t]?.estribo?.phi ?? 5;
    const travessa = e.bw - 2 * c - (2 * phiT) / 10;
    const pos = adiciona({
      tipo: "grampo",
      tramo: t,
      phi: g.phi,
      quantidade: g.quantidade,
      aco: mat.aco,
      reto: 2 * (fim - ini) + travessa,
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: ini,
      xFim: fim,
      espacamento: null,
      travessa: esquerdo ? "inicio" : "fim",
    });
    memoria.push({
      descricao: `${pos.nome}: grampo no apoio ${k + 1} para ancorar ${barra}`,
      formula: `${g.quantidade} φ${numAte(g.phi, 1)}, ramos de ${num(fim - ini, 1)} cm e travessa de ${num(travessa, 1)} cm`,
      valor: g.quantidade,
      ref: "NB-1/78 pelo SISTRUT (DESINIT.BAS:2092-2225)",
    });
    avisos.push(
      `${e.nome} ${barra}: ancoragem no apoio ${k + 1} com grampo ${pos.nome} (${g.quantidade} φ${numAte(g.phi, 1)}), como o SISTRUT: lb,ef = ${num(largura(k) - c, 1)} cm < ${num(exig.exigido, 1)} cm.`,
    );
  };

  /** Numera a posição e arredonda reto e ganchos para cima (cm). */
  const adiciona = (p: Omit<PosicaoArmadura, "numero" | "nome" | "comprimento">) => {
    const numero = posicoes.length + 1;
    const reto = arredonda(p.reto);
    const ganchoInicio = arredonda(p.ganchoInicio);
    const ganchoFim = arredonda(p.ganchoFim);
    const comprimento = reto + ganchoInicio + ganchoFim;
    const pos: PosicaoArmadura = {
      ...p,
      numero,
      nome: `N${numero}`,
      reto,
      ganchoInicio,
      ganchoFim,
      comprimento,
    };
    posicoes.push(pos);
    if (p.tipo !== "estribo" && comprimento > COMPRIMENTO_BARRA_COMERCIAL) {
      avisos.push(
        `${e.nome} ${pos.nome}: barra de ${num(comprimento / 100, 2)} m, maior que a comercial de 12 m; prever emenda (não detalhada).`,
      );
    }
    return pos;
  };

  // cobertura do negativo dentro de cada tramo, a partir do nó esquerdo e do direito
  const cobInicio = L.map(() => 0);
  const cobFim = L.map(() => 0);

  /** Seção do negativo no nó k: a de maior armadura efetiva entre os dois tramos. */
  const secaoNo = (k: number): SecaoDetalhada | null => {
    const lados = [e.dimensionamento[k - 1]?.negativoDir, e.dimensionamento[k]?.negativoEsq];
    let melhor: SecaoDetalhada | null = null;
    for (const s of lados) {
      if (s?.barras && s.barras.n > 0 && (!melhor?.barras || s.barras.area > melhor.barras.area))
        melhor = s;
    }
    return melhor;
  };

  /** Armadura comprimida do negativo no nó k: a maior dos dois tramos vizinhos. */
  const asComprimidaNo = (k: number) =>
    Math.max(
      e.dimensionamento[k - 1]?.negativoDir.flexao?.asComprimida ?? 0,
      e.dimensionamento[k]?.negativoEsq.flexao?.asComprimida ?? 0,
    );

  /** Negativo do nó k, listado no tramo `tramoLista`. */
  const negativoNo = (k: number, tramoLista: number) => {
    const s = secaoNo(k);
    if (!s?.barras || livre(k)) return;
    const asComp = asComprimidaNo(k);
    if (asComp > 0) {
      avisos.push(
        `${e.nome} apoio ${k + 1}: armadura dupla no negativo; a armadura comprimida (A's = ${num(asComp, 2)} cm², barras inferiores sobre o apoio) não está detalhada.`,
      );
    }
    const { phi, n: qtd } = s.barras;
    const nome = `N${posicoes.length + 1}`;
    const { lb, lbNec, basica } = ancora(nome, phi, "superior", s, lisa);
    const vaosAdj = [k - 1, k].filter((t) => t >= 0 && t < n && !balanco(t)).map(vao);
    const lRef = Math.max(0, ...vaosAdj);
    const gancho = regras.gancho(phi, mat.aco);

    /** Extensão do negativo para dentro do tramo t a partir do nó k, cm, e se termina em gancho. */
    const extensao = (t: number, lado: 1 | -1) => {
      if (balanco(t)) return { ext: vao(t) - c, gancho: true };
      const p = pontos(t, "mMin");
      const zero =
        lado === 1
          ? (p[0]?.m ?? 0) < -EPS_M
            ? fimDaRegiao(p, 0, 1, (m) => m < -EPS_M)
            : 0
          : (p.at(-1)?.m ?? 0) < -EPS_M
            ? vao(t) - fimDaRegiao(p, p.length - 1, -1, (m) => m < -EPS_M)
            : 0;
      const a = alDe(t);
      const regraV1 = 0.25 * lRef + lb;
      const regraDiagrama = Math.max(a + lbNec, zero + a + (10 * phi) / 10);
      const ext = Math.max(regraV1, regraDiagrama);
      // vão curto todo coberto: se o outro nó é apoio extremo, a barra entra nele
      // com gancho (sem conferir ancoragem: lá o momento da envoltória é nulo)
      const outro = lado === 1 ? t + 1 : t;
      if (ext >= vao(t) && extremo(outro))
        return { ext: vao(t) + largura(outro) / 2 - c, gancho: true };
      if (ext < vao(t)) return { ext, gancho: lisa };
      // Cobre o vão e o outro nó é interno: no eixo dele a barra ainda está
      // tracionada (momento negativo do apoio), então não pode parar ali.
      // Passa o eixo pelo que falta da extensão e pelo menos lb,nec
      // (18.3.2.3: lb,nec além do ponto em que deixa de ser necessária),
      // dentro do tramo seguinte, sobrepondo-se ao negativo daquele nó.
      const seguinte = lado === 1 ? t + 1 : t - 1;
      const alem = Math.max(ext - vao(t), lbNec);
      const limite = vao(seguinte) - (balanco(seguinte) ? c : 0);
      if (alem > limite) {
        avisos.push(
          `${e.nome} ${nome}: o negativo do apoio ${k + 1} precisa passar ${num(alem, 1)} cm além do apoio ${outro + 1}, mais que o tramo seguinte (${num(limite, 1)} cm); confira a ancoragem.`,
        );
      }
      return {
        ext: vao(t) + Math.min(alem, limite),
        gancho: lisa || (balanco(seguinte) && alem >= limite),
      };
    };

    const esq = k > 0 ? extensao(k - 1, -1) : { ext: largura(k) / 2 - c, gancho: true };
    const dir = k < n ? extensao(k, 1) : { ext: largura(k) / 2 - c, gancho: true };
    if (k > 0) cobFim[k - 1] = esq.ext;
    if (k < n) cobInicio[k] = dir.ext;
    if (extremo(k)) {
      const exig = apoioExtremo6118(basica, s.flexao?.as ?? 0, s.barras.area, mat.aco);
      if (!confereApoioExtremo(nome, k, exig)) avisoAncoragem(nome, k, exig.exigido);
    }

    adiciona({
      tipo: "negativa",
      tramo: tramoLista,
      phi,
      quantidade: qtd,
      aco: mat.aco,
      reto: esq.ext + dir.ext,
      ganchoInicio: esq.gancho ? gancho : 0,
      ganchoFim: dir.gancho ? gancho : 0,
      xInicio: xNo(k) - esq.ext,
      xFim: xNo(k) + dir.ext,
      espacamento: null,
    });
  };

  /** Positivo do tramo t. */
  const positivoTramo = (t: number) => {
    const dim = e.dimensionamento[t];
    const s = dim?.positivo;
    const tr = e.tramos[t];
    if (!s?.barras || s.barras.n <= 0 || !tr) {
      if (balanco(t)) construtivaBalanco(t);
      return;
    }
    const { phi, n: qtd, area } = s.barras;
    const nome = `N${posicoes.length + 1}`;
    const { lbNec, basica } = ancora(nome, phi, "inferior", s, lisa);
    const p = pontos(t, "mMax");
    const iPico = p.reduce((im, q, i) => (q.m > (p[im]?.m ?? -Infinity) ? i : im), 0);
    const xPico = p[iPico]?.x ?? vao(t) / 2;
    const a = alDe(t);
    const gancho = regras.gancho(phi, mat.aco);
    const ativo = (m: number) => m > EPS_M;
    const dezPhi = (10 * phi) / 10; // 10 φ em cm
    /** O exigido no apoio extremo pela norma, com o cortante característico v do apoio. */
    const exigidoNoApoio = (v: number) =>
      regras.ancoragemApoioExtremo({
        basica,
        vd: e.gamaF * v,
        al: a,
        d: e.d,
        asCalc: s.flexao?.as ?? 0,
        asEf: area,
        mat,
      });

    /** Apoios extremos em que a ancoragem não cabe: grampo depois da positiva. */
    const semAncoragem: { k: number; exig: ApoioExtremoExigido }[] = [];

    // início (nó t) e fim (nó t + 1), em abscissa do tramo
    let ini: number;
    let ganchoIni = 0;
    if (extremo(t)) {
      ini = -(largura(t) / 2 - c);
      ganchoIni = gancho;
      const exig = exigidoNoApoio(tr.vEsq);
      if (!confereApoioExtremo(nome, t, exig)) semAncoragem.push({ k: t, exig });
    } else if (livre(t)) {
      ini = c;
      ganchoIni = gancho;
    } else {
      const zero = (p[0]?.m ?? 0) > EPS_M ? 0 : fimDaRegiao(p, iPico, -1, ativo);
      ini = Math.min(largura(t) / 2 - dezPhi, zero - a - dezPhi, xPico - a - lbNec);
      if (lisa) ganchoIni = gancho;
    }
    let fim: number;
    let ganchoFim = 0;
    if (extremo(t + 1)) {
      fim = vao(t) + largura(t + 1) / 2 - c;
      ganchoFim = gancho;
      const exig = exigidoNoApoio(tr.vDir);
      if (!confereApoioExtremo(nome, t + 1, exig)) semAncoragem.push({ k: t + 1, exig });
    } else if (livre(t + 1)) {
      fim = vao(t) - c;
      ganchoFim = gancho;
    } else {
      const zero = (p.at(-1)?.m ?? 0) > EPS_M ? vao(t) : fimDaRegiao(p, iPico, 1, ativo);
      fim = Math.max(vao(t) - largura(t + 1) / 2 + dezPhi, zero + a + dezPhi, xPico + a + lbNec);
      if (lisa) ganchoFim = gancho;
    }
    adiciona({
      tipo: "positiva",
      tramo: t,
      phi,
      quantidade: qtd,
      aco: mat.aco,
      reto: fim - ini,
      ganchoInicio: ganchoIni,
      ganchoFim,
      xInicio: xNo(t) + ini,
      xFim: xNo(t) + fim,
      espacamento: null,
    });
    for (const { k, exig } of semAncoragem) grampoNoApoio(t, k, nome, basica, exig, area);
  };

  /** Balanço sem positivo: 2 barras inferiores da ponta (menos o cobrimento)
   *  até o transpasse além da face do apoio, para montar os estribos. */
  const construtivaBalanco = (t: number) => {
    const phi = phiPortaEstribos(e.h);
    const [ini, fim] =
      t === 0
        ? [c, vao(0) + largura(1) / 2 + TRANSPASSE_PORTA_ESTRIBOS]
        : [-(largura(t) / 2) - TRANSPASSE_PORTA_ESTRIBOS, vao(t) - c];
    adiciona({
      tipo: "construtiva",
      tramo: t,
      phi,
      quantidade: 2,
      aco: mat.aco,
      reto: fim - ini,
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: xNo(t) + ini,
      xFim: xNo(t) + fim,
      espacamento: null,
    });
  };

  /** Armadura dupla no vão: a comprimida fica com as barras de cima do meio do tramo,
   *  os porta-estribos ou, onde os negativos cobrem o vão inteiro, o menor deles. Se
   *  elas cobrem a A's, o aviso é informativo e pede para conferir o travamento delas
   *  pelos estribos (barra comprimida); senão, a A's não está detalhada.
   *  [VERIFICAR] contar o porta-estribos como armadura comprimida é prática corrente,
   *  sem item da norma lido. */
  const armaduraDupla = () => {
    for (let t = 0; t < n; t++) {
      const dim = e.dimensionamento[t];
      const asComp = dim?.positivo.flexao?.asComprimida ?? 0;
      if (!dim || asComp <= 0 || !dim.positivo.barras || dim.positivo.barras.n <= 0) continue;
      const pe = posicoes.find((p) => p.tipo === "porta-estribos" && p.tramo === t);
      const negativos = [dim.negativoEsq.barras, dim.negativoDir.barras].flatMap((b) =>
        b && b.n > 0 ? [b] : [],
      );
      const menor = negativos.reduce<(typeof negativos)[number] | undefined>(
        (m, b) => (m === undefined || b.area < m.area ? b : m),
        undefined,
      );
      const cima = pe
        ? {
            quem: "os porta-estribos",
            texto: `${pe.quantidade} φ${numAte(pe.phi, 1)}`,
            area: pe.quantidade * areaBarra(pe.phi),
          }
        : menor
          ? {
              quem: "as barras do negativo",
              texto: `${menor.n} φ${numAte(menor.phi, 1)}`,
              area: menor.area,
            }
          : undefined;
      const onde = `${e.nome} tramo ${t + 1}: armadura dupla; a armadura comprimida (A's = ${num(asComp, 2)} cm²)`;
      if (!cima || cima.area < asComp) {
        avisos.push(`${onde} não está detalhada.`);
        continue;
      }
      avisos.push(
        `${onde} fica com ${cima.quem} (${cima.texto} = ${num(cima.area, 2)} cm²); confira o travamento delas pelos estribos.`,
      );
      memoria.push({
        descricao: `Tramo ${t + 1}: armadura comprimida com ${cima.quem}`,
        formula: `A's = ${num(asComp, 2)} ≤ ${cima.texto} = ${num(cima.area, 2)} cm²`,
        valor: cima.area,
        unidade: "cm²",
        ref: "detalhamento da V2 [VERIFICAR]",
      });
    }
  };

  /** Porta-estribos do tramo t onde o negativo das pontas não chega. */
  const portaEstribos = (t: number) => {
    if (balanco(t)) return;
    const cE = cobInicio[t] ?? 0;
    const cD = cobFim[t] ?? 0;
    if (cE + cD >= vao(t)) return;
    const ini =
      cE > 0
        ? cE - TRANSPASSE_PORTA_ESTRIBOS
        : extremo(t)
          ? -(largura(t) / 2 - c)
          : -TRANSPASSE_PORTA_ESTRIBOS;
    const fim =
      cD > 0
        ? vao(t) - cD + TRANSPASSE_PORTA_ESTRIBOS
        : extremo(t + 1)
          ? vao(t) + largura(t + 1) / 2 - c
          : vao(t) + TRANSPASSE_PORTA_ESTRIBOS;
    adiciona({
      tipo: "porta-estribos",
      tramo: t,
      phi: phiPortaEstribos(e.h),
      quantidade: 2,
      aco: mat.aco,
      reto: fim - ini,
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: xNo(t) + ini,
      xFim: xNo(t) + fim,
      espacamento: null,
    });
  };

  /** Estribos do tramo t: de face a face (no balanço, da face à ponta menos o
   *  cobrimento); n = ⌈l/s⌉ + 1; comprimento = perímetro externo + ganchos. */
  const estribos = (t: number) => {
    const est = e.dimensionamento[t]?.estribo;
    if (!est || !(est.espacamento > 0)) return;
    const ini = livre(t) ? c : largura(t) / 2;
    const fim = livre(t + 1) ? vao(t) - c : vao(t) - largura(t + 1) / 2;
    const l = fim - ini;
    if (l <= 0) {
      avisos.push(`${e.nome} tramo ${t + 1}: sem vão livre para estribos.`);
      return;
    }
    const perimetro = 2 * (e.bw - 2 * c) + 2 * (e.h - 2 * c);
    adiciona({
      tipo: "estribo",
      tramo: t,
      phi: est.phi,
      quantidade: Math.ceil(l / est.espacamento - 1e-9) + 1,
      aco: mat.acoEstribo,
      reto: perimetro + regras.ganchosEstribo(est.phi),
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: xNo(t) + ini,
      xFim: xNo(t) + fim,
      espacamento: est.espacamento,
    });
  };

  for (let t = 0; t < n; t++) {
    if (t === 0) negativoNo(0, 0);
    positivoTramo(t);
    negativoNo(t + 1, t);
    portaEstribos(t);
    estribos(t);
  }
  armaduraDupla();
  return { nome: e.nome, posicoes, avisos, memoria };
}

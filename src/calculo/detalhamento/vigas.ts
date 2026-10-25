// Detalhamento das armaduras de viga contínua: posições N1, N2… com bitola,
// quantidade e comprimento, a partir da envoltória (vigas/continua.ts) e do
// dimensionamento de cada tramo. Regras e fontes em docs/DETALHAMENTO.md.
// O que muda entre as normas fica em RegrasDetalhamento (REGRAS_6118 e
// REGRAS_NB178); a geometria do detalhamento é comum.
// Unidades: comprimentos e abscissas em cm, φ em mm, cortantes em kN.
import { num } from "../texto";
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
}

export const REGRAS_6118: RegrasDetalhamento = {
  norma: "nbr6118-2023",
  aderencia: aderencia6118,
  ancoragemBasica: ancoragemBasica6118,
  ancoragemNecessaria: ancoragemNecessaria6118,
  decalagem: decalagem6118,
  gancho: gancho6118,
  ganchosEstribo: ganchosEstribo6118,
};

export const REGRAS_NB178: RegrasDetalhamento = {
  norma: "nb1-78",
  aderencia: (posicao, h) => aderenciaNb178(posicao, h),
  ancoragemBasica: ancoragemBasicaNb178,
  ancoragemNecessaria: (anc) => ancoragemNecessariaNb178(anc),
  decalagem: (_vsd, _bw, d) => decalagemNb178(d),
  gancho: (phi) => ganchoNb178(phi),
  ganchosEstribo: ganchosEstriboNb178,
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

export type TipoPosicao = "positiva" | "negativa" | "porta-estribos" | "construtiva" | "estribo";

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
   *  lb,ef = b − c ≥ máx(lb,nec com gancho; r + 5,5 φ; 6 cm) (6118 18.3.2.4.1).
   *  Nas duas normas o lb,nec é o da 6118 (redução por As,anc/As,ef e gancho, com
   *  lb,mín), sobre o lb e a decalagem da norma da obra. [VERIFICAR] o texto da
   *  NB-1/78 não foi lido; a V1 não confere, e o lb cheio sem reduções reprovava
   *  quase todo apoio extremo (obra Alpha1: 66 cm de φ12,5 em apoio de 19 cm). */
  const confereApoioExtremo = (
    nome: string,
    k: number,
    basica: AncoragemBasica,
    asAnc: number,
    asEf: number,
  ) => {
    const phi = basica.phi;
    const anc = ancoragemNecessaria6118(basica, asAnc, asEf, true);
    const nec = anc.lbNec;
    const r = (pinoDobramento(phi, mat.aco) / 2) * (phi / 10);
    const exigido = Math.max(nec, r + (5.5 * phi) / 10, 6);
    const disponivel = largura(k) - c;
    memoria.push(
      ...anc.memoria.map((m) => ({
        ...m,
        descricao: `${nome}: apoio ${k + 1} (extremo), As,anc = ${num(asAnc, 2)} cm²: ${m.descricao}`,
      })),
    );
    memoria.push({
      descricao: `${nome}: ancoragem no apoio ${k + 1} (extremo)`,
      formula: `lb,ef = b − c = ${num(disponivel, 1)} ≥ máx(lb,nec com gancho; r + 5,5 φ; 6 cm) = ${num(exigido, 1)}`,
      valor: exigido,
      unidade: "cm",
      ref: "6118:2023 18.3.2.4 e 18.3.2.4.1 (Bastos, Vigas, Eq. 39 a 44)",
    });
    if (disponivel < exigido) {
      avisos.push(
        `${e.nome} ${nome}: ancoragem no apoio ${k + 1} insuficiente (lb,ef = ${num(disponivel, 1)} cm < ${num(exigido, 1)} cm); use grampos ou aumente o apoio.`,
      );
    }
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
    if (extremo(k)) confereApoioExtremo(nome, k, basica, s.flexao?.as ?? 0, s.barras.area);

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
    if ((s.flexao?.asComprimida ?? 0) > 0) {
      avisos.push(
        `${e.nome} tramo ${t + 1}: armadura dupla; a armadura comprimida (A's = ${num(s.flexao?.asComprimida ?? 0, 2)} cm²) não está detalhada.`,
      );
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
    const asAnc = (v: number) => (a / e.d) * ((e.gamaF * v) / (mat.fyd / 10)); // 18.3.2.4 b, cm²

    // início (nó t) e fim (nó t + 1), em abscissa do tramo
    let ini: number;
    let ganchoIni = 0;
    if (extremo(t)) {
      ini = -(largura(t) / 2 - c);
      ganchoIni = gancho;
      confereApoioExtremo(nome, t, basica, asAnc(tr.vEsq), area);
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
      confereApoioExtremo(nome, t + 1, basica, asAnc(tr.vDir), area);
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
  return { nome: e.nome, posicoes, avisos, memoria };
}

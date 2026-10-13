// Detalhamento das armaduras de laje maciça retangular: posições positivas nas
// duas direções, negativas sobre os bordos e a distribuição das negativas, a
// partir da armadura adotada (LajeArmadura) e da geometria. Regras e fontes em
// docs/DETALHAMENTO.md, seção "Lajes e pilares". O que muda entre as normas
// fica em RegrasLaje (REGRAS_LAJE_6118 e REGRAS_LAJE_NB178); aderência, lb,
// lb,nec e ganchos vêm de ancoragem.ts via RegrasDetalhamento (vigas.ts).
// Unidades: vãos de entrada em m; comprimentos, abscissas e larguras em cm;
// φ em mm; reações em kN/m; armaduras em cm²/m.
import { BORDOS, type Aco, type Bordo, type NormaId, type Vinculo } from "../../dominio/obra";
import { areaBarra, escolheMalha } from "../barras";
import {
  DISTRIBUICAO_MIN as DISTRIBUICAO_MIN_NB178,
  MALHA as MALHA_NB178,
} from "../normas/nb1-78/lajes";
import {
  DISTRIBUICAO_MIN as DISTRIBUICAO_MIN_6118,
  DISTRIBUICAO_REL as DISTRIBUICAO_REL_6118,
  MALHA as MALHA_6118,
} from "../normas/nbr6118-2023/lajes";
import { rhoMin6118 } from "../normas/nbr6118-2023/vigas";
import type { Barra, ComMemoria, Etapa, LajeArmadura, MateriaisCalc } from "../tipos";
import { alturaGancho6118, barraLisa, pinoDobramento } from "./ancoragem";
import {
  COMPRIMENTO_BARRA_COMERCIAL,
  REGRAS_6118,
  REGRAS_NB178,
  type PosicaoArmadura,
  type RegrasDetalhamento,
  type TipoPosicao,
} from "./vigas";

const LAJES = "Bastos, Lajes de Concreto (UNESP)";
const V1_PROC = "V1 LAJEPROC.BAS ImprimeLinha";

// ---- regras por norma -------------------------------------------------------------

export interface DistribuicaoNegativa {
  /** Área mínima, cm²/m. */
  as: number;
  /** Malha: bitola mínima (mm) e espaçamentos mínimo e máximo (cm). */
  phiMin: number;
  sMin: number;
  sMax: number;
  formula: string;
  ref: string;
}

/** O que muda de uma norma para outra no detalhamento de lajes. */
export interface RegrasLaje {
  /** Aderência, lb, lb,nec e ganchos de barra (ancoragem.ts). */
  base: RegrasDetalhamento;
  /** Quanto o positivo passa do eixo de um apoio com continuidade (bordo
   *  engastado), cm. */
  extensaoContinuo(phi: number): { ext: number; ref: string };
  /** Quanto o positivo passa do eixo de um apoio sem continuidade (bordo
   *  apoiado) de largura b, cm, antes da conferência da ancoragem. */
  extensaoExtremo(phi: number, b: number, c: number): { ext: number; ref: string };
  /** Confere a ancoragem do positivo no apoio sem continuidade
   *  (6118 18.3.2.4.1 com al = 1,5 d de 19.4.1). */
  confereApoioExtremo: boolean;
  /** Comprimento de cada gancho das negativas, cm (perna vertical na espessura). */
  ganchoNegativo(h: number, c: number): { g: number; ref: string };
  /** O gancho de comprimento g (cm) vale como gancho de ancoragem (α = 0,7)? */
  ganchoAncora(g: number, phi: number, aco: Aco): boolean;
  /** Armadura de distribuição sob a negativa de área `as` (cm²/m). */
  distribuicao(as: number, h: number, fck: number): DistribuicaoNegativa;
}

/** NBR 6118:2023. Positivo até os apoios sem escalonamento, ≥ 4 cm além do eixo
 *  (20.1; Bastos, Lajes, item 3.12.6, p. 36); no apoio sem continuidade vai à
 *  face externa menos o cobrimento (Bastos, Lajes, p. 62) e a ancoragem é
 *  conferida. Gancho das negativas = h − 2c (Bastos, Lajes, p. 63: "gancho =
 *  h − 4 cm" com c = 2 cm). Distribuição: max(20 % da principal; 0,9 cm²/m;
 *  0,5 ρmín · 100 h), s ≤ 33 cm (Tabela 19.1 e 20.1; Bastos, Lajes, p. 33-34). */
export const REGRAS_LAJE_6118: RegrasLaje = {
  base: REGRAS_6118,
  extensaoContinuo: () => ({ ext: 4, ref: `6118:2023 20.1 (${LAJES}, item 3.12.6, p. 36)` }),
  extensaoExtremo: (_phi, b, c) => ({
    ext: b / 2 - c,
    ref: `6118:2023 20.1 (${LAJES}, item 3.17.8, p. 62)`,
  }),
  confereApoioExtremo: true,
  ganchoNegativo: (h, c) => ({ g: h - 2 * c, ref: `${LAJES}, item 3.17.8, p. 63` }),
  // 9.4.2.3 c: o gancho de 90° precisa de ponta reta ≥ 8 φ para valer α = 0,7.
  // Barra lisa: só o gancho semicircular vale (9.4.2.3), e a perna reta não é um.
  ganchoAncora: (g, phi, aco) => !barraLisa(aco) && g >= (8 * phi) / 10 - 1e-9,
  distribuicao: (as, h, fck) => ({
    as: Math.max(
      DISTRIBUICAO_REL_6118 * as,
      DISTRIBUICAO_MIN_6118,
      0.5 * rhoMin6118(fck) * 100 * h,
    ),
    phiMin: MALHA_6118.phiMin,
    sMin: MALHA_6118.sMin,
    sMax: MALHA_6118.sMaxSecundaria,
    formula: "max(20 % da principal; 0,9 cm²/m; 0,5 ρmín · 100 h), s ≤ 33 cm",
    ref: `6118:2023 Tabela 19.1 e 20.1 (${LAJES}, Tabela 10, p. 33-34)`,
  }),
};

/** NB-1/78 pela V1 (LAJEPROC.BAS ImprimeLinha): positivo = vão + 2 × 10 φ, isto
 *  é, 10 φ além do eixo dos dois apoios (limitado à face externa menos o
 *  cobrimento); gancho das negativas = h − 2 cm; sem conferência de ancoragem.
 *  Distribuição como a da V1 para laje armada numa direção: max(principal/5;
 *  0,9 cm²/m), com o s máximo da malha da V1 (20 cm). */
export const REGRAS_LAJE_NB178: RegrasLaje = {
  base: REGRAS_NB178,
  extensaoContinuo: (phi) => ({
    ext: (10 * phi) / 10,
    ref: `NB-1/78 (${V1_PROC}: vão + 2 · 10 φ)`,
  }),
  extensaoExtremo: (phi, b, c) => ({
    ext: Math.min((10 * phi) / 10, b / 2 - c),
    ref: `NB-1/78 (${V1_PROC}: vão + 2 · 10 φ, até a face externa − c)`,
  }),
  // [VERIFICAR] a V1 não confere a ancoragem do positivo da laje no apoio.
  confereApoioExtremo: false,
  ganchoNegativo: (h) => ({ g: h - 2, ref: `NB-1/78 (${V1_PROC}: 2 · (h − 2) cm)` }),
  ganchoAncora: () => true,
  // [VERIFICAR] a V1 não detalha a distribuição das negativas; usa a regra da
  // distribuição da laje armada numa direção (V1 LAJCALC.BM).
  distribuicao: (as) => ({
    as: Math.max(as / 5, DISTRIBUICAO_MIN_NB178),
    phiMin: MALHA_NB178.phiMin,
    sMin: MALHA_NB178.sMin,
    sMax: MALHA_NB178.sMax,
    formula: "max(principal/5; 0,9 cm²/m), s ≤ 20 cm",
    ref: "NB-1/78 (V1 LAJCALC.BM, distribuição; LAJEPROC s ≤ 20 cm) [VERIFICAR]",
  }),
};

export const regrasLaje = (id: NormaId) => (id === "nb1-78" ? REGRAS_LAJE_NB178 : REGRAS_LAJE_6118);

// ---- entrada e saída ----------------------------------------------------------------

export interface LajeDetalhamentoEntrada {
  nome: string;
  /** Vãos teóricos, m, entre eixos de apoio (no bordo livre, até a borda). */
  lx: number;
  ly: number;
  /** Espessura e cobrimento nominal, cm. */
  h: number;
  cobrimento: number;
  vinculos: Record<Bordo, Vinculo>;
  /** Largura da viga de cada bordo, cm (bordo livre: 0). */
  larguraApoios: Record<Bordo, number>;
  /** Armadura adotada (Norma.lajeArmadura). */
  armadura: Pick<LajeArmadura, "asNegativos" | "barrasX" | "barrasY" | "barrasNegativos">;
  /** Reação característica em cada bordo, kN/m (LajeEsforcos.reacoes). */
  reacoes: Record<Bordo, number>;
  /** Coeficiente que leva a reação característica à de cálculo. */
  gamaF: number;
  /** Menor vão (m) da laje vizinha de cada bordo engastado; sem ele, usa o da própria. */
  vaoMenorVizinha?: Partial<Record<Bordo, number>>;
  /** Menor espessura (cm) das lajes vizinhas de cada bordo engastado. A
   *  negativa entra nelas, então o gancho usa a menor h entre esta laje e
   *  elas; sem o valor, usa o h desta laje. */
  hVizinhaMin?: Partial<Record<Bordo, number>>;
  /** Bordos cujo negativo já é detalhado pela laje vizinha (não conta duas vezes). */
  negativoNaVizinha?: readonly Bordo[];
  mat: MateriaisCalc;
}

export type TipoPosicaoLaje = Extract<TipoPosicao, "positiva" | "negativa"> | "distribuicao";

/** Posição de laje: o formato de PosicaoArmadura (vigas.ts), com a direção das
 *  barras e o bordo das negativas. `tramo` = 0; `xInicio`/`xFim` = abscissas
 *  do trecho reto ao longo da barra, cm, a partir do eixo do bordo esquerdo
 *  (barras em x) ou inferior (barras em y); `espacamento` = s das barras. */
export interface PosicaoLaje extends Omit<PosicaoArmadura, "tipo"> {
  tipo: TipoPosicaoLaje;
  /** Direção das barras. */
  direcao: "x" | "y";
  /** Bordo da negativa e da distribuição; null nas positivas. */
  bordo: Bordo | null;
}

export interface LajeDetalhamento extends ComMemoria {
  nome: string;
  /** Também servem de itens para tabelaAco(). */
  posicoes: PosicaoLaje[];
}

// ---- geometria ----------------------------------------------------------------------

/** Bordo oposto. */
const OPOSTO: Record<Bordo, Bordo> = {
  esquerdo: "direito",
  direito: "esquerdo",
  inferior: "superior",
  superior: "inferior",
};
/** Bordos nas pontas das barras de cada direção: [início, fim]. */
const PONTAS: Record<"x" | "y", [Bordo, Bordo]> = {
  x: ["esquerdo", "direito"],
  y: ["inferior", "superior"],
};
/** Barras perpendiculares ao bordo correm nesta direção. */
const direcaoNormal = (b: Bordo): "x" | "y" => (b === "esquerdo" || b === "direito" ? "x" : "y");
const outra = (d: "x" | "y") => (d === "x" ? "y" : "x");

/** Arredonda para cima em cm, tolerando resíduo numérico. */
const arredonda = (v: number) => Math.max(0, Math.ceil(v - 1e-6));
/** Barras distribuídas num trecho l com espaçamento s: ⌈l/s⌉ + 1. */
const quantidade = (l: number, s: number) => (l > 0 ? Math.ceil(l / s - 1e-9) + 1 : 0);
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const temBarra = (b: Barra | undefined): b is Barra => !!b && b.phi > 0 && b.espacamento > 0;

// ---- detalhamento -----------------------------------------------------------------

/**
 * Detalha a laje. Ordem: positivo em x, positivo em y e, por bordo (esquerdo,
 * inferior, direito, superior), a negativa e a distribuição dela.
 * - Positivo: de apoio a apoio, sem escalonamento. A quantidade é ⌈l0/s⌉ + 1,
 *   com l0 = vão livre entre as faces dos apoios (no bordo livre, até a borda
 *   menos o cobrimento). Cada ponta passa do eixo do apoio pelo que a norma
 *   pede (RegrasLaje); no bordo livre para na borda menos o cobrimento.
 * - Negativa sobre bordo engastado: barras retas com gancho nas duas pontas
 *   (pela menor espessura entre esta laje e as vizinhas do bordo, para caber
 *   nas duas), 0,25 x + lb,nec para cada lado do eixo, com x = o maior dos menores vãos
 *   das duas lajes (critério da NB-1/78 adotado por Bastos, Lajes, item 3.12.5,
 *   Eq. 68 e 69, arranjo 1 da Figura 32). Do lado da própria laje fica limitada
 *   ao vão; se o bordo oposto é livre (balanço), vai até a borda menos o
 *   cobrimento.
 * - Negativa de borda sobre bordo apoiado (quando a armadura a traz; 6118
 *   19.3.3.2): da face externa da viga menos o cobrimento até 0,15 do menor
 *   vão além da face interna, com gancho nas duas pontas.
 * - Distribuição: barras paralelas ao bordo, de face a face dos apoios
 *   vizinhos, a cada s no trecho da negativa fora da viga (⌈l/s⌉ por lado).
 */
export function detalharLaje(
  e: LajeDetalhamentoEntrada,
  regras: RegrasLaje = REGRAS_LAJE_6118,
): LajeDetalhamento {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const posicoes: PosicaoLaje[] = [];
  const { base } = regras;
  const mat = e.mat;
  const lisa = barraLisa(mat.aco);
  const c = e.cobrimento;
  const L = { x: e.lx * 100, y: e.ly * 100 };
  const lMenor = Math.min(L.x, L.y);
  const largura = (b: Bordo) => (e.vinculos[b] === "livre" ? 0 : e.larguraApoios[b]);
  /** Distância do eixo do bordo até onde as barras paralelas a ele começam: a
   *  face do apoio ou, no bordo livre, o cobrimento para dentro. */
  const recuo = (b: Bordo) => (e.vinculos[b] === "livre" ? c : largura(b) / 2);
  /** Comprimento livre na direção d, entre as faces dos apoios das pontas. */
  const vaoLivre = (d: "x" | "y") => {
    const [ini, fim] = PONTAS[d];
    return { ini: recuo(ini), fim: L[d] - recuo(fim), l0: L[d] - recuo(ini) - recuo(fim) };
  };

  const adiciona = (p: Omit<PosicaoLaje, "numero" | "nome" | "comprimento" | "tramo">) => {
    const numero = posicoes.length + 1;
    const reto = arredonda(p.reto);
    const ganchoInicio = arredonda(p.ganchoInicio);
    const ganchoFim = arredonda(p.ganchoFim);
    const comprimento = reto + ganchoInicio + ganchoFim;
    const pos: PosicaoLaje = {
      ...p,
      numero,
      nome: `N${numero}`,
      tramo: 0,
      reto,
      ganchoInicio,
      ganchoFim,
      comprimento,
    };
    posicoes.push(pos);
    if (comprimento > COMPRIMENTO_BARRA_COMERCIAL)
      avisos.push(
        `${e.nome} ${pos.nome}: barra de ${fmt(comprimento / 100)} m, maior que a comercial de 12 m; prever emenda (não detalhada).`,
      );
    return pos;
  };

  const ancoragem = (nome: string, phi: number, pos: "inferior" | "superior") => {
    const ad = base.aderencia(pos, e.h, c + phi / 20);
    const basica = base.ancoragemBasica(phi, ad, mat);
    memoria.push(...basica.memoria.map((m) => ({ ...m, descricao: `${nome}: ${m.descricao}` })));
    return basica;
  };

  /** Ponta do positivo de bitola φ (barra em `s`) junto ao bordo k: quanto passa
   *  do eixo (negativo = para antes, no bordo livre) e o gancho. */
  const pontaPositivo = (nome: string, k: Bordo, barra: Barra) => {
    const { phi } = barra;
    const v = e.vinculos[k];
    // barra lisa tracionada: gancho obrigatório em toda ponta (6118 9.4.2.1 a)
    const ganchoLisa = lisa ? base.gancho(phi, mat.aco) : 0;
    if (v === "livre") {
      avisos.push(
        `${e.nome} bordo ${k} livre: a armadura de borda livre (6118 20.2, grampos em U) não está detalhada.`,
      );
      return { ext: -c, gancho: ganchoLisa };
    }
    if (v === "engastado") {
      const { ext, ref } = regras.extensaoContinuo(phi);
      memoria.push({
        descricao: `${nome}: positivo além do eixo do bordo ${k} (contínuo)`,
        valor: ext,
        unidade: "cm",
        ref,
      });
      return { ext, gancho: ganchoLisa };
    }
    const b = largura(k);
    const { ext, ref } = regras.extensaoExtremo(phi, b, c);
    memoria.push({
      descricao: `${nome}: positivo além do eixo do bordo ${k} (apoio sem continuidade, b = ${fmt(b)} cm)`,
      valor: ext,
      unidade: "cm",
      ref,
    });
    if (ext < 4 - 1e-9 && regras.confereApoioExtremo)
      avisos.push(
        `${e.nome} ${nome}: o positivo passa só ${fmt(ext)} cm do eixo do bordo ${k}; a 6118 (20.1) pede 4 cm.`,
      );
    if (!regras.confereApoioExtremo) return { ext, gancho: ganchoLisa };

    // 6118 19.4.1: al = 1,5 d; 18.3.2.4 b: As,anc = (al/d) Vd/fyd; 18.3.2.4.1:
    // lb,ef = b − c ≥ lb,nec (reta) ou máx(lb,nec com gancho; r + 5,5 φ; 6 cm)
    const vd = e.gamaF * Math.max(e.reacoes[k], 0);
    const asCalc = (1.5 * vd) / (mat.fyd / 10);
    const asEf = (areaBarra(phi) * 100) / barra.espacamento;
    const basica = ancoragem(nome, phi, "inferior");
    const disponivel = b - c;
    const reta = Math.max(base.ancoragemNecessaria(basica, asCalc, asEf, false).lbNec, 6);
    const lbGancho = base.ancoragemNecessaria(basica, asCalc, asEf, true).lbNec;
    const r = (pinoDobramento(phi, mat.aco) / 2) * (phi / 10);
    const comGancho = Math.max(lbGancho, r + (5.5 * phi) / 10, 6);
    const usaGancho = lisa || disponivel < reta - 1e-9;
    const exigido = usaGancho ? comGancho : reta;
    memoria.push(
      {
        descricao: `${nome}: armadura a ancorar no bordo ${k}, Vd = ${fmt(vd)} kN/m`,
        formula: "As,anc = (al/d) Vd / fyd, al = 1,5 d",
        valor: asCalc,
        unidade: "cm²/m",
        ref: `6118:2023 19.4.1 e 18.3.2.4 b (${LAJES}, item 3.11.2.1, p. 31)`,
      },
      {
        descricao: `${nome}: ancoragem no bordo ${k} ${usaGancho ? "com gancho" : "reta"}`,
        formula: `lb,ef = b − c = ${fmt(disponivel)} ≥ ${usaGancho ? "máx(lb,nec com gancho; r + 5,5 φ; 6 cm)" : "máx(lb,nec; 6 cm)"} = ${fmt(exigido)}`,
        valor: exigido,
        unidade: "cm",
        ref: "6118:2023 18.3.2.4.1 (Bastos, Vigas, Eq. 39 a 44)",
      },
    );
    if (disponivel < exigido - 1e-9)
      avisos.push(
        `${e.nome} ${nome}: ancoragem no bordo ${k} insuficiente (lb,ef = ${fmt(disponivel)} cm < ${fmt(exigido)} cm); aumente o apoio ou use barras mais finas.`,
      );
    if (!usaGancho) return { ext, gancho: 0 };
    const gancho = base.gancho(phi, mat.aco);
    const altura = alturaGancho6118(phi, mat.aco);
    if (altura > e.h - 2 * c + 1e-9)
      avisos.push(
        `${e.nome} ${nome}: o gancho de ${fmt(altura)} cm de altura no bordo ${k} não cabe em h − 2c = ${fmt(e.h - 2 * c)} cm.`,
      );
    return { ext, gancho };
  };

  /** Positivo na direção d. */
  const positivo = (d: "x" | "y") => {
    const barra = d === "x" ? e.armadura.barrasX : e.armadura.barrasY;
    if (!temBarra(barra)) return;
    const nome = `N${posicoes.length + 1}`;
    const [kIni, kFim] = PONTAS[d];
    const ini = pontaPositivo(nome, kIni, barra);
    const fim = pontaPositivo(nome, kFim, barra);
    const { l0 } = vaoLivre(outra(d));
    adiciona({
      tipo: "positiva",
      direcao: d,
      bordo: null,
      phi: barra.phi,
      quantidade: quantidade(l0, barra.espacamento),
      aco: mat.aco,
      reto: ini.ext + L[d] + fim.ext,
      ganchoInicio: ini.gancho,
      ganchoFim: fim.gancho,
      xInicio: -ini.ext,
      xFim: L[d] + fim.ext,
      espacamento: barra.espacamento,
    });
  };

  /** Negativa do bordo k e a distribuição dela. */
  const negativa = (k: Bordo) => {
    const barra = e.armadura.barrasNegativos[k];
    const v = e.vinculos[k];
    if (!temBarra(barra) || v === "livre" || e.negativoNaVizinha?.includes(k)) return;
    const { phi } = barra;
    const nome = `N${posicoes.length + 1}`;
    const d = direcaoNormal(k);
    const b = largura(k);
    // no bordo engastado a barra entra na vizinha: o gancho tem de caber na mais fina
    const hGancho =
      v === "engastado" ? Math.min(e.h, e.hVizinhaMin?.[k] ?? Number.POSITIVE_INFINITY) : e.h;
    const { g, ref: refGancho } = regras.ganchoNegativo(hGancho, c);
    const ganchoAncora = regras.ganchoAncora(g, phi, mat.aco);
    let dentro: number;
    let fora: number;
    if (v === "engastado") {
      const asEf = (areaBarra(phi) * 100) / barra.espacamento;
      const basica = ancoragem(nome, phi, "superior");
      const nec = base.ancoragemNecessaria(basica, e.armadura.asNegativos[k], asEf, ganchoAncora);
      memoria.push(...nec.memoria.map((m) => ({ ...m, descricao: `${nome}: ${m.descricao}` })));
      const x = Math.max(lMenor, (e.vaoMenorVizinha?.[k] ?? 0) * 100);
      const ext = 0.25 * x + nec.lbNec;
      memoria.push({
        descricao: `${nome}: negativa do bordo ${k}, extensão para cada lado do eixo (x = ${fmt(x)} cm)`,
        formula: "0,25 x + lb,nec, x = maior dos menores vãos das duas lajes",
        valor: ext,
        unidade: "cm",
        ref: `NB-1/78, adotado por ${LAJES}, item 3.12.5, Eq. 68 e 69, p. 35`,
      });
      fora = ext;
      dentro = e.vinculos[OPOSTO[k]] === "livre" ? L[d] - c : Math.min(ext, L[d]);
    } else {
      // 6118 19.3.3.2: negativa de borda sem continuidade até 0,15 do menor vão além da face
      dentro = b / 2 + 0.15 * lMenor;
      fora = b / 2 - c;
      memoria.push({
        descricao: `${nome}: negativa de borda do bordo ${k}, 0,15 do menor vão além da face`,
        formula: `b/2 + 0,15 · ${fmt(lMenor)}`,
        valor: dentro,
        unidade: "cm",
        ref: `6118:2023 19.3.3.2 (${LAJES}, item 3.12.1, p. 33)`,
      });
    }
    memoria.push({
      descricao: `${nome}: gancho de cada ponta da negativa${hGancho < e.h ? ` (h = ${fmt(hGancho)} cm, a menor espessura do bordo ${k})` : ""}`,
      valor: g,
      unidade: "cm",
      ref: refGancho,
    });
    if (!ganchoAncora && lisa)
      avisos.push(
        `${e.nome} ${nome}: barra lisa (${mat.aco}) exige gancho semicircular (6118 9.4.2.1 a e 9.4.2.3); as pernas de ${fmt(g)} cm não valem como gancho (lb,nec sem a redução de 0,7); prever gancho semicircular.`,
      );
    else if (v === "engastado" && !ganchoAncora)
      avisos.push(
        `${e.nome} ${nome}: gancho de ${fmt(g)} cm < 8 φ (6118 9.4.2.3); a ancoragem foi calculada sem a redução do gancho.`,
      );
    // do lado de dentro a barra vai do eixo do bordo k para o centro da laje
    const inicioNoEixo = k === "esquerdo" || k === "inferior";
    const [xIni, xFim] = inicioNoEixo ? [-fora, dentro] : [L[d] - dentro, L[d] + fora];
    const { l0 } = vaoLivre(outra(d));
    adiciona({
      tipo: "negativa",
      direcao: d,
      bordo: k,
      phi,
      quantidade: quantidade(l0, barra.espacamento),
      aco: mat.aco,
      reto: dentro + fora,
      ganchoInicio: g,
      ganchoFim: g,
      xInicio: xIni,
      xFim,
      espacamento: barra.espacamento,
    });

    // distribuição: paralela ao bordo, sobre o trecho da negativa fora da viga
    const asPrincipal = e.armadura.asNegativos[k] > 0 ? e.armadura.asNegativos[k] : 0;
    const dist = regras.distribuicao(asPrincipal, e.h, mat.fck);
    const malha = escolheMalha(dist.as, dist.phiMin, dist.sMin, dist.sMax);
    memoria.push({
      descricao: `Distribuição da negativa do bordo ${k}`,
      formula: dist.formula,
      valor: dist.as,
      unidade: "cm²/m",
      ref: dist.ref,
    });
    if (malha === null) {
      avisos.push(`${e.nome}: nenhuma malha atende a distribuição da negativa do bordo ${k}.`);
      return;
    }
    const porLado = (l: number) => (l > 0 ? Math.ceil(l / malha.espacamento - 1e-9) : 0);
    const n = porLado(dentro - b / 2) + porLado(fora - b / 2);
    const vl = vaoLivre(outra(d));
    adiciona({
      tipo: "distribuicao",
      direcao: outra(d),
      bordo: k,
      phi: malha.phi,
      quantidade: n,
      aco: mat.aco,
      reto: vl.l0,
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: vl.ini,
      xFim: vl.fim,
      espacamento: malha.espacamento,
    });
  };

  positivo("x");
  positivo("y");
  for (const k of BORDOS) negativa(k);
  return { nome: e.nome, posicoes, avisos: [...new Set(avisos)], memoria };
}

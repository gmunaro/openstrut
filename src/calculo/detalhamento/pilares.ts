// Detalhamento das armaduras de pilar retangular, lance a lance: barras
// longitudinais com emenda por traspasse no lance de cima, estribos e estribos
// suplementares (grampos). Regras e fontes em docs/DETALHAMENTO.md, seção
// "Lajes e pilares". O que muda entre as normas fica em RegrasPilar
// (REGRAS_PILAR_6118 e REGRAS_PILAR_NB178); lb e ganchos vêm de ancoragem.ts
// via RegrasDetalhamento (vigas.ts).
// Unidades: comprimentos e cotas em cm, φ em mm.
import { num, numAte } from "../texto";
import type { NormaId, Pilar } from "../../dominio/obra";
import { geometriaPilar } from "../secaoPilar";
import { arranjoBarras } from "../normas/nb1-78/pilares";
import { estriboPilar } from "../normas/nbr6118-2023/pilares";
import type { Barra, ComMemoria, Etapa, MateriaisCalc, PilarResultado } from "../tipos";
import {
  COMPRIMENTO_BARRA_COMERCIAL,
  REGRAS_6118,
  REGRAS_NB178,
  type PosicaoArmadura,
  type RegrasDetalhamento,
  type TipoPosicao,
} from "./vigas";

const F4 = "Bastos, Ancoragem (mar/2024)";
const PILARES = "Bastos, Pilares (jun/2024)";

// ---- regras por norma -------------------------------------------------------------

export interface Traspasse {
  /** Comprimento de traspasse, cm. */
  l0: number;
  memoria: Etapa[];
}

/** O que muda de uma norma para outra no detalhamento de pilares. */
export interface RegrasPilar {
  /** lb e ganchos de estribo (ancoragem.ts). */
  base: RegrasDetalhamento;
  /** Traspasse das barras longitudinais de bitola φ (mm), todas emendadas na
   *  mesma seção. Barras verticais: boa aderência (6118 9.3.1 a). */
  traspasse(phi: number, mat: MateriaisCalc): Traspasse;
  /** Estribo mínimo da norma para conferir o adotado; null se a norma não
   *  expõe a regra (NB-1/78: o estribo já vem de pilarNb178). */
  estriboMinimo: ((phiL: number, bMin: number, mat: MateriaisCalc) => Barra) | null;
  /** Ref. da proteção contra flambagem por estribos (20 φt do canto). */
  refProtecao: string;
}

/** α0t com mais de 50 % das barras emendadas na mesma seção (6118 Tabela 9.4;
 *  F4 Tabela 4, p. 20). No pilar todas as barras emendam no mesmo nível. */
export const ALFA_0T_TODAS = 2;

/**
 * Traspasse pela NBR 6118:2023 (9.5.2.2.1; F4 Eq. 6 e 7, p. 19-20):
 * l0t = α0t lb,nec ≥ l0t,mín = máx(0,3 α0t lb; 15 φ; 20 cm), α0t = 2,0. Usa a
 * fórmula das barras tracionadas, a favor da segurança (a de comprimidas,
 * 9.5.2.3, não majora). lb,nec sem gancho e com As,calc/As,ef = 1 (a barra
 * emendada pode trabalhar plena).
 */
export function traspasse6118(phi: number, mat: MateriaisCalc): Traspasse {
  const basica = REGRAS_6118.ancoragemBasica(phi, "boa", mat);
  const nec = REGRAS_6118.ancoragemNecessaria(basica, 1, 1, false);
  const minimo = Math.max(0.3 * ALFA_0T_TODAS * basica.lb, (15 * phi) / 10, 20);
  const l0 = Math.max(ALFA_0T_TODAS * nec.lbNec, minimo);
  return {
    l0,
    memoria: [
      ...basica.memoria,
      ...nec.memoria,
      {
        descricao: `Traspasse das barras φ ${fmt(phi)} mm (todas na mesma seção)`,
        formula: `l0t = α0t lb,nec = ${ALFA_0T_TODAS} · ${num(nec.lbNec, 1)} ≥ máx(0,3 α0t lb; 15 φ; 20 cm) = ${num(minimo, 1)}`,
        valor: l0,
        unidade: "cm",
        ref: `6118:2023 9.5.2.2.1 e Tabela 9.4 (${F4}, Eq. 6 e 7, Tabela 4)`,
      },
    ],
  };
}

/** Traspasse na NB-1/78 pela regra da V1: emenda = lb arredondado para cima
 *  (DESEDC.BM DecEmenda#, do editor de vigas; a V1 não detalha pilares), com o
 *  lb de boa aderência da NB-1/78 (DcAncoragem#).
 *  [VERIFICAR] item da NB-1/78 não lido; a regra vem das emendas de vigas da V1. */
export function traspasseNb178(phi: number, mat: MateriaisCalc): Traspasse {
  const basica = REGRAS_NB178.ancoragemBasica(phi, "boa", mat);
  const l0 = Math.ceil(basica.lb - 1e-6);
  return {
    l0,
    memoria: [
      ...basica.memoria,
      {
        descricao: `Traspasse das barras φ ${fmt(phi)} mm`,
        formula: "l0 = lb (arredondado para cima)",
        valor: l0,
        unidade: "cm",
        ref: "NB-1/78 (V1 DESEDC.BM DecEmenda#) [VERIFICAR item da NB-1/78]",
      },
    ],
  };
}

export const REGRAS_PILAR_6118: RegrasPilar = {
  base: REGRAS_6118,
  traspasse: traspasse6118,
  estriboMinimo: (phiL, bMin, mat) => estriboPilar(phiL, bMin, mat.aco),
  refProtecao: `6118:2023 18.2.4 (${PILARES}, item 15.1, Figura 156, p. 154)`,
};

export const REGRAS_PILAR_NB178: RegrasPilar = {
  base: REGRAS_NB178,
  traspasse: traspasseNb178,
  estriboMinimo: null,
  // [VERIFICAR] a regra dos 20 φt foi herdada pela 6118; o item da NB-1/78 não foi lido.
  refProtecao: "NB-1/78, regra dos 20 φt (texto da 6118 18.2.4) [VERIFICAR item da NB-1/78]",
};

export const regrasPilar = (id: NormaId) =>
  id === "nb1-78" ? REGRAS_PILAR_NB178 : REGRAS_PILAR_6118;

// ---- proteção contra flambagem (18.2.4) -------------------------------------------

/**
 * Barras intermediárias de uma face fora da proteção do estribo poligonal
 * (6118 18.2.4): o canto protege até 2 barras, sem contar a de canto, a no
 * máximo 20 φt dela (eixo a eixo). As demais precisam de estribo suplementar.
 * `nFace` = barras da face com os cantos; `comprimentoFace` em cm;
 * `dLinha` = face → eixo da barra, cm; φt em mm.
 */
export function barrasDesprotegidas(
  nFace: number,
  comprimentoFace: number,
  dLinha: number,
  phiT: number,
) {
  if (nFace <= 2) return 0;
  const s = (comprimentoFace - 2 * dLinha) / (nFace - 1);
  const alcance = (20 * phiT) / 10;
  let n = 0;
  for (let i = 1; i <= nFace - 2; i++) {
    const posicao = Math.min(i, nFace - 1 - i);
    if (posicao > 2 || posicao * s > alcance + 1e-9) n++;
  }
  return n;
}

// ---- entrada e saída ----------------------------------------------------------------

export interface LancePilarDetalhamento {
  /** Pé-direito do lance, piso a piso, cm. */
  peDireito: number;
  /** Seção, cm: b na direção x, h na direção y. */
  b: number;
  h: number;
  /** Seção circular ou poligonal (`Pilar.secao`); ausente = retângulo b × h. */
  secao?: Pilar["secao"] | undefined;
  /** Barras, com o arranjo por face verificado, e estribo adotados (Norma.pilar). */
  resultado: Pick<PilarResultado, "barras" | "estribo">;
}

/**
 * Barras por face que o detalhamento usa: as do cálculo (`barras.porFaceX`,
 * faces de comprimento h; `porFaceY`, faces de comprimento b), que são as que
 * a resistência verificou. Se elas não fecham com n (2 porFaceX + 2 porFaceY
 * − 4 ≠ n), cai na distribuição da V1 sem demanda (arranjoBarras: a metade
 * maior das intermediárias nas faces mais longas), que pode não ser a
 * verificada: `origem` = "padrao" e o detalhamento avisa.
 */
export function arranjoDetalhado(barras: PilarResultado["barras"], b: number, h: number) {
  const { n, porFaceX, porFaceY } = barras;
  if (porFaceX >= 2 && porFaceY >= 2 && 2 * porFaceX + 2 * porFaceY - 4 === n)
    return { porFaceX, porFaceY, origem: "resultado" as const };
  const v1 = arranjoBarras(n, 0, 0, b, h);
  return { porFaceX: v1.nfx, porFaceY: v1.nfy, origem: "padrao" as const };
}

export interface PilarDetalhamentoEntrada {
  nome: string;
  /** Cobrimento nominal, cm (até o estribo). */
  cobrimento: number;
  /** Lances da base para o topo. */
  lances: LancePilarDetalhamento[];
  mat: MateriaisCalc;
}

export type TipoPosicaoPilar = Extract<TipoPosicao, "estribo"> | "longitudinal" | "grampo";

/** Posição de pilar: o formato de PosicaoArmadura (vigas.ts). `tramo` = índice
 *  do lance (0 = o de baixo); `xInicio`/`xFim` = cotas, cm, a partir da base do
 *  primeiro lance (estribos e grampos: da região estribada). */
export interface PosicaoPilar extends Omit<PosicaoArmadura, "tipo"> {
  tipo: TipoPosicaoPilar;
}

export interface PilarDetalhamento extends ComMemoria {
  nome: string;
  /** Também servem de itens para tabelaAco(). */
  posicoes: PosicaoPilar[];
}

const arredonda = (v: number) => Math.max(0, Math.ceil(v - 1e-6));
const fmt = (v: number) => numAte(v, 2);

// ---- detalhamento -----------------------------------------------------------------

/**
 * Detalha o pilar lance a lance (de baixo para cima): longitudinais, estribos
 * e grampos.
 * - Longitudinais: do piso do lance até o topo dele mais o traspasse com as
 *   barras do lance de cima (calculado pela menor das duas bitolas, 6118
 *   9.5.2.1). No último lance vão até o topo menos o cobrimento, sem gancho
 *   (barra comprimida). A espera na fundação não é detalhada.
 * - Estribos: em toda a altura do lance (6118 18.4.3); ⌈L/s⌉ por lance, mais
 *   1 na base do primeiro. Comprimento = 2 (b − 2c) + 2 (h − 2c) + ganchos.
 * - Grampos: um por barra intermediária fora da proteção do canto em cada face
 *   (barrasDesprotegidas), com as barras por face que o cálculo verificou
 *   (arranjoDetalhado), atravessando a seção até a face oposta, com o φ e o
 *   s do estribo (6118 18.2.4). Comprimento = lado − 2c + ganchos de estribo.
 */
export function detalharPilar(
  e: PilarDetalhamentoEntrada,
  regras: RegrasPilar = REGRAS_PILAR_6118,
): PilarDetalhamento {
  const avisos: string[] = [];
  const memoria: Etapa[] = [];
  const posicoes: PosicaoPilar[] = [];
  const mat = e.mat;
  const c = e.cobrimento;
  const z = [0];
  e.lances.forEach((l, i) => z.push((z[i] ?? 0) + l.peDireito));
  const cota = (i: number) => z[i] ?? 0;

  const adiciona = (p: Omit<PosicaoPilar, "numero" | "nome" | "comprimento">) => {
    const numero = posicoes.length + 1;
    const reto = arredonda(p.reto);
    const ganchoInicio = arredonda(p.ganchoInicio);
    const ganchoFim = arredonda(p.ganchoFim);
    const comprimento = reto + ganchoInicio + ganchoFim;
    const pos: PosicaoPilar = {
      ...p,
      numero,
      nome: `N${numero}`,
      reto,
      ganchoInicio,
      ganchoFim,
      comprimento,
    };
    posicoes.push(pos);
    if (p.tipo === "longitudinal" && comprimento > COMPRIMENTO_BARRA_COMERCIAL)
      avisos.push(
        `${e.nome} ${pos.nome}: barra de ${fmt(comprimento / 100)} m, maior que a comercial de 12 m; prever emenda intermediária (não detalhada).`,
      );
    return pos;
  };

  e.lances.forEach((lance, i) => {
    const { barras, estribo } = lance.resultado;
    const rotulo = `${e.nome} lance ${i + 1}`;
    if (!(barras.n > 0 && barras.phi > 0)) {
      avisos.push(`${rotulo}: sem barras longitudinais; lance não detalhado.`);
      return;
    }
    const L = lance.peDireito;
    const acima = e.lances[i + 1];

    // longitudinais
    let fim = L - c;
    if (acima) {
      const phiEmenda =
        acima.resultado.barras.phi > 0
          ? Math.min(barras.phi, acima.resultado.barras.phi)
          : barras.phi;
      const t = regras.traspasse(phiEmenda, mat);
      memoria.push(...t.memoria.map((m) => ({ ...m, descricao: `${rotulo}: ${m.descricao}` })));
      fim = L + t.l0;
      if (acima.b !== lance.b || acima.h !== lance.h)
        avisos.push(
          `${rotulo}: a seção muda para ${fmt(acima.b)} × ${fmt(acima.h)} cm no lance de cima; a dobra ou espera das barras não está detalhada.`,
        );
    }
    adiciona({
      tipo: "longitudinal",
      tramo: i,
      phi: barras.phi,
      quantidade: barras.n,
      aco: mat.aco,
      reto: fim,
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: cota(i),
      xFim: cota(i) + fim,
      espacamento: null,
    });

    // estribos
    if (!(estribo.phi > 0 && estribo.espacamento > 0)) {
      avisos.push(`${rotulo}: sem estribo adotado; estribos não detalhados.`);
      return;
    }
    const bMin = Math.min(lance.b, lance.h);
    const minimo = regras.estriboMinimo?.(barras.phi, bMin, mat);
    if (minimo) {
      memoria.push({
        descricao: `${rotulo}: estribo mínimo φ ${fmt(minimo.phi)} mm c/ ${fmt(minimo.espacamento)} cm; adotado φ ${fmt(estribo.phi)} c/ ${fmt(estribo.espacamento)}`,
        formula: "φt ≥ máx(5 mm; φ/4); s ≤ mín(20 cm; b; 12 φ, 24 φ no CA-25)",
        valor: minimo.espacamento,
        unidade: "cm",
        ref: `6118:2023 18.4.3 (${PILARES}, Eq. 110 e 111, p. 77)`,
      });
      if (estribo.phi < minimo.phi || estribo.espacamento > minimo.espacamento + 1e-9)
        avisos.push(
          `${rotulo}: estribo φ ${fmt(estribo.phi)} c/ ${fmt(estribo.espacamento)} cm fora do mínimo da norma (φ ${fmt(minimo.phi)} c/ ${fmt(minimo.espacamento)} cm, 18.4.3).`,
        );
    }
    const nEstribos = Math.ceil(L / estribo.espacamento - 1e-9) + (i === 0 ? 1 : 0);
    const ganchos = regras.base.ganchosEstribo(estribo.phi);
    const z0 = cota(i);
    adiciona({
      tipo: "estribo",
      tramo: i,
      phi: estribo.phi,
      quantidade: nEstribos,
      aco: mat.acoEstribo,
      reto: geometriaPilar(lance).estribo(c) + ganchos,
      ganchoInicio: 0,
      ganchoFim: 0,
      xInicio: z0,
      xFim: z0 + L,
      espacamento: estribo.espacamento,
    });

    // grampos (estribos suplementares): só na retangular, que tem faces b e h
    if (lance.secao) {
      avisos.push(
        `${rotulo}: seção ${lance.secao.tipo}: estribo pelo perímetro recuado do cobrimento; grampos não detalhados.`,
      );
      return;
    }
    const { porFaceX, porFaceY, origem } = arranjoDetalhado(barras, lance.b, lance.h);
    if (origem === "padrao")
      avisos.push(
        `${rotulo}: o arranjo do cálculo (${barras.porFaceX} e ${barras.porFaceY} barras por face) não fecha com ${barras.n} barras; usada a distribuição padrão (${porFaceX} e ${porFaceY}, as barras intermediárias a mais nas faces maiores), que pode não ser a verificada.`,
      );
    const dLinha = c + estribo.phi / 10 + barras.phi / 20;
    const faces = [
      // faces de comprimento h: o grampo atravessa a largura b
      { nFace: porFaceX, comprimento: lance.h, travessia: lance.b },
      { nFace: porFaceY, comprimento: lance.b, travessia: lance.h },
    ];
    for (const f of faces) {
      const soltas = barrasDesprotegidas(f.nFace, f.comprimento, dLinha, estribo.phi);
      memoria.push({
        descricao: `${rotulo}: barras sem proteção do canto em cada face de ${fmt(f.comprimento)} cm (${f.nFace} barras, alcance 20 φt = ${fmt((20 * estribo.phi) / 10)} cm)`,
        formula: "até 2 barras, sem a de canto, a ≤ 20 φt do canto",
        valor: soltas,
        ref: regras.refProtecao,
      });
      if (soltas === 0) continue;
      adiciona({
        tipo: "grampo",
        tramo: i,
        phi: estribo.phi,
        quantidade: soltas * nEstribos,
        aco: mat.acoEstribo,
        reto: f.travessia - 2 * c + ganchos,
        ganchoInicio: 0,
        ganchoFim: 0,
        xInicio: z0,
        xFim: z0 + L,
        espacamento: estribo.espacamento,
      });
    }
  });
  return { nome: e.nome, posicoes, avisos, memoria };
}

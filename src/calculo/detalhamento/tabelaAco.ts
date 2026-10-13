// Tabela de aço (resumo por bitola) de qualquer elemento: vigas, lajes, pilares.
// Port de DcTabelaAco# e DcPesoMetro# (V1 DESCALC.BM), com a perda somada no total.
import type { Aco } from "../../dominio/obra";

/** Massa específica do aço, kg/m³ (NBR 6118:2023 8.3.3; V1 DcPesoMetro#). */
export const MASSA_ESPECIFICA_ACO = 7850;
/** Perda (pontas, cortes e emendas) padrão sobre a massa: 10 %. Convenção de
 *  orçamento, não item de norma; o chamador pode passar outra. */
export const PERDA_PADRAO = 0.1;

/** Uma posição de armadura, como sai do detalhamento. */
export interface ItemAco {
  /** Bitola, mm. */
  phi: number;
  quantidade: number;
  /** Comprimento de cada barra, cm. */
  comprimento: number;
  /** Categoria do aço; sem ela a linha fica sem categoria. */
  aco?: Aco;
}

export interface LinhaTabelaAco {
  aco: Aco | null;
  phi: number;
  /** Comprimento total, m. */
  comprimento: number;
  /** kg/m */
  massaLinear: number;
  /** kg */
  massa: number;
}

export interface TabelaAco {
  /** Por categoria (sem categoria primeiro) e bitola crescente. */
  linhas: LinhaTabelaAco[];
  /** m */
  comprimentoTotal: number;
  /** kg, sem perda. */
  massa: number;
  /** Fração usada (0,10 = 10 %). */
  perda: number;
  /** kg, massa × (1 + perda). */
  massaComPerda: number;
}

/** Massa linear de uma barra de bitola φ (mm), kg/m: π φ²/4 · 7850. */
export const massaLinear = (phi: number) =>
  ((Math.PI * (phi / 1000) ** 2) / 4) * MASSA_ESPECIFICA_ACO;

const nomeAco = (a: Aco | null) => (a === null ? "" : a);

/**
 * Soma os itens por categoria de aço e bitola: comprimento total (m), massa
 * (kg) com a massa linear de cada bitola, e os totais com `perda` (fração).
 * Itens com quantidade ou comprimento não positivos não entram.
 */
export function tabelaAco(itens: readonly ItemAco[], perda = PERDA_PADRAO): TabelaAco {
  const porChave = new Map<string, LinhaTabelaAco>();
  for (const it of itens) {
    if (!(it.quantidade > 0 && it.comprimento > 0)) continue;
    const aco = it.aco ?? null;
    const chave = `${nomeAco(aco)}|${it.phi}`;
    const linha = porChave.get(chave) ?? {
      aco,
      phi: it.phi,
      comprimento: 0,
      massaLinear: massaLinear(it.phi),
      massa: 0,
    };
    const metros = (it.quantidade * it.comprimento) / 100;
    linha.comprimento += metros;
    linha.massa += metros * linha.massaLinear;
    porChave.set(chave, linha);
  }
  const linhas = [...porChave.values()].sort((a, b) =>
    a.aco === b.aco ? a.phi - b.phi : nomeAco(a.aco).localeCompare(nomeAco(b.aco)),
  );
  const massa = linhas.reduce((s, l) => s + l.massa, 0);
  return {
    linhas,
    comprimentoTotal: linhas.reduce((s, l) => s + l.comprimento, 0),
    massa,
    perda,
    massaComPerda: massa * (1 + perda),
  };
}

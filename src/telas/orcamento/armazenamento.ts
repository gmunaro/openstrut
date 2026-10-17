// Tabelas de preços e parâmetros do orçamento no navegador (IndexedDB, idb-keyval),
// num banco próprio: não entram no arquivo da obra. A tabela de referência (SINAPI)
// vem do código; a cópia editada pelo usuário fica aqui com o mesmo id.
import { createStore, get, set, type UseStore } from "idb-keyval";
import type { ConfigOrcamento, TabelaPrecos } from "../../dominio/orcamento";

let loja: UseStore | undefined;
/** Banco aberto só no primeiro uso. Nome próprio: createStore num banco que já
 *  existe com outra store não cria a store nova. */
const lojaOrcamento = () => (loja ??= createStore("openstrut-orcamento", "dados"));

const CHAVE_TABELAS = "tabelas";
const CHAVE_CONFIG = "config";

const ehTabela = (x: unknown): x is TabelaPrecos =>
  typeof x === "object" &&
  x !== null &&
  typeof (x as TabelaPrecos).id === "string" &&
  Array.isArray((x as TabelaPrecos).itens);

/** Tabelas guardadas (as do usuário e as cópias editadas da referência). */
export async function lerTabelas(): Promise<TabelaPrecos[]> {
  const v: unknown = await get(CHAVE_TABELAS, lojaOrcamento());
  return Array.isArray(v) ? v.filter(ehTabela) : [];
}

export const gravarTabelas = (tabelas: readonly TabelaPrecos[]) =>
  set(CHAVE_TABELAS, tabelas, lojaOrcamento());

export async function lerConfig(): Promise<Partial<ConfigOrcamento> | undefined> {
  const v: unknown = await get(CHAVE_CONFIG, lojaOrcamento());
  return typeof v === "object" && v !== null ? (v as Partial<ConfigOrcamento>) : undefined;
}

export const gravarConfig = (c: Partial<ConfigOrcamento>) => set(CHAVE_CONFIG, c, lojaOrcamento());

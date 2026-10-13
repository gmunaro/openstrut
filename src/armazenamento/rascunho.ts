// Rascunho automático da obra aberta no IndexedDB (idb-keyval). Cada obra
// aberta ganha um id de rascunho; a tela salva a cada edição com debounce e a
// tela inicial lista os recentes. O conteúdo é o mesmo texto do arquivo
// .openstrut.json, relido por lerObra: rascunho velho passa pela migração.
import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { NormaId, Obra } from "../dominio/obra";
import { lerObra, serializarObra, type LeituraObra } from "./arquivo";

export interface ResumoRascunho {
  id: string;
  nome: string;
  norma: NormaId;
  /** Instante do último salvamento, ms desde a época. */
  atualizadoEm: number;
}

interface RegistroRascunho extends ResumoRascunho {
  texto: string;
}

let loja: UseStore | undefined;
/** Banco aberto só no primeiro uso (não abre IndexedDB ao importar o módulo). */
const lojaRascunhos = () => (loja ??= createStore("sistrut-v2", "rascunhos"));

/** Id novo para o rascunho de uma obra recém-criada ou aberta de arquivo. */
export const novoIdRascunho = () => crypto.randomUUID();

/** Grava (ou substitui) o rascunho `id` com a obra. */
export async function salvarRascunho(id: string, obra: Obra, agora = Date.now()) {
  const registro: RegistroRascunho = {
    id,
    nome: obra.nome,
    norma: obra.norma,
    atualizadoEm: agora,
    texto: serializarObra(obra),
  };
  await set(id, registro, lojaRascunhos());
}

const ehRegistro = (x: unknown): x is RegistroRascunho =>
  typeof x === "object" &&
  x !== null &&
  "id" in x &&
  typeof x.id === "string" &&
  "nome" in x &&
  typeof x.nome === "string" &&
  "atualizadoEm" in x &&
  typeof x.atualizadoEm === "number" &&
  "texto" in x &&
  typeof x.texto === "string";

/** Rascunhos guardados, do mais recente para o mais antigo (sem o conteúdo). */
export async function listarRascunhos(): Promise<ResumoRascunho[]> {
  const todos = await entries<string, unknown>(lojaRascunhos());
  return todos
    .map(([, v]) => v)
    .filter(ehRegistro)
    .map(({ id, nome, norma, atualizadoEm }) => ({ id, nome, norma, atualizadoEm }))
    .sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

/** Lê o rascunho `id` com a mesma validação e migração do arquivo. */
export async function abrirRascunho(id: string): Promise<LeituraObra> {
  const registro = await get<unknown>(id, lojaRascunhos());
  if (!ehRegistro(registro)) return { ok: false, erros: ["Rascunho não encontrado."] };
  return lerObra(registro.texto);
}

export async function apagarRascunho(id: string) {
  await del(id, lojaRascunhos());
}

export interface SalvadorRascunho {
  /** Agenda o salvamento; outra chamada antes do prazo substitui a anterior
   *  (se for de outro rascunho, a anterior é gravada na hora). */
  agendar: (id: string, obra: Obra) => void;
  /** Salva já o que estiver agendado (ao sair da tela ou fechar a aba). */
  descarregar: () => Promise<void>;
  /** Descarta o que estiver agendado sem salvar. */
  cancelar: () => void;
}

/** Salvamento com debounce: grava só a última obra depois de `atrasoMs` sem edição. */
export function criarSalvadorRascunho(
  atrasoMs = 800,
  aoErrar: (erro: unknown) => void = () => {},
  salvar: (id: string, obra: Obra) => Promise<void> = salvarRascunho,
): SalvadorRascunho {
  let pendente: { id: string; obra: Obra } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancelar = () => {
    clearTimeout(timer);
    timer = undefined;
    pendente = null;
  };
  const descarregar = async () => {
    const p = pendente;
    cancelar();
    if (!p) return;
    try {
      await salvar(p.id, p.obra);
    } catch (e) {
      aoErrar(e);
    }
  };
  const agendar = (id: string, obra: Obra) => {
    // outra obra: a pendente da anterior é gravada já, não descartada
    if (pendente && pendente.id !== id) void descarregar();
    clearTimeout(timer);
    pendente = { id, obra };
    timer = setTimeout(() => void descarregar(), atrasoMs);
  };
  return { agendar, descarregar, cancelar };
}

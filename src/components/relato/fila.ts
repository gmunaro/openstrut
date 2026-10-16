// Fila de relatos que não saíram por falta de rede (caminho com relay). Fica no
// IndexedDB, num banco próprio, e é enviada quando a conexão volta ou o app abre.
import { createStore, del, entries, set } from "idb-keyval";
import type { RelatoEnviado, ResultadoRelay } from "./relay";

export interface RelatoNaFila {
  id: string;
  /** ISO 8601 de quando entrou na fila. */
  criado: string;
  relato: RelatoEnviado;
  /** O relay recusou o relato: não é reenviado sozinho; o usuário baixa ou descarta. */
  recusado?: string;
}

let loja: ReturnType<typeof createStore> | null = null;
const fila = () => (loja ??= createStore("openstrut-relatos", "fila"));

export async function enfileirar(relato: RelatoEnviado, agora = new Date()) {
  // o token do Turnstile vence em minutos: na hora de enviar, pede-se outro
  const { turnstile: _, ...semToken } = relato;
  const item: RelatoNaFila = {
    id: crypto.randomUUID(),
    criado: agora.toISOString(),
    relato: semToken,
  };
  await set(item.id, item, fila());
  return item;
}

/** Relatos guardados, do mais antigo para o mais novo. */
export async function listarFila() {
  const todos = await entries<string, RelatoNaFila>(fila());
  return todos.map(([, v]) => v).sort((a, b) => a.criado.localeCompare(b.criado));
}

export const removerDaFila = (id: string) => del(id, fila());

/**
 * Tenta enviar os relatos da fila, em ordem. Para no primeiro erro de rede ou
 * temporário (o resto espera a próxima vez); o recusado fica marcado e sai da tentativa
 * automática. Devolve quantos foram enviados.
 */
export async function enviarFila(enviar: (r: RelatoEnviado) => Promise<ResultadoRelay>) {
  let enviados = 0;
  for (const item of await listarFila()) {
    if (item.recusado) continue;
    const r = await enviar(item.relato);
    if (r.tipo === "enviado") {
      await removerDaFila(item.id);
      enviados++;
    } else if (r.tipo === "recusado") {
      await set(item.id, { ...item, recusado: r.mensagem }, fila());
    } else {
      break;
    }
  }
  return enviados;
}

// Respostas JSON, CORS e leitura do corpo com teto de tamanho.
import type { Env } from "./tipos";

export type CodigoErro =
  | "invalido"
  | "origem"
  | "turnstile"
  | "grande"
  | "limite"
  | "github"
  | "metodo"
  | "rota"
  | "interno";

const ORIGENS_PADRAO = "https://gmunaro.github.io,http://localhost:4173,http://127.0.0.1:41780";

/**
 * A origem da requisição, se estiver em ALLOWED_ORIGINS; senão null.
 * Isso só barra navegador: qualquer script manda o Origin que quiser. A proteção
 * de verdade contra abuso é a taxa por IP e o Turnstile.
 */
export function origemPermitida(origem: string | null, env: Env) {
  if (!origem) return null;
  const lista = (env.ALLOWED_ORIGINS ?? ORIGENS_PADRAO).split(",").map((o) => o.trim());
  return lista.includes(origem) ? origem : null;
}

export function cabecalhosCors(origem: string | null): Record<string, string> {
  if (!origem) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cabecalhos },
  });
}

export function erro(
  status: number,
  codigo: CodigoErro,
  mensagem: string,
  cabecalhos: Record<string, string> = {},
) {
  return json(status, { ok: false, erro: codigo, mensagem }, cabecalhos);
}

/** Texto do corpo, ou null se passar de `limite` bytes (para de ler assim que passa). */
export async function lerCorpoLimitado(request: Request, limite: number) {
  if (!request.body) return "";
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

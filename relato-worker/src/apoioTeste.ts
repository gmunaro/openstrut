// Dublês para os testes: KV e rate limit em memória, um GitHub/Turnstile falso
// no lugar do fetch global e fábricas de requisição e relato.
import { vi } from "vitest";
import type { ArmazemKV, Env, LimitadorTaxa } from "./tipos";
import type { RelatoEnviado } from "./validar";

export const ORIGEM = "https://gmunaro.github.io";
export const IP = "203.0.113.7";

export function kvMemoria() {
  const dados = new Map<string, { valor: string; ttl: number | undefined }>();
  const kv: ArmazemKV = {
    async get(chave) {
      return dados.get(chave)?.valor ?? null;
    },
    async put(chave, valor, opcoes) {
      dados.set(chave, { valor, ttl: opcoes?.expirationTtl });
    },
  };
  return { kv, dados };
}

export function limitador(sucesso = true) {
  const chaves: string[] = [];
  const binding: LimitadorTaxa = {
    async limit({ key }) {
      chaves.push(key);
      return { success: sucesso };
    },
  };
  return { binding, chaves };
}

export function envTeste(extra: Partial<Env> = {}) {
  const { kv, dados } = kvMemoria();
  const taxa = limitador();
  const env: Env = {
    GITHUB_TOKEN: "token-principal",
    LIMITE_IP: taxa.binding,
    RELATOS_KV: kv,
    ...extra,
  };
  return { env, dados, taxa };
}

export interface Chamada {
  metodo: string;
  url: string;
  token: string | null;
  corpo: unknown;
}

interface OpcoesGitHub {
  branchExiste?: boolean;
  refJaExiste?: boolean;
  statusIssue?: number;
  turnstile?: boolean;
}

/** Troca o fetch global por um GitHub falso e devolve as chamadas recebidas. */
export function githubFalso(opcoes: OpcoesGitHub = {}) {
  const chamadas: Chamada[] = [];
  const responder = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const falso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const corpo: unknown =
      init?.body instanceof FormData
        ? Object.fromEntries(init.body.entries())
        : typeof init?.body === "string"
          ? JSON.parse(init.body)
          : undefined;
    chamadas.push({ metodo, url, token: headers.get("Authorization"), corpo });

    if (url.startsWith("https://challenges.cloudflare.com/")) {
      return responder(200, { success: opcoes.turnstile ?? true });
    }
    if (metodo === "GET" && url.includes("/git/ref/heads/")) {
      return opcoes.branchExiste === false
        ? responder(404, { message: "Not Found" })
        : responder(200, { object: { sha: "abc" } });
    }
    if (url.endsWith("/git/trees")) return responder(201, { sha: "arvore1" });
    if (url.endsWith("/git/commits")) return responder(201, { sha: "commit1" });
    if (url.endsWith("/git/refs")) {
      return opcoes.refJaExiste
        ? responder(422, { message: "Reference already exists" })
        : responder(201, { ref: "refs/heads/relatos" });
    }
    if (metodo === "PUT" && url.includes("/contents/")) return responder(201, { content: {} });
    if (url.endsWith("/issues")) {
      const status = opcoes.statusIssue ?? 201;
      return status === 201
        ? responder(201, { number: 42, html_url: "https://github.com/gmunaro/openstrut/issues/42" })
        : responder(status, { message: "segredo interno do GitHub" });
    }
    return responder(500, { message: "rota não prevista no teste" });
  });
  vi.stubGlobal("fetch", falso);
  return { chamadas, falso };
}

/** PNG mínimo em base64 (assinatura + bytes quaisquer). */
export const PNG_BASE64 = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13),
);

export function relatoBase(extra: Partial<RelatoEnviado> = {}): RelatoEnviado {
  return {
    versao: 1,
    titulo: "Viga V3 sem armadura",
    aconteceu: "Calculei a viga e a armadura saiu zerada.",
    esperado: "Uma armadura positiva.",
    diagnostico: [
      { rotulo: "Versão", valor: "2.0.0" },
      { rotulo: "Navegador", valor: "Firefox" },
    ],
    erros: [],
    ...extra,
  };
}

interface OpcoesRequisicao {
  metodo?: string;
  caminho?: string;
  origem?: string | null;
  cabecalhos?: Record<string, string>;
}

export function requisicao(corpo: unknown, opcoes: OpcoesRequisicao = {}) {
  const { metodo = "POST", caminho = "/relato", origem = ORIGEM, cabecalhos = {} } = opcoes;
  const headers = new Headers({
    "Content-Type": "application/json",
    "CF-Connecting-IP": IP,
    ...cabecalhos,
  });
  if (origem) headers.set("Origin", origem);
  const init: RequestInit = { method: metodo, headers };
  if (corpo !== undefined) init.body = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return new Request(`https://openstrut-relato.exemplo.workers.dev${caminho}`, init);
}

/** Campo de texto do corpo JSON de uma chamada (vazio se não houver). */
export function campo(corpo: unknown, nome: string) {
  if (typeof corpo !== "object" || corpo === null || !(nome in corpo)) return "";
  return String(Object.getOwnPropertyDescriptor(corpo, nome)?.value);
}

/** Proíbe rede de verdade: teste que não instala o GitHub falso e chega ao fetch falha. */
export function semRede() {
  vi.stubGlobal("fetch", async () => {
    throw new Error("rede proibida nos testes");
  });
}

// Caminho do relato com relay (relato-worker/, docs/RELATO.md): o app manda o relato
// por POST ao Worker, que cria a issue com o token dele. Usado quando o build define
// VITE_RELATO_URL; sem ela, o relato abre a página de nova issue do GitHub.
import type { Diagnostico } from "./diagnostico";

/** Corpo do POST ao relay. Mesmo contrato de relato-worker/src (não mude os nomes). */
export interface RelatoEnviado {
  versao: 1;
  titulo: string;
  aconteceu: string;
  esperado: string;
  email?: string;
  diagnostico: Diagnostico["itens"];
  erros: string[];
  /** PNG em base64, sem o prefixo `data:`. */
  print?: string;
  obra?: { nome: string; json: string };
  turnstile?: string;
}

export type ResultadoRelay =
  | { tipo: "enviado"; numero: number; url: string }
  /** sem conexão: o relato vai para a fila */
  | { tipo: "rede" }
  /** limite de taxa, Turnstile vencido ou falha do servidor: tentar mais tarde */
  | { tipo: "temporario"; mensagem: string }
  /** o relay recusou o conteúdo: repetir não adianta */
  | { tipo: "recusado"; mensagem: string };

export type Caminho = { tipo: "relay"; url: string } | { tipo: "github" };

/** Qual caminho o build usa: relay quando VITE_RELATO_URL está definida. */
export function caminhoRelato(url = import.meta.env.VITE_RELATO_URL): Caminho {
  return url?.trim() ? { tipo: "relay", url: url.trim() } : { tipo: "github" };
}

interface RespostaRelay {
  ok?: boolean;
  numero?: number;
  url?: string;
  erro?: string;
  mensagem?: string;
}

/** Envia ao relay e classifica a resposta. Não lança: erro de rede vira `rede`. */
export async function enviarAoRelay(
  url: string,
  relato: RelatoEnviado,
  buscar: typeof fetch = fetch,
): Promise<ResultadoRelay> {
  let resposta: Response;
  try {
    resposta = await buscar(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relato),
    });
  } catch {
    return { tipo: "rede" };
  }
  const corpo = (await resposta.json().catch(() => ({}))) as RespostaRelay;
  if (resposta.ok && typeof corpo.numero === "number" && typeof corpo.url === "string") {
    return { tipo: "enviado", numero: corpo.numero, url: corpo.url };
  }
  const mensagem = corpo.mensagem ?? `O servidor de relatos respondeu ${resposta.status}.`;
  const temporario =
    resposta.status === 429 || resposta.status >= 500 || corpo.erro === "turnstile";
  return { tipo: temporario ? "temporario" : "recusado", mensagem };
}

/** Bytes em base64, em pedaços (o `btoa` de uma string enorme estoura a pilha). */
export function paraBase64(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Base64 de volta para bytes (relato guardado na fila → zip). */
export function deBase64(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Drive API v3 falsa para os testes da importação pelo Google Drive: responde às três
// chamadas que api.ts faz (metadados, files.list paginado, alt=media) a partir de uma
// árvore em memória. Pura: os testes de unidade a usam como `fetch` e o e2e
// (e2e/drive.spec.ts) nas rotas do Playwright.

export interface NoDrive {
  id: string;
  name: string;
  /** Padrão: pasta quando tem `filhos`, senão arquivo comum. */
  mimeType?: string;
  dados?: Uint8Array;
  filhos?: NoDrive[];
  resourceKey?: string;
  shortcutDetails?: { targetId: string; targetMimeType: string };
}

export interface OpcoesDriveFalso {
  /** Itens por página do files.list (padrão: todos numa página). */
  porPagina?: number;
  /** Sem token, só os itens públicos respondem; o resto dá 404, como no Drive. */
  publico?: boolean;
  /** Token aceito; outro token dá 401. */
  token?: string;
  /** Ids que respondem 403 mesmo com token. */
  proibidos?: string[];
}

export interface RespostaFalsa {
  status: number;
  corpo: Uint8Array | object;
}

const PASTA = "application/vnd.google-apps.folder";
const tipoDe = (n: NoDrive) => n.mimeType ?? (n.filhos ? PASTA : "application/octet-stream");

function* todos(n: NoDrive): Generator<NoDrive> {
  yield n;
  for (const f of n.filhos ?? []) yield* todos(f);
}

const erro = (status: number, reason: string): RespostaFalsa => ({
  status,
  corpo: { error: { code: status, message: reason, errors: [{ reason }] } },
});

const metadados = (n: NoDrive) => ({
  id: n.id,
  name: n.name,
  mimeType: tipoDe(n),
  ...(n.resourceKey ? { resourceKey: n.resourceKey } : {}),
  ...(n.shortcutDetails ? { shortcutDetails: n.shortcutDetails } : {}),
});

/** A resposta do Drive falso para a chamada (URL e cabeçalhos). */
export function responderDrive(
  raiz: NoDrive,
  url: URL,
  cabecalhos: Record<string, string>,
  opcoes: OpcoesDriveFalso = {},
): RespostaFalsa {
  if (!url.searchParams.get("key")) return erro(403, "forbidden");
  const auth = cabecalhos.authorization ?? cabecalhos.Authorization;
  if (auth && opcoes.token && auth !== `Bearer ${opcoes.token}`) return erro(401, "authError");
  if (!auth && opcoes.publico === false) return erro(404, "notFound");
  const nos = new Map([...todos(raiz)].map((n) => [n.id, n]));
  const m = /\/drive\/v3\/files(?:\/([^/?]+))?$/.exec(url.pathname);
  if (!m) return erro(404, "notFound");
  const id = m[1] && decodeURIComponent(m[1]);
  if (id) {
    const no = nos.get(id);
    if (!no) return erro(404, "notFound");
    if (opcoes.proibidos?.includes(id)) return erro(403, "insufficientFilePermissions");
    if (url.searchParams.get("alt") === "media")
      return no.dados ? { status: 200, corpo: no.dados } : erro(403, "fileNotDownloadable");
    return { status: 200, corpo: metadados(no) };
  }
  const pai = /^'([^']+)' in parents and trashed=false$/.exec(url.searchParams.get("q") ?? "")?.[1];
  const pasta = pai ? nos.get(pai) : undefined;
  if (!pasta) return erro(404, "notFound");
  if (opcoes.proibidos?.includes(pasta.id)) return erro(403, "insufficientFilePermissions");
  const filhos = pasta.filhos ?? [];
  const inicio = Number(url.searchParams.get("pageToken") ?? 0);
  const fim = Math.min(filhos.length, inicio + (opcoes.porPagina ?? filhos.length));
  return {
    status: 200,
    corpo: {
      files: filhos.slice(inicio, fim).map(metadados),
      ...(fim < filhos.length ? { nextPageToken: String(fim) } : {}),
    },
  };
}

/** O Drive falso como `fetch`, com a lista das chamadas feitas. */
export function fetchFalso(raiz: NoDrive, opcoes: OpcoesDriveFalso = {}) {
  const chamadas: { url: URL; cabecalhos: Record<string, string> }[] = [];
  const f = async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(entrada instanceof Request ? entrada.url : entrada);
    const cabecalhos = { ...(init?.headers as Record<string, string> | undefined) };
    chamadas.push({ url, cabecalhos });
    const r = responderDrive(raiz, url, cabecalhos, opcoes);
    const corpo = r.corpo instanceof Uint8Array ? r.corpo.slice() : JSON.stringify(r.corpo);
    return new Response(corpo, { status: r.status });
  };
  return { fetch: f as typeof fetch, chamadas };
}

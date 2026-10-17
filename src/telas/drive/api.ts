// Leitura de uma pasta ou de um arquivo do Google Drive pela Drive API v3, direto do
// navegador, para a importação de obra do SISTRUT (ImportarDrive.tsx). Nada passa por
// servidor nosso: o navegador fala com www.googleapis.com, com a API key do build e, se
// houver login, o token do Google Identity Services (só em memória, ver google.ts).
//
// A pasta é listada com files.list (q='<id>' in parents and trashed=false), página a
// página, entrando nas subpastas: a tela agrupa por pasta e pergunta qual obra importar,
// como na importação de uma pasta do disco. Cada arquivo vira um item com o caminho
// dentro da pasta ("OBRA/EXEC40/SISTRUT.DSP"); o conteúdo só é baixado (files.get
// ?alt=media) quando a importação o lê, então .DXF, .PLT, .BAK e afins aparecem no resumo
// sem sair do Drive. Documentos do Google e atalhos para pasta ficam de fora com nota: o
// SISTRUT só grava arquivos comuns. Um atalho para arquivo baixa o arquivo de destino.
//
// Pasta pública ("qualquer pessoa com o link") abre só com a API key. Os links antigos
// trazem ?resourcekey=, que vai no cabeçalho X-Goog-Drive-Resource-Keys.

const API = "https://www.googleapis.com/drive/v3/files";
const PASTA = "application/vnd.google-apps.folder";
const ATALHO = "application/vnd.google-apps.shortcut";
const DO_GOOGLE = "application/vnd.google-apps.";
const CAMPOS_ITEM =
  "id,name,mimeType,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)";

/** Credenciais de uma chamada: a API key sempre; o token quando o usuário entrou. */
export interface AcessoDrive {
  apiKey: string;
  token?: string | undefined;
}

/** O que o link aponta: o id e, nos links antigos, a resource key. */
export interface AlvoDrive {
  id: string;
  resourceKey?: string | undefined;
}

/** Um item como a Drive API (e o Picker) o descreve. */
export interface ItemDrive {
  id: string;
  name: string;
  mimeType: string;
  resourceKey?: string | undefined;
  shortcutDetails?:
    | { targetId: string; targetMimeType?: string; targetResourceKey?: string }
    | undefined;
}

/** Um arquivo comum a importar, com o caminho dentro do que foi escolhido. */
export interface ArquivoDrive {
  id: string;
  nome: string;
  caminho: string;
  resourceKey?: string | undefined;
}

/** O conteúdo lido: os arquivos e as notas do que ficou de fora ou mudou. */
export interface ConteudoDrive {
  arquivos: ArquivoDrive[];
  notas: string[];
}

export type TipoErroDrive =
  | "link"
  | "privada"
  | "nao-encontrada"
  | "sem-permissao"
  | "login"
  | "quota"
  | "rede"
  | "configuracao";

/** Falha de uma chamada ao Drive, com a mensagem para o usuário em `message`. */
export class ErroDrive extends Error {
  constructor(
    readonly tipo: TipoErroDrive,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDrive";
  }
}

/** Sem login, estes erros podem ser só "a pasta não é pública": vale entrar e tentar de novo. */
export const pedeLogin = (e: unknown) =>
  e instanceof ErroDrive && (e.tipo === "privada" || e.tipo === "login");

const ID = /^[\w-]{10,}$/;

/** O id (e a resource key) de um link do Drive: pasta (/drive/folders/<id>), arquivo
 *  (/file/d/<id>, open?id=<id>, uc?id=<id>) ou o id puro. Undefined quando não é link
 *  do Drive. */
export function alvoDoLink(texto: string): AlvoDrive | undefined {
  const t = texto.trim();
  if (ID.test(t)) return { id: t };
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return undefined;
  }
  if (!/^(drive|docs)\.google\.com$/.test(url.hostname)) return undefined;
  const doCaminho = /\/(?:folders|d)\/([\w-]+)/.exec(url.pathname)?.[1];
  const id = doCaminho ?? url.searchParams.get("id") ?? undefined;
  if (!id || !ID.test(id)) return undefined;
  const resourceKey = url.searchParams.get("resourcekey") ?? undefined;
  return resourceKey ? { id, resourceKey } : { id };
}

/** Lê o que o link aponta: a pasta inteira (com subpastas) ou um arquivo. */
export async function lerAlvo(
  alvo: AlvoDrive,
  acesso: AcessoDrive,
  f: typeof fetch = fetch,
): Promise<ConteudoDrive> {
  const url = new URL(`${API}/${encodeURIComponent(alvo.id)}`);
  url.searchParams.set("fields", CAMPOS_ITEM);
  const item = (await (await pedir(url, acesso, f, [alvo])).json()) as ItemDrive;
  if (alvo.resourceKey && !item.resourceKey) item.resourceKey = alvo.resourceKey;
  if (item.mimeType !== PASTA && item.mimeType.startsWith(DO_GOOGLE) && item.mimeType !== ATALHO)
    throw new ErroDrive(
      "link",
      `"${item.name}" é um documento do Google, não um arquivo do SISTRUT. Mande o link da pasta da obra.`,
    );
  return lerItens([item], acesso, f);
}

/** Lê os itens escolhidos (no Picker ou pelo link): pastas entram com tudo o que têm. */
export async function lerItens(
  itens: readonly ItemDrive[],
  acesso: AcessoDrive,
  f: typeof fetch = fetch,
): Promise<ConteudoDrive> {
  const saida: ConteudoDrive = { arquivos: [], notas: [] };
  for (const item of itens) await acrescentar(item, "", acesso, f, saida);
  return saida;
}

/** Põe o item em `saida`: arquivo comum entra; pasta é listada; o resto vira nota. */
async function acrescentar(
  item: ItemDrive,
  pasta: string,
  acesso: AcessoDrive,
  f: typeof fetch,
  saida: ConteudoDrive,
) {
  const caminho = pasta ? `${pasta}/${item.name}` : item.name;
  if (item.mimeType === PASTA) return listarPasta(item, caminho, acesso, f, saida);
  if (item.mimeType === ATALHO) {
    const alvo = item.shortcutDetails;
    const tipo = alvo?.targetMimeType ?? "";
    if (!alvo || tipo === PASTA || tipo.startsWith(DO_GOOGLE)) {
      saida.notas.push(
        `${caminho}: atalho para ${tipo === PASTA ? "uma pasta" : "um documento do Google"}; não foi seguido. Ponha os arquivos na pasta da obra.`,
      );
      return;
    }
    saida.notas.push(`${caminho}: atalho; entrou o arquivo de destino.`);
    saida.arquivos.push({
      id: alvo.targetId,
      nome: item.name,
      caminho,
      resourceKey: alvo.targetResourceKey,
    });
    return;
  }
  if (item.mimeType.startsWith(DO_GOOGLE)) {
    saida.notas.push(
      `${caminho}: documento do Google (Docs, Planilhas...), não é arquivo do SISTRUT; ignorado.`,
    );
    return;
  }
  saida.arquivos.push({ id: item.id, nome: item.name, caminho, resourceKey: item.resourceKey });
}

/** Lista a pasta página a página (files.list) e entra nas subpastas. */
async function listarPasta(
  pasta: ItemDrive,
  caminho: string,
  acesso: AcessoDrive,
  f: typeof fetch,
  saida: ConteudoDrive,
) {
  let pagina: string | undefined;
  do {
    const url = new URL(API);
    url.searchParams.set("q", `'${pasta.id}' in parents and trashed=false`);
    url.searchParams.set("fields", `nextPageToken,files(${CAMPOS_ITEM})`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("orderBy", "name");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pagina) url.searchParams.set("pageToken", pagina);
    const r = (await (await pedir(url, acesso, f, [pasta])).json()) as {
      files?: ItemDrive[];
      nextPageToken?: string;
    };
    for (const item of r.files ?? []) await acrescentar(item, caminho, acesso, f, saida);
    pagina = r.nextPageToken;
  } while (pagina);
}

/** Baixa o conteúdo de um arquivo comum (files.get?alt=media). */
export async function baixarArquivo(
  arquivo: ArquivoDrive,
  acesso: AcessoDrive,
  f: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const url = new URL(`${API}/${encodeURIComponent(arquivo.id)}`);
  url.searchParams.set("alt", "media");
  const r = await pedir(url, acesso, f, [arquivo], signal);
  try {
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ErroDrive("rede", "A conexão caiu no meio do download. Tente de novo.");
  }
}

/** Uma chamada à Drive API: API key, token e resource keys; erro HTTP vira ErroDrive. */
async function pedir(
  url: URL,
  acesso: AcessoDrive,
  f: typeof fetch,
  chaves: readonly { id: string; resourceKey?: string | undefined }[],
  signal?: AbortSignal,
): Promise<Response> {
  url.searchParams.set("key", acesso.apiKey);
  url.searchParams.set("supportsAllDrives", "true");
  const headers: Record<string, string> = {};
  if (acesso.token) headers.Authorization = `Bearer ${acesso.token}`;
  const rk = chaves.filter((c) => c.resourceKey).map((c) => `${c.id}/${c.resourceKey}`);
  if (rk.length > 0) headers["X-Goog-Drive-Resource-Keys"] = rk.join(",");
  let r: Response;
  try {
    r = await f(url, signal ? { headers, signal } : { headers });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ErroDrive(
      "rede",
      "Sem conexão com o Google Drive. Confira a internet e tente de novo.",
    );
  }
  if (!r.ok) throw await erroDe(r, !!acesso.token);
  return r;
}

/** Motivos que a Drive API devolve no corpo do erro (errors[].reason e details[].reason). */
async function motivosDe(r: Response): Promise<string[]> {
  try {
    const corpo = (await r.json()) as {
      error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] };
    };
    return [...(corpo.error?.errors ?? []), ...(corpo.error?.details ?? [])]
      .map((x) => x.reason ?? "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

const QUOTA =
  /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded|RATE_LIMIT/i;
const CONFIGURACAO = /keyInvalid|accessNotConfigured|ipRefererBlocked|API_KEY|SERVICE_DISABLED/i;

/** Traduz a resposta de erro para o usuário. `comLogin`: a chamada levava token. */
async function erroDe(r: Response, comLogin: boolean): Promise<ErroDrive> {
  const motivos = (await motivosDe(r)).join(" ");
  if (r.status === 429 || QUOTA.test(motivos))
    return new ErroDrive(
      "quota",
      `O Google Drive limitou as leituras deste app agora. Espere alguns minutos e tente de novo.`,
    );
  if (r.status === 401)
    return new ErroDrive("login", "O login no Google expirou. Entre de novo para continuar.");
  if ((r.status === 400 || r.status === 403) && CONFIGURACAO.test(motivos))
    return new ErroDrive(
      "configuracao",
      `A ligação com o Google Drive deste site está mal configurada (${motivos}). Avise o responsável pelo app; a importação por arquivos e por pasta continua funcionando.`,
    );
  if (r.status === 404 || r.status === 403) {
    if (!comLogin)
      return new ErroDrive(
        "privada",
        `Sem login, o Google Drive não abre isto: não está compartilhado como "qualquer pessoa com o link", ou o link está errado. Se foi compartilhado com você, entre com a sua conta Google.`,
      );
    return r.status === 404
      ? new ErroDrive(
          "nao-encontrada",
          `O Google Drive não achou isto com a conta em que você entrou. Confira o link e se essa conta tem acesso à pasta.`,
        )
      : new ErroDrive(
          "sem-permissao",
          `A sua conta Google não tem permissão para ler isto. Peça ao dono da pasta que a compartilhe com você.`,
        );
  }
  return new ErroDrive(
    "rede",
    `O Google Drive respondeu com erro ${r.status}. Tente de novo em instantes.`,
  );
}

/** Limita quantas chamadas rodam ao mesmo tempo (downloads em paralelo, sem abrir dezenas
 *  de conexões no celular). */
export function limitador(maximo: number) {
  let ativas = 0;
  const fila: (() => void)[] = [];
  return async <T>(tarefa: () => Promise<T>): Promise<T> => {
    if (ativas < maximo) ativas++;
    else await new Promise<void>((ok) => fila.push(ok));
    try {
      return await tarefa();
    } finally {
      // a vaga passa direto ao próximo da fila
      const proximo = fila.shift();
      if (proximo) proximo();
      else ativas--;
    }
  };
}

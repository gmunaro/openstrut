// Leitura de uma pasta ou de um arquivo do Google Drive pela Drive API v3, direto do
// navegador, para a importação de obra do SISTRUT (ImportarDrive.tsx). Nada passa por
// servidor nosso: o navegador fala com www.googleapis.com, com a API key do build e, se
// houver login, o token do Google Identity Services (só em memória, ver google.ts).
//
// A pasta é listada com files.list (q='<id>' in parents and trashed=false), página a
// página, entrando nas subpastas (até LIMITES.profundidade níveis e LIMITES.arquivos
// arquivos): a tela agrupa por pasta e pergunta qual obra importar, como na importação de
// uma pasta do disco. Cada arquivo vira um item com o caminho dentro da pasta
// ("OBRA/EXEC40/SISTRUT.DSP"); o conteúdo só é baixado (files.get?alt=media) quando a
// importação o lê, então .DXF, .PLT, .BAK e afins aparecem no resumo sem sair do Drive.
// Documentos do Google e atalhos para pasta ficam de fora com nota: o SISTRUT só grava
// arquivos comuns. Um atalho para arquivo baixa o arquivo de destino.
//
// Pasta pública ("qualquer pessoa com o link") abre só com a API key. Os links antigos
// trazem ?resourcekey=, que vai no cabeçalho X-Goog-Drive-Resource-Keys.

const API = "https://www.googleapis.com/drive/v3/files";
const PASTA = "application/vnd.google-apps.folder";
const ATALHO = "application/vnd.google-apps.shortcut";
const DO_GOOGLE = "application/vnd.google-apps.";
const CAMPOS_ITEM =
  "id,name,mimeType,resourceKey,modifiedTime,shortcutDetails(targetId,targetMimeType,targetResourceKey)";

/** Até onde a listagem recursiva vai: uma pasta de obra tem dezenas de arquivos e no
 *  máximo a EXEC40 como subpasta; mais que isso é o link de uma pasta de obras inteira. */
export const LIMITES = { profundidade: 4, arquivos: 2000 };

/** Credenciais de uma chamada: a API key sempre; o token quando o usuário entrou. */
export interface AcessoDrive {
  apiKey: string;
  token?: string | undefined;
}

/** O que o link aponta: o id, o tipo que o link diz ("id" quando veio o id puro) e,
 *  nos links antigos, a resource key. */
export interface AlvoDrive {
  id: string;
  tipo: "pasta" | "arquivo" | "id";
  resourceKey?: string | undefined;
}

/** Um item como a Drive API (e o Picker) o descreve. */
export interface ItemDrive {
  id: string;
  name: string;
  mimeType: string;
  resourceKey?: string | undefined;
  modifiedTime?: string | undefined;
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
  /** Data de modificação no Drive (ISO), para distinguir arquivos de mesmo nome. */
  modificado?: string | undefined;
}

/** O conteúdo lido: os arquivos e as notas do que ficou de fora ou mudou. */
export interface ConteudoDrive {
  arquivos: ArquivoDrive[];
  notas: string[];
}

/** fetch (trocado nos testes), interrupção e limites da listagem. */
export interface OpcoesDrive {
  f?: typeof fetch;
  signal?: AbortSignal | undefined;
  limites?: typeof LIMITES;
}

export type TipoErroDrive =
  | "link"
  | "privada"
  | "nao-encontrada"
  | "sem-permissao"
  | "app-sem-acesso"
  | "download-bloqueado"
  | "login"
  | "quota"
  | "rede"
  | "grande"
  | "repetidos"
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

/** Erros que entrar com Google (e escolher no Picker) resolve: a pasta não é pública, o
 *  login venceu, ou o app ainda não recebeu o arquivo pelo Picker. */
export const pedeLogin = (e: unknown) =>
  e instanceof ErroDrive &&
  (e.tipo === "privada" || e.tipo === "login" || e.tipo === "app-sem-acesso");

const ID = /^[\w-]{10,}$/;

/** O id (e a resource key) de um link do Drive: pasta (/drive/folders/<id>), arquivo
 *  (/file/d/<id>, open?id=<id>, uc?id=<id>) ou o id puro. Aceita o link sem https://.
 *  Undefined quando não é link do Drive. */
export function alvoDoLink(texto: string): AlvoDrive | undefined {
  const t = texto.trim();
  if (ID.test(t)) return { id: t, tipo: "id" };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return undefined;
  }
  if (!/^(drive|docs)\.google\.com$/.test(url.hostname)) return undefined;
  const pasta = /\/folders\/([\w-]+)/.exec(url.pathname)?.[1];
  const arquivo = /\/d\/([\w-]+)/.exec(url.pathname)?.[1];
  const id = pasta ?? arquivo ?? url.searchParams.get("id") ?? undefined;
  if (!id || !ID.test(id)) return undefined;
  const tipo = pasta ? "pasta" : "arquivo";
  const resourceKey = url.searchParams.get("resourcekey") ?? undefined;
  return resourceKey ? { id, tipo, resourceKey } : { id, tipo };
}

/** Lê o que o link aponta: a pasta inteira (com subpastas) ou um arquivo. */
export async function lerAlvo(
  alvo: AlvoDrive,
  acesso: AcessoDrive,
  opcoes: OpcoesDrive = {},
): Promise<ConteudoDrive> {
  const url = new URL(`${API}/${encodeURIComponent(alvo.id)}`);
  url.searchParams.set("fields", CAMPOS_ITEM);
  const item = (await (await pedir(url, acesso, [alvo], opcoes)).json()) as ItemDrive;
  if (alvo.resourceKey && !item.resourceKey) item.resourceKey = alvo.resourceKey;
  if (item.mimeType !== PASTA && item.mimeType.startsWith(DO_GOOGLE) && item.mimeType !== ATALHO)
    throw new ErroDrive(
      "link",
      `"${item.name}" é um documento do Google, não um arquivo do SISTRUT. Mande o link da pasta da obra.`,
    );
  return lerItens([item], acesso, opcoes);
}

/** Lê os itens escolhidos (no Picker ou pelo link): pastas entram com tudo o que têm.
 *  `pasta` põe o item dentro de uma pasta no caminho (escolhas do Picker de pastas
 *  diferentes ficam separadas, como na pasta do disco). */
export async function lerItens(
  itens: readonly (ItemDrive & { pasta?: string })[],
  acesso: AcessoDrive,
  opcoes: OpcoesDrive = {},
): Promise<ConteudoDrive> {
  const saida: ConteudoDrive = { arquivos: [], notas: [] };
  for (const item of itens) await acrescentar(item, item.pasta ?? "", 0, acesso, opcoes, saida);
  return saida;
}

/** O nome como segmento de caminho: "/" no nome do Drive não pode virar pasta. */
function nomeSeguro(nome: string, pasta: string, saida: ConteudoDrive): string {
  const seguro = nome.replace(/[\\/]/g, "_");
  if (seguro !== nome)
    saida.notas.push(
      `${pasta ? `${pasta}/` : ""}${seguro}: o nome no Drive é "${nome}"; a barra virou "_".`,
    );
  return seguro;
}

/** Põe o item em `saida`: arquivo comum entra; pasta é listada; o resto vira nota. */
async function acrescentar(
  item: ItemDrive,
  pasta: string,
  nivel: number,
  acesso: AcessoDrive,
  opcoes: OpcoesDrive,
  saida: ConteudoDrive,
) {
  const nome = nomeSeguro(item.name, pasta, saida);
  const caminho = pasta ? `${pasta}/${nome}` : nome;
  if (item.mimeType === PASTA) return listarPasta(item, caminho, nivel + 1, acesso, opcoes, saida);
  if (item.mimeType === ATALHO) {
    const alvo = item.shortcutDetails;
    const tipo = alvo?.targetMimeType ?? "";
    if (!alvo || tipo === PASTA || tipo.startsWith(DO_GOOGLE)) {
      const para = !alvo
        ? "cujo destino o Drive não informou"
        : tipo === PASTA
          ? "para uma pasta"
          : "para um documento do Google";
      saida.notas.push(
        `${caminho}: atalho ${para}; não foi seguido. Ponha os arquivos na pasta da obra.`,
      );
      return;
    }
    saida.notas.push(`${caminho}: atalho; entrou o arquivo de destino.`);
    return acrescentarArquivo(
      {
        id: alvo.targetId,
        nome,
        caminho,
        resourceKey: alvo.targetResourceKey,
        modificado: item.modifiedTime,
      },
      opcoes,
      saida,
    );
  }
  if (item.mimeType.startsWith(DO_GOOGLE)) {
    saida.notas.push(
      `${caminho}: documento do Google (Docs, Planilhas...), não é arquivo do SISTRUT; ignorado.`,
    );
    return;
  }
  acrescentarArquivo(
    { id: item.id, nome, caminho, resourceKey: item.resourceKey, modificado: item.modifiedTime },
    opcoes,
    saida,
  );
}

function acrescentarArquivo(a: ArquivoDrive, opcoes: OpcoesDrive, saida: ConteudoDrive) {
  const maximo = (opcoes.limites ?? LIMITES).arquivos;
  if (saida.arquivos.length >= maximo)
    throw new ErroDrive(
      "grande",
      `A pasta tem mais de ${maximo} arquivos, contando as subpastas. Parece uma pasta de várias obras: mande o link da pasta de uma obra só.`,
    );
  saida.arquivos.push(a);
}

/** Lista a pasta página a página (files.list) e entra nas subpastas. */
async function listarPasta(
  pasta: ItemDrive,
  caminho: string,
  nivel: number,
  acesso: AcessoDrive,
  opcoes: OpcoesDrive,
  saida: ConteudoDrive,
) {
  const maximo = (opcoes.limites ?? LIMITES).profundidade;
  if (nivel > maximo) {
    saida.notas.push(
      `${caminho}: subpasta a mais de ${maximo} níveis da pasta escolhida; não foi lida.`,
    );
    return;
  }
  let pagina: string | undefined;
  do {
    const url = new URL(API);
    url.searchParams.set("q", `'${pasta.id}' in parents and trashed=false`);
    url.searchParams.set("fields", `nextPageToken,files(${CAMPOS_ITEM})`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("orderBy", "name");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pagina) url.searchParams.set("pageToken", pagina);
    const r = (await (await pedir(url, acesso, [pasta], opcoes)).json()) as {
      files?: ItemDrive[];
      nextPageToken?: string;
    };
    for (const item of r.files ?? [])
      await acrescentar(item, caminho, nivel, acesso, opcoes, saida);
    pagina = r.nextPageToken;
  } while (pagina);
}

/** Arquivos de mesmo nome na mesma pasta (o Drive aceita; a importação recusa), entre os
 *  que `conta` diz que importam. Undefined quando não há; senão, a mensagem com a data de
 *  modificação e o id de cada um, para o usuário achar qual apagar. */
export function nomesRepetidos(
  arquivos: readonly ArquivoDrive[],
  conta: (nome: string) => boolean,
): string | undefined {
  const grupos = new Map<string, ArquivoDrive[]>();
  for (const a of arquivos.filter((x) => conta(x.nome))) {
    const k = a.caminho.toUpperCase();
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
  }
  const repetidos = [...grupos.values()].filter((g) => g.length > 1);
  if (repetidos.length === 0) return undefined;
  const quando = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : "sem data";
  const linhas = repetidos.map((g) => {
    const i = g[0]!.caminho.lastIndexOf("/");
    const pasta = i < 0 ? "escolhidos" : `pasta "${g[0]!.caminho.slice(0, i)}"`;
    const cada = g.map((a) => `modificado em ${quando(a.modificado)}, id ${a.id}`).join("; ");
    return `Na ${pasta} do Drive há ${g.length} arquivos chamados ${g[0]!.nome} (${cada}).`;
  });
  return `${linhas.join(" ")} O Drive aceita nomes repetidos na mesma pasta, o SISTRUT não: apague ou renomeie os que sobram e tente de novo.`;
}

/** Baixa o conteúdo de um arquivo comum (files.get?alt=media). */
export async function baixarArquivo(
  arquivo: ArquivoDrive,
  acesso: AcessoDrive,
  opcoes: OpcoesDrive = {},
): Promise<Uint8Array> {
  const url = new URL(`${API}/${encodeURIComponent(arquivo.id)}`);
  url.searchParams.set("alt", "media");
  const r = await pedir(url, acesso, [arquivo], opcoes);
  try {
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    if (opcoes.signal?.aborted) throw e;
    throw new ErroDrive("rede", "A conexão caiu no meio do download. Tente de novo.");
  }
}

/** Uma chamada à Drive API: API key, token e resource keys; erro HTTP vira ErroDrive.
 *  A interrupção (signal) passa adiante como está. */
async function pedir(
  url: URL,
  acesso: AcessoDrive,
  chaves: readonly { id: string; resourceKey?: string | undefined }[],
  { f = fetch, signal }: OpcoesDrive,
): Promise<Response> {
  url.searchParams.set("key", acesso.apiKey);
  url.searchParams.set("supportsAllDrives", "true");
  const headers: Record<string, string> = {};
  if (acesso.token) headers.Authorization = `Bearer ${acesso.token}`;
  const rk = chaves.filter((c) => c.resourceKey).map((c) => `${c.id}/${c.resourceKey}`);
  if (rk.length > 0) headers["X-Goog-Drive-Resource-Keys"] = rk.join(",");
  signal?.throwIfAborted();
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
  // antes da quota geral: "downloadQuotaExceeded" também casa com /quotaExceeded/
  if (/downloadQuotaExceeded/.test(motivos))
    return new ErroDrive(
      "download-bloqueado",
      "O Google bloqueou o download deste arquivo por um tempo, porque ele foi baixado muitas vezes. Tente de novo em algumas horas, ou peça ao dono uma cópia nova do arquivo.",
    );
  if (r.status === 429 || QUOTA.test(motivos))
    return new ErroDrive(
      "quota",
      "O Google Drive limitou as leituras deste app agora. Espere alguns minutos e tente de novo.",
    );
  if (r.status === 401)
    return new ErroDrive("login", "O login no Google expirou. Entre de novo para continuar.");
  if ((r.status === 400 || r.status === 403) && CONFIGURACAO.test(motivos))
    return new ErroDrive(
      "configuracao",
      `A ligação com o Google Drive deste site está mal configurada (${motivos}). Avise o responsável pelo app; a importação por arquivos e por pasta continua funcionando.`,
    );
  if (/appNotAuthorizedToFile/.test(motivos))
    return new ErroDrive(
      "app-sem-acesso",
      'Quem não tem acesso é o app, não você: com a permissão "drive.file" ele só lê os arquivos que você marca na janela do Drive. Entre com Google e marque os arquivos da obra.',
    );
  if (r.status === 404 || r.status === 403) {
    if (!comLogin)
      return new ErroDrive(
        "privada",
        'Sem login, o Google Drive não abre isto: não está compartilhado como "qualquer pessoa com o link", ou o link está errado. Se foi compartilhado com você, entre com a sua conta Google.',
      );
    return r.status === 404
      ? new ErroDrive(
          "nao-encontrada",
          "O Google Drive não achou isto com a conta em que você entrou. Confira o link e se essa conta tem acesso à pasta.",
        )
      : new ErroDrive(
          "sem-permissao",
          "A sua conta Google não tem permissão para ler isto. Peça ao dono da pasta que a compartilhe com você.",
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

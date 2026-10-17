// Login no Google e Google Picker, no navegador, para a importação pelo Drive
// (ImportarDrive.tsx). Sem backend e sem segredo: o Client ID OAuth e a API key são
// públicos por natureza e vêm do build (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY; ver
// docs/GOOGLE-DRIVE.md). A API key fica restrita por referrer e por API no console.
//
// Escopo: só drive.file (não sensível). Com ele o app lê só os arquivos que o usuário
// marca no Picker; escolher uma pasta não dá acesso aos arquivos dela (o escopo é "por
// arquivo"), então o Picker não deixa escolher pasta e aceita vários arquivos de uma vez.
// Uma pasta pública abre só com a API key, sem login (api.ts). drive.readonly, que leria
// qualquer pasta pelo link, é escopo restrito do Google e não é pedido.
//
// O token vem do Google Identity Services (token client, popup), fica só nesta variável
// do módulo, nunca em localStorage, e vence em cerca de 1 h. O popup só abre no clique
// do usuário: a tela carrega o script antes (carregarGis) e só libera o botão de entrar
// quando ele está pronto, e `entrar` pede o token na mesma pilha do clique.
import type { ItemDrive } from "./api";

export const ESCOPO = "https://www.googleapis.com/auth/drive.file";
const SCRIPT_GIS = "https://accounts.google.com/gsi/client";
const SCRIPT_GAPI = "https://apis.google.com/js/api.js";
/** Tempo máximo para o Picker carregar (o gapi.load não avisa quando trava). */
const ESPERA_PICKER_MS = 20_000;

/** Credenciais públicas do build; undefined quando faltam (a opção fica desabilitada). */
export function configuracaoGoogle() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY?.trim();
  if (!clientId || !apiKey) return undefined;
  // o Client ID começa pelo número do projeto, que o Picker pede (setAppId) para o
  // drive.file valer para o que o usuário escolhe
  const appId = /^(\d+)-/.exec(clientId)?.[1] ?? "";
  return { clientId, apiKey, appId };
}
export type ConfiguracaoGoogle = NonNullable<ReturnType<typeof configuracaoGoogle>>;

// ------------------------------------------------------------------ tipos das bibliotecas

interface RespostaToken {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface ClienteToken {
  requestAccessToken: (opcoes?: { prompt?: string }) => void;
}
interface Oauth2 {
  initTokenClient: (c: {
    client_id: string;
    scope: string;
    callback: (r: RespostaToken) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }) => ClienteToken;
}
interface DocumentoPicker {
  id: string;
  name: string;
  mimeType: string;
  resourceKey?: string;
  parentId?: string;
}
interface RespostaPicker {
  action: string;
  docs?: DocumentoPicker[];
}
interface VistaDocs {
  setIncludeFolders: (x: boolean) => VistaDocs;
  setSelectFolderEnabled: (x: boolean) => VistaDocs;
  setMode: (x: string) => VistaDocs;
  setParent: (id: string) => VistaDocs;
  setFileIds: (ids: string) => VistaDocs;
}
interface ConstrutorPicker {
  addView: (v: VistaDocs) => ConstrutorPicker;
  enableFeature: (f: string) => ConstrutorPicker;
  setOAuthToken: (t: string) => ConstrutorPicker;
  setDeveloperKey: (k: string) => ConstrutorPicker;
  setAppId: (id: string) => ConstrutorPicker;
  setLocale: (l: string) => ConstrutorPicker;
  setTitle: (t: string) => ConstrutorPicker;
  setCallback: (cb: (r: RespostaPicker) => void) => ConstrutorPicker;
  build: () => { setVisible: (v: boolean) => void };
}
export interface ApiPicker {
  PickerBuilder: new () => ConstrutorPicker;
  DocsView: new (viewId?: string) => VistaDocs;
  ViewId: { DOCS: string };
  DocsViewMode: { LIST: string };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: Oauth2 }; picker?: ApiPicker };
    gapi?: { load: (lib: string, c: { callback: () => void; onerror: () => void }) => void };
  }
}

// ------------------------------------------------------------------ scripts

const carregando = new Map<string, Promise<void>>();

/** Injeta o script uma vez; uma falha deixa tentar de novo. */
function carregarScript(src: string, falhou: string): Promise<void> {
  let p = carregando.get(src);
  if (!p) {
    p = new Promise<void>((ok, falha) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        carregando.delete(src);
        s.remove();
        falha(new Error(falhou));
      };
      document.head.append(s);
    });
    carregando.set(src, p);
  }
  return p;
}

/** O login do Google já carregado, ou undefined. */
export const gisCarregado = () => window.google?.accounts?.oauth2;

/** Carrega o login do Google (Google Identity Services). */
export async function carregarGis(): Promise<void> {
  if (gisCarregado()) return;
  await carregarScript(
    SCRIPT_GIS,
    "Não foi possível carregar o login do Google. Confira a internet e tente de novo.",
  );
  if (!gisCarregado())
    throw new Error("O login do Google não carregou direito. Recarregue a página.");
}

/** Carrega o Google Picker (api.js e a biblioteca "picker"), com tempo máximo. */
export async function carregarPicker(): Promise<ApiPicker> {
  if (window.google?.picker) return window.google.picker;
  const naoCarregou =
    "Não foi possível carregar a janela do Google Drive. Confira a internet e tente de novo.";
  if (!window.gapi) await carregarScript(SCRIPT_GAPI, naoCarregou);
  const gapi = window.gapi;
  if (!gapi) throw new Error(naoCarregou);
  await new Promise<void>((ok, falha) => {
    const prazo = setTimeout(() => falha(new Error(naoCarregou)), ESPERA_PICKER_MS);
    gapi.load("picker", {
      callback: () => {
        clearTimeout(prazo);
        ok();
      },
      onerror: () => {
        clearTimeout(prazo);
        falha(new Error(naoCarregou));
      },
    });
  });
  const p = window.google?.picker;
  if (!p) throw new Error(naoCarregou);
  return p;
}

// ------------------------------------------------------------------ token

/** O token atual, só em memória. */
let sessao: { token: string; expira: number } | undefined;

/** Token ainda válido (com 1 min de folga), se houver. */
export function tokenAtual(agora = Date.now()): string | undefined {
  if (sessao && sessao.expira - 60_000 > agora) return sessao.token;
  sessao = undefined;
  return undefined;
}

/** Esquece o token: ele venceu ou o Google o recusou. */
export function esquecerToken() {
  sessao = undefined;
}

/** Pede o token com drive.file. Chame direto no clique, com o login já carregado
 *  (gisCarregado): o popup do Google só abre no gesto do usuário. Com um token válido
 *  em memória, não abre nada. */
export function entrar(clientId: string): Promise<string> {
  const atual = tokenAtual();
  if (atual) return Promise.resolve(atual);
  const oauth2 = gisCarregado();
  if (!oauth2)
    return Promise.reject(new Error("O login do Google ainda está carregando. Tente de novo."));
  return new Promise<string>((ok, falha) => {
    const cliente = oauth2.initTokenClient({
      client_id: clientId,
      scope: ESCOPO,
      callback: (r) => {
        if (!r.access_token) {
          falha(
            new Error(
              r.error === "access_denied"
                ? "Você não autorizou o acesso ao Google Drive."
                : `O Google recusou o login (${r.error_description ?? r.error ?? "sem motivo"}).`,
            ),
          );
          return;
        }
        sessao = {
          token: r.access_token,
          expira: Date.now() + Number(r.expires_in ?? 3600) * 1000,
        };
        ok(r.access_token);
      },
      error_callback: (e) =>
        falha(
          new Error(
            e.type === "popup_failed_to_open"
              ? "O navegador bloqueou a janela de login do Google. Libere os popups deste site e tente de novo."
              : "A janela de login do Google foi fechada antes de terminar.",
          ),
        ),
    });
    cliente.requestAccessToken();
  });
}

// ------------------------------------------------------------------ Picker

/** Um arquivo marcado no Picker, com a pasta de onde veio (parentId). */
export type EscolhidoNoPicker = ItemDrive & { pastaId?: string | undefined };

/** Mostra o Picker (já carregado) para marcar arquivos, vários de uma vez; as pastas
 *  aparecem só para navegar. `pasta` abre direto nela; `arquivo` mostra só ele.
 *  Devolve os marcados, ou undefined se cancelou. */
export function mostrarPicker(
  p: ApiPicker,
  config: ConfiguracaoGoogle,
  token: string,
  onde: { pasta?: string | undefined; arquivo?: string | undefined } = {},
): Promise<EscolhidoNoPicker[] | undefined> {
  return new Promise((ok) => {
    const vista = new p.DocsView(p.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(p.DocsViewMode.LIST);
    if (onde.pasta) vista.setParent(onde.pasta);
    if (onde.arquivo) vista.setFileIds(onde.arquivo);
    const construtor = new p.PickerBuilder()
      .addView(vista)
      .enableFeature(p.Feature.MULTISELECT_ENABLED)
      .enableFeature(p.Feature.SUPPORT_DRIVES)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setLocale("pt-BR")
      .setTitle("Marque os arquivos da obra (vários de uma vez)")
      .setCallback((r) => {
        if (r.action === p.Action.PICKED)
          ok(
            (r.docs ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              resourceKey: d.resourceKey || undefined,
              pastaId: d.parentId || undefined,
            })),
          );
        else if (r.action === p.Action.CANCEL) ok(undefined);
      });
    if (config.appId) construtor.setAppId(config.appId);
    construtor.build().setVisible(true);
  });
}

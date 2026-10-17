// Login no Google e Google Picker, no navegador, para a importação pelo Drive
// (ImportarDrive.tsx). Sem backend e sem segredo: o Client ID OAuth e a API key são
// públicos por natureza e vêm do build (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY; ver
// docs/GOOGLE-DRIVE.md). A API key fica restrita por referrer e por API no console.
//
// Escopo: só drive.file (não sensível). O app lê o que o usuário escolhe no Picker; uma
// pasta pública abre só com a API key, sem login (api.ts). drive.readonly, que leria
// qualquer pasta pelo link, é escopo restrito do Google e não é pedido.
//
// O token vem do Google Identity Services (token client, popup), fica só nesta variável
// do módulo, nunca em localStorage, e vence em cerca de 1 h. O popup tem de abrir no
// clique do usuário: por isso o script é carregado antes (precarregar) e o pedido sai
// síncrono quando ele já está na página.
import type { ItemDrive } from "./api";

export const ESCOPO = "https://www.googleapis.com/auth/drive.file";
const SCRIPT_GIS = "https://accounts.google.com/gsi/client";
const SCRIPT_GAPI = "https://apis.google.com/js/api.js";

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
interface ApiPicker {
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
function carregarScript(src: string): Promise<void> {
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
        falha(new Error("Não foi possível carregar o login do Google. Confira a internet."));
      };
      document.head.append(s);
    });
    carregando.set(src, p);
  }
  return p;
}

async function carregarGis(): Promise<Oauth2> {
  if (!window.google?.accounts?.oauth2) await carregarScript(SCRIPT_GIS);
  const o = window.google?.accounts?.oauth2;
  if (!o) throw new Error("O login do Google não carregou direito. Recarregue a página.");
  return o;
}

async function carregarPicker(): Promise<ApiPicker> {
  if (window.google?.picker) return window.google.picker;
  if (!window.gapi) await carregarScript(SCRIPT_GAPI);
  const gapi = window.gapi;
  if (!gapi) throw new Error("O seletor do Google Drive não carregou. Recarregue a página.");
  await new Promise<void>((ok, falha) =>
    gapi.load("picker", {
      callback: ok,
      onerror: () => falha(new Error("O seletor do Google Drive não carregou.")),
    }),
  );
  const p = window.google?.picker;
  if (!p) throw new Error("O seletor do Google Drive não carregou. Recarregue a página.");
  return p;
}

/** Carrega o login e o Picker antes do clique, para o popup sair no gesto do usuário. */
export function precarregar() {
  void carregarGis().catch(() => {});
  void carregarPicker().catch(() => {});
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

/** Esquece o token (o Google o invalida sozinho quando vence). */
export function esquecerToken() {
  sessao = undefined;
}

/** Pede o token com drive.file. Chame no clique: o Google abre um popup. */
export async function entrar(clientId: string): Promise<string> {
  const atual = tokenAtual();
  if (atual) return atual;
  // com o script já na página, o pedido sai no mesmo tique do clique (sem await antes)
  const oauth2 = window.google?.accounts?.oauth2 ?? (await carregarGis());
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

/** Abre o Google Picker (pastas e arquivos, vários de uma vez). `pasta` abre direto
 *  nela; `arquivo` mostra só ele. Devolve os escolhidos, ou undefined se cancelou. */
export async function escolherNoDrive(
  config: ConfiguracaoGoogle,
  token: string,
  onde: { pasta?: string; arquivo?: string } = {},
): Promise<ItemDrive[] | undefined> {
  const p = await carregarPicker();
  return new Promise((ok) => {
    const vista = new p.DocsView(p.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
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
      .setTitle("Escolha a pasta da obra ou os arquivos do SISTRUT")
      .setCallback((r) => {
        if (r.action === p.Action.PICKED)
          ok(
            (r.docs ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              resourceKey: d.resourceKey || undefined,
            })),
          );
        else if (r.action === p.Action.CANCEL) ok(undefined);
      });
    if (config.appId) construtor.setAppId(config.appId);
    construtor.build().setVisible(true);
  });
}

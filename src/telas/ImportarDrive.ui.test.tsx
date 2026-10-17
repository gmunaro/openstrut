// A opção "Importar do Google Drive" (ImportarDrive.tsx) com o app inteiro, a Drive API
// falsa no lugar do fetch e o login e o Picker do Google falsos em window.google. O Drive
// falso segue o escopo drive.file: com token, só existe o que foi marcado no Picker.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderizarApp } from "../test-setup";
import { PREDIO } from "./__fixtures__/predioSistrut";
import { fetchFalso, type NoDrive, type OpcoesDriveFalso } from "./drive/__fixtures__/driveFalso";
import { esquecerToken } from "./drive/google";

const PASTA_ID = "1PastaPredio_abc";
const LINK = `https://drive.google.com/drive/folders/${PASTA_ID}?usp=sharing`;
const OBRA: NoDrive = {
  id: PASTA_ID,
  name: "PREDIO",
  filhos: [
    ...PREDIO.map((a, i) => ({ id: `arq-${i}`, name: a.nome, dados: a.dados })),
    { id: "dxf", name: "R1__TETO.DXF", dados: new Uint8Array([1]) },
    { id: "doc", name: "Memorial", mimeType: "application/vnd.google-apps.document" },
  ],
};
const ARQUIVOS = OBRA.filhos!.filter((f) => f.dados);
/** O que o Picker devolve quando o usuário marca todos os arquivos da pasta. */
const MARCOU_TODOS = ARQUIVOS.map((f) => ({
  id: f.id,
  name: f.name,
  mimeType: "application/octet-stream",
  parentId: PASTA_ID,
}));

/** O que o Picker falso devolve e o que o login falso registrou. */
const google = {
  escolhidos: [] as { id: string; name: string; mimeType: string; parentId?: string }[],
  tokens: ["tk"],
  pedidosDeToken: [] as { scope: string; noClique: boolean }[],
  pickerAbertoEm: [] as { pasta?: string; arquivo?: string }[],
};
/** Verdadeiro só enquanto um clique é despachado: do capture no document ao bubble no
 *  window. Prova que o pedido do token sai na pilha do clique (o popup precisa disso). */
let noClique = false;
const comecaClique = () => (noClique = true);
const terminaClique = () => (noClique = false);

/** GIS e Picker falsos, com a mesma forma das bibliotecas do Google. */
function instalarGoogleFalso() {
  class DocsView {
    onde: { pasta?: string; arquivo?: string } = {};
    setIncludeFolders = () => this;
    setSelectFolderEnabled = () => this;
    setMode = () => this;
    setFileIds = (ids: string) => ((this.onde.arquivo = ids), this);
    setParent = (id: string) => ((this.onde.pasta = id), this);
  }
  class PickerBuilder {
    vista: DocsView | undefined;
    cb: ((r: { action: string; docs?: unknown[] }) => void) | undefined;
    addView = (v: DocsView) => ((this.vista = v), this);
    enableFeature = () => this;
    setOAuthToken = () => this;
    setDeveloperKey = () => this;
    setAppId = () => this;
    setLocale = () => this;
    setTitle = () => this;
    setCallback = (cb: PickerBuilder["cb"]) => ((this.cb = cb), this);
    build = () => ({
      setVisible: () => {
        google.pickerAbertoEm.push(this.vista?.onde ?? {});
        setTimeout(() =>
          this.cb?.(
            google.escolhidos.length > 0
              ? { action: "picked", docs: google.escolhidos }
              : { action: "cancel" },
          ),
        );
      },
    });
  }
  type Google = NonNullable<Window["google"]>;
  const oauth2: NonNullable<NonNullable<Google["accounts"]>["oauth2"]> = {
    initTokenClient: (c) => ({
      requestAccessToken: () => {
        google.pedidosDeToken.push({ scope: c.scope, noClique });
        const token = google.tokens[google.pedidosDeToken.length - 1] ?? "tk";
        setTimeout(() => c.callback({ access_token: token, expires_in: 3599 }));
      },
    }),
  };
  const picker = {
    PickerBuilder,
    DocsView,
    ViewId: { DOCS: "all" },
    DocsViewMode: { LIST: "list" },
    Feature: { MULTISELECT_ENABLED: "multi", SUPPORT_DRIVES: "drives" },
    Action: { PICKED: "picked", CANCEL: "cancel" },
  } as unknown as NonNullable<Google["picker"]>;
  window.google = { accounts: { oauth2 }, picker };
}

beforeEach(() => {
  google.escolhidos = [];
  google.tokens = ["tk"];
  google.pedidosDeToken = [];
  google.pickerAbertoEm = [];
  instalarGoogleFalso();
  document.addEventListener("click", comecaClique, true);
  window.addEventListener("click", terminaClique);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  esquecerToken();
  delete window.google;
  document.removeEventListener("click", comecaClique, true);
  window.removeEventListener("click", terminaClique);
});

const ligarDrive = () => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "123456789-abc.apps.googleusercontent.com");
  vi.stubEnv("VITE_GOOGLE_API_KEY", "chave-publica");
};

/** Liga o Drive falso como fetch. */
const drive = (raiz: NoDrive = OBRA, opcoes: OpcoesDriveFalso = {}) => {
  const falso = fetchFalso(raiz, opcoes);
  vi.stubGlobal("fetch", falso.fetch);
  return falso;
};

/** Abre o app e o diálogo do Drive; com `link`, cola e manda abrir. */
async function abrirDrive(link?: string) {
  const app = renderizarApp("/");
  await app.user.click(await screen.findByRole("button", { name: "Importar do Google Drive" }));
  const dialogo = await screen.findByRole("dialog", { name: "Importar do Google Drive" });
  if (link) {
    await app.user.type(
      within(dialogo).getByLabelText("Link da pasta ou do arquivo no Drive"),
      link,
    );
    await app.user.click(within(dialogo).getByRole("button", { name: "Abrir link" }));
  }
  return { ...app, dialogo };
}

describe("importar do Google Drive", () => {
  it("sem as chaves do Google no build, a opção aparece desabilitada e diz por quê", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    vi.stubEnv("VITE_GOOGLE_API_KEY", "");
    renderizarApp("/");
    const botao = await screen.findByRole("button", { name: "Importar do Google Drive" });
    expect(botao).toHaveProperty("disabled", true);
    expect(screen.getByText(/não está ligada nesta versão do app/)).toBeTruthy();
  });

  it("link de pasta pública: abre sem login e chega ao resumo, sem baixar o .DXF", async () => {
    ligarDrive();
    const falso = drive();
    await abrirDrive(LINK);

    const resumo = await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
    const ignorados = within(resumo).getByRole("region", { name: "Arquivos ignorados" });
    expect(within(ignorados).getByText("R1__TETO.DXF")).toBeTruthy();
    expect(
      within(resumo).getByText(
        "PREDIO/Memorial: documento do Google (Docs, Planilhas...), não é arquivo do SISTRUT; ignorado.",
      ),
    ).toBeTruthy();
    expect(google.pedidosDeToken).toEqual([]);
    const baixados = falso.chamadas.filter((c) => c.url.searchParams.get("alt") === "media");
    expect(baixados.map((c) => c.url.pathname.split("/").pop())).not.toContain("dxf");
    expect(falso.chamadas.every((c) => !c.cabecalhos.Authorization)).toBe(true);
  });

  it("o campo aceita o id puro e o link sem https://", async () => {
    ligarDrive();
    drive();
    await abrirDrive(`drive.google.com/drive/folders/${PASTA_ID}`);
    expect(await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })).toBeTruthy();
  });

  it("link que não é do Drive: explica como copiar o link", async () => {
    ligarDrive();
    const { dialogo } = await abrirDrive("https://example.com/obra");
    expect((await within(dialogo).findByRole("alert")).textContent).toMatch(
      /não é de uma pasta nem de um arquivo do Google Drive/,
    );
  });

  it("pasta privada: login drive.file no clique, Picker na pasta, marca os arquivos e importa", async () => {
    ligarDrive();
    const falso = drive(OBRA, {
      publico: false,
      token: "tk",
      concedidos: MARCOU_TODOS.map((m) => m.id),
    });
    google.escolhidos = MARCOU_TODOS;
    const { user, dialogo } = await abrirDrive(LINK);

    const login = await within(dialogo).findByRole("region", { name: "O Drive pede login" });
    expect(within(login).getByRole("alert").textContent).toMatch(/^Sem login, o Google Drive/);
    expect(login.textContent).toMatch(/Marcar só a pasta não basta/);
    await user.click(
      within(login).getByRole("button", { name: "Entrar com Google e marcar os arquivos" }),
    );

    const marcados = await screen.findByRole("region", { name: "Arquivos marcados no Drive" });
    expect(marcados.textContent).toMatch(/^12 arquivos marcados/);
    expect(google.pedidosDeToken).toEqual([
      { scope: "https://www.googleapis.com/auth/drive.file", noClique: true },
    ]);
    expect(google.pickerAbertoEm).toEqual([{ pasta: PASTA_ID }]);
    await user.click(
      within(marcados).getByRole("button", { name: "Importar os arquivos marcados" }),
    );

    expect(await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })).toBeTruthy();
    const comToken = falso.chamadas.filter((c) => c.cabecalhos.Authorization === "Bearer tk");
    expect(comToken.length).toBeGreaterThan(0);
  });

  it("link de arquivo privado: o Picker mostra só aquele arquivo", async () => {
    ligarDrive();
    drive(OBRA, { publico: false });
    const { user, dialogo } = await abrirDrive(
      "https://drive.google.com/file/d/arq-0-id-longo/view?usp=sharing",
    );
    const login = await within(dialogo).findByRole("region", { name: "O Drive pede login" });
    expect(login.textContent).toMatch(/mostra o arquivo do link/);
    await user.click(within(login).getByRole("button", { name: /^Entrar com Google/ }));
    await waitFor(() => expect(google.pickerAbertoEm).toEqual([{ arquivo: "arq-0-id-longo" }]));
  });

  it("parâmetros de outra pasta: duas rodadas do Picker, e cada pasta vira uma pasta da obra", async () => {
    ligarDrive();
    const exec: NoDrive = {
      id: "pasta-exec",
      name: "EXEC40",
      filhos: [{ id: "dsp2", name: "OUTRO.DSP", dados: new Uint8Array([1]) }],
    };
    drive({ id: "raiz", name: "raiz", filhos: [OBRA, exec] }, { token: "tk" });
    const { user, dialogo } = await abrirDrive();
    google.escolhidos = MARCOU_TODOS;
    await user.click(within(dialogo).getByRole("button", { name: "Escolher no Drive" }));
    const marcados = await screen.findByRole("region", { name: "Arquivos marcados no Drive" });
    google.escolhidos = [
      {
        id: "dsp2",
        name: "OUTRO.DSP",
        mimeType: "application/octet-stream",
        parentId: "pasta-exec",
      },
    ];
    await user.click(
      within(marcados).getByRole("button", { name: "Marcar arquivos de outra pasta" }),
    );
    // o diálogo volta remontado depois do Picker: busca a região de novo
    const regiao = () => screen.getByRole("region", { name: "Arquivos marcados no Drive" });
    await waitFor(() => expect(regiao().textContent).toMatch(/^13 arquivos marcados/));
    expect(regiao().textContent).toContain("Pasta 2: OUTRO.DSP");
    // o segundo Picker usa o token em memória: nenhum popup a mais
    expect(google.pedidosDeToken).toHaveLength(1);
    await user.click(
      within(regiao()).getByRole("button", { name: "Importar os arquivos marcados" }),
    );
    const resumo = await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
    expect(within(resumo).getByRole("region", { name: "Arquivos lidos" }).textContent).toContain(
      "OUTRO.DSP",
    );
  });

  it("token recusado (401) é esquecido: a tela pede para entrar, e entrar pede outro", async () => {
    ligarDrive();
    drive(OBRA, { token: "novo" });
    google.tokens = ["velho", "novo"];
    google.escolhidos = MARCOU_TODOS;
    const { user, dialogo } = await abrirDrive();
    await user.click(within(dialogo).getByRole("button", { name: "Escolher no Drive" }));
    const marcados = await screen.findByRole("region", { name: "Arquivos marcados no Drive" });
    // os marcados não precisam de chamada para entrar; o download, sim
    await user.click(
      within(marcados).getByRole("button", { name: "Importar os arquivos marcados" }),
    );
    const resumo = await screen.findByRole("dialog", { name: /SISTRUT$/ });
    expect(resumo.textContent).toContain("O login no Google expirou");
    await user.click(
      within(resumo).getByRole("button", { name: "Entrar com Google e marcar os arquivos" }),
    );
    const login = await screen.findByRole("region", { name: "O Drive pede login" });
    await user.click(within(login).getByRole("button", { name: /^Entrar com Google/ }));
    await waitFor(() => expect(google.pedidosDeToken.map((p) => p.noClique)).toEqual([true, true]));
  });

  it("marcou só um documento do Google: mostra a nota, não um diagnóstico de pasta", async () => {
    ligarDrive();
    drive(OBRA, { token: "tk" });
    google.escolhidos = [
      { id: "doc", name: "Memorial", mimeType: "application/vnd.google-apps.document" },
    ];
    const { user, dialogo } = await abrirDrive();
    await user.click(within(dialogo).getByRole("button", { name: "Escolher no Drive" }));
    const marcados = await screen.findByRole("region", { name: "Arquivos marcados no Drive" });
    await user.click(
      within(marcados).getByRole("button", { name: "Importar os arquivos marcados" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Nenhum arquivo comum para importar: Memorial: documento do Google (Docs, Planilhas...), não é arquivo do SISTRUT; ignorado.",
    );
  });

  it("pasta pública com arquivo que não baixa sem login: o resumo oferece entrar", async () => {
    ligarDrive();
    drive(OBRA, { proibidos: ["arq-2"] });
    const { user } = await abrirDrive(LINK);
    const resumo = await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
    expect(resumo.textContent).toContain(
      "PREDIO/TETO.SEC: Sem login, o Google Drive não abre isto",
    );
    await user.click(
      within(resumo).getByRole("button", { name: "Entrar com Google e marcar os arquivos" }),
    );
    const login = await screen.findByRole("region", { name: "O Drive pede login" });
    expect(login.textContent).toMatch(/não deixou baixar alguns arquivos/);
  });

  it("fechar o diálogo durante a listagem descarta o resultado", async () => {
    ligarDrive();
    const falso = fetchFalso(OBRA);
    let soltar = () => {};
    const segurou = new Promise<void>((ok) => (soltar = ok));
    vi.stubGlobal("fetch", (async (url: URL, init?: RequestInit) => {
      await segurou;
      return falso.fetch(url, init);
    }) as typeof fetch);
    const { user, dialogo } = await abrirDrive(LINK);
    await within(dialogo).findByRole("status");
    // o rodapé e o X do diálogo se chamam "Fechar"; qualquer um fecha
    await user.click(within(dialogo).getAllByRole("button", { name: "Fechar" })[0]!);
    soltar();
    await new Promise((ok) => setTimeout(ok, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(falso.chamadas.filter((c) => c.url.searchParams.get("alt") === "media")).toEqual([]);
  });

  it("Cancelar no download interrompe as chamadas e não abre o resumo", async () => {
    ligarDrive();
    const falso = fetchFalso(OBRA);
    const sinais: AbortSignal[] = [];
    vi.stubGlobal("fetch", ((url: URL, init?: RequestInit) => {
      if (url.searchParams.get("alt") !== "media") return falso.fetch(url, init);
      const signal = init!.signal!;
      sinais.push(signal);
      return new Promise((_, falha) =>
        signal.addEventListener("abort", () => falha(signal.reason)),
      );
    }) as typeof fetch);
    const { user } = await abrirDrive(LINK);
    const baixando = await screen.findByRole("dialog", { name: "Baixando do Google Drive" });
    await user.click(within(baixando).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sinais.length).toBeGreaterThan(0);
    expect(sinais.every((s) => s.aborted)).toBe(true);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(screen.queryByRole("dialog", { name: /lida do SISTRUT$/ })).toBeNull();
  });
});

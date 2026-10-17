// A opção "Importar do Google Drive" (ImportarDrive.tsx) com o app inteiro, a Drive API
// falsa no lugar do fetch e o login e o Picker do Google falsos em window.google: sem as
// variáveis do build fica desabilitada; o link de pasta pública abre sem login e chega ao
// mesmo resumo da pasta do disco; pasta privada pede login e passa pelo Picker.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderizarApp } from "../test-setup";
import { PREDIO } from "./__fixtures__/predioSistrut";
import { fetchFalso, type NoDrive } from "./drive/__fixtures__/driveFalso";
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

/** O que o Picker falso devolve e o que o login falso registrou. */
const google = {
  escolhidos: [] as { id: string; name: string; mimeType: string }[],
  pedidosDeToken: [] as { scope: string }[],
  pickerAbertoEm: [] as (string | undefined)[],
};

/** GIS e Picker falsos, com a mesma forma das bibliotecas do Google. */
function instalarGoogleFalso() {
  class DocsView {
    pasta: string | undefined;
    setIncludeFolders = () => this;
    setSelectFolderEnabled = () => this;
    setMode = () => this;
    setFileIds = () => this;
    setParent = (id: string) => ((this.pasta = id), this);
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
        google.pickerAbertoEm.push(this.vista?.pasta);
        setTimeout(() => this.cb?.({ action: "picked", docs: google.escolhidos }));
      },
    });
  }
  type Google = NonNullable<Window["google"]>;
  const oauth2: NonNullable<NonNullable<Google["accounts"]>["oauth2"]> = {
    initTokenClient: (c) => ({
      requestAccessToken: () => {
        google.pedidosDeToken.push({ scope: c.scope });
        setTimeout(() => c.callback({ access_token: "tk", expires_in: 3599 }));
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
  google.pedidosDeToken = [];
  google.pickerAbertoEm = [];
  instalarGoogleFalso();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  esquecerToken();
  delete window.google;
});

const ligarDrive = () => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "123456789-abc.apps.googleusercontent.com");
  vi.stubEnv("VITE_GOOGLE_API_KEY", "chave-publica");
};

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
    const falso = fetchFalso(OBRA);
    vi.stubGlobal("fetch", falso.fetch);
    const { user } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: "Importar do Google Drive" }));
    const drive = await screen.findByRole("dialog", { name: "Importar do Google Drive" });
    await user.type(within(drive).getByLabelText("Link da pasta ou do arquivo no Drive"), LINK);
    await user.click(within(drive).getByRole("button", { name: "Abrir link" }));

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

  it("link que não é do Drive: explica como copiar o link", async () => {
    ligarDrive();
    const { user } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: "Importar do Google Drive" }));
    const drive = await screen.findByRole("dialog", { name: "Importar do Google Drive" });
    await user.type(
      within(drive).getByLabelText("Link da pasta ou do arquivo no Drive"),
      "https://example.com/obra",
    );
    await user.click(within(drive).getByRole("button", { name: "Abrir link" }));
    expect((await within(drive).findByRole("alert")).textContent).toMatch(
      /não é de uma pasta nem de um arquivo do Google Drive/,
    );
  });

  it("pasta privada: pede login (drive.file) e abre o Picker já na pasta do link", async () => {
    ligarDrive();
    const falso = fetchFalso(OBRA, { publico: false, token: "tk" });
    vi.stubGlobal("fetch", falso.fetch);
    google.escolhidos = [
      { id: PASTA_ID, name: "PREDIO", mimeType: "application/vnd.google-apps.folder" },
    ];
    const { user } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: "Importar do Google Drive" }));
    const drive = await screen.findByRole("dialog", { name: "Importar do Google Drive" });
    await user.type(within(drive).getByLabelText("Link da pasta ou do arquivo no Drive"), LINK);
    await user.click(within(drive).getByRole("button", { name: "Abrir link" }));

    const login = await within(drive).findByRole("region", { name: "A pasta pede login" });
    expect(within(login).getByRole("alert").textContent).toMatch(/^Sem login, o Google Drive/);
    await user.click(
      within(login).getByRole("button", { name: "Entrar com Google e escolher a pasta" }),
    );

    expect(await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })).toBeTruthy();
    expect(google.pedidosDeToken).toEqual([
      { scope: "https://www.googleapis.com/auth/drive.file" },
    ]);
    expect(google.pickerAbertoEm).toEqual([PASTA_ID]);
    const comToken = falso.chamadas.filter((c) => c.cabecalhos.Authorization === "Bearer tk");
    expect(comToken.length).toBeGreaterThan(0);
  });

  it("o Google deu acesso só à pasta: pede para marcar os arquivos", async () => {
    ligarDrive();
    // a pasta escolhida lista vazia: com drive.file, os filhos não vieram junto
    const vazia: NoDrive = { id: PASTA_ID, name: "PREDIO", filhos: [] };
    vi.stubGlobal(
      "fetch",
      fetchFalso({ id: "raiz", name: "raiz", filhos: [vazia, OBRA.filhos![0]!] }).fetch,
    );
    google.escolhidos = [
      { id: PASTA_ID, name: "PREDIO", mimeType: "application/vnd.google-apps.folder" },
    ];
    const { user } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: "Importar do Google Drive" }));
    const drive = await screen.findByRole("dialog", { name: "Importar do Google Drive" });
    await user.click(within(drive).getByRole("button", { name: "Escolher no Drive" }));

    const aviso = await screen.findByRole("region", { name: "Escolha os arquivos" });
    expect(within(aviso).getByRole("alert").textContent).toMatch(/acesso só à pasta/);
    google.escolhidos = [{ id: "arq-0", name: "TETO.LAJ", mimeType: "application/octet-stream" }];
    await user.click(within(aviso).getByRole("button", { name: "Escolher os arquivos" }));
    expect(await screen.findByRole("dialog", { name: /lida do SISTRUT$/ })).toBeTruthy();
    await waitFor(() => expect(google.pickerAbertoEm).toEqual([undefined, PASTA_ID]));
  });
});

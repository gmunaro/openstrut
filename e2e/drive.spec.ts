import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PREDIO, semIds } from "../src/telas/__fixtures__/predioSistrut";
import {
  responderDrive,
  type NoDrive,
  type OpcoesDriveFalso,
} from "../src/telas/drive/__fixtures__/driveFalso";

// Importação de obra do SISTRUT pelo Google Drive (ImportarDrive.tsx), sem rede de
// verdade: a Drive API responde pela árvore falsa (src/telas/drive/__fixtures__), e o
// script do login (GIS) e o do Picker são trocados por versões falsas com a mesma forma.
// Toda outra chamada para fora do localhost é abortada. Confere que a obra sintética
// (o prédio de src/telas/__fixtures__/predioSistrut.ts, mais um .DXF e um documento do
// Google) abre igual à importação da mesma pasta do disco; que pasta privada pede login
// na pilha do clique (o popup do Google precisa do gesto do usuário), com o Picker por
// cima da página no celular e no desktop e o escopo drive.file (só o que foi marcado); e
// os erros. Prints em e2e/prints/drive.

const PRINTS = path.resolve(process.cwd(), "e2e/prints/drive");
fs.mkdirSync(PRINTS, { recursive: true });

const PASTA_ID = "1PastaPredioE2E_xyz";
const LINK = `https://drive.google.com/drive/folders/${PASTA_ID}?usp=sharing`;
const EXTRAS = [{ nome: "R1__TETO.DXF", dados: new Uint8Array([1, 2, 3]) }];
const OBRA: NoDrive = {
  id: PASTA_ID,
  name: "PREDIO",
  filhos: [
    ...[...PREDIO, ...EXTRAS].map((a, i) => ({ id: `arq-${i}`, name: a.nome, dados: a.dados })),
    { id: "doc-memorial", name: "Memorial", mimeType: "application/vnd.google-apps.document" },
  ],
};
/** O Picker devolve isto quando o usuário marca todos os arquivos da pasta. */
const MARCOU_TODOS = [...PREDIO, ...EXTRAS].map((a, i) => ({
  id: `arq-${i}`,
  name: a.nome,
  mimeType: "application/octet-stream",
  parentId: PASTA_ID,
  resourceKey: "",
}));

const TAMANHOS = [
  { nome: "celular-390x844", largura: 390, altura: 844 },
  { nome: "1366x768", largura: 1366, altura: 768 },
] as const;

/** Login do Google falso: registra o pedido (escopo, se saiu na pilha de um clique e se o
 *  gesto estava ativo) e devolve um token. O popup de verdade só abre no gesto. */
const GIS_FALSO = `
window.google = window.google || {};
window.google.accounts = { oauth2: { initTokenClient: function (c) {
  return { requestAccessToken: function () {
    window.__drive.pedidos.push({
      scope: c.scope,
      noClique: !!window.event && window.event.type === "click",
      gesto: navigator.userActivation.isActive,
    });
    setTimeout(function () { c.callback({ access_token: "tk-e2e", expires_in: 3599 }); }, 30);
  } };
} } };`;

/** gapi e Picker falsos: o Picker é uma camada por cima da página, como o de verdade, com
 *  "Selecionar" (devolve window.__drive.escolher) e "Cancelar". */
const GAPI_FALSO = `
function DocsView() { this.onde = {}; }
["setIncludeFolders", "setSelectFolderEnabled", "setMode"].forEach(function (m) {
  DocsView.prototype[m] = function () { return this; };
});
DocsView.prototype.setParent = function (id) { this.onde.pasta = id; return this; };
DocsView.prototype.setFileIds = function (ids) { this.onde.arquivo = ids; return this; };
function PickerBuilder() {}
["enableFeature", "setOAuthToken", "setDeveloperKey", "setAppId", "setLocale", "setTitle"]
  .forEach(function (m) { PickerBuilder.prototype[m] = function () { return this; }; });
PickerBuilder.prototype.addView = function (v) { this.vista = v; return this; };
PickerBuilder.prototype.setCallback = function (cb) { this.cb = cb; return this; };
PickerBuilder.prototype.build = function () {
  var self = this;
  return { setVisible: function () {
    window.__drive.picker.push(self.vista.onde);
    var caixa = document.createElement("div");
    caixa.setAttribute("role", "dialog");
    caixa.setAttribute("aria-label", "Google Picker");
    caixa.style.cssText = "position:fixed;inset:10%;z-index:2000;background:#fff;border:1px solid";
    function botao(texto, resposta) {
      var b = document.createElement("button");
      b.textContent = texto;
      b.onclick = function () { caixa.remove(); self.cb(resposta()); };
      caixa.append(b);
    }
    botao("Selecionar", function () { return { action: "picked", docs: window.__drive.escolher }; });
    botao("Cancelar", function () { return { action: "cancel" }; });
    document.body.append(caixa);
  } };
};
window.gapi = { load: function (lib, c) { setTimeout(function () {
  window.google = window.google || {};
  window.google.picker = { PickerBuilder: PickerBuilder, DocsView: DocsView,
    ViewId: { DOCS: "all" }, DocsViewMode: { LIST: "list" },
    Feature: { MULTISELECT_ENABLED: "m", SUPPORT_DRIVES: "d" },
    Action: { PICKED: "picked", CANCEL: "cancel" } };
  c.callback();
}, 10); } };`;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, OPTIONS",
};

interface Simulacao {
  opcoes?: OpcoesDriveFalso;
  /** Resposta fixa para todas as chamadas à Drive API (erros). */
  fixa?: { status: number; corpo: object };
  /** Atraso de cada download, para ver o progresso. */
  atrasoMs?: number;
  /** Atraso do script do login, para ver o botão esperando. */
  atrasoGisMs?: number;
  /** O que o Picker falso devolve em "Selecionar". */
  escolher?: typeof MARCOU_TODOS;
}

interface EstadoGoogle {
  pedidos: { scope: string; noClique: boolean; gesto: boolean }[];
  picker: { pasta?: string; arquivo?: string }[];
}

/** Liga as rotas: Drive API falsa, scripts do Google falsos, e nada mais sai da máquina. */
async function simularGoogle(page: Page, s: Simulacao = {}) {
  const chamadas: { url: URL; autorizacao: string | undefined }[] = [];
  await page.addInitScript((escolher) => {
    Object.assign(window, { __drive: { pedidos: [], picker: [], escolher } });
  }, s.escolher ?? []);
  await page.route(/^https?:\/\/(?!localhost[:/])/, (r) => r.abort());
  await page.route("https://accounts.google.com/gsi/client", async (r) => {
    if (s.atrasoGisMs) await new Promise((ok) => setTimeout(ok, s.atrasoGisMs));
    await r.fulfill({ contentType: "text/javascript", body: GIS_FALSO });
  });
  await page.route("https://apis.google.com/js/api.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: GAPI_FALSO }),
  );
  await page.route("https://www.googleapis.com/drive/v3/**", async (r) => {
    const req = r.request();
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const cabecalhos = req.headers();
    chamadas.push({ url, autorizacao: cabecalhos.authorization });
    const resposta = s.fixa ?? responderDrive(OBRA, url, cabecalhos, s.opcoes);
    if (s.atrasoMs && url.searchParams.get("alt") === "media")
      await new Promise((ok) => setTimeout(ok, s.atrasoMs));
    const binario = resposta.corpo instanceof Uint8Array;
    await r.fulfill({
      status: resposta.status,
      headers: {
        ...CORS,
        "content-type": binario ? "application/octet-stream" : "application/json",
      },
      body: binario ? Buffer.from(resposta.corpo as Uint8Array) : JSON.stringify(resposta.corpo),
    });
  });
  return chamadas;
}

const estadoGoogle = (page: Page) =>
  page.evaluate(() => (window as unknown as { __drive: EstadoGoogle }).__drive);

/** Registra erros do console e exceções da página (os abortos de rede de propósito, não). */
function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text()))
      erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

/** Texto do resumo da importação, para comparar duas importações. */
async function textoDoResumo(page: Page) {
  const resumo = page.getByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
  await expect(resumo.getByRole("region", { name: "Pavimentos importados" })).toBeVisible();
  return {
    pavimentos: await resumo.getByRole("region", { name: "Pavimentos importados" }).innerText(),
    lidos: await resumo.getByRole("region", { name: "Arquivos lidos" }).innerText(),
    ignorados: await resumo.getByRole("region", { name: "Arquivos ignorados" }).innerText(),
    avisos: await resumo.getByRole("region", { name: "Avisos da importação" }).innerText(),
  };
}

/** Abre a obra do resumo e devolve a obra gravada no rascunho, sem os ids. */
async function abrirEObra(page: Page) {
  await page
    .getByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })
    .getByRole("button", { name: "Abrir obra importada" })
    .click();
  await expect(page).toHaveURL(/\/obra$/);
  let textos: string[] = [];
  await expect
    .poll(async () => {
      textos = await page.evaluate(
        () =>
          new Promise<string[]>((ok, falha) => {
            const pedido = indexedDB.open("sistrut-v2");
            pedido.onerror = () => falha(pedido.error);
            pedido.onsuccess = () => {
              const db = pedido.result;
              if (!db.objectStoreNames.contains("rascunhos")) return ok([]);
              const todos = db.transaction("rascunhos").objectStore("rascunhos").getAll();
              todos.onsuccess = () => ok(todos.result.map((x: { texto: string }) => x.texto));
              todos.onerror = () => falha(todos.error);
            };
          }),
      );
      return textos.length;
    })
    .toBe(1);
  return semIds(JSON.parse(textos[0]!));
}

async function novaPagina(browser: Browser, largura = 1366, altura = 768) {
  const contexto = await browser.newContext({
    viewport: { width: largura, height: altura },
    serviceWorkers: "block",
  });
  return contexto.newPage();
}

async function abrirDialogoDrive(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Importar do Google Drive" }).click();
  return page.getByRole("dialog", { name: "Importar do Google Drive" });
}

// um servidor reaproveitado (reuseExistingServer) pode ter sido construído sem as chaves
// de teste: sem elas a opção fica desabilitada e todo teste daqui falharia por outro motivo
test.beforeAll(async ({ browser }) => {
  const page = await novaPagina(browser);
  await page.goto("/");
  const ligado = await page
    .getByRole("button", { name: "Importar do Google Drive" })
    .isEnabled({ timeout: 15_000 });
  await page.context().close();
  if (!ligado)
    throw new Error(
      "O servidor do e2e foi construído sem VITE_GOOGLE_CLIENT_ID e VITE_GOOGLE_API_KEY (reaproveitado de outro build?). Pare-o e rode de novo: o playwright.config.ts constrói o dist-e2e com as chaves de teste.",
    );
});

test("pasta pública pelo link: sem login, e a obra abre igual à da pasta do disco", async ({
  browser,
}) => {
  // a mesma obra numa pasta do disco, pelo seletor de pasta
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openstrut-drive-"));
  const dir = path.join(tmp, "PREDIO");
  fs.mkdirSync(dir);
  for (const a of [...PREDIO, ...EXTRAS]) fs.writeFileSync(path.join(dir, a.nome), a.dados);
  const local = await novaPagina(browser);
  await simularGoogle(local);
  await local.goto("/");
  await local.getByLabel("Pasta da obra do SISTRUT").setInputFiles(dir);
  const resumoLocal = await textoDoResumo(local);
  const obraLocal = await abrirEObra(local);
  fs.rmSync(tmp, { recursive: true, force: true });

  const page = await novaPagina(browser);
  const erros = vigiarErros(page);
  const chamadas = await simularGoogle(page);
  const drive = await abrirDialogoDrive(page);
  await drive.getByLabel("Link da pasta ou do arquivo no Drive").fill(LINK);
  await drive.getByRole("button", { name: "Abrir link" }).click();

  const resumoDrive = await textoDoResumo(page);
  expect(resumoDrive).toEqual(resumoLocal);
  expect(resumoDrive.ignorados).toContain("R1__TETO.DXF");
  // a nota do documento do Google aparece no resumo
  await expect(
    page.getByText("PREDIO/Memorial: documento do Google (Docs, Planilhas...), não é arquivo"),
  ).toBeVisible();
  await page.screenshot({ path: path.join(PRINTS, "resumo-link-publico.png"), fullPage: true });
  expect(await abrirEObra(page)).toBe(obraLocal);

  // sem login nenhuma chamada leva token, e o que a importação não lê não é baixado
  expect(chamadas.every((c) => c.autorizacao === undefined)).toBe(true);
  const baixados = chamadas
    .filter((c) => c.url.searchParams.get("alt") === "media")
    .map((c) => c.url.pathname.split("/").pop());
  expect(baixados).not.toContain(`arq-${PREDIO.length}`); // o .DXF
  expect(baixados).not.toContain(`arq-${PREDIO.findIndex((a) => a.nome === "TETO.BAK")}`);
  expect(baixados).toHaveLength(PREDIO.length - 1);
  expect(erros).toEqual([]);
});

for (const { nome, largura, altura } of TAMANHOS) {
  test(`pasta privada em ${nome}: login no clique, Picker por cima, marca os arquivos e abre`, async ({
    browser,
  }) => {
    const page = await novaPagina(browser, largura, altura);
    const erros = vigiarErros(page);
    const chamadas = await simularGoogle(page, {
      // drive.file: com token, o app só vê o que foi marcado no Picker
      opcoes: { publico: false, token: "tk-e2e", concedidos: MARCOU_TODOS.map((m) => m.id) },
      atrasoMs: 150,
      atrasoGisMs: 800,
      escolher: MARCOU_TODOS,
    });
    const drive = await abrirDialogoDrive(page);
    // enquanto o login do Google carrega, o botão espera (o popup tem de sair no clique)
    const escolher = drive.getByRole("button", { name: "Carregando o login do Google…" });
    await expect(escolher).toBeDisabled();
    await expect(drive.getByRole("button", { name: "Escolher no Drive" })).toBeEnabled();

    await drive.getByLabel("Link da pasta ou do arquivo no Drive").fill(LINK);
    await drive.getByRole("button", { name: "Abrir link" }).click();
    const login = drive.getByRole("region", { name: "O Drive pede login" });
    await expect(login.getByRole("alert")).toContainText("Sem login, o Google Drive não abre isto");
    await page.screenshot({ path: path.join(PRINTS, `pede-login-${nome}.png`) });
    // o diálogo cabe na tela do celular sem rolagem horizontal
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
    await login.getByRole("button", { name: "Entrar com Google e marcar os arquivos" }).click();

    // o Picker fica por cima e recebe o toque (o diálogo modal saiu da frente)
    const picker = page.getByRole("dialog", { name: "Google Picker" });
    await expect(picker).toBeVisible();
    await page.screenshot({ path: path.join(PRINTS, `picker-${nome}.png`) });
    await picker.getByRole("button", { name: "Selecionar" }).click();

    const marcados = page.getByRole("region", { name: "Arquivos marcados no Drive" });
    await expect(marcados).toContainText("12 arquivos marcados");
    await page.screenshot({ path: path.join(PRINTS, `marcados-${nome}.png`) });
    await marcados.getByRole("button", { name: "Importar os arquivos marcados" }).click();

    const baixando = page.getByRole("dialog", { name: "Baixando do Google Drive" });
    await expect(baixando).toContainText(/\d+ de 10 arquivos/);
    await expect(page.getByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })).toBeVisible();

    const estado = await estadoGoogle(page);
    expect(estado.pedidos).toEqual([
      { scope: "https://www.googleapis.com/auth/drive.file", noClique: true, gesto: true },
    ]);
    expect(estado.picker).toEqual([{ pasta: PASTA_ID }]);
    expect(chamadas.filter((c) => c.autorizacao === "Bearer tk-e2e")).toHaveLength(10);
    // o token não fica gravado no navegador
    const gravado = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(gravado).not.toContain("tk-e2e");

    await page
      .getByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })
      .getByRole("button", { name: "Abrir obra importada" })
      .click();
    await expect(page.getByRole("heading", { name: "PREDIO" })).toBeVisible();
    expect(erros).toEqual([]);
  });
}

test("link de arquivo privado: o Picker mostra só aquele arquivo", async ({ browser }) => {
  const page = await novaPagina(browser, 390, 844);
  await simularGoogle(page, { opcoes: { publico: false } });
  const drive = await abrirDialogoDrive(page);
  await drive
    .getByLabel("Link da pasta ou do arquivo no Drive")
    .fill("https://drive.google.com/file/d/arq-0-arquivo-privado/view");
  await drive.getByRole("button", { name: "Abrir link" }).click();
  await drive
    .getByRole("region", { name: "O Drive pede login" })
    .getByRole("button", { name: "Entrar com Google e marcar os arquivos" })
    .click();
  await expect(page.getByRole("dialog", { name: "Google Picker" })).toBeVisible();
  expect((await estadoGoogle(page)).picker).toEqual([{ arquivo: "arq-0-arquivo-privado" }]);
});

test("cancelar o Picker volta ao diálogo do Drive", async ({ browser }) => {
  const page = await novaPagina(browser, 390, 844);
  await simularGoogle(page);
  const drive = await abrirDialogoDrive(page);
  await drive.getByRole("button", { name: "Escolher no Drive" }).click();
  await page
    .getByRole("dialog", { name: "Google Picker" })
    .getByRole("button", { name: "Cancelar" })
    .click();
  await expect(page.getByRole("dialog", { name: "Importar do Google Drive" })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Importar do Google Drive" }).getByRole("button", {
      name: "Escolher no Drive",
    }),
  ).toBeEnabled();
});

test.describe("erros em português", () => {
  const casos = [
    {
      nome: "quota",
      fixa: { status: 429, corpo: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
      texto: "O Google Drive limitou as leituras deste app agora",
    },
    {
      nome: "API key recusada",
      fixa: { status: 400, corpo: { error: { errors: [{ reason: "keyInvalid" }] } } },
      texto: "A ligação com o Google Drive deste site está mal configurada (keyInvalid)",
    },
  ];
  for (const { nome, fixa, texto } of casos)
    test(nome, async ({ browser }) => {
      const page = await novaPagina(browser);
      await simularGoogle(page, { fixa });
      const drive = await abrirDialogoDrive(page);
      await drive.getByLabel("Link da pasta ou do arquivo no Drive").fill(LINK);
      await drive.getByRole("button", { name: "Abrir link" }).click();
      await expect(drive.getByRole("alert")).toContainText(texto);
    });

  test("sem rede", async ({ browser }) => {
    const page = await novaPagina(browser);
    await simularGoogle(page);
    // derruba só a Drive API (as rotas mais novas valem primeiro)
    await page.route("https://www.googleapis.com/**", (r) => r.abort("internetdisconnected"));
    const drive = await abrirDialogoDrive(page);
    await drive.getByLabel("Link da pasta ou do arquivo no Drive").fill(LINK);
    await drive.getByRole("button", { name: "Abrir link" }).click();
    await expect(drive.getByRole("alert")).toHaveText(
      "Sem conexão com o Google Drive. Confira a internet e tente de novo.",
    );
  });
});

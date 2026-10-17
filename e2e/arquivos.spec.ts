import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { selecionarLaje } from "./planta";

// Arquivos e rascunhos: salvar e reabrir .openstrut.json (e o .sistrut.json antigo),
// importar a V1 (FLUXO), rejeitar arquivo inválido ou de versão futura, e manter o
// rascunho após recarregar.
// Os prints e o .openstrut.json baixado saem em e2e/prints/arquivos.

const PASTA = path.resolve(process.cwd(), "e2e/prints/arquivos");
const PASTA_V1 = path.resolve(process.cwd(), "src/armazenamento/__fixtures__/v1");

async function foto(page: Page, nome: string) {
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), fullPage: true });
}

// Os seletores nativos do Chrome abrem janela do sistema, fora do alcance do Playwright.
// Sem eles o OpenStrut cai no <input type=file> e no download, que é o caminho testado aqui.
async function semFileSystemAccess(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
}

// Arrasta na planta (fração 0..1 da área do svg) para criar uma laje.
async function desenharRetangulo(page: Page, x1: number, y1: number, x2: number, y2: number) {
  const caixa = await page.getByRole("application", { name: "Planta do pavimento" }).boundingBox();
  if (!caixa) throw new Error("planta sem área na tela");
  const px = (f: number) => caixa.x + caixa.width * f;
  const py = (f: number) => caixa.y + caixa.height * f;
  await page.mouse.move(px(x1), py(y1));
  await page.mouse.down();
  await page.mouse.move(px(x2), py(y2), { steps: 8 });
  await page.mouse.up();
}

// Campo do painel: o rótulo traz a unidade, p.ex. "x (m)" ou "Espessura h (cm)".
async function preencher(page: Page, rotulo: RegExp | string, valor: string) {
  const campo = page.getByLabel(rotulo, { exact: typeof rotulo === "string" });
  await campo.fill(valor, { timeout: 10_000 });
  await campo.press("Enter", { timeout: 10_000 });
}

/** Abre pelo botão da tela inicial um arquivo (caminho ou conteúdo em memória). */
async function abrirArquivoNoInicio(
  page: Page,
  arquivo: string | { name: string; mimeType: string; buffer: Buffer },
) {
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(arquivo);
}

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

test("salva .openstrut.json e reabre com os mesmos dados", async ({ page }) => {
  test.setTimeout(180_000);
  await semFileSystemAccess(page);

  await page.goto("/");
  await page.getByLabel("Nome", { exact: true }).fill("Arquivo Teste");
  await page.getByRole("button", { name: "Criar obra" }).click();
  await expect(page.getByRole("heading", { name: "Arquivo Teste" })).toBeVisible();

  await page.getByRole("tab", { name: "Planta" }).click();
  await page.getByRole("button", { name: /^Laje/ }).click();
  await desenharRetangulo(page, 0.12, 0.2, 0.4, 0.5);
  await selecionarLaje(page, "L1");
  await preencher(page, /^Espessura h/, "12");
  await foto(page, "01-obra-com-laje-h12");

  // Salvar sem API de arquivo: baixa o .openstrut.json pela pasta de downloads
  const [baixado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Salvar", exact: true }).click(),
  ]);
  const caminho = path.join(PASTA, baixado.suggestedFilename());
  await baixado.saveAs(caminho);
  await expect(page.getByText(/baixado às/)).toBeVisible();
  await foto(page, "02-salvo-baixado");

  const dados = JSON.parse(fs.readFileSync(caminho, "utf8")) as {
    versao: number;
    nome: string;
    pavimentos: { lajes: { nome: string; h: number }[] }[];
  };
  expect(baixado.suggestedFilename()).toBe("Arquivo Teste.openstrut.json");
  expect(dados.versao).toBe(3);
  expect(dados.nome).toBe("Arquivo Teste");
  expect(dados.pavimentos[0]?.lajes).toEqual([expect.objectContaining({ nome: "L1", h: 12 })]);

  // Reabrir: volta para a tela inicial e abre o arquivo baixado
  await page.goto("/");
  await abrirArquivoNoInicio(page, caminho);
  await expect(page.getByRole("heading", { name: "Arquivo Teste" })).toBeVisible();
  await foto(page, "03-reaberto");

  await selecionarLaje(page, "L1");
  await expect(page.getByLabel(/^Espessura h/)).toHaveValue(/^12([,.]0+)?$/);
  await foto(page, "04-reaberto-laje-h12");

  // o mesmo conteúdo com o nome de antes do renome (.sistrut.json) abre igual
  await page.goto("/");
  await abrirArquivoNoInicio(page, {
    name: "Arquivo Teste.sistrut.json",
    mimeType: "application/json",
    buffer: fs.readFileSync(caminho),
  });
  await expect(page.getByRole("heading", { name: "Arquivo Teste" })).toBeVisible();
  await expect(page.getByText("Arquivo Teste.sistrut.json · salvo")).toBeVisible();
});

test("importa a obra FLUXO da V1 com avisos", async ({ page }) => {
  test.setTimeout(120_000);
  await semFileSystemAccess(page);

  await page.goto("/");
  await page
    .locator('input[aria-label="Arquivos da V1 (.LAJ, .VIG, .COL)"]')
    .setInputFiles([
      path.join(PASTA_V1, "FLUXO.LAJ"),
      path.join(PASTA_V1, "FLUXO.VIG"),
      path.join(PASTA_V1, "FLUXO.COL"),
    ]);

  const avisos = page.getByRole("region", { name: "Avisos da importação" });
  await expect(avisos).toBeVisible();
  await expect(avisos).toContainText("Obra FLUXO importada da V1 com 2 avisos:");
  await foto(page, "05-importacao-v1-avisos");

  await avisos.getByRole("button", { name: "Abrir obra importada" }).click();
  await expect(page.getByRole("heading", { name: "FLUXO" })).toBeVisible();
  await foto(page, "06-fluxo-aberta");

  // L1 do .LAJ: x = 0, y = 0, lx = 4, ly = 5, h = 10 cm
  await selecionarLaje(page, "L1");
  await expect(page.getByLabel("lx (m)", { exact: true })).toHaveValue(/^4([,.]0+)?$/);
  await expect(page.getByLabel("ly (m)", { exact: true })).toHaveValue(/^5([,.]0+)?$/);
  await expect(page.getByLabel(/^Espessura h/)).toHaveValue(/^10([,.]0+)?$/);
  await foto(page, "07-fluxo-laje-L1");
});

test("recusa arquivo inválido e de versão futura", async ({ page }) => {
  test.setTimeout(60_000);
  await semFileSystemAccess(page);

  await page.goto("/");
  await abrirArquivoNoInicio(page, {
    name: "ruim.openstrut.json",
    mimeType: "application/json",
    buffer: Buffer.from("{isto nao e json"),
  });
  const erro = page.getByRole("alert");
  await expect(erro).toContainText("Não foi possível abrir ruim.openstrut.json:");
  await expect(erro).toContainText("O arquivo não é um JSON válido");
  await foto(page, "08-arquivo-invalido");

  await abrirArquivoNoInicio(page, {
    name: "futuro.sistrut.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ versao: 99, nome: "Futura" })),
  });
  await expect(erro).toContainText("Não foi possível abrir futuro.sistrut.json:");
  await expect(erro).toContainText(
    "O arquivo é da versão 99, mais nova que a suportada (3). Atualize o OpenStrut.",
  );
  await expect(page.getByRole("heading", { name: "Futura" })).toBeHidden();
  await foto(page, "09-versao-futura");
});

test("rascunho sobrevive a recarregar a página", async ({ page }) => {
  test.setTimeout(120_000);
  await semFileSystemAccess(page);

  await page.goto("/");
  await page.getByLabel("Nome", { exact: true }).fill("Rascunho Teste");
  await page.getByRole("button", { name: "Criar obra" }).click();
  await expect(page.getByRole("heading", { name: "Rascunho Teste" })).toBeVisible();

  await page.getByRole("tab", { name: "Planta" }).click();
  await page.getByRole("button", { name: /^Laje/ }).click();
  await desenharRetangulo(page, 0.12, 0.2, 0.4, 0.5);
  await selecionarLaje(page, "L1");
  await preencher(page, /^Espessura h/, "14");
  // Salvamento com debounce de 800 ms; a espera garante que o rascunho foi gravado.
  await page.waitForTimeout(1500);
  await foto(page, "10-rascunho-antes-do-reload");

  // Recarregar: a sessão em memória some; só o rascunho no navegador resta
  await page.reload();
  await page.goto("/");
  // O botão de apagar tem "Rascunho Teste" no nome também; o item da lista começa com o nome seguido da data.
  const recente = page.getByRole("button", { name: /^Rascunho Teste \d/ });
  await expect(recente).toBeVisible();
  await foto(page, "11-rascunho-na-lista");

  await recente.click();
  await expect(page.getByRole("heading", { name: "Rascunho Teste" })).toBeVisible();
  await selecionarLaje(page, "L1");
  await expect(page.getByLabel(/^Espessura h/)).toHaveValue(/^14([,.]0+)?$/);
  await foto(page, "12-rascunho-reaberto-h14");
});

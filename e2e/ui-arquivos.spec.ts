import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Interface da tela inicial e da saída da obra: importar a obra do SISTRUT pelos arquivos
// de uma vez (fixtures reais em src/telas/__fixtures__/sistrut), erro sem .LAJ, aviso ao
// sair com alterações não salvas, teclado e layout em 1366×768, 1920×1080 e janela estreita.
// Prints em e2e/prints/ui-arquivos. Qualquer erro no console da página reprova o teste.

const PASTA = path.resolve(process.cwd(), "e2e/prints/ui-arquivos");
const FIXTURES = path.resolve(process.cwd(), "src/telas/__fixtures__/sistrut");
const OBRA_SISTRUT = [
  "E2E.LAJ",
  "E2E.VIG",
  "E2E.SEC",
  "SISTRUT.DSP",
  "E2E.COL",
  "SISTRUT.PIP",
  "E2E.REP",
  "E2E.RLP",
].map((nome) => path.join(FIXTURES, nome));

const TAMANHOS = [
  { nome: "1366x768", largura: 1366, altura: 768 },
  { nome: "1920x1080", largura: 1920, altura: 1080 },
  { nome: "estreita-480x800", largura: 480, altura: 800 },
] as const;

fs.mkdirSync(PASTA, { recursive: true });

/** Registra erros do console e exceções da página; o teste confere a lista no fim. */
function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });
  page.on("pageerror", (err) => erros.push(err.message));
  return erros;
}

async function foto(page: Page, nome: string) {
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), fullPage: true });
}

/** Cria uma obra nova pela tela inicial e espera a tela da obra. */
async function criarObra(page: Page, nome: string) {
  await page.goto("/");
  await page.getByLabel("Nome").fill(nome);
  await page.getByRole("combobox", { name: "Norma" }).click();
  await page.getByRole("option", { name: "NBR 6118:2023" }).click();
  await page.getByRole("button", { name: /Criar obra/ }).click();
  await expect(page).toHaveURL(/\/obra$/);
}

test.describe("importação da obra do SISTRUT", () => {
  test("seleciona os arquivos de uma vez, mostra o resumo e abre a obra", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto("/");
    await page
      .getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)")
      .setInputFiles(OBRA_SISTRUT);

    const avisos = page.getByRole("region", { name: "Avisos da importação" });
    await expect(avisos).toContainText(
      /Obra E2E lida do SISTRUT: 4 lajes, \d+ vigas e 9 pilares\./,
    );
    await foto(page, "importacao-sistrut");

    await avisos.getByRole("button", { name: "Abrir obra importada" }).click();
    await expect(page).toHaveURL(/\/obra$/);
    await expect(page.getByRole("heading", { name: "E2E" })).toBeVisible();
    expect(erros).toEqual([]);
  });

  test("sem o .LAJ, a tela diz o que selecionar e não abre nada", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto("/");
    const vigas = OBRA_SISTRUT.filter((c) => !c.endsWith(".LAJ"));
    await page.getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)").setInputFiles(vigas);

    await expect(page.getByRole("alert")).toContainText("Nenhum .LAJ entre os arquivos");
    await expect(page).toHaveURL(/\/$/);
    expect(erros).toEqual([]);
  });

  test("o botão abre o seletor de arquivos pelo teclado", async ({ page }) => {
    await page.goto("/");
    const botao = page.getByRole("button", { name: "Importar obra do SISTRUT" });
    await botao.focus();
    const seletor = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    const escolha = await seletor;
    expect(escolha.isMultiple()).toBe(true);
  });
});

test.describe("aviso ao sair com alterações não salvas", () => {
  test("Continuar editando fica na obra; Escape não fecha o aviso", async ({ page }) => {
    const erros = vigiarErros(page);
    await criarObra(page, "Sem salvar");
    await page.getByRole("link", { name: "Início" }).click();

    const aviso = page.getByRole("dialog", { name: "Sair com alterações não salvas?" });
    await expect(aviso).toBeVisible();
    await expect(aviso.getByRole("button", { name: "Continuar editando" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(aviso).toBeVisible();
    // toBeVisible aceita opacidade 0: espera a animação de entrada do diálogo terminar.
    await expect(aviso).toHaveCSS("opacity", "1");
    await foto(page, "aviso-saida");

    await aviso.getByRole("button", { name: "Continuar editando" }).click();
    await expect(aviso).toBeHidden();
    await expect(page).toHaveURL(/\/obra$/);
    expect(erros).toEqual([]);
  });

  test("Sair sem salvar leva à tela inicial e a obra fica na lista de recentes", async ({
    page,
  }) => {
    const erros = vigiarErros(page);
    await criarObra(page, "Vai embora");
    await page.getByRole("link", { name: "Início" }).click();
    await page
      .getByRole("dialog", { name: "Sair com alterações não salvas?" })
      .getByRole("button", { name: "Sair sem salvar" })
      .click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: /^Vai embora/ })).toBeVisible();
    expect(erros).toEqual([]);
  });
});

test.describe("layout da tela inicial", () => {
  for (const { nome, largura, altura } of TAMANHOS) {
    test(`sem rolagem horizontal e com a importação visível em ${nome}`, async ({ page }) => {
      const erros = vigiarErros(page);
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "OpenStrut V2" })).toBeVisible();
      await page
        .getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)")
        .setInputFiles(OBRA_SISTRUT);
      await expect(page.getByRole("region", { name: "Avisos da importação" })).toBeVisible();

      const sobra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sobra).toBeLessThanOrEqual(0);
      await foto(page, `inicio-${nome}`);
      expect(erros).toEqual([]);
    });
  }
});

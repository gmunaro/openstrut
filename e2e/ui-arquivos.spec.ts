import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Interface da tela inicial e da saída da obra: importar a obra do SISTRUT pelos arquivos
// de uma vez (fixtures reais em src/telas/__fixtures__/sistrut), erro sem obra, aviso ao
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

    const resumo = page.getByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
    const pavimentos = resumo.getByRole("region", { name: "Pavimentos importados" });
    await expect(pavimentos.getByRole("row", { name: /^E2E 3 4 \d+ 9$/ })).toBeVisible();
    // a foto espera a animação de abertura do diálogo
    await resumo.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    await foto(page, "importacao-sistrut");

    await resumo.getByRole("button", { name: "Abrir obra importada" }).click();
    await expect(page).toHaveURL(/\/obra$/);
    await expect(page.getByRole("heading", { name: "E2E" })).toBeVisible();
    expect(erros).toEqual([]);
  });

  test("sem .LAJ, .VIG nem .COL, o diálogo diz por quê e não abre nada", async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto("/");
    const soltos = OBRA_SISTRUT.filter((c) => /\.(SEC|REP|RLP)$/.test(c));
    await page.getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)").setInputFiles(soltos);

    const dialogo = page.getByRole("dialog", {
      name: "Não foi possível importar a obra do SISTRUT",
    });
    await expect(dialogo.getByRole("alert")).toContainText("Nenhuma obra para abrir");
    await foto(page, "importacao-sistrut-sem-obra");
    await dialogo.getByRole("button", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(erros).toEqual([]);
  });

  test("o botão abre o seletor de arquivos pelo teclado", async ({ page }) => {
    // a espera vem antes do goto: o Playwright liga a interceptação do seletor de forma
    // assíncrona, e um Enter logo depois às vezes chegava antes dela (a página clicava o
    // input com ativação do usuário, mas o evento não vinha)
    const seletor = page.waitForEvent("filechooser");
    await page.goto("/");
    const botao = page.getByRole("button", { name: "Importar obra do SISTRUT" });
    await botao.focus();
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

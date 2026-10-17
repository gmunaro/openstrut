import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Aba Orçamento com uma obra calculada (NB-1/78, modo original): tabela SINAPI de
// referência, total parcial pelo concreto C15 que a SINAPI não tem, composição editada,
// BDI, importação de CSV, comparação com o modo corrigido, exportação CSV e XLSX.
// Prints em e2e/prints/orcamento (celular e desktop). Rode com PORT=4410.
const PASTA = path.resolve(process.cwd(), "e2e/prints/orcamento");
const OBRA = path.resolve(process.cwd(), "e2e/fixtures/ui-resultados/obra-original.openstrut.json");

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** "R$ 1.234,56" → 1234.56 */
const deReais = (t: string) => Number(t.replace(/[^\d,-]/g, "").replace(",", "."));

async function abrirOrcamento(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(OBRA);
  await page.getByRole("tab", { name: "Orçamento" }).click();
  const painel = page.getByRole("tabpanel", { name: "Orçamento" });
  await expect(painel.getByRole("heading", { name: "Orçamento da estrutura" })).toBeVisible();
  return { painel, erros };
}

const celula = (page: Page, rotulo: string) =>
  page.getByRole("tabpanel", { name: "Orçamento" }).locator(`[data-rotulo="${rotulo}"]`);

test("orçamento: SINAPI, composição, BDI, importação, comparação e exportação", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  const { painel, erros } = await abrirOrcamento(page);

  // aviso fixo e a tabela de referência datada
  await expect(painel.getByRole("note").filter({ hasText: "Não substitui o orçamento executivo" })).toBeVisible();
  await expect(painel.getByLabel("Tabela", { exact: true })).toHaveValue("sinapi-2026-09-sp-nd");
  await expect(painel.getByText("referência 09/2026, UF SP, sem desoneração")).toBeVisible();

  // fck 15: a SINAPI não tem concreto usinado C15 → total parcial
  await expect(painel.getByRole("alert").filter({ hasText: "Total parcial" })).toContainText(
    "Concreto fck 15 MPa",
  );
  const comp = painel.getByLabel("Composição de Concreto fck 15 MPa");
  await expect(comp).toHaveValue("");
  await comp.fill("1524");
  await comp.press("Enter");
  await expect(painel.getByRole("alert").filter({ hasText: "Total parcial" })).toHaveCount(0);
  await expect(painel.locator('[data-papel="concreto:15"]')).toContainText("C20");

  // BDI 25 %: total = direto · 1,25
  await painel.getByLabel("BDI", { exact: true }).fill("25");
  await painel.getByLabel("BDI", { exact: true }).press("Enter");
  const direto = deReais(await celula(page, "Custo direto").innerText());
  const total = deReais(await celula(page, "Total com BDI").innerText());
  expect(direto).toBeGreaterThan(0);
  expect(total).toBeCloseTo(direto * 1.25, 1);

  // comparação com o modo corrigido (a obra está no original)
  await expect(painel.getByRole("heading", { name: "Quanto custa o erro do original" })).toBeVisible();
  await expect(celula(page, "diferenca-carga")).not.toHaveText("—");

  await page.screenshot({ path: path.join(PASTA, "desktop-1366.png"), fullPage: true });
  await painel.getByRole("heading", { name: "Quanto custa o erro do original" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PASTA, "desktop-1366-comparacao.png") });

  // exportação
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    painel.getByRole("button", { name: "XLSX" }).click(),
  ]);
  const bytes = fs.readFileSync(await xlsx.path());
  expect(xlsx.suggestedFilename()).toMatch(/^orcamento-.*\.xlsx$/);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    painel.getByRole("button", { name: "CSV" }).click(),
  ]);
  const texto = fs.readFileSync(await csv.path(), "utf8");
  expect(texto).toContain("Por insumo");
  expect(texto).toContain("Total com BDI (R$)");
  expect(texto).toContain("Comparação");

  // importação de CSV do usuário: nova tabela, só com concreto → o resto fica sem preço
  await painel.getByRole("button", { name: "Importar…" }).click();
  await painel.getByLabel("Arquivo").setInputFiles({
    name: "meus-precos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("codigo;descricao;unidade;preco\n1524;Concreto C20 da usina;m3;600,00\n"),
  });
  await painel.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(painel.getByRole("status")).toContainText("1 item importado");
  await expect(painel.getByLabel("Tabela", { exact: true })).not.toHaveValue("sinapi-2026-09-sp-nd");
  await expect(painel.locator('[data-papel="concreto:15"]')).toContainText("600");
  await expect(painel.getByRole("alert").filter({ hasText: "Total parcial" })).toBeVisible();

  // volta à SINAPI: a tabela importada fica guardada no navegador, a configuração também
  await painel.getByLabel("Tabela", { exact: true }).selectOption("sinapi-2026-09-sp-nd");
  await page.reload();
  const depois = await abrirOrcamento(page);
  await expect(depois.painel.getByLabel("BDI", { exact: true })).toHaveValue("25,00");
  await expect(depois.painel.getByLabel("Composição de Concreto fck 15 MPa")).toHaveValue("1524");
  await expect(depois.painel.getByLabel("Tabela", { exact: true }).locator("option")).toHaveCount(2);

  expect([...erros, ...depois.erros]).toEqual([]);
});

for (const tela of [
  { nome: "celular-360", largura: 360, altura: 800 },
  { nome: "celular-412", largura: 412, altura: 915 },
]) {
  test(`orçamento no ${tela.nome}: sem rolagem lateral da página`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({
      viewport: { width: tela.largura, height: tela.altura },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    const { painel, erros } = await abrirOrcamento(page);
    await expect(celula(page, "Total com BDI")).toBeVisible();
    const larg = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(larg).toBeLessThanOrEqual(tela.largura);
    await page.screenshot({ path: path.join(PASTA, `${tela.nome}.png`) });
    // o painel rola por dentro: uma captura por bloco
    const titulos = painel.getByRole("heading");
    const n = await titulos.count();
    for (let i = 0; i < n; i++) {
      await titulos.nth(i).evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: path.join(PASTA, `${tela.nome}-${String(i).padStart(2, "0")}.png`) });
    }
    expect(erros).toEqual([]);
    await ctx.close();
  });
}

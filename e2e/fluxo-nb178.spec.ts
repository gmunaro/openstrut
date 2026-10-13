import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Fluxo NB-1/78 de ponta a ponta: materiais, planta, resultados, relatório e DXF.
// Os prints saem em e2e/prints/nb178, numerados na ordem dos passos.

const PASTA = path.resolve(process.cwd(), "e2e/prints/nb178");
const NOME_OBRA = "Casa NB178";

let passo = 0;
async function foto(page: Page, descricao: string) {
  passo += 1;
  const nome = `${String(passo).padStart(2, "0")}-${descricao}.png`;
  await page.screenshot({ path: path.join(PASTA, nome), fullPage: true });
}

// Os seletores nativos do Chrome abrem janela do sistema, fora do alcance do Playwright.
// Sem eles o SISTRUT cai no <input type=file> e no download, que é o caminho testado aqui.
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

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

test("fluxo NB-1/78 completo", async ({ page }) => {
  test.setTimeout(240_000);
  await semFileSystemAccess(page);

  // 1. Início e criação da obra
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SISTRUT V2" })).toBeVisible();
  await foto(page, "inicio");

  await page.getByLabel("Nome", { exact: true }).fill(NOME_OBRA);
  await expect(page.getByRole("combobox", { name: /Norma/ })).toContainText("NB-1/78");
  await page.getByRole("button", { name: "Criar obra" }).click();
  await expect(page.getByRole("heading", { name: NOME_OBRA })).toBeVisible();
  await foto(page, "obra-criada");

  // 2. Materiais: CA-25 trava a classe em A; CA-50 com classe B; estribo CA-60
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();

  await page.locator("#mat-aco").click();
  await page.getByRole("option", { name: "CA-25", exact: true }).click();
  await page.locator("#mat-classe-aco").click();
  await expect(page.getByRole("option", { name: /^B \(/ })).toHaveAttribute("data-disabled", "");
  await page.keyboard.press("Escape");
  await foto(page, "materiais-ca25-classe-b-travada");

  await page.locator("#mat-aco").click();
  await page.getByRole("option", { name: "CA-50", exact: true }).click();
  await page.locator("#mat-classe-aco").click();
  await page.getByRole("option", { name: /^B \(/ }).click();

  await page.locator("#mat-aco-estribo").click();
  await page.getByRole("option", { name: "CA-60", exact: true }).click();
  await foto(page, "materiais-ca50-classe-B-estribo-ca60");

  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();

  // 3. Planta: duas lajes desenhadas e valores exatos pelo painel
  await page.getByRole("tab", { name: "Planta" }).click();
  await page.getByRole("button", { name: /^Laje/ }).click();
  await desenharRetangulo(page, 0.12, 0.2, 0.4, 0.5);
  await page.getByRole("button", { name: /^Laje/ }).click();
  await desenharRetangulo(page, 0.55, 0.2, 0.85, 0.5);
  await foto(page, "planta-duas-lajes-desenhadas");

  // Medidas para conta à mão: h = 10 cm, revestimento 1 kN/m², lx = 4 m, ly = 5 m.
  // L1 em (0, 0); L2 em (5, 0). Bordo direito de L2 livre: a viga sobre ele não existe.
  const caixa = await page.getByRole("application", { name: "Planta do pavimento" }).boundingBox();
  if (!caixa) throw new Error("planta sem área na tela");

  // Com a ferramenta Laje ativa, clique não seleciona laje existente: volta para Selecionar.
  await page.getByRole("button", { name: "Selecionar", exact: true }).click();
  await page.mouse.click(caixa.x + caixa.width * 0.25, caixa.y + caixa.height * 0.35);
  await expect(page.getByRole("heading", { name: "Laje", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByLabel("Nome", { exact: true })).toHaveValue("L1");
  await preencher(page, "x (m)", "0");
  await preencher(page, "y (m)", "0");
  await preencher(page, "lx (m)", "4");
  await preencher(page, "ly (m)", "5");
  await preencher(page, /^Espessura h/, "10");
  await preencher(page, /^Revestimento/, "1");
  await preencher(page, /^μ/, "0,8");
  await foto(page, "laje-L1-propriedades");

  await page.getByRole("button", { name: "Selecionar", exact: true }).click();
  await page.mouse.click(caixa.x + caixa.width * 0.7, caixa.y + caixa.height * 0.35);
  await expect(page.getByRole("heading", { name: "Laje", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByLabel("Nome", { exact: true })).toHaveValue("L2");
  await preencher(page, "x (m)", "5");
  await preencher(page, "y (m)", "0");
  await preencher(page, "lx (m)", "4");
  await preencher(page, "ly (m)", "5");
  await preencher(page, /^Espessura h/, "10");
  await preencher(page, /^Revestimento/, "1");
  await page.getByRole("combobox", { name: /^Direito/ }).selectOption({ label: "livre (sem viga)" });
  await foto(page, "laje-L2-bordo-direito-livre");

  // 4. Resultados
  await page.getByRole("tab", { name: "Resultados" }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(resultados).toBeVisible();
  await foto(page, "resultados-topo");

  // Conta 1: g = h x 25 kN/m3 + revestimento = 0,10 x 25 + 1 = 3,50 kN/m2
  await expect(resultados.getByRole("row").filter({ hasText: /^L1/ }).first()).toContainText("3,50");
  await foto(page, "resultados-lajes");

  // Conta 2: concreto das lajes = lx x ly x h = 4 x 5 x 0,10 = 2,00 m3 por laje, 4,00 m3 no total
  await expect(resultados.getByRole("row").filter({ hasText: /^Lajes/ }).first()).toContainText("4,00");
  await foto(page, "resultados-quantitativos");

  await expect(resultados.getByRole("region", { name: /^Detalhamento V\d+$/ }).first()).toBeVisible();
  await foto(page, "resultados-detalhamento");

  // 5. Relatório: a classe do aço escolhida tem de aparecer
  await page.getByRole("tab", { name: "Relatório" }).click();
  const relatorio = page.getByRole("tabpanel", { name: "Relatório" });
  await expect(relatorio.getByRole("heading", { name: NOME_OBRA })).toBeVisible();
  const linhaClasse = relatorio.getByRole("row").filter({ hasText: "Classe do aço" });
  await expect(linhaClasse.getByRole("cell").nth(1)).toHaveText("B");
  await foto(page, "relatorio");

  // 6. DXF de formas e de armação, gravados em prints/nb178
  await page.getByRole("tab", { name: "Planta" }).click();
  const [formas] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar DXF (formas)" }).click(),
  ]);
  const caminhoFormas = path.join(PASTA, formas.suggestedFilename());
  await formas.saveAs(caminhoFormas);
  const textoFormas = fs.readFileSync(caminhoFormas, "utf8");
  expect(textoFormas).toMatch(/^\s*0\r?\nSECTION/);
  expect(textoFormas).toContain("EOF");

  const [armacao] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar DXF (armação)" }).click(),
  ]);
  const caminhoArmacao = path.join(PASTA, armacao.suggestedFilename());
  await armacao.saveAs(caminhoArmacao);
  const textoArmacao = fs.readFileSync(caminhoArmacao, "utf8");
  expect(textoArmacao).toMatch(/^\s*0\r?\nSECTION/);
  expect(textoArmacao).toContain("EOF");
  await foto(page, "dxf-exportados");
});

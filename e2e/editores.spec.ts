import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Editores dos dados do SISTRUT (NB-1/78) na obra do v2par_laje_r3, modo original: a V4
// para no DESDIM ("Continuo com o processamento" com o padrão N). Pelo editor da viga, a
// resposta S faz a V4 seguir; cargas e seção T entram e voltam no desfazer. Prints em
// 1366×768 em e2e/prints/editores.

const PASTA = path.resolve(process.cwd(), "e2e/prints/editores");
const FIXTURE = path.resolve(process.cwd(), "e2e/fixtures/laje-r3-original.openstrut.json");

test.beforeAll(() => fs.mkdirSync(PASTA, { recursive: true }));

async function foto(page: Page, nome: string) {
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), animations: "disabled" });
}

/** Abre a fixture pela tela inicial (sem o seletor nativo de arquivo). */
async function abrirFixture(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(FIXTURE);
  await expect(page.getByRole("heading", { name: "Laje R3 original" })).toBeVisible();
}

/** Seleciona o elemento `nome` percorrendo a planta com as setas (laje → viga → pilar). */
async function selecionar(page: Page, nome: string) {
  const svg = page.getByRole("application", { name: "Planta do pavimento" });
  const painel = page.getByRole("complementary", { name: "Propriedades" });
  await svg.focus();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("ArrowRight");
    const campo = painel.getByRole("textbox", { name: "Nome" });
    if ((await campo.count()) > 0 && (await campo.inputValue()) === nome) return painel;
  }
  throw new Error(`${nome} não foi selecionado pelas setas`);
}

test("editor da viga: Continuo com o processamento, cargas e seção T", async ({ page }) => {
  test.setTimeout(120_000);
  await abrirFixture(page);

  // antes: a V4 para no DESDIM e tem a marca do motor
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  const marcas = resultados.getByRole("region", { name: /Marcas do motor SISTRUT/ });
  await expect(marcas.getByText(/parou em "Continuo com o processamento/)).toBeVisible();

  await page.getByRole("tab", { name: "Planta", exact: true }).click();
  const painel = await selecionar(page, "V4");
  await expect(painel.getByText("sem dados do SISTRUT (valem os da planta)")).toBeVisible();
  await painel.getByRole("button", { name: "Dados do SISTRUT da viga…" }).click();
  const dialogo = page.getByRole("dialog", { name: "Viga V4: entrada do VIGA e do DESENHO" });
  await expect(dialogo).toBeVisible();
  await foto(page, "01-viga-cargas-vazio");

  // Rodada: o campo do modo original vem marcado como tal
  await dialogo.getByRole("tab", { name: "Rodada" }).click();
  const continua = dialogo.getByRole("combobox", {
    name: "Continuar mesmo acima do limite só no modo original",
  });
  await expect(continua).toHaveValue("padrao");
  await continua.selectOption("sim");
  await foto(page, "02-viga-rodada");

  // Cargas: uma distribuída e uma concentrada no trecho 0
  await dialogo.getByRole("tab", { name: "Cargas" }).click();
  await dialogo.getByRole("button", { name: "Acrescentar em Cargas distribuídas" }).click();
  await dialogo.getByRole("textbox", { name: "Carga distribuída 1, Fim" }).fill("6");
  await dialogo.getByRole("textbox", { name: "Carga distribuída 1, Total" }).fill("5");
  await dialogo.getByRole("button", { name: "Acrescentar em Cargas concentradas" }).click();
  await dialogo.getByRole("textbox", { name: "Carga concentrada 1, Posição" }).fill("3");
  await dialogo.getByRole("textbox", { name: "Carga concentrada 1, Total" }).fill("abc");

  // Aplicar com um número inválido: a mensagem diz o campo e o diálogo fica aberto
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo.getByRole("alert")).toContainText(
    "Carga concentrada 1, total: informe um número.",
  );
  await foto(page, "03-viga-cargas-erro");
  await dialogo.getByRole("textbox", { name: "Carga concentrada 1, Total" }).fill("10");

  // Seção T no trecho 0
  await dialogo.getByRole("tab", { name: "Seções e fôrma" }).click();
  await dialogo.getByRole("checkbox", { name: /Dar a seção de cada trecho/ }).check();
  await dialogo.getByRole("textbox", { name: /^Trecho 0: .*, Mesa bf$/ }).fill("60");
  await dialogo.getByRole("textbox", { name: /^Trecho 0: .*, Mesa hf$/ }).fill("10");
  await foto(page, "04-viga-secao-t");

  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(painel.getByText("2 cargas · seção T · continua acima do limite")).toBeVisible();

  // depois: a V4 segue (sem a marca de viga interrompida)
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await expect(resultados.getByText(/parou em "Continuo com o processamento/)).toHaveCount(0);

  // desfazer volta tudo numa vez só
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(resultados.getByText(/parou em "Continuo com o processamento/)).toBeVisible();
});

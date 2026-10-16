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

test("editores de pilar, laje e pavimento: seção circular, polígono e carga de ocupação", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await abrirFixture(page);

  // Pilar P1 circular de 30 cm: b e h viram a caixa da seção
  let painel = await selecionar(page, "P1");
  await painel.getByRole("button", { name: "Dados do SISTRUT do pilar…" }).click();
  let dialogo = page.getByRole("dialog", { name: /^Pilar P1: / });
  await dialogo.getByRole("combobox", { name: "Tipo da seção" }).selectOption("circular");
  await dialogo.getByRole("textbox", { name: "Diâmetro D (cm)" }).fill("30");
  await foto(page, "05-pilar-secao-circular");
  await dialogo.getByRole("tab", { name: "Cargas" }).click();
  await dialogo.getByRole("checkbox", { name: /Dar o vento/ }).check();
  await dialogo.getByRole("textbox", { name: "Vento, normal (kN)" }).fill("12");
  await foto(page, "06-pilar-cargas");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(painel.getByRole("textbox", { name: /^b / })).toHaveValue("30");

  // Laje L1: veio do .LAJ com o polígono gravado; a aba mostra vértices e dados por lado
  painel = await selecionar(page, "L1");
  await painel.getByRole("button", { name: "Dados do SISTRUT da laje…" }).click();
  dialogo = page.getByRole("dialog", { name: /^Laje L1: / });
  await foto(page, "07-laje-tipo");
  await dialogo.getByRole("tab", { name: "Polígono e lados" }).click();
  await expect(dialogo.getByRole("button", { name: /Remover o polígono/ })).toBeVisible();
  await foto(page, "08-laje-poligono");
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();

  // Pavimento: a obra veio do .LAJ com 1 carga de ocupação, que passa ao contorno da L2
  await page.keyboard.press("Escape");
  painel = page.getByRole("complementary", { name: "Propriedades" });
  await expect(painel.getByText(/1 carga de ocupação/)).toBeVisible();
  await painel.getByRole("button", { name: "Cargas e continuidades do pavimento…" }).click();
  dialogo = page.getByRole("dialog", { name: /^Pavimento PAV1: / });
  const grupo = dialogo.getByRole("group", { name: "Carga de ocupação 1" });
  await grupo
    .getByRole("combobox", { name: "Carga de ocupação 1, laje para preencher os vértices" })
    .selectOption({ label: "L2" });
  await grupo.getByRole("button", { name: "Usar o contorno da laje" }).click();
  await grupo.getByRole("textbox", { name: /Total/ }).fill("3");
  await foto(page, "09-pavimento-carga-ocupacao");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(painel.getByText(/1 carga de ocupação/)).toBeVisible();
});

test("editor de parâmetros: rodada, .LAP e .DSP com os campos do modo original marcados", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await abrirFixture(page);
  await page.getByRole("button", { name: "Parâmetros", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Parâmetros do SISTRUT (NB-1/78)" });
  await expect(dialogo).toBeVisible();
  await foto(page, "10-parametros-rodada");
  await dialogo.getByRole("tab", { name: "Lajes (.LAP)" }).click();
  await foto(page, "11-parametros-lap");
  await dialogo.getByRole("tab", { name: "Vigas (VIGA.INI e .DSP)" }).click();
  // fck do .DSP só vale no modo original: a marca entra no nome do campo
  await expect(dialogo.getByRole("textbox", { name: /^fck.*só no modo original/ })).toBeVisible();
  await foto(page, "12-parametros-dsp");
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();
});

test("aviso com opção: o botão da V4 liga 'Continuar mesmo acima do limite' e recalcula", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await abrirFixture(page);
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  const parou = resultados.getByText(/parou em "Continuo com o processamento/);
  await expect(parou).toBeVisible();
  const botao = resultados.getByRole("button", { name: "Continuar mesmo acima do limite (V4)" });
  await botao.scrollIntoViewIfNeeded();
  await foto(page, "13-aviso-com-opcao");
  await botao.click();
  // a V4 segue: sem a marca e sem o botão
  await expect(parou).toHaveCount(0);
  await expect(botao).toHaveCount(0);
  // a opção ficou na viga (editor) e o desfazer volta numa entrada só
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(parou).toBeVisible();
});

test("arquivo da versão 2: a tela da obra avisa a versão de origem e a gravação na atual", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // a obra do R3 como a versão 2 a gravaria: sem classeAco nem Laje.mu (a migração põe A e 1)
  const v2 = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as {
    versao: number;
    nome: string;
    materiais: Record<string, unknown>;
    pavimentos: { lajes: Record<string, unknown>[] }[];
  };
  v2.versao = 2;
  v2.nome = "Obra antiga";
  delete v2.materiais.classeAco;
  for (const p of v2.pavimentos) for (const l of p.lajes) delete l.mu;
  const arquivo = path.join(PASTA, "obra-antiga.openstrut.json");
  fs.writeFileSync(arquivo, JSON.stringify(v2));

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
  await escolha.setFiles(arquivo);
  await expect(page.getByRole("heading", { name: "Obra antiga" })).toBeVisible();
  const aviso = page.getByRole("status").filter({ hasText: "era da versão 2 do formato da obra" });
  await expect(aviso).toContainText("Ao salvar, ele será gravado na versão 3");
  await foto(page, "14-arquivo-migrado");
  await aviso.getByRole("button", { name: "Fechar aviso de versão" }).click();
  await expect(aviso).toHaveCount(0);
});

test("resumo de aço: cada linha diz o que o aço é (estimativa, incompleta)", async ({ page }) => {
  test.setTimeout(60_000);
  await abrirFixture(page);
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  const titulo = resultados.getByRole("heading", { level: 3, name: "Total da obra" });
  await titulo.scrollIntoViewIfNeeded();
  const tabela = titulo.locator("xpath=../following-sibling::*[1]");
  await expect(tabela.getByRole("row").last()).toContainText("estimativa");
  await foto(page, "15-resumo-aco");
});

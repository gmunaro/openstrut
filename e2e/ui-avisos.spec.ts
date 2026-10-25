import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Lista de avisos organizada (src/telas/resultados/classificaAvisos.ts) na obra sintética
// "paradas" (e2e/fixtures/ui-resultados/gerar-obra.ts): níveis de severidade com contagem,
// grupo grande com o resumo à vista e os textos que abrem pelo teclado, selo de origem,
// relatório impresso com os textos recolhidos na tela e o celular de 360 px sem rolagem
// de lado. Prints e PDF em e2e/prints/ui-avisos.

const OBRA = path.resolve("e2e/fixtures/ui-resultados/obra-paradas-original.openstrut.json");
const PASTA = path.resolve("e2e/prints/ui-avisos");
// a ancoragem que não cabe no apoio extremo ganha grampo pela NB-1/78, como o SISTRUT
// (aviso informativo, no nível "Informativos", recolhido)
const ANCORAGEM = /ancoragem no apoio 1 com grampo/;

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** Sem os seletores nativos de arquivo: o app cai no <input type=file>. */
async function abrirObra(page: Page) {
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
  await expect(page).toHaveURL(/\/obra$/);
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  const painel = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(painel).toBeVisible();
  return painel;
}

/** Texto do PDF (pdftotext), com os espaços normalizados. */
const textoDoPdf = (arquivo: string) =>
  execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", arquivo, "-"], { encoding: "utf8" })
    .replace(/\s+/g, " ")
    .trim();

test("desktop: severidades, grupo recolhido que abre pelo teclado, selo e relatório completo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const painel = await abrirObra(page);

  // a lista de avisos e a das marcas do motor têm cada uma os seus níveis
  await expect(
    painel.getByRole("heading", { name: /^Erros que impedem o cálculo \(\d+\)$/ }).first(),
  ).toBeVisible();
  await expect(
    painel.getByRole("heading", { name: /^Atenção de engenharia \(\d+\)$/ }).first(),
  ).toBeVisible();
  await expect(
    painel.getByText(/^verificação (?:extra|de detalhamento) da V2$/).first(),
  ).toBeVisible();

  // o nível "Informativos" começa recolhido; aberto, o grupo da ancoragem com grampo
  // (muitos avisos) mostra o resumo e esconde os textos
  const informativos = painel.getByRole("button", { name: /^Informativos \(\d+\)$/ }).first();
  await expect(informativos).toHaveAttribute("aria-expanded", "false");
  await informativos.click();
  const grupo = painel.locator("li", { hasText: "Ancoragem com grampo" }).first();
  await expect(grupo.getByText(/^Pavimento 1 V1 \(apoios? [\d, e]+\)/)).toBeVisible();
  const texto = grupo.getByText(ANCORAGEM).first();
  await expect(texto).toBeHidden();
  // o nome do botão muda ao abrir ("Ver os N textos" → "Ocultar os textos")
  const ver = grupo.getByRole("button", { name: /^(Ver os \d+ textos|Ocultar os textos)$/ });
  await expect(ver).toHaveText(/^Ver os \d+ textos$/);
  await expect(ver).toHaveAttribute("aria-expanded", "false");
  await ver.focus();
  await page.keyboard.press("Enter");
  await expect(ver).toHaveAttribute("aria-expanded", "true");
  await expect(ver).toHaveText("Ocultar os textos");
  await expect(texto).toBeVisible();
  await grupo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PASTA, "1366-resultados.png") });

  // no papel, os textos recolhidos na tela saem inteiros
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  const relatorio = page.getByRole("tabpanel", { name: "Relatório" });
  await expect(
    relatorio.getByRole("heading", { name: /^Atenção de engenharia/ }).first(),
  ).toBeVisible();
  const pdf = path.join(PASTA, "relatorio.pdf");
  await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
  const papel = textoDoPdf(pdf);
  expect(papel).toMatch(/Atenção de engenharia \(\d+\)/);
  expect(papel).toMatch(ANCORAGEM);
  expect(papel).not.toMatch(/Ver os \d+ textos/);
});

test.describe("celular 360 px", () => {
  test.use({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
    isMobile: true,
  });

  test("sem rolagem de lado com tudo aberto, e botões com alvo de toque", async ({ page }) => {
    test.setTimeout(120_000);
    const painel = await abrirObra(page);
    // abre um por um os grupos e níveis recolhidos; cada botão tem o alvo de toque de 44 px
    const fechados = painel.getByRole("button", {
      name: /^(Ver os \d+ textos|Informativos \(\d+\))$/,
      expanded: false,
    });
    expect(await fechados.count()).toBeGreaterThan(0);
    while ((await fechados.count()) > 0) {
      const b = fechados.first();
      const caixa = await b.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(43.5);
      await b.tap();
    }
    await expect(painel.getByText(ANCORAGEM).first()).toBeVisible();
    // nenhuma lista de avisos passa da largura da tela nem rola de lado (o resto da aba é
    // conferido em responsivo.spec.ts)
    const largos = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="lista-avisos"]')].flatMap((lista) =>
        [lista, ...lista.querySelectorAll("*")]
          .filter(
            (el) =>
              el.getBoundingClientRect().right > window.innerWidth + 0.5 ||
              el.scrollWidth > el.clientWidth + 0.5,
          )
          .map((el) => `${el.tagName} ${(el.textContent ?? "").slice(0, 60)}`),
      ),
    );
    expect(await page.locator('[data-slot="lista-avisos"]').count()).toBeGreaterThan(0);
    expect(largos).toEqual([]);
    await painel.getByText(ANCORAGEM).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(PASTA, "360-resultados.png") });
  });
});

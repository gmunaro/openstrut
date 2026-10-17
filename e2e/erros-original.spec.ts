// Painel "Erros do SISTRUT original encontrados nesta obra" na aba Resultados e no
// relatório, com a obra sintética da transição (e2e/fixtures/transicao-original:
// o PB de cima nasce na V1 de baixo com a carga dele concentrada; conta à mão em
// src/calculo/sistrut/__e2e__/obraTransicao.ts: 10 t pela coluna + 10,25 t pela viga).
// No celular (360 px) e no desktop: o painel cabe na tela (só a tabela rola de lado, no
// contêiner dela), a marca no pilar leva à explicação e o relatório traz a seção.
// Prints em e2e/prints/erros-original.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const OBRA = path.resolve("e2e/fixtures/transicao-original.openstrut.json");
const PASTA = path.resolve("e2e/prints/erros-original");

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

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
}

/** Largura que sobra além da visível: no documento e no elemento. */
const sobra = (page: Page, seletor: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return {
      documento: document.documentElement.scrollWidth - window.innerWidth,
      painel: el ? el.scrollWidth - el.clientWidth : -1,
    };
  }, seletor);

for (const tela of [
  { nome: "celular", width: 360, height: 800 },
  { nome: "desktop", width: 1366, height: 900 },
]) {
  test.describe(tela.nome, () => {
    test.use({ viewport: { width: tela.width, height: tela.height } });

    test("o painel explica o P-b com os números, cabe na tela e a marca leva a ele", async ({
      page,
    }) => {
      await abrirObra(page);
      await page.getByRole("tab", { name: "Resultados" }).click();
      const resultados = page.getByRole("tabpanel", { name: "Resultados" });
      const painel = resultados.getByRole("region", {
        name: /Erros do SISTRUT original encontrados nesta obra/,
      });
      await expect(painel).toBeVisible();
      const pb = painel.getByRole("article", { name: /Carga em dobro na fundação/ });
      await expect(pb).toContainText("O que acontecia no SISTRUT");
      await expect(pb).toContainText("20,25 t");
      await expect(pb).toContainText("10,25 t (10,00 t a menos)");
      await expect(pb).toContainText("a favor da segurança");
      await expect(pb).toContainText("Modo ativo: Como o SISTRUT original.");

      expect(await sobra(page, '[aria-labelledby="erros-original"]')).toEqual({
        documento: 0,
        painel: 0,
      });
      await pb.screenshot({ path: path.join(PASTA, `${tela.nome}-P-b.png`) });

      const marca = resultados.getByRole("link", { name: /PB: erro do SISTRUT original P-b/ });
      await marca.first().click();
      await expect(page).toHaveURL(/#erro-original-P-b$/);

      await page.getByRole("tab", { name: "Relatório", exact: true }).click();
      const relatorio = page.getByRole("tabpanel", { name: "Relatório" });
      await expect(
        relatorio.getByRole("region", { name: /Erros do SISTRUT original encontrados/ }),
      ).toContainText("20,25 t");
    });
  });
}

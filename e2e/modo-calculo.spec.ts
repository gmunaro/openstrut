import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Modo de cálculo (docs/MODO-CALCULO.md) numa obra NB-1/78: a FLUXO da V1, com duas
// lajes e o bordo comum engastado. O switch do diálogo de materiais liga o modo
// "como o SISTRUT original", que conta a negativa do bordo comum nas duas lajes:
// o aço das lajes cresce, aparece o selo nos resultados e o modo no
// relatório. Desligar volta ao valor corrigido. Os prints saem em e2e/prints/modo.

const PASTA = path.resolve(process.cwd(), "e2e/prints/modo");
const PASTA_V1 = path.resolve(process.cwd(), "src/armazenamento/__fixtures__/v1");

const lerNumeroBr = (t: string) => Number(t.trim().replace(/\./g, "").replace(",", "."));

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** Aço (kg) da linha Lajes da tabela "Total da obra" da aba Resultados. */
async function acoLajes(resultados: Locator) {
  const tabela = resultados
    .getByRole("heading", { level: 3, name: "Total da obra" })
    .locator("xpath=../following-sibling::*[1]");
  // o `has` é resolvido dentro de cada linha, então parte do page, não da tabela
  const lajes = resultados.page().getByRole("cell", { name: "Lajes", exact: true });
  const linha = tabela.getByRole("row").filter({ has: lajes });
  return lerNumeroBr(await linha.getByRole("cell").nth(3).innerText());
}

/** Abre o diálogo de materiais, alterna o switch pelo teclado e aplica. */
async function alternarModo(page: Page, esperado: "true" | "false") {
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
  const sw = dialogo.getByRole("switch", { name: "Modo de cálculo Como o SISTRUT original" });
  await sw.focus();
  await page.keyboard.press("Space");
  await expect(sw).toHaveAttribute("aria-checked", esperado);
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();
}

test("alternar o modo numa obra NB-1/78 muda o aço das lajes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page
    .locator('input[aria-label="Arquivos da V1 (.LAJ, .VIG, .COL)"]')
    .setInputFiles([
      path.join(PASTA_V1, "FLUXO.LAJ"),
      path.join(PASTA_V1, "FLUXO.VIG"),
      path.join(PASTA_V1, "FLUXO.COL"),
    ]);
  await page
    .getByRole("region", { name: "Avisos da importação" })
    .getByRole("button", { name: "Abrir obra importada" })
    .click();
  await expect(page.getByRole("heading", { name: "FLUXO" })).toBeVisible();
  await expect(page.getByText("NB-1/78", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Resultados" }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  const corrigido = await acoLajes(resultados);
  expect(corrigido).toBeGreaterThan(0);
  await expect(resultados.getByText("Modo: como o SISTRUT original")).toHaveCount(0);

  // a dica abre com o foco do teclado no botão "i"
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
  await dialogo.getByRole("button", { name: "O que muda com o modo de cálculo" }).focus();
  await expect(page.getByRole("tooltip")).toContainText("número a número");
  await expect(page.getByRole("tooltip")).toContainText("inclusive os defeitos");
  await page.screenshot({ path: path.join(PASTA, "01-dica-do-modo.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await expect(dialogo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();

  await alternarModo(page, "true");
  await expect(resultados.getByText("Modo: como o SISTRUT original")).toBeVisible();
  // as vigas saem do DESINIT; lajes e pilares pela regra da V2 (não existe no SISTRUT)
  await expect(resultados.getByRole("note")).toContainText("DESINIT");
  await page.screenshot({ path: path.join(PASTA, "02-resultados-original.png"), fullPage: true });

  await page.getByRole("tab", { name: "Relatório" }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Relatório" })
      .getByText(/^Modo de cálculo: Como o SISTRUT original/),
  ).toBeVisible();

  await alternarModo(page, "false");
  await page.getByRole("tab", { name: "Resultados" }).click();
  expect(await acoLajes(resultados)).toBe(corrigido);
  await expect(resultados.getByText("Modo: como o SISTRUT original")).toHaveCount(0);
});

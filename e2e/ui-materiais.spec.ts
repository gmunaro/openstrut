import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";
import type { Obra } from "../src/dominio/obra";

// Materiais, modo de cálculo e tela da obra numa grade 2x2: 4 lajes de 4 x 5 m e os
// pilares nos nós (9). A obra é montada com as funções de domínio, salva em texto e
// aberta pelo botão de arquivo da tela inicial. Cobre a troca do modo nos dois sentidos
// (selo, relatório e volta ao corrigido), o cálculo nos dois modos e a NBR 6118 (switch
// desabilitado com aviso; reabilita ao voltar para NB-1/78).
// Os prints saem em e2e/prints/ui-materiais.

const PASTA = path.resolve(process.cwd(), "e2e/prints/ui-materiais");
const SELO_ORIGINAL = "Modo: como o SISTRUT original";
const AVISO_NORMA = "O modo de cálculo só se aplica à NB-1/78.";

const lerNumeroBr = (t: string) => Number(t.trim().replace(/\./g, "").replace(",", "."));

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

async function foto(page: Page, nome: string) {
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), fullPage: true });
}

// Os seletores nativos do Chrome abrem janela do sistema, fora do alcance do Playwright.
async function semFileSystemAccess(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
}

/** Escolhe um arquivo em memória pelo botão "Abrir" da tela inicial. */
async function abrirArquivoNoInicio(
  page: Page,
  arquivo: { name: string; mimeType: string; buffer: Buffer },
) {
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(arquivo);
}

/** Aço (kg) da linha Lajes da tabela "Total da obra" da aba Resultados. */
async function acoLajes(resultados: Locator) {
  const tabela = resultados
    .getByRole("heading", { level: 3, name: "Total da obra" })
    .locator("xpath=../following-sibling::*[1]");
  const lajes = resultados.page().getByRole("cell", { name: "Lajes", exact: true });
  const linha = tabela.getByRole("row").filter({ has: lajes });
  return lerNumeroBr(await linha.getByRole("cell").nth(3).innerText());
}

/** Abre o diálogo de materiais, alterna o switch do modo pelo teclado e aplica. */
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

/** Grade 2x2 de lajes 4 x 5 m com os pilares gerados nos nós (3 x 3 = 9). */
function obraGrade(): Obra {
  const posicoes = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 5 },
    { x: 4, y: 5 },
  ];
  const pavimento = posicoes.reduce(
    (pav, p) => ({ ...pav, lajes: [...pav.lajes, lajeNova(pav, { ...p, lx: 4, ly: 5 })] }),
    pavimentoNovo("Tipo"),
  );
  return { ...obraNova("Grade 2x2", "nb1-78"), pavimentos: [gerarEstrutura(pavimento)] };
}

async function abrirGrade(page: Page) {
  await page.goto("/");
  await abrirArquivoNoInicio(page, {
    name: "Grade 2x2.openstrut.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializarObra(obraGrade())),
  });
  await expect(page.getByRole("heading", { name: "Grade 2x2" })).toBeVisible();
}

test("troca o modo nos dois sentidos, mostra o selo e calcula nos dois", async ({ page }) => {
  test.setTimeout(120_000);
  expect(obraGrade().pavimentos[0]!.pilares).toHaveLength(9);
  await semFileSystemAccess(page);
  await abrirGrade(page);

  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  await page.getByRole("tab", { name: "Resultados" }).click();
  const corrigido = await acoLajes(resultados);
  expect(corrigido).toBeGreaterThan(0);
  await expect(resultados.getByText(SELO_ORIGINAL)).toHaveCount(0);
  await foto(page, "01-corrigido");

  await alternarModo(page, "true");
  await expect(resultados.getByText(SELO_ORIGINAL)).toBeVisible();
  const original = await acoLajes(resultados);
  // nesta grade o total em kg não muda: a positiva fica no mínimo nos dois modos e a
  // negativa sobe ~1 % no original (As 2,15 contra 2,13 cm²/m), abaixo do arredondamento
  expect(original).toBe(corrigido);
  await foto(page, "02-original");

  await page.getByRole("tab", { name: "Relatório" }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Relatório" })
      .getByText(/^Modo de cálculo: Como o SISTRUT original/),
  ).toBeVisible();

  await alternarModo(page, "false");
  await page.getByRole("tab", { name: "Resultados" }).click();
  expect(await acoLajes(resultados)).toBe(corrigido);
  await expect(resultados.getByText(SELO_ORIGINAL)).toHaveCount(0);
});

test("NBR 6118: switch do modo desabilitado com aviso, e volta a habilitar em NB-1/78", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await semFileSystemAccess(page);
  await abrirGrade(page);

  // o modo original ligado precisa sobreviver à troca de norma
  await alternarModo(page, "true");

  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
  const sw = dialogo.getByRole("switch", { name: "Modo de cálculo Como o SISTRUT original" });
  await dialogo.locator("#mat-norma").click();
  await page.getByRole("option", { name: "NBR 6118:2023", exact: true }).click();
  await expect(sw).toBeDisabled();
  await expect(dialogo.getByText(AVISO_NORMA)).toBeVisible();
  await expect(sw).toHaveAccessibleDescription(new RegExp(AVISO_NORMA.replace(/[.]/g, "\\.")));
  await foto(page, "03-nbr6118-switch-desabilitado");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();

  // reabrindo: a norma ficou e o modo continua ligado, só desabilitado
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(sw).toBeDisabled();
  await expect(dialogo.getByText(AVISO_NORMA)).toBeVisible();

  await dialogo.locator("#mat-norma").click();
  await page.getByRole("option", { name: "NB-1/78", exact: true }).click();
  await expect(sw).toBeEnabled();
  await expect(dialogo.getByText(AVISO_NORMA)).toHaveCount(0);
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();

  // voltando a NB-1/78 o modo ligado vale de novo nos resultados
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Resultados" }).getByText(SELO_ORIGINAL),
  ).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Polimento no navegador de verdade: obra-exemplo, Medir, atalhos (?), filtro e cópia da
// tabela (clipboard do Chrome), foco visível por teclado e tema claro. Prints em
// e2e/prints/polimento/e2e.
const PASTA = path.resolve(process.cwd(), "e2e/prints/polimento/e2e");

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

async function abrirExemplo(page: Page, norma: "NBR 6118:2023" | "NB-1/78" = "NBR 6118:2023") {
  await page.goto("/");
  await page.getByRole("button", { name: `Exemplo ${norma}` }).click();
  await expect(page.getByRole("heading", { name: "Sobrado exemplo" })).toBeVisible();
  return page.getByRole("application", { name: "Planta do pavimento" });
}

test("obra-exemplo abre calculada, com planta colorida e resultados", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  const svg = await abrirExemplo(page);
  // lajes coloridas pela situação do cálculo (a legenda só aparece com resultado)
  await expect(page.getByText("sem avisos", { exact: true })).toBeVisible();
  await expect(svg.getByText("4,00 × 4,50 m", { exact: true })).toHaveCount(4);
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.getByText(/Calculado pela NBR 6118:2023/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pilares por nível" })).toBeVisible();
  await page.screenshot({ path: path.join(PASTA, "exemplo-resultados.png") });
  expect(erros).toEqual([]);
});

test("Medir dá a distância entre dois pontos e ? lista os atalhos", async ({ page }) => {
  const svg = await abrirExemplo(page);
  await page.getByRole("button", { name: "Fechar a dica \"Como desenhar a planta\"" }).click();
  await svg.focus();
  await page.keyboard.press("m");
  const caixa = await svg.boundingBox();
  if (!caixa) throw new Error("planta sem caixa");
  await page.mouse.click(caixa.x + caixa.width * 0.3, caixa.y + caixa.height * 0.5);
  await page.mouse.click(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.5);
  const medida = page.getByText(/^d = \d+,\d{2} m/);
  await expect(medida).toBeVisible();
  // na horizontal: Δy = 0
  await expect(medida).toContainText("Δy = 0,00 m");
  await page.screenshot({ path: path.join(PASTA, "medir.png") });

  await page.keyboard.press("Escape");
  await expect(medida).toBeHidden();
  await svg.focus();
  await page.keyboard.press("?");
  const dialogo = page.getByRole("dialog", { name: "Atalhos da planta" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText("Medir: clique em dois pontos")).toBeVisible();
  await page.screenshot({ path: path.join(PASTA, "atalhos.png") });
});

test("filtro e cópia da tabela de pilares para o Excel", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await abrirExemplo(page);
  await page.getByRole("tab", { name: "Resultados" }).click();
  await page.getByPlaceholder(/Filtrar/).fill("P1");
  await expect(page.getByRole("heading", { name: "Lajes: esforços" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copiar a tabela Pilares por nível" }).click();
  await expect(page.getByText("Copiada", { exact: true })).toBeVisible();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  const linhas = texto.split("\n");
  expect(linhas[0]).toMatch(/^Pilar\tb × h \(cm\)\tNk \(kN\)/);
  // dois níveis (Cobertura e Piso superior), uma linha de P1 em cada
  expect(linhas.filter((l) => l.startsWith("P1\t"))).toHaveLength(2);
  expect(linhas.some((l) => l.startsWith("P2\t"))).toBe(false);
  await page.screenshot({ path: path.join(PASTA, "filtro-p1.png") });
});

test("foco por teclado aparece no SVG da planta e no painel da aba", async ({ page }) => {
  const svg = await abrirExemplo(page);
  await svg.focus();
  // foco por teclado (focus-visible): Tab de volta e para frente
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const contorno = await svg.evaluate((el) => {
    const s = getComputedStyle(el);
    return { estilo: s.outlineStyle, largura: s.outlineWidth };
  });
  expect(contorno.estilo).toBe("solid");
  expect(contorno.largura).toBe("2px");

  await page.getByRole("tab", { name: "Resultados" }).focus();
  await page.keyboard.press("Tab");
  const painel = page.getByRole("tabpanel");
  await expect(painel).toBeFocused();
  const anel = await painel.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(anel).not.toBe("none");
});

test("tema claro: a tela clareia e a planta continua escura", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tema claro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // fundo claro: oklch(1 0 0) = branco
  expect(fundo).toMatch(/oklch\(1 0 0\)|rgb\(255, 255, 255\)/);
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "Exemplo NB-1/78" }).click();
  const area = page.getByRole("application", { name: "Planta do pavimento" }).locator("..");
  const fundoPlanta = await area.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fundoPlanta).not.toMatch(/oklch\(1 0 0\)|rgb\(255, 255, 255\)/);
  await page.screenshot({ path: path.join(PASTA, "tema-claro-planta.png") });
});

test("impressão: color-scheme claro mesmo com o tema escuro", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ media: "print" });
  const esquema = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(esquema).toBe("light");
});

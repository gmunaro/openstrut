import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { itemExportar } from "./cabecalho";

// Cabeçalho da tela da obra no desktop: numa linha só a 1280×720 e a 1366×768, nas duas
// normas (a NB-1/78 tem o botão Parâmetros a mais). Quando ele quebra em duas linhas a
// planta encolhe e os cliques por posição erram o elemento.
// Os prints saem em e2e/prints/cabecalho.

const PASTA = path.resolve(process.cwd(), "e2e/prints/cabecalho");
// nome comprido de propósito: é o título que disputa espaço com os botões
const NOME_OBRA = "Residencial Jardim das Acácias - Bloco B";

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

async function criarObra(page: Page, norma: "NB-1/78" | "NBR 6118:2023") {
  await page.goto("/");
  await page.getByLabel("Nome", { exact: true }).fill(NOME_OBRA);
  await page.getByRole("combobox", { name: "Norma" }).click();
  const opcao = norma === "NB-1/78" ? "NB-1/78 (NBR 6118:1978)" : norma;
  await page.getByRole("option", { name: opcao, exact: true }).click();
  await page.getByRole("button", { name: "Criar obra", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: NOME_OBRA })).toBeVisible();
}

for (const norma of ["NB-1/78", "NBR 6118:2023"] as const)
  for (const tela of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
  ])
    test(`cabeçalho em uma linha a ${tela.width}×${tela.height}, ${norma}`, async ({ page }) => {
      await page.setViewportSize(tela);
      await criarObra(page, norma);
      const cabecalho = page.locator("header", {
        has: page.getByRole("heading", { level: 1, name: NOME_OBRA }),
      });
      await expect(cabecalho.getByRole("button", { name: "Exportar", exact: true })).toBeVisible();
      await expect(cabecalho.getByRole("button", { name: /Parâmetros/ })).toHaveCount(
        norma === "NB-1/78" ? 1 : 0,
      );

      // uma linha: início, título, selos e todos os botões com o mesmo centro vertical
      const itens = cabecalho.locator("a, button, h1, [data-slot=badge]");
      const centros: { item: string; y: number }[] = [];
      for (const item of await itens.all()) {
        const b = await item.boundingBox();
        if (!b) continue;
        const nome = (await item.getAttribute("aria-label")) ?? (await item.innerText());
        centros.push({ item: nome.trim(), y: Math.round(b.y + b.height / 2) });
      }
      expect(centros.length).toBeGreaterThanOrEqual(10);
      const ys = centros.map((c) => c.y);
      // o h1 fica na metade de cima do bloco do título (o nome do arquivo vem embaixo)
      expect(Math.max(...ys) - Math.min(...ys), JSON.stringify(centros)).toBeLessThanOrEqual(10);
      // altura de uma linha (o bloco do título tem nome e arquivo) e nada passa da borda direita
      const caixa = await cabecalho.boundingBox();
      expect(caixa?.height ?? 0).toBeLessThan(64);
      const exportar = await cabecalho.getByRole("button", { name: "Exportar" }).boundingBox();
      expect((exportar?.x ?? 0) + (exportar?.width ?? 0)).toBeLessThanOrEqual(tela.width);

      const arquivo = `${norma === "NB-1/78" ? "nb178" : "6118"}-${tela.width}x${tela.height}`;
      await page.screenshot({ path: path.join(PASTA, `${arquivo}.png`), animations: "disabled" });

      // obra vazia: o menu mostra por que os DXF estão indisponíveis
      if (tela.width === 1366) {
        await expect(await itemExportar(page, "DXF de formas")).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        await page.screenshot({
          path: path.join(PASTA, `${arquivo}-menu-exportar.png`),
          animations: "disabled",
        });
      }
    });

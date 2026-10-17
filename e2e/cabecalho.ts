// Cabeçalho da tela da obra no desktop: as exportações (DXF de formas, DXF de armação e
// IFC) ficam no menu "Exportar".
import { expect, type Page } from "@playwright/test";

/**
 * Abre o menu "Exportar" (se fechado) e devolve o item `nome`. Logo depois de escolher
 * um item, o menu fechado continua visível na animação de saída: um item pego dele some
 * antes do clique, e um clique no botão nesse meio-tempo não reabre o menu. Por isso
 * decide pelo aria-expanded do botão e espera o menu antigo sumir antes de abrir.
 */
export async function itemExportar(page: Page, nome: "DXF de formas" | "DXF de armação" | "IFC") {
  const botao = page.getByRole("button", { name: "Exportar", exact: true });
  const menu = page.getByRole("menu", { name: "Exportar" });
  if ((await botao.getAttribute("aria-expanded")) !== "true") {
    await expect(menu).toBeHidden();
    await botao.click();
  }
  await expect(menu).toBeVisible();
  return menu.getByRole("menuitem", { name: nome, exact: true });
}

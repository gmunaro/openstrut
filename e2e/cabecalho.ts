// Cabeçalho da tela da obra no desktop: as exportações (DXF de formas, DXF de armação e
// IFC) ficam no menu "Exportar".
import type { Page } from "@playwright/test";

/** Abre o menu "Exportar" (se fechado) e devolve o item `nome`. */
export async function itemExportar(page: Page, nome: "DXF de formas" | "DXF de armação" | "IFC") {
  const menu = page.getByRole("menu", { name: "Exportar" });
  if (!(await menu.isVisible()))
    await page.getByRole("button", { name: "Exportar", exact: true }).click();
  return menu.getByRole("menuitem", { name: nome, exact: true });
}

// Obras de teste montadas pelo domínio e abertas pela tela inicial, para os specs que
// precisam de uma obra calculada sem desenhar a planta.
import { expect, type Page } from "@playwright/test";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";
import type { Obra } from "../src/dominio/obra";

/** Grade 2x2 de lajes 4 x 5 m, com vigas e pilares gerados. */
function obraGrade(): Obra {
  const pavimento = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 5 },
    { x: 4, y: 5 },
  ].reduce(
    (pav, p) => ({ ...pav, lajes: [...pav.lajes, lajeNova(pav, { ...p, lx: 4, ly: 5 })] }),
    pavimentoNovo("Tipo"),
  );
  return { ...obraNova("Grade 2x2", "nb1-78"), pavimentos: [gerarEstrutura(pavimento)] };
}

/** Abre a grade 2x2 (NB-1/78) pelo botão de abrir arquivo da tela inicial. */
export async function abrirGrade(page: Page) {
  // os seletores nativos do Chrome abrem janela do sistema, fora do alcance do Playwright
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles({
    name: "Grade 2x2.openstrut.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializarObra(obraGrade())),
  });
  await expect(page.getByRole("heading", { name: "Grade 2x2" })).toBeVisible();
}

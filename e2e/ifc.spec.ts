import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Exportação IFC pela tela: importa a obra E2E do SISTRUT (fixtures reais em
// src/telas/__fixtures__/sistrut), clica em "Exportar IFC" e confere o arquivo baixado
// (IFC4, pilares, vigas, lajes e barras da obra calculada). Confere também que o código
// da exportação só é baixado no clique (chunk sob demanda) e o botão no menu do celular.
// Qualquer erro no console da página reprova o teste.

const PASTA = path.resolve(process.cwd(), "e2e/prints/ifc");
const FIXTURES = path.resolve(process.cwd(), "src/telas/__fixtures__/sistrut");
const OBRA_SISTRUT = [
  "E2E.LAJ",
  "E2E.VIG",
  "E2E.SEC",
  "SISTRUT.DSP",
  "E2E.COL",
  "SISTRUT.PIP",
  "E2E.REP",
  "E2E.RLP",
].map((nome) => path.join(FIXTURES, nome));

fs.mkdirSync(PASTA, { recursive: true });

/** Registra erros do console e exceções da página; o teste confere a lista no fim. */
function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") erros.push(msg.text());
  });
  page.on("pageerror", (err) => erros.push(err.message));
  return erros;
}

/** Importa a obra E2E do SISTRUT e abre a tela da obra. */
async function abrirObraE2E(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)")
    .setInputFiles(OBRA_SISTRUT);
  const resumo = page.getByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
  await resumo.getByRole("button", { name: "Abrir obra importada" }).click();
  await expect(page.getByRole("heading", { name: "E2E" })).toBeVisible();
}

/** Lê o IFC baixado e confere o que a obra E2E tem que ter. */
async function conferirIfc(baixado: import("@playwright/test").Download) {
  expect(baixado.suggestedFilename()).toBe("E2E.ifc");
  const caminho = path.join(PASTA, baixado.suggestedFilename());
  await baixado.saveAs(caminho);
  const ifc = fs.readFileSync(caminho, "utf8");
  const contar = (entidade: string) => ifc.split(`=${entidade}(`).length - 1;
  expect(ifc.startsWith("ISO-10303-21;")).toBe(true);
  expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
  expect(contar("IFCBUILDINGSTOREY")).toBe(2); // fundação e E2E
  expect(contar("IFCCOLUMN")).toBe(9);
  expect(contar("IFCBEAM")).toBe(6);
  expect(contar("IFCSLAB")).toBe(4);
  expect(contar("IFCREINFORCINGBAR")).toBeGreaterThan(0);
}

test("Exportar IFC baixa o IFC4 da obra, com o código carregado só no clique", async ({ page }) => {
  const erros = vigiarErros(page);
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await abrirObraE2E(page);
  // o chunk da exportação (exportarIfc.ts) não vem com a tela da obra
  const chunkIfc = (u: string) => /\/exportarIfc-[^/]*\.js$/.test(u);
  expect(scripts.filter(chunkIfc)).toEqual([]);

  const [baixado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar IFC" }).click(),
  ]);
  await conferirIfc(baixado);
  expect(scripts.filter(chunkIfc)).toHaveLength(1);
  await page.screenshot({ path: path.join(PASTA, "01-exportado.png") });
  expect(erros).toEqual([]);
});

test("no celular, Exportar IFC fica no menu Mais ações", async ({ page }) => {
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirObraE2E(page);
  await page.getByRole("button", { name: "Mais ações" }).click();
  const [baixado] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar IFC" }).click(),
  ]);
  await conferirIfc(baixado);
  expect(erros).toEqual([]);
});

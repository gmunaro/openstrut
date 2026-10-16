import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Revisão de RESULTADOS (instância 3): abre obras de teste geradas fora do repo
// (C:/tmp/v2-paridade/ui-resultados/gerar-obra.ts), confere o selo do modo, o bloco de
// marcas do motor SISTRUT e o console. Prints e textos em e2e/prints/ui-resultados.
const PASTA = path.resolve(process.cwd(), "e2e/prints/ui-resultados");
const OBRAS = "C:/tmp/v2-paridade/ui-resultados";
const SELO = "Modo: como o SISTRUT original";

// `marcas`: trechos que o bloco de marcas do motor precisa mostrar nesse caso.
const CASOS: {
  nome: string;
  arquivo: string;
  selo: boolean;
  marcas: readonly string[];
}[] = [
  { nome: "corrigido", arquivo: "obra-corrigido.openstrut.json", selo: false, marcas: [] },
  { nome: "original", arquivo: "obra-original.openstrut.json", selo: true, marcas: [] },
  {
    nome: "marcas-original",
    arquivo: "obra-marcas-original.openstrut.json",
    selo: true,
    marcas: ["Caso 1/2: a busca do equilíbrio não converge"],
  },
  {
    // Geometria do r3, sobrecarga 25 kN/m2, relacaoNegPosMin 0,35 (modo original).
    nome: "paradas-original",
    arquivo: "obra-paradas-original.openstrut.json",
    selo: true,
    marcas: [
      "a otimização dos negativos não converge: no lado 3 a relação Mneg/Mpos passa a 0,35, mas o código do lado continua 5",
      'parou em "Continuo com o processamento desta Viga S/N" com o padrão N',
    ],
  },
];

const TELAS = [
  { largura: 1366, altura: 768 },
  { largura: 1920, altura: 1080 },
  { largura: 900, altura: 800 },
] as const;

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** Sem a API de arquivos do Chrome, o botão cai no input de arquivo (como no arquivos.spec). */
async function semFileSystemAccess(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
}

async function abrirObra(page: Page, arquivo: string) {
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(path.join(OBRAS, arquivo));
}

for (const caso of CASOS) {
  for (const tela of TELAS) {
    const id = `${caso.nome}-${tela.largura}`;
    test(`resultados ${id}`, async ({ page }) => {
      test.setTimeout(180_000);
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`);
      });
      page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
      await semFileSystemAccess(page);
      await page.setViewportSize({ width: tela.largura, height: tela.altura });
      await page.goto("/");
      await abrirObra(page, caso.arquivo);

      // Só teclado: a aba Resultados recebe foco e abre com Enter.
      await page.getByRole("tab", { name: "Resultados" }).focus();
      await page.keyboard.press("Enter");
      const painel = page.getByRole("tabpanel", { name: "Resultados" });
      await expect(painel).toBeVisible();

      const marcas = painel.getByRole("heading", { name: /Marcas do motor SISTRUT/ });
      await expect(marcas).toBeVisible();
      await expect(marcas).toContainText(
        caso.selo ? "como o SISTRUT original" : "(modo corrigido)",
      );
      if (caso.selo) await expect(painel.getByText(SELO)).toBeVisible();
      else await expect(painel.getByText(SELO)).toHaveCount(0);
      for (const trecho of caso.marcas)
        await expect(painel.getByText(trecho, { exact: false }).first()).toBeVisible();

      fs.writeFileSync(path.join(PASTA, `texto-${id}.txt`), await painel.innerText());
      await page.screenshot({
        path: path.join(PASTA, `${tela.largura}-${caso.nome}.png`),
        fullPage: true,
      });
      fs.writeFileSync(path.join(PASTA, `erros-${id}.txt`), erros.join("\n"));
      expect(erros, erros.join("\n")).toEqual([]);
    });
  }
}

// Revisão por seção: o painel rola por dentro, então a tela cheia não mostra o resto.
// Uma captura por título (lajes, vigas, pilares, memória, equilíbrio, detalhamento).
// Em 900 px o sufixo entra no nome do arquivo para não sobrescrever as de 1366.
async function revisarSecoes(page: Page, largura: number, altura: number, sufixo: string) {
  await semFileSystemAccess(page);
  await page.setViewportSize({ width: largura, height: altura });
  await page.goto("/");
  await abrirObra(page, "obra-paradas-original.openstrut.json");
  await page.getByRole("tab", { name: "Resultados" }).focus();
  await page.keyboard.press("Enter");
  const painel = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(painel).toBeVisible();

  const titulos = painel.getByRole("heading");
  const total = await titulos.count();
  const lista: string[] = [];
  for (let i = 0; i < total; i++) {
    const titulo = titulos.nth(i);
    const texto = (await titulo.innerText()).replace(/\s+/g, " ").trim();
    lista.push(`${i}: ${texto}`);
    await titulo.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({
      path: path.join(PASTA, `secao-${sufixo}${String(i).padStart(2, "0")}.png`),
    });
  }
  fs.writeFileSync(path.join(PASTA, `secoes-${largura}.txt`), lista.join("\n"));
}

test("resultados secoes paradas-original-1366", async ({ page }) => {
  test.setTimeout(180_000);
  await revisarSecoes(page, 1366, 768, "");
});

test("resultados secoes paradas-original-900", async ({ page }) => {
  test.setTimeout(180_000);
  await revisarSecoes(page, 900, 800, "900-");
});

test("resultados secoes paradas-original-1920", async ({ page }) => {
  test.setTimeout(180_000);
  await revisarSecoes(page, 1920, 1080, "1920-");
});

// Memória de cálculo: cada detalhamento traz um "Memória do detalhamento" fechado por
// padrão. Abre cada um com foco e Enter, tira uma captura por botão e grava o estado.
test("resultados memoria paradas-original-1366", async ({ page }) => {
  test.setTimeout(180_000);
  await semFileSystemAccess(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await abrirObra(page, "obra-paradas-original.openstrut.json");
  await page.getByRole("tab", { name: "Resultados" }).focus();
  await page.keyboard.press("Enter");
  const painel = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(painel).toBeVisible();

  const botoes = painel.locator("summary", { hasText: "Memória do detalhamento" });
  const total = await botoes.count();
  expect(total).toBeGreaterThan(0);
  const lista: string[] = [];
  for (let i = 0; i < total; i++) {
    const botao = botoes.nth(i);
    await botao.focus();
    await page.keyboard.press("Enter");
    const aberto = await botao.evaluate((el) => el.closest("details")?.hasAttribute("open"));
    lista.push(`${i}: aberto=${aberto}`);
    await botao.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(PASTA, `memoria-${String(i).padStart(2, "0")}.png`) });
  }
  fs.writeFileSync(path.join(PASTA, "memoria-1366.txt"), lista.join("\n"));
});

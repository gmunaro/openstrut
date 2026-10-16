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
      "otimização dos negativos parada no lado 3 (relação 0,35, código 5",
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

// Vista 3D, camada "Original × Corrigido" (src/telas/obra3d/comparar): numa obra do oráculo
// importada do SISTRUT, no modo "Como o SISTRUT original", liga a camada e confere as
// contagens, a lista de peças que diferem, a seleção pela lista, o filtro "esconder iguais",
// a tolerância e o desligar, sem erro no console. Num celular de 360×800 com toque, a
// legenda da comparação aparece ao rolar o painel. Rode com
// PORT=4424 bun x playwright test e2e/vista3d-comparar.spec.ts
// As fotos vão para e2e/prints/vista3d-comparar/.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { arquivo, colPredio, comNome, SO_BURACOS } from "../src/telas/__fixtures__/predioSistrut";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-comparar");
fs.mkdirSync(PRINTS, { recursive: true });

// WebGL por software no Chrome sem GPU (CI e headless)
test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

/** A obra E2E do oráculo em TER (só baldrame), TIPO e COB, com o .COL das cotas e uma
 *  viga avulsa (ESCADA.VIG) sem carga lançada no prédio. */
const PREDIO_ORACULO = [
  comNome("TER.LAJ", SO_BURACOS),
  comNome("TER.VIG", arquivo("E2E.VIG")),
  comNome("TER.SEC", arquivo("E2E.SEC")),
  ...["TIPO", "COB"].flatMap((b) => [
    comNome(`${b}.LAJ`, arquivo("E2E.LAJ")),
    comNome(`${b}.VIG`, arquivo("E2E.VIG")),
    comNome(`${b}.SEC`, arquivo("E2E.SEC")),
    comNome(`${b}.FOR`, arquivo("E2E.FOR")),
  ]),
  comNome(
    "PREDIO.COL",
    colPredio(
      [
        ["FUND", 0],
        ["TER", 0.4],
        ["TIPO", 3.4],
        ["COB", 6.4],
      ],
      9,
    ),
  ),
  arquivo("SISTRUT.DSP"),
  arquivo("SISTRUT.PIP"),
  comNome("ESCADA.VIG", arquivo("E2E.VIG")),
].map((a) => ({
  name: a.nome,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(a.dados),
}));

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

async function importarPredio(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)")
    .setInputFiles(PREDIO_ORACULO);
  await page.getByRole("button", { name: "Abrir obra importada" }).click();
  await expect(page).toHaveURL(/\/obra$/);
}

/** Espera dois quadros (a vista desenha no requestAnimationFrame). */
const quadros = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );

async function abrir3d(page: Page) {
  await page.getByRole("tab", { name: "3D" }).click();
  await expect(page.getByTestId("vista-3d")).toBeVisible();
  await page.waitForFunction(() => "__vista3d" in window);
  // animações de câmera e explodido terminam em < 1 s
  await page.waitForTimeout(800);
  await quadros(page);
}

/** Membros de window.__vista3d que este spec usa (o Cena3D tem mais). */
type VistaMin = {
  fontesAtivas(): { cores: string[]; filtros: string[]; legendas: string[] };
  selecao: string | null;
  estaVisivel(chave: string): boolean;
};

/** Roda `f` sobre window.__vista3d dentro da página e devolve o resultado. A função vai como
 *  texto, como o helper cena do vista3d.spec.ts. */
async function vista<T>(page: Page, f: (v: VistaMin) => T): Promise<T> {
  const resultado = await page.evaluate((fonte: string) => {
    const v = (window as unknown as { __vista3d: VistaMin }).__vista3d;
    const g = new Function("v", `return (${fonte})(v)`) as (v: VistaMin) => unknown;
    return g(v);
  }, f.toString());
  return resultado as T;
}

type Categoria = "maior" | "igual" | "menor" | "situacao";

/** As quatro contagens da legenda do painel, lidas dos testids (o número é o último span do li). */
async function contagens(page: Page) {
  const numero = async (c: Categoria) =>
    Number(await page.getByTestId(`comparar-contagem-${c}`).locator("span").last().textContent());
  const [maior, igual, menor, situacao] = await Promise.all([
    numero("maior"),
    numero("igual"),
    numero("menor"),
    numero("situacao"),
  ]);
  return { maior, igual, menor, situacao };
}

/** Liga a camada pelo botão da vista e espera o cálculo do outro modo terminar. */
async function ligarComparacao(page: Page) {
  await page.getByRole("button", { name: "Original × Corrigido" }).click();
  await expect(page.getByTestId("comparar-painel")).toBeVisible();
  await expect(page.getByTestId("comparar-painel").getByText("Calculando no modo")).toHaveCount(0, {
    timeout: 30_000,
  });
}

test("camada Original × Corrigido: contagens, lista, seleção, filtro, tolerância e desligar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await importarPredio(page);
  await abrir3d(page);

  await ligarComparacao(page);
  const painel = page.getByTestId("comparar-painel");
  await expect(painel).toContainText("Modo da obra: Como o SISTRUT original");
  await expect(painel).toContainText("Comparado com: Corrigido");

  // tolerância padrão de 1 %
  await expect
    .poll(() => contagens(page))
    .toEqual({ maior: 14, igual: 23, menor: 22, situacao: 0 });

  const lista = page.getByTestId("comparar-lista");
  await expect(lista.locator("li")).toHaveCount(36);
  await expect(lista.locator("li").first()).toContainText("Viga V2 · TER");
  await expect(lista.locator("li").first()).toContainText("(+2,4 %)");

  // a camada registrou a cor na cena
  expect(await vista(page, (v) => v.fontesAtivas().cores.includes("comparar"))).toBe(true);

  // a lista leva à peça: seleciona e enquadra
  await lista.getByRole("button").first().click();
  await expect.poll(() => vista(page, (v) => v.selecao)).toBe("viga:TER#1:TER/V2");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(PRINTS, "comparar-1366.png") });

  // esconder as iguais: a laje igual some e o pilar fica
  await page.getByLabel("Esconder as peças iguais").check();
  await expect.poll(() => vista(page, (v) => v.estaVisivel("laje:TIPO#1:TIPO/L1"))).toBe(false);
  await expect.poll(() => vista(page, (v) => v.estaVisivel("pilar:TIPO#1:TIPO/P1"))).toBe(true);
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "comparar-so-diferencas-1366.png") });

  // tolerância de 2,5 %: nenhuma peça diferente
  const tolerancia = page.getByLabel("Tolerância relativa (%)");
  await tolerancia.fill("2,5");
  await expect.poll(() => contagens(page)).toEqual({ maior: 0, igual: 59, menor: 0, situacao: 0 });
  await expect(painel).toContainText("Nenhuma, com esta tolerância.");
  await tolerancia.fill("1");
  await expect
    .poll(() => contagens(page))
    .toEqual({ maior: 14, igual: 23, menor: 22, situacao: 0 });

  // obra editada (modo de cálculo trocado em Materiais): a camada refaz a comparação com o
  // outro modo; as categorias são sempre "no original", então as contagens não mudam
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
  const sw = dialogo.getByRole("switch", { name: "Modo de cálculo Como o SISTRUT original" });
  await sw.focus();
  await page.keyboard.press("Space");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(painel).toContainText("Modo da obra: Corrigido");
  await expect(painel).toContainText("Comparado com: Como o SISTRUT original");
  await expect(painel.getByText("Calculando no modo")).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => contagens(page))
    .toEqual({ maior: 14, igual: 23, menor: 22, situacao: 0 });

  // desligar: o painel some, a camada tira cor e filtro, e a laje volta a aparecer
  await page.getByRole("button", { name: "Original × Corrigido" }).click();
  await expect(painel).toHaveCount(0);
  expect(await vista(page, (v) => v.fontesAtivas().cores.includes("comparar"))).toBe(false);
  expect(await vista(page, (v) => v.fontesAtivas().filtros.includes("comparar"))).toBe(false);
  await expect.poll(() => vista(page, (v) => v.estaVisivel("laje:TIPO#1:TIPO/L1"))).toBe(true);

  expect(erros).toEqual([]);
});

test("camada Original × Corrigido em 360×800 com toque: legenda ao rolar o painel", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const contexto = await browser.newContext({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await importarPredio(page);
  await abrir3d(page);
  await ligarComparacao(page);
  // a vista pintada, com o painel fechado; a camada continua ligada
  await page.getByRole("button", { name: "Ocultar painel" }).click();
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "comparar-360-vista.png") });
  await page.getByRole("button", { name: "Painel", exact: true }).click();

  // no celular o painel fica abaixo da vista: rola até a legenda ficar visível
  await page.getByTestId("comparar-painel").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Legenda da comparação")).toBeInViewport();
  await page.screenshot({ path: path.join(PRINTS, "comparar-360.png") });

  expect(erros).toEqual([]);
  await contexto.close();
});

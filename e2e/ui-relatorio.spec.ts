import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Áreas RELATÓRIO, IMPRESSÃO, QUANTITATIVOS e EXPORTAÇÃO, numa obra NB-1/78 de referência
// (UI-COMUM.md): 1 pavimento, 4 lajes 4×5 m em grade 2×2, vigas no contorno e no meio e 9
// pilares. Calcula nos dois modos, confere que os quantitativos batem entre Resultados e
// Relatório, a marca "não existe no SISTRUT", os DXF, o PDF e o botão Imprimir, e percorre
// a aba em 1366×768, 1920×1080, janela estreita e só com teclado. Um único teste, porque a
// obra vive no estado da página. Prints e PDF saem em e2e/prints/ui-relatorio.

const PASTA = path.resolve(process.cwd(), "e2e/prints/ui-relatorio");
const NOME_OBRA = "Edificio Relatorio UI";
const NAO_EXISTE = "não existe no SISTRUT";

type Ponto = { x: number; y: number };

/** Ponto do mundo (m) sob o cursor, lido do rodapé da planta (`x = … y = … m`). */
async function mundoSobCursor(page: Page, p: Ponto): Promise<Ponto> {
  await page.mouse.move(p.x, p.y);
  const texto = await page.getByText(/^x = /).innerText();
  const m = /x = (-?[\d,.]+)\s+y = (-?[\d,.]+)/.exec(texto);
  if (!m?.[1] || !m[2]) throw new Error(`rodapé da planta sem coordenadas: "${texto}"`);
  return { x: Number(m[1].replace(",", ".")), y: Number(m[2].replace(",", ".")) };
}

/** Função mundo (m) → tela (px) da planta, calibrada pelo rodapé nos cantos da área. */
async function calibrar(page: Page, svg: Locator) {
  await svg.scrollIntoViewIfNeeded();
  const b = await svg.boundingBox();
  if (!b) throw new Error("planta sem caixa na tela");
  const p1 = { x: b.x + 100, y: b.y + 100 };
  const p2 = { x: b.x + b.width - 100, y: b.y + b.height - 100 };
  const m1 = await mundoSobCursor(page, p1);
  const m2 = await mundoSobCursor(page, p2);
  const escala = (p2.x - p1.x) / (m2.x - m1.x);
  const ox = p1.x - m1.x * escala;
  const oy = p1.y + m1.y * escala;
  return (m: Ponto): Ponto => ({ x: ox + m.x * escala, y: oy - m.y * escala });
}

async function clicar(page: Page, svg: Locator, m: Ponto) {
  const p = (await calibrar(page, svg))(m);
  await page.mouse.click(p.x, p.y);
}

async function arrastar(page: Page, svg: Locator, a: Ponto, b: Ponto) {
  const t = await calibrar(page, svg);
  const A = t(a);
  const B = t(b);
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  await page.mouse.move(B.x, B.y, { steps: 10 });
  await page.mouse.up();
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

/** Células (sem o nome) da linha Total do resumo da aba Resultados. */
async function totalNaAba(resultados: Locator) {
  const tabela = resultados
    .getByRole("heading", { level: 3, name: "Total da obra" })
    .locator("xpath=../following-sibling::*[1]");
  const celulas = await tabela.getByRole("row").last().getByRole("cell").allInnerTexts();
  return celulas.slice(1);
}

/** Células (sem o nome) da linha Total da tabela de quantitativos do relatório. */
async function totalNoRelatorio(relatorio: Locator) {
  const secao = relatorio
    .getByRole("heading", { level: 2, name: "Resumo de aço e concreto" })
    .locator("xpath=..");
  const celulas = await secao.getByRole("row").last().getByRole("cell").allInnerTexts();
  return celulas.slice(1);
}

/**
 * Texto de cada página do PDF (pdftotext -layout), com espaços normalizados. O pdftotext
 * separa as páginas por form feed (\f).
 */
function paginasDoPdf(arquivo: string): string[] {
  const bruto = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", arquivo, "-"], {
    encoding: "utf8",
  });
  return bruto
    .split("\f")
    .filter((p) => p.trim() !== "")
    .map((p) => p.replace(/\s+/g, " ").trim());
}

/**
 * Confere o PDF página a página: o cabeçalho (obra, modo e data) em todas, e as seções
 * "Resumo de aço e concreto" e "Tabela de aço" começando logo abaixo do cabeçalho, ou
 * seja, no topo de uma página nova.
 */
function conferirPaginasDoPdf(arquivo: string) {
  const paginas = paginasDoPdf(arquivo);
  expect(paginas.length).toBeGreaterThanOrEqual(2);
  const cabecalho = `${NOME_OBRA} · Modo: Corrigido · emitido em`;
  paginas.forEach((p, i) => {
    expect.soft(p.startsWith(cabecalho), `página ${i + 1} sem cabeçalho`).toBe(true);
  });
  for (const titulo of ["Resumo de aço e concreto", "Tabela de aço"]) {
    const i = paginas.findIndex((p) => p.includes(titulo));
    expect(i, `seção "${titulo}" no PDF`).toBeGreaterThanOrEqual(0);
    const depoisDoCabecalho = (paginas[i] ?? "").replace(/^.*?emitido em .*?\d{2}:\d{2} /, "");
    expect.soft(depoisDoCabecalho.startsWith(titulo), titulo).toBe(true);
  }
}

/** Tab até o alvo, do jeito que um usuário só de teclado faria. */
async function focarPorTab(page: Page, alvo: Locator, maximo = 6) {
  for (let i = 0; i < maximo; i++) {
    if (await alvo.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("o alvo não foi alcançado pelo Tab");
}

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

let passo = 0;
async function foto(page: Page, descricao: string, inteira = true) {
  passo += 1;
  const nome = `${String(passo).padStart(2, "0")}-${descricao}.png`;
  await page.screenshot({ path: path.join(PASTA, nome), fullPage: inteira });
}

test("RELATÓRIO, IMPRESSÃO, QUANTITATIVOS e EXPORTAÇÃO na obra de referência", async ({ page }) => {
  test.setTimeout(600_000);

  // Erros de console e de página entram numa lista e o teste falha se houver algum.
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.location().url.includes("favicon")) erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(String(e)));

  // O Chrome abre seletor nativo de arquivo, que o Playwright não automatiza. Sem ele o app
  // cai no <input type=file> e no download, que é o caminho testado aqui.
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.setViewportSize({ width: 1366, height: 768 });

  // 1. Obra nova (NB-1/78, a norma padrão) -------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OpenStrut V2" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill(NOME_OBRA);
  await page.getByRole("button", { name: "Criar obra", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: NOME_OBRA })).toBeVisible();
  // Obra vazia: sem vigas, não há armação para exportar.
  await expect(
    page.getByRole("button", { name: "Exportar DXF (armação)", exact: true }),
  ).toBeDisabled();
  await foto(page, "obra-vazia-armacao-desabilitada");

  // 2. Planta: 4 lajes 4×5 m em grade 2×2, 9 pilares ---------------------------
  const svg = page.getByRole("application", { name: "Planta do pavimento" });
  await expect(svg).toBeVisible();
  const laje = page.getByRole("button", { name: "Laje", exact: true });
  await laje.click();
  await arrastar(page, svg, { x: 0, y: 0 }, { x: 4, y: 5 });
  await laje.click();
  await arrastar(page, svg, { x: 4, y: 0 }, { x: 8, y: 5 });
  await laje.click();
  await arrastar(page, svg, { x: 0, y: 5 }, { x: 4, y: 10 });
  await laje.click();
  await arrastar(page, svg, { x: 4, y: 5 }, { x: 8, y: 10 });

  const pilar = page.getByRole("button", { name: "Pilar", exact: true });
  await pilar.click();
  // Pilar no meio de uma laje (fora do eixo das vigas) é recusado com a mensagem.
  await clicar(page, svg, { x: 2, y: 2.5 });
  await expect(page.getByRole("status").filter({ hasText: "pilar precisa" })).toBeVisible();
  for (const p of [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 8, y: 0 },
    { x: 0, y: 5 },
    { x: 4, y: 5 },
    { x: 8, y: 5 },
    { x: 0, y: 10 },
    { x: 4, y: 10 },
    { x: 8, y: 10 },
  ])
    await clicar(page, svg, p);
  await foto(page, "planta-4-lajes-9-pilares");

  // 3. Resultados, modo corrigido ----------------------------------------------
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(resultados.getByRole("heading", { name: "Total da obra" })).toBeVisible();
  await expect(resultados.getByText("Modo: como o SISTRUT original")).toHaveCount(0);
  await expect(resultados.getByRole("note").filter({ hasText: NAO_EXISTE }).first()).toBeVisible();
  const textoResultados = await resultados.innerText();
  expect.soft(textoResultados).not.toMatch(/NaN|undefined|Infinity/);
  const totalCorrigido = await totalNaAba(resultados);
  expect(totalCorrigido).toHaveLength(4);
  await foto(page, "resultados-corrigido");

  // 4. Relatório, modo corrigido: mesmos quantitativos, unidades e pavimento ----
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  const relatorio = page.getByRole("tabpanel", { name: "Relatório" });
  await expect(relatorio.getByRole("heading", { level: 1, name: NOME_OBRA })).toBeVisible();
  await expect(relatorio.getByText(/^Modo de cálculo: Corrigido/)).toBeVisible();
  await expect(relatorio.getByText(/unidades (SI|técnicas)/)).toBeVisible();

  // Pavimentos: 4 lajes, 9 pilares e vigas no contorno e no meio.
  const pavimento = relatorio
    .getByRole("row")
    .filter({ hasText: /^Pavimento 1/ })
    .first();
  const celPav = await pavimento.getByRole("cell").allInnerTexts();
  expect(celPav[3]).toBe("4");
  expect(celPav[5]).toBe("9");
  expect(Number(celPav[4])).toBeGreaterThan(0);

  expect(await totalNoRelatorio(relatorio)).toEqual(totalCorrigido);
  await expect(relatorio.getByRole("note").filter({ hasText: NAO_EXISTE }).first()).toBeVisible();
  const textoRelatorio = await relatorio.innerText();
  expect.soft(textoRelatorio).not.toMatch(/NaN|undefined|Infinity/);
  await foto(page, "relatorio-corrigido");

  // 5. Modo "Como o SISTRUT original" e volta: os números seguem a aba ----------
  await alternarModo(page, "true");
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await expect(resultados.getByText("Modo: como o SISTRUT original")).toBeVisible();
  await expect(resultados.getByRole("note").filter({ hasText: "DESINIT" }).first()).toBeVisible();
  const totalOriginal = await totalNaAba(resultados);
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  await expect(relatorio.getByText(/^Modo de cálculo: Como o SISTRUT original/)).toBeVisible();
  expect(await totalNoRelatorio(relatorio)).toEqual(totalOriginal);
  await foto(page, "relatorio-original");

  await alternarModo(page, "false");
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  expect(await totalNaAba(resultados)).toEqual(totalCorrigido);
  await expect(resultados.getByText("Modo: como o SISTRUT original")).toHaveCount(0);

  // 6. Exportação DXF: nomes e conteúdo -----------------------------------------
  await page.getByRole("tab", { name: "Planta", exact: true }).click();
  const botaoFormas = page.getByRole("button", { name: "Exportar DXF (formas)", exact: true });
  const botaoArmacao = page.getByRole("button", { name: "Exportar DXF (armação)", exact: true });
  await expect(botaoArmacao).toBeEnabled();

  const [formas] = await Promise.all([page.waitForEvent("download"), botaoFormas.click()]);
  expect(formas.suggestedFilename()).toBe(`${NOME_OBRA} - formas.dxf`);
  const caminhoFormas = path.join(PASTA, formas.suggestedFilename());
  await formas.saveAs(caminhoFormas);
  const textoFormas = fs.readFileSync(caminhoFormas, "utf8");
  expect(textoFormas).toMatch(/^\s*0\r?\nSECTION/);
  expect(textoFormas).toContain("EOF");

  const [armacao] = await Promise.all([page.waitForEvent("download"), botaoArmacao.click()]);
  expect(armacao.suggestedFilename()).toBe(`${NOME_OBRA} - armação.dxf`);
  const caminhoArmacao = path.join(PASTA, armacao.suggestedFilename());
  await armacao.saveAs(caminhoArmacao);
  const textoArmacao = fs.readFileSync(caminhoArmacao, "utf8");
  expect(textoArmacao).toMatch(/^\s*0\r?\nSECTION/);
  expect(textoArmacao).toContain("EOF");

  // 7. Imprimir: o botão chama window.print (stub, para não abrir a janela do sistema) --
  await page.evaluate(() => {
    const w = window as Window & { __impressoes?: number };
    w.__impressoes = 0;
    window.print = () => {
      w.__impressoes = (w.__impressoes ?? 0) + 1;
    };
  });
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  const impressoes = () =>
    page.evaluate(() => (window as Window & { __impressoes?: number }).__impressoes);
  expect(await impressoes()).toBe(1);

  // PDF pelo mesmo caminho de impressão (@media print e @page A4 do index.css).
  await page.pdf({
    path: path.join(PASTA, "relatorio.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(fs.statSync(path.join(PASTA, "relatorio.pdf")).size).toBeGreaterThan(1000);
  conferirPaginasDoPdf(path.join(PASTA, "relatorio.pdf"));

  // 8. Viewports: 1920×1080 e janela estreita -----------------------------------
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  await foto(page, "relatorio-1920", false);

  await page.setViewportSize({ width: 420, height: 860 });
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  await expect(relatorio.getByRole("heading", { level: 1, name: NOME_OBRA })).toBeVisible();
  const transbordo = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect.soft(transbordo).toBeLessThanOrEqual(0);
  await foto(page, "relatorio-estreito", false);

  // 9. Só teclado: troca de aba com a seta e aciona Imprimir com Enter ----------
  await page.getByRole("tab", { name: "Resultados", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(relatorio.getByRole("heading", { level: 1, name: NOME_OBRA })).toBeVisible();
  const imprimir = page.getByRole("button", { name: "Imprimir", exact: true });
  await focarPorTab(page, imprimir);
  await expect(imprimir).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await impressoes()).toBe(2);

  // 10. Console limpo -----------------------------------------------------------
  expect(erros).toEqual([]);
});

// Obra R3 original (e2e/fixtures): a otimização dos negativos não converge na laje L1 e a
// viga V4 sai sem detalhamento com a resposta N. Gerada pelo mesmo caminho do arquivo salvo
// (importarLaj com relacaoNegPosMin 0,35, serializarObra, modo original).
const FIXTURE_R3_ORIGINAL = path.resolve(
  process.cwd(),
  "e2e/fixtures/laje-r3-original.openstrut.json",
);

/** Sem a API de arquivo do Chrome: o OpenStrut cai no <input type=file>, que o Playwright controla. */
async function semFileSystemAccess(page: Page) {
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
}

test("relatório de obra no modo original: os avisos e a marca 'não existe no SISTRUT' vão ao papel", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await semFileSystemAccess(page);
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(FIXTURE_R3_ORIGINAL);
  await expect(page.getByRole("heading", { name: "Laje R3 original" })).toBeVisible();

  // na tela: o aviso da otimização aparece nos resultados
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(resultados.getByText(/não converge/).first()).toBeVisible();

  // no papel: o relatório traz o modo, os avisos e a marca, em todas as páginas
  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  const relatorio = page.getByRole("tabpanel", { name: "Relatório" });
  await expect(relatorio.getByText("Modo de cálculo: Como o SISTRUT original")).toBeVisible();
  await foto(page, "relatorio-original-aviso");

  const pdf = path.join(PASTA, "relatorio-original.pdf");
  await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
  const paginas = paginasDoPdf(pdf);
  expect(paginas.length).toBeGreaterThanOrEqual(2);
  const cabecalho = "Laje R3 original · Modo: Como o SISTRUT original · emitido em";
  paginas.forEach((p, i) => {
    expect
      .soft(p.startsWith(cabecalho), `página ${i + 1} sem cabeçalho do modo original`)
      .toBe(true);
  });

  const texto = paginas.join(" ");
  expect(texto).toContain("Avisos");
  expect(texto).toMatch(/Otimização dos negativos não converge: L1/);
  expect(texto).toMatch(/V4: o DESDIM para a viga com a resposta padrão N/);
  expect(texto).toContain("sem detalhamento nem quadro");
  expect(texto).toContain(NAO_EXISTE);
});

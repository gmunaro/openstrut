// Vista 3D, camada "Original × Corrigido" (src/telas/obra3d/comparar): cada peça que difere
// diz que defeitos do SISTRUT original a atingem, com link para a explicação na aba
// Resultados ("Erros do SISTRUT original"), na lista do Painel e no cartão da peça
// selecionada; sem defeito conferido, diz isso e as causas (materiais SI, cobrimentos,
// precisão; docs/MODO-CALCULO.md).
// - Obra da transição (e2e/fixtures/transicao-original, conta à mão em
//   src/calculo/sistrut/__e2e__/obraTransicao.ts): o PB de BAIXO leva a carga do PB de
//   CIMA em dobro (P-b, 20,25 t × 10,25 t na fundação) e o .REP corta a reação que chega
//   ao PA (R5). Em 1366×900 e 360×800.
// - Prédio do oráculo importado do SISTRUT (o mesmo de vista3d-comparar.spec.ts): uma viga
//   com D-ψ e vigas sem defeito conferido. Em 1366×768.
// Rode com PORT=4431 bun x playwright test e2e/vista3d-comparar-defeitos.spec.ts
// As fotos vão para e2e/prints/vista3d-comparar-defeitos/.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { arquivo, colPredio, comNome, SO_BURACOS } from "../src/telas/__fixtures__/predioSistrut";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-comparar-defeitos");
fs.mkdirSync(PRINTS, { recursive: true });
const TRANSICAO = path.resolve("e2e/fixtures/transicao-original.openstrut.json");

// WebGL por software no Chrome sem GPU (CI e headless)
test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

/** A obra E2E do oráculo em TER (só baldrame), TIPO e COB, com o .COL das cotas e uma
 *  viga avulsa (ESCADA.VIG), como em vista3d-comparar.spec.ts. */
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

async function abrirTransicao(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(TRANSICAO);
  await expect(page).toHaveURL(/\/obra$/);
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
  await page.waitForTimeout(800);
  await quadros(page);
}

/** Liga a camada e espera o cálculo do outro modo terminar. */
async function ligarComparacao(page: Page) {
  await page.getByRole("button", { name: "Original × Corrigido" }).click();
  await expect(page.getByTestId("comparar-painel")).toBeVisible();
  await expect(page.getByTestId("comparar-painel").getByText("Calculando no modo")).toHaveCount(0, {
    timeout: 30_000,
  });
}

const TITULO_PB = "Carga em dobro na fundação de pilar sobre viga de transição";
const TITULO_R5 = "Reações das vigas cortadas na segunda casa decimal no .REP";
const SEM_DEFEITO =
  "Sem defeito conferido nesta peça. A diferença pode vir dos materiais em SI, dos cobrimentos da obra, da precisão ou de um defeito que não é conferido aqui.";

/** O título (`id`) está inteiro na tela e nada o cobre, como a barra fixa do filtro de
 *  Resultados: o ponto do canto de cima e o do meio caem dentro dele. */
const tituloVisivel = (page: Page, id: string) =>
  page.evaluate((id) => {
    const h = document.getElementById(id);
    if (!h) return false;
    const r = h.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) return false;
    return [r.top + 2, r.top + r.height / 2].every((y) => {
      const el = document.elementFromPoint(r.left + 4, y);
      return !!el && h.contains(el);
    });
  }, id);

// a 1366 o link do cartão leva ao P-b; a 360, o da lista leva ao R5, cujo cartão de
// explicação passa da altura da tela
for (const tela of [
  { nome: "1366", width: 1366, height: 900, vaiPara: "P-b" },
  { nome: "360", width: 360, height: 800, vaiPara: "R5" },
]) {
  test(`transição em ${tela.nome}: P-b e R5 na lista e no cartão, link para a explicação`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const contexto = await browser.newContext({
      viewport: { width: tela.width, height: tela.height },
      hasTouch: tela.width < 600,
    });
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    await abrirTransicao(page);
    await abrir3d(page);
    await ligarComparacao(page);

    const painel = page.getByTestId("comparar-painel");
    await expect(painel).toContainText("Modo da obra: Como o SISTRUT original");
    // as causas sem defeito, com os números de docs/MODO-CALCULO.md
    await expect(page.getByTestId("comparar-causas")).toContainText(
      "concreto de 25 kN/m³ (2,5493 t/m³; o original, 2,5 t/m³)",
    );
    await expect(page.getByTestId("comparar-causas")).toContainText("float64 no lugar do Float32");

    // duas peças diferem: o PB de BAIXO (+49,4 %, P-b) e o PA de BAIXO (R5)
    const itens = page.getByTestId("comparar-lista").locator("> li");
    await expect(itens).toHaveCount(2);
    const pb = itens.nth(0);
    await expect(pb).toContainText("Pilar PB");
    await expect(pb).toContainText("(+49,4 %)");
    const linkPb = pb.getByRole("link", { name: `P-b ${TITULO_PB}` });
    await expect(linkPb).toHaveAttribute("href", "#erro-original-P-b");
    await expect(pb.getByRole("link")).toHaveCount(1);
    const pa = itens.nth(1);
    await expect(pa).toContainText("Pilar PA");
    await expect(pa.getByRole("link")).toHaveCount(1);
    await expect(pa.getByRole("link", { name: `R5 ${TITULO_R5}` })).toHaveAttribute(
      "href",
      "#erro-original-R5",
    );
    await expect(page.getByTestId("comparar-sem-defeito")).toHaveCount(0);

    // a lista seleciona o PB de BAIXO: o cartão repete a categoria e o P-b com o link
    await pb.getByRole("button").click();
    const cartao = page.getByTestId("comparar-cartao");
    await expect(cartao).toContainText("Original × Corrigido: Maior no original (+49,4 %)");
    await expect(cartao.getByRole("link", { name: `P-b ${TITULO_PB}` })).toHaveAttribute(
      "href",
      "#erro-original-P-b",
    );
    const regiao = page.getByRole("region", { name: "Elemento selecionado: PB" });
    expect((await regiao.textContent())?.match(/P-b/g)).toHaveLength(1);
    await page.waitForTimeout(700);
    await quadros(page);
    await pb.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(PRINTS, `transicao-lista-${tela.nome}.png`) });
    await cartao.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(PRINTS, `transicao-cartao-${tela.nome}.png`) });

    // com tolerância 0 entra o PB de CIMA (−0,06 %), que o quadro "Afetado por defeito" do
    // modo original já marca com o P-b: o P-b aparece uma vez só no cartão, e o da
    // comparação fica com o link para a explicação
    await page.getByLabel("Tolerância relativa (%)").fill("0");
    await expect(itens).toHaveCount(3);
    await itens.filter({ hasText: "Pilar PB · CIMA" }).getByRole("button").click();
    await expect(cartao).toContainText("Original × Corrigido: Menor no original");
    await expect(regiao).toContainText("Afetado por defeito do SISTRUT original");
    expect((await regiao.textContent())?.match(/P-b/g)).toHaveLength(1);
    const linkCartao = cartao.getByRole("link", { name: "Explicação de P-b em Resultados" });
    await expect(linkCartao).toHaveAttribute("href", "#erro-original-P-b");
    await cartao.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(PRINTS, `transicao-cartao-quadro-${tela.nome}.png`) });

    // o link leva à explicação na aba Resultados, com o título à vista
    if (tela.vaiPara === "P-b") await linkCartao.click();
    else await pa.getByRole("link", { name: `R5 ${TITULO_R5}` }).click();
    await expect(page.getByRole("tab", { name: "Resultados" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator(`#erro-original-${tela.vaiPara}`)).toContainText(
      tela.vaiPara === "P-b" ? TITULO_PB : TITULO_R5,
    );
    await expect
      .poll(() => tituloVisivel(page, `erro-original-${tela.vaiPara}-titulo`), {
        timeout: 20_000,
      })
      .toBe(true);
    await page.screenshot({ path: path.join(PRINTS, `transicao-explicacao-${tela.nome}.png`) });

    expect(erros).toEqual([]);
    await contexto.close();
  });
}

test("prédio do oráculo: D-ψ com link e o texto das peças sem defeito conferido", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await importarPredio(page);
  await abrir3d(page);
  await ligarComparacao(page);

  const lista = page.getByTestId("comparar-lista");
  // vigas sem defeito conferido dizem isso
  await expect(lista.getByTestId("comparar-sem-defeito").first()).toHaveText(SEM_DEFEITO);
  // a viga com o ρ do cortante no piso (D-ψ): link para a explicação
  const linkPsi = lista.getByRole("link", { name: /^D-ψ Taxa de armadura do cortante/ }).first();
  await expect(linkPsi).toHaveAttribute("href", "#erro-original-D-");

  // a primeira peça sem defeito, selecionada: o cartão diz o motivo por extenso
  const semDefeito = lista
    .locator("> li")
    .filter({ has: page.getByTestId("comparar-sem-defeito") })
    .first();
  await semDefeito.getByRole("button").click();
  const cartao = page.getByTestId("comparar-cartao");
  await expect(cartao).toContainText(SEM_DEFEITO);
  await cartao.getByText("O que muda além dos defeitos").click();
  await expect(cartao).toContainText("aço de 500 MPa (5,0986 t/cm²; o original, 5 t/cm²)");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(PRINTS, "predio-sem-defeito-1366.png") });

  await linkPsi.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PRINTS, "predio-d-psi-1366.png") });
  await linkPsi.click();
  const explicacao = page.locator("#erro-original-D-");
  await expect(explicacao).toContainText("Taxa de armadura do cortante sempre no mínimo");
  await expect
    .poll(() => tituloVisivel(page, "erro-original-D--titulo"), { timeout: 20_000 })
    .toBe(true);
  await page.screenshot({ path: path.join(PRINTS, "predio-explicacao-d-psi-1366.png") });

  expect(erros).toEqual([]);
});

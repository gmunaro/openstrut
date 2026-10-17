import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Aba Orçamento com uma obra calculada (NB-1/78, modo original): tabela SINAPI de
// referência, total parcial pelo concreto C15 que a SINAPI não tem, composição editada,
// BDI, importação de CSV, comparação com o modo corrigido, exportação CSV e XLSX; no
// celular e no desktop, com os mesmos dados: nada mais largo que a tela, o botão de
// relatar problema sem cobrir campo, o aviso inteiro, a composição inteira no campo e o
// contraste do texto. Prints em e2e/prints/orcamento. Rode com PORT=4410.
const PASTA = path.resolve(process.cwd(), "e2e/prints/orcamento");
const OBRA = path.resolve(process.cwd(), "e2e/fixtures/ui-resultados/obra-original.openstrut.json");

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** "1.234,56" → 1234.56 */
const deReais = (t: string) => Number(t.replace(/[^\d,-]/g, "").replace(",", "."));

async function abrirOrcamento(page: Page) {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(OBRA);
  await page.getByRole("tab", { name: "Orçamento" }).click();
  const painel = page.getByRole("tabpanel", { name: "Orçamento" });
  await expect(painel.getByRole("heading", { name: "Orçamento da estrutura" })).toBeVisible();
  return { painel, erros };
}

const celula = (page: Page, rotulo: string) =>
  page.getByRole("tabpanel", { name: "Orçamento" }).locator(`[data-rotulo="${rotulo}"]`);

/** Os mesmos dados no desktop e no celular: concreto C20 para o fck 15, CA-60 5,0 para o
 *  CA-50 φ 5 (a SINAPI não tem os dois) e BDI de 25 %. */
async function preparar(painel: Locator) {
  const comp = painel.getByLabel("Composição de Concreto fck 15 MPa");
  await comp.fill("1524");
  await comp.press("Enter");
  const aco5 = painel.getByLabel("Composição de Aço CA-50 φ 5 mm");
  await aco5.fill("43059");
  await aco5.press("Enter");
  await expect(painel.getByRole("alert").filter({ hasText: "Total parcial" })).toHaveCount(0);
  await painel.getByLabel("BDI", { exact: true }).fill("25");
  await painel.getByLabel("BDI", { exact: true }).press("Enter");
  await expect(painel.getByText("BDI (25,00 %)")).toBeVisible();
}

/** Elementos do painel que passam da borda direita da tela (fora do que rola dentro de
 *  uma tabela) e a sobra de largura do próprio painel. */
const transbordos = (page: Page) =>
  page.evaluate(() => {
    const painel = document.querySelector('[role="tabpanel"][data-state="active"]')!;
    const largura = document.documentElement.clientWidth;
    const fora: string[] = [];
    for (const el of painel.querySelectorAll("*")) {
      // o conteúdo de uma tabela rola dentro do contêiner dela (que é conferido)
      if (el.parentElement?.closest('[data-slot="tabela-rolagem"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > largura + 0.5)
        fora.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}" até ${Math.round(r.right)} px`);
      if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && el.dataset.slot !== "tabela-rolagem")
        fora.push(`${el.tagName.toLowerCase()} rola de lado: ${el.scrollWidth} > ${el.clientWidth} px`);
    }
    return {
      pagina: document.documentElement.scrollWidth - largura,
      painel: painel.scrollWidth - painel.clientWidth,
      fora,
    };
  });

/** Campos, botões e outros controles do painel embaixo do botão de relatar problema. */
const controlesSobOBotao = (page: Page) =>
  page.evaluate(() => {
    const botao = document.querySelector('[aria-label="Relatar problema"]');
    if (!botao) return [];
    const r = botao.getBoundingClientRect();
    const xs = [r.left + 2, r.left + r.width / 2, r.right - 2];
    const ys = [r.top + 2, r.top + r.height / 2, r.bottom - 2];
    const achados = new Set<string>();
    for (const x of xs)
      for (const y of ys) {
        const alvo = document.elementsFromPoint(x, y).find((el) => !el.closest("[data-relato-ignorar]"));
        const c = alvo?.closest('input, select, textarea, button, summary, label, [role="tab"]');
        if (c && c.closest('[role="tabpanel"]')) achados.add(c.getAttribute("aria-label") ?? c.textContent?.trim() ?? c.tagName);
      }
    return [...achados];
  });

/** Contraste de cada texto do painel contra o fundo efetivo (cores lidas por um canvas,
 *  que entende oklch; opacidade dos ancestrais). Devolve o menor e os abaixo de 4,5:1. */
const contrastes = (page: Page) =>
  page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const rgba = (cor: string) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = cor;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255] as const;
    };
    const lum = ([r, g, b]: readonly number[]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const sobre = (cima: readonly number[], a: number, baixo: number[]) =>
      baixo.map((v, i) => a * cima[i]! + (1 - a) * v);
    const fundo = (el: Element) => {
      const camadas: (readonly number[])[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] > 0) camadas.push(c);
      }
      let cor = [255, 255, 255];
      for (const c of camadas.reverse()) cor = sobre(c, c[3]!, cor);
      return cor;
    };
    const painel = document.querySelector('[role="tabpanel"][data-state="active"]')!;
    let menor = Infinity;
    let qual = "";
    const baixos: string[] = [];
    for (const el of painel.querySelectorAll("*")) {
      const texto = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join("");
      if (!texto || el.closest(":disabled")) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || st.visibility === "hidden") continue;
      let opacidade = 1;
      for (let e: Element | null = el; e; e = e.parentElement) opacidade *= Number(getComputedStyle(e).opacity);
      const bg = fundo(el);
      const c = rgba(st.color);
      const cor = sobre(c, c[3]! * opacidade, bg);
      const [a, b] = [lum(cor), lum(bg)].sort((x, y) => y - x);
      const razao = (a! + 0.05) / (b! + 0.05);
      const grande = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && Number(st.fontWeight) >= 700);
      if (razao < menor) {
        menor = razao;
        qual = texto.slice(0, 40);
      }
      if (razao < (grande ? 3 : 4.5)) baixos.push(`"${texto.slice(0, 30)}" ${razao.toFixed(2)}:1`);
    }
    return { menor, qual, baixos };
  });

/** Uma captura por bloco (o painel rola por dentro), conferindo em cada posição o
 *  transbordo e o botão flutuante. */
async function revisarBlocos(page: Page, painel: Locator, nome: string) {
  // sem o botão a conferência passaria sem conferir nada
  await expect(page.getByRole("button", { name: "Relatar problema" })).toBeVisible();
  const titulos = painel.getByRole("heading");
  const sob: string[] = [];
  for (let i = 0, n = await titulos.count(); i < n; i++) {
    await titulos.nth(i).evaluate((el) => el.scrollIntoView({ block: "start" }));
    // o botão de relatar se reposiciona depois da rolagem
    await page.waitForTimeout(400);
    sob.push(...(await controlesSobOBotao(page)).map((c) => `${nome}-${i}: ${c}`));
    await page.screenshot({ path: path.join(PASTA, `${nome}-${String(i).padStart(2, "0")}.png`) });
  }
  // o fim da aba tem folga: o último conteúdo sobe acima do botão
  await painel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await page.waitForTimeout(400);
  sob.push(...(await controlesSobOBotao(page)).map((c) => `${nome}-fim: ${c}`));
  expect(sob, sob.join("\n")).toEqual([]);
}

test("orçamento: SINAPI, composição, BDI, importação, comparação e exportação", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  const { painel, erros } = await abrirOrcamento(page);

  // aviso fixo e a tabela de referência datada
  await expect(painel.getByRole("note").filter({ hasText: "Não substitui o orçamento executivo" })).toBeVisible();
  await expect(painel.getByText("Estimativa da estrutura: não substitui o orçamento executivo.")).toBeVisible();
  await expect(painel.getByLabel("Tabela", { exact: true })).toHaveValue("sinapi-2026-09-sp-nd");
  await expect(painel.getByText("referência 09/2026, UF SP, sem desoneração")).toBeVisible();

  // fck 15 e CA-50 φ 5: a SINAPI não tem concreto usinado C15 nem CA-50 de 5 mm (o 5,0
  // dela é CA-60) → total parcial, até o usuário escolher os itens
  const parcial = painel.getByRole("alert").filter({ hasText: "Total parcial" });
  await expect(parcial).toContainText("Concreto fck 15 MPa");
  await expect(parcial).toContainText("Aço CA-50 φ 5 mm");
  await expect(painel.getByLabel("Composição de Concreto fck 15 MPa")).toHaveValue("");
  await preparar(painel);
  await expect(painel.locator('[data-papel="concreto:15"]')).toContainText("C20");

  // BDI 25 %: total = direto · 1,25
  const direto = deReais(await celula(page, "Custo direto").innerText());
  const total = deReais(await celula(page, "Total com BDI").innerText());
  expect(direto).toBeGreaterThan(0);
  expect(total).toBeCloseTo(direto * 1.25, 1);

  // comparação com o modo corrigido (a obra está no original)
  await expect(painel.getByRole("heading", { name: "Quanto custa o erro do original" })).toBeVisible();
  await expect(celula(page, "diferenca-carga")).not.toHaveText("—");

  // layout no desktop
  expect(await transbordos(page)).toEqual({ pagina: 0, painel: 0, fora: [] });
  await page.screenshot({ path: path.join(PASTA, "desktop-1366.png") });
  await revisarBlocos(page, painel, "desktop-1366");

  // exportação
  const [xlsx] = await Promise.all([
    page.waitForEvent("download"),
    painel.getByRole("button", { name: "XLSX" }).click(),
  ]);
  const bytes = fs.readFileSync(await xlsx.path());
  expect(xlsx.suggestedFilename()).toMatch(/^orcamento-.*\.xlsx$/);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    painel.getByRole("button", { name: "CSV" }).click(),
  ]);
  const texto = fs.readFileSync(await csv.path(), "utf8");
  expect(texto).toContain("Por insumo");
  expect(texto).toContain("Total com BDI (R$)");
  expect(texto).toContain("Comparação");

  // importação de CSV do usuário: nova tabela, só com concreto → o resto fica sem preço
  await painel.getByRole("button", { name: "Importar…" }).click();
  await painel.getByLabel("Arquivo").setInputFiles({
    name: "meus-precos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("codigo;descricao;unidade;preco\n1524;Concreto C20 da usina;m3;600,00\n"),
  });
  await painel.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(painel.getByRole("status")).toContainText("1 item importado");
  await expect(painel.getByLabel("Tabela", { exact: true })).not.toHaveValue("sinapi-2026-09-sp-nd");
  await expect(
    painel.locator('[data-papel="concreto:15"]').getByLabel("Preço de 1524"),
  ).toHaveValue("600,00");
  await expect(painel.locator('[data-papel="concreto:15"]')).toContainText("Concreto C20 da usina");
  await expect(painel.getByRole("alert").filter({ hasText: "Total parcial" })).toBeVisible();

  // volta à SINAPI: a tabela importada fica guardada no navegador, a configuração também
  await painel.getByLabel("Tabela", { exact: true }).selectOption("sinapi-2026-09-sp-nd");
  await page.reload();
  const depois = await abrirOrcamento(page);
  await expect(depois.painel.getByLabel("BDI", { exact: true })).toHaveValue("25,00");
  await expect(depois.painel.getByLabel("Composição de Concreto fck 15 MPa")).toHaveValue("1524");
  await expect(depois.painel.getByLabel("Tabela", { exact: true }).locator("option")).toHaveCount(2);

  expect([...erros, ...depois.erros]).toEqual([]);
});

for (const tela of [
  { nome: "celular-360", largura: 360, altura: 800 },
  { nome: "celular-412", largura: 412, altura: 915 },
]) {
  test(`orçamento no ${tela.nome}: cabe na tela, botão flutuante livre, aviso e composição inteiros`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({
      viewport: { width: tela.largura, height: tela.altura },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    const { painel, erros } = await abrirOrcamento(page);
    await preparar(painel);
    await expect(celula(page, "Total com BDI")).toBeVisible();

    // nada mais largo que a tela: a página, o painel e cada contêiner (as tabelas rolam
    // por dentro do contêiner delas, que cabe na tela)
    expect(await transbordos(page)).toEqual({ pagina: 0, painel: 0, fora: [] });

    // o aviso cabe inteiro
    const aviso = painel.getByRole("note").filter({ hasText: "Não substitui o orçamento executivo" });
    const caixa = await aviso.boundingBox();
    expect(caixa!.x).toBeGreaterThanOrEqual(0);
    expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(tela.largura);
    expect(await aviso.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    // a composição mais longa aparece inteira no campo, sem rolagem escondida
    const montagem = painel.getByLabel("Composição de Fôrma de viga (montagem e desmontagem)");
    await montagem.scrollIntoViewIfNeeded();
    expect(await montagem.inputValue()).toContain("88262 × 1,635; 88239 × 0,3;");
    expect(
      await montagem.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);

    await painel.evaluate((el) => el.scrollTo({ top: 0 }));
    await page.screenshot({ path: path.join(PASTA, `${tela.nome}.png`) });
    await revisarBlocos(page, painel, tela.nome);
    expect(erros).toEqual([]);
    await ctx.close();
  });
}

test("contraste do texto da aba Orçamento (WCAG AA, 4,5:1)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  const { painel } = await abrirOrcamento(page);
  await preparar(painel);
  const { menor, qual, baixos } = await contrastes(page);
  fs.writeFileSync(
    path.join(PASTA, "contraste.txt"),
    `menor: ${menor.toFixed(2)}:1 ("${qual}")\n${baixos.join("\n")}\n`,
  );
  expect(baixos, baixos.join("\n")).toEqual([]);
});

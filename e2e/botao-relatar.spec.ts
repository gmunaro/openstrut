import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { abrirGrade } from "./obras";

// O botão de relatar problema fica no canto direito do rodapé do aviso e não cobre célula
// de tabela nem campo de formulário em tela nenhuma, a 360, 1366 e 1920 px: início,
// planta, Resultados, Relatório e Orçamento, no topo e no fim da rolagem de cada aba.
// Os prints saem em e2e/prints/botao-relatar.

const PASTA = path.resolve(process.cwd(), "e2e/prints/botao-relatar");

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** O que o botão não pode cobrir. */
const CONTEUDO = 'td, th, input, select, textarea, [data-slot="select-trigger"]';

/**
 * Elementos de `seletor` cuja parte visível cruza o botão. A caixa de cada um é recortada
 * pelos contêineres que rolam (o que rolou para fora não conta). Lista vazia = livre.
 */
function cruzamDoBotao(seletor: string) {
  const botao = document.querySelector('[aria-label="Relatar problema"]');
  if (!botao) throw new Error("botão de relatar ausente");
  const b = botao.getBoundingClientRect();
  const achados: string[] = [];
  for (const el of document.querySelectorAll(seletor)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
    let [l, t, d, f] = [r.left, r.top, r.right, r.bottom];
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      if (getComputedStyle(e).overflow === "visible") continue;
      const c = e.getBoundingClientRect();
      [l, t, d, f] = [
        Math.max(l, c.left),
        Math.max(t, c.top),
        Math.min(d, c.right),
        Math.min(f, c.bottom),
      ];
    }
    if (d <= l || f <= t) continue;
    if (l < b.right && d > b.left && t < b.bottom && f > b.top) {
      const nome = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30);
      achados.push(`${el.tagName} "${nome}"`);
    }
  }
  return achados;
}

/** Confere o botão livre na tela como está e no fim da rolagem de cada contêiner. */
async function conferir(page: Page, nome: string) {
  const botao = page.getByRole("button", { name: "Relatar problema" });
  await expect(botao).toBeInViewport();
  const sob = (await page.evaluate(cruzamDoBotao, CONTEUDO)).map((c) => `${nome}: ${c}`);
  await page.screenshot({ path: path.join(PASTA, `${nome}.png`), animations: "disabled" });
  await page.evaluate(() => {
    for (const e of document.querySelectorAll("*"))
      if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY))
        e.scrollTop = e.scrollHeight;
  });
  sob.push(...(await page.evaluate(cruzamDoBotao, CONTEUDO)).map((c) => `${nome}-fim: ${c}`));
  await page.screenshot({ path: path.join(PASTA, `${nome}-fim.png`), animations: "disabled" });
  return sob;
}

for (const tela of [
  { width: 360, height: 800 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
])
  test(`botão de relatar não cobre tabela nem campo a ${tela.width}×${tela.height}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(tela);
    const w = tela.width;
    const sob: string[] = [];

    await page.goto("/");
    await expect(page.getByLabel("Nome", { exact: true })).toBeVisible();
    sob.push(...(await conferir(page, `${w}-inicio`)));

    await abrirGrade(page);
    sob.push(...(await conferir(page, `${w}-planta`)));
    // no desktop, o painel de propriedades com os campos da laje
    if (w > 767) {
      await page.getByRole("application", { name: "Planta do pavimento" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("complementary").getByRole("textbox", { name: "Nome" }),
      ).toBeVisible();
      sob.push(...(await conferir(page, `${w}-planta-propriedades`)));
    }

    for (const aba of ["Resultados", "Relatório", "Orçamento"]) {
      await page.getByRole("tab", { name: aba, exact: true }).click();
      const painel = page.getByRole("tabpanel", { name: aba });
      // a aba tem de ter tabela, senão a conferência passaria sem conferir nada
      await expect(painel.locator("td").first()).toBeVisible({ timeout: 20_000 });
      sob.push(...(await conferir(page, `${w}-${aba.toLowerCase()}`)));
    }
    expect(sob, sob.join("\n")).toEqual([]);
  });

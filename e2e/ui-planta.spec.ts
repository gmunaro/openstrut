// Revisão da área PLANTA (instância 1): desenhar, selecionar, apagar, propriedades,
// pavimentos, zoom, atalhos e mensagens de geometria. Prints e relatório ficam fora
// do repo, em C:/tmp/v2-paridade/ui-planta/.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SAIDA = "C:/tmp/v2-paridade/ui-planta";

type Ponto = { x: number; y: number };

/** Lê o rodapé da planta (`x = … y = … m`), que mostra o ponto do mundo sob o cursor. */
async function lerRodape(page: Page): Promise<Ponto> {
  const texto = await page.getByText(/^x = /).innerText();
  const m = /x = (-?[\d,.]+)\s+y = (-?[\d,.]+)/.exec(texto);
  if (!m?.[1] || !m[2]) throw new Error(`rodapé da planta sem coordenadas: "${texto}"`);
  return { x: Number(m[1].replace(",", ".")), y: Number(m[2].replace(",", ".")) };
}

/** Move o cursor e espera o React pintar o rodapé antes de ler. */
async function moverLendo(page: Page, p: Ponto): Promise<Ponto> {
  await page.mouse.move(p.x, p.y);
  await page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );
  return lerRodape(page);
}

/** Escala tela/mundo da planta, medida pelo rodapé nos dois cantos úteis. */
async function calibrar(page: Page, svg: Locator) {
  await svg.scrollIntoViewIfNeeded();
  const b = await svg.boundingBox();
  if (!b) throw new Error("planta sem caixa na tela");
  const p1 = { x: b.x + 100, y: b.y + 100 };
  const p2 = { x: b.x + b.width - 100, y: b.y + b.height - 100 };
  const m1 = await moverLendo(page, p1);
  const m2 = await moverLendo(page, p2);
  const sx = (p2.x - p1.x) / (m2.x - m1.x);
  const sy = (p2.y - p1.y) / (m2.y - m1.y);
  return {
    escala: { x: sx, y: sy },
    paraTela: (m: Ponto): Ponto => ({ x: p1.x + (m.x - m1.x) * sx, y: p1.y + (m.y - m1.y) * sy }),
  };
}

/**
 * Leva o cursor ao ponto `alvo` do mundo. Calibra pela tela e corrige pelo rodapé
 * até ele mostrar o alvo (a tela pode mudar de escala entre layouts).
 */
async function irPara(page: Page, svg: Locator, alvo: Ponto): Promise<Ponto> {
  const cal = await calibrar(page, svg);
  let tela = cal.paraTela(alvo);
  let lido: Ponto = alvo;
  for (let i = 0; i < 4; i++) {
    lido = await moverLendo(page, tela);
    const dx = alvo.x - lido.x;
    const dy = alvo.y - lido.y;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return tela;
    tela = { x: tela.x + dx * cal.escala.x, y: tela.y - dy * cal.escala.y };
  }
  throw new Error(
    `cursor não chegou a (${alvo.x}, ${alvo.y}) m; rodapé mostra (${lido.x}, ${lido.y}) m`,
  );
}

async function clicar(page: Page, svg: Locator, m: Ponto) {
  const tela = await irPara(page, svg, m);
  await page.mouse.click(tela.x, tela.y);
}

async function arrastar(page: Page, svg: Locator, a: Ponto, b: Ponto) {
  await irPara(page, svg, a);
  await page.mouse.down();
  const tb = await irPara(page, svg, b);
  await page.mouse.up();
  return tb;
}

/** Cria a obra de teste e abre a aba Planta. Sem o seletor nativo de salvar. */
async function abrirPlanta(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
  await page.goto("/");
  await page.getByLabel("Nome", { exact: true }).fill("Obra planta UI");
  await page.getByRole("button", { name: "Criar obra", exact: true }).click();
  await expect(page).toHaveURL(/\/obra$/);
  await page.getByRole("tab", { name: "Planta", exact: true }).click();
  const svg = page.getByRole("application", { name: "Planta do pavimento" });
  await expect(svg).toBeVisible();
  // a vista só enquadra ao abrir; afasta para caber a obra de 8 × 10 m na janela pequena
  await svg.hover();
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  return svg;
}

/** 4 lajes 4×5 m em grade 2×2 (0–8 m × 0–10 m). Vigas e pilares saem da geração. */
const LAJES: [number, number, number, number][] = [
  [0, 0, 4, 5],
  [4, 0, 8, 5],
  [0, 5, 4, 10],
  [4, 5, 8, 10],
];

async function desenharObra(page: Page, svg: Locator) {
  for (const [x1, y1, x2, y2] of LAJES) {
    await page.getByRole("button", { name: "Laje", exact: true }).click();
    await arrastar(page, svg, { x: x1, y: y1 }, { x: x2, y: y2 });
  }
  await page.keyboard.press("v");
}

/** Registra o que a tecla Tab alcança a partir do início da página. */
async function percorrerTab(page: Page, passos: number) {
  const alcancados: string[] = [];
  for (let i = 0; i < passos; i++) {
    await page.keyboard.press("Tab");
    const descricao = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return "nenhum";
      const nome = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "";
      return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""} "${nome}"`;
    });
    alcancados.push(descricao);
  }
  return alcancados;
}

const VIEWPORTS = [
  { nome: "1366x768", largura: 1366, altura: 768 },
  { nome: "1920x1080", largura: 1920, altura: 1080 },
  { nome: "janela-estreita-640x800", largura: 640, altura: 800 },
] as const;

for (const vp of VIEWPORTS) {
  test(`sondagem da planta em ${vp.nome}`, async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SAIDA, { recursive: true });
    await page.setViewportSize({ width: vp.largura, height: vp.altura });

    const erros: string[] = [];
    const dialogos: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
    page.on("dialog", (d) => {
      dialogos.push(`${d.type()}: ${d.message()}`);
      void d.dismiss();
    });

    const svg = await abrirPlanta(page);
    await expect(svg).toBeVisible();
    await page.screenshot({ path: `${SAIDA}/${vp.nome}-01-planta-vazia.png` });

    await desenharObra(page, svg);
    // as 4 lajes 4×5 m aparecem com o rótulo de dimensão; 9 pilares P1–P9
    // exato: o <title> de cada laje traz "L1: 4,00 × 5,00 m, h = …" e não entra na conta
    await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);
    for (let n = 1; n <= 9; n++)
      await expect(svg.getByText(`P${n}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SAIDA}/${vp.nome}-02-quatro-lajes.png` });

    const tab = await percorrerTab(page, 30);
    writeFileSync(`${SAIDA}/${vp.nome}-tab.txt`, tab.join("\n"));
    writeFileSync(`${SAIDA}/${vp.nome}-erros.txt`, erros.join("\n") || "(nenhum)");
    writeFileSync(`${SAIDA}/${vp.nome}-dialogos.txt`, dialogos.join("\n") || "(nenhum)");
  });
}

test("setas selecionam a planta pelo teclado e Delete apaga a laje", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(SAIDA, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(`console: ${m.text()}`);
  });

  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);

  // ao soltar o desenho, a última laje fica selecionada; Escape limpa para a seta partir do início
  await page.keyboard.press("Escape");
  await svg.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Apagar (Delete)" })).toBeVisible();
  await expect(page.locator("aside").getByText("Laje", { exact: true })).toBeVisible();
  // contorno azul da laje selecionada, por cima das vigas
  await expect(svg.locator('rect[fill="none"][stroke="#38bdf8"]')).toHaveCount(1);
  await page.screenshot({ path: `${SAIDA}/teclado-01-selecionada.png` });

  await page.keyboard.press("Delete");
  await expect(page.getByRole("button", { name: "Apagar (Delete)" })).toHaveCount(0);
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(3);
  await page.screenshot({ path: `${SAIDA}/teclado-02-apagada.png` });

  writeFileSync(`${SAIDA}/teclado-erros.txt`, erros.join("\n") || "(nenhum)");
  expect(erros).toEqual([]);
});

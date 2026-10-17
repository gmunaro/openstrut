// Cursor na planta pelo rodapé (`x = … y = … m`), em malha fechada: a escala da vista
// muda quando a planta reenquadra (ao criar um elemento fora da tela, ao abrir a obra),
// e o rodapé mostra o ponto já com snap à grade. Calibrar uma vez e clicar pela conta
// erra o alvo por um passo de grade; irPara corrige pelo rodapé até ele mostrar o alvo.
import { expect, type Locator, type Page } from "@playwright/test";

export type Ponto = { x: number; y: number };

/** Lê o rodapé da planta (`x = … y = … m`), que mostra o ponto do mundo sob o cursor. */
export async function lerRodape(page: Page): Promise<Ponto> {
  const texto = await page.getByText(/^x = /).innerText();
  const m = /x = (-?[\d,.]+)\s+y = (-?[\d,.]+)/.exec(texto);
  if (!m?.[1] || !m[2]) throw new Error(`rodapé da planta sem coordenadas: "${texto}"`);
  return { x: Number(m[1].replace(",", ".")), y: Number(m[2].replace(",", ".")) };
}

/** Move o cursor e espera o React pintar o rodapé antes de ler. */
export async function moverLendo(page: Page, p: Ponto): Promise<Ponto> {
  await page.mouse.move(p.x, p.y);
  await page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );
  return lerRodape(page);
}

/** Escala tela/mundo da planta, medida pelo rodapé nos dois cantos úteis. */
export async function calibrar(page: Page, svg: Locator) {
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
export async function irPara(page: Page, svg: Locator, alvo: Ponto): Promise<Ponto> {
  const cal = await calibrar(page, svg);
  let tela = cal.paraTela(alvo);
  let lido: Ponto = alvo;
  for (let i = 0; i < 4; i++) {
    lido = await moverLendo(page, tela);
    const dx = alvo.x - lido.x;
    const dy = alvo.y - lido.y;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return tela;
    tela = { x: tela.x + dx * cal.escala.x, y: tela.y + dy * cal.escala.y };
  }
  throw new Error(
    `cursor não chegou a (${alvo.x}, ${alvo.y}) m; rodapé mostra (${lido.x}, ${lido.y}) m`,
  );
}

export async function clicar(page: Page, svg: Locator, m: Ponto) {
  const tela = await irPara(page, svg, m);
  await page.mouse.click(tela.x, tela.y);
}

export async function arrastar(page: Page, svg: Locator, a: Ponto, b: Ponto) {
  await irPara(page, svg, a);
  await page.mouse.down();
  const tb = await irPara(page, svg, b);
  await page.mouse.up();
  return tb;
}

/**
 * Seleciona a laje `nome` clicando no centro do rótulo dela na planta (ferramenta Selecionar)
 * e confere pelo painel. O rótulo fica no meio da laje, longe das vigas dos bordos e dos
 * pilares dos cantos, e o ponto sai do próprio SVG: não depende do tamanho da planta na tela.
 */
export async function selecionarLaje(page: Page, nome: string) {
  const svg = page.getByRole("application", { name: "Planta do pavimento" });
  // o <title> da laje começa por "L1: …" e o <text> do nome é irmão dele no <g> da laje
  const rotulo = svg
    .locator("title", { hasText: new RegExp(`^${nome}:`) })
    .locator("xpath=../*[local-name()='text'][1]");
  await page.getByRole("button", { name: "Selecionar", exact: true }).click();
  const b = await rotulo.boundingBox();
  if (!b) throw new Error(`rótulo da laje ${nome} sem caixa na tela`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByRole("complementary").getByLabel("Nome", { exact: true })).toHaveValue(
    nome,
  );
}

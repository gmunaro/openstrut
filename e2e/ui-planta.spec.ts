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
    // a dica (<title>) de cada pilar traz o nome em qualquer escala
    for (let n = 1; n <= 9; n++)
      await expect(svg.locator("title").filter({ hasText: new RegExp(`^P${n}:`) })).toHaveCount(1);
    // o nome visível só aparece com escala >= 30 px/m (ESCALA_NOME_PILAR em Desenho.tsx)
    if (vp.nome !== "janela-estreita-640x800")
      for (let n = 1; n <= 9; n++)
        await expect(svg.getByText(`P${n}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SAIDA}/${vp.nome}-02-quatro-lajes.png` });

    const tab = await percorrerTab(page, 30);
    writeFileSync(`${SAIDA}/${vp.nome}-tab.txt`, tab.join("\n"));
    writeFileSync(`${SAIDA}/${vp.nome}-erros.txt`, erros.join("\n") || "(nenhum)");
    writeFileSync(`${SAIDA}/${vp.nome}-dialogos.txt`, dialogos.join("\n") || "(nenhum)");
  });
}

test("adicionar sem mouse: botão e tecla A abrem o formulário; laje e pilar entram, erro vai ao campo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  mkdirSync(SAIDA, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  const dialogo = page.getByRole("dialog");

  // botão "Adicionar…": laje nova de 2 × 2 m em (10; 0), fora das 4 lajes
  await page.getByRole("button", { name: "Adicionar…", exact: true }).click();
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("x (m)", { exact: true }).fill("10");
  await dialogo.getByLabel("y (m)", { exact: true }).fill("0");
  await dialogo.getByLabel("lx (m)", { exact: true }).fill("2");
  await dialogo.getByLabel("ly (m)", { exact: true }).fill("2");
  await dialogo.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(svg.locator("title").filter({ hasText: /^L\d+: 2,00 × 2,00 m/ })).toHaveCount(1);

  // tecla A (com a planta em foco): pilar sobre a viga do meio (y = 5), em (2; 5)
  await svg.focus();
  await page.keyboard.press("a");
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Tipo", { exact: true }).click();
  await page.getByRole("option", { name: "Pilar", exact: true }).click();
  await expect(dialogo.getByLabel("lx (m)", { exact: true })).toHaveCount(0);
  await dialogo.getByLabel("x (m)", { exact: true }).fill("2");
  await dialogo.getByLabel("y (m)", { exact: true }).fill("5");
  await dialogo.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  // o criado fica selecionado: o painel mostra o centro dele
  await expect(page.getByText("Centro (2,00; 5,00) m", { exact: true })).toBeVisible();

  // recusa do domínio: laje sobre a L1; o texto vai ao campo, ligado por aria-describedby
  await svg.focus();
  await page.keyboard.press("a");
  await dialogo.getByLabel("x (m)", { exact: true }).fill("1");
  await dialogo.getByLabel("y (m)", { exact: true }).fill("1");
  await dialogo.getByLabel("lx (m)", { exact: true }).fill("2");
  await dialogo.getByLabel("ly (m)", { exact: true }).fill("2");
  await dialogo.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel("x (m)", { exact: true })).toHaveAccessibleDescription(
    "A laje se sobrepõe à L1.",
  );

  // campo vazio: não chega ao domínio, vira "Valor numérico inválido."
  await dialogo.getByLabel("y (m)", { exact: true }).fill("");
  await dialogo.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(dialogo.getByLabel("y (m)", { exact: true })).toHaveAccessibleDescription(
    "Valor numérico inválido.",
  );

  // Cancelar fecha sem gravar: a laje 2 × 2 em (1; 1) não entra na planta
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(svg.locator("title").filter({ hasText: /^L\d+: 2,00 × 2,00 m/ })).toHaveCount(1);
});

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

/** Espera o React pintar a última alteração de estado (dois quadros de animação). */
async function pintar(page: Page) {
  await page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );
}

/** Grava observações da sondagem em `${SAIDA}/${nome}.txt`. Não são asserções. */
function anotar(nome: string, linhas: string[]) {
  mkdirSync(SAIDA, { recursive: true });
  writeFileSync(`${SAIDA}/${nome}.txt`, linhas.join("\n") || "(vazio)");
}

test("propriedades: Enter grava, Esc descarta, erro no campo, sobreposição e Ctrl+Z", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  await page.keyboard.press("v");
  await clicar(page, svg, { x: 2, y: 2.5 });

  const painel = page.locator("aside");
  const lx = painel.getByLabel(/^lx/);
  await expect(lx).toHaveValue(/^4([,.]0+)?$/);

  await lx.fill("3");
  await lx.press("Enter");
  await expect(svg.getByText("3,00 × 5,00", { exact: true })).toHaveCount(1);

  await lx.fill("2");
  await lx.press("Escape");
  await expect(lx).toHaveValue(/^3([,.]0+)?$/);
  await expect(svg.getByText("3,00 × 5,00", { exact: true })).toHaveCount(1);
  await expect(painel.getByText("Laje", { exact: true })).toBeVisible();

  await lx.fill("abc");
  await lx.press("Enter");
  await expect(page.getByText("Número inválido.", { exact: true })).toBeVisible();
  await expect(lx).toHaveAttribute("aria-invalid", "true");
  // o erro é o texto apontado por aria-describedby, e fica fora do nome do campo
  const idErro = await lx.getAttribute("aria-describedby");
  expect(idErro).not.toBeNull();
  await expect(page.locator(`[id="${idErro}"]`)).toHaveText("Número inválido.");
  await expect(painel.getByLabel(/^lx/)).toHaveAccessibleName(/^lx/);
  expect(
    (await lx.evaluate((el) => el.closest("label")?.textContent ?? "")).includes("Número"),
  ).toBe(false);

  // abaixo do vão mínimo (0,1 m): o campo marca erro e não grava
  await lx.fill("0,05");
  await lx.press("Enter");
  await expect(lx).toHaveAttribute("aria-invalid", "true");
  await expect(svg.getByText("3,00 × 5,00", { exact: true })).toHaveCount(1);

  // invade L2 (x de 4 a 8 m): a mensagem de sobreposição nomeia a laje
  await lx.fill("6");
  await lx.press("Enter");
  await expect(page.getByText("A laje se sobrepõe à L2.", { exact: true })).toBeVisible();

  await lx.fill("4");
  await lx.press("Enter");
  await expect(lx).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByText("A laje se sobrepõe à L2.", { exact: true })).toHaveCount(0);
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);

  // Ctrl+Z com o foco fora do campo desfaz a última gravação válida (4 m → 3 m)
  await painel.getByText("Laje", { exact: true }).click();
  await page.keyboard.press("Control+z");
  await expect(svg.getByText("3,00 × 5,00", { exact: true })).toHaveCount(1);

  expect(erros).toEqual([]);
});

test("pavimentos: criar, renomear, recusar nome repetido, repetir e apagar", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const erros: string[] = [];
  const dialogos: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("dialog", (d) => {
    dialogos.push(`${d.type()}: ${d.message()}`);
    void d.accept();
  });

  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);

  const nav = page.getByRole("navigation", { name: "Pavimentos" });
  // botões de pavimento não têm aria-label; os de ação (Novo, Subir, Apagar...) têm
  const pavimentos = nav.locator("button:not([aria-label])");
  const novo = page.getByRole("button", { name: "Novo pavimento", exact: true });
  const nome = page.getByLabel("Nome", { exact: true });
  await expect(pavimentos).toHaveCount(1);

  await novo.click();
  await expect(pavimentos).toHaveCount(2);
  await nome.fill("Cobertura");
  await nome.press("Enter");
  await expect(nav.getByRole("button", { name: /^Cobertura/ })).toBeVisible();

  await novo.click();
  await expect(pavimentos).toHaveCount(3);
  await nome.fill("Cobertura");
  await nome.press("Enter");
  await expect(page.getByText(/Já existe um pavimento/)).toBeVisible();
  // com erro, o texto da mensagem entra no nome acessível do campo: o nome exato deixa de achar
  anotar("pavimentos-nome-com-erro", [
    `getByLabel exato "Nome": ${await page.getByLabel("Nome", { exact: true }).count()}`,
    `getByLabel /^Nome/: ${await page.getByLabel(/^Nome/).count()}`,
  ]);
  await page.getByLabel(/^Nome/).fill("Tipo");
  await page.getByLabel(/^Nome/).press("Enter");
  await expect(nav.getByRole("button", { name: /^Tipo/ })).toBeVisible();

  const repeticoes = page.getByLabel("Repetições", { exact: true });
  await repeticoes.fill("3");
  await repeticoes.press("Enter");
  await expect(nav.getByRole("button", { name: /^Tipo/ })).toContainText("×3");

  // pé-direito zero: registra o que o usuário vê (hipótese i), sem asserção
  // o rótulo inclui a unidade "m" (span dentro do label): o nome acessível é "Pé-direito m"
  const peDireito = page.getByLabel(/^Pé-direito/);
  await peDireito.fill("0");
  await peDireito.press("Enter");
  anotar("pavimentos-pe-direito", [
    `aria-invalid=${(await peDireito.getAttribute("aria-invalid")) ?? "(ausente)"}`,
    `valor no campo=${await peDireito.inputValue()}`,
  ]);

  // a lista vai do topo à base: o último é o pavimento original, com a planta desenhada
  await pavimentos.last().click();
  await page.getByRole("button", { name: "Apagar pavimento", exact: true }).click();
  await expect(pavimentos).toHaveCount(2);
  anotar("pavimentos-confirmacao", dialogos);
  expect(dialogos.join("\n")).toMatch(/lajes/);
  expect(erros).toEqual([]);
});

test("zoom com a roda muda a escala e volta ao girar de volta", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);

  const e0 = (await calibrar(page, svg)).escala.x;
  await svg.hover();
  await page.mouse.wheel(0, -300);
  await pintar(page);
  const e1 = (await calibrar(page, svg)).escala.x;
  expect(e1).toBeGreaterThan(e0 * 1.2);

  await svg.hover();
  await page.mouse.wheel(0, 300);
  await pintar(page);
  const e2 = (await calibrar(page, svg)).escala.x;
  expect(Math.abs(e2 - e0) / e0).toBeLessThan(0.02);
});

test("atalhos V, L, P trocam a ferramenta; Ctrl+Z e Ctrl+Y desfazem e refazem", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));

  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  const ferramenta = (nome: RegExp) => page.getByRole("button", { name: nome }).first();

  await page.keyboard.press("l");
  await expect(ferramenta(/^Laje/)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("p");
  await expect(ferramenta(/^Pilar/)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  await expect(ferramenta(/^Selec/)).toHaveAttribute("aria-pressed", "true");

  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);
  await svg.focus();
  await page.keyboard.press("Control+z");
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(3);
  await page.keyboard.press("Control+y");
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);

  expect(erros).toEqual([]);
});

test("erros de geometria: sobreposição e pilar fora de viga aparecem na mensagem de status", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  const mensagem = page.getByRole("status").first();

  // laje desenhada sobre L1 é recusada
  await page.getByRole("button", { name: "Laje", exact: true }).click();
  await arrastar(page, svg, { x: 1, y: 1 }, { x: 3, y: 3 });
  await expect(mensagem).toContainText("A laje se sobrepõe à L1.");
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);

  // pilar no miolo de uma laje, sem viga: recusado
  await page.getByRole("button", { name: /^Pilar/ }).click();
  await clicar(page, svg, { x: 2, y: 2.5 });
  await expect(mensagem).toContainText("O pilar precisa ficar sobre o eixo de uma viga.");

  // tempo que a mensagem fica na tela (observação; o código tem 7 s)
  // o span só existe enquanto há mensagem: some do DOM quando o timer limpa
  const t0 = Date.now();
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  anotar("erros-geometria-tempo", [
    `mensagem sumiu após ${Date.now() - t0} ms, medido a partir da leitura (o código tem 7000 ms)`,
  ]);
});

test("Shift+setas movem a laje e o pilar selecionados em um passo de grade; erro aparece em status", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  const painel = page.locator("aside");
  const mensagem = page.getByRole("status").first();

  // pilar: o central, em (4, 5) m, sobre o eixo de uma viga. Vem primeiro: mover laje cria
  // pilares nos cantos novos, e isso mudaria a numeração e o ponto de destino.
  const centro = painel.getByText(/^Centro \(/);
  await clicar(page, svg, { x: 4, y: 5 });
  await expect(centro).toHaveText("Centro (4,00; 5,00) m");
  await svg.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(centro).toHaveText("Centro (3,50; 5,00) m");

  // para cima sai do eixo da viga: recusado, com a mensagem de geometria em status
  await page.keyboard.press("Shift+ArrowUp");
  await expect(mensagem).toContainText("O pilar precisa ficar sobre o eixo de uma viga.");
  await expect(centro).toHaveText("Centro (3,50; 5,00) m");

  // a seta sem Shift só navega: troca a seleção e não move o pilar
  await page.keyboard.press("ArrowUp");
  await expect(centro).not.toHaveText("Centro (3,50; 5,00) m");
  await clicar(page, svg, { x: 3.5, y: 5 });
  await expect(centro).toHaveText("Centro (3,50; 5,00) m");
  await svg.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(centro).toHaveText("Centro (4,00; 5,00) m");

  // laje: L1 (0–4 m × 0–5 m). Passo padrão da grade é 0,5 m.
  await clicar(page, svg, { x: 2, y: 2.5 });
  const x = painel.getByLabel(/^x/);
  await expect(x).toHaveValue(/^0([,.]0+)?$/);
  await svg.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(x).toHaveValue(/^-0([,.]5)0*$/);
  await expect(svg.getByText("4,00 × 5,00", { exact: true })).toHaveCount(4);

  // empurrar L1 de volta para x = 0 não sobrepõe nada
  await page.keyboard.press("Shift+ArrowRight");
  await expect(x).toHaveValue(/^0([,.]0+)?$/);

  // para x = 0,5 m, L1 invade L2 (x de 4 a 8 m): recusado, posição fica e a mensagem aparece em status
  await page.keyboard.press("Shift+ArrowRight");
  await expect(mensagem).toContainText("A laje se sobrepõe à L2.");
  await expect(x).toHaveValue(/^0([,.]0+)?$/);

  expect(erros).toEqual([]);
});

test("cálculo nos dois modos: a aba Resultados mostra o total nos modos Corrigido e original", async ({
  page,
}) => {
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

  // modo padrão: Corrigido
  await page.getByRole("tab", { name: "Resultados" }).click();
  const resultados = page.getByRole("tabpanel", { name: "Resultados" });
  await expect(resultados.getByRole("heading", { level: 3, name: "Total da obra" })).toBeVisible();
  // o modo aparece no Relatório
  await page.getByRole("tab", { name: "Relatório" }).click();
  const relatorio = page.getByRole("tabpanel", { name: "Relatório" });
  await expect(relatorio.getByText("Modo de cálculo: Corrigido", { exact: true })).toBeVisible();

  // troca para o modo original pelo teclado no switch e aplica
  await page.getByRole("button", { name: /Materiais/ }).click();
  const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
  await dialogo.getByRole("switch", { name: "Modo de cálculo Como o SISTRUT original" }).focus();
  await page.keyboard.press("Space");
  await dialogo.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialogo).toHaveCount(0);

  await page.getByRole("tab", { name: "Relatório" }).click();
  await expect(relatorio.getByText(/^Modo de cálculo: Como o SISTRUT original/)).toBeVisible();
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(resultados.getByRole("heading", { level: 3, name: "Total da obra" })).toBeVisible();
  await page.screenshot({ path: `${SAIDA}/calculo-resultados-original.png` });

  writeFileSync(`${SAIDA}/calculo-erros.txt`, erros.join("\n") || "(nenhum)");
  expect(erros).toEqual([]);
});

test("pavimentos: pé-direito e repetições inválidos mostram a mensagem no campo", async ({
  page,
}) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await abrirPlanta(page);

  // repetições 1,5: recusa com mensagem ligada ao campo; o nome acessível fica "Repetições"
  const repeticoes = page.getByLabel("Repetições", { exact: true });
  await repeticoes.fill("1,5");
  await repeticoes.press("Enter");
  await expect(repeticoes).toHaveAttribute("aria-invalid", "true");
  await expect(repeticoes).toHaveAccessibleDescription("Use um número inteiro de 1 ou mais.");
  await repeticoes.press("Escape");
  await expect(repeticoes).toHaveAttribute("aria-invalid", "false");
  await expect(repeticoes).not.toHaveAccessibleDescription(/inteiro/);

  // pé-direito 0: mesma coisa, com a mensagem do pé-direito
  const peDireito = page.getByLabel("Pé-direito", { exact: true });
  await peDireito.fill("0");
  await peDireito.press("Enter");
  await expect(peDireito).toHaveAttribute("aria-invalid", "true");
  await expect(peDireito).toHaveAccessibleDescription("O pé-direito precisa ser maior que zero.");

  // texto que não é número: mensagem própria
  await peDireito.fill("abc");
  await peDireito.press("Enter");
  await expect(peDireito).toHaveAccessibleDescription("Valor numérico inválido.");

  // valor aceito: a mensagem some e o valor fica
  await peDireito.fill("2,85");
  await peDireito.press("Enter");
  await expect(peDireito).toHaveAttribute("aria-invalid", "false");
  await expect(peDireito).toHaveValue("2,85");
  expect(erros).toEqual([]);
});

test("sondagem: Backspace apaga a laje selecionada?", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);
  await page.keyboard.press("Escape");
  await svg.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Apagar (Delete)" })).toBeVisible();
  await page.keyboard.press("Backspace");
  await pintar(page);
  const restantes = await svg.getByText("4,00 × 5,00", { exact: true }).count();
  anotar("backspace", [
    `Após Backspace com laje selecionada: ${restantes} rótulos 4,00 × 5,00 (4 antes).`,
    restantes === 4 ? "Backspace não apaga; só Delete." : "Backspace apagou a laje.",
  ]);
});

/** Confere se a laje `nome` (pelo título dela) cabe inteira na área visível da planta. */
async function lajeCabe(page: Page, nome: string) {
  const svg = page.getByRole("application", { name: "Planta do pavimento" });
  // o título fica dentro do <g> da laje: o retângulo do <g> é o que tem de caber
  const lajeG = svg.locator("title", { hasText: new RegExp(`^${nome}:`) }).locator("xpath=..");
  const [a, s] = [await lajeG.boundingBox(), await svg.boundingBox()];
  if (!a || !s) throw new Error(`laje ${nome} ou planta sem caixa na tela`);
  return (
    a.x >= s.x && a.y >= s.y && a.x + a.width <= s.x + s.width && a.y + a.height <= s.y + s.height
  );
}

test("reenquadrar: laje que termina fora da área visível volta para a tela; a obra reaberta mostra tudo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const svg = await abrirPlanta(page);
  await desenharObra(page, svg);

  // L5 começa à direita das 4 lajes e termina além da borda da planta: o arrasto segue
  // dentro da janela (o ponteiro é capturado pela planta), mas o retângulo sai da área visível
  await page.getByRole("button", { name: "Laje", exact: true }).click();
  const inicio = await irPara(page, svg, { x: 9, y: 0 });
  const borda = await svg.boundingBox();
  if (!borda) throw new Error("planta sem caixa na tela");
  await page.mouse.down();
  await page.mouse.move(borda.x + borda.width + 120, inicio.y - 100, { steps: 5 });
  await page.mouse.up();
  await expect(svg.locator("title").filter({ hasText: /^L5:/ })).toHaveCount(1);
  await expect.poll(() => lajeCabe(page, "L5")).toBe(true);

  // a obra é salva no rascunho com debounce de 800 ms; espera antes de sair da página
  await page.waitForTimeout(1200);
  await page.goto("/");
  await page.getByRole("button", { name: /^Obra planta UI/ }).click();
  await expect(page).toHaveURL(/\/obra$/);
  await page.getByRole("tab", { name: "Planta", exact: true }).click();
  await expect(page.getByRole("application", { name: "Planta do pavimento" })).toBeVisible();
  await expect(
    page
      .getByRole("application", { name: "Planta do pavimento" })
      .locator("title", { hasText: /^L5:/ }),
  ).toHaveCount(1);
  await expect.poll(() => lajeCabe(page, "L5")).toBe(true);
});

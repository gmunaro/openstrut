// Fluxo NBR 6118:2023 de ponta a ponta, pela tela. Cada passo gera um print em
// e2e/prints/6118/. Os valores de resultado são lidos da tela e gravados em texto
// para conferência à mão (ver relatório da rodada).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const PRINTS = "e2e/prints/6118";

type Ponto = { x: number; y: number };

/** Ponto do mundo (m) sob o cursor, lido do rodapé da planta (`x = … y = … m`). */
async function mundoSobCursor(page: Page, p: Ponto): Promise<Ponto> {
  await page.mouse.move(p.x, p.y);
  const texto = await page.getByText(/^x = /).innerText();
  const m = /x = (-?[\d,.]+)\s+y = (-?[\d,.]+)/.exec(texto);
  if (!m?.[1] || !m[2]) throw new Error(`rodapé da planta sem coordenadas: "${texto}"`);
  return { x: Number(m[1].replace(",", ".")), y: Number(m[2].replace(",", ".")) };
}

/** Devolve a função mundo (m) → tela (px) da planta, calibrada pelo rodapé. */
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
  const t = await calibrar(page, svg);
  const p = t(m);
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

test.setTimeout(300_000);

test("fluxo NBR 6118:2023 de ponta a ponta", async ({ page }) => {
  mkdirSync(PRINTS, { recursive: true });
  let n = 0;
  const foto = async (descricao: string) => {
    n += 1;
    const nome = `${String(n).padStart(2, "0")}-${descricao}.png`;
    await page.screenshot({ path: `${PRINTS}/${nome}`, fullPage: true });
  };

  // O Chrome abre o seletor nativo de arquivo no "Salvar", que o Playwright não
  // automatiza. Sem essa função o app cai no download (mesmo caminho de baixarArquivo).
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });

  // 1. Tela inicial: criar obra NBR 6118:2023 ----------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OpenStrut V2" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill("Residência Teste 6118");
  await page.getByRole("combobox", { name: "Norma" }).click();
  await page.getByRole("option", { name: "NBR 6118:2023", exact: true }).click();
  await foto("inicio-obra-nova-preenchida");
  await page.getByRole("button", { name: "Criar obra", exact: true }).click();
  await expect(page).toHaveURL(/\/obra$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Residência Teste 6118");
  await foto("obra-criada");

  // 1b. Materiais: fck e aço ---------------------------------------------------
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
  await expect(dialogo).toBeVisible();
  await foto("materiais-padrao");
  const fck = dialogo.getByLabel("fck (MPa)", { exact: true });
  await fck.fill("30");
  await dialogo.getByRole("combobox", { name: "Aço longitudinal" }).click();
  await page.getByRole("option", { name: "CA-50", exact: true }).click();
  await foto("materiais-fck-30-ca50");
  await dialogo.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  // O app reexibe o número no formato pt-BR ("30,0").
  await expect(dialogo.getByLabel("fck (MPa)", { exact: true })).toHaveValue(/^30([,.]0)?$/);
  await foto("materiais-reaberto-com-fck-30");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();

  // 2. Planta: 2 lajes, pilares, repetição do pavimento ------------------------
  await page.getByRole("tab", { name: "Planta", exact: true }).click();
  const svg = page.getByRole("application", { name: "Planta do pavimento" });
  await expect(svg).toBeVisible();
  await foto("planta-vazia");

  await page.getByRole("button", { name: "Laje", exact: true }).click();
  await arrastar(page, svg, { x: 0, y: 0 }, { x: 4, y: 5 });
  await foto("laje-1-desenhada-4x5");

  await page.getByRole("button", { name: "Laje", exact: true }).click();
  await arrastar(page, svg, { x: 4, y: 0 }, { x: 8, y: 5 });
  await foto("laje-2-desenhada-4x5-vizinha");

  await page.getByRole("button", { name: "Pilar", exact: true }).click();
  await clicar(page, svg, { x: 2, y: 2 });
  await expect(page.getByRole("status").filter({ hasText: "pilar precisa" })).toBeVisible();
  await foto("pilar-fora-do-eixo-recusado");
  await clicar(page, svg, { x: 2, y: 0 });
  await foto("pilar-sobre-viga-adicionado");

  await page.keyboard.press("v");
  await clicar(page, svg, { x: 2, y: 2.5 });
  await foto("laje-1-selecionada-propriedades");

  const repeticoes = page.getByLabel(/Repetições/);
  await repeticoes.fill("3");
  await repeticoes.press("Enter");
  await foto("pavimento-1-repete-3x");

  await page.getByRole("button", { name: "Novo pavimento" }).click();
  await page.getByRole("combobox", { name: "Copiar planta de outro pavimento" }).click();
  await page.getByRole("option", { name: /^Pavimento 1/ }).click();
  await foto("pavimento-2-copia-planta-1");

  // 3. Resultados: cada aba de resultados ----------------------------------------
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pilares", exact: true })).toBeVisible();
  await foto("resultados-completo");
  const textoResultados = await page.locator('[role="tabpanel"]:visible').innerText();
  writeFileSync(`${PRINTS}/texto-resultados.txt`, textoResultados);
  expect.soft(textoResultados).not.toMatch(/NaN|undefined|Infinity/);

  await page.getByRole("tab", { name: "Relatório", exact: true }).click();
  await foto("relatorio");
  const textoRelatorio = await page.locator('[role="tabpanel"]:visible').innerText();
  writeFileSync(`${PRINTS}/texto-relatorio.txt`, textoRelatorio);
  expect.soft(textoRelatorio).not.toMatch(/NaN|undefined|Infinity/);

  // 4. Exportações ----------------------------------------------------------------
  const dxfFormas = page.getByRole("button", { name: "Exportar DXF (formas)", exact: true });
  const dxfArmacao = page.getByRole("button", { name: "Exportar DXF (armação)", exact: true });
  await expect(dxfArmacao).toBeEnabled();
  await foto("exportacoes-botoes");

  const [dlFormas] = await Promise.all([page.waitForEvent("download"), dxfFormas.click()]);
  await dlFormas.saveAs(`${PRINTS}/${dlFormas.suggestedFilename()}`);
  expect(dlFormas.suggestedFilename()).toMatch(/formas\.dxf$/);

  const [dlArmacao] = await Promise.all([page.waitForEvent("download"), dxfArmacao.click()]);
  await dlArmacao.saveAs(`${PRINTS}/${dlArmacao.suggestedFilename()}`);
  expect(dlArmacao.suggestedFilename()).toMatch(/armação\.dxf$/);

  const [dlSalvo] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Salvar", exact: true }).click(),
  ]);
  await dlSalvo.saveAs(`${PRINTS}/${dlSalvo.suggestedFilename()}`);
  expect(dlSalvo.suggestedFilename()).toMatch(/\.openstrut\.json$/);
  const arquivo = JSON.parse(readFileSync(`${PRINTS}/${dlSalvo.suggestedFilename()}`, "utf8"));
  expect(arquivo.norma ?? arquivo.obra?.norma).toBe("nbr6118-2023");
  await foto("exportacoes-concluidas");

  // 5. Casos de erro ----------------------------------------------------------------
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  const aplicar = dialogo.getByRole("button", { name: "Aplicar", exact: true });
  await fck.fill("-5");
  await aplicar.click();
  await expect(dialogo.getByRole("alert")).toContainText("fck: informe um número maior que zero.");
  await foto("erro-fck-negativo");

  // Vazio e texto caem na mesma mensagem do negativo; o diálogo ficar aberto prova o bloqueio.
  await fck.fill("");
  await aplicar.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("alert")).toContainText("fck: informe um número maior que zero.");
  await foto("erro-fck-vazio");

  await fck.fill("abc");
  await aplicar.click();
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("alert")).toContainText("fck: informe um número maior que zero.");
  await foto("erro-fck-texto");

  await fck.fill("30");
  await dialogo.getByLabel(/Cobrimento da laje/).fill("-1");
  await aplicar.click();
  await expect(dialogo.getByRole("alert")).toContainText("maior ou igual a zero");
  await foto("erro-cobrimento-negativo");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.getByRole("tab", { name: "Planta", exact: true }).click();
  const pe = page.getByLabel(/Pé-direito/);
  await pe.fill("-3");
  await pe.press("Enter");
  await expect(pe).toHaveAttribute("aria-invalid", "true");
  await foto("erro-pe-direito-negativo");
  await pe.press("Escape");

  await page.getByRole("button", { name: /^Pavimento 1/ }).click();
  await page.keyboard.press("v");
  await clicar(page, svg, { x: 2, y: 2.5 });
  const espessura = page.getByLabel(/Espessura h/);
  await espessura.fill("abc");
  await espessura.press("Enter");
  await expect(espessura).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Digite um número, com vírgula ou ponto decimal.")).toBeVisible();
  await foto("erro-espessura-laje-texto");
  await espessura.press("Escape");

  // laje sem apoio: fora das vigas, em área livre do desenho
  await page.getByRole("button", { name: "Enquadrar tudo", exact: true }).click();
  await svg.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Laje", exact: true }).click();
  await arrastar(page, svg, { x: 10, y: 0 }, { x: 12, y: 3 });
  await page.keyboard.press("v");
  await clicar(page, svg, { x: 11, y: 1.5 });
  await foto("laje-sem-apoio-desenhada");

  // Os quatro bordos viram "livre (sem viga)": nenhuma viga sustenta a laje.
  const painel = page.locator("aside");
  for (const bordo of ["Esquerdo", "Inferior", "Direito", "Superior"]) {
    await painel.getByLabel(bordo).selectOption("livre");
  }
  await expect(painel.getByLabel("Esquerdo")).toHaveValue("livre");
  await foto("laje-sem-apoio-bordos-livres");
  writeFileSync(`${PRINTS}/texto-painel-laje-sem-apoio.txt`, await painel.innerText());

  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await foto("resultados-com-laje-sem-apoio");
  const textoSemApoio = await page.locator('[role="tabpanel"]:visible').innerText();
  writeFileSync(`${PRINTS}/texto-resultados-laje-sem-apoio.txt`, textoSemApoio);
  expect(textoSemApoio).toMatch(/Laje L\d+ sem cálculo: a carga dela \([\d.,]+ kN\) NÃO chegou/);
});

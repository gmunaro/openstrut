// Vista 3D (src/telas/obra3d): abre, gira, seleciona, oculta, explode e navega pelas
// partes, sem erro no console, numa obra de 3 pavimentos feita pela API do domínio e
// numa obra do oráculo de vários pavimentos importada do SISTRUT (os arquivos da obra
// E2E do oráculo em três pavimentos, empilhados por um .COL, como a fixture PREDIO do
// importador). Rode com PORT=4407 bun x playwright test e2e/vista3d.spec.ts.
// As fotos da obra do oráculo vão para docs/vista-3d/ (entram no repositório); as da
// obra de 3 pavimentos, para e2e/prints/vista3d/.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";
import {
  arquivo,
  colPredio,
  comNome,
  SO_BURACOS,
} from "../src/telas/__fixtures__/predioSistrut";

const DOCS = path.resolve(process.cwd(), "docs/vista-3d");
const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d");
fs.mkdirSync(DOCS, { recursive: true });
fs.mkdirSync(PRINTS, { recursive: true });

// WebGL por software no Chrome sem GPU (CI e headless)
test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

/** Obra NBR 6118 de 3 pavimentos: 4 lajes 4 × 5 m por pavimento, estrutura gerada. */
function obraTresPavimentos() {
  const obra = obraNova("Três pavimentos", "nbr6118-2023");
  obra.pavimentos = ["Cobertura", "Tipo", "Primeiro"].map((nome) => {
    const pav = pavimentoNovo(nome, 3, 1);
    for (const r of [
      { x: 0, y: 0, lx: 4, ly: 5 },
      { x: 4, y: 0, lx: 4, ly: 5 },
      { x: 0, y: 5, lx: 4, ly: 5 },
      { x: 4, y: 5, lx: 4, ly: 5 },
    ])
      pav.lajes.push(lajeNova(pav, r));
    return gerarEstrutura(pav);
  });
  return serializarObra(obra);
}

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
].map((a) => ({ name: a.nome, mimeType: "application/octet-stream", buffer: Buffer.from(a.dados) }));

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

async function abrirObraJson(page: Page, texto: string) {
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown };
    delete w.showOpenFilePicker;
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles({
    name: "tres.openstrut.json",
    mimeType: "application/json",
    buffer: Buffer.from(texto),
  });
  await expect(page).toHaveURL(/\/obra$/);
}

async function importarPredio(page: Page) {
  await page.goto("/");
  await page.getByLabel("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)").setInputFiles(PREDIO_ORACULO);
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

type Cena = {
  modelo: {
    niveis: { nome: string; cota: number }[];
    elementos: { chave: string; tipo: string; nome: string; nivel: number }[];
  };
  selecao: string | null;
  camera: { position: { x: number; y: number; z: number } };
  cena: { traverse: (f: (o: { name: string; visible: boolean; isMesh?: boolean }) => void) => void };
  grupoDoNivel: (i: number) => { position: { y: number } } | undefined;
  pontoNaTela: (k: string) => { x: number; y: number } | undefined;
};
const cena = <T,>(page: Page, f: (c: Cena) => T) =>
  page.evaluate(
    // a função vai como texto para a página
    (fonte) => new Function("c", `return (${fonte})(c)`)((window as unknown as { __vista3d: Cena }).__vista3d),
    f.toString(),
  ) as Promise<T>;

/** Clica no centro do elemento na tela. */
async function clicarElemento(page: Page, chave: string, toque = false) {
  const p = await page.evaluate(
    (k) => (window as unknown as { __vista3d: Cena }).__vista3d.pontoNaTela(k),
    chave,
  );
  const caixa = await page.getByTestId("vista-3d").locator("canvas").boundingBox();
  if (!p || !caixa) throw new Error("sem ponto na tela");
  if (toque) await page.touchscreen.tap(caixa.x + p.x, caixa.y + p.y);
  else await page.mouse.click(caixa.x + p.x, caixa.y + p.y);
}

const trilha = (page: Page) => page.getByRole("navigation", { name: "Trilha da vista 3D" });

test("obra de 3 pavimentos: gira, seleciona, oculta e explode, sem erro no console", async ({ page }) => {
  test.setTimeout(120_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);

  // o prédio inteiro ao abrir: 3 níveis empilhados de 3 em 3 m
  const niveis = await cena(page, (c) => c.modelo.niveis.map((n) => [n.nome, n.cota]));
  expect(niveis).toEqual([
    ["Primeiro", 3],
    ["Tipo", 6],
    ["Cobertura", 9],
  ]);
  await expect(trilha(page)).toHaveText("Prédio");

  // girar: arrastar muda a câmera
  const antes = await cena(page, (c) => ({ ...c.camera.position }));
  const canvas = page.getByTestId("vista-3d").locator("canvas");
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 160, b.y + b.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const depois = await cena(page, (c) => ({ ...c.camera.position }));
  expect(Math.hypot(depois.x - antes.x, depois.z - antes.z)).toBeGreaterThan(0.5);

  // selecionar: clique na laje L1 da cobertura mostra o nome e o resultado
  const laje = await cena(page, (c) =>
    c.modelo.elementos.find((e) => e.tipo === "laje" && e.nivel === 2 && e.nome === "L4"),
  );
  await clicarElemento(page, laje!.chave);
  const cartao = page.getByRole("region", { name: /Elemento selecionado/ });
  await expect(cartao.getByRole("heading", { name: "Laje L4" })).toBeVisible();
  await expect(cartao).toContainText("Cobertura");
  await expect(cartao).toContainText(/mx = .* kN·m\/m/);
  await page.screenshot({ path: path.join(PRINTS, "3pav-selecao-1366.png") });

  // ocultar as lajes: a malha sólida das lajes some
  await page.getByRole("button", { name: "Lajes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lajes", exact: true })).toHaveAttribute("aria-pressed", "false");
  await quadros(page);
  const lajesVisiveis = await cena(page, (c) => {
    let n = 0;
    c.cena.traverse((o) => {
      if (o.isMesh && / laje$/.test(o.name) && o.visible) n++;
    });
    return n;
  });
  expect(lajesVisiveis).toBe(0);
  await page.getByRole("button", { name: "Lajes", exact: true }).click();

  // explodido afasta os níveis
  await page.getByRole("button", { name: "Explodido" }).click();
  await page.waitForTimeout(1200);
  const desloc = await cena(page, (c) => [0, 1, 2].map((i) => c.grupoDoNivel(i)?.position.y ?? -1));
  expect(desloc[0]).toBe(0);
  expect(desloc[1]).toBeGreaterThan(1);
  expect(desloc[2]).toBeGreaterThan(desloc[1]!);
  await page.screenshot({ path: path.join(PRINTS, "3pav-explodido-1366.png") });

  // teclado: as vistas são botões comuns
  const topo = page.getByRole("button", { name: "Topo" });
  await topo.focus();
  await page.keyboard.press("Enter");
  await expect(topo).toHaveAttribute("aria-pressed", "true");

  // "Ver na planta" leva à aba Planta com o pavimento do elemento
  await page.getByRole("button", { name: "Ver na planta" }).click();
  await expect(page.getByRole("tab", { name: "Planta" })).toHaveAttribute("aria-selected", "true");

  expect(erros).toEqual([]);
});

test.describe("obra do oráculo de vários pavimentos, importada do SISTRUT", () => {
  test("todo e partes, com trilha de volta, camada de corte e exportação", async ({ page }) => {
    test.setTimeout(180_000);
    const erros = vigiarErros(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await importarPredio(page);
    await abrir3d(page);
    const foto = (nome: string) => page.screenshot({ path: path.join(DOCS, `${nome}.png`) });

    // montagem automática: os 3 pavimentos pelas cotas do .COL, a escada fora do prédio
    expect(await cena(page, (c) => c.modelo.niveis.map((n) => [n.nome, n.cota]))).toEqual([
      ["TER", 0.4],
      ["TIPO", 3.4],
      ["COB", 6.4],
    ]);
    await expect(page.getByRole("complementary", { name: "Controles da vista 3D" })).toContainText(
      /ESCADA: .* sem posição deduzível/,
    );
    await foto("todo-1366");

    // pavimento isolado, com os vizinhos transparentes
    await page.getByLabel("Pavimento isolado").selectOption({ label: "TIPO" });
    await expect(trilha(page)).toHaveText(/Prédio.*TIPO/);
    await page.waitForTimeout(700);
    await foto("pavimento-1366");

    // viga isolada com os vizinhos; a trilha volta ao nível e ao prédio
    const v = await cena(page, (c) =>
      c.modelo.elementos.find((e) => e.tipo === "viga" && e.nivel === 2 && e.nome === "V2"),
    );
    await page.getByLabel("Elemento (com os vizinhos)").selectOption(v!.chave);
    await expect(trilha(page)).toHaveText(/Prédio.*COB.*V2/);
    await expect(page.getByRole("region", { name: "Elemento selecionado: V2" })).toBeVisible();
    await page.waitForTimeout(700);
    await foto("viga-com-vizinhos-1366");
    await trilha(page).getByRole("button", { name: "COB" }).click();
    await expect(trilha(page)).toHaveText(/Prédio.*COB$/);

    // pilar: a coluna inteira, da fundação ao topo
    const p = await cena(page, (c) =>
      c.modelo.elementos.find((e) => e.tipo === "pilar" && e.nivel === 1 && e.nome === "P5"),
    );
    await page.getByLabel("Elemento (com os vizinhos)").selectOption(p!.chave);
    await expect(trilha(page)).toHaveText(/Prédio.*Coluna P5/);
    await page.waitForTimeout(700);
    await foto("coluna-1366");

    // pórtico: o corte vertical num eixo da planta
    const eixo = await page
      .getByLabel("Pórtico (eixo da planta)")
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await page.getByLabel("Pórtico (eixo da planta)").selectOption(eixo!);
    await expect(trilha(page)).toHaveText(/Prédio.*Eixo/);
    await page.waitForTimeout(700);
    await foto("portico-1366");
    await trilha(page).getByRole("button", { name: "Prédio" }).click();
    await expect(trilha(page)).toHaveText("Prédio");

    // camada de corte (ponto de extensão): carrega sob demanda e mostra o painel
    await page.getByRole("button", { name: "Corte por pavimento" }).click();
    await expect(page.getByLabel("Cortar acima do pavimento")).toBeVisible();
    await page.getByLabel("Cortar acima do pavimento").selectOption({ label: "TIPO (+3,40 m)" });
    await page.waitForTimeout(300);
    await foto("corte-1366");
    await page.getByRole("button", { name: "Corte por pavimento" }).click();

    // mapa de cor por grandeza, com legenda
    await page.getByLabel("Cor dos elementos").selectOption("nkPilares");
    await expect(page.getByLabel("Legenda das cores")).toContainText("Nk nos pilares (kN)");
    await page.getByRole("button", { name: "Explodido" }).click();
    await page.waitForTimeout(1200);
    await foto("explodido-nk-1366");

    // exportar PNG e glTF
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "PNG da vista" }).click(),
    ]);
    expect(png.suggestedFilename()).toMatch(/-3d\.png$/);
    const [glb] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "glTF (.glb)" }).click(),
    ]);
    expect(glb.suggestedFilename()).toMatch(/-3d\.glb$/);
    const bytes = fs.readFileSync((await glb.path())!);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("glTF");

    expect(erros).toEqual([]);
  });

  for (const tela of [
    { nome: "360", largura: 360, altura: 800, toque: true },
    { nome: "4k", largura: 3840, altura: 2160, toque: false },
  ])
    test(`todo e seleção em ${tela.largura}×${tela.altura}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const contexto = await browser.newContext({
        viewport: { width: tela.largura, height: tela.altura },
        hasTouch: tela.toque,
      });
      const page = await contexto.newPage();
      const erros = vigiarErros(page);
      await importarPredio(page);
      await abrir3d(page);
      await page.screenshot({ path: path.join(DOCS, `todo-${tela.nome}.png`) });
      const pilar = await cena(page, (c) =>
        c.modelo.elementos.find((e) => e.tipo === "laje" && e.nivel === 2),
      );
      await clicarElemento(page, pilar!.chave, tela.toque);
      await expect(page.getByRole("region", { name: /Elemento selecionado/ })).toBeVisible();
      await page.screenshot({ path: path.join(DOCS, `selecao-${tela.nome}.png`) });
      expect(erros).toEqual([]);
      await contexto.close();
    });
});

// Camada "Armadura" da vista 3D (src/telas/obra3d/armadura): liga pelo botão, desenha as
// barras calculadas da viga e da coluna selecionadas, acompanha o explodido e a seleção,
// deixa as peças transparentes e desfaz tudo ao desligar, sem erro no console. Obra de 3
// pavimentos feita pela API do domínio (a mesma de e2e/vista3d.spec.ts).
// Rode com PORT=4421 bun x playwright test e2e/vista3d-armadura.spec.ts.
// As fotos vão para e2e/prints/vista3d-armadura/.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-armadura");
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

type Obj = {
  name: string;
  isMesh?: boolean;
  visible: boolean;
  userData: { barras?: number; nivel?: number };
  position: { y: number };
  parent: Obj | null;
  children: Obj[];
  material: { transparent: boolean; opacity: number };
  geometry: {
    computeBoundingBox: () => void;
    boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  };
};
type Cena = {
  modelo: { elementos: { chave: string; tipo: string; nome: string; nivel: number }[] };
  selecao: string | null;
  camera: { position: { x: number; y: number; z: number } };
  cena: { traverse: (f: (o: Obj) => void) => void };
  selecionar: (k: string | null) => void;
  moverCamera: (posicao: object, alvo: object, animar?: boolean) => Promise<string>;
  alturaNaCena: (i: number, cota: number) => number;
  definirFiltro: (id: string, f: ((e: { tipo: string }) => boolean) | null) => void;
  caixaDe: (
    k: string,
  ) =>
    | { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
    | undefined;
};
/** Roda `f(ctx, arg)` na página com o contexto da vista (a função vai como texto). */
const cena = <T, A = null>(page: Page, f: (c: Cena, arg: A) => T, arg: A = null as A) =>
  page.evaluate(
    ([fonte, a]) =>
      new Function("c", "a", `return (${fonte})(c, a)`)(
        (window as unknown as { __vista3d: Cena }).__vista3d,
        a,
      ),
    [f.toString(), arg] as const,
  ) as Promise<T>;

/** O que a camada pôs na cena: malhas, barras, níveis e a caixa de tudo (com o explodido). */
const armadura = (page: Page) =>
  cena(page, (c) => {
    let malhas = 0;
    let barras = 0;
    let raizes = 0;
    const niveis: { nivel: number; y: number; esperado: number }[] = [];
    const caixa = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    c.cena.traverse((o) => {
      if (o.name === "armadura") raizes++;
      if (o.userData.nivel !== undefined && o.name.startsWith("armadura "))
        niveis.push({
          nivel: o.userData.nivel,
          y: o.position.y,
          esperado: c.alturaNaCena(o.userData.nivel, 0),
        });
      if (o.isMesh && o.name.startsWith("armadura ")) {
        malhas++;
        barras += o.userData.barras ?? 0;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        const dy = o.parent?.position.y ?? 0;
        const xyz = (p: { x: number; y: number; z: number }) => [p.x, p.y + dy, p.z];
        xyz(b.min).forEach((v, i) => (caixa.min[i] = Math.min(caixa.min[i]!, v)));
        xyz(b.max).forEach((v, i) => (caixa.max[i] = Math.max(caixa.max[i]!, v)));
      }
    });
    return { raizes, malhas, barras, niveis, caixa };
  });

/** Material das malhas sólidas das vigas da vista (papel "solido"). */
const materialSolido = (page: Page) =>
  cena(page, (c) => {
    const ms: { transparent: boolean; opacity: number }[] = [];
    c.cena.traverse((o) => {
      if (o.isMesh && / viga$/.test(o.name) && !o.name.startsWith("armadura"))
        ms.push({ transparent: o.material.transparent, opacity: o.material.opacity });
    });
    return ms[0] ?? null;
  });

const chaveDe = (page: Page, tipo: string, nome: string, nivel: number) =>
  cena(
    page,
    (c, a) =>
      c.modelo.elementos.find((e) => e.tipo === a.tipo && e.nome === a.nome && e.nivel === a.nivel)!
        .chave,
    { tipo, nome, nivel },
  );

/** Liga ou desliga a camada pelo botão da seção "Camadas". */
async function alternarCamada(page: Page) {
  await page.getByRole("button", { name: "Armadura", exact: true }).click();
  await quadros(page);
}

test("liga, desenha viga e coluna, acompanha explodido e seleção, desliga sem resto", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);

  const solidoAntes = await materialSolido(page);
  expect(solidoAntes).toEqual({ transparent: false, opacity: 1 });

  // ligar: sem seleção, o Painel diz o que fazer e nada é desenhado; as peças ficam transparentes
  await alternarCamada(page);
  const botao = page.getByRole("button", { name: "Armadura", exact: true });
  await expect(botao).toHaveAttribute("aria-pressed", "true");
  const painel = page.getByTestId("painel-armadura");
  await expect(painel).toContainText("Selecione uma viga, um pilar ou uma fundação.");
  expect((await armadura(page)).malhas).toBe(0);
  const solido = await materialSolido(page);
  expect(solido?.transparent).toBe(true);
  expect(solido?.opacity).toBeLessThan(0.5);

  // viga V1 do primeiro nível pela lista: barras dentro da viga (a ancoragem passa até 10 cm
  // da ponta, até a face do apoio), uma malha por tipo, lista das posições no Painel
  const v1 = await chaveDe(page, "viga", "V1", 0);
  await page.getByLabel("Elemento (com os vizinhos)").selectOption(v1);
  await page.waitForTimeout(800);
  await quadros(page);
  const av = await armadura(page);
  expect(av.raizes).toBe(1);
  expect(av.malhas).toBeGreaterThan(1);
  expect(av.malhas).toBeLessThanOrEqual(7);
  expect(av.barras).toBeGreaterThan(10);
  const kv = (await cena(page, (c, k) => c.caixaDe(k), v1))!;
  for (const [i, eixo] of (["x", "y", "z"] as const).entries()) {
    expect(av.caixa.min[i]!).toBeGreaterThanOrEqual(kv.min[eixo] - 0.11);
    expect(av.caixa.max[i]!).toBeLessThanOrEqual(kv.max[eixo] + 0.11);
  }
  await expect(painel).toContainText("Viga V1");
  const linhasViga = painel.getByRole("table", { name: "Posições desenhadas" }).locator("tbody tr");
  expect(await linhasViga.count()).toBeGreaterThan(1);
  await expect(painel.getByRole("list", { name: "Legenda da armadura" })).toContainText("estribo");
  // foto: a viga enquadrada pelo botão do Painel, com a lista à vista
  await painel.getByRole("button", { name: "Enquadrar" }).click();
  await page.waitForTimeout(800);
  await painel.scrollIntoViewIfNeeded();
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "viga-1366.png") });
  // de perto, de fora do prédio: a ponta da V1 sobre o apoio, com ganchos e estribos
  await cena(
    page,
    (c, k) => {
      const b = c.caixaDe(k)!;
      const V = c.camera.position.constructor as unknown as new (
        x: number,
        y: number,
        z: number,
      ) => object;
      const [y, z] = [(b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
      void c.moverCamera(
        new V(b.min.x + 1.4, y + 0.35, z + 1.1),
        new V(b.min.x + 0.45, y, z),
        false,
      );
    },
    v1,
  );
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "viga-perto-1366.png") });

  // explodido: os grupos da armadura sobem com os níveis, sem refazer as malhas
  await page.getByRole("button", { name: "Explodido" }).click();
  await page.waitForTimeout(1200);
  await quadros(page);
  const ex = await armadura(page);
  expect(ex.malhas).toBe(av.malhas);
  for (const n of ex.niveis) expect(n.y).toBeCloseTo(n.esperado, 6);
  await page.getByRole("button", { name: "Explodido" }).click();
  await page.waitForTimeout(1200);
  await quadros(page);
  for (const n of (await armadura(page)).niveis) expect(n.y).toBeCloseTo(0, 6);

  // pilar P1 do nível do meio pela API: a coluna inteira, os 3 lances, 3 grupos de nível
  const p1 = await chaveDe(page, "pilar", "P1", 1);
  await cena(page, (c, k) => c.selecionar(k), p1);
  await quadros(page);
  const ap = await armadura(page);
  expect(ap.niveis.map((n) => n.nivel).toSorted()).toEqual([0, 1, 2]);
  expect(ap.malhas).toBe(6); // longitudinal e estribo em cada lance
  await expect(painel).toContainText("Coluna P1");
  // um cabeçalho por lance no corpo da tabela, de cima para baixo
  await expect(painel.locator("tbody th")).toHaveText(["Cobertura", "Tipo", "Primeiro"]);
  // a coluna vai da base (cota 0) ao topo do último lance (9 m) e pode passar pelo traspasse
  expect(ap.caixa.min[1]!).toBeGreaterThanOrEqual(-0.01);
  expect(ap.caixa.max[1]!).toBeLessThanOrEqual(9.01);

  // Enquadrar leva a câmera para a coluna
  const antes = await cena(page, (c) => ({ ...c.camera.position }));
  await painel.getByRole("button", { name: "Enquadrar" }).click();
  await page.waitForTimeout(800);
  const depois = await cena(page, (c) => ({ ...c.camera.position }));
  expect(Math.hypot(depois.x - antes.x, depois.y - antes.y, depois.z - antes.z)).toBeGreaterThan(
    0.1,
  );
  await painel.scrollIntoViewIfNeeded();
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "coluna-1366.png") });

  // laje: sem armadura na cena, com o motivo
  const l1 = await chaveDe(page, "laje", "L1", 2);
  await cena(page, (c, k) => c.selecionar(k), l1);
  await quadros(page);
  expect((await armadura(page)).malhas).toBe(0);
  await expect(painel).toContainText("A armadura das lajes ainda não é desenhada");

  // a peça deixa de aparecer (filtro de outra camada): a armadura some e volta com ela
  await cena(page, (c, k) => c.selecionar(k), v1);
  await quadros(page);
  expect((await armadura(page)).malhas).toBe(av.malhas);
  await cena(page, (c) => c.definirFiltro("teste", (e) => e.tipo !== "viga"));
  await quadros(page);
  expect((await armadura(page)).malhas).toBe(0);
  await cena(page, (c) => c.definirFiltro("teste", null));
  await cena(page, (c, k) => c.selecionar(k), v1);
  await quadros(page);
  expect((await armadura(page)).malhas).toBe(av.malhas);

  // desligar: nada da camada na cena, Painel fora e materiais de volta
  await alternarCamada(page);
  await expect(botao).toHaveAttribute("aria-pressed", "false");
  await expect(painel).toHaveCount(0);
  const fim = await armadura(page);
  expect(fim.raizes).toBe(0);
  expect(fim.malhas).toBe(0);
  expect(await materialSolido(page)).toEqual(solidoAntes);

  expect(erros).toEqual([]);
});

test("360×800 com toque: viga com a armadura e o Painel", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexto = await browser.newContext({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  await alternarCamada(page);
  const v1 = await chaveDe(page, "viga", "V1", 2);
  await page.getByLabel("Elemento (com os vizinhos)").selectOption(v1);
  await page.waitForTimeout(800);
  await quadros(page);
  expect((await armadura(page)).malhas).toBeGreaterThan(1);
  await page.getByTestId("painel-armadura").getByRole("button", { name: "Enquadrar" }).click();
  await page.waitForTimeout(800);
  await page
    .getByTestId("vista-3d")
    .locator("canvas")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "viga-360.png") });
  await page.getByTestId("painel-armadura").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PRINTS, "painel-360.png") });
  expect(erros).toEqual([]);
  await contexto.close();
});

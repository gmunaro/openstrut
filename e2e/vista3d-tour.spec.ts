// Camada "Tour" da vista 3D (src/telas/obra3d/tour): o tour guiado (paradas, Anterior,
// Próxima, Pausar, interrupção por outra ação na câmera, movimento reduzido) e o tour livre
// em primeira pessoa (teclado e joystick), com o console sem erro nem aviso e a órbita
// devolvida ao sair. Rode com PORT=4423 bun x playwright test e2e/vista3d-tour.spec.ts.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-tour");
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
    name: "obra.openstrut.json",
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

/** Liga ou desliga uma camada pelo botão da seção "Camadas". */
async function alternarCamada(page: Page, nome: string, ligada: boolean) {
  const b = page.getByRole("button", { name: nome, exact: true });
  await b.click();
  await expect(b).toHaveAttribute("aria-pressed", String(ligada));
  await quadros(page);
}

type V = { x: number; y: number; z: number };
type Api = {
  camera: { position: V & { clone: () => V } };
  controles: { enabled: boolean; target: V };
  selecao: string | null;
  modelo: { elementos: { chave: string; tipo: string; nome: string; nivel: number }[] };
  dados: Map<string, { estado: string; defeitos: string[] }>;
  moverCamera: (p: V, a: V, animar?: boolean) => Promise<string>;
};
const api = <T>(page: Page, f: (c: Api) => T) =>
  page.evaluate(
    (fonte) =>
      new Function("c", `return (${fonte})(c)`)(
        (window as unknown as { __vista3d: Api }).__vista3d,
      ),
    f.toString(),
  ) as Promise<T>;
const camera = (page: Page) =>
  api(page, (c) => ({
    x: c.camera.position.x,
    y: c.camera.position.y,
    z: c.camera.position.z,
    alvo: { x: c.controles.target.x, y: c.controles.target.y, z: c.controles.target.z },
    orbita: c.controles.enabled,
  }));

const camadas = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Camadas", exact: true }) });
const legenda = (page: Page) => page.getByTestId("legenda-tour");

test("tour guiado: paradas, Anterior, Próxima, Pausar, interrupção e desligar", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  expect((await camera(page)).orbita).toBe(true);
  // paradas: o todo, os 3 níveis e cada peça com falha (sem defeitos fora do modo original)
  const falhas = await api(page, (c) =>
    c.modelo.elementos.filter((e) => c.dados.get(e.chave)?.estado === "falha"),
  );
  const total = 1 + 3 + falhas.length;

  await alternarCamada(page, "Tour", true);
  const painel = camadas(page);
  await expect(legenda(page)).toContainText(`Parada 1 de ${total}: Prédio inteiro`);
  await expect(painel).toContainText(`Parada 1 de ${total}: Prédio inteiro`);
  // tocando: a órbita do usuário fica travada
  expect((await camera(page)).orbita).toBe(false);
  // avança sozinho depois de 2,5 s na parada
  await expect(legenda(page)).toContainText(`Parada 2 de ${total}: Primeiro (+3,00 m)`, {
    timeout: 6000,
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(PRINTS, "guiado-nivel-1366.png") });

  // Pausar: destrava a órbita e não avança mais
  await painel.getByRole("button", { name: "Pausar" }).click();
  expect((await camera(page)).orbita).toBe(true);
  await page.waitForTimeout(3500);
  await expect(legenda(page)).toContainText(`Parada 2 de ${total}`);

  // Próxima e Anterior, à mão
  const antes = await camera(page);
  await painel.getByRole("button", { name: "Próxima" }).click();
  await expect(legenda(page)).toContainText(`Parada 3 de ${total}: Tipo (+6,00 m)`);
  await page.waitForTimeout(800);
  const depois = await camera(page);
  expect(Math.hypot(depois.x - antes.x, depois.y - antes.y, depois.z - antes.z)).toBeGreaterThan(
    0.5,
  );
  await painel.getByRole("button", { name: "Anterior" }).click();
  await expect(legenda(page)).toContainText(`Parada 2 de ${total}`);

  // a parada de uma peça com falha seleciona a peça e mostra o resultado principal
  expect(falhas.length).toBeGreaterThan(0);
  for (let i = 3; i <= 5; i++) await painel.getByRole("button", { name: "Próxima" }).click();
  const p = falhas[0]!;
  await expect(legenda(page)).toContainText(`Parada 5 de ${total}: Pilar ${p.nome}`);
  await expect(legenda(page)).toContainText("com falha");
  await expect.poll(() => api(page, (c) => c.selecao)).toBe(p.chave);
  await expect(page.getByRole("region", { name: /Elemento selecionado/ })).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(PRINTS, "guiado-falha-1366.png") });

  // outra ação leva a câmera no meio da ida: o tour pausa, sem erro
  await painel.getByRole("button", { name: "Anterior" }).click();
  await painel.getByRole("button", { name: "Reproduzir" }).click();
  await page.evaluate(() => {
    const botao = [...document.querySelectorAll("button")].find((b) => b.textContent === "Próxima");
    botao!.click();
    const c = (window as unknown as { __vista3d: Api }).__vista3d;
    const destino = c.camera.position.clone();
    destino.x += 1;
    void c.moverCamera(destino, c.controles.target);
  });
  await expect(painel).toContainText("Tour pausado: outra ação levou a câmera.");
  expect((await camera(page)).orbita).toBe(true);

  // um botão de vista com o tour parado numa parada também pausa
  await painel.getByRole("button", { name: "Reproduzir" }).click();
  await expect(painel).not.toContainText("Tour pausado");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Topo", exact: true }).click();
  await expect(painel).toContainText("Tour pausado: outra ação levou a câmera.");
  await page.getByRole("button", { name: "Perspectiva", exact: true }).click();

  // desligar tira a legenda e devolve a órbita
  await alternarCamada(page, "Tour", false);
  await expect(legenda(page)).toHaveCount(0);
  expect((await camera(page)).orbita).toBe(true);
  expect(erros).toEqual([]);
});

test("tour guiado com movimento reduzido: sem animação, avança pelos botões", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const contexto = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  await alternarCamada(page, "Tour", true);
  const painel = camadas(page);
  await expect(painel).toContainText("Movimento reduzido");
  await expect(painel.getByRole("button", { name: "Reproduzir" })).toBeVisible();
  expect((await camera(page)).orbita).toBe(true);
  await page.waitForTimeout(3500);
  await expect(legenda(page)).toContainText("Parada 1 de");
  // a câmera salta para a parada, sem animar: no quadro seguinte já está lá
  await painel.getByRole("button", { name: "Próxima" }).click();
  await expect(legenda(page)).toContainText("Parada 2 de");
  const a = await camera(page);
  await quadros(page);
  expect(await camera(page)).toEqual(a);
  expect(erros).toEqual([]);
  await contexto.close();
});

test("tour livre: teclado, andares, Esc e a órbita de volta", async ({ page }) => {
  test.setTimeout(120_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  await alternarCamada(page, "Tour", true);
  const painel = camadas(page);
  await painel.getByRole("button", { name: "Andar pela estrutura" }).click();
  await expect(legenda(page)).toContainText("Caminhando: Chão");
  await expect(page.getByTestId("joystick-tour")).toBeVisible();
  const c0 = await camera(page);
  expect(c0.orbita).toBe(false);
  // olhos a 1,6 m do chão (cota 0), olhando para −Z
  expect(c0.y).toBeCloseTo(1.6, 3);
  expect(c0.alvo.z - c0.z).toBeCloseTo(-1, 3);

  // W anda para a frente (−Z), a 3 m/s
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(600);
  await page.keyboard.up("KeyW");
  const c1 = await camera(page);
  expect(c0.z - c1.z).toBeGreaterThan(0.8);
  expect(Math.abs(c1.x - c0.x)).toBeLessThan(0.01);

  // ← gira para a esquerda: o alvo passa para o lado −X
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowLeft");
  const c2 = await camera(page);
  expect(c2.alvo.x - c2.x).toBeLessThan(-0.3);

  // E sobe para a laje do Primeiro (+3,00 m): olhos a 4,6 m; Q desce
  await page.keyboard.press("KeyE");
  await expect(legenda(page)).toContainText("Caminhando: Primeiro (+3,00 m)");
  expect((await camera(page)).y).toBeCloseTo(4.6, 3);
  await page.keyboard.press("KeyQ");
  expect((await camera(page)).y).toBeCloseTo(1.6, 3);
  await painel.getByRole("button", { name: "Subir andar" }).click();
  await painel.getByRole("button", { name: "Subir andar" }).click();
  await expect(legenda(page)).toContainText("Caminhando: Tipo (+6,00 m)");
  await page.screenshot({ path: path.join(PRINTS, "livre-1366.png") });

  // Esc sai: órbita destravada e joystick fora
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("joystick-tour")).toHaveCount(0);
  await expect(painel.getByRole("button", { name: "Andar pela estrutura" })).toBeVisible();
  expect((await camera(page)).orbita).toBe(true);

  // entrar de novo e desligar a camada direto também devolve tudo
  await painel.getByRole("button", { name: "Andar pela estrutura" }).click();
  await alternarCamada(page, "Tour", false);
  await expect(page.getByTestId("joystick-tour")).toHaveCount(0);
  await expect(legenda(page)).toHaveCount(0);
  expect((await camera(page)).orbita).toBe(true);
  // sem a camada, W não anda
  const c3 = await camera(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyW");
  expect((await camera(page)).z).toBe(c3.z);
  expect(erros).toEqual([]);
});

test("tour em 360×800: legenda e joystick de toque", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexto = await browser.newContext({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  await alternarCamada(page, "Tour", true);
  await page.getByTestId("vista-3d").locator("canvas").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(PRINTS, "guiado-360.png") });
  await camadas(page).getByRole("button", { name: "Andar pela estrutura" }).click();
  const joy = page.getByTestId("joystick-tour");
  await joy.scrollIntoViewIfNeeded();
  const c0 = await camera(page);
  // arrasta o controle para cima: anda para a frente
  const k = (await joy.boundingBox())!;
  const cx = k.x + k.width / 2;
  const cy = k.y + k.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - k.height / 2, { steps: 4 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(PRINTS, "livre-360.png") });
  await page.mouse.up();
  const c1 = await camera(page);
  expect(c0.z - c1.z).toBeGreaterThan(0.8);
  // solto, para
  await page.waitForTimeout(300);
  const c2 = await camera(page);
  await page.waitForTimeout(300);
  expect((await camera(page)).z).toBe(c2.z);
  expect(erros).toEqual([]);
  await contexto.close();
});

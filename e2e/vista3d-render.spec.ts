// Camada "Render realista" da vista 3D (src/telas/obra3d/render): liga pelo botão, mexe no
// Painel (rugosidade, luz, sombras, path tracing, baixar imagem), confere o console sem erro
// nem aviso e, ao desligar, os materiais, as luzes e o tone mapping da vista de volta. Mede
// o quadro da obra de 20 pavimentos com e sem o render. Rode com
// PORT=4422 bun x playwright test e2e/vista3d-render.spec.ts.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-render");
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

/** 20 níveis (cobertura, tipo × 18, primeiro) com 50 pilares em malha 10 × 5 de 4 m. */
function obraVintePavimentos() {
  const obra = obraNova("Vinte pavimentos", "nbr6118-2023");
  obra.pavimentos = [
    ["Cobertura", 1],
    ["Tipo", 18],
    ["Primeiro", 1],
  ].map(([nome, rep]) => {
    const pav = pavimentoNovo(nome as string, 3, rep as number);
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 4; j++)
        pav.lajes.push(lajeNova(pav, { x: 4 * i, y: 4 * j, lx: 4, ly: 4 }));
    return gerarEstrutura(pav);
  });
  return serializarObra(obra);
}

/** Avisos que o path tracing escreve no console e que não vêm desta camada: os do
 *  three-gpu-pathtracer 0.0.27 (o caminho WebGL depreciado em favor do WebGPU e APIs que o
 *  three 0.186 marca como antigas: Clock, Source, maxLeafTris do three-mesh-bvh) e os do
 *  WebGL por software (SwiftShader sem compilação paralela de shader; a leitura do cubo do
 *  ambiente pela biblioteca). Ficam fora da conferência só com o path tracing ligado. */
const AVISOS_DO_TRACADO = [
  /^warning: WebGLPathTracer: This class has been deprecated/,
  /^warning: THREE\.Clock: This module has been deprecated/,
  /^warning: THREE\.Source: "Source" has been renamed to "TextureSource"/,
  /^warning: MeshBVH: "maxLeafTris" option has been deprecated/,
  /^warning: THREE\.WebGLRenderer: KHR_parallel_shader_compile extension not supported/,
  /^warning: \[\.WebGL-[0-9a-fx]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/,
];
const semAvisosDoTracado = (erros: string[]) =>
  erros.filter((e) => !AVISOS_DO_TRACADO.some((r) => r.test(e)));

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

/** O que a camada mexe na vista: materiais das malhas sólidas e transparentes, das arestas,
 *  luzes, ambiente, tone mapping, sombras, controles e os filhos diretos da cena. */
const retrato = (page: Page) =>
  page.evaluate(() => {
    type O = {
      name: string;
      type: string;
      isMesh?: boolean;
      isLineSegments?: boolean;
      isLight?: boolean;
      intensity?: number;
      castShadow?: boolean;
      material?: { type: string; vertexColors?: boolean; roughness?: number; opacity: number };
      children: O[];
    };
    const c = (
      window as unknown as {
        __vista3d: {
          cena: O & { environment: unknown; traverse: (f: (o: O) => void) => void };
          renderer: { toneMapping: number; shadowMap: { enabled: boolean } };
          controles: { enabled: boolean };
        };
      }
    ).__vista3d;
    const solidos = new Set<string>();
    const fantasmas = new Set<string>();
    const arestas = new Set<string>();
    let sombra = 0;
    c.cena.traverse((o) => {
      if (o.isMesh && / (laje|viga|pilar)$/.test(o.name)) {
        solidos.add(
          `${o.material!.type} vc=${o.material!.vertexColors} r=${o.material!.roughness ?? "-"}`,
        );
        if (o.castShadow) sombra++;
      } else if (o.isMesh && o.material && o.material.opacity < 0.2)
        fantasmas.add(`${o.material.type} op=${o.material.opacity}`);
      else if (o.isLineSegments && o.material && o.material.opacity < 0.5)
        arestas.add(`${o.material.type} op=${o.material.opacity}`);
    });
    return {
      solidos: [...solidos],
      fantasmas: [...fantasmas],
      arestas: [...arestas],
      comSombra: sombra,
      luzes: c.cena.children.filter((o) => o.isLight).map((o) => `${o.type} ${o.intensity}`),
      filhos: c.cena.children.length,
      ambiente: c.cena.environment !== null,
      toneMapping: c.renderer.toneMapping,
      sombras: c.renderer.shadowMap.enabled,
      onAfterRenderProprio: Object.hasOwn(c.cena, "onAfterRender"),
      controles: c.controles.enabled,
    };
  });

/** Liga ou desliga uma camada pelo botão da seção "Camadas". */
async function alternarCamada(page: Page, nome: string, ligada: boolean) {
  const b = page.getByRole("button", { name: nome, exact: true });
  await b.click();
  await expect(b).toHaveAttribute("aria-pressed", String(ligada));
  await quadros(page);
}

test("render realista: Painel, path tracing, baixar imagem e desligar, sem erro no console", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  const antes = await retrato(page);
  expect(antes.solidos).toEqual(["MeshLambertMaterial vc=true r=-"]);
  expect(antes.toneMapping).toBe(0);

  await alternarCamada(page, "Render realista", true);
  const ligado = await retrato(page);
  // PBR com a cor por vértice da vista; fantasma com a opacidade do padrão; arestas discretas
  expect(ligado.solidos).toEqual(["MeshStandardMaterial vc=true r=0.85"]);
  expect(ligado.arestas).toEqual(["LineBasicMaterial op=0.18"]);
  expect(ligado.ambiente).toBe(true);
  expect(ligado.toneMapping).toBe(7); // NeutralToneMapping
  expect(ligado.sombras).toBe(true);
  expect(ligado.comSombra).toBeGreaterThan(0);
  // as luzes do núcleo ficam mais fracas e o sol do render entra num grupo próprio
  expect(ligado.luzes).toEqual(["HemisphereLight 0.4", "AmbientLight 0", "DirectionalLight 0"]);
  expect(ligado.filhos).toBe(antes.filhos + 1);
  await page.screenshot({ path: path.join(PRINTS, "pbr-1366.png") });

  // Painel: rugosidade, luz e sombras valem na hora
  const painel = page.locator("section", {
    has: page.getByRole("heading", { name: "Camadas", exact: true }),
  });
  await painel.getByLabel(/Rugosidade do concreto/).fill("0.4");
  await painel.getByLabel(/Intensidade da luz/).fill("1.5");
  await quadros(page);
  const mexido = await retrato(page);
  expect(mexido.solidos).toEqual(["MeshStandardMaterial vc=true r=0.4"]);
  const ceu = Number(mexido.luzes.find((l) => l.startsWith("Hemisphere"))!.split(" ")[1]);
  expect(ceu).toBeCloseTo(1.6 * 0.25 * 1.5, 6);
  await painel.getByLabel("Sombras do sol").uncheck();
  await quadros(page);
  expect((await retrato(page)).comSombra).toBe(0);
  await painel.getByLabel("Sombras do sol").check();
  await painel.getByLabel(/Rugosidade do concreto/).fill("0.85");
  await painel.getByLabel(/Intensidade da luz/).fill("1");

  // path tracing: carrega a biblioteca só agora, soma amostras com a câmera parada
  await painel.getByLabel("Path tracing quando a câmera para").check();
  const status = painel.getByRole("status");
  await expect(status).toContainText(/Amostras: [1-9]/, { timeout: 150_000 });
  const amostras = async () =>
    Number((await status.textContent())!.match(/Amostras: (\d+)/)![1]);
  const n1 = await amostras();
  // a soma continua com a câmera parada; sem GPU (o WebGL do CI é por software) uma
  // amostra pode levar mais de 3 s, então espera a contagem subir em vez de um tempo fixo
  await expect.poll(amostras, { timeout: 60_000 }).toBeGreaterThan(n1);
  await page.screenshot({ path: path.join(PRINTS, "tracado-1366.png") });

  // mexer a câmera recomeça a soma
  const canvas = page.getByTestId("vista-3d").locator("canvas");
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 6 });
  await expect(status).toContainText("Amostras: 0");
  await page.mouse.up();
  await expect(status).toContainText(/Amostras: [1-9]/, { timeout: 60_000 });

  // baixar imagem: PNG do canvas com o path tracing
  const [baixado] = await Promise.all([
    page.waitForEvent("download"),
    painel.getByRole("button", { name: "Baixar imagem" }).click(),
  ]);
  expect(baixado.suggestedFilename()).toBe("Três-pavimentos-render.png");
  const arquivo = path.join(PRINTS, "baixada-1366.png");
  await baixado.saveAs(arquivo);
  const png = fs.readFileSync(arquivo);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.length).toBeGreaterThan(20_000);

  // desligar o path tracing tira o gancho do quadro
  await painel.getByLabel("Path tracing quando a câmera para").uncheck();
  expect((await retrato(page)).onAfterRenderProprio).toBe(false);

  // desligar a camada devolve tudo como estava
  await alternarCamada(page, "Render realista", false);
  expect(await retrato(page)).toEqual(antes);

  // religar com o path tracing ligado e desligar a camada direto também limpa
  await alternarCamada(page, "Render realista", true);
  await page.getByLabel("Path tracing quando a câmera para").check();
  await expect(page.getByRole("status").filter({ hasText: "Amostras" })).toBeVisible({
    timeout: 60_000,
  });
  await alternarCamada(page, "Render realista", false);
  expect(await retrato(page)).toEqual(antes);
  await page.getByLabel("Path tracing quando a câmera para").waitFor({ state: "detached" });

  expect(semAvisosDoTracado(erros)).toEqual([]);
});

test("render realista em 360×800 com toque", async ({ browser }) => {
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
  await alternarCamada(page, "Render realista", true);
  await page.getByTestId("vista-3d").locator("canvas").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PRINTS, "pbr-360.png") });
  await page.getByRole("button", { name: "Render realista", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PRINTS, "painel-360.png"), fullPage: true });
  expect(erros).toEqual([]);
  await contexto.close();
});

test("desempenho: 20 pavimentos, padrão × PBR × PBR com sombras, CPU 4× mais lenta", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // celular em pé: 360 × 800 com densidade 2 (a vista limita o pixelRatio a 2)
  const contexto = await browser.newContext({
    viewport: { width: 360, height: 800 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await abrirObraJson(page, obraVintePavimentos());
  await abrir3d(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  /** Mediana de 12 desenhos, esperando a GPU (readPixels de 1
   *  pixel) para medir o desenho inteiro, não só o envio dos comandos. */
  const medir = () =>
    page.evaluate(() => {
      const c = (
        window as unknown as {
          __vista3d: {
            renderer: {
              info: { render: { calls: number; triangles: number } };
              getContext: () => WebGL2RenderingContext;
            };
            desenhar: () => void;
          };
        }
      ).__vista3d;
      const gl = c.renderer.getContext();
      const px = new Uint8Array(4);
      const tempos: number[] = [];
      c.desenhar();
      for (let i = 0; i < 12; i++) {
        const t = performance.now();
        c.desenhar();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        tempos.push(performance.now() - t);
      }
      tempos.sort((a, b) => a - b);
      const { calls, triangles } = c.renderer.info.render;
      return { mediana: tempos[6]!, calls, triangles };
    });

  const padrao = await medir();
  await alternarCamada(page, "Render realista", true);
  // no celular a sombra começa desligada
  const sombras = page.getByLabel("Sombras do sol");
  await expect(sombras).not.toBeChecked();
  await page.waitForTimeout(500);
  const semSombra = await medir();
  await sombras.check();
  await quadros(page);
  const pbr = await medir();
  // referência: o PBR sem sombra desenhado em 1× (um quarto dos pixels)
  await sombras.uncheck();
  await page.evaluate(() =>
    (
      window as unknown as { __vista3d: { renderer: { setPixelRatio: (r: number) => void } } }
    ).__vista3d.renderer.setPixelRatio(1),
  );
  const semSombra1x = await medir();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const medida = {
    padrao,
    pbrComSombra: pbr,
    pbrSemSombra: semSombra,
    pbrSemSombra1x: semSombra1x,
  };
  test.info().annotations.push({ type: "desempenho", description: JSON.stringify(medida) });
  console.log("desempenho render 20 pav:", JSON.stringify(medida));
  // a sombra é desenhada só quando a cena muda (autoUpdate false): mesmo número de chamadas
  expect(pbr.calls).toBe(padrao.calls);
  await page.getByTestId("vista-3d").locator("canvas").scrollIntoViewIfNeeded();
  await quadros(page);
  await page.screenshot({ path: path.join(PRINTS, "20pav-pbr-360.png") });
  // a medida lê 1 pixel por quadro de propósito: o aviso de "GPU stall" é dela
  expect(erros.filter((e) => !/GPU stall due to ReadPixels/.test(e))).toEqual([]);
  await contexto.close();
});

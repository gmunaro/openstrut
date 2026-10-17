// Camada "Realidade aumentada" da vista 3D (src/telas/obra3d/ar). O Chrome de teste não
// tem AR: confere o caminho sem suporte (mensagem e alternativa) e, com um navigator.xr
// falso injetado antes da página, o pedido recusado, uma sessão mínima que o three não
// aceita e uma sessão falsa completa (quadros e hit-test dados pelo teste) que passa por
// abrir, anel, toque, escala, giro de dois dedos e sair. Em todos, a vista volta como
// estava e o console fica sem erro e sem aviso.
// Rode com PORT=4426 bun x playwright test e2e/vista3d-ar.spec.ts.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-ar");
fs.mkdirSync(PRINTS, { recursive: true });

// WebGL por software no Chrome sem GPU (CI e headless)
test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

const TELAS = [
  { nome: "360", largura: 360, altura: 800, toque: true },
  { nome: "1366", largura: 1366, altura: 768, toque: false },
] as const;

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

type Modo = "semWebxr" | "semSuporte" | "rejeita" | "minimo" | "completo";

/** navigator.xr falso, posto antes do código da página. "completo" troca também o que o
 *  three usa na sessão (XRWebGLLayer, makeXRCompatible) para o setSession terminar, e
 *  `__arFalso.quadro(pose, hit)` entrega um quadro da sessão. Conta também os callbacks
 *  distintos de requestAnimationFrame da janela, para medir laços que ficaram rodando. */
function instalarXrFalso(page: Page, modo: Modo) {
  return page.addInitScript((modo: Modo) => {
    type Reg = {
      pedidos: number;
      fins: number;
      cancelada: boolean;
      sessao: EventTarget | null;
      rafs: Set<unknown> | null;
      quadro?: (pose: unknown, hit: number[] | null) => boolean;
    };
    const reg: Reg = { pedidos: 0, fins: 0, cancelada: false, sessao: null, rafs: null };
    const w = window as unknown as Record<string, unknown>;
    w.__arFalso = reg;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      reg.rafs?.add(cb);
      return raf(cb);
    };
    if (modo === "semWebxr") {
      Object.defineProperty(Navigator.prototype, "xr", {
        get: () => undefined,
        configurable: true,
      });
      return;
    }
    class Sessao extends EventTarget {
      renderState = {};
      environmentBlendMode = "alpha-blend";
      enabledFeatures = ["hit-test", "local"];
      inputSources = [];
      cb: ((t: number, f: unknown) => void) | null = null;
      terminou = false;
      updateRenderState() {}
      requestReferenceSpace() {
        return Promise.resolve({
          getOffsetReferenceSpace() {
            return this;
          },
        });
      }
      requestAnimationFrame(cb: (t: number, f: unknown) => void) {
        this.cb = cb;
        return 1;
      }
      cancelAnimationFrame() {
        this.cb = null;
      }
      requestHitTestSource() {
        return Promise.resolve({
          cancel() {
            reg.cancelada = true;
          },
        });
      }
      end() {
        if (!this.terminou) {
          this.terminou = true;
          reg.fins++;
          this.dispatchEvent(new Event("end"));
        }
        return Promise.resolve();
      }
    }
    const minima = {
      addEventListener() {},
      removeEventListener() {},
      end() {
        reg.fins++;
        return Promise.resolve();
      },
    };
    const xr = {
      isSessionSupported: () => Promise.resolve(modo !== "semSuporte"),
      requestSession: () => {
        reg.pedidos++;
        if (modo === "rejeita")
          return Promise.reject(new DOMException("a câmera não foi liberada", "NotAllowedError"));
        if (modo === "minimo") return Promise.resolve(minima);
        const s = new Sessao();
        reg.sessao = s;
        return Promise.resolve(s);
      },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(Navigator.prototype, "xr", { get: () => xr, configurable: true });
    if (modo !== "completo") return;
    delete w.XRWebGLBinding;
    w.XRWebGLLayer = class {
      framebuffer = null;
      framebufferWidth: number;
      framebufferHeight: number;
      ignoreDepthValues = true;
      constructor(_s: unknown, gl: WebGL2RenderingContext) {
        this.framebufferWidth = gl.drawingBufferWidth;
        this.framebufferHeight = gl.drawingBufferHeight;
      }
      getViewport() {
        return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight };
      }
    };
    (WebGL2RenderingContext.prototype as unknown as Record<string, unknown>).makeXRCompatible =
      () => Promise.resolve();
    reg.quadro = (pose, hit) => {
      const s = reg.sessao as Sessao | null;
      const cb = s?.cb;
      if (!s || !cb) return false;
      s.cb = null;
      cb(performance.now(), {
        session: s,
        getViewerPose: () => pose,
        getHitTestResults: () =>
          hit ? [{ getPose: () => ({ transform: { matrix: new Float32Array(hit) } }) }] : [],
      });
      return true;
    };
  }, modo);
}

/** Matriz 4 × 4 em colunas de uma translação. */
const translacao = (x: number, y: number, z: number) => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  x,
  y,
  z,
  1,
];

/** Pose do celular na origem, inclinado para baixo até olhar para (0; −0,4; −0,6), com
 *  uma vista de 60° de campo vertical (aspecto da tela). Rx(−a), a = atan(0,4/0,6). */
function poseOlhandoParaMesa(aspecto: number) {
  const a = Math.atan2(0.4, 0.6);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const f = 1 / Math.tan(Math.PI / 6);
  const perto = 0.01;
  const longe = 100;
  return {
    transform: { position: { x: 0, y: 0, z: 0 } },
    views: [
      {
        eye: "none",
        transform: { matrix: [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1] },
        projectionMatrix: [
          f / aspecto,
          0,
          0,
          0,
          0,
          f,
          0,
          0,
          0,
          0,
          (longe + perto) / (perto - longe),
          -1,
          0,
          0,
          (2 * longe * perto) / (perto - longe),
          0,
        ],
      },
    ],
  };
}

type Estado = {
  pai: boolean;
  xrLigado: boolean;
  apresentando: boolean;
  renderIgual: boolean;
  luzesVisiveis: number;
  controles: boolean;
  camera: number[];
  alvo: number[];
  razao: number;
  canvas: number[];
  sobreposicao: boolean;
  matriz: number[] | null;
};

/** Estado da vista que a sessão AR mexe e deve devolver. */
const estadoDaVista = (page: Page) =>
  page.evaluate((): Estado => {
    type Obj = { visible: boolean; isLight?: boolean; matrix: { elements: number[] } };
    const v = (window as unknown as { __vista3d: Record<string, never> }).__vista3d as unknown as {
      cena: { parent: Obj | null; traverse: (f: (o: Obj) => void) => void };
      renderer: {
        render: unknown;
        xr: { enabled: boolean; isPresenting: boolean };
        getPixelRatio(): number;
        domElement: HTMLCanvasElement;
      };
      controles: { enabled: boolean; target: { x: number; y: number; z: number } };
      camera: { position: { x: number; y: number; z: number } };
    };
    const w = window as unknown as { __renderDaVista?: unknown };
    w.__renderDaVista ??= v.renderer.render;
    let luzes = 0;
    v.cena.traverse((o) => {
      if (o.isLight && o.visible) luzes++;
    });
    const { position: p } = v.camera;
    const t = v.controles.target;
    return {
      pai: v.cena.parent !== null,
      xrLigado: v.renderer.xr.enabled,
      apresentando: v.renderer.xr.isPresenting,
      renderIgual: v.renderer.render === w.__renderDaVista,
      luzesVisiveis: luzes,
      controles: v.controles.enabled,
      camera: [p.x, p.y, p.z],
      alvo: [t.x, t.y, t.z],
      razao: v.renderer.getPixelRatio(),
      canvas: [v.renderer.domElement.width, v.renderer.domElement.height],
      sobreposicao: document.querySelector("[data-ar-sobreposicao]") !== null,
      matriz: v.cena.parent ? [...v.cena.parent.matrix.elements] : null,
    };
  });

/** Callbacks distintos de requestAnimationFrame da janela em meio segundo. */
async function lacosNaJanela(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __arFalso: { rafs: Set<unknown> | null } }).__arFalso.rafs = new Set();
  });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const reg = (window as unknown as { __arFalso: { rafs: Set<unknown> | null } }).__arFalso;
    const n = reg.rafs?.size ?? 0;
    reg.rafs = null;
    return n;
  });
}

async function ligarCamada(page: Page) {
  const botao = page.getByRole("button", { name: "Realidade aumentada" });
  if (!(await botao.isVisible())) await page.getByRole("button", { name: "Painel" }).click();
  await botao.click();
  await expect(botao).toHaveAttribute("aria-pressed", "true");
}

async function novaPagina(
  browser: import("@playwright/test").Browser,
  tela: (typeof TELAS)[number],
  modo: Modo | null,
) {
  const contexto = await browser.newContext({
    viewport: { width: tela.largura, height: tela.altura },
    hasTouch: tela.toque,
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  if (modo) await instalarXrFalso(page, modo);
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);
  await ligarCamada(page);
  return { contexto, page, erros };
}

const nota = (page: Page) => page.getByRole("note").filter({ hasText: "Realidade aumentada" });

for (const tela of TELAS)
  test.describe(`${tela.largura}×${tela.altura}`, () => {
    test("sem suporte (o Chrome de teste): explica e aponta a exportação glTF", async ({
      browser,
    }) => {
      const { contexto, page, erros } = await novaPagina(browser, tela, null);
      await expect(nota(page)).toContainText("indisponível neste aparelho");
      await expect(nota(page)).toContainText("Exportar › glTF (.glb)");
      await expect(page.getByRole("button", { name: /Ver na mesa|Ver no terreno/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "glTF (.glb)" })).toBeVisible();
      await nota(page).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(PRINTS, `sem-suporte-${tela.nome}.png`) });
      // desligar a camada tira o Painel
      await page.getByRole("button", { name: "Realidade aumentada" }).click();
      await expect(nota(page)).toHaveCount(0);
      expect(erros).toEqual([]);
      await contexto.close();
    });

    test("sessão falsa: abre, anel, toque, escala, giro e sai com a vista restaurada", async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const { contexto, page, erros } = await novaPagina(browser, tela, "completo");
      const antes = await estadoDaVista(page);
      expect(antes.pai).toBe(false);
      expect(antes.luzesVisiveis).toBeGreaterThan(0);
      const lacosAntes = await lacosNaJanela(page);

      // Painel com suporte: escala e tamanho da maquete
      const ver = page.getByRole("button", { name: "Ver na mesa" });
      await expect(ver).toBeVisible();
      // eixos 8 × 10 m; com a seção dos pilares e os blocos de fundação (25 cm de folga),
      // ~8,7 × 10,7 m e 9,5 m de altura (de −0,5 a 9 m): 9 × 11 cm e 10 cm na 1:100
      await expect(
        page.getByText("Em 1:100: 9 × 11 cm de planta e 10 cm de altura."),
      ).toBeVisible();
      await ver.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(PRINTS, `com-suporte-${tela.nome}.png`) });

      await ver.click();
      const sobre = page.locator("[data-ar-sobreposicao]");
      await expect(sobre).toBeVisible();
      await expect(sobre.getByRole("status")).toContainText("Aponte para a mesa ou o chão");
      const durante = await estadoDaVista(page);
      expect(durante).toMatchObject({
        pai: true,
        xrLigado: true,
        apresentando: true,
        renderIgual: false,
        luzesVisiveis: 0,
        controles: false,
      });

      const aspecto = antes.canvas[0]! / antes.canvas[1]!;
      const pose = poseOlhandoParaMesa(aspecto);
      const quadro = (hit: number[] | null) =>
        page.evaluate(
          ([p, h]) =>
            (
              window as unknown as {
                __arFalso: { quadro(p: unknown, h: number[] | null): boolean };
              }
            ).__arFalso.quadro(p, h),
          [pose, hit] as const,
        );
      const tocar = () =>
        page.evaluate(() =>
          (
            window as unknown as { __arFalso: { sessao: EventTarget } }
          ).__arFalso.sessao.dispatchEvent(new Event("select")),
        );

      // parede (Y da pose na horizontal): sem anel
      expect(await quadro([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, -1, 1])).toBe(true);
      await expect(sobre.getByRole("status")).toContainText("Aponte para a mesa ou o chão");
      // mesa 0,4 m abaixo e 0,6 m à frente: anel
      const mesa = translacao(0, -0.4, -0.6);
      expect(await quadro(mesa)).toBe(true);
      await expect(sobre.getByRole("status")).toHaveText(
        "Toque na tela para pôr o prédio no anel.",
      );
      await tocar();
      await expect(sobre.getByRole("status")).toContainText("Gire com dois dedos");
      // 1:100 e o celular na frente (+Z): sem giro, escala 0,01
      let m = (await estadoDaVista(page)).matriz!;
      expect(m[0]).toBeCloseTo(0.01, 6);
      expect(m[5]).toBeCloseTo(0.01, 6);
      expect(m[2]).toBeCloseTo(0, 6);

      // escala na sobreposição: 1:50
      await sobre.getByRole("button", { name: "1:50" }).click();
      await expect(sobre.getByRole("button", { name: "1:50" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      m = (await estadoDaVista(page)).matriz!;
      expect(m[0]).toBeCloseTo(0.02, 6);
      const t1 = [m[12]!, m[13]!, m[14]!];
      expect(await quadro(mesa)).toBe(true);
      await page.screenshot({ path: path.join(PRINTS, `posicionado-${tela.nome}.png`) });

      // dois dedos: o segundo gira 90° no sentido horário da tela em volta do primeiro →
      // −90° em Y: coluna X da matriz = (cos, 0, −sen) × 0,02 = (0; 0; 0,02)
      await page.evaluate(() => {
        const s = document.querySelector("[data-ar-sobreposicao]")!;
        const ev = (tipo: string, id: number, x: number, y: number) =>
          s.dispatchEvent(
            new PointerEvent(tipo, { pointerId: id, clientX: x, clientY: y, bubbles: true }),
          );
        ev("pointerdown", 1, 100, 300);
        ev("pointerdown", 2, 200, 300);
        ev("pointermove", 2, 100, 400);
        ev("pointerup", 2, 100, 400);
        ev("pointerup", 1, 100, 300);
      });
      m = (await estadoDaVista(page)).matriz!;
      expect(m[0]).toBeCloseTo(0, 6);
      expect(m[2]).toBeCloseTo(0.02, 6);

      // o "select" logo depois do gesto não muda o prédio de lugar; meio segundo depois, muda
      expect(await quadro(translacao(0.1, -0.4, -0.6))).toBe(true);
      await tocar();
      let m2 = (await estadoDaVista(page)).matriz!;
      expect([m2[12], m2[13], m2[14]]).toEqual([m[12], m[13], m[14]]);
      await page.waitForTimeout(600);
      await tocar();
      m2 = (await estadoDaVista(page)).matriz!;
      expect(m2[12]! - m[12]!).toBeCloseTo(0.1, 6);
      expect(m2[14]! - m[14]!).toBeCloseTo(0, 6);
      expect(t1).toHaveLength(3);

      // sair
      await sobre.getByRole("button", { name: "Sair" }).click();
      await expect(sobre).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Ver na mesa" })).toBeVisible();
      const depois = await estadoDaVista(page);
      expect(depois).toEqual({ ...antes, matriz: null });
      const reg = await page.evaluate(
        () => (window as unknown as { __arFalso: { fins: number; cancelada: boolean } }).__arFalso,
      );
      expect(reg).toMatchObject({ fins: 1, cancelada: true });
      // nenhum laço a mais na janela depois da sessão (o do WebGLRenderer foi desligado)
      expect(await lacosNaJanela(page)).toBe(lacosAntes);
      await quadros(page);
      await page.screenshot({ path: path.join(PRINTS, `depois-de-sair-${tela.nome}.png`) });
      expect(erros).toEqual([]);
      await contexto.close();
    });
  });

test("sem WebXR (Safari do iPhone): fala do iPhone e da exportação", async ({ browser }) => {
  const { contexto, page, erros } = await novaPagina(browser, TELAS[0], "semWebxr");
  await expect(nota(page)).toContainText("No iPhone e no iPad, o Safari não abre");
  await expect(nota(page)).toContainText("Exportar › glTF (.glb)");
  await nota(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PRINTS, "sem-webxr-360.png") });
  expect(erros).toEqual([]);
  await contexto.close();
});

for (const modo of ["rejeita", "minimo"] as const)
  test(`pedido ${modo === "rejeita" ? "recusado" : "com sessão mínima"}: mostra o erro e limpa`, async ({
    browser,
  }) => {
    const { contexto, page, erros } = await novaPagina(browser, TELAS[0], modo);
    const antes = await estadoDaVista(page);
    const lacosAntes = await lacosNaJanela(page);
    await page.getByRole("button", { name: "Ver na mesa" }).click();
    const alerta = page.getByRole("alert").filter({ hasText: "realidade aumentada" });
    await expect(alerta).toContainText("Não foi possível abrir a realidade aumentada");
    if (modo === "rejeita") await expect(alerta).toContainText("a câmera não foi liberada");
    await expect(page.getByRole("button", { name: "Ver na mesa" })).toBeVisible();
    expect(await estadoDaVista(page)).toEqual({ ...antes, matriz: null });
    const reg = await page.evaluate(
      () => (window as unknown as { __arFalso: { pedidos: number; fins: number } }).__arFalso,
    );
    expect(reg.pedidos).toBe(1);
    // a sessão mínima é encerrada; o pedido recusado não tem sessão
    expect(reg.fins).toBe(modo === "minimo" ? 1 : 0);
    expect(await lacosNaJanela(page)).toBe(lacosAntes);
    await alerta.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(PRINTS, `erro-${modo}-360.png`) });
    expect(erros).toEqual([]);
    await contexto.close();
  });

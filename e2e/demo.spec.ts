// Link de demonstração (src/telas/demo.ts): cada link abre a obra-exemplo calculada na aba
// e na vista 3D pedidas, sem passo manual, também dentro de um iframe de outro site. No modo
// embutido não aparece dica de primeiro uso nem é gravado rascunho no IndexedDB, e o aviso
// de conferência continua no rodapé. Rode com PORT=4431 bun x playwright test e2e/demo.spec.ts
// As fotos vão para e2e/prints/demo/.
import { expect, type FrameLocator, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/demo");
fs.mkdirSync(PRINTS, { recursive: true });

// WebGL por software no Chrome sem GPU (CI e headless). O teste do iframe põe a página de
// fora num endereço público e o app de teste está em localhost: o Chrome bloquearia o
// iframe (Local Network Access), o que não acontece entre dois sites públicos.
test.use({
  viewport: { width: 1280, height: 760 },
  launchOptions: {
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-features=LocalNetworkAccessChecks",
    ],
  },
});

const AVISO = "Os resultados exigem conferência de engenheiro responsável.";

type Cena = { estado: { explodido: boolean; modoCor: string } };

/** O pedaço da cena viva (window.__vista3d) que os testes da câmera leem. */
type Vec = { x: number; y: number; z: number };
type CenaCamera = {
  camera: { position: Vec };
  controles: { target: Vec };
  selecao: string | null;
  caixaDe(chave: string): { min: Vec; max: Vec } | undefined;
};

/** Direção da câmera ao alvo, normalizada. */
const direcaoDaCamera = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __vista3d: CenaCamera }).__vista3d;
    const p = c.camera.position;
    const t = c.controles.target;
    const d = [p.x - t.x, p.y - t.y, p.z - t.z];
    const n = Math.hypot(...d);
    return d.map((v) => v / n);
  });

/** Distância da câmera ao centro da peça selecionada, m. */
const distanciaAoSelecionado = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __vista3d: CenaCamera }).__vista3d;
    const b = c.selecao ? c.caixaDe(c.selecao) : undefined;
    if (!b) return Number.POSITIVE_INFINITY;
    const p = c.camera.position;
    const centro = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
    return Math.hypot(p.x - (centro[0] ?? 0), p.y - (centro[1] ?? 0), p.z - (centro[2] ?? 0));
  });

/** Embutida, a trilha e a barra de vistas começam recolhidas no botão "Vistas": abre. */
async function abrirVistas(app: Page | FrameLocator) {
  const botao = app.getByRole("button", { name: "Vistas", exact: true });
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await botao.click();
  await expect(app.getByRole("toolbar", { name: "Vistas" })).toBeVisible();
}

/** Onde o prédio visível (ou a peça `chave`) cai na tela: a caixa projetada pela câmera
 *  (px a partir do canto de cima do desenho) e o tamanho do desenho. */
const caixaNaTela = (page: Page, chave?: string) =>
  page.evaluate((chave) => {
    type M = { elements: number[] };
    const c = (
      window as unknown as {
        __vista3d: {
          camera: { matrixWorldInverse: M; projectionMatrix: M };
          renderer: { domElement: HTMLCanvasElement };
          caixaVisivel(): { min: Vec; max: Vec };
          caixaDe(k: string): { min: Vec; max: Vec } | undefined;
        };
      }
    ).__vista3d;
    const aplicar = (m: number[], p: number[]) =>
      [0, 1, 2, 3].map((r) => p.reduce((t, v, k) => t + (m[k * 4 + r] ?? 0) * v, 0));
    const b = (chave && c.caixaDe(chave)) || c.caixaVisivel();
    const { clientWidth: w, clientHeight: h } = c.renderer.domElement;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const x of [b.min.x, b.max.x])
      for (const y of [b.min.y, b.max.y])
        for (const z of [b.min.z, b.max.z]) {
          const v = aplicar(c.camera.matrixWorldInverse.elements, [x, y, z, 1]);
          const p = aplicar(c.camera.projectionMatrix.elements, v);
          xs.push(((p[0]! / p[3]! + 1) / 2) * w);
          ys.push(((1 - p[1]! / p[3]!) / 2) * h);
        }
    return {
      esq: Math.min(...xs),
      dir: Math.max(...xs),
      topo: Math.min(...ys),
      base: Math.max(...ys),
      w,
      h,
    };
  }, chave);

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

/** Quantos rascunhos o IndexedDB do app guarda (todas as lojas de todos os bancos). */
const contarRascunhos = (page: Page) =>
  page.evaluate(async () => {
    const bancos = await indexedDB.databases();
    let n = 0;
    for (const { name } of bancos) {
      if (!name?.includes("rascunho")) continue;
      const db = await new Promise<IDBDatabase>((ok, erro) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => erro(r.error);
      });
      for (const loja of Array.from(db.objectStoreNames))
        n += await new Promise<number>((ok) => {
          const r = db.transaction(loja).objectStore(loja).count();
          r.onsuccess = () => ok(r.result);
        });
      db.close();
    }
    return n;
  });

test("3D explodida com os pilares pelo Nk, embutida: sem dica e sem rascunho", async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto("/?exemplo=nbr6118-2023&aba=3d&explodido=1&cor=nkPilares&embed=1");
  await expect(page).toHaveURL(/\/obra$/);
  await expect(page.getByRole("tab", { name: "3D" })).toHaveAttribute("aria-selected", "true");
  await page.waitForFunction(() => {
    const c = (window as unknown as { __vista3d?: Cena }).__vista3d;
    return c?.estado.explodido === true && c.estado.modoCor === "nkPilares";
  });
  await expect(page.getByText("Nk nos pilares", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(AVISO)).toBeVisible();
  await page.waitForTimeout(1500); // explodido anima; debounce do rascunho é 800 ms
  await page.screenshot({ path: path.join(PRINTS, "explodido-nk.png") });
  expect(await contarRascunhos(page)).toBe(0);
  expect(erros).toEqual([]);
});

test("planta com lajes, vigas e pilares, embutida", async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto("/?exemplo=nbr6118-2023&aba=planta&embed=1");
  await expect(page).toHaveURL(/\/obra$/);
  await expect(page.getByRole("tab", { name: "Planta" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Como desenhar a planta" })).toHaveCount(0);
  await expect(page.getByText(AVISO)).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(PRINTS, "planta.png") });
  expect(await contarRascunhos(page)).toBe(0);
  expect(erros).toEqual([]);
});

for (const [camada, norma, nome] of [
  ["comparar", "nb1-78", "Original × Corrigido"],
  ["sequencia", "nbr6118-2023", "Sequência construtiva 4D"],
] as const)
  test(`camada ${nome} ligada pelo link`, async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto(`/?exemplo=${norma}&aba=3d&camada=${camada}&embed=1`);
    await expect(page).toHaveURL(/\/obra$/);
    await expect(page.getByRole("button", { name: nome, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(PRINTS, `${camada}.png`) });
    expect(erros).toEqual([]);
  });

test("a vista pedida pelo link vale só na primeira abertura da aba 3D", async ({ page }) => {
  await page.goto("/?exemplo=nb1-78&aba=3d&explodido=1&camada=comparar&embed=1");
  await abrirVistas(page);
  const camada = page.getByRole("button", { name: "Original × Corrigido", exact: true });
  const explodido = page.getByRole("button", { name: /Explodido/ });
  await expect(camada).toHaveAttribute("aria-pressed", "true");
  await expect(explodido).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Planta" }).click();
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => "__vista3d" in window);
  await page.waitForTimeout(800);
  await abrirVistas(page);
  await expect(camada).toHaveAttribute("aria-pressed", "false");
  await expect(explodido).toHaveAttribute("aria-pressed", "false");
});

test("num iframe de outro site, o link abre a demo", async ({ page, baseURL }) => {
  // a página de fora, noutra origem e em https, com o iframe como o site do estúdio monta
  const pai = "https://site.teste/";
  await page.route(pai, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><iframe src="${baseURL}/?exemplo=nbr6118-2023&aba=3d&explodido=1&cor=nkPilares&embed=1"
        style="width:1200px;height:700px;border:0" referrerpolicy="no-referrer"
        allow="fullscreen; clipboard-write; xr-spatial-tracking"></iframe>`,
    }),
  );
  await page.goto(pai);
  const app = page.frameLocator("iframe");
  await expect(app.getByRole("tab", { name: "3D" })).toHaveAttribute("aria-selected", "true", {
    timeout: 20_000,
  });
  await abrirVistas(app);
  await expect(app.getByRole("button", { name: /Explodido/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(app.getByText(AVISO)).toBeVisible();
});

// As demos do edifício que o site do estúdio embute: aba 3D sem moldura e sem painel, com
// as camadas ligadas pelo link. `sinal` é o texto que só aparece com a demo no ar.
const EDIFICIO = "/?exemplo=edificio&aba=3d&moldura=0&painel=0&embed=1";
for (const [nome, q, camadas, sinal] of [
  ["tour", "&cor=concreto&camada=render,tour", ["Render realista", "Tour"], /Parada \d+ de/],
  ["nk", "&explodido=1&cor=nkPilares", [], "Nk nos pilares (kN)"],
  [
    "sequencia",
    "&cor=concreto&camada=render,sequencia&reproduzir=1",
    ["Render realista", "Sequência construtiva 4D"],
    "Etapa em andamento",
  ],
  [
    "armadura",
    "&cor=concreto&foco=pilar~1º pavimento~P6&camada=render,armadura",
    ["Render realista", "Armadura"],
    "Pilar P6",
  ],
] as const)
  test(`edifício: demo ${nome}`, async ({ page }) => {
    const erros = vigiarErros(page);
    await page.goto(EDIFICIO + q);
    await expect(page).toHaveURL(/\/obra$/);
    await expect(page.getByText(sinal).first()).toBeVisible({ timeout: 20_000 });
    // sem cabeçalho, barra de pavimentos e painel; as abas e o aviso ficam
    await expect(page.getByRole("navigation", { name: "Pavimentos" })).toHaveCount(0);
    await expect(page.locator("#painel-3d")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "3D" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(AVISO)).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(PRINTS, `edificio-${nome}.png`) });
    // foco: a câmera chega perto do lance (o prédio inteiro fica a dezenas de m)
    if (nome === "armadura") expect(await distanciaAoSelecionado(page)).toBeLessThan(12);
    // o painel, aberto agora, mostra as camadas que o link ligou
    await abrirVistas(page);
    await page.getByRole("button", { name: "Painel", exact: true }).click();
    for (const c of camadas)
      await expect(page.getByRole("button", { name: c, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    // reproduzir=1: a sequência tocou por etapa (o passo que só o link escolhe; a esta altura
    // ela pode já ter terminado)
    if (nome === "sequencia")
      await expect(page.getByRole("combobox", { name: "Passo da linha do tempo" })).toHaveValue(
        "etapa",
      );
    expect(await contarRascunhos(page)).toBe(0);
    expect(erros).toEqual([]);
  });

test("edifício: a moldura volta fora da 3D e não some de novo ao voltar", async ({ page }) => {
  await page.goto(`${EDIFICIO}&cor=concreto`);
  await page.waitForFunction(() => "__vista3d" in window);
  await expect(page.getByRole("navigation", { name: "Pavimentos" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Planta" }).click();
  await expect(page.getByRole("navigation", { name: "Pavimentos" })).toBeVisible();
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => "__vista3d" in window);
  await expect(page.getByRole("navigation", { name: "Pavimentos" })).toBeVisible();
});

test("edifício: vista=frente vale mesmo com explodido=1", async ({ page }) => {
  await page.goto("/?exemplo=edificio&aba=3d&vista=frente&embed=1");
  await page.waitForFunction(() => "__vista3d" in window);
  await page.waitForTimeout(1500);
  const frente = await direcaoDaCamera(page);
  await page.goto("/?exemplo=edificio&aba=3d&vista=frente&explodido=1&embed=1");
  await page.waitForFunction(() => "__vista3d" in window);
  await abrirVistas(page);
  await expect(page.getByRole("button", { name: "Frente", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(1500);
  const explodida = await direcaoDaCamera(page);
  const cos = frente.reduce((s, v, i) => s + v * (explodida[i] ?? 0), 0);
  expect(cos).toBeGreaterThan(0.999);
});

test("edifício: Nk explodido abre enquadrado entre o botão Vistas e a legenda", async ({ page }) => {
  await page.goto(`${EDIFICIO}&explodido=1&cor=nkPilares&rampa=calor`);
  await page.waitForFunction(() => "__vista3d" in window);
  // a trilha e a barra de vistas ficam recolhidas; a cena fica livre
  await expect(page.getByRole("toolbar", { name: "Vistas" })).toHaveCount(0);
  await page.waitForTimeout(2000); // o explodido anima
  const desenho = await page.getByTestId("vista-3d").locator("canvas").boundingBox();
  const botao = await page.getByRole("button", { name: "Vistas", exact: true }).boundingBox();
  const legenda = await page.getByLabel("Legenda das cores").boundingBox();
  const c = await caixaNaTela(page);
  if (!desenho || !botao || !legenda) throw new Error("sem desenho, botão ou legenda");
  // abaixo do botão, dentro do desenho e fora do canto da legenda (ao lado ou acima dela)
  const livreTopo = botao.y + botao.height - desenho.y;
  expect(c.topo).toBeGreaterThan(livreTopo);
  expect(c.dir).toBeLessThan(c.w);
  expect(c.base).toBeLessThan(c.h);
  const aoLado = c.esq > legenda.x + legenda.width - desenho.x;
  const acima = c.base < legenda.y - desenho.y;
  expect(aoLado || acima).toBe(true);
  // e grande: o prédio alto, ao lado da legenda, ocupa quase toda a altura livre
  expect(aoLado).toBe(true);
  expect(c.base - c.topo).toBeGreaterThan(0.85 * (c.h - livreTopo));
  // a rampa calor na legenda
  await expect(page.getByLabel("Legenda das cores").locator("[style*='gradient']")).toHaveAttribute(
    "style",
    /56, 189, 248|38bdf8/i,
  );
});

test("edifício: a sequência 4D só rotula os níveis com peças à vista", async ({ page }) => {
  await page.goto(`${EDIFICIO}&camada=sequencia`);
  await page.waitForFunction(() => "__vista3d" in window);
  await expect(page.getByText("Etapa em andamento").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    type No = { visible: boolean; userData: { rotuloNivel?: boolean }; parent: { name: string } };
    const c = (
      window as unknown as {
        __vista3d: {
          cena: { traverse(f: (o: No) => void): void };
          modelo: { niveis: { nome: string }[]; elementos: { chave: string; nivel: number }[] };
          estaVisivel(chave: string): boolean;
        };
      }
    ).__vista3d;
    const rotulados: string[] = [];
    c.cena.traverse((o) => {
      if (o.userData.rotuloNivel && o.visible) rotulados.push(o.parent.name);
    });
    const comPecas = c.modelo.niveis
      .filter((_, i) => c.modelo.elementos.some((e) => e.nivel === i && c.estaVisivel(e.chave)))
      .map((n) => n.nome);
    return { rotulados: rotulados.sort(), comPecas: comPecas.sort(), total: c.modelo.niveis.length };
  });
  expect(r.rotulados).toEqual(r.comPecas);
  expect(r.rotulados.length).toBeLessThan(r.total);
});

test("edifício no celular embutido: legenda recolhida e barra numa linha", async ({ browser }) => {
  // o iframe do site no celular: 358 × 520
  const contexto = await browser.newContext({
    viewport: { width: 358, height: 520 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await page.goto(`${EDIFICIO}&explodido=1&cor=nkPilares`);
  await page.waitForFunction(() => "__vista3d" in window);
  const legenda = page.getByLabel("Legenda das cores");
  const escala = legenda.getByText("Nk nos pilares (kN)");
  // recolhida: um <details> fechado, com a escala escondida
  await expect(legenda).toHaveJSProperty("tagName", "DETAILS");
  await expect(escala).toBeHidden();
  // sem rótulos dos níveis na tela estreita
  expect(
    await page.evaluate(() => {
      type No = { visible: boolean; userData: { rotuloNivel?: boolean } };
      const c = (
        window as unknown as {
          __vista3d: { cena: { traverse(f: (o: No) => void): void } };
        }
      ).__vista3d;
      let n = 0;
      c.cena.traverse((o) => {
        if (o.userData.rotuloNivel) n++;
      });
      return n;
    }),
  ).toBe(0);
  // aberta, a barra de vistas fica numa linha só, que rola de lado
  await abrirVistas(page);
  const vistas = page.getByRole("toolbar", { name: "Vistas" });
  expect((await vistas.boundingBox())?.height).toBeLessThan(60);
  expect(await vistas.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const desenho = await page.getByTestId("vista-3d").locator("canvas").boundingBox();
  expect(desenho?.height).toBeGreaterThanOrEqual(288);
  await expect(page.getByText(AVISO)).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(PRINTS, "edificio-celular.png") });
  // aberta, a legenda mostra a escala do Nk
  await legenda.getByText("Legenda", { exact: true }).click();
  await expect(legenda).toHaveAttribute("open", "");
  await expect(escala).toBeVisible();
  expect(erros).toEqual([]);
  await contexto.close();
});

test("edifício no celular embutido: o cartão do pilar cabe acima do aviso e o botão Vistas é opaco", async ({
  browser,
}) => {
  // o iframe do site no celular (medido em 360, 390 e 412 px de largura): 348 × 459, no
  // tema escuro (o do site)
  const contexto = await browser.newContext({
    viewport: { width: 348, height: 459 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await page.goto(`${EDIFICIO}&cor=concreto&foco=pilar~1º pavimento~P6&camada=render,armadura`);
  await page.waitForFunction(() => "__vista3d" in window);
  const cartao = page.getByRole("region", { name: "Elemento selecionado: P6" });
  await expect(cartao).toBeVisible({ timeout: 20_000 });
  const aviso = await page.getByText(AVISO).boundingBox();
  const desenho = page.getByTestId("vista-3d").locator("canvas");
  if (!aviso) throw new Error("sem aviso");
  // resumo de uma linha: inteiro acima do aviso
  const detalhes = cartao.getByRole("button", { name: "Detalhes" });
  await expect(detalhes).toHaveAttribute("aria-expanded", "false");
  await expect(cartao).toContainText("1º pavimento");
  let caixa = await cartao.boundingBox();
  expect((caixa?.y ?? 0) + (caixa?.height ?? 0)).toBeLessThanOrEqual(aviso.y + 1);
  const chave =
    (await page.evaluate(() => (window as unknown as { __vista3d: CenaCamera }).__vista3d.selecao)) ??
    undefined;
  // sem a chave, caixaNaTela mediria o prédio inteiro, não o pilar
  expect(chave).toBeTruthy();
  // aberto: rola por dentro, sem passar do aviso, e o desenho guarda 11 rem
  await detalhes.click();
  await expect(cartao.getByRole("button", { name: "Resumo" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  caixa = await cartao.boundingBox();
  expect((caixa?.y ?? 0) + (caixa?.height ?? 0)).toBeLessThanOrEqual(aviso.y + 1);
  expect(caixa?.height).toBeGreaterThanOrEqual(112);
  expect((await desenho.boundingBox())?.height).toBeGreaterThanOrEqual(176);
  // o pilar continua inteiro no desenho menor
  await page.waitForTimeout(300);
  const p6 = await caixaNaTela(page, chave);
  expect(p6.topo).toBeGreaterThanOrEqual(0);
  expect(p6.base).toBeLessThanOrEqual(p6.h);
  expect(p6.esq).toBeGreaterThanOrEqual(0);
  expect(p6.dir).toBeLessThanOrEqual(p6.w);
  const ultimo = cartao.getByRole("button", { name: "Ver nos resultados" });
  await ultimo.scrollIntoViewIfNeeded();
  await expect(ultimo).toBeInViewport();
  // botão Vistas e legenda recolhida com fundo opaco (a estrutura não aparece através)
  const alfa = (sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const c = document.createElement("canvas").getContext("2d");
      if (!c) return -1;
      // começa transparente: cor que o canvas não entendesse daria 0, não 255
      c.fillStyle = "rgba(0, 0, 0, 0)";
      c.fillStyle = getComputedStyle(el).backgroundColor;
      c.fillRect(0, 0, 1, 1);
      return c.getImageData(0, 0, 1, 1).data[3];
    });
  expect(await alfa("button[aria-expanded]:has-text('Vistas')")).toBe(255);
  expect(await alfa("details[aria-label='Legenda das cores']")).toBe(255);
  await page.screenshot({ path: path.join(PRINTS, "edificio-celular-armadura.png") });
  // outra seleção volta ao resumo
  await cartao.getByRole("button", { name: "Fechar seleção" }).click();
  await expect(cartao).toHaveCount(0);
  await page.evaluate(
    (k) =>
      (
        window as unknown as { __vista3d: { selecionar(k: string | null): void } }
      ).__vista3d.selecionar(k),
    chave ?? null,
  );
  await expect(cartao.getByRole("button", { name: "Detalhes" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(erros).toEqual([]);
  await contexto.close();
});

test("sem embed, o link abre a demo e mostra a dica da tela", async ({ page }) => {
  await page.goto("/?exemplo=nbr6118-2023&aba=resultados");
  await expect(page).toHaveURL(/\/obra$/);
  await expect(page.getByRole("region", { name: "Como ler os resultados" })).toBeVisible();
  await expect(page.getByText(AVISO)).toBeVisible();
});

// Link de demonstração (src/telas/demo.ts): cada link abre a obra-exemplo calculada na aba
// e na vista 3D pedidas, sem passo manual, também dentro de um iframe de outro site. No modo
// embutido não aparece dica de primeiro uso nem é gravado rascunho no IndexedDB, e o aviso
// de conferência continua no rodapé. Rode com PORT=4431 bun x playwright test e2e/demo.spec.ts
// As fotos vão para e2e/prints/demo/.
import { expect, type Page, test } from "@playwright/test";
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
  const camada = page.getByRole("button", { name: "Original × Corrigido", exact: true });
  const explodido = page.getByRole("button", { name: /Explodido/ });
  await expect(camada).toHaveAttribute("aria-pressed", "true");
  await expect(explodido).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Planta" }).click();
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => "__vista3d" in window);
  await page.waitForTimeout(800);
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
  await expect(page.getByRole("button", { name: "Frente", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(1500);
  const explodida = await direcaoDaCamera(page);
  const cos = frente.reduce((s, v, i) => s + v * (explodida[i] ?? 0), 0);
  expect(cos).toBeGreaterThan(0.999);
});

test("sem embed, o link abre a demo e mostra a dica da tela", async ({ page }) => {
  await page.goto("/?exemplo=nbr6118-2023&aba=resultados");
  await expect(page).toHaveURL(/\/obra$/);
  await expect(page.getByRole("region", { name: "Como ler os resultados" })).toBeVisible();
  await expect(page.getByText(AVISO)).toBeVisible();
});

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

test("sem embed, o link abre a demo e mostra a dica da tela", async ({ page }) => {
  await page.goto("/?exemplo=nbr6118-2023&aba=resultados");
  await expect(page).toHaveURL(/\/obra$/);
  await expect(page.getByRole("region", { name: "Como ler os resultados" })).toBeVisible();
  await expect(page.getByText(AVISO)).toBeVisible();
});

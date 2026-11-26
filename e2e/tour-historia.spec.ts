// Os atos do tour guiado no link "Guided tour" do site (camada=render,tour, embutido): a
// obra subindo, o caminho das cargas, a armadura em raio-x e o Nk no explodido, cada um
// desfeito ao sair, no computador e no iframe do celular (348 × 459), com o console limpo.
// Rode com bun x playwright test e2e/tour-historia.spec.ts.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/tour-historia");
fs.mkdirSync(PRINTS, { recursive: true });

test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

const TOUR = "/?exemplo=edificio&aba=3d&moldura=0&painel=0&embed=1&cor=concreto&camada=render,tour";

function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") erros.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

/** O que a cena mostra agora: peças visíveis, fontes de cor e transparência do tour,
 *  objetos do tour na cena, a escala das barras e o explodido. */
const cena = (page: Page) =>
  page.evaluate(() => {
    type Obj = { name: string; scale: { y: number }; children: Obj[] };
    const c = (
      window as unknown as {
        __vista3d: {
          modelo: { elementos: { chave: string }[] };
          estaVisivel(k: string): boolean;
          fontesAtivas(): { cores: string[]; transparencias?: string[] };
          cena: Obj;
          explodido: boolean;
        };
      }
    ).__vista3d;
    const nomes: Record<string, Obj> = {};
    const andar = (o: Obj) => {
      nomes[o.name] = o;
      o.children.forEach(andar);
    };
    andar(c.cena);
    return {
      visiveis: c.modelo.elementos.filter((e) => c.estaVisivel(e.chave)).length,
      total: c.modelo.elementos.length,
      cores: c.fontesAtivas().cores,
      setas: "tour setas" in nomes,
      barras: nomes["tour armadura"]?.scale.y ?? null,
      explodido: c.explodido,
    };
  });

for (const [tela, viewport, celular] of [
  ["computador", { width: 1200, height: 640 }, false],
  ["celular", { width: 348, height: 459 }, true],
] as const)
  test(`tour guiado embutido (${tela}): os atos da obra, das cargas, da armadura e do Nk`, async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const contexto = await browser.newContext({
      viewport,
      isMobile: celular,
      hasTouch: celular,
      colorScheme: "dark",
    });
    const page = await contexto.newPage();
    const erros = vigiarErros(page);
    await page.goto(TOUR);
    const legenda = page.getByTestId("legenda-tour");
    const texto = (t: RegExp) => expect(legenda).toContainText(t, { timeout: 20_000 });
    const foto = (nome: string) =>
      page.screenshot({ path: path.join(PRINTS, `${tela}-${nome}.png`) });
    await texto(/Prédio inteiro/);

    // 2: a obra sobe; as peças aparecem aos poucos e, no fim, todas
    await texto(/A obra sobe/);
    await page.waitForTimeout(1500);
    const cedo = await cena(page);
    await foto("2-obra");
    await page.waitForTimeout(1500);
    const depois = await cena(page);
    expect(cedo.visiveis).toBeLessThan(depois.visiveis);
    expect(depois.visiveis).toBeLessThan(depois.total);

    // 3: o caminho das cargas: cores do tour, setas e o rótulo com o Nk do lance
    await texto(/Caminho das cargas/);
    await expect(page.getByTestId("tour-nk")).toContainText(/Nk = [\d.,]+ kN/);
    const cargas = await cena(page);
    expect(cargas.visiveis).toBe(cargas.total);
    expect(cargas.cores).toContain("tour");
    expect(cargas.setas).toBe(true);
    await page.waitForTimeout(3000);
    await foto("3-cargas");

    // 4: a armadura do lance de baixo cresce dentro do concreto
    await texto(/Armadura do/);
    await page.waitForTimeout(600);
    const meio = await cena(page);
    expect(meio.setas).toBe(false);
    await expect(page.getByTestId("tour-nk")).toHaveCount(0);
    await page.waitForTimeout(2500);
    const cheia = await cena(page);
    expect(meio.barras).not.toBeNull();
    expect(cheia.barras).toBeCloseTo(1, 2);
    await foto("4-armadura");

    // 5: o Nk dos pilares no explodido
    await texto(/Nk nos pilares/);
    await page.waitForTimeout(2500);
    const nk = await cena(page);
    expect(nk.explodido).toBe(true);
    expect(nk.cores).toContain("tour");
    expect(nk.barras).toBeNull();
    await foto("5-nk");

    // 6: um pavimento; o explodido e as cores do tour saem
    await expect(legenda).not.toContainText(/Nk nos pilares/, { timeout: 15_000 });
    const fim = await cena(page);
    expect(fim.explodido).toBe(false);
    expect(fim.cores).not.toContain("tour");
    await foto("6-nivel");
    expect(erros).toEqual([]);
    await contexto.close();
  });

/** Fontes do tour ainda registradas, objetos dele na cena e o explodido. */
const sobras = (page: Page) =>
  page.evaluate(() => {
    type Obj = { name: string; children: Obj[]; position: { y: number } };
    const c = (
      window as unknown as {
        __vista3d: {
          fontesAtivas(): Record<string, string[]>;
          cena: Obj;
          explodido: boolean;
        };
      }
    ).__vista3d;
    const nomes: string[] = [];
    const andar = (o: Obj) => {
      nomes.push(o.name);
      o.children.forEach(andar);
    };
    andar(c.cena);
    return {
      fontes: Object.entries(c.fontesAtivas()).flatMap(([tipo, ids]) =>
        ids.includes("tour") ? [tipo] : [],
      ),
      objetos: nomes.filter((n) => n.startsWith("tour")),
      rotulo: document.querySelectorAll("[data-testid='tour-nk']").length,
      explodido: c.explodido,
    };
  });

test("tour guiado com movimento reduzido: atos no estado final, parados, e desfeitos ao sair", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const contexto = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await contexto.newPage();
  const erros = vigiarErros(page);
  await page.goto("/?exemplo=edificio&aba=3d&moldura=0&cor=concreto&camada=tour");
  const legenda = page.getByTestId("legenda-tour");
  const painel = page.locator("#painel-3d");
  await expect(legenda).toContainText("Parada 1 de", { timeout: 20_000 });
  const proxima = () => painel.getByRole("button", { name: "Próxima" }).click();

  // a obra: com movimento reduzido, já inteira
  await proxima();
  await expect(legenda).toContainText("A obra sobe");
  expect((await cena(page)).visiveis).toBe((await cena(page)).total);

  // as cargas: lajes e vigas acesas em âmbar, o resto transparente, setas paradas
  await proxima();
  await expect(legenda).toContainText("Caminho das cargas");
  await expect(page.getByTestId("tour-nk")).toContainText(/Nk = [\d.,]+ kN/);
  const setas = () =>
    page.evaluate(() => {
      type Obj = { name: string; children: Obj[]; position: { y: number } };
      const c = (window as unknown as { __vista3d: { cena: Obj } }).__vista3d;
      const achar = (o: Obj): Obj | undefined =>
        o.name === "tour setas" ? o : o.children.map(achar).find(Boolean);
      return achar(c.cena)?.children.map((m) => m.position.y) ?? [];
    });
  const antes = await setas();
  await page.waitForTimeout(700);
  expect(await setas()).toEqual(antes);
  expect(antes).toHaveLength(3);
  // o explodido muda a altura da coluna: as setas paradas acompanham, ida e volta
  const explodido = page
    .getByRole("toolbar", { name: "Vistas" })
    .getByRole("button", { name: "Explodido" });
  await explodido.click();
  await expect.poll(setas).not.toEqual(antes);
  await explodido.click();
  await expect.poll(setas).toEqual(antes);
  const acesas = await page.evaluate(() => {
    const c = (
      window as unknown as {
        __vista3d: { modelo: { elementos: { chave: string; tipo: string }[] }; corDe(k: string): string | undefined };
      }
    ).__vista3d;
    return c.modelo.elementos
      .filter((e) => c.corDe(e.chave) === "#fbbf24")
      .map((e) => e.tipo);
  });
  expect(acesas).toContain("laje");
  expect(acesas).toContain("viga");
  expect((await sobras(page)).fontes).toEqual(
    expect.arrayContaining(["cores", "transparencias", "legendas"]),
  );

  // a armadura: barras inteiras de uma vez; as setas e o rótulo saíram
  await proxima();
  await expect(legenda).toContainText("Armadura do");
  expect((await cena(page)).barras).toBe(1);
  expect((await sobras(page)).objetos).toEqual(["tour armadura"]);
  expect((await sobras(page)).rotulo).toBe(0);

  // o Nk: explodido; Anterior volta à armadura e junta o prédio
  await proxima();
  await expect(legenda).toContainText("Nk nos pilares");
  expect((await sobras(page)).explodido).toBe(true);
  await painel.getByRole("button", { name: "Anterior" }).click();
  await expect(legenda).toContainText("Armadura do");
  expect((await sobras(page)).explodido).toBe(false);

  // entrar na caminhada no meio de um ato desfaz o ato
  await painel.getByRole("button", { name: "Andar pela estrutura" }).click();
  await expect(legenda).toContainText("Caminhando");
  expect(await sobras(page)).toEqual({ fontes: [], objetos: [], rotulo: 0, explodido: false });

  // sair da caminhada, ir às cargas e desligar a camada no meio do ato
  await painel.getByRole("button", { name: "Sair da caminhada" }).click();
  await painel.getByRole("button", { name: "Anterior" }).click();
  await expect(legenda).toContainText("Caminho das cargas");
  expect((await sobras(page)).objetos).toEqual(["tour setas"]);
  await page.getByRole("button", { name: "Tour", exact: true }).click();
  await expect(legenda).toHaveCount(0);
  expect(await sobras(page)).toEqual({ fontes: [], objetos: [], rotulo: 0, explodido: false });
  expect(erros).toEqual([]);
  await contexto.close();
});

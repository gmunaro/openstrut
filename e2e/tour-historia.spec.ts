// Os atos do tour guiado no link "Guided tour" do site (camada=render,tour, embutido): a
// obra subindo, o caminho das cargas, a armadura em raio-x e o Nk no explodido, cada um
// desfeito ao sair, no computador e no iframe do celular (348 × 459), com o console limpo.
// O enquadramento usa a altura livre (o prédio final na obra, o lance na armadura), os
// rótulos dos níveis somem de perto e a legenda do celular cabe numa linha.
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

/** Caixa na tela (px do desenho) do lance da armadura (o contorno do tour), das barras
 *  dele ou do prédio inteiro, o tamanho do desenho e quantos rótulos de nível estão na
 *  cena. */
const naTela = (page: Page, alvo: "lance" | "barras" | "predio") =>
  page.evaluate((alvo) => {
    type V = { x: number; y: number; z: number; clone(): V; project(c: unknown): V };
    type Caixa = {
      min: V;
      max: V;
      clone(): Caixa;
      makeEmpty(): Caixa;
      expandByObject(o: unknown): Caixa;
    };
    type Obj = { name: string; children: Obj[]; userData: { rotuloNivel?: boolean } };
    const v = (
      window as unknown as {
        __vista3d: {
          camera: unknown;
          cena: Obj;
          renderer: { domElement: HTMLCanvasElement };
          caixaNaCena(): Caixa;
        };
      }
    ).__vista3d;
    const todos: Obj[] = [];
    const andar = (o: Obj) => {
      todos.push(o);
      o.children.forEach(andar);
    };
    andar(v.cena);
    const objeto = todos.find(
      (o) => o.name === (alvo === "lance" ? "tour contorno" : "tour armadura"),
    );
    const caixa =
      alvo === "predio"
        ? v.caixaNaCena()
        : objeto
          ? v.caixaNaCena().clone().makeEmpty().expandByObject(objeto)
          : null;
    const w = v.renderer.domElement.clientWidth;
    const h = v.renderer.domElement.clientHeight;
    const rotulos = todos.filter((o) => o.userData.rotuloNivel).length;
    if (!caixa) return { w, h, rotulos, x0: 0, x1: 0, y0: 0, y1: 0 };
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const x of [caixa.min.x, caixa.max.x])
      for (const y of [caixa.min.y, caixa.max.y])
        for (const z of [caixa.min.z, caixa.max.z]) {
          const p = caixa.min.clone();
          Object.assign(p, { x, y, z });
          const s = p.project(v.camera);
          const px = ((s.x + 1) / 2) * w;
          const py = ((1 - s.y) / 2) * h;
          [x0, x1, y0, y1] = [Math.min(x0, px), Math.max(x1, px), Math.min(y0, py), Math.max(y1, py)];
        }
    return { w, h, rotulos, x0, x1, y0, y1 };
  }, alvo);

/** A legenda do tour cabe sem cortar o texto (o celular embutido a deixa numa linha). */
const legendaCabe = (page: Page) =>
  page
    .getByTestId("legenda-tour")
    .locator("p")
    .first()
    .evaluate((p) => p.scrollWidth <= p.clientWidth + 1);

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
    await page.waitForTimeout(1200);
    // o celular embutido nunca mostra os rótulos; no computador, o prédio inteiro os mostra
    expect((await naTela(page, "predio")).rotulos > 0).toBe(!celular);

    // 2: a obra sobe; as peças aparecem aos poucos e, no fim, todas
    await texto(/A obra sobe/);
    await page.waitForTimeout(1500);
    const cedo = await cena(page);
    await foto("2-obra");
    await page.waitForTimeout(1500);
    const depois = await cena(page);
    expect(cedo.visiveis).toBeLessThan(depois.visiveis);
    expect(depois.visiveis).toBeLessThan(depois.total);
    // a câmera já enquadra o prédio final, que ocupa a altura (ou a largura) livre
    const obra = await naTela(page, "predio");
    expect(
      Math.max((obra.y1 - obra.y0) / obra.h, (obra.x1 - obra.x0) / obra.w),
    ).toBeGreaterThan(0.8);
    expect(obra.y0).toBeGreaterThan(-2);
    expect(obra.y1).toBeLessThan(obra.h + 2);
    if (celular) expect(await legendaCabe(page)).toBe(true);

    // 3: o caminho das cargas: cores do tour, setas e o rótulo com o Nk do lance
    await texto(/Caminho das cargas/);
    await expect(page.getByTestId("tour-nk")).toContainText(/Nk = [\d.,]+ kN/);
    const cargas = await cena(page);
    expect(cargas.visiveis).toBe(cargas.total);
    expect(cargas.cores).toContain("tour");
    expect(cargas.setas).toBe(true);
    if (celular) expect(await legendaCabe(page)).toBe(true);
    await page.waitForTimeout(3000);
    await foto("3-cargas");

    // 4: a armadura do lance de baixo cresce dentro do concreto, com o lance no centro, de
    // pé na altura livre, com o contorno e sem os rótulos dos níveis
    await texto(/Armadura · P\d+/);
    await page.waitForTimeout(600);
    const meio = await cena(page);
    expect(meio.setas).toBe(false);
    await expect(page.getByTestId("tour-nk")).toHaveCount(0);
    await page.waitForTimeout(2500);
    const cheia = await cena(page);
    expect(meio.barras).not.toBeNull();
    expect(cheia.barras).toBeCloseTo(1, 2);
    const lance = await naTela(page, "lance");
    expect(lance.x1).toBeGreaterThan(lance.x0);
    expect((lance.y1 - lance.y0) / lance.h).toBeGreaterThan(0.6);
    expect(lance.y0).toBeGreaterThan(-2);
    expect(lance.y1).toBeLessThan(lance.h + 2);
    const meioX = (lance.x0 + lance.x1) / 2 / lance.w;
    expect(meioX).toBeGreaterThan(0.3);
    expect(meioX).toBeLessThan(0.7);
    expect(lance.rotulos).toBe(0);
    // as barras (com as esperas acima do lance) cabem inteiras no desenho
    const barras = await naTela(page, "barras");
    expect(barras.y1 - barras.y0).toBeGreaterThan(lance.y1 - lance.y0);
    expect((barras.y1 - barras.y0) / barras.h).toBeGreaterThan(0.75);
    expect(barras.y0).toBeGreaterThan(-2);
    expect(barras.y1).toBeLessThan(barras.h + 2);
    if (celular) expect(await legendaCabe(page)).toBe(true);
    await foto("4-armadura");

    // 5: o Nk dos pilares no explodido
    await texto(/Nk nos pilares/);
    await page.waitForTimeout(2500);
    const nk = await cena(page);
    expect(nk.explodido).toBe(true);
    expect(nk.cores).toContain("tour");
    expect(nk.barras).toBeNull();
    expect((await naTela(page, "predio")).rotulos > 0).toBe(!celular);
    if (celular) expect(await legendaCabe(page)).toBe(true);
    await foto("5-nk");

    // 6: um pavimento; o explodido e as cores do tour saem
    await expect(legenda).not.toContainText(/Nk nos pilares/, { timeout: 15_000 });
    const fim = await cena(page);
    expect(fim.explodido).toBe(false);
    expect(fim.cores).not.toContain("tour");
    await expect(legenda).toContainText(/pavimento/);
    expect((await naTela(page, "predio")).rotulos).toBe(0);
    if (celular) expect(await legendaCabe(page)).toBe(true);
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
  await expect(legenda).toContainText("Armadura · ");
  expect((await cena(page)).barras).toBe(1);
  expect((await sobras(page)).objetos.sort()).toEqual(["tour armadura", "tour contorno"]);
  expect((await sobras(page)).fontes).toContain("rotulosOcultos");
  expect((await sobras(page)).rotulo).toBe(0);

  // o Nk: explodido; Anterior volta à armadura e junta o prédio
  await proxima();
  await expect(legenda).toContainText("Nk nos pilares");
  expect((await sobras(page)).explodido).toBe(true);
  await painel.getByRole("button", { name: "Anterior" }).click();
  await expect(legenda).toContainText("Armadura · ");
  expect((await sobras(page)).explodido).toBe(false);

  // entrar na caminhada no meio de um ato desfaz o ato
  await painel.getByRole("button", { name: "Andar pela estrutura" }).click();
  await expect(legenda).toContainText("Caminhando");
  expect((await naTela(page, "predio")).rotulos).toBeGreaterThan(0);
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

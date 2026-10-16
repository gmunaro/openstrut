// Interface em telas de celular, tablet, desktop e 4K: sem rolagem horizontal da página,
// alvos de toque de 44 px no celular, letra maior no 4K e o fluxo criar obra → lançar →
// calcular → ver resultados só com o dedo (toque emulado; arrasto e pinça pelo CDP, como
// o Chrome do Android manda).
import path from "node:path";
import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { lerRodape, type Ponto } from "./planta";

const OBRA = path.resolve("e2e/fixtures/laje-r3-original.openstrut.json");

type Tela = { nome: string; largura: number; altura: number; dpr?: number; celular?: boolean };
const TELAS: Tela[] = [
  { nome: "Android retrato 360", largura: 360, altura: 800, celular: true },
  { nome: "Android retrato 412", largura: 412, altura: 915, celular: true },
  { nome: "Android deitado", largura: 800, altura: 360, celular: true },
  { nome: "tablet", largura: 768, altura: 1024 },
  { nome: "desktop 1366", largura: 1366, altura: 768 },
  { nome: "desktop 1920", largura: 1920, altura: 1080 },
  { nome: "4K densidade 1", largura: 3840, altura: 2160, dpr: 1 },
  { nome: "4K densidade 2", largura: 1920, altura: 1080, dpr: 2 },
];
const CELULARES = TELAS.filter((t) => t.celular);

/** Alvo de toque mínimo (WCAG 2.5.5 / Material): 44 × 44 px. */
const ALVO = 44;

const usarTela = (t: Tela) =>
  test.use({
    viewport: { width: t.largura, height: t.altura },
    deviceScaleFactor: t.dpr ?? 1,
    hasTouch: t.celular ?? false,
    isMobile: t.celular ?? false,
  });

/** Sem os seletores nativos de arquivo: o app cai no <input type=file> e no download. */
async function semSeletorNativo(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "showOpenFilePicker");
    Reflect.deleteProperty(window, "showSaveFilePicker");
  });
}

async function abrirObra(page: Page) {
  await semSeletorNativo(page);
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles(OBRA);
  await expect(page).toHaveURL(/\/obra$/);
}

/** A página não rola de lado: nem o documento, nem o contêiner da rota, nem a aba visível
 *  (quem rola de lado são só as tabelas, cada uma no seu contêiner). */
async function semRolagemHorizontal(page: Page, onde: string) {
  const m = await page.evaluate(() => {
    const sobra = (el: Element | null) => (el ? el.scrollWidth - el.clientWidth : 0);
    return {
      documento: document.documentElement.scrollWidth - window.innerWidth,
      rota: sobra(document.querySelector("#root > div > div")),
      aba: sobra(document.querySelector('[role="tabpanel"]:not([hidden])')),
    };
  });
  expect(m, `rolagem horizontal em ${onde}`).toEqual({ documento: 0, rota: 0, aba: 0 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

/** Todos os controles visíveis dentro de `onde` têm pelo menos 44 × 44 px. */
async function alvosDeToque(onde: Locator, descricao: string) {
  const controles = onde.locator("button:visible, a:visible, select:visible, input:visible");
  const n = await controles.count();
  expect(n, `controles em ${descricao}`).toBeGreaterThan(0);
  const pequenos: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = controles.nth(i);
    const b = await c.boundingBox();
    if (!b) continue;
    if (b.width < ALVO - 0.5 || b.height < ALVO - 0.5) {
      const nome =
        (await c.getAttribute("aria-label")) ?? (await c.innerText()).trim().slice(0, 30);
      pequenos.push(`${nome} (${Math.round(b.width)}×${Math.round(b.height)})`);
    }
  }
  expect(pequenos, `alvos menores que ${ALVO} px em ${descricao}`).toEqual([]);
}

for (const tela of TELAS) {
  test.describe(`${tela.nome} (${tela.largura}×${tela.altura})`, () => {
    usarTela(tela);

    test("nenhuma tela rola de lado; diálogos cabem na tela", async ({ page }) => {
      await abrirObra(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "OpenStrut V2" })).toBeVisible();
      await semRolagemHorizontal(page, "início");
      await abrirObra(page);

      const svg = page.getByRole("application", { name: "Planta do pavimento" });
      await expect(svg).toBeVisible();
      await semRolagemHorizontal(page, "planta");
      // o desenho fica com a maior parte da tela (no celular, sem o painel ao lado)
      const caixa = await svg.boundingBox();
      expect(caixa).not.toBeNull();
      if (caixa && tela.celular) {
        expect(caixa.width).toBeGreaterThan(tela.largura * 0.8);
        expect(caixa.height).toBeGreaterThan(tela.altura * (tela.altura < 500 ? 0.4 : 0.55));
      }

      await page.getByRole("tab", { name: "Resultados", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Pilares", exact: true })).toBeVisible();
      await semRolagemHorizontal(page, "resultados");

      await page.getByRole("tab", { name: "Relatório", exact: true }).click();
      await expect(page.getByText("Relatório de cálculo", { exact: false }).first()).toBeVisible();
      await semRolagemHorizontal(page, "relatório");

      // Materiais: no celular fica na folha "Mais ações"
      if (tela.celular) await page.getByRole("button", { name: "Mais ações" }).click();
      await page.getByRole("button", { name: "Materiais", exact: true }).click();
      const dialogo = page.getByRole("dialog", { name: "Obra e materiais" });
      await expect(dialogo).toBeVisible();
      await page.waitForTimeout(250); // fim da animação de abertura
      const d = await dialogo.boundingBox();
      expect(d).not.toBeNull();
      if (d) {
        expect(d.x).toBeGreaterThanOrEqual(0);
        expect(d.y).toBeGreaterThanOrEqual(0);
        expect(d.x + d.width).toBeLessThanOrEqual(tela.largura + 0.5);
        expect(d.y + d.height).toBeLessThanOrEqual(tela.altura + 0.5);
        // celular: tela cheia
        if (tela.celular) expect(d.width).toBeGreaterThanOrEqual(tela.largura - 0.5);
      }
      await expect(dialogo.getByLabel("fck (MPa)", { exact: true })).toHaveAttribute(
        "inputmode",
        "decimal",
      );
      // o botão Aplicar se alcança rolando dentro do diálogo
      const aplicar = dialogo.getByRole("button", { name: "Aplicar", exact: true });
      await aplicar.scrollIntoViewIfNeeded();
      await expect(aplicar).toBeInViewport();
      await semRolagemHorizontal(page, "diálogo de materiais");
    });
  });
}

for (const tela of CELULARES) {
  test.describe(`alvos de toque, ${tela.nome}`, () => {
    usarTela(tela);

    test("cabeçalho, pavimentos, abas, ferramentas e folha com 44 px", async ({ page }) => {
      await abrirObra(page);
      await expect(page.getByRole("button", { name: "Mais ações" })).toBeVisible();
      await alvosDeToque(page.locator("header").first(), "cabeçalho");
      await alvosDeToque(page.getByRole("navigation", { name: "Pavimentos" }), "pavimentos");
      await alvosDeToque(page.getByRole("tablist"), "abas");
      await alvosDeToque(
        page.getByRole("toolbar", { name: "Ferramentas da planta" }),
        "ferramentas da planta",
      );

      await page.getByRole("button", { name: "Editar pavimento" }).tap();
      await expect(page.getByLabel(/Pé-direito/)).toBeVisible();
      await expect(page.getByLabel(/Pé-direito/)).toHaveAttribute("inputmode", "decimal");
      const altura = (await page.getByLabel(/Pé-direito/).boundingBox())?.height ?? 0;
      expect(altura).toBeGreaterThanOrEqual(ALVO - 0.5);
      await page.getByRole("button", { name: "Editar pavimento" }).tap();

      await page.getByRole("button", { name: "Propriedades", exact: true }).tap();
      const folha = page.getByRole("complementary", { name: "Propriedades" });
      await expect(folha).toBeVisible();
      await alvosDeToque(folha, "folha de propriedades");
      await folha.getByRole("button", { name: "Fechar propriedades" }).tap();
      await expect(folha).toBeHidden();

      await page.getByRole("button", { name: "Mais ações" }).tap();
      await alvosDeToque(page.getByRole("dialog", { name: "Ações da obra" }), "ações da obra");
    });
  });
}

/**
 * Coluna fixa das tabelas de resultados (lajes, vigas, pilares, equilíbrio,
 * quantitativos). Sem rolagem, a 1ª célula de cada linha termina antes de a 2ª começar.
 * Rolada, a 1ª célula tem fundo opaco e fica por cima, e a rolagem encaixa no começo de
 * uma coluna: nenhuma célula fica pela metade atrás da coluna fixa (as de grupo, com
 * colSpan, abrangem várias colunas e ficam de fora). A unidade do cabeçalho não quebra.
 */
async function conferirColunaFixa(page: Page, onde: string) {
  const sem = await page.evaluate(() => {
    const out: string[] = [];
    let tabelas = 0;
    for (const cont of document.querySelectorAll<HTMLElement>(
      '[role="tabpanel"]:not([hidden]) [data-slot="tabela-rolagem"]',
    )) {
      tabelas++;
      cont.scrollLeft = 0;
      for (const tr of cont.querySelectorAll("tr")) {
        const [a, b] = tr.children;
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        if (ra.right > rb.left + 0.5)
          out.push(`"${a.textContent}" (até ${ra.right}) sobre "${b.textContent}" (de ${rb.left})`);
      }
      for (const u of cont.querySelectorAll("th span.block")) {
        const faixa = document.createRange();
        faixa.selectNodeContents(u);
        const linhas = new Set([...faixa.getClientRects()].map((r) => Math.round(r.top)));
        if (linhas.size > 1) out.push(`unidade quebrada: ${u.textContent}`);
      }
    }
    return { out, tabelas };
  });
  expect(sem.tabelas, `tabelas em ${onde}`).toBeGreaterThan(2);
  expect(sem.out, `sobreposição sem rolagem em ${onde}`).toEqual([]);

  const roladas = await page.evaluate(() => {
    let n = 0;
    for (const c of document.querySelectorAll<HTMLElement>(
      '[role="tabpanel"]:not([hidden]) [data-slot="tabela-rolagem"]',
    ))
      if (c.scrollWidth > c.clientWidth + 40) {
        c.scrollTo({ left: (c.scrollWidth - c.clientWidth) / 3 });
        n++;
      }
    return n;
  });
  expect(roladas, `tabelas largas em ${onde}`).toBeGreaterThan(0);
  await page.waitForTimeout(600); // o encaixe da rolagem termina
  const com = await page.evaluate(() => {
    const out: string[] = [];
    for (const cont of document.querySelectorAll<HTMLElement>(
      '[role="tabpanel"]:not([hidden]) [data-slot="tabela-rolagem"]',
    )) {
      if (cont.scrollLeft === 0) continue;
      // só linhas de dados: no relatório a tabela inteira fica dentro do tbody da tabela
      // de layout, e "tbody tr" pegaria também as do thead
      for (const tr of cont.querySelectorAll("tr")) {
        if (tr.parentElement?.tagName !== "TBODY") continue;
        const [a, ...resto] = [...tr.children] as HTMLTableCellElement[];
        if (!a || resto.length === 0) continue;
        const ra = a.getBoundingClientRect();
        if (getComputedStyle(a).position !== "sticky") out.push(`"${a.textContent}" não é fixa`);
        const fundo = getComputedStyle(a).backgroundColor;
        if (fundo === "transparent" || /\/ 0\)|, 0\)$/.test(fundo))
          out.push(`"${a.textContent}" com fundo transparente`);
        const topo = document.elementFromPoint(ra.left + ra.width / 2, ra.top + ra.height / 2);
        if (topo && !a.contains(topo)) out.push(`"${a.textContent}" coberta por ${topo.tagName}`);
        for (const c of resto) {
          if (c.colSpan > 1) continue;
          const rc = c.getBoundingClientRect();
          if (rc.left < ra.right - 0.5 && rc.right > ra.right + 0.5)
            out.push(`"${c.textContent}" pela metade atrás de "${a.textContent}"`);
        }
      }
    }
    return out;
  });
  expect(com, `coluna fixa rolada em ${onde}`).toEqual([]);
}

for (const tela of CELULARES.filter((t) => t.largura < 500)) {
  test.describe(`coluna fixa das tabelas, ${tela.nome}`, () => {
    usarTela(tela);
    test("a 1ª coluna não cobre a 2ª, nem parada nem rolada", async ({ page }) => {
      await abrirObra(page);
      await page.getByRole("tab", { name: "Resultados", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Pilares", exact: true })).toBeVisible();
      await conferirColunaFixa(page, "resultados");
      await page.getByRole("tab", { name: "Relatório", exact: true }).click();
      await expect(page.locator('[role="tabpanel"]:not([hidden]) [data-slot="tabela-rolagem"]').first()).toBeVisible();
      await conferirColunaFixa(page, "relatório");
    });
  });
}

test.describe("4K", () => {
  test.describe("densidade 1", () => {
    usarTela({ nome: "4K", largura: 3840, altura: 2160, dpr: 1 });
    test("letra maior e resultados com largura de leitura", async ({ page }) => {
      await abrirObra(page);
      const base = await page.evaluate(() =>
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
      expect(base).toBeGreaterThanOrEqual(20);
      await page.getByRole("tab", { name: "Resultados", exact: true }).click();
      const conteudo = page.locator('[role="tabpanel"]:not([hidden]) > div').first();
      const b = await conteudo.boundingBox();
      expect(b).not.toBeNull();
      if (b) {
        expect(b.width).toBeLessThan(3840 * 0.8);
        // centrado
        expect(Math.abs(b.x + b.width / 2 - 3840 / 2)).toBeLessThan(40);
      }
    });
  });
  test.describe("densidade 2", () => {
    usarTela({ nome: "4K@2x", largura: 1920, altura: 1080, dpr: 2 });
    test("letra-base de desktop", async ({ page }) => {
      await abrirObra(page);
      const base = await page.evaluate(() =>
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
      expect(base).toBe(16);
    });
  });
});

test.describe("app instalado (standalone) no celular", () => {
  usarTela(TELAS[1]!);
  test("início sem a seção Instalar; obra sem rolagem lateral e com o cabeçalho compacto", async ({
    page,
  }) => {
    // o Chrome não emula display-mode pelo CDP; o app só lê o modo pelo matchMedia
    // (instalar.ts), e o CSS não depende dele
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q === "(display-mode: standalone)"
          ? ({ ...original(q), matches: true, media: q } as MediaQueryList)
          : original(q);
    });
    await semSeletorNativo(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "OpenStrut V2" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Instalar" })).toHaveCount(0);
    await semRolagemHorizontal(page, "início no app instalado");
    const [escolha] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
    ]);
    await escolha.setFiles(OBRA);
    await expect(page.getByRole("button", { name: "Mais ações" })).toBeVisible();
    await semRolagemHorizontal(page, "obra no app instalado");
  });
});

// ---------------------------------------------------------------------------------------
// Fluxo só com o dedo

/** Dedo único pelo CDP (o Playwright só tem o toque simples). */
function dedo(cdp: CDPSession) {
  const enviar = (type: "touchStart" | "touchMove" | "touchEnd", p?: Ponto) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [],
    });
  return {
    encostar: (p: Ponto) => enviar("touchStart", p),
    mover: (p: Ponto) => enviar("touchMove", p),
    soltar: () => enviar("touchEnd"),
  };
}

const quadros = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))),
  );

/** Ponto do mundo sob o dedo, pelo rodapé da planta (com a ferramenta Laje o rodapé
 *  segue o dedo desde que ele encosta). */
async function lerDedo(page: Page) {
  await quadros(page);
  return lerRodape(page);
}

/** Escala e origem da planta, medidas com dois toques (ferramenta Laje: um toque sem
 *  arrastar não cria nada). */
async function calibrarToque(page: Page, cdp: CDPSession, svg: Locator) {
  const b = await svg.boundingBox();
  if (!b) throw new Error("planta sem caixa");
  const d = dedo(cdp);
  const p1 = { x: b.x + 30, y: b.y + 30 };
  const p2 = { x: b.x + b.width - 90, y: b.y + b.height - 30 };
  await d.encostar(p1);
  const m1 = await lerDedo(page);
  await d.soltar();
  await d.encostar(p2);
  const m2 = await lerDedo(page);
  await d.soltar();
  const escala = (p2.x - p1.x) / (m2.x - m1.x);
  return {
    escala,
    paraTela: (m: Ponto): Ponto => ({
      x: p1.x + (m.x - m1.x) * escala,
      y: p1.y - (m.y - m1.y) * escala,
    }),
  };
}

/** Encosta o dedo onde o rodapé mostra `alvo` (corrigindo pelo rodapé) e o deixa ali. */
async function encostarEm(page: Page, cdp: CDPSession, svg: Locator, alvo: Ponto) {
  const cal = await calibrarToque(page, cdp, svg);
  const d = dedo(cdp);
  let p = cal.paraTela(alvo);
  for (let i = 0; i < 6; i++) {
    await d.encostar(p);
    const lido = await lerDedo(page);
    if (Math.abs(lido.x - alvo.x) < 0.005 && Math.abs(lido.y - alvo.y) < 0.005) return { p, cal };
    await d.soltar();
    p = { x: p.x + (alvo.x - lido.x) * cal.escala, y: p.y - (alvo.y - lido.y) * cal.escala };
  }
  throw new Error(`o dedo não chegou a (${alvo.x}; ${alvo.y}) m`);
}

/** Desenha a laje de `a` a `b` arrastando um dedo (ferramenta Laje já escolhida). */
async function desenharLaje(page: Page, cdp: CDPSession, svg: Locator, a: Ponto, b: Ponto) {
  const { p, cal } = await encostarEm(page, cdp, svg, a);
  const d = dedo(cdp);
  let q = cal.paraTela(b);
  // caminho em passos de um quadro, como um dedo de verdade (dedo rápido demais no fim do
  // arrasto vira "fling" no Chrome, e o toque seguinte só para o fling)
  for (let i = 1; i <= 12; i++) {
    await d.mover({ x: p.x + ((q.x - p.x) * i) / 12, y: p.y + ((q.y - p.y) * i) / 12 });
    await new Promise((ok) => setTimeout(ok, 16));
  }
  for (let i = 0; i < 6; i++) {
    const lido = await lerDedo(page);
    if (Math.abs(lido.x - b.x) < 0.005 && Math.abs(lido.y - b.y) < 0.005) break;
    q = { x: q.x + (b.x - lido.x) * cal.escala, y: q.y - (b.y - lido.y) * cal.escala };
    await d.mover(q);
  }
  // o dedo para antes de sair da tela
  await new Promise((ok) => setTimeout(ok, 120));
  await d.soltar();
}

/** Ponto da tela sobre `m`, achado com a ferramenta Laje (o dedo sai sem arrastar). */
async function telaDe(page: Page, cdp: CDPSession, svg: Locator, m: Ponto) {
  const { p } = await encostarEm(page, cdp, svg, m);
  await dedo(cdp).soltar();
  return p;
}

/** Toque num controle pela mesma sessão CDP dos arrastos, no ritmo de um dedo: o Chrome
 *  junta dois toques mandados com poucos milissegundos de intervalo num gesto só e não
 *  gera o clique do segundo (ninguém toca tão rápido). */
async function tocar(cdp: CDPSession, alvo: Locator) {
  await alvo.scrollIntoViewIfNeeded();
  const b = await alvo.boundingBox();
  if (!b) throw new Error("controle sem caixa");
  const d = dedo(cdp);
  await new Promise((ok) => setTimeout(ok, 150));
  await d.encostar({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  await new Promise((ok) => setTimeout(ok, 60));
  await d.soltar();
}

/** Toque num ponto da tela, no mesmo ritmo de `tocar`. */
async function tocarPonto(cdp: CDPSession, p: Ponto) {
  const d = dedo(cdp);
  await new Promise((ok) => setTimeout(ok, 150));
  await d.encostar(p);
  await new Promise((ok) => setTimeout(ok, 60));
  await d.soltar();
}

test.describe("fluxo no celular só com o dedo", () => {
  usarTela(TELAS[0]!);

  test("criar obra → lançar laje, pilar e viga → calcular → resultados", async ({ page }) => {
    test.setTimeout(180_000);
    await semSeletorNativo(page);
    const cdp = await page.context().newCDPSession(page);

    // 1. obra nova pela NBR 6118
    await page.goto("/");
    await tocar(cdp, page.getByLabel("Nome", { exact: true }));
    await page.getByLabel("Nome", { exact: true }).fill("Obra no celular");
    await tocar(cdp, page.getByRole("combobox", { name: "Norma" }));
    await tocar(cdp, page.getByRole("option", { name: "NBR 6118:2023", exact: true }));
    await tocar(cdp, page.getByRole("button", { name: "Criar obra", exact: true }));
    await expect(page).toHaveURL(/\/obra$/);
    await semRolagemHorizontal(page, "obra nova");

    const svg = page.getByRole("application", { name: "Planta do pavimento" });
    await expect(svg).toBeVisible();

    // 2. lajes arrastando o dedo; as vigas nascem nos bordos e os pilares nos cantos
    await tocar(cdp, page.getByRole("button", { name: "Laje", exact: true }));
    await desenharLaje(page, cdp, svg, { x: 0, y: 0 }, { x: 4, y: 5 });
    // (os toques de calibração deixam a dica "Arraste para desenhar…"; erro seria outra coisa)
    await expect(page.getByRole("status").filter({ hasText: /sobrep|inválid|fora/ })).toHaveCount(0);
    await tocar(cdp, page.getByRole("button", { name: "Laje", exact: true }));
    await desenharLaje(page, cdp, svg, { x: 4, y: 0 }, { x: 8, y: 5 });

    await tocar(cdp, page.getByRole("button", { name: "Propriedades", exact: true }));
    const folha = page.getByRole("complementary", { name: "Propriedades" });
    // a laje recém-desenhada fica selecionada: a folha mostra a L2, de 4 × 5 m
    await expect(folha).toContainText("Laje");
    await expect(folha.getByLabel(/^lx/)).toHaveValue(/^4([,.]0+)?$/);
    await expect(folha.getByLabel(/^ly/)).toHaveValue(/^5([,.]0+)?$/);
    await expect(svg).toContainText("L1");
    await expect(svg).toContainText("L2");
    await tocar(cdp, folha.getByRole("button", { name: "Fechar propriedades" }));

    // 3. pilar com um toque sobre o eixo da viga de baixo
    await tocar(cdp, page.getByRole("button", { name: "Laje", exact: true }));
    const meioViga = await telaDe(page, cdp, svg, { x: 2, y: 0 });
    await tocar(cdp, page.getByRole("button", { name: "Pilar", exact: true }));
    await tocarPonto(cdp, meioViga);
    await expect(page.getByRole("status").filter({ hasText: "pilar precisa" })).toHaveCount(0);
    await tocar(cdp, page.getByRole("button", { name: "Propriedades", exact: true }));
    await expect(folha).toContainText("Pilar");
    await expect(folha.getByLabel(/b \(em x\)/)).toHaveAttribute("inputmode", "decimal");
    await tocar(cdp, folha.getByRole("button", { name: "Fechar propriedades" }));

    // 4. viga: tocar no traço dela seleciona e abre a folha; a altura se edita com o
    // teclado numérico. Mira no traço desenhado (o rodapé com snap puxa o ponto para o
    // eixo, e o toque de seleção não tem snap). A 3/4 do vão, longe do pilar do meio.
    await tocar(cdp, page.getByRole("button", { name: "Selecionar", exact: true }));
    const traco = svg
      .locator("g", { has: page.locator("title", { hasText: /^V\d+: .*8,00 m/ }) })
      .first()
      .locator("line")
      .last();
    const t = await traco.boundingBox();
    if (!t) throw new Error("viga sem traço");
    await tocarPonto(cdp, { x: t.x + t.width * 0.75, y: t.y + t.height / 2 });
    await expect(folha).toBeVisible();
    await expect(folha).toContainText("Viga");
    const altura = folha.getByLabel(/^h/);
    await tocar(cdp, altura);
    await altura.fill("45");
    await altura.press("Enter");
    await expect(altura).toHaveValue(/45/);
    await tocar(cdp, folha.getByRole("button", { name: "Fechar propriedades" }));

    // 5. pinça com dois dedos aproxima a planta
    await tocar(cdp, page.getByRole("button", { name: "Laje", exact: true }));
    const antes = await calibrarToque(page, cdp, svg);
    const b = await svg.boundingBox();
    if (!b) throw new Error("planta sem caixa");
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const dois = (d: number) => [
      { x: c.x - d, y: c.y, id: 1 },
      { x: c.x + d, y: c.y, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: dois(30) });
    for (let d = 40; d <= 90; d += 10)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: dois(d) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const depois = await calibrarToque(page, cdp, svg);
    expect(depois.escala).toBeGreaterThan(antes.escala * 2);
    await tocar(cdp, page.getByRole("button", { name: "Enquadrar tudo" }));

    // 6. resultados: tabelas rolam no próprio contêiner, com a primeira coluna fixa
    await tocar(cdp, page.getByRole("tab", { name: "Resultados", exact: true }));
    await expect(page.getByRole("heading", { name: "Pilares", exact: true })).toBeVisible();
    await expect(page.getByText("Lajes: esforços")).toBeVisible();
    const texto = await page.locator('[role="tabpanel"]:visible').innerText();
    expect(texto).not.toMatch(/NaN|undefined|Infinity/);
    expect(texto).toContain("P7"); // o pilar lançado no toque entra no cálculo
    await semRolagemHorizontal(page, "resultados");
    const tabela = page.locator('[data-slot="tabela-rolagem"]').first();
    const rolagem = await tabela.evaluate((el) => ({
      larga: el.scrollWidth > el.clientWidth,
      fixa: getComputedStyle(el.querySelector("tbody td")!).position,
    }));
    expect(rolagem).toEqual({ larga: true, fixa: "sticky" });
  });
});

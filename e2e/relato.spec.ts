import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";
import type { Obra } from "../src/dominio/obra";

// Botão "Relatar problema" no navegador de verdade, no celular (360 × 800, densidade 3)
// e no desktop (1920 × 1080): abre a obra, abre o diálogo de materiais, clica no botão
// por cima do diálogo e confere que o print saiu com o diálogo visível (comparando com
// o screenshot do Playwright da mesma tela), no tema escuro e com no máximo 1600 px.
// Depois abre a issue: a navegação para o GitHub é interceptada (nada chega ao GitHub).
// Os prints saem em e2e/prints/relato.

const PASTA = path.resolve(process.cwd(), "e2e/prints/relato");
const ALT_PRINT = "Print da tela no momento do clique";

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

/** Grade 2x2 de lajes 4 x 5 m, com vigas e pilares gerados. */
function obraGrade(): Obra {
  const pavimento = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 5 },
    { x: 4, y: 5 },
  ].reduce(
    (pav, p) => ({ ...pav, lajes: [...pav.lajes, lajeNova(pav, { ...p, lx: 4, ly: 5 })] }),
    pavimentoNovo("Tipo"),
  );
  return { ...obraNova("Grade 2x2", "nb1-78"), pavimentos: [gerarEstrutura(pavimento)] };
}

async function abrirGrade(page: Page) {
  // os seletores nativos do Chrome abrem janela do sistema, fora do alcance do Playwright
  await page.addInitScript(() => {
    const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles({
    name: "Grade 2x2.openstrut.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializarObra(obraGrade())),
  });
  await expect(page.getByRole("heading", { name: "Grade 2x2" })).toBeVisible();
}

type Regiao = { x: number; y: number; w: number; h: number };

/**
 * Brilho médio (0 a 255) de cada bloco de uma grade 12 × 12 sobre a região `r` (px CSS),
 * no print da prévia e em PNGs de referência (screenshots do Playwright), cada imagem na
 * sua escala. Blocos, e não pixels, para a suavização do texto não pesar.
 */
function blocosNoNavegador(args: { alt: string; referencias: string[]; r: Regiao }) {
  const N = 12;
  async function blocos(img: HTMLImageElement) {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sem canvas 2d");
    ctx.drawImage(img, 0, 0);
    const k = img.naturalWidth / innerWidth;
    const saida: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = (args.r.x + (args.r.w * j) / N) * k;
        const y = (args.r.y + (args.r.h * i) / N) * k;
        const w = Math.max(1, (args.r.w / N) * k);
        const h = Math.max(1, (args.r.h / N) * k);
        const d = ctx.getImageData(x, y, w, h).data;
        let soma = 0;
        for (let p = 0; p < d.length; p += 4) {
          soma += 0.2126 * (d[p] ?? 0) + 0.7152 * (d[p + 1] ?? 0) + 0.0722 * (d[p + 2] ?? 0);
        }
        saida.push(soma / (d.length / 4));
      }
    }
    return saida;
  }
  const print = document.querySelector<HTMLImageElement>(`img[alt="${args.alt}"]`);
  if (!print) throw new Error("prévia do print ausente");
  const refs = args.referencias.map((b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    return img;
  });
  return Promise.all([blocos(print), ...refs.map(blocos)]).then(([p = [], ...r]) => ({
    largura: print.naturalWidth,
    altura: print.naturalHeight,
    print: p,
    referencias: r,
  }));
}

/** Diferença média, bloco a bloco, entre duas grades de brilho. */
const diferenca = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + Math.abs(v - (b[i] ?? 0)), 0) / Math.max(1, a.length);

/** Abre o diálogo de materiais: no celular pelo menu "Mais ações", no desktop direto. */
async function abrirMateriais(page: Page) {
  const mais = page.getByRole("button", { name: "Mais ações" });
  if (await mais.isVisible()) {
    await mais.click();
    await page
      .getByRole("dialog", { name: "Ações da obra" })
      .getByRole("button", { name: "Materiais" })
      .click();
  } else {
    await page.getByRole("button", { name: "Materiais", exact: true }).click();
  }
  const materiais = page.getByRole("dialog", { name: "Obra e materiais" });
  await expect(materiais).toBeVisible();
  // espera a animação de entrada terminar
  await materiais.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return materiais;
}

const TAMANHOS = [
  { nome: "celular", viewport: { width: 360, height: 800 }, dpr: 3 },
  { nome: "desktop", viewport: { width: 1920, height: 1080 }, dpr: 1 },
] as const;

for (const t of TAMANHOS) {
  test.describe(`relato no ${t.nome} (${t.viewport.width} × ${t.viewport.height})`, () => {
    test.use({ viewport: t.viewport, deviceScaleFactor: t.dpr });

    test("print com o diálogo aberto e URL do GitHub bem formada", async ({ page, context }) => {
      test.setTimeout(120_000);
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      // nada vai ao GitHub de verdade: a aba nova recebe uma página falsa
      const abertas: string[] = [];
      await context.route(/^https:\/\/github\.com\//, (rota) => {
        abertas.push(rota.request().url());
        return rota.fulfill({ contentType: "text/html", body: "<title>GitHub falso</title>" });
      });

      await abrirGrade(page);
      const botao = page.getByRole("button", { name: "Relatar problema" });
      await expect(botao).toBeVisible();
      const caixaBotao = await botao.boundingBox();
      expect(caixaBotao?.width).toBeGreaterThanOrEqual(44);
      expect(caixaBotao?.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: path.join(PASTA, `${t.nome}-01-obra.png`) });

      const semDialogo = await page.screenshot();
      const materiais = await abrirMateriais(page);
      const caixa = await materiais.boundingBox();
      if (!caixa) throw new Error("diálogo sem caixa");
      const comDialogo = await page.screenshot({
        path: path.join(PASTA, `${t.nome}-02-dialogo-aberto.png`),
      });

      // o botão continua clicável por cima do diálogo, e o diálogo não fecha
      await botao.click();
      const relato = page.getByRole("dialog", { name: "Relatar problema" });
      await expect(relato).toBeVisible();
      await expect(page.locator('[role="dialog"]', { hasText: "Obra e materiais" })).toHaveCount(1);
      await expect(relato.getByText(/Envio pelo GitHub:/)).toBeVisible();
      await expect(relato.getByText('"Grade 2x2", 1 pavimento, 4 lajes')).toBeVisible();
      await expect(relato.getByText("NB-1/78")).toBeVisible();
      await expect(relato.getByRole("img", { name: ALT_PRINT })).toBeVisible();

      // na região do diálogo (miolo, px CSS), o print tem de ser a tela com o diálogo, e
      // não a tela sem ele (no celular o diálogo ocupa a tela toda, sem sobreposição)
      const m = await page.evaluate(blocosNoNavegador, {
        alt: ALT_PRINT,
        referencias: [comDialogo.toString("base64"), semDialogo.toString("base64")],
        r: {
          x: caixa.x + caixa.width * 0.05,
          y: caixa.y + caixa.height * 0.05,
          w: caixa.width * 0.9,
          h: caixa.height * 0.9,
        },
      });
      const [com = [], sem = []] = m.referencias;
      const dCom = diferenca(m.print, com);
      const dSem = diferenca(m.print, sem);
      // largura: densidade da tela, limitada a 1600 px (360 × 3 = 1080; 1920 → 1600)
      expect(m.largura).toBe(Math.min(1600, t.viewport.width * t.dpr));
      expect(m.altura).toBeCloseTo((m.largura * t.viewport.height) / t.viewport.width, -1);
      expect(dCom).toBeLessThan(8);
      expect(dSem).toBeGreaterThan(dCom * 2);
      // tema escuro no print: brilho médio baixo
      expect(m.print.reduce((s, v) => s + v, 0) / m.print.length).toBeLessThan(110);
      await page.screenshot({ path: path.join(PASTA, `${t.nome}-03-relato.png`) });

      // abre a issue: copia o print, baixa o PNG e abre a aba (interceptada)
      await relato.getByLabel("O que aconteceu").fill("A viga V1 sumiu da planta ao calcular");
      await relato.getByLabel("O que esperava").fill("Ver a viga V1 com o resultado");
      const [aba, download] = await Promise.all([
        context.waitForEvent("page"),
        page.waitForEvent("download"),
        relato.getByRole("button", { name: "Abrir issue no GitHub" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^relato-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);
      await download.saveAs(path.join(PASTA, `${t.nome}-05-print-capturado.png`));
      await aba.waitForLoadState();
      const url = new URL(aba.url());
      expect(abertas).toEqual([aba.url()]);
      expect(url.origin + url.pathname).toBe("https://github.com/gmunaro/openstrut/issues/new");
      expect(url.searchParams.get("title")).toBe("[Relato] A viga V1 sumiu da planta ao calcular");
      expect(url.searchParams.get("labels")).toBe("bug");
      const corpo = url.searchParams.get("body") ?? "";
      expect(corpo).toContain("### O que esperava\n\nVer a viga V1 com o resultado");
      expect(corpo).toContain("Cole o print aqui (Ctrl+V)");
      expect(corpo).toContain("Grade-2x2.openstrut.json");
      expect(corpo).toContain("| Norma | NB-1/78 |");
      expect(corpo).not.toContain('"versao"'); // o JSON da obra não vai na URL
      // marcador oculto da triagem no fim (sem VITE_COMMIT, o build é o arquivo do bundle)
      expect(corpo).toMatch(/\n\n<!-- openstrut-relato v1 build=[\w.-]+\.js -->$/);
      expect(aba.url().length).toBeLessThanOrEqual(7500);
      await aba.close();

      // o print ficou na área de transferência
      await page.bringToFront();
      const tipos = await page.evaluate(async () =>
        (await navigator.clipboard.read()).flatMap((i) => [...i.types]),
      );
      expect(tipos).toContain("image/png");
      await expect(relato.getByText(/O print está na área de transferência/)).toBeVisible();
      await expect(relato.getByRole("button", { name: "Baixar a obra" })).toBeVisible();
      await page.screenshot({ path: path.join(PASTA, `${t.nome}-04-github.png`) });
    });
  });
}

test.describe("relato: atalho, impressão e arquivo", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Alt+Shift+R abre, o botão some na impressão e o zip leva relato, print e obra", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await abrirGrade(page);
    const botao = page.getByRole("button", { name: "Relatar problema" });
    await page.emulateMedia({ media: "print" });
    await expect(botao).toBeHidden();
    await page.emulateMedia({ media: "screen" });
    await expect(botao).toBeVisible();

    await page.keyboard.press("Alt+Shift+R");
    const relato = page.getByRole("dialog", { name: "Relatar problema" });
    await expect(relato.getByRole("img", { name: ALT_PRINT })).toBeVisible();
    await relato.getByLabel("O que aconteceu").fill("Teste do arquivo");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      relato.getByRole("button", { name: "Salvar arquivo do relato" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^relato-.*\.zip$/);
    const zip = fs.readFileSync(await download.path());
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const texto = zip.toString("latin1");
    expect(texto).toContain("relato.md");
    expect(texto).toMatch(/relato-[\d-]+\.png/);
    expect(texto).toContain("Grade-2x2.openstrut.json");
    expect(texto).toContain("### O que aconteceu\n\nTeste do arquivo");
    await download.saveAs(path.join(PASTA, "relato-exemplo.zip"));
  });
});

/**
 * Controles que o usuário tocaria onde está o botão de relatar: em cada ponto de uma
 * grade 5 × 5 sobre o botão, o elemento de cima (fora o próprio botão) e o controle que
 * o contém. Atrás de modal o body não recebe toque, então só conta o que dá para tocar.
 * Lista vazia = o botão não cobre controle.
 */
function controlesSobOBotao(seletor: string) {
  const botao = document.querySelector('[aria-label="Relatar problema"]');
  const caixa = botao?.closest("[aria-live]");
  if (!botao || !caixa) throw new Error("botão de relatar ausente");
  const r = botao.getBoundingClientRect();
  const achados = new Set<string>();
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const x = r.left + (r.width * j) / 4;
      const y = r.top + (r.height * i) / 4;
      const alvo = document.elementsFromPoint(x, y).find((e) => !caixa.contains(e));
      const c = alvo?.closest(seletor);
      if (c) {
        const nome = (c.getAttribute("aria-label") ?? c.textContent ?? "").trim().slice(0, 30);
        achados.add(`${c.tagName} ${nome}`);
      }
    }
  }
  return [...achados];
}

const CONTROLES = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="menuitem"]',
].join(",");

/** Rola até o fim tudo o que rola dentro de `alvo` (diálogo, folha). */
async function rolarAteOFim(alvo: Locator) {
  await alvo.evaluate((el) => {
    const rolaveis = [el, ...el.querySelectorAll("*")].filter(
      (e) =>
        e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY),
    );
    for (const e of rolaveis) e.scrollTop = e.scrollHeight;
  });
}

test.describe("relato no celular: o botão não cobre controle no layout compacto", () => {
  test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 });

  test("início, planta, folha de propriedades, Mais ações, materiais, editor de viga e resultados", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // a posição assenta depois do debounce da rolagem (150 ms), da reconferência (300 ms)
    // e da transição: espera duas leituras iguais e sem controle coberto
    const livre = async (nome: string) => {
      let antes = "";
      await expect
        .poll(
          async () => {
            const caixa = JSON.stringify(
              await page.getByRole("button", { name: "Relatar problema" }).boundingBox(),
            );
            const cobertos = await page.evaluate(controlesSobOBotao, CONTROLES);
            const estavel = caixa === antes;
            antes = caixa;
            return estavel ? cobertos : ["(posição mudando)"];
          },
          { message: nome, intervals: [400] },
        )
        .toEqual([]);
      await expect(page.getByRole("button", { name: "Relatar problema" })).toBeInViewport();
    };
    const foto = (nome: string) =>
      page.screenshot({ path: path.join(PASTA, `celular-${nome}.png`) });

    await page.addInitScript(() => {
      const w = window as Window & { showOpenFilePicker?: unknown; showSaveFilePicker?: unknown };
      delete w.showOpenFilePicker;
      delete w.showSaveFilePicker;
    });
    await page.goto("/");
    await livre("início");
    const [escolha] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /Abrir arquivo .openstrut.json/ }).click(),
    ]);
    await escolha.setFiles(
      path.resolve(process.cwd(), "e2e/fixtures/laje-r3-original.openstrut.json"),
    );
    await expect(page.getByRole("heading", { name: "Laje R3 original" })).toBeVisible();

    // planta e ferramentas
    await livre("planta");
    await foto("06-planta");

    // folha de propriedades, no topo e no fim; com ela aberta, a V4 pelas setas
    await page.getByRole("button", { name: "Propriedades", exact: true }).click();
    const folha = page.getByRole("complementary", { name: "Propriedades" });
    await expect(folha).toBeVisible();
    const nome = folha.getByRole("textbox", { name: "Nome" });
    await page.getByRole("application", { name: "Planta do pavimento" }).focus();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("ArrowRight");
      if ((await nome.count()) > 0 && (await nome.inputValue()) === "V4") break;
    }
    await expect(nome).toHaveValue("V4");
    await livre("folha de propriedades, topo");
    await rolarAteOFim(folha);
    await livre("folha de propriedades, fim");
    await foto("07-folha-propriedades");

    // editor da viga em tela cheia, no topo e no fim da rolagem (Aplicar/Cancelar)
    await folha.getByRole("button", { name: "Dados do SISTRUT da viga…" }).click();
    const viga = page.getByRole("dialog", { name: "Viga V4: entrada do VIGA e do DESENHO" });
    await expect(viga).toBeVisible();
    await livre("editor de viga, topo");
    await foto("08-viga-topo");
    await rolarAteOFim(viga);
    await livre("editor de viga, fim");
    await foto("09-viga-fim");
    await viga.getByRole("button", { name: "Cancelar" }).click();
    await expect(viga).toBeHidden();
    await folha.getByRole("button", { name: "Fechar propriedades" }).click();

    // menu Mais ações e o diálogo de materiais que sai dele
    await page.getByRole("button", { name: "Mais ações" }).click();
    const acoes = page.getByRole("dialog", { name: "Ações da obra" });
    await expect(acoes).toBeVisible();
    await livre("Mais ações");
    await foto("10-mais-acoes");
    await acoes.getByRole("button", { name: "Materiais" }).click();
    const materiais = page.getByRole("dialog", { name: "Obra e materiais" });
    await expect(materiais).toBeVisible();
    await livre("materiais, topo");
    await rolarAteOFim(materiais);
    await livre("materiais, fim");
    await foto("11-materiais-fim");
    await page.keyboard.press("Escape");
    await expect(materiais).toBeHidden();

    // resultados
    await page.getByRole("tab", { name: "Resultados", exact: true }).click();
    await livre("resultados");
    await foto("12-resultados");
  });
});

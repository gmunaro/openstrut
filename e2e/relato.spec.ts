import { expect, test, type Page } from "@playwright/test";
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
 * Luminância média (0 a 255) de regiões, em px CSS, no print do diálogo e num PNG de
 * referência (o screenshot do Playwright), cada um na sua escala.
 */
function medirNoNavegador(args: { alt: string; referencia: string; regioes: Regiao[] }) {
  async function medir(img: HTMLImageElement) {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sem canvas 2d");
    ctx.drawImage(img, 0, 0);
    const k = img.naturalWidth / innerWidth;
    return args.regioes.map((r) => {
      const d = ctx.getImageData(r.x * k, r.y * k, Math.max(1, r.w * k), Math.max(1, r.h * k)).data;
      let soma = 0;
      for (let i = 0; i < d.length; i += 4) {
        soma += 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
      }
      return soma / (d.length / 4);
    });
  }
  const print = document.querySelector<HTMLImageElement>(`img[alt="${args.alt}"]`);
  if (!print) throw new Error("prévia do print ausente");
  const ref = new Image();
  ref.src = `data:image/png;base64,${args.referencia}`;
  return Promise.all([medir(print), medir(ref)]).then(([p, r]) => ({
    largura: print.naturalWidth,
    altura: print.naturalHeight,
    print: p,
    referencia: r,
  }));
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

      // abre um diálogo do app e espera a animação de entrada terminar
      await page.getByRole("button", { name: "Materiais", exact: true }).click();
      const materiais = page.getByRole("dialog", { name: "Obra e materiais" });
      await expect(materiais).toBeVisible();
      await materiais.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const caixa = await materiais.boundingBox();
      if (!caixa) throw new Error("diálogo sem caixa");
      const referencia = await page.screenshot({
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

      // regiões em px CSS: o miolo do diálogo e uma faixa de fora (só a sobreposição escura)
      const dentro = {
        x: caixa.x + caixa.width * 0.1,
        y: caixa.y + caixa.height * 0.1,
        w: caixa.width * 0.8,
        h: caixa.height * 0.8,
      };
      const fora =
        caixa.y >= 8
          ? { x: 0, y: 0, w: t.viewport.width, h: caixa.y - 2 }
          : { x: 0, y: 0, w: Math.max(1, caixa.x - 2), h: t.viewport.height * 0.8 };
      const m = await page.evaluate(medirNoNavegador, {
        alt: ALT_PRINT,
        referencia: referencia.toString("base64"),
        regioes: [dentro, fora],
      });
      const [pDentro = 0, pFora = 0] = m.print;
      const [rDentro = 0, rFora = 0] = m.referencia;
      // largura: densidade da tela, limitada a 1600 px (360 × 3 = 1080; 1920 → 1600)
      expect(m.largura).toBe(Math.min(1600, t.viewport.width * t.dpr));
      expect(m.altura).toBeCloseTo((m.largura * t.viewport.height) / t.viewport.width, -1);
      // o print mostra o mesmo que a tela: diálogo e sobreposição com o mesmo brilho
      expect(Math.abs(pDentro - rDentro)).toBeLessThan(15);
      expect(Math.abs(pFora - rFora)).toBeLessThan(15);
      // o diálogo aparece no print (mais claro que a sobreposição) e o tema é o escuro
      expect(pDentro).toBeGreaterThan(pFora + 3);
      expect(pDentro).toBeLessThan(110);
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

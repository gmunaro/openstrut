// Sequência construtiva 4D (src/telas/obra3d/sequencia): a camada ligada numa obra de 3
// pavimentos, dia a dia e etapa a etapa, com a fonte de cor "sequencia", o fantasma das
// etapas futuras, a câmera que acompanha o nível, a obra editada, o cronograma CSV e o
// painel num celular de 360 px. Um teste só, passo a passo. Rode com
// PORT=4425 bun x playwright test e2e/vista3d-sequencia.spec.ts.
import { expect, type Page, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";

const PRINTS = path.resolve(process.cwd(), "e2e/prints/vista3d-sequencia");
fs.mkdirSync(PRINTS, { recursive: true });

// WebGL por software no Chrome sem GPU (CI e headless)
test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

/** Cor da etapa em andamento (COR_EM_OBRA em camada.tsx). */
const VIOLETA = "#8b5cf6";

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

/** Peça do modelo com a visibilidade e a cor da fonte "sequencia" (null sem cor). */
type Peca = {
  chave: string;
  tipo: string;
  nome: string;
  nivel: number;
  visivel: boolean;
  cor: string | null;
};

/** Lê todas as peças da vista: `estaVisivel` e a cor que a fonte "sequencia" daria a cada
 *  uma. `fonteSequencia` diz se a camada ainda registra a fonte de cor. */
async function lerPecas(page: Page): Promise<{ pecas: Peca[]; fonteSequencia: boolean }> {
  return page.evaluate((violeta) => {
    type Elem = { chave: string; tipo: string; nome: string; nivel: number };
    type Vista = {
      modelo: { elementos: Elem[] };
      estaVisivel: (chave: string) => boolean;
      corDe: (chave: string) => string | undefined;
      fontesAtivas: () => { cores: string[] };
    };
    const v = (window as unknown as { __vista3d: Vista }).__vista3d;
    const fonteSequencia = v.fontesAtivas().cores.includes("sequencia");
    return {
      fonteSequencia,
      pecas: v.modelo.elementos.map((e) => ({
        chave: e.chave,
        tipo: e.tipo,
        nome: e.nome,
        nivel: e.nivel,
        visivel: v.estaVisivel(e.chave),
        // a cor que a sequência dá (violeta) ou null: a peça está com a cor da vista
        cor: fonteSequencia && v.corDe(e.chave) === violeta ? violeta : null,
      })),
    };
  }, VIOLETA);
}

const pecasDe = (pecas: Peca[], tipo: string, nivel: number) =>
  pecas.filter((p) => p.tipo === tipo && p.nivel === nivel);

test("sequência construtiva 4D numa obra de 3 pavimentos, do dia 0 ao CSV, com 360 px", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await abrirObraJson(page, obraTresPavimentos());
  await abrir3d(page);

  const painel = page.getByRole("complementary", { name: "Controles da vista 3D" });
  const botaoCamada = page.getByRole("button", { name: "Sequência construtiva 4D", exact: true });
  const faixa = painel.getByRole("slider", { name: "Linha do tempo" });
  const etapaAtual = painel.getByRole("list", { name: "Etapas" }).locator('[aria-current="step"]');
  const botaoEtapa = (rotulo: RegExp) =>
    painel.getByRole("list", { name: "Etapas" }).getByRole("button", { name: rotulo });

  // 1. liga a camada: dez etapas na lista, a primeira em andamento
  await expect(botaoCamada).toHaveAttribute("aria-pressed", "false");
  await botaoCamada.click();
  await expect(botaoCamada).toHaveAttribute("aria-pressed", "true");
  await expect(painel.getByLabel("Início da obra")).toBeVisible();
  await expect(painel.getByRole("list", { name: "Etapas" }).getByRole("button")).toHaveCount(10);
  await expect(etapaAtual).toHaveText(/^1\. Fundação/);

  // 2. dia 0: um bloco de fundação visível e violeta; pilar do nível 0 e laje do nível 2 fora
  let { pecas } = await lerPecas(page);
  const bloco = pecasDe(pecas, "fundacao", 0)[0];
  expect(bloco).toBeDefined();
  expect(bloco!.visivel).toBe(true);
  expect(bloco!.cor).toBe(VIOLETA);
  const pilaresN0 = pecasDe(pecas, "pilar", 0);
  expect(pilaresN0.length).toBeGreaterThan(0);
  expect(pilaresN0.every((p) => !p.visivel)).toBe(true);
  const lajesN2 = pecasDe(pecas, "laje", 2);
  expect(lajesN2.length).toBeGreaterThan(0);
  expect(lajesN2.every((p) => !p.visivel)).toBe(true);

  // 3. "Próxima etapa": vai ao dia 7 (início de Pilares · Primeiro)
  await painel.getByRole("button", { name: "Próxima etapa", exact: true }).click();
  await expect(faixa).toHaveValue("7");
  await expect(etapaAtual).toHaveText(/Pilares · Primeiro/);
  ({ pecas } = await lerPecas(page));
  const pilaresN0Dia7 = pecasDe(pecas, "pilar", 0);
  expect(pilaresN0Dia7.every((p) => p.visivel && p.cor === VIOLETA)).toBe(true);
  expect(pecasDe(pecas, "viga", 0).every((p) => !p.visivel)).toBe(true);
  const blocoDia7 = pecasDe(pecas, "fundacao", 0)[0]!;
  expect(blocoDia7.visivel).toBe(true);
  expect(blocoDia7.cor).toBeNull();

  // 4. dia 24 (22 + 2), em "Fôrma e vigas · Tipo" (dias 22 a 25)
  await faixa.fill("24");
  await expect(painel.getByText(/dia 25 de 43/)).toBeVisible();
  await expect(etapaAtual).toHaveText(/Fôrma e vigas · Tipo/);
  ({ pecas } = await lerPecas(page));
  const vigasN1 = pecasDe(pecas, "viga", 1);
  expect(vigasN1.length).toBeGreaterThan(0);
  expect(vigasN1.every((p) => p.visivel && p.cor === VIOLETA)).toBe(true);
  expect(pecasDe(pecas, "laje", 1).every((p) => !p.visivel)).toBe(true);
  expect(pecasDe(pecas, "pilar", 2).every((p) => !p.visivel)).toBe(true);
  expect(pecasDe(pecas, "viga", 2).every((p) => !p.visivel)).toBe(true);
  expect(pecasDe(pecas, "laje", 2).every((p) => !p.visivel)).toBe(true);
  expect(pecasDe(pecas, "laje", 0).every((p) => p.visivel && p.cor === null)).toBe(true);
  await page.screenshot({ path: path.join(PRINTS, "sequencia-1366.png") });

  // 4b. dia 26: "Lajes · Tipo" é a etapa em andamento; as lajes do
  // nível 1 ficam violetas e as vigas do mesmo nível já estão concluídas (sem cor)
  await faixa.fill("26");
  await expect(etapaAtual).toHaveText(/Lajes · Tipo/);
  ({ pecas } = await lerPecas(page));
  expect(pecasDe(pecas, "laje", 1).every((p) => p.visivel && p.cor === VIOLETA)).toBe(true);
  expect(pecasDe(pecas, "viga", 1).every((p) => p.visivel && p.cor === null)).toBe(true);

  // 4c. câmera que acompanha o nível em obra: ir à Cobertura move a câmera
  const camera = () =>
    page.evaluate(() => {
      type V = { camera: { position: { x: number; y: number; z: number } } };
      const p = (window as unknown as { __vista3d: V }).__vista3d.camera.position;
      return [p.x, p.y, p.z];
    });
  await painel.getByLabel("Câmera acompanha o nível em obra").check();
  await page.waitForTimeout(800);
  const camAntes = await camera();

  // 5. clique em "10. Lajes · Cobertura": tudo visível e a etapa marcada; no fim, sem cor
  await botaoEtapa(/^10\. Lajes · Cobertura/).click();
  await page.waitForTimeout(800);
  const camDepois = await camera();
  expect(Math.hypot(...camDepois.map((v, i) => v - camAntes[i]!))).toBeGreaterThan(0.1);
  await painel.getByLabel("Câmera acompanha o nível em obra").uncheck();
  await expect(faixa).toHaveValue("38");
  await expect(etapaAtual).toHaveText(/^10\. Lajes · Cobertura/);
  ({ pecas } = await lerPecas(page));
  expect(pecas.every((p) => p.visivel)).toBe(true);
  await faixa.fill("43");
  await expect(painel.getByText(/Obra concluída em/)).toBeVisible();
  ({ pecas } = await lerPecas(page));
  expect(pecas.every((p) => p.visivel)).toBe(true);
  expect(pecas.every((p) => p.cor === null)).toBe(true);

  // 6. data de início e cronograma CSV
  await painel.getByLabel("Início da obra").fill("2026-11-02");
  await expect(painel.getByLabel("Início da obra")).toHaveValue("2026-11-02");
  const [baixado] = await Promise.all([
    page.waitForEvent("download"),
    painel.getByRole("button", { name: "Cronograma CSV", exact: true }).click(),
  ]);
  const caminho = await baixado.path();
  if (!caminho) throw new Error("download sem arquivo");
  const texto = fs.readFileSync(caminho, "utf8");
  expect(texto.startsWith("﻿")).toBe(true);
  const linhas = texto
    .replace(/^﻿/, "")
    .split("\r\n")
    .filter((l) => l !== "");
  expect(linhas).toHaveLength(11);
  expect(linhas[0]).toBe("Etapa;Serviço;Nível;Peças;Início;Fim;Dias");
  expect(linhas[1]).toBe("1;Fundação;;9;02/11/2026;08/11/2026;7");
  expect(linhas.at(-1)).toMatch(/14\/12\/2026;5$/);

  // 7. "Etapas futuras" transparentes e reprodução a 10 dias/s: o dia avança
  await painel.getByRole("button", { name: "Início", exact: true }).click();
  await expect(faixa).toHaveValue("0");
  await painel.getByLabel("Etapas futuras").selectOption("transparente");
  await painel.getByLabel("Velocidade").selectOption("10");
  // o futuro fica transparente (papel "fantasma" da vista), não escondido
  const fantasmas = await page.evaluate(() => {
    type Vista = {
      modelo: { elementos: { chave: string }[] };
      exibicao: (chave: string) => string;
    };
    const v = (window as unknown as { __vista3d: Vista }).__vista3d;
    return v.modelo.elementos.filter((e) => v.exibicao(e.chave) === "fantasma").length;
  });
  expect(fantasmas).toBeGreaterThan(0);
  const antes = Number(await faixa.inputValue());
  await painel.getByRole("button", { name: "Reproduzir", exact: true }).click();
  await page.waitForTimeout(1500);
  await painel.getByRole("button", { name: "Pausar", exact: true }).click();
  await expect(painel.getByRole("button", { name: "Reproduzir", exact: true })).toBeVisible();
  const depois = Number(await faixa.inputValue());
  expect(depois).toBeGreaterThan(antes);

  // 7b. obra editada (modelo novo sem a Cobertura): as etapas são refeitas (10 → 7); com o
  // modelo de volta, 10 de novo
  const trocarModelo = (sem: boolean) =>
    page.evaluate((sem) => {
      type Elem = { nivel: number };
      type Modelo = { niveis: unknown[]; elementos: Elem[] };
      type V = {
        modelo: Modelo;
        obra: unknown;
        calculo: unknown;
        dados: unknown;
        detalhamento: unknown;
        atualizar: (o: Record<string, unknown>) => void;
      };
      const w = window as unknown as { __vista3d: V; __modeloOriginal?: Modelo };
      const v = w.__vista3d;
      w.__modeloOriginal ??= v.modelo;
      const m = w.__modeloOriginal;
      const modelo = sem
        ? { ...m, niveis: m.niveis.slice(0, 2), elementos: m.elementos.filter((e) => e.nivel < 2) }
        : m;
      const { obra, calculo, dados, detalhamento } = v;
      v.atualizar({ obra, calculo, dados, detalhamento, modelo });
    }, sem);
  await trocarModelo(true);
  await expect(painel.getByRole("list", { name: "Etapas" }).getByRole("button")).toHaveCount(7);
  await expect(painel.getByText(/de 31$/)).toBeVisible(); // 7 + 2 × (3 + 4 + 5)
  await trocarModelo(false);
  await expect(painel.getByRole("list", { name: "Etapas" }).getByRole("button")).toHaveCount(10);

  // 8. desliga a camada: todas as peças voltam, sem a fonte de cor
  await botaoCamada.click();
  await expect(botaoCamada).toHaveAttribute("aria-pressed", "false");
  await expect(painel.getByLabel("Início da obra")).toHaveCount(0);
  const desligada = await lerPecas(page);
  expect(desligada.pecas.every((p) => p.visivel)).toBe(true);
  expect(desligada.fonteSequencia).toBe(false);

  // 9. celular de 360 × 800 com movimento reduzido: liga de novo, a câmera avisa que não
  // anima; fotos da linha do tempo e da vista (painel oculto)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await botaoCamada.click();
  await expect(botaoCamada).toHaveAttribute("aria-pressed", "true");
  await expect(painel).toBeVisible();
  await expect(painel.getByText(/Câmera acompanha o nível em obra \(sem animação\)/)).toBeVisible();
  await faixa.fill("24");
  await faixa.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(PRINTS, "sequencia-360.png") });
  await page.getByRole("button", { name: "Ocultar painel" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(PRINTS, "sequencia-vista-360.png") });

  // 10. nenhum erro ou aviso no console
  expect(erros).toEqual([]);
});

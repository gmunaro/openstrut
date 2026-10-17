// Camadas da vista 3D ligadas juntas: o render PBR é dono dos materiais (pilha de
// definirMateriais) e a armadura só deixa as peças transparentes (definirTransparencia),
// então ligar e desligar uma não desfaz a outra. Obra de 3 pavimentos calculada (NBR 6118).
// Rode com PORT=4407 bun x playwright test e2e/vista3d-integracao.spec.ts.
import { expect, type Page, test } from "@playwright/test";
import { serializarObra } from "../src/armazenamento/arquivo";
import { lajeNova, obraNova, pavimentoNovo } from "../src/dominio/criar";
import { gerarEstrutura } from "../src/dominio/gerar";

test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});

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

type Estado = {
  materiais: string[];
  transparencias: string[];
  /** Tipo do material das malhas sólidas das vigas ("MeshStandardMaterial" no PBR). */
  material: string | null;
  vigasTransparentes: number;
  vigas: number;
};

const estado = (page: Page) =>
  page.evaluate((): Estado => {
    type Malha = { isMesh?: boolean; name: string; material: { type: string } };
    type Vista = {
      modelo: { elementos: { chave: string; tipo: string }[] };
      exibicao: (k: string) => string;
      fontesAtivas: () => { materiais: string[]; transparencias: string[] };
      cena: { traverse: (f: (o: Malha) => void) => void };
    };
    const v = (window as unknown as { __vista3d: Vista }).__vista3d;
    let material: string | null = null;
    v.cena.traverse((o) => {
      if (material === null && o.isMesh && / viga$/.test(o.name)) material = o.material.type;
    });
    const vigas = v.modelo.elementos.filter((e) => e.tipo === "viga");
    const f = v.fontesAtivas();
    return {
      materiais: f.materiais,
      transparencias: f.transparencias,
      material,
      vigasTransparentes: vigas.filter((e) => v.exibicao(e.chave) === "fantasma").length,
      vigas: vigas.length,
    };
  });

test("render PBR e armadura juntos: cada uma desfaz só o que é dela", async ({ page }) => {
  test.setTimeout(180_000);
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto("/");
  const [escolha] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: /Abrir arquivo \.openstrut\.json/ }).click(),
  ]);
  await escolha.setFiles({
    name: "tres.openstrut.json",
    mimeType: "application/json",
    buffer: Buffer.from(obraTresPavimentos()),
  });
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForFunction(() => "__vista3d" in window);

  const render = page.getByRole("button", { name: "Render realista", exact: true });
  const armadura = page.getByRole("button", { name: "Armadura", exact: true });

  await render.click();
  await expect(render).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await estado(page)).materiais).toEqual(["render"]);
  expect((await estado(page)).material).toBe("MeshStandardMaterial");

  // a armadura liga por transparência: o render continua dono dos materiais
  await armadura.click();
  await expect(armadura).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await estado(page)).transparencias).toEqual(["armadura"]);
  let e = await estado(page);
  expect(e.materiais).toEqual(["render"]);
  expect(e.material).toBe("MeshStandardMaterial");
  expect(e.vigasTransparentes).toBe(e.vigas);

  // desligar a armadura não tira o PBR
  await armadura.click();
  await expect.poll(async () => (await estado(page)).transparencias).toEqual([]);
  e = await estado(page);
  expect(e.materiais).toEqual(["render"]);
  expect(e.material).toBe("MeshStandardMaterial");
  expect(e.vigasTransparentes).toBe(0);

  // de novo nas duas ordens: liga a armadura, desliga o render; a armadura segue
  await armadura.click();
  await render.click();
  await expect.poll(async () => (await estado(page)).materiais).toEqual([]);
  e = await estado(page);
  expect(e.transparencias).toEqual(["armadura"]);
  expect(e.material).not.toBe("MeshStandardMaterial");
  await armadura.click();
  await expect.poll(async () => (await estado(page)).transparencias).toEqual([]);

  expect(erros).toEqual([]);
});

// Switch do modo de cálculo (Obra.modoCalculo; docs/MODO-CALCULO.md) no diálogo de obra
// e materiais: estado anunciado e teclado, dica no foco e no toque, recálculo dos
// números, selo nos resultados, modo no cabeçalho do relatório, volume e forma da
// tela × relatório no modo original, e o modo no arquivo salvo, ao reabrir e no rascunho.
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lerObra } from "../../armazenamento/arquivo";
import { abrirRascunho } from "../../armazenamento/rascunho";
import type { ModoCalculo } from "../../dominio/obra";
import { useObra } from "../../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";
import { SELO_MODO_ORIGINAL } from "../calculo";
import { useSessao } from "../sessao";

const lerNumeroBr = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

afterEach(() => {
  Reflect.deleteProperty(window, "showSaveFilePicker");
  Reflect.deleteProperty(window, "showOpenFilePicker");
});

/** Abre a obra de duas lajes 4 × 5 m (bordo comum engastado) pela NB-1/78. */
async function abrirTela(modoCalculo: ModoCalculo = "corrigido") {
  abrirObra({ ...obraDuasLajes("nb1-78", "Casa"), modoCalculo });
  const r = renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
  return r;
}

async function abrirDialogo(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /Materiais/ }));
  return screen.findByRole("dialog", { name: "Obra e materiais" });
}

const switchModo = (dialogo: HTMLElement) =>
  within(dialogo).getByRole("switch", { name: "Modo de cálculo Como o SISTRUT original" });

/** Liga ou desliga o modo original pelo teclado (espaço no switch) e aplica. */
async function trocarModo(user: UserEvent) {
  const dialogo = await abrirDialogo(user);
  switchModo(dialogo).focus();
  await user.keyboard(" ");
  await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

async function abrirAba(user: UserEvent, aba: "Resultados" | "Relatório") {
  await user.click(screen.getByRole("tab", { name: aba }));
  return screen.findByRole("tabpanel", { name: aba });
}

/** Células da linha `nome` da tabela "Total da obra" da aba Resultados. */
function linhaTotalDaObra(painel: HTMLElement, nome: string) {
  const h3 = within(painel).getByRole("heading", { level: 3, name: "Total da obra" });
  const tabela = h3.parentElement?.nextElementSibling;
  if (!(tabela instanceof HTMLElement)) throw new Error("tabela Total da obra não encontrada");
  const tr = within(tabela)
    .getAllByRole("row")
    .find((r) => r.querySelector("td")?.textContent?.trim() === nome);
  if (!tr) throw new Error(`linha ${nome} não encontrada`);
  return [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "");
}

/** Células da linha Total do resumo de aço e concreto do relatório. */
function linhaTotalRelatorio(painel: HTMLElement) {
  const h2 = within(painel).getByRole("heading", { level: 2, name: "Resumo de aço e concreto" });
  const secao = h2.parentElement;
  if (!secao) throw new Error("resumo do relatório não encontrado");
  const tr = within(secao)
    .getAllByRole("row")
    .findLast((r) => r.querySelector("td")?.textContent?.trim() === "Total");
  if (!tr) throw new Error("linha Total do relatório não encontrada");
  return [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "");
}

describe("modo de cálculo: switch", () => {
  it("tem rótulo, estado anunciado e liga/desliga pelo teclado; aplicar grava na obra", async () => {
    const { user } = await abrirTela();
    const dialogo = await abrirDialogo(user);
    const sw = switchModo(dialogo);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(within(dialogo).getByText("Corrigido")).toBeTruthy();

    sw.focus();
    await user.keyboard(" ");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{Enter}");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await user.keyboard(" ");
    // ainda não gravou: o diálogo aplica tudo de uma vez
    expect(useObra.getState().obra?.modoCalculo).toBe("corrigido");

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useObra.getState().obra?.modoCalculo).toBe("original");

    // reabrir mostra o modo da obra; desfazer volta ao corrigido
    expect(switchModo(await abrirDialogo(user)).getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("button", { name: "Desfazer" })[0]!);
    expect(useObra.getState().obra?.modoCalculo).toBe("corrigido");
  });

  it("a dica aparece com o foco do teclado, cita cada item e Esc fecha só a dica", async () => {
    const { user } = await abrirTela();
    const dialogo = await abrirDialogo(user);
    expect(screen.queryByRole("tooltip")).toBeNull();
    const botao = within(dialogo).getByRole("button", { name: "O que muda com o modo de cálculo" });
    for (let i = 0; i < 30 && document.activeElement !== botao; i++) await user.tab();
    expect(document.activeElement).toBe(botao);

    const dica = screen.getByRole("tooltip");
    expect(dica.textContent).toContain("negativas das lajes contadas duas vezes");
    expect(dica.textContent).toContain("+23 %");
    expect(dica.textContent).toContain("volume e fôrma");
    expect(dica.textContent).toContain("esquece os pilares");
    expect(dica.textContent).toContain("só na NB-1/78");
    expect(dica.textContent).toContain("CA-25 de 0,15 % em vez de 0,25 %");
    // o switch também é descrito pela dica (leitor de tela)
    expect(switchModo(dialogo).getAttribute("aria-describedby")).toBe(dica.id);
    expect(botao.getAttribute("aria-describedby")).toBe(dica.id);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Obra e materiais" })).toBeTruthy();

    // sair do botão também fecha
    await user.keyboard("{Shift>}{Tab}{/Shift}{Tab}");
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("no toque a dica abre e um toque fora fecha", async () => {
    const { user } = await abrirTela();
    const dialogo = await abrirDialogo(user);
    const botao = within(dialogo).getByRole("button", { name: "O que muda com o modo de cálculo" });
    await user.pointer({ keys: "[TouchA]", target: botao });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.pointer({ keys: "[TouchA]", target: within(dialogo).getByText("Corrigido") });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("modo de cálculo: resultados e relatório", () => {
  it("alternar o modo recalcula o aço das lajes e mostra o selo só no original", async () => {
    const { user } = await abrirTela();
    let painel = await abrirAba(user, "Resultados");
    const acoCorrigido = lerNumeroBr(linhaTotalDaObra(painel, "Lajes")[3] ?? "");
    expect(within(painel).queryByText(SELO_MODO_ORIGINAL)).toBeNull();

    await trocarModo(user);
    painel = await abrirAba(user, "Resultados");
    const acoOriginal = lerNumeroBr(linhaTotalDaObra(painel, "Lajes")[3] ?? "");
    expect(within(painel).getByText(SELO_MODO_ORIGINAL)).toBeTruthy();
    // item E: a negativa do bordo comum entra 2·0,25·lmenor em cada laje, em vez de
    // 0,25·lmenor: o aço das lajes cresce
    expect(acoOriginal).toBeGreaterThan(acoCorrigido);

    await trocarModo(user);
    painel = await abrirAba(user, "Resultados");
    expect(lerNumeroBr(linhaTotalDaObra(painel, "Lajes")[3] ?? "")).toBe(acoCorrigido);
    expect(within(painel).queryByText(SELO_MODO_ORIGINAL)).toBeNull();
  });

  it("o relatório mostra o modo no cabeçalho", async () => {
    const { user } = await abrirTela();
    let painel = await abrirAba(user, "Relatório");
    expect(within(painel).getByText("Modo de cálculo: Corrigido")).toBeTruthy();
    await trocarModo(user);
    painel = await abrirAba(user, "Relatório");
    expect(within(painel).getByText(/^Modo de cálculo: Como o SISTRUT original/)).toBeTruthy();
  });

  it("no original, tela e relatório dão volume e forma diferentes, com aviso do valor certo", async () => {
    // o certo é o total do modo corrigido, na tela e no relatório
    const { user } = await abrirTela();
    let painel = await abrirAba(user, "Resultados");
    const [, concretoCerto, formaCerta] = linhaTotalDaObra(painel, "Total");
    painel = await abrirAba(user, "Relatório");
    expect(linhaTotalRelatorio(painel).slice(1, 3)).toEqual([concretoCerto, formaCerta]);
    expect(within(painel).queryByRole("note")).toBeNull();

    await trocarModo(user);
    painel = await abrirAba(user, "Resultados");
    const [, concretoTela, formaTela] = linhaTotalDaObra(painel, "Total");
    const notaTela = within(painel).getByRole("note");
    painel = await abrirAba(user, "Relatório");
    const [, concretoRel, formaRel] = linhaTotalRelatorio(painel);
    const notaRel = within(painel).getByRole("note");

    // tela (FORMEDCA) sem os pilares: menos concreto que o certo; relatório (FORMIMP)
    // com a laje sobre as vigas duas vezes: mais
    const n = (t: string | undefined) => lerNumeroBr(t ?? "");
    expect(n(concretoTela)).toBeLessThan(n(concretoCerto));
    expect(n(concretoRel)).toBeGreaterThan(n(concretoCerto));
    expect(n(formaRel)).toBeGreaterThan(n(formaTela));

    for (const nota of [notaTela, notaRel]) {
      expect(nota.textContent).toContain("diferem de propósito");
      expect(nota.textContent).toContain(`${concretoTela} m³ e ${formaTela} m²`);
      expect(nota.textContent).toContain(`${concretoRel} m³ e ${formaRel} m²`);
      expect(nota.textContent).toContain(
        `O certo (modo corrigido) é ${concretoCerto} m³ e ${formaCerta} m²`,
      );
    }
  });
});

describe("modo de cálculo: arquivo e rascunho", () => {
  it("o modo vai para o arquivo salvo, volta ao abrir e fica no rascunho", async () => {
    const { user, router } = await abrirTela();
    await trocarModo(user);

    // salvar: File System Access API simulada
    let gravado = "";
    const handle = {
      name: "Casa.openstrut.json",
      getFile: async () => new File([gravado], "Casa.openstrut.json"),
      createWritable: async () => ({
        write: async (t: string) => {
          gravado = t;
        },
        close: async () => {},
      }),
    };
    Object.defineProperty(window, "showSaveFilePicker", {
      value: vi.fn(async () => handle),
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText(/^Salvo em Casa\.openstrut\.json/);
    const lida = lerObra(gravado);
    expect(lida.ok && lida.obra.modoCalculo).toBe("original");

    // rascunho (gravado com debounce de 800 ms)
    const id = useSessao.getState().rascunhoId;
    if (!id) throw new Error("sem rascunho");
    await waitFor(
      async () => {
        const r = await abrirRascunho(id);
        expect(r.ok && r.obra.modoCalculo).toBe("original");
      },
      { timeout: 5000 },
    );

    // abrir o arquivo pela tela inicial: o switch volta ligado
    useObra.getState().fechar();
    Object.defineProperty(window, "showOpenFilePicker", {
      value: async () => [handle],
      configurable: true,
    });
    await router.navigate({ to: "/" });
    await user.click(await screen.findByRole("button", { name: /Abrir arquivo/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    expect(useObra.getState().obra?.modoCalculo).toBe("original");
    const dialogo = await abrirDialogo(user);
    expect(switchModo(dialogo).getAttribute("aria-checked")).toBe("true");
  });
});

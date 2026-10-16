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
    expect(dica.textContent).toContain("Só vale na NB-1/78");
    expect(dica.textContent).toContain("número a número");
    expect(dica.textContent).toContain("flecha das lajes");
    expect(dica.textContent).toContain("0,25 % com CA-25");
    expect(dica.textContent).toContain("reações truncadas no .REP");
    expect(dica.textContent).toContain("sem .RLP nem .SEC");
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
  it("alternar o modo recalcula as vigas e mostra o selo só no original", async () => {
    const { user } = await abrirTela();
    let painel = await abrirAba(user, "Resultados");
    const concretoCorrigido = lerNumeroBr(linhaTotalDaObra(painel, "Vigas")[1] ?? "");
    expect(within(painel).queryByText(SELO_MODO_ORIGINAL)).toBeNull();

    await trocarModo(user);
    painel = await abrirAba(user, "Resultados");
    const concretoOriginal = lerNumeroBr(linhaTotalDaObra(painel, "Vigas")[1] ?? "");
    expect(within(painel).getByText(SELO_MODO_ORIGINAL)).toBeTruthy();
    // no original o concreto das vigas é o do DESINIT (altura inteira, vão livre); no
    // corrigido, abaixo da laje e pelos eixos
    expect(concretoOriginal).not.toBe(concretoCorrigido);

    await trocarModo(user);
    painel = await abrirAba(user, "Resultados");
    expect(lerNumeroBr(linhaTotalDaObra(painel, "Vigas")[1] ?? "")).toBe(concretoCorrigido);
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

  it("tela e relatório dão o mesmo total; a nota diz o que vem do DESINIT e o que é da V2", async () => {
    // os itens F e G antigos (tela e relatório diferentes) eram da V1 antiga e saíram
    const { user } = await abrirTela();
    for (const trocar of [false, true]) {
      if (trocar) await trocarModo(user);
      let painel = await abrirAba(user, "Resultados");
      const [, concretoTela, formaTela] = linhaTotalDaObra(painel, "Total");
      const notaTela = within(painel).getByRole("note");
      painel = await abrirAba(user, "Relatório");
      expect(linhaTotalRelatorio(painel).slice(1, 3)).toEqual([concretoTela, formaTela]);
      const notaRel = within(painel).getByRole("note");
      for (const nota of [notaTela, notaRel]) {
        expect(nota.textContent).toContain(
          "Lajes e pilares: regra da OpenStrut (o SISTRUT não calcula).",
        );
        // concreto e fôrma de vigas: do DESINIT só no original
        if (trocar)
          expect(nota.textContent).toContain("Vigas: como no SISTRUT (detalhamento do DESINIT).");
        else {
          expect(nota.textContent).toContain(
            "Aço das vigas: como no SISTRUT (detalhamento do DESINIT).",
          );
          expect(nota.textContent).toContain("Concreto e fôrma das vigas: regra da OpenStrut.");
        }
      }
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

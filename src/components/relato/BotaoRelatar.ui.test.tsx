import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { obraDuasLajes, renderizarApp } from "../../test-setup";
import { DialogoRelato } from "./DialogoRelato";
import { montarDiagnostico } from "./diagnostico";
import { listarFila, removerDaFila } from "./fila";

const dialogo = () => screen.findByRole("dialog", { name: "Relatar problema" });

/**
 * O botão com a captura falsa (a real, modern-screenshot, precisa de navegador; o e2e
 * cobre). O test-setup já carregou o app com a captura real, então o módulo é
 * recarregado com o mock, junto com um estado da obra novo.
 */
async function botaoComCapturaFalsa() {
  vi.resetModules();
  vi.doMock("./captura", () => ({
    ATRIBUTO_IGNORAR: "data-relato-ignorar",
    capturarTela: async () =>
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }),
  }));
  const { BotaoRelatar } = await import("./BotaoRelatar");
  const { useObra } = await import("../../estado/obra");
  return { BotaoRelatar, useObra };
}

describe("botão Relatar problema", () => {
  test("está na moldura do app, na tela inicial e na da obra", async () => {
    renderizarApp("/");
    const botao = await screen.findByRole("button", { name: "Relatar problema" });
    expect(botao.getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+R");
    expect(botao.closest("[aria-live]")?.className).toContain("print:hidden");
  });

  test("abre o diálogo pelo GitHub com print e diagnóstico", async () => {
    const { BotaoRelatar } = await botaoComCapturaFalsa();
    const user = userEvent.setup();
    render(<BotaoRelatar />);
    await user.click(screen.getByRole("button", { name: "Relatar problema" }));

    const d = await dialogo();
    expect(within(d).getByText(/Envio pelo GitHub:/)).toBeTruthy();
    expect(within(d).getByText("nenhuma obra aberta")).toBeTruthy();
    expect(within(d).getByRole("img", { name: "Print da tela no momento do clique" })).toBeTruthy();
    // sem obra aberta não há o que anexar
    expect(within(d).queryByText(/Anexar a obra/)).toBeNull();
    // o botão flutuante sai enquanto o diálogo está aberto
    expect(screen.queryByRole("button", { name: "Relatar problema" })).toBeNull();

    const abrir = within(d).getByRole("button", { name: "Abrir issue no GitHub" });
    expect(abrir).toHaveProperty("disabled", true);
    await user.type(within(d).getByLabelText("O que aconteceu"), "A planta sumiu");

    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await user.click(abrir);
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    const url = new URL(String(open.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/gmunaro/openstrut/issues/new");
    expect(url.searchParams.get("title")).toBe("[Relato] A planta sumiu");
    expect(url.searchParams.get("body")).toContain("Cole o print aqui (Ctrl+V)");
    // a aba bloqueada vira link
    expect(await within(d).findByRole("link", { name: "Abrir a issue no GitHub" })).toBeTruthy();
  });

  test("Alt+Shift+R abre o relato; com obra aberta, a obra vem marcada e pode ser desmarcada", async () => {
    const { BotaoRelatar, useObra } = await botaoComCapturaFalsa();
    useObra.getState().abrir(obraDuasLajes("nbr6118-2023", "Casa Teste"));
    const user = userEvent.setup();
    render(<BotaoRelatar />);
    fireEvent.keyDown(window, { key: "R", code: "KeyR", altKey: true, shiftKey: true });

    const d = await dialogo();
    expect(within(d).getByText("NBR 6118:2023")).toBeTruthy();
    expect(within(d).getByText(/"Casa Teste", 1 pavimento, 2 lajes/)).toBeTruthy();
    const obra = within(d).getByRole("checkbox", {
      name: /Anexar a obra \(Casa-Teste\.openstrut\.json/,
    });
    expect(obra).toHaveProperty("checked", true);
    expect(within(d).getByText(/vão para uma issue pública/)).toBeTruthy();

    await user.click(within(d).getByText("Ver o texto exato que vai sair"));
    const exato = within(d).getByTestId("relato-texto-exato");
    expect(exato.textContent).toContain("Casa-Teste.openstrut.json");
    await user.click(obra);
    await user.click(within(d).getByRole("checkbox", { name: /Anexar o print/ }));
    await waitFor(() => expect(exato.textContent).not.toContain("Casa-Teste.openstrut.json"));
    expect(exato.textContent).toContain("O usuário não anexou o print.");
  });
});

describe("diálogo com relay", () => {
  const captura = {
    print: null,
    obra: null,
    agora: new Date("2026-10-16T12:00:00Z"),
    diagnostico: montarDiagnostico({
      commit: undefined,
      arquivoBuild: "index.js",
      rota: "/",
      obra: null,
      janela: { largura: 1, altura: 1, dpr: 1 },
      tela: { largura: 1, altura: 1 },
      instalado: false,
      online: false,
      idioma: "pt-BR",
      userAgent: "teste",
      erros: [],
      agora: new Date("2026-10-16T12:00:00Z"),
    }),
  };

  test("sem rede, guarda o relato na fila em vez de enviar", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const buscar = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(
      <DialogoRelato
        captura={captura}
        aoFechar={() => {}}
        caminho={{ tipo: "relay", url: "https://relay.test/relato" }}
      />,
    );
    const d = await dialogo();
    expect(within(d).getByText(/Envio direto, sem conta:/)).toBeTruthy();
    expect(within(d).getByText("Não foi possível capturar a tela.")).toBeTruthy();
    expect(within(d).getByText(/Não aparece na issue pública/)).toBeTruthy();
    await user.type(within(d).getByLabelText("O que aconteceu"), "Travou ao salvar");
    await user.click(within(d).getByRole("button", { name: "Guardar e enviar depois" }));

    expect(await within(d).findByText(/ficou guardado neste aparelho/)).toBeTruthy();
    expect(buscar).not.toHaveBeenCalled();
    const fila = await listarFila();
    expect(fila.map((i) => i.relato.aconteceu)).toEqual(["Travou ao salvar"]);
    for (const i of fila) await removerDaFila(i.id);
  });
});

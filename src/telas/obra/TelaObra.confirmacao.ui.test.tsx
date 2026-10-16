// Confirmação ao abrir outra obra com alterações não salvas: o diálogo aparece só
// quando há o que perder, Escape cancela e o foco volta ao botão "Abrir".
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useObra } from "../../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";
import { useSessao } from "../sessao";

function instalarSeletor(seletor: unknown) {
  Object.defineProperty(window, "showOpenFilePicker", {
    value: seletor,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, "showOpenFilePicker");
});

async function abrirTela() {
  abrirObra(obraDuasLajes("nb1-78", "Casa"));
  const { user } = renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
  return { user };
}

/** Seletor que o usuário cancela: a abertura não chega a carregar nada. */
const seletorCancelado = () =>
  vi.fn(async () => {
    throw new DOMException("cancelado", "AbortError");
  });

describe("tela da obra: confirmação de abrir outra obra", () => {
  it("com alterações não salvas, o diálogo diz o que se perde e não abre o seletor sozinho", async () => {
    const { user } = await abrirTela();
    const seletor = seletorCancelado();
    instalarSeletor(seletor);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialogo = await screen.findByRole("dialog", { name: "Abrir outra obra?" });
    expect(dialogo.textContent).toContain("alterações não salvas em arquivo");
    expect(seletor).not.toHaveBeenCalled();
  });

  it("obra salva: 'Abrir' vai direto ao seletor, sem diálogo", async () => {
    const { user } = await abrirTela();
    // obra igual à última salva: nada a perder
    useSessao.setState({ obraSalva: useObra.getState().obra });
    const seletor = seletorCancelado();
    instalarSeletor(seletor);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await waitFor(() => expect(seletor).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape fecha o diálogo como cancelar: o seletor não abre", async () => {
    const { user } = await abrirTela();
    const seletor = seletorCancelado();
    instalarSeletor(seletor);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await screen.findByRole("dialog", { name: "Abrir outra obra?" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(seletor).not.toHaveBeenCalled();
    expect(useObra.getState().obra?.nome).toBe("Casa");
  });

  it("ao fechar, o foco volta ao botão 'Abrir'", async () => {
    const { user } = await abrirTela();
    instalarSeletor(seletorCancelado());

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialogo = await screen.findByRole("dialog", { name: "Abrir outra obra?" });
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir" }));
  });
});

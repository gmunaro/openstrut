// Diálogo de unidades: foco volta ao botão de origem e as setas trocam a opção.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSessao } from "../sessao";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";

async function abrirDialogo() {
  abrirObra(obraDuasLajes("nb1-78", "Casa"));
  const { user } = renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
  await user.click(screen.getByRole("button", { name: /Unidades/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Unidades" });
  return { user, dialogo };
}

describe("diálogo de unidades", () => {
  it("ao fechar com Esc, o foco volta ao botão Unidades", async () => {
    const { user } = await abrirDialogo();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Unidades/ })),
    );
  });

  it("setas trocam a opção marcada e movem o foco", async () => {
    const { user, dialogo } = await abrirDialogo();
    const si = within(dialogo).getByRole("radio", { name: /^SI / });
    const tf = within(dialogo).getByRole("radio", { name: /^Técnicas/ });
    si.focus();
    await user.keyboard("{ArrowDown}");
    expect(useSessao.getState().unidades).toBe("tf");
    expect(tf.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(tf);

    await user.keyboard("{ArrowUp}");
    expect(useSessao.getState().unidades).toBe("si");
    expect(document.activeElement).toBe(si);
  });

  it("só a opção marcada entra na sequência de Tab", async () => {
    const { dialogo } = await abrirDialogo();
    expect(within(dialogo).getByRole("radio", { name: /^SI / }).getAttribute("tabindex")).toBe("0");
    expect(
      within(dialogo)
        .getByRole("radio", { name: /^Técnicas/ })
        .getAttribute("tabindex"),
    ).toBe("-1");
  });
});

// Diálogo de obra e materiais: o CA-25 só existe na classe A.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useObra } from "../../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";

async function abrirDialogo() {
  abrirObra(obraDuasLajes("nb1-78", "Casa"));
  const { user } = renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
  await user.click(screen.getByRole("button", { name: /Materiais/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Obra e materiais" });
  return { user, dialogo };
}

describe("diálogo de materiais: CA-25 e classe do aço", () => {
  it("escolher CA-25 volta a classe para A, desabilita a B e grava A", async () => {
    const { user, dialogo } = await abrirDialogo();
    const classe = () => within(dialogo).getByRole("combobox", { name: "Classe do aço" });
    await user.click(classe());
    await user.click(await screen.findByRole("option", { name: "B (encruado a frio)" }));
    expect(classe().textContent).toContain("B (encruado a frio)");

    await user.click(within(dialogo).getByRole("combobox", { name: "Aço longitudinal" }));
    await user.click(await screen.findByRole("option", { name: "CA-25" }));
    expect(classe().textContent).toContain("A (laminado a quente)");

    await user.click(classe());
    const b = await screen.findByRole("option", { name: "B (encruado a frio)" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await user.keyboard("{Escape}");

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useObra.getState().obra?.materiais).toMatchObject({ aco: "CA-25", classeAco: "A" });
  });
});

describe("diálogo de materiais: modo de cálculo fora da NB-1/78", () => {
  it("com NBR 6118 o switch fica desabilitado, mostra o aviso e não muda o modo salvo", async () => {
    abrirObra({ ...obraDuasLajes("nbr6118-2023", "Casa"), modoCalculo: "original" });
    const { user } = renderizarApp("/obra");
    await screen.findByRole("heading", { level: 1, name: "Casa" });
    await user.click(screen.getByRole("button", { name: /Materiais/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Obra e materiais" });

    const switchModo = within(dialogo).getByRole("switch", { name: /Modo de cálculo/ });
    expect(switchModo.hasAttribute("disabled")).toBe(true);
    expect(switchModo.getAttribute("aria-checked")).toBe("true");
    expect(within(dialogo).getByText("O modo de cálculo só se aplica à NB-1/78.")).toBeTruthy();

    await user.click(switchModo);
    expect(switchModo.getAttribute("aria-checked")).toBe("true");

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useObra.getState().obra).toMatchObject({
      norma: "nbr6118-2023",
      modoCalculo: "original",
    });
  });

  it("trocar a norma para NBR 6118 desabilita o switch e grava o modo que já estava salvo", async () => {
    abrirObra({ ...obraDuasLajes("nb1-78", "Casa"), modoCalculo: "original" });
    const { user } = renderizarApp("/obra");
    await screen.findByRole("heading", { level: 1, name: "Casa" });
    await user.click(screen.getByRole("button", { name: /Materiais/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Obra e materiais" });
    const switchModo = () => within(dialogo).getByRole("switch", { name: /Modo de cálculo/ });
    expect(switchModo().hasAttribute("disabled")).toBe(false);

    await user.click(within(dialogo).getByRole("combobox", { name: "Norma" }));
    await user.click(await screen.findByRole("option", { name: "NBR 6118:2023" }));
    expect(switchModo().hasAttribute("disabled")).toBe(true);
    expect(within(dialogo).queryByText("O modo de cálculo só se aplica à NB-1/78.")).toBeTruthy();

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useObra.getState().obra).toMatchObject({
      norma: "nbr6118-2023",
      modoCalculo: "original",
    });
  });
});

describe("diálogo de materiais: foco ao fechar", () => {
  it("ao fechar com Esc, o foco volta ao botão Materiais", async () => {
    const { user } = await abrirDialogo();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Materiais/ })),
    );
  });
});

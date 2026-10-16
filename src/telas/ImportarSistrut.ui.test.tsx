// Importação de obra do SISTRUT na tela inicial (ImportarSistrut.tsx) com o app inteiro:
// arquivos escolhidos de uma vez ou soltos na área, o resumo antes de abrir (pavimentos
// na ordem, lidos, ignorados, avisos), abrir e cancelar, e o erro sem obra.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useObra } from "../estado/obra";
import { renderizarApp } from "../test-setup";
import { arquivo, PREDIO } from "./__fixtures__/predioSistrut";
import type { ArquivoEntrada } from "./InicioSistrut";

const comoFile = (a: ArquivoEntrada) => new File([a.dados.slice()], a.nome);

describe("importar obra do SISTRUT", () => {
  it("vários arquivos de uma vez: resumo com os pavimentos na ordem, lidos e ignorados; abre a obra", async () => {
    const { router, user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, PREDIO.map(comoFile));

    const dialogo = await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
    const pavimentos = within(dialogo).getByRole("region", { name: "Pavimentos importados" });
    const linhas = within(pavimentos)
      .getAllByRole("row")
      .slice(1)
      .map((l) => within(l).getAllByRole("cell")[0]!.textContent);
    expect(linhas).toEqual(["ESCADA", "TETO", "BASE"]);
    expect(within(pavimentos).getByRole("row", { name: /TETO 3 4/ })).toBeTruthy();
    expect(
      within(within(dialogo).getByRole("region", { name: "Arquivos lidos" })).getByText(
        /TETO\.LAJ/,
      ),
    ).toBeTruthy();
    const ignorados = within(dialogo).getByRole("region", { name: "Arquivos ignorados" });
    expect(within(ignorados).getByText("TETO.BAK")).toBeTruthy();
    expect(within(ignorados).getByText("R5__TETO.EDV")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");

    await user.click(within(dialogo).getByRole("button", { name: "Abrir obra importada" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    expect(useObra.getState().obra?.pavimentos.map((p) => p.nome)).toEqual([
      "ESCADA",
      "TETO",
      "BASE",
    ]);
  });

  it("Cancelar fecha o resumo sem abrir nada", async () => {
    const { router, user } = renderizarApp("/");
    useObra.setState({ obra: null });
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, PREDIO.map(comoFile));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/");
    expect(useObra.getState().obra).toBeNull();
  });

  it("sem .LAJ, .VIG nem .COL: o diálogo diz por quê e não abre nada", async () => {
    const { router, user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, [comoFile(arquivo("E2E.SEC"))]);
    const dialogo = await screen.findByRole("dialog", {
      name: "Não foi possível importar a obra do SISTRUT",
    });
    const alerta = within(dialogo).getByRole("alert");
    expect(within(alerta).getByText(/^Nenhuma obra para abrir/)).toBeTruthy();
    expect(within(alerta).getByText("E2E.SEC: sem E2E.VIG nem E2E.LAJ; ignorado.")).toBeTruthy();
    expect(within(dialogo).queryByRole("button", { name: "Abrir obra importada" })).toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });

  it("arquivos soltos na área de arrastar entram como os escolhidos", async () => {
    renderizarApp("/");
    const area = await screen.findByRole("region", { name: "Soltar arquivos do SISTRUT" });
    fireEvent.drop(area, { dataTransfer: { files: PREDIO.map(comoFile), items: [] } });
    expect(await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })).toBeTruthy();
  });

  it("a pasta inteira tem um seletor próprio", async () => {
    renderizarApp("/");
    const pasta = await screen.findByLabelText("Pasta da obra do SISTRUT");
    expect(pasta.hasAttribute("webkitdirectory")).toBe(true);
  });
});

// Tela inicial com o app inteiro (rotas reais em memória): criar obra nova,
// rascunho automático no IndexedDB (fake-indexeddb), reabrir pela lista de recentes
// e importar a obra FLUXO da V1.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fluxoCol from "../armazenamento/__fixtures__/v1/FLUXO.COL?raw";
import fluxoLaj from "../armazenamento/__fixtures__/v1/FLUXO.LAJ?raw";
import fluxoVig from "../armazenamento/__fixtures__/v1/FLUXO.VIG?raw";
import { listarRascunhos } from "../armazenamento/rascunho";
import { useObra } from "../estado/obra";
import { renderizarApp } from "../test-setup";
import { AVISO_CONFERENCIA } from "./calculo";

describe("tela inicial", () => {
  it("mostra o título, o aviso de conferência e nenhum rascunho", async () => {
    renderizarApp("/");
    expect(await screen.findByRole("heading", { name: "SISTRUT V2" })).toBeTruthy();
    expect(screen.getByText(AVISO_CONFERENCIA)).toBeTruthy();
    expect(await screen.findByText("Nenhum rascunho.")).toBeTruthy();
  });

  it("cria obra nova com nome e norma e vai para /obra", async () => {
    const { router, user } = renderizarApp("/");
    const criar = await screen.findByRole("button", { name: /Criar obra/ });
    expect(criar).toHaveProperty("disabled", true);

    await user.type(screen.getByLabelText("Nome"), "  Residência Silva  ");
    await user.click(screen.getByRole("combobox", { name: "Norma" }));
    await user.click(await screen.findByRole("option", { name: "NBR 6118:2023" }));
    expect(criar).toHaveProperty("disabled", false);
    await user.click(criar);

    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    const obra = useObra.getState().obra;
    expect(obra?.nome).toBe("Residência Silva");
    expect(obra?.norma).toBe("nbr6118-2023");
    expect(obra?.materiais.fck).toBe(25);
    expect(obra?.pavimentos.map((p) => p.nome)).toEqual(["Pavimento 1"]);
    expect(await screen.findByRole("heading", { name: "Residência Silva" })).toBeTruthy();
  });

  it("não cria obra com nome só de espaços", async () => {
    const { router, user } = renderizarApp("/");
    await user.type(await screen.findByLabelText("Nome"), "   {Enter}");
    expect(router.state.location.pathname).toBe("/");
    expect(useObra.getState().obra).toBeNull();
  });

  it("não diz que a NBR 6118:2023 está indisponível (o motor já calcula por ela)", async () => {
    const { user } = renderizarApp("/");
    await user.click(await screen.findByRole("combobox", { name: "Norma" }));
    await user.click(await screen.findByRole("option", { name: "NBR 6118:2023" }));
    expect(screen.queryByText(/ainda não está disponível/)).toBeNull();
  });

  it("guarda o rascunho da obra editada e reabre pela lista de recentes", async () => {
    const { router, user } = renderizarApp("/");
    await user.type(await screen.findByLabelText("Nome"), "Casa do rascunho{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));

    // edição: renomeia o pavimento pela barra de pavimentos
    const nomePav = await screen.findByDisplayValue("Pavimento 1");
    await user.clear(nomePav);
    await user.type(nomePav, "Térreo{Enter}");
    expect(useObra.getState().obra?.pavimentos[0]?.nome).toBe("Térreo");

    // o rascunho é gravado com debounce (800 ms) ou ao sair da tela
    await waitFor(
      async () => {
        const r = await listarRascunhos();
        expect(r.map((x) => x.nome)).toEqual(["Casa do rascunho"]);
      },
      { timeout: 3000 },
    );

    await user.click(screen.getByRole("link", { name: "Início" }));
    const lista = await screen.findByRole("list");
    const item = within(lista).getByRole("button", { name: /^Casa do rascunho/ });
    expect(within(lista).getByText("NB-1/78")).toBeTruthy();

    useObra.getState().fechar();
    await user.click(item);
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    // o rascunho tem a edição feita antes de sair
    expect(useObra.getState().obra?.pavimentos[0]?.nome).toBe("Térreo");
    expect(await screen.findByRole("heading", { name: "Casa do rascunho" })).toBeTruthy();
  });

  it("importa a obra FLUXO da V1 (.LAJ, .VIG, .COL), mostra os avisos e abre a obra", async () => {
    const { router, user } = renderizarApp("/");
    const botao = await screen.findByRole("button", { name: /Importar obra da V1 \(\.LAJ\)/ });
    const entrada = screen.getByLabelText<HTMLInputElement>("Arquivos da V1 (.LAJ, .VIG, .COL)");
    const clique = vi.spyOn(entrada, "click");
    await user.click(botao);
    expect(clique).toHaveBeenCalled();
    expect(entrada.multiple).toBe(true);

    await user.upload(entrada, [
      new File([fluxoLaj], "FLUXO.LAJ"),
      new File([fluxoVig], "FLUXO.VIG"),
      new File([fluxoCol], "FLUXO.COL"),
    ]);
    const avisos = await screen.findByRole("region", { name: "Avisos da importação" });
    expect(within(avisos).getByText(/Obra FLUXO importada da V1 com 2 avisos/)).toBeTruthy();
    expect(within(avisos).getByText(/^Materiais: /)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");

    await user.click(within(avisos).getByRole("button", { name: "Abrir obra importada" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    const obra = useObra.getState().obra;
    expect(obra?.nome).toBe("FLUXO");
    expect(obra?.pavimentos[0]?.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]);
    expect(obra?.pavimentos[0]?.pilares.every((p) => p.b === 20 && p.h === 30)).toBe(true);
    expect(await screen.findByRole("heading", { name: "FLUXO" })).toBeTruthy();
  });

  it("arquivo da V1 truncado mostra o erro e não abre nada", async () => {
    const { router, user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos da V1 (.LAJ, .VIG, .COL)");
    const truncado = fluxoLaj.split(/\r?\n/).slice(0, 3).join("\r\n");
    await user.upload(entrada, new File([truncado], "FLUXO.LAJ"));
    const alerta = await screen.findByRole("alert");
    expect(within(alerta).getByText("Não foi possível importar a obra da V1:")).toBeTruthy();
    expect(
      within(alerta).getByText(
        "FLUXO.LAJ: arquivo truncado ou corrompido: acabou sem o nome da laje 2.",
      ),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
    expect(useObra.getState().obra).toBeNull();
  });

  it("apaga um rascunho da lista depois de confirmar", async () => {
    const { router, user } = renderizarApp("/");
    await user.type(await screen.findByLabelText("Nome"), "Para apagar{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    await user.click(await screen.findByRole("link", { name: "Início" }));
    const lista = await screen.findByRole("list");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(within(lista).getByRole("button", { name: "Apagar rascunho Para apagar" }));
    expect(await screen.findByText("Nenhum rascunho.")).toBeTruthy();
    expect(await listarRascunhos()).toEqual([]);
  });
});

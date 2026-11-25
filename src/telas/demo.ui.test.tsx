// Link de demonstração (telas/demo.ts) no app inteiro: abre a obra-exemplo calculada na
// aba pedida e, no modo embutido, sem dicas de primeiro uso, sem gravar rascunho e sem
// confirmação ao sair. O aviso de conferência aparece nos dois modos.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listarRascunhos } from "../armazenamento/rascunho";
import { NOME_EXEMPLO } from "../dominio/exemplo";
import { useObra } from "../estado/obra";
import { renderizarApp } from "../test-setup";
import { AVISO_CONFERENCIA } from "./marca";

/** Espera mais que o debounce do rascunho automático (800 ms em TelaObra). */
const passarDoDebounce = () => new Promise((r) => setTimeout(r, 1200));

describe("link de demonstração", () => {
  it("abre a obra-exemplo calculada direto na aba Resultados", async () => {
    const { router } = renderizarApp("/?exemplo=nb1-78&aba=resultados");
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    expect(router.state.location.searchStr).toBe("");
    expect(useObra.getState().obra).toMatchObject({ nome: NOME_EXEMPLO, norma: "nb1-78" });
    expect(await screen.findByText(/Calculado pela NB-1\/78/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Resultados" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText(AVISO_CONFERENCIA)).toBeTruthy();
  });

  it("sem embed: mostra a dica e grava o rascunho, como o botão da tela inicial", async () => {
    renderizarApp("/?exemplo=nbr6118-2023&aba=resultados");
    expect(await screen.findByRole("region", { name: "Como ler os resultados" })).toBeTruthy();
    await passarDoDebounce();
    expect((await listarRascunhos()).map((r) => r.nome)).toEqual([NOME_EXEMPLO]);
  });

  it("embutido: sem dica, sem rascunho gravado e sem confirmação ao sair", async () => {
    const { router, user } = renderizarApp("/?exemplo=nbr6118-2023&aba=resultados&embed=1");
    expect(await screen.findByText(/Calculado pela NBR 6118:2023/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Como ler os resultados" })).toBeNull();
    expect(screen.getByText(AVISO_CONFERENCIA)).toBeTruthy();

    await passarDoDebounce();
    expect(await listarRascunhos()).toEqual([]);

    // a obra de demonstração nunca foi salva em arquivo, e mesmo assim sai sem perguntar
    await user.click(screen.getByRole("link", { name: "Início" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByText("Sair com alterações não salvas?")).toBeNull();
    // o modo vale até a página fechar: a tela inicial também fica sem a dica
    await screen.findByRole("heading", { name: "OpenStrut V2" });
    expect(screen.queryByRole("region", { name: "Primeira vez no OpenStrut?" })).toBeNull();
  });

  it("sem embed, sair da obra-exemplo pede confirmação", async () => {
    const { user } = renderizarApp("/?exemplo=nbr6118-2023");
    await screen.findByRole("heading", { level: 1, name: NOME_EXEMPLO });
    await user.click(screen.getByRole("link", { name: "Início" }));
    expect(await screen.findByText("Sair com alterações não salvas?")).toBeTruthy();
  });

  it("embed sem exemplo fica na tela inicial, sem a dica de primeira vez", async () => {
    const { router } = renderizarApp("/?embed=1");
    await screen.findByRole("heading", { name: "OpenStrut V2" });
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByRole("region", { name: "Primeira vez no OpenStrut?" })).toBeNull();
  });
});

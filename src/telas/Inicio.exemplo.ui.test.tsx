// Primeiro uso na tela inicial: a obra-exemplo abre com um clique, já calculada, e a dica
// de boas-vindas some ao ser fechada e não volta ao remontar a tela.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NOME_EXEMPLO } from "../dominio/exemplo";
import { useObra } from "../estado/obra";
import { renderizarApp } from "../test-setup";

describe("primeiro uso", () => {
  it("abre a obra-exemplo pela NBR 6118:2023 e mostra os resultados calculados", async () => {
    const { router, user } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: /Exemplo NBR 6118:2023/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    const obra = useObra.getState().obra;
    expect(obra?.nome).toBe(NOME_EXEMPLO);
    expect(obra?.norma).toBe("nbr6118-2023");
    expect(await screen.findByRole("heading", { name: NOME_EXEMPLO })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Resultados" }));
    expect(await screen.findByText(/Calculado pela NBR 6118:2023/)).toBeTruthy();
  });

  it("abre a obra-exemplo pela NB-1/78", async () => {
    const { router, user } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: /Exemplo NB-1\/78/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    expect(useObra.getState().obra?.norma).toBe("nb1-78");
  });

  it("fecha a dica de boas-vindas para sempre", async () => {
    const primeira = renderizarApp("/");
    const dica = await screen.findByRole("region", { name: "Primeira vez no OpenStrut?" });
    expect(dica.textContent).toContain("obra-exemplo");
    await primeira.user.click(
      screen.getByRole("button", { name: 'Fechar a dica "Primeira vez no OpenStrut?"' }),
    );
    expect(screen.queryByRole("region", { name: "Primeira vez no OpenStrut?" })).toBeNull();

    // outra visita à tela inicial (o localStorage guarda as dicas fechadas)
    await primeira.router.navigate({ to: "/obra" });
    await primeira.router.navigate({ to: "/" });
    await screen.findByRole("heading", { name: "OpenStrut V2" });
    expect(screen.queryByRole("region", { name: "Primeira vez no OpenStrut?" })).toBeNull();
  });
});

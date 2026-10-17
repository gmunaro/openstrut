// Ferramentas do editor de planta acrescentadas no polimento: Medir (M), guia do snap no
// bordo de laje, lista de atalhos (?), Enquadrar (E), aviso de pavimento vazio e a dica
// de primeiro uso.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import { useObra } from "../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../test-setup";

// Pavimento vazio numa área de 800 × 600 px: escala 63 px/m, origem em (85; 552) px
// (a conta está em EditorPlanta.ui.test.tsx).
const ESCALA = 63;
const tela = (x: number, y: number) => ({ clientX: 85 + x * ESCALA, clientY: 552 - y * ESCALA });

async function abrirEditor(obra = obraNova("Planta teste", "nb1-78")) {
  abrirObra(obra);
  const { user } = renderizarApp("/obra");
  const svg = await screen.findByRole("application", { name: "Planta do pavimento" });
  await waitFor(() => expect(svg.querySelector("line")).not.toBeNull());
  return { user, svg };
}

describe("ferramentas do editor", () => {
  it("Medir: dois cliques dão a distância e as componentes; Esc limpa", async () => {
    const { user, svg } = await abrirEditor();
    svg.focus();
    await user.keyboard("m");
    expect(screen.getByRole("button", { name: "Medir" }).getAttribute("aria-pressed")).toBe("true");
    // de (1; 1) a (4; 5): Δx 3, Δy 4, d 5 m (triângulo 3-4-5), com snap à grade de 0,5 m
    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(1.05, 0.98) });
    await user.pointer({ target: svg, coords: tela(4, 5) });
    expect(screen.getByText(/d = 5,00 m/).textContent).toContain("marque o segundo ponto");
    await user.pointer({ keys: "[MouseLeft]", target: svg, coords: tela(4, 5) });
    const status = screen.getByText(/d = 5,00 m/);
    expect(status.textContent).toContain("Δx = 3,00");
    expect(status.textContent).toContain("Δy = 4,00 m");
    expect(status.textContent).not.toContain("segundo ponto");
    expect(within(svg).getByText("5,00 m")).toBeTruthy();

    // a medida fixa não segue o cursor
    await user.pointer({ target: svg, coords: tela(8, 2) });
    expect(screen.getByText(/d = 5,00 m/)).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByText(/d = 5,00 m/)).toBeNull();
    // não muda a obra
    expect(useObra.getState().passado).toHaveLength(0);
  });

  it("mostra a guia tracejada quando o cursor prende no bordo de uma laje", async () => {
    // L1 e L2 de 4 × 5 m lado a lado: bordos em x = 0, 4, 8 e y = 0, 5
    const { user, svg } = await abrirEditor(obraDuasLajes("nb1-78"));
    await user.click(screen.getByRole("button", { name: "Laje" }));
    // a vista enquadra a obra de 8 × 5 m centrada: o centro da tela é o ponto (4; 2,5) m,
    // no bordo comum de L1 e L2 (x = 4); y = 2,5 vai para a grade, sem guia
    const guias = () => svg.querySelectorAll('g[stroke="#22d3ee"] line');
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 300, pointerType: "mouse" });
    expect(screen.getByText(/^x = /).textContent).toMatch(/x = 4,00\s+y = 2,50 m/);
    expect(guias()).toHaveLength(1);
    expect(guias()[0]?.getAttribute("x1")).toBe("400");
    // 120 px à esquerda (x ≈ 2,6 m, longe dos bordos): sem guia
    fireEvent.pointerMove(svg, { clientX: 280, clientY: 300, pointerType: "mouse" });
    expect(guias()).toHaveLength(0);
  });

  it("? abre a lista de atalhos, com as ferramentas novas", async () => {
    const { user, svg } = await abrirEditor();
    svg.focus();
    await user.keyboard("?");
    const dialogo = await screen.findByRole("dialog", { name: "Atalhos da planta" });
    expect(within(dialogo).getByText("Medir: clique em dois pontos")).toBeTruthy();
    expect(within(dialogo).getByText("Enquadra o pavimento inteiro")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // o botão da barra abre a mesma lista
    await user.click(screen.getByRole("button", { name: /Atalhos/ }));
    expect(await screen.findByRole("dialog", { name: "Atalhos da planta" })).toBeTruthy();
  });

  it("pavimento sem lajes diz por onde começar; some com a primeira laje", async () => {
    const { user, svg } = await abrirEditor();
    expect(screen.getByText("Pavimento sem lajes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Laje" }));
    await user.pointer([
      { keys: "[MouseLeft>]", target: svg, coords: tela(0, 0) },
      { target: svg, coords: tela(4, 5) },
      { keys: "[/MouseLeft]", target: svg, coords: tela(4, 5) },
    ]);
    expect(screen.queryByText("Pavimento sem lajes")).toBeNull();
  });

  it("E enquadra o pavimento depois de um zoom", async () => {
    const { user, svg } = await abrirEditor(obraDuasLajes("nb1-78"));
    const larguraL1 = () =>
      Number(
        within(svg).getByText("L1").parentElement?.querySelector("rect")?.getAttribute("width"),
      );
    const inicial = larguraL1();
    fireEvent.wheel(svg, { deltaY: -500, clientX: 400, clientY: 300 });
    await waitFor(() => expect(larguraL1()).toBeGreaterThan(inicial));
    svg.focus();
    await user.keyboard("e");
    await waitFor(() => expect(larguraL1()).toBeCloseTo(inicial, 5));
  });

  it("a dica de primeiro uso da planta fecha e não volta", async () => {
    const { user } = await abrirEditor();
    const nome = "Como desenhar a planta";
    expect(screen.getByRole("region", { name: nome })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: `Fechar a dica "${nome}"` }));
    expect(screen.queryByRole("region", { name: nome })).toBeNull();
    expect(localStorage.getItem("openstrut:dicas-fechadas")).toContain("planta");
  });
});

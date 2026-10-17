// Parte carregada sob demanda que não vem: o limite mostra o aviso com Recarregar no
// lugar dela, sem derrubar a tela.
import { render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { LimiteCarga, TEXTO_FALHA_CARGA } from "./falha-carga";

describe("LimiteCarga", () => {
  it("mostra o aviso com Recarregar quando o import dinâmico falha", async () => {
    // o React registra o erro capturado no console; aqui ele é esperado
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Quebrado = lazy(() =>
      Promise.reject(new Error("Failed to fetch dynamically imported module")),
    );
    render(
      <div>
        <p>resto da tela</p>
        <LimiteCarga>
          <Suspense fallback={null}>
            <Quebrado />
          </Suspense>
        </LimiteCarga>
      </div>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(TEXTO_FALHA_CARGA);
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeTruthy();
    expect(screen.getByText("resto da tela")).toBeTruthy();
  });

  it("sem falha, mostra o conteúdo", () => {
    render(
      <LimiteCarga>
        <p>conteúdo</p>
      </LimiteCarga>,
    );
    expect(screen.getByText("conteúdo")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

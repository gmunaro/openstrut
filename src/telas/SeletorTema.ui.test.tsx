// Tema da tela: o seletor troca a classe .dark do <html>, guarda a escolha e, em "Do
// sistema", segue o prefers-color-scheme.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeletorTema } from "./SeletorTema";
import { ehEscuro, iniciarTema, lerTema } from "./tema";

const html = document.documentElement;

afterEach(() => {
  html.classList.remove("dark");
  vi.unstubAllGlobals();
});

describe("tema", () => {
  it("sem escolha guardada, o escuro de sempre", () => {
    expect(lerTema()).toBe("escuro");
    iniciarTema();
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("o seletor troca o tema, marca o botão e guarda a escolha", async () => {
    const user = userEvent.setup();
    render(<SeletorTema />);
    await user.click(screen.getByRole("button", { name: /Claro/ }));
    expect(html.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: /Claro/ }).getAttribute("aria-pressed")).toBe("true");
    expect(lerTema()).toBe("claro");
    await user.click(screen.getByRole("button", { name: /Escuro/ }));
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("do sistema: segue o prefers-color-scheme", () => {
    expect(ehEscuro("sistema", true)).toBe(true);
    expect(ehEscuro("sistema", false)).toBe(false);
    expect(ehEscuro("claro", true)).toBe(false);
    localStorage.setItem("openstrut:tema", "sistema");
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("light"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    iniciarTema();
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("valor estranho no armazenamento volta ao escuro", () => {
    localStorage.setItem("openstrut:tema", "roxo");
    expect(lerTema()).toBe("escuro");
  });
});

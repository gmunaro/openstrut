// Falha ao salvar na tela da obra: a frase aparece e o detalhe técnico, quando a
// ação traz um, fica recolhido em <details>. Mensagem simulada no hook de salvar.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useObra } from "../../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";

type Mensagem = { tipo: "ok" | "erro"; texto: string; detalhe?: string } | null;
const estado = vi.hoisted(() => ({ mensagem: null as Mensagem }));

vi.mock("../acoes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../acoes")>();
  return {
    ...real,
    useSalvarArquivo: () => ({ salvar: async () => {}, mensagem: estado.mensagem }),
  };
});

afterEach(() => {
  estado.mensagem = null;
});

async function abrirTela() {
  abrirObra(obraDuasLajes("nb1-78", "Casa"));
  renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
}

describe("tela da obra: detalhe técnico da falha ao salvar", () => {
  it("com detalhe, a frase aparece e o detalhe fica recolhido em <details>", async () => {
    estado.mensagem = {
      tipo: "erro",
      texto: "Erro ao salvar: não foi possível gravar.",
      detalhe: "NotAllowedError: permissão negada",
    };
    await abrirTela();
    expect(screen.getByRole("alert").textContent).toBe("Erro ao salvar: não foi possível gravar.");
    const detalhes = document.querySelector("details");
    expect(detalhes).not.toBeNull();
    expect(detalhes?.open).toBe(false);
    expect(screen.getByText("Detalhe técnico")).toBeTruthy();
    expect(screen.getByText("NotAllowedError: permissão negada")).toBeTruthy();
  });

  it("sem detalhe, não há <details>", async () => {
    estado.mensagem = { tipo: "erro", texto: "Erro ao salvar: falhou." };
    await abrirTela();
    expect(screen.getByRole("alert").textContent).toBe("Erro ao salvar: falhou.");
    expect(document.querySelector("details")).toBeNull();
  });

  it("salvo com sucesso é status e não tem <details>", async () => {
    estado.mensagem = { tipo: "ok", texto: "Salvo em Casa.openstrut.json às 10:00." };
    await abrirTela();
    expect(screen.getByRole("status").textContent).toBe("Salvo em Casa.openstrut.json às 10:00.");
    expect(document.querySelector("details")).toBeNull();
    expect(useObra.getState().obra?.nome).toBe("Casa");
  });
});

// Falha ao exportar DXF na tela da obra: os erros aparecem na caixa de erros e o
// detalhe técnico, quando a exportação traz um, fica recolhido em <details>.
// As funções de DXF são simuladas para devolver a falha (ou null, sucesso).
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abrirObra, itemExportar, obraDuasLajes, renderizarApp } from "../../test-setup";

type Falha = { erros: string[]; detalhe?: string } | null;
const estado = vi.hoisted(() => ({ falha: null as Falha }));

vi.mock("../acoes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../acoes")>();
  return {
    ...real,
    baixarFormasDxf: () => estado.falha,
    baixarArmacaoDxf: () => estado.falha,
  };
});

afterEach(() => {
  estado.falha = null;
});

async function abrirTela() {
  abrirObra(obraDuasLajes("nb1-78", "Casa"));
  const { user } = renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
  return { user };
}

describe("tela da obra: falha ao exportar DXF", () => {
  it("formas com erro: os erros aparecem e o detalhe fica recolhido em <details>", async () => {
    estado.falha = {
      erros: ["Não foi possível gerar o DXF de formas:", "Laje sem contorno fechado."],
      detalhe: "RangeError: contorno com 2 pontos",
    };
    const { user } = await abrirTela();
    await user.click(await itemExportar(user, "DXF de formas"));

    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível gerar o DXF de formas:");
    expect(alerta.textContent).toContain("Laje sem contorno fechado.");
    const detalhes = document.querySelector("details");
    expect(detalhes).not.toBeNull();
    expect(detalhes?.open).toBe(false);
    expect(screen.getByText("Detalhe técnico")).toBeTruthy();
    expect(screen.getByText("RangeError: contorno com 2 pontos")).toBeTruthy();
  });

  it("armação com erro sem detalhe: a lista aparece e não há <details>", async () => {
    estado.falha = { erros: ["Não foi possível gerar o DXF de armação:", "Viga V1 sem aço."] };
    const { user } = await abrirTela();
    await user.click(await itemExportar(user, "DXF de armação"));

    expect(screen.getByRole("alert").textContent).toContain("Viga V1 sem aço.");
    expect(document.querySelector("details")).toBeNull();
  });

  it("exportação bem-sucedida (null) não mostra alerta", async () => {
    estado.falha = null;
    const { user } = await abrirTela();
    await user.click(await itemExportar(user, "DXF de formas"));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("details")).toBeNull();
  });

  it("fechar a caixa de erros remove a falha e o detalhe", async () => {
    estado.falha = {
      erros: ["Não foi possível gerar o DXF de formas:", "Laje sem contorno fechado."],
      detalhe: "RangeError: contorno com 2 pontos",
    };
    const { user } = await abrirTela();
    await user.click(await itemExportar(user, "DXF de formas"));
    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("details")).toBeNull();
  });
});

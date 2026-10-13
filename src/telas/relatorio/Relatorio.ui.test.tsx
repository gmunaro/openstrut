// Relatório: a classe do aço aparece na tabela de materiais só com a NB-1/78.
// Renderizado sem cálculo (a tabela de materiais vem da obra), sem o detalhamento.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClasseAco, NormaId } from "../../dominio/obra";
import { obraDuasLajes } from "../../test-setup";
import { Relatorio } from "./Relatorio";

function materiaisDoRelatorio(norma: NormaId, classeAco: ClasseAco) {
  const obra = obraDuasLajes(norma);
  render(
    <Relatorio
      obra={{ ...obra, materiais: { ...obra.materiais, classeAco } }}
      calculo={{ tipo: "erro", mensagem: "sem cálculo no teste" }}
    />,
  );
  const h3 = screen.getByRole("heading", { level: 3, name: "Materiais" });
  const tabela = h3.parentElement?.nextElementSibling?.querySelector("table");
  if (!tabela) throw new Error("tabela de materiais não encontrada");
  return within(tabela)
    .getAllByRole("row")
    .map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""));
}

describe("relatório: classe do aço", () => {
  it("NB-1/78 mostra a classe do aço (B)", () => {
    expect(materiaisDoRelatorio("nb1-78", "B")).toContainEqual(["Classe do aço", "B", ""]);
  });

  it("NBR 6118:2023 não mostra a classe", () => {
    const linhas = materiaisDoRelatorio("nbr6118-2023", "A");
    expect(linhas.some((l) => l[0] === "Aço longitudinal")).toBe(true);
    expect(linhas.some((l) => l[0] === "Classe do aço")).toBe(false);
  });
});

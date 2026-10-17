// Relatório: a classe do aço aparece na tabela de materiais só com a NB-1/78.
// Renderizado sem cálculo (a tabela de materiais vem da obra), sem o detalhamento.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClasseAco, NormaId, Obra } from "../../dominio/obra";
import { obraDuasLajes } from "../../test-setup";
import { calcular, type Calculo } from "../calculo";
import { Relatorio } from "./Relatorio";

function linhasMateriais(obra: Obra, calculo: Calculo) {
  render(<Relatorio obra={obra} calculo={calculo} />);
  const h3 = screen.getByRole("heading", { level: 3, name: "Materiais" });
  const tabela = h3.parentElement?.nextElementSibling?.querySelector("table");
  if (!tabela) throw new Error("tabela de materiais não encontrada");
  return within(tabela)
    .getAllByRole("row")
    .map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? ""));
}

function materiaisDoRelatorio(norma: NormaId, classeAco: ClasseAco) {
  const obra = obraDuasLajes(norma);
  return linhasMateriais(
    { ...obra, materiais: { ...obra.materiais, classeAco } },
    { tipo: "erro", mensagem: "sem cálculo no teste" },
  );
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

describe("relatório: fcd e fyd das famílias com γ editado (issue #2)", () => {
  it("γs 1,2 no .DSP e γc 1,54 no .LAP: linhas próprias das vigas e das lajes", () => {
    const base = obraDuasLajes("nb1-78");
    const obra: Obra = {
      ...base,
      modoCalculo: "corrigido",
      parametrosViga: { dsp: { gamaS: 1.2 } },
      parametrosLaje: { gamaC: 1.54 },
    };
    const linhas = linhasMateriais(obra, calcular(obra));
    const rotulos = linhas.map((l) => l[0] ?? "");
    expect(rotulos).toEqual(expect.arrayContaining(["fcd das lajes", "fyd das vigas"]));
    expect(rotulos).not.toContain("fcd dos pilares");
    const fyd = (r: string) => Number(linhas.find((l) => l[0] === r)?.[1]?.replace(",", "."));
    expect(fyd("fyd das vigas") / fyd("fyd")).toBeCloseTo(1.15 / 1.2, 2);
  });

  it("sem γ editado, só as linhas da obra", () => {
    const obra: Obra = { ...obraDuasLajes("nb1-78"), modoCalculo: "corrigido" };
    const rotulos = linhasMateriais(obra, calcular(obra)).map((l) => l[0] ?? "");
    expect(rotulos.filter((r) => r.startsWith("fcd") || r.startsWith("fyd"))).toEqual([
      "fcd",
      "fyd",
    ]);
  });
});

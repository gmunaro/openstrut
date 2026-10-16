// Peças da tabela de resultados: rótulo de cabeçalho numa linha só com a unidade junto,
// rolagem no contêiner focável por teclado e primeira coluna fixa.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Cabecalho, Corpo, Linha, Tabela, Td, Th, TituloBloco } from "./tabela";

function renderTabela() {
  return render(
    <Tabela>
      <Cabecalho>
        <Linha>
          <Th>Pavimento</Th>
          <Th num unidade="m">
            Pé-direito
          </Th>
        </Linha>
      </Cabecalho>
      <Corpo>
        <Linha>
          <Td>Pavimento 1</Td>
          <Td num>3,00</Td>
        </Linha>
      </Corpo>
    </Tabela>,
  );
}

describe("Th", () => {
  it("mantém o rótulo numa linha só (whitespace-nowrap) e põe a unidade embaixo", () => {
    renderTabela();
    expect(screen.getByText("Pé-direito").className).toContain("whitespace-nowrap");
    expect(screen.getByText("m").className).toContain("block");
  });

  it("a primeira coluna fica fixa na rolagem", () => {
    renderTabela();
    expect(screen.getByText("Pavimento").closest("th")?.className).toContain("first:sticky");
  });
});

describe("Tabela", () => {
  it("o contêiner de rolagem é focável por teclado", () => {
    renderTabela();
    expect(screen.getByText("Pé-direito").closest("[tabindex]")?.getAttribute("tabindex")).toBe(
      "0",
    );
  });
});

describe("TituloBloco", () => {
  it("quebra o extra em linha própria em vez de estourar a largura", () => {
    render(<TituloBloco extra={<span>nota</span>}>Vigas</TituloBloco>);
    expect(screen.getByRole("heading", { name: "Vigas" }).parentElement?.className).toContain(
      "flex-wrap",
    );
  });
});

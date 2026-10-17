// Linha de elemento com aviso: a contagem tem de aparecer como texto, não só como `title`.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinhaElemento } from "./memoria";

function renderLinha(avisos: string[]) {
  return render(
    <table>
      <tbody>
        <LinhaElemento nome="P2" avisos={avisos} memoria={[]} colunas={2} comMemoria={false}>
          <td>x</td>
        </LinhaElemento>
      </tbody>
    </table>,
  );
}

describe("LinhaElemento", () => {
  it("mostra a contagem de avisos como texto visível", () => {
    renderLinha(["P2: PILAREDI recusa o pilar.", "A seção não suporta os esforços."]);
    expect(screen.getByText("2 avisos")).toBeTruthy();
  });

  it("o ícone de aviso é decorativo; o texto é que se lê", () => {
    const { container } = renderLinha(["um aviso"]);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("1 aviso")).toBeTruthy();
  });

  it("não mostra contagem quando o elemento não tem aviso", () => {
    renderLinha([]);
    expect(screen.queryByText(/aviso\(s\)/)).toBeNull();
  });
});

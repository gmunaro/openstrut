// Campos isolados da barra de pavimentos: o nome acessível é só o rótulo, o erro
// fica ligado ao campo por aria-describedby e fora do <label>, e some ao corrigir.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampoNumero, CampoTexto } from "./campos";

/** Texto do elemento apontado por aria-describedby do campo, ou null sem descrição. */
function descricaoDo(campo: HTMLElement) {
  const id = campo.getAttribute("aria-describedby");
  return id ? document.getElementById(id)?.textContent : null;
}

describe("CampoTexto", () => {
  it("sem erro, o nome é o rótulo e o campo não tem descrição", () => {
    render(<CampoTexto rotulo="Nome" valor="Térreo" confirmar={() => null} />);
    const campo = screen.getByRole("textbox", { name: "Nome" });
    expect(campo.getAttribute("aria-invalid")).toBe("false");
    expect(campo.getAttribute("aria-describedby")).toBeNull();
  });

  it("com erro, o nome continua 'Nome', o erro está fora do <label> e descreve o campo", async () => {
    const user = userEvent.setup();
    const erro = "Já existe um pavimento com esse nome.";
    render(<CampoTexto rotulo="Nome" valor="Térreo" confirmar={() => erro} />);

    const campo = screen.getByRole("textbox", { name: "Nome" });
    await user.clear(campo);
    await user.type(campo, "Cobertura");
    await user.tab();

    const mesmo = screen.getByRole("textbox", { name: "Nome" });
    expect(mesmo).toBe(campo);
    expect(mesmo.getAttribute("aria-invalid")).toBe("true");
    expect(descricaoDo(mesmo)).toBe(erro);
    expect(mesmo.getAttribute("title")).toBeNull();
    expect(screen.getByText("Nome", { selector: "label" }).textContent).toBe("Nome");
  });

  it("corrigir o nome tira o erro e a descrição", async () => {
    const user = userEvent.setup();
    const confirmar = vi
      .fn<(v: string) => string | null>()
      .mockReturnValueOnce("Já existe um pavimento com esse nome.")
      .mockReturnValueOnce(null);
    render(<CampoTexto rotulo="Nome" valor="Térreo" confirmar={confirmar} />);

    const campo = screen.getByRole("textbox", { name: "Nome" });
    await user.clear(campo);
    await user.type(campo, "Térreo 2{Enter}");
    expect(descricaoDo(campo)).toBe("Já existe um pavimento com esse nome.");

    await user.clear(campo);
    await user.type(campo, "Cobertura{Enter}");
    expect(confirmar).toHaveBeenLastCalledWith("Cobertura");
    expect(campo.getAttribute("aria-invalid")).toBe("false");
    expect(campo.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText("Já existe um pavimento com esse nome.")).toBeNull();
  });
});

describe("CampoNumero", () => {
  it("o rótulo é 'Pé-direito'; a unidade fica fora do nome acessível", () => {
    render(
      <CampoNumero
        rotulo="Pé-direito"
        unidade="m"
        valor={2.85}
        valido={() => true}
        confirmar={() => {}}
      />,
    );
    const campo = screen.getByRole("textbox", { name: "Pé-direito" });
    expect(campo.getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByText("Pé-direito", { selector: "label" }).textContent).toBe("Pé-direito");
    expect(screen.getByText("m")).toBeTruthy();
  });

  it("valor inválido mostra a recusa ligada ao campo, sem gravar", async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn();
    render(
      <CampoNumero
        rotulo="Pé-direito"
        unidade="m"
        valor={2.85}
        valido={(n) => n > 0}
        confirmar={confirmar}
      />,
    );

    const campo = screen.getByRole("textbox", { name: "Pé-direito" });
    await user.clear(campo);
    await user.type(campo, "-1");
    await user.tab();

    expect(confirmar).not.toHaveBeenCalled();
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(descricaoDo(campo)).toBe("Valor fora do aceito neste campo. Confira o limite.");
    expect(screen.getByRole("textbox", { name: "Pé-direito" })).toBe(campo);
    expect(screen.getByText("Pé-direito", { selector: "label" }).textContent).toBe("Pé-direito");
  });

  it("texto que não é número também é inválido", async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn();
    render(
      <CampoNumero rotulo="Pé-direito" valor={2.85} valido={() => true} confirmar={confirmar} />,
    );
    const campo = screen.getByRole("textbox", { name: "Pé-direito" });
    await user.clear(campo);
    await user.type(campo, "abc{Enter}");
    expect(confirmar).not.toHaveBeenCalled();
    expect(descricaoDo(campo)).toBe("Digite um número, com vírgula ou ponto decimal.");
  });

  it("corrigir o valor tira o erro e grava", async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn();
    render(
      <CampoNumero
        rotulo="Pé-direito"
        unidade="m"
        valor={2.85}
        valido={(n) => n > 0}
        confirmar={confirmar}
      />,
    );
    const campo = screen.getByRole("textbox", { name: "Pé-direito" });
    await user.clear(campo);
    await user.type(campo, "-1{Enter}");
    expect(descricaoDo(campo)).toBe("Valor fora do aceito neste campo. Confira o limite.");

    await user.clear(campo);
    await user.type(campo, "3{Enter}");
    expect(confirmar).toHaveBeenCalledWith(3);
    expect(campo.getAttribute("aria-invalid")).toBe("false");
    expect(campo.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText("Valor fora do aceito neste campo. Confira o limite.")).toBeNull();
  });

  it("Esc descarta o texto inválido e volta ao valor atual", async () => {
    const user = userEvent.setup();
    render(
      <CampoNumero rotulo="Pé-direito" valor={2.85} valido={(n) => n > 0} confirmar={() => {}} />,
    );
    const campo = screen.getByRole("textbox", { name: "Pé-direito" });
    await user.clear(campo);
    await user.type(campo, "-1{Enter}");
    expect(campo.getAttribute("aria-invalid")).toBe("true");

    await user.type(campo, "{Escape}");
    expect(campo.getAttribute("aria-invalid")).toBe("false");
    expect(campo.getAttribute("aria-describedby")).toBeNull();
    expect((campo as HTMLInputElement).value).toBe("2,85");
  });
});

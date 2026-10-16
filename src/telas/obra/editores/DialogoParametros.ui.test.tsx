// Diálogo dos parâmetros do SISTRUT: abre pelo botão, grava as opções da rodada e um campo
// do .DSP sem apagar as listas que ele não mostra, liga uma tabela com os valores de fábrica
// e mostra o problema sem fechar.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Obra } from "../../../dominio/obra";
import { useObra } from "../../../estado/obra";
import { abrirObra, obraDuasLajes } from "../../../test-setup";
import { EditorParametros } from "./DialogoParametros";

const ARRANJOS = [
  [{ area: 2, arranjo: "2#10" }],
  [{ area: 3, arranjo: "2#12.5" }],
  [{ area: 5, arranjo: "N#16" }],
];

async function abrir(obra: Obra) {
  abrirObra(obra);
  const atual = useObra.getState().obra;
  if (!atual) throw new Error("obra não abriu");
  const user = userEvent.setup();
  render(<EditorParametros obra={atual} />);
  await user.click(screen.getByRole("button", { name: "Parâmetros" }));
  const dialogo = await screen.findByRole("dialog", { name: "Parâmetros do SISTRUT (NB-1/78)" });
  return { user, dialogo };
}

describe("diálogo dos parâmetros do SISTRUT", () => {
  it("tem as quatro abas", async () => {
    const { dialogo } = await abrir(obraDuasLajes("nb1-78"));
    const abas = within(dialogo)
      .getAllByRole("tab")
      .map((t) => t.textContent);
    expect(abas).toEqual([
      "Rodada",
      "Lajes (.LAP)",
      "Vigas (VIGA.INI e .DSP)",
      "Pilares (PILAR.INI e .PIP)",
    ]);
  });

  it("grava a rodada e o cobrimento do .DSP sem apagar os arranjos", async () => {
    const { user, dialogo } = await abrir({
      ...obraDuasLajes("nb1-78"),
      parametrosViga: { dsp: { arranjosPorIntervalo: ARRANJOS } },
    });
    await user.selectOptions(
      within(dialogo).getByLabelText("Otimização dos negativos"),
      "não roda",
    );
    await user.type(
      within(dialogo).getByLabelText("Variação da armadura ao longo da coluna", { exact: false }),
      "1",
    );
    await user.click(within(dialogo).getByRole("tab", { name: "Vigas (VIGA.INI e .DSP)" }));
    const cobrimento = within(dialogo).getByRole("textbox", { name: /^Cobrimento/ });
    expect(cobrimento.getAttribute("placeholder")).toBe("2");
    expect((cobrimento as HTMLInputElement).value).toBe("");
    await user.type(cobrimento, "3,5");

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const obra = useObra.getState().obra;
    expect(obra?.otimizaNegativos).toBe(false);
    expect(obra?.parametrosPilar).toEqual({ variaArmadura: 1 });
    expect(obra?.parametrosViga).toEqual({
      dsp: {
        cobrimento: 3.5,
        arranjosPorIntervalo: [
          [{ area: 2, arranjo: "2#10" }],
          [{ area: 3, arranjo: "2#12.5" }],
          [{ area: 5, arranjo: "N#16" }],
        ],
      },
    });
  });

  it("ligar uma tabela mostra a de fábrica e grava a linha editada", async () => {
    const { user, dialogo } = await abrir(obraDuasLajes("nb1-78"));
    await user.click(within(dialogo).getByRole("tab", { name: "Lajes (.LAP)" }));
    await user.click(within(dialogo).getByRole("checkbox", { name: "Editar bitolas (.LAP)" }));
    const area0 = within(dialogo).getByRole("textbox", { name: "Bitola 0, Área (0 desativa)" });
    expect((area0 as HTMLInputElement).value).toBe("0");
    await user.clear(area0);
    await user.type(area0, "0,125");

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const bitolas = useObra.getState().obra?.parametrosLaje?.bitolas;
    expect(bitolas).toHaveLength(10);
    expect(bitolas?.[0]).toEqual({ bitola: 4, area: 0.125 });
    expect(bitolas?.[9]).toEqual({ bitola: 25, area: 5 });
  });

  it("com problema, mostra a mensagem e não fecha nem grava", async () => {
    const { user, dialogo } = await abrir(obraDuasLajes("nb1-78"));
    const antes = useObra.getState().obra;
    await user.click(within(dialogo).getByRole("tab", { name: "Pilares (PILAR.INI e .PIP)" }));
    await user.type(
      within(dialogo).getByRole("textbox", { name: /^Número máximo de barras numa seção/ }),
      "10,5",
    );
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta.textContent).toContain(
      "PILAR.INI, Número máximo de barras numa seção: informe um número inteiro.",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(useObra.getState().obra).toBe(antes);
  });
});

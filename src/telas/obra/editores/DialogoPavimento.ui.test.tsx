// Editor dos dados do pavimento do SISTRUT: o botão abre o diálogo, as abas editam as
// listas e o Aplicar grava (ou mostra os problemas, sem gravar).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Obra } from "../../../dominio/obra";
import { useObra } from "../../../estado/obra";
import { abrirObra, obraDuasLajes } from "../../../test-setup";
import { EditorPavimento, resumoPavimento } from "./DialogoPavimento";

const pavDe = () => {
  const p = useObra.getState().obra?.pavimentos[0];
  if (!p) throw new Error("obra sem pavimento");
  return p;
};

async function abrir(obra: Obra = obraDuasLajes("nb1-78", "Casa")) {
  abrirObra(obra);
  const user = userEvent.setup();
  const pav = pavDe();
  render(<EditorPavimento pav={pav} />);
  await user.click(screen.getByRole("button", { name: "Cargas e continuidades do pavimento…" }));
  const dialogo = await screen.findByRole("dialog", {
    name: `Pavimento ${pav.nome}: dados do LAJEGEOM e do LAJECALC`,
  });
  return { user, dialogo, pav };
}

describe("editor do pavimento", () => {
  it("carga de ocupação pelo retângulo da laje: grava o polígono e as cargas", async () => {
    const { user, dialogo, pav } = await abrir();
    const l1 = pav.lajes[0];
    if (!l1) throw new Error("sem laje");
    await user.click(
      within(dialogo).getByRole("button", { name: /Acrescentar carga de ocupação/ }),
    );
    const grupo = within(dialogo).getByRole("group", { name: "Carga de ocupação 1" });
    await user.selectOptions(
      within(grupo).getByRole("combobox", {
        name: "Carga de ocupação 1, laje para preencher os vértices",
      }),
      l1.id,
    );
    await user.click(within(grupo).getByRole("button", { name: "Usar o contorno da laje" }));
    const total = within(grupo).getByRole("textbox", { name: /Total/ });
    await user.type(total, "3,5");
    const acidental = within(grupo).getByRole("textbox", { name: /Acidental/ });
    await user.clear(acidental);
    await user.type(acidental, "4");
    expect(within(grupo).getByText(/A acidental passa do total/)).toBeTruthy();
    await user.clear(acidental);
    await user.type(acidental, "2");

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const { x, y, lx, ly } = l1;
    expect(pavDe().cargasOcupacao).toEqual([
      {
        poligono: [
          { x, y },
          { x, y: y + ly },
          { x: x + lx, y: y + ly },
          { x: x + lx, y },
        ],
        total: 3.5,
        acidental: 2,
      },
    ]);
    expect(resumoPavimento(pavDe())).toBe("1 carga de ocupação");
  });

  it("alvenaria incompleta: mostra o problema e não grava", async () => {
    const { user, dialogo } = await abrir();
    await user.click(within(dialogo).getByRole("tab", { name: "Alvenarias" }));
    await user.click(within(dialogo).getByRole("button", { name: "Acrescentar em Alvenarias" }));
    await user.type(within(dialogo).getByRole("textbox", { name: "Alvenaria 1, Carga" }), "5");
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta.textContent).toContain("Alvenaria 1, início, x: informe um número.");
    expect(pavDe().alvenarias).toBeUndefined();
  });

  it("continuidades: sem laje com polígono, explica e não deixa acrescentar", async () => {
    const { user, dialogo } = await abrir();
    await user.click(within(dialogo).getByRole("tab", { name: "Continuidades" }));
    expect(within(dialogo).getByText(/o polígono se edita no editor da laje/)).toBeTruthy();
    const botao = within(dialogo).getByRole("button", { name: /Acrescentar continuidade/ });
    expect(botao.hasAttribute("disabled")).toBe(true);
  });

  it("continuidade engastada sem vizinha num lado do polígono", async () => {
    const base = obraDuasLajes("nb1-78", "Casa");
    const pav = base.pavimentos[0];
    const l1 = pav?.lajes[0];
    if (!pav || !l1) throw new Error("obra sem laje");
    const { x, y, lx, ly } = l1;
    const comPoligono: Obra = {
      ...base,
      pavimentos: [
        {
          ...pav,
          lajes: pav.lajes.map((l) =>
            l.id === l1.id
              ? {
                  ...l,
                  poligono: [
                    { x, y },
                    { x, y: y + ly },
                    { x: x + lx, y: y + ly },
                    { x: x + lx, y },
                  ],
                }
              : l,
          ),
        },
      ],
    };
    const { user, dialogo } = await abrir(comPoligono);
    await user.click(within(dialogo).getByRole("tab", { name: "Continuidades" }));
    await user.click(within(dialogo).getByRole("button", { name: /Acrescentar continuidade/ }));
    await user.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Continuidade 1, lado A" }),
      "2",
    );
    expect(
      within(dialogo)
        .getByRole("combobox", { name: "Continuidade 1, lado B" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pavDe().continuidadesLajes).toEqual([{ lajeA: l1.id, ladoA: 2 }]);
  });
});

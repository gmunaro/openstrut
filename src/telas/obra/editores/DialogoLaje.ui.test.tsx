// Editor dos dados de laje do SISTRUT: tipo e ângulo, polígono criado do retângulo com
// vínculo por lado, e o polígono anti-horário recusado sem gravar.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useObra } from "../../../estado/obra";
import { abrirObra, obraDuasLajes } from "../../../test-setup";
import { EditorLaje } from "./DialogoLaje";

async function abrirEditor() {
  abrirObra(obraDuasLajes("nb1-78"));
  const pav = useObra.getState().obra?.pavimentos[0];
  const laje = pav?.lajes[0];
  if (!pav || !laje) throw new Error("obra sem laje");
  const user = userEvent.setup();
  render(<EditorLaje pav={pav} laje={laje} />);
  await user.click(screen.getByRole("button", { name: "Dados do SISTRUT da laje…" }));
  const dialogo = await screen.findByRole("dialog", {
    name: `Laje ${laje.nome}: dados do LAJEGEOM, LAJECALC e LAJEPROC`,
  });
  const lajeAtual = () => useObra.getState().obra?.pavimentos[0]?.lajes[0];
  return { user, dialogo, lajeAtual };
}

describe("editor dos dados de laje do SISTRUT", () => {
  it("grava o tipo e a inclinação das nervuras da pré-moldada", async () => {
    const { user, dialogo, lajeAtual } = await abrirEditor();
    await user.selectOptions(within(dialogo).getByLabelText("Tipo"), "pre-moldada");
    await user.type(within(dialogo).getByLabelText(/Inclinação das nervuras/), "30");
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lajeAtual()).toMatchObject({ tipo: "pre-moldada", anguloArmadura: 30 });
  });

  it("cria o polígono do retângulo e grava o vínculo de um lado", async () => {
    const { user, dialogo, lajeAtual } = await abrirEditor();
    await user.click(within(dialogo).getByRole("tab", { name: "Polígono e lados" }));
    await user.click(
      within(dialogo).getByRole("button", { name: "Criar polígono a partir do retângulo" }),
    );
    const tabela = within(dialogo).getByRole("table", { name: "Polígono" });
    expect(within(tabela).getByLabelText("Vértice 3, x")).toHaveProperty("value", "4");
    expect(within(tabela).getByLabelText("Vértice 3, y")).toHaveProperty("value", "5");
    await user.selectOptions(
      within(tabela).getByLabelText("Vértice 2, Vínculo do lado"),
      "engastado",
    );
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(lajeAtual()).toMatchObject({
      poligono: [
        { x: 0, y: 0 },
        { x: 0, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 0 },
      ],
      vinculosLados: [null, "engastado", null, null],
    });
  });

  it("recusa o polígono anti-horário e não grava", async () => {
    const { user, dialogo, lajeAtual } = await abrirEditor();
    await user.click(within(dialogo).getByRole("tab", { name: "Polígono e lados" }));
    await user.click(
      within(dialogo).getByRole("button", { name: "Criar polígono a partir do retângulo" }),
    );
    const tabela = within(dialogo).getByRole("table", { name: "Polígono" });
    // troca os vértices 2 e 4: (0, 0), (4, 0), (4, 5), (0, 5) é anti-horário
    const campo = (r: string) => within(tabela).getByLabelText(r);
    await user.clear(campo("Vértice 2, x"));
    await user.type(campo("Vértice 2, x"), "4");
    await user.clear(campo("Vértice 2, y"));
    await user.type(campo("Vértice 2, y"), "0");
    await user.clear(campo("Vértice 4, x"));
    await user.type(campo("Vértice 4, x"), "0");
    await user.clear(campo("Vértice 4, y"));
    await user.type(campo("Vértice 4, y"), "5");
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    expect(within(dialogo).getByRole("alert").textContent).toContain(
      "Polígono: os vértices estão em sentido anti-horário; o LAJEGEOM só aceita o horário.",
    );
    expect(lajeAtual()?.poligono).toBeUndefined();
  });
});

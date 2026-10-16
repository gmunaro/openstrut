// Diálogo dos dados do SISTRUT do pilar: abre pelo próprio botão, grava no Aplicar numa
// entrada só do desfazer, mostra os problemas sem fechar e não mexe nos outros pilares.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Obra, Pilar } from "../../../dominio/obra";
import { useObra } from "../../../estado/obra";
import { abrirObra, obraDuasLajes } from "../../../test-setup";
import { EditorPilar } from "./DialogoPilar";

const TITULO = (nome: string) => `Pilar ${nome}: dados do PILGEEDI, PILAREDI e PILAR`;

/** Abre a obra de duas lajes, monta o editor do primeiro pilar e abre o diálogo. */
async function abrir() {
  const obra = obraDuasLajes("nb1-78");
  abrirObra(obra);
  const pav = obra.pavimentos[0];
  const pilar = pav?.pilares[0];
  if (!pav || !pilar) throw new Error("obra sem pilar");
  const user = userEvent.setup();
  render(<EditorPilar pav={pav} pilar={pilar} />);
  await user.click(screen.getByRole("button", { name: "Dados do SISTRUT do pilar…" }));
  const dialogo = await screen.findByRole("dialog", { name: TITULO(pilar.nome) });
  return { user, dialogo, obra, pilar };
}

const pilarNaObra = (obra: Obra | null, id: string): Pilar | undefined =>
  obra?.pavimentos[0]?.pilares.find((p) => p.id === id);

describe("editor do pilar", () => {
  it("seção circular: b = h = D, uma entrada no desfazer, os outros pilares intactos", async () => {
    const { user, dialogo, obra, pilar } = await abrir();
    await user.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Tipo da seção" }),
      "circular",
    );
    await user.type(within(dialogo).getByRole("textbox", { name: "Diâmetro D (cm)" }), "30");
    expect(within(dialogo).getByText(/Ao aplicar: b × h = 30,0 cm × 30,0 cm/)).toBeTruthy();

    const passado = useObra.getState().passado.length;
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const estado = useObra.getState();
    expect(estado.passado.length).toBe(passado + 1);
    expect(pilarNaObra(estado.obra, pilar.id)).toEqual({
      ...pilar,
      b: 30,
      h: 30,
      secao: { tipo: "circular", d: 30, dInterno: 0 },
    });
    const outros = (o: Obra | null) => o?.pavimentos[0]?.pilares.filter((p) => p.id !== pilar.id);
    expect(outros(estado.obra)).toEqual(outros(obra));
  });

  it("vínculos e vento na aba de cada um", async () => {
    const { user, dialogo, pilar } = await abrir();
    await user.click(within(dialogo).getByRole("tab", { name: "Vínculos e excentricidade" }));
    await user.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Vínculo na base do lance" }),
      "dado",
    );
    await user.selectOptions(
      within(dialogo).getByRole("combobox", { name: "Vínculo na base do lance, direção x" }),
      "engaste",
    );
    await user.click(within(dialogo).getByRole("tab", { name: "Cargas" }));
    await user.click(within(dialogo).getByRole("checkbox", { name: /Dar o vento/ }));
    const normal = within(dialogo).getByRole("textbox", { name: "Vento, normal (kN)" });
    await user.clear(normal);
    await user.type(normal, "12,5");
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pilarNaObra(useObra.getState().obra, pilar.id)).toEqual({
      ...pilar,
      vinculos: { x: "engaste", y: "continuidade" },
      vento: { normal: 12.5, momentos: [] },
    });
  });

  it("com problema, mostra a mensagem, não fecha e não grava", async () => {
    const { user, dialogo, pilar } = await abrir();
    await user.type(
      within(dialogo).getByRole("textbox", { name: "Rotação (graus, 0 a 360)" }),
      "400",
    );
    const antes = useObra.getState().obra;
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    const alerta = await within(dialogo).findByRole("alert");
    expect(alerta.textContent).toContain("Rotação: informe um ângulo de 0 a 360 graus.");
    expect(screen.getByRole("dialog", { name: TITULO(pilar.nome) })).toBeTruthy();
    expect(useObra.getState().obra).toBe(antes);
  });
});

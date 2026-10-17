// Barra de pavimentos na tela da obra: criar, renomear, pé-direito, repetições,
// mover, copiar planta e apagar (nunca o último), sempre pela interface.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { obraNova } from "../../dominio/criar";
import { useObra } from "../../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";

const obra = () => {
  const o = useObra.getState().obra;
  if (!o) throw new Error("sem obra");
  return o;
};
const nomes = () => obra().pavimentos.map((p) => p.nome);
const ativo = () => obra().pavimentos.find((p) => p.id === useObra.getState().pavimentoId);

async function abrir(o = obraNova("Prédio", "nb1-78")) {
  abrirObra(o);
  const { user } = renderizarApp("/obra");
  const nav = await screen.findByRole("navigation", { name: "Pavimentos" });
  return { user, nav };
}

describe("barra de pavimentos", () => {
  it("cria pavimento acima do ativo e o seleciona", async () => {
    const { user, nav } = await abrir();
    await user.click(within(nav).getByRole("button", { name: "Novo pavimento" }));
    expect(nomes()).toEqual(["Pavimento 2", "Pavimento 1"]);
    expect(ativo()?.nome).toBe("Pavimento 2");
    expect(
      within(nav).getByRole("button", { name: "Pavimento 2" }).getAttribute("aria-current"),
    ).toBe("true");
    // a planta mostrada é a do pavimento novo
    expect(screen.getByText(/Pavimento 2: 0 lajes/)).toBeTruthy();
  });

  it("duplica o pavimento ativo com a planta, seleciona a cópia e desfaz", async () => {
    const { user } = await abrir(obraDuasLajes("nb1-78", "Casa"));
    await user.click(screen.getByRole("button", { name: "Duplicar pavimento" }));
    expect(nomes()).toEqual(["Pavimento 1 (cópia)", "Pavimento 1"]);
    expect(ativo()?.nome).toBe("Pavimento 1 (cópia)");
    expect(ativo()?.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]);
    expect(screen.getByText(/Pavimento 1 \(cópia\): 2 lajes, \d+ vigas, 6 pilares/)).toBeTruthy();
    // desfazer tira a cópia e volta para um pavimento que existe
    await user.keyboard("{Control>}z{/Control}");
    expect(nomes()).toEqual(["Pavimento 1"]);
    expect(ativo()?.nome).toBe("Pavimento 1");
  });

  it("renomeia com Enter e recusa nome repetido ou vazio", async () => {
    const { user, nav } = await abrir();
    await user.click(within(nav).getByRole("button", { name: "Novo pavimento" }));
    const nome = screen.getByLabelText("Nome");
    await user.clear(nome);
    await user.type(nome, "Cobertura{Enter}");
    expect(nomes()).toEqual(["Cobertura", "Pavimento 1"]);
    expect(within(nav).getByRole("button", { name: "Cobertura" })).toBeTruthy();

    await user.clear(nome);
    await user.type(nome, "Pavimento 1{Enter}");
    expect(
      screen.getByText('Já existe um pavimento "Pavimento 1". Escolha outro nome.'),
    ).toBeTruthy();
    expect(nomes()).toEqual(["Cobertura", "Pavimento 1"]);

    await user.clear(nome);
    await user.type(nome, "   {Enter}");
    expect(screen.getByText("Digite um nome para o pavimento.")).toBeTruthy();

    // Esc volta ao nome atual
    await user.keyboard("{Escape}");
    expect((nome as HTMLInputElement).value).toBe("Cobertura");
  });

  it("muda pé-direito e repetições; valor inválido fica marcado e não grava", async () => {
    const { user, nav } = await abrir();
    const rep = screen.getByLabelText("Repetições");
    await user.clear(rep);
    await user.type(rep, "4{Enter}");
    expect(ativo()?.repeticoes).toBe(4);
    expect(within(nav).getByText("×4")).toBeTruthy();

    await user.clear(rep);
    await user.type(rep, "1,5{Enter}");
    expect(rep.getAttribute("aria-invalid")).toBe("true");
    expect(ativo()?.repeticoes).toBe(4);

    const pe = screen.getByLabelText(/Pé-direito/);
    await user.clear(pe);
    await user.type(pe, "2,85{Enter}");
    expect(ativo()?.peDireito).toBe(2.85);
    expect((pe as HTMLInputElement).value).toBe("2,85");
  });

  it("campo com texto inválido não passa para outro pavimento ao trocar o ativo", async () => {
    const { user, nav } = await abrir();
    await user.click(within(nav).getByRole("button", { name: "Novo pavimento" }));
    const pe = screen.getByLabelText(/Pé-direito/);
    await user.clear(pe);
    await user.type(pe, "abc");
    await user.click(within(nav).getByRole("button", { name: "Pavimento 1" }));
    expect(ativo()?.nome).toBe("Pavimento 1");
    // o Pavimento 1 tem pé-direito 3 m: o campo deve mostrar 3,00, não o texto do outro
    const pe1 = screen.getByLabelText(/Pé-direito/) as HTMLInputElement;
    expect(pe1.value).toBe("3,00");
    expect(pe1.getAttribute("aria-invalid")).toBe("false");
  });

  it("move o pavimento para cima e para baixo", async () => {
    const { user, nav } = await abrir();
    await user.click(within(nav).getByRole("button", { name: "Novo pavimento" }));
    expect(screen.getByRole("button", { name: "Subir pavimento" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(screen.getByRole("button", { name: "Descer pavimento" }));
    expect(nomes()).toEqual(["Pavimento 1", "Pavimento 2"]);
    expect(ativo()?.nome).toBe("Pavimento 2");
    expect(screen.getByRole("button", { name: "Descer pavimento" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("apaga só com confirmação e nunca o último pavimento", async () => {
    const { user, nav } = await abrir();
    const apagar = () => screen.getByRole("button", { name: "Apagar pavimento" });
    expect(apagar()).toHaveProperty("disabled", true);

    await user.click(within(nav).getByRole("button", { name: "Novo pavimento" }));
    expect(apagar()).toHaveProperty("disabled", false);

    // Cancelar no diálogo mantém o pavimento e devolve o foco à lixeira
    await user.click(apagar());
    let dialogo = await screen.findByRole("dialog", { name: 'Apagar o pavimento "Pavimento 2"?' });
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(nomes()).toEqual(["Pavimento 2", "Pavimento 1"]);
    expect(document.activeElement).toBe(apagar());

    await user.click(apagar());
    dialogo = await screen.findByRole("dialog", { name: 'Apagar o pavimento "Pavimento 2"?' });
    await user.click(within(dialogo).getByRole("button", { name: "Apagar pavimento" }));
    expect(nomes()).toEqual(["Pavimento 1"]);
    expect(ativo()?.nome).toBe("Pavimento 1");
    expect(apagar()).toHaveProperty("disabled", true);

    // desfazer traz o pavimento de volta
    await user.click(screen.getAllByRole("button", { name: /^Desfazer/ })[0] as HTMLElement);
    expect(nomes()).toEqual(["Pavimento 2", "Pavimento 1"]);
  });

  it("copia a planta de outro pavimento", async () => {
    const { user, nav } = await abrir(obraDuasLajes("nb1-78"));
    await user.click(within(nav).getByRole("button", { name: "Novo pavimento" }));
    expect(ativo()?.lajes).toHaveLength(0);
    await user.click(screen.getByRole("combobox", { name: "Copiar planta de outro pavimento" }));
    await user.click(await screen.findByRole("option", { name: "Pavimento 1" }));
    await waitFor(() => expect(ativo()?.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]));
    const [novo, original] = obra().pavimentos;
    expect(novo?.vigas.length).toBe(original?.vigas.length);
    // ids novos: editar a cópia não mexe no original
    expect(novo?.lajes[0]?.id).not.toBe(original?.lajes[0]?.id);

    // com planta, copiar de novo pergunta antes de substituir
    await user.click(screen.getByRole("combobox", { name: "Copiar planta de outro pavimento" }));
    await user.click(await screen.findByRole("option", { name: "Pavimento 1" }));
    const dialogo = await screen.findByRole("dialog", { name: /^Substituir a planta de/ });
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(obra().pavimentos[0]?.lajes[0]?.id).toBe(novo?.lajes[0]?.id);
  });
});

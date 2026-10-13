// Cabeçalho da tela da obra: salvar e abrir arquivo .sistrut.json (File System
// Access API simulada; sem ela, download), estado "salvo / não salvo" e o diálogo
// de obra e materiais com desfazer.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lerObra, serializarObra } from "../../armazenamento/arquivo";
import { useObra } from "../../estado/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";

/** Arquivo em disco simulado: guarda o que for gravado. */
function arquivoFalso(name: string, conteudo = "") {
  const gravado: string[] = [];
  const handle = {
    name,
    getFile: async () => new File([conteudo], name, { type: "application/json" }),
    createWritable: async () => {
      let texto = "";
      return {
        write: async (t: string) => {
          texto += t;
        },
        close: async () => {
          gravado.push(texto);
        },
      };
    },
  };
  return { handle, gravado };
}

const instalar = (nome: "showSaveFilePicker" | "showOpenFilePicker", f: unknown) =>
  Object.defineProperty(window, nome, { value: f, configurable: true, writable: true });

afterEach(() => {
  Reflect.deleteProperty(window, "showSaveFilePicker");
  Reflect.deleteProperty(window, "showOpenFilePicker");
});

async function abrirTela() {
  abrirObra(obraDuasLajes("nb1-78", "Casa"));
  const { user, router } = renderizarApp("/obra");
  await screen.findByRole("heading", { level: 1, name: "Casa" });
  return { user, router };
}

describe("tela da obra: arquivo", () => {
  it("salva pela File System Access API e regrava no mesmo arquivo sem perguntar de novo", async () => {
    const { user } = await abrirTela();
    expect(screen.getByText(/sem arquivo · alterações não salvas em arquivo/)).toBeTruthy();

    const disco = arquivoFalso("Casa.sistrut.json");
    const seletor = vi.fn(async (_o: { suggestedName?: string }) => disco.handle);
    instalar("showSaveFilePicker", seletor);

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/^Salvo em Casa\.sistrut\.json às/)).toBeTruthy();
    expect(seletor).toHaveBeenCalledOnce();
    expect(seletor.mock.calls[0]?.[0]?.suggestedName).toBe("Casa.sistrut.json");
    expect(screen.getByText("Casa.sistrut.json · salvo")).toBeTruthy();
    // o arquivo gravado reabre igual à obra da tela
    const lida = lerObra(disco.gravado[0] ?? "");
    expect(lida.ok && lida.obra).toEqual(useObra.getState().obra);

    // edição: volta a "não salvo"; salvar de novo grava no mesmo handle
    await user.click(screen.getByRole("button", { name: "Novo pavimento" }));
    expect(screen.getByText(/alterações não salvas em arquivo/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(disco.gravado).toHaveLength(2));
    expect(seletor).toHaveBeenCalledOnce();
    expect(screen.getByText("Casa.sistrut.json · salvo")).toBeTruthy();
  });

  it("cancelar o seletor de salvar não muda nada nem mostra erro", async () => {
    const { user } = await abrirTela();
    instalar("showSaveFilePicker", async () => {
      throw new DOMException("cancelado", "AbortError");
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.queryByText(/Salvo em|Erro ao salvar/)).toBeNull();
    expect(screen.getByText(/sem arquivo/)).toBeTruthy();
  });

  it("sem a API, salvar baixa o arquivo", async () => {
    const { user } = await abrirTela();
    const criarUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:obra");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/^Casa\.sistrut\.json baixado às/)).toBeTruthy();
    expect(clique).toHaveBeenCalledOnce();
    const blob = criarUrl.mock.calls[0]?.[0];
    expect(blob instanceof Blob && (await blob.text())).toBe(
      serializarObra(useObra.getState().obra ?? obraDuasLajes("nb1-78")),
    );
  });

  it("exportar DXF (formas) baixa a planta de formas da obra", async () => {
    const { user } = await abrirTela();
    const criarUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:dxf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const baixados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      baixados.push(this.download);
    });
    await user.click(screen.getByRole("button", { name: /Exportar DXF \(formas\)/ }));
    expect(baixados).toEqual(["Casa - formas.dxf"]);
    const blob = criarUrl.mock.calls[0]?.[0];
    const texto = blob instanceof Blob ? await blob.text() : "";
    expect(texto.startsWith("  0\r\nSECTION\r\n  2\r\nHEADER\r\n")).toBe(true);
    expect(texto.endsWith("  0\r\nEOF\r\n")).toBe(true);
    expect(texto).toContain("L1 h=10");
    // exportar não salva a obra nem muda o estado do arquivo
    expect(screen.getByText(/sem arquivo/)).toBeTruthy();
  });

  it("exportar DXF (armação) baixa a armação das vigas", async () => {
    const { user } = await abrirTela();
    const criarUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:dxf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const baixados: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      baixados.push(this.download);
    });
    await user.click(screen.getByRole("button", { name: /Exportar DXF \(armação\)/ }));
    expect(baixados).toEqual(["Casa - armação.dxf"]);
    const blob = criarUrl.mock.calls[0]?.[0];
    const texto = blob instanceof Blob ? await blob.text() : "";
    expect(texto.startsWith("  0\r\nSECTION\r\n  2\r\nHEADER\r\n")).toBe(true);
    expect(texto.endsWith("  0\r\nEOF\r\n")).toBe(true);
    expect(texto).toContain("VIGA V1 - ");
    expect(texto).toMatch(/\r\nN1 \d+\\U\+03C6[\d,]+ c=\d+\r\n/);
    expect(screen.getByText(/sem arquivo/)).toBeTruthy();
  });

  it("abre um arquivo pela tela inicial e vai para a obra", async () => {
    const obra = obraDuasLajes("nbr6118-2023", "Edifício lido");
    const disco = arquivoFalso("lido.sistrut.json", serializarObra(obra));
    instalar("showOpenFilePicker", async () => [disco.handle]);
    const { user, router } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: /Abrir arquivo/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    expect(useObra.getState().obra).toEqual(obra);
    expect(await screen.findByText("lido.sistrut.json · salvo")).toBeTruthy();
  });

  it("arquivo inválido mostra os erros e fica na tela inicial", async () => {
    const disco = arquivoFalso("ruim.sistrut.json", '{"versao": 1, "nome": 3}');
    instalar("showOpenFilePicker", async () => [disco.handle]);
    const { user, router } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: /Abrir arquivo/ }));
    expect(await screen.findByText(/Não foi possível abrir ruim\.sistrut\.json/)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
    expect(useObra.getState().obra).toBeNull();
  });
});

describe("tela da obra: materiais", () => {
  it("altera fck e nome, recusa valor inválido e desfaz", async () => {
    const { user } = await abrirTela();
    await user.click(screen.getByRole("button", { name: /Materiais/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Obra e materiais" });

    const fck = within(dialogo).getByLabelText(/^fck/);
    expect((fck as HTMLInputElement).value).toBe("15,0");
    await user.clear(fck);
    await user.type(fck, "0");
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    expect(within(dialogo).getByRole("alert").textContent).toContain(
      "fck: informe um número maior que zero.",
    );
    expect(useObra.getState().obra?.materiais.fck).toBe(15);

    await user.clear(fck);
    await user.type(fck, "20");
    const nome = within(dialogo).getByLabelText("Nome da obra");
    await user.clear(nome);
    await user.type(nome, "Casa nova");
    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useObra.getState().obra?.materiais.fck).toBe(20);
    expect(screen.getByRole("heading", { level: 1, name: "Casa nova" })).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: /^Desfazer/ })[0] as HTMLElement);
    expect(useObra.getState().obra?.materiais.fck).toBe(15);
    expect(screen.getByRole("heading", { level: 1, name: "Casa" })).toBeTruthy();
  });

  it("cancelar descarta o que foi digitado", async () => {
    const { user } = await abrirTela();
    await user.click(screen.getByRole("button", { name: /Materiais/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Obra e materiais" });
    const fck = within(dialogo).getByLabelText(/^fck/);
    await user.clear(fck);
    await user.type(fck, "40");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(useObra.getState().obra?.materiais.fck).toBe(15);

    // reabrir mostra o valor da obra, não o digitado antes
    await user.click(screen.getByRole("button", { name: /Materiais/ }));
    const de_novo = await screen.findByRole("dialog", { name: "Obra e materiais" });
    expect((within(de_novo).getByLabelText(/^fck/) as HTMLInputElement).value).toBe("15,0");
  });
});

describe("tela da obra: classe do aço", () => {
  it("só aparece com a NB-1/78 e grava a classe B", async () => {
    const { user } = await abrirTela();
    await user.click(screen.getByRole("button", { name: /Materiais/ }));
    const dialogo = await screen.findByRole("dialog", { name: "Obra e materiais" });
    const classe = within(dialogo).getByRole("combobox", { name: "Classe do aço" });
    expect(classe.textContent).toContain("A (laminado a quente)");
    await user.click(classe);
    await user.click(await screen.findByRole("option", { name: "B (encruado a frio)" }));

    // com a NBR 6118:2023 o campo some (a norma não tem classes de aço)
    await user.click(within(dialogo).getByRole("combobox", { name: "Norma" }));
    await user.click(await screen.findByRole("option", { name: "NBR 6118:2023" }));
    expect(within(dialogo).queryByRole("combobox", { name: "Classe do aço" })).toBeNull();
    await user.click(within(dialogo).getByRole("combobox", { name: "Norma" }));
    await user.click(await screen.findByRole("option", { name: /^NB-1/ }));

    await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useObra.getState().obra?.materiais.classeAco).toBe("B");
  });
});

describe("tela da obra: sem obra aberta", () => {
  it("/obra sem obra mostra o aviso e o link para o início", async () => {
    const { user, router } = renderizarApp("/obra");
    expect(await screen.findByRole("heading", { name: "Nenhuma obra aberta" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /Ir para o início/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

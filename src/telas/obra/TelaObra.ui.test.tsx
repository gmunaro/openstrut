// Cabeçalho da tela da obra: salvar e abrir arquivo .openstrut.json (File System
// Access API simulada; sem ela, download), estado "salvo / não salvo" e o diálogo
// de obra e materiais com desfazer.
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lerObra, serializarObra } from "../../armazenamento/arquivo";
import { obraNova } from "../../dominio/criar";
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

    const disco = arquivoFalso("Casa.openstrut.json");
    const seletor = vi.fn(async (_o: { suggestedName?: string }) => disco.handle);
    instalar("showSaveFilePicker", seletor);

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/^Salvo em Casa\.openstrut\.json às/)).toBeTruthy();
    expect(seletor).toHaveBeenCalledOnce();
    expect(seletor.mock.calls[0]?.[0]?.suggestedName).toBe("Casa.openstrut.json");
    expect(screen.getByText("Casa.openstrut.json · salvo")).toBeTruthy();
    // o arquivo gravado reabre igual à obra da tela
    const lida = lerObra(disco.gravado[0] ?? "");
    expect(lida.ok && lida.obra).toEqual(useObra.getState().obra);

    // edição: volta a "não salvo"; salvar de novo grava no mesmo handle
    await user.click(screen.getByRole("button", { name: "Novo pavimento" }));
    expect(screen.getByText(/alterações não salvas em arquivo/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(disco.gravado).toHaveLength(2));
    expect(seletor).toHaveBeenCalledOnce();
    expect(screen.getByText("Casa.openstrut.json · salvo")).toBeTruthy();
  });

  it("cancelar o seletor de salvar não muda nada nem mostra erro", async () => {
    const { user } = await abrirTela();
    instalar("showSaveFilePicker", async () => {
      throw new DOMException("cancelado", "AbortError");
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.queryByText(/Salvo em|Não foi possível salvar/)).toBeNull();
    expect(screen.getByText(/sem arquivo/)).toBeTruthy();
  });

  it("sem a API, salvar baixa o arquivo", async () => {
    const { user } = await abrirTela();
    const criarUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:obra");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/^Casa\.openstrut\.json baixado às/)).toBeTruthy();
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
    // o gerador de DXF carrega sob demanda (import dinâmico): o download vem depois
    await waitFor(() => expect(baixados).toEqual(["Casa - formas.dxf"]));
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
    await waitFor(() => expect(baixados).toEqual(["Casa - armação.dxf"]));
    const blob = criarUrl.mock.calls[0]?.[0];
    const texto = blob instanceof Blob ? await blob.text() : "";
    expect(texto.startsWith("  0\r\nSECTION\r\n  2\r\nHEADER\r\n")).toBe(true);
    expect(texto.endsWith("  0\r\nEOF\r\n")).toBe(true);
    expect(texto).toContain("VIGA V1 - ");
    expect(texto).toMatch(/\r\nN1 \d+\\U\+03C6[\d,]+ c=\d+\r\n/);
    expect(screen.getByText(/sem arquivo/)).toBeTruthy();
  });

  // o .sistrut.json é o nome de antes do renome para OpenStrut: abre igual
  it.each(["lido.openstrut.json", "lido.sistrut.json"])(
    "abre %s pela tela inicial e vai para a obra",
    async (nome) => {
      const obra = obraDuasLajes("nbr6118-2023", "Edifício lido");
      const disco = arquivoFalso(nome, serializarObra(obra));
      instalar("showOpenFilePicker", async () => [disco.handle]);
      const { user, router } = renderizarApp("/");
      await user.click(await screen.findByRole("button", { name: /Abrir arquivo/ }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
      expect(useObra.getState().obra).toEqual(obra);
      expect(await screen.findByText(`${nome} · salvo`)).toBeTruthy();
    },
  );

  it("arquivo de versão antiga: avisa a versão de origem e some ao salvar", async () => {
    const obra = obraDuasLajes("nb1-78", "Antiga");
    // a versão 2 não tinha classeAco nem Laje.mu (a migração 2 → 3 põe "A" e 1)
    const v2 = JSON.parse(serializarObra(obra)) as Record<string, unknown> & {
      materiais: Record<string, unknown>;
      pavimentos: { lajes: Record<string, unknown>[] }[];
    };
    v2.versao = 2;
    delete v2.materiais.classeAco;
    for (const p of v2.pavimentos) for (const l of p.lajes) delete l.mu;
    const disco = arquivoFalso("antiga.openstrut.json", JSON.stringify(v2));
    instalar("showOpenFilePicker", async () => [disco.handle]);
    instalar("showSaveFilePicker", async () => disco.handle);
    const { user, router } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: /Abrir arquivo/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    const aviso = await screen.findByText(/era da versão 2 do formato da obra/);
    expect(aviso.closest("[role=status]")?.textContent).toContain(
      "Ao salvar, ele será gravado na versão 3",
    );

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByText(/era da versão 2/)).toBeNull());
    expect(lerObra(disco.gravado.at(-1) ?? "")).toMatchObject({ ok: true, migrada: false });
  });

  it("arquivo inválido mostra os erros e fica na tela inicial", async () => {
    const disco = arquivoFalso("ruim.openstrut.json", '{"versao": 1, "nome": 3}');
    instalar("showOpenFilePicker", async () => [disco.handle]);
    const { user, router } = renderizarApp("/");
    await user.click(await screen.findByRole("button", { name: /Abrir arquivo/ }));
    expect(await screen.findByText(/Não foi possível abrir ruim\.openstrut\.json/)).toBeTruthy();
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

describe("tela da obra: avisos de salvar", () => {
  it("salvo em arquivo é status; falha ao salvar é alert", async () => {
    const { user } = await abrirTela();
    const disco = arquivoFalso("Casa.openstrut.json");
    instalar("showSaveFilePicker", async () => disco.handle);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    const salvo = await screen.findByText(/^Salvo em Casa\.openstrut\.json às/);
    expect(salvo.getAttribute("role")).toBe("status");
  });

  it("falha ao salvar aparece como alert", async () => {
    const { user } = await abrirTela();
    instalar("showSaveFilePicker", async () => {
      throw new Error("disco cheio");
    });
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    const erro = await screen.findByText(/^Não foi possível salvar o arquivo: /);
    expect(erro.getAttribute("role")).toBe("alert");
  });
});

describe("tela da obra: abrir com alterações não salvas", () => {
  it("cancelar o diálogo não abre o seletor; 'Abrir outra' abre", async () => {
    const { user } = await abrirTela();
    const seletor = vi.fn(async () => {
      throw new DOMException("cancelado", "AbortError");
    });
    instalar("showOpenFilePicker", seletor);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const dialogo = await screen.findByRole("dialog", { name: "Abrir outra obra?" });
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(seletor).not.toHaveBeenCalled();
    expect(useObra.getState().obra?.nome).toBe("Casa");

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    const outra = await screen.findByRole("dialog", { name: "Abrir outra obra?" });
    await user.click(within(outra).getByRole("button", { name: "Abrir outra" }));
    await waitFor(() => expect(seletor).toHaveBeenCalledOnce());
  });
});

describe("tela da obra: exportar DXF sem o que exportar", () => {
  it.each([
    ["formas", /Exportar DXF \(formas\)/],
    ["armação", /Exportar DXF \(armação\)/],
  ])(
    "DXF de %s com obra vazia fica com aria-disabled, sem baixar, e mostra o motivo",
    async (_nome, botao) => {
      abrirObra(obraNova("Casa", "nb1-78"));
      const { user } = renderizarApp("/obra");
      await screen.findByRole("heading", { level: 1, name: "Casa" });
      const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const dxf = screen.getByRole("button", { name: botao });
      expect(dxf.getAttribute("aria-disabled")).toBe("true");
      expect(dxf.hasAttribute("disabled")).toBe(false);
      // o motivo está à vista antes do clique e é a descrição acessível do botão
      const descricao = document.getElementById(dxf.getAttribute("aria-describedby") ?? "");
      expect(descricao?.textContent).toMatch(/(Não há|Calcule a obra primeiro)/);
      dxf.focus();
      expect(document.activeElement).toBe(dxf);

      await user.click(dxf);
      expect(clique).not.toHaveBeenCalled();
      const motivo = screen.getByText(/^(Não há|Calcule a obra primeiro)/);
      expect(motivo.getAttribute("role")).toBe("status");
      clique.mockRestore();
    },
  );
});

describe("tela da obra: obra sem elementos", () => {
  it("Resultados e Relatório não dizem 'Nenhum aviso' numa obra vazia", async () => {
    abrirObra(obraNova("Casa", "nb1-78"));
    const { user } = renderizarApp("/obra");
    await screen.findByRole("heading", { level: 1, name: "Casa" });

    await user.click(screen.getByRole("tab", { name: "Resultados" }));
    let painel = screen.getByRole("tabpanel", { name: "Resultados" });
    expect(within(painel).getByRole("status").textContent).toMatch(/ainda não tem elementos/);
    expect(painel.textContent).not.toMatch(/Nenhum aviso/);

    await user.click(screen.getByRole("tab", { name: "Relatório" }));
    painel = screen.getByRole("tabpanel", { name: "Relatório" });
    expect(painel.textContent).toMatch(/ainda não tem elementos/);
    expect(painel.textContent).not.toMatch(/Nenhum aviso/);
  });
});

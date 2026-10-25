// Importação de obra do SISTRUT na tela inicial (ImportarSistrut.tsx) com o app inteiro:
// arquivos escolhidos de uma vez ou soltos na área, o resumo antes de abrir (pavimentos
// na ordem, lidos, ignorados, avisos), abrir e cancelar, e o erro sem obra.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObra } from "../estado/obra";
import { renderizarApp } from "../test-setup";
import { arquivo, PREDIO } from "./__fixtures__/predioSistrut";
import type { ArquivoEntrada } from "./InicioSistrut";

const comoFile = (a: ArquivoEntrada) => new File([a.dados.slice()], a.nome);

describe("importar obra do SISTRUT", () => {
  it("vários arquivos de uma vez: resumo com os pavimentos na ordem, lidos e ignorados; abre a obra", async () => {
    const { router, user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, PREDIO.map(comoFile));

    const dialogo = await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
    const pavimentos = within(dialogo).getByRole("region", { name: "Pavimentos importados" });
    const linhas = within(pavimentos)
      .getAllByRole("row")
      .slice(1)
      .map((l) => within(l).getAllByRole("cell")[0]!.textContent);
    expect(linhas).toEqual(["ESCADA", "TETO", "BASE"]);
    expect(within(pavimentos).getByRole("row", { name: /TETO 3 4/ })).toBeTruthy();
    expect(
      within(within(dialogo).getByRole("region", { name: "Arquivos lidos" })).getByText(
        /TETO\.LAJ/,
      ),
    ).toBeTruthy();
    const ignorados = within(dialogo).getByRole("region", { name: "Arquivos ignorados" });
    expect(within(ignorados).getByText("TETO.BAK")).toBeTruthy();
    expect(within(ignorados).getByText("R5__TETO.EDV")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");

    await user.click(within(dialogo).getByRole("button", { name: "Abrir obra importada" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/obra"));
    expect(useObra.getState().obra?.pavimentos.map((p) => p.nome)).toEqual([
      "ESCADA",
      "TETO",
      "BASE",
    ]);
  });

  it("Cancelar fecha o resumo sem abrir nada", async () => {
    const { router, user } = renderizarApp("/");
    useObra.setState({ obra: null });
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, PREDIO.map(comoFile));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/");
    expect(useObra.getState().obra).toBeNull();
  });

  it("sem .LAJ, .VIG nem .COL: o diálogo diz por quê e não abre nada", async () => {
    const { router, user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, [comoFile(arquivo("E2E.SEC"))]);
    const dialogo = await screen.findByRole("dialog", {
      name: "Não foi possível importar a obra do SISTRUT",
    });
    const alerta = within(dialogo).getByRole("alert");
    expect(within(alerta).getByText(/^Nenhuma obra para abrir/)).toBeTruthy();
    expect(within(alerta).getByText("E2E.SEC: sem E2E.VIG nem E2E.LAJ; ignorado.")).toBeTruthy();
    expect(within(dialogo).queryByRole("button", { name: "Abrir obra importada" })).toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });

  it("arquivos soltos na área de arrastar entram como os escolhidos", async () => {
    renderizarApp("/");
    const area = await screen.findByRole("region", { name: "Soltar arquivos do SISTRUT" });
    fireEvent.drop(area, { dataTransfer: { files: PREDIO.map(comoFile), items: [] } });
    expect(await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" })).toBeTruthy();
  });

  it("a pasta inteira tem um seletor próprio", async () => {
    renderizarApp("/");
    const pasta = await screen.findByLabelText("Pasta da obra do SISTRUT");
    expect(pasta.hasAttribute("webkitdirectory")).toBe(true);
  });
});

describe("importar obra do SISTRUT: pastas, leitura e arquivos repetidos", () => {
  /** File com o caminho relativo que o seletor de pasta dá (webkitRelativePath). */
  const naPasta = (pasta: string, a: ArquivoEntrada) => {
    const f = comoFile(a);
    Object.defineProperty(f, "webkitRelativePath", { value: `${pasta}/${a.nome}` });
    return f;
  };

  it("pasta com duas obras em subpastas: pergunta qual, e só os arquivos dela entram", async () => {
    const { user } = renderizarApp("/");
    const pasta = await screen.findByLabelText("Pasta da obra do SISTRUT");
    await user.upload(pasta, [
      ...PREDIO.map((a) => naPasta("OBRAS/PREDIO", a)),
      naPasta("OBRAS/E2E", arquivo("E2E.LAJ")),
      naPasta("OBRAS/E2E", arquivo("E2E.VIG")),
    ]);
    const escolha = await screen.findByRole("dialog", { name: "Qual obra importar?" });
    const pastas = within(escolha).getByRole("list", { name: "Pastas com arquivos do SISTRUT" });
    expect(
      within(pastas)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["OBRAS/E2E2 arquivos do SISTRUT", "OBRAS/PREDIO11 arquivos do SISTRUT"]);
    await user.click(within(pastas).getByRole("button", { name: /OBRAS\/E2E/ }));
    const resumo = await screen.findByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
    expect(
      within(within(resumo).getByRole("region", { name: "Arquivos lidos" })).getByText(
        "E2E.LAJ, E2E.VIG",
      ),
    ).toBeTruthy();
  });

  it("o que a importação não lê (desenho, plotagem) não vai para a memória", async () => {
    const { user } = renderizarApp("/");
    const dxf = comoFile({ nome: "R1__E2E.DXF", dados: new Uint8Array([1, 2, 3]) });
    let lido = false;
    Object.defineProperty(dxf, "arrayBuffer", {
      value: () => {
        lido = true;
        return Promise.resolve(new ArrayBuffer(0));
      },
    });
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, [comoFile(arquivo("E2E.LAJ")), dxf]);
    const resumo = await screen.findByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
    expect(within(resumo).getByText("R1__E2E.DXF")).toBeTruthy();
    expect(lido).toBe(false);
  });

  it("uma entrada arrastada que não abre vira aviso, e o resto do lote entra", async () => {
    renderizarApp("/");
    const entrada = (a: ArquivoEntrada, falha = false) => ({
      isFile: true,
      isDirectory: false,
      name: a.nome,
      fullPath: `/OBRA/${a.nome}`,
      file: (ok: (f: File) => void, erro: (e: Error) => void) =>
        falha ? erro(new Error("sem permissão")) : ok(comoFile(a)),
    });
    const itens = [
      entrada(arquivo("E2E.LAJ")),
      entrada(arquivo("E2E.VIG")),
      entrada(arquivo("E2E.SEC"), true),
    ].map((e) => ({ webkitGetAsEntry: () => e }));
    const area = await screen.findByRole("region", { name: "Soltar arquivos do SISTRUT" });
    fireEvent.drop(area, { dataTransfer: { items: itens, files: [] } });
    const resumo = await screen.findByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
    expect(
      within(resumo).getByText("OBRA/E2E.SEC: não foi possível ler (Error: sem permissão)."),
    ).toBeTruthy();
  });

  it("dois arquivos com o mesmo nome: recusa e diz de onde vêm", async () => {
    renderizarApp("/");
    const entrada = (pasta: string, a: ArquivoEntrada) => ({
      isFile: true,
      isDirectory: false,
      name: a.nome,
      fullPath: `/${pasta}/${a.nome}`,
      file: (ok: (f: File) => void) => ok(comoFile(a)),
    });
    // soltas como arquivos da mesma pasta (a raiz), com caixas diferentes no nome
    const itens = [
      entrada("", arquivo("E2E.LAJ")),
      entrada("", { ...arquivo("E2E.LAJ"), nome: "e2e.laj" }),
    ].map((e) => ({ webkitGetAsEntry: () => e }));
    const area = await screen.findByRole("region", { name: "Soltar arquivos do SISTRUT" });
    fireEvent.drop(area, { dataTransfer: { items: itens, files: [] } });
    const dialogo = await screen.findByRole("dialog", {
      name: "Não foi possível importar a obra do SISTRUT",
    });
    expect(within(dialogo).getByRole("alert").textContent).toMatch(
      /^Arquivos com o mesmo nome: .*E2E\.LAJ e .*e2e\.laj\. Eles vêm de obras diferentes\?/,
    );
  });
});

describe("importar obra do SISTRUT: a pasta EXEC40 junto com a obra", () => {
  const naPasta = (pasta: string, a: ArquivoEntrada) => {
    const f = comoFile(a);
    Object.defineProperty(f, "webkitRelativePath", { value: `${pasta}/${a.nome}` });
    return f;
  };
  const sistrut = arquivo("SISTRUT.DSP");
  const esc: ArquivoEntrada = {
    nome: "ESC.DSP",
    dados: new TextEncoder().encode(
      new TextDecoder("latin1")
        .decode(sistrut.dados)
        .replace(
          "2.00              COBRIMENTO DA ARMADURA-CM",
          "3.00              COBRIMENTO DA ARMADURA-CM",
        ),
    ),
  };
  const obra = [arquivo("E2E.LAJ"), arquivo("E2E.VIG")].map((a) => naPasta("ALPHA1", a));
  const exec40 = [sistrut, esc].map((a) => naPasta("SISTRUT/EXEC40", a));

  it("a pasta só de parâmetros vai junto; com dois .DSP e nada que diga qual, pergunta", async () => {
    const { user } = renderizarApp("/");
    const pasta = await screen.findByLabelText("Pasta da obra do SISTRUT");
    await user.upload(pasta, [...obra, ...exec40]);
    expect(screen.queryByRole("dialog", { name: "Qual obra importar?" })).toBeNull();
    const pergunta = await screen.findByRole("dialog", {
      name: "Qual parametrização do desenho?",
    });
    const dsps = within(pergunta).getByRole("list", { name: "Arquivos .DSP" });
    expect(
      within(dsps)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["ESC.DSP", "SISTRUT.DSP"]);
    await user.click(within(dsps).getByRole("button", { name: "ESC.DSP" }));
    const resumo = await screen.findByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
    expect(
      within(within(resumo).getByRole("region", { name: "Arquivos lidos" })).getByText(/ESC\.DSP/),
    ).toBeTruthy();
    const ignorados = within(resumo).getByRole("region", { name: "Arquivos ignorados" });
    expect(
      within(ignorados).getByText(/valeu o ESC\.DSP, a escolhida na importação\./),
    ).toBeTruthy();
  });

  it("duas pastas de parâmetros com os mesmos nomes: pergunta qual, e só ela entra", async () => {
    const { user } = renderizarApp("/");
    const pasta = await screen.findByLabelText("Pasta da obra do SISTRUT");
    await user.upload(pasta, [
      ...obra,
      ...exec40,
      naPasta("OUTRA/EXEC40", sistrut),
      naPasta("OUTRA/EXEC40", esc),
    ]);
    const pergunta = await screen.findByRole("dialog", { name: "Quais parâmetros usar?" });
    const pastas = within(pergunta).getByRole("list", { name: "Pastas de parâmetros" });
    expect(
      within(pastas)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["OUTRA/EXEC402 arquivos do SISTRUT", "SISTRUT/EXEC402 arquivos do SISTRUT"]);
    await user.click(within(pastas).getByRole("button", { name: /^SISTRUT\/EXEC40/ }));
    // dois .DSP e nada que diga qual: a pergunta seguinte é a do .DSP
    expect(
      await screen.findByRole("dialog", { name: "Qual parametrização do desenho?" }),
    ).toBeTruthy();
  });

  it("com o DESENHO.INI na EXEC40, vale o .DSP dele, sem perguntar", async () => {
    const { user } = renderizarApp("/");
    const ini: ArquivoEntrada = {
      nome: "DESENHO.INI",
      // as 9 primeiras linhas do DESENHO.INI de fábrica, com a parametrização ESC
      dados: new TextEncoder().encode(
        [
          "ESC=PARAMETRIZACAO UTILIZADA - NOME DO ARQUIVO PARAMETRIZACAO DEFAULT",
          "C:\\=DRIVE E DIRETORIO DEFAULT PARA OS ARQUIVOS DE VIGAS (.VIG .SEC .FOR )",
          "C:\\SISTRUT\\EXEC40\\=DRIVE E DIRETORIO DEFAULT PARA OS ARQUIVOS DE PARAMETRIZACAO (.DSP)",
          "C:\\=DRIVE E DIRETORIO DEFAULT PARA OS ARQUIVOS DE VIGAS EDITADAS (.EDV)",
          "C:\\=DRIVE E DIRETORIO DEFAULT PARA OS ARQUIVOS PADRAO CAD (.DXF ou .PUB)",
          "m=UNIDADE DE MEDIDA LINEAR",
          "t=UNIDADE DE FORCA",
          "1=COEFICIENTE MULTIPLICADOR DA UNIDADE DE MEDIDA PARA TRANSFORMAR EM METROS",
          "1=COEFICIENTE MULTIPLICADOR DA UNIDADE DE FORCA PARA TRANSFORMAR EM TONELADAS",
        ].join("\r\n"),
      ),
    };
    const pasta = await screen.findByLabelText("Pasta da obra do SISTRUT");
    await user.upload(pasta, [...obra, ...exec40, naPasta("SISTRUT/EXEC40", ini)]);
    const resumo = await screen.findByRole("dialog", { name: "Obra E2E lida do SISTRUT" });
    const ignorados = within(resumo).getByRole("region", { name: "Arquivos ignorados" });
    expect(
      within(ignorados).getByText(
        /valeu o ESC\.DSP, a parametrização padrão da linha 1 do DESENHO\.INI\./,
      ),
    ).toBeTruthy();
  });
});

// Relato automático (components/relato/automatico.ts) com o relay do build simulado.
describe("importar obra do SISTRUT: relato automático do erro", () => {
  const fetchFalso = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubEnv("VITE_RELATO_URL", "https://relay.test/relato");
    vi.stubEnv("VITE_TURNSTILE_SITEKEY", "");
    localStorage.clear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    fetchFalso.mockReset();
    fetchFalso.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, numero: 12, url: "https://x/12" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchFalso);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a importação com erro manda o relato com os arquivos e diz o número", async () => {
    const { user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, [comoFile(arquivo("E2E.SEC"))]);
    const dialogo = await screen.findByRole("dialog", {
      name: "Não foi possível importar a obra do SISTRUT",
    });
    expect(
      await within(dialogo).findByText(
        "Enviamos um relato automático deste erro ao desenvolvedor (nº 12), com os arquivos da obra.",
      ),
    ).toBeTruthy();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://relay.test/relato");
    const corpo = JSON.parse(String(init?.body)) as {
      titulo: string;
      obra: { nome: string; json: string };
    };
    expect(corpo.titulo).toMatch(/^Importação do SISTRUT \(importação\): Nenhuma obra para abrir/);
    expect(corpo.obra.nome).toBe("arquivos-sistrut.json");
    expect(JSON.parse(corpo.obra.json).arquivos[0].nome).toBe("E2E.SEC");
    const chave = within(dialogo).getByRole("switch", { name: /Enviar relato automático/ });
    expect(chave.getAttribute("aria-checked")).toBe("true");
  });

  it("com a opção desligada, nada sai", async () => {
    localStorage.setItem("openstrut.relatoAutomatico", "nao");
    const { user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, [comoFile(arquivo("E2E.SEC"))]);
    const dialogo = await screen.findByRole("dialog");
    const chave = within(dialogo).getByRole("switch", { name: /Enviar relato automático/ });
    expect(chave.getAttribute("aria-checked")).toBe("false");
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("obra que importa e calcula sem erro: nenhum relato", async () => {
    const { user } = renderizarApp("/");
    const entrada = await screen.findByLabelText("Arquivos do SISTRUT (.LAJ, .VIG, .COL e demais)");
    await user.upload(entrada, PREDIO.map(comoFile));
    await screen.findByRole("dialog", { name: "Obra PREDIO lida do SISTRUT" });
    await new Promise((r) => setTimeout(r, 200));
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

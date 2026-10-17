// Abas Resultados e Relatório da tela da obra, com uma obra de duas lajes 4 × 5 m
// calculada por cada norma: tabelas com números finitos e unidades, troca SI ↔ tf,
// memória de cálculo que expande, o detalhamento (vigas, lajes, pilares) com
// as tabelas de aço e o relatório com a frase de conferência.
import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KN_POR_TF } from "../../calculo/unidades";
import { lajeNova, obraNova } from "../../dominio/criar";
import { gerarEstrutura } from "../../dominio/gerar";
import type { NormaId } from "../../dominio/obra";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";
import { AVISO_CONFERENCIA, NOME_NORMA } from "../calculo";

const NUMERO = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;
const lerNumeroBr = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

async function abrirAba(norma: NormaId, aba: "Resultados" | "Relatório") {
  abrirObra(obraDuasLajes(norma));
  const { user } = renderizarApp("/obra");
  await user.click(await screen.findByRole("tab", { name: aba }));
  const painel = await screen.findByRole("tabpanel", { name: aba });
  return { user, painel };
}

/** A tabela logo depois do título de bloco `titulo` (h3). */
function tabelaApos(painel: HTMLElement, titulo: string) {
  const h3 = within(painel).getByRole("heading", { level: 3, name: titulo });
  const tabela = h3.parentElement?.nextElementSibling?.querySelector("table");
  if (!tabela) throw new Error(`tabela de "${titulo}" não encontrada`);
  return tabela;
}

/** Células (texto) da linha da tabela cuja primeira célula contém `nome`. */
function linha(tabela: HTMLElement, nome: string) {
  const tr = within(tabela)
    .getAllByRole("row")
    .find((r) => r.querySelector("td")?.textContent?.includes(nome));
  if (!tr) throw new Error(`linha ${nome} não encontrada`);
  return [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim() ?? "");
}

/** Muda as unidades de exibição pelo diálogo do cabeçalho. */
async function escolherUnidades(user: UserEvent, opcao: "SI" | "Técnicas (tf)") {
  await user.click(screen.getByRole("button", { name: /Unidades/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Unidades" });
  await user.click(within(dialogo).getByRole("radio", { name: (n) => n.startsWith(opcao) }));
  // o "Fechar" do rodapé (o X do canto tem o mesmo nome acessível)
  const fechar = within(dialogo).getAllByRole("button", { name: "Fechar" });
  await user.click(fechar.find((b) => b.textContent === "Fechar") as HTMLElement);
  expect(screen.queryByRole("dialog")).toBeNull();
}

describe.each<NormaId>(["nb1-78", "nbr6118-2023"])("resultados pela %s", (norma) => {
  it("mostra lajes, vigas, equilíbrio e pilares com números finitos e unidades", async () => {
    const { painel } = await abrirAba(norma, "Resultados");
    expect(within(painel).getByText(/^Calculado pela/).textContent).toContain(NOME_NORMA[norma]);
    expect(painel.textContent).not.toMatch(/NaN|Infinity|undefined/);

    const esforcos = tabelaApos(painel, "Lajes: esforços");
    expect(esforcos.querySelector("thead")?.textContent).toContain("kN·m/m");
    expect(esforcos.querySelector("thead")?.textContent).toContain("kN/m²");
    for (const nome of ["L1", "L2"]) {
      const c = linha(esforcos, nome);
      expect(c.slice(1, 3)).toEqual(["4,00", "5,00"]);
      // mx e my: positivos e finitos
      for (const v of [c[7], c[8]]) {
        expect(v).toMatch(NUMERO);
        expect(lerNumeroBr(v ?? "")).toBeGreaterThan(0);
      }
    }
    // as duas lajes engastam no bordo comum (direito de L1, esquerdo de L2)
    expect(linha(esforcos, "L1")[6]).toBe("A A E A");
    expect(linha(esforcos, "L2")[6]).toBe("E A A A");

    const armaduras = tabelaApos(painel, "Lajes: armaduras");
    expect(linha(armaduras, "L1")[1]).toMatch(NUMERO);
    expect(linha(armaduras, "L1")[2]).toMatch(/^φ[\d,]+ c\/[\d,]+$/);

    const equilibrio = tabelaApos(painel, "Equilíbrio");
    expect(linha(equilibrio, "Σ").at(-1)).toBe("ok");

    const pilares = tabelaApos(painel, "Pilares por nível");
    expect(pilares.querySelector("thead")?.textContent).toContain("kN");
    expect(within(pilares).getAllByRole("row").length).toBeGreaterThan(6);
  });

  it("detalhamento por viga (posições e esquema) e a tabela de aço das vigas", async () => {
    const { painel } = await abrirAba(norma, "Resultados");
    // 2 lajes geram 5 vigas: 2 horizontais (y = 0 e 5) e 3 verticais (x = 0, 4, 8)
    const blocos = within(painel).getAllByRole("region", { name: /^Detalhamento V\d+$/ });
    expect(blocos).toHaveLength(5);
    for (const bloco of blocos) {
      const tabela = bloco.querySelector("table");
      if (!tabela) throw new Error("bloco sem tabela de posições");
      expect(tabela.querySelector("thead")?.textContent).toMatch(
        /φ.*mm.*Quant.*Comprimento.*cm.*Tipo/,
      );
      const linhas = [...tabela.querySelectorAll("tbody tr")];
      expect(linhas.length).toBeGreaterThanOrEqual(3);
      for (const tr of linhas) {
        const [n, phi, qtd, comp, tipo] = [...tr.querySelectorAll("td")].map(
          (td) => td.textContent ?? "",
        );
        expect(n).toMatch(/^N\d+$/);
        for (const v of [phi, qtd, comp]) {
          expect(v).toMatch(NUMERO);
          expect(lerNumeroBr(v ?? "")).toBeGreaterThan(0);
        }
        expect(tipo).toMatch(/^(positiva|negativa|porta-estribos|construtiva|estribo c\/[\d,]+)$/);
      }
      // esquema: uma barra (path) por posição longitudinal, com o rótulo "N1 2φ10 c=…"
      const svg = within(bloco).getByRole("img", {
        name: /^Esquema das barras de V\d+, cotas em cm$/,
      });
      // estribos não viram path (só tracinhos); "porta-estribos" é barra longitudinal
      const longitudinais = linhas.filter(
        (tr) => !tr.querySelector("td:last-child")?.textContent?.startsWith("estribo"),
      ).length;
      expect(svg.querySelectorAll("path")).toHaveLength(longitudinais);
      expect(svg.textContent).toMatch(/N1 \d+φ[\d,]+ c=\d+/);
      expect(svg.outerHTML).not.toMatch(/NaN|Infinity|undefined/);
    }

    const aco = tabelaApos(painel, "Tabela de aço (vigas)");
    const linhasAco = within(aco).getAllByRole("row").slice(1);
    expect(linhasAco.length).toBeGreaterThanOrEqual(4);
    const total = linha(aco, "Total com perda");
    const semPerda = lerNumeroBr(linha(aco, "Total sem perda").at(-1) ?? "");
    expect(semPerda).toBeGreaterThan(0);
    // perda padrão de 10 %, com a massa exibida em 1 casa
    expect(Math.abs(lerNumeroBr(total.at(-1) ?? "") - 1.1 * semPerda)).toBeLessThanOrEqual(0.11);
  });

  it("detalhamento por laje e por pilar, e as tabelas de aço da obra e por origem", async () => {
    const { painel } = await abrirAba(norma, "Resultados");
    /** Linhas de posição (N1, N2…) de um bloco, com φ, quantidade e comprimento finitos e > 0. */
    const conferePosicoes = (bloco: HTMLElement) => {
      const tabela = bloco.querySelector("table");
      if (!tabela) throw new Error("bloco sem tabela de posições");
      expect(tabela.querySelector("thead")?.textContent).toMatch(
        /φ.*mm.*Quant.*Comprimento.*cm.*Tipo/,
      );
      const linhas = [...tabela.querySelectorAll("tbody tr")].filter((tr) =>
        /^N\d+$/.test(tr.querySelector("td")?.textContent ?? ""),
      );
      for (const tr of linhas) {
        const [, phi, qtd, comp] = [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "");
        for (const v of [phi, qtd, comp]) {
          expect(v).toMatch(NUMERO);
          expect(lerNumeroBr(v ?? "")).toBeGreaterThan(0);
        }
      }
      expect(bloco.textContent).not.toMatch(/NaN|Infinity|undefined/);
      return linhas;
    };

    const lajes = within(painel).getAllByRole("region", { name: /^Detalhamento L\d+$/ });
    expect(lajes).toHaveLength(2);
    for (const bloco of lajes) {
      const linhas = conferePosicoes(bloco);
      // positivas nas duas direções, no mínimo
      expect(linhas.length).toBeGreaterThanOrEqual(2);
      expect(bloco.querySelector("thead")?.textContent).toMatch(/Direção.*Bordo/);
    }

    // 6 pilares, cada um com o lance do pavimento único: título do lance e posições
    const pilares = within(painel).getAllByRole("region", { name: /^Detalhamento P\d+$/ });
    expect(pilares).toHaveLength(6);
    for (const bloco of pilares) {
      const linhas = conferePosicoes(bloco);
      expect(linhas.length).toBeGreaterThanOrEqual(2);
      expect(bloco.textContent).toMatch(/Lance 1: Pavimento 1 · pé-direito 300 cm/);
      expect(bloco.textContent).toMatch(/sem traspasse/);
      expect(bloco.textContent).toMatch(/grampos/);
    }

    const total = (titulo: string) =>
      lerNumeroBr(linha(tabelaApos(painel, titulo), "Total sem perda").at(-1) ?? "");
    const obra = total("Tabela de aço (obra)");
    const origens = ["vigas", "lajes", "pilares"].map((o) => total(`Tabela de aço (${o})`));
    for (const m of origens) expect(m).toBeGreaterThan(0);
    // massas exibidas com 1 casa: tolerância de meio décimo em cada
    expect(Math.abs(obra - origens.reduce((s, m) => s + m, 0))).toBeLessThanOrEqual(0.2);
  });

  it("alterna SI ↔ tf: unidade e valores convertidos (1 tf = 9,80665 kN)", async () => {
    const { user, painel } = await abrirAba(norma, "Resultados");
    const mxSi = lerNumeroBr(linha(tabelaApos(painel, "Lajes: esforços"), "L1")[7] ?? "");

    await escolherUnidades(user, "Técnicas (tf)");
    const tf = tabelaApos(painel, "Lajes: esforços");
    expect(tf.querySelector("thead")?.textContent).toContain("tf·m/m");
    expect(tf.querySelector("thead")?.textContent).not.toContain("kN");
    const mxTf = lerNumeroBr(linha(tf, "L1")[7] ?? "");
    // valores exibidos com 2 casas: tolerância de meio centésimo em cada
    expect(Math.abs(mxTf - mxSi / KN_POR_TF)).toBeLessThanOrEqual(0.005 + 0.005 / KN_POR_TF);
    // lx em m não muda
    expect(linha(tf, "L1")[1]).toBe("4,00");
    expect(screen.getAllByText("tf").length).toBeGreaterThan(0);

    await escolherUnidades(user, "SI");
    expect(lerNumeroBr(linha(tabelaApos(painel, "Lajes: esforços"), "L1")[7] ?? "")).toBe(mxSi);
  });

  it("a memória de cálculo da laje expande com etapas, fórmulas e referências", async () => {
    const { user, painel } = await abrirAba(norma, "Resultados");
    const esforcos = tabelaApos(painel, "Lajes: esforços");
    const tr = within(esforcos)
      .getAllByRole("row")
      .find((r) => r.querySelector("td")?.textContent?.includes("L1"));
    const abrir = within(tr as HTMLElement).getByRole("button", {
      name: "Abrir memória de cálculo",
    });
    await user.click(abrir);
    expect(abrir.getAttribute("aria-expanded")).toBe("true");

    const memoria = tr?.nextElementSibling as HTMLElement;
    expect(within(memoria).getByText("Esforços")).toBeTruthy();
    expect(within(memoria).getByText("Armaduras")).toBeTruthy();
    const linhasMemoria = within(memoria).getAllByRole("row").slice(1);
    expect(linhasMemoria.length).toBeGreaterThan(3);
    expect(memoria.textContent).not.toMatch(/NaN|Infinity/);
    // alguma etapa cita a fonte: item ou tabela da norma, ou a linha do SISTRUT original
    // (NB-1/78 pelo caminho do SISTRUT: "LAJECALC.BAS:8408")
    expect(memoria.textContent).toMatch(/NB-1|NBR|item|tab|Czerny|Bares|charneira|\.BAS:\d+/i);

    await user.click(
      within(tr as HTMLElement).getByRole("button", { name: "Fechar memória de cálculo" }),
    );
    expect(tr?.nextElementSibling?.textContent).not.toContain("Esforços");
  });

  it("relatório tem a frase de conferência, materiais, pavimentos e as tabelas", async () => {
    const { user, painel } = await abrirAba(norma, "Relatório");
    expect(within(painel).getAllByText(AVISO_CONFERENCIA).length).toBeGreaterThanOrEqual(2);
    expect(within(painel).getByRole("heading", { level: 1, name: "Obra teste" })).toBeTruthy();
    expect(painel.textContent).toContain(
      `Norma: ${norma === "nb1-78" ? "NB-1/78" : "NBR 6118:2023"}`,
    );
    expect(painel.textContent).not.toMatch(/NaN|Infinity|undefined/);

    const materiais = tabelaApos(painel, "Materiais");
    expect(linha(materiais, "fck")).toEqual(["fck", norma === "nb1-78" ? "15,0" : "25,0", "MPa"]);
    const pavimentos = tabelaApos(painel, "Pavimentos (do topo para a base)");
    expect(linha(pavimentos, "Pavimento 1")).toEqual([
      "Pavimento 1",
      "3,00",
      "1",
      "2",
      expect.any(String),
      "6",
    ]);

    const esforcos = tabelaApos(painel, "Lajes: esforços");
    expect(linha(esforcos, "L1")[7]).toMatch(NUMERO);
    expect(tabelaApos(painel, "Pilares por nível")).toBeTruthy();
    expect(within(painel).getAllByRole("region", { name: /^Detalhamento V\d+$/ })).toHaveLength(5);
    expect(within(painel).getAllByRole("region", { name: /^Detalhamento L\d+$/ })).toHaveLength(2);
    expect(within(painel).getAllByRole("region", { name: /^Detalhamento P\d+$/ })).toHaveLength(6);
    for (const o of ["obra", "vigas", "lajes", "pilares"])
      expect(linha(tabelaApos(painel, `Tabela de aço (${o})`), "Total com perda").at(-1)).toMatch(
        NUMERO,
      );
    // no relatório a memória não abre (não há botões)
    expect(within(painel).queryByRole("button", { name: "Abrir memória de cálculo" })).toBeNull();

    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    await user.click(within(painel).getByRole("button", { name: /Imprimir/ }));
    expect(imprimir).toHaveBeenCalledOnce();
  });
});

describe("resultados com falha no pavimento", () => {
  it("destaca as falhas em vermelho no topo, antes dos avisos", async () => {
    // laje com bordo livre fora do balanço: sem tabela na 6118, a carga não chega às vigas
    const obra = obraNova("Obra com falha", "nbr6118-2023");
    const pav = obra.pavimentos[0]!;
    const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, { vinculos: { superior: "livre" } });
    abrirObra({ ...obra, pavimentos: [gerarEstrutura({ ...pav, lajes: [l1] })] });
    const { user } = renderizarApp("/obra");
    await user.click(await screen.findByRole("tab", { name: "Resultados" }));
    const painel = await screen.findByRole("tabpanel", { name: "Resultados" });

    const alerta = within(painel).getByRole("alert");
    expect(alerta.className).toContain("destructive");
    expect(alerta.textContent).toMatch(/1 falha\(s\)/);
    // o texto da falha em vermelho
    expect(
      within(alerta)
        .getByText(/^Laje L1 sem cálculo/)
        .closest("ul")?.className,
    ).toContain("text-destructive");
    // o bloco de falhas vem antes da lista de avisos (a primeira contagem é a da lista;
    // as dos elementos vêm depois, na memória)
    const avisos = within(painel).getAllByText(/aviso\(s\)/)[0]!;
    expect(alerta.compareDocumentPosition(avisos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

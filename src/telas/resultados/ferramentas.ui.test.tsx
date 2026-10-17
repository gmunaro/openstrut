// Ferramentas da aba Resultados: filtro por elemento, ordenação pelo cabeçalho e cópia da
// tabela em texto com tabulações (o que o Excel cola em células).
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { obraNova } from "../../dominio/criar";
import { useObra } from "../../estado/obra";
import { acrescentarLaje, substituirPavimento } from "../../planta/edicao";
import { abrirObra, obraDuasLajes, renderizarApp } from "../../test-setup";
import { tsvDaTabela } from "./tabela";

/** Obra com L1 de 3 × 5 m e L2 de 5 × 5 m lado a lado (para a ordenação por lx). */
function obraLajesDiferentes() {
  const obra = obraNova("Ordem", "nb1-78");
  let pav = obra.pavimentos[0]!;
  for (const r of [
    { x: 0, y: 0, lx: 3, ly: 5 },
    { x: 3, y: 0, lx: 5, ly: 5 },
  ]) {
    const e = acrescentarLaje(pav, r);
    if (!e.ok) throw new Error(e.erro);
    pav = e.pavimento;
  }
  return substituirPavimento(obra, pav.id, pav);
}

async function abrirResultados(obra = obraDuasLajes("nb1-78")) {
  abrirObra(obra);
  const { user } = renderizarApp("/obra");
  await user.click(await screen.findByRole("tab", { name: "Resultados" }));
  await screen.findByText(/Calculado pela/);
  return { user };
}

const tabelaDe = (titulo: string) => {
  const bloco = screen.getByRole("heading", { name: titulo, level: 3 }).parentElement;
  let el = bloco?.nextElementSibling ?? null;
  while (el && !el.querySelector("table")) el = el.nextElementSibling;
  const t = el?.querySelector("table");
  if (!t) throw new Error(`tabela ${titulo} não achada`);
  return t;
};
const nomesDasLinhas = (t: HTMLTableElement) =>
  Array.from(
    t.querySelectorAll("tbody > tr"),
    (r) => r.querySelector("td")?.textContent?.trim() ?? "",
  );

describe("filtro de elementos", () => {
  it("L2 deixa só a L2; vigas, pilares, equilíbrio e resumo saem", async () => {
    const { user } = await abrirResultados();
    await user.type(screen.getByPlaceholderText(/Filtrar/), "L2");
    await waitFor(() => expect(nomesDasLinhas(tabelaDe("Lajes: esforços"))).toEqual(["L2"]));
    expect(screen.queryByRole("heading", { name: "Vigas", level: 3 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Equilíbrio", level: 3 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pilares", level: 2 })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Detalhamento L1" })).toBeNull();
    expect(screen.getByRole("region", { name: "Detalhamento L2" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Limpar o filtro" }));
    await waitFor(() => expect(nomesDasLinhas(tabelaDe("Lajes: esforços"))).toEqual(["L1", "L2"]));
    expect(screen.getByRole("heading", { name: "Equilíbrio", level: 3 })).toBeTruthy();
  });

  it("só a letra P mostra todos os pilares e nenhuma laje", async () => {
    const { user } = await abrirResultados();
    await user.type(screen.getByPlaceholderText(/Filtrar/), "p");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Lajes: esforços", level: 3 })).toBeNull(),
    );
    const linhas = nomesDasLinhas(tabelaDe("Pilares por nível")).filter((n) => /^P\d/.test(n));
    expect(linhas).toHaveLength(6);
  });

  it("nome que não existe diz como filtrar", async () => {
    const { user } = await abrirResultados();
    await user.type(screen.getByPlaceholderText(/Filtrar/), "X9");
    expect(await screen.findByText(/Nenhum elemento com esse nome/)).toBeTruthy();
  });
});

describe("ordenação pelo cabeçalho", () => {
  it("lx: maior primeiro, depois menor primeiro, depois a ordem do cálculo", async () => {
    const { user } = await abrirResultados(obraLajesDiferentes());
    const tabela = () => tabelaDe("Lajes: esforços");
    expect(nomesDasLinhas(tabela())).toEqual(["L1", "L2"]);
    const lx = within(tabela()).getByRole("button", { name: /^lx/ });
    await user.click(lx);
    expect(nomesDasLinhas(tabela())).toEqual(["L2", "L1"]);
    expect(lx.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    // a tabela de armaduras segue a mesma ordem
    expect(nomesDasLinhas(tabelaDe("Lajes: armaduras"))).toEqual(["L2", "L1"]);
    await user.click(lx);
    expect(nomesDasLinhas(tabela())).toEqual(["L1", "L2"]);
    expect(lx.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    await user.click(lx);
    expect(lx.closest("th")?.getAttribute("aria-sort")).toBeNull();
  });
});

describe("copiar tabela", () => {
  it("copia a tabela de lajes com unidade no cabeçalho e uma linha por laje", async () => {
    const { user } = await abrirResultados();
    await user.click(screen.getByRole("button", { name: "Copiar a tabela Lajes: esforços" }));
    await waitFor(() =>
      expect(within(screen.getByRole("button", { name: /Lajes: esforços/ })).getByText("Copiada")),
    );
    const texto = await navigator.clipboard.readText();
    const linhas = texto.split("\n").map((l) => l.split("\t"));
    // cabeçalho em duas linhas (momentos negativos e reações agrupados)
    expect(linhas[0]?.slice(0, 4)).toEqual(["Laje", "lx (m)", "ly (m)", "h (cm)"]);
    expect(linhas[1]?.slice(0, 2)).toEqual(["", ""]);
    // L1 4 × 5 m, h 10 cm: o nome sem a contagem de avisos e os números como na tela
    const l1 = linhas.find((l) => l[0] === "L1");
    expect(l1?.slice(1, 4)).toEqual(["4,00", "5,00", "10,0"]);
    expect(linhas.every((l) => l.length === linhas[0]?.length)).toBe(true);
  });
});

describe("tsvDaTabela", () => {
  it("abre colspan e rowspan em células vazias e tira o que não vai na cópia", () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>Viga</th>
            <th colSpan={2}>
              Positiva<span data-unidade>cm²</span>
            </th>
          </tr>
          <tr>
            <th>As</th>
            <th>Barras</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              V1<span data-sem-copia>2 avisos</span>
            </td>
            <td>1,20</td>
            <td>2 φ 10</td>
          </tr>
          <tr data-sem-copia>
            <td colSpan={3}>memória aberta</td>
          </tr>
        </tbody>
      </table>,
    );
    const t = container.querySelector("table")!;
    expect(tsvDaTabela(t)).toBe(
      ["Viga\tPositiva (cm²)\t", "\tAs\tBarras", "V1\t1,20\t2 φ 10"].join("\n"),
    );
  });
});

// Junção peça da vista 3D → defeitos do SISTRUT original (defeitosDaPeca), com o índice
// real das marcas de Resultados (errosPorElemento). Os erros e as peças são escritos à
// mão: a peça casa pelo nome do pavimento dela (o id vem da obra) e pelo nome dela.
import { describe, expect, it } from "vitest";
import type { ErroDoOriginal } from "../../../calculo/defeitosOriginal";
import { errosPorElemento } from "../../resultados/errosOriginal";
import { defeitosDaPeca, motivoDaPeca } from "./comparacao";

/** Erro do original só com o que a junção usa (id, título e elementos). */
const erro = (id: string, elementos: [string, string][]): ErroDoOriginal => ({
  id,
  titulo: `título de ${id}`,
  mecanismo: "",
  impacto: "",
  sentido: "a conferir",
  sentidoTexto: "",
  grandeza: "",
  linhas: [],
  v2Faz: "",
  oQueFazer: "",
  referencia: "",
  elementos: elementos.map(([local, elemento]) => ({ local, elemento })),
});

// como na obra da transição (e2e/fixtures/transicao-original), P-b marca o PB nos dois
// pavimentos e R5 o PA de BAIXO; o R5 no PB de BAIXO é inventado, para uma peça com dois
// defeitos. D-ψ repete a V5 do TETO, uma vez por tramo, como no prédio do oráculo.
const PB = erro("P-b", [
  ["CIMA", "PB"],
  ["BAIXO", "PB"],
]);
const R5 = erro("R5", [
  ["BAIXO", "PA"],
  ["BAIXO", "PB"],
]);
const DPSI = erro("D-ψ", [
  ["TETO", "V5"],
  ["TETO", "V5"],
]);
const indice = errosPorElemento([PB, R5, DPSI]);
const PAVIMENTOS = [
  { id: "p-cima", nome: "CIMA" },
  { id: "p-baixo", nome: "BAIXO" },
  { id: "p-teto", nome: "TETO" },
  { id: "p-escada", nome: "ESCADA" },
];
const ids = (e: { nome: string; pavimentoId: string }) =>
  defeitosDaPeca(e, PAVIMENTOS, indice).map((x) => x.id);

describe("defeitosDaPeca", () => {
  it("pilar com um defeito: o PA de BAIXO tem só R5", () => {
    expect(ids({ nome: "PA", pavimentoId: "p-baixo" })).toEqual(["R5"]);
  });

  it("pilar com dois defeitos, na ordem do painel: o PB de BAIXO tem P-b e R5", () => {
    expect(ids({ nome: "PB", pavimentoId: "p-baixo" })).toEqual(["P-b", "R5"]);
  });

  it("o mesmo nome em outro pavimento casa pelo pavimento dele: o PB de CIMA tem só P-b", () => {
    expect(ids({ nome: "PB", pavimentoId: "p-cima" })).toEqual(["P-b"]);
  });

  it("viga marcada uma vez por tramo aparece uma vez: a V5 do TETO tem D-ψ", () => {
    expect(ids({ nome: "V5", pavimentoId: "p-teto" })).toEqual(["D-ψ"]);
  });

  it("peça sem defeito conferido: a V5 da ESCADA (mesmo nome, outro pavimento) e a V1 do TETO", () => {
    expect(ids({ nome: "V5", pavimentoId: "p-escada" })).toEqual([]);
    expect(ids({ nome: "V1", pavimentoId: "p-teto" })).toEqual([]);
  });

  it("pavimento que não está na obra: nenhum defeito", () => {
    expect(ids({ nome: "PB", pavimentoId: "sumiu" })).toEqual([]);
  });
});

describe("motivoDaPeca", () => {
  const motivo = (nome: string, pavimentoId: string, noQuadro?: string[]) =>
    motivoDaPeca(defeitosDaPeca({ nome, pavimentoId }, PAVIMENTOS, indice), noQuadro);

  it("peça sem defeito conferido: o texto diz isso sem afirmar a causa", () => {
    const m = motivo("V1", "p-teto");
    expect(m.tipo).toBe("sem");
    if (m.tipo !== "sem") return;
    expect(m.texto).toMatch(/^Sem defeito conferido nesta peça\./);
    expect(m.texto).toContain("pode vir");
    expect(m.texto).toContain("um defeito que não é conferido aqui");
  });

  it("peça com defeito: os ids, sem o texto de peça sem defeito", () => {
    const m = motivo("PB", "p-baixo");
    expect(m).toEqual({ tipo: "defeitos", proprios: [PB, R5], doQuadro: [] });
  });

  it("o defeito que o quadro do cartão já cita não se repete: P-b vai para doQuadro", () => {
    const m = motivo("PB", "p-baixo", [
      "Carga em dobro na fundação (defeito P-b): 10,00 t da coluna de cima.",
    ]);
    expect(m.tipo === "defeitos" && m.proprios.map((x) => x.id)).toEqual(["R5"]);
    expect(m.tipo === "defeitos" && m.doQuadro.map((x) => x.id)).toEqual(["P-b"]);
  });

  it("texto do quadro de outro defeito não esconde nada", () => {
    const m = motivo("PA", "p-baixo", ["Verificação sem resultado: Nk nulo (defeito D-3)."]);
    expect(m).toEqual({ tipo: "defeitos", proprios: [R5], doQuadro: [] });
  });
});

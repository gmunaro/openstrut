// Lista e texto das paradas do tour, num modelo montado à mão: 3 níveis (o do meio só com
// escada), com uma falha no nível 0, uma no nível 2 e um defeito do original.
import { describe, expect, it } from "vitest";
import type { DadosElemento, Elemento3D, Nivel } from "../api";
import { descreverParada, montarParadas } from "./paradas";

const nivel = (indice: number, nome: string): Nivel => ({
  chave: `n${indice}`,
  pavimentoId: nome,
  nome,
  repeticao: 1,
  indice,
  cotaPiso: indice * 3,
  cota: indice * 3 + 3,
});
const peca = (tipo: Elemento3D["tipo"], nome: string, n: number): Elemento3D => ({
  chave: `${tipo}|${n}|${nome}`,
  tipo,
  id: nome,
  nome,
  pavimentoId: "p",
  nivel: n,
  repeticao: 1,
  solidos: [],
  secao: "",
  notas: [],
});

const niveis = [nivel(0, "Primeiro"), nivel(1, "Escada"), nivel(2, "Cobertura")];
const v10 = peca("viga", "V10", 0);
const v2 = peca("viga", "V2", 0);
const p1 = peca("pilar", "P1", 0);
const l1 = peca("laje", "L1", 0);
const esc = peca("escada", "E1", 1);
const l9 = peca("laje", "L9", 2);
const elementos = [l9, v10, l1, esc, v2, p1];

const d = (estado: DadosElemento["estado"], extra: Partial<DadosElemento> = {}): DadosElemento => ({
  estado,
  mensagens: [],
  defeitos: [],
  ...extra,
});
const dados = new Map<string, DadosElemento>([
  [v10.chave, d("falha", { principal: "As = 9,10 cm²", mensagens: ["Armadura acima da máxima"] })],
  [v2.chave, d("falha", { defeitos: ["Viga parada em Continuo S/N"] })],
  [p1.chave, d("ok", { defeitos: ["Carga em dobro na fundação"] })],
  [l1.chave, d("aviso")],
  [esc.chave, d("ok")],
  [l9.chave, d("falha")],
]);

describe("montarParadas", () => {
  it("todo, níveis com peças de baixo para cima, falhas e depois defeitos", () => {
    expect(montarParadas({ niveis, elementos }, dados)).toEqual([
      { tipo: "todo" },
      { tipo: "nivel", nivel: 0 },
      // o nível 1 só tem a escada: fica de fora
      { tipo: "nivel", nivel: 2 },
      // nível 0: vigas pelo número (V2 antes de V10); depois a laje do nível 2
      { tipo: "peca", chave: v2.chave, motivo: "falha" },
      { tipo: "peca", chave: v10.chave, motivo: "falha" },
      { tipo: "peca", chave: l9.chave, motivo: "falha" },
      // a V2 tem defeito mas já entrou como falha
      { tipo: "peca", chave: p1.chave, motivo: "defeito" },
    ]);
  });

  it("sem cálculo: só o todo e os níveis", () => {
    const sem = new Map(elementos.map((e) => [e.chave, d("sem")]));
    expect(montarParadas({ niveis, elementos }, sem)).toEqual([
      { tipo: "todo" },
      { tipo: "nivel", nivel: 0 },
      { tipo: "nivel", nivel: 2 },
    ]);
  });
});

describe("descreverParada", () => {
  const m = { niveis, elementos };
  it("todo", () => {
    expect(descreverParada({ tipo: "todo" }, m, dados)).toEqual({
      titulo: "Prédio inteiro",
      linhas: ["3 níveis, 6 peças", "3 peças com falha"],
    });
  });

  it("nível com a cota da laje", () => {
    expect(descreverParada({ tipo: "nivel", nivel: 0 }, m, dados)).toEqual({
      titulo: "Primeiro (+3,00 m)",
      linhas: ["4 peças (lajes, vigas e pilares)", "2 com falha"],
    });
  });

  it("peça com falha: nível, situação, resultado principal e a mensagem", () => {
    expect(descreverParada({ tipo: "peca", chave: v10.chave, motivo: "falha" }, m, dados)).toEqual({
      titulo: "Viga V10",
      linhas: ["Primeiro · com falha", "As = 9,10 cm²", "Armadura acima da máxima"],
    });
  });

  it("peça com defeito do original", () => {
    expect(descreverParada({ tipo: "peca", chave: p1.chave, motivo: "defeito" }, m, dados)).toEqual(
      {
        titulo: "Pilar P1",
        linhas: ["Primeiro · sem avisos", "Defeito do original: Carga em dobro na fundação"],
      },
    );
  });
});

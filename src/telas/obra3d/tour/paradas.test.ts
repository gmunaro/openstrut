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
      // a obra subindo; sem colunas, sem os atos das cargas, da armadura e do Nk
      { tipo: "obra" },
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

  it("mais de 3 falhas num nível viram uma parada só, com as peças em ordem", () => {
    const muitas = ["V1", "V2", "V3", "V4"].map((n) => peca("viga", n, 2));
    const comMuitas = new Map(dados);
    for (const v of muitas) comMuitas.set(v.chave, d("falha"));
    const paradas = montarParadas({ niveis, elementos: [...elementos, ...muitas] }, comMuitas);
    // nível 2: L9 + V1..V4 = 5 falhas (> 3): um grupo; o nível 0 (2 falhas) segue peça a peça
    expect(paradas.filter((p) => p.tipo === "grupo")).toEqual([
      {
        tipo: "grupo",
        nivel: 2,
        motivo: "falha",
        chaves: [...muitas.map((v) => v.chave), l9.chave],
      },
    ]);
    expect(paradas.filter((p) => p.tipo === "peca" && p.motivo === "falha")).toHaveLength(2);
    const texto = descreverParada(
      paradas.find((p) => p.tipo === "grupo")!,
      { niveis, elementos: [...elementos, ...muitas] },
      comMuitas,
    );
    expect(texto.titulo).toBe("Cobertura: 5 peças com falha");
    expect(texto.linhas).toEqual(["Viga V1, Viga V2, Viga V3, Viga V4, Laje L9"]);
  });

  it("sem cálculo: só o todo e os níveis", () => {
    const sem = new Map(elementos.map((e) => [e.chave, d("sem")]));
    expect(montarParadas({ niveis, elementos }, sem)).toEqual([
      { tipo: "todo" },
      { tipo: "obra" },
      { tipo: "nivel", nivel: 0 },
      { tipo: "nivel", nivel: 2 },
    ]);
  });
});

describe("atos da estrutura", () => {
  // P1 sobe do nível 0 ao 2; o lance de cima (P1 no nível 2) leva menos carga
  const p1topo = peca("pilar", "P1", 2);
  const f1 = { ...peca("fundacao", "P1", 0), coluna: "c1" };
  const colunas = [
    { id: "c1", nome: "P1", chaves: [p1.chave, p1topo.chave], nasceEmTransicao: false },
  ];
  const comNk = new Map(dados);
  comNk.set(
    p1.chave,
    d("ok", { grandeza: 640, principal: "Nk = 640,00 kN, Nd = 896,00 kN; As = 9,07 cm² (0,45 %)" }),
  );
  comNk.set(
    p1topo.chave,
    d("ok", { grandeza: 210, principal: "Nk = 210,00 kN, Nd = 294,00 kN; As = 4,00 cm² (0,20 %)" }),
  );
  const modelo = { niveis, elementos: [...elementos, p1topo, f1], colunas };
  const caminho = {
    nome: "P1",
    lances: [
      { chave: p1topo.chave, nivel: 2, nk: 210 },
      { chave: p1.chave, nivel: 0, nk: 640 },
    ],
    fundacao: f1.chave,
  };

  it("depois do prédio: a obra, as cargas da coluna mais carregada, a armadura e o Nk", () => {
    const paradas = montarParadas(modelo, comNk, { armadura: true });
    expect(paradas.slice(0, 6)).toEqual([
      { tipo: "todo" },
      { tipo: "obra" },
      { tipo: "cargas", caminho },
      { tipo: "armadura", chave: p1.chave, coluna: "P1" },
      { tipo: "nk", caminho },
      { tipo: "nivel", nivel: 0 },
    ]);
    // sem detalhamento, sem o raio-x
    expect(montarParadas(modelo, comNk).some((p) => p.tipo === "armadura")).toBe(false);
  });

  it("textos dos atos com o Nk do cálculo", () => {
    expect(descreverParada({ tipo: "cargas", caminho }, modelo, comNk)).toEqual({
      titulo: "Caminho das cargas · P1",
      linhas: ["Laje → viga → pilar → fundação", "Lance de baixo: Nk = 640,00 kN"],
    });
    expect(
      descreverParada({ tipo: "armadura", chave: p1.chave, coluna: "P1" }, modelo, comNk),
    ).toEqual({
      titulo: "Armadura do P1 · Primeiro",
      linhas: ["Nk = 640,00 kN, Nd = 896,00 kN; As = 9,07 cm² (0,45 %)"],
    });
    expect(descreverParada({ tipo: "nk", caminho }, modelo, comNk)).toEqual({
      titulo: "Nk nos pilares",
      linhas: ["Menor Nk = 210,00 kN · maior Nk = 640,00 kN"],
    });
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
      titulo: "Primeiro (+3,00 m)",
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

// Formulário dos dados do pavimento do SISTRUT: ida e volta, mensagens de erro (que
// nomeiam o campo), o que o leitor do arquivo recusaria e o preenchimento pela laje.
import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import type { Laje, Pavimento } from "../../../dominio/obra";
import { substituirPavimento } from "../../../planta/edicao";
import { problemasNoArquivo } from "./formulario";
import {
  acidentalAcimaDoTotal,
  type FormPavimento,
  formDoPavimento,
  ladosDaLaje,
  lajesComPoligono,
  novaCarga,
  novaContinuidade,
  pavimentoDoForm,
  verticesDaLaje,
} from "./pavimento";

const laje = (id: string, x: number, extra: Partial<Laje> = {}): Laje => ({
  id,
  nome: id.toUpperCase(),
  x,
  y: 0,
  lx: 4,
  ly: 5,
  h: 10,
  revestimento: 1,
  sobrecarga: 1.5,
  vinculos: {},
  mu: 1,
  ...extra,
});

/** L1 retangular (sem polígono); L2 com polígono horário de 4 lados, x de 4 a 8 m. */
const pavBase = (): Pavimento => ({
  id: "p1",
  nome: "Tipo",
  peDireito: 3,
  repeticoes: 2,
  lajes: [
    laje("l1", 0),
    laje("l2", 4, {
      poligono: [
        { x: 4, y: 0 },
        { x: 4, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 0 },
      ],
    }),
  ],
  vigas: [],
  pilares: [{ id: "pa", nome: "P1", x: 0, y: 0, b: 20, h: 100 }],
  pilaresRemovidos: [{ x: 9, y: 9 }],
});

const pavCompleto = (): Pavimento => ({
  ...pavBase(),
  cargasOcupacao: [
    {
      poligono: [
        { x: 0, y: 0 },
        { x: 2.5, y: 0 },
        { x: 2.5, y: 3 },
      ],
      total: 3,
      acidental: 2,
    },
  ],
  alvenarias: [{ inicio: { x: 0, y: 2.5 }, fim: { x: 4, y: 2.5 }, carga: 7.2 }],
  trechosPilares: [{ pilar: "pa", inicio: { x: 0, y: -0.5 }, fim: { x: 0, y: 0.5 } }],
  continuidadesLajes: [{ lajeA: "l2", ladoA: 0 }],
});

const vazio = (): FormPavimento => ({ cargas: [], alvenarias: [], trechos: [], continuidades: [] });

const erros = (f: FormPavimento, p = pavBase()) => {
  const r = pavimentoDoForm(f, p);
  return Array.isArray(r) ? r : [];
};

describe("formulário do pavimento: ida e volta", () => {
  it("formulário do pavimento → o mesmo pavimento", () => {
    const p = pavCompleto();
    const f = formDoPavimento(p);
    expect(f.cargas[0]).toEqual({
      vertices: [
        { x: "0", y: "0" },
        { x: "2,5", y: "0" },
        { x: "2,5", y: "3" },
      ],
      total: "3",
      acidental: "2",
    });
    expect(f.alvenarias).toEqual([{ x1: "0", y1: "2,5", x2: "4", y2: "2,5", carga: "7,2" }]);
    expect(f.trechos).toEqual([{ pilar: "pa", x1: "0", y1: "-0,5", x2: "0", y2: "0,5" }]);
    expect(f.continuidades).toEqual([{ lajeA: "l2", ladoA: "0", lajeB: "", ladoB: "0" }]);
    expect(pavimentoDoForm(f, p)).toEqual(p);
  });

  it("não apaga o que não mostra: lajes, pilares, posições removidas e campos desconhecidos", () => {
    const p = { ...pavCompleto(), campoNovo: 42 } as Pavimento;
    const f = { ...formDoPavimento(p), alvenarias: [] };
    const r = pavimentoDoForm(f, p);
    if (Array.isArray(r)) throw new Error(r.join("\n"));
    expect(r).toEqual({ ...pavCompleto(), alvenarias: undefined, campoNovo: 42 });
    expect("alvenarias" in r).toBe(false);
    expect(r.lajes).toBe(p.lajes);
    expect(r.pilaresRemovidos).toEqual([{ x: 9, y: 9 }]);
  });

  it("listas vazias = campos ausentes", () => {
    const r = pavimentoDoForm(vazio(), pavCompleto());
    if (Array.isArray(r)) throw new Error(r.join("\n"));
    for (const k of ["cargasOcupacao", "alvenarias", "trechosPilares", "continuidadesLajes"])
      expect(k in r).toBe(false);
  });

  it("continuidade sem laje B não grava lajeB nem ladoB; com laje B grava as duas", () => {
    const f = {
      ...vazio(),
      continuidades: [
        { lajeA: "l2", ladoA: "3", lajeB: "", ladoB: "2" },
        { lajeA: "l2", ladoA: "1", lajeB: "l2", ladoB: "3" },
      ],
    };
    const r = pavimentoDoForm(f, pavBase());
    if (Array.isArray(r)) throw new Error(r.join("\n"));
    expect(r.continuidadesLajes).toEqual([
      { lajeA: "l2", ladoA: 3 },
      { lajeA: "l2", ladoA: 1, lajeB: "l2", ladoB: 3 },
    ]);
  });

  it("o resultado abre no leitor do arquivo", () => {
    const obra = obraNova("Teste", "nb1-78");
    const pav = obra.pavimentos[0];
    if (!pav) throw new Error("obra nova sem pavimento");
    const p = { ...pavCompleto(), id: pav.id };
    const r = pavimentoDoForm(formDoPavimento(p), p);
    if (Array.isArray(r)) throw new Error(r.join("\n"));
    expect(problemasNoArquivo(substituirPavimento(obra, pav.id, r))).toEqual([]);
  });
});

describe("formulário do pavimento: cargas de ocupação", () => {
  const carga = (vertices: [string, string][], total = "3", acidental = "1") => ({
    ...vazio(),
    cargas: [{ vertices: vertices.map(([x, y]) => ({ x, y })), total, acidental }],
  });

  it("polígono sem área é recusado", () => {
    expect(
      erros(
        carga([
          ["0", "0"],
          ["1", "0"],
          ["2", "0"],
        ]),
      ),
    ).toEqual(["Carga de ocupação 1: o polígono não tem área."]);
  });

  it("menos de 3 vértices é recusado (a carga nova começa sem vértices)", () => {
    expect(erros({ ...vazio(), cargas: [{ ...novaCarga(), total: "2" }] })).toEqual([
      "Carga de ocupação 1: informe pelo menos 3 vértices.",
    ]);
  });

  it("aceita os vértices em sentido anti-horário", () => {
    const r = pavimentoDoForm(
      carga([
        ["0", "0"],
        ["2", "0"],
        ["2", "2"],
      ]),
      pavBase(),
    );
    expect(Array.isArray(r)).toBe(false);
  });

  it("mensagens nomeiam a carga, o vértice e o campo", () => {
    expect(
      erros(
        carga(
          [
            ["0", "0"],
            ["", "1"],
            ["1", "x"],
          ],
          "-1",
          "",
        ),
      ),
    ).toEqual([
      "Carga de ocupação 1, ponto 2, x: informe um número.",
      "Carga de ocupação 1, ponto 3, y: informe um número.",
      "Carga de ocupação 1, total: informe um número maior ou igual a zero.",
      "Carga de ocupação 1, acidental: informe um número.",
    ]);
  });

  it("acidental acima do total é só aviso", () => {
    const c = (total: string, acidental: string) => ({ vertices: [], total, acidental });
    expect(acidentalAcimaDoTotal(c("2", "3,5"))).toBe(true);
    expect(acidentalAcimaDoTotal(c("3", "3"))).toBe(false);
    expect(acidentalAcimaDoTotal(c("", "3"))).toBe(false);
    const f = carga(
      [
        ["0", "0"],
        ["0", "2"],
        ["2", "2"],
      ],
      "2",
      "3",
    );
    expect(Array.isArray(pavimentoDoForm(f, pavBase()))).toBe(false);
  });

  it("retângulo da laje sem polígono → vértices em sentido horário a partir do canto", () => {
    const l = laje("l9", 1.5, { y: 2, lx: 3.25, ly: 4 });
    expect(verticesDaLaje(l)).toEqual([
      { x: "1,5", y: "2" },
      { x: "1,5", y: "6" },
      { x: "4,75", y: "6" },
      { x: "4,75", y: "2" },
    ]);
  });

  it("laje com polígono → o polígono dela, na ordem gravada", () => {
    const l2 = pavBase().lajes[1];
    if (!l2) throw new Error("sem L2");
    expect(verticesDaLaje(l2)).toEqual([
      { x: "4", y: "0" },
      { x: "4", y: "5" },
      { x: "8", y: "5" },
      { x: "8", y: "0" },
    ]);
  });
});

describe("formulário do pavimento: alvenarias e pilares-parede", () => {
  it("alvenaria: coordenadas obrigatórias e carga ≥ 0", () => {
    const f = {
      ...vazio(),
      alvenarias: [{ x1: "", y1: "0", x2: "4", y2: "0", carga: "-2" }],
    };
    expect(erros(f)).toEqual([
      "Alvenaria 1, início, x: informe um número.",
      "Alvenaria 1, carga: informe um número maior ou igual a zero.",
    ]);
  });

  it("pilar-parede: pilar escolhido e do pavimento", () => {
    const f = {
      ...vazio(),
      trechos: [
        { pilar: "", x1: "0", y1: "0", x2: "1", y2: "0" },
        { pilar: "zz", x1: "0", y1: "0", x2: "1", y2: "0" },
      ],
    };
    expect(erros(f)).toEqual([
      "Pilar-parede 1: escolha o pilar.",
      "Pilar-parede 2: o pilar zz não existe no pavimento.",
    ]);
  });
});

describe("formulário do pavimento: continuidades", () => {
  const cont = (lajeA: string, ladoA: string, lajeB = "", ladoB = "0") => ({
    ...vazio(),
    continuidades: [{ lajeA, ladoA, lajeB, ladoB }],
  });

  it("laje sem polígono é recusada", () => {
    expect(erros(cont("l1", "0"))).toEqual([
      "Continuidade 1, laje A: a laje L1 não tem polígono (edite-o no editor da laje).",
    ]);
    expect(erros(cont("l2", "0", "l1", "2"))).toEqual([
      "Continuidade 1, laje B: a laje L1 não tem polígono (edite-o no editor da laje).",
    ]);
  });

  it("lado que não existe no polígono é recusado", () => {
    expect(erros(cont("l2", "4"))).toEqual([
      "Continuidade 1, laje A: a laje L2 tem 4 lados (0 a 3).",
    ]);
    expect(erros(cont("l2", "1,5"))).toEqual([
      "Continuidade 1, laje A, lado: informe um número inteiro.",
    ]);
  });

  it("laje que não existe e laje A não escolhida", () => {
    expect(erros(cont("lx", "0"))).toEqual([
      "Continuidade 1, laje A: a laje lx não existe no pavimento.",
    ]);
    expect(erros(cont("", "0"))).toEqual(["Continuidade 1, laje A: escolha a laje."]);
  });

  it("só as lajes com polígono são candidatas; a linha nova começa pela primeira", () => {
    const p = pavBase();
    expect(lajesComPoligono(p).map((l) => l.id)).toEqual(["l2"]);
    expect(novaContinuidade(lajesComPoligono(p)[0]?.id)).toEqual({
      lajeA: "l2",
      ladoA: "0",
      lajeB: "",
      ladoB: "0",
    });
  });

  it("rótulos dos lados: vértice k → k + 1, o último fecha no primeiro", () => {
    const l2 = pavBase().lajes[1];
    if (!l2) throw new Error("sem L2");
    expect(ladosDaLaje(l2)).toEqual([
      "lado 0: (4,00; 0,00) → (4,00; 5,00)",
      "lado 1: (4,00; 5,00) → (8,00; 5,00)",
      "lado 2: (8,00; 5,00) → (8,00; 0,00)",
      "lado 3: (8,00; 0,00) → (4,00; 0,00)",
    ]);
  });
});

// Formulário dos dados do SISTRUT do pilar: ida e volta, caixa b × h da seção não
// retangular, campos que o editor não mostra e as mensagens de erro (valores escritos à mão).
import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import type { Obra, Pilar } from "../../../dominio/obra";
import { problemasNoArquivo } from "./formulario";
import {
  caixaDaSecao,
  type FormPilar,
  formDoPilar,
  linhaMomentoCarga,
  linhaMomentoVento,
  pilarDoForm,
  previaCaixa,
  resumoPilar,
  verificacaoVazia,
} from "./pilar";

const base: Pilar = { id: "p1", nome: "P1", x: 4, y: 0, b: 20, h: 40 };

const completo: Pilar = {
  ...base,
  rotacao: 30,
  vinculos: { x: "engaste", y: "livre" },
  vinculosTopo: { x: "semiEngaste", y: "continuidade" },
  excentricidade: { x: 5, y: -2.5 },
  vento: { normal: 12, momentos: [{ m: 3.5, angulo: 90 }] },
  cargaTopo: {
    normal: 100,
    momentos: [{ m: -20, inclinacao: 0, vao: 1, rigidez: 5000 }],
    modo: "maxima",
  },
  cargaBase: { normal: 50, momentos: [] },
  transicao: true,
  armadura: {
    barras: [
      { x: 3, y: 3, bitola: 12.5 },
      { x: 17, y: 37, bitola: 12.5 },
    ],
    estribo: { bitola: 5, espacamento: 15 },
  },
  verificacoes: [
    {
      barras: [{ x: 3, y: 3, bitola: 10 }],
      esforcos: { nk: 500, mxk: 10, myk: 0, lex: 2.8, ley: 2.8 },
    },
    { barras: [{ x: 17, y: 37, bitola: 16 }], estribo: { bitola: 6.3, espacamento: 12 } },
  ],
};

/** Aplica `mudar` no formulário do pilar e lê de volta. */
const editar = (p: Pilar, mudar: (f: FormPilar) => FormPilar) =>
  pilarDoForm(mudar(formDoPilar(p)), p);

describe("ida e volta", () => {
  it("pilar sem dados do SISTRUT volta igual e o formulário mostra os padrões", () => {
    const f = formDoPilar(base);
    expect(f.tipoSecao).toBe("retangular");
    expect(f.rotacao).toBe("");
    expect(f.vinculos).toEqual({ dado: false, x: "continuidade", y: "continuidade" });
    expect(f.comVento).toBe(false);
    expect(f.cargaTopo.ligada).toBe(false);
    expect(f.modoCargaTopo).toBe("padrao");
    expect(f.armadura).toBe("nenhuma");
    expect(f.verificacoes).toEqual([]);
    // ponto de partida da poligonal: o retângulo da planta, sentido horário
    expect(f.vertices).toEqual([
      { x: "0", y: "0" },
      { x: "0", y: "40" },
      { x: "20", y: "40" },
      { x: "20", y: "0" },
    ]);
    expect(pilarDoForm(f, base)).toEqual(base);
  });

  it("pilar com todos os campos volta igual, com vírgula decimal no formulário", () => {
    const f = formDoPilar(completo);
    expect(f.excentricidadeY).toBe("-2,5");
    expect(f.barrasArmadura[0]).toEqual({ x: "3", y: "3", bitola: "12,5" });
    expect(f.armadura).toBe("dada");
    expect(f.verificacoes[0]?.lex).toBe("2,8");
    expect(pilarDoForm(f, completo)).toEqual(completo);
  });

  it("seção circular e poligonal voltam iguais", () => {
    const circular: Pilar = {
      ...base,
      b: 30,
      h: 30,
      secao: { tipo: "circular", d: 30, dInterno: 0 },
    };
    expect(pilarDoForm(formDoPilar(circular), circular)).toEqual(circular);
    const poligonal: Pilar = {
      ...base,
      b: 30,
      h: 20,
      secao: {
        tipo: "poligonal",
        vertices: [
          { x: 0, y: 0 },
          { x: 0, y: 20 },
          { x: 30, y: 20 },
          { x: 30, y: 0 },
        ],
      },
    };
    expect(pilarDoForm(formDoPilar(poligonal), poligonal)).toEqual(poligonal);
  });
});

describe("não apaga o que não mostra", () => {
  it("campo desconhecido, id, nome e posição passam intactos", () => {
    const comExtra = { ...base, campoFuturo: 7 } as Pilar;
    const r = editar(comExtra, (f) => ({ ...f, comVento: true, ventoNormal: "8" }));
    expect(r).toEqual({ ...base, campoFuturo: 7, vento: { normal: 8, momentos: [] } });
  });

  it("desligar um grupo tira só aquele campo", () => {
    const r = editar(completo, (f) => ({ ...f, comVento: false }));
    const esperado: Pilar = { ...completo };
    delete esperado.vento;
    expect(r).toEqual(esperado);
  });
});

describe("seção e caixa b × h", () => {
  it("circular: b = h = D e a rotação sai", () => {
    const r = editar({ ...base, rotacao: 30 }, (f) => ({
      ...f,
      tipoSecao: "circular",
      d: "30",
      dInterno: "10",
    }));
    expect(r).toEqual({
      id: "p1",
      nome: "P1",
      x: 4,
      y: 0,
      b: 30,
      h: 30,
      secao: { tipo: "circular", d: 30, dInterno: 10 },
    });
  });

  it("poligonal em L: b = Δx = 60 e h = Δy = 40", () => {
    const vertices = [
      [0, 0],
      [0, 40],
      [20, 40],
      [20, 20],
      [60, 20],
      [60, 0],
    ].map(([x, y]) => ({ x: String(x), y: String(y) }));
    const r = editar(base, (f) => ({ ...f, tipoSecao: "poligonal", vertices }));
    expect(r).toMatchObject({ b: 60, h: 40 });
    expect(Array.isArray(r) ? undefined : r.secao).toEqual({
      tipo: "poligonal",
      vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 20, y: 40 },
        { x: 20, y: 20 },
        { x: 60, y: 20 },
        { x: 60, y: 0 },
      ],
    });
  });

  it("poligonal fora da origem: a caixa é a diferença, não o maior valor", () => {
    expect(
      caixaDaSecao({
        tipo: "poligonal",
        vertices: [
          { x: 10, y: 5 },
          { x: 10, y: 25 },
          { x: 40, y: 25 },
          { x: 40, y: 5 },
        ],
      }),
    ).toEqual({ b: 30, h: 20 });
  });

  it("voltar à retangular tira a seção e deixa b e h como estavam", () => {
    const circular: Pilar = {
      ...base,
      b: 30,
      h: 30,
      secao: { tipo: "circular", d: 30, dInterno: 0 },
    };
    expect(editar(circular, (f) => ({ ...f, tipoSecao: "retangular", rotacao: "45" }))).toEqual({
      ...base,
      b: 30,
      h: 30,
      rotacao: 45,
    });
  });

  it("prévia da caixa: só com os números completos", () => {
    const f = formDoPilar(base);
    expect(previaCaixa(f)).toBeUndefined();
    expect(previaCaixa({ ...f, tipoSecao: "circular", d: "32,5" })).toEqual({ b: 32.5, h: 32.5 });
    expect(previaCaixa({ ...f, tipoSecao: "circular", d: "abc" })).toBeUndefined();
    expect(previaCaixa({ ...f, tipoSecao: "poligonal" })).toEqual({ b: 20, h: 40 });
  });
});

describe("opções", () => {
  it("vínculos: padrão = ausente; dados = x e y", () => {
    const r = editar(base, (f) => ({
      ...f,
      vinculos: { dado: true, x: "engaste", y: "livre" },
      vinculosTopo: { dado: false, x: "engaste", y: "engaste" },
    }));
    expect(r).toEqual({ ...base, vinculos: { x: "engaste", y: "livre" } });
  });

  it("modo da carga no topo: padrão = sem modo; soma explícita fica", () => {
    const ligada = { ligada: true, normal: "10", momentos: [] };
    expect(editar(base, (f) => ({ ...f, cargaTopo: ligada }))).toEqual({
      ...base,
      cargaTopo: { normal: 10, momentos: [] },
    });
    expect(editar(base, (f) => ({ ...f, cargaTopo: ligada, modoCargaTopo: "soma" }))).toEqual({
      ...base,
      cargaTopo: { normal: 10, momentos: [], modo: "soma" },
    });
  });

  it("momento novo da carga: vão 1 e rigidez 0, como o digitado sem Jvig", () => {
    const r = editar(base, (f) => ({
      ...f,
      cargaBase: { ligada: true, normal: "0", momentos: [{ ...linhaMomentoCarga(), m: "-12,5" }] },
    }));
    expect(r).toEqual({
      ...base,
      cargaBase: { normal: 0, momentos: [{ m: -12.5, inclinacao: 0, vao: 1, rigidez: 0 }] },
    });
  });

  it("armadura dimensionada: o lance começa a variação sem barras", () => {
    expect(editar(base, (f) => ({ ...f, armadura: "dimensionada" }))).toEqual({
      ...base,
      armadura: {},
    });
    // as barras da dada não vão para a dimensionada
    expect(editar(completo, (f) => ({ ...f, armadura: "dimensionada" }))).toMatchObject({
      armadura: { estribo: { bitola: 5, espacamento: 15 } },
    });
    const r = editar(completo, (f) => ({ ...f, armadura: "dimensionada" }));
    expect(Array.isArray(r) ? undefined : r.armadura?.barras).toBeUndefined();
  });

  it("verificação nova: uma barra, sem estribo nem esforços", () => {
    const v = verificacaoVazia();
    const r = editar(base, (f) => ({
      ...f,
      verificacoes: [{ ...v, barras: [{ x: "4", y: "4", bitola: "20" }] }],
    }));
    expect(r).toEqual({ ...base, verificacoes: [{ barras: [{ x: 4, y: 4, bitola: 20 }] }] });
  });
});

describe("mensagens de erro", () => {
  const erros = (p: Pilar, mudar: (f: FormPilar) => FormPilar) => {
    const r = editar(p, mudar);
    return Array.isArray(r) ? r : [];
  };

  it("seção circular", () => {
    expect(erros(base, (f) => ({ ...f, tipoSecao: "circular", d: "20", dInterno: "20" }))).toEqual([
      "Seção circular: o vazado Dint precisa ser menor que D.",
    ]);
    expect(erros(base, (f) => ({ ...f, tipoSecao: "circular", d: "" }))).toEqual([
      "Seção circular, diâmetro D: informe um número.",
    ]);
  });

  it("seção poligonal", () => {
    const pts = (l: [number, number][]) => l.map(([x, y]) => ({ x: String(x), y: String(y) }));
    expect(
      erros(base, (f) => ({
        ...f,
        tipoSecao: "poligonal",
        vertices: pts([
          [0, 0],
          [0, 10],
        ]),
      })),
    ).toEqual(["Seção poligonal: informe pelo menos 3 vértices."]);
    expect(
      erros(base, (f) => ({
        ...f,
        tipoSecao: "poligonal",
        vertices: pts([
          [0, 0],
          [10, 0],
          [20, 0],
        ]),
      })),
    ).toEqual(["Seção poligonal: o polígono não tem área."]);
    expect(
      erros(base, (f) => ({
        ...f,
        tipoSecao: "poligonal",
        vertices: [...f.vertices, { x: "a", y: "1" }],
      })),
    ).toEqual(["Seção poligonal, vértice 5, x: informe um número."]);
  });

  it("rotação", () => {
    expect(erros(base, (f) => ({ ...f, rotacao: "400" }))).toEqual([
      "Rotação: informe um ângulo de 0 a 360 graus.",
    ]);
    expect(erros(base, (f) => ({ ...f, rotacao: "-5" }))).toEqual([
      "Rotação: informe um número maior ou igual a zero.",
    ]);
  });

  it("vento", () => {
    expect(
      erros(base, (f) => ({
        ...f,
        comVento: true,
        ventoMomentos: [{ m: "x", angulo: "0" }],
      })),
    ).toEqual(["Vento, momento 1, M: informe um número."]);
    expect(
      erros(base, (f) => ({
        ...f,
        comVento: true,
        ventoMomentos: [1, 2, 3].map(() => ({ ...linhaMomentoVento(), m: "1" })),
      })),
    ).toEqual(["Vento: no máximo 2 momentos."]);
  });

  it("cargas no topo e na base", () => {
    expect(
      erros(base, (f) => ({
        ...f,
        cargaTopo: {
          ligada: true,
          normal: "10",
          momentos: [{ m: "5", inclinacao: "0", vao: "-3", rigidez: "-1" }],
        },
      })),
    ).toEqual(["Carga no topo, momento 1, rigidez: informe um número maior ou igual a zero."]);
    expect(
      erros(base, (f) => ({
        ...f,
        cargaBase: {
          ligada: true,
          normal: "10",
          momentos: [1, 2, 3, 4, 5].map(() => ({ ...linhaMomentoCarga(), m: "1" })),
        },
      })),
    ).toEqual(["Carga na base: no máximo 4 momentos."]);
  });

  it("armadura e verificações", () => {
    expect(erros(base, (f) => ({ ...f, armadura: "dada", barrasArmadura: [] }))).toEqual([
      "Armadura dada: informe ao menos uma barra (ou escolha a dimensionada).",
    ]);
    expect(
      erros(base, (f) => ({
        ...f,
        armadura: "dada",
        barrasArmadura: [{ x: "3", y: "3", bitola: "0" }],
      })),
    ).toEqual(["Armadura, barra 1, bitola: informe um número maior que zero."]);
    expect(
      erros(completo, (f) => {
        const [v1, v2] = f.verificacoes;
        if (!v1 || !v2) throw new Error("faltam verificações");
        return {
          ...f,
          verificacoes: [
            { ...v1, lex: "0" },
            { ...v2, estribo: { ...v2.estribo, espacamento: "" } },
          ],
        };
      }),
    ).toEqual([
      "Verificação 1, lex: informe um número maior que zero.",
      "Verificação 2, estribo, espaçamento: informe um número.",
    ]);
  });
});

describe("o leitor do arquivo aceita o que o editor grava", () => {
  const obraCom = (p: Pilar): Obra => {
    const obra = obraNova("Teste", "nb1-78");
    return {
      ...obra,
      pavimentos: obra.pavimentos.map((pav) => ({ ...pav, pilares: [p] })),
    };
  };

  it("pilar completo e pilar circular", () => {
    expect(problemasNoArquivo(obraCom(completo))).toEqual([]);
    const r = editar(completo, (f) => ({ ...f, tipoSecao: "circular", d: "35", dInterno: "15" }));
    if (Array.isArray(r)) throw new Error(r.join("; "));
    expect(r.rotacao).toBeUndefined();
    expect(problemasNoArquivo(obraCom(r))).toEqual([]);
  });
});

describe("resumoPilar", () => {
  it("sem dados", () => {
    expect(resumoPilar(base)).toBe("sem dados do SISTRUT (valem os da planta)");
  });

  it("circular com vento e duas verificações", () => {
    expect(
      resumoPilar({
        ...base,
        b: 30,
        h: 30,
        secao: { tipo: "circular", d: 30, dInterno: 0 },
        vento: { normal: 0, momentos: [] },
        verificacoes: [{ barras: [] }, { barras: [] }],
      }),
    ).toBe("circular D 30 · vento · 2 verificações");
  });

  it("todos os campos", () => {
    expect(resumoPilar(completo)).toBe(
      "girado 30° · vínculo na base · vínculo no topo · excentricidade · vento · carga no topo · carga na base · transição · armadura dada · 2 verificações",
    );
  });

  it("vazado, poligonal, variação dimensionada e uma verificação", () => {
    expect(resumoPilar({ ...base, secao: { tipo: "circular", d: 32.5, dInterno: 10 } })).toBe(
      "circular D 32,5 vazado 10",
    );
    expect(
      resumoPilar({
        ...base,
        secao: {
          tipo: "poligonal",
          vertices: [
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 0 },
          ],
        },
        armadura: {},
        verificacoes: [{ barras: [] }],
      }),
    ).toBe("poligonal (3 vértices) · nova variação de armadura · 1 verificação");
  });
});

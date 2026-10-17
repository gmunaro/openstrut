// Formulário dos dados de laje do SISTRUT: mensagens, polígono, envolvente e o que o
// editor não pode apagar. Os valores esperados são escritos à mão.
import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import type { Laje, Obra, Pavimento } from "../../../dominio/obra";
import { acrescentarLaje, substituirPavimento } from "../../../planta/edicao";
import { areaDupla, problemasNoArquivo } from "./formulario";
import {
  type FormLaje,
  formDaLaje,
  lajeDoForm,
  linhaDoRetangulo,
  linhaLado,
  pavimentoComLaje,
  poligonoDoRetangulo,
  resumoLaje,
} from "./laje";

/** Laje retangular 4 × 5 m em (0, 0), sem dados do SISTRUT. */
const base: Laje = {
  id: "l1",
  nome: "L1",
  x: 0,
  y: 0,
  lx: 4,
  ly: 5,
  h: 10,
  revestimento: 1,
  sobrecarga: 2,
  vinculos: { esquerdo: "livre" },
  mu: 1,
};

/** Laje em L (6 vértices, horário) com todos os campos do editor. */
const completa: Laje = {
  ...base,
  tipo: "pre-moldada",
  anguloArmadura: 30,
  grupo: 2,
  muInformado: true,
  armaduraImposta: { principal: { bitola: 6.3, espacamento: 15 } },
  poligono: [
    { x: 0, y: 0 },
    { x: 0, y: 5 },
    { x: 2, y: 5 },
    { x: 2, y: 2 },
    { x: 4, y: 2 },
    { x: 4, y: 0 },
  ],
  vinculosLados: ["livre", null, null, "engastado", null, null],
  negativasImpostas: [null, null, null, { bitola: 8, espacamento: 20 }, null, null],
  coeficientesLados: [null, null, null, 1.5, null, null],
};

/** Formulário da laje com a mudança dada. */
const com = (l: Laje, m: Partial<FormLaje>): FormLaje => ({ ...formDaLaje(l), ...m });

const erros = (f: FormLaje, l: Laje = base) => {
  const r = lajeDoForm(f, l);
  return Array.isArray(r) ? r : [];
};

const lajeOk = (f: FormLaje, l: Laje = base) => {
  const r = lajeDoForm(f, l);
  if (Array.isArray(r)) throw new Error(r.join("\n"));
  return r;
};

describe("lajeDoForm: não apaga o que não mostra", () => {
  it("formulário sem mudança devolve a mesma laje, campo a campo", () => {
    expect(lajeOk(formDaLaje(completa), completa)).toEqual(completa);
    expect(lajeOk(formDaLaje(base), base)).toEqual(base);
  });

  it("campos que o editor não controla passam intactos", () => {
    const r = lajeOk(com(base, { grupo: "3" }));
    expect(r).toEqual({ ...base, grupo: 3 });
    expect(r.vinculos).toBe(base.vinculos);
  });

  it("vazio = ausente: maciça, μ padrão e listas por lado sem valor não vão ao arquivo", () => {
    const r = lajeOk(
      com(completa, {
        tipo: "macica",
        anguloArmadura: "",
        grupo: "",
        muInformado: "padrao",
        armaduraImposta: [
          { bitola: "", espacamento: "" },
          { bitola: "", espacamento: "" },
        ],
        lados: formDaLaje(completa).lados.map((s) => ({
          ...s,
          vinculo: "",
          negBitola: "",
          negEspacamento: "",
          coeficiente: "",
        })),
      }),
      completa,
    );
    expect(Object.keys(r).sort()).toEqual([...Object.keys(base), "poligono"].sort());
  });

  it("um lado só preenchido: a lista tem um item por lado, null nos outros", () => {
    const f = com(base, { comPoligono: true, lados: linhaDoRetangulo(base) });
    const lado2 = f.lados[1];
    if (!lado2) throw new Error("sem lado 2");
    f.lados[1] = { ...lado2, vinculo: "engastado", coeficiente: "1,2" };
    const r = lajeOk(f);
    expect(r.vinculosLados).toEqual([null, "engastado", null, null]);
    expect(r.coeficientesLados).toEqual([null, 1.2, null, null]);
    expect("negativasImpostas" in r).toBe(false);
  });
});

describe("lajeDoForm: mensagens", () => {
  it("ângulo de 0 a 180 sem o 180, com o rótulo do tipo", () => {
    expect(erros(com(base, { anguloArmadura: "180" }))).toEqual([
      "Ângulo da armadura principal: informe um ângulo menor que 180°.",
    ]);
    expect(erros(com(base, { anguloArmadura: "-5" }))).toEqual([
      "Ângulo da armadura principal: informe um número maior ou igual a zero.",
    ]);
    expect(erros(com(base, { tipo: "pre-moldada", anguloArmadura: "abc" }))).toEqual([
      "Inclinação das nervuras: informe um número.",
    ]);
    expect(lajeOk(com(base, { anguloArmadura: "179,5" })).anguloArmadura).toBe(179.5);
  });

  it("grupo inteiro e não negativo", () => {
    expect(erros(com(base, { grupo: "1,5" }))).toEqual(["Grupo: informe um número inteiro."]);
    expect(erros(com(base, { grupo: "-1" }))).toEqual([
      "Grupo: informe um número maior ou igual a zero.",
    ]);
  });

  it("barra: os dois campos ou nenhum, maiores que zero", () => {
    expect(
      erros(
        com(base, {
          armaduraImposta: [
            { bitola: "8", espacamento: "" },
            { bitola: "0", espacamento: "20" },
          ],
        }),
      ),
    ).toEqual([
      "Positiva imposta principal: informe a bitola e o espaçamento, ou deixe os dois vazios.",
      "Positiva imposta secundária, bitola: informe um número maior que zero.",
    ]);
    expect(
      lajeOk(
        com(base, {
          armaduraImposta: [
            { bitola: "", espacamento: "" },
            { bitola: "5", espacamento: "12,5" },
          ],
        }),
      ).armaduraImposta,
    ).toEqual({ secundaria: { bitola: 5, espacamento: 12.5 } });
  });

  it("campos por lado nomeiam o lado pelos vértices (o último fecha no primeiro)", () => {
    const f = com(base, { comPoligono: true, lados: linhaDoRetangulo(base) });
    f.lados = f.lados.map((s, k) =>
      k === 0
        ? { ...s, coeficiente: "0" }
        : k === 3
          ? { ...s, negBitola: "8", negEspacamento: "0" }
          : s,
    );
    expect(erros(f)).toEqual([
      "Lado 4 (vértice 4 → 1), negativa imposta, espaçamento: informe um número maior que zero.",
      "Lado 1 (vértice 1 → 2), i (Mneg/Mpos): informe um número maior que zero.",
    ]);
  });
});

describe("polígono", () => {
  it("retângulo → polígono horário a partir do canto inferior esquerdo", () => {
    const p = poligonoDoRetangulo({ x: 1, y: 2, lx: 4, ly: 5 });
    expect(p).toEqual([
      { x: 1, y: 2 },
      { x: 1, y: 7 },
      { x: 5, y: 7 },
      { x: 5, y: 2 },
    ]);
    // horário: área com sinal −(4 · 5) = −20, duas vezes −40
    expect(areaDupla(p)).toBe(-40);
    expect(linhaDoRetangulo({ x: 1, y: 2, lx: 4.5, ly: 5 })[2]).toEqual({
      ...linhaLado(),
      x: "5,5",
      y: "7",
    });
  });

  it("anti-horário, menos de 3 vértices e sem área são recusados", () => {
    const linhas = (pts: [string, string][]) => pts.map(([x, y]) => ({ ...linhaLado(), x, y }));
    expect(
      erros(
        com(base, {
          comPoligono: true,
          lados: linhas([
            ["0", "0"],
            ["4", "0"],
            ["4", "5"],
            ["0", "5"],
          ]),
        }),
      ),
    ).toEqual([
      "Polígono: os vértices estão em sentido anti-horário; o LAJEGEOM só aceita o horário.",
    ]);
    expect(
      erros(
        com(base, {
          comPoligono: true,
          lados: linhas([
            ["0", "0"],
            ["0", "5"],
          ]),
        }),
      ),
    ).toEqual(["Polígono: informe pelo menos 3 vértices."]);
    expect(
      erros(
        com(base, {
          comPoligono: true,
          lados: linhas([
            ["0", "0"],
            ["0", "5"],
            ["0", "8"],
          ]),
        }),
      ),
    ).toEqual(["Polígono: o polígono não tem área."]);
    expect(
      erros(
        com(base, {
          comPoligono: true,
          lados: linhas([
            ["", "0"],
            ["0", "5"],
            ["4", "5"],
          ]),
        }),
      ),
    ).toEqual(["Polígono, ponto 1, x: informe um número."]);
  });

  it("com polígono, x, y, lx e ly passam a ser o envolvente", () => {
    const linhas = [
      ["1", "0,5"],
      ["1", "6"],
      ["3,5", "6"],
      ["3,5", "0,5"],
    ].map(([x = "", y = ""]) => ({ ...linhaLado(), x, y }));
    const r = lajeOk(com(base, { comPoligono: true, lados: linhas }));
    expect({ x: r.x, y: r.y, lx: r.lx, ly: r.ly }).toEqual({ x: 1, y: 0.5, lx: 2.5, ly: 5.5 });
  });

  it("remover o polígono tira os campos por lado e mantém o retângulo envolvente", () => {
    const r = lajeOk(com(completa, { comPoligono: false, lados: [] }), completa);
    for (const k of ["poligono", "vinculosLados", "negativasImpostas", "coeficientesLados"])
      expect(k in r).toBe(false);
    expect({ x: r.x, y: r.y, lx: r.lx, ly: r.ly }).toEqual({ x: 0, y: 0, lx: 4, ly: 5 });
    expect(r.tipo).toBe("pre-moldada");
  });
});

/** Obra com duas lajes 4 × 5 m lado a lado (L1 em x 0..4, L2 em x 4..8), vigas geradas. */
function duasLajes(): { obra: Obra; pav: Pavimento } {
  const obra = obraNova("Teste", "nb1-78");
  let pav = obra.pavimentos[0];
  if (!pav) throw new Error("obra nova sem pavimento");
  for (const r of [
    { x: 0, y: 0, lx: 4, ly: 5 },
    { x: 4, y: 0, lx: 4, ly: 5 },
  ]) {
    const e = acrescentarLaje(pav, r);
    if (!e.ok) throw new Error(e.erro);
    pav = e.pavimento;
  }
  return { obra: substituirPavimento(obra, pav.id, pav), pav };
}

describe("pavimentoComLaje", () => {
  const editar = (pav: Pavimento, nome: string, m: (l: Laje) => Partial<FormLaje>) => {
    const l = pav.lajes.find((x) => x.nome === nome);
    if (!l) throw new Error(`sem ${nome}`);
    return pavimentoComLaje(pav, lajeOk(com(l, m(l)), l));
  };

  it("polígono do retângulo: mesmo envolvente, não regenera, e o arquivo aceita", () => {
    const { obra, pav } = duasLajes();
    const e = editar(pav, "L1", (l) => ({ comPoligono: true, lados: linhaDoRetangulo(l) }));
    if (!e.ok) throw new Error(e.erro);
    expect(e.pavimento.vigas).toBe(pav.vigas);
    expect(e.pavimento.lajes[0]?.poligono).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 0 },
    ]);
    expect(problemasNoArquivo(substituirPavimento(obra, pav.id, e.pavimento))).toEqual([]);
  });

  it("remover campos opcionais de verdade (alterarLaje sozinho os manteria)", () => {
    const { pav } = duasLajes();
    const e1 = editar(pav, "L1", (l) => ({
      comPoligono: true,
      lados: linhaDoRetangulo(l).map((s) => ({ ...s, vinculo: "apoiado" })),
      grupo: "1",
    }));
    if (!e1.ok) throw new Error(e1.erro);
    const e2 = editar(e1.pavimento, "L1", () => ({ comPoligono: false, lados: [], grupo: "" }));
    if (!e2.ok) throw new Error(e2.erro);
    const l = e2.pavimento.lajes[0];
    expect(l && Object.keys(l).sort()).toEqual(Object.keys(pav.lajes[0] ?? {}).sort());
  });

  it("envolvente menor regenera as vigas; sobre a vizinha, recusa", () => {
    const { pav } = duasLajes();
    const ret = (pts: [string, string][]) => pts.map(([x, y]) => ({ ...linhaLado(), x, y }));
    const e = editar(pav, "L1", () => ({
      comPoligono: true,
      lados: ret([
        ["0", "0"],
        ["0", "5"],
        ["3", "5"],
        ["3", "0"],
      ]),
    }));
    if (!e.ok) throw new Error(e.erro);
    expect(e.pavimento.lajes[0]).toMatchObject({ x: 0, y: 0, lx: 3, ly: 5 });
    expect(e.pavimento.vigas.some((v) => v.x1 === 3 && v.x2 === 3)).toBe(true);
    const sobre = editar(pav, "L1", () => ({
      comPoligono: true,
      lados: ret([
        ["0", "0"],
        ["0", "5"],
        ["5", "5"],
        ["5", "0"],
      ]),
    }));
    expect(sobre).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/^A laje se sobrepõe à L2\. /),
    });
  });
});

describe("resumoLaje", () => {
  it("sem dados e com todos", () => {
    expect(resumoLaje(base)).toBe("sem dados do SISTRUT (valem os da planta)");
    expect(resumoLaje(completa)).toBe(
      "pré-moldada · 30° · grupo 2 · μ informado · positiva imposta · polígono de 6 lados · vínculo por lado · negativa imposta · i por lado",
    );
    expect(resumoLaje({ ...base, tipo: "macica", anguloArmadura: 22.5 })).toBe("22,5°");
  });
});

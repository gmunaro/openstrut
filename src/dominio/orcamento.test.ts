import { describe, expect, it } from "vitest";
import {
  areaFormaFabricada,
  bdiTcu,
  diferenca,
  orcar,
  type ConfigOrcamento,
  type Levantamento,
  type TabelaPrecos,
} from "./orcamento";

// Preços redondos de teste (não são da SINAPI): as contas abaixo são à mão.
const tabela: TabelaPrecos = {
  id: "t",
  nome: "teste",
  fonte: "teste",
  referencia: "",
  uf: "",
  desonerado: null,
  itens: [
    { codigo: "C25", descricao: "concreto 25", unidade: "M3", preco: 500 },
    { codigo: "A10", descricao: "CA-50 10", unidade: "KG", preco: 8 },
    { codigo: "A5", descricao: "CA-60 5", unidade: "KG", preco: 9 },
    { codigo: "F", descricao: "fôrma", unidade: "M2", preco: 50 },
    { codigo: "MOF", descricao: "mo fôrma", unidade: "m²", preco: 30 },
    { codigo: "MOA", descricao: "mo armação", unidade: "kg", preco: 3 },
    { codigo: "MOC", descricao: "mo concretagem", unidade: "m3", preco: 100 },
  ],
};

const cfg: ConfigOrcamento = {
  tabelaId: "t",
  vinculos: {
    "concreto:25": "C25",
    "aco:CA-50:10": "A10",
    "aco:CA-60:5": "A5",
    forma: "F",
    "mo-forma": "MOF",
    "mo-armacao": "MOA",
    "mo-concretagem": "MOC",
  },
  perdaConcreto: 0.05,
  perdaAco: 0.1,
  perdaForma: 0.1,
  usosForma: 2,
  bdi: 0.25,
};

// "Tipo" repetido 3 vezes (quantidades já multiplicadas) e "Cobertura".
const lev: Levantamento = {
  fck: 25,
  pavimentos: [
    { nome: "Tipo", repeticoes: 3, area: 100 },
    { nome: "Cobertura", repeticoes: 1, area: 100 },
  ],
  elementos: [
    {
      pavimento: "Tipo",
      tipo: "laje",
      nome: "L1",
      concreto: 3.6,
      forma: 30,
      aco: [{ aco: "CA-50", phi: 10, massa: 300 }],
    },
    {
      pavimento: "Tipo",
      tipo: "pilar",
      nome: "P1",
      concreto: 0.6,
      forma: 15,
      aco: [
        { aco: "CA-50", phi: 10, massa: 60 },
        { aco: "CA-60", phi: 5, massa: 15 },
      ],
    },
    {
      pavimento: "Cobertura",
      tipo: "viga",
      nome: "V1",
      concreto: 1,
      forma: 20,
      aco: [{ aco: "CA-50", phi: 10, massa: 100 }],
    },
  ],
};

describe("areaFormaFabricada", () => {
  it("máx(maior nível; total ÷ usos)", () => {
    // 4 níveis de 10 m², 2 usos: 40/2 = 20 > 10
    expect(areaFormaFabricada([10, 10, 10, 10], 2)).toBe(20);
    // 1 nível: não dá para fabricar menos que um jogo
    expect(areaFormaFabricada([100], 3)).toBe(100);
    // 3 níveis de 15 e um de 20, 2 usos: 65/2 = 32,5 > 20
    expect(areaFormaFabricada([15, 15, 15, 20], 2)).toBe(32.5);
    // usos inválidos valem 1: tudo é fabricado
    expect(areaFormaFabricada([10, 10], 0)).toBe(20);
  });
});

describe("bdiTcu", () => {
  it("fórmula do Acórdão TCU 2622/2013", () => {
    // (1 + 0,04 + 0,01 + 0,01 + 0)(1,01)(1,07)/(1 − 0,0865) − 1
    // = 1,06 · 1,01 · 1,07 / 0,9135 − 1 = 1,145542 / 0,9135 − 1 = 0,2540142
    expect(bdiTcu({ ac: 0.04, s: 0.01, r: 0.01, g: 0, df: 0.01, l: 0.07, i: 0.0865 })).toBeCloseTo(
      0.2540142,
      6,
    );
    expect(bdiTcu({ ac: 0, s: 0, r: 0, g: 0, df: 0, l: 0, i: 0 })).toBe(0);
  });
});

describe("orcar", () => {
  const o = orcar(lev, tabela, cfg);

  it("custo direto, BDI e total, conta à mão", () => {
    // concreto: 5,2 m³ · 1,05 · 500 = 2730
    // concretagem: 5,2 · 100 = 520
    // aço φ10: 460 kg · 1,10 · 8 = 4048; φ5: 15 · 1,10 · 9 = 148,5
    // armação: 475 kg · 3 = 1425
    // fôrma: níveis 15, 15, 15, 20 (65 m²), 2 usos → 32,5 m² · 1,10 · 50 = 1787,5
    // mão de obra de fôrma: 65 · 30 = 1950
    // direto = 12609; total = 12609 · 1,25 = 15761,25
    expect(o.custoDireto).toBeCloseTo(12609, 6);
    expect(o.total).toBeCloseTo(15761.25, 6);
    expect(o.formaFabricada).toBeCloseTo(32.5, 9);
    expect(o.semPreco).toEqual([]);
    expect(o.avisos).toEqual([]);
  });

  it("por insumo", () => {
    const custo = Object.fromEntries(o.porInsumo.map((g) => [g.papel, g.custo]));
    expect(custo["concreto:25"]).toBeCloseTo(2730, 6);
    expect(custo["mo-concretagem"]).toBeCloseTo(520, 6);
    expect(custo["aco:CA-50:10"]).toBeCloseTo(4048, 6);
    expect(custo["aco:CA-60:5"]).toBeCloseTo(148.5, 6);
    expect(custo["mo-armacao"]).toBeCloseTo(1425, 6);
    expect(custo.forma).toBeCloseTo(1787.5, 6);
    expect(custo["mo-forma"]).toBeCloseTo(1950, 6);
    // concreto primeiro, depois aço
    expect(o.porInsumo[0]?.papel).toBe("concreto:25");
  });

  it("por pavimento, por tipo e por elemento", () => {
    // Tipo: 2205 + 420 + 3168 + 148,5 + 1125 + 1237,5 + 1350 = 9654
    // Cobertura: 525 + 100 + 880 + 300 + 550 + 600 = 2955
    expect(o.porPavimento.map((g) => g.rotulo)).toEqual(["Tipo", "Cobertura"]);
    expect(o.porPavimento[0]?.custo).toBeCloseTo(9654, 6);
    expect(o.porPavimento[1]?.custo).toBeCloseTo(2955, 6);
    // laje: 1890 + 360 + 2640 + 900 + 825 + 900 = 7515
    // pilar: 315 + 60 + 528 + 148,5 + 225 + 412,5 + 450 = 2139
    const tipo = Object.fromEntries(o.porTipo.map((g) => [g.chave, g.custo]));
    expect(tipo.laje).toBeCloseTo(7515, 6);
    expect(tipo.viga).toBeCloseTo(2955, 6);
    expect(tipo.pilar).toBeCloseTo(2139, 6);
    expect(o.porElemento.map((g) => g.nome)).toEqual(["L1", "P1", "V1"]);
    expect(o.porElemento[1]?.custo).toBeCloseTo(2139, 6);
  });

  it("indicadores", () => {
    // área 100 · 3 + 100 = 400 m²; 15761,25 / 400 = 39,403125 R$/m²
    expect(o.indicadores.areaConstruida).toBe(400);
    expect(o.indicadores.custoPorArea).toBeCloseTo(39.403125, 9);
    // 475 kg / 5,2 m³ = 91,346 kg/m³; 65 m² / 5,2 m³ = 12,5 m²/m³
    expect(o.indicadores.acoPorConcreto).toBeCloseTo(475 / 5.2, 9);
    expect(o.indicadores.formaPorConcreto).toBeCloseTo(12.5, 9);
  });

  it("papel sem preço fica fora do total e é listado", () => {
    const semMoa = orcar(
      lev,
      {
        ...tabela,
        itens: tabela.itens.map((i) => (i.codigo === "MOA" ? { ...i, preco: null } : i)),
      },
      cfg,
    );
    expect(semMoa.custoDireto).toBeCloseTo(12609 - 1425, 6);
    expect(semMoa.semPreco).toEqual(["mo-armacao"]);
    // 3 elementos com aço: 3 linhas sem preço
    expect(semMoa.porInsumo.find((g) => g.papel === "mo-armacao")?.semPreco).toBe(3);
    const { forma: _, ...semForma } = cfg.vinculos;
    const semVinculo = orcar(lev, tabela, { ...cfg, vinculos: semForma });
    expect(semVinculo.semPreco).toEqual(["forma"]);
  });

  it("avisa unidade diferente da esperada", () => {
    const o2 = orcar(lev, tabela, { ...cfg, vinculos: { ...cfg.vinculos, "concreto:25": "A10" } });
    expect(o2.avisos).toEqual(["Concreto fck 25 MPa: o item A10 é em KG, esperado m³."]);
  });

  it("fundação paramétrica por tf, e diferença entre dois orçamentos", () => {
    const comFund: Levantamento = {
      ...lev,
      elementos: [
        ...lev.elementos,
        {
          pavimento: "Fundação",
          tipo: "fundacao",
          nome: "P1",
          concreto: 0,
          forma: 0,
          aco: [],
          carga: 40,
        },
      ],
    };
    const t2 = {
      ...tabela,
      itens: [...tabela.itens, { codigo: "FUND", descricao: "f", unidade: "tf", preco: 25 }],
    };
    const c2 = { ...cfg, vinculos: { ...cfg.vinculos, fundacao: "FUND" } };
    const a = orcar(comFund, t2, c2);
    // 40 tf · 25 = 1000 de custo direto a mais; com BDI, 1250
    expect(a.custoDireto).toBeCloseTo(12609 + 1000, 6);
    const maisCarga = orcar(
      {
        ...comFund,
        elementos: comFund.elementos.map((e) => (e.tipo === "fundacao" ? { ...e, carga: 50 } : e)),
      },
      t2,
      c2,
    );
    const d = diferenca(a, maisCarga);
    // 10 tf · 25 · 1,25 = 312,5
    expect(d.total).toBeCloseTo(312.5, 6);
    expect(d.porTipo.find((x) => x.tipo === "fundacao")?.dif).toBeCloseTo(250, 6);
  });
});

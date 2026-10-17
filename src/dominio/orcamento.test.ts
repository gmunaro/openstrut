import { describe, expect, it } from "vitest";
import {
  areaFormaFabricada,
  bdiTcu,
  diferenca,
  orcar,
  precoComposicao,
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
    { codigo: "FL", descricao: "fabricação fôrma laje", unidade: "M2", preco: 40 },
    { codigo: "FV", descricao: "fabricação fôrma viga", unidade: "M2", preco: 50 },
    { codigo: "FP", descricao: "fabricação fôrma pilar", unidade: "M2", preco: 60 },
    { codigo: "MOF", descricao: "montagem fôrma", unidade: "m²", preco: 30 },
    { codigo: "ARM", descricao: "armador", unidade: "H", preco: 30 },
    { codigo: "SERV", descricao: "servente", unidade: "H", preco: 20 },
    { codigo: "MOC", descricao: "lançamento", unidade: "m3", preco: 100 },
  ],
};

const um = (codigo: string) => [{ codigo, coef: 1 }];
const cfg: ConfigOrcamento = {
  tabelaId: "t",
  vinculos: {
    "concreto:25": um("C25"),
    "aco:CA-50:10": um("A10"),
    "aco:CA-60:5": um("A5"),
    "forma:laje": um("FL"),
    "forma:viga": um("FV"),
    "forma:pilar": um("FP"),
    "mo-forma:laje": um("MOF"),
    "mo-forma:viga": um("MOF"),
    "mo-forma:pilar": um("MOF"),
    // 0,08 H · 30 + 0,03 H · 20 = 2,40 + 0,60 = 3,00 R$/kg
    "mo-armacao": [
      { codigo: "ARM", coef: 0.08 },
      { codigo: "SERV", coef: 0.03 },
    ],
    "mo-concretagem": um("MOC"),
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

describe("precoComposicao", () => {
  const porCodigo = new Map(tabela.itens.map((i) => [i.codigo, i]));
  it("Σ coef × preço; null se vazia, com código fora da tabela ou item sem preço", () => {
    expect(precoComposicao(cfg.vinculos["mo-armacao"], porCodigo)).toBeCloseTo(3, 12);
    expect(precoComposicao([], porCodigo)).toBeNull();
    expect(precoComposicao(undefined, porCodigo)).toBeNull();
    expect(precoComposicao([{ codigo: "X", coef: 1 }], porCodigo)).toBeNull();
    const semPreco = new Map(porCodigo).set("ARM", { ...porCodigo.get("ARM")!, preco: null });
    expect(precoComposicao(cfg.vinculos["mo-armacao"], semPreco)).toBeNull();
  });
});

describe("orcar", () => {
  const o = orcar(lev, tabela, cfg);

  it("custo direto, BDI e total, conta à mão", () => {
    // concreto: 5,2 m³ · 1,05 · 500 = 2730
    // concretagem: 5,2 · 100 = 520
    // aço φ10: 460 kg · 1,10 · 8 = 4048; φ5: 15 · 1,10 · 9 = 148,5
    // armação: 475 kg · 3 = 1425
    // fôrma, fabricação, 2 usos, por tipo:
    //   laje: níveis 10, 10, 10, 0 → máx(10; 30/2) = 15 m² · 1,10 · 40 = 660
    //   pilar: níveis 5, 5, 5, 0 → máx(5; 15/2) = 7,5 m² · 1,10 · 60 = 495
    //   viga: níveis 0, 0, 0, 20 → máx(20; 20/2) = 20 m² · 1,10 · 50 = 1100
    // fôrma, montagem: 65 m² · 30 = 1950
    // direto = 2730 + 520 + 4048 + 148,5 + 1425 + 660 + 495 + 1100 + 1950 = 13076,5
    // total = 13076,5 · 1,25 = 16345,625
    expect(o.custoDireto).toBeCloseTo(13076.5, 6);
    expect(o.total).toBeCloseTo(16345.625, 6);
    expect(o.formaFabricada).toEqual({ laje: 15, viga: 20, pilar: 7.5 });
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
    expect(custo["forma:laje"]).toBeCloseTo(660, 6);
    expect(custo["forma:pilar"]).toBeCloseTo(495, 6);
    expect(custo["forma:viga"]).toBeCloseTo(1100, 6);
    // 30 · 30 + 15 · 30 + 20 · 30
    expect(custo["mo-forma:laje"]).toBeCloseTo(900, 6);
    expect(custo["mo-forma:pilar"]).toBeCloseTo(450, 6);
    expect(custo["mo-forma:viga"]).toBeCloseTo(600, 6);
    const arm = o.porInsumo.find((g) => g.papel === "mo-armacao");
    expect(arm?.quantidade).toBeCloseTo(475, 9);
    expect(arm?.preco).toBeCloseTo(3, 12);
    // concreto primeiro, depois aço
    expect(o.porInsumo[0]?.papel).toBe("concreto:25");
    expect(o.porInsumo[1]?.papel.startsWith("aco:")).toBe(true);
  });

  it("por pavimento, por tipo e por elemento", () => {
    // Tipo: 2205 + 420 + 3168 + 148,5 + 1125 + 660 + 495 + 1350 = 9571,5
    // Cobertura: 525 + 100 + 880 + 300 + 1100 + 600 = 3505
    expect(o.porPavimento.map((g) => g.rotulo)).toEqual(["Tipo", "Cobertura"]);
    expect(o.porPavimento[0]?.custo).toBeCloseTo(9571.5, 6);
    expect(o.porPavimento[1]?.custo).toBeCloseTo(3505, 6);
    // laje: 1890 + 360 + 2640 + 900 + 660 + 900 = 7350
    // pilar: 315 + 60 + 528 + 148,5 + 225 + 495 + 450 = 2221,5
    const tipo = Object.fromEntries(o.porTipo.map((g) => [g.chave, g.custo]));
    expect(tipo.laje).toBeCloseTo(7350, 6);
    expect(tipo.viga).toBeCloseTo(3505, 6);
    expect(tipo.pilar).toBeCloseTo(2221.5, 6);
    expect(o.porElemento.map((g) => g.nome)).toEqual(["L1", "P1", "V1"]);
    expect(o.porElemento[1]?.custo).toBeCloseTo(2221.5, 6);
  });

  it("indicadores", () => {
    // área 100 · 3 + 100 = 400 m²; 16345,625 / 400 = 40,8640625 R$/m²
    expect(o.indicadores.areaConstruida).toBe(400);
    expect(o.indicadores.custoPorArea).toBeCloseTo(40.8640625, 9);
    // 475 kg / 5,2 m³ = 91,346 kg/m³; 65 m² / 5,2 m³ = 12,5 m²/m³
    expect(o.indicadores.acoPorConcreto).toBeCloseTo(475 / 5.2, 9);
    expect(o.indicadores.formaPorConcreto).toBeCloseTo(12.5, 9);
  });

  it("papel sem preço fica fora do total e é listado", () => {
    const semArm = orcar(
      lev,
      {
        ...tabela,
        itens: tabela.itens.map((i) => (i.codigo === "ARM" ? { ...i, preco: null } : i)),
      },
      cfg,
    );
    expect(semArm.custoDireto).toBeCloseTo(13076.5 - 1425, 6);
    expect(semArm.semPreco).toEqual(["mo-armacao"]);
    // 3 elementos com aço: 3 linhas sem preço
    expect(semArm.porInsumo.find((g) => g.papel === "mo-armacao")?.semPreco).toBe(3);
    const { "forma:viga": _, ...semFormaViga } = cfg.vinculos;
    const semVinculo = orcar(lev, tabela, { ...cfg, vinculos: semFormaViga });
    expect(semVinculo.semPreco).toEqual(["forma:viga"]);
    expect(semVinculo.custoDireto).toBeCloseTo(13076.5 - 1100, 6);
  });

  it("avisa composição de um item com unidade diferente da quantidade", () => {
    const o2 = orcar(lev, tabela, {
      ...cfg,
      vinculos: { ...cfg.vinculos, "concreto:25": um("A10") },
    });
    expect(o2.avisos).toEqual(["Concreto fck 25 MPa: o item A10 é em KG, e a quantidade em m³."]);
  });

  it("fundação paramétrica por tf, e diferença entre dois orçamentos", () => {
    const comFund: Levantamento = {
      ...lev,
      pavimentos: [...lev.pavimentos, { nome: "Fundação", repeticoes: 1, area: 0 }],
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
    // sem composição de fundação, a carga não entra
    expect(orcar(comFund, tabela, cfg).custoDireto).toBeCloseTo(13076.5, 6);
    const t2 = {
      ...tabela,
      itens: [...tabela.itens, { codigo: "FUND", descricao: "f", unidade: "tf", preco: 25 }],
    };
    const c2 = { ...cfg, vinculos: { ...cfg.vinculos, fundacao: um("FUND") } };
    const a = orcar(comFund, t2, c2);
    // 40 tf · 25 = 1000 de custo direto a mais
    expect(a.custoDireto).toBeCloseTo(13076.5 + 1000, 6);
    expect(a.porPavimento.at(-1)).toMatchObject({ rotulo: "Fundação", custo: 1000 });
    const maisCarga = orcar(
      {
        ...comFund,
        elementos: comFund.elementos.map((e) => (e.tipo === "fundacao" ? { ...e, carga: 50 } : e)),
      },
      t2,
      c2,
    );
    const d = diferenca(a, maisCarga);
    // 10 tf · 25 = 250 direto; · 1,25 = 312,5 com BDI
    expect(d.direto).toBeCloseTo(250, 6);
    expect(d.total).toBeCloseTo(312.5, 6);
    expect(d.porTipo.find((x) => x.tipo === "fundacao")?.dif).toBeCloseTo(250, 6);
  });
});

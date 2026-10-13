// Detalhamento de lajes. Esperados por conta à mão (comentários) com as regras
// de docs/DETALHAMENTO.md, seção "Lajes e pilares", e conferência com Bastos,
// Lajes de Concreto (UNESP), item 3.17.8, p. 62-64.
// Constantes C25/CA-50: fctd = 0,7 · 0,3 · 25^(2/3) / 1,4 = 1,282482 MPa;
// fbd (boa) = 2,25 fctd = 2,885584 MPa; fyd = 434,7826 MPa;
// lb = φ/4 · fyd/fbd: φ6,3 = 23,7312 cm, φ8 = 30,1348 cm (≥ 25 φ).
// NB-1/78: τbu = 0,42 (25/1,4)^(2/3) = 2,869397 MPa; lb φ8 = 30,3048 cm.
import { describe, expect, it } from "vitest";
import type { Bordo, Vinculo } from "../../dominio/obra";
import type { MateriaisCalc } from "../tipos";
import { detalharLaje, REGRAS_LAJE_NB178, type LajeDetalhamentoEntrada } from "./lajes";
import { tabelaAco } from "./tabelaAco";

const c25: MateriaisCalc = {
  fck: 25,
  fcd: 25 / 1.4,
  sigmaCd: (0.85 * 25) / 1.4,
  fyk: 500,
  fyd: 500 / 1.15,
  fywd: 500 / 1.15,
  ecs: 0,
  es: 210_000,
  aco: "CA-50",
  acoEstribo: "CA-60",
};

const todos = <T>(v: T): Record<Bordo, T> => ({
  esquerdo: v,
  inferior: v,
  direito: v,
  superior: v,
});

// Laje em cruz 4,00 × 5,00 m, h = 10 cm, c = 2,5 cm, vigas de 20 cm nos 4
// bordos apoiados. Negativa de borda (6118 19.3.3.2) 0,67 ρmín · 100 h =
// 0,67 · 0,15 % · 1000 = 1,005 cm²/m com φ5 c/19,5.
const cruz: LajeDetalhamentoEntrada = {
  nome: "L1",
  lx: 4,
  ly: 5,
  h: 10,
  cobrimento: 2.5,
  vinculos: todos<Vinculo>("apoiado"),
  larguraApoios: todos(20),
  armadura: {
    asNegativos: todos(1.005),
    barrasX: { phi: 6.3, espacamento: 17 },
    barrasY: { phi: 6.3, espacamento: 20 },
    barrasNegativos: todos({ phi: 5, espacamento: 19.5 }),
  },
  reacoes: { esquerdo: 8, direito: 8, inferior: 10, superior: 10 },
  gamaF: 1.4,
  mat: c25,
};

describe("laje em cruz apoiada nos 4 lados (NBR 6118)", () => {
  const det = detalharLaje(cruz);
  const [n1, n2, n3, n4, n5] = det.posicoes;

  it("10 posições: 2 positivas e, por bordo, negativa de borda + distribuição", () => {
    expect(det.posicoes.map((p) => p.tipo)).toEqual([
      "positiva",
      "positiva",
      ...Array<string[]>(4).fill(["negativa", "distribuicao"]).flat(),
    ]);
    expect(det.avisos).toEqual([]);
  });

  // N1 em x, φ6,3 c/17. Ponta no apoio sem continuidade: face externa − c =
  // 10 − 2,5 = 7,5 cm além do eixo. Ancoragem: Vd = 1,4 · 8 = 11,2 kN/m;
  // As,anc = 1,5 · 11,2 / 43,478 = 0,3864 cm²/m; As,ef = 0,31172 · 100/17 =
  // 1,8337 cm²/m; lb,nec = 23,73 · 0,2107 = 5,00 → lb,mín = máx(7,12; 6,3; 10)
  // = 10 cm ≤ b − c = 17,5 cm: barra reta.
  // Reto = 7,5 + 400 + 7,5 = 415 cm. l0 em y = 500 − 20 = 480: 480/17 = 28,2 → 29 + 1 = 30.
  it("positivo em x: 30 φ6,3 c/17, 415 cm, reto", () => {
    expect(n1).toMatchObject({
      direcao: "x",
      phi: 6.3,
      quantidade: 30,
      comprimento: 415,
      ganchoInicio: 0,
      ganchoFim: 0,
      espacamento: 17,
    });
    expect(n1?.xInicio).toBeCloseTo(-7.5, 9);
    expect(n1?.xFim).toBeCloseTo(407.5, 9);
  });

  // N2 em y, φ6,3 c/20: reto = 7,5 + 500 + 7,5 = 515; l0 em x = 380: 380/20 = 19 → 20.
  it("positivo em y: 20 φ6,3 c/20, 515 cm", () => {
    expect(n2).toMatchObject({ direcao: "y", quantidade: 20, comprimento: 515 });
  });

  // N3, bordo esquerdo: da face externa − c (7,5 além do eixo) até 0,15 · 400 = 60 cm
  // além da face interna (10 + 60 = 70 do eixo): reto 77,5 → 78; ganchos h − 2c = 5.
  // Quantidade ao longo de y: 480/19,5 = 24,6 → 25 + 1 = 26.
  it("negativa de borda do bordo esquerdo: 26 φ5, 78 + 2 × 5 = 88 cm", () => {
    expect(n3).toMatchObject({
      tipo: "negativa",
      bordo: "esquerdo",
      direcao: "x",
      phi: 5,
      quantidade: 26,
      reto: 78,
      ganchoInicio: 5,
      ganchoFim: 5,
      comprimento: 88,
    });
    expect(n3?.xInicio).toBeCloseTo(-7.5, 9);
    expect(n3?.xFim).toBeCloseTo(70, 9);
  });

  // N4: As,dist = máx(0,2 · 1,005; 0,9; 0,5 · 0,15 % · 1000 = 0,75) = 0,9 cm²/m →
  // φ5: 19,635/0,9 = 21,8 → c/21,5. Trecho fora da viga: 70 − 10 = 60 → ⌈60/21,5⌉ = 3;
  // do lado de fora (7,5 − 10 < 0) nenhuma. Comprimento = 480 (face a face em y).
  it("distribuição da negativa do bordo esquerdo: 3 φ5 c/21,5 × 480", () => {
    expect(n4).toMatchObject({
      tipo: "distribuicao",
      bordo: "esquerdo",
      direcao: "y",
      phi: 5,
      espacamento: 21.5,
      quantidade: 3,
      comprimento: 480,
    });
  });

  // N5, bordo inferior: ao longo de x, l0 = 380: 380/19,5 = 19,5 → 20 + 1 = 21.
  it("negativa do bordo inferior: 21 barras", () => {
    expect(n5).toMatchObject({ bordo: "inferior", direcao: "y", quantidade: 21, comprimento: 88 });
  });

  // φ6,3: 30 × 4,15 + 20 × 5,15 = 227,5 m; φ5: negativas 2 × 26 × 0,88 +
  // 2 × 21 × 0,88 = 82,72 m e distribuições 2 × 3 × 4,80 + 2 × 3 × 3,80 = 51,6 m
  // → 134,32 m. Massa: 227,5 · 0,244704 + 134,32 · 0,154134 = 55,670 + 20,703 =
  // 76,373 kg; com 10 %: 84,011 kg.
  it("tabela de aço da laje", () => {
    const t = tabelaAco(det.posicoes);
    expect(t.linhas.map((l) => l.phi)).toEqual([5, 6.3]);
    expect(t.linhas[0]?.comprimento).toBeCloseTo(134.32, 9);
    expect(t.linhas[1]?.comprimento).toBeCloseTo(227.5, 9);
    expect(t.massa).toBeCloseTo(76.3734, 3);
    expect(t.massaComPerda).toBeCloseTo(84.0108, 3);
  });
});

describe("laje em cruz apoiada nos 4 lados (NB-1/78, V1)", () => {
  // V1 LAJEPROC ImprimeLinha: comprimento = vão + 2 · 10 φ = 400 + 12,6 = 412,6 → 413;
  // em y 500 + 12,6 = 512,6 → 513. 10 φ = 6,3 ≤ b/2 − c = 7,5.
  const det = detalharLaje(
    {
      ...cruz,
      armadura: { ...cruz.armadura, asNegativos: todos(0), barrasNegativos: {} },
    },
    REGRAS_LAJE_NB178,
  );
  it("positivos com 10 φ além do eixo, sem negativas nos bordos apoiados", () => {
    expect(det.posicoes.map((p) => [p.direcao, p.quantidade, p.comprimento])).toEqual([
      ["x", 30, 413],
      ["y", 20, 513],
    ]);
  });
});

// Laje 4,00 × 6,00 m, h = 12 cm, c = 2 cm, vigas de 20 cm; bordo direito
// engastado numa laje vizinha de menor vão 5,86 m (como L2/L3 de Bastos,
// Lajes, p. 63); negativa φ8 c/9 para 5,30 cm²/m (Bastos: N1 φ8 c/9).
const engastada: LajeDetalhamentoEntrada = {
  nome: "L2",
  lx: 4,
  ly: 6,
  h: 12,
  cobrimento: 2,
  vinculos: { esquerdo: "apoiado", inferior: "apoiado", direito: "engastado", superior: "apoiado" },
  larguraApoios: todos(20),
  armadura: {
    asNegativos: { esquerdo: 0, inferior: 0, direito: 5.3, superior: 0 },
    barrasX: { phi: 6.3, espacamento: 15 },
    barrasY: { phi: 6.3, espacamento: 20 },
    barrasNegativos: { direito: { phi: 8, espacamento: 9 } },
  },
  reacoes: todos(10),
  gamaF: 1.4,
  vaoMenorVizinha: { direito: 5.86 },
  mat: c25,
};

describe("laje com 1 bordo engastado (NBR 6118)", () => {
  const det = detalharLaje(engastada);
  const [n1, n2, n3, n4] = det.posicoes;

  // N1 em x: esquerdo apoiado → 10 − 2 = 8 além do eixo (ancoragem: As,anc =
  // 1,5 · 14 / 43,478 = 0,483; As,ef = 2,0782; lb,nec = 5,52 → 10 ≤ 18: reta);
  // direito contínuo → 4 cm além do eixo (20.1). Reto = 8 + 400 + 4 = 412.
  // l0 em y = 580: 580/15 = 38,7 → 39 + 1 = 40.
  it("positivo em x passa 4 cm do eixo do bordo engastado", () => {
    expect(n1).toMatchObject({ direcao: "x", quantidade: 40, comprimento: 412 });
    expect(n2).toMatchObject({ direcao: "y", quantidade: 20, comprimento: 616 });
  });

  // N3: barra superior em h = 12 (< 60, a 9,6 cm do fundo): boa aderência.
  // Gancho = h − 2c = 8 cm ≥ 8 φ = 6,4: α = 0,7. As,ef = 0,50265 · 100/9 = 5,5851;
  // lb,nec = 0,7 · 30,1348 · 5,30/5,5851 = 20,018 cm (≥ lb,mín = 10).
  // x = máx(4,00; 5,86) = 586 → 0,25 x = 146,5; cada lado 166,518 cm.
  // Reto = 333,04 → 334; comprimento 334 + 8 + 8 = 350. Quantidade: 580/9 = 64,4 → 65 + 1 = 66.
  it("negativa do bordo engastado: 66 φ8 c/9, 334 + 2 × 8 = 350 cm", () => {
    expect(n3).toMatchObject({
      tipo: "negativa",
      bordo: "direito",
      direcao: "x",
      phi: 8,
      quantidade: 66,
      reto: 334,
      ganchoInicio: 8,
      ganchoFim: 8,
      comprimento: 350,
    });
    expect(n3?.xInicio).toBeCloseTo(400 - 166.518, 2);
    expect(n3?.xFim).toBeCloseTo(400 + 166.518, 2);
  });

  // N4: As,dist = máx(0,2 · 5,30 = 1,06; 0,9; 0,9) = 1,06 → φ5: 19,635/1,06 = 18,52 →
  // c/18,5. Cada lado: (166,518 − 10)/18,5 = 8,46 → 9; total 18 × 580 cm.
  it("distribuição da negativa: 18 φ5 c/18,5 × 580", () => {
    expect(n4).toMatchObject({
      tipo: "distribuicao",
      bordo: "direito",
      direcao: "y",
      phi: 5,
      espacamento: 18.5,
      quantidade: 18,
      comprimento: 580,
    });
    expect(det.posicoes).toHaveLength(4);
  });

  // Bastos, Lajes, p. 63: c1 = 0,25 x + lb = 0,25 · 586 + 21 = 167,5 cm, com lb
  // com gancho = 21 cm (Tabela A-27; 0,7 · 30,13 = 21,09) e sem a redução por
  // As,calc/As,ef. Com As,calc = As,ef: 146,5 + 21,094 = 167,59 cm.
  it("extensão para cada lado confere com Bastos (c1 = 167,5 cm)", () => {
    const sem = detalharLaje({
      ...engastada,
      armadura: {
        ...engastada.armadura,
        asNegativos: { ...engastada.armadura.asNegativos, direito: (Math.PI * 0.64 * 100) / 4 / 9 },
      },
    });
    const neg = sem.posicoes.find((p) => p.tipo === "negativa");
    expect((neg?.xFim ?? 0) - 400).toBeCloseTo(167.5, 0);
  });

  it("negativa já detalhada pela vizinha não entra de novo", () => {
    const sem = detalharLaje({ ...engastada, negativoNaVizinha: ["direito"] });
    expect(sem.posicoes.map((p) => p.tipo)).toEqual(["positiva", "positiva"]);
  });
});

// A mesma L2 (h = 12, c = 2) com a vizinha do bordo direito de h = 8: a negativa
// entra na vizinha, então o gancho é 8 − 2 · 2 = 4 cm (e não 12 − 4 = 8).
// 4 < 8 φ = 6,4 → sem a redução do gancho (α = 1): lb,nec = 30,1348 · 5,30/5,5851
// = 28,597; cada lado 146,5 + 28,597 = 175,097; reto 350,19 → 351; total 351 + 2 · 4 = 359.
describe("negativa de bordo engastado com vizinha mais fina (NBR 6118)", () => {
  const det = detalharLaje({ ...engastada, hVizinhaMin: { direito: 8 } });
  it("gancho pela menor espessura: 4 cm, sem α = 0,7, com aviso de gancho < 8 φ", () => {
    const neg = det.posicoes.find((p) => p.tipo === "negativa");
    expect(neg).toMatchObject({ reto: 351, ganchoInicio: 4, ganchoFim: 4, comprimento: 359 });
    expect(det.avisos.some((a) => a.includes("< 8 φ"))).toBe(true);
  });
  it("vizinha mais grossa não muda o gancho (8 cm)", () => {
    const grossa = detalharLaje({ ...engastada, hVizinhaMin: { direito: 20 } });
    expect(grossa.posicoes.find((p) => p.tipo === "negativa")?.ganchoInicio).toBe(8);
  });
});

describe("laje com 1 bordo engastado (NB-1/78)", () => {
  // lb φ8 = 0,2 · 434,78/2,8694 = 30,305 cm, sem redução; cada lado
  // 146,5 + 30,305 = 176,805; reto 353,61 → 354; ganchos h − 2 = 10 (V1);
  // comprimento 374. Positivo em x: 10 φ = 6,3 nos dois apoios: 412,6 → 413.
  const det = detalharLaje(engastada, REGRAS_LAJE_NB178);
  it("negativa 0,25 x + lb com ganchos h − 2", () => {
    const neg = det.posicoes.find((p) => p.tipo === "negativa");
    expect(neg).toMatchObject({ reto: 354, ganchoInicio: 10, ganchoFim: 10, comprimento: 374 });
    expect(det.posicoes[0]?.comprimento).toBe(413);
  });
});

// Barra lisa: a laje em cruz com CA-25 (fyk 250). Toda ponta de barra tracionada
// leva gancho (6118 9.4.2.1 a).
// 6118: gancho semicircular (9.4.2.3), D = 4 φ: (π · 5/2 + 2) · 0,63 = 6,208 → 7 cm;
//   altura D + 2 φ = 3,78 cm ≤ h − 2c = 5 cm. Ancoragem no apoio (φ6,3, η1 = 1):
//   lb = 0,63/4 · 217,39/1,282482 = 26,70; As,anc = 1,5 · 11,2/21,739 = 0,7728;
//   lb,nec = máx(0,7 · 26,70 · 0,7728/1,8337 = 7,88; lb,mín 10) = 10 ≤ 17,5.
// NB-1/78 (V1): gancho 10 φ = 6,3 → 7 cm.
describe("laje em cruz com barra lisa CA-25", () => {
  const ca25: MateriaisCalc = { ...c25, fyk: 250, fyd: 250 / 1.15, aco: "CA-25" };
  it("6118: positivos com gancho semicircular de 7 cm nas duas pontas", () => {
    const det = detalharLaje({ ...cruz, mat: ca25 });
    const pos = det.posicoes.filter((p) => p.tipo === "positiva");
    expect(pos.map((p) => [p.ganchoInicio, p.ganchoFim])).toEqual([
      [7, 7],
      [7, 7],
    ]);
    expect(pos[0]?.reto).toBe(415);
    expect(det.avisos.some((a) => a.includes("não cabe"))).toBe(false);
  });
  it("6118: as pernas das negativas não valem como gancho de barra lisa → aviso por bordo", () => {
    const det = detalharLaje({ ...cruz, mat: ca25 });
    expect(det.avisos.filter((a) => a.includes("barra lisa"))).toHaveLength(4);
  });
  it("NB-1/78: positivos com gancho de 10 φ = 7 cm nas duas pontas", () => {
    const det = detalharLaje({ ...cruz, mat: ca25 }, REGRAS_LAJE_NB178);
    const pos = det.posicoes.filter((p) => p.tipo === "positiva");
    expect(pos.map((p) => [p.ganchoInicio, p.ganchoFim])).toEqual([
      [7, 7],
      [7, 7],
    ]);
  });
});

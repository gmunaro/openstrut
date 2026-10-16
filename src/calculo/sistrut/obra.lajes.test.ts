// Campos de laje do SISTRUT na obra da V2 que os casos do oráculo não exercitam
// (todos são retângulos maciços a 0°): pré-moldada (direção das nervuras na montagem),
// laje comum não calculada, polígono em L, carga de ocupação com polígono próprio,
// alvenaria sobre laje, pilar-parede e a projeção em SI dessas lajes. Esperados por
// conta à mão (equilíbrio, faixa de uma direção, triângulos das charneiras a 45°), não
// pela saída da própria função. A conferência número a número contra o original está em
// armazenamento/sistrut/laje.test.ts.
import { describe, expect, it } from "vitest";
import type {
  Alvenaria,
  CargaOcupacao,
  Laje,
  Obra,
  Pilar,
  TrechoPilar,
  Viga,
} from "../../dominio/obra";
import { calcularObraPeloSistrut } from "../fluxoSistrut";
import { nb178 } from "../normas";
import { KN_POR_TF } from "./base/unidades";
import { calcularObraSistrut, maiorCorda } from "./obra";

const t = (x: number) => x * KN_POR_TF;
const viga = (nome: string, x1: number, y1: number, x2: number, y2: number): Viga => ({
  id: nome,
  nome,
  x1,
  y1,
  x2,
  y2,
  bw: 12,
  h: 50,
  cargaLinear: 0,
});
const pilar = (nome: string, x: number, y: number): Pilar => ({
  id: nome,
  nome,
  x,
  y,
  b: 20,
  h: 20,
});

/** L1 4 × 5 apoiada em quatro vigas: permanente 0,10 t/m², h 10. */
const L1: Laje = {
  id: "L1",
  nome: "L1",
  x: 0,
  y: 0,
  lx: 4,
  ly: 5,
  h: 10,
  revestimento: t(0.1),
  sobrecarga: 0,
  vinculos: {},
  mu: 1,
};
const VIGAS = [
  viga("V1", 0, 0, 4, 0),
  viga("V2", 0, 5, 4, 5),
  viga("V3", 0, 0, 0, 5),
  viga("V4", 4, 0, 4, 5),
];
const PILARES = [pilar("P1", 0, 0), pilar("P2", 4, 0), pilar("P3", 4, 5), pilar("P4", 0, 5)];
/** Ocupação 0,30 t/m² (0,20 acidental) no contorno da L1. */
const OCUPACAO: CargaOcupacao = {
  poligono: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 5 },
    { x: 0, y: 5 },
  ],
  total: t(0.3),
  acidental: t(0.2),
};

function obra(
  lajes: Laje[],
  extra: {
    vigas?: Viga[];
    pilares?: Pilar[];
    ocupacao?: CargaOcupacao[];

    alvenarias?: Alvenaria[];
    trechos?: TrechoPilar[];
  } = {},
): Obra {
  return {
    versao: 3,
    nome: "T",
    norma: "nb1-78",
    modoCalculo: "original",
    materiais: {
      fck: 15,
      aco: "CA-50",
      acoEstribo: "CA-50",
      classeAco: "B",
      caa: 1,
      cobrimentoLaje: 1.5,
      cobrimentoViga: 2,
      cobrimentoPilar: 2,
    },
    pavimentos: [
      {
        id: "PAV1",
        nome: "PAV1",
        peDireito: 3,
        repeticoes: 1,
        lajes,
        vigas: extra.vigas ?? VIGAS,
        pilares: extra.pilares ?? PILARES,
        pilaresRemovidos: [],
        cargasOcupacao: extra.ocupacao ?? [OCUPACAO],
        ...(extra.alvenarias ? { alvenarias: extra.alvenarias } : {}),
        ...(extra.trechos ? { trechosPilares: extra.trechos } : {}),
      },
    ],
  };
}

const pavimento = (o: Obra) => calcularObraSistrut(o, { modo: "original" }).pavimentos[0]!;

/** Carga por metro que cada viga recebe da laje (área + estrutura + peso próprio), t/m. */
const porViga = (p: ReturnType<typeof pavimento>) =>
  Object.fromEntries(
    p.montagem.reacoes.map((r) => [
      r.apoio.tipo === "viga" ? r.apoio.viga : r.apoio.pilar,
      r.cargaArea + r.estrutura + r.peso,
    ]),
  );

describe("laje pré-moldada", () => {
  it("o LAJECALC não a calcula nem impõe H; sem peso próprio da laje", () => {
    const p = pavimento(obra([{ ...L1, tipo: "pre-moldada" }]));
    expect(p.avisos).toEqual([]);
    expect(p.painel.lajes[0]!.tipo).toBe(1);
    expect(p.esforcos.momentos.L1).toBeUndefined();
    expect(p.montagem.totais.pesoProprioLajes).toBe(0);
  });

  it("ângulo 0: nervuras em x, (0,30 + 0,10)·4/2 = 0,80 t/m nas vigas x = 0 e x = 4", () => {
    const q = porViga(pavimento(obra([{ ...L1, tipo: "pre-moldada" }])));
    expect(Object.keys(q).sort()).toEqual(["V3", "V4"]);
    expect(q.V3).toBeCloseTo(0.8, 6);
    expect(q.V4).toBeCloseTo(0.8, 6);
  });

  it("ângulo 90: nervuras em y, 0,40·5/2 = 1,00 t/m nas vigas y = 0 e y = 5", () => {
    const q = porViga(pavimento(obra([{ ...L1, tipo: "pre-moldada", anguloArmadura: 90 }])));
    expect(Object.keys(q).sort()).toEqual(["V1", "V2"]);
    expect(q.V1).toBeCloseTo(1, 6);
    expect(q.V2).toBeCloseTo(1, 6);
  });

  it("engaste forçado: o original não liga continuidade a laje não maciça; ignorado com aviso", () => {
    const p = pavimento(
      obra([
        {
          ...L1,
          tipo: "pre-moldada",
          poligono: [
            { x: 0, y: 0 },
            { x: 0, y: 5 },
            { x: 4, y: 5 },
            { x: 4, y: 0 },
          ],
          vinculosLados: ["engastado", null, null, null],
        },
      ]),
    );
    expect(p.avisos).toEqual([
      "Laje L1, lado 1: engaste em laje não maciça; o SISTRUT não o aceita e ele foi ignorado.",
    ]);
    expect(p.painel.continuidades).toEqual([]);
    expect(p.painel.lajes[0]!.codigos).toEqual([0, 0, 0, 0]);
  });
});

describe("laje comum não calculada (tipo 3)", () => {
  it("sem μ nem direção (o LAJECALC 2 não os dá): ângulo −1, μ 0 e o original para em 1/√μ", () => {
    const p = pavimento(obra([{ ...L1, tipo: "comum-nao-calculada" }]));
    expect(p.painel.lajes[0]).toMatchObject({ tipo: 3, angulo: -1, mu: 0 });
    expect(p.esforcos.momentos.L1).toBeUndefined();
    expect(p.esforcos.avisos).toEqual([
      "L1: não calculada (Division by zero: 1/SQR(μ) com μ 0 (LAJECALC.BAS:7239) (erro 11 do QuickBASIC))",
    ]);
    // a montagem a carrega mesmo assim: 20·(0,30 + 0,10 + 0,25) = 13 t
    const soma = p.montagem.reacoes.reduce(
      (s, r) => s + (r.cargaArea + r.estrutura + r.peso) * r.comprimento,
      0,
    );
    expect(soma).toBeCloseTo(13, 4);
  });

  it("com μ e direção dados por <R> e <D>: o LAJECALC calcula e o LAJEPROC não a arma", () => {
    const p = pavimento(obra([{ ...L1, tipo: "comum-nao-calculada", mu: 0.8, anguloArmadura: 0 }]));
    expect(p.painel.lajes[0]).toMatchObject({ angulo: 0, mu: Math.fround(0.8) });
    const m = p.esforcos.momentos.L1!;
    expect(m.mPositivoSecundarioTcm).toBe(Math.fround(m.mPositivoPrincipalTcm * Math.fround(0.8)));
    expect(p.lajeproc.positivas.L1).toBeUndefined();
  });
});

describe("laje em L (polígono horário de 6 vértices)", () => {
  const L: Laje = {
    ...L1,
    lx: 6,
    poligono: [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 3, y: 5 },
      { x: 3, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 0 },
    ],
  };
  const vigas = [
    viga("V1", 0, 0, 6, 0),
    viga("V2", 0, 5, 3, 5),
    viga("V3", 3, 3, 6, 3),
    viga("V4", 0, 0, 0, 5),
    viga("V5", 3, 3, 3, 5),
    viga("V6", 6, 0, 6, 3),
  ];
  const pilares = [
    pilar("P1", 0, 0),
    pilar("P2", 6, 0),
    pilar("P3", 6, 3),
    pilar("P4", 3, 3),
    pilar("P5", 3, 5),
    pilar("P6", 0, 5),
  ];
  const ocupacao = [{ ...OCUPACAO, poligono: L.poligono! }];
  const p = pavimento(obra([L], { vigas, pilares, ocupacao }));

  it("o painel recebe o polígono como está, com o bordo da V2 de cada lado", () => {
    expect(p.avisos).toEqual([]);
    expect(p.painel.lajes[0]!.vertices).toEqual(L.poligono);
    expect(p.lajesDoPainel[0]!.bordos).toEqual([
      "esquerdo",
      "superior",
      "direito",
      "superior",
      "direito",
      "inferior",
    ]);
  });

  it("charneiras a 45° nos lados de 3 m entre cantos convexos: triângulos 3·1,5/2 = 2,25 m²", () => {
    const area = (v: string) =>
      p.montagem.reacoes.find((r) => r.apoio.tipo === "viga" && r.apoio.viga === v)!.area;
    expect(area("V2")).toBeCloseTo(2.25, 5);
    expect(area("V6")).toBeCloseTo(2.25, 5);
  });

  it("flecha do corrigido: vãos pela maior corda, 6 em x e 5 em y", () => {
    expect(p.lajesDoPainel[0]!.vaosFlecha).toEqual({ lx: 6, ly: 5 });
  });

  it("projeção em SI: o bordo direito tem 2 + 3 m de lados (V5 e V6), e a reação é a média pelo comprimento", () => {
    const r = calcularObraPeloSistrut(obra([L], { vigas, pilares, ocupacao }), nb178);
    const pav = r.pavimentos[0]!;
    const laje = pav.lajes[0]!;
    const direito = p.montagem.reacoes
      .filter((x) => x.apoio.tipo === "viga" && ["V5", "V6"].includes(x.apoio.viga))
      .reduce((s, x) => s + (x.linear + x.cargaArea + x.estrutura + x.peso) * x.comprimento, 0);
    expect(laje.esforcos.reacoes.direito).toBeCloseTo((direito / 5) * KN_POR_TF, 6);
    // ocupação 0,30 t/m², 0,20 acidental: 0,10 vai no g e 0,20 no q
    expect(laje.entrada.q).toBeCloseTo(t(0.2), 9);
    expect(laje.entrada.g).toBeCloseTo(t(0.1 + 0.25 + 0.1), 5);
  });

  it("área 6·3 + 3·2 = 24 m² e as reações somam a carga: 24·(0,30 + 0,10 + 0,25) = 15,6 t", () => {
    expect(p.esforcos.preparadas.L1!.area).toBeCloseTo(24, 5);
    const soma = p.montagem.reacoes.reduce(
      (s, r) => s + (r.cargaArea + r.estrutura + r.peso) * r.comprimento,
      0,
    );
    expect(soma).toBeCloseTo(15.6, 4);
    expect(p.montagem.avisos).toEqual([]);
  });
});

describe("cargas de ocupação e alvenarias do pavimento", () => {
  it("a parcela acidental não entra no total: 0,30 t/m² no M+ (q = 0,30 + 0,10 + 0,25)", () => {
    const m = pavimento(obra([L1])).esforcos.momentos.L1!;
    expect(m.q).toBeCloseTo(0.65, 6);
  });

  it("alvenaria de 0,4 t/m em x = 2 (5 m sobre a laje): 2 t a mais, distribuídas na área", () => {
    const sem = pavimento(obra([L1]));
    const com = pavimento(
      obra([L1], { alvenarias: [{ inicio: { x: 2, y: 0 }, fim: { x: 2, y: 5 }, carga: t(0.4) }] }),
    );
    expect(com.esforcos.preparadas.L1!.alvenaria).toBeCloseTo(2, 5);
    expect(com.esforcos.momentos.L1!.q - sem.esforcos.momentos.L1!.q).toBeCloseTo(2 / 20, 6);
    const total = (p: typeof com) =>
      p.montagem.reacoes.reduce(
        (s, r) => s + (r.linear + r.cargaArea + r.estrutura + r.peso) * r.comprimento,
        0,
      );
    expect(total(com) - total(sem)).toBeCloseTo(2, 4);
  });
});

describe("pilar-parede (Pavimento.trechosPilares)", () => {
  it("o bordo y = 0 apoiado no pilar-parede: triângulo 4·2/2 = 4 m² e 4·0,65 = 2,6 t no pilar", () => {
    const p = pavimento(
      obra([L1], {
        vigas: VIGAS.filter((v) => v.nome !== "V1"),
        pilares: [...PILARES, pilar("PP", 2, 0)],
        trechos: [{ pilar: "PP", inicio: { x: 0, y: 0 }, fim: { x: 4, y: 0 } }],
      }),
    );
    const r = p.montagem.reacoes.find((x) => x.apoio.tipo === "pilar")!;
    expect(r.apoio).toEqual({ tipo: "pilar", pilar: "PP" });
    expect(r.area).toBeCloseTo(4, 5);
    expect(r.cargaArea + r.estrutura + r.peso).toBeCloseTo(2.6, 5);
    expect(p.montagem.totais.pilares).toBeCloseTo(2.6, 5);
  });
});

describe("negativa imposta no LAJECALC (Laje.negativasImpostas)", () => {
  it("φ5 c/20 (1,0 cm²/m) abaixo da necessária: a otimização reduz o i do lado imposto", () => {
    const vizinhas: Laje[] = [
      {
        ...L1,
        poligono: [
          { x: 0, y: 0 },
          { x: 0, y: 5 },
          { x: 4, y: 5 },
          { x: 4, y: 0 },
        ],
        negativasImpostas: [null, null, { bitola: 5, espacamento: 20 }, null],
      },
      { ...L1, id: "L2", nome: "L2", x: 4 },
    ];
    const vigas = [
      ...VIGAS,
      viga("V5", 4, 0, 8, 0),
      viga("V6", 4, 5, 8, 5),
      viga("V7", 8, 0, 8, 5),
    ];
    const pilares = [...PILARES, pilar("P5", 8, 0), pilar("P6", 8, 5)];
    const p = pavimento(obra(vizinhas, { vigas, pilares, ocupacao: [] }));
    // 1000·índice da bitola de 5 mm (1) + 20 cm
    expect(p.painel.continuidades[0]).toMatchObject({ lajeA: "L1", armaduraImposta: 1020 });
    expect(p.esforcosAntesOtimizacao.lajes[0]!.codigos[2]).toBe(22);
    expect(p.esforcos.lajes[0]!.codigos[2]).toBeLessThan(22);
  });
});

describe("maiorCorda (vãos da flecha da laje com polígono)", () => {
  // triângulo retângulo horário de catetos 3 (x) e 4 (y): a reta mais baixa das 9 está a
  // 1/10 da altura, onde a corda horizontal vale 3·0,9; a vertical, 4·0,9
  const tri = [
    { x: 0, y: 0 },
    { x: 0, y: 4 },
    { x: 3, y: 0 },
  ];
  it("horizontal 2,7 e vertical 3,6", () => {
    expect(maiorCorda(tri, false)).toBeCloseTo(2.7, 9);
    expect(maiorCorda(tri, true)).toBeCloseTo(3.6, 9);
  });
});

describe("Obra.parametrosLaje", () => {
  it("ausente: o .LAP de fábrica; o piso Mneg/Mpos editado chega à tabela em SINGLE", () => {
    const padrao = calcularObraSistrut(obra([L1]), { modo: "original" });
    expect(padrao.parametros.laje.relacaoNegPosMin).toBe(Math.fround(0.3));
    const editado = calcularObraSistrut(
      { ...obra([L1]), parametrosLaje: { relacaoNegPosMin: 0.35 } },
      { modo: "original" },
    );
    expect(editado.parametros.laje.relacaoNegPosMin).toBe(Math.fround(0.35));
  });
});

/** A obra com campos do pavimento por cima. */
const comPavimento = (o: Obra, extra: Partial<Obra["pavimentos"][number]>): Obra => ({
  ...o,
  pavimentos: [{ ...o.pavimentos[0]!, ...extra }],
});

/** Retângulo horário a partir do canto inferior esquerdo. */
const retangulo = (x: number, y: number, lx: number, ly: number) => [
  { x, y },
  { x, y: y + ly },
  { x: x + lx, y: y + ly },
  { x: x + lx, y },
];

describe('Viga.apoiaEm ("Vx apoia em Vy" do LAJEMONT)', () => {
  // cruz sem pilar no meio: V1 horizontal y = 4 e V2 vertical x = 4, de 0 a 8, pilares
  // nas quatro pontas, só peso próprio (12 × 50: 0,15 t/m)
  const pilares = [pilar("P1", 0, 4), pilar("P2", 8, 4), pilar("P3", 4, 0), pilar("P4", 4, 8)];
  const cruz = (apoiaEm?: string[]) =>
    pavimento(
      obra([], {
        vigas: [
          { ...viga("V1", 0, 4, 8, 4), ...(apoiaEm ? { apoiaEm } : {}) },
          viga("V2", 4, 0, 4, 8),
        ],
        pilares,
        ocupacao: [],
      }),
    );
  const reacoes = (p: ReturnType<typeof pavimento>, v: string) =>
    p.analises.find((a) => a.nome === v)!.apoios.map((x) => x.r);

  it("sem escolha vale a regra da V2: as duas passam, mesmo h e vão, a vertical se apoia na horizontal", () => {
    const p = cruz();
    expect(p.eixos.find((e) => e.nome === "V2")!.apoios).toEqual([
      { pilar: "P3" },
      { viga: "V1" },
      { pilar: "P4" },
    ]);
  });

  it("V1 apoia em V2: V1 contínua em dois tramos de 4 m e V2 isostática de 8 m com a reação no meio", () => {
    const p = cruz(["V2"]);
    expect(p.eixos.find((e) => e.nome === "V1")!.apoios).toEqual([
      { pilar: "P1" },
      { viga: "V2" },
      { pilar: "P2" },
    ]);
    // viga contínua de dois vãos iguais: 3/8·qL nas pontas e 10/8·qL no meio
    const [a, b, c] = reacoes(p, "V1");
    expect(a).toBeCloseTo((3 / 8) * 0.15 * 4, 5);
    expect(b).toBeCloseTo((10 / 8) * 0.15 * 4, 5);
    expect(c).toBeCloseTo((3 / 8) * 0.15 * 4, 5);
    // V2: (q·8 + F)/2 com F = a reação do meio da V1
    for (const r of reacoes(p, "V2")) expect(r).toBeCloseTo((0.15 * 8 + 0.75) / 2, 5);
  });
});

describe('a parada da opção 5 "todas" (erro de execução numa laje)', () => {
  // L1, L2 (comum não calculada sem μ: o original para em 1/√μ) e L3, de 4 × 5
  const lajes = [
    { ...L1 },
    { ...L1, id: "L2", nome: "L2", x: 4, tipo: "comum-nao-calculada" as const },
    { ...L1, id: "L3", nome: "L3", x: 8 },
  ];
  const vigas = [
    viga("V1", 0, 0, 12, 0),
    viga("V2", 0, 5, 12, 5),
    ...[0, 4, 8, 12].map((x, i) => viga(`V${i + 3}`, x, 0, x, 5)),
  ];
  const pilares = [0, 4, 8, 12].flatMap((x, i) => [pilar(`Pa${i}`, x, 0), pilar(`Pb${i}`, x, 5)]);
  const o = obra(lajes, { vigas, pilares, ocupacao: [] });

  it("original: o ON ERROR volta ao menu (LAJECALC.BAS:169-174) e a L3, depois da L2, fica sem cálculo", () => {
    const p = pavimento(o);
    expect(Object.keys(p.esforcos.momentos)).toEqual(["L1"]);
    expect(Object.keys(p.espessuras)).toEqual(["L1"]);
    expect(p.esforcos.avisos[1]).toBe(
      'L3: não calculada: a opção 5 "todas" do original para na laje L2 (erro de execução, volta ao menu).',
    );
  });

  it("corrigido: a L3 é calculada", () => {
    const p = calcularObraSistrut({ ...o, modoCalculo: "corrigido" }, { modo: "corrigido" })
      .pavimentos[0]!;
    expect(Object.keys(p.esforcos.momentos)).toEqual(["L1", "L3"]);
  });
});

describe("continuidades do LAJECALC 1 (grupo, i por lado, lista confirmada, D10)", () => {
  const vizinhas = (a: Partial<Laje>, b: Partial<Laje>): Laje[] => [
    { ...L1, poligono: retangulo(0, 0, 4, 5), ...a },
    { ...L1, id: "L2", nome: "L2", x: 4, poligono: retangulo(4, 0, 4, 5), ...b },
  ];
  const vigas = [...VIGAS, viga("V5", 4, 0, 8, 0), viga("V6", 4, 5, 8, 5), viga("V7", 8, 0, 8, 5)];
  const pilares = [...PILARES, pilar("P5", 8, 0), pilar("P6", 8, 5)];
  const de = (lajes: Laje[], extra: Partial<Obra["pavimentos"][number]> = {}) =>
    pavimento(comPavimento(obra(lajes, { vigas, pilares, ocupacao: [] }), extra));

  it("grupos diferentes: a automática não liga (LAJECALC.BAS:3709)", () => {
    expect(de(vizinhas({}, {})).painel.continuidades).toHaveLength(1);
    expect(de(vizinhas({}, { grupo: 1 })).painel.continuidades).toEqual([]);
  });

  it("i por lado: CINT(10·1,25 + 2) = CINT(14,5) = 14 (ao par) só no lado da L1; fora da faixa, aviso e 22", () => {
    const p = de(vizinhas({ coeficientesLados: [null, null, 1.25, null] }, {}));
    expect(p.painel.lajes[0]!.codigos[2]).toBe(14);
    expect(p.painel.lajes[1]!.codigos[0]).toBe(22);
    const fora = de(vizinhas({ coeficientesLados: [null, null, 2.5, null] }, {}));
    expect(fora.painel.lajes[0]!.codigos[2]).toBe(22);
    expect(fora.avisos).toEqual(["Laje L1, lado 3: i = 2,5 fora de 0,3 a 2; vale o do engaste."]);
  });

  it("lista confirmada: dois trechos sem vizinha no lado comum, e linhas que o assistente recusa", () => {
    const p = de(vizinhas({}, {}), {
      continuidadesLajes: [
        { lajeA: "L1", ladoA: 2 },
        { lajeA: "L2", ladoA: 0 },
        { lajeA: "L9", ladoA: 0 },
      ],
    });
    expect(p.painel.continuidades).toEqual([
      { lajeA: "L1", bordoA: 2, lajeB: null, bordoB: 2 },
      { lajeA: "L2", bordoA: 0, lajeB: null, bordoB: 0 },
    ]);
    expect(p.painel.lajes.map((l) => l.codigos)).toEqual([
      [0, 0, 22, 0],
      [22, 0, 0, 0],
    ]);
    expect(p.avisos).toEqual([
      "Continuidade L9 lado 1: laje que não existe no pavimento; ignorada.",
    ]);
  });

  it("D10: lados que só coincidem em parte não viram continuidade, como no original", () => {
    // L2 deslocada 2 m para cima: os lados em x = 4 se sobrepõem de y = 2 a 5
    const p = de([
      { ...L1, poligono: retangulo(0, 0, 4, 5) },
      { ...L1, id: "L2", nome: "L2", x: 4, y: 2, poligono: retangulo(4, 2, 4, 5) },
    ]);
    expect(p.painel.continuidades).toEqual([]);
  });
});

// Modelo 3D a partir da obra: cotas, posição, dimensões e rotação conferidas com conta à
// mão (valores esperados escritos nos comentários, não tirados da própria função).
import { describe, expect, it } from "vitest";
import { obraNova, pavimentoNovo } from "../../dominio/criar";
import type { Laje, Obra, Pavimento, Pilar, Viga } from "../../dominio/obra";
import { pavimentoAvulso, reacoesBiapoiada } from "./escada";
import { malhaVazia, paraCena, triangular } from "./geometria";
import { contornoPilar, type Elemento3D, montarModelo, niveisDaObra, type Solido } from "./modelo";
import { elementosNoEixo, trilha, vizinhos } from "./partes";

const pilar = (nome: string, x: number, y: number, extra: Partial<Pilar> = {}): Pilar => ({
  id: `${nome}@${x},${y}`,
  nome,
  x,
  y,
  b: 20,
  h: 40,
  ...extra,
});
const viga = (
  nome: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<Viga> = {},
): Viga => ({
  id: nome,
  nome,
  x1,
  y1,
  x2,
  y2,
  bw: 12,
  h: 50,
  cargaLinear: 0,
  ...extra,
});
const laje = (
  nome: string,
  x: number,
  y: number,
  lx: number,
  ly: number,
  extra: Partial<Laje> = {},
): Laje => ({
  id: nome,
  nome,
  x,
  y,
  lx,
  ly,
  h: 10,
  revestimento: 1,
  sobrecarga: 2,
  vinculos: {},
  mu: 1,
  ...extra,
});
function pav(
  nome: string,
  peDireito: number,
  repeticoes: number,
  p: Partial<Pavimento>,
): Pavimento {
  return { ...pavimentoNovo(nome, peDireito, repeticoes), id: nome, ...p };
}
function obra(pavimentos: Pavimento[]): Obra {
  return { ...obraNova("Teste 3D", "nbr6118-2023"), pavimentos };
}

const por = (els: Elemento3D[], chave: string) => {
  const e = els.find((x) => x.chave === chave);
  if (!e) throw new Error(`sem ${chave}: ${els.map((x) => x.chave).join(", ")}`);
  return e;
};
const prisma = (s: Solido | undefined) => {
  if (s?.tipo !== "prisma") throw new Error("esperava prisma");
  return s;
};
const barra = (s: Solido | undefined) => {
  if (s?.tipo !== "barra") throw new Error("esperava barra");
  return s;
};
const caixa = (pts: { x: number; y: number }[]) => ({
  x0: Math.min(...pts.map((p) => p.x)),
  x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  y1: Math.max(...pts.map((p) => p.y)),
});

// Prédio: TIPO (pé-direito 2,80 m, 2 repetições) na base e COB (3,00 m) no topo.
// Cotas à mão: TIPO 1/2 0 → 2,80; TIPO 2/2 2,80 → 5,60; COB 5,60 → 8,60.
const tipo = pav("TIPO", 2.8, 2, {
  pilares: [pilar("P1", 0, 0), pilar("P2", 4, 0), pilar("P3", 2, 0)],
  vigas: [
    viga("V1", 0, 0, 4, 0, {
      secoes: {
        trechos: [
          { bw: 20, h: 40, bf: 0, hf: 0 },
          { bw: 15, h: 30, bf: 0, hf: 0 },
        ],
      },
    }),
  ],
  lajes: [laje("L1", 0, 0, 4, 5)],
});
const cob = pav("COB", 3, 1, {
  // P2 deslocado 10,5 cm (como na Alpha1); P9 só aqui: nasce sobre viga
  pilares: [
    pilar("P1", 0, 0, { rotacao: 90 }),
    pilar("P2", 4.105, 0),
    pilar("P3", 2, 0),
    pilar("P9", 2, 5, { transicao: true }),
  ],
  vigas: [viga("V1", 0, 0, 4, 0, { secoes: { trechos: [{ bw: 12, h: 50, bf: 60, hf: 10 }] } })],
  lajes: [laje("L1", 0, 0, 4, 5), laje("L2", 4, 0, 2, 5, { grupo: -5 })],
});
const PREDIO = obra([cob, tipo]);
const M = montarModelo(PREDIO);

describe("níveis", () => {
  it("empilha da fundação pela soma dos pés-direitos, com as repetições", () => {
    expect(niveisDaObra(PREDIO).map((n) => [n.nome, n.cotaPiso, n.cota])).toEqual([
      ["TIPO (1/2)", 0, 2.8],
      ["TIPO (2/2)", 2.8, 5.6],
      ["COB", 5.6, 8.6],
    ]);
  });
});

describe("pilares", () => {
  it("lance do nível: do piso à cota, com a seção b × h em cm centrada no ponto", () => {
    const s = prisma(por(M.elementos, "pilar:TIPO#2:P1@0,0").solidos[0]);
    expect(s.z0).toBeCloseTo(2.8, 9);
    expect(s.z1).toBeCloseTo(5.6, 9);
    // b = 20 cm em x, h = 40 cm em y: x ±0,10 e y ±0,20
    expect(caixa(s.base)).toEqual({ x0: -0.1, x1: 0.1, y0: -0.2, y1: 0.2 });
  });

  it("rotação de 90° troca b e h em torno do centro", () => {
    const c = caixa(contornoPilar(pilar("P", 1, 2, { rotacao: 90 })));
    // girado 90°: 40 cm em x (1 ± 0,20) e 20 cm em y (2 ± 0,10)
    expect(c.x0).toBeCloseTo(0.8, 9);
    expect(c.x1).toBeCloseTo(1.2, 9);
    expect(c.y0).toBeCloseTo(1.9, 9);
    expect(c.y1).toBeCloseTo(2.1, 9);
  });

  it("rotação de 30°: o canto (+b/2, +h/2) vai a (u·cos − v·sin, u·sin + v·cos)", () => {
    const [, , canto] = contornoPilar(pilar("P", 0, 0, { rotacao: 30 }));
    // u = 0,10, v = 0,20: x = 0,10·0,8660 − 0,20·0,5 = −0,01340; y = 0,05 + 0,17321 = 0,22321
    expect(canto!.x).toBeCloseTo(-0.0134, 4);
    expect(canto!.y).toBeCloseTo(0.22321, 4);
  });

  it("circular: polígono de raio D/2; poligonal: centro da caixa no ponto, anti-horário", () => {
    const c = contornoPilar(
      pilar("P", 3, 3, { secao: { tipo: "circular", d: 30, dInterno: 0 } }),
      24,
    );
    expect(c).toHaveLength(24);
    expect(c[0]).toEqual({ x: 3.15, y: 3 });
    const p = contornoPilar(
      pilar("P", 3, 3, {
        secao: {
          tipo: "poligonal",
          // horário, como o SISTRUT grava: (0,0) (0,20) (40,20) (40,0)
          vertices: [
            { x: 0, y: 0 },
            { x: 0, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 0 },
          ],
        },
      }),
    );
    expect(caixa(p)).toEqual({ x0: 2.8, x1: 3.2, y0: 2.9, y1: 3.1 });
    // área com sinal > 0 = anti-horário
    const area = p.reduce(
      (t, a, i) => t + a.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * a.y,
      0,
    );
    expect(area).toBeGreaterThan(0);
  });

  it("colunas: casa por nome mesmo deslocado e marca a que nasce sobre viga", () => {
    const resumo = M.colunas.map((c) => [c.nome, c.chaves.length, c.nasceEmTransicao]);
    expect(resumo).toEqual([
      ["P1", 3, false],
      ["P2", 3, false],
      ["P3", 3, false],
      ["P9", 1, true],
    ]);
    // fundação só nas 3 que chegam ao chão
    expect(M.elementos.filter((e) => e.tipo === "fundacao")).toHaveLength(3);
    expect(por(M.elementos, "pilar:COB#1:P9@2,5").notas[0]).toMatch(/transição/);
  });

  it("fundação: bloco com 25 cm de folga em volta da seção, de −0,50 a 0", () => {
    const f = prisma(por(M.elementos, "fundacao:pilar:TIPO#1:P1@0,0").solidos[0]);
    // seção x ±0,10 e y ±0,20, mais 0,25: x ±0,35, y ±0,45
    const c = caixa(f.base);
    expect(c.x0).toBeCloseTo(-0.35, 9);
    expect(c.x1).toBeCloseTo(0.35, 9);
    expect(c.y0).toBeCloseTo(-0.45, 9);
    expect(c.y1).toBeCloseTo(0.45, 9);
    expect([f.z0, f.z1]).toEqual([-0.5, 0]);
  });
});

describe("vigas", () => {
  it("topo na cota do nível, seção do .SEC por trecho entre os nós (pilares)", () => {
    const v = por(M.elementos, "viga:TIPO#1:V1");
    // nós nos pilares x = 0, 2 e 4: trecho 0 de 0 a 2 com 20 × 40, trecho 1 de 2 a 4 com 15 × 30
    const [t0, t1] = v.solidos.map(barra);
    expect([t0!.a.x, t0!.b.x, t0!.a.z, t0!.largura, t0!.altura]).toEqual([0, 2, 2.8, 0.2, 0.4]);
    expect([t1!.a.x, t1!.b.x, t1!.largura, t1!.altura]).toEqual([2, 4, 0.15, 0.3]);
    expect(v.secao).toBe("20 × 40 cm; 15 × 30 cm");
  });

  it("seção T: a mesa bf × hf no topo, junto da alma", () => {
    const v = por(M.elementos, "viga:COB#1:V1");
    const [alma, mesa] = v.solidos.map(barra);
    expect([alma!.largura, alma!.altura, alma!.a.z]).toEqual([0.12, 0.5, 8.6]);
    expect([mesa!.largura, mesa!.altura, mesa!.a.z]).toEqual([0.6, 0.1, 8.6]);
  });
});

describe("lajes", () => {
  it("placa no polígono com a espessura abaixo da cota; a rebaixada desce o rebaixo", () => {
    const l1 = prisma(por(M.elementos, "laje:COB#1:L1").solidos[0]);
    expect([l1.z0, l1.z1].map((z) => Math.round(z * 1000) / 1000)).toEqual([8.5, 8.6]);
    expect(caixa(l1.base)).toEqual({ x0: 0, x1: 4, y0: 0, y1: 5 });
    // grupo −5: rebaixo de 5 cm; topo 8,55 e fundo 8,45
    const l2 = prisma(por(M.elementos, "laje:COB#1:L2").solidos[0]);
    expect(l2.z1).toBeCloseTo(8.55, 9);
    expect(l2.z0).toBeCloseTo(8.45, 9);
  });
});

describe("geometria", () => {
  it("planta (x, y, z) vira cena (x, z, −y)", () => {
    expect(paraCena(1, 2, 3)).toEqual([1, 3, -2]);
  });

  it("prisma de 4 lados: 12 triângulos, normais para fora; barra: 12 triângulos e 12 arestas", () => {
    for (const s of [
      prisma(por(M.elementos, "laje:COB#1:L1").solidos[0]),
      barra(por(M.elementos, "viga:TIPO#1:V1").solidos[0]),
    ] as Solido[]) {
      const m = triangular(malhaVazia(), s);
      expect(m.posicoes.length / 9).toBe(12);
      const n = m.posicoes.length / 3;
      const centro = [0, 1, 2].map((k) => {
        let t = 0;
        for (let i = k; i < m.posicoes.length; i += 3) t += m.posicoes[i]!;
        return t / n;
      });
      for (let t = 0; t < m.posicoes.length; t += 9) {
        const meio = [0, 1, 2].map(
          (k) => (m.posicoes[t + k]! + m.posicoes[t + 3 + k]! + m.posicoes[t + 6 + k]!) / 3,
        );
        const fora = meio.map((v, k) => v - centro[k]!);
        const dot = fora.reduce((x, v, k) => x + v * m.normais[t + k]!, 0);
        expect(dot).toBeGreaterThan(0);
      }
      if (s.tipo === "barra") expect(m.arestas.length / 6).toBe(12);
    }
  });
});

describe("escada do SISTRUT", () => {
  it("reações da biapoiada pela estática", () => {
    // 6 kN/m em [0; 2] e 10 kN em 3, vão 4: ΣF = 12 + 10 = 22; M(esq) = 12·1 + 10·3 = 42
    // R dir = 42/4 = 10,5; R esq = 22 − 10,5 = 11,5
    const r = reacoesBiapoiada(
      viga("E", 0, 0, 4, 0, {
        vaos: [4],
        cargas: [
          { tipo: "distribuida", trecho: 0, inicio: 0, fim: 2, total: 6 },
          { tipo: "concentrada", trecho: 0, posicao: 3, total: 10 },
        ],
      }),
    );
    expect(r![0]).toBeCloseTo(11.5, 9);
    expect(r![1]).toBeCloseTo(10.5, 9);
  });

  // Escada calculada à parte (como o importador a deixa) com 5 kN/m em 4 m: R = 10 kN em
  // cada apoio. O usuário lançou 10 kN em V7 do TER a 2 m do nó e em V7 do SUP a 1,5 m.
  const escada = pav("ESCADA", 3, 1, {
    vigas: [
      viga("VE1", 0, -10, 4, -10, {
        vaos: [4],
        apoiosDesconsiderados: [0, 1],
        cargas: [{ tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: 5 }],
        forma: {
          apoios: [
            { tipo: "V", titulo: "V7" },
            { tipo: "V", titulo: "V7" },
          ],
        },
      }),
    ],
    pilares: [pilar("A0", 0, -10, { transicao: true }), pilar("A1", 4, -10, { transicao: true })],
  });
  const com10 = (posicao: number): Partial<Viga> => ({
    cargas: [{ tipo: "concentrada", trecho: 0, posicao, total: 10 }],
  });
  const andar = (nome: string, pd: number, posicao: number) =>
    pav(nome, pd, 1, {
      pilares: [pilar("P1", 1, 0), pilar("P2", 1, 6)],
      vigas: [viga("V7", 1, 0, 1, 6, com10(posicao))],
    });

  it("reconhece o pavimento de vigas avulsas e não o empilha", () => {
    expect(pavimentoAvulso(escada)).toBe(true);
    expect(pavimentoAvulso(andar("TER", 0.4, 2))).toBe(false);
    const m = montarModelo(obra([escada, andar("SUP", 3.2, 1.5), andar("TER", 0.4, 2)]));
    expect(m.niveis.map((n) => n.nome)).toEqual(["TER", "SUP"]);
  });

  it("põe a viga entre os pontos e níveis das cargas que casam com as reações", () => {
    const m = montarModelo(obra([escada, andar("SUP", 3.2, 1.5), andar("TER", 0.4, 2)]));
    const ve1 = barra(por(m.elementos, "escada:ESCADA:VE1").solidos[0]);
    // V7 vertical em x = 1 com nó em y = 0: TER (cota 0,40) em y = 2; SUP (0,40 + 3,20) em y = 1,5
    expect(ve1.a).toEqual({ x: 1, y: 2, z: 0.4 });
    expect(ve1.b.x).toBe(1);
    expect(ve1.b.y).toBe(1.5);
    expect(ve1.b.z).toBeCloseTo(3.6, 9);
    expect([ve1.largura, ve1.altura]).toEqual([0.12, 0.5]);
    expect(m.avisos.join(" ")).toMatch(
      /VE1 posicionada pelas reações lançadas em V7 \(TER\) e V7 \(SUP\)/,
    );
  });

  it("sem carga que case, mostra ao lado do prédio, com aviso, nunca acima da cobertura", () => {
    const m = montarModelo(
      obra(
        [escada, andar("SUP", 3.2, 1.5), andar("TER", 0.4, 2)].map((p) =>
          p.nome === "ESCADA" ? p : { ...p, vigas: p.vigas.map((v) => ({ ...v, cargas: [] })) },
        ),
      ),
    );
    const ve1 = barra(por(m.elementos, "escada:ESCADA:VE1").solidos[0]);
    // à direita da caixa do prédio (x máx = 1 + 0,10 do P1/P2 + 0,25 da fundação) + 2 m
    expect(ve1.a.x).toBeCloseTo(1.35 + 2, 9);
    expect(ve1.a.z).toBeCloseTo(0.4, 9);
    expect(m.avisos.join(" ")).toMatch(/sem posição deduzível/);
  });
});

describe("partes", () => {
  it("viga com os pilares do eixo e a laje que se apoia nela", () => {
    const v = vizinhos(M, "viga:COB#1:V1");
    expect([...v].sort()).toEqual(
      [
        "viga:COB#1:V1",
        "pilar:COB#1:P1@0,0",
        "pilar:COB#1:P2@4.105,0",
        "pilar:COB#1:P3@2,0",
        // a L2 (x de 4 a 6) só toca a V1 (x de 0 a 4) no canto (4, 0): não se apoia nela
        "laje:COB#1:L1",
      ].sort(),
    );
  });

  it("pilar com a coluna inteira, da fundação ao topo", () => {
    const v = vizinhos(M, "pilar:TIPO#2:P2@4,0");
    for (const k of [
      "fundacao:pilar:TIPO#1:P2@4,0",
      "pilar:TIPO#1:P2@4,0",
      "pilar:TIPO#2:P2@4,0",
      "pilar:COB#1:P2@4.105,0",
    ])
      expect(v.has(k)).toBe(true);
  });

  it("eixo y = 0 pega as vigas, pilares e as lajes que cruzam a faixa", () => {
    const eixo = M.eixos.find((e) => e.direcao === "y" && e.c === 0)!;
    const s = elementosNoEixo(M, eixo);
    expect(s.has("viga:TIPO#1:V1")).toBe(true);
    expect(s.has("pilar:COB#1:P9@2,5")).toBe(false);
    expect(s.has("laje:COB#1:L1")).toBe(true);
  });

  it("trilha: Prédio › nível › elemento; pilar mostra a coluna", () => {
    expect(trilha(M, { tipo: "elemento", chave: "viga:COB#1:V1" }).map((p) => p.rotulo)).toEqual([
      "Prédio",
      "COB",
      "V1",
    ]);
    expect(
      trilha(M, { tipo: "elemento", chave: "pilar:COB#1:P3@2,0" }).map((p) => p.rotulo),
    ).toEqual(["Prédio", "Coluna P3"]);
  });
});

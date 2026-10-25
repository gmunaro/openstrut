// Montagem laje → viga → pilar. Os casos A a E portam T_LAJMONT.BAS (V1),
// com tf convertido para kN (1 tf = 9,80665 kN); os de equilíbrio, balanço e
// viga sobre viga têm os esperados calculados à mão no comentário de cada um.
import { describe, expect, it } from "vitest";
import { lajeNova, pavimentoNovo } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Bordo, Laje, Pavimento, Vinculo } from "../dominio/obra";
import {
  type AnaliseVigaMinima,
  type CargaGQ,
  type MontagemEntrada,
  type VigaMontada,
  montarPavimento,
  verificarEquilibrio,
} from "./montagem";
import { analisarViga } from "./fluxo";
import { tfParaKn } from "./unidades";

const GAMA = 25; // kN/m³
const H = 10; // cm → peso próprio da laje 2,5 kN/m²

/** Análise de teste: cada tramo como biapoiado (balanço: tudo no apoio vizinho).
 *  É estática (soma das reações = soma das cargas), o que basta para a montagem.
 *  Reação de projeto = a total (sem envoltória). */
function analiseIsostatica(v: VigaMontada): AnaliseVigaMinima {
  const reacoes = reacoesIsostaticas(v);
  return { reacoes, reacoesProjeto: reacoes };
}

/** A isostática com uma "envoltória" de teste: reação de projeto = g + 1,5·q. */
function analiseComEnvoltoria(v: VigaMontada): AnaliseVigaMinima {
  const reacoes = reacoesIsostaticas(v);
  return { reacoes, reacoesProjeto: reacoes.map((r) => ({ g: r.g, q: 1.5 * r.q })) };
}

function reacoesIsostaticas(v: VigaMontada) {
  const reacoes: CargaGQ[] = v.nos.map(() => ({ g: 0, q: 0 }));
  v.tramos.forEach((t, i) => {
    const esq = reacoes[i];
    const dir = reacoes[i + 1];
    if (!esq || !dir) throw new Error("nós");
    const livreE = v.apoios[i]?.tipo === "livre";
    const livreD = v.apoios[i + 1]?.tipo === "livre";
    if (livreE && livreD) throw new Error("tramo instável");
    for (const k of ["g", "q"] as const) {
      const qL = t[k] * t.vao;
      const pa = t.concentradas.reduce((s, c) => s + c[k] * c.a, 0);
      const p = t.concentradas.reduce((s, c) => s + c[k], 0);
      if (livreE) dir[k] += qL + p;
      else if (livreD) esq[k] += qL + p;
      else {
        const rd = qL / 2 + pa / t.vao;
        dir[k] += rd;
        esq[k] += qL + p - rd;
      }
    }
  });
  return reacoes;
}

type Reacoes = Record<Bordo, number>;
const reac = (esquerdo: number, inferior: number, direito: number, superior: number): Reacoes => ({
  esquerdo,
  inferior,
  direito,
  superior,
});

/** Laje com carga total p e acidental q (kN/m²), h = 10 cm e γ = 25. */
function laje(
  p: Pavimento,
  x: number,
  y: number,
  lx: number,
  ly: number,
  pTot: number,
  q: number,
  vinculos: Partial<Record<Bordo, Vinculo>> = {},
) {
  const l = lajeNova(
    p,
    { x, y, lx, ly },
    { h: H, sobrecarga: q, revestimento: pTot - q - (H / 100) * GAMA, vinculos },
  );
  p.lajes.push(l);
  return l;
}

const entrada = (pavimento: Pavimento, reacoes: Record<string, Reacoes>): MontagemEntrada => ({
  pavimento,
  reacoes,
  pesoConcreto: GAMA,
});

/** Viga montada cujo eixo passa pelo ponto (x, y) com a orientação dada. */
function vigaEm<V extends VigaMontada>(m: { vigas: V[] }, horizontal: boolean, c: number) {
  const v = m.vigas.find((x) => x.eixo.horizontal === horizontal && Math.abs(x.eixo.c - c) < 1e-9);
  if (!v) throw new Error(`sem viga em ${horizontal ? "y" : "x"} = ${c}`);
  return v;
}

const somaTramos = (vs: VigaMontada[], f: (t: VigaMontada["tramos"][number]) => number) =>
  vs.flatMap((v) => v.tramos).reduce((s, t) => s + f(t) * t.vao, 0);

const tf = tfParaKn;

describe("montarPavimento: casos da V1 (T_LAJMONT.BAS)", () => {
  it("A: laje isolada 4 x 5, p = 1 tf/m², q = 0,25 tf/m²", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 5, tf(1), tf(0.25));
    const pav = gerarEstrutura(p);
    const m = montarPavimento(
      entrada(pav, { [l1.id]: reac(tf(1.1), tf(0.9), tf(1.2), tf(0.95)) }),
      analiseIsostatica,
    );
    expect(m.avisos).toEqual([]);
    expect(m.vigas).toHaveLength(4);
    expect(m.pilares).toHaveLength(4);
    const inf = vigaEm(m, true, 0);
    expect(inf.tramos).toHaveLength(1);
    expect(inf.tramos[0]?.vao).toBeCloseTo(4, 9);
    expect(inf.tramos[0]?.lajes.g).toBeCloseTo(tf(0.9 * 0.75), 9);
    expect(inf.tramos[0]?.lajes.q).toBeCloseTo(tf(0.9 * 0.25), 9);
    const esq = vigaEm(m, false, 0);
    expect(esq.tramos[0]?.vao).toBeCloseTo(5, 9);
    const t = esq.tramos[0];
    expect(t && t.lajes.g + t.lajes.q).toBeCloseTo(tf(1.1), 9);
    // g total = lajes + peso próprio 0,12 · 0,50 · 25 = 1,5 kN/m
    expect(t?.pesoProprio).toBeCloseTo(1.5, 9);
    expect(t?.g).toBeCloseTo(tf(1.1 * 0.75) + 1.5, 9);
    expect(m.pilares[0]).toMatchObject({ nome: "P1", x: 0, y: 5 });
  });

  it("B: duas lajes 4x5 e 3x5 com viga central compartilhada", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 5, tf(1), tf(0.25));
    const l2 = laje(p, 4, 0, 3, 5, tf(1), tf(0.25));
    const pav = gerarEstrutura(p);
    const m = montarPavimento(
      entrada(pav, {
        [l1.id]: reac(tf(1), tf(1), tf(1.2), tf(1)),
        [l2.id]: reac(tf(1.1), tf(0.8), tf(0.9), tf(0.8)),
      }),
      analiseIsostatica,
    );
    expect(m.vigas).toHaveLength(5);
    expect(m.pilares).toHaveLength(6);
    const inf = vigaEm(m, true, 0);
    expect(inf.tramos.map((t) => t.vao)).toEqual([4, 3]);
    const t2 = inf.tramos[1];
    expect(t2 && t2.lajes.g + t2.lajes.q).toBeCloseTo(tf(0.8), 9);
    const central = vigaEm(m, false, 4).tramos[0];
    expect(central && central.lajes.g + central.lajes.q).toBeCloseTo(tf(1.2 + 1.1), 9);
    const total = tf(1 * 5 + 1 * 4 + 1.2 * 5 + 1 * 4) + tf(1.1 * 5 + 0.8 * 3 + 0.9 * 5 + 0.8 * 3);
    expect(somaTramos(m.vigas, (t) => t.lajes.g + t.lajes.q)).toBeCloseTo(total, 9);
  });

  it("C: reações abaixo da carga (falta > 3%) dão aviso; coerentes, não", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 5, tf(1), tf(0.25));
    const e1 = entrada(gerarEstrutura(p), { [l1.id]: reac(tf(0.5), tf(0.5), tf(0.5), tf(0.5)) });
    const eq1 = verificarEquilibrio(e1, montarPavimento(e1, analiseIsostatica));
    // reações somam 0,5 · 18 = 9 tf, bem abaixo da carga da laje: carga perdida
    expect(eq1.avisos.join(" ")).toContain("difere da carga total das lajes");
    expect(eq1.ok).toBe(false);

    const q = pavimentoNovo("T");
    const l2 = laje(q, 0, 0, 4, 4, tf(1), tf(0.25));
    // pL/4 em laje quadrada 4 x 4: 4 · 1 · 4 = 16 = p · 16
    const e2 = entrada(gerarEstrutura(q), { [l2.id]: reac(tf(1), tf(1), tf(1), tf(1)) });
    const m2 = montarPavimento(e2, analiseIsostatica);
    expect(m2.avisos).toEqual([]);
    expect(verificarEquilibrio(e2, m2).avisos).toEqual([]);
  });

  it("D: bordo livre sem viga e sem reação não gera aviso de apoio", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 4, tf(1), tf(0.25), { superior: "livre" });
    const m = montarPavimento(
      entrada(gerarEstrutura(p), { [l1.id]: reac(tf(1), tf(1), tf(1), 0) }),
      analiseIsostatica,
    );
    expect(m.vigas).toHaveLength(3);
    expect(m.avisos.filter((a) => a.includes("sem viga de apoio"))).toEqual([]);
  });

  it("D': bordo livre com reação gera aviso de apoio", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 4, tf(1), tf(0.25), { superior: "livre" });
    const m = montarPavimento(
      entrada(gerarEstrutura(p), { [l1.id]: reac(tf(1), tf(1), tf(1), tf(1)) }),
      analiseIsostatica,
    );
    expect(m.avisos).toEqual(["L1: bordo superior com reação e sem viga de apoio."]);
  });

  it("E: laje sem cálculo interrompe a montagem", () => {
    const p = pavimentoNovo("T");
    laje(p, 0, 0, 4, 4, tf(1), tf(0.25));
    const m = montarPavimento(entrada(gerarEstrutura(p), {}), analiseIsostatica);
    expect(m.avisos.join(" ")).toContain("Lajes sem cálculo (L1)");
    expect(m.vigas).toHaveLength(0);
    expect(m.pilares.every((x) => x.n === 0)).toBe(true);
  });
});

/** Grade 2x2 de lajes 4 x 5, p = 5 kN/m² (g 3,5; q 1,5), reações uniformes
 *  coerentes r = p·A/perímetro = 100/18 kN/m em todos os bordos. */
function grade() {
  const p = pavimentoNovo("T");
  const lajes: Laje[] = [];
  for (const [x, y] of [
    [0, 0],
    [4, 0],
    [0, 5],
    [4, 5],
  ] as const)
    lajes.push(laje(p, x, y, 4, 5, 5, 1.5));
  const r = 100 / 18;
  const reacoes = Object.fromEntries(lajes.map((l) => [l.id, reac(r, r, r, r)]));
  return { pav: gerarEstrutura(p), reacoes, r };
}

describe("equilíbrio laje → viga → pilar", () => {
  // Lajes: 4 · 5 · 20 = 400 kN. Vigas: horizontais 3 · 8 m · (0,12·0,40·25 = 1,2) = 28,8 kN;
  // verticais 3 · 10 m · (0,12·0,50·25 = 1,5) = 45 kN. Total 473,8 kN.
  it("grade 2x2: soma das lajes = soma nas vigas; soma das vigas = soma nos pilares", () => {
    const { pav, reacoes, r } = grade();
    const e = entrada(pav, reacoes);
    const m = montarPavimento(e, analiseIsostatica);
    const eq = verificarEquilibrio(e, m);
    expect(eq.ok).toBe(true);
    expect(eq.cargaLajes).toBeCloseTo(400, 9);
    expect(eq.reacoesLajes).toBeCloseTo(400, 9);
    expect(eq.lajesNasVigas).toBeCloseTo(400, 9);
    expect(eq.cargaVigas).toBeCloseTo(473.8, 9);
    expect(eq.cargaPilares).toBeCloseTo(473.8, 9);
    expect(m.pilares).toHaveLength(9);
    // pilar central: viga horizontal y = 5 dá (2r + 1,2)·4; vertical x = 4 dá (2r + 1,5)·5
    const centro = m.pilares.find((x) => x.x === 4 && x.y === 5);
    expect(centro?.n).toBeCloseTo((2 * r + 1.2) * 4 + (2 * r + 1.5) * 5, 9);
    // parcela acidental: q/p = 1,5/5 das reações das lajes
    expect(centro?.q).toBeCloseTo(2 * r * 0.3 * 4 + 2 * r * 0.3 * 5, 9);
  });

  it("viga sobre viga: sem o pilar central, a horizontal (h 40) se apoia na vertical (h 50)", () => {
    const { pav, reacoes, r } = grade();
    const semCentro = { ...pav, pilares: pav.pilares.filter((x) => !(x.x === 4 && x.y === 5)) };
    const e = entrada(semCentro, reacoes);
    const m = montarPavimento(e, analiseIsostatica);
    expect(m.avisos).toEqual([]);
    const hor = vigaEm(m, true, 5);
    const ver = vigaEm(m, false, 4);
    expect(hor.apoios.map((a) => a.tipo)).toEqual(["pilar", "viga", "pilar"]);
    expect(ver.apoios.map((a) => a.tipo)).toEqual(["pilar", "pilar"]);
    // ordem: a apoiada antes da de apoio
    expect(m.vigas.indexOf(hor)).toBeLessThan(m.vigas.indexOf(ver));
    // concentrada na vertical: (2r + 1,2)·4 a 5 m do apoio inferior
    const conc = ver.tramos[0]?.concentradas;
    expect(conc).toHaveLength(1);
    expect(conc?.[0]?.a).toBeCloseTo(5, 9);
    const P = (2 * r + 1.2) * 4;
    expect((conc?.[0]?.g ?? 0) + (conc?.[0]?.q ?? 0)).toBeCloseTo(P, 9);
    // pilar (4; 10): vertical (2r + 1,5)·10/2 + P/2, mais a horizontal do topo (r + 1,2)·4
    const p410 = m.pilares.find((x) => x.x === 4 && x.y === 10);
    expect(p410?.n).toBeCloseTo((2 * r + 1.5) * 5 + P / 2 + (r + 1.2) * 4, 9);
    const eq = verificarEquilibrio(e, m);
    expect(eq.ok).toBe(true);
    expect(eq.cargaPilares).toBeCloseTo(473.8, 9);
  });

  it("reação de projeto vai aos pilares e à viga de apoio; o equilíbrio usa a total", () => {
    // Mesma grade sem o pilar central, com projeto = g + 1,5q. Na viga horizontal
    // y = 5 o nó x = 4 recebe P = (2r + 1,2)·4, com q = 2r·0,3·4 = 2,4r.
    // - concentrada na vertical: g = P − 2,4r e q = 1,5·2,4r = 3,6r; total P;
    // - acréscimo levado à vertical: 3,6r − 2,4r = 1,2r;
    // - pilares (total) = 473,8 + 1,2r;
    // - q que chega aos pilares = 0,3·400 − 2,4r + 3,6r = 120 + 1,2r; projeto soma
    //   mais 0,5 disso: 473,8 + 1,2r + 60 + 0,6r = 533,8 + 1,8r = 543,8 kN (r = 100/18).
    const { pav, reacoes, r } = grade();
    const semCentro = { ...pav, pilares: pav.pilares.filter((x) => !(x.x === 4 && x.y === 5)) };
    const e = entrada(semCentro, reacoes);
    const m = montarPavimento(e, analiseComEnvoltoria);
    const c = vigaEm(m, false, 4).tramos[0]?.concentradas[0];
    const P = (2 * r + 1.2) * 4;
    expect(c?.g).toBeCloseTo(P - 2.4 * r, 9);
    expect(c?.q).toBeCloseTo(3.6 * r, 9);
    expect(c?.total).toBeCloseTo(P, 9);
    const eq = verificarEquilibrio(e, m);
    expect(eq.avisos).toEqual([]);
    expect(eq.acrescimoTransferido).toBeCloseTo(1.2 * r, 9);
    expect(eq.cargaPilares).toBeCloseTo(473.8 + 1.2 * r, 9);
    expect(eq.cargaPilaresProjeto).toBeCloseTo(543.8, 9);
    // pilar de canto (0; 0): horizontal y = 0 e vertical x = 0, só lajes da L1:
    // q = r·0,3·(4/2 + 5/2) = 1,35r; nProjeto = n + 0,5·1,35r
    const canto = m.pilares.find((x) => x.x === 0 && x.y === 0);
    expect(canto?.n).toBeCloseTo((r + 1.2) * 2 + (r + 1.5) * 2.5, 9);
    expect(canto?.nProjeto).toBeCloseTo((r + 1.2) * 2 + (r + 1.5) * 2.5 + 0.675 * r, 9);
  });

  it("viga que termina sobre outra se apoia nela (T sem pilar)", () => {
    // L1 0..8 x 0..5 embaixo; L2 e L3 4 x 5 em cima: a vertical x = 4 vai de 5 a 10
    const p = pavimentoNovo("T");
    const ls = [
      laje(p, 0, 0, 8, 5, 5, 1.5),
      laje(p, 0, 5, 4, 5, 5, 1.5),
      laje(p, 4, 5, 4, 5, 5, 1.5),
    ];
    const g = gerarEstrutura(p);
    const pav = { ...g, pilares: g.pilares.filter((x) => !(x.x === 4 && x.y === 5)) };
    const reacoes = Object.fromEntries(
      ls.map((l) => {
        const r = (5 * l.lx * l.ly) / (2 * (l.lx + l.ly));
        return [l.id, reac(r, r, r, r)];
      }),
    );
    const e = entrada(pav, reacoes);
    const m = montarPavimento(e, analiseIsostatica);
    const ver = vigaEm(m, false, 4);
    expect(ver.apoios.map((a) => a.tipo)).toEqual(["viga", "pilar"]);
    const hor = vigaEm(m, true, 5);
    expect(hor.apoios.map((a) => a.tipo)).toEqual(["pilar", "pilar"]);
    expect(hor.tramos[0]?.concentradas[0]?.a).toBeCloseTo(4, 9);
    expect(verificarEquilibrio(e, m).ok).toBe(true);
  });
});

describe("balanço", () => {
  // L1 4 x 5 (100 kN) e L2 1,5 x 5 (37,5 kN) com o bordo direito livre; sem os pilares
  // em x = 5,5, as vigas horizontais têm balanço de 1,5 m. r de L2 = 37,5/8 nos três
  // bordos apoiados. Vigas: horizontais 2 · 5,5 · 1,2 = 13,2; verticais 2 · 5 · 1,5 = 15.
  it("vigas com balanço na ponta: apoio livre, tramo de 1,5 m e equilíbrio", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 5, 5, 1.5);
    const l2 = laje(p, 4, 0, 1.5, 5, 5, 1.5, { direito: "livre" });
    const g = gerarEstrutura(p);
    expect(g.pilares).toHaveLength(6);
    const pav = { ...g, pilares: g.pilares.filter((x) => x.x !== 5.5) };
    const r1 = 100 / 18;
    const r2 = 37.5 / 8;
    const e = entrada(pav, { [l1.id]: reac(r1, r1, r1, r1), [l2.id]: reac(r2, r2, 0, r2) });
    const m = montarPavimento(e, analiseIsostatica);
    expect(m.avisos).toEqual([]);
    const inf = vigaEm(m, true, 0);
    expect(inf.apoios.map((a) => a.tipo)).toEqual(["pilar", "pilar", "livre"]);
    expect(inf.tramos.map((t) => t.vao)).toEqual([4, 1.5]);
    const t2 = inf.tramos[1];
    expect(t2 && t2.g + t2.q).toBeCloseTo(r2 + 1.2, 9);
    // pilar (4; 0): tramo 4 m metade + balanço inteiro (horizontal) + vertical x = 4 metade
    const p40 = m.pilares.find((x) => x.x === 4 && x.y === 0);
    expect(p40?.n).toBeCloseTo((r1 + 1.2) * 2 + (r2 + 1.2) * 1.5 + (r1 + r2 + 1.5) * 2.5, 9);
    const eq = verificarEquilibrio(e, m);
    expect(eq.ok).toBe(true);
    expect(eq.cargaPilares).toBeCloseTo(137.5 + 13.2 + 15, 9);
  });

  it("viga com um só apoio não é calculada e o equilíbrio acusa a carga perdida", () => {
    const p = pavimentoNovo("T");
    const l1 = laje(p, 0, 0, 4, 4, 5, 1.5);
    const g = gerarEstrutura(p);
    const pav = { ...g, pilares: g.pilares.filter((x) => !(x.y === 4)) };
    const e = entrada(pav, { [l1.id]: reac(5, 5, 5, 5) });
    const m = montarPavimento(e, analiseIsostatica);
    expect(m.avisos).toContain(`Viga ${pav.vigas[0]?.nome} sem apoios suficientes: não calculada.`);
    // sem os pilares de cima, a viga superior e as duas verticais ficam com um apoio
    expect(m.naoCalculadas).toHaveLength(3);
    expect(verificarEquilibrio(e, m).ok).toBe(false);
  });
});

// Cargas próprias (as do .VIG do SISTRUT na NBR 6118): no lugar das das lajes.
describe("cargasProprias", () => {
  // viga de 4 m entre P1 (x = 0) e P2 (x = 4): uniforme 10 kN/m, trecho de 5 kN/m em
  // [0, 2] e concentrada de 8 kN em 1 m. Isostática: R1 = 10·4/2 + 5·2·3/4 + 8·3/4 =
  // 20 + 7,5 + 6 = 33,5; R2 = 40 + 10 + 8 − 33,5 = 24,5
  function pavimento(): Pavimento {
    const pav = pavimentoNovo("P");
    return {
      ...pav,
      vigas: [{ id: "v", nome: "V1", x1: 0, y1: 0, x2: 4, y2: 0, bw: 20, h: 50, cargaLinear: 3 }],
      pilares: [
        { id: "p1", nome: "P1", x: 0, y: 0, b: 20, h: 20 },
        { id: "p2", nome: "P2", x: 4, y: 0, b: 20, h: 20 },
      ],
    };
  }
  const proprias = {
    v: [
      {
        vao: 4,
        g: 10,
        q: 0,
        parciais: [{ a: 0, b: 2, g: 5 }],
        concentradas: [{ a: 1, g: 8, q: 0 }],
      },
    ],
  };

  it("substituem peso próprio e carga linear e chegam aos pilares: 33,5 e 24,5 kN", () => {
    const e = { ...entrada(pavimento(), {}), cargasProprias: proprias };
    const m = montarPavimento(e, analisarViga);
    const n = Object.fromEntries(m.pilares.map((p) => [p.nome, p.n]));
    expect(n.P1).toBeCloseTo(33.5, 9);
    expect(n.P2).toBeCloseTo(24.5, 9);
    const eq = verificarEquilibrio(e, m);
    expect(eq.cargaVigas).toBeCloseTo(58, 9);
    expect(eq.avisos).toEqual([]);
  });

  it("comprimento diferente do da planta: ficam as cargas da montagem, com aviso", () => {
    const e = {
      ...entrada(pavimento(), {}),
      cargasProprias: { v: [...proprias.v, ...proprias.v] },
    };
    const m = montarPavimento(e, analisarViga);
    // peso próprio 0,2 · 0,5 · 25 = 2,5 + carga linear 3 = 5,5 kN/m · 4 m / 2 = 11 kN
    expect(m.pilares.find((p) => p.nome === "P1")?.n).toBeCloseTo(11, 9);
    expect(m.avisos).toContainEqual(
      expect.stringMatching(/^Viga V1: o comprimento no .VIG do SISTRUT difere do da planta/),
    );
  });

  // .VIG com 1 tramo de 4 m e a planta com P3 em x = 2 (2 tramos): pela posição,
  // tramo 1 = 10 em [0, 2] + 5 em [0, 2] + 8 em 1; tramo 2 = 10 em [0, 2]. Total 58 kN.
  it("número de tramos diferente: as cargas vão pela posição ao longo da viga", () => {
    const pav = pavimento();
    const comP3 = {
      ...pav,
      pilares: [...pav.pilares, { id: "p3", nome: "P3", x: 2, y: 0, b: 20, h: 20 }],
    };
    const e = { ...entrada(comP3, {}), cargasProprias: proprias };
    const m = montarPavimento(e, analisarViga);
    const [t1, t2] = m.vigas[0]!.tramos;
    expect(t1).toMatchObject({ vao: 2, g: 0, q: 0 });
    expect(t1!.parciais).toEqual([
      { a: 0, b: 2, g: 10, q: 0 },
      { a: 0, b: 2, g: 5 },
    ]);
    expect(t1!.concentradas).toMatchObject([{ a: 1, g: 8, q: 0, origem: "" }]);
    expect(t2!.parciais).toEqual([{ a: 0, b: 2, g: 10, q: 0 }]);
    expect(t2!.concentradas).toEqual([]);
    expect(m.pilares.reduce((s, p) => s + p.n, 0)).toBeCloseTo(58, 9);
    expect(m.avisos).toContainEqual(
      expect.stringMatching(/^Viga V1: 1 tramos no .VIG do SISTRUT e 2 na planta/),
    );
  });
});

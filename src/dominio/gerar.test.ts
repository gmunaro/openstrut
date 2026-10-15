// Geração de vigas e pilares. Esperados derivados à mão das regras da V1
// (LAJEGEOT.BM, LAJMONT.BM) e dos testes T_LAJEGEOM.BAS e T_LAJMONT.BAS.
import { describe, expect, it } from "vitest";
import { tfParaKn } from "../calculo/unidades";
import { calcularObra } from "../calculo/fluxo";
import { nb178 } from "../calculo/normas";
import { lajeNova, obraNova, pavimentoNovo } from "./criar";
import { alturaInicial, gerarEstrutura } from "./gerar";
import type { Bordo, Laje, Pavimento, Viga, Vinculo } from "./obra";

function pav(...ret: [number, number, number, number, Partial<Record<Bordo, Vinculo>>?][]) {
  const p = pavimentoNovo("T");
  for (const [x, y, lx, ly, vinculos] of ret)
    p.lajes.push(lajeNova(p, { x, y, lx, ly }, vinculos ? { vinculos } : {}));
  return p;
}

/** Nome da viga sobre o bordo da laje (como Laj().vigas da V1). */
function vigaDoBordo(p: Pavimento, l: Laje, b: Bordo) {
  const geometria: Record<Bordo, [number, number, number, number]> = {
    esquerdo: [l.x, l.y, l.x, l.y + l.ly],
    inferior: [l.x, l.y, l.x + l.lx, l.y],
    direito: [l.x + l.lx, l.y, l.x + l.lx, l.y + l.ly],
    superior: [l.x, l.y + l.ly, l.x + l.lx, l.y + l.ly],
  };
  const [x1, y1, x2, y2] = geometria[b];
  const contem = (v: Viga) =>
    v.x1 <= x1 + 1e-9 &&
    v.x2 >= x2 - 1e-9 &&
    v.y1 <= y1 + 1e-9 &&
    v.y2 >= y2 - 1e-9 &&
    (y1 === y2 ? v.y1 === y1 && v.y2 === y1 : v.x1 === x1 && v.x2 === x1);
  return p.vigas.find(contem)?.nome ?? "-";
}

const vigasDaLaje = (p: Pavimento, l: Laje) =>
  (["esquerdo", "inferior", "direito", "superior"] as const)
    .map((b) => vigaDoBordo(p, l, b))
    .join("/");

const viga = (p: Pavimento, nome: string) => {
  const v = p.vigas.find((x) => x.nome === nome);
  if (!v) throw new Error(`sem ${nome}`);
  return v;
};

const coords = (p: Pavimento) => p.pilares.map((x) => `${x.nome}(${x.x};${x.y})`).join(" ");

describe("gerarEstrutura", () => {
  it("1 laje isolada 4 x 5 (T_LAJEGEOM caso 2; T_LAJMONT A)", () => {
    const p = gerarEstrutura(pav([0, 0, 4, 5]));
    const [l1] = p.lajes;
    if (!l1) throw new Error();
    expect(vigasDaLaje(p, l1)).toBe("V3/V2/V4/V1");
    expect(p.vigas).toHaveLength(4);
    expect(p.pilares).toHaveLength(4);
    // P1 é o canto superior esquerdo; ordem y decrescente, x crescente
    expect(coords(p)).toBe("P1(0;5) P2(4;5) P3(0;0) P4(4;0)");
    // seção inicial 12 x vão/10: verticais 5 m → 50; horizontais 4 m → 40
    expect([viga(p, "V3").bw, viga(p, "V3").h]).toEqual([12, 50]);
    expect([viga(p, "V1").bw, viga(p, "V1").h]).toEqual([12, 40]);
    expect(viga(p, "V1").cargaLinear).toBe(0);
    // eixo do bordo superior, da esquerda para a direita
    expect(viga(p, "V1")).toMatchObject({ x1: 0, y1: 5, x2: 4, y2: 5 });
  });

  it("2 lajes lado a lado 4x5 e 3x5: viga comum única e bordas contínuas (T_LAJEGEOM caso 1)", () => {
    const p = gerarEstrutura(pav([0, 0, 4, 5], [4, 0, 3, 5]));
    const [l1, l2] = p.lajes;
    if (!l1 || !l2) throw new Error();
    expect(vigasDaLaje(p, l1)).toBe("V3/V2/V4/V1");
    expect(vigasDaLaje(p, l2)).toBe("V4/V2/V5/V1");
    expect(p.vigas).toHaveLength(5);
    // bordas superior e inferior são uma viga contínua de 0 a 7 m
    expect(viga(p, "V1")).toMatchObject({ x1: 0, y1: 5, x2: 7, y2: 5, h: 40 });
    expect(viga(p, "V2")).toMatchObject({ x1: 0, y1: 0, x2: 7, y2: 0 });
    // 6 pilares (T_LAJMONT B, T_FLUXO)
    expect(coords(p)).toBe("P1(0;5) P2(4;5) P3(7;5) P4(0;0) P5(4;0) P6(7;0)");
  });

  it("grade 2x2 de lajes 4x5: 3 + 3 vigas contínuas e pilar central (T_LAJEGEOM caso 3)", () => {
    const p = gerarEstrutura(pav([0, 0, 4, 5], [4, 0, 4, 5], [0, 5, 4, 5], [4, 5, 4, 5]));
    const esperado = ["V4/V3/V5/V2", "V5/V3/V6/V2", "V4/V2/V5/V1", "V5/V2/V6/V1"];
    p.lajes.forEach((l, i) => expect(vigasDaLaje(p, l)).toBe(esperado[i]));
    expect(p.vigas).toHaveLength(6);
    expect(p.pilares).toHaveLength(9);
    expect(p.pilares.find((x) => x.x === 4 && x.y === 5)?.nome).toBe("P5");
    // segunda geração sobre o resultado: mesma estrutura, mesmos ids
    const q = gerarEstrutura(p);
    expect(q).toEqual(p);
  });

  it("balanço: laje com três bordos livres não gera vigas neles", () => {
    const p = gerarEstrutura(
      pav([0, 0, 4, 5], [4, 0, 1.5, 5, { inferior: "livre", direito: "livre", superior: "livre" }]),
    );
    expect(p.vigas).toHaveLength(4);
    expect(p.vigas.map((v) => [v.x1, v.y1, v.x2, v.y2])).toEqual([
      [0, 5, 4, 5],
      [0, 0, 4, 0],
      [0, 0, 0, 5],
      [4, 0, 4, 5],
    ]);
    expect(p.pilares).toHaveLength(4);
  });

  it("bordo livre: 3 vigas (T_LAJMONT D)", () => {
    const p = gerarEstrutura(pav([0, 0, 4, 4, { superior: "livre" }]));
    expect(p.vigas).toHaveLength(3);
  });

  it("h mínimo de 30 cm e arredondamento a 5 cm (V1 LmMonta)", () => {
    expect(alturaInicial(2)).toBe(30);
    expect(alturaInicial(4.2)).toBe(45);
    expect(alturaInicial(5)).toBe(50);
    expect(alturaInicial(5.000000000000001)).toBe(50);
  });

  it("preserva nome e seção editados e renumera os nomes automáticos", () => {
    let p = gerarEstrutura(pav([0, 0, 4, 5]));
    const v3 = viga(p, "V3");
    p = {
      ...p,
      vigas: p.vigas.map((v) =>
        v.id === v3.id ? { ...v, nome: "VE", bw: 20, h: 60, cargaLinear: 7 } : v,
      ),
      pilares: p.pilares.map((x) => (x.nome === "P1" ? { ...x, nome: "PA", b: 25, h: 40 } : x)),
    };
    // nova laje acima: as verticais crescem, e a viga de topo vira interna
    p.lajes.push(lajeNova(p, { x: 0, y: 5, lx: 4, ly: 5 }));
    const q = gerarEstrutura(p);
    const ve = q.vigas.find((v) => v.id === v3.id);
    expect(ve).toMatchObject({
      nome: "VE",
      bw: 20,
      h: 60,
      cargaLinear: 7,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 10,
    });
    expect(q.pilares.find((x) => x.nome === "PA")).toMatchObject({ x: 0, y: 5, b: 25, h: 40 });
    // horizontais renumeradas de cima para baixo: y = 10 → V1, 5 → V2, 0 → V3
    expect(q.vigas.slice(0, 3).map((v) => [v.nome, v.y1])).toEqual([
      ["V1", 10],
      ["V2", 5],
      ["V3", 0],
    ]);
    // a antiga V1 (topo, y = 5) mantém o id e passa a se chamar V2
    expect(viga(q, "V2").id).toBe(p.vigas.find((v) => v.y1 === 5 && v.y2 === 5)?.id);
    expect(q.lajes.map((l) => l.nome)).toEqual(["L1", "L2"]);
  });

  it("mantém pilar intermediário do usuário sobre uma viga e remove pilar solto", () => {
    const p = gerarEstrutura(pav([0, 0, 8, 5]));
    p.pilares.push(
      { id: "meio", nome: "P9", x: 4, y: 0, b: 20, h: 20 },
      { id: "solto", nome: "PX", x: 20, y: 20, b: 20, h: 20 },
    );
    const q = gerarEstrutura(p);
    expect(q.pilares.map((x) => x.id)).toContain("meio");
    expect(q.pilares.map((x) => x.id)).not.toContain("solto");
    expect(coords(q)).toBe("P1(0;5) P2(8;5) P3(0;0) P4(4;0) P5(8;0)");
  });

  it("bordos colineares separados por um vão viram vigas distintas", () => {
    const p = gerarEstrutura(pav([0, 0, 3, 3], [5, 0, 3, 3]));
    expect(p.vigas.filter((v) => v.y1 === 0 && v.y2 === 0)).toHaveLength(2);
  });
});

describe("pilares removidos pelo usuário", () => {
  const removido = (x: number, y: number) => ({
    ...pav([0, 0, 4, 5], [4, 0, 3, 5]),
    pilaresRemovidos: [{ x, y }],
  });

  it("não recria pilar na posição removida e a viga segue contínua sobre o ponto", () => {
    const p = gerarEstrutura(removido(4, 5));
    expect(coords(p)).toBe("P1(0;5) P2(7;5) P3(0;0) P4(4;0) P5(7;0)");
    expect(p.pilaresRemovidos).toEqual([{ x: 4, y: 5 }]);
    // mesmas 5 vigas; a de cima continua de 0 a 7 m, agora com um vão de 7 m:
    // h inicial = 7 m / 10 = 70 cm (a de baixo, vãos 4 e 3, fica com 40)
    expect(p.vigas).toHaveLength(5);
    expect(viga(p, "V1")).toMatchObject({ x1: 0, y1: 5, x2: 7, y2: 5, h: 70 });
    expect(viga(p, "V2")).toMatchObject({ x1: 0, y1: 0, x2: 7, y2: 0, h: 40 });
    // regenerar de novo não muda nada
    expect(gerarEstrutura(p)).toEqual(p);
  });

  it("descarta posição que deixou de ser extremidade ou cruzamento e posição com pilar", () => {
    const base = gerarEstrutura(pav([0, 0, 4, 5], [4, 0, 3, 5]));
    const p = gerarEstrutura({
      ...base,
      pilaresRemovidos: [
        { x: 20, y: 20 },
        { x: 0, y: 0 },
      ],
    });
    // (20; 20) não é ponto de pilar; (0; 0) já tem pilar, que fica
    expect(p.pilaresRemovidos).toEqual([]);
    expect(p.pilares).toHaveLength(6);
  });
});

// Montagem com um pilar removido: o nó (4; 5) deixa de ser apoio. A viga do topo
// (y = 5, 0..7 m) fica com um tramo só de 7 m, e a viga vertical x = 4 termina no
// ponto e se apoia nela (regra da montagem: a que termina se apoia na que passa).
// Esperado à mão: viga biapoiada de 7 m com as divisões de carga do .VIG (q·A/L de
// cada laje no trecho dela, LAJEMONT) e a concentrada P (reação da viga x = 4) em
// a = 4 m: R(7) = Σ(cargas × braço)/7 e R(0) = Σ cargas − R(7) (estática).
describe("montagem com pilar removido", () => {
  const obra = obraNova("R", "nb1-78");
  const base = { ...obra.pavimentos[0]!, nome: "T" };
  const l1 = lajeNova(base, { x: 0, y: 0, lx: 4, ly: 5 });
  const l2 = lajeNova({ ...base, lajes: [l1] }, { x: 4, y: 0, lx: 3, ly: 5 });
  const pavimento = gerarEstrutura({
    ...base,
    lajes: [l1, l2],
    pilaresRemovidos: [{ x: 4, y: 5 }],
  });
  const resultado = calcularObra({ ...obra, pavimentos: [pavimento] }, nb178);
  const r = resultado.pavimentos[0]!;
  const montada = (nome: string) => {
    const v = r.montagem.vigas.find((x) => x.nome === nome);
    if (!v) throw new Error(`sem ${nome}`);
    return v;
  };

  it("viga do topo: um tramo de 7 m entre dois pilares, com a viga x = 4 como carga", () => {
    const v1 = montada("V1");
    const vertical = montada(viga(pavimento, "V4").nome);
    expect(vertical.eixo).toMatchObject({ horizontal: false, c: 4 });
    expect(v1.nos).toEqual([0, 7]);
    expect(v1.apoios.map((a) => a.tipo)).toEqual(["pilar", "pilar"]);
    expect(vertical.apoios.map((a) => a.tipo)).toEqual(["pilar", "viga"]);
    const t = v1.tramos[0]!;
    expect(t.vao).toBe(7);
    expect(t.concentradas).toHaveLength(1);
    const c = t.concentradas[0]!;
    expect(c.a).toBeCloseTo(4, 9);
    expect(c.origem).toBe("V4");
    // P = reação da viga vertical no topo
    const reacaoTopo = vertical.analise.reacoes[1]!;
    expect(c.g + c.q).toBeCloseTo(reacaoTopo.g + reacaoTopo.q, 9);

    const vig = resultado.sistrut!.pavimentos[0]!.vigasVig.find((x) => x.nome === "V1")!;
    let anterior = 0;
    let soma = 0;
    let momento = 0;
    for (const d of vig.tramos[0]!.divisoes) {
      const w = d.p * (d.d - anterior);
      soma += w + d.f;
      momento += (w * (anterior + d.d)) / 2 + d.f * d.d;
      anterior = d.d;
    }
    expect(tfParaKn(vig.tramos[0]!.divisoes.reduce((x, d) => x + d.f, 0))).toBeCloseTo(
      c.g + c.q,
      9,
    );
    const [ra, rb] = v1.analise.reacoes;
    expect(rb!.g + rb!.q).toBeCloseTo(tfParaKn(momento / 7), 4);
    expect(ra!.g + ra!.q).toBeCloseTo(tfParaKn(soma - momento / 7), 4);
    expect(t.vao).toBe(7);
  });

  it("5 pilares recebem toda a carga das vigas (equilíbrio fecha)", () => {
    expect(r.montagem.pilares).toHaveLength(5);
    expect(r.montagem.naoCalculadas).toEqual([]);
    expect(r.equilibrio.avisos).toEqual([]);
    const soma = r.montagem.pilares.reduce((s, p) => s + p.n, 0);
    expect(soma).toBeCloseTo(r.equilibrio.cargaVigas, 6);
  });
});

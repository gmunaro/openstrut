// DXF da planta de formas de uma obra pequena: estrutura do arquivo R12 (pares
// código/valor, seções, camadas) e coordenadas conferidas à mão contra a obra.
import { describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Laje, Obra } from "../dominio/obra";
import { hachuraRetangulo } from "./dxf";
import { CAMADAS_FORMAS, dxfFormasObra, dxfPlantaFormas, ESPACO_PAVIMENTOS } from "./plantaFormas";

const laje = (id: string, x: number): Laje => ({
  id,
  nome: id,
  x,
  y: 0,
  lx: 4,
  ly: 5,
  mu: 1,
  h: 10,
  revestimento: 1,
  sobrecarga: 1.5,
  vinculos: {},
});

/** Duas lajes 4 × 5 m lado a lado, x de 0 a 8 m, com vigas e pilares gerados. */
function obraPequena(): Obra {
  const obra = obraNova("Casa Ávila", "nb1-78");
  const base = obra.pavimentos[0];
  if (!base) throw new Error("sem pavimento");
  const pav = gerarEstrutura({ ...base, nome: "Térreo", lajes: [laje("L1", 0), laje("L2", 4)] });
  return { ...obra, pavimentos: [pav] };
}

type Par = { codigo: number; valor: string };

/** Lê o DXF em pares código/valor; falha se um código não for inteiro. */
function pares(dxf: string): Par[] {
  const linhas = dxf.split("\r\n");
  expect(linhas.pop()).toBe(""); // termina com CRLF
  expect(linhas.length % 2).toBe(0);
  const ps: Par[] = [];
  for (let i = 0; i < linhas.length; i += 2) {
    const codigo = linhas[i] ?? "";
    expect(codigo).toMatch(/^ *-?\d+$/);
    ps.push({ codigo: Number(codigo), valor: linhas[i + 1] ?? "" });
  }
  return ps;
}

type Ent = { tipo: string; grupos: Par[]; vertices: { x: number; y: number }[] };

/** Entidades da seção ENTITIES; POLYLINE junta os VERTEX até o SEQEND. */
function entidades(ps: Par[]): Ent[] {
  const ini = ps.findIndex(
    (p, i) => p.codigo === 2 && p.valor === "ENTITIES" && ps[i - 1]?.valor === "SECTION",
  );
  const ents: Ent[] = [];
  let aberta: Ent | undefined;
  for (let i = ini + 1; i < ps.length; i++) {
    const p = ps[i] as Par;
    if (p.codigo === 0) {
      if (p.valor === "ENDSEC") break;
      if (p.valor === "VERTEX") {
        const x = Number(ps.find((q, j) => j > i && q.codigo === 10)?.valor);
        const y = Number(ps.find((q, j) => j > i && q.codigo === 20)?.valor);
        aberta?.vertices.push({ x, y });
        continue;
      }
      if (p.valor === "SEQEND") continue;
      aberta = { tipo: p.valor, grupos: [], vertices: [] };
      ents.push(aberta);
      continue;
    }
    if (aberta && aberta.vertices.length === 0) aberta.grupos.push(p);
  }
  return ents;
}

const grupo = (e: Ent, c: number) => e.grupos.find((g) => g.codigo === c)?.valor;
const daCamada = (es: Ent[], c: string) => es.filter((e) => grupo(e, 8) === c);
const textos = (es: Ent[]) => es.filter((e) => e.tipo === "TEXT").map((e) => grupo(e, 1));

describe("DXF da planta de formas", () => {
  const obra = obraPequena();
  const pav = obra.pavimentos[0];
  if (!pav) throw new Error("sem pavimento");
  const dxf = dxfPlantaFormas(obra, pav);
  const ps = pares(dxf);
  const es = entidades(ps);

  it("tem HEADER R12, TABLES, ENTITIES e EOF bem formados, com as camadas", () => {
    const secoes = ps.flatMap((p, i) =>
      p.codigo === 0 && p.valor === "SECTION" ? [ps[i + 1]?.valor] : [],
    );
    expect(secoes).toEqual(["HEADER", "TABLES", "ENTITIES"]);
    expect(ps.filter((p) => p.codigo === 0 && p.valor === "ENDSEC")).toHaveLength(3);
    expect(ps.at(-1)).toEqual({ codigo: 0, valor: "EOF" });
    const ver = ps.findIndex((p) => p.valor === "$ACADVER");
    expect(ps[ver + 1]).toEqual({ codigo: 1, valor: "AC1009" });
    // nada de entidade fora do R12
    expect(new Set(es.map((e) => e.tipo))).toEqual(new Set(["POLYLINE", "LINE", "TEXT"]));

    const camadas = ps.flatMap((p, i) =>
      p.codigo === 0 && p.valor === "LAYER" ? [ps[i + 1]?.valor] : [],
    );
    expect(camadas).toEqual(["LAJES", "VIGAS", "PILARES", "HACHURA", "TEXTOS", "COTAS", "TITULO"]);
    expect(camadas).toEqual(CAMADAS_FORMAS.map((c) => c.nome));
    // toda entidade usa uma camada declarada
    for (const e of es) expect(camadas).toContain(grupo(e, 8));
  });

  it("contorno das lajes nas coordenadas da obra, em cm", () => {
    // L1: x 0..4 m, y 0..5 m → (0,0) (400,0) (400,500) (0,500)
    // L2: x 4..8 m             → (400,0) (800,0) (800,500) (400,500)
    const lajes = daCamada(es, "LAJES");
    expect(lajes.map((e) => [grupo(e, 70), e.vertices])).toEqual([
      [
        "1",
        [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 500 },
          { x: 0, y: 500 },
        ],
      ],
      [
        "1",
        [
          { x: 400, y: 0 },
          { x: 800, y: 0 },
          { x: 800, y: 500 },
          { x: 400, y: 500 },
        ],
      ],
    ]);
  });

  it("pilares 20x20 centrados nos cruzamentos, hachurados por dentro", () => {
    // P1..P6 em (0,5) (4,5) (8,5) (0,0) (4,0) (8,0) m → centro em cm ± 10
    const centros = [
      [0, 500],
      [400, 500],
      [800, 500],
      [0, 0],
      [400, 0],
      [800, 0],
    ];
    const pilares = daCamada(es, "PILARES");
    expect(pilares.map((e) => e.vertices)).toEqual(
      centros.map(([x = 0, y = 0]) => [
        { x: x - 10, y: y - 10 },
        { x: x + 10, y: y - 10 },
        { x: x + 10, y: y + 10 },
        { x: x - 10, y: y + 10 },
      ]),
    );
    // hachura: linhas a 45° (Δx = Δy) dentro de algum pilar
    const hachura = daCamada(es, "HACHURA");
    expect(hachura.length).toBeGreaterThanOrEqual(6 * 5);
    for (const l of hachura) {
      const [x1 = NaN, y1 = NaN, x2 = NaN, y2 = NaN] = [10, 20, 11, 21].map((c) =>
        Number(grupo(l, c)),
      );
      expect(Math.abs(x2 - x1 - (y2 - y1))).toBeLessThan(1e-6);
      const dentro = centros.some(
        ([x = 0, y = 0]) =>
          Math.min(x1, x2) >= x - 10 - 1e-6 &&
          Math.max(x1, x2) <= x + 10 + 1e-6 &&
          Math.min(y1, y2) >= y - 10 - 1e-6 &&
          Math.max(y1, y2) <= y + 10 + 1e-6,
      );
      expect(dentro).toBe(true);
    }
  });

  it("vigas pela largura bw em volta do eixo", () => {
    // V1: eixo y = 5 m, x 0..8 m, bw 12 → y 494..506 cm
    const v1 = daCamada(es, "VIGAS")[0];
    expect(v1?.vertices).toEqual([
      { x: 0, y: 494 },
      { x: 800, y: 494 },
      { x: 800, y: 506 },
      { x: 0, y: 506 },
    ]);
  });

  it("rótulos, cotas e título", () => {
    const t = textos(es);
    expect(t).toEqual(
      expect.arrayContaining(["L1 h=10", "L2 h=10", "V1 12x40", "V3 12x50", "P1 20x20"]),
    );
    // cotas: x parciais 400 + 400 e total 800; y só a total 500
    const cotas = textos(daCamada(es, "COTAS"));
    expect(cotas.sort()).toEqual(["400", "400", "500", "800"]);
    // título: acentos como \U+XXXX (DXF R12 é ANSI); área 78,66 m² (formas.test.ts: 78,664 com o pilar até o fundo da laje)
    expect(t).toContain("PLANTA DE FORMAS - T\\U+00E9rreo");
    expect(t).toContain("Obra: Casa \\U+00C1vila - medidas em cm");
    expect(t).toContain("\\U+00C1rea de f\\U+00F4rma: 78,66 m\\U+00B2 por pavimento");
  });

  it("obra inteira: um arquivo, pavimentos lado a lado em x", () => {
    const dois: Obra = { ...obra, pavimentos: [pav, { ...pav, id: "p2", nome: "Tipo" }] };
    const es2 = entidades(pares(dxfFormasObra(dois)));
    const lajes = daCamada(es2, "LAJES");
    expect(lajes).toHaveLength(4);
    // o primeiro fica na posição da obra; o segundo deslocado só em x, de mais que o desenho
    expect(lajes[0]?.vertices[0]).toEqual({ x: 0, y: 0 });
    const d = (lajes[2]?.vertices[0]?.x ?? 0) - 0;
    expect(d).toBeGreaterThan(800 + ESPACO_PAVIMENTOS);
    expect(lajes[2]?.vertices.map((v) => v.y)).toEqual([0, 0, 500, 500]);
    expect(lajes[3]?.vertices[0]?.x).toBeCloseTo(d + 400, 6);
  });
});

describe("hachura", () => {
  it("quadrado 20 × 20 com passo 5: linhas a 45° recortadas no quadrado", () => {
    // retas y = x + k com Δk = 5√2 ≈ 7,071; k = −12,929, −5,858, 1,213, 8,284, 15,355
    // (de −20 + Δk até < 20): 5 retas. A primeira vai de (12,929; 0) a (20; 7,071).
    const ls = hachuraRetangulo("H", 0, 0, 20, 20, 5);
    expect(ls).toHaveLength(5);
    const l = ls[0];
    if (l?.tipo !== "linha") throw new Error("esperava linha");
    expect([l.x1, l.y1, l.x2, l.y2].map((v) => Number(v.toFixed(3)))).toEqual([
      12.929, 0, 20, 7.071,
    ]);
  });
});

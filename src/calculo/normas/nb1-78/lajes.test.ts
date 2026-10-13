// Casos de V1 tests/T_LAJCALC.BAS (momentos, reações, flecha, espessura,
// compatibilização, distribuição, seção insuficiente) e da parte de flexão e
// malha de tests/T_CALCCA.BAS, convertidos de tf para kN. Os esperados são
// soluções fechadas ou os valores de referência da V1.
import { describe, expect, it } from "vitest";
import type { Bordo, Vinculo } from "../../../dominio/obra";
import { areaBarra } from "../../barras";
import type { LajeEntrada, LajeEsforcos, MateriaisCalc } from "../../tipos";
import {
  asFlexao,
  compatibilizaNegativoNb178,
  flechaElastica,
  lajeArmaduraNb178,
  lajeEsforcosNb178,
  lajeEspessuraNb178,
  linhaNeutra,
  mdLimite,
  momentosCharneiras,
  reacoesAreas,
  xdLimite,
} from "./lajes";

/** 1 tf = 9,80665 kN; 1 tf/cm² = 98,0665 MPa. */
const TF = 9.80665;
const TFCM2 = 98.0665;

/** Materiais da V1 nos testes: fck 0,15 tf/cm², fyk 5 tf/cm², Es 2100 tf/cm², γc 1,4, γs 1,15. */
const fck = 0.15 * TFCM2;
const mat: MateriaisCalc = {
  fck,
  fcd: fck / 1.4,
  sigmaCd: (0.85 * fck) / 1.4,
  fyk: 5 * TFCM2,
  fyd: (5 * TFCM2) / 1.15,
  fywd: (5 * TFCM2) / 1.15,
  ecs: 0.9 * 6600 * Math.sqrt(fck + 3.5),
  es: 2100 * TFCM2,
  aco: "CA-50",
  acoEstribo: "CA-50",
};

const LETRA: Record<string, Vinculo> = { A: "apoiado", E: "engastado", L: "livre" };
/** Vínculos na notação da V1: 4 letras na ordem esquerdo, inferior, direito, superior. */
const v = (s: string): Record<Bordo, Vinculo> => ({
  esquerdo: LETRA[s[0]!]!,
  inferior: LETRA[s[1]!]!,
  direito: LETRA[s[2]!]!,
  superior: LETRA[s[3]!]!,
});

/** Laje com carga da V1 em tf/m²: g = h/100 · 2,5 + gAdicional. */
const entrada = (
  lx: number,
  ly: number,
  bordos: string,
  h: number,
  gAd: number,
  q: number,
): LajeEntrada => ({
  nome: "L1",
  lx,
  ly,
  h,
  g: ((h / 100) * 2.5 + gAd) * TF,
  q: q * TF,
  vinculos: v(bordos),
});

describe("momentos por charneiras (V1 LcMomentos)", () => {
  it("quadrada apoiada: m = pL²/24, cruz", () => {
    const m = momentosCharneiras(4, 4, v("AAAA"), TF);
    expect(m.mx).toBeCloseTo((16 / 24) * TF, 6);
    expect(m.tipo).toBe("cruz");
  });
  it("uma direção apoiada: pl²/8, my = 0", () => {
    const m = momentosCharneiras(4, 10, v("AAAA"), TF);
    expect(m.mx).toBeCloseTo(2 * TF, 6);
    expect(m.my).toBe(0);
    expect(m.tipo).toBe("ux");
  });
  it("biengastada i = 2: positivo pl²/24 e negativos pl²/12", () => {
    const m = momentosCharneiras(4, 10, v("EAEA"), TF);
    expect(m.mx).toBeCloseTo((16 / 24) * TF, 6);
    expect(m.negativos.esquerdo).toBeCloseTo((16 / 12) * TF, 6);
    expect(m.negativos.direito).toBeCloseTo((16 / 12) * TF, 6);
  });
  it("balanço: X = pl²/2", () => {
    const m = momentosCharneiras(1.5, 4, v("ELLL"), TF);
    expect(m.negativos.esquerdo).toBeCloseTo(1.125 * TF, 6);
    expect(m.tipo).toBe("bx");
  });
  it("bordo livre à direita: vence ly, my = p ly²/8", () => {
    const m = momentosCharneiras(4, 5, v("AALA"), TF);
    expect(m.tipo).toBe("uy");
    expect(m.mx).toBe(0);
    expect(m.my).toBeCloseTo((25 / 8) * TF, 6);
  });
  it("dois livres: não suportada", () => {
    expect(momentosCharneiras(4, 5, v("ALLA"), TF).tipo).toBeNull();
  });
  it("Johansen retangular apoiada 4×6 (a/b = 2/3)", () => {
    const m = momentosCharneiras(4, 6, v("AAAA"), TF);
    expect(m.mx).toBeCloseTo((16 / 24) * (Math.sqrt(3 + 4 / 9) - 2 / 3) ** 2 * TF, 6);
  });
});

describe("reações pelo processo das áreas (V1 LcReacoes)", () => {
  it("quadrada: pL/4 em todos os bordos", () => {
    const r = reacoesAreas(4, 4, v("AAAA"), TF);
    expect(Math.abs(r.esquerdo - TF)).toBeLessThan(0.01 * TF);
    expect(Math.abs(r.superior - TF)).toBeLessThan(0.01 * TF);
  });
  it("4×6: bordo curto p·4/4, bordo longo p·8/6", () => {
    const r = reacoesAreas(4, 6, v("AAAA"), TF);
    expect(Math.abs(r.inferior - TF)).toBeLessThan(0.01 * TF);
    expect(Math.abs(r.esquerdo - (8 / 6) * TF)).toBeLessThan(0.01 * TF);
  });
  it("bordos mistos: equilíbrio e engastado carrega mais que o apoiado oposto", () => {
    const p = 1.3 * TF;
    const r = reacoesAreas(4, 5, v("EAAE"), p);
    expect(
      Math.abs(r.esquerdo * 5 + r.inferior * 4 + r.direito * 5 + r.superior * 4 - p * 20),
    ).toBeLessThan(0.001 * TF);
    expect(r.esquerdo).toBeGreaterThan(r.direito);
  });
  it("balanço: tudo no engaste, livre sem reação", () => {
    const r = reacoesAreas(1.5, 4, v("ELLL"), TF);
    expect(Math.abs(r.esquerdo * 4 - 6 * TF)).toBeLessThan(0.001 * TF);
    expect(r.direito).toBe(0);
  });
});

describe("flecha (V1 LcFlecha#)", () => {
  const ei = (mat.ecs * 1000 * 0.1 ** 3) / 12; // kN·m²/m, h = 10 cm
  it("Ec = 0,9 · 6600 √(fck + 3,5) MPa", () => {
    expect(mat.ecs).toBeCloseTo(0.9 * 6600 * Math.sqrt(0.15 * 98.0665 + 3.5), 6);
  });
  it("uma direção apoiada: 5pl⁴/384EI", () => {
    expect(flechaElastica(4, 10, v("AAAA"), TF, 10, mat.ecs)).toBeCloseTo(
      ((5 * 256 * TF) / (384 * ei)) * 100,
      9,
    );
  });
  it("quadrada apoiada (Marcus/Grashof, kx = 1/2): 5 · ½ · pl⁴/384EI", () => {
    expect(flechaElastica(4, 4, v("AAAA"), TF, 10, mat.ecs)).toBeCloseTo(
      ((2.5 * 256 * TF) / (384 * ei)) * 100,
      9,
    );
  });
  it("cruz < faixa isolada", () => {
    expect(flechaElastica(4, 4, v("AAAA"), TF, 10, mat.ecs)!).toBeLessThan(
      flechaElastica(4, 10, v("AAAA"), TF, 10, mat.ecs)!,
    );
  });
  it("balanço: pl⁴/8EI", () => {
    expect(flechaElastica(1.5, 4, v("ELLL"), TF, 10, mat.ecs)).toBeCloseTo(
      ((1.5 ** 4 * TF) / (8 * ei)) * 100,
      9,
    );
  });
  it("lajeEsforcos: total = f_g · 3 + f_q e limite = menor vão/300", () => {
    const e = entrada(4, 4, "AAAA", 10, 0.1, 0.15);
    const esf = lajeEsforcosNb178(e, mat);
    const f = (p: number) => ((2.5 * 256 * p) / (384 * ei)) * 100;
    expect(esf.flecha).toBeCloseTo(f(e.g) * 3 + f(e.q), 9);
    expect(esf.flechaLimite).toBeCloseTo(400 / 300, 12);
    expect(esf.avisos).toEqual([]);
  });
  it("lajeEsforcos: flecha acima do limite vira aviso", () => {
    const esf = lajeEsforcosNb178(entrada(7, 8, "AAAA", 6, 0.1, 1), mat);
    expect(esf.flecha).toBeGreaterThan(esf.flechaLimite);
    expect(esf.avisos.some((a) => a.includes("flecha total"))).toBe(true);
  });
});

describe("espessura (V1 LcEspessura#)", () => {
  const laje = { lx: 5, ly: 6, vinculos: v("AAAA"), gAdicional: 0.1 * TF, q: 0.15 * TF };
  const gama = 2.5 * TF;
  const fl = (p: number, h: number) => flechaElastica(5, 6, v("AAAA"), p, h, mat.ecs)!;
  it("sem fluência: h atende l/300 e h − 1 não atende", () => {
    const h = lajeEspessuraNb178(laje, mat, gama, 1)!;
    expect(h).toBeGreaterThanOrEqual(6);
    expect(h).toBeLessThanOrEqual(60);
    expect(fl((h / 100) * gama + 0.25 * TF, h)).toBeLessThanOrEqual(500 / 300);
    const falha =
      fl(((h - 1) / 100) * gama + 0.25 * TF, h - 1) > 500 / 300 || fl(0.15 * TF, h - 1) > 500 / 500;
    expect(falha).toBe(true);
  });
  it("fluência 3: espessura maior ou igual e flecha total com fator 3 atende l/300", () => {
    const h1 = lajeEspessuraNb178(laje, mat, gama, 1)!;
    const h3 = lajeEspessuraNb178(laje, mat, gama, 3)!;
    expect(h3).toBeGreaterThanOrEqual(h1);
    expect(fl((h3 / 100) * gama + 0.1 * TF, h3) * 3 + fl(0.15 * TF, h3)).toBeLessThanOrEqual(
      500 / 300,
    );
  });
  it("espessura automática de laje 4×5 entre 6 e 15 cm", () => {
    const h = lajeEspessuraNb178({ ...laje, lx: 4, ly: 5 }, mat, gama, 1)!;
    expect(h).toBeGreaterThanOrEqual(6);
    expect(h).toBeLessThanOrEqual(15);
  });
  it("tipo não suportado: null", () => {
    expect(lajeEspessuraNb178({ ...laje, vinculos: v("ALLA") }, mat, gama)).toBeNull();
  });
});

describe("compatibilização (V1 LcCompatibiliza#)", () => {
  it("max((Xa+Xb)/2; 0,8 max)", () => {
    expect(compatibilizaNegativoNb178(2, 1)).toBeCloseTo(1.6, 12);
    expect(compatibilizaNegativoNb178(2, 1.8)).toBeCloseTo(1.9, 12);
  });
});

describe("flexão simples (V1 CcaAsFlexao#, T_CALCCA)", () => {
  // Laje b = 100, d = 8, Mk = 0,5 tf·m/m → Md = 70 tf·cm
  const md = 70 * TF;
  const fcd = mat.fcd / 10;
  const fyd = mat.fyd / 10;
  it("equilíbrio de forças e de momentos", () => {
    const x = linhaNeutra(md, 100, 8, mat.fcd, mat.fyd, mat.es)!;
    const as = asFlexao(md, 100, 8, mat.fcd, mat.fyd, mat.es)!;
    expect(0.85 * fcd * 100 * 0.8 * x).toBeCloseTo(as * fyd, 6);
    expect(as * fyd * (8 - 0.4 * x)).toBeCloseTo(md, 6);
  });
  it("valor de referência As = 2,1505 cm²/m", () => {
    expect(Math.abs(asFlexao(md, 100, 8, mat.fcd, mat.fyd, mat.es)! - 2.1505)).toBeLessThan(0.001);
  });
  it("momento nulo: 0; acima do limite: null; logo abaixo: resolve", () => {
    const lim = mdLimite(100, 8, mat.fcd, mat.fyd, mat.es);
    expect(asFlexao(0, 100, 8, mat.fcd, mat.fyd, mat.es)).toBe(0);
    expect(asFlexao(lim * 1.01, 100, 8, mat.fcd, mat.fyd, mat.es)).toBeNull();
    expect(asFlexao(lim * 0.999, 100, 8, mat.fcd, mat.fyd, mat.es)!).toBeGreaterThan(0);
  });
  it("x/d limite CA-50 = 0,0035 / (0,0035 + fyd/Es)", () => {
    expect(xdLimite(mat.fyd, mat.es)).toBeCloseTo(0.0035 / (0.0035 + 5 / 1.15 / 2100), 10);
  });
});

/** Esforços montados à mão para testar só a armadura. */
const esforcos = (
  mx: number,
  my: number,
  neg: Partial<Record<Bordo, number>> = {},
): LajeEsforcos => ({
  mx,
  my,
  negativos: { esquerdo: 0, inferior: 0, direito: 0, superior: 0, ...neg },
  reacoes: { esquerdo: 1, inferior: 1, direito: 1, superior: 1 },
  flecha: 0,
  flechaLimite: 1,
  avisos: [],
  memoria: [],
});

describe("armadura da laje (V1 LcAs#, LcCalculaTodas, CcaEscolheMalha)", () => {
  const e = entrada(4, 5, "AAAA", 10, 0.1, 0.15);
  it("Mk 0,5 tf·m/m, h 10, c 1,5 (d = 8): As = 2,1505 cm²/m e malha φ5 c/9", () => {
    const a = lajeArmaduraNb178(e, esforcos(0.5 * TF, 0.5 * TF), mat, 1.5);
    expect(Math.abs(a.asx - 2.1505)).toBeLessThan(0.001);
    expect(a.barrasX).toEqual({ phi: 5, espacamento: 9 });
    expect((areaBarra(a.barrasX.phi) * 100) / a.barrasX.espacamento).toBeGreaterThanOrEqual(a.asx);
  });
  it("mínimos: 0,15% de 100 × 10 no positivo e 0,10% no negativo; momento nulo sem armadura", () => {
    const a = lajeArmaduraNb178(e, esforcos(0.01, 0.01, { direito: 0.01 }), mat, 1.5);
    expect(a.asx).toBeCloseTo(1.5, 12);
    expect(a.asNegativos.direito).toBeCloseTo(1.0, 12);
    expect(a.asNegativos.esquerdo).toBe(0);
    expect(a.barrasNegativos.esquerdo).toBeUndefined();
    expect(a.avisos).toEqual([]);
  });
  it("laje armada numa direção (3×8): distribuição = max(principal/5; 0,9)", () => {
    const e1 = entrada(3, 8, "AAAA", 10, 0.1, 0.15);
    const a = lajeArmaduraNb178(e1, lajeEsforcosNb178(e1, mat), mat, 1.5);
    expect(a.asy).toBeCloseTo(Math.max(a.asx / 5, 0.9), 12);
    expect(a.asy).toBeGreaterThanOrEqual(0.9);
    expect(a.asx).toBeGreaterThanOrEqual(0.0015 * 100 * 10);
  });
  it("seção insuficiente (7×8, h 6, q 1 tf/m²): NaN e aviso", () => {
    const e1 = entrada(7, 8, "AAAA", 6, 0.1, 1);
    const a = lajeArmaduraNb178(e1, lajeEsforcosNb178(e1, mat), mat, 1.5);
    expect(a.asx).toBeNaN();
    expect(a.avisos.some((t) => t.includes("seção insuficiente"))).toBe(true);
  });
});

describe("lajeEsforcosNb178", () => {
  it("configuração não suportada: esforços nulos e aviso", () => {
    const esf = lajeEsforcosNb178(entrada(4, 5, "ALLA", 10, 0.1, 0.15), mat);
    expect(esf.mx).toBe(0);
    expect(esf.reacoes.esquerdo).toBe(0);
    expect(esf.avisos.length).toBe(1);
  });
  it("reações em equilíbrio com a carga total", () => {
    const e = entrada(4, 5, "EAAE", 10, 0.1, 0.15);
    const r = lajeEsforcosNb178(e, mat).reacoes;
    const soma = (r.esquerdo + r.direito) * 5 + (r.inferior + r.superior) * 4;
    expect(soma).toBeCloseTo((e.g + e.q) * 20, 6);
  });
  it("registra memória com referência", () => {
    const esf = lajeEsforcosNb178(entrada(4, 5, "AAEA", 10, 0.1, 0.15), mat);
    expect(esf.memoria.length).toBeGreaterThan(5);
    expect(esf.memoria.every((m) => m.descricao.length > 0)).toBe(true);
  });
});

describe("CA-25 (taxas mínimas não conferidas para lajes)", () => {
  it("aviso com CA-25; mínimos da V1 mantidos (0,15 % · 100 · 10 = 1,5)", () => {
    const e = entrada(4, 5, "AAAA", 10, 0.1, 0.15);
    const ca25 = { ...mat, aco: "CA-25" as const };
    const a = lajeArmaduraNb178(e, esforcos(0.01, 0.01), ca25, 1.5);
    expect(a.asx).toBeCloseTo(1.5, 12);
    expect(a.avisos.some((x) => x.includes("CA-25"))).toBe(true);
  });
});

describe("armadura ortótropa μ = my/mx (T_LAJCALC.BAS:130-158)", () => {
  // Quadrada apoiada L = 4, p = 1, μ = 2. Trabalho virtual com a cumeeira a c dos
  // bordos x: máximo em c = 1,6458 → mx = (√3,5 − √0,5)²/3 = 0,451416; my = 2 mx
  const ref = (Math.sqrt(3.5) - Math.sqrt(0.5)) ** 2 / 3;
  it("AAAA 4 × 4, μ = 2: mx = (√3,5 − √0,5)²/3, my = 2 mx, cruz", () => {
    const m = momentosCharneiras(4, 4, v("AAAA"), 1, 2, 2);
    expect(ref).toBeCloseTo(0.451416, 6);
    expect(m.mx).toBeCloseTo(ref, 9);
    expect(m.my).toBeCloseTo(2 * ref, 9);
    expect(m.tipo).toBe("cruz");
  });
  it("μ = 1 é a isótropa: pL²/24", () => {
    expect(momentosCharneiras(4, 4, v("AAAA"), 1, 2, 1).mx).toBeCloseTo(16 / 24, 12);
  });
  // AEAE, i = 2, μ = 2: lyr = 2·4/(2√3) = 4/√3, afim lyr/√2 → a = 4/√6 < b = 4:
  // mx = a²/24 (√(3 + (a/4)²) − a/4)², my = 2 mx, X inferior = X superior = i·my = 4 mx
  it("AEAE, μ = 2: mx pela laje afim e negativos em y = i·μ·mx", () => {
    const a = 4 / Math.sqrt(6);
    const mxRef = ((a * a) / 24) * (Math.sqrt(3 + (a / 4) ** 2) - a / 4) ** 2;
    const m = momentosCharneiras(4, 4, v("AEAE"), 1, 2, 2);
    expect(m.mx).toBeCloseTo(mxRef, 9);
    expect(m.negativos.inferior).toBeCloseTo(4 * mxRef, 9);
    expect(m.negativos.superior).toBeCloseTo(4 * mxRef, 9);
    expect(m.negativos.esquerdo + m.negativos.direito).toBe(0);
  });
  it("lajeEsforcosNb178 com μ = 2: 4 × 4, h 10, p = 0,5 tf/m² → mx = 0,5·ref, my = 2 mx", () => {
    const esf = lajeEsforcosNb178(entrada(4, 4, "AAAA", 10, 0.1, 0.15), mat, 2);
    expect(esf.mx / TF).toBeCloseTo(0.5 * ref, 9);
    expect(esf.my / TF).toBeCloseTo(ref, 9);
  });
});

describe("aço classe B nas lajes (T_LAJCALC.BAS:160-170)", () => {
  // d = 8, b = 100; momento com x/d = 0,5 (x = 4): Md = 0,68 fcd 100·4·6,4 = 186,51
  // tf·cm → m = 1,3322 tf·m/m. A: x/d lim 0,628 > 0,5 → As = 0,68 fcd 100 x / fyd =
  // 6,703 cm²/m. B: x/d lim 0,462 < 0,5 → seção insuficiente.
  const fcdT = 0.15 / 1.4;
  const fydT = 5 / 1.15;
  const mT = (0.68 * fcdT * 100 * 4 * (8 - 1.6)) / 140;
  const e = entrada(4, 5, "AAAA", 10, 0.1, 0.15);
  it("classe A (padrão): As = 6,703 cm²/m", () => {
    const a = lajeArmaduraNb178(e, esforcos(mT * TF, 0), mat, 1.5);
    expect(a.asx).toBeCloseTo((0.68 * fcdT * 100 * 4) / fydT, 6);
    expect((0.68 * fcdT * 100 * 4) / fydT).toBeCloseTo(6.703, 3);
  });
  it("classe B: seção insuficiente (NaN e aviso)", () => {
    const a = lajeArmaduraNb178(e, esforcos(mT * TF, 0), mat, 1.5, "B");
    expect(a.asx).toBeNaN();
    expect(a.avisos.some((t) => t.includes("seção insuficiente"))).toBe(true);
  });
  it("x/d limite: A 0,628, B 0,462", () => {
    expect(xdLimite(mat.fyd, mat.es, "B")).toBeCloseTo(0.0035 / (0.0035 + fydT / 2100 + 0.002), 10);
    expect(xdLimite(mat.fyd, mat.es, "B")).toBeCloseTo(0.46233, 4);
  });
});

describe("cortante na laje sem estribos: só aviso (T_LAJCALC.BAS:193-209)", () => {
  // Balanço ELLL 0,8 × 5, h 10, p = 0,25 + 0,1 + 3 = 3,35 tf/m²: r1 = p l = 2,68 tf/m;
  // τwd = 1,4·2,68/800 = 0,00469 tf/cm² > τwu1 = 0,07 √14,71 MPa = 0,0027378 tf/cm²
  const e = entrada(0.8, 5, "ELLL", 10, 0.1, 3);
  const esf = lajeEsforcosNb178(e, mat);
  const a = lajeArmaduraNb178(e, esf, mat, 1.5);
  it("r1 = p l = 2,68 tf/m", () => {
    expect(Math.abs(esf.reacoes.esquerdo / (3.35 * 0.8 * TF) - 1)).toBeLessThanOrEqual(0.001);
  });
  it("τwu1 = 0,07 √fck = 0,0027378 tf/cm² e τwd = 0,00469 tf/cm²", () => {
    const valor = (d: string) => a.memoria.find((m) => m.descricao.startsWith(d))?.valor ?? NaN;
    expect(valor("Limite da laje sem armadura")).toBeCloseTo(0.07 * Math.sqrt(0.15 * TFCM2), 9);
    expect(valor("Limite da laje sem armadura") / TFCM2).toBeCloseTo(0.0027378, 6);
    expect(valor("Tensão de cisalhamento") / TFCM2).toBeCloseTo((1.4 * 2.68) / 800, 4);
  });
  it("aviso de cortante, sem seção insuficiente, e armadura inalterada", () => {
    expect(a.avisos.some((t) => t.includes("cortante"))).toBe(true);
    expect(a.avisos.some((t) => t.includes("seção insuficiente"))).toBe(false);
    // X1 = p l²/2 = 1,072 tf·m/m; r = 1,4·3,35·0,32·100/(0,425·100·64·fcd) = 0,5150
    const fcdT = 0.15 / 1.4;
    const rT = (1.4 * 3.35 * 0.32 * 100) / (0.425 * 100 * 64 * fcdT);
    const asRef = (0.68 * fcdT * 100 * 8 * 1.25 * (1 - Math.sqrt(1 - rT))) / (5 / 1.15);
    expect(a.asNegativos.esquerdo).toBeCloseTo(asRef, 6);
  });
});

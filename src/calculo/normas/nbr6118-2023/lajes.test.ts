// Lajes maciças pela NBR 6118:2023. Exemplos E02 e E03 de docs/norma/exemplos.md
// (Bastos, Lajes de Concreto, ex. 3.17, pp. 45-59) e casos com conta à mão a
// partir dos coeficientes de tabelasBares.ts, gerados por scripts/bares (valores
// literais aqui, não lidos do arquivo).
// E01 (ex. 3.16.2, laje com borda livre) não vira teste: usa as tabelas A-22 e
// A-24 de outra coleção (P/coef.), não transcritas, e o esquema de vinculação
// é figura não verificada; o motor não calcula laje com um bordo livre.
import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import type { Bordo, Vinculo } from "../../../dominio/obra";
import type { LajeEntrada, LajeEsforcos } from "../../tipos";
import {
  alturasUteisPositivas,
  classificaLaje6118,
  coeficienteBares,
  compatibilizaNegativo6118,
  fatorFluencia,
  flechaImediata,
  flexaoLaje,
  inerciaII,
  lajeArmadura6118,
  lajeEsforcos6118,
  linhaNeutraII,
  momentoFissuracao,
  rigidezEquivalente,
} from "./lajes";
import { materiais6118 } from "./materiais";
import { BARES } from "./tabelasBares";

const mat = (fck = 25) => materiais6118({ ...obraNova("x", "nbr6118-2023").materiais, fck });

/** |valor − esperado| ≤ tol. */
const perto = (valor: number, esperado: number, tol: number) =>
  expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(tol);

const vinc = (engastados: Bordo[] = [], livres: Bordo[] = []): Record<Bordo, Vinculo> => {
  const v: Record<Bordo, Vinculo> = {
    esquerdo: "apoiado",
    inferior: "apoiado",
    direito: "apoiado",
    superior: "apoiado",
  };
  for (const b of engastados) v[b] = "engastado";
  for (const b of livres) v[b] = "livre";
  return v;
};

const laje = (
  lx: number,
  ly: number,
  h: number,
  g: number,
  q: number,
  vinculos: Record<Bordo, Vinculo>,
): LajeEntrada => ({ nome: "L", lx, ly, h, g, q, vinculos });

/** Esforços montados à mão para testar só a armadura. */
const esforcos = (p: Partial<LajeEsforcos>): LajeEsforcos => ({
  mx: 0,
  my: 0,
  negativos: { esquerdo: 0, inferior: 0, direito: 0, superior: 0 },
  reacoes: { esquerdo: 0, inferior: 0, direito: 0, superior: 0 },
  flecha: 0,
  flechaLimite: 0,
  avisos: [],
  memoria: [],
  ...p,
});

// Ecs do C25: αi = 0,8 + 0,2·25/80 = 0,8625; Eci = 5600·√25 = 28 000 → 24 150 MPa.
const ECS_C25 = 0.8625 * 5600 * 5;
/** EI da faixa de 1 m, kN·m²/m. */
const eiBruta = (h: number) => (ECS_C25 * 1000 * (h / 100) ** 3) / 12;

describe("tabelas de Bares: interpolação e classificação", () => {
  it("interpola linearmente em λ; λ > 2 usa a linha '> 2,00' (tipo 3)", () => {
    const mx3 = BARES["3"].mx;
    // μx(1,00) = 2,69; μx(1,05) = 2,95 → λ = 1,03: 2,69 + 0,6 · 0,26 = 2,846
    expect(coeficienteBares(mx3, 1.03)).toBeCloseTo(2.846, 9);
    expect(coeficienteBares(mx3, 2)).toBeCloseTo(5.71, 9);
    expect(coeficienteBares(mx3, 2.5)).toBeCloseTo(7.03, 9);
  });

  it("tipo pelos engastes; lx da tabela é o menor vão (transpõe quando lx > ly)", () => {
    const c1 = classificaLaje6118(4, 5, vinc(["direito"]));
    expect(c1).toMatchObject({ metodo: "tabela", tipo: "2B", transposta: false });
    // superior engastado numa laje 5 × 4: na tabela, lx = 4 (vão y) e o superior é x-bordo → 2B
    const c2 = classificaLaje6118(5, 4, vinc(["superior"]));
    expect(c2).toMatchObject({ metodo: "tabela", tipo: "2B", transposta: true, lambda: 1.25 });
    expect(classificaLaje6118(4, 5, vinc(["inferior", "superior", "direito"]))).toMatchObject({
      tipo: "5A",
    });
    expect(classificaLaje6118(2, 5, vinc())).toMatchObject({ tipo: "1", umaDirecao: true });
    expect(
      classificaLaje6118(1.5, 4, vinc(["esquerdo"], ["inferior", "direito", "superior"])),
    ).toEqual({ metodo: "balanco", engaste: "esquerdo", vao: 1.5 });
    expect(classificaLaje6118(4, 5, vinc([], ["direito"])).metodo).toBe("sem-tabela");
  });
});

describe("E02: laje L2, tipo 3 (Bastos, Lajes, ex. 3.17, pp. 45-57)", () => {
  // x = 5,86 m, y = 6,06 m, h = 12 cm, g = 4,28, q = 1,5 kN/m², C25. Inferior e
  // direito engastados (tipo 3: bordos I e D da Figura 10).
  const v = vinc(["inferior", "direito"]);
  // Bastos usa a linha λ = 1,05 das tabelas (y/x = 1,034 arredondado para cima).
  // Com ly = 1,05 · 5,86 o motor lê exatamente essa linha.
  const e = laje(5.86, 1.05 * 5.86, 12, 4.28, 1.5, v);
  const r = lajeEsforcos6118(e, mat());

  it("momentos da Tabela 18 (p. 52): Mx 5,84; M'x 14,75; My 5,32; M'y 14,25 kN·m/m", () => {
    // Bastos multiplica p lx²/100 = 1,985 pelos coeficientes impressos de Bares
    // (μx 2,94; μ'x 7,43; μy 2,68; μ'y 7,18). A tabela gerada pela teoria de placas
    // dá 2,95; 7,40; 2,70; 7,15: diferença ≤ 0,03 em μ, ≤ 0,06 kN·m/m aqui.
    perto(r.mx, 5.84, 0.07);
    perto(r.negativos.direito, 14.75, 0.07);
    perto(r.my, 5.32, 0.07);
    perto(r.negativos.inferior, 14.25, 0.07);
    expect(r.negativos.esquerdo).toBe(0);
    expect(r.negativos.superior).toBe(0);
  });

  it("reações da Tabela 17 (p. 49): Vx 7,69; V'x 11,25; Vy 7,35; V'y 10,74 kN/m", () => {
    perto(r.reacoes.esquerdo, 7.69, 0.01);
    perto(r.reacoes.direito, 11.25, 0.01);
    perto(r.reacoes.superior, 7.35, 0.01);
    perto(r.reacoes.inferior, 10.74, 0.01);
  });

  it("flecha (pp. 55-57): Ma < Mr, estádio I; at = 0,85 cm; limite 586/250 = 2,34 cm", () => {
    // Bastos usa Ecs = 24 080 MPa (αi arredondado 0,86); o motor usa 24 150:
    // at = 0,846 · 24 080 / 24 150 = 0,844.
    perto(r.flecha, 0.85, 0.01);
    perto(r.flechaLimite, 2.34, 0.005);
    expect(r.avisos).toEqual([]);
  });

  it("com o λ real (1,034) os momentos ficam entre as linhas 1,00 e 1,05", () => {
    const real = lajeEsforcos6118(laje(5.86, 6.06, 12, 4.28, 1.5, v), mat());
    const t = (6.06 / 5.86 - 1) / 0.05;
    const base = (5.78 * 5.86 ** 2) / 100;
    perto(real.mx, (2.69 + t * (2.95 - 2.69)) * base, 1e-9);
    perto(real.negativos.inferior, (6.94 + t * (7.15 - 6.94)) * base, 1e-9);
  });

  it("Mr = 1,5 · 0,2565 · 14 400 / 6 = 923 kN·cm (p. 56)", () => {
    perto(momentoFissuracao(25, 12), 9.23, 0.005);
  });

  it("ai = (2,72/12) p x⁴ / EI = 0,36 cm com EI = 34 675 200 kN·cm² (p. 56)", () => {
    perto(flechaImediata(2.72, 4.73, 5.86, 3467.52), 0.36, 0.005);
    perto(0.36 * (1 + fatorFluencia()), 0.835, 0.001); // at com ai impresso (p. 57)
  });

  it("armadura positiva (p. 54): Mk 5,84, d = 9,5 → As = 2,07 cm²/m; mínimo 0,10 h = 1,20", () => {
    // d = h − 2,5 = 9,5: cobrimento 2,0 + φ 10/2. Bastos usa Ks = 0,024 da tabela
    // (bruto 2,04 pelo bloco retangular). Bastos usa o mesmo d nas duas direções; o
    // motor usa duas camadas (teste seguinte), então o exemplo confere a flexão com d = 9,5.
    perto(flexaoLaje(1.4 * 5.84, 9.5, mat()).as, 2.07, 0.05);
    const a = lajeArmadura6118(e, esforcos({ mx: 5.84, my: 5.32 }), mat(), 2);
    perto(
      a.memoria.find((m) => m.descricao.startsWith("Armadura mínima de referência"))!.valor! * 0.67,
      1.2,
      0.01,
    );
  });

  it("duas camadas (conta à mão): mx = 5,84 > my = 5,32 → x embaixo; φ das malhas da 1ª passada", () => {
    // σcd = 0,85 · 2,5/1,4 = 1,5179 kN/cm²; fyd = 43,478 kN/cm²; h 12, c 2.
    // 1ª passada (φ 10): dx = 12 − 2 − 0,5 = 9,5 → asx 2,042 → φ 5 c/ 9,5;
    //   dy = 9,5 − 0,5 − 0,5 = 8,5 → asy 2,089 → φ 5 c/ 9.
    // 2ª passada (φ 5): dx = 12 − 2 − 0,25 = 9,75; dy = 9,75 − 0,25 − 0,25 = 9,25.
    //   asx: μ = 817,6/(100 · 9,75² · 1,5179) = 0,05666; x/d = (1 − √(1 − 2μ))/0,8 = 0,07296;
    //        As = 817,6/(43,478 · (9,75 − 0,4 · 0,07296 · 9,75)) = 1,9867
    //   asy: μ = 744,8/(100 · 9,25² · 1,5179) = 0,05735; x/d = 0,07387; As = 1,9083
    const a = lajeArmadura6118(e, esforcos({ mx: 5.84, my: 5.32 }), mat(), 2);
    perto(a.asx, 1.9867, 0.0005);
    perto(a.asy, 1.9083, 0.0005);
    expect(alturasUteisPositivas(12, 2, 5, 5)).toEqual({ inferior: 9.75, superior: 9.25 });
    expect(alturasUteisPositivas(12, 2, 10, 8)).toEqual({ inferior: 9.5, superior: 8.6 });
    // my > mx: y embaixo
    const b = lajeArmadura6118(e, esforcos({ mx: 5.32, my: 5.84 }), mat(), 2);
    perto(b.asy, 1.9867, 0.0005);
    perto(b.asx, 1.9083, 0.0005);
  });

  it("armadura negativa (p. 53): L2 Mk 14,25, d = 10 → 4,99; L3 Mk 16,63, h 13, d = 11 → 5,30", () => {
    // d = h − 2: cobrimento 1,5 + φ/2. Ks = 0,025 da tabela arredonda para cima
    // (bruto 4,94 e 5,22 pelo bloco retangular).
    const l2 = lajeArmadura6118(e, esforcos({ negativos: neg("inferior", 14.25) }), mat(), 1.5);
    perto(l2.asNegativos.inferior, 4.99, 0.06);
    const e3 = laje(5.86, 6.06, 13, 4.28, 1.5, v);
    const l3 = lajeArmadura6118(e3, esforcos({ negativos: neg("inferior", 16.63) }), mat(), 1.5);
    perto(l3.asNegativos.inferior, 5.3, 0.1);
  });

  it("compatibilização (p. 54): adota a maior das duas", () => {
    expect(compatibilizaNegativo6118(14.25, 16.63)).toBe(16.63);
  });
});

function neg(b: Bordo, x: number): Record<Bordo, number> {
  return { esquerdo: 0, inferior: 0, direito: 0, superior: 0, [b]: x };
}

describe("E03: laje L1 em balanço (Bastos, Lajes, ex. 3.17, pp. 45-59)", () => {
  const balanco = vinc(["esquerdo"], ["inferior", "direito", "superior"]);
  const e = laje(1.63, 6, 12, 4.33, 2.5, balanco);

  it("armadura (p. 54): Mk 13,14, γn = 1,35 (h = 12), d = 10 → As = 6,21 cm²/m", () => {
    // Bastos usa Ks = 0,025 da tabela; o bloco retangular dá 6,28.
    const a = lajeArmadura6118(e, esforcos({ negativos: neg("esquerdo", 13.14) }), mat(), 1.5);
    perto(a.asNegativos.esquerdo, 6.21, 0.1);
    expect(a.asx).toBe(0);
    expect(a.asNegativos.direito).toBe(0);
  });

  it("estádio II (p. 58): III = 3560,4 cm⁴ com xII = 2,70; (EI)eq = 29 790 540 kN·cm²", () => {
    perto(inerciaII(2.7, 6.25, 10, 8.72), 3560.4, 1);
    perto(rigidezEquivalente(2408, 14400, 3560.4, 923, 989), 29_790_540, 3000);
  });

  it("xII de φ 8 c/ 8 (6,25 cm²/m), d = 10, αe = 8,72: conta dá 2,80 (impresso 2,70)", () => {
    // x² + 1,09 x − 10,9 = 0 → x = 2,801. O III impresso (3560,4) usa x = 2,70 e
    // d = 10, que não satisfaz esta equação: divergência da apostila, registrada.
    perto(linhaNeutraII(6.25, 10, 8.72), 2.801, 0.001);
  });

  it("flecha (p. 59): ai = p l⁴/(8 EI) + P l³/(3 EI) = 0,18; at = 0,42; limite 2 · 163/250 = 1,30", () => {
    const ei = 2979.054; // 29 790 540 kN·cm² em kN·m²
    const gradil = ((0.5 * 1.63 ** 3) / (3 * ei)) * 100; // P = 0,5 kN no bordo livre
    const ai = flechaImediata(150, 5.33, 1.63, ei) + gradil;
    perto(ai, 0.18, 0.005);
    perto(ai * (1 + fatorFluencia()), 0.42, 0.005);
    // limite do motor para o balanço (sem o gradil, que o motor não tem)
    perto(lajeEsforcos6118(e, mat()).flechaLimite, 1.3, 0.01);
  });
});

describe("casos com conta à mão (coeficientes de tabelasBares)", () => {
  it("tipo 1, λ = 1 (4 × 4, h 10, p = 6): m = 4,24 p l²/100; V = 2,5 p l/10; flecha α = 4,77", () => {
    const r = lajeEsforcos6118(laje(4, 4, 10, 4, 2, vinc()), mat());
    perto(r.mx, (4.24 * 6 * 16) / 100, 1e-9);
    perto(r.my, (4.24 * 6 * 16) / 100, 1e-9);
    for (const b of ["esquerdo", "inferior", "direito", "superior"] as const) {
      perto(r.reacoes[b], (2.5 * 6 * 4) / 10, 1e-9);
      expect(r.negativos[b]).toBe(0);
    }
    // Ma = 4,07 < Mr = 1,5 · 2,565 · 10²/6 = 6,41 kN·m/m: estádio I
    const ai = flechaImediata(4.77, 4 + 0.3 * 2, 4, eiBruta(10));
    perto(ai, ((4.77 / 1200) * 4.6 * 256 * 100) / eiBruta(10), 1e-12);
    perto(r.flecha, ai * 2.32, 1e-9);
    perto(r.flechaLimite, 1.6, 1e-9);
  });

  it("tipo 2B transposto (5 × 4, superior engastado, λ = 1,25): μx da tabela vai para my", () => {
    // 2B, λ = 1,25: μx 4,56; μ'x 10,07; μy 2,51; νx 3,06; ν'x 4,48; νy 1,83.
    const r = lajeEsforcos6118(laje(5, 4, 10, 4, 2, vinc(["superior"])), mat());
    const m = (6 * 16) / 100;
    const v = (6 * 4) / 10;
    perto(r.my, 4.56 * m, 1e-9);
    perto(r.mx, 2.51 * m, 1e-9);
    perto(r.negativos.superior, 10.07 * m, 1e-9);
    perto(r.reacoes.superior, 4.48 * v, 1e-9);
    perto(r.reacoes.inferior, 3.06 * v, 1e-9);
    perto(r.reacoes.esquerdo, 1.83 * v, 1e-9);
    perto(r.reacoes.direito, 1.83 * v, 1e-9);
  });

  it("armada numa direção (2 × 5, esquerdo engastado, λ = 2,5): faixa apoiada-engastada", () => {
    const r = lajeEsforcos6118(laje(2, 5, 10, 4, 2, vinc(["esquerdo"])), mat());
    // viga apoiada-engastada: M+ = 9 p l²/128 = 1,6875; X = p l²/8 = 3,0
    perto(r.mx, (9 * 6 * 4) / 128, 0.001);
    perto(r.negativos.esquerdo, (6 * 4) / 8, 1e-9);
    // reações da linha "> 2,00" (2B): ν'x 6,25 = 5/8 p l; νx 4,38 (viga: 3/8 = 3,75,
    // mais metade do alívio); νy 1,83 nos bordos curtos
    perto(r.reacoes.esquerdo, (5 / 8) * 6 * 2, 1e-9);
    perto(r.reacoes.direito, (4.38 * 6 * 2) / 10, 1e-9);
    perto(r.reacoes.inferior, (1.83 * 6 * 2) / 10, 1e-9);
    // flecha: α = 6,50 (2B, "> 2,00") ≈ 1200/185 da viga apoiada-engastada
    perto(r.flecha, flechaImediata(6.5, 4.6, 2, eiBruta(10)) * 2.32, 1e-9);

    // armadura (c = 2,5, d = 7): principal Md = 1,4 · 1,6875 → As 0,79 < ρmín 100h = 1,5;
    // secundária = max(20 % de 1,5; 0,9; 0,5 · 1,5) = 0,9; bordos apoiados 0,67 · 1,5
    const a = lajeArmadura6118(laje(2, 5, 10, 4, 2, vinc(["esquerdo"])), r, mat(), 2.5);
    perto(a.asx, 1.5, 1e-9);
    perto(a.asy, 0.9, 1e-9);
    perto(a.asNegativos.direito, 1.005, 1e-9);
    expect(a.barrasY.espacamento).toBeLessThanOrEqual(33);
    expect(a.barrasX.espacamento).toBeLessThanOrEqual(20);
  });

  it("balanço (1,5 m, h 12, p = 6): X = p l²/2; R = p l; flecha p l⁴/(8EI); armadura com γn", () => {
    const e = laje(1.5, 4, 12, 4, 2, vinc(["esquerdo"], ["inferior", "direito", "superior"]));
    const r = lajeEsforcos6118(e, mat());
    perto(r.negativos.esquerdo, (6 * 1.5 ** 2) / 2, 1e-9);
    perto(r.reacoes.esquerdo, 6 * 1.5, 1e-9);
    expect(r.mx).toBe(0);
    expect(r.reacoes.direito).toBe(0);
    // Ma = 6,75 < Mr = 9,23 (h 12): estádio I
    perto(r.flecha, ((4.6 * 1.5 ** 4) / (8 * eiBruta(12))) * 100 * 2.32, 1e-9);
    perto(r.flechaLimite, (2 * 150) / 250, 1e-9);
    // γn = 1,95 − 0,05 · 12 = 1,35; Md = 1,4 · 1,35 · 6,75 = 12,758 kN·m/m; d = 9;
    // μ = 1275,75 / (100 · 81 · 1,5179) = 0,10376; x/d = (1 − √(1 − 2μ))/0,8 = 0,13724;
    // As = 1275,75 / (43,478 · (9 − 0,4 · 0,13724 · 9)) = 3,450
    const a = lajeArmadura6118(e, r, mat(), 2.5);
    perto(a.asNegativos.esquerdo, 3.45, 0.005);
  });

  it("vinculação sem tabela (um bordo livre): esforços nulos e aviso", () => {
    const r = lajeEsforcos6118(laje(4, 5, 10, 4, 2, vinc([], ["direito"])), mat());
    expect(r.mx).toBe(0);
    expect(Object.values(r.reacoes)).toEqual([0, 0, 0, 0]);
    expect(r.avisos.join()).toContain("vinculação sem tabela");
  });

  it("avisos: h abaixo do mínimo; seção que não resiste a Ma; flecha acima de l/250", () => {
    // 6 × 6, h 7: Ma = 4,24 · 9 · 36/100 = 13,7 kN·m/m; com d = 4 cm, μ > 0,5
    const fina = lajeEsforcos6118(laje(6, 6, 7, 6, 3, vinc()), mat());
    expect(fina.avisos.some((a) => a.includes("abaixo do mínimo de 8 cm"))).toBe(true);
    expect(fina.avisos.some((a) => a.includes("flecha não calculada"))).toBe(true);
    expect(fina.flecha).toBeNaN();
    // 7 × 7, h 10: fissurada e muito acima de 700/250 = 2,8 cm
    const longa = lajeEsforcos6118(laje(7, 7, 10, 6, 3, vinc()), mat());
    expect(longa.flecha).toBeGreaterThan(2.8);
    expect(longa.avisos.some((a) => a.includes("acima do limite 2,8 cm"))).toBe(true);
  });
});

describe("reações: Σ V · comprimento contra p · lx · ly", () => {
  // O bordo apoiado oposto a um engastado recebe de volta metade do alívio
  // (scripts/bares/reacoes.ts). Nos tipos
  // simétricos (1, 4A, 4B, 6) a soma fecha com a carga (arredondamento das
  // tabelas); nos outros passa dela, até ~7 % (tipo 3 em λ = 1: 2 · (2,17 +
  // 3,17) = 10,68 contra 10).
  const casos: [string, Bordo[]][] = [
    ["1", []],
    ["2A", ["inferior"]],
    ["2B", ["direito"]],
    ["3", ["inferior", "direito"]],
    ["4A", ["inferior", "superior"]],
    ["4B", ["esquerdo", "direito"]],
    ["5A", ["inferior", "superior", "direito"]],
    ["5B", ["inferior", "esquerdo", "direito"]],
    ["6", ["esquerdo", "inferior", "direito", "superior"]],
  ];
  for (const [tipo, eng] of casos) {
    it(`tipo ${tipo}`, () => {
      for (const lambda of [1, 1.25, 1.5, 1.75, 2]) {
        const e = laje(4, 4 * lambda, 10, 4, 2, vinc(eng));
        expect(classificaLaje6118(e.lx, e.ly, e.vinculos)).toMatchObject({ tipo });
        const r = lajeEsforcos6118(e, mat());
        const soma =
          (r.reacoes.esquerdo + r.reacoes.direito) * e.ly +
          (r.reacoes.inferior + r.reacoes.superior) * e.lx;
        const razao = soma / (6 * e.lx * e.ly);
        if (["1", "4A", "4B", "6"].includes(tipo)) perto(razao, 1, 0.01);
        else {
          expect(razao).toBeGreaterThanOrEqual(0.995);
          expect(razao).toBeLessThanOrEqual(1.08);
        }
      }
    });
  }
});

describe("célula que a tabela impressa tinha fora da tendência", () => {
  // A impressa dava 2A μx 7,53; 7,56; 8,10 em λ = 1,75 a 1,85, e o motor avisava ao
  // interpolar sobre elas. A tabela gerada segue a teoria de placas e não tem aviso.
  it("laje 2A 4 × 7,2 (λ = 1,80): μx = 8,19 da teoria de placas (a impressa dava 7,56), sem aviso", () => {
    const r = lajeEsforcos6118(laje(4, 7.2, 10, 4, 2, vinc(["inferior"])), mat());
    perto(r.mx, (8.19 * 6 * 16) / 100, 1e-9);
  });
});

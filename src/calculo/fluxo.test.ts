// Fluxo completo e paridade com a V1: a obra FLUXO (duas lajes lado a lado)
// calculada pela NB-1/78 tem de dar os resultados gravados pela V1
// (dist/roteiros/semente/FLUXO.LAJ, .SEC, .REP, .COL, gerados por T_FLUXO.BAS).
// Unidades da V1: tf, tf/m², fck 0,15 tf/cm²; γ concreto 2,5 tf/m³.
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import { analisarViga, calcularObra } from "./fluxo";
import { nb178, nbr6118 } from "./normas";
import type { Norma } from "./tipos";
import { KN_POR_TF, tfParaKn } from "./unidades";

/** A NB-1/78 com os valores da V1 em unidades reais. A V1 escreve o CA-50 como
 *  fyk = 5 tf/cm² e Es = 2100 tf/cm² (1 tf/cm² = 98,0665 MPa): fyk = 490,3 MPa,
 *  Es = 205 940 MPa; e o concreto armado com 2,5 tf/m³. A V2 usa 500 MPa,
 *  210 000 MPa e 25 kN/m³; por isso as áreas de aço da V2 são ~2% menores. */
const TF_CM2 = 98.0665;
const nb178V1: Norma = {
  ...nb178,
  pesoConcreto: 2.5 * KN_POR_TF,
  materiais: (m) => ({
    ...nb178.materiais(m),
    fyk: 5 * TF_CM2,
    fyd: (5 * TF_CM2) / 1.15,
    fywd: (5 * TF_CM2) / 1.15,
    es: 2100 * TF_CM2,
  }),
};

function obraFluxo(): Obra {
  const obra = obraNova("FLUXO", "nb1-78");
  obra.materiais.fck = 0.15 * TF_CM2; // 0,15 tf/cm² = 14,71 MPa
  let pav = { ...obra.pavimentos[0]!, nome: "TERREO", peDireito: 3 };
  const cargas = { h: 10, revestimento: tfParaKn(0.1), sobrecarga: tfParaKn(0.15) };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, cargas);
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 }, cargas);
  pav = gerarEstrutura({ ...pav, lajes: [l1, l2] });
  // seção dos pilares da obra FLUXO da V1: 20 x 30
  pav = { ...pav, pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 30 })) };
  return { ...obra, pavimentos: [pav] };
}

const tf = (kn: number) => kn / KN_POR_TF;

describe("fluxo da obra FLUXO pela NB-1/78 (paridade com a V1)", () => {
  const r = calcularObra(obraFluxo(), nb178V1);
  const pav = r.pavimentos[0]!;
  const laje = (nome: string) => pav.lajes.find((l) => l.laje.nome === nome)!;

  it("lajes: momentos, negativos, flecha e reações iguais aos da V1 (FLUXO.LAJ, bloco RES)", () => {
    const l1 = laje("L1").esforcos;
    expect(tf(l1.mx)).toBeCloseTo(0.2993489, 5);
    expect(tf(l1.my)).toBeCloseTo(0.2758809, 5);
    expect(tf(l1.negativos.direito)).toBeCloseTo(0.5048257, 5);
    // FLUXO.LAJ foi calculado sem fluência; a V2 (como o OPENSTRUT.LAP padrão) usa
    // fator 3 na parcela permanente: f = f_V1 · (3·0,35 + 0,15) / 0,5
    const fluencia = (3 * 0.35 + 0.15) / 0.5;
    expect(l1.flecha).toBeCloseTo(0.2659355 * fluencia, 4);
    expect(tf(l1.reacoes.esquerdo)).toBeCloseTo(0.5182222, 5);
    expect(tf(l1.reacoes.inferior)).toBeCloseTo(0.3660278, 5);
    expect(tf(l1.reacoes.direito)).toBeCloseTo(0.8961333, 5);
    const l2 = laje("L2").esforcos;
    expect(tf(l2.mx)).toBeCloseTo(0.2289448, 5);
    expect(tf(l2.negativos.esquerdo)).toBeCloseTo(0.5048257, 5);
    expect(l2.flecha).toBeCloseTo(0.1655295 * fluencia, 4);
    expect(tf(l2.reacoes.esquerdo)).toBeCloseTo(0.8246389, 5);
    expect(tf(l2.reacoes.direito)).toBeCloseTo(0.4769722, 5);
  });

  it("lajes: armaduras iguais às da V1 (1,5 cm²/m mínima, 2,173 cm²/m no negativo)", () => {
    const a1 = laje("L1").armadura;
    expect(a1.asx).toBeCloseTo(1.5, 3);
    expect(a1.asy).toBeCloseTo(1.5, 3);
    expect(a1.asNegativos.direito).toBeCloseTo(2.172789, 3);
    expect(laje("L2").armadura.asNegativos.esquerdo).toBeCloseTo(2.172789, 3);
  });

  it("vigas: momentos e armaduras iguais aos da V1 (FLUXO.SEC)", () => {
    const viga = (x1: number, y1: number, x2: number, y2: number) => {
      const v = pav.pavimento.vigas.find(
        (p) => p.x1 === x1 && p.y1 === y1 && p.x2 === x2 && p.y2 === y2,
      );
      return pav.vigas.find((r) => r.viga.id === v?.id)!;
    };
    const v3 = viga(0, 0, 0, 5); // V3 da V1: x = 0, vão 5 m
    const t3 = v3.analise.ok ? v3.analise.tramos[0]! : undefined;
    expect(tf(t3!.mPos)).toBeCloseTo(2.0881944, 4);
    expect(tf(t3!.vEsq)).toBeCloseTo(1.6705556, 4);
    expect(v3.tramos[0]!.positivo.flexao!.as).toBeCloseTo(1.5680644, 2);
    const v4 = viga(4, 0, 4, 5); // V4 da V1: viga comum às duas lajes
    const t4 = v4.analise.ok ? v4.analise.tramos[0]! : undefined;
    expect(tf(t4!.mPos)).toBeCloseTo(5.8461632, 4);
    expect(v4.tramos[0]!.positivo.flexao!.as).toBeCloseTo(5.3129828, 2);
    const v2 = viga(0, 0, 7.5, 0); // V2 da V1: contínua, vãos 4 e 3,5 m
    const a2 = v2.analise.ok ? v2.analise : undefined;
    expect(tf(a2!.tramos[0]!.mPos)).toBeCloseTo(0.6274192, 4);
    expect(tf(a2!.tramos[0]!.mNegDir)).toBeCloseTo(-0.8330448, 4);
    expect(tf(a2!.tramos[1]!.mPos)).toBeCloseTo(0.3635903, 4);
    expect(v2.tramos[0]!.negativoDir.flexao!.as).toBeCloseTo(0.7786101, 2);
  });

  it("equilíbrio: carga das lajes = carga nas vigas = carga nos pilares", () => {
    expect(pav.equilibrio.ok).toBe(true);
    // 0,5 tf/m² x 37,5 m² = 18,75 tf de lajes (V1 LAJEMONT, TotVal)
    expect(tf(pav.equilibrio.cargaLajes)).toBeCloseTo(18.75, 6);
    // + peso próprio das vigas 4,05 tf (V1 LAJEMONT) = 22,8 tf nos pilares
    expect(tf(pav.equilibrio.cargaPilares)).toBeCloseTo(22.8, 6);
    // reações de projeto (envoltória): a sobrecarga alternada na V2 (4 e 3,5 m) só aumenta
    expect(tf(pav.equilibrio.cargaPilaresProjeto - pav.equilibrio.cargaPilares)).toBeGreaterThan(0);
  });

  it("pilares: N com peso próprio e armadura mínima como na V1 (FLUXO.COL)", () => {
    // A V1 soma nos pilares as reações MÁXIMAS da envoltória (FLUXO.REP: P5 = 6,866 tf;
    // FLUXO.COL: Nk = 7,3157 tf com o peso próprio 0,2·0,3·3·2,5 = 0,45 tf); a V2 também.
    const p5 = r.pilares.find((p) => p.pilar.x === 4 && p.pilar.y === 0)!;
    expect(tf(p5.nk)).toBeCloseTo(7.3157462, 5);
    expect(p5.falhas).toEqual([]);
    // V1: As = 4,8 cm² (0,8% de 20 x 30)
    expect(p5.resultado.asNecessaria).toBeCloseTo(4.8, 3);
  });

  it("sem avisos inesperados", () => {
    expect(r.avisos).toEqual([]);
    expect(pav.montagem.avisos).toEqual([]);
    expect(pav.falhas).toEqual([]);
  });
});

describe("analisarViga: reação de projeto", () => {
  it("3 vãos de 5 m só com q = 10: apoio interno 60 kN de projeto, 55 kN no equilíbrio", () => {
    // Três momentos (continua.test): R_B,max = 1,2qL = 60; com tudo carregado 1,1qL = 55.
    const tramo = { lajes: { g: 0, q: 10 }, pesoProprio: 0, cargaLinear: 0, g: 0, q: 10 };
    const a = analisarViga({
      id: "v",
      nome: "V",
      bw: 20,
      h: 50,
      eixo: { horizontal: true, c: 0, s1: 0, s2: 15 },
      nos: [0, 5, 10, 15],
      apoios: [0, 1, 2, 3].map((i) => ({ tipo: "pilar" as const, id: `p${i}`, nome: `P${i}` })),
      tramos: [0, 1, 2].map(() => ({ ...tramo, vao: 5, concentradas: [] })),
    });
    expect(a.reacoes[1]!.g + a.reacoes[1]!.q).toBeCloseTo(55, 6);
    expect(a.reacoesProjeto[1]!.g + a.reacoesProjeto[1]!.q).toBeCloseTo(60, 6);
    // apoio extremo: 0,4qL = 20 total; máximo 0,45qL = 22,5 (q nos vãos 1 e 3)
    expect(a.reacoes[0]!.q).toBeCloseTo(20, 6);
    expect(a.reacoesProjeto[0]!.q).toBeCloseTo(22.5, 6);
  });
});

describe("fluxo: id do pavimento e pavimento repetido", () => {
  it("dois pavimentos com o mesmo nome: cada nível com o seu pavimento e a carga acumulada", () => {
    const base = obraFluxo();
    const pav = base.pavimentos[0]!;
    const r = calcularObra(
      {
        ...base,
        pavimentos: [
          { ...pav, id: "cima" },
          { ...pav, id: "baixo" },
        ],
      },
      nb178V1,
    );
    const p5 = (id: string) =>
      r.pilares.find((p) => p.pavimentoId === id && p.pilar.x === 4 && p.pilar.y === 0)!;
    expect(r.pilares).toHaveLength(2 * pav.pilares.length);
    // o de baixo soma o de cima: 2 · 7,3157 tf (FLUXO.COL)
    expect(tf(p5("cima").nk)).toBeCloseTo(7.3157462, 2);
    expect(tf(p5("baixo").nk)).toBeCloseTo(2 * 7.3157462, 2);
  });

  it("pavimento-tipo repetido 2 vezes: pilares dimensionados nos dois níveis", () => {
    const base = obraFluxo();
    const r = calcularObra(
      { ...base, pavimentos: [{ ...base.pavimentos[0]!, repeticoes: 2 }] },
      nb178V1,
    );
    const n = base.pavimentos[0]!.pilares.length;
    expect(r.pilares.filter((p) => p.repeticao === 1)).toHaveLength(n);
    expect(r.pilares.filter((p) => p.repeticao === 2)).toHaveLength(n);
    const p5 = (k: number) =>
      r.pilares.find((p) => p.repeticao === k && p.pilar.x === 4 && p.pilar.y === 0)!;
    expect(tf(p5(2).nk)).toBeCloseTo(2 * 7.3157462, 2);
  });
});

describe("fluxo: falhas que deixam vigas e pilares incompletos", () => {
  it("pilar que termina num pavimento intermediário marca o pavimento de baixo com falha", () => {
    const base = obraFluxo();
    const pav = base.pavimentos[0]!;
    const terreo = {
      ...pav,
      id: "terreo",
      pilares: pav.pilares.filter((p) => !(p.x === 4 && p.y === 0)),
    };
    const nome = pav.pilares.find((p) => p.x === 4 && p.y === 0)!.nome;
    const r = calcularObra(
      { ...base, pavimentos: [{ ...pav, id: "cob", nome: "COB" }, terreo] },
      nb178V1,
    );
    const [cob, ter] = r.pavimentos;
    const aviso = r.avisos.find((a) => a.startsWith(`Pilar ${nome} termina no pavimento TERREO`));
    expect(aviso).toContain("NÃO foi transferida a viga de transição");
    // carga do P5 da cobertura: 7,3157 tf (FLUXO.COL) = 71,74 kN
    expect(aviso).toContain(`(${(7.3157462 * KN_POR_TF).toFixed(2)} kN)`);
    expect(cob!.falhas).toEqual([]);
    expect(ter!.falhas).toEqual([aviso]);
    expect(ter!.equilibrio.ok).toBe(false);
    expect(ter!.equilibrio.avisos).toContain(aviso);
    expect(ter!.vigas.every((v) => v.avisos.some((a) => a.startsWith("Pavimento com falha")))).toBe(
      true,
    );
    const daCob = r.pilares.filter((p) => p.pavimentoId === "cob");
    const doTer = r.pilares.filter((p) => p.pavimentoId === "terreo");
    expect(daCob.every((p) => p.falhas.length === 0)).toBe(true);
    expect(doTer.length).toBeGreaterThan(0);
    expect(doTer.every((p) => p.falhas.includes(aviso!))).toBe(true);
  });

  it("laje sem cálculo na 6118 (bordo livre fora do balanço) reprova o pavimento", () => {
    const obra = obraNova("LIVRE", "nbr6118-2023");
    let pav = obra.pavimentos[0]!;
    const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 }, { vinculos: { superior: "livre" } });
    pav = gerarEstrutura({ ...pav, lajes: [l1] });
    const r = calcularObra({ ...obra, pavimentos: [pav] }, nbr6118);
    const rp = r.pavimentos[0]!;
    expect(Object.values(rp.lajes[0]!.esforcos.reacoes)).toEqual([0, 0, 0, 0]);
    expect(rp.falhas).toHaveLength(1);
    expect(rp.falhas[0]).toMatch(/^Laje L1 sem cálculo: a carga dela \([\d.]+ kN\) NÃO chegou/);
    expect(rp.equilibrio.ok).toBe(false);
    expect(rp.equilibrio.avisos).toContain(rp.falhas[0]);
    expect(rp.vigas.length).toBeGreaterThan(0);
    expect(rp.vigas.every((v) => v.avisos.some((a) => a.startsWith("Pavimento com falha")))).toBe(
      true,
    );
    expect(r.pilares.every((p) => p.falhas.length === 1)).toBe(true);
    expect(
      r.pilares.every((p) => p.resultado.avisos.some((a) => a.startsWith("Falha neste pavimento"))),
    ).toBe(true);
  });
});

describe("fluxo: d' com barras acima de 20 mm", () => {
  it("viga com barras de 25 mm avisa que o d real é menor que o adotado", () => {
    const base = obraFluxo();
    const pav = base.pavimentos[0]!;
    // V4 (x = 4) 20 × 40, biapoiada de 5 m, com 20 kN/m de carga linear. Conta à mão
    // (materiais da V1, NB-1/78 classe A; 1 tf = 9,80665 kN):
    //   q = lajes (0,8961333 + 0,8246389) tf/m + pp 0,2·0,4·2,5 tf/m + 20 kN/m = 38,836 kN/m
    //   M = q·5²/8 = 121,364 kN·m; Md = 1,4 M = 169,909 kN·m
    //   d = 40 − 2,5 − 1,5 = 36; fcd = 1,05071 kN/cm²; fyd = 42,6376 kN/cm²; εyd = 2,0704‰
    //   x_lim = 0,62832·36 = 22,620 cm; Md,lim = 0,85 fcd·20·0,8 x_lim (d − 0,4 x_lim) = 87,117 kN·m
    //   Md > Md,lim → armadura dupla (d' = 3,5; ε's = 2,958‰ > εyd → σ's = fyd):
    //   As = 8711,7/(fyd·26,952) + 8279,2/(fyd·32,5) = 7,581 + 5,975 = 13,555 cm²; As' = 5,975 cm²
    //   As + As' = 19,53 cm² ≤ 4 %·20·40 = 32 cm² (cabe na regra da NB-1/78)
    //   Barras numa camada em bw útil = 20 − 2·(2 + 0,5) = 15 cm (espaço livre ≥ max(φ; 2,28)):
    //   φ10 e φ12,5 pedem mais de 8 barras; 7 φ16 ocupa 24,9 cm e 5 φ20, 19,1 cm;
    //   3 φ25 = 14,73 cm² ocupa 3·2,5 + 2·2,5 = 12,5 cm ≤ 15 → φ 25 mm.
    const vigas = pav.vigas.map((v) =>
      v.x1 === 4 && v.x2 === 4 ? { ...v, bw: 20, h: 40, cargaLinear: 20 } : v,
    );
    const r = calcularObra({ ...base, pavimentos: [{ ...pav, vigas }] }, nb178V1);
    const v4 = r.pavimentos[0]!.vigas.find((v) => v.viga.eixo.c === 4 && !v.viga.eixo.horizontal)!;
    const flexao = v4.tramos[0]!.positivo.flexao!;
    expect(flexao.as).toBeCloseTo(13.555, 2);
    expect(flexao.asComprimida).toBeCloseTo(5.975, 2);
    const barras = v4.tramos[0]!.positivo.barras!;
    expect(barras).toMatchObject({ n: 3, phi: 25, cabe: true });
    // d adotado = 40 − 2,5 − 1,5 = 36; real = 40 − 2,5 − φt − φ/2
    expect(v4.d).toBeCloseTo(36, 9);
    const real = 40 - 2.5 - v4.tramos[0]!.estribo!.phi / 10 - barras.phi / 20;
    expect(v4.avisos).toContain(
      `${v4.viga.nome} tramo 1: barras de φ ${barras.phi} mm (> 20 mm): d real = h − c − φt − φ/2 = ${real.toFixed(2)} cm, menor que o d adotado (36.00 cm); confira.`,
    );
  });
});

describe("fluxo: classe do aço e ortotropia (NB-1/78)", () => {
  /** V4 da obra FLUXO com 20 × 50, d = 45 e Md = 1265,856 tf·cm, o caso de
   *  T_CALCCA.BAS:52-64 / T_ARMADURA.BAS:45-58 (nb1-78/vigas.test.ts). Conta da carga:
   *  M = 1265,856/1,4 = 904,183 tf·cm → q = 8·9,04183/5² = 2,893385 tf/m;
   *  lajes 0,8961333 + 0,8246389 e pp 0,2·0,5·2,5 = 0,25 → carga linear 0,922613 tf/m.
   *  d = 50 − 3,5 (cobrimento) − 1,5 = 45. */
  function v4Classe(classeAco: "A" | "B") {
    const base = obraFluxo();
    const pav = base.pavimentos[0]!;
    const cargaLinear = tfParaKn(2.8933851 - (0.8961333 + 0.8246389) - 0.25);
    const vigas = pav.vigas.map((v) =>
      v.x1 === 4 && v.x2 === 4 ? { ...v, bw: 20, h: 50, cargaLinear } : v,
    );
    const obra: Obra = {
      ...base,
      materiais: { ...base.materiais, classeAco, cobrimentoViga: 3.5 },
      pavimentos: [{ ...pav, vigas }],
    };
    const r = calcularObra(obra, nb178V1);
    const v4 = r.pavimentos[0]!.vigas.find((v) => v.viga.eixo.c === 4 && !v.viga.eixo.horizontal)!;
    expect(v4.d).toBeCloseTo(45, 9);
    return v4.tramos[0]!.positivo.flexao!;
  }

  it("classe A: armadura simples As = 8,2948 cm² (V1 T_CALCCA)", () => {
    const f = v4Classe("A");
    expect(f.asComprimida).toBe(0);
    expect(Math.abs(f.as / 8.2948 - 1)).toBeLessThanOrEqual(1e-4);
    expect(f.memoria[0]?.descricao).toBe("Aço CA-50 classe A");
  });

  it("classe B chega à viga: x/d lim 0,46233, As = 7,82573 e As' = 0,89118 cm² (V1 T_ARMADURA)", () => {
    const f = v4Classe("B");
    expect(f.xd).toBeCloseTo(0.46233, 4);
    expect(Math.abs(f.as / 7.82573 - 1)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(f.asComprimida / 0.89118 - 1)).toBeLessThanOrEqual(2e-4);
    expect(f.memoria[0]?.descricao).toBe("Aço CA-50 classe B");
  });

  /** Uma laje 4 × 4 apoiada nos 4 bordos, h = 10, g = 0,1 e q = 0,15 tf/m²
   *  (p = 0,1 + 0,15 + 0,25 = 0,5 tf/m²) com a ortotropia dada. */
  function lajeQuadrada(mu: number, norma: Norma) {
    const obra = obraNova("ORTO", norma.id);
    const vazio = obra.pavimentos[0]!;
    const cargas = { h: 10, revestimento: tfParaKn(0.1), sobrecarga: tfParaKn(0.15), mu };
    const pav = gerarEstrutura({
      ...vazio,
      lajes: [lajeNova(vazio, { x: 0, y: 0, lx: 4, ly: 4 }, cargas)],
    });
    return calcularObra({ ...obra, pavimentos: [pav] }, norma).pavimentos[0]!.lajes[0]!;
  }

  it("μ = 2 chega à laje: mx = 0,5·(√3,5 − √0,5)²/3 tf·m/m e my = 2 mx (V1 T_LAJCALC.BAS:130-158)", () => {
    // charneiras com cumeeira a c = 1,6458 m: mx = p (√3,5 − √0,5)²/3 para p = 1 e L = 4
    const ref = (Math.sqrt(3.5) - Math.sqrt(0.5)) ** 2 / 3;
    expect(ref).toBeCloseTo(0.451416, 6);
    const l = lajeQuadrada(2, nb178V1);
    expect(l.entrada.mu).toBe(2);
    expect(tf(l.esforcos.mx)).toBeCloseTo(0.5 * ref, 6);
    expect(tf(l.esforcos.my)).toBeCloseTo(ref, 6);
    expect(l.esforcos.memoria[0]).toMatchObject({ valor: 2 });
    // isótropa: p L²/24 = 0,5·16/24
    expect(tf(lajeQuadrada(1, nb178V1).esforcos.mx)).toBeCloseTo(0.5 / 1.5, 6);
  });

  it("a NBR 6118:2023 ignora μ (laje elástica pelas tabelas)", () => {
    const iso = lajeQuadrada(1, nbr6118).esforcos;
    const orto = lajeQuadrada(2, nbr6118).esforcos;
    expect(orto.mx).toBe(iso.mx);
    expect(orto.my).toBe(iso.my);
  });
});

describe("pilares com seção diferente por pavimento", () => {
  it("cada nível é dimensionado com a seção do próprio pavimento", () => {
    const base = obraFluxo();
    const pav = base.pavimentos[0]!;
    const cobertura = {
      ...pav,
      id: "cob",
      nome: "COBERTURA",
      pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 20 })),
    };
    const terreo = { ...pav, pilares: pav.pilares.map((p) => ({ ...p, b: 20, h: 40 })) };
    const r = calcularObra({ ...base, pavimentos: [cobertura, terreo] }, nb178V1);
    const p5 = (nivel: string) =>
      r.pilares.find((p) => p.pavimento === nivel && p.pilar.x === 4 && p.pilar.y === 0)!;
    expect(p5("COBERTURA").pilar.h).toBe(20);
    expect(p5("TERREO").pilar.h).toBe(40);
    // armadura mínima 0,8% (λ > 30) da seção de cada nível: 20·20 → 3,2 cm²; 20·40 → 6,4 cm²
    expect(p5("COBERTURA").resultado.asNecessaria).toBeCloseTo(3.2, 3);
    expect(p5("TERREO").resultado.asNecessaria).toBeCloseTo(6.4, 3);
    // o térreo acumula a carga da cobertura
    expect(p5("TERREO").nk).toBeGreaterThan(1.9 * p5("COBERTURA").nk);
  });
});

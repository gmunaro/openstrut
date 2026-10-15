/// <reference types="node" />
// Detalhamento da viga (DESAUXDI + DESINIT) contra o oráculo: caso retrad_des_det, viga
// V1 20×50 da obra E2E. Valores esperados: __oraculo__/retrad_des_det.json (desenho em
// R1__E2E.DXF e impressora) e conta à mão (livros_arm_forma_des.md 4.3). A numeração
// das posições do desenho (N1..N7 do DXF) é a do DESIMP; o DESINIT guarda as posições em
// outra ordem (negativas, positivas, porta-estribos, estribos), por isso o teste acha
// cada posição pelo tipo e pela bitola.
import { describe, expect, it } from "vitest";
import { bateComImpresso, CASOS_ORACULO, numeroOraculo, valorOraculo } from "../__oraculo__/index";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_DSP } from "../base/parametros";
import type { EntradaDesdim } from "../base/tipos";
import { DIMENSIONAMENTO_V1, ENTRADA_V1, ESFORCOS_V1 } from "./__desinit__/casoV1";
import {
  apoiosPadrao,
  arranjoComprimido,
  detalhaViga,
  detalhaVigaDesinit,
  leArranjo,
  montaComum,
  type PosicaoDesinit,
} from "./desinit";
import { faces, gramposPositivos, indiceDobra, qbVal, somaArea } from "./desinitBarras";
import { cortaBarras, momentoNegativoNoTramo, momentoNoTramo } from "./desinitCorte";

const det = CASOS_ORACULO.retrad_des_det!;
const num = (id: string) => numeroOraculo(det, id);
/** "2#10" impresso → [2, 10]. */
const barras = (id: string) => {
  const t = valorOraculo(det, id).impresso;
  return [Number(t.split("#")[0]), Number(t.split("#")[1])] as const;
};
const bate = (id: string, x: number) => bateComImpresso(valorOraculo(det, id), x);

describe("entrada do caso V1: esforços à mão batem com o que o original imprime", () => {
  it("M−, Ve, Vd, x, M+ e Vk com alívio (impressora.prn:17-50)", () => {
    const { m1, ve, vd, mPos, xPos } = ESFORCOS_V1;
    expect(bate("V1.a1.M-", m1)).toBe(true);
    expect(bate("V1.t1.Ve", ve)).toBe(true);
    expect(bate("V1.t1.Vd", vd)).toBe(true);
    expect(bate("V1.t1.x", xPos)).toBe(true);
    expect(bate("V1.t1.M+", mPos)).toBe(true);
    expect(bate("V1.a1.R", vd + vd)).toBe(true);
    const t1 = DIMENSIONAMENTO_V1.tramos[0]!.cisalhamento;
    expect(bate("V1.t1.Vke", t1.vkEsquerda)).toBe(true);
    expect(bate("V1.t1.Vkd", t1.vkDireita)).toBe(true);
    expect(bate("V1.t1.Asw.e", t1.aswEsquerda)).toBe(true);
    expect(bate("V1.t1.As+", DIMENSIONAMENTO_V1.tramos[0]!.flexao.as)).toBe(true);
  });
});

describe("detalhamento da V1 (retrad_des_det, R1__E2E.DXF)", () => {
  const d = detalhaVigaDesinit(ENTRADA_V1, DIMENSIONAMENTO_V1, "original");
  const achar = (tipo: PosicaoDesinit["tipo"], bitola: number, comprimento?: number) => {
    const p = d.posicoes.find(
      (x) =>
        x.tipo === tipo &&
        Math.abs(x.bitola - bitola) < 1e-6 &&
        (comprimento === undefined || x.comprimento === comprimento),
    );
    expect(p, `${tipo} φ${bitola} ${comprimento ?? ""}`).toBeDefined();
    return p!;
  };

  it("7 posições, como o quadro de ferros do DXF (N1..N7)", () => {
    expect(d.posicoes).toHaveLength(7);
    expect(d.avisos).toEqual([]);
  });

  it("negativa sobre P2 (DXF N1): 2#10, C 440, sem dobras", () => {
    const p = achar("negativa", 10);
    expect([p.quantidade, p.bitola]).toEqual(barras("V1.N1.barras"));
    expect(p.comprimento).toBe(num("V1.N1.C"));
    expect(p.comprimento).toBe(num("V1.tabela.N1.UNI"));
    expect(p.quantidade * p.comprimento).toBe(num("V1.tabela.N1.TOTAL"));
    expect(p.dobras).toEqual([0, 0]);
    // 190 a 630 cm: 2,20 m para cada lado do eixo de P2 (x = 410)
    expect([p.inicio, p.fim]).toEqual([190, 630]);
  });

  it("barras superiores nos apoios extremos (DXF N2, N3): 3#6.3, C 100 e 101, dobra 20", () => {
    const n2 = achar("negativa", sng(6.3), num("V1.N2.C"));
    const n3 = achar("negativa", sng(6.3), num("V1.N3.C"));
    expect([n2.quantidade, 6.3]).toEqual(barras("V1.N2.barras"));
    expect([n3.quantidade, 6.3]).toEqual(barras("V1.N3.barras"));
    expect(n2.dobras[0]).toBe(num("V1.N2.dobra"));
    expect(n3.dobras[1]).toBe(num("V1.N3.dobra"));
    expect(n2.quantidade * n2.comprimento).toBe(num("V1.tabela.N2.TOTAL"));
    expect(n3.quantidade * n3.comprimento).toBe(num("V1.tabela.N3.TOTAL"));
  });

  it("positiva contínua dos dois tramos (DXF N4): 2#10, C 866, dobras 25/25", () => {
    const p = achar("positiva", 10);
    expect([p.quantidade, p.bitola]).toEqual(barras("V1.N4.barras"));
    expect(p.comprimento).toBe(num("V1.N4.C"));
    expect(p.dobras).toEqual([num("V1.N4.dobra.e"), num("V1.N4.dobra.d")]);
    expect(p.quantidade * p.comprimento).toBe(num("V1.tabela.N4.TOTAL"));
  });

  it("porta-estribos (DXF N5, N6): 2#6.3, C 138 e 137", () => {
    const n5 = achar("porta-estribo", sng(6.3), num("V1.N5.C"));
    const n6 = achar("porta-estribo", sng(6.3), num("V1.N6.C"));
    expect([n5.quantidade, 6.3]).toEqual(barras("V1.N5.barras"));
    expect([n6.quantidade, 6.3]).toEqual(barras("V1.N6.barras"));
    expect(n5.quantidade * n5.comprimento).toBe(num("V1.tabela.N5.TOTAL"));
    expect(n6.quantidade * n6.comprimento).toBe(num("V1.tabela.N6.TOTAL"));
  });

  it("estribos (DXF N7): 64 #5 C 132 = 2·(46 + 16) + 8 (corte A, dobra da tabela)", () => {
    const p = achar("estribo", 5);
    expect(p.quantidade).toBe(num("V1.corteA.N7.n"));
    expect(p.comprimento).toBe(num("V1.corteA.N7.C"));
    expect(p.comprimento).toBe(2 * (num("V1.corteA.estribo.h") + num("V1.corteA.estribo.b")) + 8);
    expect(p.quantidade * p.comprimento).toBe(num("V1.tabela.N7.TOTAL"));
  });

  it("trechos de estribo por tramo: 32 c/12 em 380 cm", () => {
    expect(d.trechosEstribo).toHaveLength(2);
    for (const [i, t] of d.trechosEstribo.entries()) {
      const tramo = `V1.t${i + 1}`;
      expect(t.quantidade).toBe(num(`${tramo}.estribo.n`));
      expect(t.espacamento).toBe(num(`${tramo}.estribo.s`));
      expect(t.fim - t.inicio).toBe(num(`${tramo}.estribo.trecho`));
      expect(t.posicao).toBe(1);
    }
  });

  it("o contrato DetalhaViga dá as mesmas posições", () => {
    const c = detalhaViga(ENTRADA_V1, DIMENSIONAMENTO_V1, "original");
    expect(c.posicoes.map((p) => [p.tipo, p.quantidade, p.comprimento])).toEqual(
      d.posicoes.map((p) => [p.tipo, p.quantidade, p.comprimento]),
    );
  });

  it("modo corrigido: o caso não passa pelo defeito R11 e dá as mesmas posições", () => {
    const c = detalhaVigaDesinit(ENTRADA_V1, DIMENSIONAMENTO_V1, "corrigido");
    expect(c.posicoes.map((p) => [p.tipo, p.quantidade, p.bitola, p.comprimento])).toEqual(
      d.posicoes.map((p) => [p.tipo, p.quantidade, p.bitola, p.comprimento]),
    );
  });
});

describe("dados que o contrato não traz (padrões da tela do DESENHO)", () => {
  it("apoios padrão = listagem do .FOR da V1 (retrad_des_menu impressora.prn:7-10)", () => {
    // Apoio Tipo Titulo LPi LPs Dis: 0..2 P P1..P3 20 20 0
    expect(apoiosPadrao(ENTRADA_V1)).toEqual(
      [1, 2, 3].map((k) => ({
        largura: 20,
        tipo: "P",
        titulo: `P${k}`,
        codigo: 1,
        lps: 20,
        dis: 0,
      })),
    );
  });

  it("eixo padrão = metade do apoio (V1.t1.eixo = 10)", () => {
    const c = montaComum(ENTRADA_V1, DIMENSIONAMENTO_V1, "original");
    const eixo = numeroOraculo(det, "V1.t1.eixo");
    expect([c.a19de.g(1), c.a19de.g(2)]).toEqual([eixo, eixo]);
  });
});

describe("leituras do QuickBASIC usadas no detalhamento", () => {
  it("VAL: número no começo do texto", () => {
    expect(qbVal("2#10")).toBe(2);
    expect(qbVal("5/12")).toBe(5);
    expect(qbVal("#5/12")).toBe(0);
    expect(qbVal("-")).toBe(0);
    expect(qbVal(" 12.5+#8")).toBe(12.5);
  });

  it("arranjo n1#φ1+n2#φ2 (L_1521A): '+#8' vale 1 barra", () => {
    expect(leArranjo("2#10")).toEqual([2, 10, 0, 0]);
    expect(leArranjo("2#12.5+#8")).toEqual([2, 12.5, 1, 8]);
    expect(leArranjo("2#16+2#12.5")).toEqual([2, 16, 2, 12.5]);
  });

  it("armadura comprimida pela área (L_1600A): As' 1,00 cm² em bw 20 → 3·0,315 < 1 ≤ 3·0,5 → 2#8", () => {
    const c = montaComum(ENTRADA_V1, DIMENSIONAMENTO_V1, "original");
    expect(arranjoComprimido(c, 1, 20)).toBe("2#8");
    // 0,9 cm²: 3·0,315 = 0,945 > 0,9 → φ6.3, teto(0,9/0,315) = 3
    expect(arranjoComprimido(c, 0.9, 20)).toBe("3#6.3");
  });
});

describe("defeito R11 (U18-015): ramo 'barra longa demais' do lado direito", () => {
  // Um tramo de 12,20 m (vão livre 1200 cm) com três positivas montadas à mão: N1 2#12.5
  // de 2 a 1215 (longa: até a face do apoio daria 1236 > 1050), N2 2#12.5 de 400 a 1210 e
  // N3 1#10 de 1100 a 1230, a única que passa pela face direita (A = 0,8 cm² ≥ As/3 = 0,7).
  // Vd = 8 t exige 8·1,61/(2·5) = 1,288 cm² na face → L_46AD0 leva positivas ao apoio.
  // Original: na N1 (longa) salta para o NEXT do laço de L_4634E, que não rodou
  // (limite 0) e volta: a N2 fica como está e falta área → grampo novo à direita
  // (L_4757C). Corrigido: passa à N2, que chega ao apoio (1238) com dobra 30 (A_1C62 de
  // φ12.5, coluna 2) e cobre a área (0,8 + 2,5 ≥ 1,288): sem grampo à direita. Nos dois
  // modos sai um grampo à esquerda (lb·0,515 − φ = 22 cm > 18 cm de apoio útil).
  const gramposDoLado = (c: ReturnType<typeof montaComum>, lado: number) =>
    Array.from({ length: c.v1876 }, (_, i) => c.a1baa.g(i + 1, 4)).filter((l) => l === lado).length;
  const montaTramoLongo = (modo: "original" | "corrigido", semAreaDeGrampo = false) => {
    const secao = { bw: 20, hw: 60, bf: 0, hf: 0 };
    const entrada: EntradaDesdim = {
      ...ENTRADA_V1,
      viga: {
        ...ENTRADA_V1.viga,
        tramos: [{ vao: 12.2, inercia: 1, divisoes: [] }],
        pilares: ["P1", "P2"],
      },
      analise: {
        ...ENTRADA_V1.analise,
        apoios: [ENTRADA_V1.analise.apoios[0]!, ENTRADA_V1.analise.apoios[2]!],
        tramos: [{ ve: 8, vd: 8, x: 6.1, mPositivo: 1, fEJ: 0 }],
      },
      secoes: { tramos: [secao], apoios: [secao, secao] },
      forma: { tramos: [{ larguraApoio: 20, vaoLivre: 1200, pe: 0, hle: 0, pd: 0, hld: 0 }] },
      parametros: emSingle(PARAMETROS_DSP),
    };
    const dim = {
      ...DIMENSIONAMENTO_V1,
      tramos: [
        {
          ...DIMENSIONAMENTO_V1.tramos[0]!,
          flexao: { ...DIMENSIONAMENTO_V1.tramos[0]!.flexao, as: sng(2.1) },
        },
      ],
      apoios: [DIMENSIONAMENTO_V1.apoios[0]!, DIMENSIONAMENTO_V1.apoios[2]!],
    };
    const c = montaComum(entrada, dim, modo);
    faces(c);
    const barras: [number, number, number, number][] = [
      [2, 12.5, 2, 1215],
      [2, 12.5, 400, 1210],
      [1, 10, 1100, 1230],
    ];
    for (const [i, b] of barras.entries()) for (const [j, v] of b.entries()) c.a1ac4.p(i + 1, j, v);
    c.v1866 = 3;
    if (semAreaDeGrampo) for (const i of [1, 2, 3]) c.area.p(i, 0);
    gramposPositivos(c, modo);
    return c;
  };

  it("grampo sem área (φ5, φ6.3 e φ8 com área 0): o original dá erro 11", () => {
    expect(() => montaTramoLongo("original", true)).toThrow(/erro 11/);
  });

  it("faces do tramo: 20 e 1220; Vd exige 1,288 cm²", () => {
    const c = montaTramoLongo("original");
    expect([c.a1a0c.g(1, 0), c.a1a0c.g(1, 1)]).toEqual([20, 1220]);
  });

  it("original: a N2 não chega ao apoio e sai um grampo positivo", () => {
    const c = montaTramoLongo("original");
    expect([c.a1ac4.g(2, 2), c.a1ac4.g(2, 3), c.a1b20.g(2, 1)]).toEqual([400, 1210, 0]);
    expect([gramposDoLado(c, 0), gramposDoLado(c, 1)]).toEqual([1, 1]);
  });

  it("corrigido: a N2 vai ao apoio com dobra 30 e não precisa de grampo", () => {
    const c = montaTramoLongo("corrigido");
    expect([c.a1ac4.g(2, 2), c.a1ac4.g(2, 3), c.a1b20.g(2, 1)]).toEqual([400, 1238, 30]);
    expect([gramposDoLado(c, 0), gramposDoLado(c, 1)]).toEqual([1, 0]);
  });
});

describe("balanço esquerdo (V_0DE0 = 1): diagrama e cortante a partir da ponta", () => {
  // Balanço de 1,50 m com p = 6 t/m antes de um tramo de 4,00 m. Conta à mão, x da ponta:
  // −M(x) = p·x²/2 (S_2303D e S_22581) e V(x) = p·x (L_46F40), uma divisão só.
  const montaBalanco = () => {
    const pb = sng(6);
    const entrada: EntradaDesdim = {
      ...ENTRADA_V1,
      viga: {
        ...ENTRADA_V1.viga,
        tramos: [ENTRADA_V1.viga.tramos[0]!],
        balancoEsquerdo: {
          vao: 1.5,
          inercia: 1,
          divisoes: [{ p: pb, d: 1.5, f: 0, pAcidental: 0, fAcidental: 0 }],
        },
        pilares: ["P1", "P2"],
      },
      analise: {
        ...ENTRADA_V1.analise,
        apoios: [
          { m: sng(-6.75), r: 0, rMax: 0, rMin: 0, mMax: sng(-6.75) },
          { m: 0, r: 0, rMax: 0, rMin: 0, mMax: 0 },
        ],
        tramos: [{ ve: sng(-0.7155), vd: sng(2.6595), x: 0, mPositivo: 0, fEJ: 0 }],
        balancoEsquerdo: { mApoio: sng(-6.75), carga: 9 },
      },
      secoes: {
        tramos: [{ bw: 20, hw: 50, bf: 0, hf: 0 }],
        apoios: [0, 1].map(() => ({ bw: 20, hw: 50, bf: 0, hf: 0 })),
      },
      forma: {
        tramos: [{ larguraApoio: 20, vaoLivre: 380, pe: 0, hle: 0, pd: 0, hld: 0 }],
        balancoEsquerdo: { larguraApoio: 0, vaoLivre: 140, pe: 0, hle: 0, pd: 0, hld: 0 },
      },
    };
    const tramo = DIMENSIONAMENTO_V1.tramos[0]!;
    const dim = {
      ...DIMENSIONAMENTO_V1,
      tramos: [tramo],
      apoios: [
        { ...DIMENSIONAMENTO_V1.apoios[1]!, as: sng(4.6), arranjo: "4#12.5" },
        DIMENSIONAMENTO_V1.apoios[2]!,
      ],
      balancoEsquerdo: {
        ...tramo,
        cisalhamento: { ...tramo.cisalhamento, vkEsquerda: 0, vkDireita: 9 },
      },
    };
    return montaComum(entrada, dim, "original");
  };

  it("−M(x) = p·x²/2 no balanço, nos dois diagramas", () => {
    const c = montaBalanco();
    c.v0e14 = 0;
    for (const x of [0.5, 1, 1.5]) {
      c.v0e30 = x;
      momentoNoTramo(c);
      momentoNegativoNoTramo(c);
      expect(c.v1886).toBeCloseTo((6 * x * x) / 2, 5);
      expect(c.v1882).toBeCloseTo((6 * x * x) / 2, 5);
    }
  });

  it("zona de estribo do balanço: V = 6x ≤ Vk do estribo mínimo (5,82 t) até x = 0,95 → início 1,0 m", () => {
    const c = montaBalanco();
    cortaBarras(c);
    expect(c.a1374.g(0, 8)).toBeCloseTo(5.8204, 3);
    // A_1374(0,4) = L − INT((L − x)·10)/10 com o último x de V ≤ Vk: 1,5 − 0,5
    expect(c.a1374.g(0, 4)).toBeCloseTo(1, 6);
  });
});

describe("troca do engastamento perfeito em L_403D9 (DESDIM.BAS:5011-5032)", () => {
  // Tramo 1 da V1 com M+ de engastamento perfeito 0,60 > 1,01·0,547: o original troca o M
  // do apoio 0 por A_1512(1) = 0 e o Ve pelo do engastamento e desfaz a troca se o M
  // guardado for ≠ 100 (o sentinela).
  const comApoio0 = (m0: number) => {
    const analise = {
      ...ENTRADA_V1.analise,
      apoios: [{ ...ENTRADA_V1.analise.apoios[0]!, m: m0 }, ...ENTRADA_V1.analise.apoios.slice(1)],
      engastamentoPerfeito: [
        { tramo: 1, mPositivo: sng(0.6), mEsquerdo: sng(-0.648), mDireito: sng(-0.648) },
      ],
    };
    const c = montaComum({ ...ENTRADA_V1, analise }, DIMENSIONAMENTO_V1, "original");
    cortaBarras(c);
    return c;
  };

  it("M do apoio 50 tm: restaurado", () => {
    const c = comApoio0(50);
    expect(c.a16de.g(0)).toBe(50);
    expect(c.a1796.g(1, 0)).toBe(ESFORCOS_V1.ve);
  });

  it("M do apoio 100 tm (= sentinela): fica 0 e o Ve do engastamento (Ve isostático 0,972 + 0)", () => {
    const c = comApoio0(100);
    expect(c.a16de.g(0)).toBe(0);
    // Ve isostático = Ve − (M1 − M0)/L = 0,729 − (−0,972 − 100)/4; + (mD − mE)/L = 0
    expect(c.a1796.g(1, 0)).toBeCloseTo(0.729 + (0.972 + 100) / 4, 3);
  });
});

describe("erros que o original dá", () => {
  it("espaçamento mínimo fora da lista do .DSP (h 20: s = INT(16/2) = 8 < 10): erro 5", () => {
    const sec = { bw: 20, hw: 20, bf: 0, hf: 0 };
    const entrada = { ...ENTRADA_V1, secoes: { tramos: [sec, sec], apoios: [sec, sec, sec] } };
    expect(() => montaComum(entrada, DIMENSIONAMENTO_V1, "original")).toThrow(/erro 5/);
  });

  it("Asw 0 na escolha da bitola do estribo: erro 11", () => {
    const t = DIMENSIONAMENTO_V1.tramos[0]!;
    const dim = {
      ...DIMENSIONAMENTO_V1,
      tramos: [{ ...t, cisalhamento: { ...t.cisalhamento, aswEsquerda: 0, aswDireita: 0 } }, t],
    };
    expect(() => montaComum(ENTRADA_V1, dim, "original")).toThrow(/erro 11/);
  });
});

describe("somas por bitola iguais do original", () => {
  it("índice da dobra soma os índices das bitolas repetidas; área em duas atribuições SINGLE", () => {
    const c = montaComum(ENTRADA_V1, DIMENSIONAMENTO_V1, "original");
    expect(indiceDobra(c, 10)).toBe(4);
    c.bitola.p(3, 10);
    expect(indiceDobra(c, 10)).toBe(7);
    // 3·(0,5 + 0,8) em φ0..φ4 e nada em φ5..φ9
    expect(somaArea(c, 10, 3, 0)).toBe(sng(sng(0.5) * 3 + sng(0.8) * 3));
  });
});

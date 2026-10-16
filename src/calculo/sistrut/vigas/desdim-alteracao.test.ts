// Armadura alterada nas telas do DESDIM (desdim-alteracao.ts) contra a conta à mão pelas
// linhas do DESDIM.BAS, sobre as entradas dos casos v2par_des_2tramos (V5 15×45, apoio 1
// com As 2,97 cm² e "2#12.5+#8" pela tabela) e v2par_des_especial (D1 com fissuração
// limite 1, que não passa em nenhum elemento), de vigas/__desinit__/.
import { describe, expect, it } from "vitest";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_DSP } from "../base/parametros";
import type { AlteracaoArmadura } from "../base/tipos";
import { casoV2par } from "./__desinit__/casosV2par";
import { dimensionaViga } from "./desdim";
import { textoArranjo } from "./desdim-alteracao";

const v5 = casoV2par("v2par_des_2tramos").entrada;
/** D1 com o V2P.DSP: fissuração limite 1, flecha com inércia fissurada e deformação lenta. */
const base1 = casoV2par("v2par_des_especial").entrada;
const d1 = {
  ...base1,
  parametros: emSingle({
    ...PARAMETROS_DSP,
    acidentaisEnvoltoria: true,
    flechaInerciaFissurada: true,
    flechaDeformacaoLenta: true,
    verificaFissuracao: true,
    classeFissuracao: 1,
    tabelaBitola1: [15, 30, 70, 85, 120],
  }),
};
const dim = (alt: AlteracaoArmadura[], e = v5) => dimensionaViga(e, "original", alt);
const semAlteracao = dimensionaViga(v5, "original");

describe("Altero a Armação (S_60137, DESDIM.BAS:6701-7071), apoio 1 da V5 (As 2,97 cm²)", () => {
  const as = semAlteracao.apoios[1]!.as;
  it("o caso: As 2,97 e o arranjo da tabela 2#12.5+#8", () => {
    expect(as).toBeCloseTo(2.97, 2);
    expect(semAlteracao.apoios[1]!.arranjo).toBe("2#12.5+#8");
  });

  it("bitola 10 e Enter no número: INT(2,97/0,8) = 3, +1 porque 3 < 3,71 → 4#10 (DESDIM.BAS:6913)", () => {
    const r = dim([{ em: "apoio", numero: 1, tracionada: { bitola: 10 } }]);
    expect(r.apoios[1]!.barras).toEqual({ n1: 4, bitola1: 10, n2: 0, bitola2: 0 });
    expect(r.apoios[1]!.arranjo).toBe("4#10");
    expect(r.avisos.filter((a) => a.includes("alteração"))).toEqual([]);
  });

  it("12.5+8 e Enter: n1 = 3 > grupo 2 (A_14E4(1, 0)) → 2; n2 = ⌈(2,97 − 2,5)/0,5⌉ = 1 → 2#12.5+#8 (DESDIM.BAS:6918-6955)", () => {
    const r = dim([{ em: "apoio", numero: 1, tracionada: { bitola: 12.5, bitolaMistura: 8 } }]);
    expect(r.apoios[1]!.barras).toEqual({ n1: 2, bitola1: sng(12.5), n2: 1, bitola2: 8 });
    expect(r.apoios[1]!.arranjo).toBe("2#12.5+#8");
  });

  it("3#10 = 2,4 cm² < 2,97: ARMADURA INSUFICIENTE, recusada", () => {
    const r = dim([{ em: "apoio", numero: 1, tracionada: { bitola: 10, barras: 3 } }]);
    expect(r.apoios[1]!.arranjo).toBe("2#12.5+#8");
    expect(r.avisos.some((a) => a.includes("ARMADURA INSUFICIENTE"))).toBe(true);
  });

  it("3+1 de 12.5+8: o grupo de corte A_14E4(2, 0) = 2 não divide 3, CORTADAS CADA, recusada", () => {
    const r = dim([
      {
        em: "apoio",
        numero: 1,
        tracionada: { bitola: 12.5, bitolaMistura: 8, barras: 3, barrasMistura: 1 },
      },
    ]);
    expect(r.apoios[1]!.arranjo).toBe("2#12.5+#8");
    expect(r.avisos.some((a) => a.includes("CORTADAS CADA"))).toBe(true);
  });

  it("4+1: grupo A_14E4(3, 0) = 3 não divide 4, recusada; 2+2: grupo A_14E4(2, 0) = 2 e 2,5 + 1,0 ≥ 2,97 → 2#12.5+2#8", () => {
    const tracionada = (barras: number, barrasMistura: number) => ({
      bitola: 12.5,
      bitolaMistura: 8,
      barras,
      barrasMistura,
    });
    const r41 = dim([{ em: "apoio", numero: 1, tracionada: tracionada(4, 1) }]);
    expect(r41.apoios[1]!.arranjo).toBe("2#12.5+#8");
    expect(r41.avisos.some((a) => a.includes("corte a cada 3"))).toBe(true);
    const r22 = dim([{ em: "apoio", numero: 1, tracionada: tracionada(2, 2) }]);
    expect(r22.apoios[1]!.arranjo).toBe("2#12.5+2#8");
  });

  it("bitola fora do .DSP (7 mm): BITOLA NAO PADRONIZADA, recusada; apoio 0 não dimensionado: aviso", () => {
    const r = dim([
      { em: "apoio", numero: 1, tracionada: { bitola: 7 } },
      { em: "apoio", numero: 0, tracionada: { bitola: 10 } },
    ]);
    expect(r.apoios[1]!.arranjo).toBe("2#12.5+#8");
    expect(r.avisos.some((a) => a.includes("NAO PADRONIZADA"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("apoio 0: o DESDIM não dimensiona"))).toBe(true);
  });

  it("armadura comprimida: '-' anula e '2#10' entra como digitada; '2#7' é recusada", () => {
    const r = dim([
      { em: "apoio", numero: 1, comprimida: "2#10" },
      { em: "tramo", numero: 1, comprimida: "2#7" },
    ]);
    expect(r.apoios[1]!.arranjoCompressao).toBe("2#10");
    expect(r.avisos.some((a) => a.includes('"2#7"'))).toBe(true);
  });
});

describe("Altero a Armação nos tramos (S_61fbe) e o texto da 2ª passada", () => {
  it("tramo 2 da V5 (As 3,25): bitola 16, Enter → ⌈3,25/2⌉ = 2 → 2#16", () => {
    const r = dim([{ em: "tramo", numero: 2, tracionada: { bitola: 16 } }]);
    expect(r.tramos[1]!.flexao.arranjo).toBe("2#16");
  });
  it("arranjo pelos números como o DESDIM imprime (DESDIM.BAS:2862-2873)", () => {
    expect(textoArranjo({ n1: 3, bitola1: sng(6.3), n2: 2, bitola2: 5 })).toBe("3#6.3+2#5");
    expect(textoArranjo({ n1: 2, bitola1: 20, n2: 1, bitola2: 16 })).toBe("2#20+#16");
  });
});

describe("Modifico as Armaduras da fissuração (S_20137, DESDIM.BAS:3909-4230)", () => {
  const antes = dimensionaViga(d1, "original");
  it("D1 tramo 1 (As 8,34, 3#20, fissura acima do limite 1): 5#20 → abertura menor; a flecha estádio II é refeita com 5 barras", () => {
    expect(antes.tramos[0]!.fissuracao?.ok).toBe(false);
    const r = dim([{ em: "tramo", numero: 1, fissuracao: { quantidade: 5 } }], d1);
    const t = r.tramos[0]!;
    expect(t.flexao.arranjo).toBe("5#20");
    expect(t.fissuracao!.w1).toBeLessThan(antes.tramos[0]!.fissuracao!.w1);
    // inércia fissurada maior com mais aço: flecha menor
    expect(t.flecha).toBeLessThan(antes.tramos[0]!.flecha);
  });
  it("2 barras de 20 = 6,30 < 8,34: recusada", () => {
    const r = dim([{ em: "tramo", numero: 1, fissuracao: { quantidade: 2 } }], d1);
    expect(r.tramos[0]!.flexao.arranjo).toBe("3#20");
  });
  it("sem verificação de fissuração (V5): o DESDIM não pergunta, aviso", () => {
    const r = dim([{ em: "apoio", numero: 1, fissuracao: { quantidade: 4 } }]);
    expect(r.apoios[1]!.arranjo).toBe("2#12.5+#8");
    expect(r.avisos.some((a) => a.includes("Modifico as Armaduras"))).toBe(true);
  });
});

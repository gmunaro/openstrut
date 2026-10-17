/// <reference types="node" />
// Armadura editada no DESEDCAO (.EDV) no detalhamento e no quadro da viga. Referências:
// - o run retrad_des_edc do oráculo: a V1 20×50 de retrad_des_det (casoV1.ts) editada no
//   DESEDCAO; o E2E.TAB que o original regravou depois da edição (DESINIT S_202b9) e o
//   R1__E2E.EDV que ele gravou. A edição desse roteiro não muda a armadura: o quadro é o
//   mesmo do automático (φ5 8448, φ6,3 1153, φ10 2612 cm);
// - uma edição sintética, com o quadro pela conta à mão do DESINIT (DESINIT.BAS:562-940):
//   longitudinal = fim − início + dobras, grampo = 2·(fim − início) + largura, pele =
//   Σ (fim − início)·quantidade·2 (sem traspasse até 1000 cm), estribos = (INT((fim −
//   início)/s) + 1) por trecho, com os 132 cm por estribo do quadro do original para a
//   seção 20×50 (8448/64, retrad_des_det).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerEdv } from "../../../armazenamento/sistrut/edv";
import type { EdicaoVigaSistrut } from "../../../dominio/edicaoViga";
import { arquivoOraculo } from "../__oraculo__/arquivosOraculo";
import { emSingle, PARAMETROS_DSP } from "../base/parametros";
import type { ExtrasDesinit, ModoSistrut } from "../base/tipos";
import { quadroDaViga } from "../quant/vigas";
import { DIMENSIONAMENTO_V1, ENTRADA_V1 } from "./__desinit__/casoV1";
import { detalhaViga, montaComum } from "./desinit";
import { faces } from "./desinitBarras";
import { comprimentoDaViga } from "./desinitEdicao";

const RUN = "oraculo/runs/retrad_des_edc-20261015-082513/obra";
const dsp = emSingle(PARAMETROS_DSP);
const indice = (phi: number) => dsp.bitolas.findIndex((b) => b.bitola === Math.fround(phi));

const edicaoOraculo = (): EdicaoVigaSistrut => {
  const texto = new TextDecoder("windows-1252").decode(
    readFileSync(arquivoOraculo(`${RUN}/R1__E2E.EDV`)),
  );
  const r = lerEdv("R1__E2E.EDV", texto);
  if (!r.ok) throw new Error(r.erros.join("; "));
  return r.edicao;
};

/** Comprimento por bitola (cm) do registro do .TAB (A_1CEC(5..14); DESINIT.BAS:933). */
const tabOraculo = () => {
  const b = readFileSync(arquivoOraculo(`${RUN}/E2E.TAB`));
  return Array.from({ length: 10 }, (_, i) => b.readFloatLE(10 + 4 * (5 + i)));
};

const detalha = (extras: ExtrasDesinit, modo: ModoSistrut = "original") =>
  detalhaViga(ENTRADA_V1, DIMENSIONAMENTO_V1, modo, extras);
const quadro = (extras: ExtrasDesinit, modo: ModoSistrut = "original") =>
  quadroDaViga(detalha(extras, modo), ENTRADA_V1.secoes, ENTRADA_V1.forma, 0, dsp, modo);

describe("edição do oráculo (retrad_des_edc)", () => {
  const e = edicaoOraculo();

  it("comprimento da viga = o gravado no .EDV: 20 + 380 + 20 + 380 + 20 = 820 cm", () => {
    const c = montaComum(ENTRADA_V1, DIMENSIONAMENTO_V1, "original");
    faces(c);
    expect(comprimentoDaViga(c)).toBe(820);
    expect(e.comprimento).toBe(820);
  });

  it("quadro com a edição = o .TAB regravado pelo original depois do DESEDCAO", () => {
    for (const modo of ["original", "corrigido"] as const) {
      const q = quadro({ armaduraEditada: e }, modo);
      expect(q.comprimentoPorBitola).toEqual(tabOraculo());
    }
    expect(tabOraculo().filter((c) => c !== 0)).toEqual([8448, 1153, 2612]);
  });

  it("a edição entra na memória e não gera aviso", () => {
    const d = detalha({ armaduraEditada: e });
    expect(d.avisos).toEqual([]);
    expect(d.memoria.some((m) => m.descricao.startsWith("Armadura editada no DESEDCAO"))).toBe(
      true,
    );
  });

  it("reaberta sem dimensionamento (caminho do DESEDITA): o mesmo quadro", () => {
    const d = detalhaViga(ENTRADA_V1, { nome: "V1", tramos: [], apoios: [] }, "original", {
      armaduraEditada: e,
      reabreEdicao: true,
    });
    const q = quadroDaViga(d, ENTRADA_V1.secoes, ENTRADA_V1.forma, 0, dsp, "original");
    expect(q.comprimentoPorBitola).toEqual(tabOraculo());
  });
});

describe("edição que muda a armadura", () => {
  const base = edicaoOraculo();
  // negativa central 2φ10 → 3φ12,5; grampo 2φ8 no apoio 0; pele 1φ8 por face no tramo 1;
  // estribos do tramo 1 a cada 15 cm
  const editada: EdicaoVigaSistrut = {
    ...base,
    negativas: base.negativas.map((b, i) => (i === 0 ? { ...b, quantidade: 3, bitola: 12.5 } : b)),
    grampoNegativos: [
      { quantidade: 2, bitola: 8, inicio: 2, fim: 42, lado: "esquerdo", largura: 16 },
    ],
    pele: {
      linhas: 1,
      trechos: [{ trecho: 1, quantidadePorFace: 1, bitola: 8, inicio: 20, fim: 400 }],
      trechosPorBitola: [0, 0, 0, 1, 0, 0],
    },
    estribos: base.estribos.map((t, i) => (i === 0 ? { ...t, espacamento: 15 } : t)),
  };
  const q = quadro({ armaduraEditada: editada });

  it("φ12,5: 3 × (630 − 190) = 1320 cm", () => {
    expect(q.comprimentoPorBitola[indice(12.5)]).toBe(1320);
  });
  it("φ10: só as positivas, 2 × (818 − 2 + 25 + 25) = 1732 cm", () => {
    expect(q.comprimentoPorBitola[indice(10)]).toBe(1732);
  });
  it("φ8: grampo 2 × (2·40 + 16) + pele (400 − 20)·1·2 = 192 + 760 = 952 cm", () => {
    expect(q.comprimentoPorBitola[indice(8)]).toBe(952);
  });
  it("φ6,3: as mesmas negativas de ponta e porta-estribos, 1153 cm", () => {
    expect(q.comprimentoPorBitola[indice(6.3)]).toBe(1153);
  });
  it("φ5: (INT(380/15) + 1) + (INT(380/12) + 1) = 26 + 32 estribos de 132 cm = 7656 cm", () => {
    expect(q.comprimentoPorBitola[indice(5)]).toBe(7656);
  });
  it("volume e fôrma não mudam (76 e 912)", () => {
    expect([q.volumeCentesimos, q.formaCentesimos]).toEqual([76, 912]);
  });
});

describe("edição que não serve mais à viga", () => {
  const base = edicaoOraculo();
  const automatico = quadro({});

  it.each([
    [{ tramos: 3 }, /3 tramos na edição e 2 na viga/],
    [{ balancoDireito: true }, /balanço direito: com na edição e sem na viga/],
  ] as const)("%o: descartada com aviso, vale o automático", (troca, motivo) => {
    const mudada = {
      ...base,
      negativas: base.negativas.map((b) => ({ ...b, bitola: 16 })),
      ...troca,
    };
    const d = detalha({ armaduraEditada: mudada });
    expect(d.avisos).toHaveLength(1);
    expect(d.avisos[0]).toMatch(/R1__E2E\.EDV.*descartada porque a viga mudou depois da edição/);
    expect(d.avisos[0]).toMatch(motivo);
    expect(quadro({ armaduraEditada: mudada }).comprimentoPorBitola).toEqual(
      automatico.comprimentoPorBitola,
    );
  });

  // O DESEDITA lê a linha 2 do .EDV (o comprimento) para uma variável que descarta
  // (DESEDITA.BAS:747) e aplica a edição à viga atual: o .TAB sai da edição com a forma da
  // viga nova. Edição de 830 cm numa viga de 820 cm: no original, o quadro é o da edição
  // (as bitolas trocadas para φ16), com aviso; no corrigido, a edição é descartada.
  it("comprimento diferente: o original aplica a edição e avisa; o corrigido descarta", () => {
    const mudada = {
      ...base,
      negativas: base.negativas.map((b) => ({ ...b, bitola: 16 })),
      comprimento: 830,
    };
    const original = detalha({ armaduraEditada: mudada });
    expect(original.avisos).toHaveLength(1);
    expect(original.avisos[0]).toMatch(
      /V1: a viga mudou depois da edição \(comprimento de 830 cm na edição e 820 cm na viga\).*R1__E2E\.EDV\) foi aplicada à viga atual/,
    );
    const comEdicao = quadro({ armaduraEditada: mudada }).comprimentoPorBitola;
    expect(comEdicao).not.toEqual(automatico.comprimentoPorBitola);
    expect(comEdicao[indice(16)]).toBeGreaterThan(0);

    const corrigido = detalha({ armaduraEditada: mudada }, "corrigido");
    expect(corrigido.avisos).toHaveLength(1);
    expect(corrigido.avisos[0]).toMatch(/descartada porque a viga mudou depois da edição/);
    expect(quadro({ armaduraEditada: mudada }, "corrigido").comprimentoPorBitola).toEqual(
      quadro({}, "corrigido").comprimentoPorBitola,
    );
  });

  it("1 cm de diferença no comprimento ainda serve", () => {
    expect(detalha({ armaduraEditada: { ...base, comprimento: 821 } }).avisos).toEqual([]);
  });

  it("reaberta sem dimensionamento, a edição que não serve é erro", () => {
    expect(() =>
      detalhaViga(ENTRADA_V1, { nome: "V1", tramos: [], apoios: [] }, "original", {
        armaduraEditada: { ...base, tramos: 3 },
        reabreEdicao: true,
      }),
    ).toThrow(/não serve à viga/);
  });
});

describe("modo corrigido: As editada contra a necessária", () => {
  const base = edicaoOraculo();
  // apoio 1 precisa de 1,50 cm² (casoV1: 2#10); 1φ5 dá 0,20 cm²
  const fraca: EdicaoVigaSistrut = {
    ...base,
    negativas: base.negativas.map((b, i) => (i === 0 ? { ...b, quantidade: 1, bitola: 5 } : b)),
  };

  it("avisa o apoio 1 (0,2 < 1,5 cm²); os tramos com 2φ10 = 1,6 cm² passam", () => {
    const avisos = detalha({ armaduraEditada: fraca }, "corrigido").avisos;
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/^apoio 1, a 410 cm da ponta esquerda: armadura negativa/);
    expect(avisos[0]).toMatch(/As = 0,2 cm², abaixo da necessária .* \(1,5 cm²\)/);
  });

  it("o modo original não confere (o DESEDCAO não confere)", () => {
    expect(detalha({ armaduraEditada: fraca }).avisos).toEqual([]);
  });

  it("a edição do oráculo passa sem aviso no corrigido", () => {
    expect(detalha({ armaduraEditada: base }, "corrigido").avisos).toEqual([]);
  });
});

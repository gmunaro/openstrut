// Referências: caso_a_laje (As antes e depois da otimização são iguais: os dois
// lados de cada continuidade têm o mesmo negativo) e contas à mão de
// livros_laje.md 1.14 para os casos que mudam o coeficiente e para o defeito R3.
// O M+ de entrada vem do coeficiente de carga da conta à mão (ver armaduras.test.ts)
// ou é fixado no teste; `recalcula` refaz os momentos com os códigos novos.
import { describe, expect, it } from "vitest";
import { CASOS_ORACULO, bateComImpresso, valorOraculo } from "../__oraculo__";
import { sng } from "../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type {
  Continuidade,
  EsforcosLajes,
  LajeSistrut,
  MateriaisSistrut,
  ModoSistrut,
  MomentosDeLaje,
} from "../base/tipos";
import { armadurasLaje } from "./armaduras";
import { NaoConvergeOtimizacao, otimizaNegativos } from "./otimizacao";

const PARAM = emSingle(PARAMETROS_LAJE);
const E2E: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};
const COEF_E2E = 2.017982780617627;

/** Momentos com M+ dado (t·cm/m), H 10 e os códigos e fatores dos bordos. */
function momentosComMPositivo(
  nome: string,
  mPos: number,
  codigos: number[],
  fatores: number[],
): MomentosDeLaje {
  return {
    nome,
    h: 10,
    q: sng(0.5),
    pesoProprio: sng(0.25),
    coeficiente: {
      coeficiente: sng(COEF_E2E),
      l1a: 0,
      l32: 0,
      l1e: 0,
      l22: 0,
      l26: 0,
      l2a: 0,
      l2e: 0,
    },
    mPositivoPrincipalTcm: mPos,
    mPositivoSecundarioTcm: sng(mPos * sng(0.8)),
    mNegativoMaiorTcm: 0,
    mNegativoMenorTcm: 0,
    bordos: codigos.map((codigo, i) => ({
      fatorDirecao: sng(fatores[i]!),
      coeficiente: codigo > 2 ? sng(((codigo - 2) * fatores[i]!) / 10) : 0,
    })),
  };
}

const laje = (nome: string, codigos: number[]): LajeSistrut => ({
  nome,
  tipo: 0,
  vertices: [],
  indicesVertices: [],
  grupo: 0,
  codigos,
  angulo: 0,
  mu: sng(0.8),
  cargaPermanente: sng(0.1),
  pesoProprio: sng(0.25),
  h: 10,
});

/** Painel de teste: lajes, continuidades, M+ de cada laje e fatores por bordo.
 *  O M+ não depende dos códigos (é o que basta para conferir a otimização à mão). */
function painel(
  lajes: LajeSistrut[],
  continuidades: Continuidade[],
  mPositivo: Record<string, number>,
  fatores: Record<string, number[]>,
) {
  const recalcula = (l: LajeSistrut) =>
    momentosComMPositivo(l.nome, mPositivo[l.nome]!, l.codigos, fatores[l.nome]!);
  const momentos = Object.fromEntries(lajes.map((l) => [l.nome, recalcula(l)]));
  const esforcos: EsforcosLajes = {
    lajes,
    continuidades,
    preparadas: {},
    coeficientes: Object.fromEntries(lajes.map((l) => [l.nome, momentos[l.nome]!.coeficiente])),
    bordos: Object.fromEntries(lajes.map((l) => [l.nome, momentos[l.nome]!.bordos])),
    momentos,
    avisos: [],
    memoria: [],
  };
  return { esforcos, recalcula };
}

describe("caso_a_laje: nada muda (negativos iguais dos dois lados)", () => {
  const caso = CASOS_ORACULO.caso_a_laje!;
  // M+ = 100·(0,5/2,0179828) (livros_laje.md 2.2); fatores: base, direita, topo, esquerda.
  const mPos = sng(100 * sng(0.5 / sng(COEF_E2E)));
  const fatores = {
    L1: [0.8, 1, 0.8, 1],
    L2: [0.8, 1, 0.8, 1],
    L3: [0.8, 1, 0.8, 1],
    L4: [0.8, 1, 0.8, 1],
  };
  const { esforcos, recalcula } = painel(
    [
      laje("L1", [22, 22, 0, 0]),
      laje("L2", [22, 0, 0, 22]),
      laje("L3", [0, 22, 22, 0]),
      laje("L4", [0, 0, 22, 22]),
    ],
    [
      { lajeA: "L1", bordoA: 1, lajeB: "L2", bordoB: 3 },
      { lajeA: "L1", bordoA: 0, lajeB: "L3", bordoB: 2 },
      { lajeA: "L2", bordoA: 0, lajeB: "L4", bordoB: 2 },
      { lajeA: "L3", bordoA: 1, lajeB: "L4", bordoB: 3 },
    ],
    { L1: mPos, L2: mPos, L3: mPos, L4: mPos },
    fatores,
  );
  for (const modo of ["original", "corrigido"] as ModoSistrut[]) {
    it(modo, () => {
      const r = otimizaNegativos(esforcos, recalcula, E2E, PARAM, modo);
      expect(r.lajes.map((l) => l.codigos)).toEqual(esforcos.lajes.map((l) => l.codigos));
      expect(r.memoria).toEqual([]);
      expect(r.avisos).toEqual([]);
      for (const nome of ["L1", "L2", "L3", "L4"]) {
        const a = armadurasLaje(r.momentos[nome]!, E2E, PARAM, modo);
        expect(bateComImpresso(valorOraculo(caso, `${nome}.As-maior`), a.asNegativaMaior)).toBe(
          true,
        );
        expect(bateComImpresso(valorOraculo(caso, `${nome}.As-menor`), a.asNegativaMenor)).toBe(
          true,
        );
      }
    });
  }
});

describe("lado maior reduz a relação (LAJECALC.BAS:2103-2125)", () => {
  // A: M+ 30, i 2,0 → M1 = 60; B: M+ 20, i 2,0 → M2 = 40. (60 − 40)/60 = 0,33 ≥ 0,1:
  // coef = INT(100·2·40/60)/100 = 1,33 → código CINT(15,3) = 15 (i 1,3). Repete: M1 =
  // 30·1,3 = 39 < 40 e (40 − 39)/40 = 0,025 < 0,1: para.
  const { esforcos, recalcula } = painel(
    [laje("A", [22]), laje("B", [22])],
    [{ lajeA: "A", bordoA: 0, lajeB: "B", bordoB: 0 }],
    { A: 30, B: 20 },
    { A: [1], B: [1] },
  );
  it("original: código 15 em A, B fica 22", () => {
    const r = otimizaNegativos(esforcos, recalcula, E2E, PARAM, "original");
    expect(r.lajes.map((l) => l.codigos[0])).toEqual([15, 22]);
    expect(r.memoria).toHaveLength(1);
    expect(r.momentos.A!.bordos[0]!.coeficiente).toBeCloseTo(1.3, 6);
  });
  it("corrigido: coeficiente com 2 casas, código 2 + 10·1,33 = 15,3; depois 39,9 × 40 para", () => {
    const r = otimizaNegativos(esforcos, recalcula, E2E, PARAM, "corrigido");
    expect(r.lajes[0]!.codigos[0]).toBeCloseTo(15.3, 10);
    expect(r.lajes[1]!.codigos[0]).toBe(22);
  });
  it("relação no mínimo 0,30 não reduz mais", () => {
    const { esforcos: e, recalcula: rc } = painel(
      [laje("A", [5]), laje("B", [5])],
      [{ lajeA: "A", bordoA: 0, lajeB: "B", bordoB: 0 }],
      { A: 30, B: 20 },
      { A: [1], B: [1] },
    );
    expect(otimizaNegativos(e, rc, E2E, PARAM, "original").lajes.map((l) => l.codigos[0])).toEqual([
      5, 5,
    ]);
  });
});

describe("armadura imposta na continuidade (LAJECALC.BAS:2165-2221)", () => {
  // Imposta 2015 = # 6.3 com s 15 cm: As_imp = 0,315/15·100 = 2,10; 1,03·2,10 = 2,163.
  const imposta = (mPos: number) =>
    painel(
      [laje("A", [12])],
      [{ lajeA: "A", bordoA: 0, lajeB: null, bordoB: 0, armaduraImposta: 2015 }],
      { A: mPos },
      { A: [1] },
    );
  it("M− 55 → As 2,383; fator max(2,10/2,383; 0,85) = 0,881 → coef 0,88 → código 11 (i 0,9); M− 49,5 → As 2,127 ≤ 2,163", () => {
    const { esforcos, recalcula } = imposta(55);
    const r = otimizaNegativos(esforcos, recalcula, E2E, PARAM, "original");
    expect(r.lajes[0]!.codigos[0]).toBe(11);
    expect(r.avisos).toEqual([]);
  });
  it("R3, original: M− 50,6 → As 2,178, fator 0,964 → coef 0,96 → CINT(11,6) = 12: o código não muda; erro explícito", () => {
    const { esforcos, recalcula } = imposta(50.6);
    const erro = (() => {
      try {
        otimizaNegativos(esforcos, recalcula, E2E, PARAM, "original");
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(erro).toBeInstanceOf(NaoConvergeOtimizacao);
    if (!(erro instanceof NaoConvergeOtimizacao)) return;
    expect(erro.message).toContain("R3");
    expect(erro.estado).toMatchObject({ laje: "A", lado: 0, codigo: 12 });
    expect(erro.estado.relacaoNova).toBeCloseTo(0.96, 6);
  });
  it("R3, corrigido: grava 2 + 10·0,96 = 11,6; M− 48,58 → As 2,085 ≤ 2,163 e converge", () => {
    const { esforcos, recalcula } = imposta(50.6);
    const r = otimizaNegativos(esforcos, recalcula, E2E, PARAM, "corrigido");
    expect(r.lajes[0]!.codigos[0]).toBeCloseTo(11.6, 10);
    expect(r.avisos).toEqual([]);
  });
});

describe("bordo engastado sem continuidade registrada", () => {
  it("avisa e não mexe", () => {
    const { esforcos, recalcula } = painel([laje("A", [22])], [], { A: 30 }, { A: [1] });
    const r = otimizaNegativos(esforcos, recalcula, E2E, PARAM, "original");
    expect(r.lajes[0]!.codigos[0]).toBe(22);
    expect(r.avisos).toHaveLength(1);
  });
});

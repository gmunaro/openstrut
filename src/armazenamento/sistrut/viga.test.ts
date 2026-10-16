/// <reference types="node" />
// Importador da parte de viga do SISTRUT (viga.ts) sem o oráculo: um .VIG montado aqui no
// leiaute do registro de 855 bytes (VIGA.BAS:2875-3040), a marca do pilar no J, a
// conversão das divisões em cargas da obra e a ida pelo motor; e o .DSP e o VIGA.INI de
// fábrica (C:/tmp/oraculo/orig/, pulado sem eles) contra as tabelas embutidas
// (base/parametros.ts), com as duas diferenças que o parametros.ts documenta.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcularObra } from "../../calculo/fluxo";
import { nb178 } from "../../calculo/normas";
import { PARAMETROS_DSP, PARAMETROS_VIGA } from "../../calculo/sistrut/base/parametros";
import { KN_POR_TF } from "../../calculo/sistrut/base/unidades";
import { calcularObraSistrut } from "../../calculo/sistrut/obra";
import {
  decimalDoSingle,
  importarVigasSistrut,
  lerDsp,
  lerVig,
  lerVigaIni,
  pilarDaMarca,
} from "./viga";
import { V1, vig } from "./__teste__/vig";

describe("leitura do .VIG", () => {
  it("o registro de 855 bytes, com o número de vigas no cabeçalho", () => {
    const [r] = lerVig(vig([V1]).dados);
    expect(r!.nome).toBe("V1");
    expect([r!.tramos, r!.balancoEsquerdo, r!.balancoDireito]).toEqual([2, false, true]);
    expect(r!.trechos[3]!.vao).toBeCloseTo(1.2, 6);
    expect(r!.divisoes[1]).toEqual({ p: 2, d: Math.fround(0.4), f: 3, pac: 0.5, fac: 0 });
  });

  it("tamanho fora do registro e cabeçalho inconsistente são erro", () => {
    expect(() => lerVig(new Uint8Array(100))).toThrow(/múltiplo de 855/);
    const x = vig([V1]).dados;
    new DataView(x.buffer).setInt16(25, 3, true);
    expect(() => lerVig(x)).toThrow(/3 vigas/);
  });

  it("marca do pilar no J: CINT((J − INT(J·100)/100)·100000) em SINGLE", () => {
    expect(pilarDaMarca(Math.fround(1.00007))).toBe(7);
    expect(pilarDaMarca(Math.fround(1.00471))).toBe(471);
    expect(pilarDaMarca(1)).toBe(0);
    expect(pilarDaMarca(Math.fround(1.95))).toBe(0);
  });

  it("decimal mais curto que volta ao mesmo SINGLE", () => {
    expect(decimalDoSingle(Math.fround(0.4))).toBe(0.4);
    expect(decimalDoSingle(Math.fround(1.00003))).toBe(1.00003);
  });
});

describe("gerar a obra a partir do .VIG", () => {
  const r = importarVigasSistrut([vig([V1])]);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  const v = r.obra.pavimentos[0]!.vigas[0]!;

  it("a viga numa linha, um pilar em cada apoio com o número da marca no J", () => {
    expect(r.obra.pavimentos[0]!.pilares.map((p) => [p.nome, p.x, p.y])).toEqual([
      ["P7", 0, 0],
      ["P8", 4, 0],
      ["P9", 9, 0],
    ]);
    expect([v.x1, v.x2, v.somenteCargasProprias]).toEqual([0, 10.2, true]);
    expect(v.vaos).toEqual([4, 5, 1.2]);
    expect(v.inercias).toEqual([1.00008, 1.00009, 1]);
  });

  it("as divisões viram cargas em kN e kN/m, com a acidental explícita", () => {
    expect(v.cargas).toEqual([
      {
        tipo: "distribuida",
        trecho: 0,
        inicio: 0,
        fim: 0.4,
        total: 2 * KN_POR_TF,
        acidental: 0.5 * KN_POR_TF,
      },
      { tipo: "concentrada", trecho: 0, posicao: 0.4, total: 3 * KN_POR_TF, acidental: 0 },
      {
        tipo: "distribuida",
        trecho: 0,
        inicio: 0.4,
        fim: 4,
        total: 2 * KN_POR_TF,
        acidental: 0.5 * KN_POR_TF,
      },
      {
        tipo: "distribuida",
        trecho: 1,
        inicio: 0,
        fim: 5,
        total: 2 * KN_POR_TF,
        acidental: 0.5 * KN_POR_TF,
      },
      { tipo: "distribuida", trecho: 2, inicio: 0, fim: 1.2, total: 2 * KN_POR_TF, acidental: 0 },
      { tipo: "concentrada", trecho: 2, posicao: 1.2, total: KN_POR_TF, acidental: 0 },
    ]);
  });

  it("o motor regrava o mesmo registro (modo original, bit a bit)", () => {
    const p = calcularObraSistrut(r.obra, { modo: "original" }).pavimentos[0]!;
    const d = p.vig[0]!;
    const f = Math.fround;
    expect(d.tramos.map((t) => [t.vao, t.inercia])).toEqual([
      [4, f(1.00008)],
      [5, f(1.00009)],
    ]);
    expect(d.tramos[0]!.divisoes.map((x) => [x.p, x.d, x.f, x.pAcidental])).toEqual([
      [2, f(0.4), 3, 0.5],
      [2, 4, 0, 0.5],
    ]);
    expect(d.balancoDireito).toEqual({
      vao: f(1.2),
      inercia: 1,
      divisoes: [{ p: 2, d: f(1.2), f: 1, pAcidental: 0, fAcidental: 0 }],
    });
    // Σ R = 2·(4 + 5 + 1,2) + 3 + 1
    expect(p.analises[0]!.somaReacoes).toBeCloseTo(24.4, 4);
    expect(p.rep.map((l) => l.pilar)).toEqual(["P7", "P8", "P9"]);
  });

  it("a projeção em SI (calcularObra, NB-1/78) roda a obra importada", () => {
    const res = calcularObra(r.obra, nb178);
    expect(res.pavimentos[0]!.vigas.map((x) => x.viga.nome)).toEqual(["V1"]);
    expect(res.pavimentos[0]!.equilibrio.avisos).toEqual([]);
  });

  it("o modo corrigido roda a mesma obra sem aviso de viga", () => {
    const p = calcularObraSistrut(r.obra, { modo: "corrigido" }).pavimentos[0]!;
    expect(p.avisos.filter((a) => a.startsWith("Viga"))).toEqual([]);
    expect(p.analises[0]!.somaReacoes).toBeCloseTo(24.4, 6);
  });

  it("sem .VIG é erro com a lista do que importar", () => {
    const x = importarVigasSistrut([]);
    expect(x.ok).toBe(false);
    expect(!x.ok && x.erros[0]).toMatch(/Selecione o \.VIG/);
  });
});

const ORIG = "C:/tmp/oraculo/orig";

describe.skipIf(!existsSync(`${ORIG}/SISTRUT.DSP`))(
  "SISTRUT.DSP de fábrica (lido do disco)",
  () => {
    const dsp = lerDsp(readFileSync(`${ORIG}/SISTRUT.DSP`, "latin1"));
    it("é a tabela embutida, menos as duas diferenças documentadas em parametros.ts", () => {
      const f = Math.fround;
      const emSingle = (x: unknown): unknown =>
        typeof x === "number"
          ? f(x)
          : Array.isArray(x)
            ? x.map(emSingle)
            : x && typeof x === "object"
              ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, emSingle(v)]))
              : x;
      const esperado = {
        ...PARAMETROS_DSP,
        // o 3º intervalo termina em 70 no arquivo (170 no embutido, DESENHO.BAS:4919)
        arranjosPorIntervalo: PARAMETROS_DSP.arranjosPorIntervalo.map((l, i) =>
          i === 2 ? l.map((a) => (a.area === 170 ? { ...a, area: 70 } : a)) : l,
        ),
        // a 5ª linha da tabela 1 é 120 no arquivo (100 no embutido, DESENHO.BAS:5014)
        tabelaBitola1: [15, 30, 70, 85, 120],
      };
      expect(emSingle(dsp)).toEqual(emSingle(esperado));
    });
  },
);

describe.skipIf(!existsSync(`${ORIG}/VIGA.INI`))("VIGA.INI de fábrica (lido do disco)", () => {
  it("é o PARAMETROS_VIGA", () => {
    expect(lerVigaIni(readFileSync(`${ORIG}/VIGA.INI`, "latin1"))).toEqual(PARAMETROS_VIGA);
  });
});

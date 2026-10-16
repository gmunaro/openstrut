// Campos de pilar da NB-1/78 pelo SISTRUT no arquivo da obra: todos opcionais, sem
// migração (a versão continua 3): ida e volta, validação com o caminho do erro e
// arquivo antigo sem os campos.
import { describe, expect, it } from "vitest";
import type { Obra } from "../dominio/obra";
import { obraE2E } from "../calculo/sistrut/__e2e__/obraE2E";
import { lerObra, serializarObra } from "./arquivo";

/** E2E com todos os campos novos no P5 e na obra. */
function obraCompleta(): Obra {
  const o = obraE2E("original");
  const pav = o.pavimentos[0]!;
  return {
    ...o,
    parametrosPilar: {
      predimensionamento: "secao",
      ini: { maximoBarras: 60, fck: 20, classeAco: "A", excentricidades: "simultaneas" },
      pip: {
        densidade: 24.5,
        reduzAcidentalDimensionamento: true,
        coeficienteFlambagem: [
          [0.5, 0.7, 0.7, 2],
          [0.7, 0.9, 0.85, 2],
          [0.7, 0.85, 1, 2],
          [2, 2, 2, 100],
        ],
      },
    },
    pavimentos: [
      {
        ...pav,
        pilares: pav.pilares.map((p) =>
          p.id !== "P5"
            ? p
            : {
                ...p,
                secao: { tipo: "circular", d: 25, dInterno: 5 },
                vinculos: { x: "engaste", y: "semiEngaste" },
                vinculosTopo: { x: "livre", y: "continuidade" },
                excentricidade: { x: 2.5, y: -1 },
                vento: { normal: 9.8, momentos: [{ m: 2.9, angulo: 90 }] },
                cargaTopo: {
                  normal: 170.3,
                  // vão com sinal: o .REP lido grava vão·(−SGN(M))
                  momentos: [{ m: 6.3, inclinacao: 0, vao: -4, rigidez: 64000 }],
                },
                verificacoes: [
                  {
                    barras: [{ x: 3, y: 3, bitola: 12.5 }],
                    estribo: { bitola: 6.3, espacamento: 12 },
                  },
                  {
                    barras: [{ x: 17, y: 3, bitola: 16 }],
                    esforcos: { nk: 170.3, mxk: 1, myk: 0, lex: 3, ley: 3 },
                  },
                ],
              },
        ),
      },
    ],
  };
}

describe("arquivo: campos de pilar da NB-1/78", () => {
  it("ida e volta sem perda", () => {
    const o = obraCompleta();
    const r = lerObra(serializarObra(o));
    expect(r).toEqual({ ok: true, obra: o });
  });

  it("arquivo antigo (sem os campos) abre igual e não ganha campo novo", () => {
    const o = obraE2E("original");
    const r = lerObra(serializarObra(o));
    expect(r.ok && r.obra).toEqual(o);
    expect(r.ok && "parametrosPilar" in r.obra).toBe(false);
    expect(r.ok && r.obra.pavimentos[0]!.pilares.every((p) => !("secao" in p))).toBe(true);
  });

  it("erros com o caminho do campo", () => {
    const o = obraCompleta();
    const texto = serializarObra(o)
      .replace('"engaste"', '"rotula"')
      .replace('"dInterno": 5', '"dInterno": 30')
      .replace('"maximoBarras": 60', '"maximoBarras": 60, "barrasMaximas": 1')
      .replace('"predimensionamento": "secao"', '"predimensionamento": "sim"');
    const r = lerObra(texto);
    expect(r.ok).toBe(false);
    const erros = r.ok ? [] : r.erros;
    expect(erros.some((e) => e.includes("pilares[4].vinculos.x") && e.includes("rotula"))).toBe(
      true,
    );
    expect(erros.some((e) => e.includes("pilares[4].secao.dInterno"))).toBe(true);
    expect(erros.some((e) => e.includes('campo desconhecido "barrasMaximas"'))).toBe(true);
    expect(erros.some((e) => e.includes("parametrosPilar.predimensionamento"))).toBe(true);
  });

  it("rodada 2: armadura, transição, modo da carga, variaArmadura, rlp e maximoVariacoes", () => {
    const o = obraCompleta();
    o.parametrosPilar = { ...o.parametrosPilar, variaArmadura: 0, rlp: false };
    o.parametrosPilar.ini = { ...o.parametrosPilar.ini, maximoVariacoes: 10 };
    const pilares = o.pavimentos[0]!.pilares;
    pilares[0] = {
      ...pilares[0]!,
      transicao: true,
      armadura: { barras: [{ x: 3, y: 3, bitola: 10 }], estribo: { bitola: 5, espacamento: 12 } },
      cargaTopo: { normal: 10, momentos: [], modo: "maxima" },
    };
    pilares[1] = { ...pilares[1]!, armadura: {} };
    expect(lerObra(serializarObra(o))).toEqual({ ok: true, obra: o });
    const ruim = serializarObra(o)
      .replace('"variaArmadura": 0', '"variaArmadura": 1.5')
      .replace('"modo": "maxima"', '"modo": "maior"')
      .replace('"transicao": true', '"transicao": false');
    const r = lerObra(ruim);
    const erros = r.ok ? [] : r.erros;
    expect(erros.some((e) => e.includes("variaArmadura") && e.includes("inteiro"))).toBe(true);
    expect(erros.some((e) => e.includes("cargaTopo.modo"))).toBe(true);
    expect(erros.some((e) => e.includes("transicao"))).toBe(true);
  });

  it("armadura dada sem barras é erro", () => {
    const o = obraCompleta();
    o.pavimentos[0]!.pilares[0] = { ...o.pavimentos[0]!.pilares[0]!, armadura: { barras: [] } };
    const r = lerObra(serializarObra(o));
    const erros = r.ok ? [] : r.erros;
    expect(
      erros.some((e) => e.includes("armadura.barras") && e.includes("ao menos uma barra")),
    ).toBe(true);
  });

  it("rotação só na retangular, de 0 a 360 graus", () => {
    const o = obraCompleta();
    const pilares = o.pavimentos[0]!.pilares;
    pilares[0] = { ...pilares[0]!, rotacao: 30 };
    expect(lerObra(serializarObra(o)).ok).toBe(true);
    pilares[0] = { ...pilares[0]!, rotacao: 400 };
    pilares[4] = { ...pilares[4]!, rotacao: 10 };
    const r = lerObra(serializarObra(o));
    const erros = r.ok ? [] : r.erros;
    expect(erros.some((e) => e.includes("pilares[0].rotacao") && e.includes("0 a 360"))).toBe(true);
    expect(erros.some((e) => e.includes("pilares[4].rotacao") && e.includes("retangular"))).toBe(
      true,
    );
  });

  it("tabelas com o tamanho do original: 13 bitolas, matriz 4 × 4, até 2 ventos e 4 momentos", () => {
    const o = obraCompleta();
    const p5 = o.pavimentos[0]!.pilares.find((p) => p.id === "P5")!;
    p5.vento!.momentos.push({ m: 1, angulo: 0 }, { m: 1, angulo: 0 });
    o.parametrosPilar!.pip!.coeficienteFlambagem = [[1, 1, 1]];
    o.parametrosPilar!.ini!.bitolas = [{ bitola: 10, area: 0.8 }];
    const r = lerObra(serializarObra(o));
    const erros = r.ok ? [] : r.erros;
    expect(erros.some((e) => e.includes("vento.momentos") && e.includes("no máximo 2"))).toBe(true);
    expect(erros.some((e) => e.includes("coeficienteFlambagem") && e.includes("4 × 4"))).toBe(true);
    expect(erros.some((e) => e.includes("ini.bitolas") && e.includes("13 linhas"))).toBe(true);
  });
});

// Arquivo da obra com a entrada de viga do SISTRUT (campos opcionais novos da Viga e
// Obra.parametrosViga): ida e volta, arquivo antigo sem os campos e as mensagens de erro.
import { describe, expect, it } from "vitest";
import { obraNova } from "../dominio/criar";
import type { Obra, Viga } from "../dominio/obra";
import { lerObra, serializarObra } from "./arquivo";

const viga: Viga = {
  id: "v1",
  nome: "V1",
  x1: 0,
  y1: 0,
  x2: 9,
  y2: 0,
  bw: 20,
  h: 50,
  cargaLinear: 0,
};

function obraCom(v: Partial<Viga>, extra: Partial<Obra> = {}): Obra {
  const o = obraNova("teste", "nb1-78");
  o.pavimentos[0]!.vigas.push({ ...viga, ...v });
  return { ...o, ...extra };
}

const completa: Partial<Viga> = {
  cargas: [
    { tipo: "distribuida", trecho: 0, inicio: 0, fim: 4, total: 19.6, acidental: 4.9 },
    { tipo: "concentrada", trecho: 1, posicao: 0.4, total: 29.4 },
  ],
  somenteCargasProprias: true,
  vaos: [4, 5],
  inercias: [1, 1.95],
  engaste: { esquerdo: false, direito: true },
  momentosExternos: { esquerdo: 0, direito: -3 },
  apoiosDesconsiderados: [2],
  secoes: {
    trechos: [
      { bw: 20, h: 40, bf: 80, hf: 10 },
      { bw: 20, h: 40, bf: 0, hf: 0 },
    ],
    apoios: [{ bw: 20, h: 40 }],
  },
  forma: {
    trechos: [{ vaoLivre: 380, hle: 10, eixo: 10 }],
    apoios: [{ largura: 20, tipo: "P", titulo: "P1", codigo: 1, lps: 20, dis: 0 }],
  },
};

describe("arquivo: entrada de viga do SISTRUT", () => {
  it("obra com todos os campos novos vai e volta igual", () => {
    const o = obraCom(completa, {
      parametrosViga: {
        viga: { acidentais: true, acidentalGerada: true, porcentagemAcidentalGerada: 150 },
        dsp: { classeAco: "A", tabelaBitola1: [15, 30, 70, 85, 120] },
      },
    });
    const r = lerObra(serializarObra(o));
    expect(r.ok && r.obra).toEqual(o);
  });

  it("arquivo sem os campos (obra antiga) abre sem eles", () => {
    const o = obraCom({});
    const r = lerObra(serializarObra(o));
    expect(r.ok).toBe(true);
    const v = r.ok ? r.obra.pavimentos[0]!.vigas[0]! : viga;
    expect(Object.keys(v).sort()).toEqual(Object.keys(viga).sort());
    expect(r.ok && r.obra.parametrosViga).toBeUndefined();
  });

  it("erros com o caminho do campo", () => {
    const o = obraCom({ ...completa });
    const d = JSON.parse(serializarObra(o));
    const v = d.pavimentos[0].vigas[0];
    v.cargas[0].tipo = "pontual";
    v.cargas[1].trecho = 1.5;
    v.vaos[1] = -1;
    v.engaste.direito = "sim";
    v.secoes.trechos[0].bw = 0;
    v.forma.apoios[0].tipo = "X";
    d.parametrosViga = { dsp: { bitolas: [{ bitola: 4 }], foo: 1, classeAco: "C" } };
    const r = lerObra(JSON.stringify(d));
    expect(r.ok).toBe(false);
    const erros = r.ok ? [] : r.erros;
    const c = "pavimentos[0].vigas[0]";
    expect(erros).toEqual([
      `${c}.cargas[0].tipo: esperado um de "distribuida", "concentrada", veio "pontual".`,
      `${c}.cargas[1].trecho: esperado um número inteiro, veio 1.5.`,
      `${c}.vaos[1]: esperado um número maior que zero, veio -1.`,
      `${c}.engaste.direito: esperado verdadeiro ou falso, veio "sim".`,
      `${c}.secoes.trechos[0].bw: esperado um número maior que zero, veio 0.`,
      `${c}.forma.apoios[0].tipo: esperado um de "P", "V", "O", "A", veio "X".`,
      expect.stringMatching(/^obra\.parametrosViga\.dsp\.bitolas: esperado /),
      "obra.parametrosViga.dsp.foo: parâmetro desconhecido.",
      'obra.parametrosViga.dsp.classeAco: esperado um de "A", "B", veio "C".',
    ]);
  });
});

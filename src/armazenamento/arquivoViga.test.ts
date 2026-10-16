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
    lajesNoCorte: "nao",
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
    v.secoes.trechos[0].bw = -1;
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
      `${c}.secoes.trechos[0].bw: esperado um número maior ou igual a zero, veio -1.`,
      `${c}.forma.apoios[0].tipo: esperado um de "P", "V", "O", "A", veio "X".`,
      expect.stringMatching(/^obra\.parametrosViga\.dsp\.bitolas: esperado /),
      "obra.parametrosViga.dsp.foo: parâmetro desconhecido.",
      'obra.parametrosViga.dsp.classeAco: esperado um de "A", "B", veio "C".',
    ]);
  });
});

describe("arquivo: parâmetros do VIGA.INI e do .DSP (revisão do 1d12659)", () => {
  const erros = (parametrosViga: unknown) => {
    const d = JSON.parse(serializarObra(obraCom({})));
    d.parametrosViga = parametrosViga;
    const r = lerObra(JSON.stringify(d));
    return r.ok ? [] : r.erros;
  };
  it("chave herdada do Object (toString, constructor) é parâmetro desconhecido, sem TypeError", () => {
    expect(erros({ viga: { toString: 1, constructor: 2 } })).toEqual([
      "obra.parametrosViga.viga.toString: parâmetro desconhecido.",
      "obra.parametrosViga.viga.constructor: parâmetro desconhecido.",
    ]);
    expect(erros({ dsp: { __proto__: { fck: 9 } } })).toEqual([]);
    expect(erros(JSON.parse('{"dsp":{"__proto__":{"fck":9}}}'))).toEqual([
      "obra.parametrosViga.dsp.__proto__: parâmetro desconhecido.",
    ]);
  });
  it("tabelas com o tamanho do leitor do DESENHO e faixas de grupos e de fissuração", () => {
    const bitolas9 = Array.from({ length: 9 }, () => ({ bitola: 5, area: 0.2, kgPorM: 0.16 }));
    const e = erros({
      dsp: {
        bitolas: bitolas9,
        bitolasEstribo: [{ maxima: 5, minima: 5 }],
        tabelaBitola1: [1, 2],
        gruposBitolas: 7,
        classeFissuracao: 4,
        espacamentosEstribo: [],
      },
    });
    expect(e).toEqual([
      "obra.parametrosViga.dsp.bitolas: esperada uma lista de 10 itens, veio 9.",
      "obra.parametrosViga.dsp.bitolasEstribo: esperada uma lista de 6 itens, veio 1.",
      "obra.parametrosViga.dsp.tabelaBitola1: esperada uma lista de 5 itens, veio 2.",
      "obra.parametrosViga.dsp.gruposBitolas: esperado um inteiro de 3 a 6, veio 7.",
      "obra.parametrosViga.dsp.classeFissuracao: esperado 1, 2 ou 3, veio 4.",
      "obra.parametrosViga.dsp.espacamentosEstribo: esperada uma lista de ao menos 2 espaçamentos, veio 0.",
    ]);
  });
  it("4 grupos de bitolas pedem 4 listas de arranjos e de grupo de corte", () => {
    expect(erros({ dsp: { gruposBitolas: 4 } })).toEqual([
      "obra.parametrosViga.dsp.arranjosPorIntervalo: esperada uma lista de 4 itens, veio 3.",
      "obra.parametrosViga.dsp.grupoDeCorte: esperada uma lista de 4 itens, veio 3.",
    ]);
  });
  it("objeto com chave a mais numa tabela não passa", () => {
    const bitolasEstribo = Array.from({ length: 6 }, () => ({ maxima: 5, minima: 5, x: 1 }));
    expect(erros({ dsp: { bitolasEstribo } })[0]).toMatch(
      /^obra\.parametrosViga\.dsp\.bitolasEstribo: esperado /,
    );
  });
  it("seção 0 num trecho (balanço que herda a do apoio) é aceita", () => {
    const o = obraCom({ secoes: { trechos: [{ bw: 0, h: 0, bf: 0, hf: 0 }] } });
    expect(lerObra(serializarObra(o)).ok).toBe(true);
  });
});

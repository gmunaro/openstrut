// Formulário da entrada de viga do SISTRUT: rótulos de trechos e apoios pela planta,
// ida e volta sem perda, campos vazios que somem do arquivo e as mensagens das regras do
// leitor do arquivo. Planta: a obra do v2par_laje_r3 (e2e/fixtures), V1 em y = 6 de x = 0
// a 7,8 com os pilares P6 (0; 6), P5 (6; 6) e P4 (7,8; 6).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerObra } from "../../../armazenamento/arquivo";
import type { Pavimento, Viga } from "../../../dominio/obra";
import { formDaViga, geometriaDaViga, vigaDoForm, vigasQueCruzam } from "./viga";

function pavimentoR3(): Pavimento {
  const r = lerObra(readFileSync("e2e/fixtures/laje-r3-original.openstrut.json", "utf8"));
  if (!r.ok) throw new Error(r.erros.join("\n"));
  const pav = r.obra.pavimentos[0];
  if (!pav) throw new Error("sem pavimento");
  return pav;
}
const pav = pavimentoR3();
const viga = (nome: string) => {
  const v = pav.vigas.find((x) => x.nome === nome);
  if (!v) throw new Error(nome);
  return v;
};

describe("geometria da viga no editor", () => {
  it("V1: dois trechos (6,00 e 1,80 m) e três apoios na ordem do eixo crescente", () => {
    const geo = geometriaDaViga(pav, viga("V1").id);
    expect(geo?.trechos.map((t) => t.rotulo)).toEqual([
      "Trecho 0: P6–P5, 6,00 m",
      "Trecho 1: P5–P4, 1,80 m",
    ]);
    expect(geo?.trechos[1]?.vao).toBeCloseTo(1.8, 9);
    expect(geo?.apoios).toEqual(["Apoio 0: P6", "Apoio 1: P5", "Apoio 2: P4"]);
  });

  it("V1 cruza ou toca as três vigas verticais (x = 0, 6 e 7,8)", () => {
    expect(vigasQueCruzam(pav, viga("V1")).map((v) => v.nome)).toEqual(["V3", "V4", "V5"]);
  });
});

describe("formulário ↔ viga", () => {
  const v1 = viga("V1");
  const geo = geometriaDaViga(pav, v1.id);
  const completa: Viga = {
    ...v1,
    pesoProprio: 1.5,
    apoiaEm: [viga("V4").id],
    cargas: [
      { tipo: "distribuida", trecho: 0, inicio: 0, fim: 6, total: 5, acidental: 1.5 },
      { tipo: "concentrada", trecho: 1, posicao: 0.9, total: 12 },
      { tipo: "reacao", trecho: 0, posicao: 3, viga: "V4", apoio: 1 },
    ],
    somenteCargasProprias: true,
    vaos: [6, 1.8],
    inercias: [1.00005, 1],
    engaste: { esquerdo: true, direito: false },
    momentosExternos: { esquerdo: -2, direito: 0 },
    apoiosDesconsiderados: [2],
    pilaresNoRep: [6, null, 4],
    repeticoes: 2,
    armaduraDigitada: [
      { em: "apoio", numero: 1, tracionada: { bitola: 12.5, barras: 3 }, comprimida: "-" },
      { em: "tramo", numero: 1, fissuracao: { quantidade: 4 } },
    ],
    continuaSeExcederLimite: true,
    secoes: {
      trechos: [
        { bw: 12, h: 50, bf: 60, hf: 10 },
        { bw: 12, h: 50, bf: 0, hf: 0 },
      ],
      apoios: [
        { bw: 12, h: 50 },
        { bw: 12, h: 50 },
        { bw: 12, h: 50 },
      ],
    },
    forma: { lajesNoCorte: "mesa", trechos: [{ pe: 0, hle: 10 }, {}] },
  };

  it("ida e volta: a viga sai igual à que entrou", () => {
    expect(vigaDoForm(formDaViga(completa, geo), completa, geo)).toEqual(completa);
  });

  it("tudo no padrão: nenhum campo do SISTRUT fica na viga; os da planta ficam", () => {
    const f = formDaViga(v1, geo);
    const r = vigaDoForm(f, completa, geo);
    expect(r).toEqual(v1);
  });

  it("tabelas por trecho e por apoio têm o tamanho da planta", () => {
    const f = formDaViga(v1, geo);
    expect(f.secoesTrechos).toHaveLength(2);
    expect(f.secoesApoios).toHaveLength(3);
    // vão pré-preenchido com o da planta
    expect(f.vaos.map((x) => x.vao)).toEqual(["6", "1,8"]);
  });
});

describe("mensagens do formulário da viga", () => {
  const v1 = viga("V1");
  const geo = geometriaDaViga(pav, v1.id);
  const erros = (muda: (f: ReturnType<typeof formDaViga>) => void) => {
    const f = formDaViga(v1, geo);
    muda(f);
    const r = vigaDoForm(f, v1, geo);
    return Array.isArray(r) ? r : [];
  };

  it("distribuída com fim antes do início e trecho que não existe", () => {
    expect(
      erros((f) => {
        f.distribuidas = [{ trecho: "2", inicio: "3", fim: "1", total: "5", acidental: "" }];
      }),
    ).toEqual([
      "Carga distribuída 1: o fim precisa ser maior ou igual ao início.",
      "Carga distribuída 1: a viga tem 2 trechos (0 a 1).",
    ]);
  });

  it("número inválido e posição negativa", () => {
    expect(
      erros((f) => {
        f.concentradas = [{ trecho: "0", posicao: "-1", total: "dez", acidental: "" }];
      }),
    ).toEqual([
      "Carga concentrada 1, posição: informe um número maior ou igual a zero.",
      "Carga concentrada 1, total: informe um número.",
    ]);
  });

  it("vão digitado a mais de 5 mm da planta", () => {
    expect(
      erros((f) => {
        f.comVaos = true;
        f.vaos = [{ vao: "6,01" }, { vao: "1,8" }];
      }),
    ).toEqual([
      "Vão do trecho 0: 6,010 m não bate com a planta (6,000 m); o motor só aceita até 5 mm de diferença.",
    ]);
  });

  it("nº do pilar não inteiro, reação sem viga e fissuração sem quantidade", () => {
    expect(
      erros((f) => {
        f.apoios = [
          { desconsiderado: "nao", pilar: "6,5" },
          { desconsiderado: "nao", pilar: "" },
          { desconsiderado: "nao", pilar: "" },
        ];
        f.reacoes = [{ trecho: "0", posicao: "1", viga: "", apoio: "0" }];
        f.armaduras = [
          {
            em: "apoio",
            numero: "0",
            bitola: "",
            bitolaMistura: "",
            barras: "",
            barrasMistura: "",
            comprimida: "",
            fisBitola: "10",
            fisQuantidade: "",
          },
        ];
      }),
    ).toEqual([
      "Reação de viga apoiada 1: escolha a viga apoiada.",
      "Apoio 0, nº do pilar no .REP: informe um número inteiro.",
      "Armadura alterada 1, quantidade da fissuração: informe um número.",
    ]);
  });

  it("seção de apoio com bw zero", () => {
    expect(
      erros((f) => {
        f.comSecoesApoios = true;
        f.secoesApoios = [
          { bw: "0", h: "50" },
          { bw: "12", h: "50" },
          { bw: "12", h: "50" },
        ];
      }),
    ).toEqual(["Seção do apoio 0, bw: informe um número maior que zero."]);
  });
});

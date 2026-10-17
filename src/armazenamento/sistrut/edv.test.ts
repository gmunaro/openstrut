/// <reference types="node" />
// Leitor do .EDV. Referências: o registro R1__E2E.EDV que o SISTRUT original gravou no
// oráculo (caso retrad_des_edc: viga V1 20×50 de 2 tramos, apoios de 20 cm e vãos livres
// de 380 cm, editada no DESEDCAO), conferido campo a campo à mão contra a gravação
// (DESEDCAO.BAS:464-588); e registros sintéticos montados aqui como o PRINT # grava.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arquivoOraculo } from "../../calculo/sistrut/__oraculo__/arquivosOraculo";
import { obraNova } from "../../dominio/criar";
import type { Obra } from "../../dominio/obra";
import {
  aplicarEdv,
  casarEdv,
  lerEdv,
  nomeArquivoEdv,
  nomeEdv,
  type EdicaoVigaSistrut,
} from "./edv";
import { lerVig } from "./viga";

/** Uma linha como o PRINT # de SINGLE grava: sinal (branco ou "-"), número sem o zero
 *  antes do ponto e um branco no fim; texto vai como está. */
const linha = (v: string | number) => {
  if (typeof v === "string") return v;
  const abs = String(Math.abs(v)).replace(/^0\./, ".");
  return `${v < 0 ? "-" : " "}${abs} `;
};
const grava = (valores: (string | number)[], fim = "\r\n") => valores.map(linha).join(fim) + fim;

/** R1__E2E.EDV do oráculo, linha a linha (oraculo/runs/retrad_des_edc-20261015-082513). */
// prettier-ignore
const E2E = grava([
  "V1", 820, 0.15, 5, 1, "t/cm2", 2, 4, 0, 2, 0, 0,
  // negativas: 3 × (quantidade, φ, início, fim, dobra esq., dobra dir.)
  3, 2, 10, 190, 630, 0, 0, 3, 6.3, 2, 82, 20, 0, 3, 6.3, 737, 818, 0, 20,
  0, // grampos negativos
  1, 2, 10, 2, 818, 25, 25, // positivas
  0, // grampos positivos
  2, 2, 6.3, 67, 205, 2, 6.3, 615, 752, // porta-estribos
  0, // pele
  2, 20, 400, 5, 12, 1, 20.005, 1, 420, 800, 5, 12, 1, 20.005, 1, // estribos
  "", "", "", "", // notas da forma
  0, 0.5467786, 0.5467786, // M+ dos trechos 0..2
]);

/** Ok ou falha do teste com a mensagem. */
function edicao(nome: string, texto: string): EdicaoVigaSistrut {
  const r = lerEdv(nome, texto);
  if (!r.ok) throw new Error(r.erros.join("; "));
  return r.edicao;
}

describe("nome do .EDV", () => {
  it("separa registro e pavimento como o DESEDCAO monta (R + nº + _ até 3 + 4 do pavimento)", () => {
    expect(nomeEdv("R5__COB.EDV")).toEqual({ registro: 5, pavimento: "COB" });
    expect(nomeEdv("R10_SUP.EDV")).toEqual({ registro: 10, pavimento: "SUP" });
    expect(nomeEdv("R123TERR.EDV")).toEqual({ registro: 123, pavimento: "TERR" });
    expect(nomeEdv("C:/obra/r7__tipo.edv")).toEqual({ registro: 7, pavimento: "TIPO" });
    // sublinhado além do enchimento é do pavimento ("_AB")
    expect(nomeEdv("R5___AB.EDV")).toEqual({ registro: 5, pavimento: "_AB" });
    expect(nomeEdv("R5_COB.EDV")).toBeNull();
    expect(nomeEdv("COB.EDV")).toBeNull();
    expect(nomeEdv("R5__COB.VIG")).toBeNull();
  });

  it("monta o nome a partir do registro e do pavimento", () => {
    expect(nomeArquivoEdv(5, "COB")).toBe("R5__COB.EDV");
    expect(nomeArquivoEdv(11, "terreo")).toBe("R11_TERR.EDV");
    expect(nomeArquivoEdv(100, "TIPO")).toBe("R100TIPO.EDV");
  });
});

describe("lerEdv: registro gravado pelo original", () => {
  const e = edicao("R1__E2E.EDV", E2E);

  it("cabeçalho: viga, comprimento de ponta a ponta, materiais, cobrimentos e tramos", () => {
    expect(e.registro).toBe(1);
    expect(e.pavimento).toBe("E2E");
    expect(e.viga).toBe("V1");
    // 3 apoios de 20 cm + 2 vãos livres de 380 cm (roteiro do caso)
    expect(e.comprimento).toBe(3 * 20 + 2 * 380);
    expect(e.materiais).toEqual({ fck: 0.15, fyk: 5, fatorUnidade: 1, unidade: "t/cm2" });
    expect(e.cobrimento).toBe(2);
    expect(e.cobrimentoMaisAcrescimo).toBe(4);
    expect(e.repeticoes).toBe(0);
    expect([e.tramos, e.balancoEsquerdo, e.balancoDireito]).toEqual([2, false, false]);
  });

  it("barras, porta-estribos e estribos", () => {
    expect(e.negativas).toEqual([
      { quantidade: 2, bitola: 10, inicio: 190, fim: 630, dobras: [0, 0] },
      { quantidade: 3, bitola: 6.3, inicio: 2, fim: 82, dobras: [20, 0] },
      { quantidade: 3, bitola: 6.3, inicio: 737, fim: 818, dobras: [0, 20] },
    ]);
    expect(e.positivas).toEqual([
      { quantidade: 2, bitola: 10, inicio: 2, fim: 818, dobras: [25, 25] },
    ]);
    expect(e.grampoNegativos).toEqual([]);
    expect(e.grampoPositivos).toEqual([]);
    expect(e.portaEstribos).toEqual([
      { quantidade: 2, bitola: 6.3, inicio: 67, fim: 205 },
      { quantidade: 2, bitola: 6.3, inicio: 615, fim: 752 },
    ]);
    expect(e.pele).toBeNull();
    // seção 20×50 do roteiro, gravada como 20 + 50·0,0001
    expect(e.estribos).toEqual([
      { inicio: 20, fim: 400, bitola: 5, espacamento: 12, ladoALado: 1, bw: 20, h: 50, posicao: 1 },
      {
        inicio: 420,
        fim: 800,
        bitola: 5,
        espacamento: 12,
        ladoALado: 1,
        bw: 20,
        h: 50,
        posicao: 1,
      },
    ]);
  });

  it("M+ de cada trecho (0 = balanço esquerdo, ausente aqui) e nenhuma nota", () => {
    expect(e.momentosPositivos).toEqual([0, 0.5467786, 0.5467786]);
    expect(e.notasForma).toEqual([]);
    expect(e.notasArmadura).toEqual([]);
  });

  it("lê igual com fim de linha LF e com ^Z no fim (arquivo copiado do DOS)", () => {
    const lf = edicao("R1__E2E.EDV", E2E.replaceAll("\r\n", "\n"));
    const z = edicao("R1__E2E.EDV", `${E2E}\x1a\x1a`);
    expect(lf).toEqual(e);
    expect(z).toEqual(e);
  });
});

describe("lerEdv: balanços, grampos, pele e notas", () => {
  // 2 tramos com balanço dos dois lados: trechos 0..3
  // prettier-ignore
  const texto = grava([
    "V12", 1010, 0.18, 5, 1, "t/cm2", 2.5, 4, 3, 2, 1, 1,
    1, 3, 12.5, 2, 1008, 30, 30, // negativas
    1, 2, 8, 140, 190, 1, 16, // grampo negativo no apoio direito, largura 16
    1, 2, 10, 2, 1008, 0, 0, // positivas
    1, 2, 8, 300, 340, 0, 16, // grampo positivo no apoio esquerdo
    1, 2, 5, 150, 860, // porta-estribo
    1, // pele (1 linha no quadro)
    0, 0, 0, 0, 2, 8, 120, 480, 2, 8, 520, 880, 0, 0, 0, 0, // trechos 0..3
    0, 0, 2, 0, 0, 0, // trechos com pele por bitola
    1, 0, 1008, 6.3, 15, 2, 20.006, 2, // estribos duplos, seção 20×60
    " 1ECORTAR NA OBRA", "10DVER PLANTA", "", "",
    0, 1.2, 0.8, 0, // M+ dos trechos 0..3
    "N 2NAO EMENDAR", "N12PONTA DOBRADA",
  ]);
  const e = edicao("R12_TIPO.EDV", texto);

  it("cabeçalho com repetições e os dois balanços", () => {
    expect([e.registro, e.pavimento, e.viga]).toEqual([12, "TIPO", "V12"]);
    expect([e.cobrimento, e.repeticoes]).toEqual([2.5, 3]);
    expect([e.tramos, e.balancoEsquerdo, e.balancoDireito]).toEqual([2, true, true]);
  });

  it("grampos com o lado (coluna 4) e a largura (coluna 5)", () => {
    expect(e.grampoNegativos).toEqual([
      { quantidade: 2, bitola: 8, inicio: 140, fim: 190, lado: "direito", largura: 16 },
    ]);
    expect(e.grampoPositivos).toEqual([
      { quantidade: 2, bitola: 8, inicio: 300, fim: 340, lado: "esquerdo", largura: 16 },
    ]);
    expect(e.portaEstribos).toEqual([{ quantidade: 2, bitola: 5, inicio: 150, fim: 860 }]);
  });

  it("pele: os trechos com barras e o nº de trechos por bitola", () => {
    expect(e.pele).toEqual({
      linhas: 1,
      trechos: [
        { trecho: 1, quantidadePorFace: 2, bitola: 8, inicio: 120, fim: 480 },
        { trecho: 2, quantidadePorFace: 2, bitola: 8, inicio: 520, fim: 880 },
      ],
      trechosPorBitola: [0, 0, 2, 0, 0, 0],
    });
  });

  it("estribo duplo com seção 20×60 e posição 2", () => {
    expect(e.estribos).toEqual([
      {
        inicio: 0,
        fim: 1008,
        bitola: 6.3,
        espacamento: 15,
        ladoALado: 2,
        bw: 20,
        h: 60,
        posicao: 2,
      },
    ]);
  });

  it("notas da forma (tramo, local, texto) e da armadura (posição, texto); M+ dos 4 trechos", () => {
    expect(e.notasForma).toEqual([
      { trecho: 1, local: "E", texto: "CORTAR NA OBRA" },
      { trecho: 10, local: "D", texto: "VER PLANTA" },
    ]);
    expect(e.notasArmadura).toEqual([
      { posicao: 2, texto: "NAO EMENDAR" },
      { posicao: 12, texto: "PONTA DOBRADA" },
    ]);
    expect(e.momentosPositivos).toEqual([0, 1.2, 0.8, 0]);
  });
});

describe("lerEdv: como o INPUT # do original", () => {
  /** E2E com notas da armadura no fim. */
  const comNotas = (...notas: string[]) => `${E2E}${notas.join("\r\n")}\r\n`;

  it("vírgula na nota parte o campo: o pedaço sem posição sai com aviso", () => {
    const r = lerEdv("R1__E2E.EDV", comNotas("N 1VER, DETALHE"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edicao.notasArmadura).toEqual([{ posicao: 1, texto: "VER" }]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain("DETALHE");
  });

  it("mais de 10 notas da armadura: lê e avisa que o original pararia", () => {
    const notas = Array.from({ length: 11 }, (_, i) => `N${String(i + 1).padStart(2)}X`);
    const r = lerEdv("R1__E2E.EDV", comNotas(...notas));
    expect(r.ok && r.edicao.notasArmadura.length).toBe(11);
    expect(r.ok && r.avisos.some((a) => a.includes("erro 9"))).toBe(true);
  });

  it("número em notação com D (DOUBLE) e com expoente", () => {
    const texto = E2E.replace(" .5467786 \r\n .5467786", " 5.467786D-01\r\n 5.467786E-01");
    expect(edicao("R1__E2E.EDV", texto).momentosPositivos).toEqual([0, 0.5467786, 0.5467786]);
  });
});

describe("lerEdv: arquivos que não dá para ler", () => {
  const erros = (nome: string, texto: string) => {
    const r = lerEdv(nome, texto);
    return r.ok ? [] : r.erros;
  };

  it("arquivo truncado diz o que faltou", () => {
    const corte = E2E.split("\r\n").slice(0, 20).join("\r\n");
    expect(erros("R1__E2E.EDV", corte)[0]).toMatch(/acaba antes/);
    expect(erros("R1__E2E.EDV", "")[0]).toMatch(/acaba antes de o nome da viga/);
  });

  it("valor não numérico onde o original lê número", () => {
    const texto = E2E.replace(" 820 ", " 8x0 ");
    expect(erros("R1__E2E.EDV", texto)[0]).toMatch(/linha 2: o comprimento da viga não é número/);
  });

  it("contagem acima do tamanho do array (erro 9 no original)", () => {
    // nº de negativas é a 13ª linha
    const linhas = E2E.split("\r\n");
    linhas[12] = " 61 ";
    expect(erros("R1__E2E.EDV", linhas.join("\r\n"))[0]).toMatch(/negativas = 61.*erro 9/);
  });

  it("balanço diferente de 0/1 e nº de tramos inválido", () => {
    const linhas = E2E.split("\r\n");
    const com = (i: number, v: string) => linhas.map((l, k) => (k === i ? v : l)).join("\r\n");
    expect(erros("R1__E2E.EDV", com(10, " 2 "))[0]).toMatch(/balanço esquerdo = 2/);
    expect(erros("R1__E2E.EDV", com(9, " 0 "))[0]).toMatch(/nº de tramos 0/);
  });

  it("formato SISTRUT40 da reconstrução antiga e nome fora do padrão", () => {
    const antigo = '"SISTRUT40","EDV",2,"FLUXO"\r\n5\r\n"V3",1,12,50,46\r\n';
    expect(erros("FLUXO.EDV", antigo)[0]).toMatch(/SISTRUT40/);
    expect(erros("FLUXO.EDV", E2E)[0]).toMatch(/nome fora do padrão/);
  });
});

describe("casarEdv", () => {
  const e = (arquivo: string, viga: string) => {
    const texto = E2E.replace(/^V1/, viga);
    return { arquivo, edicao: edicao(arquivo, texto) };
  };
  const vigas = [
    { pavimento: "COB", registro: 1, nome: "V1" },
    { pavimento: "COB", registro: 2, nome: "V2" },
    { pavimento: "TERREO1", registro: 1, nome: "V1" },
    { pavimento: "TERREO2", registro: 1, nome: "V1" },
  ];

  it("casa pelo pavimento (4 primeiros caracteres) e pelo registro, e confere o nome", () => {
    const [ok, semViga, outroNome, semPav, ambiguo] = casarEdv(
      [
        e("R2__COB.EDV", "V2"),
        e("R3__COB.EDV", "V3"),
        e("R1__COB.EDV", "V9"),
        e("R1__SUP.EDV", "V1"),
        e("R1__TERR.EDV", "V1"),
      ],
      vigas,
    );
    expect(ok).toMatchObject({ ok: true, viga: { pavimento: "COB", registro: 2, nome: "V2" } });
    expect(semViga).toMatchObject({ ok: false, aviso: expect.stringContaining("registro 3") });
    expect(outroNome).toMatchObject({ ok: false, aviso: expect.stringContaining("é a viga V1") });
    expect(semPav).toMatchObject({ ok: false, aviso: expect.stringContaining('"SUP"') });
    expect(ambiguo).toMatchObject({
      ok: false,
      aviso: expect.stringContaining("TERREO1, TERREO2"),
    });
  });
});

describe("aplicarEdv", () => {
  // E2E.VIG do oráculo (retrad_des_menu): V1 é o registro 1
  const vig = {
    nome: "E2E.VIG",
    dados: new Uint8Array(
      readFileSync(arquivoOraculo("oraculo/casos/retrad_des_menu.dados/E2E.VIG")),
    ),
  };
  const nomes = lerVig(vig.dados).map((r) => r.nome);
  const obra = (): Obra => {
    const o = obraNova("E2E", "nb1-78");
    const pav = o.pavimentos[0]!;
    pav.id = "E2E";
    pav.nome = "E2E";
    pav.vigas = nomes.map((nome, i) => ({
      id: `E2E/${nome}`,
      nome,
      x1: 0,
      y1: i,
      x2: 8,
      y2: i,
      bw: 20,
      h: 50,
      cargaLinear: 0,
    }));
    return o;
  };

  it("guarda a edição na viga do registro e avisa uma vez, sem mudar a obra de entrada", () => {
    const base = obra();
    const r = aplicarEdv(base, [{ nome: "R1__E2E.EDV", texto: E2E }], [vig]);
    expect(nomes[0]).toBe("V1");
    const v1 = r.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V1");
    expect(v1?.armaduraEditada).toEqual(edicao("R1__E2E.EDV", E2E));
    expect(r.obra.pavimentos[0]!.vigas.filter((v) => v.armaduraEditada)).toHaveLength(1);
    expect(base.pavimentos[0]!.vigas.some((v) => v.armaduraEditada)).toBe(false);
    expect(r.ignorados).toEqual([]);
    expect(r.avisos).toEqual([
      expect.stringMatching(/^Armadura editada no DESEDCAO \(\.EDV\) em E2E V1:/),
    ]);
  });

  it("fica de fora, com o motivo: ilegível, sem viga no .VIG, nome trocado, viga fora da obra", () => {
    const semV1 = obra();
    semV1.pavimentos[0]!.vigas = semV1.pavimentos[0]!.vigas.filter((v) => v.nome !== "V1");
    const r = aplicarEdv(
      semV1,
      [
        { nome: "R1__E2E.EDV", texto: E2E },
        { nome: "R2__E2E.EDV", texto: " 1 \r\n" },
        { nome: "R99_E2E.EDV", texto: E2E },
        { nome: "R3__E2E.EDV", texto: E2E },
      ],
      [vig],
    );
    const motivo = (arquivo: string) => r.ignorados.find((i) => i.arquivo === arquivo)?.motivo;
    expect(motivo("R1__E2E.EDV")).toBe(
      "a viga V1 do E2E.VIG não entrou na obra; a armadura editada dela ficou de fora.",
    );
    expect(motivo("R2__E2E.EDV")).toMatch(/^armadura editada no DESEDCAO que não foi possível ler/);
    expect(motivo("R99_E2E.EDV")).toBe(
      "o E2E.VIG não tem a viga do registro 99; arquivo ignorado.",
    );
    expect(motivo("R3__E2E.EDV")).toMatch(
      /^o registro 3 do E2E\.VIG é a viga .*, mas a edição é da V1/,
    );
    expect(r.obra).toBe(semV1);
    expect(r.avisos).toHaveLength(4);
  });
});

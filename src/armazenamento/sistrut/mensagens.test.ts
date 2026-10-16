// Erros da validação do arquivo da V2 (`lerObra`) reescritos para quem importa do
// SISTRUT: o arquivo, o item com o nome do original e o que fazer, sem o caminho JSON.
import { describe, expect, it } from "vitest";
import type { Obra } from "../../dominio/obra";
import { explicarErros } from "./mensagens";

const obra = {
  pavimentos: [
    {
      nome: "COB",
      lajes: [{ nome: "L1" }, { nome: "L2" }],
      vigas: [{ nome: "V1" }, { nome: "V7" }],
      pilares: [{ nome: "P3" }],
      trechosPilares: [{ pilar: "COB/P3" }],
    },
  ],
} as unknown as Obra;
const origem = () => ({ laj: "COB.LAJ", vig: "COB.VIG", col: "ALPHA1.COL" });

describe("explicarErros", () => {
  it("carga de ocupação: o nome que o LAJEGEOM imprime (A1, A2...) e o valor lido em palavras", () => {
    expect(
      explicarErros(
        ["pavimentos[0].cargasOcupacao[3].poligono: esperados pelo menos 3 pontos, veio []."],
        obra,
        origem,
      ),
    ).toEqual([
      "COB.LAJ, carga de ocupação A4 (polígono): esperados pelo menos 3 pontos; o arquivo deu uma lista vazia. Abra o COB.LAJ no LAJEGEOM do SISTRUT, corrija e grave de novo, ou importe sem ele.",
    ]);
  });

  it("laje pelo nome; número em pt-BR", () => {
    expect(
      explicarErros(
        ["pavimentos[0].lajes[1].h: esperado um número maior que zero, veio -2.5."],
        obra,
        origem,
      ),
    ).toEqual([
      "COB.LAJ, laje L2 (espessura): esperado um número maior que zero; o arquivo deu -2,5. Abra o COB.LAJ no LAJEGEOM do SISTRUT, corrija e grave de novo, ou importe sem ele.",
    ]);
  });

  it("campo de viga do VIGA (cargas) aponta o .VIG; o eixo, o .LAJ", () => {
    const [cargas, eixo] = explicarErros(
      [
        "pavimentos[0].vigas[1].cargas[0].total: esperado um número, veio nada.",
        "pavimentos[0].vigas[0].x1: esperado um número, veio nada.",
      ],
      obra,
      origem,
    );
    expect(cargas).toBe(
      "COB.VIG, viga V7 (cargas 1, carga total): esperado um número; o arquivo deu nada. Abra o COB.VIG no VIGA do SISTRUT, corrija e grave de novo, ou importe sem ele.",
    );
    expect(eixo).toMatch(/^COB\.LAJ, viga V1 \(início\): .* no LAJEGEOM /);
  });

  it("campo de pilar do .COL aponta o .COL e o PILGEEDI; trecho de pilar-parede pelo pilar", () => {
    const [secao, parede] = explicarErros(
      [
        'pavimentos[0].pilares[0].vinculos.x: esperado um de "engaste", veio 7.',
        "pavimentos[0].trechosPilares[0].fim: esperado um objeto, veio nada.",
      ],
      obra,
      origem,
    );
    expect(secao).toMatch(/^ALPHA1\.COL, pilar P3 \(vínculos, x\): .* no PILGEEDI /);
    expect(parede).toMatch(/^COB\.LAJ, pilar-parede COB\/P3 \(fim\): /);
  });

  it("sem arquivo conhecido, o pavimento pelo nome e um conselho geral", () => {
    expect(
      explicarErros(["pavimentos[0].lajes[0].lx: esperado um número, veio nada."], obra),
    ).toEqual([
      "pavimento COB, laje L1 (vão x): esperado um número; o arquivo deu nada. Confira esse dado no SISTRUT e importe de novo.",
    ]);
  });

  it("parâmetros da obra e mensagens fora do formato", () => {
    const [dsp, outra] = explicarErros(
      ["parametrosViga.dsp.cobrimento: esperado um número, veio nada.", "Arquivo vazio."],
      obra,
      origem,
    );
    expect(dsp).toMatch(/^\.DSP\/VIGA\.INI, parâmetros de viga \(dsp, cobrimento\): /);
    expect(outra).toBe("Arquivo vazio.");
  });
});

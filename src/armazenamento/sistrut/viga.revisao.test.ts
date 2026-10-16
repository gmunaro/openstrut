/// <reference types="node" />
// Importador da parte de viga: os casos da revisão do 1d12659 (rev-vigas/, fora do repositório), cada um
// com o comportamento do original que ele reproduz. .VIG montado no leiaute do registro
// (__teste__/vig.ts); o .DSP e o VIGA.INI de fábrica de oraculo/orig/
// (em src/calculo/sistrut/__oraculo__/arquivos/, com o cabeçalho neutro).
import { readFileSync } from "node:fs";
import { arquivoOraculo } from "../../calculo/sistrut/__oraculo__/arquivosOraculo";
import { describe, expect, it } from "vitest";
import { obraVBX } from "../../calculo/sistrut/__e2e__/obraVBX";
import type { DadosViga } from "../../calculo/sistrut/base/tipos";
import { KN_POR_TF } from "../../calculo/sistrut/base/unidades";
import { calcularObraSistrut } from "../../calculo/sistrut/obra";
import type { Obra } from "../../dominio/obra";
import { type RegistroTeste, V1, vig } from "./__teste__/vig";
import { importarVigasSistrut, lerDsp, lerVigaIni } from "./viga";

const ORIG = "oraculo/orig";

/** .VIG regravado pelo VIGA a partir de registros já resolvidos (F da indexada gravada). */
function vigDe(dados: readonly DadosViga[]) {
  const vazio = { vao: 0, inercia: 1, divisoes: [] };
  return vig(
    dados.map((d): RegistroTeste => ({
      nome: d.nome,
      balE: !!d.balancoEsquerdo,
      balD: !!d.balancoDireito,
      trechos: [d.balancoEsquerdo ?? vazio, ...d.tramos, d.balancoDireito ?? vazio].map((t) => ({
        vao: t.vao,
        j: t.inercia,
        divs: t.divisoes.map((x) => [x.p, x.d, x.f, x.pAcidental, x.fAcidental]),
      })),
    })),
  );
}

function importa(...args: Parameters<typeof importarVigasSistrut>) {
  const r = importarVigasSistrut(...args);
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r;
}

describe("completar: indexadas pela posição e reimportação", () => {
  const vbx = obraVBX("original");
  const regravado = calcularObraSistrut(vbx, { modo: "original" }).pavimentos[0]!.vigasVig;
  const somaV1 = (o: Obra) =>
    calcularObraSistrut(o, { modo: "original" }).pavimentos[0]!.analises.find(
      (a) => a.nome === "V1",
    )!.somaReacoes;

  it("V1 com o balanço partido em 2 m: a F da V5 em D = 4 é a reação da planta e não entra de novo", () => {
    const editado = structuredClone(regravado);
    const v1 = editado.find((d) => d.nome === "V1")!;
    const dv = v1.balancoDireito!.divisoes[0]!;
    v1.balancoDireito!.divisoes = [{ ...dv, d: 2, f: 0 }, dv];
    const r = importa([vigDe(editado)], vbx);
    const v = r.obra.pavimentos[0]!.vigas.find((x) => x.nome === "V1")!;
    expect(v.somenteCargasProprias).toBe(true);
    expect(v.cargas!.filter((c) => c.tipo === "concentrada")).toEqual([]);
    expect(somaV1(r.obra)).toBeCloseTo(somaV1(vbx), 5);
  });

  it("reimportar limpa a entrada de viga da importação anterior", () => {
    const editado = structuredClone(regravado);
    editado.find((d) => d.nome === "V3")!.tramos[0]!.divisoes[0]!.p += 1;
    const primeira = importa([vigDe(editado)], vbx);
    expect(primeira.obra.pavimentos[0]!.vigas.find((x) => x.nome === "V3")!.cargas).toBeDefined();
    const segunda = importa([vigDe(regravado)], primeira.obra);
    expect(segunda.obra.pavimentos[0]!.vigas).toEqual(vbx.pavimentos[0]!.vigas);
  });
});

describe("gerar: balanço esquerdo, pilares repetidos, seção 0 e peso próprio", () => {
  const f = Math.fround;

  it("balanço esquerdo: posições L − D em decimal curto e o motor regrava os D bit a bit", () => {
    const r = importa([
      vig([
        {
          nome: "V1",
          balE: true,
          trechos: [
            {
              vao: 2,
              j: 1.00001,
              divs: [
                [1, 2, 0.5, 0, 0],
                [3, 1.2, 0.7, 0, 0],
                [2, 0.5, 0.9, 0, 0],
              ],
            },
            { vao: 4, j: 1.00002, divs: [[1, 4, 0, 0, 0]] },
            { vao: 0, j: 0, divs: [] },
          ],
        },
      ]),
    ]);
    const v = r.obra.pavimentos[0]!.vigas[0]!;
    const g = KN_POR_TF;
    // da divisão junto ao apoio para a ponta; posições a partir da ponta
    expect(v.cargas!.filter((c) => c.trecho === 0)).toEqual([
      { tipo: "distribuida", trecho: 0, inicio: 1.5, fim: 2, total: 2 * g, acidental: 0 },
      { tipo: "concentrada", trecho: 0, posicao: 1.5, total: f(0.9) * g, acidental: 0 },
      { tipo: "distribuida", trecho: 0, inicio: 0.8, fim: 1.5, total: 3 * g, acidental: 0 },
      { tipo: "concentrada", trecho: 0, posicao: 0.8, total: f(0.7) * g, acidental: 0 },
      { tipo: "distribuida", trecho: 0, inicio: 0, fim: 0.8, total: g, acidental: 0 },
      { tipo: "concentrada", trecho: 0, posicao: 0, total: 0.5 * g, acidental: 0 },
    ]);

    const d = calcularObraSistrut(r.obra, { modo: "original" }).pavimentos[0]!.vig[0]!;
    expect(d.balancoEsquerdo!.divisoes.map((x) => [x.p, x.d, x.f])).toEqual([
      [1, 2, 0.5],
      [3, f(1.2), f(0.7)],
      [2, 0.5, f(0.9)],
    ]);
  });

  it("o mesmo pilar em duas vigas: aviso de que a planta gerada tem um por viga", () => {
    const viga = (nome: string, j: number): RegistroTeste => ({
      nome,
      trechos: [
        { vao: 0, j, divs: [] },
        { vao: 4, j: 1.00008, divs: [[1, 4, 0, 0, 0]] },
        { vao: 0, j: 0, divs: [] },
      ],
    });
    const r = importa([vig([viga("V1", 1.00007), viga("V2", 1.00009)])]);
    expect(r.avisos.filter((a) => a.startsWith("Pilares"))).toEqual([
      expect.stringMatching(/^Pilares P8 aparecem em mais de uma viga do \.VIG/),
    ]);
  });

  it("seção 0 no balanço do .SEC: a importação aceita e o DESDIM recebe a do apoio", () => {
    const sec = Buffer.alloc(346);
    [2, 0, 1, 0, 0].forEach((x, i) => sec.writeInt16LE(x, 2 * i));
    const escreve = (k: number, v: number[]) =>
      v.forEach((x, i) => sec.writeFloatLE(x, 10 + 24 * k + 4 * i));
    escreve(0, [0, 0, 0, 0, 20, 50]);
    escreve(1, [20, 50, 0, 0, 20, 50]);
    escreve(2, [20, 50, 0, 0, 18, 44]);
    escreve(3, [0, 0, 0, 0, 0, 0]);
    const r = importa([vig([V1]), { nome: "TST.SEC", dados: new Uint8Array(sec) }]);
    const p = calcularObraSistrut(r.obra, { modo: "original" }).pavimentos[0]!;
    expect(p.vigas[0]!.entrada.secoes.balancoDireito).toEqual({ bw: 18, hw: 44, bf: 0, hf: 0 });
  });

  it("viga digitada (somenteCargasProprias) mantém o peso próprio no LAJEMONT, mas o .VIG não o leva", () => {
    const r = importa([vig([V1])]);
    const p = calcularObraSistrut(r.obra, { modo: "original" }).pavimentos[0]!;
    // 20 × 50 × 2,5 t/m³ = 250 kg/m: o predominante do LAJEMONT não muda
    expect(p.montagem.vigas[0]!.alvenariasSobreViga![0]!.peso).toBe(0.25);
    expect(p.vig[0]!.tramos[1]!.divisoes).toEqual([
      { p: 2, d: 5, f: 0, pAcidental: 0.5, fAcidental: 0 },
    ]);
  });
});

describe("leitor do .DSP: aspas e fim da parametrização", () => {
  const fabrica = readFileSync(arquivoOraculo(`${ORIG}/SISTRUT.DSP`), "latin1");
  const comAco = (texto: string, aco: string) => texto.replace(/^B( +TIPO DE ACO)/m, `${aco}$1`);

  it('INPUT # com texto entre aspas ("A" no tipo de aço)', () => {
    const texto = comAco(fabrica, '"A"');
    expect(texto).not.toBe(fabrica);
    expect(lerDsp(texto).classeAco).toBe("A");
  });

  it('sem "FINAL DA PARAMETRIZACAO": o DESENHO adota a SISTRUT (ERROR 1, L_2041c); a importação avisa', () => {
    const texto = comAco(fabrica, "A").replace("FINAL DA PARAMETRIZACAO", "FIM");
    const r = importa([vig([V1]), { nome: "X.DSP", dados: new TextEncoder().encode(texto) }]);
    expect(r.avisos.some((a) => a.includes("adota a parametrização SISTRUT"))).toBe(true);
    expect(r.obra.parametrosViga).toBeUndefined();
  });
});

describe("VIGA.INI com % fracionário", () => {
  it("CINT do QuickBASIC (meio ao par): 30,5 % → 30", () => {
    const linhas = readFileSync(arquivoOraculo(`${ORIG}/VIGA.INI`), "latin1").split("\r\n");
    linhas[9] = linhas[9]!.replace(/^30=/, "30.5=");
    expect(lerVigaIni(linhas.join("\r\n")).porcentagemAcidentalGerada).toBe(30);
  });
});

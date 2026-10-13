// DXF de armação das vigas: uma obra de duas lajes (4 × 5 e 3,5 × 5 m) calculada
// e detalhada pela ligação da tela. Confere a estrutura do arquivo, os rótulos
// "N1 2φ10 c=345" de cada posição (φ sai como \U+03C6 no R12), o corte e as
// tabelas de aço.
import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import { calcular } from "../telas/calculo";
import { detalharVigasObra, rotuloPosicao } from "../telas/detalhamento";
import { dxfArmacaoVigas, entidadesArmacaoViga } from "./armacaoVigas";
import { textoDxf } from "./dxf";

function obraDuasLajes(): Obra {
  const obra = obraNova("Casa", "nb1-78");
  let pav = { ...obra.pavimentos[0]!, nome: "Tipo", repeticoes: 3 };
  const l1 = lajeNova(pav, { x: 0, y: 0, lx: 4, ly: 5 });
  pav = { ...pav, lajes: [l1] };
  const l2 = lajeNova(pav, { x: 4, y: 0, lx: 3.5, ly: 5 });
  return { ...obra, pavimentos: [gerarEstrutura({ ...pav, lajes: [l1, l2] })] };
}

const obra = obraDuasLajes();
const c = calcular(obra);
if (c.tipo !== "ok") throw new Error("cálculo falhou");
const det = detalharVigasObra(c.resultado, obra);
const dxf = dxfArmacaoVigas(obra, det);

describe("rotuloPosicao", () => {
  it('"N1 2φ10 c=345"; bitola fracionária com vírgula; estribo com o espaçamento', () => {
    expect(rotuloPosicao({ nome: "N1", quantidade: 2, phi: 10, comprimento: 345 })).toBe(
      "N1 2φ10 c=345",
    );
    expect(rotuloPosicao({ nome: "N3", quantidade: 2, phi: 6.3, comprimento: 248 })).toBe(
      "N3 2φ6,3 c=248",
    );
    expect(
      rotuloPosicao({ nome: "N4", quantidade: 22, phi: 5, comprimento: 94, espacamento: 18 }),
    ).toBe("N4 22φ5 c/18 c=94");
  });
});

describe("dxfArmacaoVigas", () => {
  it("é um DXF R12 completo com as camadas da armação", () => {
    expect(dxf.startsWith("  0\r\nSECTION\r\n  2\r\nHEADER\r\n")).toBe(true);
    expect(dxf.endsWith("  0\r\nEOF\r\n")).toBe(true);
    for (const camada of ["CONCRETO", "BARRAS", "ESTRIBOS", "TEXTOS", "TABELA", "TITULO"])
      expect(dxf).toContain(`  2\r\n${camada}\r\n`);
    expect(dxf).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("tem o rótulo de cada posição de cada viga", () => {
    expect(det.vigas).toHaveLength(5);
    for (const v of det.vigas)
      for (const p of v.detalhamento.posicoes) expect(dxf).toContain(textoDxf(rotuloPosicao(p)));
    // formato literal: "N1 2φ10 c=…" (φ como \U+03C6)
    expect(dxf).toMatch(/\r\nN1 \d+\\U\+03C6[\d,]+ c=\d+\r\n/);
  });

  it("tem título, corte A-A e tabela de aço por viga, e a tabela da obra no fim", () => {
    for (const v of det.vigas) {
      expect(dxf).toContain(`VIGA ${v.nome} - ${v.bw}x${v.h} - Tipo (x3)`);
      expect(dxf).toContain(textoDxf(`TABELA DE AÇO - ${v.nome}`));
    }
    expect(dxf.split("CORTE A-A").length - 1).toBe(5);
    expect(dxf).toContain(textoDxf("TABELA DE AÇO - VIGAS DA OBRA (com repetições)"));
    // massa total com perda da obra (3 repetições), com vírgula decimal
    expect(dxf).toContain(det.tabela.massaComPerda.toFixed(1).replace(".", ","));
  });

  it("corte: uma barra (octógono) por barra da seção, mais o estribo", () => {
    const v = det.vigas.find((x) => x.nos.length === 2);
    if (!v) throw new Error("sem viga de 1 tramo");
    const ents = entidadesArmacaoViga(obra, v);
    const octogonos = ents.filter(
      (e) => e.tipo === "polilinha" && e.camada === "BARRAS" && e.fechada,
    );
    // viga de 1 tramo: todas as longitudinais vão de apoio a apoio e passam no meio
    const longitudinais = v.detalhamento.posicoes
      .filter((p) => p.tipo !== "estribo")
      .reduce((s, p) => s + p.quantidade, 0);
    expect(octogonos).toHaveLength(longitudinais);
    const estribos = ents.filter((e) => e.tipo === "polilinha" && e.camada === "ESTRIBOS");
    expect(estribos).toHaveLength(1);
  });
});

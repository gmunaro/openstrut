// Testa a importação de uma obra do SISTRUT a partir de arquivos reais (obra E2E: 4 lajes
// 4×5 m, vigas no contorno e no meio, 9 pilares). LAJ, VIG, SEC, FOR, COL, REP e RLP vêm de
// tests/retraducao/forma/obra (v1-par2); DSP e PIP vêm de roteiros/e2e_10_forma.dados.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importarObraSistrut, type ArquivoEntrada } from "./InicioSistrut";

const PASTA = fileURLToPath(new URL("./__fixtures__/sistrut/", import.meta.url));

/** Lê um arquivo da pasta de fixtures como o seletor do navegador o entregaria. */
const arquivo = (nome: string): ArquivoEntrada => ({
  nome,
  dados: new Uint8Array(readFileSync(`${PASTA}${nome}`)),
});

const OBRA_E2E: ArquivoEntrada[] = [
  "E2E.LAJ",
  "E2E.VIG",
  "E2E.SEC",
  "SISTRUT.DSP",
  "E2E.COL",
  "SISTRUT.PIP",
  "E2E.REP",
  "E2E.RLP",
].map(arquivo);

/** Serialização sem os ids: importadores de viga e pilar geram ids novos a cada chamada. */
const semIds = (valor: unknown): string =>
  JSON.stringify(valor).replace(/"id":"[^"]*"/g, '"id":"_"');

describe("importarObraSistrut", () => {
  it("monta a obra da E2E com as lajes, vigas e pilares do pavimento", () => {
    const r = importarObraSistrut(OBRA_E2E);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [pav] = r.obra.pavimentos;
    expect(pav?.lajes).toHaveLength(4);
    expect(pav?.vigas.length).toBeGreaterThan(0);
    expect(pav?.pilares).toHaveLength(9);
  });

  it("não depende da ordem dos arquivos nem da caixa da extensão", () => {
    const direta = importarObraSistrut(OBRA_E2E);
    const embaralhada = importarObraSistrut([...OBRA_E2E].reverse());
    const minusculas = importarObraSistrut(
      OBRA_E2E.map((a) => ({ ...a, nome: a.nome.toLowerCase() })),
    );
    expect(direta.ok && embaralhada.ok && minusculas.ok).toBe(true);
    if (!direta.ok || !embaralhada.ok || !minusculas.ok) return;
    expect(semIds(embaralhada.obra)).toBe(semIds(direta.obra));
    expect(embaralhada.avisos).toEqual(direta.avisos);
    expect(semIds(minusculas.obra)).toBe(semIds(direta.obra));
  });

  it("sem .LAJ não monta nada e diz o que selecionar", () => {
    const r = importarObraSistrut(OBRA_E2E.filter((a) => !a.nome.endsWith(".LAJ")));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros).toEqual([expect.stringContaining("Nenhum .LAJ")]);
  });

  it("dois .LAJ selecionados são recusados sem misturar as obras", () => {
    const r = importarObraSistrut([...OBRA_E2E, { ...arquivo("E2E.LAJ"), nome: "OUTRA.LAJ" }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros[0]).toMatch(/^Mais de um \.LAJ selecionado \(.*OUTRA\.LAJ/);
  });

  it("erro do .LAJ vem com o nome do arquivo na frente", () => {
    const r = importarObraSistrut([
      { nome: "E2E.LAJ", dados: new Uint8Array() },
      ...OBRA_E2E.filter((a) => !a.nome.endsWith(".LAJ")),
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.length).toBeGreaterThan(0);
    for (const e of r.erros) expect(e).toMatch(/^E2E\.LAJ: /);
  });

  it("extensão desconhecida e .RLP sem .REP de mesmo nome viram aviso, não erro", () => {
    const r = importarObraSistrut([
      ...OBRA_E2E,
      { nome: "NOTAS.TXT", dados: new Uint8Array([65]) },
      { nome: "SOLTO.RLP", dados: new Uint8Array([65]) },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avisos).toContain("NOTAS.TXT: extensão não reconhecida, arquivo ignorado.");
    expect(r.avisos).toContain("SOLTO.RLP: sem .REP de mesmo nome, arquivo ignorado.");
  });

  it("sem arquivos de pilar, os pilares são só os do .LAJ e nenhum aviso de pilar aparece", () => {
    const r = importarObraSistrut(OBRA_E2E.filter((a) => !/\.(COL|PIP|REP|RLP)$/.test(a.nome)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Os 9 pilares da planta vêm do próprio .LAJ (importarLaj); sem .COL não há cargas.
    expect(r.obra.pavimentos[0]?.pilares).toHaveLength(9);
    expect(r.avisos.filter((a) => /pilar|\.REP|\.RLP/i.test(a))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { lajeNova, obraNova } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import { VERSAO_ATUAL, lerObra, migrar, serializarObra } from "./arquivo";

function obraExemplo(): Obra {
  const obra = obraNova("FLUXO", "nb1-78");
  const p = obra.pavimentos[0];
  if (!p) throw new Error();
  p.lajes.push(lajeNova(p, { x: 0, y: 0, lx: 4, ly: 5 }));
  p.lajes.push(lajeNova(p, { x: 4, y: 0, lx: 3.5, ly: 5 }, { vinculos: { direito: "livre" } }));
  // pilar do canto (0; 5) apagado pelo usuário
  return { ...obra, pavimentos: [gerarEstrutura({ ...p, pilaresRemovidos: [{ x: 0, y: 5 }] })] };
}

/** Dados crus da obra como uma versão antiga os gravava: sem os campos que vieram depois. */
function versaoAntiga(obra: Obra, versao: 1 | 2) {
  const d = JSON.parse(serializarObra(obra));
  d.versao = versao;
  delete d.materiais.classeAco;
  for (const p of d.pavimentos) {
    for (const l of p.lajes) delete l.mu;
    if (versao === 1) delete p.pilaresRemovidos;
  }
  return JSON.stringify(d);
}

/** Obra de exemplo em JSON, com uma alteração aplicada aos dados crus. */
function alterada(
  f: (d: Record<string, unknown> & { pavimentos: Record<string, unknown>[] }) => void,
) {
  const d = JSON.parse(serializarObra(obraExemplo()));
  f(d);
  return JSON.stringify(d);
}

const erros = (texto: string) => {
  const r = lerObra(texto);
  return r.ok ? [] : r.erros;
};

describe("arquivo .openstrut.json", () => {
  it("ida e volta preserva a obra (versão 3, com pilares removidos, classe do aço e μ)", () => {
    const obra = obraExemplo();
    expect(obra.versao).toBe(3);
    obra.materiais.classeAco = "B";
    obra.pavimentos[0]!.lajes[0]!.mu = 1.5;
    expect(obra.pavimentos[0]?.pilaresRemovidos).toEqual([{ x: 0, y: 5 }]);
    const r = lerObra(serializarObra(obra));
    expect(r).toEqual({ ok: true, obra });
  });

  it("migra a versão 1: pavimentos ganham pilaresRemovidos vazio (e passam pela 2 → 3)", () => {
    const obra = obraExemplo();
    const texto = versaoAntiga(obra, 1);
    expect(texto).not.toContain("pilaresRemovidos");
    expect(lerObra(texto)).toEqual({
      ok: true,
      obra: { ...obra, pavimentos: obra.pavimentos.map((p) => ({ ...p, pilaresRemovidos: [] })) },
    });
  });

  it("migra a versão 2: aço classe A e lajes isótropas (μ = 1), o cálculo de antes", () => {
    const obra = obraExemplo();
    const texto = versaoAntiga(obra, 2);
    expect(texto).not.toContain("classeAco");
    expect(texto).not.toContain('"mu"');
    const r = lerObra(texto);
    expect(r).toEqual({ ok: true, obra });
    expect(r.ok && r.obra.materiais.classeAco).toBe("A");
    expect(r.ok && r.obra.pavimentos[0]!.lajes.map((l) => l.mu)).toEqual([1, 1]);
  });

  it("versão atual sem classeAco ou com μ inválido acusa", () => {
    expect(
      erros(alterada((d) => delete (d.materiais as Record<string, unknown>).classeAco)),
    ).toEqual(['materiais.classeAco: esperado um de "A", "B", veio nada.']);
    expect(
      erros(alterada((d) => ((d.pavimentos[0]!.lajes as Record<string, unknown>[])[0]!.mu = 0))),
    ).toEqual(["pavimentos[0].lajes[0].mu: esperado um número maior que zero, veio 0."]);
  });

  it("versão atual sem pilaresRemovidos ou com ponto inválido acusa", () => {
    expect(erros(alterada((d) => delete d.pavimentos[0]!.pilaresRemovidos))).toEqual([
      "pavimentos[0].pilaresRemovidos: esperada uma lista, veio nada.",
    ]);
    expect(erros(alterada((d) => (d.pavimentos[0]!.pilaresRemovidos = [{ x: 1 }])))).toEqual([
      "pavimentos[0].pilaresRemovidos[0].y: esperado um número, veio nada.",
    ]);
  });

  it("descarta campos desconhecidos", () => {
    const r = lerObra(alterada((d) => (d.extra = 1)));
    expect(r.ok && "extra" in r.obra).toBe(false);
  });

  it("texto que não é JSON", () => {
    expect(erros("{ nao é json")[0]).toMatch(/^O arquivo não é um JSON válido/);
  });

  it("JSON que não é objeto ou não tem versao", () => {
    expect(erros("[1, 2]")).toEqual(["O arquivo não contém uma obra do OpenStrut."]);
    expect(erros('{"nome": "x"}')).toEqual([
      "O arquivo não tem o campo versao: não é uma obra do OpenStrut.",
    ]);
    expect(erros('{"versao": "1"}')).toEqual(['versao: esperado um inteiro ≥ 1, veio "1".']);
  });

  it("versão mais nova que a suportada", () => {
    expect(erros(alterada((d) => (d.versao = VERSAO_ATUAL + 1)))).toEqual([
      `O arquivo é da versão ${VERSAO_ATUAL + 1}, mais nova que a suportada (${VERSAO_ATUAL}). Atualize o OpenStrut.`,
    ]);
  });

  it("aponta cada campo inválido com o caminho", () => {
    const e = erros(
      alterada((d) => {
        d.norma = "aci";
        const pav = d.pavimentos[0] as {
          lajes: Record<string, unknown>[];
          vigas: Record<string, unknown>[];
        };
        const l0 = pav.lajes[0];
        const v0 = pav.vigas[0];
        if (!l0 || !v0) throw new Error();
        l0.lx = -4;
        l0.vinculos = { topo: "livre", esquerdo: "solto" };
        v0.y2 = 99;
        delete v0.bw;
      }),
    );
    expect(e).toEqual([
      'obra.norma: esperado um de "nb1-78", "nbr6118-2023", veio "aci".',
      'pavimentos[0].lajes[0].vinculos: bordo desconhecido "topo" (use esquerdo, inferior, direito, superior), veio "topo".',
      'pavimentos[0].lajes[0].vinculos.esquerdo: esperado um de "engastado", "apoiado", "livre", veio "solto".',
      "pavimentos[0].lajes[0].lx: esperado um número maior que zero, veio -4.",
      "pavimentos[0].vigas[0].bw: esperado um número, veio nada.",
      expect.stringMatching(/^pavimentos\[0\]\.vigas\[0\]: a viga deve ser horizontal ou vertical/),
    ]);
  });

  it("ids repetidos e listas ausentes", () => {
    const e = erros(
      alterada((d) => {
        const pav = d.pavimentos[0] as { lajes: { id: string }[]; pilares?: unknown };
        const [a, b] = pav.lajes;
        if (!a || !b) throw new Error();
        b.id = a.id;
        delete pav.pilares;
      }),
    );
    expect(e).toEqual([
      expect.stringMatching(/^pavimentos\[0\]\.lajes\[1\]\.id: id repetido na obra/),
      "pavimentos[0].pilares: esperada uma lista, veio nada.",
    ]);
  });

  it("migração: versão atual passa direto; versão sem migração acusa", () => {
    expect(migrar({ versao: VERSAO_ATUAL, a: 1 }, VERSAO_ATUAL)).toEqual({
      versao: VERSAO_ATUAL,
      a: 1,
    });
    expect(() => migrar({}, 0)).toThrow("Falta a migração da versão 0 para 1.");
  });
});

import { describe, expect, it } from "vitest";
import { lajeNova, obraNova, pavimentoNovo } from "../dominio/criar";
import { gerarEstrutura } from "../dominio/gerar";
import type { Obra } from "../dominio/obra";
import {
  adicionarPavimento,
  alterarPeDireito,
  alterarRepeticoes,
  apagarPavimento,
  copiarPlanta,
  duplicarPavimento,
  moverPavimento,
  problemaNomePavimento,
  renomearPavimento,
} from "./pavimentos";

function obraTres(): Obra {
  const obra = obraNova("Teste", "nb1-78");
  return {
    ...obra,
    pavimentos: [
      pavimentoNovo("Cobertura"),
      pavimentoNovo("Tipo", 2.8, 3),
      pavimentoNovo("Térreo"),
    ],
  };
}

const nomes = (o: Obra) => o.pavimentos.map((p) => p.nome);

describe("pavimentos", () => {
  it("adiciona com o próximo nome livre na posição pedida", () => {
    const o = obraNova("x", "nb1-78"); // já tem "Pavimento 1"
    const r = adicionarPavimento(o, 0);
    expect(nomes(r.obra)).toEqual(["Pavimento 2", "Pavimento 1"]);
    expect(r.obra.pavimentos[0]).toBe(r.pavimento);
    expect(nomes(adicionarPavimento(o, 99).obra)).toEqual(["Pavimento 1", "Pavimento 2"]);
  });

  it("renomeia só com nome não vazio e único", () => {
    const o = obraTres();
    const tipo = o.pavimentos[1]!;
    expect(problemaNomePavimento(o, tipo.id, "  ")).toMatch(/vazio/);
    expect(problemaNomePavimento(o, tipo.id, "Térreo")).toMatch(/Já existe/);
    expect(problemaNomePavimento(o, tipo.id, "Tipo")).toBeNull();
    expect(renomearPavimento(o, tipo.id, "Térreo")).toBe(o);
    expect(nomes(renomearPavimento(o, tipo.id, " Andar tipo "))).toEqual([
      "Cobertura",
      "Andar tipo",
      "Térreo",
    ]);
  });

  it("pé-direito > 0 e repetições inteiras ≥ 1; inválido ou igual não muda a obra", () => {
    const o = obraTres();
    const id = o.pavimentos[1]!.id;
    expect(alterarPeDireito(o, id, 3.1).pavimentos[1]!.peDireito).toBe(3.1);
    expect(alterarPeDireito(o, id, 0)).toBe(o);
    expect(alterarPeDireito(o, id, 2.8)).toBe(o);
    expect(alterarRepeticoes(o, id, 5).pavimentos[1]!.repeticoes).toBe(5);
    expect(alterarRepeticoes(o, id, 1.5)).toBe(o);
    expect(alterarRepeticoes(o, id, 0)).toBe(o);
  });

  it("move para cima e para baixo dentro dos limites", () => {
    const o = obraTres();
    const tipo = o.pavimentos[1]!.id;
    expect(nomes(moverPavimento(o, tipo, -1))).toEqual(["Tipo", "Cobertura", "Térreo"]);
    expect(nomes(moverPavimento(o, tipo, 1))).toEqual(["Cobertura", "Térreo", "Tipo"]);
    expect(moverPavimento(o, o.pavimentos[0]!.id, -1)).toBe(o);
    expect(moverPavimento(o, o.pavimentos[2]!.id, 1)).toBe(o);
  });

  it("apaga, mas nunca o último", () => {
    const o = obraTres();
    expect(nomes(apagarPavimento(o, o.pavimentos[0]!.id))).toEqual(["Tipo", "Térreo"]);
    const um = obraNova("x", "nb1-78");
    expect(apagarPavimento(um, um.pavimentos[0]!.id)).toBe(um);
  });

  it("copia a planta com ids novos e mantém nome, pé-direito e repetições do destino", () => {
    const o = obraTres();
    let terreo = o.pavimentos[2]!;
    const l1 = lajeNova(terreo, { x: 0, y: 0, lx: 4, ly: 5 }, { vinculos: { esquerdo: "livre" } });
    terreo = gerarEstrutura({ ...terreo, lajes: [l1], pilaresRemovidos: [{ x: 4, y: 5 }] });
    const obra = { ...o, pavimentos: [o.pavimentos[0]!, o.pavimentos[1]!, terreo] };
    const tipoId = obra.pavimentos[1]!.id;
    const copiada = copiarPlanta(obra, terreo.id, tipoId);
    const tipo = copiada.pavimentos[1]!;
    expect(tipo).toMatchObject({ nome: "Tipo", peDireito: 2.8, repeticoes: 3 });
    expect(tipo.lajes).toHaveLength(1);
    expect(tipo.vigas).toHaveLength(terreo.vigas.length);
    expect(tipo.pilares).toHaveLength(terreo.pilares.length);
    expect(tipo.pilaresRemovidos).toEqual([{ x: 4, y: 5 }]);
    expect(tipo.pilaresRemovidos).not.toBe(terreo.pilaresRemovidos);
    expect(tipo.lajes[0]).toMatchObject({
      nome: "L1",
      lx: 4,
      ly: 5,
      vinculos: { esquerdo: "livre" },
    });
    const idsOrigem = new Set(
      [...terreo.lajes, ...terreo.vigas, ...terreo.pilares].map((e) => e.id),
    );
    for (const e of [...tipo.lajes, ...tipo.vigas, ...tipo.pilares])
      expect(idsOrigem.has(e.id)).toBe(false);
    // a origem não muda e copiar para si mesmo não faz nada
    expect(copiada.pavimentos[2]).toBe(terreo);
    expect(copiarPlanta(obra, terreo.id, terreo.id)).toBe(obra);
  });
});

describe("duplicarPavimento", () => {
  it("cria a cópia logo acima, com a planta (ids novos), o pé-direito e as repetições", () => {
    const base = obraTres();
    const tipo = base.pavimentos[1]!;
    tipo.lajes.push(lajeNova(tipo, { x: 0, y: 0, lx: 4, ly: 5 }));
    const comLaje: Obra = {
      ...base,
      pavimentos: base.pavimentos.map((p) => (p.id === tipo.id ? gerarEstrutura(tipo) : p)),
    };
    const { obra, pavimento } = duplicarPavimento(comLaje, tipo.id);
    expect(nomes(obra)).toEqual(["Cobertura", "Tipo (cópia)", "Tipo", "Térreo"]);
    expect(pavimento?.peDireito).toBe(2.8);
    expect(pavimento?.repeticoes).toBe(3);
    const original = obra.pavimentos[2]!;
    expect(pavimento?.lajes.map((l) => [l.nome, l.x, l.lx])).toEqual([["L1", 0, 4]]);
    expect(pavimento?.vigas).toHaveLength(original.vigas.length);
    expect(pavimento?.pilares).toHaveLength(4);
    expect(pavimento?.lajes[0]?.id).not.toBe(original.lajes[0]?.id);
    expect(pavimento?.id).not.toBe(original.id);
  });

  it("numera as cópias seguintes", () => {
    let o = obraTres();
    const id = o.pavimentos[0]!.id;
    o = duplicarPavimento(o, id).obra;
    o = duplicarPavimento(o, id).obra;
    expect(nomes(o).slice(0, 3)).toEqual(["Cobertura (cópia)", "Cobertura (cópia 2)", "Cobertura"]);
  });

  it("id que não existe não muda nada", () => {
    const o = obraTres();
    expect(duplicarPavimento(o, "x")).toEqual({ obra: o, pavimento: undefined });
  });
});

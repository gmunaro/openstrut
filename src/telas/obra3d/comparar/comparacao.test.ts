// Comparação Original × Corrigido: a classificação por peça com valores à mão e uma obra
// do motor calculada nos dois modos, com a diferença conhecida pela conta da carga.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lerObra } from "../../../armazenamento/arquivo";
import { calcular } from "../../calculo";
import type { DadosElemento } from "../api";
import { dadosDosElementos } from "../dados";
import { montarModelo } from "../modelo";
import { classificar, compararModos, contar, queDiferem } from "./comparacao";

describe("classificar", () => {
  const ok = (grandeza: number) => ({ estado: "ok" as const, grandeza });

  it("até a tolerância é igual; acima, maior ou menor no original", () => {
    // 101 × 100: (101 − 100)/101 = 0,0099 ≤ 0,01
    expect(classificar(ok(101), ok(100), 0.01)).toEqual({ categoria: "igual", relativa: 1 / 101 });
    // 102 × 100: 2/102 = 0,0196 > 0,01
    expect(classificar(ok(102), ok(100), 0.01)).toEqual({ categoria: "maior", relativa: 2 / 102 });
    // 98 × 100: −2/100 = −0,02
    expect(classificar(ok(98), ok(100), 0.01)).toEqual({ categoria: "menor", relativa: -0.02 });
    // a mesma diferença com 5 % de tolerância é igual
    expect(classificar(ok(98), ok(100), 0.05)?.categoria).toBe("igual");
    // tolerância zero: só o valor idêntico é igual
    expect(classificar(ok(100), ok(100), 0)?.categoria).toBe("igual");
    expect(classificar(ok(100.001), ok(100), 0)?.categoria).toBe("maior");
  });

  it("a relativa é sobre o maior valor absoluto, inclusive com troca de sinal", () => {
    // 4 × −11: (4 + 11)/11 = 1,3636 (o Nk que troca de sinal entre os modos)
    const r = classificar(ok(4), ok(-11), 0.01);
    expect(r?.categoria).toBe("maior");
    expect(r?.relativa).toBeCloseTo(15 / 11, 12);
    // dois zeros: iguais, sem dividir por zero
    expect(classificar(ok(0), ok(0), 0.01)).toEqual({ categoria: "igual", relativa: 0 });
  });

  it("situação diferente vale sobre a grandeza", () => {
    expect(classificar(ok(100), { estado: "falha", grandeza: 100 }, 0.01)).toEqual({
      categoria: "situacao",
      relativa: 0,
    });
    // o valor que só existe num modo também é mudança de situação
    expect(classificar(ok(100), { estado: "ok" }, 0.01)).toEqual({ categoria: "situacao" });
    // a viga que parou no original (sem cálculo) e foi calculada no corrigido
    expect(classificar({ estado: "sem" }, ok(0.5), 0.01)?.categoria).toBe("situacao");
  });

  it("sem cálculo nos dois modos fica fora da comparação", () => {
    expect(classificar({ estado: "sem" }, { estado: "sem" }, 0.01)).toBeUndefined();
    // NaN não é valor
    expect(classificar({ estado: "sem", grandeza: Number.NaN }, { estado: "sem" }, 0.01)).toBe(
      undefined,
    );
  });
});

describe("compararModos, contar e queDiferem", () => {
  const d = (estado: DadosElemento["estado"], grandeza?: number): DadosElemento => ({
    estado,
    mensagens: [],
    defeitos: [],
    ...(grandeza !== undefined ? { grandeza } : {}),
  });
  const elementos = ["a", "b", "c", "d", "e", "f"].map((chave) => ({ chave }));
  const original = new Map([
    ["a", d("ok", 10)], // igual: 0 %
    ["b", d("ok", 10.5)], // maior: +4,76 %
    ["c", d("ok", 9)], // menor: −10 %
    ["d", d("aviso", 20)], // situação: aviso × ok
    ["e", d("sem")], // fundação: fora
    ["f", d("ok", 12)], // maior: +16,7 %
  ]);
  const corrigido = new Map([
    ["a", d("ok", 10)],
    ["b", d("ok", 10)],
    ["c", d("ok", 10)],
    ["d", d("ok", 20)],
    ["e", d("sem")],
    ["f", d("ok", 10)],
  ]);

  it("conta por categoria, sem as peças fora da comparação", () => {
    const dif = compararModos(elementos, original, corrigido, 0.01);
    expect(dif.has("e")).toBe(false);
    expect(contar(dif.values())).toEqual({ maior: 2, igual: 1, menor: 1, situacao: 1 });
    // com 5 %: b (4,76 %) passa a igual
    expect(contar(compararModos(elementos, original, corrigido, 0.05).values())).toEqual({
      maior: 1,
      igual: 2,
      menor: 1,
      situacao: 1,
    });
  });

  it("lista a situação primeiro e depois a maior diferença", () => {
    const dif = compararModos(elementos, original, corrigido, 0.01);
    // f: 2/12 = 0,167; c: 1/10 = 0,10; b: 0,5/10,5 = 0,048
    expect(queDiferem(dif.values()).map((x) => x.chave)).toEqual(["d", "f", "c", "b"]);
  });
});

describe("obra do motor nos dois modos", () => {
  // e2e/fixtures/ui-resultados/obra-original.openstrut.json (gerar-obra.ts): 4 lajes 4 × 5 m,
  // h 10 cm, revestimento 1,0 e sobrecarga 1,5 kN/m², vigas e 9 pilares, modo original.
  const lida = lerObra(
    readFileSync(
      resolve(process.cwd(), "e2e/fixtures/ui-resultados/obra-original.openstrut.json"),
      "utf8",
    ),
  );
  if (!lida.ok) throw new Error(lida.erros.join("; "));
  const obra = lida.obra;
  const modelo = montarModelo(obra);
  const dados = (modo: "original" | "corrigido") => {
    const o = { ...obra, modoCalculo: modo };
    return dadosDosElementos(modelo, calcular(o), o, "si");
  };
  const original = dados("original");
  const corrigido = dados("corrigido");
  const lajes = modelo.elementos.filter((e) => e.tipo === "laje");

  it("o momento das lajes segue a carga: o original pesa o concreto a 2,5 t/m³", () => {
    // docs/MODO-CALCULO.md, "Outras diferenças do corrigido": concreto de 2,5 t/m³ no
    // original e 25 kN/m³ no corrigido. Mesma laje, mesmos coeficientes: o momento é
    // proporcional à carga q = peso próprio + revestimento + sobrecarga.
    //   original:  0,10 · 2,5 · 9,80665 + 1,0 + 1,5 = 4,9516625 kN/m²
    //   corrigido: 0,10 · 25            + 1,0 + 1,5 = 5,0 kN/m²
    // M_original / M_corrigido = 0,9903325, diferença relativa −0,967 %
    expect(obra.modoCalculo).toBe("original");
    expect(lajes).toHaveLength(4);
    for (const l of lajes) {
      const mo = original.get(l.chave)?.grandeza;
      const mc = corrigido.get(l.chave)?.grandeza;
      expect(mo! / mc!).toBeCloseTo(4.9516625 / 5, 4);
    }
    // 0,967 % ≤ 1 %: iguais na tolerância padrão; com 0,5 %, menores no original
    const a1 = compararModos(modelo.elementos, original, corrigido, 0.01);
    const a05 = compararModos(modelo.elementos, original, corrigido, 0.005);
    for (const l of lajes) {
      expect(a1.get(l.chave)?.categoria).toBe("igual");
      expect(a05.get(l.chave)?.categoria).toBe("menor");
      expect(a05.get(l.chave)?.relativa).toBeCloseTo(4.9516625 / 5 - 1, 4);
    }
  });

  it("as fundações ficam fora e as outras peças entram na contagem", () => {
    const dif = compararModos(modelo.elementos, original, corrigido, 0.01);
    const comparaveis = modelo.elementos.filter((e) => e.tipo !== "fundacao");
    expect(dif.size).toBe(comparaveis.length);
    const c = contar(dif.values());
    expect(c.maior + c.igual + c.menor + c.situacao).toBe(comparaveis.length);
  });
});

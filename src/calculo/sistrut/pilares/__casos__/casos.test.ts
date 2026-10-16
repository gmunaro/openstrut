/// <reference types="node" />
// Confere os JSONs de `__casos__` contra os runs do oráculo: forma, ids únicos e,
// que a linha citada em "fonte" contém o texto impresso (runs em
// __oraculo__/arquivos/; sem o arquivo, o teste falha com o caminho).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { arquivoOraculo } from "../../__oraculo__/arquivosOraculo";
import { CASOS_PILAR } from ".";

const casos = Object.entries(CASOS_PILAR);

describe.each(casos)("__casos__ %s", (nome, caso) => {
  it("forma e ids únicos", () => {
    expect(caso.caso).toBe(nome);
    expect(caso.run).toMatch(/^oraculo\/runs\/.+-\d{8}-\d{6}$/);
    const ids = caso.valores.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of caso.valores) expect(v.fonte, v.id).toMatch(/^[^:]+:\d+$/);
  });

  it(`cada fonte contém o impresso`, () => {
    for (const v of caso.valores) {
      const [arquivo, linha] = v.fonte.split(":") as [string, string];
      const texto =
        readFileSync(arquivoOraculo(join(caso.run, arquivo)), "latin1").split("\n")[
          Number(linha) - 1
        ] ?? "";
      expect(texto, `${v.id} em ${v.fonte}`).toContain(v.impresso);
    }
  });
});

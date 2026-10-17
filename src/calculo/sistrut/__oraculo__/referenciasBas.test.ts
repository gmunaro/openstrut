/// <reference types="node" />
// Citações "ARQ.BAS:linha@endereço" (referenciasBas.ts). O leitor e a conferência com
// .BAS sintéticos; e a conferência dos documentos que já usam o formato contra os .BAS
// da V1 nova, pulada quando a pasta deles não está na máquina.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  citacoes,
  conferirCitacoes,
  enderecoNaLinha,
  linhaDoEndereco,
  PASTA_BAS,
} from "./referenciasBas";

const BAS = [
  "' comentário", // 1: sem endereço
  "V_1! = 1   '@1196a DS:20",
  "IF RT_ROT_ATIVO THEN RT_EVCK", // 3: linha da retradução sem endereço
  "V_2! = INT(V_1! * 100) / 100   '@11994",
  "PRINT V_2!   '@11994a", // outro endereço que começa igual
  "L_119b0:", // 6: rótulo: o nome é o endereço
  "SUB S_202b9   ' entrada de SUB/FUNCTION (0x202b9)", // 7
  "    DIM L_BP0e!",
];
const ler = (arq: string) => (arq === "X" ? BAS : undefined);

describe("citações", () => {
  it("lista com intervalo, vírgula e endereço colado", () => {
    const [c] = citacoes("ver X.BAS:2@1196a-4@11994, 5 e mais");
    expect(c?.arquivo).toBe("X");
    expect(c?.numeros.map(({ linha, endereco }) => [linha, endereco])).toEqual([
      [2, "1196a"],
      [4, "11994"],
      [5, undefined],
    ]);
  });

  it("número depois de ponto e vírgula não é da citação", () => {
    expect(citacoes("X.BAS:2; 5")[0]?.numeros).toHaveLength(1);
  });

  it("endereço da linha: o da própria linha, do rótulo, da SUB ou do comando logo abaixo", () => {
    expect(enderecoNaLinha(BAS, 1)).toBe("1196a");
    expect(enderecoNaLinha(BAS, 6)).toBe("119b0");
    expect(enderecoNaLinha(BAS, 7)).toBe("202b9");
    expect(linhaDoEndereco(BAS, "119b0")).toBe(6);
    expect(enderecoNaLinha(BAS, 3)).toBe("11994");
    expect(linhaDoEndereco(BAS, "11994")).toBe(4);
    expect(linhaDoEndereco(BAS, "11994a")).toBe(5);
  });

  it("conferência: sem endereço, endereço em outra linha, arquivo que não existe", () => {
    expect(conferirCitacoes("X.BAS:2@1196a-4@11994", ler)).toEqual([]);
    expect(conferirCitacoes("a\nX.BAS:4", ler)).toEqual([
      "linha 2: X.BAS:4 sem o endereço (@11994)",
    ]);
    expect(conferirCitacoes("X.BAS:2@11994", ler)).toEqual([
      "linha 1: X.BAS:2@11994: o endereço está na linha 4",
    ]);
    expect(conferirCitacoes("Y.BAS:2@1", ler)).toEqual(["linha 1: Y.BAS não encontrado"]);
  });
});

describe.skipIf(!existsSync(PASTA_BAS))("documentos contra os .BAS da V1 nova", () => {
  const arquivo = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  it.each([
    ["docs/MODO-CALCULO.md", "../../../../docs/MODO-CALCULO.md"],
    ["src/calculo/defeitosOriginal.ts", "../../defeitosOriginal.ts"],
  ])("%s: cada citação com o endereço que está na linha citada", (_, rel) => {
    expect(conferirCitacoes(arquivo(rel))).toEqual([]);
  });
});

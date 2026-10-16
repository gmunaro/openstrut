/// <reference types="node" />
// Confere os JSONs do oráculo contra os runs gravados em disco: cada "fonte"
// existe e a linha citada contém o texto "impresso". Os runs estão em
// arquivos/oraculo/runs/ (README.md de lá); sem o arquivo, o teste falha com o caminho.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { arquivoOraculo } from "./arquivosOraculo";
import {
  bateComImpresso,
  CASOS_ORACULO,
  casasImpressas,
  numeroOraculo,
  valorOraculo,
} from "./index";

const casos = Object.entries(CASOS_ORACULO);

describe("JSONs do oráculo: forma", () => {
  it("há os casos pedidos na T0 (PLANO.md 5.3)", () => {
    expect(Object.keys(CASOS_ORACULO)).toEqual(
      expect.arrayContaining([
        "caso_a_laje",
        "caso_b_viga",
        "caso_c_pilar",
        "caso_c_pilaredi",
        "retrad_arm_param",
        "retrad_des_det",
        "retrad_des_menu",
        "retrad_laje_calc2",
        "retrad_laje_param",
        "retrad_lajeproc",
        "retrad_pil_dim",
      ]),
    );
  });

  it.each(casos)("%s: campos, ids únicos, fonte no formato arquivo:linha", (nome, caso) => {
    expect(caso.caso).toBe(nome);
    expect(caso.run).toMatch(/^oraculo\/runs\/.+-\d{8}-\d{6}$/);
    for (const campo of [caso.programa, caso.descricao]) expect(campo.length).toBeGreaterThan(0);
    expect(Object.keys(caso.entrada).length).toBeGreaterThan(0);
    expect(caso.valores.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const v of caso.valores) {
      expect(ids.has(v.id), `id repetido ${v.id}`).toBe(false);
      ids.add(v.id);
      expect(typeof v.grandeza).toBe("string");
      expect(typeof v.unidade).toBe("string");
      expect(v.impresso.length, v.id).toBeGreaterThan(0);
      expect(v.fonte, v.id).toMatch(/^[^:]+:\d+$/);
      if (v.casas !== undefined) expect(Number.isInteger(v.casas), v.id).toBe(true);
      if (v.trunca !== undefined) expect(typeof v.trunca).toBe("boolean");
    }
  });
});

describe.each(casos)("JSONs do oráculo: fontes de %s", (_nome, caso) => {
  it(`cada fonte existe e contém o impresso`, () => {
    const arquivos = new Map<string, string[]>();
    const linhasDe = (arquivo: string) => {
      let linhas = arquivos.get(arquivo);
      if (!linhas) {
        const caminho = arquivoOraculo(join(caso.run, arquivo));
        linhas = readFileSync(caminho, "latin1").split("\n");
        arquivos.set(arquivo, linhas);
      }
      return linhas;
    };
    for (const v of caso.valores) {
      const separador = v.fonte.lastIndexOf(":");
      const linha = linhasDe(v.fonte.slice(0, separador))[Number(v.fonte.slice(separador + 1)) - 1];
      expect(linha, `${v.id} em ${v.fonte}`).toBeDefined();
      expect(linha, `${v.id} em ${v.fonte}`).toContain(v.impresso);
    }
  });
});

describe("leitura dos valores", () => {
  const casoB = CASOS_ORACULO.caso_b_viga!;

  it("número impresso e casas (caso b: M− do apoio 1 da V1 = -0.97)", () => {
    expect(numeroOraculo(casoB, "V1.a1.M-")).toBe(-0.97);
    expect(casasImpressas(valorOraculo(casoB, "V1.a1.M-"))).toBe(2);
    expect(() => valorOraculo(casoB, "nao.existe")).toThrow();
  });

  it("meia unidade da última casa; com trunca, FIX na casa (livros_viga_pilar.md 3.1)", () => {
    const m = { id: "x", grandeza: "", unidade: "", impresso: "-0.97", fonte: "a:1" };
    expect(bateComImpresso(m, -0.972051)).toBe(true);
    expect(bateComImpresso(m, -0.9751)).toBe(false);
    const parcela = { ...m, impresso: ".72", trunca: true };
    expect(bateComImpresso(parcela, 0.729038)).toBe(true);
    expect(bateComImpresso(parcela, 0.7199)).toBe(false);
    const mep = { ...m, impresso: "-.64", trunca: true };
    expect(bateComImpresso(mep, -0.6481)).toBe(true);
    expect(bateComImpresso({ ...m, impresso: "1.1", casas: 2, trunca: true }, 1.1048)).toBe(true);
  });
});

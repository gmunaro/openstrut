// Roundtrip com o IfcOpenShell: o IFC gerado é lido, validado contra o esquema IFC4 e as
// regras WHERE do EXPRESS, e a geometria de cada elemento é gerada. Precisa de um Python
// com o ifcopenshell: OPENSTRUT_IFC_PYTHON=<caminho do python> bun run test
// src/exportacao/ifc (docs/IFC.md). Sem a variável, o teste é pulado e diz por quê.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Obra } from "../../dominio/obra";
import { importarObraSistrut } from "../../telas/InicioSistrut";
import { OBRA_E2E } from "../../telas/__fixtures__/predioSistrut";
import { calcular } from "../../telas/calculo";
import { detalharObra } from "../../telas/detalhamento";
import { obraTresPavimentos } from "./__fixtures__/obras";
import { gerarIfc } from "./gerar";

const PYTHON = process.env.OPENSTRUT_IFC_PYTHON;

interface Conferencia {
  esquema: string;
  erros: string[];
  contagem: Record<string, number>;
  niveis: { nome: string; elevacao: number; elementos: number }[];
  elementos: {
    tipo: string;
    nome: string;
    nivel: string | null;
    caixa: [number, number, number, number, number, number];
    material: string[];
    psets: Record<string, Record<string, unknown>>;
  }[];
  falhasGeometria: string[];
}

const pasta = PYTHON ? mkdtempSync(join(tmpdir(), "openstrut-ifc-")) : "";
afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true });
});

/** Gera o IFC da obra calculada e o confere com o IfcOpenShell, numa pasta temporária. */
function conferir(nome: string, obra: Obra): Conferencia {
  const c = calcular(obra);
  if (c.tipo !== "ok") throw new Error(`cálculo: ${c.tipo}`);
  const { conteudo } = gerarIfc(obra, {
    resultado: c.resultado,
    detalhamento: detalharObra(c.resultado, obra),
  });
  const arquivo = join(pasta, `${nome}.ifc`);
  writeFileSync(arquivo, conteudo);
  copyFileSync(resolve("src/exportacao/ifc/__validacao__/conferir.py"), join(pasta, "conferir.py"));
  const saida = execFileSync(PYTHON!, ["-I", "conferir.py", arquivo], {
    cwd: pasta,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(saida) as Conferencia;
}

const caixa = (r: Conferencia, tipo: string, nome: string, nivel: string) => {
  const e = r.elementos.find((x) => x.tipo === tipo && x.nome === nome && x.nivel === nivel);
  if (!e) throw new Error(`${tipo} ${nome} em ${nivel} não encontrado`);
  return e;
};

describe.skipIf(!PYTHON)("IFC lido pelo IfcOpenShell (OPENSTRUT_IFC_PYTHON)", () => {
  it("obra de 3 pavimentos: válida, níveis, contagens e dimensões", () => {
    const r = conferir("tres", obraTresPavimentos());
    expect(r.esquema).toBe("IFC4");
    expect(r.erros).toEqual([]);
    expect(r.falhasGeometria).toEqual([]);
    expect(r.niveis.map((n) => [n.nome, n.elevacao, n.elementos])).toEqual([
      ["Fundação", 0, 0],
      ["Térreo", 3.2, 13],
      ["Tipo (2/2)", 6, 13],
      ["Tipo (1/2)", 8.8, 13],
      ["Cobertura", 11.8, 13],
    ]);
    expect(r.contagem).toMatchObject({
      IfcProject: 1,
      IfcSite: 1,
      IfcBuilding: 1,
      IfcBuildingStorey: 5,
      IfcColumn: 24,
      IfcBeam: 20,
      IfcSlab: 8,
    });
    expect(r.contagem.IfcReinforcingBar).toBeGreaterThan(0);

    // P1 da cobertura: 20 × 20 cm, de 8,8 a 11,8 m
    const p1 = caixa(r, "IfcColumn", "P1", "Cobertura");
    const [x0, y0, z0, x1, y1, z1] = p1.caixa;
    expect(x1 - x0).toBeCloseTo(0.2, 6);
    expect(y1 - y0).toBeCloseTo(0.2, 6);
    expect(z0).toBeCloseTo(8.8, 6);
    expect(z1).toBeCloseTo(11.8, 6);
    expect(p1.material).toEqual(["Concreto C25"]);
    expect(p1.psets.Pset_ColumnCommon).toMatchObject({ Reference: "P1", LoadBearing: true });
    expect(p1.psets.Pset_OpenStrut).toMatchObject({ Nome: "P1", fck_MPa: 25, Calculado: true });

    // laje L1 do térreo: 4 × 5 m, h = 12 cm, topo em 3,2 m
    const l1 = caixa(r, "IfcSlab", "L1", "Térreo").caixa;
    expect(l1.map((v) => Number(v.toFixed(6)))).toEqual([0, 0, 3.08, 4, 5, 3.2]);

    // vigas com o topo no nível
    for (const v of r.elementos.filter((x) => x.tipo === "IfcBeam"))
      expect(v.caixa[5]).toBeCloseTo(r.niveis.find((n) => n.nome === v.nivel)!.elevacao, 6);
  }, 600_000);

  it("obra E2E do oráculo: válida, viga 12 × 40 do .SEC e barras dentro da viga", () => {
    const obra = importarObraSistrut(OBRA_E2E);
    if (!obra.ok) throw new Error(obra.erros.join(" "));
    const r = conferir("e2e", obra.obra);
    expect(r.erros).toEqual([]);
    expect(r.falhasGeometria).toEqual([]);
    expect(r.niveis.map((n) => [n.nome, n.elevacao])).toEqual([
      ["Fundação", 0],
      ["E2E", 3],
    ]);
    expect(r.contagem).toMatchObject({ IfcColumn: 9, IfcBeam: 6, IfcSlab: 4 });
    const v1 = caixa(r, "IfcBeam", "V1", "E2E").caixa;
    expect(v1.map((v) => Number(v.toFixed(6)))).toEqual([0, 9.94, 2.6, 8, 10.06, 3]);
    // estribos de V1 dentro da seção (cobrimento 2 cm do .DSP do oráculo ou o da obra)
    const n7 = caixa(r, "IfcReinforcingBar", "V1 N7", "E2E").caixa;
    expect(n7[1]).toBeGreaterThan(9.94);
    expect(n7[4]).toBeLessThan(10.06);
    expect(n7[2]).toBeGreaterThan(2.6);
    expect(n7[5]).toBeLessThan(3);
  }, 600_000);
});

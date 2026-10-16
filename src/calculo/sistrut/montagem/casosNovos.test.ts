/// <reference types="node" />
// Montagem (T6) contra os casos v2par do oráculo (T10; índice em
// tests/retraducao/V2PAR.md da V1). A entrada é a obra que o próprio
// original gravou no run (`obra/*.LAJ`, lida por obraLaj.ts); os esperados são os
// valores impressos (v2-paridade/oraculo-novos/<caso>.json em __oraculo__/arquivos/: reações, totais,
// quadro de alvenaria sobre as vigas, eco do VIGA) e o .VIG binário do run, campo a
// campo. Sem um desses arquivos, o teste falha com o caminho que falta.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emSingle, PARAMETROS_LAJE } from "../base/parametros";
import type { EsforcosLajes } from "../base/tipos";
import { bateComImpresso, type CasoOraculo, type ValorOraculo } from "../__oraculo__/index";
import { arquivoOraculo } from "../__oraculo__/arquivosOraculo";
import { lerObraLaj } from "./obraLaj";
import { montaPavimento } from "./reacoes";

const PASTA_JSON = "v2-paridade/oraculo-novos";

/** A montagem sempre grava o registro do .VIG; sem ele o teste falha. */
const ausente = (viga: string): never => {
  throw new Error(`${viga}: montagem sem o registro do .VIG`);
};

/** Casos da T6 e as escolhas "apoia em" do roteiro (não ficam no .LAJ). */
const CASOS: { caso: string; apoiosEmViga?: Record<string, string> }[] = [
  { caso: "v2par_laje_cargas" },
  { caso: "v2par_laje_livre" },
  { caso: "v2par_laje_balanco" },
  // roteiro: "V5 apoia em V1" e "V5 apoia em V2" nos cruzamentos sem pilar
  { caso: "v2par_viga_fluxo", apoiosEmViga: { "V5@8,0": "V2", "V5@8,5": "V1" } },
  { caso: "v2par_laje_umadir" },
  { caso: "v2par_laje_assim" },
];

/** Registros do .VIG (RT_REG_168A_LE, LAJEMONT.BAS:702-924), 855 bytes cada; o 0 é o
 *  cabeçalho. */
function lerVig(caminho: string) {
  const b = readFileSync(caminho);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const regs = [];
  for (let r = 1; r < b.byteLength / 855; r++) {
    const o = r * 855 - 1;
    const i16 = (p: number) => dv.getInt16(o + p, true);
    const f32 = (p: number) => dv.getFloat32(o + p, true);
    const tr = (c: number) =>
      Array.from({ length: 14 }, (_, t) => (c < 4 ? i16 : f32)(36 + 12 * t + c));
    const dz = (c: number) => Array.from({ length: 31 }, (_, k) => f32(216 + 20 * k + c));
    regs.push({
      nome: b.toString("latin1", o + 1, o + 21).trim(),
      bda: [26, 28, 30, 32, 34].map(i16),
      c64: tr(0),
      c92: tr(2),
      c08: tr(4),
      c36: tr(8),
      p: dz(0),
      d: dz(4),
      f: dz(8),
      pac: dz(12),
      fac: dz(16),
      mext: [f32(836), f32(840)],
    });
  }
  return regs;
}

for (const { caso, apoiosEmViga } of CASOS) {
  // sem o JSON ou a pasta do run, arquivoOraculo falha com o caminho
  const json = JSON.parse(
    readFileSync(arquivoOraculo(`${PASTA_JSON}/${caso}.json`), "utf8"),
  ) as CasoOraculo;
  const pastaObra = arquivoOraculo(`${json.run}/obra`);
  describe(`${caso} (${json.run})`, () => {
    const arquivos = readdirSync(pastaObra);
    const laj = arquivos.find((a) => a.endsWith(".LAJ")) ?? "";
    const vig = arquivos.find((a) => a.endsWith(".VIG")) ?? "";
    const obra = lerObraLaj(readFileSync(`${pastaObra}/${laj}`, "latin1"), apoiosEmViga);
    const esforcos: EsforcosLajes = {
      lajes: obra.painel.lajes,
      continuidades: [],
      preparadas: {},
      coeficientes: {},
      bordos: {},
      momentos: {},
      avisos: [],
      memoria: [],
    };
    const r = montaPavimento(
      esforcos,
      obra.painel,
      obra.eixos,
      () => null,
      { predominanteKgPorM: 150, excecoes: {} },
      emSingle(PARAMETROS_LAJE),
      "original",
    );
    const valores = new Map(json.valores.map((v) => [v.id, v] as const));
    const confere = (id: string, calc: number, erros: string[]) => {
      const v: ValorOraculo | undefined = valores.get(id);
      if (!v) return false;
      if (!bateComImpresso(v, calc)) erros.push(`${id}: ${calc} × ${v.impresso}`);
      return true;
    };

    it("reações por bordo (área, Linear, Área, Estru, Peso) e nenhuma faltando", () => {
      const erros: string[] = [];
      const vistos = new Set<string>();
      for (const x of r.reacoes) {
        const id =
          x.apoio.tipo === "viga" ? `${x.laje}>${x.apoio.viga}` : `${x.laje}>${x.apoio.pilar}`;
        vistos.add(id);
        const pares = [
          ["area", x.area],
          ["qLinear", x.linear],
          ["qArea", x.cargaArea],
          ["qEstru", x.estrutura],
          ["qPeso", x.peso],
        ] as const;
        for (const [g, c] of pares)
          if (!confere(`${id}.${g}`, c, erros) && g === "area") erros.push(`${id}: não impresso`);
      }
      for (const id of valores.keys()) {
        const m = /^(L\d+>\w+)\.area$/.exec(id);
        if (m?.[1] && !vistos.has(m[1])) erros.push(`${m[1]}: impresso e não calculado`);
      }
      expect(erros).toEqual([]);
      expect(r.avisos).toEqual([]);
    });

    it("totais do relatório", () => {
      const t = r.totais;
      const erros: string[] = [];
      const pares = [
        ["total.cargasLineares", t.alvenariasNominal],
        ["total.cargasLinearesConsiderado", t.alvenarias],
        ["total.cargasArea", t.cargasPorAreaNominal],
        ["total.cargasAreaConsiderado", t.cargasPorArea],
        ["total.ppVigas", t.pesoProprioVigas],
        ["total.ppLajes", t.pesoProprioLajes],
        ["total.estrutura", t.estrutura],
        ["total.painel", t.painel],
        ["total.vigas", t.vigas],
        ["total.pilares", t.pilares],
        ["total.vigasPilares", t.vigas + t.pilares],
      ] as const;
      for (const [id, c] of pares) confere(id, c, erros);
      expect(erros).toEqual([]);
    });

    it("quadro de alvenarias sobre as vigas (peso próprio e alvenaria por tramo)", () => {
      const erros: string[] = [];
      for (const v of r.vigas)
        for (const l of v.alvenariasSobreViga ?? ausente(v.nome)) {
          confere(`${v.nome}.t${l.tramo}.ppViga`, l.peso, erros);
          confere(`${v.nome}.t${l.tramo}.alv`, l.alvenaria, erros);
        }
      expect(erros).toEqual([]);
    });

    it("modo corrigido (float64, mesmo algoritmo): reações e totais dentro do impresso", () => {
      const rc = montaPavimento(
        esforcos,
        obra.painel,
        obra.eixos,
        () => null,
        { predominanteKgPorM: 150, excecoes: {} },
        PARAMETROS_LAJE,
        "corrigido",
      );
      const erros: string[] = [];
      for (const x of rc.reacoes) {
        const id =
          x.apoio.tipo === "viga" ? `${x.laje}>${x.apoio.viga}` : `${x.laje}>${x.apoio.pilar}`;
        confere(`${id}.area`, x.area, erros);
        confere(`${id}.qArea`, x.cargaArea, erros);
        confere(`${id}.qEstru`, x.estrutura, erros);
        confere(`${id}.qPeso`, x.peso, erros);
      }
      confere("total.painel", rc.totais.painel, erros);
      confere("total.vigas", rc.totais.vigas, erros);
      expect(rc.reacoes).toHaveLength(r.reacoes.length);
      expect(erros).toEqual([]);
    });

    it(".VIG gravado pelo original: todos os campos iguais bit a bit", () => {
      const regs = lerVig(`${pastaObra}/${vig}`);
      expect(regs.map((g) => g.nome)).toEqual(r.vigas.map((v) => v.nome));
      const erros: string[] = [];
      r.vigas.forEach((v, i) => {
        const g = regs[i];
        if (!g) return;
        const registro = v.registro ?? ausente(v.nome);
        const campos = ["bda", "c64", "c92", "c08", "c36", "p", "d", "pac"] as const;
        for (const c of campos) {
          const nosso = registro[c];
          const deles = g[c];
          deles.forEach((x, k) => {
            const y = nosso[k] ?? 0;
            if (!Object.is(Math.fround(y) + 0, x + 0))
              erros.push(`${v.nome}.${c}[${k}]: ${y} × ${x}`);
          });
        }
        g.f.forEach((x, k) => {
          const f = registro.f[k] ?? 0;
          const fac = registro.fac[k] ?? 0;
          if (fac === -100) {
            // carga indexada *n.aa: o VIGA opção 7 do mesmo run a resolveu e regravou o
            // registro (VIGA.BAS:1676-1704 e L_1abfd, 1667-1671): F = INT(R·1000)/1000 da
            // reação da viga n (isostática de um tramo: R = P·L/2) e Fac = 0
            const alvo = r.vigas[Math.trunc(f) - 1];
            const t1 = alvo?.tramos[0];
            const R = ((t1?.divisoes[0]?.p ?? 0) * (t1?.vao ?? 0)) / 2;
            if (alvo?.tramos.length !== 1)
              erros.push(`${v.nome}.f[${k}]: viga indexada ${f} não é isostática`);
            if (Math.fround(Math.floor(R * 1000) / 1000) !== x || g.fac[k] !== 0)
              erros.push(`${v.nome}.f[${k}]: indexada ${f} × gravado pelo VIGA ${x}/${g.fac[k]}`);
          } else if (!Object.is(Math.fround(f) + 0, x + 0) || fac !== g.fac[k]) {
            erros.push(`${v.nome}.f/fac[${k}]: ${f}/${fac} × ${x}/${g.fac[k]}`);
          }
        });
        if (g.mext.some((m) => m !== 0)) erros.push(`${v.nome}: momentos externos ${g.mext}`);
      });
      expect(erros).toEqual([]);
    });
  });
}

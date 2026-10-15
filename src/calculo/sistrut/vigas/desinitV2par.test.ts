/// <reference types="node" />
// Rodada 2 do oráculo da T4b: casos v2par_des_3tramos, v2par_des_2tramos e
// v2par_des_especial (C:/wt/v1-v2par/tests/retraducao/V2PAR.md). Valores esperados:
// - análise do DESDIM, dimensionamento e resumo: vigas/__desinit__/v2par_des_*.json
//   (impressora.prn do run);
// - quadro de ferros do desenho definitivo e .TAB: vigas/__desinit__/v2par_des_quadros.json
//   (lido da impressora.png e decodificado do .TAB gravado pelo original).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bateComImpresso,
  type CasoOraculo,
  numeroOraculo,
  valorOraculo,
} from "../__oraculo__/index";
import { qbInt } from "../base/f32";
import { quadroDaViga, resumoGeralVigas } from "../quant/vigas";
import { casoV2par, type NomeCaso } from "./__desinit__/casosV2par";
import quadros from "./__desinit__/v2par_des_quadros.json";
import j2 from "./__desinit__/v2par_des_2tramos.json";
import j3 from "./__desinit__/v2par_des_3tramos.json";
import jEsp from "./__desinit__/v2par_des_especial.json";
import { detalhaViga, montaComum } from "./desinit";

const CASOS: [NomeCaso, CasoOraculo, string][] = [
  ["v2par_des_3tramos", j3 as CasoOraculo, "V1"],
  ["v2par_des_2tramos", j2 as CasoOraculo, "V5"],
  ["v2par_des_especial", jEsp as CasoOraculo, "D1"],
];
const ROTULOS = ["4", "5", "6.3", "8", "10", "12.5", "16", "20", "25", "32"];

describe.each(CASOS)("%s: análise do DESDIM (DESCALC) contra a impressora", (nome, caso, v) => {
  const { entrada, dim, extras } = casoV2par(nome);
  const c = montaComum(entrada, dim, "original", extras);
  const imp = c.impressaoDescalc!;
  const n = c.v0ddc;
  const ids = new Set(caso.valores.map((x) => x.id));
  const bate = (id: string, x: number) => {
    if (!ids.has(id)) return;
    expect(bateComImpresso(valorOraculo(caso, id), x), `${id}: ${x}`).toBe(true);
  };

  it("apoios: M−, R e, com acidentais, M− máximo e R máxima/mínima", () => {
    for (let k = 0; k <= n; k++) {
      bate(`${v}.a${k}.M-`, c.a15ca.g(k));
      bate(`${v}.a${k}.R`, imp.reacao.g(k));
      bate(`${v}.a${k}.max.M-`, c.a16de.g(k));
      bate(`${v}.a${k}.max.R`, imp.reacaoEnvoltoria.g(k, 0));
      bate(`${v}.a${k}.min.R`, imp.reacaoEnvoltoria.g(k, 1));
    }
    let soma = 0;
    for (let k = 0; k <= n; k++) soma += imp.reacao.g(k);
    bate(`${v}.somaR`, soma);
  });

  it("tramos: Ve, x, M+, Vd, a linha 'max' e os balanços", () => {
    for (let t = 1; t <= n; t++) {
      bate(`${v}.t${t}.Ve`, c.a1654.g(t, 0));
      bate(`${v}.t${t}.x`, c.a15f8.g(t));
      bate(`${v}.t${t}.M+`, c.a1626.g(t));
      bate(`${v}.t${t}.Vd`, c.a1654.g(t, 1));
      // DESDIM.BAS:6370-6380: o maior em módulo entre Ve e o Ve mínimo, e entre Vd e o Vd mín.
      const ve = Math.abs(c.a1796.g(t, 3)) > c.a1796.g(t, 0) ? c.a1796.g(t, 3) : c.a1796.g(t, 0);
      const vd = Math.abs(c.a1796.g(t, 4)) > c.a1796.g(t, 1) ? c.a1796.g(t, 4) : c.a1796.g(t, 1);
      bate(`${v}.t${t}.max.Ve`, ve);
      bate(`${v}.t${t}.max.x`, c.a173a.g(t));
      bate(`${v}.t${t}.max.M+`, c.a1768.g(t));
      bate(`${v}.t${t}.max.Vd`, vd);
    }
    bate(`${v}.t0.Vd`, c.a1654.g(0, 1));
    bate(`${v}.t${n + 1}.Ve`, c.a1654.g(n + 1, 0));
  });

  it("momentos de engastamento perfeito (INT no centésimo) e a tabela EEP", () => {
    const mep = (id: string, x: number) => {
      if (ids.has(id)) expect(qbInt(x * 100) / 100, id).toBeCloseTo(numeroOraculo(caso, id), 9);
    };
    mep(`${v}.MEP0`, imp.mep.g(0));
    mep(`${v}.MEP${n}`, imp.mep.g(1));
    for (let i = 1; i <= c.v1176; i++) {
      const t = c.a11d6.g(i);
      bate(`${v}.t${t}.EEP.Ve`, c.a1204.g(i, 0));
      bate(`${v}.t${t}.EEP.x`, c.a117a.g(i));
      bate(`${v}.t${t}.EEP.M+`, c.a11a8.g(i));
      bate(`${v}.t${t}.EEP.Vd`, c.a1204.g(i, 1));
    }
    const eep = caso.valores.filter((x) => x.id.includes(".EEP.M+")).length;
    expect(c.v1176).toBe(eep);
  });

  it("cortantes com alívio Vke/Vkd e o Mk dos tramos", () => {
    for (let t = 0; t <= n + 1; t++) {
      bate(`${v}.t${t}.Vke`, c.a1540.g(t, 0));
      bate(`${v}.t${t}.Vkd`, c.a1540.g(t, 1));
      if (t >= 1 && t <= n) bate(`${v}.t${t}.Mk`, c.a128e.g(t, 4));
    }
  });
});

describe.each(CASOS)("%s: detalhamento, .TAB e resumo", (nome, caso, v) => {
  const { entrada, dim, extras } = casoV2par(nome);
  const d = detalhaViga(entrada, dim, "original", extras);
  const esperado = quadros[nome];
  const q = quadroDaViga(d, entrada.secoes, entrada.forma, 0, entrada.parametros, "original");

  it("quadro de ferros do desenho: mesmas posições, na mesma ordem (N1..)", () => {
    expect(d.avisos).toEqual([]);
    expect(
      d.posicoes.map((p) => [
        Number(p.bitola.toFixed(1)),
        p.quantidade,
        p.comprimento,
        p.quantidade * p.comprimento,
      ]),
    ).toEqual(esperado.quadro.linhas.map((l) => [l.bitola, l.quantidade, l.unitario, l.total]));
  });

  it(".TAB: volume, fôrma e comprimento por bitola", () => {
    expect([q.volumeCentesimos, q.formaCentesimos]).toEqual([
      esperado.tab.volume,
      esperado.tab.forma,
    ]);
    expect(q.comprimentoPorBitola).toEqual(esperado.tab.comprimentos);
    expect(esperado.tab.nome).toBe(`~${v}`);
  });

  const temTab = existsSync(esperado.run);
  it.skipIf(!temTab)(
    `o .TAB decodificado é o do run${temTab ? "" : " (pulado: sem o run)"}`,
    () => {
      const [arquivo, , reg] = esperado.tab.fonte.split(" ");
      const r = Number(reg);
      const b = readFileSync(join(esperado.run, arquivo!)).subarray((r - 1) * 70, r * 70);
      const vals = Array.from({ length: 15 }, (_, i) => b.readFloatLE(10 + 4 * i));
      expect([vals[1], vals[2], vals.slice(5)]).toEqual([
        esperado.tab.volume,
        esperado.tab.forma,
        esperado.tab.comprimentos,
      ]);
    },
  );

  it("resumo geral impresso (por viga, totais e pesos)", () => {
    const r = resumoGeralVigas([q], entrada.parametros, "original");
    const bate = (id: string, x: number) =>
      expect(bateComImpresso(valorOraculo(caso, id), x), `${id}: ${x}`).toBe(true);
    bate(`resumo.${v}.Vconc`, r.porViga[0]!.volume);
    bate(`resumo.${v}.Afor`, r.porViga[0]!.forma);
    bate("resumo.total.Vconc", r.volume);
    bate("resumo.total.Afor", r.forma);
    for (const [i, rot] of ROTULOS.entries()) {
      bate(`resumo.${v}.comp.${rot}`, r.comprimentoPorBitola[i]!);
      bate(`resumo.total.comp.${rot}`, r.comprimentoPorBitola[i]!);
      bate(`resumo.peso.${rot}`, r.pesoPorBitola[i]!);
    }
  });
});

describe.each(CASOS)("%s: fontes do JSON", (_nome, caso) => {
  const tem = existsSync(caso.run);
  it.skipIf(!tem)(
    `cada fonte existe e contém o impresso${tem ? "" : " (pulado: sem o run)"}`,
    () => {
      for (const x of caso.valores) {
        const sep = x.fonte.lastIndexOf(":");
        const linha = readFileSync(join(caso.run, x.fonte.slice(0, sep)), "latin1").split("\n")[
          Number(x.fonte.slice(sep + 1)) - 1
        ];
        expect(linha, x.id).toContain(x.impresso);
      }
    },
  );
});

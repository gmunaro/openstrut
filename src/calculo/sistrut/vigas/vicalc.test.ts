// Testes do VICALC contra os números impressos pelo SISTRUT 4.0 original (oráculo):
// caso b (`__oraculo__/caso_b_viga.json`) e os casos p3, c1 e x1 da retradução da
// viga (`vigas/__casos__/`, com o caminho do run e a linha de cada valor). Cada valor
// confere de dois jeitos: meia unidade da última casa impressa (`bateComImpresso`) e
// o texto exato do PRINT USING do original sobre o SINGLE calculado.
/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { qbUsing, sng } from "../base/f32";
import { emSingle, PARAMETROS_VIGA } from "../base/parametros";
import type { ModoSistrut } from "../base/tipos";
import { bateComImpresso, CASOS_ORACULO, type ValorOraculo } from "../__oraculo__/index";
import { CASOS_VICALC, casoVicalc, dadosViga, parametrosDoCaso } from "./__casos__/index";
import {
  analisaViga,
  analisaVigas,
  analisaVigasComPendencias,
  type AnaliseVigaSistrut,
  divisaoComAcidentalGerada,
  fatorReducaoNegativos,
  inerciaPorSecoes,
  porcentagemAcidentalGerada,
  textoMep,
} from "./vicalc";

/** Valor calculado para o id do oráculo (sem o prefixo da viga): "a1.M-", "t2.max.x",
 *  "ep1.Vd", "b0.carga", "somaR". MEP volta à parte (é texto STR$). */
function calculado(a: AnaliseVigaSistrut, id: string): number {
  const [parte = "", campo = "", sub = ""] = id.split(".");
  if (parte === "somaR") return a.somaReacoes;
  const k = Number(parte.slice(parte.search(/\d/)));
  if (parte.startsWith("a")) {
    const apoio = a.apoios[k];
    if (!apoio) throw new Error(`apoio ${k} não existe em ${a.nome}`);
    const mapa = {
      "M-": apoio.m,
      R: apoio.r,
      Mmax: apoio.mMax,
      Rmax: apoio.rMax,
      Rmin: apoio.rMin,
    };
    const v = mapa[campo as keyof typeof mapa];
    if (v === undefined) throw new Error(`campo ${id}`);
    return v;
  }
  if (parte.startsWith("b")) {
    const bal = k === 0 ? a.balancoEsquerdo : a.balancoDireito;
    if (!bal) throw new Error(`balanço ${id} não existe em ${a.nome}`);
    return bal.carga;
  }
  if (parte.startsWith("ep")) {
    const linha = a.engastamentoPerfeito.find((e) => e.tramo === k);
    if (!linha) throw new Error(`tramo ${k} fora da tabela de engastamento perfeito de ${a.nome}`);
    const mapa = { Ve: linha.ve, x: linha.x, "M+": linha.mPositivo, Vd: linha.vd };
    return mapa[campo as keyof typeof mapa];
  }
  const tramo = a.tramos[k - 1];
  if (!tramo) throw new Error(`tramo ${k} não existe em ${a.nome}`);
  const fonte = campo === "max" ? tramo.envoltoria : tramo;
  if (!fonte) throw new Error(`${id}: ${a.nome} sem envoltória`);
  const nome = campo === "max" ? sub : campo;
  const mapa = { Ve: fonte.ve, x: fonte.x, "M+": fonte.mPositivo, Vd: fonte.vd, fEJ: fonte.fEJ };
  const v = mapa[nome as keyof typeof mapa];
  if (v === undefined) throw new Error(`campo ${id}`);
  return v;
}

/** Máscara do PRINT USING de cada campo (VIGA.BAS:7501-7502, 7529, 7577-7578, 7636). */
function mascara(id: string) {
  if (/\.a\d+\./.test(id)) return "########.##";
  if (id.endsWith("somaR")) return "######.##";
  return "#######.##";
}

/** Confere todos os valores (exceto ecos de entrada) de uma viga do caso. */
function confere(
  a: AnaliseVigaSistrut,
  valores: readonly ValorOraculo[],
  prefixo: string,
  modo: ModoSistrut,
) {
  const falhas: string[] = [];
  let conferidos = 0;
  for (const v of valores) {
    if (!v.id.startsWith(`${prefixo}.`)) continue;
    const id = v.id.slice(prefixo.length + 1);
    if (/^t\d+\.(P|L|J|D|F)$/.test(id)) continue;
    conferidos += 1;
    if (/^MEP\d+$/.test(id)) {
      const mep = id === "MEP0" ? a.mepEsquerdo : a.mepDireito;
      const texto = textoMep(mep, modo);
      if (texto !== v.impresso)
        falhas.push(`${v.id}: esperado ${v.impresso}, obtido ${texto} (${mep})`);
      continue;
    }
    const x = calculado(a, id);
    const texto = qbUsing(mascara(v.id), x).trim();
    if (!bateComImpresso(v, x) || texto !== v.impresso) {
      falhas.push(`${v.id}: esperado ${v.impresso} (${v.fonte}), obtido ${texto} (${x})`);
    }
  }
  return { falhas, conferidos };
}

const ORIGINAL = "original" as const;

describe("caso b (VIGA opção 7 da E2E; __oraculo__/caso_b_viga.json)", () => {
  const caso = casoVicalc("caso_b");
  const oraculo = CASOS_ORACULO.caso_b_viga!;
  const parametros = parametrosDoCaso(caso.parametros, ORIGINAL);
  const vigas = caso.vigas.map((v) => dadosViga(v, ORIGINAL));

  it.each(vigas.map((v) => [v.nome, v] as const))(
    "%s: M−, R, Ve, x, M+, Vd, f·EJ, soma e MEP",
    (nome, viga) => {
      const { falhas, conferidos } = confere(
        analisaViga(viga, parametros, ORIGINAL),
        oraculo.valores,
        nome,
        ORIGINAL,
      );
      expect(falhas).toEqual([]);
      expect(conferidos).toBe(19);
    },
  );

  it("a entrada decodificada do E2E.VIG ecoa como o relatório (P, L, J, D, F)", () => {
    for (const v of oraculo.valores.filter((x) => /^V\d\.t\d\.(P|L|J|D|F)$/.test(x.id))) {
      const [nome, t, campo] = v.id.split(".");
      const tramo = vigas.find((x) => x.nome === nome)?.tramos[Number(t?.slice(1)) - 1];
      const div = tramo?.divisoes[0];
      const entrada = { P: div?.p, L: tramo?.vao, J: tramo?.inercia, D: div?.d, F: div?.f }[
        campo as "P"
      ];
      expect(entrada !== undefined && bateComImpresso(v, entrada), v.id).toBe(true);
    }
  });

  it("V4 e V6: x = 1,88 e 1,87 com a mesma carga impressa (SINGLE por atribuição)", () => {
    const [v4, v6] = ["V4", "V6"].map((n) =>
      analisaViga(
        vigas.find((v) => v.nome === n)!,
        parametros,
        ORIGINAL,
      ),
    );
    expect(qbUsing("##.##", v4!.tramos[0]!.x)).toBe(" 1.88");
    expect(qbUsing("##.##", v6!.tramos[0]!.x)).toBe(" 1.87");
    // Em SINGLE, Ve/q fica em 1,875 no V4 e 2 ulp abaixo no V6 (cargas 0,5892305 e
    // 0,5892304 diferem no último bit); o PRINT USING arredonda para lados opostos.
    expect(v4!.tramos[0]!.x).toBeGreaterThanOrEqual(1.875);
    expect(v6!.tramos[0]!.x).toBeLessThan(1.875);
  });

  it("modo corrigido (float64): x = 3L/8 = 1,875 nas duas (livros_viga_pilar.md 3.1)", () => {
    const corr = parametrosDoCaso(caso.parametros, "corrigido");
    for (const n of ["V4", "V6"]) {
      const v = dadosViga(
        caso.vigas.find((x) => x.nome === n)!,
        "corrigido",
      );
      expect(analisaViga(v, corr, "corrigido").tramos[0]!.x).toBeCloseTo(1.875, 6);
    }
  });

  it("V1 à mão: MEP −0,648034 e momento ao pilar INT(100·100·MEP)/10000 = −0,6481 (livro 3.1)", () => {
    const a = analisaViga(vigas[0]!, parametros, ORIGINAL);
    expect(a.mepEsquerdo).toBeCloseTo(-0.648034, 6);
    expect(a.momentosPilar).toEqual([sng(-0.6481), sng(-0.6481)]);
    expect(a.apoios[1]!.m).toBeCloseTo(-0.972051, 6);
    expect(a.tramos[0]!.fEJ).toBeCloseTo(0.664488, 5);
    expect(a.engastamentoPerfeito).toEqual([]);
  });
});

describe("p3 (opção 3: balanço, engaste, J calculado, concentradas)", () => {
  const caso = casoVicalc("p3");
  const parametros = parametrosDoCaso(caso.parametros, ORIGINAL);
  const viga = dadosViga(caso.vigas[0]!, ORIGINAL);
  const a = analisaViga(viga, parametros, ORIGINAL);

  it("VT1: apoios, tramos, balanço, MEP e engastamento perfeito", () => {
    const { falhas, conferidos } = confere(a, caso.valores ?? [], "VT1", ORIGINAL);
    expect(falhas).toEqual([]);
    expect(conferidos).toBe(caso.valores?.length);
  });

  it("J por seções 20×40 e 20×50 = 1,95 (VIGA.BAS:1396-1406; <J>= 1.95 na tela)", () => {
    expect(inerciaPorSecoes(20, 40, 20, 50, ORIGINAL)).toBe(sng(1.95));
    expect(inerciaPorSecoes(20, 50, 20, 40, ORIGINAL)).toBe(sng(1.95));
  });

  it("engaste à direita: momento ao pilar direito = |M(3)|; balanço à esquerda: 0", () => {
    expect(a.momentosPilar[0]).toBe(0);
    expect(a.momentosPilar[1]).toBe(Math.abs(a.apoios[3]!.mMax));
    expect(a.balancoEsquerdo?.mApoio).toBe(sng(-3.75));
  });
});

describe("c1 (redução 85 %, acidentais S geradas 25 %, Mext, reação máxima)", () => {
  const caso = casoVicalc("c1");
  const parametros = parametrosDoCaso(caso.parametros, ORIGINAL);

  it("VA1 (opção 3): envoltória, Mext 0 e −1,5, balanço à direita", () => {
    const a = analisaViga(dadosViga(caso.vigas[0]!, ORIGINAL), parametros, ORIGINAL);
    const { falhas, conferidos } = confere(a, caso.valores ?? [], "VA1", ORIGINAL);
    expect(falhas).toEqual([]);
    expect(conferidos).toBe(43);
  });

  it.each(["V2", "V4", "V5"])("%s (opção 7 na E2E): envoltória e redução 85 %", (nome) => {
    const v = caso.vigasRep!.find((x) => x.nome === nome)!;
    const a = analisaViga(dadosViga(v, ORIGINAL), parametros, ORIGINAL);
    const { falhas, conferidos } = confere(a, caso.valores ?? [], nome, ORIGINAL);
    expect(falhas).toEqual([]);
    expect(conferidos).toBe(38);
  });

  it("acidental gerada 25 %: Pac = 0,375 e Fac = 0,25 (P 1,5, F 1); 0,125 → ' 0.13'", () => {
    const d = divisaoComAcidentalGerada(
      { p: sng(1.5), d: 2, f: 1, pAcidental: 0, fAcidental: 0 },
      parametros,
      ORIGINAL,
    );
    expect([d.pAcidental, d.fAcidental]).toEqual([0.375, 0.25]);
    const bal = divisaoComAcidentalGerada(
      { p: 1, d: sng(1.2), f: 0.5, pAcidental: 0, fAcidental: 0 },
      parametros,
      ORIGINAL,
    );
    expect(qbUsing("###.##", bal.fAcidental).trim()).toBe("0.13");
  });
});

describe("x1 (acidentais fornecidas, carga indexada)", () => {
  const caso = casoVicalc("x1");
  const parametros = parametrosDoCaso(caso.parametros, ORIGINAL);
  const vigas = caso.vigas.map((v) => dadosViga(v, ORIGINAL));

  it("opção 2: V21 só depois da V20, com F = INT(R(1)·1000)/1000 = 2,00", () => {
    const analises = analisaVigas(vigas, parametros, ORIGINAL);
    expect(analises.map((a) => a.nome)).toEqual(["V20", "V21"]);
    // F transferido = INT(R(1) da V20 · 1000)/1000, impresso "2.00" no quadro da V21.
    const f = Math.floor(analises[0]!.apoios[1]!.r * 1000) / 1000;
    expect(qbUsing("###.##", f).trim()).toBe(caso.indexada?.impresso);
    for (const a of analises) {
      const { falhas } = confere(
        a as AnaliseVigaSistrut,
        caso.valores ?? [],
        `op2.${a.nome}`,
        ORIGINAL,
      );
      expect(falhas).toEqual([]);
    }
  });

  it("a ordem da lista não muda a ordem de dependência", () => {
    const { analises, naoProcessadas } = analisaVigasComPendencias(
      [...vigas].reverse(),
      parametros,
      ORIGINAL,
    );
    expect(analises.map((a) => a.nome)).toEqual(["V20", "V21"]);
    expect(naoProcessadas).toEqual([]);
  });

  it("apoio inexistente na viga de origem: a viga fica sem processar (U61-019)", () => {
    const v21 = structuredClone(vigas[1]!);
    v21.tramos[1]!.divisoes[0]!.indexada = { viga: "V20", apoio: 5 };
    const r = analisaVigasComPendencias([vigas[0]!, v21], parametros, ORIGINAL);
    expect(r.naoProcessadas).toEqual(["V21"]);
    const contrato = analisaVigas([vigas[0]!, v21], parametros, ORIGINAL);
    expect(contrato[0]!.avisos.join(" ")).toContain("V21");
  });

  it.each(["V20", "V21"])(
    "opção 7 (%s com J marcado pelo pilar: Rmin 0,04 e f·EJ 7,93 na V21)",
    (nome) => {
      const v = caso.vigasRep!.find((x) => x.nome === nome)!;
      const a = analisaViga(dadosViga(v, ORIGINAL), parametros, ORIGINAL);
      const { falhas, conferidos } = confere(a, caso.valores ?? [], `op7.${nome}`, ORIGINAL);
      expect(falhas).toEqual([]);
      expect(conferidos).toBeGreaterThan(20);
    },
  );
});

describe("a1 (opção 2 na tela: engaste nas duas pontas e concentrada)", () => {
  const caso = casoVicalc("a1");
  const parametros = parametrosDoCaso(caso.parametros, ORIGINAL);

  it.each(["V10", "V11"])("%s", (nome) => {
    const v = caso.vigas.find((x) => x.nome === nome)!;
    const a = analisaViga(dadosViga(v, ORIGINAL), parametros, ORIGINAL);
    const { falhas, conferidos } = confere(a, caso.valores ?? [], nome, ORIGINAL);
    expect(falhas).toEqual([]);
    expect(conferidos).toBe(caso.valores?.filter((x) => x.id.startsWith(`${nome}.`)).length);
  });

  it("V11 engastada: momentos aos pilares = |M| dos engastes (VIGA.BAS:7667-7675)", () => {
    const v = caso.vigas.find((x) => x.nome === "V11")!;
    const a = analisaViga(dadosViga(v, ORIGINAL), parametros, ORIGINAL);
    expect(a.momentosPilar).toEqual([Math.abs(a.apoios[0]!.m), Math.abs(a.apoios[2]!.m)]);
  });
});

describe("modo corrigido: R6 (redução e % gerada do VIGA.INI)", () => {
  const p = (reducaoNegativos: number, porcentagemAcidentalGerada = 30) => ({
    ...PARAMETROS_VIGA,
    reducaoNegativos,
    porcentagemAcidentalGerada,
  });

  it("redução: original MIN(v, 15) sem piso; corrigido 0,15..1", () => {
    expect(fatorReducaoNegativos(emSingle(p(0.05)), "original")).toBe(sng(0.05));
    expect(fatorReducaoNegativos(emSingle(p(1.5)), "original")).toBe(1.5);
    expect(fatorReducaoNegativos(emSingle(p(20)), "original")).toBe(15);
    expect(fatorReducaoNegativos(p(0.05), "corrigido")).toBe(0.15);
    expect(fatorReducaoNegativos(p(1.5), "corrigido")).toBe(1);
    expect(fatorReducaoNegativos(p(0.85), "corrigido")).toBe(0.85);
  });

  it("caso b V1 com INI 150 %: original amplia M(1) para 1,5·(−0,972051); corrigido fica em −0,972051", () => {
    const caso = casoVicalc("caso_b");
    const v1o = dadosViga(caso.vigas[0]!, "original");
    const v1c = dadosViga(caso.vigas[0]!, "corrigido");
    expect(analisaViga(v1o, emSingle(p(1.5)), "original").apoios[1]!.m).toBeCloseTo(-1.458077, 5);
    expect(analisaViga(v1c, p(1.5), "corrigido").apoios[1]!.m).toBeCloseTo(-0.972051, 5);
  });

  it("% de acidental gerada limitada a 4..96 nos dois modos (leitura do INI, VIGA.BAS:617-629)", () => {
    expect(porcentagemAcidentalGerada(emSingle(p(1, 150)), "original")).toBe(96);
    expect(porcentagemAcidentalGerada(emSingle(p(1, 2)), "original")).toBe(4);
    expect(porcentagemAcidentalGerada(p(1, 25.5), "original")).toBe(26);
    expect(porcentagemAcidentalGerada(p(1, 150), "corrigido")).toBe(96);
  });
});

describe("__casos__: cada fonte existe no run e contém o impresso", () => {
  for (const [nome, caso] of Object.entries(CASOS_VICALC)) {
    const temRun = existsSync(caso.run);
    it.skipIf(!temRun)(`${nome}${temRun ? "" : ` (pulado: ${caso.run} não existe)`}`, () => {
      const cache = new Map<string, string[]>();
      const linha = (fonte: string) => {
        const i = fonte.lastIndexOf(":");
        const arq = fonte.slice(0, i);
        let linhas = cache.get(arq);
        if (!linhas) {
          linhas = readFileSync(join(caso.run, arq), "latin1").split("\n");
          cache.set(arq, linhas);
        }
        return (linhas[Number(fonte.slice(i + 1)) - 1] ?? "").replace(/\r$/, "");
      };
      for (const v of caso.valores ?? []) expect(linha(v.fonte), v.id).toContain(v.impresso);
      for (const l of caso.rep?.linhas ?? []) expect(linha(l.fonte), l.fonte).toBe(l.texto);
    });
  }
});

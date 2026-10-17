/// <reference types="node" />
// Erros do original na obra (defeitosOriginal.ts), com obras sintéticas de cada defeito
// que já tem caso e valores de referência independentes:
// - P-b: a transição de colunas.test.ts (conta à mão: PB recebe 10 t pela coluna e
//   f·4,1/4 = 10,25 t pela viga);
// - R5: o E2E (caso b do oráculo): a reação da V2 no P5 sai impressa 6,94 (arredondada,
//   impressora.prn:49) e a parcela do .REP 6,93 (cortada, :216): o corte tira entre
//   0,005 e 0,01 t; o total do .REP é 17,37 (:204);
// - R2: o .LAJ do v2par_laje_r2 (L1 lado 3 com L2 lado 3): a negativa sai com a As da
//   L2, 2,86 cm²/m, e a L1 pede 4,70 (descrição do caso no oráculo);
// - R3: o .LAJ do v2par_laje_otim com o piso Mneg/Mpos 0,35: trava na L1, no lado
//   2 do motor (que começa em 0: a tela mostra o lado 3), código 5 (v2par_laje_r3);
// - D-ψ: o Asw sem o defeito é conferido à mão em vigas/desdim.test.ts; aqui, que ele
//   entra na tabela só quando muda o número impresso;
// - R1: a flecha é a do modo corrigido (lajes/espessura.ts tem os testes da conta).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importarLaj, type OpcoesImportacaoLaj } from "../armazenamento/sistrut/laje";
import type { Obra } from "../dominio/obra";
import { errosDoOriginal } from "./defeitosOriginal";
import { calcularObra, type ResultadoObra } from "./fluxo";
import { nb178, nbr6118 } from "./normas";
import { obraE2E } from "./sistrut/__e2e__/obraE2E";
import { obraTransicao } from "./sistrut/__e2e__/obraTransicao";

const dois = (obra: Obra) => ({
  original: calcularObra({ ...obra, modoCalculo: "original" }, nb178),
  corrigido: calcularObra({ ...obra, modoCalculo: "corrigido" }, nb178),
});
const erros = (obra: Obra, ativo: "original" | "corrigido" = "original") => {
  const { original, corrigido } = dois(obra);
  return errosDoOriginal(original, corrigido, ativo);
};
const doLaj = (caso: string, opcoes?: OpcoesImportacaoLaj) => {
  const imp = importarLaj(
    readFileSync(new URL(`./sistrut/__oraculo__/__laj__/${caso}.LAJ`, import.meta.url), "latin1"),
    opcoes,
  );
  if (!imp.ok) throw new Error(imp.erros.join("\n"));
  return imp.obra;
};
const numero = (texto: string) => Number(/-?\d+,\d+/.exec(texto)![0].replace(",", "."));

describe("P-b: pilar sobre viga de transição com a carga dele", () => {
  it("as 4 partes, com os números da conta à mão: 20,25 t no SISTRUT, 10,25 t sem o erro", () => {
    const [e, ...resto] = erros(obraTransicao()).filter((x) => x.id === "P-b");
    expect(resto).toEqual([]);
    expect(e!.mecanismo).toMatch(/duas vezes: pelo pilar de baixo e pela reação da viga/);
    expect(e!.linhas).toEqual([
      {
        local: "CIMA",
        elemento: "PB (nasce na V1 do BAIXO)",
        original: "20,25 t",
        semErro: "10,25 t (10,00 t a menos)",
        corrigido: "10,25 t",
      },
    ]);
    // 10 / 10,25 = 97,6 %
    expect(e!.impacto).toContain(
      "PB, que nasce na viga V1 do BAIXO: fundação com 20,25 t no SISTRUT contra 10,25 t sem a dupla contagem, 10,00 t a mais (98 % acima da carga certa)",
    );
    expect(e!.sentido).toBe("a favor");
    expect(e!.v2Faz).toMatch(/^Modo ativo: Como o SISTRUT original\. A V2 reproduz/);
    // a parte 3 traz o valor do outro modo
    expect(e!.v2Faz).toMatch(/No PB: 20,25 t no SISTRUT e 10,25 t no modo corrigido\.$/);
    expect(e!.oQueFazer).toMatch(/a favor da segurança/);
    expect(e!.elementos).toEqual([
      { local: "CIMA", elemento: "PB" },
      { local: "BAIXO", elemento: "PB" },
    ]);
  });

  it("no modo corrigido ativo, o mesmo erro com o texto do corrigido", () => {
    const e = erros(obraTransicao(), "corrigido").find((x) => x.id === "P-b");
    expect(e?.v2Faz).toMatch(/^Modo ativo: corrigido\. A V2 não continua o pilar de baixo/);
    expect(e?.linhas[0]?.corrigido).toBe("10,25 t");
  });

  it("sem a concentrada na viga não há dupla contagem: o erro não aparece", () => {
    expect(erros(obraTransicao({ f: 0 })).map((x) => x.id)).not.toContain("P-b");
  });

  it("concentrada que não cobre a carga (0,5 t de 10 t): só a conferir, sem linha na tabela", () => {
    const e = erros(obraTransicao({ f: 0.5 })).find((x) => x.id === "P-b");
    expect(e?.linhas).toEqual([]);
    expect(e?.impacto).toMatch(
      /^A conferir: PB \(CIMA, 0,50 t na viga V1 contra 10,00 t de carga\)/,
    );
  });
});

describe("R5: reações cortadas no .REP (E2E, caso b do oráculo)", () => {
  const { original } = dois(obraE2E("original"));
  const e = erros(obraE2E("original")).find((x) => x.id === "R5")!;

  it("a parcela da V2 no P5 perde entre 0,005 e 0,01 t (impressa 6,94 na viga, 6,93 no .REP)", () => {
    const p5 = original.sistrut!.pavimentos[0]!.rep.find((l) => l.pilar === "P5")!;
    const v2 = p5.parcelas.find((q) => q.viga === "V2")!;
    expect(v2.valor).toBeCloseTo(6.93, 5);
    expect(v2.semCorte! - v2.valor).toBeGreaterThanOrEqual(0.005);
    expect(v2.semCorte! - v2.valor).toBeLessThan(0.01);
  });

  it("linha do P5: 17,37 t no .REP do original; sem o corte, mais, e até 0,01 t por parcela", () => {
    const l = e.linhas.find((x) => x.elemento === "P5")!;
    expect(l.original).toBe("17,370 t");
    expect(numero(l.semErro) - 17.37).toBeGreaterThan(0.005);
    expect(numero(l.semErro) - 17.37).toBeLessThan(0.02);
    expect(e.sentido).toBe("contra");
  });
});

describe("R2 e R3: lajes do oráculo", () => {
  it("R2 (v2par_laje_r2): a negativa L1 × L2 sai com a As da L2 (2,86); o corrigido usa a da L1 (4,70)", () => {
    const e = erros(doLaj("v2par_laje_r2", { otimizaNegativos: false })).find(
      (x) => x.id === "R2",
    )!;
    expect(e.linhas).toHaveLength(1);
    expect(e.linhas[0]!.elemento).toBe("L1 × L2");
    expect(numero(e.linhas[0]!.original)).toBeCloseTo(2.86, 2);
    // corrigido: materiais SI (fck exato, 500 MPa), a As da L1 com folga de 2 %
    expect(numero(e.linhas[0]!.corrigido)).toBeGreaterThan(4.7 * 0.98);
    expect(numero(e.linhas[0]!.corrigido)).toBeLessThan(4.7 * 1.02);
    expect(e.sentido).toBe("contra");
    expect(e.elementos.map((x) => x.elemento)).toEqual(["L1", "L2"]);
  });

  it("R3 (otim com piso 0,35): a otimização trava na L1, lado 3, código 5; no corrigido termina", () => {
    const obra = doLaj("v2par_laje_otim", { parametrosLaje: { relacaoNegPosMin: 0.35 } });
    const e = erros(obra).find((x) => x.id === "R3")!;
    expect(e.linhas).toEqual([
      expect.objectContaining({
        elemento: "L1",
        original: expect.stringMatching(/^trava no lado 3 \(relação .*, código 5\)$/),
        corrigido: "termina",
      }),
    ]);
  });
});

describe("D-ψ e R1 no E2E", () => {
  it("D-ψ: só os lados em que o Asw impresso muda; o SISTRUT sempre com Asw maior", () => {
    const e = erros(obraE2E("original")).find((x) => x.id === "D-ψ")!;
    expect(e.linhas.length).toBeGreaterThan(0);
    for (const l of e.linhas) {
      const a = numero(l.original.split(": ")[1]!);
      const b = numero(l.semErro);
      expect(a).toBeGreaterThan(b);
    }
    expect(e.sentido).toBe("a favor");
  });

  it("R1: lajes 4 × 5 m de 6 cm passam do limite de flecha (400/300 = 1,33 cm) no corrigido; o original não verifica", () => {
    const fina = obraE2E("original");
    fina.pavimentos = fina.pavimentos.map((p) => ({
      ...p,
      lajes: p.lajes.map((l) => ({ ...l, h: 6 })),
    }));
    const { original, corrigido } = dois(fina);
    const acima = corrigido.pavimentos
      .flatMap((p) => p.lajes)
      .filter((l) => l.esforcos.flecha > l.esforcos.flechaLimite && l.esforcos.flechaLimite > 0)
      .map((l) => l.laje.nome);
    expect(acima.length).toBeGreaterThan(0);
    expect(original.pavimentos[0]!.lajes.every((l) => l.esforcos.flecha === 0)).toBe(true);
    const e = errosDoOriginal(original, corrigido, "original").find((x) => x.id === "R1")!;
    expect(e.linhas.map((l) => l.elemento)).toEqual(acima);
    expect(e.linhas.every((l) => l.original === "não verificada")).toBe(true);
    // a flecha só existe no corrigido e fica na coluna dele; com 7 cm ela atende, e é a
    // espessura mínima do corrigido
    expect(e.linhas[0]!.semErro).toBe("—");
    expect(e.linhas[0]!.corrigido).toMatch(
      / > limite 1,33 cm; espessura mínima 7 cm \(a obra tem 6 cm\)$/,
    );
    expect(e.sentido).toBe("contra");
  });

  it("sem lajes acima do limite, o R1 não aparece", () => {
    expect(erros(obraE2E("original")).map((x) => x.id)).not.toContain("R1");
  });
});

describe("D-3: caso de pilar com Nk nulo", () => {
  it("o caso sem resultado do original vira linha, com o pilar e o pavimento", () => {
    const { original, corrigido } = dois(obraE2E("original"));
    const lance = original.sistrut!.lances.find((l) => l.dimensionamento?.casos.length)!;
    // o motor marca o caso com Nk = 0 (pilares/elu.ts); aqui o resultado já marcado
    const sistrut = original.sistrut!;
    const marcado: ResultadoObra = {
      ...original,
      sistrut: {
        ...sistrut,
        lances: sistrut.lances.map((x) =>
          x === lance
            ? {
                ...x,
                dimensionamento: {
                  ...x.dimensionamento!,
                  casos: x.dimensionamento!.casos.map((c, i) =>
                    i === 0 ? { ...c, erro: "nk-nulo" as const } : c,
                  ),
                },
              }
            : x,
        ),
      },
    };
    const e = errosDoOriginal(marcado, corrigido, "original").find((x) => x.id === "D-3")!;
    const nome = original.pilares.find((p) => p.pilar.id === lance.pilarId)!.pilar.nome;
    expect(e.linhas).toEqual([
      expect.objectContaining({
        elemento: nome,
        original: `caso ${lance.dimensionamento!.casos[0]!.rotulo}: sem resultado`,
      }),
    ]);
    expect(e.v2Faz).toMatch(/o maior entre \|Nk\| e 1 t/);
    // o mesmo caso no corrigido sai calculado (no E2E, Nk > 0)
    expect(e.linhas[0]!.corrigido).toMatch(/^calculado: /);
  });
});

it("NBR 6118 (sem o caminho do SISTRUT): nenhum erro do original", () => {
  const r = calcularObra({ ...obraE2E("original"), norma: "nbr6118-2023" }, nbr6118);
  expect(r.sistrut).toBeUndefined();
  expect(errosDoOriginal(r, r, "original")).toEqual([]);
});

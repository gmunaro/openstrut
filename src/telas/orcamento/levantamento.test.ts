import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calcularQuantitativos } from "../../calculo/quantitativos";
import type { Obra } from "../../dominio/obra";
import { lerObra } from "../../armazenamento/arquivo";
import { calcular } from "../calculo";
import { detalharObra } from "../detalhamento";
import { orcar } from "../../dominio/orcamento";
import { levantamentoDaObra, levantamentoNoModo, PAVIMENTO_FUNDACAO } from "./levantamento";
import { orcamentoDe } from "./estado";
import { TABELA_SINAPI } from "./sinapi";

const obraDe = (arquivo: string): Obra => {
  const l = lerObra(readFileSync(resolve(process.cwd(), arquivo), "utf8"));
  if (!l.ok) throw new Error(l.erros.join("; "));
  return l.obra;
};
const corrigido = obraDe("e2e/fixtures/ui-resultados/obra-corrigido.openstrut.json");

/** A mesma planta em dois pavimentos: "Tipo" × 2 sobre o original. */
const multi = (o: Obra): Obra => {
  const p = o.pavimentos[0]!;
  return {
    ...o,
    pavimentos: [{ ...p, id: `${p.id}-tipo`, nome: "Tipo", repeticoes: 2 }, p],
  };
};

const CASOS: [string, Obra][] = [
  ["NB-1/78 corrigido", corrigido],
  ["NB-1/78 original", obraDe("e2e/fixtures/ui-resultados/obra-original.openstrut.json")],
  ["NB-1/78 corrigido, 2 pavimentos com repetição", multi(corrigido)],
  [
    "NB-1/78 original, 2 pavimentos com repetição",
    multi({ ...corrigido, modoCalculo: "original" }),
  ],
  ["NBR 6118", { ...corrigido, norma: "nbr6118-2023" }],
  ["NBR 6118, 2 pavimentos com repetição", multi({ ...corrigido, norma: "nbr6118-2023" })],
];

describe("levantamentoDaObra", () => {
  it.each(CASOS)(
    "%s: concreto e fôrma somam os quantitativos; aço soma a tabela de aço",
    (_, obra) => {
      const c = calcular(obra);
      if (c.tipo !== "ok") throw new Error(c.tipo);
      const det = detalharObra(c.resultado, obra);
      const lev = levantamentoDaObra(obra, c.resultado, det);
      const quant = calcularQuantitativos(obra, c.resultado);
      const TIPOS = { laje: "lajes", viga: "vigas", pilar: "pilares" } as const;
      for (const p of quant.pavimentos)
        for (const [t, k] of Object.entries(TIPOS)) {
          const els = lev.elementos.filter((e) => e.pavimento === p.nome && e.tipo === t);
          expect(els.reduce((a, e) => a + e.concreto, 0)).toBeCloseTo(p[k].concreto, 9);
          expect(els.reduce((a, e) => a + e.forma, 0)).toBeCloseTo(p[k].forma, 9);
        }
      const aco = lev.elementos.reduce((a, e) => a + e.aco.reduce((s, m) => s + m.massa, 0), 0);
      expect(aco).toBeGreaterThan(0);
      expect(aco).toBeCloseTo(det.tabelaObra.massa, 6);
      // por bitola também
      for (const linha of det.tabelaObra.linhas) {
        const m = lev.elementos
          .flatMap((e) => e.aco)
          .filter((x) => x.phi === linha.phi && x.aco === (linha.aco ?? obra.materiais.aco))
          .reduce((a, x) => a + x.massa, 0);
        expect(m).toBeCloseTo(linha.massa, 6);
      }
      // área construída: Σ lx·ly das lajes × repetições
      const area = obra.pavimentos.reduce(
        (a, p) => a + p.repeticoes * p.lajes.reduce((s, l) => s + l.lx * l.ly, 0),
        0,
      );
      expect(lev.pavimentos.reduce((a, p) => a + p.area * p.repeticoes, 0)).toBeCloseTo(area, 9);
    },
  );

  it("NB-1/78: carga na fundação das colunas que nascem na fundação; NBR 6118: sem fundação", () => {
    const c = calcular(corrigido);
    if (c.tipo !== "ok") throw new Error(c.tipo);
    const lev = levantamentoDaObra(corrigido, c.resultado, detalharObra(c.resultado, corrigido));
    const fund = lev.elementos.filter((e) => e.tipo === "fundacao");
    // um pavimento: toda coluna nasce na fundação
    expect(fund).toHaveLength(c.resultado.sistrut!.fundacoes.length);
    expect(lev.cargaFundacao).toBeCloseTo(
      c.resultado.sistrut!.fundacoes.reduce((a, f) => a + f.fundacao, 0),
      9,
    );
    expect(lev.pavimentos.at(-1)?.nome).toBe(PAVIMENTO_FUNDACAO);
    // a fundação leva o nome do pilar da obra, não o da coluna interna ("P 1")
    const pilares = new Set(corrigido.pavimentos.flatMap((p) => p.pilares.map((x) => x.nome)));
    for (const e of fund) expect(pilares.has(e.nome), e.nome).toBe(true);
    const nbr = levantamentoNoModo({ ...corrigido, norma: "nbr6118-2023" }, "corrigido");
    expect(nbr?.cargaFundacao).toBeNull();
    expect(nbr?.elementos.some((e) => e.tipo === "fundacao")).toBe(false);
  });

  it("pavimentos de mesmo nome (e um chamado Fundação) ficam separados no orçamento", () => {
    const p = corrigido.pavimentos[0]!;
    const obra: Obra = {
      ...corrigido,
      pavimentos: [
        { ...p, id: `${p.id}-a`, nome: PAVIMENTO_FUNDACAO, repeticoes: 2 },
        { ...p, id: `${p.id}-b`, nome: PAVIMENTO_FUNDACAO },
      ],
    };
    const c = calcular(obra);
    if (c.tipo !== "ok") throw new Error(c.tipo);
    const lev = levantamentoDaObra(obra, c.resultado, detalharObra(c.resultado, obra));
    const quant = calcularQuantitativos(obra, c.resultado);
    const { orc } = orcamentoDe(lev, [TABELA_SINAPI], {});
    // dois pavimentos, cada um com o seu custo (a fundação, sem composição, não tem
    // custo; o grupo dela tem id próprio e não se mistura com o pavimento "Fundação")
    expect(orc.porPavimento.map((g) => g.rotulo)).toEqual([PAVIMENTO_FUNDACAO, PAVIMENTO_FUNDACAO]);
    expect(new Set(lev.pavimentos.map((p) => p.id)).size).toBe(3);
    // Σ dos grupos = custo direto; o pavimento repetido 2 vezes custa mais que o outro (lajes
    // e vigas em dobro; o aço dos pilares muda de nível para nível)
    expect(orc.porPavimento.reduce((a, g) => a + g.custo, 0)).toBeCloseTo(orc.custoDireto, 6);
    const [a, b] = orc.porPavimento;
    expect(a!.custo).toBeGreaterThan(1.5 * b!.custo);
    // concreto do levantamento por pavimento = quantitativos
    for (const [i, q] of quant.pavimentos.entries()) {
      const id = obra.pavimentos[i]!.id;
      const els = lev.elementos.filter((e) => e.pavimentoId === id);
      expect(els.reduce((s, e) => s + e.concreto, 0)).toBeCloseTo(q.total.concreto, 9);
    }
    // um nível de fôrma por repetição: 3 níveis com a mesma área, 4 usos → 1 jogo de um nível
    const so = orcar(lev, TABELA_SINAPI, {
      ...orcamentoDe(lev, [TABELA_SINAPI], {}).cfg,
      usosForma: 4,
    });
    const laje = lev.elementos.filter((e) => e.tipo === "laje").reduce((s, e) => s + e.forma, 0);
    expect(so.formaFabricada.laje).toBeCloseTo(laje / 3, 9);
  });

  it("repetições inválidas: pavimento fora, com aviso", () => {
    const obra: Obra = {
      ...corrigido,
      pavimentos: corrigido.pavimentos.map((p) => ({ ...p, repeticoes: 2.5 })),
    };
    const c = calcular(obra);
    if (c.tipo !== "ok") throw new Error(c.tipo);
    const lev = levantamentoDaObra(obra, c.resultado, null);
    expect(lev.elementos.filter((e) => e.tipo !== "fundacao")).toEqual([]);
    expect(lev.avisos[0]).toContain("repetições inválidas (2.5)");
  });
});

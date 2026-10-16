/// <reference types="node" />
// De ponta a ponta: a obra que o próprio SISTRUT original gravou (o .LAJ de cada run do
// oráculo, versionado em `calculo/sistrut/__oraculo__/__laj__/`) é importada por
// `importarLaj` e passa por `calcularObraSistrut` no modo original; os números de laje
// (LAJECALC, LAJEPROC), da montagem (LAJEMONT: reações e totais) e, no
// v2par_laje_cargas, do VIGA e do .REP saem iguais aos impressos (meia unidade da
// última casa, ou FIX onde o original trunca). Casos: caso_a_laje e os v2par_laje_*
// (índice em C:/wt/v1-v2par/tests/retraducao/V2PAR.md; os JSONs de
// C:/tmp/v2-paridade/oraculo-novos ficam ao lado dos .LAJ). E as variantes do E2E com a
// entrada editada no original (retrad_laje_calc2: direção 90°, μ informado,
// continuidade eliminada e um trecho engastado sem vizinha; retrad_laje_param: γf 1,5,
// eficiência 90 %, fck 0,2, aço A) e o que o importador representa ou avisa, sobre o
// E2E.LAJ com linhas trocadas.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASOS_ORACULO, type CasoOraculo } from "../../calculo/sistrut/__oraculo__/index";
import { confereCaso } from "../../calculo/sistrut/__oraculo__/confere";
import assim from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_assim.json";
import balanco from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_balanco.json";
import cargas from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_cargas.json";
import livre from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_livre.json";
import otim from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_otim.json";
import r2 from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_r2.json";
import r3 from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_r3.json";
import umadir from "../../calculo/sistrut/__oraculo__/__laj__/v2par_laje_umadir.json";
import t1Assim from "../../calculo/sistrut/lajes/__casos_t1__/v2par_laje_assim.json";
import t1Balanco from "../../calculo/sistrut/lajes/__casos_t1__/v2par_laje_balanco.json";
import { calcularObraSistrut } from "../../calculo/sistrut/obra";
import type { Obra } from "../../dominio/obra";
import vigaFluxo from "../../calculo/sistrut/lajes/__casos_t2__/v2par_viga_fluxo.json";
import { KN_POR_TF } from "../../calculo/sistrut/base/unidades";
import { lerObraLaj } from "../../calculo/sistrut/montagem/obraLaj";
import { importarLaj, type OpcoesImportacaoLaj } from "./laje";

/** O .LAJ que o original gravou no run do caso (cópia versionada). */
const laj = (caso: string) =>
  readFileSync(
    new URL(`../../calculo/sistrut/__oraculo__/__laj__/${caso}.LAJ`, import.meta.url),
    "latin1",
  );

/** Ids que o motor não produz: os da tela (parâmetros de fábrica antes da edição,
 *  unidades) e a coluna L/f, que o original imprime sempre 0 porque não calcula flecha
 *  (R1). */
const IGNORA = [/^param\.(.+\.padrao|unidade.+|coef.+|multiplicador.+)$/, /vigente$/, /L\/f$/];
/** O μ é conferido à parte, calculado pelas cordas (abaixo). */
const MU = /\.mu$/;

/** Pesos do E2E: 12 × 40 nas vigas de 4 m (0,12 t/m) e 12 × 50 nas de 5 m. */
const VIGAS_E2E: NonNullable<OpcoesImportacaoLaj["vigas"]> = {
  V1: { h: 40 },
  V2: { h: 40 },
  V3: { h: 40 },
};

interface Caso {
  caso: CasoOraculo;
  opcoes?: OpcoesImportacaoLaj;
  /** Caso cujo run gravou o .LAJ, quando o próprio run não gravou (o r3 trava antes). */
  obraDe?: string;
}

const CASOS: Caso[] = [
  { caso: CASOS_ORACULO.caso_a_laje!, opcoes: { vigas: VIGAS_E2E } },
  { caso: livre },
  { caso: balanco },
  { caso: umadir },
  { caso: assim },
  { caso: otim },
  // roteiro sem a opção 6 do LAJECALC
  { caso: r2, opcoes: { otimizaNegativos: false } },
  // a obra do otim com o piso Mneg/Mpos 0,35 (LAJECALC 7, item 6): a otimização trava
  {
    caso: r3,
    opcoes: { parametrosLaje: { relacaoNegPosMin: 0.35 } },
    obraDe: "v2par_laje_otim",
  },
  { caso: cargas },
];

/** μ que a T1 corrigiu: o JSON da T10 o leu pela linha da laje, e o .LAJ o grava pelo
 *  polígono (A_1210(A_10cc(i,0))). Vale o de `lajes/__casos_t1__`. */
const CORRIGIDOS_T1: Pick<CasoOraculo, "caso" | "valores">[] = [t1Assim, t1Balanco];
function comCorrecoesDaT1(caso: CasoOraculo): CasoOraculo {
  const t1 = CORRIGIDOS_T1.find((c) => c.caso === caso.caso);
  const corrigidos = new Map(
    (t1?.valores ?? []).filter((v) => v.obs?.startsWith("corrigido pela T1")).map((v) => [v.id, v]),
  );
  return { ...caso, valores: caso.valores.map((v) => corrigidos.get(v.id) ?? v) };
}

function importa(texto: string, opcoes?: OpcoesImportacaoLaj) {
  const imp = importarLaj(texto, opcoes);
  if (!imp.ok) throw new Error(imp.erros.join("\n"));
  return imp;
}

/** A obra com o μ das maciças não informado: o LAJECALC 2 o calcula pelas cordas, como
 *  nos roteiros ("direção padrão"). */
const muPelasCordas = (o: Obra): Obra => ({
  ...o,
  pavimentos: o.pavimentos.map((p) => ({
    ...p,
    lajes: p.lajes.map((l) => ({ ...l, mu: 1 })),
  })),
});

describe.each(CASOS.map((c) => [c.caso.caso, c] as const))(
  "%s: .LAJ do original importado",
  (_, { caso, opcoes, obraDe }) => {
    const imp = importa(laj(obraDe ?? caso.caso), opcoes);
    const r = calcularObraSistrut(imp.obra, { modo: "original" });
    const esperado = comCorrecoesDaT1(caso);

    it("importa sem avisos; o polígono de cada laje é o do .LAJ", () => {
      expect(imp.avisos).toEqual([]);
      for (const l of imp.obra.pavimentos[0]!.lajes) expect(l.poligono?.length).toBeGreaterThan(2);
    });

    it("todos os números impressos (lajes, montagem, reações; VIGA e .REP no cargas)", () => {
      const { faltando, difere, conferidos } = confereCaso(esperado, r, [...IGNORA, MU]);
      expect(faltando, "ids sem cálculo no motor").toEqual([]);
      expect(difere).toEqual([]);
      const ignorados = esperado.valores.filter((v) =>
        [...IGNORA, MU].some((re) => re.test(v.id)),
      ).length;
      expect(conferidos).toBe(esperado.valores.length - ignorados);
    });

    it("μ pelas cordas (o importado vira não informado): o μ corrigido pela T1 e os mesmos números", () => {
      const rc = calcularObraSistrut(muPelasCordas(imp.obra), { modo: "original" });
      const { faltando, difere, conferidos } = confereCaso(esperado, rc, IGNORA);
      expect(faltando).toEqual([]);
      expect(difere).toEqual([]);
      expect(conferidos).toBeGreaterThan(0);
    });

    if (caso.caso === "v2par_laje_r3") {
      it("a otimização não converge no original (R3): a tela parada, uma vez, e a referência na memória", () => {
        const p = r.pavimentos[0]!;
        expect(p.avisos.some((a) => a.includes("Otimização"))).toBe(false);
        expect(p.memoria.find((m) => m.ref?.includes("R3"))?.descricao).toMatch(
          /^Otimização dos negativos parada: L1, lado 3: a relação Mneg\/Mpos passa a 0,35,/,
        );
        expect(p.otimizacaoParada).toMatchObject({ laje: "L1", lado: 2, codigo: 5 });
        expect(p.esforcos).toBe(p.esforcosAntesOtimizacao);
      });
      it("no corrigido a otimização converge: sem tela parada e o código da L1 cai", () => {
        const rc = calcularObraSistrut(
          { ...imp.obra, modoCalculo: "corrigido" },
          { modo: "corrigido" },
        );
        const p = rc.pavimentos[0]!;
        expect(p.otimizacaoParada).toBeUndefined();
        expect(p.esforcos).not.toBe(p.esforcosAntesOtimizacao);
        const l1 = (e: typeof p.esforcos) => e.lajes.find((l) => l.nome === "L1")!.codigos[2]!;
        expect(l1(p.esforcosAntesOtimizacao)).toBe(22);
        expect(l1(p.esforcos)).toBeLessThan(22);
      });
    } else
      it("sem avisos no motor", () => {
        const p = r.pavimentos[0]!;
        expect(r.avisos).toEqual([]);
        expect(p.avisos).toEqual([]);
        expect(p.montagem.avisos).toEqual([]);
        expect(p.otimizacaoParada).toBeUndefined();
      });

    it("modo corrigido roda o mesmo caminho sem avisos", () => {
      const rc = calcularObraSistrut(
        { ...imp.obra, modoCalculo: "corrigido" },
        { modo: "corrigido" },
      );
      expect(rc.avisos).toEqual([]);
      expect(rc.pavimentos[0]!.avisos).toEqual([]);
    });
  },
);

describe("v2par_laje_umadir: total do painel (1 ulp)", () => {
  // As 5 parcelas somadas em SINGLE dão 27,675001 (imprime 27,68) com as regiões na ordem
  // do polígono gravado; o mesmo painel com os retângulos da V2 (do canto inferior
  // esquerdo) soma as cargas por região em outra ordem: 6,75 em vez de 6,7500005, e o
  // total cai no meio exato entre dois SINGLE e arredonda para 27,674999 (imprime 27,67).
  const imp = importa(laj("v2par_laje_umadir"));
  const total = (o: Obra) =>
    calcularObraSistrut(o, { modo: "original" }).pavimentos[0]!.montagem.totais;
  it("pelo polígono do .LAJ: cargas 6,7500005 e painel 27,675001", () => {
    const t = total(imp.obra);
    expect(t.cargasPorArea).toBe(Math.fround(6.7500005));
    expect(t.painel).toBe(Math.fround(27.675001));
  });
  it("com os retângulos da V2 o painel perde 1 ulp (a ordem dos vértices importa)", () => {
    const p = imp.obra.pavimentos[0]!;
    const retangulos = p.lajes.map(({ poligono: _p, vinculosLados: _v, ...l }) => l);
    // sem a lista do A_11e0, que se refere aos lados do polígono gravado
    const { continuidadesLajes: _c, ...semLista } = p;
    const t = total({ ...imp.obra, pavimentos: [{ ...semLista, lajes: retangulos }] });
    expect(t.cargasPorArea).toBe(6.75);
    expect(t.painel).toBe(Math.fround(27.674999));
  });
});

/** O E2E importado com a entrada editada no original, laje a laje. */
const e2e = (f: (o: Obra) => Obra) => f(importa(laj("caso_a_laje"), { vigas: VIGAS_E2E }).obra);

describe("variantes do E2E editadas no original", () => {
  it("retrad_laje_calc2: direção 90° na L1, μ 1,5 na L2, continuidade eliminada e o lado x = 0 da L1 engastado sem vizinha", () => {
    const obra = e2e((o) => {
      const p = o.pavimentos[0]!;
      const lajes = p.lajes.map((l) => ({
        ...l,
        // nova direção: o μ volta a sair das cordas (o gravado era o de 0°)
        ...(l.nome === "L1" ? { anguloArmadura: 90, mu: 1 } : {}),
        ...(l.nome === "L2" ? { mu: 1.5 } : {}),
      }));
      // E + T elimina toda a continuidade; I + S engasta o primeiro trecho da L1, sem vizinha
      const continuidadesLajes = [{ lajeA: "L1", ladoA: 0 }];
      return { ...o, otimizaNegativos: false, pavimentos: [{ ...p, lajes, continuidadesLajes }] };
    });
    const r = calcularObraSistrut(obra, { modo: "original" });
    const caso = CASOS_ORACULO.retrad_laje_calc2!;
    const { faltando, difere, conferidos } = confereCaso(caso, r, IGNORA);
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBe(78);
    expect(r.pavimentos[0]!.painel.continuidades).toEqual([
      { lajeA: "L1", bordoA: 0, lajeB: null, bordoB: 0 },
    ]);
  });

  it("retrad_laje_param: γf 1,5 e eficiência 90 % do .LAP, fck 0,2 e aço A dos materiais", () => {
    const obra = e2e((o) => ({
      ...o,
      otimizaNegativos: false,
      materiais: { ...o.materiais, fck: 20, classeAco: "A" },
      parametrosLaje: { gamaF: 1.5, eficienciaNegativa: 0.9 },
    }));
    const r = calcularObraSistrut(obra, { modo: "original" });
    const caso = CASOS_ORACULO.retrad_laje_param!;
    const { faltando, difere, conferidos } = confereCaso(caso, r, IGNORA);
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBe(85);
    // γ do .LAP só nas lajes; vigas e pilares seguem com os de fábrica
    expect(r.parametros.laje.gamaF).toBe(Math.fround(1.5));
    expect(r.materiais.gamaF).toBe(Math.fround(1.4));
  });
});

/** O E2E.LAJ com linhas trocadas (`troca`, 1-based), intervalos apagados e linhas
 *  inseridas depois da linha dada. Linhas do E2E.LAJ: 141 código do lado 3 da L1; 158
 *  grupo da L2; 174 tipo e 178 coluna 5 da L4 (A_10cc); 183 nº de pilares e 185-229 os
 *  pilares (x1, y1, x2, y2, nome); 265-291 as continuidades (266 = quantas; linha 1 =
 *  272-276, L1 lado 3 × L2 lado 2, e 276 a armadura); 297-298 ângulo e μ do polígono 2
 *  (a L4) e 302 μ do polígono 4 (a L1); 316 positiva principal da L1 (A_12fc(1,2)). */
function e2eLaj(
  troca: Record<number, string>,
  apaga: [number, number][] = [],
  insere: [number, string[]][] = [],
) {
  const linhas = laj("caso_a_laje").split(/\r?\n/);
  for (const [k, v] of Object.entries(troca)) linhas[Number(k) - 1] = ` ${v} `;
  for (const [a, b] of [...apaga].sort((x, y) => y[0] - x[0])) linhas.splice(a - 1, b - a + 1);
  for (const [a, vs] of [...insere].sort((x, y) => y[0] - x[0]))
    linhas.splice(a, 0, ...vs.map((v) => ` ${v} `));
  return linhas.join("\r\n");
}
const importaE2e = (texto: string, opcoes: OpcoesImportacaoLaj = {}) => {
  const imp = importa(texto, { vigas: VIGAS_E2E, ...opcoes });
  const p = calcularObraSistrut(imp.obra, { modo: "original" }).pavimentos[0]!;
  const laje = (nome: string) => imp.obra.pavimentos[0]!.lajes.find((l) => l.nome === nome)!;
  return { imp, p, laje };
};

describe("importarLaj: o que o .LAJ tem e a obra representa", () => {
  it("pré-moldada: a coluna 5 é a inclinação das nervuras e o peso já está na permanente", () => {
    // L4 pré-moldada com nervuras a 90°; o LAJECALC 2 grava −1 no ângulo do polígono
    const { imp, p, laje } = importaE2e(e2eLaj({ 174: "1", 178: "90", 297: "-1", 298: "0" }));
    expect(laje("L4")).toMatchObject({ tipo: "pre-moldada", anguloArmadura: 90, mu: 1 });
    // o .LAJ editado tem engaste na L4, que o original não daria: avisado e ignorado
    expect(imp.avisos).toContain("L4 lado 2: código 22 em laje não maciça; ignorado.");
    // nervuras em y: (0,15 + 0,10)·5/2 = 0,375 + 0,25 t/m nas vigas y = 0 e y = 5, sem peso próprio
    const r = p.montagem.reacoes.filter((x) => x.laje === "L4");
    expect(r.map((x) => (x.apoio.tipo === "viga" ? x.apoio.viga : ""))).toEqual(["V3", "V2"]);
    for (const x of r) {
      expect(x.cargaArea).toBeCloseTo(0.375, 6);
      expect(x.estrutura).toBeCloseTo(0.25, 6);
      expect(x.peso).toBe(0);
    }
  });

  it("comum não calculada sem <R>elação: ângulo −1 e μ 0; o original para em 1/√μ", () => {
    const { laje, p } = importaE2e(e2eLaj({ 174: "3", 297: "-1", 298: "0" }));
    expect(laje("L4")).toMatchObject({ tipo: "comum-nao-calculada", mu: 1 });
    expect(laje("L4").anguloArmadura).toBeUndefined();
    expect(p.painel.lajes[3]).toMatchObject({ angulo: -1, mu: 0 });
    expect(p.esforcos.momentos.L4).toBeUndefined();
    expect(p.esforcos.avisos.join()).toContain(
      "divisão por zero em 1/√μ: a laje está sem a relação μ (μ = 0)",
    );
  });

  it("comum não calculada com μ 0,8 por <R>: fatores de direção a −1° e M+ secundário = 0,8·M+ (momentos.ts:63)", () => {
    const { laje, p } = importaE2e(e2eLaj({ 174: "3", 297: "-1", 298: ".8" }));
    expect(laje("L4").mu).toBeCloseTo(0.8, 7);
    const m = p.esforcos.momentos.L4!;
    const [c, s] = [Math.cos(Math.PI / 180), Math.sin(Math.PI / 180)];
    // lado horizontal girado de −1°: |dy|/L = sen 1°, |dx|/L = cos 1° → 0,8·cos 1° + sen 1°
    expect(m.bordos[0]!.fatorDirecao).toBeCloseTo(0.8 * c + s, 6);
    // lado vertical: 0,8·sen 1° + cos 1°
    expect(m.bordos[1]!.fatorDirecao).toBeCloseTo(0.8 * s + c, 6);
    expect(m.mPositivoSecundarioTcm).toBe(Math.fround(m.mPositivoPrincipalTcm * Math.fround(0.8)));
    // sem continuidade (o original não a liga ao tipo 3): M− 0
    expect(m.mNegativoMaiorTcm).toBe(0);
  });

  it("pilar-parede (x2, y2 ≠ x1, y1): pilar no centro com o comprimento e o trecho na montagem", () => {
    const { imp, p } = importaE2e(e2eLaj({ 187: "2" }));
    const pav = imp.obra.pavimentos[0]!;
    expect(pav.trechosPilares).toEqual([
      { pilar: "P1", inicio: { x: 0, y: 0 }, fim: { x: 2, y: 0 } },
    ]);
    expect(pav.pilares[0]).toMatchObject({ x: 1, y: 0, b: 200, h: 20 });
    // o bordo y = 0 da L3 contém o pilar-parede: vai ao pilar, como no original (L_29708)
    const r = p.montagem.reacoes.find((x) => x.laje === "L3" && x.bordo === 3)!;
    expect(r.apoio).toEqual({ tipo: "pilar", pilar: "P1" });
    // apoios das vigas: os pontos do eixo sobre o trecho (pilarDoPonto, LAJEMONT.BAS:
    // 4831-4920): a V3 (y = 0) e a V4 (x = 0) no ponto (0; 0); nenhum nó no centro (1; 0)
    const nos = (v: string) => {
      const g = p.geometriaVigas.find((x) => x.viga.nome === v)!;
      return g.nos.map((s, k) => [s, g.apoios[k]!.tipo === "livre" ? "livre" : g.apoios[k]!.nome]);
    };
    expect(nos("V3")).toEqual([
      [0, "P1"],
      [4, "P2"],
      [8, "P3"],
    ]);
    expect(nos("V4")).toEqual([
      [0, "P1"],
      [5, "P6"],
      [10, "P7"],
    ]);
    expect(imp.avisos).toEqual([]);
  });

  it("i digitado por lado no <A>ltera do LAJECALC 1 (sem a otimização): código 17 = i 1,5 só no lado da L1", () => {
    const { laje, p, imp } = importaE2e(e2eLaj({ 141: "17" }), { otimizaNegativos: false });
    expect(imp.avisos).toEqual([]);
    expect(laje("L1").coeficientesLados).toEqual([null, null, 1.5, null]);
    expect(p.esforcos.lajes[0]!.codigos).toEqual([0, 0, 17, 22]);
    expect(p.esforcos.lajes[1]!.codigos).toEqual([22, 22, 0, 0]);
    // M− do lado 3 (vertical, fator 1) = 1,5·M+; o do lado 4 (horizontal, fator μ 0,8) = 2·0,8·M+
    const m = p.esforcos.momentos.L1!;
    expect(m.mNegativoMenorTcm).toBe(Math.fround(m.mPositivoPrincipalTcm * 1.5));
    expect(m.mNegativoMaiorTcm).toBe(Math.fround(m.mPositivoPrincipalTcm * Math.fround(1.6)));
    // com a otimização, o 17 é dela e a V2 o refaz a partir do 22
    expect(importaE2e(e2eLaj({ 141: "17" })).laje("L1").coeficientesLados).toBeUndefined();
  });

  it('dois trechos engastados sem vizinha no lado comum L1 × L2 (<I> sem "continua com")', () => {
    // a linha 1 do A_11e0 vira L1 lado 3 sem vizinha (−1) e entra L2 lado 2 sem vizinha
    const texto = e2eLaj(
      { 266: "5", 274: "-1", 275: "0" },
      [],
      [[291, ["2", "2", "-1", "0", "0"]]],
    );
    const { imp, p } = importaE2e(texto);
    expect(imp.obra.pavimentos[0]!.continuidadesLajes).toEqual([
      { lajeA: "L1", ladoA: 2 },
      { lajeA: "L1", ladoA: 3, lajeB: "L3", ladoB: 1 },
      { lajeA: "L2", ladoA: 0, lajeB: "L4", ladoB: 2 },
      { lajeA: "L3", ladoA: 2, lajeB: "L4", ladoB: 1 },
      { lajeA: "L2", ladoA: 1 },
    ]);
    // cinco continuidades e cinco negativas no LAJEPROC (a automática daria quatro)
    expect(p.painel.continuidades).toHaveLength(5);
    expect(p.painel.continuidades.filter((c) => c.lajeB === null)).toEqual([
      { lajeA: "L1", bordoA: 2, lajeB: null, bordoB: 2 },
      { lajeA: "L2", bordoA: 1, lajeB: null, bordoB: 1 },
    ]);
    expect(p.lajeproc.negativas).toHaveLength(5);
  });

  it("μ = 1 digitado numa laje cujas cordas dão 0,8: μ informado, M+ secundário = M+", () => {
    const { laje, p, imp } = importaE2e(e2eLaj({ 302: "1" }));
    expect(imp.avisos).toEqual([]);
    expect(laje("L1")).toMatchObject({ mu: 1, muInformado: true });
    expect(p.painel.lajes[0]!.mu).toBe(1);
    const m = p.esforcos.momentos.L1!;
    expect(m.mPositivoSecundarioTcm).toBe(m.mPositivoPrincipalTcm);
  });

  it('"Vx apoia em Vy" do LAJEMONT (v2par_viga_fluxo): a V5 sobre as pontas da V2 e da V1, os 259 valores', () => {
    const peso = { pesoProprio: 0.15 * KN_POR_TF };
    const imp = importa(laj("v2par_viga_fluxo"), {
      secaoVigas: { bw: 12, h: 40 },
      vigas: { V1: peso, V2: peso, V3: peso, V4: peso, V5: peso },
      apoiosEmViga: { V5: ["V2", "V1"] },
    });
    expect(imp.avisos).toEqual([]);
    expect(imp.obra.pavimentos[0]!.vigas.find((v) => v.nome === "V5")!.apoiaEm).toEqual([
      "V2",
      "V1",
    ]);
    const r = calcularObraSistrut(imp.obra, { modo: "original" });
    expect(r.pavimentos[0]!.eixos.find((e) => e.nome === "V5")!.apoios).toEqual([
      { viga: "V2" },
      { viga: "V1" },
    ]);
    const { faltando, difere, conferidos } = confereCaso(vigaFluxo, r, IGNORA);
    expect(faltando).toEqual([]);
    expect(difere).toEqual([]);
    expect(conferidos).toBe(259);
  });

  it("positiva imposta no LAJEPROC (A_12fc negativo): fica se basta", () => {
    // −3002: bitola de índice 3 (8 mm), espaçamento de índice 2 (10 cm)
    const { laje, p } = importaE2e(e2eLaj({ 316: "-3002" }));
    expect(laje("L1").armaduraImposta).toEqual({ principal: { bitola: 8, espacamento: 10 } });
    // φ8 c/10 = 5,0 cm²/m ≥ As 1,50 necessária: o LAJEPROC a mantém
    const b = p.lajeproc.positivas.L1!.principal.barra;
    expect(b.ok && [b.bitola, b.espacamento]).toEqual([8, 10]);
  });

  it("negativa imposta no LAJECALC (A_11e0 positivo): vai à continuidade; o código negativo do LAJEPROC não é entrada", () => {
    // 1000·índice da bitola + espaçamento: 3010 = φ8 c/10
    const { laje, p } = importaE2e(e2eLaj({ 276: "3010" }));
    expect(laje("L1").negativasImpostas).toEqual([
      null,
      null,
      { bitola: 8, espacamento: 10 },
      null,
    ]);
    expect(p.painel.continuidades[0]).toMatchObject({
      lajeA: "L1",
      lajeB: "L2",
      armaduraImposta: 3010,
    });
    const pelaProc = importaE2e(e2eLaj({ 276: "-2001" }));
    expect(pelaProc.laje("L1").negativasImpostas).toBeUndefined();
  });

  it("sem a seção de continuidades: a automática do original só liga lajes do mesmo grupo", () => {
    // L2 no grupo 1 (A_10cc(·,3)): os lados comuns com a L1 e a L4 (grupo 0) não ligam
    const { laje, p, imp } = importaE2e(e2eLaj({ 265: "0", 158: "1" }, [[266, 291]]));
    expect(laje("L2").grupo).toBe(1);
    expect(laje("L1").grupo).toBeUndefined();
    expect(imp.obra.pavimentos[0]!.continuidadesLajes).toBeUndefined();
    expect(p.painel.lajes[1]!.grupo).toBe(1);
    expect(p.painel.continuidades).toEqual([
      { lajeA: "L1", bordoA: 3, lajeB: "L3", bordoB: 1 },
      { lajeA: "L3", bordoA: 2, lajeB: "L4", bordoB: 1 },
    ]);
  });

  it("grupo negativo: a laje rebaixada −10 do v2par2_laje_tipos (TIP.LAJ:227) importa e não liga", () => {
    // LAJEGEOM grava −(Hmáx − H) (LAJEGEOM.BAS:3755); o LAJECALC só compara igualdade
    const imp = importarLaj(laj("v2par2_laje_tipos"));
    if (!imp.ok) throw new Error(imp.erros.join("\n"));
    const lajes = imp.obra.pavimentos[0]!.lajes;
    expect(lajes.find((l) => l.nome === "L5")!.grupo).toBe(-10);
    expect(lajes.filter((l) => l.grupo !== undefined).map((l) => l.nome)).toEqual(["L5"]);
    // a mesma laje sem continuidade gravada: a automática não a liga às de grupo 0
    const { p } = importaE2e(e2eLaj({ 265: "0", 158: "-10" }, [[266, 291]]));
    expect(p.painel.lajes[1]!.grupo).toBe(-10);
    expect(p.painel.continuidades.some((c) => c.lajeA === "L2" || c.lajeB === "L2")).toBe(false);
  });
});

describe("importarLaj: o que a obra não representa vira aviso", () => {
  const avisos = (texto: string, opcoes?: OpcoesImportacaoLaj) =>
    importaE2e(texto, opcoes).imp.avisos;
  it("tipo de laje desconhecido", () => {
    expect(avisos(e2eLaj({ 174: "5" }))).toEqual([
      "L4: tipo de laje 5 desconhecido; lido como maciça.",
    ]);
  });
  it('cruzamento sem pilar sem a escolha "apoia em" nas opções', () => {
    // sem o P5 em (4; 5)
    const texto = e2eLaj({ 183: "8" }, [[205, 209]]);
    expect(avisos(texto)).toEqual([
      'Cruzamento sem pilar em (4; 5) entre V2 e V5: a escolha "apoia em" do LAJEMONT não fica no .LAJ; vale a regra da V2 (a viga que termina se apoia na que passa). Confira na planta qual viga apoia em qual.',
    ]);
    expect(avisos(texto, { apoiosEmViga: { V5: ["V2"] } })).toEqual([]);
  });
  it("arquivo sem o cabeçalho do SISTRUT", () => {
    expect(importarLaj("{}")).toEqual({
      ok: false,
      erros: [
        "O arquivo não é um .LAJ do SISTRUT: a primeira linha deveria ser o cabeçalho do SISTRUT.",
      ],
    });
  });
});

describe("importarLaj: .LAJ no formato de entrada (cabeçalho entre aspas)", () => {
  // o E2E.LAJ do roteiro e2e_10_forma: "SISTRUT40","LAJ",1,"E2E", 4 lajes 4 × 5 h 10,
  // g 0,1 e q 0,15 t/m², bordos AAEE/EAAE/AEEA/EEAA, com o bloco RES
  const texto = laj("e2e_10_forma_entrada");

  it("lê as lajes, gera vigas e pilares e avisa o formato", () => {
    const imp = importarLaj(texto, {}, "E2E.LAJ");
    if (!imp.ok) throw new Error(imp.erros.join("\n"));
    const pav = imp.obra.pavimentos[0]!;
    expect(imp.obra.nome).toBe("E2E");
    expect(pav.lajes.map((l) => [l.nome, l.x, l.y, l.lx, l.ly, l.h])).toEqual([
      ["L1", 0, 0, 4, 5, 10],
      ["L2", 4, 0, 4, 5, 10],
      ["L3", 0, 5, 4, 5, 10],
      ["L4", 4, 5, 4, 5, 10],
    ]);
    // 0,1 e 0,15 t/m² × 9,80665 kN/tf
    expect(pav.lajes[0]!.revestimento).toBeCloseTo(0.980665, 9);
    expect(pav.lajes[0]!.sobrecarga).toBeCloseTo(1.4709975, 9);
    // 3 × 3 cruzamentos de eixos: 9 pilares; 3 vigas em x e 3 em y
    expect(pav.pilares).toHaveLength(9);
    expect(pav.vigas).toHaveLength(6);
    expect(imp.avisos[0]).toMatch(/^E2E\.LAJ está no formato de entrada/);
  });

  it("as opções do .LAJ de saída não valem e o leitor da montagem recusa o formato", () => {
    const imp = importarLaj(texto, { peDireito: 2.8 }, "E2E.LAJ");
    expect(imp.ok && imp.avisos[1]).toBe(
      "As opções de importação do .LAJ gravado pelo LAJEGRAV não valem neste formato.",
    );
    expect(() => lerObraLaj(texto)).toThrow(/formato de entrada/);
  });
});

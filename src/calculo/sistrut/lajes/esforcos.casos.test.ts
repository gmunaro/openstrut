// Casos v2par do oráculo (T10) no estágio da T1: M+, M−, μ, continuidade, q e peso
// próprio, áreas das regiões. Fixtures em __casos_t1__/ (obra lida do .LAJ final do
// run e os valores do JSON da T10; ver o campo "obs" de cada valor).
import { describe, expect, it } from "vitest";
import { type ValorOraculo, bateComImpresso } from "../__oraculo__";
import { ErroNaoConverge, atribuicao, qbCint } from "../base/f32";
import { PARAMETROS_LAJE, emSingle } from "../base/parametros";
import type { LajeSistrut, ModoSistrut, MomentosDeLaje, PainelLajes } from "../base/tipos";
import assim from "./__casos_t1__/v2par_laje_assim.json";
import balanco from "./__casos_t1__/v2par_laje_balanco.json";
import cargas from "./__casos_t1__/v2par_laje_cargas.json";
import livre from "./__casos_t1__/v2par_laje_livre.json";
import otim from "./__casos_t1__/v2par_laje_otim.json";
import r2 from "./__casos_t1__/v2par_laje_r2.json";
import r3 from "./__casos_t1__/v2par_laje_r3.json";
import umadir from "./__casos_t1__/v2par_laje_umadir.json";
import { lajeMontagem, PadraoMontagem } from "../montagem/charneiras";
import { regiaoDoBordo } from "../montagem/regioes";
import { esforcosDoPainel, esforcosDoPainelCom } from "./esforcos";
import { momentosComCoeficiente } from "./momentos";

interface CasoT1 {
  caso: string;
  parametros: { relacaoNegPosMin?: number };
  lajes: {
    nome: string;
    vertices: number[][];
    indices: number[];
    grupo: number;
    codigosFinais: number[];
    cargaPermanente: number;
    pesoProprio: number;
    h: number;
  }[];
  cargasPorArea: { total: number; acidental: number; vertices: number[][] }[];
  alvenarias: { inicio: number[]; fim: number[]; carga: number }[];
  continuidadesFinais: { lajeA: string; bordoA: number; lajeB: string; bordoB: number }[];
  valores: ValorOraculo[];
}

const CASOS: CasoT1[] = [livre, balanco, umadir, assim, otim, r2, r3, cargas];

/** Lados cujo código final saiu da otimização dos negativos (T2), não da continuidade:
 *  o JSON traz o código depois da otimização (descrição de cada caso). */
const MUDADOS_PELA_OTIMIZACAO = new Set([
  "v2par_laje_otim:L1.lado3.codigo", // 22 → 5 (piso 0,30)
  "v2par_laje_assim:L3.lado3.codigo", // 22 → 16
  "v2par_laje_assim:L4.lado1.codigo", // 22 → 15
  "v2par_laje_cargas:L1.lado3.codigo", // 22 → 17
]);

/** Casos sem otimização impressa: os ids sem sufixo são os momentos antes dela
 *  (r2 não roda a otimização; no r3 ela não termina). */
const SEM_OTIMIZACAO = new Set(["v2par_laje_r2", "v2par_laje_r3"]);

/** Lajes em que o modo corrigido (float64) não reproduz o original por fronteira de
 *  SINGLE, sem defeito envolvido: a faixa 1,8 × 6 tem razão das cordas 1,8/6, que em
 *  SINGLE é 0,29999999 < 0,30000001 (linha 0,30 da tabela) e dá μ 0,5 no original; em
 *  float64 é 0,3, não é menor, e o μ fica 0,4 (LAJECALC.BAS:4958-4969). */
const FRONTEIRA_SINGLE = new Set(["v2par_laje_otim:L2", "v2par_laje_r3:L2"]);
const confereNoModo = (c: CasoT1, modo: ModoSistrut, laje: string) =>
  modo === "original" || !FRONTEIRA_SINGLE.has(`${c.caso}:${laje}`);

const ponto = (p: number[], num: (x: number) => number) => ({
  x: num(p[0] ?? NaN),
  y: num(p[1] ?? NaN),
});

function painel(c: CasoT1, modo: ModoSistrut, finais: boolean): PainelLajes {
  const num = modo === "original" ? Math.fround : (x: number) => x;
  const lajes: LajeSistrut[] = c.lajes.map((l) => ({
    nome: l.nome,
    tipo: 0,
    vertices: l.vertices.map((p) => ponto(p, num)),
    indicesVertices: l.indices,
    grupo: l.grupo,
    // antes da opção 1 só o livre (código 1) importa: a continuidade refaz o resto
    codigos: finais ? [...l.codigosFinais] : l.codigosFinais.map((k) => (k === 1 ? 1 : 0)),
    angulo: 0,
    mu: 0,
    cargaPermanente: num(l.cargaPermanente),
    pesoProprio: num(l.pesoProprio),
    h: l.h,
  }));
  return {
    lajes,
    cargasPorArea: c.cargasPorArea.map((q) => ({
      total: num(q.total),
      acidental: num(q.acidental),
      vertices: q.vertices.map((p) => ponto(p, num)),
    })),
    alvenarias: c.alvenarias.map((a) => ({
      inicio: ponto(a.inicio, num),
      fim: ponto(a.fim, num),
      carga: num(a.carga),
    })),
    continuidades: finais ? c.continuidadesFinais : [],
  };
}

const parametros = (c: CasoT1, modo: ModoSistrut) => {
  const p = { ...PARAMETROS_LAJE, ...c.parametros };
  return modo === "original" ? emSingle(p) : p;
};

function confere(c: CasoT1, id: string, calculado: number) {
  const v = c.valores.find((x) => x.id === id);
  if (!v) return 0;
  expect(
    bateComImpresso(v, calculado),
    `${c.caso} ${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
  return 1;
}

/** Os quatro momentos como a opção 5 imprime (t·m/m): M+ = max(M+, 0) e M− = M+·c
 *  com o sinal de M+ (no balanço sai negativo; LAJECALC.BAS:124ac). */
function confereMomentos(c: CasoT1, nome: string, m: MomentosDeLaje, sufixo: string) {
  const sinal = m.mPositivoPrincipalTcm < 0 ? -1 : 1;
  return (
    confere(c, `${nome}.M+princ${sufixo}`, Math.max(m.mPositivoPrincipalTcm, 0) / 100) +
    confere(c, `${nome}.M+sec${sufixo}`, m.mPositivoSecundarioTcm / 100) +
    confere(c, `${nome}.M-maior${sufixo}`, (sinal * m.mNegativoMaiorTcm) / 100) +
    confere(c, `${nome}.M-menor${sufixo}`, (sinal * m.mNegativoMenorTcm) / 100)
  );
}

describe.each(CASOS.map((c) => [c.caso, c] as const))("%s", (_, c) => {
  describe.each<ModoSistrut>(["original", "corrigido"])("modo %s", (modo) => {
    const p = parametros(c, modo);
    const antes = esforcosDoPainel(painel(c, modo, false), p, modo);

    it("sem avisos", () => {
      expect(antes.avisos).toEqual([]);
    });

    it("momentos antes da otimização", () => {
      const sufixo = SEM_OTIMIZACAO.has(c.caso) ? "" : ".antesOtim";
      let n = 0;
      const lajes = c.lajes.filter((l) => confereNoModo(c, modo, l.nome));
      for (const l of lajes) {
        const m = antes.momentos[l.nome];
        if (!m) throw new Error(`${l.nome} sem momentos`);
        n += confereMomentos(c, l.nome, m, sufixo);
      }
      expect(n).toBe(4 * lajes.length);
    });

    it.skipIf(SEM_OTIMIZACAO.has(c.caso))(
      "momentos depois da otimização, com os códigos gravados",
      () => {
        const depois = esforcosDoPainel(painel(c, modo, true), p, modo);
        let n = 0;
        const lajes = c.lajes.filter((l) => confereNoModo(c, modo, l.nome));
        for (const l of lajes) {
          const m = depois.momentos[l.nome];
          if (!m) throw new Error(`${l.nome} sem momentos`);
          n += confereMomentos(c, l.nome, m, "");
        }
        expect(n).toBe(4 * lajes.length);
      },
    );

    it("μ pelas cordas (opção 2)", () => {
      for (const l of antes.lajes)
        if (confereNoModo(c, modo, l.nome)) confere(c, `${l.nome}.mu`, l.mu);
    });

    it("códigos da continuidade automática (opção 1)", () => {
      for (const l of antes.lajes) {
        l.codigos.forEach((k, i) => {
          const id = `${l.nome}.lado${i + 1}.codigo`;
          const v = c.valores.find((x) => x.id === id);
          if (!v) return;
          if (MUDADOS_PELA_OTIMIZACAO.has(`${c.caso}:${id}`)) {
            // a continuidade dá 22; a otimização (T2) reduziu
            expect(k).toBe(22);
            expect(Number(v.impresso)).toBeLessThan(22);
          } else {
            expect(k, id).toBe(Number(v.impresso));
          }
        });
      }
    });

    it("carga total, peso próprio e coluna 'Acid.' com H gravado e com H mínimo", () => {
      for (const l of antes.lajes) {
        const m = antes.momentos[l.nome];
        const pr = antes.preparadas[l.nome];
        const coef = antes.coeficientes[l.nome];
        if (!m || !pr || !coef) throw new Error(`${l.nome} não calculada`);
        confere(c, `${l.nome}.H`, m.h);
        confere(c, `${l.nome}.p`, m.q);
        confere(c, `${l.nome}.pp`, m.pesoProprio);
        confere(c, `${l.nome}.acid`, (pr.alvenaria + pr.cargaArea) / pr.area);
        const hmin = c.valores.find((x) => x.id === `${l.nome}.Hmin`);
        if (!hmin) continue;
        const mh = momentosComCoeficiente(
          l,
          pr.alvenaria,
          pr.cargaArea,
          pr.area,
          Number(hmin.impresso),
          coef,
          p,
          modo,
        );
        confere(c, `${l.nome}.Hmin.pp`, mh.pesoProprio);
        confere(c, `${l.nome}.Hmin.p`, mh.q);
      }
    });

    it.skipIf(c.caso === "v2par_laje_r3")(
      "áreas das regiões, como o LAJEMONT (coordenadas reais, códigos finais)",
      () => {
        for (const l of painel(c, modo, true).lajes) {
          const ids = c.valores.filter(
            (x) => x.id.startsWith(`${l.nome}>`) && x.id.endsWith(".area"),
          );
          // o LAJEMONT imprime na ordem dos bordos e omite área ≤ 0,005 (LAJEMONT.BAS:2713);
          // o padrão é o do porte da montagem (i sem truncar), não o do LAJECALC
          const t = {
            s: atribuicao(modo),
            modo,
            tol: p.toleranciaComprimento,
            eps: p.toleranciaAngulo,
          };
          const lm = lajeMontagem(l.vertices, l.codigos, l.tipo);
          const padrao = new PadraoMontagem(lm, t);
          padrao.executa();
          const regioes = l.codigos
            .flatMap((cod, k) => (cod === 1 ? [] : [regiaoDoBordo(lm, padrao, k + 1, t)]))
            .filter((r) => r.area > 0.005);
          expect(regioes.length, l.nome).toBe(ids.length);
          regioes.forEach((r, i) => {
            const v = ids[i];
            if (v)
              expect(bateComImpresso(v, r.area), `${v.id}: ${v.impresso} × ${r.area}`).toBe(true);
          });
        }
      },
    );
  });
});

describe("v2par_laje_r3: otimização que não converge (piso 0,35)", () => {
  const c = r3 as CasoT1;
  const p = parametros(c, "original");

  it("o laço do original (mesmo bordo refeito com o código 5) vira ErroNaoConverge", () => {
    const vistos: number[] = [];
    const roda = esforcosDoPainelCom((esforcos, recalcula) => {
      // LAJECALC.BAS:2176-2195: coef = max(INT(100·c·M2/M1)/100; 0,35) = 0,35 em SINGLE,
      // gravado como CINT(0,35·10 + 2) = 5 (0,30); o lado continua > 10 % maior e é refeito
      const l1 = esforcos.lajes.find((l) => l.nome === "L1");
      if (!l1) throw new Error("sem L1");
      const piso = Math.fround(0.35);
      const codigos = [...l1.codigos];
      codigos[2] = qbCint(piso * 10 + 2); // em precisão estendida: 5,4999999 → 5
      for (;;) {
        const m = recalcula({ ...l1, codigos });
        vistos.push(m.mNegativoMaiorTcm);
      }
    });
    expect(() => roda(painel(c, "original", false), p, "original")).toThrow(ErroNaoConverge);
    expect(vistos.length).toBeGreaterThan(1);
    // tela do laço: "M" da L1 com Mneg/Mpos 0,30 (telas c10_trava) e o da L2, sem mudança
    expect(confere(c, "L1.otim.M", (vistos[0] ?? NaN) / 100)).toBe(1);
    const sem = esforcosDoPainel(painel(c, "original", false), p, "original");
    expect(confere(c, "L2.otim.M", (sem.momentos.L2?.mNegativoMaiorTcm ?? NaN) / 100)).toBe(1);
  });
});

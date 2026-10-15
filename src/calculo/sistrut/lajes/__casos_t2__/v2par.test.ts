// Rodada 2 da T2: espessura mínima, armaduras antes e depois da otimização, códigos
// gravados pela otimização e LAJEPROC, contra os valores impressos pelo original nos
// casos v2par de laje (C:/tmp/oraculo/runs/v2par_<caso>-*). Entrada: o estado gravado
// no .LAJ e a conta à mão do coeficiente de carga (casos.ts).
import { describe, expect, it } from "vitest";
import { bateComImpresso, type CasoOraculo } from "../../__oraculo__";
import { sng } from "../../base/f32";
import { emSingle, PARAMETROS_LAJE } from "../../base/parametros";
import type { BarraDeLaje, MateriaisSistrut } from "../../base/tipos";
import { armadurasLaje, relacoesNegativas } from "../armaduras";
import { espessuraMinimaLaje } from "../espessura";
import { NaoConvergeOtimizacao, otimizaNegativos } from "../otimizacao";
import { lajeproc } from "../proc";
import {
  CASOS_T2,
  type CasoT2,
  cargaTotal,
  coeficienteUmEngaste,
  esforcos,
  momentosComH,
} from "./casos";

const PARAM = emSingle(PARAMETROS_LAJE);
const MAT: MateriaisSistrut = {
  fck: sng(0.15),
  fyk: sng(5),
  classeAco: "B",
  gamaF: sng(1.4),
  gamaC: sng(1.4),
  gamaS: sng(1.15),
};

const valor = (o: CasoOraculo, id: string) => o.valores.find((v) => v.id === id);
const tem = (o: CasoOraculo, id: string) => valor(o, id) !== undefined;
function confere(o: CasoOraculo, id: string, calculado: number) {
  const v = valor(o, id);
  if (v === undefined) throw new Error(`${o.caso}: sem ${id}`);
  expect(
    bateComImpresso(v, calculado),
    `${o.caso} ${id}: impresso ${v.impresso}, calculado ${calculado}`,
  ).toBe(true);
}
/** "#6.3c/15" do LAJEPROC (STR$ da bitola e do espaçamento). */
function confereBarraTexto(o: CasoOraculo, id: string, barra: BarraDeLaje) {
  const v = valor(o, id)!;
  const m = /^#([\d.]+)c\/([\d.]+)$/.exec(v.impresso.replace(/\s/g, ""));
  expect(m, `${o.caso} ${id}: "${v.impresso}"`).not.toBeNull();
  expect(barra.ok, `${o.caso} ${id}: sem barra, impresso ${v.impresso}`).toBe(true);
  if (!m || !barra.ok) return;
  expect(barra.bitola, `${o.caso} ${id}`).toBeCloseTo(Number(m[1]), 5);
  expect(barra.espacamento, `${o.caso} ${id}`).toBe(Number(m[2]));
}
const sufixoAntes = (o: CasoOraculo, l: string) =>
  tem(o, `${l}.As+princ.antesOtim`) ? ".antesOtim" : "";

// r3 não grava obra (o original trava); ele entra só no bloco próprio.
const COMUNS = [
  "livre",
  "balanco",
  "umadir",
  "assim",
  "otim",
  "r2",
  "cargas",
  "vigaFluxo",
] as const;

describe("fixtures: conta à mão do coeficiente contra o .LAJ", () => {
  const confereCoef = (c: CasoT2, nome: string, tolerancia: number) => {
    const laje = c.obra.lajes.find((l) => l.nome === nome)!;
    const calculado =
      (100 * cargaTotal(c, laje, laje.h)) / coeficienteUmEngaste(laje, laje.codigosFinais);
    expect(Math.abs(calculado / laje.mPositivoFinalTcm - 1), `${c.obra.caso} ${nome}`).toBeLessThan(
      tolerancia,
    );
  };
  it("um engaste com i 2,0, 1,3 e 1,5: 7 algarismos", () => {
    confereCoef(CASOS_T2.r2, "L2", 1e-6); // 4 × 5, μ 0,8, i 2,0: 32,49876
    confereCoef(CASOS_T2.vigaFluxo, "L1", 1e-6);
    confereCoef(CASOS_T2.otim, "L2", 1e-6); // 1,8 × 6, μ 0,5: 9,386644
    confereCoef(CASOS_T2.assim, "L4", 1e-6); // 5 × 4, μ 1,1, i 1,3: 34,92157
    confereCoef(CASOS_T2.cargas, "L1", 1e-6); // 4 × 5, μ 0,8, i 1,5, q 0,80: 56,13602
  });
  it("assim L3 (i 1,4) e otim L1 (i 0,3): 0,06 % e 0,04 % (padrão de charneiras da T1; o teste usa o .LAJ)", () => {
    confereCoef(CASOS_T2.assim, "L3", 1e-3);
    confereCoef(CASOS_T2.otim, "L1", 1e-3);
  });
});

describe.each(COMUNS)("%s", (chave) => {
  const c = CASOS_T2[chave];
  const o = c.oraculo;
  const nomes = c.obra.lajes.map((l) => l.nome);

  it("espessura mínima (opção 3): H, x/d, barra, pp e p", () => {
    for (const nome of nomes) {
      const r = espessuraMinimaLaje(momentosComH(c, nome), MAT, PARAM, "original");
      expect(r.ok, `${o.caso} ${nome}`).toBe(true);
      if (!r.ok) continue;
      confere(o, `${nome}.Hmin`, r.h);
      confere(o, `${nome}.Hmin.x/d`, r.xd);
      expect(r.barra.ok).toBe(true);
      if (r.barra.ok) {
        confere(o, `${nome}.Hmin.As.phi`, r.barra.bitola);
        confere(o, `${nome}.Hmin.As.s`, r.barra.espacamento);
      }
      confere(o, `${nome}.Hmin.pp`, r.pesoProprio);
      confere(o, `${nome}.Hmin.p`, r.q);
    }
  });

  it("imposição de H e ARMADURAS NAS LAJES antes da otimização", () => {
    const { esforcos: e } = esforcos(c, "antes");
    for (const nome of nomes) {
      const a = armadurasLaje(e.momentos[nome]!, MAT, PARAM, "original");
      confere(o, `${nome}.x/d`, a.xd);
      expect(a.barra.ok).toBe(true);
      if (a.barra.ok) {
        confere(o, `${nome}.As.phi`, a.barra.bitola);
        confere(o, `${nome}.As.s`, a.barra.espacamento);
      }
      const s = sufixoAntes(o, nome);
      confere(o, `${nome}.As+princ${s}`, a.asPositivaPrincipal);
      confere(o, `${nome}.As+sec${s}`, a.asPositivaSecundaria);
      confere(o, `${nome}.As-maior${s}`, a.asNegativaMaior);
      confere(o, `${nome}.As-menor${s}`, a.asNegativaMenor);
    }
  });

  it.runIf(tem(o, "L1.As+princ.antesOtim"))(
    "otimização: códigos gravados e armaduras depois",
    () => {
      const { esforcos: e, recalcula } = esforcos(c, "antes");
      const r = otimizaNegativos(e, recalcula, MAT, PARAM, "original");
      for (const laje of r.lajes) {
        laje.codigos.forEach((codigo, k) => {
          const id = `${laje.nome}.lado${k + 1}.codigo`;
          if (tem(o, id)) confere(o, id, codigo);
        });
        // M impressos depois (LAJECALC.BAS:678-681): M+ > 0 e |M+|·c_max/c_min.
        const m = r.momentos[laje.nome]!;
        const { maior, menor } = relacoesNegativas(m.bordos, "original");
        confere(o, `${laje.nome}.M+princ`, Math.max(m.mPositivoPrincipalTcm, 0) / 100);
        confere(o, `${laje.nome}.M-maior`, sng(m.mPositivoPrincipalTcm * maior) / 100);
        confere(o, `${laje.nome}.M-menor`, sng(m.mPositivoPrincipalTcm * menor) / 100);
        const a = armadurasLaje(m, MAT, PARAM, "original");
        confere(o, `${laje.nome}.As+princ`, a.asPositivaPrincipal);
        confere(o, `${laje.nome}.As+sec`, a.asPositivaSecundaria);
        confere(o, `${laje.nome}.As-maior`, a.asNegativaMaior);
        confere(o, `${laje.nome}.As-menor`, a.asNegativaMenor);
      }
    },
  );

  it("LAJEPROC: positivas e uma negativa por continuidade", () => {
    const { esforcos: e } = esforcos(c, "depois");
    const r = lajeproc(e, MAT, PARAM, "original");
    for (const nome of nomes) {
      confereBarraTexto(o, `${nome}.proc.posPrinc`, r.positivas[nome]!.principal.barra);
      confereBarraTexto(o, `${nome}.proc.posSec`, r.positivas[nome]!.secundaria.barra);
    }
    for (const n of r.negativas) {
      confereBarraTexto(o, `${n.continuidade.lajeA}-${n.continuidade.lajeB}.proc.neg`, n.barra);
    }
  });
});

describe("r2: negativa com o mesmo número de lado nas duas lajes", () => {
  const c = CASOS_T2.r2;
  const { esforcos: e } = esforcos(c, "depois");
  it("original: # 6.3 c/10 (3,15), da L2 (As− 2,86), que não atende a L1 (4,70)", () => {
    const r = lajeproc(e, MAT, PARAM, "original");
    const n = r.negativas[0]!;
    confere(c.oraculo, "L2.As-maior", n.as);
    confereBarraTexto(c.oraculo, "L1-L2.proc.neg", n.barra);
    expect(r.avisos.join(" ")).toContain("R2");
  });
  it("corrigido (R2): o maior As dos dois lados, 4,70 da L1 → # 8.0 c/10", () => {
    const n = lajeproc(e, MAT, PARAM, "corrigido").negativas[0]!;
    confere(c.oraculo, "L1.As-maior", n.as);
    expect(n.barra).toMatchObject({ ok: true, bitola: 8, espacamento: 10 });
  });
});

describe("r3: piso Mneg/Mpos 0,35 (LAJECALC 7, item 6)", () => {
  const c = CASOS_T2.r3;
  const o = c.oraculo;
  const parametros = { ...PARAM, relacaoNegPosMin: sng(0.35) };
  it("antes da otimização: H mínimo, imposição e armaduras (a obra do otim)", () => {
    const { esforcos: e } = esforcos(c, "antes");
    for (const nome of ["L1", "L2"]) {
      const r = espessuraMinimaLaje(momentosComH(c, nome), MAT, parametros, "original");
      if (r.ok) {
        confere(o, `${nome}.Hmin`, r.h);
        confere(o, `${nome}.Hmin.x/d`, r.xd);
      }
      const a = armadurasLaje(e.momentos[nome]!, MAT, parametros, "original");
      confere(o, `${nome}.x/d`, a.xd);
      confere(o, `${nome}.As+princ`, a.asPositivaPrincipal);
      confere(o, `${nome}.As+sec`, a.asPositivaSecundaria);
      confere(o, `${nome}.As-maior`, a.asNegativaMaior);
    }
  });
  it("original: erro explícito de não convergência com o estado da tela parada", () => {
    const { esforcos: e, recalcula } = esforcos(c, "antes");
    let erro: unknown;
    try {
      otimizaNegativos(e, recalcula, MAT, parametros, "original");
    } catch (x) {
      erro = x;
    }
    expect(erro).toBeInstanceOf(NaoConvergeOtimizacao);
    if (!(erro instanceof NaoConvergeOtimizacao)) return;
    const { estado } = erro;
    expect(estado).toMatchObject({ laje: "L1", codigo: 5 });
    confere(o, "L1.otim.alteradaPara", estado.relacaoNova);
    const [l1, l2] = estado.lados;
    for (const [nome, lado] of [
      ["L1", l1!],
      ["L2", l2!],
    ] as const) {
      confere(o, `${nome}.otim.M`, lado.mTcm / 100);
      confere(o, `${nome}.otim.As`, lado.as);
      confere(o, `${nome}.otim.MnegMpos`, lado.relacao);
    }
  });
  it("corrigido (R3): relação com 2 casas, código 5,5, para no piso", () => {
    const { esforcos: e, recalcula } = esforcos(c, "antes");
    // Corrigido: parâmetros e materiais decimais (sem SINGLE).
    const decimais = { ...PARAMETROS_LAJE, relacaoNegPosMin: 0.35 };
    const materiais: MateriaisSistrut = {
      fck: 0.15,
      fyk: 5,
      classeAco: "B",
      gamaF: 1.4,
      gamaC: 1.4,
      gamaS: 1.15,
    };
    const r = otimizaNegativos(e, recalcula, materiais, decimais, "corrigido");
    expect(r.lajes[0]!.codigos[2]).toBeCloseTo(5.5, 10);
    expect(r.avisos).toEqual([]);
  });
  it("com o piso de fábrica 0,30 converge (v2par_laje_otim: código 5)", () => {
    const { esforcos: e, recalcula } = esforcos(CASOS_T2.otim, "antes");
    const r = otimizaNegativos(e, recalcula, MAT, PARAM, "original");
    expect(r.lajes[0]!.codigos[2]).toBe(5);
  });
});

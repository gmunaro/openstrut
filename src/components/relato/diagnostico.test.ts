import { describe, expect, test } from "vitest";
import { obraNova } from "../../dominio/criar";
import type { Obra } from "../../dominio/obra";
import {
  arquivoDoBuild,
  montarDiagnostico,
  resumoObra,
  type AmbienteDiagnostico,
} from "./diagnostico";

const ambiente: AmbienteDiagnostico = {
  commit: "dd703d2",
  arquivoBuild: "index-AbC123.js",
  rota: "/openstrut/obra",
  obra: null,
  janela: { largura: 360, altura: 800, dpr: 3 },
  tela: { largura: 360, altura: 800 },
  instalado: true,
  online: false,
  idioma: "pt-BR",
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  erros: [{ quando: "2026-10-16T12:00:00.000Z", origem: "promessa", texto: "TypeError: x" }],
  agora: new Date("2026-10-16T12:34:56.000Z"),
};

const valor = (itens: { rotulo: string; valor: string }[], rotulo: string) =>
  itens.find((i) => i.rotulo === rotulo)?.valor;

/** Obra com 2 pavimentos: 3 lajes, 4 vigas e 5 pilares no total (contados à mão). */
function obraContada(): Obra {
  const base = obraNova("Sobrado Silva", "nb1-78");
  const pav = base.pavimentos[0];
  if (!pav) throw new Error("sem pavimento");
  const laje = (id: string) => ({ id }) as unknown as (typeof pav.lajes)[number];
  const viga = (id: string) => ({ id }) as unknown as (typeof pav.vigas)[number];
  const pilar = (id: string) => ({ id }) as unknown as (typeof pav.pilares)[number];
  return {
    ...base,
    modoCalculo: "original",
    pavimentos: [
      {
        ...pav,
        id: "p1",
        lajes: [laje("L1"), laje("L2")],
        vigas: [viga("V1")],
        pilares: [pilar("P1"), pilar("P2")],
      },
      {
        ...pav,
        id: "p2",
        lajes: [laje("L3")],
        vigas: [viga("V2"), viga("V3"), viga("V4")],
        pilares: [pilar("P3"), pilar("P4"), pilar("P5")],
      },
    ],
  };
}

describe("resumo da obra", () => {
  test("soma lajes, vigas e pilares de todos os pavimentos", () => {
    expect(resumoObra(obraContada())).toEqual({
      nome: "Sobrado Silva",
      pavimentos: 2,
      lajes: 3,
      vigas: 4,
      pilares: 5,
    });
  });
});

describe("diagnóstico", () => {
  test("sem obra aberta", () => {
    const d = montarDiagnostico(ambiente);
    expect(valor(d.itens, "Versão (commit)")).toBe("dd703d2");
    expect(valor(d.itens, "Arquivo do build")).toBe("index-AbC123.js");
    expect(valor(d.itens, "Rota")).toBe("/openstrut/obra");
    expect(valor(d.itens, "Obra")).toBe("nenhuma obra aberta");
    expect(valor(d.itens, "Norma")).toBeUndefined();
    expect(valor(d.itens, "Tela")).toBe("janela 360 × 800 px (densidade 3), tela 360 × 800 px");
    expect(valor(d.itens, "Instalado como app")).toBe("sim");
    expect(valor(d.itens, "Conexão")).toBe("offline");
    expect(valor(d.itens, "Navegador")).toBe("Mozilla/5.0 (Linux; Android 14)");
    expect(valor(d.itens, "Data")).toBe("2026-10-16T12:34:56.000Z");
    expect(d.erros).toEqual(["2026-10-16T12:00:00.000Z [promessa] TypeError: x"]);
  });

  test("com obra NB-1/78 no modo original", () => {
    const d = montarDiagnostico({ ...ambiente, obra: obraContada() });
    expect(valor(d.itens, "Norma")).toBe("NB-1/78");
    expect(valor(d.itens, "Modo de cálculo")).toBe("Como o SISTRUT original");
    expect(valor(d.itens, "Obra")).toBe(
      '"Sobrado Silva", 2 pavimentos, 3 lajes, 4 vigas, 5 pilares',
    );
  });

  test("na NBR 6118 o modo não se aplica, e o singular sai certo", () => {
    const obra = obraNova("Casa", "nbr6118-2023");
    const d = montarDiagnostico({ ...ambiente, obra });
    expect(valor(d.itens, "Norma")).toBe("NBR 6118:2023");
    expect(valor(d.itens, "Modo de cálculo")).toBe("não se aplica (NBR 6118)");
    expect(valor(d.itens, "Obra")).toBe('"Casa", 1 pavimento, 0 lajes, 0 vigas, 0 pilares');
  });

  test("sem commit no build, diz que não foi informado", () => {
    const d = montarDiagnostico({ ...ambiente, commit: undefined });
    expect(valor(d.itens, "Versão (commit)")).toBe("não informado no build");
  });

  test("arquivo do build é o nome do bundle", () => {
    expect(arquivoDoBuild("https://gmunaro.github.io/openstrut/assets/index-B2x9.js")).toBe(
      "index-B2x9.js",
    );
  });
});

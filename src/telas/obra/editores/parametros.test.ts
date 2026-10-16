// Formulário dos parâmetros da obra (NB-1/78): ida e volta, campo vazio = ausente, objeto
// vazio some, o editor não apaga o que não mostra e as mensagens nomeiam tabela e campo.
// Os valores esperados estão escritos à mão (as tabelas de fábrica estão em
// calculo/sistrut/base/parametros.ts).
import { describe, expect, it } from "vitest";
import { obraNova } from "../../../dominio/criar";
import type { Obra } from "../../../dominio/obra";
import { problemasNoArquivo } from "./formulario";
import {
  type FormParametros,
  formDosParametros,
  obraDosParametros,
  padroesDosParametros,
} from "./parametros";

function obraBase(extra: Partial<Obra> = {}): Obra {
  return {
    ...obraNova("Teste", "nb1-78"),
    materiais: {
      fck: 25,
      aco: "CA-50",
      acoEstribo: "CA-60",
      classeAco: "B",
      caa: 2,
      cobrimentoLaje: 1.5,
      cobrimentoViga: 2.5,
      cobrimentoPilar: 3,
    },
    ...extra,
  };
}

/** Aplica o formulário e falha se vierem problemas. */
function aplica(f: FormParametros, obra: Obra): Obra {
  const r = obraDosParametros(f, obra);
  if (Array.isArray(r)) throw new Error(r.join("\n"));
  return r;
}

describe("formulário dos parâmetros: sem edição", () => {
  it("obra sem parâmetros sai igual, sem nenhum campo novo", () => {
    const obra = obraBase();
    const r = aplica(formDosParametros(obra), obra);
    expect(r).toEqual(obra);
    for (const k of ["otimizaNegativos", "parametrosLaje", "parametrosViga", "parametrosPilar"])
      expect(Object.hasOwn(r, k)).toBe(false);
  });

  it("obra com tudo editado faz a ida e volta sem mudar nada e o arquivo a aceita", () => {
    const obra = obraBase({
      otimizaNegativos: false,
      parametrosLaje: {
        gamaF: 1.5,
        relacaoNegPosMin: 0.35,
        limitaEspacamento2H: false,
        espacamentos: [8, 10, 12],
        flecha: { lfTotal: 250, lfAcidental: 350, multiplicadorEc: 1, deformacaoLenta: false },
      },
      parametrosViga: {
        viga: { reacaoNoPilar: "maxima", porcentagemAcidentalGerada: 20, acidentais: true },
        dsp: {
          fck: 0.2,
          classeAco: "A",
          classeFissuracao: 2,
          comparaEspacamentoMaximo: "H/2",
          letraFerros: "P",
          verificaFissuracao: true,
          tabelaBitola1: [1, 2, 3, 4, 5],
          dobrasPorBitola: Array.from({ length: 10 }, (_, i) => [i, i, i, i, 1]),
        },
      },
      parametrosPilar: {
        predimensionamento: "tensoes",
        variaArmadura: 2,
        rlp: false,
        rigidezVigas: true,
        ini: { fck: 30, excentricidades: "simultaneas", verificaH30: false, maximoBarras: 60 },
        pip: {
          densidade: 24,
          ordemBitolaMinima: 4,
          coeficienteFlambagem: [
            [1, 1, 1, 2],
            [1, 1, 1, 2],
            [1, 1, 1, 2],
            [2, 2, 2, 50],
          ],
        },
      },
    });
    const r = aplica(formDosParametros(obra), obra);
    expect(r).toEqual(obra);
    expect(problemasNoArquivo(r)).toEqual([]);
  });
});

describe("formulário dos parâmetros: rodada", () => {
  it("grava as opções da rodada nos campos da obra e de parametrosPilar", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.otimizaNegativos = "nao";
    f.predimensionamento = "secao";
    f.variaArmadura = "1";
    f.rlp = "nao";
    f.rigidezVigas = "sim";
    const r = aplica(f, obra);
    expect(r.otimizaNegativos).toBe(false);
    expect(r.parametrosPilar).toEqual({
      predimensionamento: "secao",
      variaArmadura: 1,
      rlp: false,
      rigidezVigas: true,
    });
  });

  it("voltar tudo para o padrão tira os campos (objeto vazio some)", () => {
    const obra = obraBase({
      otimizaNegativos: true,
      parametrosPilar: { rlp: false },
      parametrosLaje: { gamaF: 1.5 },
      parametrosViga: { viga: { acidentais: true } },
    });
    const f = formDosParametros(obra);
    f.otimizaNegativos = "padrao";
    f.rlp = "padrao";
    f.laje.numeros.gamaF = "";
    f.viga.booleanos.acidentais = "padrao";
    const r = aplica(f, obra);
    for (const k of ["otimizaNegativos", "parametrosLaje", "parametrosViga", "parametrosPilar"])
      expect(Object.hasOwn(r, k)).toBe(false);
  });
});

describe("formulário dos parâmetros: tabelas", () => {
  it("lê vírgula decimal e grava só o campo preenchido do .LAP", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.laje.numeros.relacaoNegPosMin = "0,35";
    expect(aplica(f, obra).parametrosLaje).toEqual({ relacaoNegPosMin: 0.35 });
  });

  it("ligar uma tabela grava a de fábrica inteira, com a linha editada", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    expect(f.laje.bitolas.ligada).toBe(false);
    f.laje.bitolas.ligada = true;
    const b0 = f.laje.bitolas.linhas[0];
    if (!b0) throw new Error("sem linha 0");
    b0.area = "0,125";
    expect(aplica(f, obra).parametrosLaje?.bitolas).toEqual([
      { bitola: 4, area: 0.125 },
      { bitola: 5, area: 0.2 },
      { bitola: 6.3, area: 0.315 },
      { bitola: 8, area: 0.5 },
      { bitola: 10, area: 0.8 },
      { bitola: 12.5, area: 1.25 },
      { bitola: 16, area: 2 },
      { bitola: 20, area: 3.15 },
      { bitola: 22.2, area: 3.88 },
      { bitola: 25, area: 5 },
    ]);
  });

  it("lista simples e matriz voltam como números do domínio", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.dsp.espacamentosEstribo = { ligada: true, linhas: [{ valor: "12" }, { valor: "18,5" }] };
    f.pip.coeficienteFlambagem.ligada = true;
    const l3 = f.pip.coeficienteFlambagem.linhas[3];
    if (!l3) throw new Error("sem linha 3");
    l3.c3 = "10";
    const r = aplica(f, obra);
    expect(r.parametrosViga?.dsp?.espacamentosEstribo).toEqual([12, 18.5]);
    expect(r.parametrosPilar?.pip?.coeficienteFlambagem).toEqual([
      [0.5, 0.7, 0.7, 2],
      [0.7, 0.9, 0.85, 2],
      [0.7, 0.85, 1, 2],
      [2, 2, 2, 10],
    ]);
  });

  it("escolhas: classe de fissuração vira número; padrão fica ausente", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.dsp.classeFissuracao = "1";
    f.ini.classeAco = "A";
    const r = aplica(f, obra);
    expect(r.parametrosViga).toEqual({ dsp: { classeFissuracao: 1 } });
    expect(r.parametrosPilar).toEqual({ ini: { classeAco: "A" } });
  });
});

describe("formulário dos parâmetros: não apaga o que não mostra", () => {
  it("arranjos e grupo de corte do .DSP e o VIGA.INI passam intactos", () => {
    const arranjosPorIntervalo = [
      [{ area: 2, arranjo: "2#10" }],
      [{ area: 3, arranjo: "2#12.5" }],
      [{ area: 5, arranjo: "N#16" }],
      [{ area: 9, arranjo: "N#20" }],
    ];
    const grupoDeCorte = [[2], [2, 3], [3], [4]];
    const obra = obraBase({
      parametrosViga: {
        viga: { momentosExternos: true },
        dsp: { gruposBitolas: 4, arranjosPorIntervalo, grupoDeCorte, fck: 0.2 },
      },
    });
    const f = formDosParametros(obra);
    f.dsp.numeros.fck = "";
    f.dsp.numeros.cobrimento = "3";
    expect(aplica(f, obra).parametrosViga).toEqual({
      viga: { momentosExternos: true },
      dsp: {
        gruposBitolas: 4,
        cobrimento: 3,
        arranjosPorIntervalo: [
          [{ area: 2, arranjo: "2#10" }],
          [{ area: 3, arranjo: "2#12.5" }],
          [{ area: 5, arranjo: "N#16" }],
          [{ area: 9, arranjo: "N#20" }],
        ],
        grupoDeCorte: [[2], [2, 3], [3], [4]],
      },
    });
  });

  it("não mexe no resto da obra (nome, materiais, pavimentos)", () => {
    const obra = obraBase({ modoCalculo: "original" });
    const f = formDosParametros(obra);
    f.pip.numeros.densidade = "24";
    const r = aplica(f, obra);
    expect(r.nome).toBe("Teste");
    expect(r.modoCalculo).toBe("original");
    expect(r.materiais).toBe(obra.materiais);
    expect(r.pavimentos).toBe(obra.pavimentos);
    expect(r.parametrosPilar).toEqual({ pip: { densidade: 24 } });
  });
});

describe("formulário dos parâmetros: problemas", () => {
  it("cada mensagem nomeia a tabela e o campo, na ordem das abas", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.laje.numeros.gamaF = "0";
    f.laje.bitolaPorH.ligada = true;
    const l0 = f.laje.bitolaPorH.linhas[0];
    if (!l0) throw new Error("sem linha 0");
    l0.indiceBitola = "10";
    f.dsp.numeros.gruposBitolas = "7";
    f.dsp.espacamentosEstribo = { ligada: true, linhas: [{ valor: "10" }] };
    f.ini.numeros.maximoBarras = "10,5";
    f.pip.numeros.ordemBitolaMinima = "13";
    f.variaArmadura = "-1";
    expect(obraDosParametros(f, obra)).toEqual([
      ".LAP, γf das lajes: informe um número maior que zero.",
      ".LAP, Bitola preferencial por H, Linha 1, Bitola nº: informe um inteiro de 0 a 9.",
      ".DSP, Grupos de bitolas: informe um inteiro de 3 a 6.",
      ".DSP, Espaçamentos de estribo: informe pelo menos 2 valores.",
      "PILAR.INI, Número máximo de barras numa seção: informe um número inteiro.",
      ".PIP, Menor bitola longitudinal: informe um inteiro de 0 a 12.",
      "Rodada, Variação da armadura ao longo da coluna: informe um número maior ou igual a zero.",
    ]);
  });

  it("texto que não é número e célula vazia de tabela ligada", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.viga.numeros.coeficienteForca = "abc";
    f.dsp.bitolas.ligada = true;
    const b9 = f.dsp.bitolas.linhas[9];
    if (!b9) throw new Error("sem linha 9");
    b9.area = "";
    expect(obraDosParametros(f, obra)).toEqual([
      "VIGA.INI, Coeficiente de força: informe um número.",
      ".DSP, Bitolas, Bitola 9, Área (0 desativa): informe um número.",
    ]);
  });

  it("grupos de bitolas sem as listas por grupo correspondentes", () => {
    const obra = obraBase();
    const f = formDosParametros(obra);
    f.dsp.numeros.gruposBitolas = "4";
    expect(obraDosParametros(f, obra)).toEqual([
      ".DSP, Grupos de bitolas: com 4 grupos o .DSP precisa de 4 listas de arranjos e 4 de grupo de corte, e a obra tem 3 e 3; este editor não muda essas listas.",
    ]);
  });
});

describe("padrões mostrados nos campos vazios", () => {
  it("corrigido: fck/fyk dos materiais, densidade 25 kN/m³ e o cobrimento da obra", () => {
    const p = padroesDosParametros(obraBase());
    expect(p.ini.fck).toBe("25");
    expect(p.ini.fyk).toBe("500");
    expect(p.dsp.fck).toBe("0,25");
    expect(p.dsp.fyk).toBe("5");
    expect(p.pip.densidade).toBe("25");
    expect(p.pip.cobrimento).toBe("3");
    expect(p.laje.relacaoNegPosMin).toBe("0,3");
    expect(p.dsp.cobrimento).toBe("2");
  });

  it("original: densidade 2,5 t/m³ = 24,52 kN/m³ e cobrimento 2 cm do .PIP", () => {
    const p = padroesDosParametros(obraBase({ modoCalculo: "original" }));
    // 2,5 · 9,80665 = 24,516625
    expect(p.pip.densidade).toBe("24,52");
    expect(p.pip.cobrimento).toBe("2");
  });

  it("CA-25 é classe A", () => {
    const obra = obraBase();
    const p = padroesDosParametros({ ...obra, materiais: { ...obra.materiais, aco: "CA-25" } });
    expect(p.iniClasseAco).toBe("A");
    expect(p.ini.fyk).toBe("250");
  });
});

/// <reference types="node" />
// Referências independentes da transcrição dos .BAS:
// 1. os arquivos de parametrização de fábrica que o INSTALAR do original grava
//    (oraculo/orig/SISTRUT.LAP, SISTRUT.DSP, SISTRUT.PIP, VIGA.INI, PILAR.INI em
//    __oraculo__/arquivos/, com o cabeçalho neutro), lidos do disco;
// 2. os parâmetros impressos pelo original nos casos do oráculo (`__oraculo__/`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASOS_ORACULO, numeroOraculo, valorOraculo } from "../__oraculo__";
import { arquivoOraculo } from "../__oraculo__/arquivosOraculo";
import { sng } from "./f32";
import {
  emSingle,
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PILAR,
  PARAMETROS_PIP,
  PARAMETROS_VIGA,
  parametrosVicalcDoDsp,
} from "./parametros";
import type { ParametrosDsp, ParametrosLaje, ParametrosPip, ParametrosVicalc } from "./tipos";

/** Linhas de dados do arquivo (sem os comentários "*" e sem CR). */
function linhas(arquivo: string) {
  return readFileSync(arquivoOraculo(`oraculo/orig/${arquivo}`), "latin1")
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => !l.startsWith("*"));
}

/** Primeiro campo da linha que contém o rótulo ("0.15   RESISTENCIA ..."). */
function campo(ls: string[], rotulo: string) {
  const l = ls.find((x) => x.includes(rotulo));
  if (!l) throw new Error(`rótulo não achado: ${rotulo}`);
  return l.trim().split(/[\s=]+/)[0]!;
}
const numero = (ls: string[], rotulo: string) => Number(campo(ls, rotulo));
const simNao = (ls: string[], rotulo: string) => campo(ls, rotulo) === "S";

/** Linhas "ordem - bitola - área - kg/m" da tabela que segue "ORDEM". */
function tabelaOrdem(ls: string[]) {
  const i = ls.findIndex((l) => l.startsWith("ORDEM"));
  const out: number[][] = [];
  for (const l of ls.slice(i + 1)) {
    const m = l.match(/^\s*\d+\s+-\s+([\d.]+)\s*-\s+([\d.]+)\s+-\s+([\d.]+)/);
    if (!m) break;
    out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

/** Linhas de números separados por vírgula ("  10.0 , 7.5") a partir do índice `de`. */
function linhasDeNumeros(ls: string[], de: number, n: number) {
  return ls.slice(de, de + n).map((l) =>
    l
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((x) => (x === "NAO" ? 0 : Number(x))),
  );
}

describe("SISTRUT.LAP de fábrica", () => {
  const ls = linhas("SISTRUT.LAP");
  const p = PARAMETROS_LAJE;

  it("cobrimento, acréscimo, bitolas e áreas", () => {
    expect(p.cobrimento).toBe(numero(ls, "COBRIMENTO DA ARMADURA"));
    expect(p.acrescimo).toBe(numero(ls, "ACRESCIMO AO COBRIMENTO"));
    expect(p.bitolas.map((b) => [b.bitola, b.area])).toEqual(
      tabelaOrdem(ls).map(([b, a]) => [b, a]),
    );
  });

  it("H mínimo e máximo, LN, flecha (lida e não usada), densidade", () => {
    expect(p.hMin).toBe(numero(ls, "MINIMA ALTURA TOTAL"));
    expect(p.hMax).toBe(numero(ls, "MAXIMA ALTURA TOTAL"));
    expect(p.fracaoLinhaNeutra * 100).toBe(numero(ls, "LINHA NEUTRA"));
    expect(p.flecha.lfTotal).toBe(numero(ls, "FLEXA COM CARGA TOTAL"));
    expect(p.flecha.lfAcidental).toBe(numero(ls, "FLEXA COM CARGA ACIDENTAL"));
    expect(p.flecha.deformacaoLenta).toBe(simNao(ls, "DEFORMACAO LENTA"));
    expect(p.flecha.multiplicadorEc).toBe(numero(ls, "MULT. DE Ec"));
    expect(p.densidade).toBe(numero(ls, "DENSIDADE DO CONCRETO"));
  });

  it("relação de vãos → μ (15 linhas)", () => {
    const i = ls.findIndex((l) => /^\s+0\.25\s+,/.test(l));
    expect(p.relacaoMu.map((r) => [r.relacao, r.mu])).toEqual(linhasDeNumeros(ls, i, 15));
  });

  it("Mneg/Mpos, taxas, eficiência, s máximo e 2H", () => {
    expect(p.relacaoNegPosMax).toBe(numero(ls, "MAXIMA RELACAO PERMITIDA"));
    expect(p.relacaoNegPosMin).toBe(numero(ls, "MINIMA RELACAO PERMITIDA"));
    expect(p.relacaoCantosReentrantes).toBe(numero(ls, "CANTOS REENTRANTES"));
    expect(p.taxaMinimaPositiva).toBe(numero(ls, "ESFORCOS POSITIVOS"));
    expect(p.taxaMinimaNegativa).toBe(numero(ls, "ESFORCOS NEGATIVOS"));
    expect(p.eficienciaNegativa * 100).toBe(numero(ls, "EFICIENCIA DA ARMADURA NEGATIVA"));
    expect(p.espacamentoMaximo).toBe(numero(ls, "ESPACAMENTO MAXIMO ENTRE BARRAS"));
    expect(p.limitaEspacamento2H).toBe(simNao(ls, "2*Htotal"));
  });

  it("espaçamento mínimo por H, lista de espaçamentos e bitola por H", () => {
    const i = ls.findIndex((l) => /^\s+10\.0\s+,\s+7\.5/.test(l));
    expect(p.espacamentoMinimoPorH.map((e) => [e.hAte, e.espacamento])).toEqual(
      linhasDeNumeros(ls, i, 4),
    );
    const lista = ls.find((l) => l.startsWith("7.5/"))!;
    expect(p.espacamentos).toEqual(
      lista
        .split("/")
        .filter((x) => x.trim())
        .map(Number),
    );
    const j = ls.findIndex((l) => /^\s+5\.0\s+,\s+4\.0\s+,\s+0/.test(l));
    expect(
      p.bitolaPorH.map((b) => [b.hAte, p.bitolas[b.indiceBitola]!.bitola, b.indiceBitola]),
    ).toEqual(linhasDeNumeros(ls, j, 6));
  });
});

describe("LAJE: parâmetros impressos pelo original", () => {
  const param = CASOS_ORACULO.retrad_laje_param!;
  const casoA = CASOS_ORACULO.caso_a_laje!;

  it("γ, fck, fyk, cobrimento (caso a, rodapé dos relatórios)", () => {
    expect(PARAMETROS_LAJE.gamaF).toBe(numeroOraculo(casoA, "param.cse"));
    expect(PARAMETROS_LAJE.gamaC).toBe(numeroOraculo(casoA, "param.csc"));
    expect(PARAMETROS_LAJE.gamaS).toBe(numeroOraculo(casoA, "param.csa"));
    expect(PARAMETROS_LAJE.fck).toBe(numeroOraculo(casoA, "param.fck"));
    expect(PARAMETROS_LAJE.fyk).toBe(numeroOraculo(casoA, "param.fyk"));
    expect(PARAMETROS_LAJE.cobrimento).toBe(numeroOraculo(casoA, "param.cobrimento"));
  });

  it("densidade, Mneg/Mpos, eficiência e LN de fábrica (retrad_laje_param, telas do LAJECALC 7)", () => {
    expect(PARAMETROS_LAJE.densidade).toBe(numeroOraculo(param, "param.densidade"));
    expect(PARAMETROS_LAJE.relacaoNegPosMax).toBe(numeroOraculo(param, "param.relMaxNegPos"));
    expect(PARAMETROS_LAJE.relacaoNegPosMin).toBe(numeroOraculo(param, "param.relMinNegPos"));
    expect(PARAMETROS_LAJE.relacaoCantosReentrantes).toBe(
      numeroOraculo(param, "param.relCantosReentrantes"),
    );
    expect(PARAMETROS_LAJE.eficienciaNegativa * 100).toBe(
      numeroOraculo(param, "param.eficienciaNeg.padrao"),
    );
    expect(PARAMETROS_LAJE.fracaoLinhaNeutra * 100).toBe(numeroOraculo(param, "param.limitaLN"));
    expect(PARAMETROS_LAJE.gamaF).toBe(numeroOraculo(param, "param.cse.padrao"));
    expect(PARAMETROS_LAJE.fck).toBe(numeroOraculo(param, "param.fck.padrao"));
  });
});

describe("SISTRUT.DSP de fábrica", () => {
  const ls = linhas("SISTRUT.DSP");
  const p = PARAMETROS_DSP;

  it("parâmetros globais", () => {
    expect(p.reducaoNegativos).toBe(numero(ls, "MOMENTOS NEGATIVOS-(0.15"));
    expect(p.fck).toBe(numero(ls, "CONCRETO - Fck"));
    expect(p.fyk).toBe(numero(ls, "DO ACO - Fyk"));
    expect(p.classeAco).toBe(campo(ls, "TIPO DE ACO"));
    expect(p.multiplicadorEc).toBe(numero(ls, "MULT. DE Ec"));
    expect(p.cobrimento).toBe(numero(ls, "COBRIMENTO DA ARMADURA"));
    expect(p.acrescimo).toBe(numero(ls, "ACRESCIMO AO COBRIMENTO"));
    expect(p.alivioCortante).toBe(simNao(ls, "ALIVIO DE ESFORCOS"));
    expect(p.acidentaisEnvoltoria).toBe(simNao(ls, "ACIDENTAIS ENVOLTORIAS"));
    expect(p.momentosExternos).toBe(simNao(ls, "MOMENTOS EXTERNOS"));
    expect(p.gamaF).toBe(numero(ls, "SEGURANCA AOS ESFORCOS"));
    expect(p.gamaC).toBe(numero(ls, "SEGURANCA PARA O CONCRETO"));
    expect(p.gamaS).toBe(numero(ls, "SEGURANCA PARA O ACO"));
  });

  it("bitolas, áreas (φ4 e φ32 com 0,00: defeito R9) e kg/m", () => {
    expect(p.bitolas.map((b) => [b.bitola, b.area, b.kgPorM])).toEqual(tabelaOrdem(ls));
  });

  it("armadura mínima, ancoragem, fissuração, grupos", () => {
    expect(p.taxaArmaduraMinima).toBe(numero(ls, "OBTENCAO DA ARMADURA MINIMA"));
    expect(p.decalagem).toBe(numero(ls, "DECALAGEM"));
    expect(p.ancoragemPositiva).toBe(numero(ls, "FERRAGEM POSITIVA"));
    expect(p.ancoragemNegativa).toBe(numero(ls, "FERRAGEM NEGATIVA"));
    expect(p.ancoragemMinimo10Diametros).toBe(simNao(ls, "MINIMO DE 10 DIAM"));
    expect(p.flechaInerciaFissurada).toBe(simNao(ls, "INERCIA FISSURADA"));
    expect(p.flechaDeformacaoLenta).toBe(simNao(ls, "FLECHA COM DEFORMACAO LENTA"));
    expect(p.verificaFissuracao).toBe(simNao(ls, "VERIFICO FISSURACAO"));
    expect(p.classeFissuracao).toBe(numero(ls, "LIMITES DE VERIFICACAO"));
    expect(p.gruposBitolas).toBe(numero(ls, "NUMERO DE GRUPOS"));
    expect(p.limitesIntervalos.slice(0, 2)).toEqual([
      numero(ls, "PRIMEIRO INTERVALO"),
      numero(ls, "SEGUNDO INTERVALO"),
    ]);
  });

  it("arranjos por intervalo e grupos de corte", () => {
    p.arranjosPorIntervalo.forEach((lista, k) => {
      const i = ls.findIndex((l) => l === `${k + 1} INTERVALO`);
      const fim = ls.findIndex((l, j) => j > i && l === "FIM");
      const doArquivo = ls.slice(i + 1, fim).map((l) => {
        const [area, arranjo] = l.trim().split(/\s+-\s+/);
        return { area: Number(area), arranjo };
      });
      if (k < 2) {
        expect(lista).toEqual(doArquivo);
        return;
      }
      // diferença conhecida: último do 3º intervalo 70 no arquivo, 170 no embutido
      // (DESENHO.BAS:4919, A_145a!(5, 2) = 170.0)
      expect(lista.slice(0, -1)).toEqual(doArquivo.slice(0, -1));
      expect(doArquivo.at(-1)).toEqual({ area: 70, arranjo: "N#25" });
      expect(lista.at(-1)).toEqual({ area: 170, arranjo: "N#25" });
    });
    const blocos = ls.flatMap((l, i) => (l.startsWith("NUMERO DE BARRAS TOTAIS") ? [i] : []));
    expect(p.grupoDeCorte).toEqual(
      blocos.map((i) => ls.slice(i + 1, i + 9).map((l) => Number(l.split("-")[1]))),
    );
  });

  it("estribos", () => {
    expect(p.taxaEstriboMinima).toBe(numero(ls, "MINIMA ARMADURA DE CISALHAMENTO"));
    expect(p.espacamentoEstriboMinimo).toBe(numero(ls, "MINIMO ESPACAMENTO DE ESTRIBOS"));
    expect(p.espacamentoEstriboMaximo).toBe(numero(ls, "MAXIMO ESPACAMENTO DE ESTRIBOS"));
    expect(p.comparaEspacamentoMaximo).toBe(
      numero(ls, "COMPARACAO DO MAXIMO") === 0 ? "d/2" : "H/2",
    );
    expect(p.larguraEstriboSimples).toBe(numero(ls, "ESTRIBOS SIMPLES"));
    expect(p.larguraEstriboDuplo).toBe(numero(ls, "ESTRIBOS DUPLOS"));
    const i = ls.findIndex((l) => l === "ESPACAMENTO DE ESTRIBOS");
    expect(p.espacamentosEstribo).toEqual(
      ls[i + 1]!.split("/")
        .filter((x) => x.trim())
        .map(Number),
    );
    // o arquivo lista da linha 5 para a 0: "12.5 - 8" ... "4 - 4"
    const j = ls.findIndex((l) => l.startsWith("MAXIMA"));
    const doArquivo = ls.slice(j + 1, j + 7).map((l) => l.split("-").map(Number));
    expect([...p.bitolasEstribo].reverse().map((b) => [b.maxima, b.minima])).toEqual(doArquivo);
  });

  it("dobras por bitola e as duas tabelas sem rótulo (uma diferença conhecida)", () => {
    const i = ls.findIndex((l) => /^4\s+0\s+,\s+15/.test(l));
    expect(p.dobrasPorBitola).toEqual(linhasDeNumeros(ls, i, 10).map((r) => r.slice(2)));
    const t1 = linhasDeNumeros(ls, i + 11, 5).map((r) => r[2]);
    const t2 = linhasDeNumeros(ls, i + 18, 5).map((r) => r[2]);
    expect(p.tabelaBitola2).toEqual(t2);
    // o arquivo de fábrica tem 120 no 5º valor; o padrão embutido (DESENHO.BAS:5014), 100
    expect(t1).toEqual([15, 30, 70, 85, 120]);
    expect(p.tabelaBitola1).toEqual([15, 30, 70, 85, 100]);
  });

  it("detalhamento", () => {
    expect(p.letraFerros).toBe(campo(ls, "LETRA PARA DAR NOME"));
    expect(p.portaEstribosAutomaticos).toBe(simNao(ls, "AUTOMATICA DE PORTA"));
    expect(p.ordemMinimaPortaEstribo).toBe(numero(ls, "MINIMA BITOLA DE PORTA"));
    expect(p.traspassePortaEstribo).toBe(numero(ls, "TRANSPASSE PORTA"));
    expect(p.comprimentoDesenvolvido).toBe(simNao(ls, "DESENVOLVIDO"));
    expect(p.raioDobramento).toBe(numero(ls, "RAIO EM DIAMETROS"));
    expect(p.taxaMinimaNegativa).toBe(numero(ls, "MINIMA ARMADURA NEGATIVA"));
    expect(p.alturaArmaduraPele).toBe(numero(ls, "ARM. PELE"));
    expect(p.taxaArmaduraPele).toBe(numero(ls, "PELE EM UMA FACE"));
    expect(p.traspassePele).toBe(numero(ls, "TRANSPASSE ARMADURA PELE"));
    expect(p.distanciaMinimaEstribosExtremidade).toBe(numero(ls, "ESTRIBOS NAS EXTREMIDADES"));
    expect(p.entradaMinimaApoio).toBe(numero(ls, "ENTRADA DA FERRAGEM"));
    expect(p.verificaGrampos).toBe(simNao(ls, "GRAMPOS NOS APOIOS"));
    expect(p.reduzAncoragemPositiva).toBe(simNao(ls, "REDUZIR ANCORAGEM"));
    expect(p.ordemMaximaCA60).toBe(numero(ls, "CONSIDERADA CA60"));
    expect(p.comprimentoMaximoBarra).toBe(numero(ls, "COMPRIMENTO MAXIMO DA FERRAGEM"));
  });
});

describe("DSP: parâmetros impressos pelo original (retrad_des_menu, retrad_des_det)", () => {
  const menu = CASOS_ORACULO.retrad_des_menu!;
  it("fck, fyk, aço, cobrimento, alívio, acidentais, momentos externos, redução", () => {
    expect(PARAMETROS_DSP.fck).toBe(numeroOraculo(menu, "param.concreto"));
    expect(PARAMETROS_DSP.fyk).toBe(numeroOraculo(menu, "param.aco"));
    expect(PARAMETROS_DSP.classeAco).toBe(valorOraculo(menu, "param.tipoAco").impresso);
    expect(PARAMETROS_DSP.cobrimento).toBe(numeroOraculo(menu, "param.cobrimento"));
    expect(PARAMETROS_DSP.alivioCortante).toBe(
      valorOraculo(menu, "param.alivioCortante").impresso === "S",
    );
    expect(PARAMETROS_DSP.acidentaisEnvoltoria).toBe(
      valorOraculo(menu, "param.cargasAcidentais").impresso === "S",
    );
    expect(PARAMETROS_DSP.momentosExternos).toBe(
      valorOraculo(menu, "param.momentosExternos").impresso === "S",
    );
    expect(PARAMETROS_DSP.reducaoNegativos * 100).toBe(
      numeroOraculo(menu, "param.reducaoNegativos"),
    );
  });
  it("as 10 bitolas do resumo na ordem do .DSP", () => {
    expect(PARAMETROS_DSP.bitolas.map((b) => b.bitola)).toEqual(
      PARAMETROS_DSP.bitolas.map((_, i) => numeroOraculo(menu, `param.resumo.bitola.${i + 1}`)),
    );
  });
});

describe("VIGA.INI e PILAR.INI de fábrica", () => {
  it("VIGA.INI", () => {
    const ls = linhas("VIGA.INI");
    const v = PARAMETROS_VIGA;
    expect(v.coeficienteMedida).toBe(numero(ls, "TRANSFORMAR EM METROS"));
    expect(v.coeficienteForca).toBe(numero(ls, "TRANSFORMAR EM TONELADAS"));
    expect(v.reducaoNegativos * 100).toBe(numero(ls, "MOMENTOS NEGATIVOS PARA REDUCAO"));
    expect(v.acidentais).toBe(simNao(ls, "CONSIDERACAO DE CARGAS ACIDENTAIS"));
    expect(v.acidentalGerada).toBe(campo(ls, "FORNECIDOS PELA ENTRADA") === "G");
    expect(v.porcentagemAcidentalGerada).toBe(numero(ls, "ACIDENTAL GERADA"));
    expect(v.momentosExternos).toBe(simNao(ls, "MOMENTOS EXTERNOS"));
    expect(v.reacaoNoPilar).toBe(
      campo(ls, "REACOES ESTATICAS OU MAXIMAS") === "E" ? "estatica" : "maxima",
    );
  });

  it("PILAR.INI", () => {
    const ls = linhas("PILAR.INI");
    const p = PARAMETROS_PILAR;
    expect(p.fck).toBe(numero(ls, "CONCRETO - Fck"));
    expect(p.fyk).toBe(numero(ls, "DO ACO - Fyk"));
    expect(p.classeAco).toBe(campo(ls, "TIPO DE ACO"));
    const i = ls.findIndex((l) => l.startsWith("DIAMETRO EM MILIMETROS"));
    const [bitolas, areas] = [ls[i + 1]!, ls[i + 3]!].map((l) => l.split(",").map(Number));
    expect(p.bitolas.map((b) => b.bitola)).toEqual(bitolas);
    expect(p.bitolas.map((b) => b.area)).toEqual(areas);
    expect(p.multiplicadorEc).toBe(numero(ls, "MULTIPLICADOR DE Ec"));
    expect(p.excentricidadeMinima).toBe(numero(ls, "MINIMA EXCENTRICIDADE ACIDENTAL A SER"));
    expect(p.verificaH30).toBe(simNao(ls, "VERIFICO MINIMA EXCENTRICIDADE"));
    expect(p.excentricidades).toBe(campo(ls, "SOLADAS") === "I" ? "isoladas" : "simultaneas");
    expect(p.secoesSimetricas).toBe(simNao(ls, "SIMETRICAS"));
    expect(p.lambda2aOrdem).toBe(numero(ls, "2a ORDEM"));
    expect(p.lambdaFluencia).toBe(numero(ls, "ACIDENTAL DE FLUENCIA"));
    expect(p.lambdaProcessoExato).toBe(numero(ls, "PROCESSO EXATO"));
    expect(p.coeficienteFluencia).toBe(numero(ls, "COEFICIENTE DE FLUENCIA"));
    expect(p.fatorNkFluencia).toBe(numero(ls, "MULTIPLICADOR DA CARGA Nk"));
    expect(p.fatorCargaFluencia).toBe(numero(ls, "MULTIPLICADOR DA CARGA DE FLUENCIA"));
    expect(p.gamaF).toBe(numero(ls, "SEGURANCA DOS ESFORCOS"));
    expect(p.gamaC).toBe(numero(ls, "SEGURANCA DO CONCRETO"));
    expect(p.gamaS).toBe(numero(ls, "SEGURANCA DO ACO"));
  });
});

describe("SISTRUT.PIP de fábrica", () => {
  const ls = linhas("SISTRUT.PIP");
  const p = PARAMETROS_PIP;

  it("parâmetros, taxas e cargas", () => {
    expect(p.cobrimento).toBe(numero(ls, "COBRIMENTO DA ARMADURA"));
    expect(p.tensaoAdmissivelNormal).toBe(numero(ls, "(Nk/Area)"));
    expect(p.tensaoAdmissivelFlexao).toBe(numero(ls, "(Nk/Area+Mk/W)"));
    expect(p.taxaIdealPredimensionamento).toBe(numero(ls, "TAXA IDEAL"));
    expect(p.medidaMinima).toBe(numero(ls, "MINIMA MEDIDA DA COLUNA"));
    expect(p.multiploMedida).toBe(numero(ls, "MULTIPLO DA MEDIDA"));
    expect(p.pesoProprio).toBe(simNao(ls, "ACRESCENTO O PESO PROPRIO"));
    expect(p.densidade).toBe(numero(ls, "DENSIDADE DO CONCRETO"));
    expect(p.porcentagemAcidental).toBe(numero(ls, "CONSIDERADA ACIDENTAL"));
    expect(p.reduzAcidentalFundacao).toBe(simNao(ls, "REDUZO PARA FUNDACAO"));
    expect(p.reduzAcidentalDimensionamento).toBe(simNao(ls, "REDUZO PARA DIMENSIONAMENTO"));
    expect(p.taxaMinimaCalculada).toBe(numero(ls, "SECAO CALCULADA"));
    expect(p.taxaMinimaReal).toBe(numero(ls, "SECAO REAL"));
    expect(p.taxaMaxima).toBe(numero(ls, "MAXIMA PORCENTAGEM"));
    expect(p.traspasseNaTaxa).toBe(simNao(ls, "CONSIDERO TRANSPASSE"));
    expect(p.misturaBitolas).toBe(simNao(ls, "MISTURO BITOLAS"));
    expect(p.ordemBitolaMinima).toBe(numero(ls, "MINIMA BITOLA LONGITUDINAL"));
  });

  it("bitolas (áreas de 3,2 e 4 mm diferem: 0,00 no arquivo, 0,08 e 0,125 no embutido)", () => {
    const t = tabelaOrdem(ls);
    expect(p.bitolas.map((b) => b.bitola)).toEqual(t.map((r) => r[0]));
    expect(p.bitolas.slice(2).map((b) => b.area)).toEqual(t.slice(2).map((r) => r[1]));
    expect(t.slice(0, 2).map((r) => r[1])).toEqual([0, 0]);
  });

  it("matriz de flambagem, espaçamentos e estribos por bitola", () => {
    const i = ls.findIndex((l) => l.trim().startsWith("ENGASTE       ,"));
    expect(p.coeficienteFlambagem).toEqual(
      ls.slice(i, i + 4).map((l) =>
        l
          .split(",")
          .slice(1)
          .map((x) => (x.trim() === "NAO" ? 100 : Number(x))),
      ),
    );
    const j = ls.findIndex((l) => /^\s+0\s+,\s+3\.2\s+,\s+4\.0/.test(l));
    expect(p.bitolas.map((b) => [b.espacamentoMinimo, b.coluna4])).toEqual(
      linhasDeNumeros(ls, j, 13).map((r) => [r[2], r[3]]),
    );
    const k = ls.findIndex((l) => /^\s+0\s+,\s+3\.2\s+,\s+NAO/.test(l));
    expect(p.estriboPorBitola.map((e) => [e.bitola, e.espacamento])).toEqual(
      linhasDeNumeros(ls, k, 13).map((r) => [r[2], r[3]]),
    );
  });
});

describe("emSingle", () => {
  it("passa todo número da tabela por sng e mantém textos e booleanos", () => {
    const t = emSingle(PARAMETROS_LAJE);
    expect(t.gamaF).toBe(sng(1.4));
    expect(t.relacaoMu[5]!.relacao).toBe(sng(0.67));
    expect(t.classeAco).toBe("B");
    expect(t.limitaEspacamento2H).toBe(true);
  });
});

describe("tabelas nos contratos", () => {
  it("a tabela decimal e emSingle(tabela) cabem nos tipos de tipos.ts sem cast", () => {
    const decimal: ParametrosLaje = PARAMETROS_LAJE;
    const single: ParametrosLaje = emSingle(PARAMETROS_LAJE);
    const dsp: ParametrosDsp = emSingle(PARAMETROS_DSP);
    const pip: ParametrosPip = emSingle(PARAMETROS_PIP);
    expect(single.bitolas[2]!.area).toBe(sng(decimal.bitolas[2]!.area));
    expect(dsp.bitolas).toHaveLength(10);
    expect(pip.bitolas).toHaveLength(13);
  });

  it("análise do DESDIM com os parâmetros do .DSP (redução DESENHO.BAS:4773, acidentais e Mext)", () => {
    const p: ParametrosVicalc = parametrosVicalcDoDsp({
      ...PARAMETROS_DSP,
      reducaoNegativos: 0.85,
    });
    expect(p.reducaoNegativos).toBe(0.85);
    expect(p.acidentais).toBe(PARAMETROS_DSP.acidentaisEnvoltoria);
    expect(p.momentosExternos).toBe(PARAMETROS_DSP.momentosExternos);
    expect(p.reacaoNoPilar).toBe(PARAMETROS_VIGA.reacaoNoPilar);
  });
});

// Classificação dos avisos: textos sintéticos montados como os emissores montam
// (o arquivo de cada um está na regra, em classificaAvisos.ts). Nenhum dado de obra real.
import { describe, expect, it } from "vitest";
import type { Aviso } from "../calculo";
import {
  agruparAvisos,
  avisoDaImportacao,
  classificarAviso,
  juntarPontos,
  resumoDeOnde,
} from "./classificaAvisos";

const det = (local: string, nome: string, texto: string): Aviso => ({
  local,
  elemento: `${nome} (detalhamento)`,
  texto,
});
const calc = (local: string, elemento: string, texto: string): Aviso => ({
  local,
  elemento,
  texto,
});

describe("classificarAviso", () => {
  it.each([
    // [texto, grupo, severidade, ponto]
    [
      "V9: dimensionamento/detalhamento não concluído: Espaçamento de estribo 7 cm fora da lista do .DSP (erro 5 do QuickBASIC) (o original para com erro de execução)",
      "Dimensionamento não concluído",
      "erro",
      undefined,
    ],
    [
      "P4: dimensionamento não concluído: sem equilíbrio",
      "Dimensionamento não concluído",
      "erro",
      undefined,
    ],
    [
      "viga não calculada (apoios insuficientes ou ciclo de apoios).",
      "Viga não calculada",
      "erro",
      undefined,
    ],
    [
      'parou em "Continuo com o processamento desta Viga S/N" com o padrão N (motivo: cortante); sem detalhamento nem quadro.',
      "Viga interrompida no DESDIM",
      "erro",
      undefined,
    ],
    [
      "Caso 2: Nk nulo; o original divide por zero (defeito D-3). Sem resultado.",
      "Pilar sem resultado",
      "erro",
      undefined,
    ],
    [
      "L7: pré-moldada; o LAJECALC não calcula momentos, só a montagem a carrega.",
      "Lajes pré-moldadas",
      "info",
      undefined,
    ],
    [
      "P9: armadura dimensionada no nível BAIXO (a base da variação, PILAREDI 3.2); este lance a herda.",
      "Armadura herdada da base da variação",
      "info",
      undefined,
    ],
    [
      "V5: o detalhamento e o quadro de ferros saíram só da armadura editada no SISTRUT (R5__ALTO.EDV), como o original faz ao reabrir a viga editada no DESEDITA; sem o dimensionamento.",
      "Quadro só da armadura editada",
      "info",
      undefined,
    ],
    [
      "Pilares VX.A0, VX.A1: nenhuma viga descarrega neles e eles nascem sobre viga de transição; são só apoios de cálculo, sem carga, e não são calculados como pilares nem descarregam na fundação.",
      "Apoios de cálculo sem carga",
      "info",
      undefined,
    ],
    [
      "P6: nasce sobre a viga V2 do pavimento BAIXO, que tem 3,50 t de carga concentrada sob ele, e continua a coluna do P6 de baixo, deslocado 4 cm, como no .COL do original.",
      "Pilar sobre viga de transição",
      "atencao",
      undefined,
    ],
    [
      "V4: a viga mudou depois da edição (comprimento de 300 cm na edição e 310 cm na viga); como o original, que não confere o comprimento ao reabrir a viga editada (DESEDITA.BAS:747), a armadura editada no SISTRUT (R4__ALTO.EDV) foi aplicada à viga atual. Confira se as barras ainda alcançam os apoios.",
      "Viga mudou depois da edição",
      "atencao",
      undefined,
    ],
    [
      "V2 N3: ancoragem no apoio 2 insuficiente (lb,ef = 12,5 cm < 30,0 cm); use grampos ou aumente o apoio.",
      "Ancoragem insuficiente",
      "atencao",
      "apoio 2",
    ],
    [
      "L1 N2: ancoragem no bordo 3 insuficiente (lb,ef = 5 cm < 9 cm); aumente o apoio ou use barras mais finas.",
      "Ancoragem insuficiente",
      "atencao",
      "bordo 3",
    ],
    [
      "V1 tramo 1: armadura dupla; a armadura comprimida (A's = 0,08 cm²) fica com os porta-estribos (2 φ6,3 = 0,62 cm²); confira o travamento delas pelos estribos.",
      "Armadura comprimida nas barras de cima",
      "info",
      "tramo 1",
    ],
    [
      "V2 tramo 1: armadura dupla; a armadura comprimida (A's = 0,40 cm²) não está detalhada.",
      "Armadura dupla não detalhada",
      "atencao",
      "tramo 1",
    ],
    [
      "V2 apoio 2: armadura dupla no negativo; a armadura comprimida (A's = 0,40 cm², barras inferiores sobre o apoio) não está detalhada.",
      "Armadura dupla não detalhada",
      "atencao",
      "apoio 2",
    ],
    [
      "V2 N5: o negativo do apoio 3 precisa passar 60,0 cm além do apoio 4, mais que o tramo seguinte (40,0 cm); confira a ancoragem.",
      "Negativo além do tramo seguinte",
      "atencao",
      "apoio 3",
    ],
    [
      "V2 tramo 2: sem vão livre para estribos.",
      "Sem vão livre para estribos",
      "atencao",
      "tramo 2",
    ],
    [
      "L1: flecha total 2,10 cm acima do limite 1,60 cm (l/250).",
      "Fora dos limites da norma",
      "atencao",
      undefined,
    ],
    [
      "P1: esbeltez máxima excedida (λ = 130,0 > 120)",
      "Fora dos limites da norma",
      "atencao",
      undefined,
    ],
    [
      "Carga nos pilares (120,00 kN) difere da carga das vigas (118,00 kN).",
      "Diferença no equilíbrio de cargas",
      "atencao",
      undefined,
    ],
    [
      "Reações das lajes (80,00 kN) diferem da carga que chega às vigas (79,00 kN).",
      "Diferença no equilíbrio de cargas",
      "atencao",
      undefined,
    ],
    [
      'V6: momento acima de 40 % do limite da armadura simples. Como no original com a resposta padrão "N", a viga parou no dimensionamento, sem detalhamento nem quadro de ferros. Para seguir, marque "Continuar mesmo acima do limite" na viga.',
      "Viga interrompida no DESDIM",
      "erro",
      undefined,
    ],
    [
      "V6 tramo 2: momento aplicado acima de 40% do momento limite da armadura simples.",
      "Momento mais de 40 % acima do limite (1,4 ×)",
      "atencao",
      undefined,
    ],
    ["nao-converge", "Pilar sem resultado", "erro", undefined],
    [
      "L2: seção da positiva não passa no LAJEPROC ('*').",
      "Fora dos limites da norma",
      "atencao",
      undefined,
    ],
    // desconhecido: atenção, nunca informativo
    ["um aviso novo que nenhuma regra conhece.", "Outros avisos", "atencao", undefined],
  ])("%s → %s (%s)", (texto, grupo, severidade, ponto) => {
    const c = classificarAviso(calc("ALTO", "X1", texto));
    expect(c.grupo).toBe(grupo);
    expect(c.severidade).toBe(severidade);
    expect(c.ponto).toBe(ponto);
  });

  it("a origem vem do campo `fonte` ou do elemento 'Vx (detalhamento)' de coletarAvisos", () => {
    expect(
      classificarAviso(det("ALTO", "V2", "V2 tramo 1: sem vão livre para estribos.")),
    ).toMatchObject({
      fonte: "detalhamento",
      elementoBase: "V2",
    });
    expect(classificarAviso(calc("ALTO", "V2", "qualquer"))).toMatchObject({ fonte: "calculo" });
    expect(classificarAviso({ ...calc("", "", "qualquer"), fonte: "importacao" }).fonte).toBe(
      "importacao",
    );
  });

  it("não muda o aviso: texto, local, elemento e opção ficam iguais", () => {
    const a = calc("ALTO", "V1", "V1: dimensionamento/detalhamento não concluído: x");
    expect(classificarAviso(a)).toMatchObject(a);
  });
});

describe("juntarPontos e resumoDeOnde", () => {
  it("junta pontos do mesmo tipo no plural, sem repetir", () => {
    expect(juntarPontos(["apoio 1", "apoio 2", "apoio 1"])).toBe("apoios 1 e 2");
    expect(juntarPontos(["apoio 1", "apoio 2", "apoio 3", "tramo 2"])).toBe(
      "apoios 1, 2 e 3, tramo 2",
    );
    expect(juntarPontos(["bordo 4"])).toBe("bordo 4");
  });

  it("resume por pavimento e elemento, na ordem da lista", () => {
    const ancoragem = (local: string, viga: string, k: number) =>
      det(
        local,
        viga,
        `${viga} N1: ancoragem no apoio ${k} insuficiente (lb,ef = 10,0 cm < 20,0 cm); use grampos ou aumente o apoio.`,
      );
    const avisos = [
      ancoragem("ALTO", "V1", 1),
      ancoragem("ALTO", "V1", 2),
      ancoragem("ALTO", "V2", 1),
      ancoragem("BAIXO", "V3", 2),
    ].map(classificarAviso);
    expect(resumoDeOnde(avisos)).toBe("ALTO V1 (apoios 1 e 2), V2 (apoio 1); BAIXO V3 (apoio 2)");
  });

  it("aviso sem elemento entra só com o local; sem local nem elemento, fica fora", () => {
    const avisos = [calc("ALTO", "", "a"), calc("", "", "b"), calc("BAIXO", "L1", "c")].map(
      classificarAviso,
    );
    expect(resumoDeOnde(avisos)).toBe("ALTO; BAIXO L1");
  });
});

describe("agruparAvisos", () => {
  const avisos = [
    calc(
      "ALTO",
      "L1",
      "L1: pré-moldada; o LAJECALC não calcula momentos, só a montagem a carrega.",
    ),
    calc(
      "ALTO",
      "L2",
      "L2: pré-moldada; o LAJECALC não calcula momentos, só a montagem a carrega.",
    ),
    calc(
      "ALTO",
      "V9",
      "V9: dimensionamento/detalhamento não concluído: Espaçamento de estribo 7 cm fora da lista do .DSP (erro 5 do QuickBASIC)",
    ),
    det("ALTO", "V1", "V1 tramo 1: sem vão livre para estribos."),
    calc(
      "BAIXO",
      "L3",
      "L3: pré-moldada; o LAJECALC não calcula momentos, só a montagem a carrega.",
    ),
    calc("ALTO", "V1", "V1 tramo 1: sem vão livre para estribos."),
  ];
  const niveis = agruparAvisos(avisos);

  it("ordena erro, atenção e info, com o total de cada nível", () => {
    expect(niveis.map((n) => [n.severidade, n.total])).toEqual([
      ["erro", 1],
      ["atencao", 2],
      ["info", 3],
    ]);
  });

  it("junta os repetidos num grupo com o resumo, e separa a mesma regra por origem", () => {
    const info = niveis.find((n) => n.severidade === "info")!;
    expect(info.grupos).toHaveLength(1);
    expect(info.grupos[0]).toMatchObject({
      grupo: "Lajes pré-moldadas",
      resumo: "ALTO L1, L2; BAIXO L3",
    });
    expect(info.grupos[0]!.avisos.map((a) => a.texto)).toEqual([
      avisos[0]!.texto,
      avisos[1]!.texto,
      avisos[4]!.texto,
    ]);
    const atencao = niveis.find((n) => n.severidade === "atencao")!;
    expect(atencao.grupos.map((g) => g.fonte)).toEqual(["detalhamento", "calculo"]);
  });

  it("não perde nem duplica aviso", () => {
    const textos = niveis.flatMap((n) => n.grupos.flatMap((g) => g.avisos.map((a) => a.texto)));
    expect(textos.sort()).toEqual(avisos.map((a) => a.texto).sort());
  });

  it("lista vazia: nenhum nível", () => {
    expect(agruparAvisos([])).toEqual([]);
  });
});

describe("avisoDaImportacao", () => {
  it.each([
    // [texto, local, elemento, grupo, severidade]
    [
      "ALTO.VIG: Viga V3: cargas do .VIG diferentes das da montagem: valem as do .VIG.",
      "ALTO",
      "V3",
      "Cargas do .VIG diferentes das da montagem",
      "info",
    ],
    [
      "RAMPA.VIG: Viga VR1, apoio 0: o J não traz o número do pilar; pilar VR1.A0.",
      "RAMPA",
      "VR1",
      "Apoio sem número de pilar no .VIG",
      "info",
    ],
    [
      "OBRA.COL: O .COL usa a parametrização XYZ.PIP, que não foi passada: ficam os parâmetros de fábrica.",
      "OBRA.COL",
      "",
      "Parâmetros que não vieram",
      "atencao",
    ],
    [
      "A obra parece usar parâmetros próprios (há .TAB do DESENHO e nenhum .DSP): selecione também os arquivos de C:\\SISTRUT\\EXEC40.",
      "",
      "",
      "Parâmetros que não vieram",
      "atencao",
    ],
    [
      "R7_ALTO.EDV: o ALTO.VIG não tem a viga do registro 7; arquivo ignorado.",
      "R7_ALTO.EDV",
      "",
      "Arquivos não usados",
      "info",
    ],
    [
      "ALTO.BAK, BAIXO.BAK: cópia de segurança do .LAJ ou do .COL anterior, que o LAJEGRAV e o PIGRAEDI guardam ao gravar (LAJEGRAV.BAS:484, PIGRAEDI.BAS:467); não usada.",
      "ALTO.BAK, BAIXO.BAK",
      "",
      "Arquivos não usados",
      "info",
    ],
    [
      "ALTO.VIG: Peso próprio de 150 kg/m em todas as vigas, tomado da parcela uniforme das cargas do .VIG.",
      "ALTO",
      "",
      "Peso próprio tomado do .VIG",
      "atencao",
    ],
    [
      "Pavimentos, do topo para a base: ALTO, BAIXO (pelas cotas do .COL).",
      "",
      "",
      "Ordem dos pavimentos",
      "info",
    ],
    ["Materiais: fck 20 MPa.", "", "", "Outros avisos", "atencao"],
  ])("%s", (texto, local, elemento, grupo, severidade) => {
    const a = avisoDaImportacao(texto);
    expect(a).toEqual({ local, elemento, texto, fonte: "importacao" });
    expect(classificarAviso(a)).toMatchObject({ grupo, severidade });
  });

  it("junta as vigas com cargas diferentes num grupo com o resumo", () => {
    const textos = ["V3", "V5"].map(
      (v) => `ALTO.VIG: Viga ${v}: cargas do .VIG diferentes das da montagem: valem as do .VIG.`,
    );
    textos.push("BAIXO.VIG: Viga V3: cargas do .VIG diferentes das da montagem: valem as do .VIG.");
    const [nivel] = agruparAvisos(textos.map(avisoDaImportacao));
    expect(nivel!.grupos[0]!.resumo).toBe("ALTO V3, V5; BAIXO V3");
  });
});

/// <reference types="node" />
// Importador de pilares do SISTRUT (pilar.ts). Os valores esperados são os escritos
// nos arquivos do original (linha citada em cada comentário) ou nos arquivos
// montados à mão aqui, que seguem o PRINT # do programa que grava cada formato. Os
// arquivos reais estão em src/calculo/sistrut/__oraculo__/arquivos/ (README.md de lá).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerObra, serializarObra } from "../arquivo";
import { obraE2E } from "../../calculo/sistrut/__e2e__/obraE2E";
import { PARAMETROS_PIP } from "../../calculo/sistrut/base/parametros";
import { arquivoOraculo } from "../../calculo/sistrut/__oraculo__/arquivosOraculo";
import { KN_POR_TF as KN } from "../../calculo/unidades";
import type { Obra } from "../../dominio/obra";
import {
  diferencasPip,
  importarPilaresSistrut,
  lerCol,
  lerPil,
  lerPip,
  lerRep,
  lerRlp,
  type Lido,
} from "./pilar";

const COL_GEO = "oraculo/runs/retrad_pil_geo-20261015-082515/obra/E2E.COL";
const COL_NOVE = "oraculo/runs/retrad_frm_sonda_pil-20261014-202358/obra/E2E.COL";
const COL_SONDA = "oraculo/runs/sonda-20261013-221414/obra/E2E.COL";
const COL_FRM = "oraculo/casos/retrad_frm_edita.dados/E2E.COL";
const PIP_SISTRUT = "oraculo/orig/SISTRUT.PIP";
const REP_E2E = "oraculo/casos/caso_c_pilaredi.dados/E2E.REP";

const le = (caminho: string) => readFileSync(arquivoOraculo(caminho), "latin1");

function valor<T>(r: Lido<T>): T {
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return r.valor;
}

function importa(...args: Parameters<typeof importarPilaresSistrut>) {
  const r = importarPilaresSistrut(...args);
  if ("erros" in r) throw new Error(r.erros.join("\n"));
  return r;
}

const pilar = (obra: Obra, id: string) => {
  const p = obra.pavimentos.flatMap((pav) => pav.pilares).find((q) => q.id === id);
  if (!p) throw new Error(`sem o pilar ${id}`);
  return p;
};

/** A obra passa pelo arquivo sem erro e volta igual. */
function idaEVolta(obra: Obra) {
  const lida = lerObra(serializarObra(obra));
  expect(lida.ok ? [] : lida.erros).toEqual([]);
  if (lida.ok) expect(lida.obra).toEqual(obra);
}

// ---------------------------------------------------------------- .COL reais

describe(".COL real de uma coluna (retrad_pil_geo)", () => {
  it("lê níveis, coluna, parâmetros, vínculos, carga e vento", () => {
    const col = valor(lerCol(le(COL_GEO)));
    expect(col.obra).toBe("E2E"); // linha 2 "Obra - E2E"
    // linhas 7-8: " 0 ,FUND" e " 3 ,PAV1"
    expect(col.niveis).toEqual([
      { cota: 0, nome: "FUND" },
      { cota: 3, nome: "PAV1" },
    ]);
    const [p5] = col.colunas;
    // linha 9: "P   5,N ( 1 ) FUND,N ( 2 ) PAV1"
    expect(p5).toMatchObject({ nome: "P   5", nivelInferior: 1, nivelSuperior: 2 });
    // linha 11: "1 [1] 3 [2] 4 [3] 40 [4] 0 [5] 0 [6] .2 [7] 5 [8]A[9]t/cm2[10] 2 [11]{SISTRUT}[12] 1"
    expect(col.parametros).toEqual({
      maximoSecoes: 3,
      maximoVariacoes: 4,
      maximoVertices: 40,
      poligonais: 0,
      totalBarras: 0,
      fck: 0.2,
      fyk: 5,
      classeAco: "A",
      unidade: "t/cm2",
      cobrimento: 2,
      pip: "SISTRUT",
      multiplicadorUnidade: 1,
    });
    expect(col.temVinculos).toBe(true);
    // linhas 12-13: vínculos 0 e 0; 19-24: 17.37, .5, 0, 0, 0, 0; 26: " 1 , .3 , 90 , 0 , 0 "
    expect(p5!.niveis[0]!.vinculo).toBe(0);
    expect(p5!.niveis[1]).toMatchObject({
      nivel: 2,
      vinculo: 0,
      carga: { normal: 17.37, momentos: [{ m: 0.5, inclinacao: 0, vao: 0, rigidez: 0 }] },
      vento: {
        normal: 1,
        momentos: [
          { m: 0.3, angulo: 90 },
          { m: 0, angulo: 0 },
        ],
      },
    });
    // linhas 28-30: sem seções, sem poligonais, sem armaduras; linha 31 "FIM"
    expect([col.temSecoes, col.temArmaduras]).toEqual([false, false]);
  });

  it("gera a obra: PAV1 de 3 m, P5 com a carga do nível 2", () => {
    const { obra, avisos } = importa({ col: le(COL_GEO) });
    expect(obra).toMatchObject({
      versao: 3,
      nome: "E2E",
      norma: "nb1-78",
      modoCalculo: "original",
    });
    // fck .2 t/cm² = 20 MPa, fyk 5 = CA-50, classe A (linha 11)
    expect(obra.materiais).toMatchObject({
      fck: 20,
      aco: "CA-50",
      classeAco: "A",
      cobrimentoPilar: 2,
    });
    expect(obra.pavimentos.map((p) => [p.id, p.nome, p.peDireito])).toEqual([["pav2", "PAV1", 3]]);
    expect(pilar(obra, "P5@pav2")).toEqual({
      id: "P5@pav2",
      nome: "P5",
      x: 0,
      y: 0,
      b: 20,
      h: 20,
      // nível 2 (topo do lance): 17.37 t e .5 tm sem vão (linhas 19-20)
      cargaTopo: {
        normal: 17.37 * KN,
        momentos: [{ m: 0.5 * KN, inclinacao: 0, vao: 0, rigidez: 0 }],
      },
    });
    expect(obra.parametrosPilar).toBeUndefined();
    // o vento foi digitado no nível 2, o topo da coluna: não entra em lance nenhum
    expect(avisos.some((a) => a.includes("vento no nível 2"))).toBe(true);
    expect(avisos.some((a) => a.includes("sem seção no .COL"))).toBe(true);
    idaEVolta(obra);
  });
});

describe(".COL real de 9 colunas com momentos (retrad_frm_sonda_pil)", () => {
  it("lê as cargas com momentos e as seções 20 × 20", () => {
    const col = valor(lerCol(le(COL_NOVE)));
    expect(col.colunas.map((c) => c.nome)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `P   ${i}`),
    );
    const p1 = col.colunas[0]!;
    // linhas 51-60: 1.82, .64, 0, 4, 64000, 1.22, 90, 5, 64000, 0
    expect(p1.niveis[1]!.carga!.normal).toBe(1.82);
    expect(p1.niveis[1]!.carga!.momentos).toEqual([
      { m: 0.64, inclinacao: 0, vao: 4, rigidez: 64000 },
      { m: 1.22, inclinacao: 90, vao: 5, rigidez: 64000 },
    ]);
    // linha 107: P5 17.37 sem momentos
    expect(col.colunas[4]!.niveis[1]!.carga).toMatchObject({ normal: 17.37, momentos: [] });
    // linhas 167-176: V_11b4 1, seções 1, poligonais 0, seção (2, 20, 20, 0, 0, 0, 1)
    expect(p1.secoes).toEqual([
      {
        nivelFinal: 2,
        geometria: { tipo: "retangular", b: 20, h: 20, rotacao: 0 },
        excentricidade: { x: 0, y: 0 },
      },
    ]);
  });

  it("gera a obra com os slots de momento como gravados", () => {
    const { obra } = importa({ col: le(COL_NOVE) });
    // slot A_1280 como gravado (linhas 51-60): |M| e vão +4 = −SGN(M)·4 do .REP; o
    // PILAREDI usa esses números (PILAREDI.BAS:7502-7506)
    expect(pilar(obra, "P1@pav2").cargaTopo).toEqual({
      normal: 1.82 * KN,
      momentos: [
        { m: 0.64 * KN, inclinacao: 0, vao: 4, rigidez: 64000 },
        { m: 1.22 * KN, inclinacao: 90, vao: 5, rigidez: 64000 },
      ],
    });
    // linhas 127-136: P7 1.82, (.64, 0, 4), (1.22, 270, 5)
    expect(pilar(obra, "P7@pav2").cargaTopo).toEqual({
      normal: 1.82 * KN,
      momentos: [
        { m: 0.64 * KN, inclinacao: 0, vao: 4, rigidez: 64000 },
        { m: 1.22 * KN, inclinacao: 270, vao: 5, rigidez: 64000 },
      ],
    });
    expect(pilar(obra, "P5@pav2")).toMatchObject({
      b: 20,
      h: 20,
      cargaTopo: { normal: 17.37 * KN },
    });
    expect(obra.pavimentos[0]!.pilares.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    idaEVolta(obra);
  });

  it("o .COL dos casos retrad_frm é o mesmo formato", () => {
    const col = valor(lerCol(le(COL_FRM)));
    expect(col.colunas).toHaveLength(9);
  });
});

describe(".COL real sem vínculos (sonda)", () => {
  it("vínculos ausentes; carga 17,52 no nível 2", () => {
    const col = valor(lerCol(le(COL_SONDA)));
    // linha 11 começa com " 0 [1]": sem bloco de vínculos; linha 17: 17.52
    expect(col.temVinculos).toBe(false);
    expect(col.colunas[0]!.niveis[1]!.vinculo).toBeUndefined();
    expect(col.colunas[0]!.niveis[1]!.carga!.normal).toBe(17.52);
    const { obra } = importa({ col: le(COL_SONDA) });
    expect(obra.materiais).toMatchObject({ fck: 15, classeAco: "B" });
    expect(pilar(obra, "P5@pav2").cargaTopo).toEqual({ normal: 17.52 * KN, momentos: [] });
  });
});

// ---------------------------------------------------------------- .COL montado

/** .COL montado à mão pelo PRINT # do PIGRAEDI (PIGRAEDI.BAS:470-582): 4 níveis, 3
 *  colunas (retangular com duas seções e armadura, circular com vazado, poligonal que
 *  começa no nível 2), vínculos, cargas com momentos, vento e excentricidade. */
const COL_MONTADO = [
  "SISTRUT Software e Tecnologia s/c Ltda",
  "Obra - MONTADA",
  "Arquivo com dados de PILARES inicializado em 10-15-2026 10:00:00",
  " 4 =NUMERO DE NIVEIS",
  " 3 =NUMERO DE COLUNAS",
  " 4 ,",
  " 0 ,FUND",
  " 3 ,TERREO",
  " 6 ,TIPO",
  " 8.5 ,COBERTURA",
  "P   1,N ( 1 ) FUND,N ( 4 ) COBERTURA",
  "P   2,N ( 1 ) FUND,N ( 2 ) TERREO",
  "P  10,N ( 2 ) TERREO,N ( 4 ) COBERTURA",
  " 0 , 0 , 0 , 0 , 0 , 0 ",
  " 0 , 0 , 0 , 0 , 0 , 0 ",
  " 0 , 0 , 0 , 0 , 0 , 0 ",
  " 1 [1] 3 [2] 4 [3] 40 [4] 1 [5] 7 [6] .25 [7] 4.2 [8]B[9]t/cm2[10] 2.5 [11]{MEUPIP}[12] 1 ",
  // vínculos A = 100·(Ry−1) + (Rx−1): P1 níveis 1-4, P2 1-2, P10 2-4
  [" 402 ", " 0 ", " 1 ", " 200 ", " 0 ", " 0 ", " 0 ", " 0 ", " 0 "],
  " 1 ",
  // P1 nível 1: 2 t na fundação; vento 1,5 t, 0,4 tm a 0°, 0,2 tm a 90°
  [" 2 ", " 0 ", ",,,", " 1.5 , .4 , 0 , .2 , 90 "],
  // P1 nível 2: 10,5 t; (,8, 0°, vão −4: M positivo do .REP) e (1,2, 90°, 5, 64000)
  [" 10.5 ", " .8 ", " 0 ", "-4 ", " 0 ", " 1.2 ", " 90 ", " 5 ", " 64000 ", " 0 "],
  ["V1\u00f71 ,V2\u00f72 ,,", " 0 , 0 , 0 , 0 , 0 "],
  // P1 nível 3: 8 t; vento 0,1 tm a 45°
  [" 8 ", " 0 ", ",,,", " 0 , .1 , 45 , 0 , 0 "],
  // P1 nível 4: 5,25 t; digitados −,3 tm a 45° e ,4 tm com Jvig/Lvig 125; vento no topo
  [" 5.25 ", "-.3 ", " 45 ", " 0 ", " 0 ", " .4 ", " 0 ", " 1 ", " 125 ", " 0 "],
  [",,,", " .5 , 0 , 0 , 0 , 0 "],
  // P2 níveis 1-2; P10 níveis 2-4
  [" 0 ", " 0 ", ",,,", " 0 , 0 , 0 , 0 , 0 "],
  [" 3 ", " 0 ", ",,,", " 0 , 0 , 0 , 0 , 0 "],
  [" 0 ", " 0 ", ",,,", " 0 , 0 , 0 , 0 , 0 "],
  [" 0 ", " 0 ", ",,,", " 0 , 0 , 0 , 0 , 0 "],
  [" 4 ", " 0 ", ",,,", " 0 , 0 , 0 , 0 , 0 "],
  " 0 ",
  // seções: V_11ac 1, uma poligonal
  " 1 ",
  " 1 ",
  // P1: 20 × 30 até o nível 3; 15 × 25 girada 30° até o 4, excentricidade 1,5 e −2,5 cm
  [" 3 ", " 20 ", " 30 ", " 0 ", " 0 ", " 0 ", " 1 "],
  [" 4 ", " 15 ", " 25 ", " 30 ", " 150 ", "-250 ", " 1 ", " 0 "],
  // P2: circular D 30, Dint 10
  [" 2 ", " 30 ", " 10 ", " 0 ", " 0 ", " 0 ", " 2 ", " 0 "],
  // P10: poligonal 1 com 4 vértices em décimos de cm (o par 0 traz 4·10)
  [" 4 ", " 1 ", " 4 ", " 0 ", " 0 ", " 0 ", " 3 "],
  [" 40 ", " 0 ", " 0 ", " 0 ", " 0 ", " 400 ", " 200 ", " 400 ", " 200 ", " 0 ", " 0 "],
  // armaduras: P1 até o nível 3, 4 de ordem 6 (12,5) e 2 de ordem 5 (10), estribo 6,3 c/15
  " 1 ",
  [" 3 ", " 4 ", " 6 ", " 2 ", " 5 ", " 63 ", " 150 "],
  [" 60 ", " 0 ", " 0 "],
  [" 25 ", " 25 ", " 60 ", " 25 ", " 275 ", " 60 ", " 175 ", " 275 ", " 60 "],
  [" 175 ", " 25 ", " 60 ", " 25 ", " 150 ", " 50 ", " 175 ", " 150 ", " 50 "],
  " 0 ",
  " 0 ",
  " 0 ",
  "FIM",
  "",
]
  .flat()
  .join("\r\n");

describe(".COL montado à mão", () => {
  it("lê seções, poligonal, excentricidade e armadura", () => {
    const col = valor(lerCol(COL_MONTADO));
    const [p1, p2, p10] = col.colunas;
    expect(p1!.secoes).toEqual([
      {
        nivelFinal: 3,
        geometria: { tipo: "retangular", b: 20, h: 30, rotacao: 0 },
        excentricidade: { x: 0, y: 0 },
      },
      {
        nivelFinal: 4,
        geometria: { tipo: "retangular", b: 15, h: 25, rotacao: 30 },
        excentricidade: { x: 1.5, y: -2.5 },
      },
    ]);
    expect(p2!.secoes[0]!.geometria).toEqual({ tipo: "circular", d: 30, dInterno: 10 });
    expect(p10!.secoes[0]!.geometria).toEqual({
      tipo: "poligonal",
      vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 20, y: 40 },
        { x: 20, y: 0 },
      ],
    });
    expect(p1!.armaduras).toEqual([
      {
        nivelFinal: 3,
        principal: { quantidade: 4, indiceBitola: 6 },
        secundaria: { quantidade: 2, indiceBitola: 5 },
        estribo: { bitola: 6.3, espacamento: 15 },
        barras: [
          { x: 2.5, y: 2.5, indiceBitola: 6 },
          { x: 2.5, y: 27.5, indiceBitola: 6 },
          { x: 17.5, y: 27.5, indiceBitola: 6 },
          { x: 17.5, y: 2.5, indiceBitola: 6 },
          { x: 2.5, y: 15, indiceBitola: 5 },
          { x: 17.5, y: 15, indiceBitola: 5 },
        ],
      },
    ]);
    expect(p2!.armaduras).toEqual([]);
  });

  it("gera a obra: pavimentos do topo para a base e os lances de cada coluna", () => {
    const { obra, avisos } = importa({ col: COL_MONTADO });
    expect(obra.pavimentos.map((p) => [p.id, p.nome, p.peDireito])).toEqual([
      ["pav4", "COBERTURA", 2.5],
      ["pav3", "TIPO", 3],
      ["pav2", "TERREO", 3],
    ]);
    // fck .25 = 25 MPa; fyk 4,2 t/cm² não é CA-25/50/60 → PILAR.INI; cobrimento [10] 2,5
    expect(obra.materiais).toMatchObject({
      fck: 25,
      aco: "CA-50",
      classeAco: "B",
      cobrimentoPilar: 2.5,
    });
    // as variações gravadas vão em Pilar.armadura; a obra fica no padrão "N"; [2] = 4 não
    // passa do máximo de fábrica (15), e o leitor só aumenta (PIGRAEDI.BAS:969-971)
    expect(obra.parametrosPilar).toEqual({ ini: { fyk: 420 } });
    const com20 = importa({ col: COL_MONTADO.replace("[2] 4 [3]", "[2] 20 [3]") }).obra;
    expect(com20.parametrosPilar?.ini?.maximoVariacoes).toBe(21);
    const barras = [
      { x: 2.5, y: 2.5, bitola: 12.5 },
      { x: 2.5, y: 27.5, bitola: 12.5 },
      { x: 17.5, y: 27.5, bitola: 12.5 },
      { x: 17.5, y: 2.5, bitola: 12.5 },
      { x: 2.5, y: 15, bitola: 10 },
      { x: 17.5, y: 15, bitola: 10 },
    ];
    // lance 1→2: base no nível 1 (A = 402: Rx 3 engaste, Ry 5 semi-engaste; vento do
    // nível 1); carga do nível 2
    expect(pilar(obra, "P1@pav2")).toEqual({
      id: "P1@pav2",
      nome: "P1",
      x: 0,
      y: 0,
      b: 20,
      h: 30,
      vinculos: { x: "engaste", y: "semiEngaste" },
      vento: {
        normal: 1.5 * KN,
        momentos: [
          { m: 0.4 * KN, angulo: 0 },
          { m: 0.2 * KN, angulo: 90 },
        ],
      },
      cargaTopo: {
        normal: 10.5 * KN,
        momentos: [
          { m: 0.8 * KN, inclinacao: 0, vao: -4, rigidez: 0 },
          { m: 1.2 * KN, inclinacao: 90, vao: 5, rigidez: 64000 },
        ],
      },
      // linha do nível 1: 2 t no nível da fundação, só para o resumo na fundação
      cargaBase: { normal: 2 * KN, momentos: [] },
      armadura: { barras, estribo: { bitola: 6.3, espacamento: 15 } },
    });
    expect(pilar(obra, "P1@pav3")).toEqual({
      id: "P1@pav3",
      nome: "P1",
      x: 0,
      y: 0,
      b: 20,
      h: 30,
      cargaTopo: { normal: 8 * KN, momentos: [] },
    });
    // lance 3→4: seção nova girada 30° com excentricidade; A = 1 (Rx 2 livre); topo
    // A = 200 (Ry 3 engaste); digitados como gravados: −,3 com o sinal e ,4 com vão 1 e
    // Jvig/Lvig 125 (PILGEEDI.BAS:2407-2413)
    expect(pilar(obra, "P1@pav4")).toEqual({
      id: "P1@pav4",
      nome: "P1",
      x: 0,
      y: 0,
      b: 15,
      h: 25,
      rotacao: 30,
      vinculos: { x: "livre", y: "continuidade" },
      vinculosTopo: { x: "continuidade", y: "engaste" },
      excentricidade: { x: 1.5, y: -2.5 },
      vento: { normal: 0, momentos: [{ m: 0.1 * KN, angulo: 45 }] },
      cargaTopo: {
        normal: 5.25 * KN,
        momentos: [
          { m: -0.3 * KN, inclinacao: 45, vao: 0, rigidez: 0 },
          { m: 0.4 * KN, inclinacao: 0, vao: 1, rigidez: 125 },
        ],
      },
    });
    expect(pilar(obra, "P2@pav2")).toEqual({
      id: "P2@pav2",
      nome: "P2",
      x: 1,
      y: 0,
      b: 30,
      h: 30,
      secao: { tipo: "circular", d: 30, dInterno: 10 },
      cargaTopo: { normal: 3 * KN, momentos: [] },
    });
    const poligonal = {
      tipo: "poligonal",
      vertices: [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 20, y: 40 },
        { x: 20, y: 0 },
      ],
    };
    expect(pilar(obra, "P10@pav3")).toEqual({
      id: "P10@pav3",
      nome: "P10",
      x: 2,
      y: 0,
      b: 20,
      h: 40,
      secao: poligonal,
    });
    expect(pilar(obra, "P10@pav4")).toMatchObject({
      secao: poligonal,
      cargaTopo: { normal: 4 * KN },
    });
    expect(obra.pavimentos[2]!.pilares.map((p) => p.id)).toEqual(["P1@pav2", "P2@pav2"]);
    for (const trecho of [
      "vento no nível 4",
      "P10 começa no nível 2",
      "MEUPIP.PIP, que não foi passada",
      "não é de CA-25/50/60; gravado nos parâmetros de pilar da obra (PILAR.INI)",
    ])
      expect(
        avisos.some((a) => a.includes(trecho)),
        trecho,
      ).toBe(true);
    idaEVolta(obra);
  });

  it("com o .PIP: bitolas da tabela dele e as diferenças em parametrosPilar.pip", () => {
    const { obra } = importa({ col: COL_MONTADO, pip: PIP_MONTADO });
    expect(obra.parametrosPilar?.pip).toEqual(diferencasPip(valor(lerPip(PIP_MONTADO))));
    expect(obra.materiais.cobrimentoPilar).toBe(2.5);
    idaEVolta(obra);
  });

  it("erro com a linha quando o arquivo acaba antes", () => {
    const corte = COL_MONTADO.split("\r\n").slice(0, 20).join("\r\n");
    const r = importarPilaresSistrut({ col: corte });
    expect("erros" in r && r.erros[0]).toMatch(/^\.COL, linha \d+: o arquivo acabou antes de/);
  });
});

// ---------------------------------------------------------------- .PIP

/** Linhas de bitola com as colunas do SISTRUT.PIP (VAL(MID$(l, 10)) e VAL(MID$(l, 25))). */
const BITOLAS_PIP = [
  "  0  -         3.2 -                 0.08  -            0.063",
  "  1  -         4   -                 0.125 -            0.10",
  "  2  -         5   -                 0.20  -            0.16",
  "  3  -         6.3 -                 0.315 -            0.25",
  "  4  -         8   -                 0.5   -            0.40",
  "  5  -        10   -                 0.8   -            0.63",
  "  6  -        12.5 -                 1.25  -            1.0",
  "  7  -        16   -                 2.0   -            1.6",
  "  8  -        20   -                 3.15  -            2.5",
  "  9  -        22.2 -                 3.88  -            3.05",
  " 10  -        25   -                 5.0   -            4.0",
  " 11  -        32   -                 8.0   -            6.3",
  " 12  -        40   -                12.50  -           10.0",
];

/** .PIP montado à mão na ordem que S_23c9a lê (PILAREDI.BAS:1894-1993), com o
 *  SISTRUT.PIP de fábrica alterado em: cobrimento 2,5; Nk/A 0,5; medida mínima 15; sem
 *  peso próprio; densidade 2,4; reduz na fundação; taxa máxima 4; sem misturar
 *  bitolas; espaçamento mínimo 7 na de 12,5; estribo de 5 mm na de 10. */
const PIP_MONTADO = [
  "* PARAMETRIZACAO MONTADA",
  "PARAMETROS GLOBAIS",
  "2.5               COBRIMENTO DA ARMADURA PARA DETALHAMENTO (CM)",
  "* * * * *",
  "ORDEM        BITOLA (MM)           AREA (CM2)        PESO (KG/M)",
  ...BITOLAS_PIP,
  "* * * * *",
  "PARAMETROS",
  "0.5               MULTIPLICADOR DE Fck PARA TENSAO ADMISSIVEL (Nk/Area)",
  "0.75              MULTIPLICADOR DE Fck PARA TENSAO ADMISSIVEL (Nk/Area+Mk/W)",
  "1.50              TAXA IDEAL DE ARMADURA NA SECAO PARA PREDIMENSIONAMENTO (%)",
  "15                MINIMA MEDIDA DA COLUNA PARA PREDIMENSIONAMENTO",
  "5                 MULTIPLO DA MEDIDA DA SECAO DA COLUNA PARA PREDIMENSIONAMENTO",
  "N                 ACRESCENTO O PESO PROPRIO DA COLUNA",
  "2.40              DENSIDADE DO CONCRETO PARA O CALCULO DO PESO PROPRIO (t/m3)",
  "10                PORCENTAGEM DA CARGA TOTAL DA COLUNA CONSIDERADA ACIDENTAL",
  "S                 REDUZO PARA FUNDACAO PARCELA ACIDENTAL DE CARGA (S/N)",
  "N                 REDUZO PARA DIMENSIONAMENTO PARCELA ACIDENTAL DE CARGA (S/N)",
  "* * * * *",
  "PARAMETROS",
  "                    ENGASTE    SEMI-ENGASTE   CONTINUIDADE     LIVRE",
  "   ENGASTE       ,    0.50  ,      0.70     ,    0.70      ,   2.00",
  "   SEMI-ENGASTE  ,    0.70  ,      0.90     ,    0.85      ,   2.00",
  "   CONTINUIDADE  ,    0.70  ,      0.85     ,    1.00      ,   2.00",
  "   LIVRE         ,    2.00  ,      2.00     ,    2.00      ,   NAO",
  "* * * * *",
  "PARAMETROS",
  "0.8               MINIMA PORCENTAGEM DE ARMADURA EM RELACAO A SECAO CALCULADA",
  "0.5               MINIMA PORCENTAGEM DE ARMADURA EM RELACAO A SECAO REAL",
  "4.0               MAXIMA PORCENTAGEM DE ARMADURA EM RELACAO A AREA DA SECAO",
  "S                 CONSIDERO TRANSPASSE DA ARMADURA PARA CALCULO DA TAXA",
  "N                 MISTURO BITOLAS NA SECAO NO DIMENSIONAMENTO DA ARMADURA",
  "5                 NUMERO DE ORDEM DA MINIMA BITOLA LONGITUDINAL A SER UTILIZADA",
  "* * * * *",
  "PARAMETROS",
  "         0    ,     3.2        ,        4.0        ,        25.0",
  "         1    ,     4.0        ,        4.0        ,        30.0",
  "         2    ,     5.0        ,        4.0        ,        35.0",
  "         3    ,     6.3        ,        4.0        ,        35.0",
  "         4    ,     8.0        ,        5.0        ,        40.0",
  "         5    ,    10.0        ,        5.0        ,        40.0",
  "         6    ,    12.5        ,        7.0        ,        40.0",
  "         7    ,    16.0        ,        6.0        ,        40.0",
  "         8    ,    20.0        ,        6.0        ,        40.0",
  "         9    ,    22.2        ,        8.0        ,        40.0",
  "        10    ,    25.0        ,        8.0        ,        40.0",
  "        11    ,    32.0        ,        8.0        ,        40.0",
  "        12    ,    40.00       ,       10.0        ,        40.0",
  "* * * * *",
  "PARAMETROS",
  "      0   ,         3.2           ,        NAO           ,         NAO",
  "      1   ,         4.0           ,        NAO           ,         NAO",
  "      2   ,         5.0           ,        NAO           ,         NAO",
  "      3   ,         6.3           ,        NAO           ,         NAO",
  "      4   ,         8.0           ,        NAO           ,         NAO",
  "      5   ,        10.0           ,        5.0           ,        12.0",
  "      6   ,        12.5           ,        6.3           ,        15.0",
  "      7   ,        16.0           ,        6.3           ,        15.0",
  "      8   ,        20.0           ,        6.3           ,        20.0",
  "      9   ,        22.2           ,        8.0           ,        25.0",
  "     10   ,        25.0           ,        8.0           ,        25.0",
  "     11   ,        32.0           ,        8.0           ,        30.0",
  "     12   ,        40.0           ,        8.0           ,        30.0",
  "* * * * *",
  "",
].join("\r\n");

describe(".PIP", () => {
  it("SISTRUT.PIP de fábrica: só a área 0,00 de 3,2 e 4 mm difere", () => {
    const pip = valor(lerPip(le(PIP_SISTRUT)));
    // linhas 43-44: "0.00" nas bitolas 3,2 e 4; o resto igual ao embutido (PILAREDI.BAS:1834-1890)
    expect(diferencasPip(pip)).toEqual({
      bitolas: PARAMETROS_PIP.bitolas.map((b, i) => (i < 2 ? { ...b, area: 0 } : b)),
    });
    // linha 32: cobrimento 2; linha 77: 2,50 t/m³; linha 105: "NAO" → 100
    expect(pip.cobrimento).toBe(2);
    expect(pip.densidade).toBe(2.5 * KN);
    expect(pip.coeficienteFlambagem[3]![3]).toBe(100);
    // linha 162: estribo 6,3 c/12 na de 10 mm
    expect(pip.estriboPorBitola[5]).toEqual({ bitola: 6.3, espacamento: 12 });
  });

  it("montado: as diferenças são as alterações", () => {
    const pip = valor(lerPip(PIP_MONTADO));
    const bitolas = PARAMETROS_PIP.bitolas.map((b, i) =>
      i === 6 ? { ...b, espacamentoMinimo: 7 } : b,
    );
    const estribos = PARAMETROS_PIP.estriboPorBitola.map((e, i) =>
      i === 5 ? { bitola: 5, espacamento: 12 } : e,
    );
    expect(diferencasPip(pip)).toEqual({
      cobrimento: 2.5,
      tensaoAdmissivelNormal: 0.5,
      medidaMinima: 15,
      pesoProprio: false,
      densidade: 2.4 * KN,
      reduzAcidentalFundacao: true,
      taxaMaxima: 4,
      misturaBitolas: false,
      bitolas,
      estriboPorBitola: estribos,
    });
  });

  it('com o nome "SISTRUT" no .COL o .PIP passado é ignorado', () => {
    const { obra, avisos } = importa({ col: le(COL_GEO), pip: PIP_MONTADO });
    expect(obra.parametrosPilar).toBeUndefined();
    expect(obra.materiais.cobrimentoPilar).toBe(2);
    expect(avisos.some((a) => a.includes('"SISTRUT"'))).toBe(true);
  });
});

// ---------------------------------------------------------------- .PIL

/** .PIL montados à mão pelo PRINT # do PILAR (PILAR.BAS:7690-7745): A_185a 0..8,
 *  A_16ea (contagem e n + 3 pares, o 0 com a contagem, os dois últimos repetindo 1 e
 *  2), A_1718 (contagem e m + 1 trincas), A_168e (6) e A_1888 (3). */
const PIL_RETANGULAR = [
  [" 1 ", " 20 ", " 30 ", " 2.5 ", " 2 ", " 2 ", " 1 ", " 15 ", " 15 "],
  " 4 ",
  [
    " 4 ",
    " 0 ",
    " 0 ",
    " 0 ",
    " 0 ",
    " 30 ",
    " 20 ",
    " 30 ",
    " 20 ",
    " 0 ",
    " 0 ",
    " 0 ",
    " 0 ",
    " 30 ",
  ],
  " 6 ",
  [" 6 ", " 0 ", " 0 "],
  [" 2.5 ", " 27.5 ", " 12.5 ", " 17.5 ", " 27.5 ", " 12.5 "],
  [" 2.5 ", " 2.5 ", " 12.5 ", " 17.5 ", " 2.5 ", " 12.5 "],
  [" 2.5 ", " 15 ", " 10 ", " 17.5 ", " 15 ", " 10 "],
  [" 1 ", " 0 ", " 0 ", " 0 ", " 0 ", " 0 "],
  [" 12.5 ", " 10 ", " 0 "],
]
  .flat()
  .join("\r\n");

/** Circular: A_185a 5..8 = 0 (PILAR.BAS:1390-1393); vértice único (D, Dint)
 *  repetido (PILAR.BAS:3549-3557). */
const PIL_CIRCULAR = [
  [" 2 ", " 40 ", " 10 ", " 3 ", " 4 ", " 0 ", " 0 ", " 0 ", " 0 "],
  " 1 ",
  [" 1 ", " 0 ", " 40 ", " 10 ", " 40 ", " 10 ", " 40 ", " 10 "],
  " 4 ",
  [" 4 ", " 0 ", " 0 "],
  [" 37 ", " 20 ", " 16 ", " 20 ", " 37 ", " 16 ", " 3 ", " 20 ", " 16 ", " 20 ", " 3 ", " 16 "],
  [" 1 ", " 0 ", " 0 ", " 0 ", " 0 ", " 0 "],
  [" 16 ", " 0 ", " 0 "],
]
  .flat()
  .join("\r\n");

/** Poligonal em L, horária: A_185a 1, 2 e 4..8 sobram de uma seção anterior
 *  (PILAR.BAS:1396-1397 só grava 0 e 3); 6 vértices. */
const PIL_POLIGONAL = [
  [" 3 ", " 20 ", " 30 ", " 2 ", " 2 ", " 2 ", " 1 ", " 15 ", " 15 "],
  " 6 ",
  [" 6 ", " 0 ", " 0 ", " 0 ", " 0 ", " 40 ", " 20 ", " 40 ", " 20 ", " 20 "],
  [" 40 ", " 20 ", " 40 ", " 0 ", " 0 ", " 0 ", " 0 ", " 40 "],
  " 3 ",
  [" 3 ", " 0 ", " 0 "],
  [" 3 ", " 3 ", " 10 ", " 3 ", " 37 ", " 10 ", " 37 ", " 3 ", " 10 "],
  [" 1 ", " 0 ", " 0 ", " 0 ", " 0 ", " 0 "],
  [" 10 ", " 0 ", " 0 "],
]
  .flat()
  .join("\r\n");

describe(".PIL montado à mão", () => {
  it("retangular", () => {
    const r = lerPil(PIL_RETANGULAR);
    expect(r.ok && r.avisos).toEqual([]);
    expect(valor(r)).toEqual({
      b: 20,
      h: 30,
      cobrimento: 2.5,
      barras: [
        { x: 2.5, y: 27.5, bitola: 12.5 },
        { x: 17.5, y: 27.5, bitola: 12.5 },
        { x: 2.5, y: 2.5, bitola: 12.5 },
        { x: 17.5, y: 2.5, bitola: 12.5 },
        { x: 2.5, y: 15, bitola: 10 },
        { x: 17.5, y: 15, bitola: 10 },
      ],
      bitolas: [12.5, 10, 0],
    });
  });

  it("circular com vazado", () => {
    expect(valor(lerPil(PIL_CIRCULAR))).toEqual({
      b: 40,
      h: 40,
      secao: { tipo: "circular", d: 40, dInterno: 10 },
      cobrimento: 3,
      barras: [
        { x: 37, y: 20, bitola: 16 },
        { x: 20, y: 37, bitola: 16 },
        { x: 3, y: 20, bitola: 16 },
        { x: 20, y: 3, bitola: 16 },
      ],
      bitolas: [16, 0, 0],
    });
  });

  it("poligonal", () => {
    expect(valor(lerPil(PIL_POLIGONAL))).toEqual({
      b: 40,
      h: 40,
      secao: {
        tipo: "poligonal",
        vertices: [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 20, y: 40 },
          { x: 20, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 0 },
        ],
      },
      cobrimento: 2,
      barras: [
        { x: 3, y: 3, bitola: 10 },
        { x: 3, y: 37, bitola: 10 },
        { x: 37, y: 3, bitola: 10 },
      ],
      bitolas: [10, 0, 0],
    });
  });

  it("gravado com APPEND: lê a primeira seção e avisa", () => {
    const r = lerPil(`${PIL_RETANGULAR}\r\n${PIL_CIRCULAR}\r\n`);
    expect(valor(r).b).toBe(20);
    expect(r.ok && r.avisos.length).toBe(1);
  });

  it("tipo desconhecido é erro", () => {
    const r = lerPil(PIL_RETANGULAR.replace(" 1 ", " 4 "));
    expect(r.ok ? [] : r.erros[0]).toMatch(/tipo de seção 4 desconhecido/);
  });

  it("na obra nova, vira a seção e a verificação das colunas sem seção no .COL", () => {
    const { obra } = importa({ col: le(COL_GEO), pil: PIL_CIRCULAR });
    expect(pilar(obra, "P5@pav2")).toMatchObject({
      b: 40,
      h: 40,
      secao: { tipo: "circular", d: 40, dInterno: 10 },
      verificacoes: [{ barras: valor(lerPil(PIL_CIRCULAR)).barras }],
    });
    idaEVolta(obra);
  });
});

// ---------------------------------------------------------------- .REP

describe(".REP", () => {
  it("lê o E2E.REP do caso_c_pilaredi", () => {
    const linhas = valor(lerRep(le(REP_E2E)));
    expect(linhas).toHaveLength(9);
    // linhas 22-24: "P   5        17.37", parcelas 6.93 (V2) + 10.44 (V5), ">" sem momentos
    const p5 = linhas.find((l) => l.pilar.startsWith("P   5"))!;
    expect(p5.total).toBe(17.37);
    expect(p5.parcelas.map((p) => [p.viga, p.valor])).toEqual([
      ["V2", 6.93],
      ["V5", 10.44],
    ]);
    expect(p5.momentos).toEqual([]);
    // linhas 10-12: "P   7         1.82", ">-.64@1 [4]  (V1) > -1.22@2 [5]  (V4) > "
    const p7 = linhas[0]!;
    expect(p7.total).toBe(1.82);
    expect(p7.momentos.map((m) => [m.texto, m.vao, m.viga, m.apoio])).toEqual([
      ["-.64", 4, "V1", 1],
      ["-1.22", 5, "V4", 2],
    ]);
  });

  it("importa as cargas do .REP no nível 2 (substitui as do .COL)", () => {
    const { obra, avisos } = importa({
      col: le(COL_NOVE),
      reps: [{ texto: le(REP_E2E), nivelInicial: 2, nivelFinal: 2 }],
    });
    expect(pilar(obra, "P5@pav2").cargaTopo).toEqual({ normal: 17.37 * KN, momentos: [] });
    // M −.64 e −1.22 lidos como o PILGEEDI grava: |M| e vão·(−SGN(M)) = +4 e +5;
    // inclinação e rigidez 0 (PILGEEDI.BAS:606-608)
    expect(pilar(obra, "P7@pav2").cargaTopo).toEqual({
      normal: 1.82 * KN,
      momentos: [
        { m: 0.64 * KN, inclinacao: 0, vao: 4, rigidez: 0 },
        { m: 1.22 * KN, inclinacao: 0, vao: 5, rigidez: 0 },
      ],
    });
    expect(avisos).toContain("As cargas gravadas no .COL foram trocadas pelas dos .REP.");
    idaEVolta(obra);
  });

  it("pilar do .REP sem coluna: aviso", () => {
    const { obra, avisos } = importa({
      col: le(COL_SONDA),
      reps: [{ texto: le(REP_E2E), nivelInicial: 2, nivelFinal: 2, modo: "soma" }],
    });
    expect(pilar(obra, "P5@pav2").cargaTopo).toEqual({ normal: 17.37 * KN, momentos: [] });
    expect(avisos.filter((a) => a.includes("não casa com nenhuma coluna"))).toHaveLength(8);
  });

  it("faixa de níveis fora do .COL é erro", () => {
    const r = importarPilaresSistrut({
      col: COL_MONTADO,
      reps: [{ texto: "", nivelInicial: 0, nivelFinal: 9 }],
    });
    expect("erros" in r && r.erros.some((e) => e.includes("fora de 1..4"))).toBe(true);
  });
});

// ---------------------------------------------------------------- completar uma obra

describe("completar a obra E2E", () => {
  it("sem cargas: casa P1..P9 e não mexe em lajes e vigas", () => {
    const base = obraE2E("original");
    const { obra, avisos } = importa({ col: le(COL_NOVE) }, { base });
    expect(avisos).toEqual([]);
    // o .COL dá 20 × 20, continuidade e nenhum vento: os pilares ficam como estavam
    expect(obra).toEqual(base);
    idaEVolta(obra);
  });

  it("com cargas: cargaTopo do nível 2", () => {
    const base = obraE2E("original");
    const { obra } = importa({ col: le(COL_NOVE) }, { base, cargas: true });
    expect(pilar(obra, "P5").cargaTopo).toEqual({ normal: 17.37 * KN, momentos: [] });
    expect(pilar(obra, "P1").cargaTopo?.momentos[1]).toEqual({
      m: 1.22 * KN,
      inclinacao: 90,
      vao: 5,
      rigidez: 64000,
    });
    expect(obra.pavimentos[0]!.lajes).toEqual(base.pavimentos[0]!.lajes);
    expect(obra.pavimentos[0]!.vigas).toEqual(base.pavimentos[0]!.vigas);
    expect(base.pavimentos[0]!.pilares[4]!.cargaTopo).toBeUndefined();
    idaEVolta(obra);
  });

  it("materiais diferentes vão para o PILAR.INI e o que não casou é avisado", () => {
    const { obra, avisos } = importa({ col: le(COL_GEO) }, { base: obraE2E("original") });
    // fck .2 e classe A (linha 11) contra 15 MPa e classe B da obra
    expect(obra.parametrosPilar).toEqual({ ini: { fck: 20, classeAco: "A" } });
    expect(obra.materiais.fck).toBe(15);
    expect(avisos.filter((a) => a.includes("não casa com nenhuma coluna"))).toHaveLength(8);
    idaEVolta(obra);
  });

  it("seção, vínculos, excentricidade e vento do .COL montado", () => {
    const base = obraE2E("original");
    const tres = {
      ...base,
      pavimentos: [0, 1, 2].map((i) => ({ ...base.pavimentos[0]!, id: `N${i}`, nome: `N${i}` })),
    };
    // ids únicos por pavimento
    tres.pavimentos = tres.pavimentos.map((pav) => ({
      ...pav,
      lajes: pav.lajes.map((l) => ({ ...l, id: `${l.id}-${pav.id}` })),
      vigas: pav.vigas.map((v) => ({ ...v, id: `${v.id}-${pav.id}` })),
      pilares: pav.pilares.map((p) => ({ ...p, id: `${p.id}-${pav.id}` })),
    }));
    const { obra, avisos } = importa({ col: COL_MONTADO }, { base: tres });
    // pavimentos[2] é o de baixo: lance 1→2; pavimentos[0], lance 3→4
    expect(pilar(obra, "P1-N2")).toMatchObject({
      b: 20,
      h: 30,
      vinculos: { x: "engaste", y: "semiEngaste" },
    });
    expect(pilar(obra, "P1-N0")).toMatchObject({
      b: 15,
      h: 25,
      excentricidade: { x: 1.5, y: -2.5 },
      vinculosTopo: { x: "continuidade", y: "engaste" },
    });
    expect(pilar(obra, "P1-N0").cargaTopo).toBeUndefined();
    expect(pilar(obra, "P2-N2").secao).toEqual({ tipo: "circular", d: 30, dInterno: 10 });
    expect(pilar(obra, "P2-N1")).toEqual(pilar(tres, "P2-N1"));
    expect(
      avisos.some(
        (a) => a.includes("Pilar P2 do pavimento N1") && a.includes("não tem o lance 2→3"),
      ),
    ).toBe(true);
    expect(avisos.some((a) => a.includes("pé-direito 3 m, e o .COL dá 2,5 m"))).toBe(true);
    expect(obra.parametrosPilar?.ini).toEqual({ fck: 25, fyk: 420 });
    idaEVolta(obra);
  });
});

// ---------------------------------------------------------------- .RLP e transição (rodada 2)

const RLP_E2E = "oraculo/casos/caso_c_pilaredi.dados/E2E.RLP";

describe(".RLP", () => {
  it("lê o E2E.RLP: 9 pilares com 0,000 t e as inclinações", () => {
    const rlp = valor(lerRlp(le(RLP_E2E)));
    // linhas 8-9: "P1                   0.000" e "V3[0] >V4[90] >"; linhas 20-21: P7
    expect(rlp).toHaveLength(9);
    expect(rlp[0]).toEqual({ pilar: "P1", normal: 0, inclinacoes: "V3[0] >V4[90] >" });
    expect(rlp.find((p) => p.pilar === "P7")?.inclinacoes).toBe("V1[0] >V4[270] >");
    expect(rlp.find((p) => p.pilar === "P5")?.inclinacoes).toBe("");
  });

  it(".REP com o .RLP: a inclinação de cada momento vem do .RLP (PILGEEDI.BAS:1021-1023)", () => {
    const { obra } = importa({
      col: le(COL_NOVE),
      reps: [{ texto: le(REP_E2E), nivelInicial: 2, nivelFinal: 2, rlp: le(RLP_E2E) }],
    });
    // P7: ">-.64@1 [4]  (V1) > -1.22@2 [5]  (V4) >" e "V1[0] >V4[270] >"
    expect(pilar(obra, "P7@pav2").cargaTopo?.momentos.map((m) => m.inclinacao)).toEqual([0, 270]);
    // P1: "V3[0] >V4[90] >"
    expect(pilar(obra, "P1@pav2").cargaTopo?.momentos.map((m) => m.inclinacao)).toEqual([0, 90]);
    idaEVolta(obra);
  });

  it(".RLP com carga de laje no pilar: soma na normal depois da do .REP (PILGEEDI.BAS:1017)", () => {
    const rep = [
      "SISTRUT Software e Tecnologia s/c Ltda",
      "Versao 4.0    Abril 1990",
      "",
      " SOMATORIA DE REACOES EM PILARES",
      " OBRA X",
      " GERADO EM 10-14-2026   21:15",
      " REGISTROS 1 A 1",
      " Cargas Totais  Reacoes Estaticas",
      "",
      "P   1        10.00",
      "*10.00 (V1) + ",
      ">",
      "",
    ].join("\r\n");
    // montado pelo PRINT # do LAJEMONT (LAJEMONT.BAS:600-625): "P1", TAB(16), #######.###
    const rlp = [
      "SISTRUT Software e Tecnologia s/c Ltda",
      "Versao 4.0    Abril 1991",
      "",
      " SOMATORIA DE REACOES EM PILARES E INCLINACOES GERADAS PELAS LAJES",
      " OBRA X",
      " GERADO EM 10-14-2026   21:14",
      "",
      "P1                   2.500",
      "",
      "FIM",
      "",
    ].join("\r\n");
    const col = [
      "SISTRUT Software e Tecnologia s/c Ltda",
      "Obra - X",
      "Arquivo com dados de PILARES inicializado em 10-14-2026 12:00:00",
      " 2 =NUMERO DE NIVEIS",
      " 1 =NUMERO DE COLUNAS",
      " 2 ,",
      " 0 ,FUND",
      " 3 ,PAV1",
      "P   1,N ( 1 ) FUND,N ( 2 ) PAV1",
      " 0 , 0 , 0 , 0 , 0 , 0 ",
      " 0 [1] 3 [2] 4 [3] 40 [4] 0 [5] 0 [6] .15 [7] 5 [8]B[9]t/cm2[10] 2 [11]{SISTRUT}[12] 1 ",
      " 0 ",
      " 0 ",
      " 0 ",
      " 0 ",
      "FIM",
      "",
    ].join("\r\n");
    const { obra } = importa({ col, reps: [{ texto: rep, nivelInicial: 2, nivelFinal: 2, rlp }] });
    expect(pilar(obra, "P1@pav2").cargaTopo?.normal).toBeCloseTo(12.5 * KN, 6);
  });
});

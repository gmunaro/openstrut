// Fixtures da importação de obras do SISTRUT (telas/InicioSistrut*.test.ts): a obra E2E
// do oráculo e um prédio sintético montado do .LAJ da E2E editado linha a linha e de um
// .COL no formato do PIGRAEDI.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ArquivoEntrada } from "../InicioSistrut";

// a partir da raiz do projeto: no ambiente jsdom o import.meta.url não é file:
const PASTA = `${resolve(process.cwd(), "src/telas/__fixtures__/sistrut")}/`;

/** Lê um arquivo da pasta de fixtures como o seletor do navegador o entregaria. */
export const arquivo = (nome: string): ArquivoEntrada => ({
  nome,
  dados: new Uint8Array(readFileSync(`${PASTA}${nome}`)),
});
/** Arquivo com outro nome (o conteúdo de `origem`) ou com o texto dado. */
export const comNome = (nome: string, origem: string | ArquivoEntrada): ArquivoEntrada => ({
  nome,
  dados: typeof origem === "string" ? new Uint8Array(Buffer.from(origem, "latin1")) : origem.dados,
});

export const OBRA_E2E: ArquivoEntrada[] = [
  "E2E.LAJ",
  "E2E.VIG",
  "E2E.SEC",
  "SISTRUT.DSP",
  "E2E.COL",
  "SISTRUT.PIP",
  "E2E.REP",
  "E2E.RLP",
].map(arquivo);

/** Serialização sem os ids: importadores de viga e pilar geram ids novos a cada chamada. */
export const semIds = (valor: unknown): string =>
  JSON.stringify(valor).replace(/"id":"[^"]*"/g, '"id":"_"');

// ---------------------------------------------------------------- prédio sintético

/** O E2E.LAJ com as linhas trocadas (número da linha → valor), em CRLF como o original. */
export function lajE2E(troca: Record<number, string> = {}): string {
  const linhas = readFileSync(`${PASTA}E2E.LAJ`, "latin1").split(/\r?\n/);
  for (const [k, v] of Object.entries(troca)) linhas[Number(k) - 1] = ` ${v} `;
  return linhas.join("\r\n");
}
// linhas do E2E.LAJ: 34 = A_1014(0,0), a próxima linha livre; 35 = A_1014(0,1), o número
// de áreas; 36-49 = as linhas de A_1014 (n, total e acidental, 4 vértices e a livre); 78 =
// número de lajes; 147, 156, 165 e 174 = tipo de cada painel
/** Área começando em (8; 0): a linha livre fica com o ponto que fecha o polígono, como o
 *  LAJEGEOM a deixa, e a coluna 2 da linha do nº de vértices com lixo (o COB.LAJ de 1994
 *  que deu "cargasOcupacao[3].poligono: esperados pelo menos 3 pontos"). */
export const COM_VAGA_SUJA = lajE2E({
  37: ".275",
  40: "8",
  41: "0",
  42: "8",
  43: "10",
  44: "0",
  45: "10",
  46: "0",
  47: "0",
  48: "8",
  49: "0",
});
/** Os 4 painéis como buraco (tipo 2): o térreo sobre o solo, só com vigas baldrame. */
export const SO_BURACOS = lajE2E({ 78: "0", 147: "2", 156: "2", 165: "2", 174: "2" });

/** .COL do PIGRAEDI (PIGRAEDI.BAS:470-582) com os níveis dados, de baixo para cima, e as
 *  colunas P1..Pn do primeiro ao último nível, sem vínculos, cargas nem armaduras; com
 *  `secoes`, a seção quadrada de lado secoes[j] no lance j → j + 1 (1-based) de todas. */
export function colPredio(
  niveis: [string, number][],
  colunas: number,
  secoes: number[] = [],
): string {
  const n = niveis.length;
  const secao = secoes.flatMap((lado, j) => [j + 2, lado, lado, 0, 0, 0, 1].map((x) => ` ${x} `));
  return [
    "SISTRUT Software e Tecnologia s/c Ltda",
    "Obra - PREDIO",
    "Arquivo com dados de PILARES inicializado em 01-01-1994 00:00:00",
    ` ${n} =NUMERO DE NIVEIS`,
    ` ${colunas} =NUMERO DE COLUNAS`,
    ` ${n} ,`,
    ...niveis.map(([nome, cota]) => ` ${cota} ,${nome}`),
    ...Array.from(
      { length: colunas },
      (_, i) => `P${i + 1},N ( 1 ) ${niveis[0]![0]},N ( ${n} ) ${niveis[n - 1]![0]}`,
    ),
    ...Array.from({ length: colunas }, () => " 0 , 0 , 0 , 0 , 0 , 0 "),
    " 0 [1] 3 [2] 4 [3] 40 [4] 0 [5] 0 [6] .15 [7] 5 [8]B[9]t/cm2[10] 2 [11]{SISTRUT}[12] 1 ",
    " 0 ", // sem cargas
    secoes.length > 0 ? " 1 " : " 0 ", // seções
    " 0 ", // poligonais
    ...(secoes.length > 0 ? Array.from({ length: colunas }, () => [...secao, " 0 "]).flat() : []),
    " 0 ", // sem armaduras
    "FIM",
  ].join("\r\n");
}

/** TETO (laje com a vaga de A_1014 suja, vigas do .VIG) sobre BASE (só buracos), com o
 *  .COL de níveis FUND (0), BASE (0,4 m) e TETO (3,4 m): BASE vem antes de TETO na ordem
 *  alfabética, e a ordem certa só sai das cotas. Mais um .REP e um .RLP do TETO, uma
 *  viga avulsa (ESCADA.VIG, sem .LAJ), uma cópia de segurança e um desenho editado. */
export const PREDIO: ArquivoEntrada[] = [
  comNome("TETO.LAJ", COM_VAGA_SUJA),
  comNome("TETO.VIG", arquivo("E2E.VIG")),
  comNome("TETO.SEC", arquivo("E2E.SEC")),
  comNome("TETO.FOR", arquivo("E2E.FOR")),
  comNome("BASE.LAJ", SO_BURACOS),
  comNome(
    "PREDIO.COL",
    colPredio(
      [
        ["FUND", 0],
        ["BASE", 0.4],
        ["TETO", 3.4],
      ],
      9,
    ),
  ),
  comNome("TETO.REP", arquivo("E2E.REP")),
  comNome("TETO.RLP", arquivo("E2E.RLP")),
  comNome("ESCADA.VIG", arquivo("E2E.VIG")),
  comNome("TETO.BAK", COM_VAGA_SUJA),
  comNome("R5__TETO.EDV", " 1 \r\n"),
];

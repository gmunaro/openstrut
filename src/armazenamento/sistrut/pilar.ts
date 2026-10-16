// Importador da parte de PILAR das obras do SISTRUT 4.0 (1991): lê os arquivos da
// família PILAREDI e gera uma Obra da V2, ou completa uma existente, para o motor
// (`calculo/sistrut/obra.ts`) reproduzir o PILAREDI. Entrada é o texto dos arquivos;
// o módulo não lê disco.
//
// Arquivos (fontes retraduzidas em `_Arquivo/Sistrust/dist/src-original/pilar/`):
// - .COL: colunas do PILGEEDI, gravado e lido pelo PIGRAEDI (gravação L_11b82,
//   PIGRAEDI.BAS:466-583; leitura L_13f97, PIGRAEDI.BAS:825-1063).
// - .PIP: parametrização do PILAREDI (S_23c9a, PILAREDI.BAS:1832-1993). Com o nome
//   "SISTRUT" o original não lê o arquivo: usa a tabela embutida (PILAREDI.BAS:1833),
//   que é `PARAMETROS_PIP`.
// - .PIL: seção avulsa do PILAR (gravação PILAR.BAS:7683-7750, leitura 7752-7808).
// - .REP: reações das vigas que o PILGEEDI lê na opção 5 (PILGEEDI.BAS:530-720); a
//   associação por número do pilar e os modos são os de `leCargasRep`.
//
// Unidades: o original grava t, tm, m e cm; a obra sai em kN, kN·m (t × 9,80665), m e
// cm, bitolas em mm. Níveis do .COL são 1-based, de baixo para cima; o nível 1 é a
// fundação. O lance j de uma coluna vai do nível j (base) ao j + 1 (topo) e é o pilar
// do pavimento do nível j + 1.
import {
  VINCULOS_PILAR,
  type Aco,
  type BarraPilarObra,
  type CargaTopoPilar,
  type ClasseAco,
  type IniPilar,
  type Materiais,
  type Obra,
  type ParametrosPilarObra,
  type Pavimento,
  type Pilar,
  type PipPilar,
  type PontoSecao,
  type SecaoNaoRetangular,
  type VentoPilar,
  type VinculosPilar,
} from "../../dominio/obra";
import { qbCint } from "../../calculo/sistrut/base/f32";
import {
  PARAMETROS_DSP,
  PARAMETROS_LAJE,
  PARAMETROS_PIP,
} from "../../calculo/sistrut/base/parametros";
import type {
  ColunaEdificio,
  LeituraRep,
  LinhaRep,
  NivelColuna,
} from "../../calculo/sistrut/base/tipos";
import {
  casaNome,
  indiceDoCodigoOriginal,
  leCargasRep,
  qbVal,
} from "../../calculo/sistrut/pilares/carga";
import { KN_POR_TF } from "../../calculo/unidades";

/** Resultado de uma leitura: o valor e os avisos, ou os erros em português. */
export type Lido<T> = { ok: true; valor: T; avisos: string[] } | { ok: false; erros: string[] };

class ErroFormato extends Error {}

/** Leitura sequencial como o INPUT # e o LINE INPUT # do QuickBASIC: `campo` lê até a
 *  vírgula ou o fim da linha, sem os espaços das pontas (texto entre aspas inteiro);
 *  `linha` lê a linha toda. Passar do fim é erro com o número da linha. */
class LeitorQB {
  private pos = 0;

  constructor(
    private readonly texto: string,
    private readonly arquivo: string,
  ) {}

  get fim() {
    return this.pos >= this.texto.length;
  }

  /** Erro com o arquivo e a linha atual; use `throw l.erro(...)`. */
  erro(msg: string) {
    const linha = this.texto.slice(0, this.pos).split("\n").length;
    return new ErroFormato(`${this.arquivo}, linha ${linha}: ${msg}.`);
  }

  private fimDeLinha() {
    if (this.texto[this.pos] === "\r") this.pos++;
    if (this.texto[this.pos] === "\n") this.pos++;
  }

  private delimitador(c: string | undefined) {
    return c === undefined || c === "," || c === "\r" || c === "\n";
  }

  linha(oque: string) {
    if (this.fim) throw this.erro(`o arquivo acabou antes de ${oque}`);
    let f = this.texto.indexOf("\n", this.pos);
    if (f < 0) f = this.texto.length;
    const s = this.texto.slice(this.pos, f).replace(/\r$/, "");
    this.pos = Math.min(f + 1, this.texto.length);
    return s;
  }

  campo(oque: string) {
    while (this.texto[this.pos] === " " || this.texto[this.pos] === "\t") this.pos++;
    if (this.fim) throw this.erro(`o arquivo acabou antes de ${oque}`);
    let valor: string;
    if (this.texto[this.pos] === '"') {
      const f = this.texto.indexOf('"', this.pos + 1);
      const fim = f < 0 ? this.texto.length : f;
      valor = this.texto.slice(this.pos + 1, fim);
      this.pos = Math.min(fim + 1, this.texto.length);
      while (!this.delimitador(this.texto[this.pos])) this.pos++;
    } else {
      let f = this.pos;
      while (!this.delimitador(this.texto[f])) f++;
      valor = this.texto.slice(this.pos, f).trim();
      this.pos = f;
    }
    if (this.texto[this.pos] === ",") this.pos++;
    else this.fimDeLinha();
    return valor;
  }

  /** INPUT # numérico: VAL do campo. */
  numero(oque: string) {
    return qbVal(this.campo(oque));
  }

  /** INPUT # em variável inteira (%): CINT do valor. */
  inteiro(oque: string) {
    return qbCint(this.numero(oque));
  }
}

function tenta<T>(
  arquivo: string,
  texto: string,
  le: (l: LeitorQB, avisos: string[]) => T,
): Lido<T> {
  const avisos: string[] = [];
  try {
    return { ok: true, valor: le(new LeitorQB(texto, arquivo), avisos), avisos };
  } catch (e) {
    if (e instanceof ErroFormato) return { ok: false, erros: [e.message] };
    throw e;
  }
}

// ---------------------------------------------------------------- .COL

/** Nível do edifício (A_11c8 cota em m, A_11f6$ nome). */
export interface NivelCol {
  cota: number;
  nome: string;
}

/** Grupo de momento de viga de um nível (A_1280(c, n, k..k+3), k = 1, 5, 9, 13), como
 *  gravado: do .REP, m = |M| e vão = vão·(−SGN(M)) (PILGEEDI.BAS:606-608); digitado na
 *  "Normal + Momento", m com sinal, vão 1 e rigidez = Jvig/Lvig se a rigidez foi dada,
 *  senão vão 0 (PILGEEDI.BAS:2407-2413). t·m, graus, m, cm⁴. */
export interface MomentoCol {
  m: number;
  inclinacao: number;
  vao: number;
  rigidez: number;
}

/** Normal (A_1280(c, n, 0), t), os grupos de momento lidos (a leitura para no primeiro
 *  m nulo, PIGRAEDI.BAS:905) e os textos dos momentos (A_12ae$, viga e apoio). */
export interface CargaCol {
  normal: number;
  momentos: MomentoCol[];
  textos: string[];
}

/** Vento do nível (A_12dc): normal, t, e dois pares (momento tm, ângulo graus). */
export interface VentoCol {
  normal: number;
  momentos: { m: number; angulo: number }[];
}

/** Geometria de uma seção (A_1338(c, s, 1..3, 6)): 1 retangular B, H e rotação em graus;
 *  2 circular D e Dint; 3 poligonal com os vértices de A_1366 (cm). */
export type GeometriaCol =
  | { tipo: "retangular"; b: number; h: number; rotacao: number }
  | { tipo: "circular"; d: number; dInterno: number }
  | { tipo: "poligonal"; vertices: PontoSecao[] };

/** Seção de uma coluna (A_1338(c, s, ·)): vale do nível onde a anterior termina (ou do
 *  inferior da coluna) até `nivelFinal` (A_1338(c, s, 0), PILAREDI.BAS:3831 e 3968);
 *  excentricidade em relação à de baixo, cm (A_1338(c, s, 4|5) = CINT(100·cm),
 *  PILAREDI.BAS:3900, 3908). */
export interface SecaoCol {
  nivelFinal: number;
  geometria: GeometriaCol;
  excentricidade: { x: number; y: number };
}

/** Variação de armadura de uma coluna (A_141e(c, v, ·), PILAREDI.BAS:5860-5870): vale
 *  até `nivelFinal` como as seções; barras de A_13f0 em cm, com o índice da bitola na
 *  tabela do .PIP (A_10ec(i, 2), PILAREDI.BAS:2431-2440); estribo em mm e cm. */
export interface ArmaduraCol {
  nivelFinal: number;
  principal: { quantidade: number; indiceBitola: number };
  secundaria: { quantidade: number; indiceBitola: number };
  estribo: { bitola: number; espacamento: number };
  barras: { x: number; y: number; indiceBitola: number }[];
}

/** Dados de um nível da coluna. `vinculo` = código empacotado A_130a = 100·(Ry−1) +
 *  (Rx−1) (PILGEEDI.BAS:1965). */
export interface NivelDaColuna {
  nivel: number;
  vinculo?: number;
  carga?: CargaCol;
  vento?: VentoCol;
}

export interface ColunaCol {
  /** A_1252$ como gravado (ex.: "P   5"). */
  nome: string;
  nivelInferior: number;
  nivelSuperior: number;
  /** A_1224(c, 2..7): gravados e lidos, sem uso conhecido no original. */
  campos: number[];
  /** Do nível inferior ao superior. */
  niveis: NivelDaColuna[];
  secoes: SecaoCol[];
  armaduras: ArmaduraCol[];
}

/** Linha "[1]..[12]" (PIGRAEDI.BAS:503). */
export interface ParametrosCol {
  /** [1] número máximo de seções por coluna − 1 (V_0e3e%); [2] variações de armadura
   *  (V_14a2 + 1); [3] vértices por poligonal; [4] poligonais; [5] barras gravadas. */
  maximoSecoes: number;
  maximoVariacoes: number;
  maximoVertices: number;
  poligonais: number;
  totalBarras: number;
  /** [6] fck e [7] fyk na unidade [9], [8] classe do aço, [10] cobrimento (cm),
   *  [11] nome do .PIP, [12] multiplicador da unidade para t/cm² (V_0dec). */
  fck: number;
  fyk: number;
  classeAco: string;
  unidade: string;
  cobrimento: number;
  pip: string;
  multiplicadorUnidade: number;
}

export interface ArquivoCol {
  /** Nome da obra (linha 2, "Obra - nome"). */
  obra: string;
  /** Níveis 1..n (índice 0 = nível 1). */
  niveis: NivelCol[];
  colunas: ColunaCol[];
  parametros: ParametrosCol;
  temVinculos: boolean;
  temCargas: boolean;
  temSecoes: boolean;
  temArmaduras: boolean;
}

/** Lê a linha de parâmetros: o valor depois de cada "[k]" (PIGRAEDI.BAS:1014-1033). */
function leParametros(linha: string, l: LeitorQB): ParametrosCol {
  const apos = (marca: string) => {
    const i = linha.indexOf(marca);
    if (i < 0) throw l.erro(`a linha de parâmetros não tem ${marca}`);
    return linha.slice(i + marca.length);
  };
  const entre = (a: string, b: string) => {
    const resto = apos(a);
    const f = resto.indexOf(b);
    return (f < 0 ? resto : resto.slice(0, f)).trim();
  };
  return {
    maximoSecoes: qbCint(qbVal(apos("[1]"))),
    maximoVariacoes: qbCint(qbVal(apos("[2]"))),
    maximoVertices: qbVal(apos("[3]")),
    poligonais: qbVal(apos("[4]")),
    totalBarras: qbVal(apos("[5]")),
    fck: qbVal(apos("[6]")),
    fyk: qbVal(apos("[7]")),
    classeAco: apos("[8]").slice(0, 1).trim(),
    unidade: entre("[9]", "[10]"),
    cobrimento: qbVal(apos("[10]")),
    pip: entre("{", "}"),
    multiplicadorUnidade: qbVal(apos("[12]")),
  };
}

/** Lê o .COL na ordem do PRINT # do PIGRAEDI (PIGRAEDI.BAS:470-582) e do INPUT # de
 *  L_13f97 (PIGRAEDI.BAS:839-1012). */
function leCol(l: LeitorQB, avisos: string[]): ArquivoCol {
  // cabeçalho: três linhas e "n =NUMERO DE NIVEIS" (PIGRAEDI.BAS:470-473, 839-842)
  l.campo("o cabeçalho");
  const linhaObra = l.campo("a linha da obra");
  l.campo("a linha da data");
  const quarta = l.campo("o número de níveis");
  if (quarta === "FIM")
    throw l.erro("o .COL não tem colunas gravadas (FIM logo depois do cabeçalho)");
  const nNiveis = qbVal(quarta);
  const nColunas = qbCint(l.numero("o número de colunas"));
  if (!Number.isInteger(nNiveis) || nNiveis < 2)
    throw l.erro(`o número de níveis tem de ser um inteiro ≥ 2, veio ${quarta}`);
  if (nColunas < 1) throw l.erro(`o número de colunas tem de ser ≥ 1, veio ${nColunas}`);
  // níveis 0..n: cota, nome; o 0 repete a contagem (PIGRAEDI.BAS:477, 857)
  const niveis: NivelCol[] = [];
  for (let i = 0; i <= nNiveis; i++) {
    const cota = l.numero(`a cota do nível ${i}`);
    const nome = l.campo(`o nome do nível ${i}`);
    if (i > 0) niveis.push({ cota, nome });
  }
  // colunas: nome, "N ( i ) nome", "N ( s ) nome" → VAL(MID$(·, 4)) (PIGRAEDI.BAS:481, 867-869)
  const colunas: ColunaCol[] = [];
  for (let c = 1; c <= nColunas; c++) {
    const nome = l.campo(`o nome da coluna ${c}`);
    const nivelInferior = qbCint(qbVal(l.campo(`o nível inferior da coluna ${c}`).slice(3)));
    const nivelSuperior = qbCint(qbVal(l.campo(`o nível superior da coluna ${c}`).slice(3)));
    if (!(nivelInferior >= 1 && nivelInferior < nivelSuperior && nivelSuperior <= nNiveis))
      throw l.erro(
        `a coluna ${nome} vai do nível ${nivelInferior} ao ${nivelSuperior}, fora de 1..${nNiveis}`,
      );
    const nv: NivelDaColuna[] = [];
    for (let n = nivelInferior; n <= nivelSuperior; n++) nv.push({ nivel: n });
    colunas.push({
      nome,
      nivelInferior,
      nivelSuperior,
      campos: [],
      niveis: nv,
      secoes: [],
      armaduras: [],
    });
  }
  // A_1224(c, 2..7) (PIGRAEDI.BAS:485, 873)
  for (const col of colunas)
    for (let k = 2; k <= 7; k++) col.campos.push(l.inteiro(`o campo ${k} da coluna ${col.nome}`));
  for (const col of colunas)
    if (col.campos.some((x) => x !== 0))
      avisos.push(
        `Coluna ${col.nome}: campos 2 a 7 (${col.campos.join(", ")}) sem uso conhecido no original; descartados.`,
      );
  // linha de parâmetros; o número antes de "[1]" diz se há vínculos (PIGRAEDI.BAS:503, 877-879)
  const linhaParametros = l.campo("a linha de parâmetros");
  const parametros = leParametros(linhaParametros, l);
  const temVinculos = qbVal(linhaParametros) === 1;
  if (temVinculos)
    for (const col of colunas)
      for (const n of col.niveis)
        n.vinculo = l.inteiro(`o vínculo do nível ${n.nivel} da coluna ${col.nome}`);
  // cargas: A_1280 0..16 parando no primeiro m nulo, textos e vento (PIGRAEDI.BAS:513-530, 894-915)
  const temCargas = l.numero("o indicador de cargas") === 1;
  if (temCargas) {
    for (const col of colunas)
      for (const n of col.niveis) {
        const onde = `do nível ${n.nivel} da coluna ${col.nome}`;
        const normal = l.numero(`a normal ${onde}`);
        const momentos: MomentoCol[] = [];
        for (let g = 0; g < 4; g++) {
          const m = l.numero(`o momento ${g + 1} ${onde}`);
          if (m === 0) break;
          momentos.push({
            m,
            inclinacao: l.numero(`a inclinação ${onde}`),
            vao: l.numero(`o vão ${onde}`),
            rigidez: l.numero(`a rigidez ${onde}`),
          });
        }
        const textos = [0, 1, 2, 3].map(() => l.campo(`os textos dos momentos ${onde}`));
        const v = [0, 1, 2, 3, 4].map(() => l.numero(`o vento ${onde}`));
        n.carga = { normal, momentos, textos };
        n.vento = {
          normal: v[0]!,
          momentos: [
            { m: v[1]!, angulo: v[2]! },
            { m: v[3]!, angulo: v[4]! },
          ],
        };
      }
    l.numero("o indicador V_11b4 depois das cargas");
  }
  // seções: até [1] + 1 por coluna, terminadas por 0 (PIGRAEDI.BAS:532-552, 920-962)
  const temSecoes = l.numero("o indicador de seções") === 1;
  l.inteiro("o número de poligonais");
  if (temSecoes)
    for (const col of colunas)
      for (let s = 0; s <= parametros.maximoSecoes; s++) {
        const nivelFinal = l.inteiro(`o nível final da seção ${s} da coluna ${col.nome}`);
        if (nivelFinal === 0) break;
        const campo = (k: number) => l.inteiro(`o campo ${k} da seção ${s} da coluna ${col.nome}`);
        const a1 = campo(1);
        const a2 = campo(2);
        const a3 = campo(3);
        const ex = campo(4);
        const ey = campo(5);
        const tipo = campo(6);
        let geometria: GeometriaCol;
        if (tipo === 1) geometria = { tipo: "retangular", b: a1, h: a2, rotacao: a3 };
        else if (tipo === 2) geometria = { tipo: "circular", d: a1, dInterno: a2 };
        else if (tipo === 3) {
          // A_1366(p, 0..n): o 0 é (n·10, ·); vértices em décimos de cm (PILAREDI.BAS:3863-3864)
          const vertices: PontoSecao[] = [];
          for (let i = 0; i <= a2; i++) {
            const x = l.inteiro(`o vértice ${i} da seção ${s} da coluna ${col.nome}`);
            const y = l.inteiro(`o vértice ${i} da seção ${s} da coluna ${col.nome}`);
            if (i > 0) vertices.push({ x: x / 10, y: y / 10 });
          }
          geometria = { tipo: "poligonal", vertices: semRepetirPrimeiro(vertices) };
        } else throw l.erro(`tipo de seção ${tipo} desconhecido na coluna ${col.nome}`);
        col.secoes.push({ nivelFinal, geometria, excentricidade: { x: ex / 100, y: ey / 100 } });
      }
  // armaduras: variações terminadas por 0, barras de A_13f0 (PIGRAEDI.BAS:558-579, 967-1012)
  const temArmaduras = l.numero("o indicador de armaduras") === 1;
  if (temArmaduras)
    for (const col of colunas)
      for (let v = 0; ; v++) {
        const nivelFinal = l.inteiro(`a armadura ${v} da coluna ${col.nome}`);
        if (v > parametros.maximoVariacoes || nivelFinal === 0) break;
        const campo = (k: number) =>
          l.inteiro(`o campo ${k} da armadura ${v} da coluna ${col.nome}`);
        const q1 = campo(1);
        const b1 = campo(2);
        const q2 = campo(3);
        const b2 = campo(4);
        const estribo = campo(5);
        const espacamento = campo(6);
        const barras: ArmaduraCol["barras"] = [];
        for (let i = 0; i <= q1 + q2; i++) {
          const t = [0, 1, 2].map(() =>
            l.inteiro(`a barra ${i} da armadura ${v} da coluna ${col.nome}`),
          );
          if (i === 0) {
            if (t[0] !== (q1 + q2) * 10)
              avisos.push(
                `Coluna ${col.nome}, armadura ${v}: o cabeçalho das barras diz ${t[0]! / 10}, os campos dizem ${q1 + q2}.`,
              );
          } else barras.push({ x: t[0]! / 10, y: t[1]! / 10, indiceBitola: t[2]! / 10 });
        }
        col.armaduras.push({
          nivelFinal,
          principal: { quantidade: q1, indiceBitola: b1 },
          secundaria: { quantidade: q2, indiceBitola: b2 },
          estribo: { bitola: estribo / 10, espacamento: espacamento / 10 },
          barras,
        });
      }
  const fim = l.fim ? "" : l.campo("o FIM");
  if (fim !== "FIM") avisos.push(`.COL: esperado "FIM" depois das armaduras, veio "${fim}".`);
  const obra = linhaObra.startsWith("Obra - ") ? linhaObra.slice(7).trim() : linhaObra.trim();
  return { obra, niveis, colunas, parametros, temVinculos, temCargas, temSecoes, temArmaduras };
}

/** Vértices sem o fechamento (último igual ao primeiro). */
function semRepetirPrimeiro(v: PontoSecao[]) {
  const [p, u] = [v[0], v.at(-1)];
  return v.length > 1 && p && u && p.x === u.x && p.y === u.y ? v.slice(0, -1) : v;
}

/** Lê um .COL do PIGRAEDI. */
export function lerCol(texto: string): Lido<ArquivoCol> {
  return tenta(".COL", texto, leCol);
}

// ---------------------------------------------------------------- .PIP

/** Lê o .PIP como S_23c9a (PILAREDI.BAS:1894-1993): blocos depois de linhas "*",
 *  bitolas por coluna fixa (VAL(MID$(l, 10)) e VAL(MID$(l, 25))), matriz de flambagem
 *  com 0 ("NAO") → 100, estribos em décimos (CINT(VAL·10)). Densidade em kN/m³. */
function lePip(l: LeitorQB): PipPilar {
  const pulaComentarios = (oque: string) => {
    while (l.linha(oque).startsWith("*"));
  };
  const valor = (oque: string) => qbVal(l.linha(oque));
  const letra = (oque: string) => l.linha(oque).slice(0, 1) === "S";
  pulaComentarios("os parâmetros globais");
  const cobrimento = valor("o cobrimento");
  pulaComentarios("a tabela de bitolas");
  const areas = Array.from({ length: 13 }, (_, i) => {
    const s = l.linha(`a bitola ${i}`);
    return { bitola: qbVal(s.slice(9)), area: qbVal(s.slice(24)) };
  });
  pulaComentarios("os parâmetros do predimensionamento");
  const tensaoAdmissivelNormal = valor("a tensão admissível Nk/A");
  const tensaoAdmissivelFlexao = valor("a tensão admissível Nk/A + Mk/W");
  const taxaIdealPredimensionamento = valor("a taxa ideal");
  const medidaMinima = qbCint(valor("a medida mínima"));
  const multiploMedida = qbCint(valor("o múltiplo da medida"));
  const pesoProprio = letra("o peso próprio");
  const densidade = valor("a densidade") * KN_POR_TF;
  const porcentagemAcidental = qbCint(valor("a porcentagem acidental"));
  const reduzAcidentalFundacao = letra("a redução na fundação");
  const reduzAcidentalDimensionamento = letra("a redução no dimensionamento");
  pulaComentarios("a matriz de flambagem");
  l.linha("o cabeçalho da matriz de flambagem");
  const coeficienteFlambagem = [0, 1, 2, 3].map((i) => {
    l.campo(`o rótulo da linha ${i} da matriz de flambagem`);
    return [0, 1, 2, 3].map((j) => l.numero(`o coeficiente (${i}, ${j})`) || 100);
  });
  pulaComentarios("os parâmetros da armadura");
  const taxaMinimaCalculada = valor("a taxa mínima sobre a seção calculada");
  const taxaMinimaReal = valor("a taxa mínima sobre a seção real");
  const taxaMaxima = valor("a taxa máxima");
  const traspasseNaTaxa = letra("o traspasse na taxa");
  const misturaBitolas = letra("a mistura de bitolas");
  const ordemBitolaMinima = valor("a ordem da menor bitola");
  pulaComentarios("os espaçamentos entre barras");
  const bitolas = areas.map((a, i) => {
    l.campo(`a ordem da linha ${i} dos espaçamentos`);
    l.campo(`a bitola da linha ${i} dos espaçamentos`);
    return {
      ...a,
      espacamentoMinimo: qbCint(l.numero(`o espaçamento mínimo da linha ${i}`)),
      coluna4: qbCint(l.numero(`a 4ª coluna da linha ${i}`)),
    };
  });
  pulaComentarios("os estribos");
  const estriboPorBitola = areas.map((_, i) => {
    l.campo(`a ordem da linha ${i} dos estribos`);
    l.campo(`a bitola longitudinal da linha ${i} dos estribos`);
    const bitola = qbCint(l.numero(`a bitola do estribo da linha ${i}`) * 10) / 10;
    const espacamento = qbCint(l.numero(`o espaçamento do estribo da linha ${i}`) * 10) / 10;
    return { bitola, espacamento };
  });
  return {
    tensaoAdmissivelNormal,
    tensaoAdmissivelFlexao,
    taxaIdealPredimensionamento,
    cobrimento,
    reduzAcidentalFundacao,
    reduzAcidentalDimensionamento,
    pesoProprio,
    densidade,
    porcentagemAcidental,
    multiploMedida,
    medidaMinima,
    taxaMinimaCalculada,
    taxaMinimaReal,
    taxaMaxima,
    traspasseNaTaxa,
    misturaBitolas,
    ordemBitolaMinima,
    bitolas,
    coeficienteFlambagem,
    estriboPorBitola,
  };
}

/** Lê um .PIP do disco (o nome "SISTRUT" o original não lê: ver `importarPilaresSistrut`). */
export function lerPip(texto: string): Lido<PipPilar> {
  return tenta(".PIP", texto, (l) => lePip(l));
}

/** .PIP "SISTRUT" embutido no formato do domínio (densidade em kN/m³). */
const PIP_DE_FABRICA: PipPilar = {
  ...PARAMETROS_PIP,
  densidade: PARAMETROS_PIP.densidade * KN_POR_TF,
};

/** Só os campos do .PIP que diferem do embutido, para `obra.parametrosPilar.pip`. */
export function diferencasPip(pip: PipPilar): Partial<PipPilar> {
  const r: Partial<PipPilar> = {};
  const copia = <K extends keyof PipPilar>(k: K) => {
    if (JSON.stringify(pip[k]) !== JSON.stringify(PIP_DE_FABRICA[k])) r[k] = pip[k];
  };
  for (const k of Object.keys(PIP_DE_FABRICA) as (keyof PipPilar)[]) copia(k);
  return r;
}

// ---------------------------------------------------------------- .PIL

/** Seção avulsa do PILAR no formato do domínio: b × h (a caixa, na circular e na
 *  poligonal), `secao` se não for retangular, c' (cm), barras (cm e mm) e as três
 *  bitolas da tela (A_182c). */
export interface SecaoPil {
  b: number;
  h: number;
  secao?: SecaoNaoRetangular;
  cobrimento: number;
  barras: BarraPilarObra[];
  bitolas: number[];
}

/** Lê o primeiro registro do .PIL como L_49300 (PILAR.BAS:7752-7808): tipo e 8 valores
 *  (A_185a: B, H, c', barras em cima, embaixo, por lado, distâncias da primeira e da
 *  última lateral; na circular D, Dint, c', número de barras); vértices A_1746 (n, e
 *  n + 3 pares: o 0 traz n, os dois últimos repetem 1 e 2; a circular grava n = 1 e
 *  (D, Dint), PILAR.BAS:3549-3557); barras A_1774 (o 0 traz a contagem); 6
 *  inclinações da LN (A_16bc) e 3 bitolas (A_182c). O PILAR grava com APPEND
 *  (PILAR.BAS:7683) e lê só o primeiro registro. */
function lePil(l: LeitorQB, avisos: string[]): SecaoPil {
  const tipo = l.numero("o tipo da seção");
  const v = Array.from({ length: 8 }, (_, i) => l.campo(`o valor ${i + 1} da seção`));
  const n = l.numero("o número de vértices");
  const vertices: PontoSecao[] = [];
  for (let i = 0; i <= n + 2; i++) {
    const x = l.numero(`o vértice ${i}`);
    const y = l.numero(`o vértice ${i}`);
    if (i >= 1 && i <= n) vertices.push({ x, y });
  }
  const m = l.numero("o número de barras");
  const barras: BarraPilarObra[] = [];
  for (let i = 0; i <= m; i++) {
    const t = [0, 1, 2].map(() => l.numero(`a barra ${i}`));
    if (i > 0) barras.push({ x: t[0]!, y: t[1]!, bitola: t[2]! });
  }
  for (let i = 0; i < 6; i++) l.numero(`a inclinação ${i} da linha neutra`);
  const bitolas = [0, 1, 2].map((i) => l.numero(`a bitola utilizada ${i}`));
  if (!l.fim)
    avisos.push(
      ".PIL: há mais de uma seção gravada (o PILAR grava com APPEND); lida só a primeira.",
    );
  const cobrimento = qbVal(v[2]!);
  if (tipo === 1) return { b: qbVal(v[0]!), h: qbVal(v[1]!), cobrimento, barras, bitolas };
  if (tipo === 2) {
    const d = qbVal(v[0]!);
    // D-19: o PILAREDI lê o D do .PIL em V_0fb8 (PILAREDI.BAS:3527-3529) e monta o
    // círculo com V_0fbc (1662, 3843), o da seção anterior da sessão; o PILAR (opção 6)
    // lê certo. A obra fica com o D gravado.
    avisos.push(
      `.PIL: seção circular D ${fmt(d)} cm. No PILAREDI (seção de coluna lida do .PIL) o original usaria o diâmetro da seção anterior da sessão, não este (defeito D-19); a obra usa o D do arquivo, como o PILAR.`,
    );
    return {
      b: d,
      h: d,
      secao: { tipo: "circular", d, dInterno: qbVal(v[1]!) },
      cobrimento,
      barras,
      bitolas,
    };
  }
  if (tipo === 3) {
    const poligono = semRepetirPrimeiro(vertices);
    const { b, h } = caixa(poligono);
    return { b, h, secao: { tipo: "poligonal", vertices: poligono }, cobrimento, barras, bitolas };
  }
  throw l.erro(`tipo de seção ${tipo} desconhecido (1 retangular, 2 circular, 3 poligonal)`);
}

/** Lê um .PIL do PILAR. */
export function lerPil(texto: string): Lido<SecaoPil> {
  return tenta(".PIL", `${semFimDeArquivo(texto)}\n`, lePil);
}

/** Texto sem o Ctrl-Z de fim de arquivo do DOS e sem os brancos do fim. */
const semFimDeArquivo = (texto: string) => texto.replaceAll("\u001a", "").trimEnd();

const caixa = (v: PontoSecao[]) => {
  const xs = v.map((p) => p.x);
  const ys = v.map((p) => p.y);
  return { b: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

// ---------------------------------------------------------------- .REP

/** Lê os registros do .REP como o PILGEEDI (PILGEEDI.BAS:532-544, 605-617): acha a
 *  linha com "Cargas Totais", pula uma e lê registros de 3 linhas até o fim. Linha 1:
 *  pilar e N = VAL(MID$(l, 10)); linha 2: parcelas "valor (viga)"; linha 3: momentos
 *  depois de cada ">" que tenha "[" adiante: M = VAL do texto, vão = VAL depois do "[",
 *  viga entre parênteses, apoio depois do "@". */
function leRep(texto: string, avisos: string[]): LinhaRep[] {
  const linhas = semFimDeArquivo(texto).split(/\r?\n/);
  const i0 = linhas.findIndex((s) => s.includes("Cargas Totais"));
  if (i0 < 0) throw new ErroFormato('.REP: não achei a linha "Cargas Totais".');
  const registros: LinhaRep[] = [];
  for (let i = i0 + 2; i < linhas.length; i += 3) {
    if (i + 2 >= linhas.length) {
      avisos.push(`.REP, linha ${i + 1}: registro incompleto no fim do arquivo; ignorado.`);
      break;
    }
    const [l1, l2, l3] = [linhas[i]!, linhas[i + 1]!, linhas[i + 2]!];
    const parcelas = [
      ...l2.matchAll(/([-+]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][-+]?\d+)?)\s*\(([^)]*)\)/g),
    ].map((m) => ({ viga: m[2]!.trim(), valor: qbVal(m[1]!), texto: m[1]! }));
    const momentos: LinhaRep["momentos"] = [];
    for (let p = l3.indexOf(">"); p >= 0; p = l3.indexOf(">", p + 1)) {
      const colchete = l3.indexOf("[", p);
      if (colchete < 0) break;
      const arroba = l3.indexOf("@", p);
      const abre = l3.indexOf("(", p);
      const fecha = l3.indexOf(")", p);
      const textoM = (arroba >= 0 ? l3.slice(p + 1, arroba) : l3.slice(p + 1)).trim();
      momentos.push({
        viga: abre >= 0 && fecha > abre ? l3.slice(abre + 1, fecha).trim() : "",
        valor: qbVal(l3.slice(p + 1)),
        texto: textoM,
        apoio: arroba >= 0 ? qbVal(l3.slice(arroba + 1, arroba + 3)) : 0,
        vao: qbVal(l3.slice(colchete + 1)),
      });
    }
    registros.push({ pilar: l1, total: qbVal(l1.slice(9)), parcelas, momentos });
  }
  return registros;
}

/** Lê um .REP do VIGA (as linhas de reação por pilar). */
export function lerRep(texto: string): Lido<LinhaRep[]> {
  return tenta(".REP", texto, (_, avisos) => leRep(texto, avisos));
}

// ---------------------------------------------------------------- obra

export interface RepPilarSistrut {
  texto: string;
  /** Faixa de níveis do PILGEEDI, 1-based (PILGEEDI.BAS:557). */
  nivelInicial: number;
  nivelFinal: number;
  /** Padrão "substitui". */
  modo?: LeituraRep["modo"];
}

export interface ArquivosPilarSistrut {
  col: string;
  pip?: string;
  pil?: string;
  /** Lidos em ordem, como as leituras sucessivas da opção 5 do PILGEEDI. Com .REP, as
   *  cargas vêm só deles (as do .COL ficam de fora). */
  reps?: RepPilarSistrut[];
}

export interface OpcoesImportacaoPilar {
  /** Obra a completar; ausente = gera uma obra nova. */
  base?: Obra;
  /** Grava `cargaTopo` ao completar (padrão: não, a obra já tem vigas e o .REP sai
   *  delas). Na obra nova as cargas sempre entram. */
  cargas?: boolean;
  /** Nome da obra nova; ausente = o do .COL. */
  nome?: string;
}

/** Normal e momentos de viga de um nível, como em A_1280 (t, tm). */
interface CargaNivel {
  normal: number;
  momentos: MomentoCol[];
}

/** Geometria do pilar no domínio. */
interface Geometria {
  b: number;
  h: number;
  secao?: SecaoNaoRetangular;
  rotacao?: number;
}

/** O que o .COL diz de um lance (ausente = padrão ou não dito). */
interface Lance {
  geometria?: Geometria;
  vinculos?: VinculosPilar;
  vinculosTopo?: VinculosPilar;
  excentricidade?: { x: number; y: number };
  vento?: VentoPilar;
  cargaTopo?: CargaTopoPilar;
  barras?: BarraPilarObra[];
  estribo?: { bitola: number; espacamento: number };
}

const semEspacos = (s: string) => s.replace(/\s+/g, "");
const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
/** ×100 sem o ruído de ponto flutuante (0,2 × 100 = 20,000000000000004). */
const centena = (x: number) => Math.round(x * 100 * 1e6) / 1e6;
const limpa = (x: number) => Math.round(x * 1e9) / 1e9;

/** Código empacotado → vínculos do domínio: Rx = A − INT(A/10)·10 + 1 e Ry =
 *  INT(A/10)/10 + 1 (PILAREDI.BAS:4733-4760), código → índice por
 *  `indiceDoCodigoOriginal`. Continuidade (o padrão) vira `undefined`. */
function vinculosDoCodigo(a: number | undefined): VinculosPilar | undefined {
  if (a === undefined) return undefined;
  const rx = a - Math.floor(a / 10) * 10 + 1;
  const ry = Math.floor(a / 10) / 10 + 1;
  const v = (codigo: number) => VINCULOS_PILAR[indiceDoCodigoOriginal(codigo)] ?? "continuidade";
  const r = { x: v(rx), y: v(ry) };
  return r.x === "continuidade" && r.y === "continuidade" ? undefined : r;
}

function geometriaDoCol(g: GeometriaCol): Geometria {
  // rotação A_1338(c, s, 3): `Pilar.rotacao` (PILAREDI.BAS:1630-1631)
  if (g.tipo === "retangular")
    return { b: g.b, h: g.h, ...(g.rotacao ? { rotacao: g.rotacao } : {}) };
  if (g.tipo === "circular")
    return { b: g.d, h: g.d, secao: { tipo: "circular", d: g.d, dInterno: g.dInterno } };
  return { ...caixa(g.vertices), secao: { tipo: "poligonal", vertices: g.vertices } };
}

/** A_1280 de um nível → `cargaTopo` (kN, kN·m), slot a slot como gravado: o motor o
 *  leva ao PILAREDI sem o ABS da leitura do .REP (`NivelColuna.cargaAdicional`), então
 *  o momento digitado negativo (PILGEEDI.BAS:2407) fica negativo, como no original
 *  (PILAREDI.BAS:7505-7506), e o lido do .REP fica |M| com o sinal no vão. */
function cargaTopoDe(c: CargaNivel | undefined): CargaTopoPilar | undefined {
  if (!c) return undefined;
  const momentos = c.momentos
    .filter((mo) => mo.m !== 0)
    .map((mo) => ({
      m: mo.m * KN_POR_TF,
      inclinacao: mo.inclinacao,
      vao: mo.vao,
      rigidez: mo.rigidez,
    }));
  if (c.normal === 0 && momentos.length === 0) return undefined;
  return { normal: c.normal * KN_POR_TF, momentos };
}

function ventoDe(v: VentoCol | undefined): VentoPilar | undefined {
  if (!v) return undefined;
  const momentos = v.momentos
    .filter((m) => m.m !== 0)
    .map((m) => ({ m: m.m * KN_POR_TF, angulo: m.angulo }));
  if (v.normal === 0 && momentos.length === 0) return undefined;
  return { normal: v.normal * KN_POR_TF, momentos };
}

/** Item (seção ou armadura) que vale no lance de base j: do fim do anterior (ou do
 *  nível inferior) até `nivelFinal`. */
function itemDoLance<T extends { nivelFinal: number }>(itens: T[], inferior: number, j: number) {
  for (let s = 0; s < itens.length; s++) {
    const inicio = s === 0 ? inferior : itens[s - 1]!.nivelFinal;
    if (j >= inicio && j < itens[s]!.nivelFinal) return { item: itens[s]!, indice: s, inicio };
  }
  return undefined;
}

/** Dados de cada lance de uma coluna (chave = nível da base). Seção, vínculo,
 *  excentricidade e vento do nível da BASE; carga do nível do TOPO; vínculo do topo da
 *  coluna no último lance. A carga do nível mais baixo e o vento do nível do topo não
 *  entram em lance nenhum no PILAREDI (PILAREDI.BAS:7342-7344, 7614-7626): avisos. */
function lancesDaColuna(
  col: ColunaCol,
  cargas: (CargaNivel | undefined)[],
  bitolas: readonly { bitola: number }[],
  avisos: string[],
) {
  const nome = semEspacos(col.nome);
  const nivel = (n: number) => col.niveis[n - col.nivelInferior];
  const baixo = cargas[col.nivelInferior - 1];
  if (baixo && (baixo.normal !== 0 || baixo.momentos.length > 0))
    avisos.push(
      `Coluna ${nome}: carga de ${fmt(baixo.normal)} t no nível ${col.nivelInferior}, o mais baixo da coluna; não entra em nenhum lance (o PILAREDI só a soma no resumo da fundação). Descartada.`,
    );
  const ventoTopo = ventoDe(nivel(col.nivelSuperior)?.vento);
  if (ventoTopo)
    avisos.push(
      `Coluna ${nome}: vento no nível ${col.nivelSuperior}, o do topo da coluna; o PILAREDI usa o vento do nível da base de cada lance, então este não entra. Descartado.`,
    );
  const lances = new Map<number, Lance>();
  for (let j = col.nivelInferior; j < col.nivelSuperior; j++) {
    const onde = `Coluna ${nome}, lance ${j}→${j + 1}`;
    const secao = itemDoLance(col.secoes, col.nivelInferior, j);
    if (col.secoes.length > 0 && !secao)
      avisos.push(`${onde}: nenhuma seção do .COL cobre o lance.`);
    const ex =
      secao && secao.indice > 0 && secao.inicio === j ? secao.item.excentricidade : undefined;
    const armadura = itemDoLance(col.armaduras, col.nivelInferior, j)?.item;
    const barras = armadura?.barras.flatMap((b) => {
      const bitola = bitolas[b.indiceBitola]?.bitola;
      if (bitola === undefined || !Number.isInteger(b.indiceBitola)) {
        avisos.push(
          `${onde}: barra com índice de bitola ${b.indiceBitola} fora da tabela do .PIP; ignorada.`,
        );
        return [];
      }
      return [{ x: b.x, y: b.y, bitola }];
    });
    const vinculos = vinculosDoCodigo(nivel(j)?.vinculo);
    const vinculosTopo =
      j === col.nivelSuperior - 1 ? vinculosDoCodigo(nivel(j + 1)?.vinculo) : undefined;
    const vento = ventoDe(nivel(j)?.vento);
    const cargaTopo = cargaTopoDe(cargas[j]);
    lances.set(j, {
      ...(secao
        ? {
            geometria: geometriaDoCol(secao.item.geometria),
          }
        : {}),
      ...(vinculos ? { vinculos } : {}),
      ...(vinculosTopo ? { vinculosTopo } : {}),
      ...(ex && (ex.x !== 0 || ex.y !== 0) ? { excentricidade: ex } : {}),
      ...(vento ? { vento } : {}),
      ...(cargaTopo ? { cargaTopo } : {}),
      ...(barras && barras.length > 0 ? { barras } : {}),
      ...(armadura && armadura.estribo.bitola > 0 ? { estribo: armadura.estribo } : {}),
    });
  }
  return lances;
}

/** Cargas por coluna e nível (índice 0 = nível 1): as do .COL ou, com .REP, as da
 *  leitura de `leCargasRep` (associação pelo número no nome e modos do PILGEEDI). */
function cargasDasColunas(
  col: ArquivoCol,
  reps: RepPilarSistrut[],
  avisos: string[],
): Lido<(CargaNivel | undefined)[][]> {
  const n = col.niveis.length;
  if (reps.length === 0)
    return {
      ok: true,
      avisos: [],
      valor: col.colunas.map((c) => {
        const r: (CargaNivel | undefined)[] = Array.from({ length: n }, () => undefined);
        for (const nv of c.niveis) if (nv.carga) r[nv.nivel - 1] = nv.carga;
        return r;
      }),
    };
  const erros: string[] = [];
  const leituras: LeituraRep[] = [];
  reps.forEach((rep, i) => {
    if (!(rep.nivelInicial >= 1 && rep.nivelInicial <= rep.nivelFinal && rep.nivelFinal <= n))
      erros.push(
        `.REP ${i + 1}: faixa de níveis ${rep.nivelInicial} a ${rep.nivelFinal} fora de 1..${n}.`,
      );
    const lido = lerRep(rep.texto);
    if (!lido.ok) {
      erros.push(...lido.erros.map((e) => `.REP ${i + 1}: ${e}`));
      return;
    }
    avisos.push(...lido.avisos);
    for (const linha of lido.valor) {
      const numero = qbVal(linha.pilar.slice(1, 11));
      // PILGEEDI.BAS:556: só vale a coluna com o número que cobre o nível
      for (let nivel = rep.nivelInicial; nivel <= rep.nivelFinal; nivel++)
        if (
          !col.colunas.some(
            (c) => casaNome(c.nome, numero) && c.nivelInferior <= nivel && nivel <= c.nivelSuperior,
          )
        )
          avisos.push(
            `.REP ${i + 1}: o pilar ${semEspacos(linha.pilar)} não casa com nenhuma coluna do .COL que cubra o nível ${nivel}; carga ignorada nesse nível, como no PILGEEDI.`,
          );
    }
    leituras.push({
      linhas: lido.valor,
      nivelInicial: rep.nivelInicial - 1,
      nivelFinal: rep.nivelFinal - 1,
      modo: rep.modo ?? "substitui",
    });
  });
  if (erros.length > 0) return { ok: false, erros };
  if (
    col.temCargas &&
    col.colunas.some((c) => c.niveis.some((nv) => nv.carga && nv.carga.normal !== 0))
  )
    avisos.push("As cargas gravadas no .COL foram trocadas pelas dos .REP.");
  const nivelVazio: NivelColuna = {
    cota: 0,
    secao: { tipo: "retangular", b: 1, h: 1, barras: [] },
    vinculoX: 2,
    vinculoY: 2,
    normalVento: 0,
    mkx: 0,
    mky: 0,
  };
  // colunas com a faixa de níveis de cada uma: o registro vai à primeira coluna com o
  // número que cobre o nível (PILGEEDI.BAS:556), como no original
  const colunas: ColunaEdificio[] = col.colunas.map((c) => ({
    nome: c.nome,
    pilarRep: c.nome,
    niveis: Array.from({ length: c.nivelSuperior }, () => nivelVazio),
    nivelInferior: c.nivelInferior - 1,
  }));
  const lidas = leCargasRep(leituras, colunas, "corrigido");
  return {
    ok: true,
    avisos: [],
    valor: col.colunas.map((c, ci) =>
      Array.from({ length: n }, (_, i) => {
        const normal = lidas[ci]!.normal[i] ?? 0;
        const momentos = (lidas[ci]!.slots[i] ?? []).filter((s) => s.m !== 0);
        if (normal === 0 && momentos.length === 0) return undefined;
        return { normal, momentos };
      }),
    ),
  };
}

/** Materiais do .COL em MPa pela convenção da V2 (0,15 t/cm² = 15 MPa), na unidade
 *  gravada. O multiplicador [12] (V_0dec) é o coeficiente da unidade de fck e fyk do
 *  PILAR.INI ("COEFICIENTE MULTIPLICADOR DA UNIDADE DE Fck E Fyk PARA TRANSFORMAR EM
 *  T/C2", PILAR.BAS:569, 645): o PILAREDI multiplica fck e fyk por ele em cada uso
 *  (PILAREDI.BAS:1594, 2156-2171, 3671-3677, 5461, 6657). Vai para
 *  `parametrosPilar.ini.coeficienteTensao`, e fck e fyk ficam como gravados. */
function materiaisDoCol(p: ParametrosCol, avisos: string[]) {
  let fck = centena(p.fck);
  if (!(fck > 0)) {
    avisos.push(`.COL: fck ${fmt(p.fck)} inválido; usado 15 MPa.`);
    fck = 15;
  }
  const fyk = centena(p.fyk);
  const aco: Aco | undefined =
    fyk === 250 ? "CA-25" : fyk === 500 ? "CA-50" : fyk === 600 ? "CA-60" : undefined;
  let classeAco: ClasseAco = "B";
  if (p.classeAco === "A" || p.classeAco === "B") classeAco = p.classeAco;
  else avisos.push(`.COL: classe do aço "${p.classeAco}" desconhecida; usada B.`);
  return { fck, fyk, aco, classeAco, coeficienteTensao: p.multiplicadorUnidade };
}

const FYK_DO_ACO: Record<Aco, number> = { "CA-25": 250, "CA-50": 500, "CA-60": 600 };

/** Parâmetros do .PIP para a obra: SISTRUT = o embutido (o .PIP passado é ignorado,
 *  PILAREDI.BAS:1833); outro nome = o .PIP lido, se veio. */
function pipDaObra(
  col: ArquivoCol,
  texto: string | undefined,
  avisos: string[],
): Lido<PipPilar | undefined> {
  const nome = col.parametros.pip;
  if (nome === "SISTRUT") {
    if (texto !== undefined)
      avisos.push(
        'O .COL usa a parametrização "SISTRUT": o original não lê o .PIP e usa a tabela embutida; o .PIP passado foi ignorado.',
      );
    return { ok: true, valor: undefined, avisos: [] };
  }
  if (texto === undefined) {
    avisos.push(
      `O .COL usa a parametrização ${nome}.PIP, que não foi passada: ficam os parâmetros de fábrica.`,
    );
    return { ok: true, valor: undefined, avisos: [] };
  }
  const lido = lerPip(texto);
  if (lido.ok) avisos.push(...lido.avisos);
  return lido;
}

const aplicaLance = (p: Pilar, l: Lance, cargas: boolean): Pilar => {
  const geo = l.geometria ?? { b: p.b, h: p.h, ...(p.secao ? { secao: p.secao } : {}) };
  const carga = cargas ? l.cargaTopo : p.cargaTopo;
  const verificacoes = l.barras
    ? [{ barras: l.barras, ...(l.estribo ? { estribo: l.estribo } : {}) }]
    : p.verificacoes;
  return {
    id: p.id,
    nome: p.nome,
    x: p.x,
    y: p.y,
    ...geo,
    ...(l.vinculos ? { vinculos: l.vinculos } : {}),
    ...(l.vinculosTopo ? { vinculosTopo: l.vinculosTopo } : {}),
    ...(l.excentricidade ? { excentricidade: l.excentricidade } : {}),
    ...(l.vento ? { vento: l.vento } : {}),
    ...(carga ? { cargaTopo: carga } : {}),
    ...(verificacoes ? { verificacoes } : {}),
  };
};

interface Contexto {
  col: ArquivoCol;
  lances: Map<number, Lance>[];
  materiais: ReturnType<typeof materiaisDoCol>;
  pip: PipPilar | undefined;
  pil: SecaoPil | undefined;
  avisos: string[];
}

function parametrosPilarDe(
  ini: Partial<IniPilar>,
  pip: PipPilar | undefined,
): ParametrosPilarObra | undefined {
  const dif = pip ? diferencasPip(pip) : {};
  const r: ParametrosPilarObra = {
    ...(Object.keys(ini).length > 0 ? { ini } : {}),
    ...(Object.keys(dif).length > 0 ? { pip: dif } : {}),
  };
  return Object.keys(r).length > 0 ? r : undefined;
}

/** Obra nova: um pavimento por nível acima do 1 (do topo para a base), um pilar por
 *  lance de cada coluna na posição (índice da coluna, 0). */
function gerarObra(ctx: Contexto, nome: string | undefined): Obra | { erros: string[] } {
  const { col, avisos, materiais: mat } = ctx;
  const n = col.niveis.length;
  const erros: string[] = [];
  const pavimentos: Pavimento[] = [];
  const pavDoNivel = new Map<number, Pavimento>();
  for (let k = n; k >= 2; k--) {
    const peDireito = limpa(col.niveis[k - 1]!.cota - col.niveis[k - 2]!.cota);
    if (!(peDireito > 0))
      erros.push(
        `.COL: a cota do nível ${k} não é maior que a do nível ${k - 1} (pé-direito ${fmt(peDireito)} m).`,
      );
    const pav: Pavimento = {
      id: `pav${k}`,
      nome: col.niveis[k - 1]!.nome || `Nível ${k}`,
      peDireito,
      repeticoes: 1,
      lajes: [],
      vigas: [],
      pilares: [],
      pilaresRemovidos: [],
    };
    pavimentos.push(pav);
    pavDoNivel.set(k, pav);
  }
  if (erros.length > 0) return { erros };
  const bases = new Set<string>();
  col.colunas.forEach((c, ci) => {
    let base = semEspacos(c.nome) || `C${ci + 1}`;
    if (bases.has(base)) base = `${base}_${ci + 1}`;
    bases.add(base);
    if (c.nivelInferior > 1)
      avisos.push(
        `Coluna ${semEspacos(c.nome)} começa no nível ${c.nivelInferior}: não chega à fundação, e o motor marca falha nesse pilar.`,
      );
    if (c.secoes.length === 0)
      avisos.push(
        ctx.pil
          ? `Coluna ${semEspacos(c.nome)} sem seção no .COL: usada a seção do .PIL (${fmt(ctx.pil.b)} × ${fmt(ctx.pil.h)} cm).`
          : `Coluna ${semEspacos(c.nome)} sem seção no .COL: usada 20 × 20 cm (o PILAREDI predimensionaria; veja parametrosPilar.predimensionamento).`,
      );
    for (let j = c.nivelInferior; j < c.nivelSuperior; j++) {
      const pav = pavDoNivel.get(j + 1)!;
      const l = ctx.lances[ci]!.get(j) ?? {};
      const pil = ctx.pil;
      const padrao: Lance = {
        geometria: pil
          ? { b: pil.b, h: pil.h, ...(pil.secao ? { secao: pil.secao } : {}) }
          : { b: 20, h: 20 },
        ...(pil && pil.barras.length > 0 && !l.geometria ? { barras: pil.barras } : {}),
      };
      const pilar: Pilar = {
        id: `${base}@${pav.id}`,
        nome: semEspacos(c.nome) || base,
        x: ci,
        y: 0,
        b: 20,
        h: 20,
      };
      pav.pilares.push(aplicaLance(pilar, { ...padrao, ...l }, true));
    }
  });
  const ini: Partial<IniPilar> = {};
  if (mat.coeficienteTensao !== 1) ini.coeficienteTensao = mat.coeficienteTensao;
  if (!mat.aco) {
    ini.fyk = mat.fyk;
    avisos.push(
      `.COL: fyk ${fmt(mat.fyk)} MPa não é de CA-25/50/60; gravado em parametrosPilar.ini.fyk (aço da obra: CA-50).`,
    );
  }
  const aco = mat.aco ?? "CA-50";
  let cobrimentoPilar = ctx.pip?.cobrimento ?? PARAMETROS_PIP.cobrimento;
  if (!ctx.pip && col.parametros.pip !== "SISTRUT") cobrimentoPilar = col.parametros.cobrimento;
  if (cobrimentoPilar !== col.parametros.cobrimento)
    avisos.push(
      `.COL: cobrimento arquivado [10] = ${fmt(col.parametros.cobrimento)} cm, o do .PIP = ${fmt(cobrimentoPilar)} cm; ficou o do .PIP.`,
    );
  const materiais: Materiais = {
    fck: mat.fck,
    aco,
    acoEstribo: aco,
    classeAco: mat.classeAco,
    caa: 1,
    cobrimentoLaje: PARAMETROS_LAJE.cobrimento,
    cobrimentoViga: PARAMETROS_DSP.cobrimento,
    cobrimentoPilar,
  };
  const parametrosPilar = parametrosPilarDe(ini, ctx.pip);
  return {
    versao: 3,
    nome: nome ?? col.obra,
    norma: "nb1-78",
    modoCalculo: "original",
    materiais,
    pavimentos,
    ...(parametrosPilar ? { parametrosPilar } : {}),
  };
}

/** Completa a obra `base`: cada pilar casa com a primeira coluna do .COL cujo nome
 *  contém o número do pilar (`casaNome`, como o PILGEEDI casa o .REP) e, de baixo para
 *  cima, o k-ésimo nível da obra (com as repetições) é o lance k → k + 1. Lajes e vigas
 *  ficam como estão. */
function completarObra(ctx: Contexto, base: Obra, cargas: boolean): Obra {
  const { col, avisos, materiais: mat } = ctx;
  const obra = structuredClone(base);
  const usadas = new Set<number>();
  const deBaixo = [...obra.pavimentos].reverse();
  const totalNiveis = deBaixo.reduce((s, p) => s + p.repeticoes, 0);
  if (totalNiveis !== col.niveis.length - 1)
    avisos.push(
      `A obra tem ${totalNiveis} níveis de pilar e o .COL tem ${col.niveis.length - 1} lances; casados de baixo para cima até onde houver.`,
    );
  let t0 = 0;
  for (const pav of deBaixo) {
    const j0 = t0 + 1;
    for (let r = 0; r < pav.repeticoes; r++) {
      const j = j0 + r;
      const a = col.niveis[j - 1];
      const b = col.niveis[j];
      if (a && b && Math.abs(b.cota - a.cota - pav.peDireito) > 0.001)
        avisos.push(
          `Pavimento ${pav.nome}: pé-direito ${fmt(pav.peDireito)} m, e o .COL dá ${fmt(limpa(b.cota - a.cota))} m entre os níveis ${j} e ${j + 1}.`,
        );
    }
    pav.pilares = pav.pilares.map((p) => {
      const numero = /\d+/.exec(p.nome);
      const ci = numero ? col.colunas.findIndex((c) => casaNome(c.nome, Number(numero[0]))) : -1;
      const c = col.colunas[ci];
      if (!c) {
        avisos.push(
          `Pilar ${p.nome} do pavimento ${pav.nome} não casa com nenhuma coluna do .COL; ficou como estava.`,
        );
        return p;
      }
      if (!(j0 >= c.nivelInferior && j0 < c.nivelSuperior)) {
        avisos.push(
          `Pilar ${p.nome} do pavimento ${pav.nome}: a coluna ${semEspacos(c.nome)} do .COL não tem o lance ${j0}→${j0 + 1}; ficou como estava.`,
        );
        return p;
      }
      usadas.add(ci);
      const l = ctx.lances[ci]!.get(j0) ?? {};
      for (let r = 1; r < pav.repeticoes; r++) {
        const outro = ctx.lances[ci]!.get(j0 + r);
        if (outro && JSON.stringify(outro) !== JSON.stringify(l))
          avisos.push(
            `Pilar ${p.nome} do pavimento ${pav.nome} (${pav.repeticoes} repetições): o lance ${j0 + r}→${j0 + r + 1} do .COL difere do ${j0}→${j0 + 1}; ficou o de baixo.`,
          );
      }
      return aplicaLance(p, l, cargas);
    });
    t0 += pav.repeticoes;
  }
  col.colunas.forEach((c, ci) => {
    if (!usadas.has(ci))
      avisos.push(`Coluna ${semEspacos(c.nome)} do .COL não casou com nenhum pilar da obra.`);
  });
  if (ctx.pil)
    avisos.push("O .PIL só entra na obra nova (seção das colunas sem seção no .COL); ignorado.");
  // materiais do .COL que diferem dos da obra vão para o PILAR.INI
  const ini: Partial<IniPilar> = { ...obra.parametrosPilar?.ini };
  if (mat.coeficienteTensao !== (ini.coeficienteTensao ?? 1)) {
    ini.coeficienteTensao = mat.coeficienteTensao;
    avisos.push(
      `.COL: multiplicador da unidade de fck e fyk [12] = ${fmt(mat.coeficienteTensao)}; gravado em parametrosPilar.ini.coeficienteTensao.`,
    );
  }
  if (mat.fck !== obra.materiais.fck) {
    ini.fck = mat.fck;
    avisos.push(
      `.COL: fck ${fmt(mat.fck)} MPa, a obra tem ${fmt(obra.materiais.fck)} MPa; gravado em parametrosPilar.ini.fck.`,
    );
  }
  if (mat.fyk !== FYK_DO_ACO[obra.materiais.aco]) {
    ini.fyk = mat.fyk;
    avisos.push(
      `.COL: fyk ${fmt(mat.fyk)} MPa, a obra tem ${obra.materiais.aco}; gravado em parametrosPilar.ini.fyk.`,
    );
  }
  if (mat.classeAco !== obra.materiais.classeAco) {
    ini.classeAco = mat.classeAco;
    avisos.push(
      `.COL: aço classe ${mat.classeAco}, a obra tem classe ${obra.materiais.classeAco}; gravado em parametrosPilar.ini.classeAco.`,
    );
  }
  const novos = parametrosPilarDe(ini, ctx.pip);
  const { parametrosPilar: antigos, ...resto } = obra;
  const parametrosPilar: ParametrosPilarObra = {
    ...antigos,
    ...(novos?.ini ? { ini: novos.ini } : {}),
    ...(ctx.pip ? { pip: novos?.pip ?? {} } : {}),
  };
  return Object.keys(parametrosPilar).length > 0 ? { ...resto, parametrosPilar } : resto;
}

/** Lê os arquivos de pilar do SISTRUT e gera uma obra nova (sem `opcoes.base`) ou
 *  completa a obra dada. Erros de formato voltam em `erros`; tudo o que foi descartado
 *  ou suposto volta em `avisos`. */
export function importarPilaresSistrut(
  arquivos: ArquivosPilarSistrut,
  opcoes: OpcoesImportacaoPilar = {},
): { obra: Obra; avisos: string[] } | { erros: string[] } {
  const lidoCol = lerCol(arquivos.col);
  if (!lidoCol.ok) return { erros: lidoCol.erros };
  const col = lidoCol.valor;
  const avisos = [...lidoCol.avisos];
  const pip = pipDaObra(col, arquivos.pip, avisos);
  if (!pip.ok) return { erros: pip.erros };
  let pil: SecaoPil | undefined;
  if (arquivos.pil !== undefined) {
    const lido = lerPil(arquivos.pil);
    if (!lido.ok) return { erros: lido.erros };
    avisos.push(...lido.avisos);
    pil = lido.valor;
  }
  const cargas = cargasDasColunas(col, arquivos.reps ?? [], avisos);
  if (!cargas.ok) return { erros: cargas.erros };
  const bitolas = pip.valor?.bitolas ?? PARAMETROS_PIP.bitolas;
  const ctx: Contexto = {
    col,
    lances: col.colunas.map((c, ci) => lancesDaColuna(c, cargas.valor[ci]!, bitolas, avisos)),
    materiais: materiaisDoCol(col.parametros, avisos),
    pip: pip.valor,
    pil,
    avisos,
  };
  if (opcoes.base) return { obra: completarObra(ctx, opcoes.base, opcoes.cargas ?? false), avisos };
  const obra = gerarObra(ctx, opcoes.nome);
  return "erros" in obra ? obra : { obra, avisos };
}

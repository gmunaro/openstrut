// Escolha de bitola e espaçamento das armaduras de laje do SISTRUT 4.0, pelas
// tabelas do .LAP: a sub-rotina L_14579 do LAJECALC e a L_154c4/L_1559c do
// LAJEPROC (mesmo algoritmo). Especificação: livros_laje.md 1.10 e 2.3-2.5;
// PLANO L9 (U32-012, U45-007).
import { atribuicao, qbCint, qbInt, qbUsing } from "../base/f32";
import type {
  BarraDeLaje,
  CodigoBarraLaje,
  EscolheBarraLaje,
  ModoSistrut,
  ParametrosLaje,
} from "../base/tipos";

/**
 * Bitola e espaçamento para a armadura `as` (cm²/m) numa laje de espessura `h` (cm)
 * (LAJECALC.BAS:959-995; LAJEPROC.BAS:1025-1060; livros_laje.md 1.10):
 * 1. bitola da primeira linha de `bitolaPorH` com hAte ≥ H (nenhuma: a última);
 * 2. espaçamentos do maior para o menor; desiste da bitola ao passar do mínimo
 *    por H; aceita o primeiro com área/s·100 ≥ As e s ≤ 2H (chave "S");
 * 3. sem espaçamento, a bitola seguinte, até a de índice 9; depois "NAO".
 * Código = 1000·índice da bitola + índice 1-based do espaçamento.
 * E2E: As 2,13 com H 10 → # 6.3 c/12.5; As 3,20 com H 7 → # 6.3 c/ 7.5.
 */
export const escolheBarraLaje: EscolheBarraLaje = (as, h, parametros, modo) => {
  const s = atribuicao(modo);
  const { bitolas, espacamentos, bitolaPorH, espacamentoMinimoPorH } = parametros;
  // LAJECALC.BAS:960-966: o laço deixa a última linha quando nenhuma atende.
  let indiceBitola = (
    bitolaPorH.find((linha) => linha.hAte >= h) ?? bitolaPorH[bitolaPorH.length - 1]!
  ).indiceBitola;
  // LAJECALC.BAS:970-973: WHILE A_0f34(k,0) < H: k = k + 1, sem limite superior. Com H
  // acima da última faixa o original estoura o índice (erro 9; livros_laje.md D8):
  // aqui a escolha falha.
  const linhaMinimo = espacamentoMinimoPorH.find((linha) => !(linha.hAte < h));
  if (linhaMinimo === undefined) return { ok: false };
  for (; indiceBitola < 10 && indiceBitola < bitolas.length; indiceBitola++) {
    const area = bitolas[indiceBitola]!.area;
    for (let indice = espacamentos.length; indice >= 1; indice--) {
      const espacamento = espacamentos[indice - 1]!;
      if (espacamento < linhaMinimo.espacamento) break;
      const cabe = !parametros.limitaEspacamento2H || espacamento <= 2 * h;
      if ((area / espacamento) * 100 >= as && cabe) {
        return {
          ok: true,
          indiceBitola,
          indiceEspacamento: indice,
          bitola: bitolas[indiceBitola]!.bitola,
          espacamento,
          area: s((area / espacamento) * 100),
          codigo: 1000 * indiceBitola + indice,
        };
      }
    }
  }
  return { ok: false };
};

/** Barra de um código do LAJEPROC (1000·índice da bitola + índice 1-based do
 *  espaçamento; o sinal, posição imposta, é ignorado; LAJEPROC.BAS:452-455, 467).
 *  Código sem bitola ou espaçamento válido (o 10000 do "NAO", livros_laje.md D7) dá
 *  `ok: false`. */
export function barraDoCodigo(
  codigo: CodigoBarraLaje,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): BarraDeLaje {
  const s = atribuicao(modo);
  const absoluto = Math.abs(codigo);
  const indiceBitola = qbInt(absoluto / 1000);
  const indiceEspacamento = absoluto - indiceBitola * 1000;
  const bitola = parametros.bitolas[indiceBitola];
  const espacamento = parametros.espacamentos[indiceEspacamento - 1];
  if (bitola === undefined || espacamento === undefined) return { ok: false };
  return {
    ok: true,
    indiceBitola,
    indiceEspacamento,
    bitola: bitola.bitola,
    espacamento,
    area: s((bitola.area / espacamento) * 100),
    codigo: absoluto,
  };
}

/** Texto da barra como o relatório do LAJECALC a imprime: "#" + USING "##.# c/##.#"
 *  (LAJECALC.BAS:756-757, 784-785): "# 6.3 c/12.5", "# 6.3 c/ 7.5". Sem barra: "NAO". */
export const textoBarraLaje = (barra: BarraDeLaje) =>
  barra.ok ? `#${qbUsing("##.# c/##.#", barra.bitola, barra.espacamento)}` : "NAO";

/** Barra imposta numa continuidade pelo LAJECALC (A_11e0(c,4) > 0). Esse código NÃO
 *  é o do LAJEPROC: o LAJECALC grava CINT(1000·índice da bitola + espaçamento em cm)
 *  (LAJECALC.BAS:4166), e a otimização e o LAJEPROC leem área(INT(c/1000))/(c mod
 *  1000)·100 (LAJECALC.BAS:2167; LAJEPROC.BAS:866-868). `indiceEspacamento` = posição
 *  1-based do espaçamento da tabela com CINT igual ao gravado (0 se não houver). */
export function barraImpostaNaContinuidade(
  codigo: CodigoBarraLaje,
  parametros: ParametrosLaje,
  modo: ModoSistrut,
): BarraDeLaje {
  const s = atribuicao(modo);
  const indiceBitola = qbInt(codigo / 1000);
  const espacamento = codigo - indiceBitola * 1000;
  const bitola = parametros.bitolas[indiceBitola];
  if (bitola === undefined || !(espacamento > 0)) return { ok: false };
  return {
    ok: true,
    indiceBitola,
    indiceEspacamento: parametros.espacamentos.findIndex((e) => qbCint(e) === espacamento) + 1,
    bitola: bitola.bitola,
    espacamento,
    area: s((bitola.area / espacamento) * 100),
    codigo,
  };
}

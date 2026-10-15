// Escolha das barras do DESDIM: área por bitola na tabela do .DSP, arranjo da armadura
// tracionada pela tabela de arranjos por intervalo de bw e barras da armadura
// comprimida. Referências: DESDIM.BAS (V1 nova, dist/src-original/desenho/);
// livros_arm_forma_des.md 4.3 (U04-005, U05-010, U05-013).
import { AREAS_DSP_CORRIGIDAS } from "../base/parametros";
import { atribuicao, qbInt, qbStr } from "../base/f32";
import type { ModoSistrut, ParametrosDsp } from "../base/tipos";

/** Barras lidas de um arranjo "n1#φ1+n2#φ2" (DESDIM.BAS:3135-3148, L_1521a). */
export interface BarrasArranjo {
  n1: number;
  bitola1: number;
  /** 0 sem segundo grupo; "+#8" conta 1 barra. */
  n2: number;
  bitola2: number;
}

/** Área (cm²) da bitola pela tabela do .DSP (S_40141, DESDIM.BAS:4933-4970; U04-005).
 *  Bitola fora da tabela devolve a própria bitola, como o original (V_0e44 não muda).
 *  Modo corrigido: R9, áreas certas de φ4 e φ32 (AREAS_DSP_CORRIGIDAS) no lugar de 0. */
export function areaBitola(bitola: number, parametros: ParametrosDsp, modo: ModoSistrut) {
  const linha = parametros.bitolas.find((b) => b.bitola === bitola);
  if (!linha) return bitola;
  if (modo === "corrigido" && linha.area === 0) {
    if (bitola === 4) return AREAS_DSP_CORRIGIDAS[4];
    if (bitola === 32) return AREAS_DSP_CORRIGIDAS[32];
  }
  return linha.area;
}

/** Área da bitola da posição `i` (0..9) da tabela do .DSP: as variáveis V_0f16..V_0f3a
 *  do original, com a R9 no modo corrigido. */
export function areaDaPosicao(i: number, parametros: ParametrosDsp, modo: ModoSistrut) {
  const linha = parametros.bitolas[i];
  if (!linha) throw new Error(`Bitola ${i} fora da tabela do .DSP`);
  return areaBitola(linha.bitola, parametros, modo);
}

/** Bitola da posição `i` (0..9) da tabela do .DSP (V_0eee..V_0f12). */
export function bitolaDaPosicao(i: number, parametros: ParametrosDsp) {
  const linha = parametros.bitolas[i];
  if (!linha) throw new Error(`Bitola ${i} fora da tabela do .DSP`);
  return linha.bitola;
}

/** Intervalo de bw da tabela de arranjos (DESDIM.BAS:3208-3223, L_15a54): 0 até o 1º
 *  limite, 1 até o 2º etc., só até o número de grupos do .DSP. */
export function intervaloDeLargura(bw: number, parametros: ParametrosDsp) {
  const grupos = parametros.gruposBitolas;
  const lim = parametros.limitesIntervalos;
  let intervalo = 0;
  if (bw > (lim[0] ?? 0)) intervalo = 1;
  for (let k = 2; k <= 5; k++) if (grupos > k && bw > (lim[k - 1] ?? 0)) intervalo = k;
  return intervalo;
}

/** Teto de x > 0 como o original escreve: INT(x) − (INT(x) < x). */
const teto = (x: number) => qbInt(x) + (qbInt(x) < x ? 1 : 0);

/** Arranjo da armadura tracionada (DESDIM.BAS:3234-3275, L_15c9c; U05-010): o primeiro
 *  arranjo do intervalo com área ≥ As. "N#φ" vira "n#φ" com n = teto(As/aφ), pelo menos
 *  4 com bw > largura do estribo simples e 6 com bw > a do duplo. Acima da tabela: "***".
 *  O texto sai como o original o monta (com o espaço do STR$: " 5#16"). */
export function arranjoTracao(
  as: number,
  bw: number,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const tabela = parametros.arranjosPorIntervalo[intervaloDeLargura(bw, parametros)] ?? [];
  let i = 0;
  for (;;) {
    const linha = tabela[i];
    if (linha && linha.area >= as) break;
    i += 1;
    if ((tabela[i]?.area ?? 0) <= 0) return "***";
  }
  const arranjo = tabela[i]!.arranjo;
  if (arranjo.slice(0, 1).toUpperCase() !== "N") return arranjo;
  const a = areaBitola(Number.parseFloat(arranjo.slice(2)), parametros, modo);
  let n = s(teto(as / a));
  if (bw > parametros.larguraEstriboSimples) n = Math.max(4, n);
  if (bw > parametros.larguraEstriboDuplo) n = Math.max(6, n);
  return qbStr(n) + arranjo.slice(1);
}

/** Barras da armadura comprimida (DESDIM.BAS:3276-3335, L_1600a): mínimo n0 = 2/4/6
 *  barras por bw; a primeira bitola (6,3; 8; 10 com n0+1; 12,5; 16; 20 com n0+2) cuja
 *  área vezes esse número passe de Asc; senão 25 (ou 20, ou 16) com pelo menos 2.
 *  Sem Asc: "-". */
export function arranjoCompressao(
  asc: number,
  bw: number,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  if (!(asc > 0)) return "-";
  const n0 =
    2 +
    (bw > parametros.larguraEstriboSimples ? 2 : 0) +
    (bw > parametros.larguraEstriboDuplo ? 2 : 0);
  const a = (i: number) => areaDaPosicao(i, parametros, modo);
  const texto = (n: number, i: number) =>
    `${qbStr(n).slice(1)}#${qbStr(bitolaDaPosicao(i, parametros)).slice(1)}`;
  const candidatas: [posicao: number, extra: number][] = [
    [2, 1],
    [3, 1],
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 2],
  ];
  for (const [i, extra] of candidatas) {
    if ((n0 + extra) * a(i) > asc) return texto(teto(asc / a(i)), i);
  }
  const ultima = a(8) > 0 ? 8 : a(7) > 0 ? 7 : 6;
  return texto(Math.max(2, teto(asc / a(ultima))), ultima);
}

/** Lê "n1#φ1[+n2#φ2]" (DESDIM.BAS:3135-3148, L_1521a): VAL antes do "#", VAL depois;
 *  segundo grupo depois do "+", com quantidade 1 quando omitida ("+#8"). */
export function leArranjo(texto: string): BarrasArranjo {
  const val = (t: string) => {
    const m = /^\s*[+-]?(\d+\.?\d*|\.\d+)/.exec(t);
    return m ? Number(m[0]) : 0;
  };
  const cerquilha = texto.indexOf("#");
  const n1 = val(texto);
  const bitola1 = val(texto.slice(cerquilha + 1));
  const mais = texto.indexOf("+");
  if (mais < 0) return { n1, bitola1, n2: 0, bitola2: 0 };
  const depois = texto.slice(mais + 1);
  const bitola2 = val(depois.slice(depois.indexOf("#") + 1));
  const n2 = val(depois);
  return { n1, bitola1, n2: n2 === 0 ? 1 : n2, bitola2 };
}

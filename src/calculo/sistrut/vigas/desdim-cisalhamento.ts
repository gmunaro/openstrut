// Cisalhamento do DESDIM (F_15118, DESDIM.BAS:3127-3675): Asw por lado do tramo,
// uma bitola de estribo (máxima e mínima) para a viga inteira, número de estribos
// lado a lado por bw e espaçamento arredondado para baixo na lista do .DSP.
// Unidades: cm, t, t/cm²; Asw em cm²/m. Livros: U03-026..039
// (livros_arm_forma_des.md 4.3); PLANO D3.
import { ErroQB, atribuicao, qbInt, qbStr } from "../base/f32";
import { raiz } from "../base/x87";
import type { EstriboLado, MateriaisSistrut, ModoSistrut, ParametrosDsp } from "../base/tipos";
import { areaDaPosicao, bitolaDaPosicao } from "./desdim-barras";
import type { SecaoCalculo } from "./desdim-flexao";

/** Estribos lado a lado (V_1e1a): 1 até a largura do estribo simples, 2 até a do duplo,
 *  3 acima (DESDIM.BAS:3150-3154). Ramos = 2 × isso. */
export function estribosLadoALado(bw: number, parametros: ParametrosDsp) {
  if (!(bw > parametros.larguraEstriboSimples)) return 1;
  return bw > parametros.larguraEstriboDuplo ? 3 : 2;
}

/** Asw (cm²/m) para o cortante v (t) (L_15789, DESDIM.BAS:3176-3207; U03-026, U03-027):
 *  ψ = 0,225 + 15ρ com ρ = max(0,001; min(0,015; As/(3·bw·h)));
 *  Asw = (|V|/(bw·d)·γs·γf − ψ·√(1000·fck)/1000)/fyk·bw·100·γs, no mínimo min(bw, d)·taxa.
 *  `asRho` é a coluna 5 de A_128e, que só o DESAUXDI grava (DESDIM.BAS:5004), depois do
 *  dimensionamento: na impressão do original ela vale 0 e ρ = 0,001. */
export function aswCortante(
  v: number,
  secao: SecaoCalculo,
  asRho: number,
  materiais: MateriaisSistrut,
  parametros: ParametrosDsp,
  coeficienteForca: number,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const rz = raiz(modo);
  const { bw: b, h, d } = secao;
  const { fck, fyk, gamaF, gamaS } = materiais;
  const mult = parametros.multiplicadorUnidade;
  const r = s(asRho / (3 * b * h));
  const rhoMenor = s(0.015) < r ? s(0.015) : r;
  const rho = s(0.001) > rhoMenor ? s(0.001) : rhoMenor;
  let asw = s(
    ((((Math.abs(v) * coeficienteForca) / (b * d)) * gamaS * gamaF -
      ((rho * 15 + s(0.225)) * rz(1000 * mult * fck)) / 1000) /
      (mult * fyk)) *
      b *
      100 *
      gamaS,
  );
  const menor = b < d ? b : d;
  if (menor * parametros.taxaEstriboMinima > asw) asw = s(menor * parametros.taxaEstriboMinima);
  return asw;
}

/** Bitola que dá espaçamento ≥ s mínimo para o Asw (L_16976, DESDIM.BAS:3369-3394): a
 *  menor das bitolas 0..5 do .DSP com n·a·200/Asw ≥ smín. Sem nenhuma, fica a
 *  `anterior` (a variável V_0e34 é compartilhada entre os tramos). */
export function bitolaEstriboTramo(
  aswMaximo: number,
  bw: number,
  anterior: number,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  const n = estribosLadoALado(bw, parametros);
  let bitola = anterior;
  for (let i = 5; i >= 0; i--) {
    const a = areaDaPosicao(i, parametros, modo);
    if ((n * a * 200) / aswMaximo >= parametros.espacamentoEstriboMinimo)
      bitola = bitolaDaPosicao(i, parametros);
  }
  return bitola;
}

/** Bitolas de estribo da viga (L_1661c, DESDIM.BAS:3336-3368; U03-028): a máxima é a
 *  maior das bitolas por tramo (com o maior Asw dos dois lados); a mínima, a da linha
 *  da tabela A142c do .DSP cuja máxima é essa (a de menor índice). Sem linha, 0. */
export function bitolasEstriboViga(
  aswPorTramo: { bw: number; aswEsquerda: number; aswDireita: number }[],
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  let maxima = 0;
  let porTramo = 0;
  for (const t of aswPorTramo) {
    const asw = t.aswEsquerda > t.aswDireita ? t.aswEsquerda : t.aswDireita;
    porTramo = bitolaEstriboTramo(asw, t.bw, porTramo, parametros, modo);
    if (porTramo > maxima) maxima = porTramo;
  }
  let minima = 0;
  for (let i = 5; i >= 0; i--) {
    const linha = parametros.bitolasEstribo[i];
    if (linha && linha.maxima === maxima) minima = linha.minima;
  }
  return { maxima, minima };
}

/** Arredonda o espaçamento para baixo na lista do .DSP (10/12/15/.../30; DESDIM.BAS:
 *  3455-3468, 3661-3675): o elemento e(k) com e(k) ≤ s < e(k+1). Fora da lista o
 *  original procura além do último "/" e para com o erro 5 do MID$. */
export function arredondaNaLista(espacamento: number, parametros: ParametrosDsp) {
  const lista = parametros.espacamentosEstribo;
  for (let k = 0; k + 1 < lista.length; k++) {
    if (espacamento < lista[k + 1]! && espacamento >= lista[k]!) return lista[k]!;
  }
  throw new ErroQB(5, `Espaçamento de estribo ${espacamento} cm fora da lista do .DSP`);
}

/** Espaçamento de uma bitola para o Asw (L_180a9, DESDIM.BAS:3635-3675): n·a·200/Asw,
 *  no máximo o smáx do .DSP, arredondado na lista. */
function espacamentoDaBitola(
  posicao: number,
  n: number,
  asw: number,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const e = s((n * areaDaPosicao(posicao, parametros, modo) * 200) / asw);
  if (e >= parametros.espacamentoEstriboMaximo) return parametros.espacamentoEstriboMaximo;
  return arredondaNaLista(e, parametros);
}

/** Bitola e espaçamento do estribo para o Asw de um lado (L_16b55, DESDIM.BAS:3395-3634;
 *  U03-031..039). smáx = INT(d/2) (ou INT(h/2)) ≤ teto do .DSP. Primeiro tenta a bitola
 *  mínima da viga com o espaçamento do Asw mínimo (≥ smín); se ela não dá smín para este
 *  Asw, usa a máxima (sem o piso smín). Com mais de um estribo lado a lado, o número vem
 *  na frente ("2#5/12"). */
export function estriboLado(
  asw: number,
  secao: SecaoCalculo,
  bitolas: { maxima: number; minima: number },
  parametros: ParametrosDsp,
  modo: ModoSistrut,
): EstriboLado {
  const s = atribuicao(modo);
  const { bw: b, h, d } = secao;
  const p = parametros;
  const base = s(qbInt(p.comparaEspacamentoMaximo === "d/2" ? d / 2 : h / 2));
  let sMinima = base <= p.espacamentoEstriboMaximo ? base : p.espacamentoEstriboMaximo;
  let sMaxima = sMinima;
  const n = estribosLadoALado(b, p);
  const menor = b < d ? b : d;
  // espaçamento do Asw mínimo com a bitola da posição i
  const doMinimo = (i: number) =>
    (n / (p.taxaEstriboMinima * menor)) * areaDaPosicao(i, p, modo) * 200;
  for (let i = 4; i >= 0; i--) {
    if (bitolas.minima === bitolaDaPosicao(i, p) && doMinimo(i) <= sMinima) {
      const e = s(qbInt(doMinimo(i)));
      sMinima = e > p.espacamentoEstriboMinimo ? e : p.espacamentoEstriboMinimo;
    }
  }
  if (sMinima !== p.espacamentoEstriboMaximo) sMinima = arredondaNaLista(sMinima, p);
  if (asw === 0) return { texto: textoDoEstribo(" "), bitola: 0, espacamento: 0, lado: n };

  let escolha: { bitola: number; espacamento: number } | undefined;
  for (let i = 4; i >= 0; i--) {
    const a = areaDaPosicao(i, p, modo);
    if (
      (n * a * 200) / asw >= p.espacamentoEstriboMinimo &&
      bitolas.minima === bitolaDaPosicao(i, p)
    ) {
      const e = espacamentoDaBitola(i, n, asw, p, modo);
      escolha = { bitola: bitolaDaPosicao(i, p), espacamento: sMinima < e ? sMinima : e };
    }
  }
  if (!escolha) {
    for (let i = 5; i >= 0; i--) {
      if (bitolas.maxima === bitolaDaPosicao(i, p) && doMinimo(i) <= sMaxima)
        sMaxima = s(qbInt(doMinimo(i)));
    }
    if (sMaxima !== p.espacamentoEstriboMaximo) sMaxima = arredondaNaLista(sMaxima, p);
    for (let i = 5; i >= 0; i--) {
      if (bitolas.maxima === bitolaDaPosicao(i, p)) {
        const e = espacamentoDaBitola(i, n, asw, p, modo);
        escolha = { bitola: bitolaDaPosicao(i, p), espacamento: sMaxima < e ? sMaxima : e };
      }
    }
  }
  let bruto = escolha ? `#${qbStr(escolha.bitola).slice(1)}/${qbStr(escolha.espacamento)}` : "*";
  if (n > 1) bruto = (qbStr(n) + bruto).slice(1);
  return {
    texto: textoDoEstribo(bruto),
    bitola: escolha?.bitola ?? 0,
    espacamento: escolha?.espacamento ?? 0,
    lado: n,
  };
}

/** Tira o espaço do STR$ depois da "/" (DESDIM.BAS:3130, L_15122): MID$(t, 1, INSTR(t, "/"))
 *  + MID$(t, INSTR(t, "/") + 2). "#5/ 12" → "#5/12"; sem "/", perde o 1º caractere. */
function textoDoEstribo(bruto: string) {
  const barra = bruto.indexOf("/") + 1;
  return bruto.slice(0, barra) + bruto.slice(barra + 1);
}

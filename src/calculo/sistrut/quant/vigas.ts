// Quantitativos de viga do SISTRUT 4.0: o quadro de cada viga detalhada que o DESINIT
// grava no <obra>.TAB (FUN_2000_2FE8, DESINIT.BAS:763-933) e o resumo geral do item 4 do
// DESENHO (DESENHO.BAS:2228-2310). É o único quantitativo do original: não há volume
// nem fôrma de laje e de pilar (livros_arm_forma_des.md 2; PLANO Q1-Q5).
import type {
  DetalhamentoViga,
  FormaViga,
  ModoSistrut,
  ParametrosDsp,
  QuadroDaViga,
  QuadroViga,
  ResumoGeralVigas,
  SecoesViga,
} from "../base/tipos";
import { atribuicao, qbCint, qbInt } from "../base/f32";

/** INT do modo: no corrigido, com a folga de float64 de `Comum.int` (vigas/desinitComum.ts). */
const intModo = (modo: ModoSistrut, x: number) =>
  modo === "original" ? qbInt(x) : qbInt(x + 1e-9 * Math.max(1, Math.abs(x)));

/** Comprimento total (cm) de cada bitola 0..9 do .DSP: Σ quantidade·comprimento das
 *  posições, somado em SINGLE na ordem do quadro (L_20DBD, DESINIT.BAS:587-610). */
export function comprimentosPorBitola(
  detalhamento: DetalhamentoViga,
  parametros: ParametrosDsp,
  modo: ModoSistrut,
) {
  const s = atribuicao(modo);
  const total = parametros.bitolas.map(() => 0);
  for (const p of detalhamento.posicoes) {
    const linha = s(p.quantidade * p.comprimento);
    for (const [i, b] of parametros.bitolas.entries()) {
      if (s(b.bitola) === s(p.bitola)) total[i] = s(total[i]! + linha);
    }
  }
  return total;
}

/** Volume (centésimos de m³) e fôrma (centésimos de m²) da viga: Σ bw·h·L/10⁴ e
 *  Σ (2h + bw − Hle − Hld)·L/100 com L = vão livre de face a face, INT no fim
 *  (DESINIT.BAS:763-770; U17-B-01, U17-B-02). Os balanços entram; um balanço sem seção
 *  própria usa a do apoio (DESDIM.BAS:2919-2929). */
export function volumeEForma(secoes: SecoesViga, forma: FormaViga, modo: ModoSistrut) {
  const s = atribuicao(modo);
  const n = forma.tramos.length;
  const balE = forma.balancoEsquerdo !== undefined;
  const balD = forma.balancoDireito !== undefined;
  const formaT = (t: number) =>
    t === 0 ? forma.balancoEsquerdo : t === n + 1 ? forma.balancoDireito : forma.tramos[t - 1];
  const secaoT = (t: number) => {
    const sec =
      t === 0 ? secoes.balancoEsquerdo : t === n + 1 ? secoes.balancoDireito : secoes.tramos[t - 1];
    if (sec && sec.bw > 0 && sec.hw > 0) return { bw: sec.bw, hw: sec.hw };
    const ap = secoes.apoios[Math.max(0, t - 1)];
    return t === 0 || t === n + 1
      ? { bw: ap?.bw ?? 0, hw: ap?.hw ?? 0 }
      : { bw: sec?.bw ?? 0, hw: sec?.hw ?? 0 };
  };
  // faces do vão livre (S_30132, DESINIT.BAS:979-983): o apoio à esquerda do tramo t é
  // a `larguraApoio` do tramo t; a do balanço direito é a do último apoio
  const larguraApoio = (k: number) => formaT(k + 1)?.larguraApoio ?? 0;
  let volume = 0;
  let area = 0;
  let face1 = 0;
  for (let t = balE ? 0 : 1; t <= n + (balD ? 1 : 0); t++) {
    const f = formaT(t);
    const face0 = t === 0 ? 0 : s(face1 + larguraApoio(t - 1));
    face1 = t === 0 ? s(f?.vaoLivre ?? 0) : s(face0 + (f?.vaoLivre ?? 0));
    const l = face1 - face0;
    const { bw, hw } = secaoT(t);
    volume = s((bw * hw * l) / 10000 + volume);
    area = s(((hw * 2 + (bw - (f?.hle ?? 0) - (f?.hld ?? 0))) * l) / 100 + area);
  }
  return { volumeCentesimos: s(intModo(modo, volume)), formaCentesimos: s(intModo(modo, area)) };
}

/** Peso por bitola, kg: CINT(comprimento cm·kg/m/100) com o kg/m da tabela do .DSP
 *  (DESINIT.BAS:773-782; DESENHO.BAS:2310; U17-B-03, U09-017). */
export function pesosPorBitola(comprimentos: readonly number[], parametros: ParametrosDsp) {
  return comprimentos.map((c, i) => qbCint((c * (parametros.bitolas[i]?.kgPorM ?? 0)) / 100));
}

/** Peso que o quadro de aço do desenho (DXF e impressora, DESIMP) escreve: CINT(c·kg/100
 *  + 0,5), que arredonda para cima no meio quilo (DESIMP.BAS:3475). retrad_des_det:
 *  φ10 2612 cm → 17 kg (o .TAB e o resumo dão 16). */
export const pesoNoDesenho = (comprimento: number, kgPorM: number) =>
  qbCint((comprimento * kgPorM) / 100 + 0.5);

/** Quadro da viga gravado no .TAB (contrato `QuadroDaViga`). */
export const quadroDaViga: QuadroDaViga = (
  detalhamento,
  secoes,
  forma,
  repeticoes,
  parametros,
  modo,
) => {
  const comprimentoPorBitola = comprimentosPorBitola(detalhamento, parametros, modo);
  const pesoPorBitola = pesosPorBitola(comprimentoPorBitola, parametros);
  const { volumeCentesimos, formaCentesimos } = volumeEForma(secoes, forma, modo);
  // TAXA = INT(100/vol·Σ pesos) kg/m³ (DESINIT.BAS:852); vol 0 dá divisão por zero no
  // original, aqui 0
  const s = atribuicao(modo);
  let peso = 0;
  for (const [i, c] of comprimentoPorBitola.entries())
    if (c !== 0) peso = s(pesoPorBitola[i]! + peso);
  const taxa = volumeCentesimos > 0 ? s(intModo(modo, (100 / volumeCentesimos) * peso)) : 0;
  return {
    nome: detalhamento.nome,
    repeticoes,
    volumeCentesimos,
    formaCentesimos,
    comprimentoPorBitola,
    pesoPorBitola,
    taxa,
  } satisfies QuadroViga;
};

/** Resumo geral do DESENHO (item 4, contrato `ResumoGeralVigas`): soma dos quadros ×
 *  MAX(1, repetições); comprimentos em m inteiros (CINT(cm/100)), volume e fôrma em m³ e
 *  m² com 1 casa (CINT(x/10)/10), pesos CINT(cm·kg/m/100) sobre o total. `porViga`
 *  traz a linha de cada viga, sem as repetições, como o original imprime. */
export const resumoGeralVigas: ResumoGeralVigas = (quadros, parametros, modo) => {
  const s = atribuicao(modo);
  const total = parametros.bitolas.map(() => 0);
  let volume = 0;
  let forma = 0;
  const decimo = (x: number) => s(qbCint(x / 10) / 10);
  const porViga = quadros.map((q) => {
    const rept = Math.max(1, q.repeticoes);
    for (const [i, c] of q.comprimentoPorBitola.entries()) total[i] = s(c * rept + (total[i] ?? 0));
    volume = s(q.volumeCentesimos * rept + volume);
    forma = s(q.formaCentesimos * rept + forma);
    return { nome: q.nome, volume: decimo(q.volumeCentesimos), forma: decimo(q.formaCentesimos) };
  });
  return {
    volume: decimo(volume),
    forma: decimo(forma),
    comprimentoPorBitola: total.map((c) => qbCint(c / 100)),
    pesoPorBitola: pesosPorBitola(total, parametros),
    porViga,
  };
};

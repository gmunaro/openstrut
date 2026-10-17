// Armadura de uma viga editada à mão no DESEDCAO do SISTRUT 4.0 ("Gravo a Viga Editada"),
// como o .EDV a grava (DESEDCAO.BAS:464-588). Vai na viga da obra (`Viga.armaduraEditada`)
// e substitui, no detalhamento do caminho SISTRUT, as barras e os estribos automáticos
// (DESINIT S_202b9, DESINIT.BAS:404-966). O leitor é `armazenamento/sistrut/edv.ts`.
//
// Unidades do original, não SI: posições e comprimentos em cm a partir da ponta esquerda
// da viga, bitolas em mm, fck e fyk em t/cm² (vezes `fatorUnidade`), M+ em t·m. É o registro
// do original guardado como veio, para refazer o quadro de ferros número a número.

/** Barra longitudinal (A_1AF2 negativas, A_1AC4 positivas; dobras em A_1B4E/A_1B20). */
export interface BarraEditada {
  quantidade: number;
  /** mm */
  bitola: number;
  /** cm a partir da ponta esquerda da viga. */
  inicio: number;
  fim: number;
  /** Dobras (ganchos) na ponta esquerda e na direita, cm. */
  dobras: [number, number];
}

/** Grampo (A_1BD8 negativos, A_1BAA positivos). */
export interface GrampoEditado {
  quantidade: number;
  bitola: number;
  inicio: number;
  fim: number;
  /** Coluna 4: 0 grampo no apoio esquerdo do tramo, 1 no direito. */
  lado: "esquerdo" | "direito";
  /** Coluna 5: largura do grampo, cm (o comprimento é 2·(fim − início) + largura). */
  largura: number;
}

/** Porta-estribo (A_1B7C). */
export interface PortaEstriboEditado {
  quantidade: number;
  bitola: number;
  inicio: number;
  fim: number;
}

/** Armadura de pele de um trecho (A_1C34), com o índice do original: 0 balanço esquerdo,
 *  1..n tramos, n + 1 balanço direito. */
export interface PeleEditada {
  trecho: number;
  quantidadePorFace: number;
  bitola: number;
  inicio: number;
  fim: number;
}

/** Trecho de estribos (A_1C06). */
export interface TrechoEstriboEditado {
  inicio: number;
  fim: number;
  bitola: number;
  espacamento: number;
  /** Estribos lado a lado (1 simples, 2 duplo, 3 triplo). */
  ladoALado: number;
  /** Seção do tramo, cm: a coluna 5 grava INT(bw) + h·0,0001 (DESINIT, desinitBarras.ts). */
  bw: number;
  h: number;
  /** Nº da posição de estribo (1 = a primeira). */
  posicao: number;
}

/** Nota de observação na forma (A_1C90$(2..5), DESEDCAO.BAS:4404-4470). */
export interface NotaForma {
  trecho: number;
  /** <E>squerda, <C>entro ou <D>ireita do trecho. */
  local: "E" | "C" | "D";
  texto: string;
}

/** Nota de observação na armadura (A_1C90$(6..14), DESEDCAO.BAS:4480-4570). */
export interface NotaArmadura {
  /** Nº da posição de barra (1 = a primeira negativa, na ordem do quadro de ferros). */
  posicao: number;
  texto: string;
}

/** Um .EDV lido. */
export interface EdicaoVigaSistrut {
  /** Do nome do arquivo: o registro da viga no .SEC/.FOR e os 4 primeiros caracteres do
   *  pavimento, em maiúsculas. */
  registro: number;
  pavimento: string;
  /** Nome da viga (V_0DD4$). */
  viga: string;
  /** Comprimento total da viga, cm, de ponta a ponta (DESEDCAO.BAS:466). */
  comprimento: number;
  /** fck e fyk, t/cm² na unidade do DESENHO (V_0EBA, V_0EBE), o multiplicador da unidade
   *  (V_0EC6) e o nome dela (V_0ECA$, "t/cm2"). */
  materiais: { fck: number; fyk: number; fatorUnidade: number; unidade: string };
  /** Cobrimento e cobrimento + acréscimo (d'), cm (V_0EAA, V_0EA6). */
  cobrimento: number;
  cobrimentoMaisAcrescimo: number;
  /** Repetições da viga no DESENHO (A_1CBE%); o DESEDITA só o usa se a viga ainda não
   *  tiver repetições (DESEDITA.BAS:755-756). */
  repeticoes: number;
  /** Nº de tramos e balanços (V_0DDC, V_0DE0, V_0DE4). */
  tramos: number;
  balancoEsquerdo: boolean;
  balancoDireito: boolean;
  negativas: BarraEditada[];
  grampoNegativos: GrampoEditado[];
  positivas: BarraEditada[];
  grampoPositivos: GrampoEditado[];
  portaEstribos: PortaEstriboEditado[];
  /** Pele (V_186E ≠ 0): os trechos com pele (o arquivo grava todos, de 0 a n + balanço
   *  direito) e o nº de trechos com pele por bitola 0..5 (A_1A96%). null sem pele. */
  pele: { linhas: number; trechos: PeleEditada[]; trechosPorBitola: number[] } | null;
  estribos: TrechoEstriboEditado[];
  notasForma: NotaForma[];
  /** M+ do detalhamento de cada trecho 0..n + balanço direito, t·m na unidade do DESENHO
   *  (A_128E(t,4), DESINIT, desinit.ts). */
  momentosPositivos: number[];
  notasArmadura: NotaArmadura[];
}

/** Tamanho dos arrays do COMMON do DESENHO (DESEDITA.BAS:729-746; A_1C90$ de 0 a 15,
 *  DESENHO.BAS:613): passar deles é o erro 9 do QuickBASIC. O leitor e a validação do
 *  arquivo recusam a edição maior. */
export const LIMITES_EDICAO_VIGA = {
  longitudinais: 60,
  grampos: 10,
  portaEstribos: 30,
  estribos: 50,
  /** Trechos 0..n + balanço direito. */
  trechos: 14,
  /** A_1C90$(6..15). */
  notasArmadura: 10,
} as const;

/** Nome do .EDV da viga do registro `registro` no pavimento (DESEDCAO.BAS:464). */
export function nomeArquivoEdv(registro: number, pavimento: string): string {
  const n = String(registro);
  return `R${n}${"_".repeat(Math.max(0, 3 - n.length))}${pavimento.slice(0, 4).toUpperCase()}.EDV`;
}

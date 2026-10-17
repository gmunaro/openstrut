// Comparação "Original × Corrigido" por peça: a situação (ok/aviso/falha/sem) e a grandeza
// principal de cada tipo (Nk dos pilares, taxa das vigas e da escada, momento das lajes;
// `DadosElemento.grandeza`, dados.ts) nos dois modos de cálculo da NB-1/78
// (docs/MODO-CALCULO.md). Puro: nada de three.js nem de React.
import type { DadosElemento, Elemento3D, EstadoElemento } from "../api";

/** Como a peça muda do corrigido para o original. "situacao" vale sobre as outras. */
export type Categoria = "maior" | "igual" | "menor" | "situacao";

/** Ordem da legenda: as duas pontas da paleta divergente com o cinza no meio, e a marca. */
export const CATEGORIAS: readonly Categoria[] = ["maior", "igual", "menor", "situacao"];

/** Paleta divergente de dois matizes (laranja-terra × azul) com cinza no meio, e um verde-
 *  azulado para a mudança de situação. Fora das cores de situação da planta (verde, âmbar,
 *  vermelho) e do fúcsia dos defeitos. Conferida com o validador do skill de visualização
 *  (OKLab: azul × verde-azulado 15,8; laranja-terra × vermelho de falha 16,8). */
export const COR_COMPARACAO: Record<Categoria, string> = {
  maior: "#9c5a12",
  igual: "#d6d3d1",
  menor: "#2f6fc0",
  situacao: "#0d9488",
};

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  maior: "Maior no original",
  igual: "Igual (dentro da tolerância)",
  menor: "Menor no original",
  situacao: "Mudou a situação",
};

/** O que se compara de cada lado. */
export interface Lado {
  estado: EstadoElemento;
  grandeza?: number;
}

export interface Diferenca {
  chave: string;
  categoria: Categoria;
  original: Lado;
  corrigido: Lado;
  /** (original − corrigido) / max(|original|, |corrigido|); undefined sem valor nos dois. */
  relativa?: number;
}

/**
 * Classifica uma peça. A situação diferente (ou o valor que só existe num dos modos) é
 * "situacao". Senão compara a grandeza pela diferença relativa ao maior valor absoluto:
 * até `tolerancia` (fração, 0,01 = 1 %) é "igual"; acima, "maior" ou "menor" no original.
 * Sem cálculo nos dois modos (fundação, lance visual da escada), devolve undefined: a peça
 * fica fora da comparação.
 */
export function classificar(
  original: Lado,
  corrigido: Lado,
  tolerancia: number,
): Pick<Diferenca, "categoria" | "relativa"> | undefined {
  const o = valido(original.grandeza);
  const c = valido(corrigido.grandeza);
  if (original.estado === "sem" && corrigido.estado === "sem" && o === undefined && c === undefined)
    return undefined;
  const relativa =
    o !== undefined && c !== undefined
      ? Math.max(Math.abs(o), Math.abs(c)) === 0
        ? 0
        : (o - c) / Math.max(Math.abs(o), Math.abs(c))
      : undefined;
  const comRelativa = relativa !== undefined ? { relativa } : {};
  if (original.estado !== corrigido.estado || (o === undefined) !== (c === undefined))
    return { categoria: "situacao", ...comRelativa };
  if (relativa === undefined || Math.abs(relativa) <= tolerancia)
    return { categoria: "igual", ...comRelativa };
  return { categoria: relativa > 0 ? "maior" : "menor", ...comRelativa };
}

const valido = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v : undefined);

/** Diferença de cada peça (`ctx.modelo.elementos`) que tem cálculo em algum dos modos, por chave. */
export function compararModos(
  elementos: readonly Pick<Elemento3D, "chave">[],
  original: ReadonlyMap<string, DadosElemento>,
  corrigido: ReadonlyMap<string, DadosElemento>,
  tolerancia: number,
): Map<string, Diferenca> {
  const mapa = new Map<string, Diferenca>();
  for (const e of elementos) {
    const o = lado(original.get(e.chave));
    const c = lado(corrigido.get(e.chave));
    const r = classificar(o, c, tolerancia);
    if (r) mapa.set(e.chave, { chave: e.chave, original: o, corrigido: c, ...r });
  }
  return mapa;
}

const lado = (d: DadosElemento | undefined): Lado =>
  d?.grandeza !== undefined
    ? { estado: d.estado, grandeza: d.grandeza }
    : { estado: d?.estado ?? "sem" };

/** Quantas peças em cada categoria. */
export function contar(diferencas: Iterable<Diferenca>): Record<Categoria, number> {
  const c: Record<Categoria, number> = { maior: 0, igual: 0, menor: 0, situacao: 0 };
  for (const d of diferencas) c[d.categoria]++;
  return c;
}

/** As peças que diferem, na ordem da lista do painel: mudança de situação primeiro, depois
 *  a maior diferença relativa. */
export function queDiferem(diferencas: Iterable<Diferenca>): Diferenca[] {
  return [...diferencas]
    .filter((d) => d.categoria !== "igual")
    .sort(
      (a, b) =>
        Number(b.categoria === "situacao") - Number(a.categoria === "situacao") ||
        Math.abs(b.relativa ?? 0) - Math.abs(a.relativa ?? 0),
    );
}

/**
 * Defeitos do SISTRUT original que atingem a peça, pelo índice `pavimento|elemento` de
 * `errosPorElemento` (telas/resultados/errosOriginal.tsx, o mesmo das marcas de Resultados):
 * o nome do pavimento da peça e o dela. Vazio quando nenhum defeito conferido a atinge.
 */
export function defeitosDaPeca<T>(
  e: Pick<Elemento3D, "nome" | "pavimentoId">,
  pavimentos: readonly { id: string; nome: string }[],
  porElemento: ReadonlyMap<string, readonly T[]>,
): readonly T[] {
  const pav = pavimentos.find((p) => p.id === e.pavimentoId);
  return (pav && porElemento.get(`${pav.nome}|${e.nome}`)) ?? [];
}

/** Peça que difere sem defeito conferido (lista e cartão): não afirma a causa. */
export const SEM_DEFEITO =
  "Sem defeito conferido nesta peça. A diferença pode vir dos materiais em SI, dos cobrimentos da obra, da precisão ou de um defeito que não é conferido aqui.";

/** O que o corrigido muda além dos defeitos conferidos, em docs/MODO-CALCULO.md ("Outras
 *  diferenças do corrigido (não são defeito)", a tabela de entrada dos materiais e a lista
 *  de defeitos corrigidos). */
export const CAUSAS_SEM_DEFEITO =
  "O corrigido usa concreto de 25 kN/m³ (2,5493 t/m³; o original, 2,5 t/m³), aço de 500 MPa (5,0986 t/cm²; o original, 5 t/cm²), o fck convertido exato, os cobrimentos da obra e float64 no lugar do Float32 do original, o que muda um pouco todas as peças. Também dimensiona a viga acima do limite de cisalhamento ou de 40 % do momento, que o original para, e calcula as lajes depois de uma que falha. E corrige outros defeitos da lista de docs/MODO-CALCULO.md, que não são conferidos peça a peça.";

/**
 * O que a lista e o cartão dizem do motivo da diferença de uma peça, a partir dos defeitos
 * conferidos que a atingem (`defeitosDaPeca`). Sem nenhum: o texto de `SEM_DEFEITO`. Com
 * `noQuadro` (os textos do quadro "Afetado por defeito" do cartão da vista no modo original,
 * `DadosElemento.defeitos`, que citam "(defeito P-b)"), separa os que o quadro já mostra,
 * para o cartão não repeti-los.
 */
export function motivoDaPeca<T extends { id: string }>(
  defeitos: readonly T[],
  noQuadro: readonly string[] = [],
): { tipo: "sem"; texto: string } | { tipo: "defeitos"; proprios: T[]; doQuadro: T[] } {
  if (defeitos.length === 0) return { tipo: "sem", texto: SEM_DEFEITO };
  const citado = (d: T) => noQuadro.some((t) => t.includes(`(defeito ${d.id})`));
  return {
    tipo: "defeitos",
    proprios: defeitos.filter((d) => !citado(d)),
    doQuadro: defeitos.filter(citado),
  };
}

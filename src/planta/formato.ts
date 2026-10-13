// Números na tela do editor: vírgula decimal (pt-BR) na exibição e na digitação.

/** Número com `casas` decimais fixas, em pt-BR (ex.: 4,00). */
export const fmt = (n: number, casas = 2) =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
    useGrouping: false,
  });

/** Número para um campo editável: sem zeros à direita, até 4 casas (ex.: 1,5). */
export const fmtCampo = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });

/** Número digitado com vírgula ou ponto decimal; NaN se vazio ou inválido. */
export function numeroDoTexto(s: string) {
  const t = s.trim().replace(",", ".");
  return t === "" ? Number.NaN : Number(t);
}

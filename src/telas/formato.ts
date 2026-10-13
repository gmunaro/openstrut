// Formatação de números e unidades para a tela e o relatório. O cálculo é
// sempre em SI; o sistema "tf" converte só na exibição (CLAUDE.md).
import { KN_POR_TF, mpaParaKgfCm2 } from "../calculo/unidades";

export type SistemaUnidades = "si" | "tf";

/** Grandezas que mudam de unidade entre SI e tf. As outras (m, cm, cm², mm, %)
 *  são iguais nos dois sistemas e passam por `formatarNumero` direto. */
export type Grandeza =
  | "forca"
  | "cargaLinear"
  | "cargaArea"
  | "momento"
  | "momentoLinear"
  | "tensao"
  | "pesoEspecifico";

const UNIDADES: Record<Grandeza, Record<SistemaUnidades, string>> = {
  forca: { si: "kN", tf: "tf" },
  cargaLinear: { si: "kN/m", tf: "tf/m" },
  cargaArea: { si: "kN/m²", tf: "tf/m²" },
  momento: { si: "kN·m", tf: "tf·m" },
  momentoLinear: { si: "kN·m/m", tf: "tf·m/m" },
  tensao: { si: "MPa", tf: "kgf/cm²" },
  pesoEspecifico: { si: "kN/m³", tf: "tf/m³" },
};

/** Unidade SI escrita pelo motor de cálculo → grandeza (para converter a memória). */
const GRANDEZA_DA_UNIDADE = new Map<string, Grandeza>(
  Object.entries(UNIDADES).map(([g, u]) => [u.si, g as Grandeza]),
);

/** Rótulo da unidade da grandeza no sistema escolhido. */
export const unidade = (g: Grandeza, s: SistemaUnidades) => UNIDADES[g][s];

/** Valor SI → valor no sistema escolhido. */
export function converter(valor: number, g: Grandeza, s: SistemaUnidades) {
  if (s === "si") return valor;
  return g === "tensao" ? mpaParaKgfCm2(valor) : valor / KN_POR_TF;
}

const formatadores = new Map<number, Intl.NumberFormat>();

/** Número em pt-BR com `casas` decimais fixas; "—" para valor ausente ou não finito. */
export function formatarNumero(valor: number | null | undefined, casas = 2) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  let f = formatadores.get(casas);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
    formatadores.set(casas, f);
  }
  // evita "-0,00"
  const texto = f.format(valor);
  return /^-0(,0*)?$/.test(texto) ? texto.slice(1) : texto;
}

/** Valor SI de uma grandeza, convertido e formatado (sem a unidade). */
export const formatarGrandeza = (
  valor: number | null | undefined,
  g: Grandeza,
  s: SistemaUnidades,
  casas = 2,
) => formatarNumero(valor === null || valor === undefined ? valor : converter(valor, g, s), casas);

/** Valor e unidade de uma etapa da memória, convertidos quando a unidade é uma
 *  das grandezas SI conhecidas; outras unidades passam sem mudança. */
export function converterEtapa(valor: number, unidadeSi: string | undefined, s: SistemaUnidades) {
  const g = unidadeSi === undefined ? undefined : GRANDEZA_DA_UNIDADE.get(unidadeSi);
  if (!g) return { valor, unidade: unidadeSi ?? "" };
  return { valor: converter(valor, g, s), unidade: unidade(g, s) };
}

/** Casas decimais para um valor qualquer da memória: 4 algarismos significativos, entre 0 e 4 casas. */
export function casasAdequadas(valor: number) {
  const a = Math.abs(valor);
  if (a === 0 || !Number.isFinite(a)) return 2;
  const digitosInteiros = Math.floor(Math.log10(a)) + 1;
  return Math.min(4, Math.max(0, 4 - digitosInteiros));
}

const casasInteiroOuMeia = (x: number) => (x % 1 === 0 ? 0 : 1);

/** Barra de laje ou estribo: "φ8 c/15". */
export const formatarBarraEspacada = (
  b: { phi: number; espacamento: number } | null | undefined,
) =>
  b
    ? `φ${formatarNumero(b.phi, casasInteiroOuMeia(b.phi))} c/${formatarNumero(b.espacamento, casasInteiroOuMeia(b.espacamento))}`
    : "—";

/** Barras longitudinais: "3 φ10". */
export const formatarBarras = (b: { n: number; phi: number } | null | undefined) =>
  b ? `${b.n} φ${formatarNumero(b.phi, casasInteiroOuMeia(b.phi))}` : "—";

/** Data e hora curtas em pt-BR. */
export const formatarData = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Texto digitado → número; aceita vírgula ou ponto decimal. `null` se não for número finito. */
export function lerNumero(texto: string) {
  const limpo = texto.trim().replace(/\s/g, "").replace(",", ".");
  if (limpo === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

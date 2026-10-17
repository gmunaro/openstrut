// Cores da vista 3D. Estado: as mesmas da planta (planta/Desenho.tsx, COR_SITUACAO);
// sem cálculo, um cinza neutro por tipo. Mapa de grandeza: rampa sequencial de um só
// matiz (azul, claro = menor, escuro = maior), a do skill de visualização do projeto.
import { COR_SITUACAO } from "../../planta/Desenho";
import type { Estado } from "./dados";
import type { TipoElemento } from "./modelo";

/** Cinzas por tipo para "sem cálculo" e para os tipos fora do mapa de grandeza. */
export const NEUTRO: Record<TipoElemento, string> = {
  laje: "#cbd5e1",
  viga: "#94a3b8",
  pilar: "#e2e8f0",
  escada: "#a8a29e",
  fundacao: "#78716c",
};

export const COR_ESTADO: Record<Exclude<Estado, "sem">, string> = COR_SITUACAO;

export const ROTULO_ESTADO: Record<Estado, string> = {
  ok: "Sem avisos",
  aviso: "Com avisos",
  falha: "Falha",
  sem: "Sem cálculo",
};

/** Marca dos defeitos do original: fúcsia, fora da paleta de estado (não é "falha"). */
export const COR_DEFEITO = "#a21caf";

/** Rampa azul 100 → 700 (passos 100, 200, …, 700). */
export const RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
/** Elemento do tipo do mapa sem valor (sem cálculo). */
export const SEM_VALOR = "#9ca3af";

const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Cor da rampa para t em [0, 1] (interpolada entre os passos, em sRGB). */
export function corNaRampa(t: number): string {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (RAMPA.length - 1);
  const i = Math.min(RAMPA.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [rgb(RAMPA[i]!), rgb(RAMPA[i + 1]!)];
  return hex(a.map((v, k) => v + (b[k]! - v) * f));
}

// Filtro de elementos da aba Resultados: o usuário digita nomes ("V1, P3") ou só a letra
// do tipo ("V" = todas as vigas) e as tabelas e os detalhamentos mostram só esses
// elementos. O relatório não fornece o contexto e mostra tudo.
import { createContext, useContext } from "react";

/** Diz se o elemento de nome `nome` aparece. */
export type Filtro = (nome: string) => boolean;

export const MOSTRA_TUDO: Filtro = () => true;

/**
 * Filtro a partir do texto digitado. Termos separados por vírgula, ponto e vírgula ou
 * espaço; sem diferença de maiúsculas. Todo termo pega o nome exato ("V1" não pega V10);
 * um termo só de letras pega também os nomes que começam por ele seguido de número ("V"
 * pega V1 e V12, não "Viga"). Texto vazio mostra tudo.
 */
export function filtroDeTexto(texto: string): Filtro {
  const termos = texto
    .split(/[\s,;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t !== "");
  if (termos.length === 0) return MOSTRA_TUDO;
  return (nome) => {
    const n = nome.trim().toUpperCase();
    return termos.some((t) => n === t || (/^[A-Z]+$/.test(t) && new RegExp(`^${t}\\d`).test(n)));
  };
}

export const FiltroContexto = createContext<Filtro>(MOSTRA_TUDO);

/** Filtro em vigor na aba Resultados (MOSTRA_TUDO fora dela). */
export const useFiltro = () => useContext(FiltroContexto);

// Estado da camada de realidade aumentada, no módulo: o Painel (na vista) e a
// sobreposição (na sessão AR, outra raiz React) leem o mesmo estado.
import { useSyncExternalStore } from "react";
import { ESCALA_PADRAO, type EscalaAr } from "./maquete";

/** Por que o aparelho não abre AR (cada um tem a sua explicação no Painel). */
export type MotivoSemAr = "https" | "semWebxr" | "semAr" | "bloqueado";

export type Suporte =
  | { tipo: "verificando" }
  | { tipo: "sim" }
  | { tipo: "nao"; motivo: MotivoSemAr };

/** Fase da sessão: fora dela; pedindo ao navegador; procurando superfície; com o anel
 *  sobre uma superfície; com o prédio posto. */
export type FaseAr = "fora" | "abrindo" | "procurando" | "mirando" | "posicionado";

export interface EstadoAr {
  suporte: Suporte;
  fase: FaseAr;
  escala: EscalaAr;
  /** Erro da última tentativa, para o Painel. */
  erro: string | null;
}

let estado: EstadoAr = {
  suporte: { tipo: "verificando" },
  fase: "fora",
  escala: ESCALA_PADRAO,
  erro: null,
};
const ouvintes = new Set<() => void>();

export function lerEstadoAr(): EstadoAr {
  return estado;
}

export function mudarEstadoAr(parte: Partial<EstadoAr>) {
  estado = { ...estado, ...parte };
  for (const f of ouvintes) f();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
}

/** O estado da camada num componente React (Painel e sobreposição). */
export function useEstadoAr(): EstadoAr {
  return useSyncExternalStore(assinar, lerEstadoAr);
}

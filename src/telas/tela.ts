// Tamanho de tela para o layout: o modo compacto (celular em retrato ou em paisagem)
// troca a estrutura das telas (menu no cabeçalho, folha de propriedades na planta).
// As consultas são as mesmas da variante `compacto:` do index.css; mude as duas juntas.
import { useSyncExternalStore } from "react";

/** Celular: largura menor que a do tablet em retrato, ou pouca altura (celular deitado). */
export const CONSULTA_COMPACTO = "screen and (max-width: 767px), screen and (max-height: 500px)";
/** Celular deitado: pouca altura e mais largo que alto. */
export const CONSULTA_PAISAGEM = "screen and (max-height: 500px) and (orientation: landscape)";

/** Situação de uma media query, atualizada quando a tela muda (girar o celular, redimensionar).
 *  Sem matchMedia (ou com uma imitação sem eventos, nos testes) fica no valor inicial. */
export function useConsulta(consulta: string): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      const mql = typeof window.matchMedia === "function" ? window.matchMedia(consulta) : null;
      if (!mql || typeof mql.addEventListener !== "function") return () => {};
      mql.addEventListener("change", aoMudar);
      return () => mql.removeEventListener("change", aoMudar);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(consulta).matches,
    () => false,
  );
}

/** Layout de celular (CONSULTA_COMPACTO). */
export const useCompacto = () => useConsulta(CONSULTA_COMPACTO);
/** Celular deitado (CONSULTA_PAISAGEM): as barras vão para os lados para sobrar altura. */
export const usePaisagem = () => useConsulta(CONSULTA_PAISAGEM);

/**
 * Com o teclado virtual aberto, a área visível encolhe; o campo em foco volta para dentro
 * dela. O viewport (index.html) pede `interactive-widget=resizes-content`, e este ajuste
 * cobre os navegadores que só mudam o visualViewport.
 */
export function manterCampoVisivel() {
  const vv = window.visualViewport;
  if (!vv) return;
  vv.addEventListener("resize", () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      el.scrollIntoView({ block: "nearest" });
  });
}

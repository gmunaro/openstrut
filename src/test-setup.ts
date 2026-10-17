// Ambiente dos testes de tela (*.ui.test.tsx, happy-dom): IndexedDB em memória,
// ResizeObserver que mede a área da planta como 800 × 600 px e limpeza do DOM e
// dos estados globais (zustand) entre um teste e outro. Também exporta os
// auxiliares que os testes usam para montar o app e obras de exemplo.
import "fake-indexeddb/auto";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, vi } from "vitest";
import { apagarRascunho, listarRascunhos, novoIdRascunho } from "./armazenamento/rascunho";
import { obraNova } from "./dominio/criar";
import type { NormaId, Obra } from "./dominio/obra";
import { useObra } from "./estado/obra";
import { acrescentarLaje, substituirPavimento } from "./planta/edicao";
import { routeTree } from "./routeTree.gen";
import { abrirNaSessao } from "./telas/acoes";
import { useSessao } from "./telas/sessao";

/** Tamanho que o ResizeObserver informa para todo elemento observado (a área do SVG). */
export const AREA_PLANTA = { largura: 800, altura: 600 };

class ResizeObserverFalso {
  constructor(private readonly aoMudar: ResizeObserverCallback) {}
  observe(target: Element) {
    const contentRect = DOMRectReadOnly.fromRect({
      width: AREA_PLANTA.largura,
      height: AREA_PLANTA.altura,
    });
    // o editor só desenha depois de conhecer o tamanho; informa já, como o navegador
    const entrada: ResizeObserverEntry = {
      target,
      contentRect,
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    };
    this.aoMudar([entrada], this);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverFalso;

// partes de DOM que o Radix (Select) e o editor usam e o happy-dom não implementa por completo
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
// diálogos nativos: os testes que confirmam usam vi.spyOn(window, "confirm")
window.confirm ??= () => false;
window.print ??= () => {};

// a primeira rota carregada compila os módulos sob demanda (code splitting): dá folga.
// Com a suíte inteira em paralelo (bun run check) a primeira renderização passou de 5 s.
configure({ asyncUtilTimeout: 15_000 });

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  useObra.getState().fechar();
  useSessao.setState({
    rascunhoId: null,
    arquivo: null,
    nomeArquivo: null,
    obraSalva: null,
    unidades: "si",
  });
  localStorage.clear();
  for (const r of await listarRascunhos()) await apagarRascunho(r.id);
});

/** Monta o app inteiro (rotas reais) num histórico em memória, começando em `caminho`. */
export function renderizarApp(caminho = "/") {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [caminho] }),
  });
  const user = userEvent.setup();
  render(createElement(RouterProvider, { router }));
  return { router, user };
}

/** Obra com um pavimento e duas lajes 4 × 5 m lado a lado (x de 0 a 8 m), com vigas e
 *  pilares gerados como no editor. */
export function obraDuasLajes(norma: NormaId, nome = "Obra teste"): Obra {
  const obra = obraNova(nome, norma);
  let pav = obra.pavimentos[0];
  if (!pav) throw new Error("obra nova sem pavimento");
  for (const r of [
    { x: 0, y: 0, lx: 4, ly: 5 },
    { x: 4, y: 0, lx: 4, ly: 5 },
  ]) {
    const e = acrescentarLaje(pav, r);
    if (!e.ok) throw new Error(e.erro);
    pav = e.pavimento;
  }
  return substituirPavimento(obra, pav.id, pav);
}

/** Abre a obra como a tela inicial faz (estado + sessão com rascunho novo). */
export const abrirObra = (obra: Obra) => abrirNaSessao(obra, novoIdRascunho());

/** Abre o menu "Exportar" do cabeçalho da obra (desktop) e devolve o item `nome`. */
export async function itemExportar(
  user: ReturnType<typeof userEvent.setup>,
  nome: "DXF de formas" | "DXF de armação" | "IFC",
) {
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  return screen.findByRole("menuitem", { name: nome });
}

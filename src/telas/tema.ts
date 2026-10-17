// Tema da tela: escuro (padrão, o visual de sempre), claro ou o do sistema. A escolha
// fica no localStorage; o tema vira a classe .dark no <html> (index.css tem as cores dos
// dois). A área de desenho da planta é escura nos dois, como numa prancheta de CAD.
import { useSyncExternalStore } from "react";

export type Tema = "escuro" | "claro" | "sistema";

export const TEMAS: { id: Tema; rotulo: string }[] = [
  { id: "escuro", rotulo: "Escuro" },
  { id: "claro", rotulo: "Claro" },
  { id: "sistema", rotulo: "Do sistema" },
];

const CHAVE = "openstrut:tema";
const CONSULTA_ESCURO = "(prefers-color-scheme: dark)";
/** Cor da barra do navegador e do app instalado em cada tema (fundo do tema). */
const COR_BARRA = { escuro: "#0f172a", claro: "#ffffff" } as const;

const ehTema = (x: unknown): x is Tema => TEMAS.some((t) => t.id === x);

/** Tema guardado; sem escolha (ou sem localStorage), o escuro. */
export function lerTema(): Tema {
  try {
    const v = localStorage.getItem(CHAVE);
    return ehTema(v) ? v : "escuro";
  } catch {
    return "escuro";
  }
}

/** Se o tema resulta em tela escura, consultando o sistema quando é "sistema". */
export function ehEscuro(tema: Tema, sistemaEscuro: boolean) {
  return tema === "escuro" || (tema === "sistema" && sistemaEscuro);
}

const sistemaEscuro = () =>
  typeof window.matchMedia === "function" && window.matchMedia(CONSULTA_ESCURO).matches;

/** Põe (ou tira) a classe .dark no <html> e acerta a cor da barra do navegador. */
export function aplicarTema(tema: Tema) {
  const escuro = ehEscuro(tema, sistemaEscuro());
  document.documentElement.classList.toggle("dark", escuro);
  document.documentElement.style.colorScheme = escuro ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", COR_BARRA[escuro ? "escuro" : "claro"]);
}

const ouvintes = new Set<() => void>();

/** Grava a escolha, aplica e avisa os seletores abertos. */
export function definirTema(tema: Tema) {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch {
    // sem armazenamento vale só nesta visita
  }
  aplicarTema(tema);
  for (const f of ouvintes) f();
}

/** Aplica o tema guardado na abertura do app e, no modo "sistema", acompanha a troca
 *  de claro/escuro do sistema operacional. */
export function iniciarTema() {
  aplicarTema(lerTema());
  if (typeof window.matchMedia !== "function") return;
  window.matchMedia(CONSULTA_ESCURO).addEventListener?.("change", () => {
    if (lerTema() === "sistema") aplicarTema("sistema");
  });
}

/** Tema escolhido, atualizado quando outro seletor o troca. */
export function useTema(): Tema {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    lerTema,
    () => "escuro",
  );
}

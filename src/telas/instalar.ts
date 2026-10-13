// Instalar o app (PWA) no aparelho. Chrome e Edge (computador e Android) avisam
// pelo evento beforeinstallprompt, e o botão da tela inicial abre o pedido nativo.
// Os outros navegadores não têm esse evento: a tela mostra o caminho manual
// certo para o navegador detectado. A detecção é pura para ser testada sem navegador.
import { useSyncExternalStore } from "react";

export type Plataforma =
  | "ios"
  | "android"
  | "chromium-computador"
  | "firefox-computador"
  | "safari-mac"
  | "outro";

/** O que a detecção lê do `navigator`. */
export interface Navegador {
  userAgent: string;
  maxTouchPoints: number;
}

/** Plataforma pelo user agent. O iPadOS 13+ se apresenta como Mac: o toque o denuncia. */
export function detectarPlataforma({ userAgent: ua, maxTouchPoints }: Navegador): Plataforma {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox\//.test(ua)) return "firefox-computador";
  // Edge, Opera e Brave também trazem "Chrome/" no user agent
  if (/Chrome\/|Chromium\//.test(ua)) return "chromium-computador";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return "safari-mac";
  return "outro";
}

/** Como instalar quando o navegador não oferece o pedido nativo. */
export const INSTRUCAO_INSTALAR: Record<Plataforma, string> = {
  ios: "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.",
  android: "No menu do navegador (⋮), toque em “Instalar app” ou “Adicionar à tela inicial”.",
  "chromium-computador":
    "Clique no ícone de instalar na barra de endereço, à direita do endereço do site.",
  "firefox-computador":
    "O Firefox no computador não instala apps da web: use o OpenStrut aqui no navegador ou abra o site no Chrome ou no Edge para instalar.",
  "safari-mac": "No Safari, use Arquivo → Adicionar ao Dock (macOS 14 ou mais novo).",
  outro: "Procure no menu do navegador a opção “Instalar app” ou “Adicionar à tela inicial”.",
};

/** O que `estaInstalado` lê da janela. */
export interface JanelaApp {
  matchMedia: (consulta: string) => { matches: boolean };
  navigator: object;
}

/** O app já roda instalado: janela própria (display-mode standalone) ou, no iOS,
 *  aberto pela Tela de Início (navigator.standalone). */
export function estaInstalado(w: JanelaApp) {
  return (
    w.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in w.navigator && w.navigator.standalone === true)
  );
}

/** Evento beforeinstallprompt; o lib.dom do TypeScript não o declara. */
export interface PedidoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface EstadoInstalacao {
  /** Pedido nativo guardado, pronto para o botão; null sem suporte ou já usado. */
  pedido: PedidoInstalacao | null;
  /** O navegador avisou que instalou (appinstalled). */
  instalado: boolean;
}

let estado: EstadoInstalacao = { pedido: null, instalado: false };
let ouvindo = false;
const ouvintes = new Set<() => void>();

function mudar(novo: Partial<EstadoInstalacao>) {
  estado = { ...estado, ...novo };
  for (const f of ouvintes) f();
}

/** Começa a guardar o pedido de instalação. O main.tsx chama antes do React,
 *  porque o evento pode chegar antes da tela inicial montar. Chamar de novo não faz nada. */
export function ouvirInstalacao() {
  if (ouvindo) return;
  ouvindo = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // sem isso o Chrome mostra a própria barra; o botão da tela pede depois
    mudar({ pedido: e as PedidoInstalacao });
  });
  window.addEventListener("appinstalled", () => mudar({ pedido: null, instalado: true }));
}

/** Abre o pedido nativo guardado. O navegador só deixa usar cada pedido uma vez. */
export async function pedirInstalacao() {
  const { pedido } = estado;
  if (!pedido) return;
  mudar({ pedido: null });
  await pedido.prompt();
}

/** Estado da instalação para a tela, atualizado pelos eventos do navegador. */
export function useInstalacao() {
  return useSyncExternalStore(
    (f) => {
      ouvirInstalacao();
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => estado,
  );
}

// Token do Cloudflare Turnstile para o relay, quando o build define
// VITE_TURNSTILE_SITEKEY. O widget só aparece se o Turnstile pedir interação; o token
// vence em minutos, então é pedido na hora de cada envio.
import { ATRIBUTO_IGNORAR } from "./captura";

interface ApiTurnstile {
  render: (
    alvo: HTMLElement,
    opcoes: {
      sitekey: string;
      appearance: "interaction-only";
      callback: (token: string) => void;
      "error-callback": () => void;
      "timeout-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let carregando: Promise<ApiTurnstile> | null = null;

function carregar() {
  carregando ??= new Promise<ApiTurnstile>((ok, falha) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : falha(new Error("turnstile")));
    s.onerror = () => {
      carregando = null;
      falha(new Error("não carregou o Turnstile"));
    };
    document.head.append(s);
  });
  return carregando;
}

/** Pede um token novo ao Turnstile. */
export async function tokenTurnstile(sitekey: string): Promise<string> {
  const api = await carregar();
  const caixa = document.createElement("div");
  caixa.setAttribute(ATRIBUTO_IGNORAR, "");
  caixa.className = "fixed bottom-4 left-1/2 z-[110] -translate-x-1/2 print:hidden";
  document.body.append(caixa);
  let id = "";
  try {
    return await new Promise<string>((ok, falha) => {
      id = api.render(caixa, {
        sitekey,
        appearance: "interaction-only",
        callback: ok,
        "error-callback": () => falha(new Error("o Turnstile recusou")),
        "timeout-callback": () => falha(new Error("o Turnstile expirou")),
      });
    });
  } finally {
    if (id) api.remove(id);
    caixa.remove();
  }
}

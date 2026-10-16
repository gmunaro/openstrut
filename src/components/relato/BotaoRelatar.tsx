// Botão flutuante "Relatar problema", montado uma vez na raiz do app (routes/__root.tsx).
// No clique (ou Alt+Shift+R) tira o print da tela como está, com diálogo ou menu aberto,
// e só depois abre o diálogo do relato. Fica por cima de tudo, fora da impressão.
//
// Por que funciona com um diálogo Radix aberto: o Radix põe aria-hidden nos irmãos, mas
// poupa os elementos com aria-live (o contêiner do botão); deixa o body sem eventos de
// ponteiro (o botão volta a ter com pointer-events-auto) e fecha o diálogo com pointerdown
// fora dele (o botão interrompe a propagação, e o diálogo continua aberto no print).
import { Bug, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useObra } from "../../estado/obra";
import { enviarFilaAgora } from "./acoes";
import { capturarTela } from "./captura";
import { coletarDiagnostico } from "./diagnostico";
import { type Captura, DialogoRelato } from "./DialogoRelato";
import { caminhoRelato } from "./relay";

export const ATALHO = "Alt+Shift+R";

/** Alt+Shift+R pelo código da tecla (no Mac, Alt+Shift+R produz outro caractere). */
export const ehAtalho = (e: KeyboardEvent) =>
  e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyR";

/** Não deixa o pointerdown chegar ao document (onde o Radix fecha diálogos e menus) nem tirar o foco. */
const segurar = (e: SyntheticEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

export function BotaoRelatar() {
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [capturando, setCapturando] = useState(false);
  const ocupado = useRef(false);

  const iniciar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    setCapturando(true);
    // obra e diagnóstico do mesmo instante do print
    const obra = useObra.getState().obra;
    const diagnostico = coletarDiagnostico(obra, location.pathname);
    const agora = new Date();
    const print = await capturarTela();
    setCapturando(false);
    setCaptura({ print, diagnostico, obra, agora });
  }, []);

  const fechar = useCallback(() => {
    setCaptura(null);
    ocupado.current = false;
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!ehAtalho(e)) return;
      e.preventDefault();
      void iniciar();
    };
    window.addEventListener("keydown", tecla, { capture: true });
    return () => window.removeEventListener("keydown", tecla, { capture: true });
  }, [iniciar]);

  // relatos guardados sem rede: envia ao abrir o app e quando a conexão volta
  useEffect(() => {
    const c = caminhoRelato();
    if (c.tipo !== "relay") return;
    const tentar = () => void enviarFilaAgora(c.url).catch(() => {});
    tentar();
    window.addEventListener("online", tentar);
    return () => window.removeEventListener("online", tentar);
  }, []);

  return (
    <>
      {!captura && (
        <div
          aria-live="polite"
          data-relato-ignorar=""
          className="pointer-events-auto fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(2rem,calc(env(safe-area-inset-bottom)+1.5rem))] z-[100] print:hidden"
        >
          <button
            type="button"
            aria-label="Relatar problema"
            aria-keyshortcuts={ATALHO}
            title={`Relatar problema (${ATALHO})`}
            disabled={capturando}
            onPointerDown={segurar}
            onMouseDown={segurar}
            onClick={() => void iniciar()}
            className="flex size-11 items-center justify-center rounded-full border bg-secondary/90 text-secondary-foreground shadow-md backdrop-blur transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70"
          >
            {capturando ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Bug className="size-5" />
            )}
          </button>
          <span className="sr-only">{capturando ? "Capturando a tela…" : ""}</span>
        </div>
      )}
      {captura && <DialogoRelato captura={captura} aoFechar={fechar} />}
    </>
  );
}

// Botão flutuante "Relatar problema", montado uma vez na raiz do app (routes/__root.tsx).
// No clique (ou Alt+Shift+R) tira o print da tela como está, com diálogo ou menu aberto,
// e só depois abre o diálogo do relato. Fica por cima de tudo, fora da impressão.
//
// Por que funciona com um diálogo Radix aberto: o Radix põe aria-hidden nos irmãos, mas
// poupa os elementos com aria-live (o contêiner do botão); deixa o body sem eventos de
// ponteiro (o botão volta a ter com pointer-events-auto) e fecha o diálogo com pointerdown
// fora dele (o botão interrompe a propagação, e o diálogo continua aberto no print).
// Se o canto inferior direito tiver um controle (a barra Aplicar/Cancelar de um diálogo em
// tela cheia no celular), o botão sobe pela borda direita até um lugar livre.
import { Bug, LoaderCircle } from "lucide-react";
import {
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useObra } from "../../estado/obra";
import { enviarFilaAgora } from "./acoes";
import { capturarTela } from "./captura";
import { coletarDiagnostico } from "./diagnostico";
import { type Captura, DialogoRelato } from "./DialogoRelato";
import { cobreControle, deslocamentoLivre } from "./posicao";
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

/**
 * Deslocamento para cima que tira o botão de cima de controles (posicao.ts). Reavalia
 * quando o DOM muda (diálogo ou folha abre e fecha), quando a janela muda de tamanho e
 * quando a rolagem para; não durante a rolagem, para o botão não pular.
 */
function useDeslocamentoLivre(caixa: RefObject<HTMLDivElement | null>, ativo: boolean) {
  const [deslocamento, setDeslocamento] = useState(0);
  const atual = useRef(0);
  useEffect(() => {
    if (!ativo) return;
    let quadro = 0;
    const esperas = new Set<ReturnType<typeof setTimeout>>();
    const avaliar = () => {
      quadro = 0;
      const el = caixa.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const padrao = { left: r.left, top: r.top + atual.current, width: r.width, height: r.height };
      const d = deslocamentoLivre(padrao, (c) => cobreControle(c, el), padrao.top - 8);
      atual.current = d;
      setDeslocamento(d);
    };
    const agendar = () => {
      quadro ||= requestAnimationFrame(avaliar);
    };
    const depois = (ms: number) => {
      const t = setTimeout(() => {
        esperas.delete(t);
        agendar();
      }, ms);
      esperas.add(t);
    };
    // diálogos entram com animação: confere de novo quando ela termina
    const mudou = () => {
      agendar();
      depois(300);
    };
    let rolagem: ReturnType<typeof setTimeout> | undefined;
    const rolou = () => {
      clearTimeout(rolagem);
      rolagem = setTimeout(agendar, 150);
    };
    const observador = new MutationObserver(mudou);
    observador.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "open", "hidden"],
    });
    window.addEventListener("resize", mudou);
    window.addEventListener("scroll", rolou, { capture: true, passive: true });
    mudou();
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", mudou);
      window.removeEventListener("scroll", rolou, { capture: true });
      cancelAnimationFrame(quadro);
      clearTimeout(rolagem);
      for (const t of esperas) clearTimeout(t);
    };
  }, [caixa, ativo]);
  return deslocamento;
}

export function BotaoRelatar() {
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [capturando, setCapturando] = useState(false);
  const ocupado = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const deslocamento = useDeslocamentoLivre(caixa, captura === null);

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
          ref={caixa}
          aria-live="polite"
          style={deslocamento ? { transform: `translateY(-${deslocamento}px)` } : undefined}
          data-relato-ignorar=""
          className="pointer-events-auto fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(2rem,calc(env(safe-area-inset-bottom)+1.5rem))] z-[100] transition-transform print:hidden"
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

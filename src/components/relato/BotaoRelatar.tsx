// Botão "Relatar problema", montado uma vez na raiz do app (routes/__root.tsx).
// No clique (ou Alt+Shift+R) tira o print da tela como está, com diálogo ou menu aberto,
// e só depois abre o diálogo do relato. Fica por cima de tudo, fora da impressão.
// Fixo na ponta direita do rodapé do aviso de conferência, que reserva a faixa dele
// (index.css): assim não cobre tabela nem campo, em tela nenhuma. 32 px no desktop e
// 44 px (alvo de toque) no celular.
//
// Por que funciona com um diálogo Radix aberto: o Radix põe aria-hidden nos irmãos, mas
// poupa os elementos com aria-live (o contêiner do botão); deixa o body sem eventos de
// ponteiro (o botão volta a ter com pointer-events-auto) e fecha o diálogo com pointerdown
// fora dele (o botão interrompe a propagação, e o diálogo continua aberto no print).
// Se o canto inferior direito tiver um controle (a barra Aplicar/Cancelar de um diálogo em
// tela cheia no celular), o botão sobe pela borda direita até um lugar livre.
// O diálogo, a captura de tela, o diagnóstico e a fila de envio só carregam no uso
// (import dinâmico): o botão está em todas as telas e não pesa na abertura do app.
import { Bug, LoaderCircle } from "lucide-react";
import {
  lazy,
  type RefObject,
  type SyntheticEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FalhaCarga, LimiteCarga } from "@/components/ui/falha-carga";
import { useObra } from "../../estado/obra";
import type { Captura } from "./DialogoRelato";
import { cobreControle, deslocamentoLivre } from "./posicao";
import { caminhoRelato } from "./relay";

const DialogoRelato = lazy(() =>
  import("./DialogoRelato").then((m) => ({ default: m.DialogoRelato })),
);

export const ATALHO = "Alt+Shift+R";

/** Aviso de falha de carga, acima do botão no canto da tela. */
const AVISO_FIXO = "fixed right-3 bottom-20 z-[100] max-w-sm shadow-md print:hidden";

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
  useEffect(() => {
    if (!ativo) return;
    let quadro = 0;
    const esperas = new Set<ReturnType<typeof setTimeout>>();
    const avaliar = () => {
      quadro = 0;
      const el = caixa.current;
      if (!el) return;
      // posição padrão pelos offsets, que ignoram o transform: no meio da transição o
      // getBoundingClientRect daria um ponto de partida errado
      const padrao = {
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      };
      const d = deslocamentoLivre(padrao, (c) => cobreControle(c, el), padrao.top - 8);
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
  const [falhaCarga, setFalhaCarga] = useState(false);
  const ocupado = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const deslocamento = useDeslocamentoLivre(caixa, captura === null);

  const iniciar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    setCapturando(true);
    setFalhaCarga(false);
    // obra e diagnóstico do mesmo instante do print
    const obra = useObra.getState().obra;
    const caminho = location.pathname;
    const agora = new Date();
    try {
      const [{ coletarDiagnostico }, { capturarTela }] = await Promise.all([
        import("./diagnostico"),
        import("./captura"),
      ]);
      const diagnostico = coletarDiagnostico(obra, caminho);
      const print = await capturarTela();
      setCaptura({ print, diagnostico, obra, agora });
    } catch {
      // módulo do relato que não carregou (versão nova publicada, sem conexão): o botão
      // volta a responder e o aviso oferece recarregar
      ocupado.current = false;
      setFalhaCarga(true);
    } finally {
      setCapturando(false);
    }
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
    const tentar = () =>
      void import("./acoes").then((m) => m.enviarFilaAgora(c.url)).catch(() => {});
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
          className="pointer-events-auto fixed right-[calc(env(safe-area-inset-right)+0.5rem)] bottom-[max(0.25rem,env(safe-area-inset-bottom))] z-[100] transition-transform print:hidden"
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
            className="compacto:size-11 flex size-8 items-center justify-center rounded-full border bg-secondary/90 text-secondary-foreground shadow-md backdrop-blur transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-70"
          >
            {capturando ? (
              <LoaderCircle className="compacto:size-5 size-4 animate-spin" />
            ) : (
              <Bug className="compacto:size-5 size-4" />
            )}
          </button>
          <span className="sr-only">{capturando ? "Capturando a tela…" : ""}</span>
        </div>
      )}
      {falhaCarga && !captura && <FalhaCarga className={AVISO_FIXO} />}
      {captura && (
        <LimiteCarga className={AVISO_FIXO}>
          <Suspense fallback={null}>
            <DialogoRelato captura={captura} aoFechar={fechar} />
          </Suspense>
        </LimiteCarga>
      )}
    </>
  );
}

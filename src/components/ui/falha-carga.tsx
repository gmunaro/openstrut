// Parte do app carregada sob demanda (import dinâmico) que não veio: aba aberta antes de
// uma versão nova, ou sem conexão. Em vez de travar ou sumir, diz o que houve e oferece
// recarregar a página.
import { RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TEXTO_FALHA_CARGA =
  "Não foi possível carregar esta parte do app: a versão mudou ou a conexão caiu. Recarregue a página.";

/** Aviso com o botão de recarregar. */
export function FalhaCarga({ className }: { className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/50 bg-background flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm",
        className,
      )}
    >
      <p className="min-w-0 flex-1">{TEXTO_FALHA_CARGA}</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="hover:bg-accent focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2"
      >
        <RefreshCw aria-hidden className="size-3.5" /> Recarregar
      </button>
    </div>
  );
}

/** Em volta de um componente React.lazy: se o módulo não carrega, mostra FalhaCarga no
 *  lugar dele, sem derrubar a tela inteira. */
export class LimiteCarga extends Component<
  { children: ReactNode; className?: string },
  { falhou: boolean }
> {
  override state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  override render() {
    if (this.state.falhou)
      return <FalhaCarga {...(this.props.className ? { className: this.props.className } : {})} />;
    return this.props.children;
  }
}

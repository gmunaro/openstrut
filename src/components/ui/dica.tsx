// Dica (tooltip) que abre no hover, no foco do teclado e no toque: o Tooltip do
// Radix não abre no toque, e no celular a explicação também tem de aparecer.
// O texto fica sempre no DOM (escondido) para servir de aria-describedby.
import { Info } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Botão "i" com a dica. `id` é o do texto, para outros controles o citarem em
 *  aria-describedby; `rotulo` é o nome acessível do botão. Esc fecha. */
export function Dica({
  id,
  rotulo,
  children,
  className,
}: {
  id: string;
  rotulo: string;
  children: ReactNode;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  const [foco, setFoco] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const aberta = hover || foco;

  // aberta: toque fora fecha (no iOS o botão nem sempre ganha/perde foco no toque)
  // e Esc fecha só a dica. O Esc é ouvido na captura da window, antes do listener
  // do diálogo do Radix (captura no document), para não fechar o diálogo junto.
  useEffect(() => {
    if (!aberta) return;
    const fechar = () => {
      setHover(false);
      setFoco(false);
    };
    const fora = (e: PointerEvent) => {
      if (!(e.target instanceof Node && raiz.current?.contains(e.target))) fechar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      fechar();
    };
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc, { capture: true });
    };
  }, [aberta]);

  return (
    <span
      ref={raiz}
      className={cn("relative inline-flex", className)}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
    >
      <button
        type="button"
        aria-label={rotulo}
        aria-describedby={id}
        aria-expanded={aberta}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onClick={() => setFoco(true)}
      >
        <Info className="size-4" />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!aberta}
        className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border p-2 text-xs leading-snug font-normal shadow-md"
      >
        {children}
      </span>
    </span>
  );
}

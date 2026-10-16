// Diálogo de unidades de exibição: SI (padrão) ou técnicas (tf). O cálculo
// continua em SI; a escolha vale para a tela e o relatório e fica salva no navegador.
import { type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SistemaUnidades } from "../formato";
import { useSessao } from "../sessao";

const OPCOES: { valor: SistemaUnidades; titulo: string; exemplo: string }[] = [
  { valor: "si", titulo: "SI", exemplo: "kN, kN/m, kN·m, kN/m², MPa" },
  { valor: "tf", titulo: "Técnicas (tf)", exemplo: "tf, tf/m, tf·m, tf/m², kgf/cm²" },
];

const DESLOCAMENTO: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

// botaoOrigem recebe o foco ao fechar (ver DialogoMateriais).
export function DialogoUnidades({
  aberto,
  aoMudarAberto,
  botaoOrigem,
}: {
  aberto: boolean;
  aoMudarAberto: (a: boolean) => void;
  botaoOrigem: RefObject<HTMLButtonElement | null>;
}) {
  const unidades = useSessao((s) => s.unidades);
  const definir = useSessao((s) => s.definirUnidades);

  // Setas trocam a opção marcada e movem o foco, como num radiogroup nativo.
  function aoTeclarRadio(e: KeyboardEvent<HTMLDivElement>) {
    const passo = DESLOCAMENTO[e.key];
    if (passo === undefined) return;
    e.preventDefault();
    const i = OPCOES.findIndex((o) => o.valor === unidades);
    const proximo = OPCOES[(i + passo + OPCOES.length) % OPCOES.length];
    if (!proximo) return;
    definir(proximo.valor);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-valor="${proximo.valor}"]`)?.focus();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          botaoOrigem.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Unidades</DialogTitle>
          <DialogDescription>
            Só a exibição muda; o cálculo é sempre em SI. 1 tf = 9,80665 kN. Comprimentos (m, cm) e
            armaduras (cm²) não mudam.
          </DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label="Sistema de unidades"
          className="grid gap-2"
          onKeyDown={aoTeclarRadio}
        >
          {OPCOES.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              data-valor={o.valor}
              aria-checked={unidades === o.valor}
              tabIndex={unidades === o.valor ? 0 : -1}
              onClick={() => definir(o.valor)}
              className={cn(
                "hover:bg-accent rounded-md border px-3 py-2 text-left",
                unidades === o.valor && "border-primary bg-primary/10",
              )}
            >
              <span className="block text-sm font-medium">{o.titulo}</span>
              <span className="text-muted-foreground text-xs">{o.exemplo}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => aoMudarAberto(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

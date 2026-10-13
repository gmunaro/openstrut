// Diálogo de unidades de exibição: SI (padrão) ou técnicas (tf). O cálculo
// continua em SI; a escolha vale para a tela e o relatório e fica salva no navegador.
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

export function DialogoUnidades({
  aberto,
  aoMudarAberto,
}: {
  aberto: boolean;
  aoMudarAberto: (a: boolean) => void;
}) {
  const unidades = useSessao((s) => s.unidades);
  const definir = useSessao((s) => s.definirUnidades);
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unidades</DialogTitle>
          <DialogDescription>
            Só a exibição muda; o cálculo é sempre em SI. 1 tf = 9,80665 kN. Comprimentos (m, cm) e
            armaduras (cm²) não mudam.
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Sistema de unidades" className="grid gap-2">
          {OPCOES.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={unidades === o.valor}
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
